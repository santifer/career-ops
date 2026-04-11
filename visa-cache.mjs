#!/usr/bin/env node

/**
 * visa-cache.mjs -- File-based JSON cache for visa data lookups
 *
 * Provides caching infrastructure for USCIS H-1B, E-Verify, and salary
 * lookups. Each cache entry is a JSON file in data/visa/cache/.
 *
 * This script serves two purposes:
 *   1. CLI tool for cache management (stats, clear, get)
 *   2. Reference implementation that other scripts copy from
 *      (per project convention of no shared imports)
 *
 * Usage:
 *   node visa-cache.mjs stats              Show cache statistics
 *   node visa-cache.mjs clear [source]     Clear cache (all or by source)
 *   node visa-cache.mjs get <key>          Read a specific cache entry
 *   node visa-cache.mjs                    Print usage
 *
 * Cache key pattern: {source}-{sanitized-name}-{hash}
 * Example: uscis-google-1a2b3c.json
 *
 * TTL defaults: USCIS=90d, E-Verify=7d, Salary=30d
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const CACHE_DIR = join(ROOT, 'data', 'visa', 'cache');
const DEFAULT_TTL = { uscis: 90, everify: 7, salary: 30 };

// --- Core Functions ---

/**
 * Generate a deterministic cache key from source and identifier.
 * Keys are case-insensitive and filesystem-safe.
 *
 * @param {string} source - Data source (uscis, everify, salary)
 * @param {string} identifier - Company name or lookup identifier
 * @returns {string} Cache key like "uscis-google-1a2b3c"
 */
function cacheKey(source, identifier) {
  const hash = createHash('md5').update(identifier.toLowerCase()).digest('hex').slice(0, 6);
  const sanitized = identifier.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
  return `${source}-${sanitized}-${hash}`;
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
    // Corrupt JSON -- remove and return null (T-02-06 mitigation)
    try { unlinkSync(filepath); } catch { /* ignore */ }
    return null;
  }

  // Validate required fields (T-02-06 mitigation)
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

/**
 * Clear cache entries, optionally filtered by source prefix.
 *
 * @param {string} [sourcePrefix] - If provided, only delete files starting with this prefix
 * @returns {number} Count of deleted files
 */
function cacheClear(sourcePrefix) {
  if (!existsSync(CACHE_DIR)) return 0;
  const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  let count = 0;
  for (const f of files) {
    if (!sourcePrefix || f.startsWith(sourcePrefix + '-')) {
      try {
        unlinkSync(join(CACHE_DIR, f));
        count++;
      } catch {
        // ignore deletion errors
      }
    }
  }
  return count;
}

/**
 * Return cache statistics: total entries, breakdown by source, expired count.
 *
 * @returns {{ total: number, by_source: object, expired: number }}
 */
function cacheStats() {
  if (!existsSync(CACHE_DIR)) return { total: 0, by_source: {}, expired: 0 };
  const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  const by_source = {};
  let expired = 0;
  for (const f of files) {
    try {
      const entry = JSON.parse(readFileSync(join(CACHE_DIR, f), 'utf-8'));
      const src = entry.source || 'unknown';
      by_source[src] = (by_source[src] || 0) + 1;
      if (new Date(entry.expires) < new Date()) expired++;
    } catch {
      // skip corrupt files
    }
  }
  return { total: files.length, by_source, expired };
}

// --- CLI Interface ---

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log('visa-cache.mjs -- File-based JSON cache for visa data');
  console.log('');
  console.log('Usage:');
  console.log('  node visa-cache.mjs stats              Show cache statistics');
  console.log('  node visa-cache.mjs clear [source]     Clear cache (all or by source)');
  console.log('  node visa-cache.mjs get <key>          Read a specific cache entry');
  process.exit(0);
}

if (command === 'stats') {
  const stats = cacheStats();
  console.log('\n\uD83D\uDCCA Visa Cache Statistics');
  console.log('='.repeat(40));
  console.log(`  Total entries: ${stats.total}`);
  console.log(`  Expired:       ${stats.expired}`);
  if (Object.keys(stats.by_source).length > 0) {
    console.log('  By source:');
    for (const [src, count] of Object.entries(stats.by_source)) {
      console.log(`    ${src.padEnd(12)} ${count}`);
    }
  }
  console.log('='.repeat(40));
} else if (command === 'clear') {
  const source = args[1] || null;
  const count = cacheClear(source);
  if (source) {
    console.log(`\u2705 Cleared ${count} ${source} cache entries`);
  } else {
    console.log(`\u2705 Cleared ${count} total cache entries`);
  }
} else if (command === 'get') {
  const key = args[1];
  if (!key) {
    console.error('\u274C Usage: node visa-cache.mjs get <key>');
    process.exit(1);
  }
  const payload = cacheGet(key);
  if (payload === null) {
    console.log('(not found or expired)');
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
} else {
  console.error(`\u274C Unknown command: ${command}`);
  console.error('Run "node visa-cache.mjs" for usage');
  process.exit(1);
}
