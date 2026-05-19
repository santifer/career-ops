/**
 * lib/council-dispatch.mjs — Dynamic council size routing.
 *
 * Design source: refresh-master Phase 2 deliverable 4. Council size scales
 * with stakes:
 *
 *   - Layer 2 routine refresh       → council_size = 1 (best-fit provider only)
 *   - Layer 2 contested (verifier disagrees) OR
 *     Layer 3 scheduled rotation    → council_size = 3 (Sonnet + Sonar Deep + Grok-x)
 *   - Layer 3 status→Interview/Offer
 *     OR manual deep refresh CTA    → council_size = 7 (full fan-out)
 *
 * The decision is centralized here so the orchestrator + Layer-3 event
 * watcher + drawer CTA endpoint all use the same lineup logic.
 *
 * Returns a list of model identifiers for callCouncil({ models }).
 */

export const TIER_ROUTINE = 'routine';
export const TIER_CONTESTED = 'contested';
export const TIER_DEEP = 'deep';

export const LINEUP_1 = ['anthropic:claude-sonnet-4-6'];
export const LINEUP_3 = [
  'anthropic:claude-sonnet-4-6',
  'perplexity:sonar-deep-research',
  'xai:grok-4-x-search',
];
export const LINEUP_7 = [
  'anthropic:claude-opus-4-7',
  'anthropic:claude-sonnet-4-6',
  'openai:gpt-5',
  'google:gemini-2.5-pro',
  'perplexity:sonar-deep-research',
  'perplexity:sonar-reasoning-pro',
  'xai:grok-4-x-search',
];

/**
 * Decide the council tier for a given context.
 * @param {object} ctx
 * @param {string} ctx.layer        - 2 | 3
 * @param {string} ctx.event        - 'routine' | 'rotation' | 'status_change' | 'manual_deep' | 'verifier_disagreement'
 * @param {string} ctx.statusChange - if event=status_change, the new status (Interview|Offer|...)
 * @returns {string} tier (routine|contested|deep)
 */
export function pickTier(ctx) {
  const { layer, event, statusChange } = ctx;
  if (event === 'manual_deep') return TIER_DEEP;
  if (event === 'status_change' && (statusChange === 'Interview' || statusChange === 'Offer')) return TIER_DEEP;
  if (event === 'verifier_disagreement') return TIER_CONTESTED;
  if (layer === 3 && event === 'rotation') return TIER_CONTESTED;
  return TIER_ROUTINE;
}

export function lineupForTier(tier) {
  if (tier === TIER_DEEP) return LINEUP_7.slice();
  if (tier === TIER_CONTESTED) return LINEUP_3.slice();
  return LINEUP_1.slice();
}

/**
 * Compose a callCouncil({ models, opts }) descriptor from a context.
 * @param {object} ctx - see pickTier
 * @returns {{ tier, models, councilSize, rationale }}
 */
export function dispatchFor(ctx) {
  const tier = pickTier(ctx);
  const models = lineupForTier(tier);
  return {
    tier,
    models,
    councilSize: models.length,
    rationale: `${tier} (layer=${ctx.layer}, event=${ctx.event}${ctx.statusChange ? `, status=${ctx.statusChange}` : ''})`,
  };
}
