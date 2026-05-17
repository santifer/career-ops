/**
 * lib/negotiation-playbook.mjs
 * Auto-activating negotiation playbook for offers >= $300K.
 * Deterministic — no LLM calls, no new deps.
 *
 * Calibration anchors from data/career-calibration-20260516-190152.md:
 *   - Floor base:   $175K (absolute walk-line)
 *   - Target TC:    $250K–$320K (base + bonus + year-1 equity vest)
 *   - Equity preference: equity-heavy at $200K+ base
 */

const FLOOR_BASE = 175_000;
const TARGET_TC_LOW = 250_000;
const TARGET_TC_HIGH = 320_000;
const EQUITY_PREFERENCE_BASE_FLOOR = 200_000;
const AUTO_ACTIVATE_THRESHOLD = 300_000;

/**
 * Clamp a number between min and max.
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Format a dollar amount as a compact string.
 */
function fmt(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K';
  return '$' + n;
}

/**
 * Determine if offer is above floor and worth negotiating.
 * @param {number} offer_total
 * @param {number} [base_target]
 * @param {boolean} [ai_native]  pre-IPO AI-native companies get a higher equity multiplier
 * @returns {{ activate: boolean, reason: string }}
 */
function shouldActivate(offer_total, base_target, ai_native, competing_offers) {
  if (competing_offers > 0) {
    return { activate: true, reason: 'competing_offer_leverage' };
  }
  if (offer_total >= AUTO_ACTIVATE_THRESHOLD) {
    return { activate: true, reason: 'offer_above_300k_threshold' };
  }
  if (offer_total >= TARGET_TC_LOW && ai_native) {
    return { activate: true, reason: 'ai_native_target_range' };
  }
  return { activate: false, reason: 'offer_below_activation_threshold' };
}

/**
 * Compute expected uplift based on leverage and offer gap.
 *
 * @param {number} offer_total
 * @param {number} competing_offers
 * @param {boolean} ai_native
 * @returns {{ p50: number, p90: number }}
 */
function expectedUplift(offer_total, competing_offers, ai_native) {
  // Base uplift from negotiation: 5-10% typical; competing offer adds 10-20%
  const base_pct = ai_native ? 0.08 : 0.06;
  const comp_boost = competing_offers > 0 ? 0.12 : 0;
  const p50_pct = clamp(base_pct + comp_boost * 0.5, 0.04, 0.25);
  const p90_pct = clamp(base_pct * 1.8 + comp_boost, 0.08, 0.40);
  return {
    p50: Math.round(offer_total * p50_pct),
    p90: Math.round(offer_total * p90_pct),
  };
}

/**
 * Build scripts for each negotiation scenario.
 *
 * @param {object} p
 * @returns {Array<{scenario, opener, counter_anchor, fallback, walk_away}>}
 */
function buildScripts(p) {
  const {
    offer_total,
    base_target,
    equity_target,
    signon_target,
    stage,
    ai_native,
    candidate_leverage,
  } = p;

  const base_counter = clamp(
    base_target ?? Math.max(TARGET_TC_LOW * 0.70, EQUITY_PREFERENCE_BASE_FLOOR),
    FLOOR_BASE,
    TARGET_TC_HIGH,
  );
  const signon_ask = signon_target ?? Math.round(base_counter * 0.15);
  const equity_ask_label = equity_target
    ? fmt(equity_target)
    : ai_native
    ? 'equity refresh to full-cycle vest value ≥ ' + fmt(TARGET_TC_HIGH * 0.5)
    : 'equity grant reflecting Series C+ trajectory';

  const comp_offers = candidate_leverage?.competing_offers ?? 0;
  const comp_label = comp_offers > 0 ? `${comp_offers} competing offer${comp_offers > 1 ? 's' : ''}` : null;

  const scripts = [];

  // Script 1: Base salary counter-anchor
  scripts.push({
    scenario: 'base_counter_anchor',
    opener: comp_label
      ? `"I'm excited about this opportunity. I want to be direct — I have ${comp_label} in hand and my target for base is ${fmt(base_counter)}. What's the flexibility there?"`
      : `"I appreciate the offer. My target base is ${fmt(base_counter)} given my background in AI program operations and demonstrated delivery velocity. Can we get there?"`,
    counter_anchor: fmt(base_counter),
    fallback: `If base is firm, redirect: "If ${fmt(base_counter)} isn't possible on base, I'd want to close that gap via signing bonus. Can we get to ${fmt(signon_ask)} signing?"`,
    walk_away: `Below ${fmt(FLOOR_BASE)} base — absolute floor per calibration. Walk regardless of equity.`,
  });

  // Script 2: Equity refresh / grant size
  scripts.push({
    scenario: 'equity_refresh',
    opener: `"The base works, but I want to make sure the equity story is compelling. I'm optimizing for total wealth over 3–5 years — what's the trajectory on the grant size and refresh cadence?"`,
    counter_anchor: equity_ask_label,
    fallback: `"If the initial grant is fixed, I'd accept a refresh cliff at 12 months with a performance-tied top-up. Can we build that in writing?"`,
    walk_away: `No equity refresh mechanism at a pre-IPO company with ${stage} valuation = non-starter for long-term comp parity.`,
  });

  // Script 3: Signing bonus
  scripts.push({
    scenario: 'signing_bonus',
    opener: `"I'll be leaving unvested equity at Google that vests in the next 12 months. To bridge that gap I need a signing bonus — I'm targeting ${fmt(signon_ask)}. Is that on the table?"`,
    counter_anchor: fmt(signon_ask),
    fallback: `"If a single payment is a constraint, can we structure it as two tranches — half on day 1, half at 6-month mark?"`,
    walk_away: `If signing is ${fmt(Math.round(signon_ask * 0.4))} or below and they won't move on base or equity simultaneously — walk.`,
  });

  // Script 4: Start date / vesting accelerator
  scripts.push({
    scenario: 'start_date_leverage',
    opener: `"I can start [target date], but pushing that out 3–4 weeks gets me past a major Google vest tranche worth ${fmt(Math.round(base_counter * 0.08))}. Is there flexibility on start date, or can you compensate for that delta?"`,
    counter_anchor: 'Start date flex OR cash-equiv comp for vest gap',
    fallback: `"No problem on start date — in that case let's make sure the signing fully covers the vest gap."`,
    walk_away: `N/A — start date is a value-capture tool, not a hard constraint.`,
  });

  // Script 5: Cash ↔ equity flip (for ai_native only)
  if (ai_native) {
    scripts.push({
      scenario: 'cash_equity_flip',
      opener: `"I'm comfortable trading base down to ${fmt(EQUITY_PREFERENCE_BASE_FLOOR)} if you can increase the equity grant by a proportional amount. For a ${stage} company with your trajectory, I'd rather own more of the upside. Can we restructure along those lines?"`,
      counter_anchor: `Base: ${fmt(EQUITY_PREFERENCE_BASE_FLOOR)} | Equity: proportional increase to cover delta`,
      fallback: `"If the equity pool is constrained, can we revisit in 6 months via a formal comp review tied to milestones?"`,
      walk_away: `Base below ${fmt(FLOOR_BASE)} even with equity-heavy structure — floor holds absolutely.`,
    });
  }

  return scripts;
}

/**
 * Primary export: generate full negotiation playbook.
 *
 * @param {object} params
 * @param {number} params.offer_total          total annual comp offered
 * @param {number} [params.base_target]        desired base salary
 * @param {number} [params.equity_target]      desired equity grant value
 * @param {number} [params.signon_target]      desired signing bonus
 * @param {string} [params.stage]              funding stage, e.g. 'series-c'
 * @param {boolean} [params.ai_native]         is this a frontier AI lab?
 * @param {object} [params.candidate_leverage] { competing_offers: number, strengths: [] }
 * @returns {{ activate: boolean, reason: string, scripts: Array, talking_points: Array, expected_uplift: object }}
 */
export function getNegotiationPlaybook({
  offer_total,
  base_target,
  equity_target,
  signon_target,
  stage = 'series-c',
  ai_native = false,
  candidate_leverage = {},
}) {
  if (typeof offer_total !== 'number' || offer_total <= 0) {
    throw new Error('offer_total must be a positive number');
  }

  const competing_offers = candidate_leverage?.competing_offers ?? 0;
  const activation = shouldActivate(offer_total, base_target, ai_native, competing_offers);

  if (!activation.activate) {
    return {
      activate: false,
      reason: activation.reason,
      scripts: [],
      talking_points: [],
      expected_uplift: { p50: 0, p90: 0 },
      calibration: {
        floor_base: FLOOR_BASE,
        target_tc_low: TARGET_TC_LOW,
        target_tc_high: TARGET_TC_HIGH,
        auto_activate_at: AUTO_ACTIVATE_THRESHOLD,
      },
    };
  }

  const scripts = buildScripts({
    offer_total,
    base_target,
    equity_target,
    signon_target,
    stage,
    ai_native,
    candidate_leverage,
  });

  const talking_points = [
    `Floor is ${fmt(FLOOR_BASE)} base — non-negotiable, walk below this.`,
    `Target TC: ${fmt(TARGET_TC_LOW)}–${fmt(TARGET_TC_HIGH)} (base + bonus + year-1 equity vest).`,
    ai_native ? `Equity preference: equity-heavy at ${fmt(EQUITY_PREFERENCE_BASE_FLOOR)}+ base — will trade base for equity above floor.` : `Focus on base and signing to reach TC floor.`,
    `Shipping velocity is the primary value signal — lead with career-ops, Comms Triage Agent, Voice OS (delivery metrics, not PM framing).`,
    `Never lead with mission-alignment — leads with wealth-generation narrative instead.`,
    competing_offers > 0 ? `Leverage: ${competing_offers} competing offer(s) — use to anchor early in the conversation.` : `No competing offers yet — anchor on market data and calibration targets.`,
    `3-word brand: "Rare combination, ships fast." — emphasize cross-function builder credentials.`,
  ];

  return {
    activate: true,
    reason: activation.reason,
    scripts,
    talking_points,
    expected_uplift: expectedUplift(offer_total, competing_offers, ai_native),
    calibration: {
      floor_base: FLOOR_BASE,
      target_tc_low: TARGET_TC_LOW,
      target_tc_high: TARGET_TC_HIGH,
      auto_activate_at: AUTO_ACTIVATE_THRESHOLD,
    },
  };
}

/**
 * Render HTML for comp-chip drawer when offer >= $300K.
 *
 * @param {object} playbook  result of getNegotiationPlaybook()
 * @returns {string} HTML snippet
 */
export function renderPlaybookHtml(playbook) {
  if (!playbook.activate) {
    return `<div style="font-family:system-ui,sans-serif;font-size:12px;color:#718096;padding:8px">
      Negotiation playbook inactive (offer below ${fmt(AUTO_ACTIVATE_THRESHOLD)} threshold).
    </div>`;
  }

  const scriptCards = playbook.scripts.map(s => `
    <div style="background:#2d3748;border-radius:6px;padding:10px;margin-bottom:8px">
      <div style="font-weight:600;color:#90cdf4;text-transform:uppercase;font-size:10px;letter-spacing:.5px;margin-bottom:6px">${s.scenario.replace(/_/g, ' ')}</div>
      <div style="color:#e2e8f0;margin-bottom:4px"><strong>Opener:</strong> ${s.opener}</div>
      <div style="color:#f6e05e;margin-bottom:4px"><strong>Anchor:</strong> ${s.counter_anchor}</div>
      <div style="color:#a0aec0;margin-bottom:4px"><strong>Fallback:</strong> ${s.fallback}</div>
      <div style="color:#fc8181;font-size:11px"><strong>Walk if:</strong> ${s.walk_away}</div>
    </div>
  `).join('');

  const talkingPointsHtml = playbook.talking_points.map(tp =>
    `<li style="margin-bottom:4px">${tp}</li>`
  ).join('');

  return `
<div class="negotiation-playbook-widget" style="font-family:system-ui,sans-serif;font-size:13px;color:#e2e8f0;padding:16px;background:#1a202c;border-radius:8px;max-width:580px">
  <div style="font-weight:600;font-size:15px;margin-bottom:4px;color:#90cdf4">Negotiation Playbook</div>
  <div style="color:#68d391;font-size:11px;margin-bottom:12px">ACTIVE — ${playbook.reason.replace(/_/g, ' ')} | Expected uplift: P50 ${fmt(playbook.expected_uplift.p50)} / P90 ${fmt(playbook.expected_uplift.p90)}</div>

  <div style="margin-bottom:14px">
    <div style="color:#a0aec0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Scripts (${playbook.scripts.length})</div>
    ${scriptCards}
  </div>

  <div>
    <div style="color:#a0aec0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Key talking points</div>
    <ul style="margin:0;padding-left:16px;color:#e2e8f0">${talkingPointsHtml}</ul>
  </div>
</div>`.trim();
}

export { FLOOR_BASE, TARGET_TC_LOW, TARGET_TC_HIGH, AUTO_ACTIVATE_THRESHOLD };
