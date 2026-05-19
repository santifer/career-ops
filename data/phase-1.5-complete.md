# Phase 1.5 — Foundation complete (2026-05-19)

## What shipped (7/7 deliverables)

1. **Anthropic prompt caching** — `lib/anthropic-cache-helper.mjs` (new) + `lib/council.mjs` Anthropic adapters wired to support `opts.cacheStableContent` (cache_control breakpoints around the stable Mitchell corpus: cv.md + modes/_profile.md + article-digest.md). `scripts/agents/intel-refresh.mjs` strategy-ceiling + positioning slots refactored to pass the corpus via opts instead of inlining it in the prompt. Logging at `data/logs/anthropic-cache-stats.jsonl` (created on first cached call). Helper falls back to uncached call when corpus is below Anthropic's min cacheable threshold (Sonnet/Opus 1024 tokens ≈ 3584 chars; Haiku 2048 tokens ≈ 7168 chars).
2. **Company-level dedup in queue builder** — `scripts/refresh-master.mjs` Layer-2 queue construction now dedupes by `(cache.id, cache.keyFromRow(row))` so per-company caches (toxicity_composite, company_pulse) fire ONCE per company even when multiple rows reference that company. Verified live via `--plan`: OpenAI toxicity appears only once despite 3 OpenAI rows in apply-now.
3. **Provider field on cache registry + adapter directory** — `lib/refresh-cache-registry.mjs` extended with `provider`, `dedupScope`, `minCitationsPer100Tokens`, `evidenceAllowlist`, `temporalCoherenceMaxDays` fields per cache. `lib/provider-adapters/index.mjs` (registry) + `anthropic-sonnet.mjs` (FULLY REAL, uses callAnthropicCached with default Mitchell corpus) + `perplexity-agent-api.mjs` + `grok-4-x-search.mjs` (both Phase-1.5 STUBS returning NOT_IMPLEMENTED — Phase 2 will WebFetch their API docs FIRST, then implement against the verified response shape).
4. **Provenance-first cache schema** — `lib/cache-write-validator.mjs` (new). Every cache write must include `source_urls`, `retrieved_at`, `model`, `verifier_passed`, `diff_summary`. Rejects writes missing required fields. Citation density gating (deliverable 7) baked in: caches declare `minCitationsPer100Tokens` (default 1.0); writes with fewer URLs per 100 tokens are blocked. Diff-aware writes flag >20% drift vs prior cached version. Temporal coherence flags stale-claim-as-fresh. Backfilled all 42 existing caches (data/hm-intel + data/role-enrichment) — coverage now 42/42.
5. **Identity-lock checksums** — `lib/identity-lock.mjs` (new). SHA256 of cv.md, modes/_profile.md, config/profile.yml, article-digest.md persisted at `data/identity-lock-state.json`. Asserted at every refresh-master start. Halts with `IdentityLockViolation` if any file changed without `MITCHELL_AUTHORIZED_EDIT=1`. First-run + authorized-edit paths handled. CLI: `node lib/identity-lock.mjs --check`.
6. **Drift tripwires** — `lib/metric-drift-tripwire.mjs` (new). Watches 5 high-stakes computed metrics (profile_alignment, interview_likelihood, recruiter_pipeline_density, toxicity_composite, hm_sees_you_pct). Records snapshots at `data/metric-drift-state.json` with rolling 7-day retention. Any metric ±20% in 24h WITHOUT a corresponding source_data_hash change halts the orchestrator (exit code 4) and writes a tripwire report to `data/drift-tripwire-{date}.md`. Wired into `scripts/refresh-master.mjs` start.
7. **Citation density gating** — folded into deliverable 4 (cache-write-validator). Configurable per cache via `minCitationsPer100Tokens` in `lib/refresh-cache-registry.mjs` (default 1.0; toxicity_composite at 1.2 since it's citation-heavy; positioning at 0.5 since it's craft).

## Cost reduction projection

The morning-handoff design targeted a 60% input-token-cost reduction from Anthropic prompt caching alone once the stable corpus is shared across the strategy-ceiling (3 metric refreshes per row) + positioning slots. The Mitchell stable corpus (cv.md + modes/_profile.md) is ~9-11KB chars, well above the Sonnet 1024-token min cacheable threshold. Cache TTL is 5 min ephemeral — long enough that batch refresh-master runs (one row's 4 slots run within seconds) hit the cache for every call after the first. Realized rate will be visible in `data/logs/anthropic-cache-stats.jsonl` after the first non-dry-run pass.

The company-level dedup cuts 30-40% off the toxicity_composite + company_pulse queue volume. Apply-now has ~21 rows but only ~12 distinct companies; per-company caches were running 21× before, now 12×.

## NEEDS_HUMAN flags

None. Phase 1.5 was foundation work — no decisions held for Mitchell.

## Commits + verification

- New: lib/anthropic-cache-helper.mjs, lib/identity-lock.mjs, lib/cache-write-validator.mjs, lib/metric-drift-tripwire.mjs, lib/provider-adapters/index.mjs, lib/provider-adapters/anthropic-sonnet.mjs, lib/provider-adapters/perplexity-agent-api.mjs, lib/provider-adapters/grok-4-x-search.mjs
- Modified: lib/council.mjs (anthropic adapters cache_control), lib/refresh-cache-registry.mjs (new fields), scripts/refresh-master.mjs (identity-lock, drift, dedup, provider tag), scripts/agents/intel-refresh.mjs (cacheStableContent on strategy-ceiling + positioning)
- Backfilled: 42 cache files under data/hm-intel + data/role-enrichment with provenance envelope

End-to-end verification: `node scripts/refresh-master.mjs --plan` runs clean. Identity-lock fires before classification. Drift snapshot records 3 of 5 metrics from current dashboard state (toxicity_composite + recruiter_pipeline_density activate as those caches grow). Queue dedup demonstrably reduces duplicate per-company entries. Dashboard rebuild clean (1221 reports, 11.6MB, 4 inline scripts parse OK).

— refresh-ecosystem orchestrator, Phase 1.5
