#!/usr/bin/env node

/**
 * h1b-salary.mjs -- H-1B salary data lookup via H1Bdata.info
 *
 * Scrapes H-1B salary data from H1Bdata.info using Playwright, caches
 * results for 30 days. Returns min/median/p75/max salary statistics.
 * Degrades gracefully in batch mode (no Playwright available).
 *
 * Usage:
 *   node h1b-salary.mjs <employer> <role> [city]           Human-readable output
 *   node h1b-salary.mjs <employer> <role> [city] --json    JSON output
 *   node h1b-salary.mjs --batch <employer> <role>          Force batch mode (no scraping)
 *   echo '{"employer":"...","role":"..."}' | node h1b-salary.mjs --stdin --json   Pipeline
 *   node h1b-salary.mjs --test                              Run built-in tests
 *
 * Data source: https://h1bdata.info/index.php
 * Cache: data/visa/cache/ with 30-day TTL
 * Columns: EMPLOYER, JOB TITLE, BASE SALARY, LOCATION, SUBMIT DATE, START DATE, CASE STATUS
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const CACHE_DIR = join(ROOT, 'data', 'visa', 'cache');
const ALIASES_PATH = join(ROOT, 'config', 'employer-aliases.yml');
const DEFAULT_TTL = { uscis: 90, everify: 7, salary: 30 };
const BASE_URL = 'https://h1bdata.info/index.php';
const PLAYWRIGHT_TIMEOUT = 30000;
const MAX_ROWS = 500; // T-05-10: limit rows to prevent DoS on large result pages

// --- Cache Functions (duplicated from visa-cache.mjs per project convention) ---

/**
 * Generate a deterministic cache key from source and identifier.
 * Keys are case-insensitive and filesystem-safe.
 *
 * @param {string} source - Data source (uscis, everify, salary)
 * @param {string} identifier - Company name or lookup identifier
 * @returns {string} Cache key like "salary-google-1a2b3c"
 */
function cacheKey(source, identifier) {
  const safeSource = source.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hash = createHash('md5').update(identifier.toLowerCase()).digest('hex').slice(0, 6);
  const sanitized = identifier.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
  return `${safeSource}-${sanitized}-${hash}`;
}

/**
 * Retrieve a cached entry by key.
 * Returns null if entry doesn't exist, is expired, or is corrupt.
 * Expired entries are automatically deleted on read.
 *
 * @param {string} key - Cache key (from cacheKey())
 * @returns {object|null} Cached payload or null
 */
function cacheGet(key) {
  const filepath = join(CACHE_DIR, key + '.json');
  // T-05-07: Guard against path traversal
  if (!filepath.startsWith(CACHE_DIR)) {
    console.error('Invalid cache key (path traversal blocked)');
    return null;
  }
  if (!existsSync(filepath)) return null;

  let entry;
  try {
    entry = JSON.parse(readFileSync(filepath, 'utf-8'));
  } catch {
    try { unlinkSync(filepath); } catch { /* ignore */ }
    return null;
  }

  if (!entry || !entry.key || !entry.source || !entry.expires || !('payload' in entry)) {
    try { unlinkSync(filepath); } catch { /* ignore */ }
    return null;
  }

  if (new Date(entry.expires) < new Date()) {
    try { unlinkSync(filepath); } catch { /* ignore */ }
    return null;
  }

  return entry.payload;
}

/**
 * Write a cache entry.
 * Creates the cache directory if it doesn't exist.
 *
 * @param {string} key - Cache key (from cacheKey())
 * @param {string} source - Data source for TTL lookup
 * @param {object} payload - Data to cache
 */
function cacheSet(key, source, payload) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const filepath = join(CACHE_DIR, key + '.json');
  // T-05-07: Guard against path traversal
  if (!filepath.startsWith(CACHE_DIR)) {
    console.error('Invalid cache key (path traversal blocked)');
    return;
  }
  const ttl = DEFAULT_TTL[source] ?? 30;
  const now = new Date();
  const entry = {
    key,
    source,
    created: now.toISOString(),
    ttl_days: ttl,
    expires: new Date(now.getTime() + ttl * 86400000).toISOString(),
    payload
  };
  writeFileSync(filepath, JSON.stringify(entry, null, 2), 'utf-8');
}

// --- YAML Parser (duplicated per project convention) ---

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Load employer aliases from YAML file.
 * Minimal YAML parser for simple key: "value" format.
 *
 * @param {string} filePath - Path to employer-aliases.yml
 * @returns {Map<string, string>} Map of lowercase brand names to legal entities
 */
function loadAliasFile(filePath) {
  const aliases = new Map();
  if (!existsSync(filePath)) return aliases;

  const text = readFileSync(filePath, 'utf-8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^["']?([^"':]+?)["']?\s*:\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/);
    if (match) {
      const brandName = match[1].trim().toLowerCase();
      if (UNSAFE_KEYS.has(brandName)) continue;
      const legalEntity = match[2].trim();
      aliases.set(brandName, legalEntity);
    }
  }
  return aliases;
}

function loadAliases(filePath) {
  const aliases = loadAliasFile(filePath);
  const localPath = filePath.replace('.yml', '.local.yml');
  if (existsSync(localPath)) {
    const localAliases = loadAliasFile(localPath);
    for (const [k, v] of localAliases) aliases.set(k, v);
  }
  return aliases;
}

// --- Employer Normalization (duplicated from h1b-lookup.mjs) ---

/**
 * Normalize employer name for comparison.
 * Lowercases, trims, strips common suffixes, collapses whitespace.
 *
 * @param {string} name - Employer name to normalize
 * @returns {string} Normalized name
 */
function normalizeEmployer(name) {
  if (!name) return '';
  let normalized = name.toLowerCase().trim();
  const suffixes = [
    ', inc.', ', inc', ', llc', ', corp.', ', corp',
    ', ltd.', ', ltd', ', llp', ', l.p.', ', na', ', n.a.', ', co.',
    ' inc.', ' inc', ' llc', ' corp.', ' corp',
    ' ltd.', ' ltd', ' llp', ' l.p.', ' na', ' n.a.', ' co.'
  ];
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

/**
 * Resolve a search name to legal entity via alias map.
 *
 * @param {string} searchName - Brand or company name
 * @param {Map} aliases - Alias map from loadAliases()
 * @returns {{ legalName: string, matchedVia: string }}
 */
function resolveEmployer(searchName, aliases) {
  const lowered = searchName.toLowerCase().trim();
  if (aliases.has(lowered)) {
    return { legalName: aliases.get(lowered), matchedVia: 'alias' };
  }
  return { legalName: searchName, matchedVia: 'exact' };
}

// --- URL Building ---

/**
 * Build H1Bdata.info query URL.
 * T-05-08: All params URL-encoded via URLSearchParams.
 *
 * @param {string} employer - Employer name
 * @param {string} jobTitle - Job title
 * @param {string} city - City (optional)
 * @returns {string} Full URL
 */
function buildSalaryUrl(employer, jobTitle, city) {
  const params = new URLSearchParams();
  params.set('em', employer);
  if (jobTitle) params.set('job', jobTitle);
  if (city) params.set('city', city);
  params.set('year', 'All Years');
  const url = `${BASE_URL}?${params.toString()}`;
  // T-05-08: Validate URL domain
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'h1bdata.info') {
      throw new Error(`Invalid domain: ${parsed.hostname}`);
    }
  } catch (e) {
    throw new Error(`SSRF protection: invalid URL - ${e.message}`);
  }
  return url;
}

// --- HTML Salary Table Parsing ---

/**
 * Parse salary values from H1Bdata.info HTML table.
 * Extracts BASE SALARY column, calculates min/median/p75/max.
 * T-05-10: Limits to first MAX_ROWS rows to prevent DoS.
 *
 * @param {string} html - Page HTML content
 * @returns {object|null} { min, median, p75, max, count } or null if no data
 */
function parseSalaryTable(html) {
  // Match table rows - H1Bdata.info uses standard HTML tables
  // Columns: EMPLOYER, JOB TITLE, BASE SALARY, LOCATION, SUBMIT DATE, START DATE, CASE STATUS
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const salaries = [];
  let rowCount = 0;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    if (rowCount >= MAX_ROWS) break; // T-05-10: limit rows

    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    // BASE SALARY is column index 2 (0-indexed)
    if (cells.length >= 3) {
      const salaryStr = cells[2];
      // Parse "$120,000" or "120000" format
      const cleaned = salaryStr.replace(/[$,\s]/g, '');
      const salary = parseInt(cleaned, 10);
      if (!isNaN(salary) && salary > 0) {
        salaries.push(salary);
        rowCount++;
      }
    }
  }

  if (salaries.length === 0) return null;

  // Sort ascending for percentile calculations
  salaries.sort((a, b) => a - b);

  const count = salaries.length;
  const min = salaries[0];
  const max = salaries[count - 1];

  // Median: middle value (or average of two middles for even count)
  let median;
  if (count % 2 === 1) {
    median = salaries[Math.floor(count / 2)];
  } else {
    median = Math.round((salaries[count / 2 - 1] + salaries[count / 2]) / 2);
  }

  // 75th percentile
  const p75Index = Math.floor(count * 0.75);
  const p75 = salaries[Math.min(p75Index, count - 1)];

  return { min, median, p75, max, count };
}

// --- Playwright Scraping ---

/**
 * Scrape salary data from H1Bdata.info using Playwright.
 *
 * @param {string} employer - Resolved employer name
 * @param {string} jobTitle - Job title
 * @param {string} city - City (optional)
 * @returns {Promise<object>} Salary statistics { min, median, p75, max, count }
 * @throws {Error} If scraping fails
 */
async function scrapeSalary(employer, jobTitle, city) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const url = buildSalaryUrl(employer, jobTitle, city);
    await page.goto(url, { timeout: PLAYWRIGHT_TIMEOUT, waitUntil: 'networkidle' });

    // Wait for table content (may load asynchronously)
    try {
      await page.waitForSelector('table', { timeout: 10000 });
    } catch {
      // Table may not exist if no results found
    }

    const content = await page.content();
    const stats = parseSalaryTable(content);

    if (!stats) {
      throw new Error('No salary data found in H1Bdata.info results');
    }

    return stats;
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}

// --- Main Lookup Function ---

/**
 * Look up H-1B salary data for an employer/role.
 * Checks cache first, falls back to Playwright scraping.
 * In batch mode, returns unavailable without attempting scraping.
 *
 * @param {string} employer - Employer name (brand or legal entity)
 * @param {string} jobTitle - Job title
 * @param {string} city - City (optional, empty string for any)
 * @param {object} options - { batchMode: boolean }
 * @returns {Promise<object>} Result object
 */
async function lookupSalary(employer, jobTitle, city, options = {}) {
  // Validate employer
  if (!employer || !employer.trim()) {
    return { available: false, reason: 'no_employer' };
  }

  // Resolve employer name via aliases
  const aliases = loadAliases(ALIASES_PATH);
  const { legalName } = resolveEmployer(employer, aliases);

  // Build cache key combining employer + role + city for uniqueness
  const cacheId = `${legalName}|${jobTitle || ''}|${city || ''}`;
  const key = cacheKey('salary', cacheId);

  // Check cache first
  const cached = cacheGet(key);
  if (cached) {
    return {
      available: cached.available !== undefined ? cached.available : true,
      stats: cached.stats,
      employer: legalName,
      role: jobTitle,
      location: city || '',
      source: 'cached',
      ...(cached.reason ? { reason: cached.reason } : {})
    };
  }

  // Batch mode: degrade without scraping
  if (options.batchMode) {
    return { available: false, reason: 'batch_mode' };
  }

  // Attempt Playwright scraping
  try {
    const stats = await scrapeSalary(legalName, jobTitle, city);
    const result = {
      available: true,
      stats,
      employer: legalName,
      role: jobTitle,
      location: city || '',
      source: 'scraped'
    };
    // Cache the successful result
    cacheSet(key, 'salary', { available: true, stats });
    return result;
  } catch (err) {
    return {
      available: false,
      reason: 'scrape_failed',
      error: err.message,
      employer: legalName,
      role: jobTitle,
      location: city || ''
    };
  }
}

// --- Human-Readable Formatting ---

function formatOutput(result) {
  if (!result.available) {
    console.log(`\nH-1B Salary Data: Not Available`);
    console.log(`  Reason: ${result.reason}`);
    if (result.error) console.log(`  Error: ${result.error}`);
    if (result.employer) console.log(`  Employer: ${result.employer}`);
    return;
  }

  const { stats, employer, role, location, source } = result;
  console.log(`\nH-1B Salary Data for ${employer}`);
  console.log(`  Role: ${role || 'Any'}`);
  if (location) console.log(`  Location: ${location}`);
  console.log(`  Source: ${source}`);
  console.log('  ' + '-'.repeat(40));
  console.log(`  Min:      $${stats.min.toLocaleString()}`);
  console.log(`  Median:   $${stats.median.toLocaleString()}`);
  console.log(`  75th %:   $${stats.p75.toLocaleString()}`);
  console.log(`  Max:      $${stats.max.toLocaleString()}`);
  console.log(`  Records:  ${stats.count}`);
}

// --- Built-in Test Suite ---

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  PASS  ${testName}`);
      passed++;
    } else {
      console.log(`  FAIL  ${testName}`);
      failed++;
    }
  }

  console.log('\n  H-1B Salary Lookup Tests');
  console.log('  ' + '='.repeat(50));

  // Test 1: Empty employer returns no_employer
  {
    const result = await lookupSalary('', 'Engineer', '', {});
    assert(result.available === false && result.reason === 'no_employer',
      'Empty employer returns { available: false, reason: no_employer }');
  }

  // Test 2: Null employer returns no_employer
  {
    const result = await lookupSalary(null, 'Engineer', '', {});
    assert(result.available === false && result.reason === 'no_employer',
      'Null employer returns { available: false, reason: no_employer }');
  }

  // Test 3: Batch mode returns batch_mode
  {
    const result = await lookupSalary('Google', 'Software Engineer', '', { batchMode: true });
    assert(result.available === false && result.reason === 'batch_mode',
      'Batch mode returns { available: false, reason: batch_mode }');
  }

  // Test 4: parseSalaryTable with mock HTML
  {
    const mockHtml = `
      <table>
        <tr><th>EMPLOYER</th><th>JOB TITLE</th><th>BASE SALARY</th><th>LOCATION</th></tr>
        <tr><td>GOOGLE</td><td>Software Engineer</td><td>$120,000</td><td>Mountain View, CA</td></tr>
        <tr><td>GOOGLE</td><td>Software Engineer</td><td>$150,000</td><td>Mountain View, CA</td></tr>
        <tr><td>GOOGLE</td><td>Software Engineer</td><td>$180,000</td><td>Mountain View, CA</td></tr>
        <tr><td>GOOGLE</td><td>Software Engineer</td><td>$200,000</td><td>Mountain View, CA</td></tr>
      </table>`;
    const stats = parseSalaryTable(mockHtml);
    assert(stats !== null && stats.min === 120000 && stats.max === 200000 && stats.count === 4,
      'parseSalaryTable extracts salary stats from HTML (min=120k, max=200k, count=4)');
  }

  // Test 5: Stats ordering (min <= median <= p75 <= max)
  {
    const mockHtml = `
      <table>
        <tr><td>A</td><td>B</td><td>$80,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$100,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$120,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$140,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$160,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$180,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$200,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$250,000</td><td>C</td></tr>
      </table>`;
    const stats = parseSalaryTable(mockHtml);
    assert(stats && stats.min <= stats.median && stats.median <= stats.p75 && stats.p75 <= stats.max,
      'Stats ordering: min <= median <= p75 <= max');
  }

  // Test 6: Median calculation for even count
  {
    const mockHtml = `
      <table>
        <tr><td>A</td><td>B</td><td>$100,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$200,000</td><td>C</td></tr>
      </table>`;
    const stats = parseSalaryTable(mockHtml);
    assert(stats && stats.median === 150000,
      'Median for even count is average of two middles (150000)');
  }

  // Test 7: parseSalaryTable returns null for empty table
  {
    const mockHtml = '<table><tr><th>No data</th></tr></table>';
    const stats = parseSalaryTable(mockHtml);
    assert(stats === null,
      'parseSalaryTable returns null for table with no salary data');
  }

  // Test 8: Cache key uniqueness (different employer+role+city combos)
  {
    const key1 = cacheKey('salary', 'Google|Engineer|SF');
    const key2 = cacheKey('salary', 'Google|Engineer|NYC');
    const key3 = cacheKey('salary', 'Meta|Engineer|SF');
    assert(key1 !== key2 && key2 !== key3 && key1 !== key3,
      'Cache keys are unique for different employer/role/city combinations');
  }

  // Test 9: Cache key is deterministic
  {
    const key1 = cacheKey('salary', 'Google|Software Engineer|San Francisco');
    const key2 = cacheKey('salary', 'Google|Software Engineer|San Francisco');
    assert(key1 === key2,
      'Cache key is deterministic (same inputs produce same key)');
  }

  // Test 10: buildSalaryUrl produces valid URL with encoded params
  {
    const url = buildSalaryUrl('Google Inc', 'Software Engineer', 'San Francisco');
    assert(url.startsWith(BASE_URL) && url.includes('em=Google') && url.includes('job=Software'),
      'buildSalaryUrl produces valid URL with encoded parameters');
  }

  // Test 11: parseSalaryTable handles salary without dollar sign
  {
    const mockHtml = `
      <table>
        <tr><td>A</td><td>B</td><td>95000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>105000</td><td>C</td></tr>
      </table>`;
    const stats = parseSalaryTable(mockHtml);
    assert(stats && stats.min === 95000 && stats.max === 105000,
      'parseSalaryTable handles salary values without dollar sign');
  }

  // Test 12: UNSAFE_KEYS set exists for proto pollution guard
  {
    assert(UNSAFE_KEYS.has('__proto__') && UNSAFE_KEYS.has('constructor') && UNSAFE_KEYS.has('prototype'),
      'UNSAFE_KEYS guards against prototype pollution');
  }

  // Test 13: Stats values are numbers, not strings
  {
    const mockHtml = `
      <table>
        <tr><td>A</td><td>B</td><td>$100,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$200,000</td><td>C</td></tr>
        <tr><td>A</td><td>B</td><td>$300,000</td><td>C</td></tr>
      </table>`;
    const stats = parseSalaryTable(mockHtml);
    assert(stats &&
      typeof stats.min === 'number' &&
      typeof stats.median === 'number' &&
      typeof stats.p75 === 'number' &&
      typeof stats.max === 'number' &&
      typeof stats.count === 'number',
      'All stats values are numbers (not strings)');
  }

  console.log('\n  ' + '-'.repeat(50));
  console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  if (failed > 0) {
    process.exit(1);
  }
}

// --- Stdin Pipeline Mode ---

async function handleStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch (e) {
    console.error(JSON.stringify({ available: false, reason: 'invalid_json', error: e.message }));
    process.exit(1);
  }
  const { employer, role, city, batchMode } = input;
  const result = await lookupSalary(employer, role || '', city || '', { batchMode: !!batchMode });
  console.log(JSON.stringify(result, null, 2));
}

// --- CLI Entry Point ---

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    await runTests();
    return;
  }

  if (args.includes('--stdin')) {
    await handleStdin();
    return;
  }

  const jsonOutput = args.includes('--json');
  const batchMode = args.includes('--batch');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 2) {
    console.log('Usage: node h1b-salary.mjs <employer> <role> [city] [--json] [--batch]');
    console.log('       echo \'{"employer":"...","role":"..."}\' | node h1b-salary.mjs --stdin --json');
    console.log('       node h1b-salary.mjs --test');
    process.exit(0);
  }

  const employer = positional[0];
  const role = positional[1];
  const city = positional[2] || '';

  const result = await lookupSalary(employer, role, city, { batchMode });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    formatOutput(result);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
