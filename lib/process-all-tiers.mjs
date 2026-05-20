/**
 * lib/process-all-tiers.mjs — single source of truth for Process All tiers.
 *
 * Mitchell asked for "premium treatment" to be tier-selectable at the
 * cost-modal step, not a hidden default. Three tiers, picked at the
 * confirmation step:
 *
 *   1 (standard)        Haiku triage + Sonnet eval
 *   2 (premium-triage)  Sonnet triage + Sonnet eval — fewer false-skips
 *                       at the gate (richer JD reasoning before advancing)
 *   3 (premium-eval)    Sonnet triage + Opus eval — highest-quality scores,
 *                       especially valuable for borderline 3.8–4.4 rows
 *
 * Independent of tier, the post-eval phases (phasePolish + phasePregen)
 * ALWAYS fire on ≥4.0 rows — the system auto-escalates proven winners
 * regardless of the user-selected triage/eval tier. That's the "premium
 * treatment for anything that passes triage and scores ≥4.0" rule.
 *
 * Imported by:
 *   - scripts/process-all-pipeline.mjs (routes models per tier)
 *   - dashboard-server.mjs            (per-tier cost preview)
 *   - scripts/build-dashboard.mjs     (Process All modal tier picker)
 */

import { HAIKU, SONNET, OPUS } from './models.mjs';

export const TIERS = {
  1: {
    id: 1,
    name: 'Standard',
    description: 'Haiku triage + Sonnet eval. Cheapest. Default for scheduled runs.',
    triage_model: HAIKU,
    eval_model:   SONNET,
    triage_use_sonnet_jd: false,
    auto_pregen_on_high_score: true,
    auto_polish_on_high_score: true,
  },
  2: {
    id: 2,
    name: 'Premium Triage',
    description: 'Sonnet at the SKIP/ADVANCE gate — fewer high-fit roles wrongly filtered before they reach eval.',
    triage_model: SONNET,
    eval_model:   SONNET,
    triage_use_sonnet_jd: true,
    auto_pregen_on_high_score: true,
    auto_polish_on_high_score: true,
  },
  3: {
    id: 3,
    name: 'Premium Eval',
    description: 'Sonnet triage + Opus eval. Highest-quality A–G reports; trust scores more deeply, especially borderline 3.8–4.4 rows.',
    triage_model: SONNET,
    eval_model:   OPUS,
    triage_use_sonnet_jd: true,
    auto_pregen_on_high_score: true,
    auto_polish_on_high_score: true,
  },
};

// 2026-05-20 — Two-tier auto-escalation (Mitchell refinement):
//   ≥4.0 → apply-pack pregen (cheap, $2.50/row from cost-log)
//   ≥4.5 → polish loop (expensive, $60/pack — only invest in cream-of-the-crop)
// This is more honest about cost than the original "≥4.0 gets everything"
// rule, which inflated tier estimates by ~5× and surprised the user.
export const PREGEN_FLOOR = 4.0;
export const POLISH_FLOOR = 4.5;
// Legacy alias retained for downstream code that still imports this name.
export const AUTO_ESCALATE_FLOOR = PREGEN_FLOOR;

/**
 * Resolve a tier ID (string or number, plus legacy '5' which maps to 2 for
 * backwards-compat with the dashboard's current Tier-5 button) into the
 * canonical tier object.
 */
export function resolveTier(input) {
  if (input == null || input === '' || input === 'normal') return TIERS[1];
  const s = String(input).trim();
  // Legacy: dashboard sends 'tier:5' for the current Tier-5 button.
  // Map to tier 2 (premium-triage + pregen, which is what today's '5' does).
  if (s === '5') return TIERS[2];
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && TIERS[n]) return TIERS[n];
  return TIERS[1]; // safe default
}

/**
 * Per-tier cost estimates for the Process All confirmation modal.
 * Computed from real per-row token+model costs. Inputs:
 *   - pipelineSize: URLs to triage (data/pipeline.md pending count)
 *   - applyNowSize: existing ≥4.0 rows that will get auto-escalate post-eval
 *
 * Returns: { 1: {...}, 2: {...}, 3: {...} } — one estimate per tier.
 */
export function tierCostEstimates({
  pipelineSize,
  applyNowSize,
  // 2026-05-20 — REAL rates from data/cost-log.tsv (May 2026 observations):
  //   batch-eval Sonnet:  $0.06 per row (matches dashboard-server constant)
  //   batch-eval Opus:    $0.27 per row (Opus is ~4.5× Sonnet)
  //   apply-pack pregen:  $2.50 per row (matches COST_PER_APPLY_PACK_PREGEN)
  //   polish:             $60 per pack  (matches COST_PER_POLISH_PACK_USD env default)
  //
  // Historical advance rates from /tmp/process-all-*.log:
  //   Run 1: 38 advanced / 50 processed = 76%
  //   Run 2: 28/29 = 96% (small sample)
  //   Run 3: 36/50 = 72%
  //   But triage looks at the TOP 50 by composite, not a random sample — so
  //   advance rate among ALL pipeline URLs is much lower. Conservative: 12%.
  //
  // High-score rate (≥4.0) among advanced: heartbeat says 1-2 new ≥4.0 per
  // run = ~5%. Polish-eligible (≥4.5): ~30% of those = ~1.5% of advanced.
  advanceRate    = 0.12,
  pregenRate     = 0.05,    // ≥4.0 among advanced
  polishRate     = 0.015,   // ≥4.5 among advanced
}) {
  const HAIKU_PER_TRIAGE   = 0.005;
  const SONNET_PER_TRIAGE  = 0.07;
  const SONNET_PER_EVAL    = 0.06;
  const OPUS_PER_EVAL      = 0.27;
  const APPLY_PACK_PER_ROW = 2.50;
  const POLISH_PER_ROW     = 60.00;

  const advanceCount        = Math.max(0, Math.round(pipelineSize * advanceRate));
  const newPregenCount      = Math.max(0, Math.round(advanceCount * pregenRate));
  const newPolishCount      = Math.max(0, Math.round(advanceCount * polishRate));
  // applyNowSize (existing ≥4.0 rows) is NOT pre-charged — phasePolish
  // skips rows whose polish-summary is < 3 days old (the freshness check).
  // For a typical Process All in a maintained pipeline, only NEW ≥4.0 rows
  // burn pregen/polish budget.

  const out = {};
  for (const tid of [1, 2, 3]) {
    const t = TIERS[tid];
    const triageCost = pipelineSize * (t.triage_use_sonnet_jd ? SONNET_PER_TRIAGE : HAIKU_PER_TRIAGE);
    const evalCost   = advanceCount * (t.eval_model === OPUS ? OPUS_PER_EVAL : SONNET_PER_EVAL);
    const pregenCost = newPregenCount * APPLY_PACK_PER_ROW;
    const polishCost = newPolishCount * POLISH_PER_ROW;
    const total = triageCost + evalCost + pregenCost + polishCost;
    out[tid] = {
      tier: tid,
      name: t.name,
      breakdown: {
        triage_cost_usd: Math.round(triageCost * 100) / 100,
        eval_cost_usd:   Math.round(evalCost   * 100) / 100,
        pregen_cost_usd: Math.round(pregenCost * 100) / 100,
        polish_cost_usd: Math.round(polishCost * 100) / 100,
      },
      total_cost_usd: Math.round(total * 100) / 100,
      assumed_pipeline_size:    pipelineSize,
      assumed_advance_count:    advanceCount,
      assumed_pregen_count:     newPregenCount,   // ≥4.0 new rows
      assumed_polish_count:     newPolishCount,   // ≥4.5 new rows
      assumed_existing_skipped: applyNowSize,     // freshness-skipped per phasePolish
      pregen_floor:             PREGEN_FLOOR,
      polish_floor:             POLISH_FLOOR,
      triage_model:             t.triage_model,
      eval_model:               t.eval_model,
    };
  }
  return out;
}
