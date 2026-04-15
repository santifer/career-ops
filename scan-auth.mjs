#!/usr/bin/env node

/**
 * Job Portal Scanner
 *
 * Orchestrates authenticated job portal scanning. Each portal has its own
 * scanner class (in scan-auth/) that handles page interaction, extraction,
 * filtering, dedup, and employer blocklist. This file handles CLI, browser
 * setup, login, JD file writing, and results output.
 * 
 * DISCLAIMER: Portal scanning uses your own browser session. Respect each portal's terms of service.
 *
 * Usage:
 *   node scan-auth.mjs linkedin              # Normal scan
 *   node scan-auth.mjs --login linkedin       # Open browser to log in, then exit
 *   node scan-auth.mjs --search "AI Engineer" linkedin
 *   node scan-auth.mjs --dry-run linkedin     # Extract but don't write files
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

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
const JDS_DIR = join(__dirname, 'jds');

function getProfileDir(portal) {
  return join(process.env.HOME, '.scan-auth', portal, 'profile');
}

function getResultsPath(portal) {
  return join(__dirname, 'data', `${portal}-scan-results.json`);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const supportedNames = Object.keys(SCANNERS);

const FLAG_WITH_VALUE = new Set(['--search', '--max']);
const FLAGS = new Set(['--login', '--dry-run', ...FLAG_WITH_VALUE]);
const portalId = (() => {
  for (let i = 0; i < args.length; i++) {
    if (FLAGS.has(args[i])) { if (FLAG_WITH_VALUE.has(args[i])) i++; continue; }
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
  dryRun: args.includes('--dry-run'),
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

function loadScanHistory() {
  const urls = new Set();
  if (!existsSync(SCAN_HISTORY_PATH)) return urls;
  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
  for (let i = 1; i < lines.length; i++) {
    const url = lines[i].split('\t')[0];
    if (url) urls.add(url);
  }
  return urls;
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

function saveJd(detail) {
  mkdirSync(JDS_DIR, { recursive: true });
  const slug = slugify(`${detail.company}-${detail.title}`);
  const filename = `${slug}.md`;
  const filepath = join(JDS_DIR, filename);

  const content = `---
title: ${yamlEscape(detail.title)}
company: ${yamlEscape(detail.company)}
url: ${yamlEscape(detail.url)}
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

function writeResults(results, resultsPath) {
  mkdirSync(dirname(resultsPath), { recursive: true });
  writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf-8');
  log(`Results written to ${resultsPath}`);
}

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

    if (!loggedIn) {
      if (FLAG.login) {
        log(`Login mode — opening ${scanner.name} login page`);
        await page.goto(scanner.loginUrl, { waitUntil: 'domcontentloaded' });
      }
      await waitForLogin(page);
    }

    await page.close();

    if (FLAG.login) {
      log(`Login successful — ${scanner.name} session saved. Run again without --login to scan.`);
      return;
    }

    // Scanner handles extraction, filtering, dedup — returns accepted listings
    const scanResult = await scanner.scan(context, config, {
      maxResults: FLAG.maxResults,
      searchFilter: FLAG.search,
      scanHistory: loadScanHistory(),
    });

    if (!scanResult) return;

    // Write JD files for each accepted listing
    const savedListings = [];
    for (const detail of scanResult.listings) {
      let jdFile = null;
      if (!FLAG.dryRun) {
        jdFile = saveJd(detail);
      }
      savedListings.push({
        title: detail.title,
        company: detail.company,
        source_url: detail.url,
        application_url: detail.applicationUrl || '',
        jd_file: jdFile || `jds/${slugify(`${detail.company}-${detail.title}`)}.md`,
      });
    }

    const results = {
      scan_date: new Date().toISOString().split('T')[0],
      source: portalId,
      listings: savedListings,
      errors: scanResult.errors,
      stats: { ...scanResult.stats, saved: savedListings.length },
    };

    if (!FLAG.dryRun) {
      writeResults(results, getResultsPath(portalId));
    } else {
      log('Dry run — no files written');
      console.log(JSON.stringify(results, null, 2));
    }
    printSummary(results);
  } finally {
    await context.close();
  }
}

main().catch(e => {
  error(e.message);
  process.exit(1);
});
