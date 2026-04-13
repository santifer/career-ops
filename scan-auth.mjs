#!/usr/bin/env node

/**
 * LinkedIn Job Scanner
 *
 * Scrapes LinkedIn job search results using Playwright with a persistent
 * authenticated browser profile. Extracts listings and full JDs, saves
 * them locally for processing by the career-ops pipeline.
 *
 * Usage:
 *   node scan-auth.mjs              # Normal scan
 *   node scan-auth.mjs --login      # Open browser to log in, then exit
 *   node scan-auth.mjs --search "AI Engineer"
 *   node scan-auth.mjs --dry-run    # Extract but don't write files
 *   node scan-auth.mjs --headless   # Headless mode (higher detection risk)
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

// ---------------------------------------------------------------------------
// Constants & paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(process.env.HOME, '.scan-auth', 'profile');
const PORTALS_PATH = join(__dirname, 'portals.yml');
const SCAN_HISTORY_PATH = join(__dirname, 'data', 'scan-history.tsv');
const RESULTS_PATH = join(__dirname, 'data', 'linkedin-scan-results.json');
const JDS_DIR = join(__dirname, 'jds');

// ---------------------------------------------------------------------------
// Selectors — grouped for easy maintenance when LinkedIn changes DOM
// ---------------------------------------------------------------------------

const SELECTORS = {
  // Search results page (XPath)
  xpathListingCard: "//button[starts-with(@aria-label, 'Dismiss') and contains(@aria-label, 'job')]/ancestor::div[@role='button']",
  // Job detail page — XPath selectors (used inside page.evaluate)
  xpathApplyUrl: "//a[@aria-label='Apply on company website']",
  xpathTitle: "//div[@data-display-contents='true']//a[contains(@href,'trackingId')]",
  xpathCompany: "//a[contains(@href,'/company/')]",
  // Job detail page — description expand + content
  xpathMoreButton: "//span[normalize-space(text())='more']",
  jdContent: 'span[data-testid="expandable-text-box"]',
  // Auth / health
  loggedIn: 'a[aria-label*="My Network"]',
  // Pagination
  xpathCurrentPage: "//button[@aria-current='true'][starts-with(@aria-label, 'Page')]",
  xpathPageButton: "//button[starts-with(@aria-label, 'Page')]",
};

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const FLAG = {
  login: args.includes('--login'),
  dryRun: args.includes('--dry-run'),
  headless: args.includes('--headless'),
  search: (() => {
    const idx = args.indexOf('--search');
    return idx !== -1 ? args[idx + 1] : null;
  })(),
  maxResults: (() => {
    const idx = args.indexOf('--max');
    return idx !== -1 ? parseInt(args[idx + 1], 10) : null;
  })(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) { console.log(`[scan-auth] ${msg}`); }
function warn(msg) { console.warn(`[scan-auth] ⚠ ${msg}`); }
function error(msg) { console.error(`[scan-auth] ✗ ${msg}`); }

function randomDelay(range) {
  const [min, max] = range;
  return Math.floor(Math.random() * (max - min) + min);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const NOISE_LABELS = new Set(['more', 'show more', 'see more', 'less', 'show less', 'see less', 'retry premium']);
const MIN_POSITION_LENGTH = 4;

/**
 * LinkedIn wraps external apply links in /safety/go/?url=<encoded-target>.
 * Return the decoded destination when present; otherwise return the original href.
 */
function unwrapLinkedInRedirect(href) {
  const trimmed = (href || '').trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (!u.hostname.includes('linkedin.com')) return trimmed;
    if (!u.pathname.includes('/safety/go')) return trimmed;
    const nested = u.searchParams.get('url');
    if (!nested) return trimmed;
    const decoded = decodeURIComponent(nested);
    new URL(decoded); // validate
    return decoded;
  } catch {
    return trimmed;
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}


// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/** Extract linkedin_searches and title_filter from portals.yml without a YAML lib */
function parsePortalsYaml(raw) {
  const lines = raw.split('\n');
  const config = { title_filter: { positive: [], negative: [] }, linkedin_searches: [], linkedin_keywords: [], linkedin_employer_blocklist: [] };

  let section = null;
  let subsection = null;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('#') || trimmed === '') continue;

    const indent = line.length - line.trimStart().length;

    // Top-level keys
    if (indent === 0) {
      if (trimmed.startsWith('title_filter:')) { section = 'title_filter'; subsection = null; continue; }
      if (trimmed.startsWith('linkedin_searches:')) { section = 'linkedin_searches'; subsection = null; continue; }
      if (trimmed.match(/^\w/)) { section = null; subsection = null; continue; }
    }

    if (section === 'title_filter') {
      if (trimmed.startsWith('positive:')) { subsection = 'positive'; continue; }
      if (trimmed.startsWith('negative:')) { subsection = 'negative'; continue; }
      if (trimmed.startsWith('seniority_boost:')) { subsection = 'seniority_boost'; continue; }
      if (subsection && trimmed.startsWith('- ')) {
        const val = trimmed.slice(2).replace(/^["']|["']$/g, '');
        if (subsection === 'positive' || subsection === 'negative') {
          config.title_filter[subsection].push(val);
        }
      }
    }

    if (section === 'linkedin_searches') {
      // Subsection headers (e.g. keywords:)
      if (indent === 2 && trimmed.match(/^\w+:\s*$/)) {
        if (trimmed.startsWith('keywords:')) subsection = 'keywords';
        else if (trimmed.startsWith('employer_blocklist:')) subsection = 'employer_blocklist';
        continue;
      }
      // Scalar keys under linkedin_searches
      if (indent === 2 && !trimmed.startsWith('-')) {
        const m = trimmed.match(/^([\w_]+):\s*(.+)/);
        if (m) {
          let val = m[2].replace(/^["']|["']$/g, '');
          if (m[1] === 'date_posted') config.linkedin_date_posted = val;
          if (m[1] === 'max_results_per_search') config.linkedin_max_results = parseInt(val, 10);
          if (m[1] === 'delay_between_pages_ms') {
            const nums = val.replace(/[\[\]]/g, '').split(',').map(s => parseInt(s.trim(), 10));
            config.linkedin_delay_pages = nums;
          }
          if (m[1] === 'delay_between_searches_ms') {
            const nums = val.replace(/[\[\]]/g, '').split(',').map(s => parseInt(s.trim(), 10));
            config.linkedin_delay_searches = nums;
          }
          if (m[1] === 'experience_level' && val.startsWith('[')) {
            config.linkedin_experience_level = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
          }
          if (m[1] === 'experience_level' && !val.startsWith('[')) {
            config.linkedin_experience_level = [val.trim()];
          }
          if (m[1] === 'employer_blocklist' && val.startsWith('[')) {
            config.linkedin_employer_blocklist = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
          }
          if (m[1] === 'keywords' && val.startsWith('[')) {
            config.linkedin_keywords = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
          }
        }
        subsection = null;
        continue;
      }
      // List items (indent 4 under keywords: or employer_blocklist:)
      if (indent >= 4 && trimmed.startsWith('- ')) {
        const val = trimmed.slice(2).replace(/^["']|["']$/g, '');
        if (!val) continue;
        if (subsection === 'keywords') config.linkedin_keywords.push(val);
        if (subsection === 'employer_blocklist') config.linkedin_employer_blocklist.push(val);
      }
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Scan history (dedup)
// ---------------------------------------------------------------------------

function loadScanHistory() {
  const urls = new Set();
  if (!existsSync(SCAN_HISTORY_PATH)) return urls;
  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
  for (let i = 1; i < lines.length; i++) { // skip header
    const url = lines[i].split('\t')[0];
    if (url) urls.add(url);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Keyword filter (checks title + JD text)
// ---------------------------------------------------------------------------

function matchesFilter(title, jdText, filter) {
  if (!filter) return true;
  const combined = `${title} ${jdText}`.toLowerCase();
  const titleLower = title.toLowerCase();
  const hasPositive = !filter.positive?.length ||
    filter.positive.some(kw => combined.includes(kw.toLowerCase()));
  const hasNegative = filter.negative?.length &&
    filter.negative.some(kw => titleLower.includes(kw.toLowerCase()));
  return hasPositive && !hasNegative;
}

// ---------------------------------------------------------------------------
// Browser session
// ---------------------------------------------------------------------------

async function launchBrowser() {
  mkdirSync(PROFILE_DIR, { recursive: true });

  log(`Launching browser (profile: ${PROFILE_DIR})`);
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: FLAG.headless,
    viewport: { width: 1280, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  // Mask webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return context;
}

/**
 * Determine whether the current page represents a logged-in LinkedIn session.
 * Returns true if logged in, false otherwise.
 *
 * This is the single place to update when LinkedIn changes their DOM.
 */
async function isLoggedIn(page) {
  const url = page.url();

  // URL-based: login/auth pages mean not logged in
  if (url.includes('/login') || url.includes('/uas/') || url.includes('/checkpoint/')) {
    return false;
  }

  // Selector-based: "My Network" nav link only appears when logged in
  if (await page.$(SELECTORS.loggedIn)) return true;

  return false;
}

async function checkSession(page) {
  log('Checking session...');
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  const loggedIn = await isLoggedIn(page);
  if (loggedIn) {
    log('Session active — logged in');
  } else {
    warn('Not logged in — login required');
  }
  return loggedIn;
}

async function waitForLogin(page) {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Please log in to LinkedIn in the browser window ║');
  console.log('║  Press ENTER here once you\'re logged in...       ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  await prompt('');

  // Verify login succeeded
  const ok = await checkSession(page);
  if (!ok) {
    warn('Still not logged in. Try again or Ctrl+C to exit.');
    return waitForLogin(page);
  }
  return true;
}


// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

async function getCurrentPage(page) {
  return page.evaluate(({ xpath }) => {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const btn = result.singleNodeValue;
    if (!btn) return 0;
    const label = btn.getAttribute('aria-label') || '';
    const match = label.match(/Page (\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }, { xpath: SELECTORS.xpathCurrentPage });
}

async function goToNextPage(page) {
  return page.evaluate(({ xpathCurrent, xpathAll }) => {
    // Find current page number
    const curResult = document.evaluate(xpathCurrent, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const curBtn = curResult.singleNodeValue;
    if (!curBtn) return false;
    const curLabel = curBtn.getAttribute('aria-label') || '';
    const curMatch = curLabel.match(/Page (\d+)/);
    if (!curMatch) return false;
    const currentNum = parseInt(curMatch[1], 10);

    // Find all page buttons, look for current + 1
    const allResult = document.evaluate(xpathAll, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < allResult.snapshotLength; i++) {
      const btn = allResult.snapshotItem(i);
      const label = btn.getAttribute('aria-label') || '';
      const match = label.match(/Page (\d+)/);
      if (match && parseInt(match[1], 10) === currentNum + 1) {
        btn.click();
        return true;
      }
    }
    return false;
  }, { xpathCurrent: SELECTORS.xpathCurrentPage, xpathAll: SELECTORS.xpathPageButton });
}

// ---------------------------------------------------------------------------
// Extraction — search results (split-view: click card → detail renders)
// ---------------------------------------------------------------------------

async function scrollToLoadResults(page) {
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, randomDelay([300, 600]));
    await sleep(randomDelay([500, 1200]));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1000);
}

async function getCardCount(page) {
  return page.evaluate((xpath) => {
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return result.snapshotLength;
  }, SELECTORS.xpathListingCard);
}

async function clickCard(page, index) {
  return page.evaluate(({ xpath, idx }) => {
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const card = result.snapshotItem(idx);
    if (card) { card.click(); return true; }
    return false;
  }, { xpath: SELECTORS.xpathListingCard, idx: index });
}

async function extractDetailFromPanel(page) {
  // Click "more" to expand the description — if not present, no JD available
  const hasMore = await page.evaluate(({ xpath }) => {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const moreSpan = result.singleNodeValue;
    if (moreSpan) { moreSpan.click(); return true; }
    return false;
  }, { xpath: SELECTORS.xpathMoreButton });

  if (!hasMore) return { title: '', company: '', applicationUrl: '', jdText: '', url: '' };

  await sleep(500);

  return page.evaluate(({ sel, noiseLabels, minLen }) => {
    function xpathAll(expression) {
      const result = document.evaluate(
        expression, document, null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );
      const items = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        const item = result.snapshotItem(i);
        if (item) items.push(item);
      }
      return items;
    }

    // Apply URL
    const applyEl = xpathAll(sel.xpathApplyUrl)[0];
    const applicationUrl = applyEl?.href?.trim() ?? '';

    // Job title
    const titleAnchors = xpathAll(sel.xpathTitle);
    let title = '';
    for (const a of titleAnchors) {
      const text = a.textContent?.trim() ?? '';
      if (text.length >= minLen && !noiseLabels.includes(text.toLowerCase())) {
        title = text;
        break;
      }
    }

    // Company name (2nd company link)
    const companyAnchors = xpathAll(sel.xpathCompany);
    const company = companyAnchors[1]?.textContent?.trim() ?? '';

    // JD text from expanded description
    const jdEl = document.querySelector(sel.jdContent);
    const jdText = jdEl?.innerText?.trim() ?? '';

    // URL from the current page (currentJobId param updates on card click)
    const url = window.location.href;

    return { title, company, applicationUrl, jdText, url };
  }, { sel: SELECTORS, noiseLabels: [...NOISE_LABELS], minLen: MIN_POSITION_LENGTH });
}

function saveJd(detail, jdText) {
  mkdirSync(JDS_DIR, { recursive: true });
  const slug = slugify(`${detail.company}-${detail.title}`);
  const filename = `${slug}.md`;
  const filepath = join(JDS_DIR, filename);

  const content = `---
title: "${detail.title}"
company: "${detail.company}"
url: "${detail.url}"
application_url: "${detail.applicationUrl || ''}"
scraped: "${new Date().toISOString().split('T')[0]}"
source: linkedin
---

# ${detail.title} — ${detail.company}

${jdText}
`;

  writeFileSync(filepath, content, 'utf-8');
  return `jds/${filename}`;
}

// ---------------------------------------------------------------------------
// Main scan logic
// ---------------------------------------------------------------------------

async function runScan(context, config) {
  const page = await context.newPage();
  const scanHistory = loadScanHistory();
  const titleFilter = config.title_filter;
  const employerBlocklist = config.linkedin_employer_blocklist || [];
  const keywords = config.linkedin_keywords || [];
  const maxPerSearch = FLAG.maxResults || config.linkedin_max_results || 25;
  const delayPages = config.linkedin_delay_pages || [3000, 8000];
  const delaySearches = config.linkedin_delay_searches || [5000, 15000];

  if (keywords.length === 0) {
    error('No keywords found in portals.yml');
    error('Add keywords under linkedin_searches.keywords in portals.yml');
    await page.close();
    return null;
  }

  // Build search URLs from keywords + experience_level + date_posted
  const datePostedMap = { '24': 'past 24 hours', 'Week': 'past week', 'Month': 'past month' };
  const dateSuffix = datePostedMap[config.linkedin_date_posted] || '';
  const levels = config.linkedin_experience_level || [];
  const levelPrefix = levels.length ? levels.join(' or ') : '';

  const searches = keywords.map(kw => {
    let query = levelPrefix ? `${levelPrefix} ${kw}` : kw;
    if (dateSuffix) query += ` posted in the ${dateSuffix}`;
    const params = new URLSearchParams({ keywords: query });
    return { name: kw, url: `https://www.linkedin.com/jobs/search-results/?${params}` };
  });

  // Filter to specific keyword if --search flag used
  const toRun = FLAG.search
    ? searches.filter(s => s.name === FLAG.search)
    : searches;

  if (toRun.length === 0) {
    error(`No keyword matching "${FLAG.search}"`);
    error(`Available: ${searches.map(s => s.name).join(', ')}`);
    await page.close();
    return null;
  }

  const results = {
    scan_date: new Date().toISOString().split('T')[0],
    source: 'linkedin',
    listings: [],
    errors: [],
    stats: { searched: 0, found: 0, extracted: 0, skipped_filter: 0, skipped_dedup: 0, errors: 0 },
  };

  for (const search of toRun) {
    log(`\n── Search: ${search.name} ──`);
    results.stats.searched++;

    try {
      await page.goto(search.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(randomDelay(delayPages));


      await scrollToLoadResults(page);

      let extracted = 0;
      let hasNextPage = true;

      while (hasNextPage && extracted < maxPerSearch) {
        const currentPage = await getCurrentPage(page);
        log(`Page ${currentPage || 1}`);

        await scrollToLoadResults(page);

        const cardCount = await getCardCount(page);
        log(`Found ${cardCount} job cards`);
        results.stats.found += cardCount;

        for (let i = 0; i < cardCount; i++) {
          if (extracted >= maxPerSearch) {
            log(`Reached max results (${maxPerSearch}) for this search`);
            break;
          }

          const clicked = await clickCard(page, i);
          if (!clicked) {
            warn(`  ✗ Could not click card ${i}`);
            continue;
          }
          await sleep(randomDelay(delayPages));

    
          const detail = await extractDetailFromPanel(page);
          if (!detail.title) {
            warn(`  ✗ No title extracted from card ${i}`);
            results.stats.errors++;
            continue;
          }

          detail.applicationUrl = unwrapLinkedInRedirect(detail.applicationUrl);

          if (!matchesFilter(detail.title, detail.jdText, titleFilter)) {
            log(`  ✗ Filtered: ${detail.title} (${detail.company})`);
            results.stats.skipped_filter++;
            continue;
          }

          if (employerBlocklist.length && detail.company) {
            const companyLower = detail.company.toLowerCase();
            if (employerBlocklist.some(b => companyLower.includes(b.toLowerCase()))) {
              log(`  ✗ Blocked employer: ${detail.company}`);
              results.stats.skipped_filter++;
              continue;
            }
          }

          if (scanHistory.has(detail.url)) {
            log(`  ✗ Already seen: ${detail.title} (${detail.company})`);
            results.stats.skipped_dedup++;
            continue;
          }

          log(`  → Extracted: ${detail.title} at ${detail.company}`);

          if (detail.jdText) {
            let jdFile = null;
            if (!FLAG.dryRun) {
              jdFile = saveJd(detail, detail.jdText);
            }

            results.listings.push({
              title: detail.title,
              company: detail.company,
              linkedin_url: detail.url,
              application_url: detail.applicationUrl || '',
              jd_file: jdFile || `jds/${slugify(`${detail.company}-${detail.title}`)}.md`,
            });
            extracted++;
            results.stats.extracted++;
            log(`  ✓ Saved: ${detail.title} (${detail.company})`);
          } else {
            results.stats.errors++;
            results.errors.push({ url: detail.url, error: 'Failed to extract JD' });
            warn(`  ✗ No JD content: ${detail.title}`);
          }
        }

        // Try next page if we haven't hit max results
        if (extracted < maxPerSearch) {
          hasNextPage = await goToNextPage(page);
          if (hasNextPage) {
            log(`Navigating to next page...`);
            await sleep(randomDelay(delayPages));
          }
        } else {
          hasNextPage = false;
        }
      }
    } catch (e) {
      error(`Search "${search.name}" failed: ${e.message}`);
      results.errors.push({ search: search.name, error: e.message });
      results.stats.errors++;
    }

    // Delay between searches
    if (toRun.indexOf(search) < toRun.length - 1) {
      const d = randomDelay(delaySearches);
      log(`Waiting ${(d / 1000).toFixed(1)}s before next search...`);
      await sleep(d);
    }
  }

  await page.close();
  return results;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function writeResults(results) {
  mkdirSync(dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf-8');
  log(`Results written to ${RESULTS_PATH}`);
}

function printSummary(results) {
  const s = results.stats;
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║               LinkedIn Scan Summary              ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Searches run:      ${String(s.searched).padStart(4)}                        ║`);
  console.log(`║  Listings found:    ${String(s.found).padStart(4)}                        ║`);
  console.log(`║  Filtered out:      ${String(s.skipped_filter).padStart(4)}                        ║`);
  console.log(`║  Already seen:      ${String(s.skipped_dedup).padStart(4)}                        ║`);
  console.log(`║  JDs extracted:     ${String(s.extracted).padStart(4)}                        ║`);
  console.log(`║  Errors:            ${String(s.errors).padStart(4)}                        ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (results.listings.length > 0) {
    console.log('\nNew listings:');
    for (const l of results.listings) {
      console.log(`  • ${l.title} — ${l.company} (${l.location})`);
    }
    console.log(`\nNext step: run /career-ops linkedin to process these into your pipeline.`);
  } else {
    console.log('\nNo new listings found this run.');
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  log('Starting LinkedIn scanner...');

  // Load config
  const config = parsePortalsYaml(readFileSync(PORTALS_PATH, 'utf-8'));

  // Launch browser
  const context = await launchBrowser();

  try {
    const page = await context.newPage();

    // Session check
    const loggedIn = await checkSession(page);

    if (!loggedIn) {
      if (FLAG.login) {
        log('Login mode — opening LinkedIn login page');
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
      }
      await waitForLogin(page);
    }

    await page.close();

    if (FLAG.login) {
      log('Login successful — session saved. Run again without --login to scan.');
      return;
    }

    // Run the scan
    const results = await runScan(context, config);

    if (results) {
      if (!FLAG.dryRun) {
        writeResults(results);
      } else {
        log('Dry run — no files written');
        console.log(JSON.stringify(results, null, 2));
      }
      printSummary(results);
    }
  } finally {
    await context.close();
  }
}

main().catch(e => {
  error(e.message);
  process.exit(1);
});
