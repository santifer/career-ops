#!/usr/bin/env node

/**
 * test-visa-cache.mjs -- Tests for visa-cache.mjs cache utilities
 *
 * Usage:
 *   node test-visa-cache.mjs
 *
 * Tests cache set/get roundtrip, TTL expiry, negative caching,
 * key generation, source-scoped clearing, and stats.
 * Uses a temp directory to avoid touching real cache data.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Inline cache functions (project convention: no shared imports) ----
// These are duplicated from visa-cache.mjs so tests use the same logic.

const DEFAULT_TTL = { uscis: 90, everify: 7, salary: 30 };
let CACHE_DIR; // Set per-test to temp directory

function cacheKey(source, identifier) {
  const hash = createHash('md5').update(identifier.toLowerCase()).digest('hex').slice(0, 6);
  const sanitized = identifier.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
  return `${source}-${sanitized}-${hash}`;
}

function cacheGet(key) {
  const filepath = join(CACHE_DIR, key + '.json');
  if (!existsSync(filepath)) return null;
  let entry;
  try {
    entry = JSON.parse(readFileSync(filepath, 'utf-8'));
  } catch {
    return null;
  }
  if (!entry || !entry.key || !entry.source || !entry.expires || !('payload' in entry)) return null;
  if (new Date(entry.expires) < new Date()) {
    try { unlinkSync(filepath); } catch { /* ignore */ }
    return null;
  }
  return entry.payload;
}

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

function cacheClear(sourcePrefix) {
  if (!existsSync(CACHE_DIR)) return 0;
  const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  let count = 0;
  for (const f of files) {
    if (!sourcePrefix || f.startsWith(sourcePrefix + '-')) {
      unlinkSync(join(CACHE_DIR, f));
      count++;
    }
  }
  return count;
}

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

// ---- Test Runner ----

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push(`  \u2705 ${name}`);
  } catch (e) {
    failed++;
    results.push(`  \u274C ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg || 'Not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---- Setup temp directory ----

const TEST_DIR = join(tmpdir(), `visa-cache-test-${Date.now()}`);

function setup() {
  CACHE_DIR = TEST_DIR;
  mkdirSync(CACHE_DIR, { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ---- Tests ----

setup();

test('Test 1: cacheSet + cacheGet roundtrip returns original payload', () => {
  const key = cacheKey('uscis', 'TestCompany');
  const payload = { found: true, petitions: 42, employer: 'TestCompany' };
  cacheSet(key, 'uscis', payload);
  const result = cacheGet(key);
  assertEqual(result, payload, 'Roundtrip payload mismatch');
});

test('Test 2: cacheGet on expired entry returns null', () => {
  const key = cacheKey('uscis', 'ExpiredCo');
  // Write entry with expires in the past
  mkdirSync(CACHE_DIR, { recursive: true });
  const entry = {
    key,
    source: 'uscis',
    created: new Date(Date.now() - 200 * 86400000).toISOString(),
    ttl_days: 90,
    expires: new Date(Date.now() - 100 * 86400000).toISOString(),
    payload: { found: true }
  };
  writeFileSync(join(CACHE_DIR, key + '.json'), JSON.stringify(entry, null, 2), 'utf-8');
  const result = cacheGet(key);
  assert(result === null, 'Expired entry should return null');
  assert(!existsSync(join(CACHE_DIR, key + '.json')), 'Expired file should be deleted');
});

test('Test 3: cacheGet on non-existent key returns null', () => {
  const result = cacheGet('nonexistent-key-abc123');
  assert(result === null, 'Non-existent key should return null');
});

test('Test 4: cacheKey produces correct pattern', () => {
  const key = cacheKey('uscis', 'Google');
  assert(/^uscis-google-[a-f0-9]{6}$/.test(key), `Key "${key}" does not match pattern /^uscis-google-[a-f0-9]{6}$/`);
});

test('Test 5: cacheKey is case-insensitive', () => {
  const key1 = cacheKey('uscis', 'Google');
  const key2 = cacheKey('uscis', 'google');
  assertEqual(key1, key2, 'Keys should be identical regardless of case');
});

test('Test 6: cacheSet with negative result is retrievable', () => {
  const key = cacheKey('uscis', 'UnknownStartup');
  const payload = { found: false };
  cacheSet(key, 'uscis', payload);
  const result = cacheGet(key);
  assertEqual(result, payload, 'Negative result should be retrievable');
});

test('Test 7: cacheClear removes only source-prefixed files', () => {
  // Create entries for two sources
  const uscisKey = cacheKey('uscis', 'ClearTestA');
  const everifyKey = cacheKey('everify', 'ClearTestB');
  cacheSet(uscisKey, 'uscis', { found: true });
  cacheSet(everifyKey, 'everify', { found: true });
  // Clear only uscis
  const deleted = cacheClear('uscis');
  assert(deleted >= 1, 'Should have deleted at least 1 uscis file');
  // everify entry should still exist
  const remaining = cacheGet(everifyKey);
  assertEqual(remaining, { found: true }, 'everify entry should survive uscis clear');
});

test('Test 8: cacheStats returns correct structure', () => {
  // Clear everything first
  cacheClear();
  // Add fresh entries
  cacheSet(cacheKey('uscis', 'StatsA'), 'uscis', { found: true });
  cacheSet(cacheKey('uscis', 'StatsB'), 'uscis', { found: true });
  cacheSet(cacheKey('everify', 'StatsC'), 'everify', { found: true });
  // Add an expired entry manually
  const expiredKey = cacheKey('salary', 'StatsD');
  const entry = {
    key: expiredKey,
    source: 'salary',
    created: new Date(Date.now() - 100 * 86400000).toISOString(),
    ttl_days: 30,
    expires: new Date(Date.now() - 50 * 86400000).toISOString(),
    payload: { found: true }
  };
  writeFileSync(join(CACHE_DIR, expiredKey + '.json'), JSON.stringify(entry, null, 2), 'utf-8');

  const stats = cacheStats();
  assert(stats.total === 4, `Expected 4 total, got ${stats.total}`);
  assert(stats.by_source.uscis === 2, `Expected 2 uscis, got ${stats.by_source.uscis}`);
  assert(stats.by_source.everify === 1, `Expected 1 everify, got ${stats.by_source.everify}`);
  assert(stats.by_source.salary === 1, `Expected 1 salary, got ${stats.by_source.salary}`);
  assert(stats.expired === 1, `Expected 1 expired, got ${stats.expired}`);
});

cleanup();

// ---- Report ----

console.log('\n\uD83E\uDDEA visa-cache tests');
console.log('='.repeat(50));
results.forEach(r => console.log(r));
console.log('='.repeat(50));
console.log(`\n${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
