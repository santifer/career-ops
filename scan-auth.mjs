#!/usr/bin/env node

/**
 * Authenticated Job Portal Scanner (Harness)
 *
 * Orchestrates authenticated job portal scanning using Playwright with
 * persistent browser profiles. Each portal has its own scanner class in
 * scan-auth/ (e.g. LinkedInScanner) that handles page interaction,
 * card extraction, filtering, dedup, and employer blocklist.
 *
 * This harness handles:
 *   - CLI parsing and flag handling
 *   - Browser launch with persistent profile (survives across runs)
 *   - Login flow (interactive, saves session for future scans)
 *   - Scan history loading and cross-portal dedup (LinkedIn job IDs +
 *     company::title keys from all portals including Greenhouse/Ashby/Lever)
 *   - JD file writing to jds/ with YAML frontmatter
 *   - Pipeline.md appending (language-agnostic section detection)
 *   - Scan history appending (accepted + skipped entries)
 *   - Summary output
 *
 * Data flow:
 *   portals.yml → scanner.parseConfig() → scanner.scan() → listings + skipped
 *   → saveJd() writes jds/*.md
 *   → appendToPipeline() writes data/pipeline.md
 *   → appendScanHistory() writes data/scan-history.tsv
 *
 * DISCLAIMER: Portal scanning uses your own browser session. Respect each
 * portal's terms of service.
 *
 * Usage:
 *   node scan-auth.mjs linkedin                          # Normal scan
 *   node scan-auth.mjs --login linkedin                  # Open browser to log in, then exit
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { homedir } from 'os';

import LinkedInScanner from './scan-auth/linkedin.mjs';

// ---------------------------------------------------------------------------
// Scanner registry — add new portal scanners here
// ---------------------------------------------------------------------------

const SCANNERS = {
  linkedin: new LinkedInScanner(),
};

// ---------------------------------------------------------------------------
// Constants & paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORTALS_PATH = join(__dirname, 'portals.yml');
const SCAN_HISTORY_PATH = join(__dirname, 'data', 'scan-history.tsv');
const PIPELINE_PATH = join(__dirname, 'data', 'pipeline.md');
const JDS_DIR = join(__dirname, 'jds');

function getProfileDir(portal) {
  return join(homedir(), '.scan-auth', portal, 'profile');
}


// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const supportedNames = Object.keys(SCANNERS);

const FLAGS = new Set(['--login']);
const portalId = (() => {
  for (let i = 0; i < args.length; i++) {
    if (FLAGS.has(args[i])) continue;
    return args[i];
  }
  return null;
})();

if (!portalId) {
  console.error(`Usage: node scan-auth.mjs [options] <portal>\n\nSupported portals: ${supportedNames.join(', ')}`);
  process.exit(1);
}
if (!SCANNERS[portalId]) {
  console.error(`Unknown portal: "${portalId}"\nSupported portals: ${supportedNames.join(', ')}`);
  process.exit(1);
}

const scanner = SCANNERS[portalId];

const FLAG = {
  login: args.includes('--login'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) { console.log(`[scan-auth] ${msg}`); }
function warn(msg) { console.warn(`[scan-auth] ⚠ ${msg}`); }
function error(msg) { console.error(`[scan-auth] ✗ ${msg}`); }

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
// Scan history (dedup)
// ---------------------------------------------------------------------------

/** Extract LinkedIn job ID from a /jobs/view/{id} URL path. */
function extractJobIdFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/jobs\/view\/(\d+)/);
    return m ? m[1] : '';
  } catch { return ''; }
}

/**
 * Load dedup keys from scan-history.tsv into a Set.
 * LinkedIn rows contribute job IDs (e.g. "4398598777").
 * All rows contribute company::title keys (e.g. "parloa::senior ai agent architect")
 * for cross-portal dedup against Greenhouse/Ashby/Lever entries.
 */
function loadScanHistory() {
  const keys = new Set();
  if (!existsSync(SCAN_HISTORY_PATH)) return keys;
  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (!cols[0]) continue;
    const url = cols[0];

    // LinkedIn rows: add job ID
    try {
      if (new URL(url).hostname.includes('linkedin')) {
        const jobId = extractJobIdFromUrl(url);
        if (jobId) keys.add(jobId);
      }
    } catch { /* not a valid URL */ }

    // All rows: add company::title for cross-portal dedup
    const title = (cols[3] || '').trim();
    const company = (cols[4] || '').trim();
    if (company && title) {
      keys.add(`${company}::${title}`.toLowerCase());
    }
  }
  return keys;
}

/** Append entries to scan-history.tsv. Creates file with header if missing. */
function appendScanHistory(entries) {
  const today = new Date().toISOString().split('T')[0];
  let needsHeader = false;
  if (!existsSync(SCAN_HISTORY_PATH)) {
    needsHeader = true;
    mkdirSync(dirname(SCAN_HISTORY_PATH), { recursive: true });
  }
  const lines = [];
  if (needsHeader) {
    lines.push('url\tfirst_seen\tportal\ttitle\tcompany\tstatus');
  }
  for (const e of entries) {
    const title = e.title.replace(/\t/g, ' ');
    const company = e.company.replace(/\t/g, ' ');
    lines.push(`${e.url}\t${today}\t${e.portal}\t${title}\t${company}\t${e.status}`);
  }
  if (lines.length) {
    const content = (needsHeader ? '' : '\n') + lines.join('\n') + '\n';
    writeFileSync(SCAN_HISTORY_PATH, content, { flag: 'a' });
  }
}

/**
 * Append listings to pipeline.md under the first ## section (pending).
 * Language-agnostic: finds sections by ## markers, not by name.
 */
function appendToPipeline(listings) {
  if (listings.length === 0) return;
  if (!existsSync(PIPELINE_PATH)) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  // Find the first ## section (pending, regardless of language) and append
  // before the second ## section (processed)
  const firstH2 = text.indexOf('\n## ');
  if (firstH2 === -1) return;
  const afterFirstH2 = text.indexOf('\n', firstH2 + 1);
  const secondH2 = text.indexOf('\n## ', afterFirstH2);
  const insertAt = secondH2 === -1 ? text.length : secondH2;

  const before = text.slice(0, insertAt);
  const prefix = before.endsWith('\n') ? '' : '\n';
  const block = listings.map(l =>
    `- [ ] ${l.url} | ${l.company.replace(/\|/g, '—')} | ${l.title.replace(/\|/g, '—')}`
  ).join('\n') + '\n';
  text = before + prefix + block + text.slice(insertAt);

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

// ---------------------------------------------------------------------------
// Browser session
// ---------------------------------------------------------------------------

async function launchBrowser(profileDir) {
  mkdirSync(profileDir, { recursive: true });

  log(`Launching browser (profile: ${profileDir})`);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return context;
}

async function waitForLogin(page) {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  Please log in to ${scanner.name.padEnd(10)} in the browser window ║`);
  console.log('║  Press ENTER here once you\'re logged in...       ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  await prompt('');

  const ok = await scanner.checkSession(page);
  if (!ok) {
    warn('Still not logged in. Try again or Ctrl+C to exit.');
    return waitForLogin(page);
  }
  return true;
}

// ---------------------------------------------------------------------------
// JD saving
// ---------------------------------------------------------------------------

function yamlEscape(str) {
  const s = String(str).replace(/\n/g, ' ').trim();
  if (/[":{}[\],&*?|<>=!%@#`]/.test(s) || s.includes("'")) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `"${s}"`;
}

/** Save a JD to jds/{slug}.md with YAML frontmatter. Returns the relative path. */
function saveJd(detail) {
  mkdirSync(JDS_DIR, { recursive: true });
  const slug = slugify(`${detail.company}-${detail.title}`);
  const filename = `${slug}.md`;
  const filepath = join(JDS_DIR, filename);

  const content = `---
title: ${yamlEscape(detail.title)}
company: ${yamlEscape(detail.company)}
application_url: ${yamlEscape(detail.applicationUrl || '')}
scraped: "${new Date().toISOString().split('T')[0]}"
source: ${portalId}
---

# ${detail.title} — ${detail.company}

${detail.jdText}
`;

  writeFileSync(filepath, content, 'utf-8');
  return `jds/${filename}`;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printSummary(results) {
  const s = results.stats;
  const label = `${scanner.name} Scan Summary`;
  const pad = Math.max(0, 48 - label.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║${' '.repeat(left + 1)}${label}${' '.repeat(right + 1)}║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Searches run:      ${String(s.searched).padStart(4)}                        ║`);
  console.log(`║  Listings found:    ${String(s.found).padStart(4)}                        ║`);
  console.log(`║  Extracted:         ${String(s.extracted).padStart(4)}                        ║`);
  console.log(`║  Filtered out:      ${String(s.skipped_filter).padStart(4)}                        ║`);
  console.log(`║  Already seen:      ${String(s.skipped_dedup).padStart(4)}                        ║`);
  console.log(`║  Viewed skipped:    ${String(s.skipped_viewed ?? 0).padStart(4)}                        ║`);
  console.log(`║  JDs saved:         ${String(s.saved).padStart(4)}                        ║`);
  console.log(`║  Errors:            ${String(s.errors).padStart(4)}                        ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (results.listings.length > 0) {
    console.log('\nNew listings:');
    for (const l of results.listings) {
      console.log(`  • ${l.title} — ${l.company}`);
    }
    console.log(`\nNext step: run /career-ops ${portalId} to process these into your pipeline.`);
  } else {
    console.log('\nNo new listings found this run.');
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  log(`Starting ${scanner.name} scanner...`);

  if (!existsSync(PORTALS_PATH)) {
    error(`portals.yml not found. Copy the template to get started:\n  cp templates/portals.example.yml portals.yml`);
    process.exit(1);
  }
  const config = scanner.parseConfig(readFileSync(PORTALS_PATH, 'utf-8'));

  const profileDir = getProfileDir(portalId);
  const context = await launchBrowser(profileDir);

  try {
    const page = await context.newPage();

    log('Checking session...');
    const loggedIn = await scanner.checkSession(page);
    if (loggedIn) {
      log('Session active — logged in');
    } else {
      warn('Not logged in — login required');
    }

    if (!loggedIn && !FLAG.login) {
      await page.close();
      throw new Error(`Not logged in to ${scanner.name}. Run: node scan-auth.mjs --login ${portalId}`);
    }

    if (!loggedIn && FLAG.login) {
      log(`Login mode — opening ${scanner.name} login page`);
      await page.goto(scanner.loginUrl, { waitUntil: 'domcontentloaded' });
      await waitForLogin(page);
    }

    await page.close();

    if (FLAG.login) {
      log(`Login successful — ${scanner.name} session saved. Run again without --login to scan.`);
      return;
    }

    // Scanner handles extraction, filtering, dedup — returns accepted listings
    const scanResult = await scanner.scan(context, config, {
      scanHistory: loadScanHistory(),
    });

    if (!scanResult) return;

    // Write JD files, pipeline entries, and scan history
    const pipelineEntries = [];
    const historyEntries = [];
    for (const detail of scanResult.listings) {
      const jdFile = saveJd(detail);
      const url = jdFile ? `local:${jdFile}` : detail.url;
      pipelineEntries.push({
        url,
        title: detail.title,
        company: detail.company,
      });
      historyEntries.push({
        url: detail.url,
        portal: portalId,
        title: detail.title,
        company: detail.company,
        status: 'added',
      });
    }

    // Add skipped entries to scan history
    for (const entry of scanResult.skipped || []) {
      historyEntries.push({
        url: entry.url,
        portal: portalId,
        title: entry.title,
        company: entry.company,
        status: entry.status,
      });
    }

    appendToPipeline(pipelineEntries);
    appendScanHistory(historyEntries);
    log(`Added ${pipelineEntries.length} listings to pipeline.md`);
    log(`Wrote ${historyEntries.length} entries to scan-history.tsv (${pipelineEntries.length} added, ${(scanResult.skipped || []).length} skipped)`);
    printSummary({ listings: pipelineEntries, stats: { ...scanResult.stats, saved: pipelineEntries.length }, errors: scanResult.errors });
  } finally {
    await context.close();
  }
}

main().catch(e => {
  error(e.message);
  process.exit(1);
});
