#!/usr/bin/env node

/**
 * scan-migratemate.mjs — Authenticated MigrateMate job board scraper
 *
 * Launches a visible Chrome window so you can sign in with Google OAuth.
 * Once on the jobs page, searches for your target roles with the F-1 OPT
 * visa filter, scrolls through all results, deduplicates against existing
 * history, and appends new jobs to data/pipeline.md.
 *
 * Usage:
 *   node scan-migratemate.mjs                          # defaults from profile.yml
 *   node scan-migratemate.mjs --dry-run                # preview, don't write files
 *   node scan-migratemate.mjs --query "GRC analyst"    # override search term
 *   node scan-migratemate.mjs --max 300                # stop after N jobs (default 200)
 *   node scan-migratemate.mjs --no-visa-filter         # skip visa filter step
 */

import { chromium } from 'playwright';
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';

// ── Config ───────────────────────────────────────────────────────────────────

const PIPELINE_PATH = 'data/pipeline.md';
const HISTORY_PATH  = 'data/scan-history.tsv';
const PROFILE_PATH  = 'config/profile.yml';
const BASE_URL      = 'https://migratemate.co/jobs';

const args = parseArgs(process.argv.slice(2));
const DRY_RUN        = 'dry-run' in args;
const NO_VISA_FILTER = 'no-visa-filter' in args;
const DEBUG          = 'debug' in args;
const MAX_JOBS       = parseInt(args.max ?? '200', 10);

const profile     = yaml.load(readFileSync(PROFILE_PATH, 'utf8'));
const searchTerms = args.query
  ? [args.query]
  : buildSearchTerms(profile);

// Visa types relevant for STEM OPT holders
const VISA_FILTERS = ['F-1 OPT', 'F-1 CPT'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return out;
}

function buildSearchTerms(p) {
  // Group primary roles into a few searches so we don't over-query
  const primary = p.target_roles?.primary ?? ['Security Analyst'];
  // Split into chunks: security roles and data roles
  const security = primary.filter(r => /security|soc|grc|iam|cyber/i.test(r));
  const data     = primary.filter(r => /data/i.test(r));
  const terms = [];
  if (security.length) terms.push(security[0]); // e.g. "GRC Analyst"
  if (data.length)     terms.push(data[0]);      // e.g. "Data Analyst"
  return terms.length ? terms : ['Security Analyst'];
}

function loadSeenUrls() {
  if (!existsSync(HISTORY_PATH)) return new Set();
  return new Set(
    readFileSync(HISTORY_PATH, 'utf8')
      .split('\n')
      .slice(1)                     // skip TSV header row
      .map(l => l.split('\t')[0])
      .filter(Boolean)
  );
}

// ── Login wait ───────────────────────────────────────────────────────────────

async function waitForLogin(page) {
  // If the URL is already on the jobs page and job cards are visible, we're good
  try {
    await page.waitForSelector('[data-job-card="true"]', { timeout: 4000 });
    return; // already logged in
  } catch {}

  console.log('\n──────────────────────────────────────────────────');
  console.log('  Sign in with Google in the browser window.');
  console.log('  Press Enter here once you are on the jobs page.');
  console.log('──────────────────────────────────────────────────\n');

  await new Promise(resolve => {
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });

  // Navigate to jobs page if the OAuth flow landed elsewhere
  if (!page.url().includes('/jobs')) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  }

  await page.waitForSelector('[data-job-card="true"]', { timeout: 20_000 }).catch(() => {
    console.warn('Warning: job cards not detected — scraping anyway.');
  });
}

// ── Filter application ────────────────────────────────────────────────────────

async function closeFilterPanel(page) {
  // Close the filter side panel if it's open (X button or Escape)
  const closeBtn = page.locator('button[aria-label="Close"], button:has-text("✕"), [aria-label="close" i]').first();
  if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(500);
    return;
  }
  // Fallback: press Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

async function applySearch(page, query) {
  // Ensure filter panel is closed before searching so the main input is accessible
  await closeFilterPanel(page);

  const input = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="find"]').first();
  if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
    await input.click();
    await input.fill('');
    await input.type(query, { delay: 40 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    console.log(`  Search: "${query}"`);
  } else {
    console.warn('  Search input not found — scraping current view.');
  }
}

async function applyVisaFilter(page) {
  if (NO_VISA_FILTER) return;
  try {
    // Step 1: open the Filters side panel (button shows "Filters N")
    const filtersBtn = page.locator('button:has-text("Filters"), button[aria-label*="filter" i]').first();
    if (!await filtersBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.warn('  Visa filter skipped (Filters button not found) — add --no-visa-filter to suppress this.');
      return;
    }
    await filtersBtn.click();
    await page.waitForTimeout(800);

    // Step 2: click "Visa" inside the now-open side panel
    const visaLabel = page.locator('text=Visa').first();
    await visaLabel.click({ timeout: 4000 });
    await page.waitForTimeout(600);

    for (const visa of VISA_FILTERS) {
      // Look for a checkbox or label containing the visa text
      const option = page.locator(`label:has-text("${visa}"), [role="checkbox"]:has-text("${visa}"), li:has-text("${visa}")`).first();
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
        console.log(`  Visa filter: ${visa} ✓`);
      }
    }

    // Step 3: apply — click "See X Jobs" or "Apply Filters" button
    const applyBtn = page.locator('button:has-text("Jobs"), button:has-text("Apply Filters"), button:has-text("Apply")').first();
    if (await applyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await applyBtn.click();
    }
    await page.waitForTimeout(2000);
  } catch (e) {
    console.warn(`  Visa filter skipped (${e.message}) — add --no-visa-filter to suppress this.`);
  }
}

// ── Job card scraping ────────────────────────────────────────────────────────

async function debugDump(page) {
  // Screenshot
  const ss = '/tmp/migratemate-debug.png';
  await page.screenshot({ path: ss, fullPage: false });
  console.log(`  [debug] screenshot → ${ss}`);

  // All unique hrefs on the page
  const hrefs = await page.$$eval('a', els =>
    [...new Set(els.map(a => a.getAttribute('href')).filter(Boolean))]
  );
  console.log(`  [debug] total <a> tags: ${hrefs.length}`);
  console.log('  [debug] all hrefs:\n   ', hrefs.join('\n    '));

  // Dump first 4000 chars of body HTML so we can see card structure
  const bodySnippet = await page.evaluate(() => document.body.innerHTML.slice(0, 4000));
  const dumpPath = '/tmp/migratemate-dom.html';
  writeFileSync(dumpPath, bodySnippet, 'utf8');
  console.log(`  [debug] DOM snippet (4000 chars) → ${dumpPath}`);
}

async function scrapeVisible(page) {
  if (DEBUG) await debugDump(page);

  // MigrateMate renders cards as <div data-job-card="true"> with data attrs — no <a> tags
  return page.$$eval('[data-job-card="true"]', (cards) => {
    const seen = new Set();
    const jobs = [];

    for (const card of cards) {
      const jobId  = card.getAttribute('data-job-id') ?? '';
      if (!jobId || seen.has(jobId)) continue;
      seen.add(jobId);

      const url     = `https://migratemate.co/jobs/${jobId}`;
      const title   = card.getAttribute('data-job-title') ?? '';
      const company = card.getAttribute('data-company-name') ?? '';

      const text     = card.innerText ?? '';
      const lines    = text.split('\n').map(l => l.trim()).filter(Boolean);
      const location = lines.find(l => /remote|on-site|hybrid|,\s+[A-Z]{2}$/i.test(l)) ?? '';
      const salary   = lines.find(l => /\$[\d,]+/.test(l)) ?? '';
      const visas    = lines.filter(l => /green card|h-1b|f-1 opt|f-1 cpt|tn\b|e-3/i.test(l)).join(', ');

      jobs.push({ url, title, company, location, salary, visas });
    }
    return jobs;
  });
}

// ── Main scrape loop ─────────────────────────────────────────────────────────

async function scrape() {
  const seen = loadSeenUrls();
  const allJobs = [];

  // Use system Chrome — Google OAuth often blocks Playwright's bundled Chromium
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
  }).catch(() =>
    // Fall back to bundled Chromium if system Chrome not found
    chromium.launch({ headless: false })
  );

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  console.log('\nOpening MigrateMate…');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForLogin(page);

  // Apply visa filter once before searching — applying per-query would toggle it off on the 2nd run
  await applyVisaFilter(page);

  // Run one search per term (e.g. "GRC Analyst" then "Data Analyst")
  for (const query of searchTerms) {
    console.log(`\nSearching: "${query}"`);
    await applySearch(page, query);

    // Infinite scroll — keep scrolling until no new jobs load or MAX_JOBS hit
    let stale = 0;
    let lastCount = 0;

    while (allJobs.length < MAX_JOBS && stale < 4) {
      const cards = await scrapeVisible(page);

      let added = 0;
      for (const job of cards) {
        if (!job.title || seen.has(job.url)) continue;
        seen.add(job.url);
        allJobs.push(job);
        added++;
      }

      if (added === 0 && cards.length === lastCount) {
        stale++;
      } else {
        stale = 0;
        lastCount = cards.length;
      }

      process.stdout.write(`\r  ${allJobs.length} new jobs found…`);

      // Scroll down to trigger next page load
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await page.waitForTimeout(1800);
    }
    console.log(); // newline after \r
  }

  await browser.close();
  return allJobs;
}

// ── Write output ─────────────────────────────────────────────────────────────

function writeOutput(jobs) {
  const today = new Date().toISOString().slice(0, 10);
  const header = `MigrateMate Scan ${today} — OPT filter (${searchTerms.join(', ')})`;

  if (DRY_RUN || jobs.length === 0) {
    if (jobs.length === 0) {
      console.log('\nNo new jobs found (all already in history).');
    } else {
      console.log(`\n[DRY RUN] Would add ${jobs.length} jobs:\n## ${header}\n`);
      jobs.forEach(j => console.log(`  - ${j.url} | ${j.company} | ${j.title}`));
    }
    return;
  }

  // Append section to pipeline.md
  const pipelineLines = [
    `\n## ${header}\n`,
    ...jobs.map(j => {
      const meta = [j.salary, j.location, j.visas].filter(Boolean).join(' · ');
      return `- [ ] ${j.url} | ${j.company} | ${j.title}${meta ? ` — ${meta}` : ''}`;
    }),
    '',
  ];
  appendFileSync(PIPELINE_PATH, pipelineLines.join('\n'), 'utf8');

  // Append rows to scan-history.tsv (dedup guard for future scans)
  // Bootstrap the header row on first creation so loadSeenUrls() slice(1) works correctly
  if (!existsSync(HISTORY_PATH)) {
    appendFileSync(HISTORY_PATH, 'url\tdate\tsource\ttitle\tcompany\tstatus\n', 'utf8');
  }
  const tsvLines = jobs.map(j =>
    [j.url, today, 'migratemate', j.title, j.company, 'added'].join('\t')
  );
  appendFileSync(HISTORY_PATH, tsvLines.join('\n') + '\n', 'utf8');

  console.log(`\n✓ ${jobs.length} new jobs added to data/pipeline.md`);
  console.log(`  Run /career-ops pipeline to evaluate them.\n`);
}

// ── Run ───────────────────────────────────────────────────────────────────────

try {
  const jobs = await scrape();
  writeOutput(jobs);
} catch (err) {
  console.error('\nError:', err.message);
  process.exit(1);
}
