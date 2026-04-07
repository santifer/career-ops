import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './valyu.mjs';

const SAVED_KEY = process.env.VALYU_API_KEY;

afterEach(() => {
  if (SAVED_KEY === undefined) {
    delete process.env.VALYU_API_KEY;
  } else {
    process.env.VALYU_API_KEY = SAVED_KEY;
  }
  globalThis.fetch = undefined;
});

// ─── isAvailable ────────────────────────────────────────────────────────────

describe('isAvailable', () => {
  it('returns true when VALYU_API_KEY is set', () => {
    process.env.VALYU_API_KEY = 'test-key';
    assert.equal(isAvailable(), true);
  });

  it('returns false when VALYU_API_KEY is not set', () => {
    delete process.env.VALYU_API_KEY;
    assert.equal(isAvailable(), false);
  });
});

// ─── estimateCost ───────────────────────────────────────────────────────────

describe('estimateCost', () => {
  it('returns $0.02 for deepsearch', () => assert.equal(estimateCost('deepsearch'), 0.02));
  it('returns $0 for unknown', () => assert.equal(estimateCost('unknown'), 0));
});

// ─── execute: throws without API key ────────────────────────────────────────

describe('execute without API key', () => {
  it('throws if VALYU_API_KEY is missing', async () => {
    delete process.env.VALYU_API_KEY;
    await assert.rejects(
      () => execute({ query: 'AI trends' }),
      /VALYU_API_KEY/,
    );
  });
});

// ─── execute: deepsearch ─────────────────────────────────────────────────────

describe('execute deepsearch', () => {
  beforeEach(() => { process.env.VALYU_API_KEY = 'test-key'; });

  it('calls /deepsearch with correct payload and normalizes results', async () => {
    const mockData = {
      results: [
        {
          title: 'AI Trends 2026',
          url: 'https://example.com/ai-trends',
          content: 'AI is transforming industries...',
          source: 'web',
          relevance_score: 0.95,
        },
        {
          title: 'ML Market Analysis',
          url: 'https://example.com/ml-market',
          text: 'Machine learning market is growing...',
          source: 'academic',
          relevance_score: 0.88,
        },
      ],
    };
    globalThis.fetch = async (url, opts) => {
      assert.ok(url.includes('/deepsearch'), `expected /deepsearch endpoint, got ${url}`);
      const body = JSON.parse(opts.body);
      assert.equal(body.query, 'AI trends 2026');
      assert.equal(body.search_type, 'all');
      assert.equal(body.max_num_results, 10);
      return { ok: true, json: async () => mockData };
    };

    const results = await execute({ query: 'AI trends 2026' });
    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'AI Trends 2026');
    assert.equal(results[0].url, 'https://example.com/ai-trends');
    assert.equal(results[0].snippet, 'AI is transforming industries...');
    assert.equal(results[0].metadata.dataSource, 'web');
    assert.equal(results[0].metadata.relevanceScore, 0.95);
    assert.equal(results[0].source, 'valyu');
    // second result uses text fallback
    assert.equal(results[1].snippet, 'Machine learning market is growing...');
    assert.equal(results[1].metadata.dataSource, 'academic');
  });

  it('returns [] on fetch error', async () => {
    globalThis.fetch = async () => { throw new Error('network error'); };
    const results = await execute({ query: 'AI trends' });
    assert.deepEqual(results, []);
  });

  it('returns [] on non-ok response', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    const results = await execute({ query: 'AI trends' });
    assert.deepEqual(results, []);
  });

  it('handles empty results array', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const results = await execute({ query: 'AI trends' });
    assert.deepEqual(results, []);
  });
});
