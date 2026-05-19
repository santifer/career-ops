# Phase 2 — Multi-provider routing + verifier lane complete (2026-05-19)

## What shipped (8/8 deliverables)

1. **Real Perplexity Agent + Grok-x adapters** — `lib/provider-adapters/perplexity-agent-api.mjs` + `lib/provider-adapters/grok-4-x-search.mjs`. Both went through the anti-hallucination mandate FIRST: WebFetch `docs.perplexity.ai/api-reference/chat-completions-post` + `docs.x.ai/docs/api-reference` BEFORE writing adapter code. Verified response shapes: Perplexity returns `j.choices[0].message.content` + `j.citations[]` (array of URL strings); Grok returns the same shape via `/v1/chat/completions` with `search_parameters` controlling live web/X search. Both adapters return the unified contract `{ ok, contentJson, costUsd, providerMetadata, sourceUrls, model }`. Grok adapter surfaces `regression_flag_zero_citations` so the verifier can fall back when EPSILON's 2026-05-19 live-search regression is active.
2. **Per-cache provider routing** — `lib/refresh-cache-registry.mjs` now routes each cache to its natural-home provider:
   - `hm_intel_delta` → anthropic-sonnet (with cached Mitchell corpus)
   - `toxicity_composite` → **perplexity-agent** (Sonar Deep, $4/call, live Glassdoor/Blind/Reddit/X search) + verifier=grok-4-x-search
   - `positioning` → anthropic-sonnet (craft-heavy, low citation density)
   - `role_enrichment` → **perplexity-agent** (Sonar Pro, $1.5/call) + verifier=anthropic-sonnet
   - `hm_intel_deep` / `company_pulse` → kept on legacy shell-out handlers (will move to adapters in Phase 3 deep-event watchers)

   Verified live via `node scripts/refresh-master.mjs --plan`: tag `[perplexity-agent]` now visible in queue output.

3. **Cross-architecture verifier lane** — `lib/refresh-verifier.mjs`. Every adapter-routed cache write goes through a verifier from a DIFFERENT architectural family (anthropic↔perplexity↔xai). Verifier prompt: "Does writer output match the cache's documented schema? Are factual claims backed by URLs? Does it contradict prior cached version in any material way?" Verifier returns PASS / FLAG / REJECT. FLAG → escalateToCouncil. Wired into `scripts/refresh-master.mjs` execute path: on PASS, write proceeds; on FAIL, write blocked + logged + skipped (Phase 3 will adjudicate via council-3 instead of skipping).

4. **Dynamic council size** — `lib/council-dispatch.mjs`. `pickTier()` returns routine|contested|deep based on layer + event + statusChange. `LINEUP_1 = [sonnet]`, `LINEUP_3 = [sonnet, sonar-deep, grok-x]`, `LINEUP_7 = full fan-out`. Used by verifier lane (verifier_disagreement → contested) + Phase 3 event watchers (status→Interview/Offer → deep) + drawer "↻ Deep refresh" CTA → deep.

5. **Shared research-artifact layer** — `lib/research-artifacts.mjs`. New cache type at `data/research-artifacts/<slug>.json`. ONE perplexity-agent call per (company, role) builds a superset artifact covering people + sentiment + comp + benefits + evidence_anchors. `deriveHmIntelView()` + `derivePositioningSeed()` cheaply derive consumer-specific views without re-calling the model. Cuts ~3× duplicate retrieval cost across the three consumer caches.

6. **Anthropic Batch API helper** — `lib/anthropic-batch-helper.mjs`. `submitBatch()` / `pollBatch()` / `fetchBatchResults()` / `buildBatchRequest()`. Non-urgent B/C-tier Layer 2 refreshes can be submitted for 50% cost reduction with 24h SLA. State persisted at `data/batch/anthropic-batches.json`. Uses the same Phase 1.5 cache_control: ephemeral pattern in `buildBatchRequest()` so caching benefits both real-time and batch refreshes.

7. **Diff-aware writes** — folded into `lib/cache-write-validator.mjs` from Phase 1.5. Trigram-Jaccard structural drift vs prior cached version; >20% drift triggers a warning (Phase 2 surfacing). Phase 3 will escalate >20% drift to verifier+council adjudication BEFORE write.

8. **Temporal coherence checks** — folded into `lib/cache-write-validator.mjs`. "as of X" claim where retrieved_at lags X by >90 days (configurable per cache via `temporalCoherenceMaxDays`) → flag as stale-claim-as-fresh warning.

## Anti-hallucination on MY OWN work

Per the Global Charter, I applied the same anti-hallucination protocol to my Phase 2 implementation:

- **Provenance-first commits.** Every Phase 2 commit message names file paths + design source (refresh-master Phase 2 deliverable N).
- **WebFetch'd API docs BEFORE writing adapter code.** docs.perplexity.ai/api-reference confirmed endpoint=`/chat/completions`, citations=array of URL strings, models=sonar/sonar-pro/sonar-deep-research/sonar-reasoning-pro. docs.x.ai/docs/api-reference confirmed endpoint=`/v1/chat/completions`, citations same shape, live search via `search_parameters.mode = on`. Cross-referenced against existing council.mjs:736 (Perplexity) + 218,857 (Grok) — same endpoints, same auth pattern. No fabricated API behavior.
- **Identity-lock holds.** `node lib/identity-lock.mjs --check` returns ok:true (Mitchell-only files unchanged).
- **Drift tripwires clear.** `node lib/metric-drift-tripwire.mjs --check` returns 0 tripwires.
- **Refuse to commit on insufficient signal.** Both adapters return ok:false with explicit NEEDS_HUMAN when their API key is missing rather than fabricating a response.

## NEEDS_HUMAN flags

1. **PERPLEXITY_API_KEY + XAI_API_KEY confirmation.** Both adapters require these in `.env`. If absent, refresh-master will continue with anthropic-sonnet fallback and log the NEEDS_HUMAN error per cache. Verify both keys present before flipping `config/refresh-policy.yml: budget.dry_run=false`.
2. **Grok-x-search live-search regression (EPSILON 2026-05-19).** Adapter surfaces `regression_flag_zero_citations` in providerMetadata. If the regression persists, verifier-lane will reject grok-x writes and fall back to perplexity-agent. Mitchell may want to wait for an xAI fix before routing toxicity verifier through grok-x.

## End-to-end verification

`node scripts/refresh-master.mjs --plan` runs clean. Queue shows mixed providers: `[anthropic-sonnet]` for hm_intel_delta + positioning, `[perplexity-agent]` for toxicity_composite + role_enrichment. Projected cost $101.50 across 42 queued items (was $94 in Phase 1.5; +7.5 because per-call cost for toxicity is now $4 instead of $1, since the natural-home provider is more expensive but produces verified-citation output). Dashboard rebuild clean.

— refresh-ecosystem orchestrator, Phase 2
