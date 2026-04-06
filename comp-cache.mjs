#!/usr/bin/env node
/**
 * comp-cache.mjs — Compensation research cache for career-ops
 *
 * Caches salary data from WebSearch (Glassdoor, Levels.fyi, Blind) to avoid
 * repeating the same searches across evaluations. Cache TTL is 60 days.
 *
 * Cache file: data/comp-cache.yml (gitignored, local only)
 *
 * CLI usage:
 *   node comp-cache.mjs lookup "senior-ai-engineer" "series-b" "remote"
 *   node comp-cache.mjs save "senior-ai-engineer" "series-b" "remote" '{"p25":180000,"p50":210000,"p75":260000,"sources":["glassdoor"]}'
 *   node comp-cache.mjs list
 *   node comp-cache.mjs purge   # Remove expired entries
 *
 * Returns (stdout):
 *   lookup: JSON data if hit, "miss" if not found or expired
 *   save:   "saved" on success
 *   list:   JSON array of all cache keys with status
 *   purge:  "purged N entries"
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, 'data', 'comp-cache.yml');
const DEFAULT_TTL_DAYS = 60;

// ---------------------------------------------------------------------------
// YAML helpers — minimal serializer/parser for flat key-value YAML.
// No external dependency (avoids adding js-yaml to package.json).
// Format: only supports string, number, and string[] leaf values.
// ---------------------------------------------------------------------------

/**
 * Parse the custom comp-cache YAML format into a JS object.
 * Format:
 *   entries:
 *     key-name:
 *       field: value
 *       sources: glassdoor,levels.fyi
 */
function parseCache(raw) {
  const result = { entries: {} };
  if (!raw || !raw.trim()) return result;

  const lines = raw.split('\n');
  let currentKey = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Top-level "entries:" declaration
    if (/^entries:\s*$/.test(line)) continue;

    // Second-level key (2 spaces indent)
    const keyMatch = line.match(/^  ([^:]+):\s*$/);
    if (keyMatch) {
      currentKey = keyMatch[1].trim();
      result.entries[currentKey] = {};
      continue;
    }

    // Third-level field (4 spaces indent)
    if (currentKey) {
      const fieldMatch = line.match(/^    ([^:]+):\s*(.*)$/);
      if (fieldMatch) {
        const field = fieldMatch[1].trim();
        const value = fieldMatch[2].trim().replace(/^"(.*)"$/, '$1'); // strip quotes
        // Try to parse numbers
        const num = Number(value);
        result.entries[currentKey][field] = isNaN(num) || value === '' ? value : num;
      }
    }
  }

  return result;
}

/**
 * Serialize the cache object back to YAML string.
 */
function serializeCache(cache) {
  const lines = ['entries:'];
  for (const [key, entry] of Object.entries(cache.entries)) {
    lines.push(`  ${key}:`);
    for (const [field, value] of Object.entries(entry)) {
      const v = typeof value === 'string' && (value.includes(' ') || value === '')
        ? `"${value}"`
        : value;
      lines.push(`    ${field}: ${v}`);
    }
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Key building
// ---------------------------------------------------------------------------

/**
 * Build a normalized cache key from role, level, company stage, location.
 * Format: {role-level}-{stage}-{location}-{YYYY-QN}
 */
function buildKey(role, stage, location) {
  const normalize = (s) => s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const period = `${now.getFullYear()}-Q${quarter}`;

  return [normalize(role), normalize(stage), normalize(location), period]
    .filter(Boolean)
    .join('-');
}

// ---------------------------------------------------------------------------
// TTL check
// ---------------------------------------------------------------------------

/**
 * Returns true if the cache entry is expired (past its TTL).
 */
function isExpired(entry) {
  if (!entry.fetched) return true;
  const ttlDays = entry.ttl_days || DEFAULT_TTL_DAYS;
  const fetched = new Date(entry.fetched);
  if (isNaN(fetched.getTime())) return true;
  const now = new Date();
  const ageDays = (now - fetched) / (1000 * 60 * 60 * 24);
  return ageDays > ttlDays;
}

// ---------------------------------------------------------------------------
// Read / Write cache
// ---------------------------------------------------------------------------

function readCache() {
  if (!existsSync(CACHE_FILE)) return { entries: {} };
  try {
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    return parseCache(raw);
  } catch {
    return { entries: {} };
  }
}

function writeCache(cache) {
  const dir = dirname(CACHE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CACHE_FILE, serializeCache(cache), 'utf-8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up comp data by key. Returns parsed entry object or null if miss/expired.
 */
function lookup(key) {
  const cache = readCache();
  const entry = cache.entries[key];
  if (!entry) return null;
  if (isExpired(entry)) return null;
  return entry;
}

/**
 * Save comp data to cache.
 * @param {string} key - Cache key
 * @param {object} data - { p25, p50, p75, currency, sources: string[] }
 */
function save(key, data) {
  const cache = readCache();
  const today = new Date().toISOString().split('T')[0];
  cache.entries[key] = {
    p25: data.p25 ?? null,
    p50: data.p50 ?? null,
    p75: data.p75 ?? null,
    currency: data.currency ?? 'USD',
    sources: Array.isArray(data.sources) ? data.sources.join(',') : (data.sources ?? ''),
    fetched: today,
    ttl_days: DEFAULT_TTL_DAYS,
  };
  writeCache(cache);
}

/**
 * List all cache keys with their status (fresh/expired).
 */
function listEntries() {
  const cache = readCache();
  return Object.entries(cache.entries).map(([key, entry]) => ({
    key,
    fetched: entry.fetched,
    expired: isExpired(entry),
    p50: entry.p50,
    currency: entry.currency,
  }));
}

/**
 * Remove expired entries from cache.
 * @returns {number} Count of purged entries
 */
function purge() {
  const cache = readCache();
  let count = 0;
  for (const key of Object.keys(cache.entries)) {
    if (isExpired(cache.entries[key])) {
      delete cache.entries[key];
      count++;
    }
  }
  if (count > 0) writeCache(cache);
  return count;
}

export { buildKey, lookup, save, listEntries, purge, isExpired, parseCache, serializeCache };

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [,, command, ...args] = process.argv;

  switch (command) {
    case 'lookup': {
      if (args.length < 3) {
        console.error('Usage: comp-cache.mjs lookup <role> <stage> <location>');
        process.exit(1);
      }
      const key = buildKey(args[0], args[1], args[2]);
      const entry = lookup(key);
      if (entry) {
        console.log(JSON.stringify({ hit: true, key, ...entry }));
      } else {
        console.log('miss');
      }
      break;
    }

    case 'save': {
      if (args.length < 4) {
        console.error('Usage: comp-cache.mjs save <role> <stage> <location> <json-data>');
        process.exit(1);
      }
      const key = buildKey(args[0], args[1], args[2]);
      let data;
      try {
        data = JSON.parse(args[3]);
      } catch {
        console.error('Invalid JSON data');
        process.exit(1);
      }
      save(key, data);
      console.log(`saved:${key}`);
      break;
    }

    case 'list': {
      const entries = listEntries();
      console.log(JSON.stringify(entries, null, 2));
      break;
    }

    case 'purge': {
      const count = purge();
      console.log(`purged ${count} entries`);
      break;
    }

    default:
      console.error('Commands: lookup, save, list, purge');
      process.exit(1);
  }
}
