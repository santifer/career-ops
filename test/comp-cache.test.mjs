/**
 * test/comp-cache.test.mjs — Unit tests for comp-cache.mjs
 *
 * Uses an in-memory approach: tests the exported pure functions directly
 * without touching the real data/comp-cache.yml file.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildKey, isExpired, parseCache, serializeCache } from '../comp-cache.mjs';

// ---------------------------------------------------------------------------
// buildKey
// ---------------------------------------------------------------------------
describe('buildKey', () => {
  test('normalizes role to lowercase with hyphens', () => {
    const key = buildKey('Senior AI Engineer', 'series-b', 'remote');
    assert.ok(key.startsWith('senior-ai-engineer-'), `Key: ${key}`);
  });

  test('normalizes stage', () => {
    const key = buildKey('ml-engineer', 'Series B', 'remote');
    assert.ok(key.includes('series-b'), `Key: ${key}`);
  });

  test('normalizes location', () => {
    const key = buildKey('ml-engineer', 'series-b', 'Toronto, ON');
    assert.ok(key.includes('toronto--on') || key.includes('toronto-on'), `Key: ${key}`);
  });

  test('includes year and quarter', () => {
    const key = buildKey('engineer', 'seed', 'remote');
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    assert.ok(key.includes(`${year}-Q${quarter}`), `Key ${key} should contain ${year}-Q${quarter}`);
  });

  test('same inputs produce same key', () => {
    const key1 = buildKey('Senior AI Engineer', 'series-b', 'remote');
    const key2 = buildKey('Senior AI Engineer', 'series-b', 'remote');
    assert.equal(key1, key2);
  });

  test('strips leading/trailing hyphens from segments', () => {
    const key = buildKey('  AI Engineer  ', 'series-b', 'remote');
    assert.ok(!key.startsWith('-'));
  });
});

// ---------------------------------------------------------------------------
// isExpired
// ---------------------------------------------------------------------------
describe('isExpired', () => {
  test('returns true for entry with no fetched date', () => {
    assert.ok(isExpired({}));
    assert.ok(isExpired({ fetched: '' }));
  });

  test('returns true for entry with invalid date', () => {
    assert.ok(isExpired({ fetched: 'not-a-date', ttl_days: 60 }));
  });

  test('returns false for entry fetched today', () => {
    const today = new Date().toISOString().split('T')[0];
    assert.ok(!isExpired({ fetched: today, ttl_days: 60 }));
  });

  test('returns false for entry fetched 30 days ago with 60-day TTL', () => {
    const past = new Date();
    past.setDate(past.getDate() - 30);
    const entry = { fetched: past.toISOString().split('T')[0], ttl_days: 60 };
    assert.ok(!isExpired(entry));
  });

  test('returns true for entry fetched 61 days ago with 60-day TTL', () => {
    const past = new Date();
    past.setDate(past.getDate() - 61);
    const entry = { fetched: past.toISOString().split('T')[0], ttl_days: 60 };
    assert.ok(isExpired(entry));
  });

  test('respects custom ttl_days', () => {
    const past = new Date();
    past.setDate(past.getDate() - 6);
    // 6 days old with 5-day TTL → expired
    const expired = { fetched: past.toISOString().split('T')[0], ttl_days: 5 };
    assert.ok(isExpired(expired));
    // 6 days old with 10-day TTL → fresh
    const fresh = { fetched: past.toISOString().split('T')[0], ttl_days: 10 };
    assert.ok(!isExpired(fresh));
  });

  test('defaults to 60-day TTL when ttl_days missing', () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 30);
    // 30 days old, no ttl_days → use 60-day default → not expired
    const entry = { fetched: recent.toISOString().split('T')[0] };
    assert.ok(!isExpired(entry));
  });
});

// ---------------------------------------------------------------------------
// parseCache + serializeCache — round-trip
// ---------------------------------------------------------------------------
describe('parseCache', () => {
  test('parses empty string to empty entries', () => {
    const result = parseCache('');
    assert.deepEqual(result, { entries: {} });
  });

  test('parses null/undefined gracefully', () => {
    const result = parseCache(null);
    assert.deepEqual(result, { entries: {} });
  });

  test('parses a single entry', () => {
    const yaml = `entries:
  senior-ml-engineer-series-b-remote-2026-Q1:
    p25: 180000
    p50: 210000
    p75: 260000
    currency: USD
    sources: glassdoor,levels.fyi
    fetched: "2026-03-15"
    ttl_days: 60
`;
    const result = parseCache(yaml);
    assert.ok(result.entries['senior-ml-engineer-series-b-remote-2026-Q1']);
    const entry = result.entries['senior-ml-engineer-series-b-remote-2026-Q1'];
    assert.equal(entry.p25, 180000);
    assert.equal(entry.p50, 210000);
    assert.equal(entry.p75, 260000);
    assert.equal(entry.currency, 'USD');
    assert.equal(entry.sources, 'glassdoor,levels.fyi');
    assert.equal(entry.fetched, '2026-03-15');
    assert.equal(entry.ttl_days, 60);
  });

  test('parses multiple entries', () => {
    const yaml = `entries:
  key-one:
    p50: 150000
    fetched: "2026-01-01"
    ttl_days: 60
  key-two:
    p50: 200000
    fetched: "2026-02-01"
    ttl_days: 60
`;
    const result = parseCache(yaml);
    assert.ok(result.entries['key-one']);
    assert.ok(result.entries['key-two']);
    assert.equal(result.entries['key-one'].p50, 150000);
    assert.equal(result.entries['key-two'].p50, 200000);
  });

  test('ignores comment lines', () => {
    const yaml = `# This is a comment
entries:
  # another comment
  my-key:
    p50: 100000
    fetched: "2026-01-01"
    ttl_days: 60
`;
    const result = parseCache(yaml);
    assert.ok(result.entries['my-key']);
    assert.equal(result.entries['my-key'].p50, 100000);
  });
});

describe('serializeCache', () => {
  test('serializes an empty cache', () => {
    const yaml = serializeCache({ entries: {} });
    assert.ok(yaml.startsWith('entries:'));
  });

  test('round-trips correctly', () => {
    const original = {
      entries: {
        'test-key-2026-Q2': {
          p25: 170000,
          p50: 200000,
          p75: 250000,
          currency: 'USD',
          sources: 'glassdoor',
          fetched: '2026-04-01',
          ttl_days: 60,
        },
      },
    };
    const yaml = serializeCache(original);
    const reparsed = parseCache(yaml);
    assert.equal(reparsed.entries['test-key-2026-Q2'].p50, 200000);
    assert.equal(reparsed.entries['test-key-2026-Q2'].currency, 'USD');
    assert.equal(reparsed.entries['test-key-2026-Q2'].fetched, '2026-04-01');
  });

  test('each entry appears as indented block', () => {
    const cache = {
      entries: {
        'role-stage-location-2026-Q1': {
          p50: 180000,
          fetched: '2026-01-15',
          ttl_days: 60,
        },
      },
    };
    const yaml = serializeCache(cache);
    assert.ok(yaml.includes('  role-stage-location-2026-Q1:'));
    assert.ok(yaml.includes('    p50: 180000'));
  });
});

// ---------------------------------------------------------------------------
// Integration: parseCache ↔ isExpired with fixture file
// ---------------------------------------------------------------------------
describe('integration: fixture file', () => {
  test('reads sample fixture and checks expiry correctly', async () => {
    const { readFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = dirname(fileURLToPath(import.meta.url));

    const raw = readFileSync(join(__dirname, 'fixtures/comp-cache-sample.yml'), 'utf-8');
    const cache = parseCache(raw);

    // Fresh entry (fetched recently)
    const freshKey = 'senior-ml-engineer-series-b-remote-2026-Q1';
    assert.ok(cache.entries[freshKey], 'fresh entry should exist');
    assert.ok(!isExpired(cache.entries[freshKey]), 'entry fetched 2026-03-15 should still be fresh (within 60 days of 2026-04-06)');

    // Expired entry (fetched 2025-12-01, >60 days ago)
    const expiredKey = 'staff-ai-engineer-public-toronto-2026-Q1';
    assert.ok(cache.entries[expiredKey], 'expired entry should exist in file');
    assert.ok(isExpired(cache.entries[expiredKey]), 'entry fetched 2025-12-01 should be expired by 2026-04-06');
  });
});
