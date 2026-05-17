/**
 * tests/unit/strategy-ceiling.test.mjs
 *
 * Unit tests for lib/strategy-ceiling.mjs.
 * All LLM calls use opts.llmClient mock — no real API calls.
 *
 * Run: node --test tests/unit/strategy-ceiling.test.mjs
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(ROOT, 'data', 'strategy-cache');

// Use a separate test cache dir to avoid polluting real data
const TEST_CACHE_SUFFIX = '-test-' + Date.now();

import {
  computeStrategyCeiling,
  getCachedStrategy,
  forceRefresh,
  renderStrategyCard,
  buildCacheKey,
} from '../../lib/strategy-ceiling.mjs';

// ── Mock LLM client factory ─────────────────────────────────────────────────

function makeMockClient(overrides = {}) {
  const validResponse = {
    current: 33,
    ceiling: 70,
    gap_pct: 37,
    actions: [
      { title: 'Strengthen narrative', what: 'Add a comms×AI case study to your cover letter.', why: 'Mirrors JD language directly.', effort: 'medium', expected_lift_pct: 12 },
      { title: 'Activate warm referral', what: 'Find a 2nd-degree LinkedIn connection at ElevenLabs.', why: 'Referrals improve interview rate 3-5×.', effort: 'high', expected_lift_pct: 15 },
      { title: 'Add shipping metric', what: 'Quantify a delivery velocity story in your cover letter.', why: 'ElevenLabs is a fast-shipping org; velocity signals match.', effort: 'low', expected_lift_pct: 8 },
    ],
    reasoning: 'Ceiling capped at 70% given no referral path currently and disclosure of budget is not ideal.',
    ...overrides,
  };
  return {
    call: async () => JSON.stringify(validResponse),
  };
}

function makeInvalidJsonClient() {
  return { call: async () => 'This is not JSON at all!' };
}

function makeInvalidSchemaClient() {
  return {
    call: async () => JSON.stringify({
      current: 33,
      ceiling: 70,
      // missing gap_pct and actions — schema invalid
    }),
  };
}

function makeThrowingClient() {
  return { call: async () => { throw new Error('network error'); } };
}

// ── computeStrategyCeiling — dry mode ───────────────────────────────────────

describe('computeStrategyCeiling — dry mode', () => {
  test('dry mode returns stub without LLM call', async () => {
    const result = await computeStrategyCeiling({
      rowId: 1,
      role: 'Communications Manager',
      company: 'ElevenLabs',
      metricKey: 'interview_likelihood',
      currentValue: 33,
      opts: { dry: true },
    });
    assert.equal(result._dry, true);
    assert.equal(result.current, 33);
    assert.ok(result.ceiling > 33, 'ceiling should exceed current');
    assert.ok(Array.isArray(result.actions));
    assert.ok(result.actions.length >= 3);
  });
});

// ── computeStrategyCeiling — mock LLM ───────────────────────────────────────

describe('computeStrategyCeiling — mock LLM client', () => {
  test('returns valid result from mock LLM response', async () => {
    const result = await computeStrategyCeiling({
      rowId: 50,
      role: 'Communications Manager',
      company: 'ElevenLabs',
      metricKey: 'interview_likelihood',
      currentValue: 33,
      jdText: 'We are looking for a communications lead who ships fast.',
      hmIntel: {},
      opts: { llmClient: makeMockClient(), maxAgeMs: 0 }, // maxAgeMs=0 bypasses cache
    });
    assert.equal(result.current, 33);
    assert.equal(result.ceiling, 70);
    assert.equal(result.gap_pct, 37);
    assert.ok(Array.isArray(result.actions));
    assert.ok(result.actions.length >= 3 && result.actions.length <= 5);
    assert.ok(result.cache_key, 'cache_key should be present');
  });

  test('actions have all required fields', async () => {
    const result = await computeStrategyCeiling({
      rowId: 51,
      role: 'AI Program Manager',
      company: 'Anthropic',
      metricKey: 'fit_score',
      currentValue: 55,
      opts: { llmClient: makeMockClient({ current: 55, ceiling: 85, gap_pct: 30 }), maxAgeMs: 0 },
    });
    for (const action of result.actions) {
      assert.ok(typeof action.title === 'string' && action.title.length > 0, 'title required');
      assert.ok(typeof action.what === 'string' && action.what.length > 0, 'what required');
      assert.ok(typeof action.why === 'string' && action.why.length > 0, 'why required');
      assert.ok(['low', 'medium', 'high'].includes(action.effort), `effort must be low|medium|high, got: ${action.effort}`);
      assert.ok(typeof action.expected_lift_pct === 'number', 'expected_lift_pct must be number');
    }
  });

  test('falls back to degraded result when LLM returns invalid JSON (2 attempts)', async () => {
    const result = await computeStrategyCeiling({
      rowId: 52,
      role: 'AI SA',
      company: 'xAI',
      metricKey: 'interview_likelihood',
      currentValue: 40,
      opts: { llmClient: makeInvalidJsonClient(), maxAgeMs: 0 },
    });
    assert.equal(result._degraded, true, 'should be degraded');
    assert.ok(Array.isArray(result.actions));
    assert.ok(result.actions.length >= 3);
  });

  test('falls back to degraded result when LLM schema is invalid', async () => {
    const result = await computeStrategyCeiling({
      rowId: 53,
      role: 'AI SA',
      company: 'Perplexity',
      metricKey: 'fit_score',
      currentValue: 45,
      opts: { llmClient: makeInvalidSchemaClient(), maxAgeMs: 0 },
    });
    assert.equal(result._degraded, true);
  });

  test('throws when LLM client itself throws', async () => {
    await assert.rejects(
      () => computeStrategyCeiling({
        rowId: 54,
        role: 'AI PM',
        company: 'Cohere',
        metricKey: 'fit_score',
        currentValue: 60,
        opts: { llmClient: makeThrowingClient(), maxAgeMs: 0 },
      }),
      /LLM call failed/,
    );
  });
});

// ── Cache behavior ────────────────────────────────────────────────────────────

describe('getCachedStrategy + forceRefresh', () => {
  test('returns null for a cache key that does not exist', () => {
    const result = getCachedStrategy('nonexistent-key-' + Date.now());
    assert.equal(result, null);
  });

  test('getCachedStrategy returns fresh result after computeStrategyCeiling', async () => {
    const input = {
      rowId: 99,
      role: 'CacheTestRole',
      company: 'CacheTestCo',
      metricKey: 'cache_hit_test',
      currentValue: 50,
      opts: { llmClient: makeMockClient({ current: 50, ceiling: 80, gap_pct: 30 }), maxAgeMs: 60_000 },
    };
    const first = await computeStrategyCeiling(input);
    const cacheKey = first.cache_key;
    const cached = getCachedStrategy(cacheKey, 60_000);
    assert.ok(cached !== null, 'should find the cached entry');
    assert.equal(cached.current, 50);
    assert.equal(cached.ceiling, 80);
  });

  test('forceRefresh expires a cache entry', async () => {
    const input = {
      rowId: 100,
      role: 'ForceRefreshRole',
      company: 'ForceRefreshCo',
      metricKey: 'refresh_test',
      currentValue: 42,
      opts: { llmClient: makeMockClient({ current: 42, ceiling: 72, gap_pct: 30 }), maxAgeMs: 3_600_000 },
    };
    const first = await computeStrategyCeiling(input);
    const cacheKey = first.cache_key;
    forceRefresh(cacheKey);
    const afterRefresh = getCachedStrategy(cacheKey, 3_600_000);
    assert.equal(afterRefresh, null, 'forceRefresh should expire the entry');
  });

  test('computeStrategyCeiling returns _fromCache: true on second call within TTL', async () => {
    const input = {
      rowId: 101,
      role: 'DoubleCacheRole',
      company: 'DoubleCacheCo',
      metricKey: 'double_cache_test',
      currentValue: 60,
      opts: { llmClient: makeMockClient({ current: 60, ceiling: 85, gap_pct: 25 }), maxAgeMs: 3_600_000 },
    };
    const first = await computeStrategyCeiling(input);
    const second = await computeStrategyCeiling(input);
    assert.equal(second._fromCache, true, 'second call should hit cache');
    assert.equal(second.ceiling, 85);
  });
});

// ── buildCacheKey ─────────────────────────────────────────────────────────────

describe('buildCacheKey', () => {
  test('returns a deterministic string', () => {
    const key1 = buildCacheKey({ rowId: 1, metricKey: 'fit_score', company: 'Anthropic', role: 'AI PM' });
    const key2 = buildCacheKey({ rowId: 1, metricKey: 'fit_score', company: 'Anthropic', role: 'AI PM' });
    assert.equal(key1, key2);
  });

  test('differs when company changes', () => {
    const k1 = buildCacheKey({ rowId: 1, metricKey: 'fit_score', company: 'Anthropic', role: 'AI PM' });
    const k2 = buildCacheKey({ rowId: 1, metricKey: 'fit_score', company: 'OpenAI', role: 'AI PM' });
    assert.notEqual(k1, k2);
  });

  test('differs when metricKey changes', () => {
    const k1 = buildCacheKey({ rowId: 1, metricKey: 'fit_score', company: 'Anthropic', role: 'AI PM' });
    const k2 = buildCacheKey({ rowId: 1, metricKey: 'interview_likelihood', company: 'Anthropic', role: 'AI PM' });
    assert.notEqual(k1, k2);
  });
});

// ── renderStrategyCard ────────────────────────────────────────────────────────

describe('renderStrategyCard', () => {
  test('returns an HTML string with action titles', () => {
    const result = {
      current: 33,
      ceiling: 70,
      gap_pct: 37,
      actions: [
        { title: 'Add referral', what: 'Get a warm intro.', why: 'Referrals work.', effort: 'high', expected_lift_pct: 15 },
        { title: 'Tailor cover letter', what: 'Mirror JD language.', why: 'ATS wins.', effort: 'medium', expected_lift_pct: 10 },
        { title: 'Quick win: GitHub link', what: 'Add career-ops link.', why: 'Shows builder cred.', effort: 'low', expected_lift_pct: 5 },
      ],
      reasoning: 'Ceiling constrained by lack of referral path.',
    };
    const html = renderStrategyCard(result);
    assert.ok(typeof html === 'string');
    assert.ok(html.includes('Add referral'), 'should include action title');
    assert.ok(html.includes('33%') || html.includes('>33<'), 'should show current value');
    assert.ok(html.includes('70%') || html.includes('>70<'), 'should show ceiling');
    assert.ok(html.includes('Ceiling constrained'), 'should include reasoning');
  });

  test('renders degraded warning when _degraded is true', () => {
    const result = {
      current: 40,
      ceiling: 60,
      gap_pct: 20,
      actions: [
        { title: 'Manual review', what: 'Check JD.', why: 'LLM unavailable.', effort: 'medium', expected_lift_pct: 5 },
        { title: 'Narrative update', what: 'Update cover letter.', why: 'Match JD framing.', effort: 'medium', expected_lift_pct: 8 },
        { title: 'Warm path', what: 'Find LinkedIn connection.', why: 'Referrals help.', effort: 'high', expected_lift_pct: 15 },
      ],
      _degraded: true,
    };
    const html = renderStrategyCard(result);
    assert.ok(html.includes('LLM unavailable') || html.includes('fallback'), 'should show degraded warning');
  });

  test('handles empty actions array gracefully', () => {
    const result = { current: 50, ceiling: 75, gap_pct: 25, actions: [] };
    const html = renderStrategyCard(result);
    assert.ok(typeof html === 'string');
    // Should not throw even with no actions
  });

  test('shows corpus_ref when present in action', () => {
    const result = {
      current: 50,
      ceiling: 80,
      gap_pct: 30,
      actions: [
        { title: 'Use STAR story', what: 'Tell the Comms Triage story.', why: 'Builder cred.', effort: 'low', expected_lift_pct: 10, corpus_ref: 'story-bank.md: Comms Triage Agent' },
        { title: 'Action 2', what: 'Do X.', why: 'Because Y.', effort: 'medium', expected_lift_pct: 8 },
        { title: 'Action 3', what: 'Do Z.', why: 'Because W.', effort: 'high', expected_lift_pct: 12 },
      ],
    };
    const html = renderStrategyCard(result);
    assert.ok(html.includes('story-bank.md'), 'should include corpus_ref');
  });
});
