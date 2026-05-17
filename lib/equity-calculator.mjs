/**
 * lib/equity-calculator.mjs
 * Pre-IPO equity slider model — deterministic, no LLM calls, no new deps.
 *
 * Key parameters sourced from Mitchell's career calibration brief 2026-05-16:
 *   - Target TC: $250K–$320K
 *   - Floor base: $175K
 *   - Pre-IPO comfort: Series C minimum
 *   - Equity preference: equity-heavy at $200K+ base
 */

// ─── Tax rates ────────────────────────────────────────────────────────────────
const TAX_PROFILES = {
  wa: { federal_ltcg: 0.20, state_ltcg: 0.00, fica: 0.0145, label: 'Washington (no income tax)' },
  ca: { federal_ltcg: 0.20, state_ltcg: 0.133, fica: 0.0145, label: 'California' },
  ny: { federal_ltcg: 0.20, state_ltcg: 0.109, fica: 0.0145, label: 'New York' },
  tx: { federal_ltcg: 0.20, state_ltcg: 0.00, fica: 0.0145, label: 'Texas' },
  default: { federal_ltcg: 0.20, state_ltcg: 0.05, fica: 0.0145, label: 'Generic (est. 5% state)' },
};

// ─── 409A dilution heuristics by stage ───────────────────────────────────────
const STAGE_DILUTION_DEFAULTS = {
  'pre-seed': 0.18,
  seed: 0.18,
  'series-a': 0.20,
  'series-b': 0.20,
  'series-c': 0.17,
  'series-d': 0.13,
  'series-e': 0.12,
  'series-f+': 0.10,
  public: 0.04,
};

/**
 * Compute cumulative dilution factor over N rounds using per-round dilution pct.
 * Each round dilutes previous holders by (1 - dilution_pct_per_round).
 *
 * @param {number} dilution_pct_per_round  e.g. 0.18 for 18%
 * @param {number} rounds_to_exit
 * @returns {number} ownership retention multiplier (0..1)
 */
function cumulativeDilutionFactor(dilution_pct_per_round, rounds_to_exit) {
  return Math.pow(1 - dilution_pct_per_round, rounds_to_exit);
}

/**
 * Standard 4-year cliff-then-monthly vest schedule.
 *
 * @param {string} vest_schedule  'standard-4yr' | '3yr-monthly' | 'immediate' | {cliff_months, total_months, schedule}
 * @param {number} elapsed_months  months elapsed since grant
 * @returns {number} fraction vested (0..1)
 */
function vestedFraction(vest_schedule, elapsed_months = 12) {
  if (vest_schedule === 'immediate') return 1.0;
  if (vest_schedule === '3yr-monthly') {
    const cliff = 12;
    if (elapsed_months < cliff) return 0;
    return Math.min(1, (elapsed_months - cliff) / (36 - 12) + 1 / 36);
  }
  // default: standard-4yr (1-year cliff, then 1/48 per month)
  const cliff = 12;
  if (elapsed_months < cliff) return 0;
  const vested_after_cliff = Math.min(36, elapsed_months - cliff);
  return (12 / 48) + (vested_after_cliff / 48);
}

/**
 * Simple IRR estimate via Newton's method on a basic cash-flow model.
 * Cash flow: -strike_payment at t=0, +exit_value at t=years.
 *
 * @param {number} cost          strike price paid (may be near-zero for RSUs)
 * @param {number} exit_value    pre-tax exit value
 * @param {number} years
 * @returns {number} estimated IRR (annualized, 0..n)
 */
function estimateIRR(cost, exit_value, years) {
  if (years <= 0 || cost <= 0) return 0;
  if (exit_value <= cost) return 0;
  // simple single-period IRR: (exit/cost)^(1/years) - 1
  return Math.pow(exit_value / cost, 1 / years) - 1;
}

/**
 * Primary export: compute equity value across scenarios.
 *
 * @param {object} params
 * @param {number} params.shares
 * @param {number} params.strike_price
 * @param {number} params.current_409a_price
 * @param {number} params.target_exit_valuation    company exit valuation ($)
 * @param {number} params.current_valuation        company current valuation ($)
 * @param {number} [params.dilution_pct_per_round] decimal, e.g. 0.18
 * @param {number} [params.rounds_to_exit]         default 2
 * @param {string} [params.vest_schedule]          'standard-4yr' | '3yr-monthly' | 'immediate'
 * @param {number} [params.time_to_exit_years]     default 5
 * @param {string} [params.tax_jurisdiction]       'wa'|'ca'|'ny'|'tx'|'default'
 * @param {number} [params.elapsed_vest_months]    months since grant (for vested_value calc)
 * @returns {object}
 */
export function computeEquityValue({
  shares,
  strike_price = 0,
  current_409a_price,
  target_exit_valuation,
  current_valuation,
  dilution_pct_per_round = 0.18,
  rounds_to_exit = 2,
  vest_schedule = 'standard-4yr',
  time_to_exit_years = 5,
  tax_jurisdiction = 'wa',
  elapsed_vest_months = 12,
}) {
  if (!shares || shares <= 0) throw new Error('shares must be a positive number');
  if (!current_409a_price || current_409a_price <= 0) throw new Error('current_409a_price required');
  if (!target_exit_valuation || target_exit_valuation <= 0) throw new Error('target_exit_valuation required');
  if (!current_valuation || current_valuation <= 0) throw new Error('current_valuation required');

  const tax = TAX_PROFILES[tax_jurisdiction] ?? TAX_PROFILES.default;
  const total_tax_rate = tax.federal_ltcg + tax.state_ltcg + tax.fica;

  // Ownership fraction at current cap table (before future dilution)
  // For simplicity: treat total_shares_outstanding as implied from valuation / 409A
  // We work in per-share terms and apply dilution to share value.

  const dilution_factor = cumulativeDilutionFactor(dilution_pct_per_round, rounds_to_exit);

  // Current paper value (intrinsic)
  const current_paper_value = Math.max(0, (current_409a_price - strike_price) * shares);

  // Vested value
  const fraction_vested = vestedFraction(vest_schedule, elapsed_vest_months);
  const vested_value = current_paper_value * fraction_vested;

  // Price per share at exit: scale current_409a proportionally to exit vs current valuation
  const exit_price_per_share = (target_exit_valuation / current_valuation) * current_409a_price * dilution_factor;
  const exit_gain_per_share = Math.max(0, exit_price_per_share - strike_price);
  const exit_value_pre_tax = exit_gain_per_share * shares;
  const exit_value_post_tax = exit_value_pre_tax * (1 - total_tax_rate);

  // Strike cost basis
  const strike_cost = strike_price * shares;
  const irr_estimate = estimateIRR(Math.max(1, strike_cost), exit_value_post_tax, time_to_exit_years);

  // Scenarios: vary exit valuation
  function scenario(exit_mult) {
    const ep = (target_exit_valuation * exit_mult / current_valuation) * current_409a_price * dilution_factor;
    const gross = Math.max(0, ep - strike_price) * shares;
    return {
      exit_valuation: Math.round(target_exit_valuation * exit_mult),
      exit_value_pre_tax: Math.round(gross),
      exit_value_post_tax: Math.round(gross * (1 - total_tax_rate)),
    };
  }

  return {
    current_paper_value: Math.round(current_paper_value),
    vested_value: Math.round(vested_value),
    fraction_vested: +fraction_vested.toFixed(4),
    exit_value_pre_tax: Math.round(exit_value_pre_tax),
    exit_value_post_tax: Math.round(exit_value_post_tax),
    irr_estimate: +irr_estimate.toFixed(4),
    dilution_factor: +dilution_factor.toFixed(4),
    tax_profile: { ...tax, total_effective_rate: +total_tax_rate.toFixed(4) },
    scenarios: {
      p10: scenario(0.33),
      p50: scenario(1.0),
      p90: scenario(3.0),
    },
  };
}

/**
 * Role-level wrapper: given a role name and comp object, compute equity
 * with sensible defaults based on role stage.
 *
 * @param {string} role           e.g. 'AI Program Manager'
 * @param {object} comp           { base, total_tc, equity_grant_shares, strike_price,
 *                                  current_409a, current_valuation, series }
 * @param {object} [opts]         overrides passed to computeEquityValue
 * @returns {{ equity: object, assumptions: object }}
 */
export function computeEquityForRole(role, comp, opts = {}) {
  const series = (comp.series ?? 'series-c').toLowerCase().replace(/\s+/g, '-');
  const default_dilution = STAGE_DILUTION_DEFAULTS[series] ?? 0.17;
  const default_rounds = series.includes('a') || series.includes('b') ? 4
    : series.includes('c') ? 3
    : series.includes('d') ? 2
    : 1;

  const assumptions = {
    series,
    default_dilution,
    default_rounds,
    floor_base: 175_000,
    target_tc_low: 250_000,
    target_tc_high: 320_000,
    note: 'Per calibration brief 2026-05-16: $175K floor base, $250-320K target TC',
  };

  const equity = computeEquityValue({
    shares: comp.equity_grant_shares,
    strike_price: comp.strike_price ?? 0,
    current_409a_price: comp.current_409a,
    target_exit_valuation: comp.target_exit_valuation ?? comp.current_valuation * 10,
    current_valuation: comp.current_valuation,
    dilution_pct_per_round: opts.dilution_pct_per_round ?? default_dilution,
    rounds_to_exit: opts.rounds_to_exit ?? default_rounds,
    vest_schedule: opts.vest_schedule ?? 'standard-4yr',
    time_to_exit_years: opts.time_to_exit_years ?? 5,
    tax_jurisdiction: opts.tax_jurisdiction ?? 'wa',
    elapsed_vest_months: opts.elapsed_vest_months ?? 12,
    ...opts,
  });

  return { equity, assumptions };
}

/**
 * Render an HTML snippet for the dashboard drawer popout with interactive sliders.
 * Returns a self-contained HTML string (no external deps).
 *
 * @param {string} role
 * @param {object} comp  same shape as computeEquityForRole's comp param
 * @returns {string} HTML
 */
export function renderEquitySlidersHtml(role, comp) {
  const { equity, assumptions } = computeEquityForRole(role, comp);

  const fmtDollar = (n) => '$' + (n >= 1_000_000
    ? (n / 1_000_000).toFixed(2) + 'M'
    : n >= 1_000
    ? (n / 1_000).toFixed(0) + 'K'
    : n.toFixed(0));

  const irrPct = (equity.irr_estimate * 100).toFixed(1);
  const dilPct = ((1 - equity.dilution_factor) * 100).toFixed(1);

  return `
<div class="equity-slider-widget" data-role="${role.replace(/"/g, '&quot;')}" style="font-family:system-ui,sans-serif;font-size:13px;color:#e2e8f0;padding:16px;background:#1a202c;border-radius:8px;min-width:320px">
  <div style="font-weight:600;font-size:15px;margin-bottom:12px;color:#90cdf4">Equity Model — ${role}</div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
    <div><span style="color:#a0aec0">Current paper value</span><br><strong>${fmtDollar(equity.current_paper_value)}</strong></div>
    <div><span style="color:#a0aec0">Vested (${(equity.fraction_vested * 100).toFixed(0)}%)</span><br><strong>${fmtDollar(equity.vested_value)}</strong></div>
    <div><span style="color:#a0aec0">Exit pre-tax (P50)</span><br><strong>${fmtDollar(equity.scenarios.p50.exit_value_pre_tax)}</strong></div>
    <div><span style="color:#a0aec0">Exit post-tax (P50)</span><br><strong style="color:#68d391">${fmtDollar(equity.scenarios.p50.exit_value_post_tax)}</strong></div>
  </div>

  <div style="margin-bottom:12px">
    <div style="color:#a0aec0;margin-bottom:4px">Scenarios</div>
    <div style="display:flex;gap:12px">
      <span style="color:#fc8181">P10 ${fmtDollar(equity.scenarios.p10.exit_value_post_tax)}</span>
      <span style="color:#f6e05e">P50 ${fmtDollar(equity.scenarios.p50.exit_value_post_tax)}</span>
      <span style="color:#68d391">P90 ${fmtDollar(equity.scenarios.p90.exit_value_post_tax)}</span>
    </div>
  </div>

  <div style="font-size:11px;color:#718096;border-top:1px solid #2d3748;padding-top:8px;margin-top:4px">
    Stage: ${assumptions.series} &nbsp;|&nbsp; Dilution est: ${dilPct}% total &nbsp;|&nbsp; Est IRR: ${irrPct}%<br>
    Tax: ${equity.tax_profile.label} &nbsp;|&nbsp; Effective LTCG rate: ${(equity.tax_profile.total_effective_rate * 100).toFixed(1)}%
  </div>

  <div style="font-size:10px;color:#4a5568;margin-top:6px">
    Sliders: adjust via computeEquityValue({ exit_valuation, dilution_pct_per_round, time_to_exit_years, tax_jurisdiction })
  </div>
</div>`.trim();
}

export { STAGE_DILUTION_DEFAULTS, TAX_PROFILES };
