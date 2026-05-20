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
    // Apply-pack pregen + polish ALWAYS fire on ≥4.0 (the auto-escalation).
    // These flags are kept for future-proofing if a tier ever needs to
    // disable them, but today the rule is: ≥4.0 → both fire.
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

// Auto-escalation threshold — every row whose eval score ≥ this gets
// apply-pack pregen + polish, regardless of selected tier.
export const AUTO_ESCALATE_FLOOR = 4.0;

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
export function tierCostEstimates({ pipelineSize, applyNowSize, advanceRate = 0.30, highScoreRate = 0.15 }) {
  // Per-call costs at 2026-05 rates (input + output, single API call).
  const HAIKU_PER_TRIAGE   = 0.005;   // ~$0.005 per Haiku triage call
  const SONNET_PER_TRIAGE  = 0.07;    // ~$0.07 per Sonnet JD-reasoning triage call
  const SONNET_PER_EVAL    = 0.08;    // ~$0.08 per Sonnet A-G report
  const OPUS_PER_EVAL      = 0.40;    // ~$0.40 per Opus A-G report
  const APPLY_PACK_PER_ROW = 8.00;    // ~$8 per full apply-pack (multi-artifact)
  const POLISH_PER_ROW     = 5.00;    // ~$5 per polish-loop run

  const advanceCount = Math.max(0, Math.round(pipelineSize * advanceRate));
  const newHighScoreCount = Math.max(0, Math.round(advanceCount * highScoreRate));
  const totalHighScoreRows = applyNowSize + newHighScoreCount;

  const out = {};
  for (const tid of [1, 2, 3]) {
    const t = TIERS[tid];
    const triageCost = pipelineSize * (t.triage_use_sonnet_jd ? SONNET_PER_TRIAGE : HAIKU_PER_TRIAGE);
    const evalCost   = advanceCount * (t.eval_model === OPUS ? OPUS_PER_EVAL : SONNET_PER_EVAL);
    // Pregen + polish are PER-TIER-INDEPENDENT (auto-escalation), but the
    // dashboard wants them in each tier's "total cost" so the user sees the
    // full-bill estimate at confirmation time.
    const pregenCost = totalHighScoreRows * APPLY_PACK_PER_ROW;
    const polishCost = totalHighScoreRows * POLISH_PER_ROW;
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
      assumed_pipeline_size:        pipelineSize,
      assumed_advance_count:        advanceCount,
      assumed_new_high_score_count: newHighScoreCount,
      assumed_total_escalated:      totalHighScoreRows,
      triage_model: t.triage_model,
      eval_model:   t.eval_model,
    };
  }
  return out;
}
