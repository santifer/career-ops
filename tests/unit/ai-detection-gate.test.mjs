/**
 * tests/unit/ai-detection-gate.test.mjs — Unit tests for lib/ai-detection-gate.mjs
 *
 * Uses Node.js built-in test runner (node:test + node:assert).
 * All external fetch calls are mocked — no real API calls.
 *
 * Run: node --test tests/unit/ai-detection-gate.test.mjs
 */

import { test, mock, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(ROOT, 'data', 'ai-detection-cache');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockFetch({ gptzeroProb = 0.95, originalityProb = 0.97, failGptzero = false, failOriginality = false } = {}) {
  return async function mockFetch(url, opts) {
    if (url.includes('gptzero')) {
      if (failGptzero) {
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
          json: async () => ({}),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          documents: [{
            average_generated_prob: gptzeroProb,
            completely_generated_prob: gptzeroProb,
            burstiness_score: 0.5,
          }],
        }),
      };
    }
    if (url.includes('originality')) {
      if (failOriginality) {
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
          json: async () => ({}),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          score: {
            ai: originalityProb,
            original: 1 - originalityProb,
          },
          credits_used: 1,
        }),
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Test 1: both detectors return high probability → passes = false, verdict = AI
test('checkText: both detectors high prob → passes false, verdict AI', async (t) => {
  const { checkText } = await import('../../lib/ai-detection-gate.mjs');

  process.env.GPTZERO_API_KEY = 'test-key-gz';
  process.env.ORIGINALITY_API_KEY = 'test-key-orig';

  const mockFetch = makeMockFetch({ gptzeroProb: 0.97, originalityProb: 0.98 });
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    const result = await checkText('This is a test paragraph with some content.', { skipCache: true, budgetUsd: 0.10 });
    assert.strictEqual(result.passes, false, 'passes should be false when both probs > 0.5');
    assert.strictEqual(result.verdict, 'AI', `verdict should be AI, got ${result.verdict}`);
    assert.ok(result.gptzero_prob > 0.5, `gptzero_prob ${result.gptzero_prob} should be > 0.5`);
    assert.ok(result.originality_prob > 0.5, `originality_prob ${result.originality_prob} should be > 0.5`);
  } finally {
    globalThis.fetch = original;
  }
});

// Test 2: both detectors return low probability → passes = true, verdict = HUMAN
test('checkText: both detectors low prob → passes true, verdict HUMAN', async (t) => {
  const { checkText } = await import('../../lib/ai-detection-gate.mjs');

  process.env.GPTZERO_API_KEY = 'test-key-gz';
  process.env.ORIGINALITY_API_KEY = 'test-key-orig';

  const mockFetch = makeMockFetch({ gptzeroProb: 0.15, originalityProb: 0.20 });
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    const result = await checkText('This is a human-sounding text.', { skipCache: true, budgetUsd: 0.10 });
    assert.strictEqual(result.passes, true, 'passes should be true when both probs < 0.5');
    assert.strictEqual(result.verdict, 'HUMAN', `verdict should be HUMAN, got ${result.verdict}`);
  } finally {
    globalThis.fetch = original;
  }
});

// Test 3: missing API keys → passes = null, verdict = UNCHECKED
test('checkText: missing API keys → passes null, verdict UNCHECKED', async (t) => {
  // Dynamically re-import with cleared keys
  delete process.env.GPTZERO_API_KEY;
  delete process.env.ORIGINALITY_API_KEY;

  // Use a fresh import to test key-missing path
  const { checkText } = await import('../../lib/ai-detection-gate.mjs');

  const result = await checkText('Some text to check.', { skipCache: true, budgetUsd: 0.10 });
  assert.strictEqual(result.passes, null, 'passes should be null when both keys missing');
  assert.strictEqual(result.verdict, 'UNCHECKED', `verdict should be UNCHECKED, got ${result.verdict}`);
  assert.strictEqual(result.gptzero_skipped, true);
  assert.strictEqual(result.originality_skipped, true);
});

// Test 4: budget guard throws when cost exceeds cap
test('checkText: budget guard throws when cost exceeds cap', async (t) => {
  const { checkText } = await import('../../lib/ai-detection-gate.mjs');

  process.env.GPTZERO_API_KEY = 'test-key-gz';
  process.env.ORIGINALITY_API_KEY = 'test-key-orig';

  await assert.rejects(
    () => checkText('Some text.', { skipCache: true, budgetUsd: 0.001 }),
    /per-call budget/,
    'should throw when estimated cost exceeds budgetUsd'
  );
});

// Test 5: one detector fails (API error) → other detector's result drives passes
test('checkText: one detector API error → other drives passes', async (t) => {
  const { checkText } = await import('../../lib/ai-detection-gate.mjs');

  process.env.GPTZERO_API_KEY = 'test-key-gz';
  process.env.ORIGINALITY_API_KEY = 'test-key-orig';

  // GPTZero fails, Originality returns high prob
  const mockFetch = makeMockFetch({ failGptzero: true, originalityProb: 0.95 });
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    const result = await checkText('Test text for error resilience.', { skipCache: true, budgetUsd: 0.10 });
    // GPTZero errored → gptzero_prob = null → treated as passing (null → gzOk = true)
    // Originality prob = 0.95 → origOk = false → passes = false
    assert.strictEqual(result.passes, false, 'passes should be false when Originality says AI');
    assert.strictEqual(result.gptzero_prob, null, 'gptzero_prob should be null on error');
    assert.ok(result.gptzero_error !== null, 'gptzero_error should be populated');
  } finally {
    globalThis.fetch = original;
  }
});

// Test 6: extractProseText strips frontmatter and metadata correctly
test('extractProseText: strips frontmatter, code blocks, and metadata', async (t) => {
  const { extractProseText } = await import('../../lib/ai-detection-gate.mjs');

  const raw = [
    '---',
    'title: My Cover Letter',
    '---',
    '',
    '# Cover Letter — ElevenLabs — Communications Manager',
    '',
    '> DO NOT SUBMIT banner here',
    '',
    'This is a real paragraph with actual content. It should survive extraction.',
    '',
    '```json',
    '{"key": "value"}',
    '```',
    '',
    '<!-- meta:version:1.0.0 -->',
    '',
    'Another paragraph here with substantive content.',
  ].join('\n');

  const prose = extractProseText(raw);

  // Frontmatter should be stripped
  assert.ok(!prose.includes('title: My Cover Letter'), 'frontmatter should be stripped');
  // Headers should be stripped
  assert.ok(!prose.includes('# Cover Letter'), 'headers should be stripped');
  // Blockquotes should be stripped
  assert.ok(!prose.includes('DO NOT SUBMIT banner'), 'blockquotes should be stripped');
  // JSON code block should be stripped
  assert.ok(!prose.includes('"key": "value"'), 'code blocks should be stripped');
  // HTML comments should be stripped
  assert.ok(!prose.includes('meta:version'), 'HTML comments should be stripped');
  // Real prose should survive
  assert.ok(prose.includes('This is a real paragraph'), 'real prose should survive');
  assert.ok(prose.includes('Another paragraph here'), 'second paragraph should survive');
});

// Test 7: buildDoNotSubmitBanner format check
test('buildDoNotSubmitBanner: builds correct markdown banner', async (t) => {
  const { buildDoNotSubmitBanner } = await import('../../lib/ai-detection-gate.mjs');

  const result = {
    gptzero_prob: 0.97,
    originality_prob: 0.98,
    checked_at: '2026-05-18T00:00:00.000Z',
  };

  const banner = buildDoNotSubmitBanner(result, 'abc1234');

  assert.ok(banner.includes('DO NOT SUBMIT'), 'banner should contain DO NOT SUBMIT');
  assert.ok(banner.includes('97%'), 'banner should contain GPTZero prob');
  assert.ok(banner.includes('98%'), 'banner should contain Originality prob');
  assert.ok(banner.includes('abc1234'), 'banner should contain commit SHA');
  // Banner should end with --- separator
  assert.ok(banner.includes('---'), 'banner should include --- separator');
});

// Test 8: cache round-trip — result is served from cache on second call
test('checkText: cache hit returns from_cache = true', async (t) => {
  const { checkText } = await import('../../lib/ai-detection-gate.mjs');

  process.env.GPTZERO_API_KEY = 'test-key-gz';
  process.env.ORIGINALITY_API_KEY = 'test-key-orig';

  const mockFetch = makeMockFetch({ gptzeroProb: 0.30, originalityProb: 0.25 });
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const uniqueText = `Cache test text ${Date.now()} random content here for uniqueness.`;

  try {
    // First call: cache miss
    const first = await checkText(uniqueText, { skipCache: false, budgetUsd: 0.10 });
    assert.strictEqual(first.from_cache, false, 'first call should be a cache miss');

    // Second call: cache hit (no fetch needed)
    let fetchCount = 0;
    globalThis.fetch = async (...args) => {
      fetchCount++;
      return mockFetch(...args);
    };
    const second = await checkText(uniqueText, { skipCache: false, budgetUsd: 0.10 });
    assert.strictEqual(second.from_cache, true, 'second call should be a cache hit');
    assert.strictEqual(fetchCount, 0, 'no fetch should occur on cache hit');
  } finally {
    globalThis.fetch = original;
  }
});
