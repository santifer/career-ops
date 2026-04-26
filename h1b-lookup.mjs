#!/usr/bin/env node

/**
 * h1b-lookup.mjs -- H-1B employer history lookup via USCIS CSV data
 *
 * Queries local USCIS H-1B Employer Data Hub CSV files by employer name
 * with alias resolution, returns petition counts, approval rates, and
 * year-over-year trends. Results are cached with 90-day TTL.
 *
 * Usage:
 *   node h1b-lookup.mjs <company-name>              # Human-readable output
 *   node h1b-lookup.mjs <company-name> --json        # JSON output
 *   node h1b-lookup.mjs <company-name> --no-cache    # Skip cache
 *   node h1b-lookup.mjs <company-name> --sample      # Use sample CSV data
 *   node h1b-lookup.mjs --test                        # Run built-in tests
 *
 * Data sources:
 *   - data/visa/uscis/*.csv   (real USCIS data, downloaded via download-uscis.mjs)
 *   - data/visa/sample/*.csv  (sample data for testing)
 *   - config/employer-aliases.yml  (brand -> legal entity mapping)
 *   - data/visa/cache/        (90-day TTL JSON cache)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const USCIS_DIR = join(ROOT, 'data', 'visa', 'uscis');
const SAMPLE_DIR = join(ROOT, 'data', 'visa', 'sample');
const ALIASES_PATH = join(ROOT, 'config', 'employer-aliases.yml');
const CACHE_DIR = join(ROOT, 'data', 'visa', 'cache');
const DEFAULT_TTL = { uscis: 90, everify: 7, salary: 30 };

// --- Cache Functions (duplicated from visa-cache.mjs per project convention) ---

/**
 * Generate a deterministic cache key from source and identifier.
 * Keys are case-insensitive and filesystem-safe.
 *
 * @param {string} source - Data source (uscis, everify, salary)
 * @param {string} identifier - Company name or lookup identifier
 * @returns {string} Cache key like "uscis-google-1a2b3c"
 */
function cacheKey(source, identifier) {
  const safeSource = source.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hash = createHash('sha256').update(identifier.toLowerCase()).digest('hex').slice(0, 6);
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
  if (!existsSync(filepath)) return null;

  let entry;
  try {
    entry = JSON.parse(readFileSync(filepath, 'utf-8'));
  } catch {
    // Corrupt JSON -- remove and return null (T-03-06 mitigation)
    try { unlinkSync(filepath); } catch { /* ignore */ }
    return null;
  }

  // Validate required fields (T-03-06 mitigation)
  if (!entry || !entry.key || !entry.source || !entry.expires || !('payload' in entry)) {
    try { unlinkSync(filepath); } catch { /* ignore */ }
    return null;
  }

  // Check expiry
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
 * @param {object} payload - Data to cache (can include {found: false} for negative results)
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
  writeFileSync(join(CACHE_DIR, key + '.json'), JSON.stringify(entry, null, 2), 'utf-8');
}

// --- Alias Loading ---

/**
 * Load employer aliases from YAML file.
 * Minimal YAML parser for simple key: "value" format.
 *
 * @param {string} filePath - Path to employer-aliases.yml
 * @returns {Map<string, string>} Map of lowercase brand names to uppercase legal entities
 */
function loadAliasFile(filePath) {
  const aliases = new Map();
  if (!existsSync(filePath)) return aliases;

  const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const text = readFileSync(filePath, 'utf-8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match patterns: key: "Value", key: 'Value', key: Value
    const match = trimmed.match(/^["']?([^"':]+?)["']?\s*:\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/);
    if (match) {
      const brandName = match[1].trim().toLowerCase();
      if (UNSAFE_KEYS.has(brandName)) continue; // prototype pollution guard
      const legalEntity = match[2].trim();
      aliases.set(brandName, legalEntity);
    }
  }
  return aliases;
}

function loadAliases(filePath) {
  const aliases = loadAliasFile(filePath);
  // Load user-local overrides (not overwritten by system updates)
  const localPath = filePath.replace('.yml', '.local.yml');
  if (existsSync(localPath)) {
    const localAliases = loadAliasFile(localPath);
    for (const [k, v] of localAliases) aliases.set(k, v);
  }
  return aliases;
}

// --- Employer Normalization ---

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
  // Strip common suffixes (order matters -- longer patterns first)
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
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

// --- Employer Resolution ---

/**
 * Resolve a search name to a legal entity name.
 * Checks aliases first, then falls back to uppercase exact match.
 *
 * @param {string} searchName - Brand or company name to look up
 * @param {Map} aliases - Alias map from loadAliases()
 * @returns {{ legalName: string, matchedVia: string }}
 */
function resolveEmployer(searchName, aliases) {
  const lowered = searchName.toLowerCase().trim();
  if (aliases.has(lowered)) {
    return { legalName: aliases.get(lowered), matchedVia: 'alias' };
  }
  return { legalName: searchName.toUpperCase(), matchedVia: 'exact' };
}

// --- CSV Parsing ---

/**
 * Parse a CSV line, handling both quoted and unquoted fields.
 *
 * @param {string} line - CSV line to parse
 * @returns {string[]} Array of field values
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Stream-process all CSV files in a directory searching for a legal entity name.
 *
 * @param {string} legalName - Legal entity name to search for
 * @param {string} csvDir - Directory containing CSV files
 * @returns {Promise<object[]>} Array of year-result objects, sorted by fiscalYear descending
 */
async function searchCSVFiles(legalName, csvDir) {
  const normalizedTarget = normalizeEmployer(legalName);
  const results = [];

  if (!existsSync(csvDir)) return results;

  const csvFiles = readdirSync(csvDir)
    .filter(f => f.endsWith('.csv'))
    .sort();

  for (const file of csvFiles) {
    const filePath = join(csvDir, file);
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity
    });

    const EXPECTED_HEADERS = ['fiscal year', 'employer', 'initial approval', 'initial denial', 'continuing approval', 'continuing denial'];
    let isHeader = true;
    let headerValid = false;
    for await (const line of rl) {
      if (isHeader) {
        isHeader = false;
        const headers = parseCSVLine(line).map(h => h.toLowerCase().trim());
        const matches = EXPECTED_HEADERS.every(eh => headers.some(h => h.includes(eh)));
        if (!matches) {
          console.warn(`⚠️  Skipping ${file}: header schema mismatch (expected USCIS H-1B format)`);
          break;
        }
        headerValid = true;
        continue;
      }

      const cols = parseCSVLine(line);
      const employer = cols[1] || '';

      // Skip empty employer rows (T-03-05: empty employer names skipped)
      if (!employer.trim()) continue;

      if (normalizeEmployer(employer) === normalizedTarget) {
        results.push({
          fiscalYear: parseInt(cols[0]) || 0,
          initialApproval: parseInt(cols[2]) || 0,
          initialDenial: parseInt(cols[3]) || 0,
          continuingApproval: parseInt(cols[4]) || 0,
          continuingDenial: parseInt(cols[5]) || 0,
          naics: cols[6] || '',
          state: cols[8] || '',
          city: cols[9] || ''
        });
      }
    }
  }

  // Sort by fiscal year descending
  results.sort((a, b) => b.fiscalYear - a.fiscalYear);
  return results;
}

// --- Metrics Calculation ---

/**
 * Calculate petition metrics from year results.
 * Computes per-year totals/rates and overall summary with trend analysis.
 *
 * @param {object[]} yearResults - Array of year-result objects from searchCSVFiles
 * @returns {{ years: object[], summary: object }}
 */
function calculateMetrics(yearResults) {
  const years = yearResults.map(yr => {
    const totalPetitions = yr.initialApproval + yr.initialDenial +
                           yr.continuingApproval + yr.continuingDenial;
    const approved = yr.initialApproval + yr.continuingApproval;
    const approvalRate = totalPetitions > 0
      ? Math.round((approved / totalPetitions) * 1000) / 10
      : 0;
    return {
      fiscalYear: yr.fiscalYear,
      initialApproval: yr.initialApproval,
      initialDenial: yr.initialDenial,
      continuingApproval: yr.continuingApproval,
      continuingDenial: yr.continuingDenial,
      totalPetitions,
      approvalRate
    };
  });

  // Overall summary
  const totalPetitions = years.reduce((sum, y) => sum + y.totalPetitions, 0);
  const totalApproved = years.reduce((sum, y) =>
    sum + y.initialApproval + y.continuingApproval, 0);
  const avgApprovalRate = totalPetitions > 0
    ? Math.round((totalApproved / totalPetitions) * 1000) / 10
    : 0;
  const yearsOfData = years.length;
  const latestYear = years.length > 0 ? years[0].fiscalYear : null;

  // Trend calculation: compare latest year to average of prior years
  let trend = 'stable';
  if (years.length >= 2) {
    const latestTotal = years[0].totalPetitions;
    const priorYears = years.slice(1);
    const priorAvg = priorYears.reduce((s, y) => s + y.totalPetitions, 0) / priorYears.length;
    if (priorAvg > 0) {
      const changePercent = ((latestTotal - priorAvg) / priorAvg) * 100;
      if (changePercent > 15) trend = 'rising';
      else if (changePercent < -15) trend = 'declining';
    }
  }

  return {
    years,
    summary: {
      totalPetitions,
      avgApprovalRate,
      trend,
      yearsOfData,
      latestYear
    }
  };
}

// --- Main Lookup ---

/**
 * Look up H-1B employer history.
 * Resolves aliases, checks cache, queries CSV files, calculates metrics.
 *
 * @param {string} searchName - Company name to look up
 * @param {object} options - { noCache, sample, aliases }
 * @returns {Promise<object>} Lookup result
 */
async function lookupEmployer(searchName, options = {}) {
  const aliases = options.aliases || loadAliases(ALIASES_PATH);
  const { legalName, matchedVia } = resolveEmployer(searchName, aliases);

  // Check cache (unless disabled)
  if (!options.noCache) {
    const key = cacheKey('uscis', legalName);
    const cached = cacheGet(key);
    if (cached !== null) {
      return cached;
    }
  }

  // Determine CSV directory
  const csvDir = options.sample ? SAMPLE_DIR : USCIS_DIR;

  // Check if CSV data exists
  if (!existsSync(csvDir)) {
    const result = {
      employer: legalName,
      matchedVia,
      brandName: searchName,
      years: [],
      summary: null,
      found: false,
      error: 'No USCIS CSV data found. Run: node download-uscis.mjs'
    };
    return result;
  }

  const csvFiles = readdirSync(csvDir).filter(f => f.endsWith('.csv'));
  if (csvFiles.length === 0) {
    const result = {
      employer: legalName,
      matchedVia,
      brandName: searchName,
      years: [],
      summary: null,
      found: false,
      error: 'No USCIS CSV data found. Run: node download-uscis.mjs'
    };
    return result;
  }

  // Search CSV files
  const yearResults = await searchCSVFiles(legalName, csvDir);

  if (yearResults.length === 0) {
    const result = {
      employer: legalName,
      matchedVia,
      brandName: searchName,
      years: [],
      summary: null,
      found: false
    };
    // Cache negative result
    if (!options.noCache) {
      cacheSet(cacheKey('uscis', legalName), 'uscis', result);
    }
    return result;
  }

  // Calculate metrics
  const { years, summary } = calculateMetrics(yearResults);

  const result = {
    employer: legalName,
    matchedVia,
    brandName: searchName,
    found: true,
    years,
    summary
  };

  // Cache result
  if (!options.noCache) {
    cacheSet(cacheKey('uscis', legalName), 'uscis', result);
  }

  return result;
}

// --- Human-readable Output ---

/**
 * Format lookup result for human-readable console output.
 *
 * @param {object} result - Result from lookupEmployer
 * @returns {string} Formatted output
 */
function formatHuman(result) {
  if (!result.found) {
    let msg = `H-1B History: No records found for "${result.brandName}"`;
    if (result.matchedVia === 'alias') {
      msg += ` (resolved to ${result.employer} via alias)`;
    }
    if (result.error) {
      msg += `\n${result.error}`;
    }
    return msg;
  }

  const lines = [];
  const matchInfo = result.matchedVia === 'alias'
    ? ` (searched as "${result.brandName}", matched via alias)`
    : '';
  lines.push(`H-1B History: ${result.employer}${matchInfo}`);
  lines.push('');

  // Table header
  lines.push('Year  | Approved | Denied | Total | Rate');
  lines.push('------|----------|--------|-------|------');

  for (const yr of result.years) {
    const approved = yr.initialApproval + yr.continuingApproval;
    const denied = yr.initialDenial + yr.continuingDenial;
    lines.push(
      `${String(yr.fiscalYear).padEnd(6)}| ${String(approved).padStart(8)} | ${String(denied).padStart(6)} | ${String(yr.totalPetitions).padStart(5)} | ${yr.approvalRate}%`
    );
  }

  lines.push('');
  const totalFormatted = result.summary.totalPetitions.toLocaleString();
  lines.push(`Summary: ${totalFormatted} total petitions over ${result.summary.yearsOfData} year(s)`);
  lines.push(`Approval rate: ${result.summary.avgApprovalRate}% (${result.summary.trend} trend)`);

  return lines.join('\n');
}

// --- Built-in Tests ---

/**
 * Run built-in tests against sample CSV data.
 * @returns {Promise<boolean>} true if all tests pass
 */
async function runTests() {
  let passed = 0;
  let failed = 0;
  const aliases = loadAliases(ALIASES_PATH);

  function ok(condition, msg) {
    if (condition) {
      console.log(`  PASS: ${msg}`);
      passed++;
    } else {
      console.log(`  FAIL: ${msg}`);
      failed++;
    }
  }

  console.log('\nH-1B Lookup -- Built-in Tests (using sample data)\n');

  // Test 1: Search "ACME STARTUP INC" (exact match in sample)
  const t1 = await lookupEmployer('ACME STARTUP INC', { sample: true, noCache: true, aliases });
  ok(t1.found === true, 'Test 1: "ACME STARTUP INC" exact match found');
  ok(t1.years.length > 0, 'Test 1: has year data');

  // Test 2: Search "Google" (alias -> ALPHABET INC)
  const t2 = await lookupEmployer('Google', { sample: true, noCache: true, aliases });
  ok(t2.found === true, 'Test 2: "Google" found via alias');
  ok(t2.matchedVia === 'alias', 'Test 2: matchedVia is "alias"');
  ok(t2.employer === 'ALPHABET INC', 'Test 2: resolved to ALPHABET INC');

  // Test 3: Search nonexistent company
  const t3 = await lookupEmployer('NonexistentCompany12345', { sample: true, noCache: true, aliases });
  ok(t3.found === false, 'Test 3: nonexistent company returns found=false');

  // Test 4: Case-insensitive search
  const t4 = await lookupEmployer('acme startup inc', { sample: true, noCache: true, aliases });
  ok(t4.found === true, 'Test 4: case-insensitive search finds "acme startup inc"');

  // Test 5: LLC suffix handling -- "SMALL COMPANY LLC" in sample
  const t5 = await lookupEmployer('SMALL COMPANY LLC', { sample: true, noCache: true, aliases });
  ok(t5.found === true, 'Test 5: "SMALL COMPANY LLC" found (suffix handling)');

  // Test 6: Multi-year trend -- ALPHABET INC has 3 years in sample
  const t6 = await lookupEmployer('ALPHABET INC', { sample: true, noCache: true, aliases });
  ok(t6.found === true, 'Test 6: ALPHABET INC found');
  ok(t6.years.length === 3, 'Test 6: ALPHABET INC has 3 years of data');
  ok(t6.summary.trend !== undefined, 'Test 6: trend calculated');
  ok(t6.summary.yearsOfData === 3, 'Test 6: yearsOfData is 3');

  // Test 7: Empty employer rows skipped -- no false matches
  // (The sample CSV doesn't have empty rows, but normalizeEmployer('') returns '' which
  // won't match any real company, and the searchCSVFiles skips empty employer fields)
  ok(normalizeEmployer('') === '', 'Test 7: empty employer normalizes to empty string');
  ok(normalizeEmployer('  ') === '', 'Test 7: whitespace employer normalizes to empty string');

  // Test 8: Approval rate calculation for known data
  // ALPHABET INC 2023: 1523+45+892+12 = 2472 total, (1523+892)/2472 = 97.7%
  const alphaYr2023 = t6.years.find(y => y.fiscalYear === 2023);
  ok(alphaYr2023 !== undefined, 'Test 8: ALPHABET INC 2023 data exists');
  if (alphaYr2023) {
    ok(alphaYr2023.totalPetitions === 2472, `Test 8: total petitions = ${alphaYr2023.totalPetitions} (expected 2472)`);
    ok(alphaYr2023.approvalRate === 97.7, `Test 8: approval rate = ${alphaYr2023.approvalRate}% (expected 97.7%)`);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    test: args.includes('--test'),
    sample: args.includes('--sample'),
    json: args.includes('--json'),
    noCache: args.includes('--no-cache')
  };

  // Filter out flags to get positional args
  const positional = args.filter(a => !a.startsWith('--'));

  if (flags.test) {
    const success = await runTests();
    process.exit(success ? 0 : 1);
  }

  if (positional.length === 0) {
    console.log('Usage: node h1b-lookup.mjs <company-name> [--json] [--no-cache] [--sample] [--test]');
    process.exit(1);
  }

  const companyName = positional.join(' ');
  const result = await lookupEmployer(companyName, {
    sample: flags.sample,
    noCache: flags.noCache
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + formatHuman(result));
  }
}

main();
