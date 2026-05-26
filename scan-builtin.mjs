#!/usr/bin/env node

/**
 * scan-builtin.mjs — Playwright-based scanner for Built In Colorado
 *
 * Built In Colorado doesn't have a public API, so this uses Playwright
 * to scrape job listings from their search pages. Applies the same
 * title filters from portals.yml and deduplicates against scan-history.tsv.
 *
 * Usage:
 *   node scan-builtin.mjs                  # scan all configured search URLs
 *   node scan-builtin.mjs --dry-run        # preview without writing files
 *
 * Built In Colorado search URL format:
 *   https://www.builtincolorado.com/jobs/remote/dev-engineering+security
 *   https://www.builtincolorado.com/jobs?search=security+engineer
 *
 * Designed to run as part of daily-pipeline.sh on CT 203.
 * Requires: Playwright with Chromium (same as apply-auto.mjs)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

mkdirSync('data', { recursive: true });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ── Built In Colorado search URLs ────────────────────────────────────
// These are the category/search pages to scrape.
// Each yields multiple job cards.

const SEARCH_PAGES = [
  {
    name: 'Security Engineering',
    url: 'https://www.builtincolorado.com/jobs?search=security+engineer&per_page=50',
  },
  {
    name: 'Cloud Security',
    url: 'https://www.builtincolorado.com/jobs?search=cloud+security&per_page=50',
  },
  {
    name: 'AI Engineer',
    url: 'https://www.builtincolorado.com/jobs?search=AI+engineer&per_page=50',
  },
  {
    name: 'DevSecOps / SRE',
    url: 'https://www.builtincolorado.com/jobs?search=DevSecOps+OR+SRE+OR+reliability&per_page=50',
  },
  {
    name: 'Platform Engineer',
    url: 'https://www.builtincolorado.com/jobs?search=platform+engineer&per_page=50',
  },
  {
    name: 'Infrastructure Security',
    url: 'https://www.builtincolorado.com/jobs?search=infrastructure+security&per_page=50',
  },
  {
    name: 'Cybersecurity',
    url: 'https://www.builtincolorado.com/jobs?search=cybersecurity&per_page=50',
  },
];

// ── Title filter (reuse from portals.yml) ────────────────────────────

function buildTitleFilter() {
  if (!existsSync(PORTALS_PATH)) return () => true;
  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const titleFilter = config.title_filter || {};
  const positive = (titleFilter.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Dedup (same logic as scan.mjs) ───────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

// ── Pipeline writer ──────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  const marker = '## Pending';
  const legacyMarker = '## Pendientes';
  let idx = text.indexOf(marker);
  if (idx === -1) idx = text.indexOf(legacyMarker);

  if (idx === -1) {
    let procIdx = text.indexOf('## Processed');
    if (procIdx === -1) procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    const usedMarker = text.includes(marker) ? marker : legacyMarker;
    const afterMarker = idx + usedMarker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;
    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines = offers.map(o =>
    `${o.url}\t${date}\tbuiltin-colorado\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Playwright scraper ───────────────────────────────────────────────

async function scrapeSearchPage(browser, searchPage) {
  const page = await browser.newPage();
  const jobs = [];

  try {
    console.log(`  → ${searchPage.name}: ${searchPage.url}`);
    await page.goto(searchPage.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for job cards to load
    await page.waitForTimeout(2000);

    // Built In uses various card layouts. Try multiple selectors.
    // Common patterns: .job-card, [data-id="job-card"], article with job link
    const cards = await page.evaluate(() => {
      const results = [];

      // Strategy 1: Look for job card links with structured data
      const jobLinks = document.querySelectorAll('a[href*="/job/"], a[href*="/jobs/"]');
      for (const link of jobLinks) {
        const href = link.getAttribute('href');
        if (!href || href.includes('/jobs?') || href === '/jobs' || href === '/jobs/') continue;

        // Get title from the link text or a nearby heading
        const titleEl = link.querySelector('h2, h3, h4, [class*="title"]') || link;
        const title = titleEl.textContent?.trim();

        // Get company name from nearby elements
        const card = link.closest('article, [class*="card"], [class*="job"], div[class*="result"]') || link.parentElement;
        const companyEl = card?.querySelector('[class*="company"], [class*="employer"], span[class*="name"]');
        const company = companyEl?.textContent?.trim() || '';

        if (title && title.length > 3 && !results.some(r => r.url === href)) {
          results.push({
            title: title.replace(/\s+/g, ' ').slice(0, 200),
            company: company.replace(/\s+/g, ' ').slice(0, 100),
            url: href,
          });
        }
      }

      // Strategy 2: Look for structured job listing elements
      if (results.length === 0) {
        const articles = document.querySelectorAll('article, [data-testid*="job"], [class*="job-listing"]');
        for (const article of articles) {
          const link = article.querySelector('a[href*="/job/"]');
          if (!link) continue;

          const titleEl = article.querySelector('h2, h3, h4');
          const companyEl = article.querySelector('[class*="company"], [class*="employer"]');

          const title = titleEl?.textContent?.trim() || link.textContent?.trim();
          const company = companyEl?.textContent?.trim() || '';
          const url = link.getAttribute('href');

          if (title && url && !results.some(r => r.url === url)) {
            results.push({
              title: title.replace(/\s+/g, ' ').slice(0, 200),
              company: company.replace(/\s+/g, ' ').slice(0, 100),
              url,
            });
          }
        }
      }

      return results;
    });

    // Normalize URLs to absolute
    for (const card of cards) {
      if (card.url.startsWith('/')) {
        card.url = `https://www.builtincolorado.com${card.url}`;
      }
      jobs.push(card);
    }

    console.log(`    Found ${jobs.length} job cards`);
  } catch (err) {
    console.error(`    Error: ${err.message?.slice(0, 100)}`);
  } finally {
    await page.close();
  }

  return jobs;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('🏔️  Built In Colorado Scanner\n');

  // Dynamic import — Playwright may not be installed in all environments
  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    console.error('❌ Playwright not installed. Run: npx playwright install chromium');
    process.exit(1);
  }

  const titleFilter = buildTitleFilter();
  const seenUrls = loadSeenUrls();
  const date = new Date().toISOString().slice(0, 10);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  let totalFound = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  const newOffers = [];

  try {
    for (const searchPage of SEARCH_PAGES) {
      const jobs = await scrapeSearchPage(browser, searchPage);
      totalFound += jobs.length;

      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          totalFiltered++;
          continue;
        }
        if (seenUrls.has(job.url)) {
          totalDupes++;
          continue;
        }
        seenUrls.add(job.url);
        newOffers.push({ ...job, source: 'builtin-colorado' });
      }
    }
  } finally {
    await browser.close();
  }

  // Write results
  if (!DRY_RUN && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  // Summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Built In Colorado Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Search pages:          ${SEARCH_PAGES.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company} | ${o.title}`);
    }
    if (DRY_RUN) {
      console.log('\n(dry run — run without --dry-run to save results)');
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
