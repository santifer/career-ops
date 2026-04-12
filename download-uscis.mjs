#!/usr/bin/env node

/**
 * download-uscis.mjs — Download USCIS H-1B Employer Data Hub CSVs
 *
 * Downloads H-1B employer petition data from USCIS for offline sponsor lookups.
 * Files are stored in data/visa/uscis/ and refreshed quarterly.
 *
 * Usage:
 *   node download-uscis.mjs                  # download all missing/stale years
 *   node download-uscis.mjs --dry-run        # list URLs and file status without downloading
 *   node download-uscis.mjs --year 2023      # download only FY2023
 *   node download-uscis.mjs --force           # re-download even if files are fresh
 *   node download-uscis.mjs --force --year 2023  # force re-download FY2023
 */

import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const USCIS_DIR = join(ROOT, 'data', 'visa', 'uscis');
const BASE_URL = 'https://www.uscis.gov/sites/default/files/document/data';
const FISCAL_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const STALE_DAYS = 90;

// --- CLI Arg Parsing ---

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const yearIdx = args.indexOf('--year');
const SINGLE_YEAR = yearIdx !== -1 ? parseInt(args[yearIdx + 1], 10) : null;

// Validate --year argument
if (yearIdx !== -1) {
  const currentYear = new Date().getFullYear();
  if (isNaN(SINGLE_YEAR) || SINGLE_YEAR < 2009 || SINGLE_YEAR > currentYear + 1) {
    console.error(`\u274C Invalid year: ${args[yearIdx + 1]}. Must be between 2009 and ${currentYear + 1}.`);
    process.exit(1);
  }
}

// --- Helpers ---

function filenameForYear(year) {
  return `h1b_datahubexport-${year}.csv`;
}

function filepathForYear(year) {
  return join(USCIS_DIR, filenameForYear(year));
}

function urlForYear(year) {
  return `${BASE_URL}/${filenameForYear(year)}`;
}

function fileAge(filepath) {
  const mtime = statSync(filepath).mtimeMs;
  return (Date.now() - mtime) / (1000 * 60 * 60 * 24);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Download ---

async function downloadYear(year, force) {
  const filepath = filepathForYear(year);
  const url = urlForYear(year);

  // Check existing file
  if (existsSync(filepath) && !force) {
    const age = fileAge(filepath);
    if (age < STALE_DAYS) {
      const size = formatSize(statSync(filepath).size);
      console.log(`  FY${year}: up to date (${Math.floor(age)}d old, ${size})`);
      return { status: 'cached', year };
    }
    console.log(`  FY${year}: stale (${Math.floor(age)}d old), re-downloading...`);
  } else if (!existsSync(filepath)) {
    console.log(`  FY${year}: not found locally, downloading...`);
  } else {
    console.log(`  FY${year}: force re-downloading...`);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) career-ops/1.0',
        'Accept': 'text/csv,*/*'
      }
    });

    if (response.status === 404) {
      console.log(`  FY${year}: not available yet (FY${year})`);
      return { status: 'not_available', year };
    }

    if (!response.ok) {
      console.error(`  FY${year}: HTTP ${response.status} ${response.statusText}`);
      return { status: 'error', year, message: `HTTP ${response.status}` };
    }

    const text = await response.text();

    // Validate response looks like CSV (header row with commas, not HTML)
    const firstLine = text.split('\n')[0] || '';
    if (!firstLine.includes(',') || firstLine.toLowerCase().includes('<html')) {
      console.error(`  FY${year}: response is not CSV data (got HTML or empty)`);
      return { status: 'error', year, message: 'Invalid content (not CSV)' };
    }

    writeFileSync(filepath, text, 'utf-8');
    const size = formatSize(Buffer.byteLength(text, 'utf-8'));
    console.log(`  FY${year}: downloaded (${size})`);
    return { status: 'downloaded', year };
  } catch (err) {
    console.error(`  FY${year}: ${err.message}`);
    return { status: 'error', year, message: err.message };
  }
}

// --- Dry Run ---

function dryRunReport(years) {
  console.log('\n\uD83D\uDCC1 USCIS H-1B Data Hub — Dry Run\n');
  console.log(`  Directory: ${USCIS_DIR}`);
  console.log(`  Base URL:  ${BASE_URL}\n`);

  let hasStale = false;

  for (const year of years) {
    const filepath = filepathForYear(year);
    const url = urlForYear(year);

    if (existsSync(filepath)) {
      const age = Math.floor(fileAge(filepath));
      const size = formatSize(statSync(filepath).size);
      const stale = age >= STALE_DAYS;
      if (stale) hasStale = true;
      console.log(`  FY${year}: ${stale ? '\u26A0\uFE0F  stale' : '\u2705 fresh'} (${age}d old, ${size})`);
      console.log(`          ${url}`);
    } else {
      console.log(`  FY${year}: \u274C missing`);
      console.log(`          ${url}`);
    }
  }

  console.log('');
  if (hasStale) {
    console.log('  \u26A0\uFE0F  Some files are >90 days old. Run with --force to refresh.');
  }
  console.log(`  ${years.length} fiscal years configured (FY${years[0]}-FY${years[years.length - 1]})`);
}

// --- Main ---

async function main() {
  mkdirSync(USCIS_DIR, { recursive: true });

  const years = SINGLE_YEAR ? [SINGLE_YEAR] : FISCAL_YEARS;

  if (DRY_RUN) {
    dryRunReport(years);
    process.exit(0);
  }

  console.log('\n\uD83D\uDCC1 USCIS H-1B Data Hub — Download\n');

  const results = [];
  for (const year of years) {
    const result = await downloadYear(year, FORCE);
    results.push(result);
  }

  // Summary
  const counts = { downloaded: 0, cached: 0, not_available: 0, error: 0 };
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }

  console.log('\n  Summary:');
  if (counts.downloaded) console.log(`    \u2705 Downloaded: ${counts.downloaded}`);
  if (counts.cached) console.log(`    \u2705 Cached:     ${counts.cached}`);
  if (counts.not_available) console.log(`    \u26A0\uFE0F  Not available: ${counts.not_available}`);
  if (counts.error) console.log(`    \u274C Errors:     ${counts.error}`);

  // Stale warning
  let hasStale = false;
  for (const year of years) {
    const filepath = filepathForYear(year);
    if (existsSync(filepath) && fileAge(filepath) >= STALE_DAYS) {
      hasStale = true;
      break;
    }
  }
  if (hasStale) {
    console.log('\n  \u26A0\uFE0F  Some files are >90 days old. Run with --force to refresh.');
  }

  console.log('');
  process.exit(counts.error > 0 ? 1 : 0);
}

main();
