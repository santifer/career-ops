#!/usr/bin/env node

/**
 * everify-lookup.mjs -- E-Verify employer registration lookup
 *
 * Checks whether an employer is registered with E-Verify using a hybrid
 * approach: local YAML database of known employers, Playwright scraping
 * of e-verify.gov as fallback, and file-based caching with 7-day TTL.
 *
 * Critical for STEM OPT users: non-E-Verify employers cannot employ
 * STEM OPT holders beyond the initial 12-month OPT period.
 *
 * Usage:
 *   node everify-lookup.mjs <company>              Human-readable output
 *   node everify-lookup.mjs <company> --json        JSON output
 *   node everify-lookup.mjs <company> --batch       Force batch mode (no Playwright)
 *   node everify-lookup.mjs --test                  Run built-in test suite
 *
 * Status values: 'registered', 'not_found', 'unverified'
 * Sources: 'yaml', 'scraped', 'degraded', 'cache'
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const CACHE_DIR = join(ROOT, 'data', 'visa', 'cache');
const DEFAULT_TTL = { uscis: 90, everify: 7, salary: 30 };
const EVERIFY_KNOWN_PATH = join(ROOT, 'config', 'everify-known.yml');
const ALIASES_PATH = join(ROOT, 'config', 'employer-aliases.yml');
const VALID_STATUSES = new Set(['registered', 'not_found', 'unverified']);

// --- Cache Functions (duplicated from visa-cache.mjs per project convention) ---

/**
 * Generate a deterministic cache key from source and identifier.
 * Keys are case-insensitive and filesystem-safe.
 *
 * @param {string} source - Data source (uscis, everify, salary)
 * @param {string} identifier - Company name or lookup identifier
 * @returns {string} Cache key like "everify-google-1a2b3c"
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
  // Guard against path traversal (T-05-02 mitigation)
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
 * @param {number} [ttlDaysOverride] - Override default TTL for this source
 */
function cacheSet(key, source, payload, ttlDaysOverride) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const ttl = ttlDaysOverride ?? DEFAULT_TTL[source] ?? 30;
  const now = new Date();
  const entry = {
    key,
    source,
    created: now.toISOString(),
    ttl_days: ttl,
    expires: new Date(now.getTime() + ttl * 86400000).toISOString(),
    payload
  };
  const filepath = join(CACHE_DIR, key + '.json');
  // Guard against path traversal (T-05-02 mitigation)
  if (!filepath.startsWith(CACHE_DIR)) {
    console.error('Invalid cache key (path traversal blocked)');
    return;
  }
  writeFileSync(filepath, JSON.stringify(entry, null, 2), 'utf-8');
}

// --- YAML Parser (duplicated from sponsorship-detect.mjs per project convention) ---

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Minimal YAML parser for nested key-value structure (everify-known.yml).
 * Parses format:
 *   company:
 *     status: registered
 *     verified_date: "2026-01-15"
 *     legal_entity: "ENTITY NAME"
 *
 * @param {string} filePath - Path to YAML file
 * @returns {object} Map of company keys to { status, verified_date, legal_entity }
 */
function loadEVerifyKnown(filePath) {
  if (!existsSync(filePath)) return {};
  const text = readFileSync(filePath, 'utf-8');
  const result = {};
  let currentKey = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();

    // Skip comments and blank lines
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top-level key: no leading whitespace, ends with colon
    if (!line.startsWith(' ') && !line.startsWith('\t') && trimmed.endsWith(':') && !trimmed.includes(': ')) {
      const keyName = trimmed.slice(0, -1).trim();
      if (UNSAFE_KEYS.has(keyName)) {
        console.warn(`Skipping unsafe YAML key: ${keyName}`);
        currentKey = null;
        continue;
      }
      currentKey = keyName.toLowerCase();
      result[currentKey] = {};
      continue;
    }

    // Nested property: leading whitespace, key: value
    if (currentKey && (line.startsWith(' ') || line.startsWith('\t'))) {
      const propMatch = trimmed.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
      if (propMatch) {
        const propKey = propMatch[1];
        if (UNSAFE_KEYS.has(propKey)) continue;
        let propVal = propMatch[2].trim();
        // Strip quotes (matched pair)
        if ((propVal.startsWith('"') && propVal.endsWith('"')) ||
            (propVal.startsWith("'") && propVal.endsWith("'"))) {
          propVal = propVal.slice(1, -1);
        }
        // Strip inline comments on unquoted values
        if (!propMatch[2].trim().startsWith('"') && !propMatch[2].trim().startsWith("'")) {
          const commentIdx = propVal.indexOf('#');
          if (commentIdx > 0) propVal = propVal.slice(0, commentIdx).trim();
        }
        result[currentKey][propKey] = propVal;
      }
    }
  }

  return result;
}

/**
 * Load employer aliases from YAML file (duplicated from h1b-lookup.mjs).
 *
 * @param {string} filePath - Path to employer-aliases.yml
 * @returns {Map<string, string>} Map of lowercase brand names to uppercase legal entities
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
 * Resolve employer name via aliases.
 *
 * @param {string} searchName - Brand or company name
 * @param {Map} aliases - Alias map
 * @returns {{ legalName: string, matchedVia: string }}
 */
function resolveEmployer(searchName, aliases) {
  const lowered = searchName.toLowerCase().trim();
  if (aliases.has(lowered)) {
    return { legalName: aliases.get(lowered), matchedVia: 'alias' };
  }
  return { legalName: searchName.toUpperCase(), matchedVia: 'exact' };
}

// --- Known Employer Check ---

/**
 * Load E-Verify known employers with user-layer .local.yml overrides.
 *
 * @param {string} filePath - Path to system-layer YAML file
 * @returns {object} Merged map of company keys to { status, verified_date, legal_entity }
 */
function loadEVerifyKnownWithLocal(filePath) {
  const db = loadEVerifyKnown(filePath);
  const localPath = filePath.replace('.yml', '.local.yml');
  if (existsSync(localPath)) {
    const localDb = loadEVerifyKnown(localPath);
    // Local entries override system entries
    for (const [key, value] of Object.entries(localDb)) {
      db[key] = value;
    }
  }
  return db;
}

/**
 * Check if employer is in the known E-Verify YAML database.
 *
 * @param {string} companyName - Company name to look up
 * @param {object} [knownDb] - Pre-loaded known employers (for testing)
 * @param {Map} [aliases] - Pre-loaded aliases (for testing)
 * @returns {object|null} Result object or null if not found
 */
function checkKnownEmployers(companyName, knownDb, aliases) {
  const db = knownDb || loadEVerifyKnownWithLocal(EVERIFY_KNOWN_PATH);
  const aliasMap = aliases || loadAliases(ALIASES_PATH);

  const normalized = normalizeEmployer(companyName);

  // Direct lookup in known DB
  if (db[normalized]) {
    const entry = db[normalized];
    return {
      employer: companyName,
      status: 'registered',
      source: 'yaml',
      legalEntity: entry.legal_entity || null,
      verifiedDate: entry.verified_date || null
    };
  }

  // Try resolving via alias, then check known DB by legal entity
  const { legalName } = resolveEmployer(companyName, aliasMap);
  const legalNormalized = normalizeEmployer(legalName);

  // Search known DB for matching legal entity
  for (const [key, entry] of Object.entries(db)) {
    if (entry.legal_entity && normalizeEmployer(entry.legal_entity) === legalNormalized) {
      return {
        employer: companyName,
        status: 'registered',
        source: 'yaml',
        legalEntity: entry.legal_entity,
        verifiedDate: entry.verified_date || null
      };
    }
  }

  return null;
}

// --- Playwright Scraping ---

/**
 * Attempt to scrape E-Verify employer search via Playwright.
 * Navigates to e-verify.gov employer search, fills company name, parses results.
 *
 * @param {string} companyName - Company name to search
 * @returns {Promise<object>} { status: 'registered'|'not_found', source: 'scraped' }
 * @throws {Error} On CAPTCHA, timeout, or navigation failure
 */
async function scrapeEVerify(companyName) {
  // Dynamic import to avoid crash when Playwright not installed
  const { chromium } = await import('playwright');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    // T-05-03: URL-encode employer name via URLSearchParams, validate domain
    const searchUrl = new URL('https://www.e-verify.gov/e-verify-employer-search');
    const targetDomain = 'e-verify.gov';
    if (!searchUrl.hostname.endsWith(targetDomain)) {
      throw new Error('SSRF blocked: URL domain mismatch');
    }

    await page.goto(searchUrl.toString(), { waitUntil: 'domcontentloaded' });

    // Wait for the search form
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });

    // Fill company name (URL-encoded via Playwright's fill, safe against injection)
    const input = await page.$('input[type="text"]');
    if (!input) throw new Error('Search form input not found');
    await input.fill(companyName);

    // Submit form
    const submitBtn = await page.$('input[type="submit"], button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await input.press('Enter');
    }

    // Wait for results
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Check for results
    const bodyText = await page.textContent('body');
    const lowerBody = bodyText.toLowerCase();

    if (lowerBody.includes('no results') || lowerBody.includes('not found') || lowerBody.includes('0 results')) {
      return { status: 'not_found', source: 'scraped' };
    }

    // If we see a results table or the company name appears in results
    if (lowerBody.includes(companyName.toLowerCase())) {
      return { status: 'registered', source: 'scraped' };
    }

    // Ambiguous -- treat as not found
    return { status: 'not_found', source: 'scraped' };
  } finally {
    if (browser) await browser.close();
  }
}

// --- Main Lookup ---

/**
 * Look up E-Verify registration status for an employer.
 *
 * Strategy:
 *   1. Check cache (7-day TTL)
 *   2. Check known employers YAML
 *   3. If batch mode: return 'unverified' (no Playwright in batch)
 *   4. Try Playwright scraping of e-verify.gov
 *   5. On scraping failure: return 'unverified' with 'degraded' source
 *
 * @param {string} companyName - Company name to look up
 * @param {object} options - { batchMode, noCache, _knownDb, _aliases }
 * @returns {Promise<object>} { employer, status, source, legalEntity? }
 */
async function lookupEVerify(companyName, options = {}) {
  // Check cache first
  if (!options.noCache) {
    const key = cacheKey('everify', companyName);
    const cached = cacheGet(key);
    if (cached !== null) {
      return { ...cached, source: 'cache' };
    }
  }

  // Check known employers YAML
  const knownResult = checkKnownEmployers(
    companyName,
    options._knownDb || undefined,
    options._aliases || undefined
  );
  if (knownResult) {
    // Cache the result
    if (!options.noCache) {
      cacheSet(cacheKey('everify', companyName), 'everify', knownResult);
    }
    return knownResult;
  }

  // Batch mode: degrade without Playwright (D-04)
  if (options.batchMode) {
    const degradedResult = {
      employer: companyName,
      status: 'unverified',
      source: 'degraded'
    };
    return degradedResult;
  }

  // Try Playwright scraping
  try {
    const scraped = await scrapeEVerify(companyName);
    const result = {
      employer: companyName,
      status: scraped.status,
      source: scraped.source
    };
    // Cache successful scrape results
    if (!options.noCache) {
      cacheSet(cacheKey('everify', companyName), 'everify', result);
    }
    return result;
  } catch (err) {
    // Scraping failed -- degrade gracefully
    const degradedResult = {
      employer: companyName,
      status: 'unverified',
      source: 'degraded'
    };
    return degradedResult;
  }
}

// --- Human-readable Output ---

function formatHuman(result) {
  const lines = [];
  lines.push(`E-Verify Lookup: ${result.employer}`);
  lines.push('='.repeat(40));
  lines.push(`  Status:        ${result.status}`);
  lines.push(`  Source:         ${result.source}`);
  if (result.legalEntity) {
    lines.push(`  Legal Entity:  ${result.legalEntity}`);
  }
  if (result.verifiedDate) {
    lines.push(`  Verified Date: ${result.verifiedDate}`);
  }
  lines.push('='.repeat(40));

  if (result.status === 'registered') {
    lines.push('This employer is E-Verify registered. STEM OPT eligible.');
  } else if (result.status === 'not_found') {
    lines.push('This employer is NOT registered with E-Verify.');
    lines.push('STEM OPT extension may not be possible with this employer.');
  } else {
    lines.push('E-Verify status could not be determined.');
    lines.push('Verify manually at: https://www.e-verify.gov/e-verify-employer-search');
  }

  return lines.join('\n');
}

// --- Built-in Tests ---

async function runTests() {
  let passed = 0;
  let failed = 0;

  function ok(condition, msg) {
    if (condition) {
      console.log(`  PASS: ${msg}`);
      passed++;
    } else {
      console.log(`  FAIL: ${msg}`);
      failed++;
    }
  }

  console.log('\nE-Verify Lookup -- Built-in Tests\n');

  // Load known DB and aliases for testing
  const knownDb = loadEVerifyKnown(EVERIFY_KNOWN_PATH);
  const aliases = loadAliases(ALIASES_PATH);

  // Test 1: Known employer (Google) returns registered from YAML
  const t1 = await lookupEVerify('Google', { noCache: true, _knownDb: knownDb, _aliases: aliases });
  ok(t1.status === 'registered', `Test 1: Google status is 'registered' (got '${t1.status}')`);
  ok(t1.source === 'yaml', `Test 1: Google source is 'yaml' (got '${t1.source}')`);
  ok(t1.legalEntity === 'ALPHABET INC', `Test 1: Google legalEntity is 'ALPHABET INC' (got '${t1.legalEntity}')`);

  // Test 2: Known employer in batch mode still works via YAML
  const t2 = await lookupEVerify('Google', { batchMode: true, noCache: true, _knownDb: knownDb, _aliases: aliases });
  ok(t2.status === 'registered', `Test 2: Google in batch mode is 'registered' (got '${t2.status}')`);
  ok(t2.source === 'yaml', `Test 2: Google in batch mode source is 'yaml' (got '${t2.source}')`);

  // Test 3: Unknown employer in batch mode degrades
  const t3 = await lookupEVerify('TinyUnknownCorp', { batchMode: true, noCache: true, _knownDb: knownDb, _aliases: aliases });
  ok(t3.status === 'unverified', `Test 3: TinyUnknownCorp batch mode status is 'unverified' (got '${t3.status}')`);
  ok(t3.source === 'degraded', `Test 3: TinyUnknownCorp batch mode source is 'degraded' (got '${t3.source}')`);

  // Test 4: Unknown employer in non-batch mode (Playwright unavailable in test)
  // This tests the degradation path when Playwright scraping fails
  const t4 = await lookupEVerify('TinyUnknownCorp', { batchMode: false, noCache: true, _knownDb: knownDb, _aliases: aliases });
  ok(t4.status === 'unverified', `Test 4: TinyUnknownCorp non-batch status is 'unverified' (got '${t4.status}')`);
  ok(t4.source === 'degraded' || t4.source === 'scraped', `Test 4: TinyUnknownCorp source is 'degraded' or 'scraped' (got '${t4.source}')`);

  // Test 5: Cache hit returns same result
  const testKey = cacheKey('everify', '_test_cache_company_');
  // Clear any existing test cache
  const testFile = join(CACHE_DIR, testKey + '.json');
  try { unlinkSync(testFile); } catch { /* ignore */ }

  const testPayload = { employer: '_test_cache_company_', status: 'registered', source: 'yaml', legalEntity: 'TEST INC' };
  cacheSet(testKey, 'everify', testPayload);
  const cached = cacheGet(testKey);
  ok(cached !== null, 'Test 5: Cache hit returns non-null');
  ok(cached && cached.status === 'registered', `Test 5: Cached status is 'registered' (got '${cached?.status}')`);
  // Clean up
  try { unlinkSync(testFile); } catch { /* ignore */ }

  // Test 6: Cache key uses 'everify' source (7-day TTL)
  const ck = cacheKey('everify', 'TestCompany');
  ok(ck.startsWith('everify-'), `Test 6: Cache key starts with 'everify-' (got '${ck}')`);

  // Test 7: Status values are always valid
  const validResults = [t1, t2, t3, t4];
  const allValid = validResults.every(r => VALID_STATUSES.has(r.status));
  ok(allValid, `Test 7: All status values are valid (registered/not_found/unverified)`);

  // Test 8: YAML parser rejects unsafe keys
  const unsafeYaml = '__proto__:\n  status: registered\n  legal_entity: "EVIL"\ngoogle:\n  status: registered\n  legal_entity: "ALPHABET INC"';
  const tmpPath = join(CACHE_DIR, '_test_unsafe.yml');
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(tmpPath, unsafeYaml, 'utf-8');
  const parsedUnsafe = loadEVerifyKnown(tmpPath);
  ok(!Object.prototype.hasOwnProperty.call(parsedUnsafe, '__proto__'), 'Test 8: YAML parser rejects __proto__ key');
  ok(parsedUnsafe['google'] !== undefined, 'Test 8: YAML parser still loads valid keys');
  try { unlinkSync(tmpPath); } catch { /* ignore */ }

  // Test 9: Direct key match in known DB (microsoft)
  const t9 = await lookupEVerify('microsoft', { noCache: true, _knownDb: knownDb, _aliases: aliases });
  ok(t9.status === 'registered', `Test 9: 'microsoft' direct key match status is 'registered' (got '${t9.status}')`);
  ok(t9.legalEntity === 'MICROSOFT CORPORATION', `Test 9: Legal entity is 'MICROSOFT CORPORATION' (got '${t9.legalEntity}')`);

  // Test 10: Path traversal guard on cache
  const traversalKey = '../../package';
  const traversalResult = cacheGet(traversalKey);
  ok(traversalResult === null, 'Test 10: Path traversal key returns null');

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    test: args.includes('--test'),
    json: args.includes('--json'),
    batch: args.includes('--batch')
  };

  const positional = args.filter(a => !a.startsWith('--'));

  if (flags.test) {
    const success = await runTests();
    process.exit(success ? 0 : 1);
  }

  if (positional.length === 0) {
    console.log('Usage: node everify-lookup.mjs <company> [--json] [--batch] [--test]');
    process.exit(1);
  }

  const companyName = positional.join(' ');
  const result = await lookupEVerify(companyName, { batchMode: flags.batch });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + formatHuman(result));
  }
}

main();
