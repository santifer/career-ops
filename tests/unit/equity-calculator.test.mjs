import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEquityValue,
  computeEquityForRole,
  renderEquitySlidersHtml,
  STAGE_DILUTION_DEFAULTS,
  TAX_PROFILES,
} from '../../lib/equity-calculator.mjs';

// ─── computeEquityValue ────────────────────────────────────────────────────────

test('computeEquityValue: basic case returns correct shape', () => {
  const result = computeEquityValue({
    shares: 100_000,
    strike_price: 1.00,
    current_409a_price: 5.00,
    target_exit_valuation: 5_000_000_000,
    current_valuation: 1_000_000_000,
    dilution_pct_per_round: 0.18,
    rounds_to_exit: 2,
    vest_schedule: 'standard-4yr',
    time_to_exit_years: 5,
    tax_jurisdiction: 'wa',
    elapsed_vest_months: 12,
  });

  assert.ok(typeof result.current_paper_value === 'number', 'current_paper_value is number');
  assert.ok(typeof result.exit_value_pre_tax === 'number', 'exit_value_pre_tax is number');
  assert.ok(typeof result.exit_value_post_tax === 'number', 'exit_value_post_tax is number');
  assert.ok(typeof result.irr_estimate === 'number', 'irr_estimate is number');
  assert.ok(result.scenarios && result.scenarios.p10 && result.scenarios.p50 && result.scenarios.p90, 'scenarios shape present');
  // P90 exit should be greater than P50 which should be greater than P10
  assert.ok(result.scenarios.p90.exit_value_post_tax > result.scenarios.p50.exit_value_post_tax, 'p90 > p50');
  assert.ok(result.scenarios.p50.exit_value_post_tax > result.scenarios.p10.exit_value_post_tax, 'p50 > p10');
});

test('computeEquityValue: current_paper_value equals intrinsic spread × shares', () => {
  const result = computeEquityValue({
    shares: 50_000,
    strike_price: 2.00,
    current_409a_price: 8.00,
    target_exit_valuation: 2_000_000_000,
    current_valuation: 500_000_000,
    tax_jurisdiction: 'wa',
  });
  // intrinsic: (8.00 - 2.00) * 50_000 = 300_000
  assert.equal(result.current_paper_value, 300_000);
});

test('computeEquityValue: WA has no state LTCG (tax_profile)', () => {
  const result = computeEquityValue({
    shares: 10_000,
    strike_price: 0,
    current_409a_price: 10,
    target_exit_valuation: 10_000_000_000,
    current_valuation: 1_000_000_000,
    tax_jurisdiction: 'wa',
  });
  assert.equal(result.tax_profile.state_ltcg, 0);
  assert.equal(result.tax_profile.federal_ltcg, 0.20);
});

test('computeEquityValue: CA has higher tax than WA', () => {
  const base = {
    shares: 10_000,
    strike_price: 0,
    current_409a_price: 10,
    target_exit_valuation: 10_000_000_000,
    current_valuation: 1_000_000_000,
  };
  const wa = computeEquityValue({ ...base, tax_jurisdiction: 'wa' });
  const ca = computeEquityValue({ ...base, tax_jurisdiction: 'ca' });
  assert.ok(ca.exit_value_post_tax < wa.exit_value_post_tax, 'CA tax > WA');
});

test('computeEquityValue: unvested shares show zero vested_value before cliff', () => {
  const result = computeEquityValue({
    shares: 100_000,
    strike_price: 0,
    current_409a_price: 5,
    target_exit_valuation: 5_000_000_000,
    current_valuation: 1_000_000_000,
    vest_schedule: 'standard-4yr',
    elapsed_vest_months: 6, // before 12-month cliff
  });
  assert.equal(result.fraction_vested, 0);
  assert.equal(result.vested_value, 0);
});

test('computeEquityValue: dilution_factor decreases with more rounds', () => {
  const base = {
    shares: 10_000,
    strike_price: 0,
    current_409a_price: 10,
    target_exit_valuation: 5_000_000_000,
    current_valuation: 1_000_000_000,
    dilution_pct_per_round: 0.18,
    tax_jurisdiction: 'wa',
  };
  const r2 = computeEquityValue({ ...base, rounds_to_exit: 2 });
  const r5 = computeEquityValue({ ...base, rounds_to_exit: 5 });
  assert.ok(r5.dilution_factor < r2.dilution_factor, 'more rounds = more dilution');
  assert.ok(r5.exit_value_pre_tax < r2.exit_value_pre_tax, 'more dilution = lower exit value');
});

test('computeEquityValue: throws on missing required params', () => {
  assert.throws(() => computeEquityValue({ shares: 0, current_409a_price: 5, target_exit_valuation: 1e9, current_valuation: 1e8 }), /shares must be/);
  assert.throws(() => computeEquityValue({ shares: 1000 }), /current_409a_price required/);
});

test('computeEquityValue: STAGE_DILUTION_DEFAULTS has expected keys', () => {
  assert.ok('series-c' in STAGE_DILUTION_DEFAULTS);
  assert.ok('seed' in STAGE_DILUTION_DEFAULTS);
  assert.ok('series-d' in STAGE_DILUTION_DEFAULTS);
  // Series C default should be in 15-25% range
  assert.ok(STAGE_DILUTION_DEFAULTS['series-c'] >= 0.12 && STAGE_DILUTION_DEFAULTS['series-c'] <= 0.25);
});

// ─── computeEquityForRole ─────────────────────────────────────────────────────

test('computeEquityForRole: returns equity + assumptions', () => {
  const { equity, assumptions } = computeEquityForRole('AI Program Manager', {
    equity_grant_shares: 80_000,
    strike_price: 0.50,
    current_409a: 4.00,
    current_valuation: 800_000_000,
    series: 'series-c',
  });
  assert.ok(equity && typeof equity.exit_value_post_tax === 'number');
  assert.equal(assumptions.floor_base, 175_000, 'floor_base is $175K per calibration brief');
  assert.equal(assumptions.target_tc_low, 250_000, 'target_tc_low is $250K');
  assert.equal(assumptions.target_tc_high, 320_000, 'target_tc_high is $320K');
  assert.equal(assumptions.series, 'series-c');
});

test('computeEquityForRole: opts override defaults', () => {
  const { equity } = computeEquityForRole('AI Solutions Architect', {
    equity_grant_shares: 50_000,
    strike_price: 1,
    current_409a: 6,
    current_valuation: 1_200_000_000,
    series: 'series-d',
  }, { dilution_pct_per_round: 0.05, rounds_to_exit: 1 });

  const { equity: equity2 } = computeEquityForRole('AI Solutions Architect', {
    equity_grant_shares: 50_000,
    strike_price: 1,
    current_409a: 6,
    current_valuation: 1_200_000_000,
    series: 'series-d',
  }, { dilution_pct_per_round: 0.25, rounds_to_exit: 4 });

  assert.ok(equity.exit_value_pre_tax > equity2.exit_value_pre_tax, 'lower dilution = higher value');
});

// ─── renderEquitySlidersHtml ──────────────────────────────────────────────────

test('renderEquitySlidersHtml: returns non-empty HTML string', () => {
  const html = renderEquitySlidersHtml('AI Program Manager', {
    equity_grant_shares: 100_000,
    strike_price: 0,
    current_409a: 5,
    current_valuation: 1_000_000_000,
    series: 'series-c',
  });
  assert.ok(typeof html === 'string' && html.length > 100);
  assert.ok(html.includes('equity-slider-widget'), 'has widget class');
  assert.ok(html.includes('AI Program Manager'), 'includes role name');
  assert.ok(html.includes('P10') && html.includes('P50') && html.includes('P90'), 'includes all scenarios');
});
