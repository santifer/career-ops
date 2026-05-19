/**
 * lib/provider-adapters/perplexity-agent-api.mjs — Perplexity Agent API
 * adapter. PHASE-1.5 STUB. Returns NOT_IMPLEMENTED until Phase 2 wires the
 * real Perplexity Agent API per docs.perplexity.ai/docs/agent-api.
 *
 * Why a stub:
 *   The Phase 1.5 contract is "provider field on cache registry" — meaning
 *   every cache can DECLARE which provider should refresh it, even if only
 *   anthropic-sonnet is fully real today. The stub returns ok:false +
 *   error:'NOT_IMPLEMENTED' so the orchestrator falls back to the default
 *   Anthropic-Sonnet adapter or skips the cache entry with a logged reason.
 *
 * Phase 2 task (deliverable 1) will replace this body with real calls. The
 * adapter contract (return shape) must NOT change — only the implementation.
 */

export async function refresh(cache, row, opts = {}) {
  return {
    ok: false,
    errors: [
      'NOT_IMPLEMENTED: perplexity-agent-api adapter is a Phase 1.5 stub. ' +
      'Phase 2 deliverable 1 will WebFetch docs.perplexity.ai/docs/agent-api ' +
      'first, then implement against the verified response shape.'
    ],
    providerMetadata: {
      stub: true,
      cache_id: cache.id,
      row_num: row.num,
      caller: opts.caller || null,
    },
    model: 'sonar-deep-research', // intended Phase-2 model
  };
}
