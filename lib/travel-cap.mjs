/**
 * lib/travel-cap.mjs — Travel-cap / comp-elasticity rule.
 *
 * Inventory item B7 (2026-05-18). Mitchell's quote:
 *   "I'm open to travel once a month for a week max — but that's a financial
 *    hit. I hope the salary and benefits and path to wealth is quicker based
 *    on the evaluation and alignment of my experience... then i would consider
 *    it"
 *
 * Rather than flat-flagging any role with elevated travel as "exceeds 17%
 * travel cap", this lib computes a comp-elasticated acceptability score:
 *   - Base cap: 17% travel (7-day trip per 6 weeks)
 *   - Elastic ceiling: up to monthly weeks IF comp clears a threshold
 *   - Threshold scales with travel intensity (more travel → higher comp needed)
 *
 * Output is the chip text + verdict; the comp drill-in renders it.
 *
 * No LLM calls. Pure deterministic math + lookup table.
 */

// Reference comp targets per Mitchell's calibration brief (2026-05-16):
//   walk_line:   $175K
//   target_low:  $250K
//   target_high: $320K
const COMP_WALK_LINE_K = parseInt(process.env.COMP_WALK_LINE_K, 10) || 175;
const COMP_TARGET_LOW_K = parseInt(process.env.COMP_TARGET_LOW_K, 10) || 250;
const COMP_TARGET_HIGH_K = parseInt(process.env.COMP_TARGET_HIGH_K, 10) || 320;

// Travel-cap thresholds (base 17% / 7d-per-6-weeks).
// Above 17%, each additional 5% requires +$30K base over walk-line to be acceptable.
const BASE_TRAVEL_CAP_PCT = 17;
const COMP_DELTA_PER_5PCT_TRAVEL_K = 30;
const HARD_TRAVEL_CEILING_PCT = 35; // 35% = ~weekly travel; never elastic-accept above this

/**
 * @param {Object} input
 * @param {number} [input.travel_pct]   — expected travel as percent of work weeks (0-100)
 * @param {number} [input.base_comp_k]  — base salary in $K (e.g., 280 for $280K)
 * @param {string} [input.travel_notes] — free text from JD ("up to 25%", "frequent international", etc.)
 * @returns {{
 *   travel_pct: number,
 *   base_cap_pct: number,
 *   exceeds_base_cap: boolean,
 *   required_comp_k: number,
 *   meets_required_comp: boolean,
 *   verdict: 'accept' | 'elastic-accept' | 'reject',
 *   rationale: string,
 *   elastic_threshold_k: number,
 * }}
 */
export function assessTravelTradeoff({ travel_pct, base_comp_k, travel_notes }) {
  // Parse travel from notes if travel_pct not provided.
  const tp = Number.isFinite(travel_pct) ? travel_pct : _parseTravelPct(travel_notes || '');
  const base = Number.isFinite(base_comp_k) ? base_comp_k : 0;
  const baseCapPct = BASE_TRAVEL_CAP_PCT;

  if (tp == null || tp <= baseCapPct) {
    return {
      travel_pct: tp || 0,
      base_cap_pct: baseCapPct,
      exceeds_base_cap: false,
      required_comp_k: COMP_WALK_LINE_K,
      meets_required_comp: base >= COMP_WALK_LINE_K,
      verdict: base >= COMP_WALK_LINE_K ? 'accept' : 'reject',
      rationale: tp == null
        ? 'Travel %: not specified — assumed within ' + baseCapPct + '% base cap.'
        : 'Travel ' + tp + '% is within the ' + baseCapPct + '% base cap. No comp elasticity needed.',
      elastic_threshold_k: COMP_WALK_LINE_K,
    };
  }

  // Above base cap. Compute elasticated threshold.
  const excessPct = tp - baseCapPct;
  const extraStepsOf5 = Math.ceil(excessPct / 5);
  const elasticThresholdK = COMP_WALK_LINE_K + extraStepsOf5 * COMP_DELTA_PER_5PCT_TRAVEL_K;

  if (tp > HARD_TRAVEL_CEILING_PCT) {
    return {
      travel_pct: tp,
      base_cap_pct: baseCapPct,
      exceeds_base_cap: true,
      required_comp_k: elasticThresholdK,
      meets_required_comp: false,
      verdict: 'reject',
      rationale: 'Travel ' + tp + '% exceeds hard ceiling of ' + HARD_TRAVEL_CEILING_PCT + '%. No comp clears this.',
      elastic_threshold_k: elasticThresholdK,
    };
  }

  if (base >= elasticThresholdK) {
    return {
      travel_pct: tp,
      base_cap_pct: baseCapPct,
      exceeds_base_cap: true,
      required_comp_k: elasticThresholdK,
      meets_required_comp: true,
      verdict: 'elastic-accept',
      rationale: 'Travel ' + tp + '% exceeds the ' + baseCapPct + '% base cap, but base comp $' + base + 'K clears the elastic threshold of $' + elasticThresholdK + 'K. Travel acceptable as a financial-trade-off.',
      elastic_threshold_k: elasticThresholdK,
    };
  }

  return {
    travel_pct: tp,
    base_cap_pct: baseCapPct,
    exceeds_base_cap: true,
    required_comp_k: elasticThresholdK,
    meets_required_comp: false,
    verdict: 'reject',
    rationale: 'Travel ' + tp + '% exceeds ' + baseCapPct + '% base cap. Comp needs to reach $' + elasticThresholdK + 'K base to compensate; current $' + base + 'K falls short by $' + (elasticThresholdK - base) + 'K.',
    elastic_threshold_k: elasticThresholdK,
  };
}

/**
 * Render the travel chip HTML for the comp drill-in.
 * @param {ReturnType<typeof assessTravelTradeoff>} assessment
 * @returns {string}
 */
export function renderTravelChip(assessment) {
  if (!assessment) return '';
  const { travel_pct, verdict, rationale, elastic_threshold_k, required_comp_k } = assessment;
  const color = verdict === 'accept' ? 'var(--positive-text)'
    : verdict === 'elastic-accept' ? 'var(--amber-fg)'
    : 'var(--red-fg)';
  const label = verdict === 'accept' ? 'Travel acceptable'
    : verdict === 'elastic-accept' ? 'Elastic accept'
    : 'Travel rejects this role';

  return `
<div class="travel-cap-card" style="margin-top:14px;padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface-2)">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
    <span style="font-size:13px;font-weight:600;color:var(--text)">Travel ${travel_pct}% — ${label}</span>
  </div>
  <p style="margin:0 0 8px;font-size:12px;color:var(--text-2);line-height:1.5">${rationale}</p>
  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);border-top:1px solid var(--border);padding-top:6px;margin-top:6px">
    <span>Elastic threshold: <strong style="color:var(--text)">$${elastic_threshold_k}K</strong></span>
    <span style="font-family:var(--font-mono);color:var(--text-4)">via lib/travel-cap.mjs</span>
  </div>
</div>`.trim();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _parseTravelPct(notes) {
  if (!notes) return null;
  // Common JD phrasings:
  //   "up to 25% travel"
  //   "25-50% travel"
  //   "30% travel"
  //   "weekly travel"
  //   "frequent travel"
  //   "minimal travel"
  const m = notes.match(/(\d+)\s*%?\s*-\s*(\d+)\s*%?\s*(?:travel)/i)
        || notes.match(/(?:up to|approximately|~)\s*(\d+)\s*%/i)
        || notes.match(/(\d+)\s*%\s*travel/i);
  if (m) {
    if (m[2]) return Math.round((parseInt(m[1], 10) + parseInt(m[2], 10)) / 2);
    return parseInt(m[1], 10);
  }
  if (/weekly\s+travel|every\s+week|each\s+week/i.test(notes)) return 25;
  if (/frequent\s+travel|regular\s+travel/i.test(notes)) return 20;
  if (/monthly\s+travel|once\s+a\s+month/i.test(notes)) return 10;
  if (/minimal\s+travel|occasional\s+travel|some\s+travel/i.test(notes)) return 5;
  if (/no\s+travel|remote.*no\s+travel/i.test(notes)) return 0;
  return null;
}

// CLI for ad-hoc verification:
//   node lib/travel-cap.mjs --travel=25 --base=280
//   node lib/travel-cap.mjs --notes="up to 25% travel" --base=200
const __isMain = import.meta.url === `file://${process.argv[1]}`;
if (__isMain) {
  const args = process.argv.slice(2);
  const arg = (k) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(3 + k.length) : null; };
  const travel_pct = parseFloat(arg('travel'));
  const base_comp_k = parseFloat(arg('base'));
  const travel_notes = arg('notes') || '';
  const result = assessTravelTradeoff({
    travel_pct: Number.isFinite(travel_pct) ? travel_pct : undefined,
    base_comp_k: Number.isFinite(base_comp_k) ? base_comp_k : undefined,
    travel_notes,
  });
  console.log(JSON.stringify(result, null, 2));
}
