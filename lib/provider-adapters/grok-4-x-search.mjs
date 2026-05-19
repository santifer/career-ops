/**
 * lib/provider-adapters/grok-4-x-search.mjs — xAI Grok-4 with X/Twitter
 * search adapter. PHASE-1.5 STUB. Returns NOT_IMPLEMENTED until Phase 2.
 *
 * EPSILON's morning-handoff note flagged this: Grok-x-search returned 0
 * citations on both 2026-05-19 ATS-landscape attempts even with explicit
 * search-forcing prompts. Phase 2 implementation MUST:
 *   1. WebFetch docs.x.ai/api FIRST to verify the live-search Tool surface
 *      area (the search tool was apparently regressed as of 2026-05-19)
 *   2. Probe the API with a known-recent query and verify citation count
 *      in the response BEFORE writing adapter logic
 *   3. If still broken: log NEEDS_HUMAN and fall back to perplexity-agent
 *      with WebFetch corroboration (per EPSILON's recommendation)
 *
 * Phase 2 deliverable 1: replace this body with real calls. Adapter
 * contract (return shape) must NOT change.
 */

export async function refresh(cache, row, opts = {}) {
  return {
    ok: false,
    errors: [
      'NOT_IMPLEMENTED: grok-4-x-search adapter is a Phase 1.5 stub. ' +
      'Phase 2 deliverable 1 will WebFetch docs.x.ai/api first, probe the ' +
      'live-search Tool surface, and only then implement. Known regression ' +
      '(2026-05-19 EPSILON): live-search returned 0 citations.'
    ],
    providerMetadata: {
      stub: true,
      cache_id: cache.id,
      row_num: row.num,
      caller: opts.caller || null,
    },
    model: 'grok-4-1-fast-reasoning', // intended Phase-2 model
  };
}
