/**
 * tests/unit/wealth-lens.test.mjs
 *
 * Unit tests for lib/wealth-lens.mjs.
 * All LLM calls are injected via opts.llmClient so no budget is spent.
 *
 * Run: node --test tests/unit/wealth-lens.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyWealthLens, renderWealthLensCard, getWealthCeiling } from '../../lib/wealth-lens.mjs';

// ── Mock LLM client (returns plausible JSON, no real API calls) ─────────────
function makeMockClient(overrides = {}) {
  return {
    call: async () => JSON.stringify({
      enriched_why: 'Strong pre-IPO trajectory with institutional backing.',
      ceiling_low: 800_000,
      ceiling_high: 1_400_000,
      negotiation_lever: 'Push for 1.5× standard grant at Series D valuation.',
      p50_peer: 270_000,
      p90_peer: 380_000,
      ceiling_under_assumptions: 1_200_000,
      extra_assumption: 'Assumes 3× valuation growth to IPO.',
      ...overrides,
    }),
  };
}

// ── applyWealthLens — deterministic (live: false) ────────────────────────────

describe('applyWealthLens — deterministic mode', () => {
  test('wealth-aligned: TC in target range, pre-IPO AI-native', async () => {
    const result = await applyWealthLens(
      { base: 260_000, bonus_pct: 15, equity_annual_vest: 80_000 },
      { company: 'Anthropic', ai_native: true, pre_ipo: true },
    );
    assert.equal(result.signal, 'wealth-aligned');
    assert.ok(result.displayed.includes('$'), 'displayed should include dollar sign');
    assert.ok(result.ceiling_estimate != null, 'ceiling_estimate should be set');
    assert.ok(result.ceiling_estimate > 300_000, 'pre-IPO ceiling should be >300K');
  });

  test('wealth-misaligned: base below absolute walk-line $175K', async () => {
    const result = await applyWealthLens(
      { base: 150_000 },
      { company: 'SomeStartup' },
    );
    assert.equal(result.signal, 'wealth-misaligned');
    assert.ok(result.why.includes('175,000') || result.why.includes('walk-line'), 'why should mention walk-line');
  });

  test('wealth-mixed: equity undisclosed at pre-IPO AI-native company', async () => {
    const result = await applyWealthLens(
      { base: 220_000, equity_disclosed: false },
      { company: 'ElevenLabs', ai_native: true, pre_ipo: true },
    );
    assert.equal(result.signal, 'wealth-mixed');
    assert.ok(result.why.toLowerCase().includes('undisclosed'), 'why should mention undisclosed');
  });

  test('wealth-misaligned: TC below $250K target, no pre-IPO upside', async () => {
    const result = await applyWealthLens(
      { base: 190_000, equity_annual_vest: 20_000 },
      { company: 'MaturePublicCorp', ai_native: false, pre_ipo: false },
    );
    assert.equal(result.signal, 'wealth-misaligned');
  });

  test('displayed string always contains company-readable comp summary', async () => {
    const result = await applyWealthLens(
      { base: 300_000, bonus_pct: 10, equity_annual_vest: 100_000 },
      { company: 'OpenAI', ai_native: true, pre_ipo: true },
    );
    assert.ok(typeof result.displayed === 'string');
    assert.ok(result.displayed.length > 5);
  });
});

// ── applyWealthLens — live mode with mock LLM client ────────────────────────

describe('applyWealthLens — live mode (mock LLM)', () => {
  test('returns enriched why and ceiling range from LLM response', async () => {
    const result = await applyWealthLens(
      { base: 260_000, equity_disclosed: false },
      { company: 'ElevenLabs', ai_native: true, pre_ipo: true },
      { live: true, llmClient: makeMockClient() },
    );
    assert.ok(result.why.includes('trajectory') || result.why.length > 10, 'enriched why should have content');
    assert.ok(result.ceiling_estimate >= 800_000, 'ceiling from mock should be >=800K');
  });

  test('falls back gracefully when LLM returns invalid JSON', async () => {
    const badClient = { call: async () => 'NOT JSON AT ALL' };
    const result = await applyWealthLens(
      { base: 260_000 },
      { company: 'TestCo', pre_ipo: true },
      { live: true, llmClient: badClient },
    );
    // Should not throw; should return deterministic result
    assert.ok(['wealth-aligned', 'wealth-mixed', 'wealth-misaligned'].includes(result.signal));
  });

  test('falls back gracefully when LLM throws', async () => {
    const throwingClient = { call: async () => { throw new Error('network error'); } };
    const result = await applyWealthLens(
      { base: 260_000 },
      { company: 'TestCo', pre_ipo: true },
      { live: true, llmClient: throwingClient },
    );
    assert.ok(result.signal, 'should still have a signal after LLM error');
  });

  test('caches result: second call returns _fromCache: true', async () => {
    const comp = { base: 280_000, equity_annual_vest: 90_000, equity_disclosed: true };
    const role = { company: 'CacheTestCo', ai_native: true, pre_ipo: true };
    const client = makeMockClient();
    await applyWealthLens(comp, role, { live: true, llmClient: client });
    const second = await applyWealthLens(comp, role, { live: true, llmClient: client });
    assert.equal(second._fromCache, true, 'second call should hit cache');
  });
});

// ── renderWealthLensCard ─────────────────────────────────────────────────────

describe('renderWealthLensCard', () => {
  test('returns HTML string with correct signal color for wealth-aligned', () => {
    const result = { displayed: '$350K TC · Wealth-Aligned', signal: 'wealth-aligned', why: 'Good fit', ceiling_estimate: 1_000_000, negotiation_lever: 'Push for 0.5% grant.' };
    const html = renderWealthLensCard(result);
    assert.ok(typeof html === 'string');
    assert.ok(html.includes('#22c55e'), 'aligned should use green');
    assert.ok(html.includes('Good fit'));
    assert.ok(html.includes('Push for 0.5% grant.'));
  });

  test('returns HTML string with red for wealth-misaligned', () => {
    const result = { displayed: '$140K · Wealth-Misaligned', signal: 'wealth-misaligned', why: 'Below floor' };
    const html = renderWealthLensCard(result);
    assert.ok(html.includes('#ef4444'), 'misaligned should use red');
  });

  test('shows ceiling range when both ceiling_low and ceiling_high provided', () => {
    const result = { displayed: 'test', signal: 'wealth-mixed', why: 'x', ceiling_range: [600_000, 1_200_000] };
    const html = renderWealthLensCard(result);
    assert.ok(html.includes('600,000') || html.includes('$600'));
    assert.ok(html.includes('1,200,000') || html.includes('$1,2'));
  });

  test('handles missing ceiling_estimate gracefully', () => {
    const result = { displayed: 'test', signal: 'wealth-mixed', why: 'no ceiling' };
    const html = renderWealthLensCard(result);
    assert.ok(html.includes('Unknown'), 'should show Unknown when no ceiling');
  });
});

// ── getWealthCeiling ─────────────────────────────────────────────────────────

describe('getWealthCeiling', () => {
  test('returns ceiling structure with required fields (deterministic)', async () => {
    const result = await getWealthCeiling(
      { title: 'AI Program Manager', company: 'Anthropic', pre_ipo: true, ai_native: true, base: 270_000, equity_annual_vest: 90_000 },
    );
    assert.ok(typeof result.current === 'number', 'current should be number');
    assert.ok(typeof result.ceiling_under_assumptions === 'number', 'ceiling should be number');
    assert.ok(Array.isArray(result.assumptions), 'assumptions should be array');
    assert.ok(result.assumptions.length >= 4, 'should have >=4 assumptions');
  });

  test('pre-IPO ceiling is higher than public ceiling for same base', async () => {
    const preIpo = await getWealthCeiling({ title: 'AI SA', company: 'Startup', pre_ipo: true, base: 260_000 });
    const pub    = await getWealthCeiling({ title: 'AI SA', company: 'BigCo', pre_ipo: false, base: 260_000 });
    assert.ok(preIpo.ceiling_under_assumptions > pub.ceiling_under_assumptions,
      'pre-IPO ceiling should exceed public ceiling for same base');
  });

  test('live mode with mock LLM enriches ceiling and peer benchmarks', async () => {
    const result = await getWealthCeiling(
      { title: 'AI PM', company: 'ElevenLabs', pre_ipo: true, base: 255_000 },
      { live: true, llmClient: makeMockClient() },
    );
    assert.ok(result.p50_peer >= 200_000, 'p50_peer should be set from mock');
    assert.ok(result.p90_peer >= 300_000, 'p90_peer should be set from mock');
    assert.ok(result.ceiling_under_assumptions >= 500_000, 'ceiling should be substantial from mock');
  });

  test('zero base input handled gracefully', async () => {
    const result = await getWealthCeiling({ title: 'Unknown', base: 0 });
    assert.ok(result.current === 0, 'current should be 0');
    assert.ok(result.ceiling_under_assumptions > 0, 'ceiling stub should fill in a positive number');
  });
});
