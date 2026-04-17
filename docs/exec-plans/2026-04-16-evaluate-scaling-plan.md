# Evaluate Scaling Plan

**Date:** 2026-04-16
**Status:** implemented
**Owner:** Codex

## Goal

Make extension-driven Evaluate workable for 100+ newgrad-scan candidates by:

1. sending far fewer low-value jobs into full evaluation,
2. preventing duplicate evaluations across scans,
3. replacing accidental serial bottlenecks with explicit backpressure,
4. keeping report quality for the small set that actually matters.

## Progress Log

- 2026-04-16: verified extension -> bridge -> adapter call chain.
- 2026-04-16: confirmed token burn happens in `/v1/evaluate` jobs, not in `enrichNewGradRows`.
- 2026-04-16: confirmed duplicate-eval gaps and double-throttling in current implementation.
- 2026-04-16: implemented canonical URL dedup for pipeline/history/report URLs.
- 2026-04-16: changed direct newgrad evaluation to operate on `entries` instead of all `candidates`.
- 2026-04-16: added bridge-side evaluation worker pool with configurable concurrency and intake RPM.
- 2026-04-16: removed extension-side `3/min` queue throttle.
- 2026-04-16: tightened user profile gating (`pipeline_threshold: 7`, `max_years_experience: 2`).
- 2026-04-16: added a structured detail-page value scorer that reads webpage elements before full Evaluate.
- 2026-04-16: verified with full bridge test suite, bridge typecheck, extension typecheck, and extension build.
- 2026-04-16: smoke-ran 10 pending newgrad evaluations through the bridge; intake queued all 10 and worker pool held execution at 2 concurrent jobs.
- 2026-04-16: stopped the smoke run after two real Codex reports hit the same finalization bug (`Evaluacion` heading not parsed), then fixed the parser and added a regression test.
- 2026-04-16: added pending-stage filtering for report-URL dedup, blocker-company memory, commented `portals.yml` negative keywords, no-sponsorship / clearance phrases, and company-role dedup.
- 2026-04-16: removed `scan-history.tsv` fallback from direct pending evaluation; pending now only reflects real `pipeline.md` entries.
- 2026-04-16: made pending-stage replay respect the current `newgrad_scan.pipeline_threshold`, so legacy low-score rows no longer bulk-enter evaluation.
- 2026-04-16: expanded profile blockers for defense / ITAR-heavy companies and title negatives like `Top Secret`, `Work-Study`, and `No Tech Experience`.
- 2026-04-16: real pending set dropped from 255 -> 228 -> 198 -> 100 -> 18 after successive funnel fixes and profile tightening.
- 2026-04-16: reran a real 10-job smoke test on the filtered pending set; jobs still queued instantly, worker pool stayed capped at 2 concurrent jobs, and reports 099/100 finalized successfully before the run was interrupted.
- 2026-04-16: reduced single-job evaluation overhead by truncating local JD cache before prompt assembly and skipping `codex --search` when local JD context is rich enough.
- 2026-04-16: changed extension bulk pending evaluation to prefer entries with value-score evidence or richer local JD context, while still allowing high local-score legacy entries through.
- 2026-04-16: changed bulk pending evaluation to pre-hydrate weak-context legacy URLs in a hidden tab and skip them if local context still stays too thin; explicit/manual evaluations still keep the old force-run behavior.
- 2026-04-16: aligned bridge local-only threshold with extension hydration heuristics (`1200` chars), so hydrated pending entries stop falling back to `codex --search` unnecessarily.
- 2026-04-16: made `jds/*.txt` caches richer by writing structured detail-page fields alongside description and allowing short descriptions to persist when the combined local JD cache is still substantive.
- 2026-04-16: added legacy pending local-cache backfill so hidden-tab-captured JD text is persisted into `jds/*.txt` and written back to `data/pipeline.md` as `[local:jds/...]` for future runs.
- 2026-04-16: added a one-shot batch warm entry for legacy pending cache, both in the extension pending panel and as `npm run pending:warm-cache` for terminal-driven backfills.
- 2026-04-16: added a scan-specific `newgrad_quick` evaluation mode so bulk scan jobs run a compact screening prompt first instead of immediately paying for the full A-G Codex worker.
- 2026-04-16: extension bulk evaluation now ships structured page-element signals (seniority, salary, sponsorship, clearance, skills, responsibilities, local value score) plus a smaller JD snapshot; only quick-screen winners escalate to the deep evaluator.
- 2026-04-16: added a deterministic bridge-side local precheck ahead of quick-eval; obvious hard blockers and low local value scores now write `quick-screen` skip artifacts without launching Codex.
- 2026-04-16: tightened canonical URL dedup for Oracle/Phenom-style job URLs and added extension-side batch dedup so the same requisition is not queued twice in one pending replay.
- 2026-04-16: reduced structured-signal noise by preferring explicit metadata and title cues for employment type / seniority instead of scanning arbitrary JD body text for `intern` / `senior`.
- 2026-04-16: tightened clearance detection across pending/scoring/quick-screen/extractor paths so only active-current Secret / Top Secret / TS-SCI style requirements block; `preferred`, `ability to obtain`, and generic `security clearance` wording no longer trip the funnel.
- 2026-04-16: fixed newgrad list extraction stalling at the first visible batch by making hidden-tab scrolling wait for actual row mutations and by broadening scroll-container detection on Jobright's embedded list.

## Verified Findings

1. The extension evaluates `mergedResult.candidates`, not only `mergedResult.entries`.
   - Effect: rows skipped from pipeline insertion can still be sent to full evaluation.
2. The extension has a client-side `3/min` queue throttle.
   - Effect: 100 jobs take ~33 minutes just to be accepted by the bridge.
3. The bridge has a second `3/min` server-side rate limit, but no worker queue.
   - Effect: accepted jobs immediately start background execution with no concurrency cap.
4. The current local scorer is intentionally broad.
   - `role_keywords.weight = 3`, `pipeline_threshold = 5`, `freshness.within_24h = 2`.
   - A recent role with one weak skill hit already qualifies for full evaluation.
5. Dedup is incomplete.
   - Tracker dedup exists.
   - Scan-history dedup exists for listing URLs / company-role pairs.
   - Pipeline URL dedup exists but is raw-string based.
   - Report dedup by normalized external URL does not exist.
6. Existing reports already show duplicate evaluations for normalized URLs.

## Root Cause

The system is missing a real funnel.

- Stage 1 local filtering is too permissive.
- Stage 2 dedup only partially protects the pipeline, not full evaluation.
- Stage 3 evaluation intake is throttled twice but execution itself is unbounded.

That combination wastes tokens on jobs that should never have reached the evaluator, then makes the remaining good jobs wait too long.

## Recommended Architecture

### Phase 1: Shrink the candidate set before LLM

Add a deterministic **value gate** before `createEvaluation()`:

1. **Hard relevance blockers**
   - senior / staff / principal / lead / manager
   - 3+ / 5+ / 7+ years when clearly required
   - explicit non-sponsorship / active clearance (already partly covered)
2. **Quality gate**
   - require title match plus stronger skill evidence, not just freshness + one substring hit
3. **Comp gate**
   - only when salary is explicit and below minimum target
4. **Age gate**
   - keep existing `<24h` scan gate; optionally allow `<72h` only for very high-fit roles

Target outcome: 100 raw rows -> 15-30 full evaluations.

### Phase 2: Make dedup authoritative

Create one normalized dedup source used by scan history, pipeline, and reports:

- canonical URL normalization strips hash and tracking params
- scan history uses canonical URLs
- pipeline URLs are loaded canonically
- reports expose canonical URL set
- full evaluation checks dedup **before** queueing

Most important behavior change:

- direct evaluation must use `entries` by default, not `candidates`
- jobs skipped from pipeline insertion must not be evaluated again unless explicitly forced

### Phase 3: Replace accidental throttling with explicit backpressure

Use a bridge-side worker pool:

- intake can accept jobs quickly,
- execution concurrency is capped at `N`,
- queued jobs remain visible as `queued`,
- workers pull FIFO jobs when capacity frees up.

Recommended defaults:

- `evalConcurrency = 2` for CLI-backed real mode,
- higher only after measuring CPU, memory, and CLI stability.

Then remove the extension's sliding-window `3/min` throttle.

Reason: client-side throttling should not serialize work when the server already owns execution capacity.

### Phase 4: Keep full eval expensive, but only for finalists

Do not try to make the full evaluator cheap first.

The prompt stack is inherently heavy because each evaluation needs:

- shared mode instructions,
- offer rubric,
- user profile/customization,
- CV/proof points,
- JD text.

The winning move is to run that expensive path fewer times, not to optimize it before fixing funnel quality.

## Concrete Change List

1. Add `normalizeEvaluationUrl()` in a shared bridge module.
2. Add `loadReportUrls()` based on report header `**URL:**`.
3. Change `runDirectNewGradEvaluations()` input to default to `mergedResult.entries`.
4. Add pre-queue skip reason `already_evaluated`.
5. Add worker-pool queue in `bridge/src/server.ts`.
6. Replace fixed `3/min` evaluate rate limit with configurable intake RPM.
7. Extend `newgrad_scan.hard_filters` with seniority / years-of-experience blockers.
8. Raise the gate from today's broad score semantics to a stricter value gate.

## Rollout Order

1. **Dedup correctness first**
   - prevents immediate token waste
   - lowest product risk
2. **Worker pool + remove extension throttle**
   - fixes throughput and concurrency control
3. **Value gate tightening**
   - biggest token savings
   - needs tuning against real candidate preferences
4. **Optional prompt/JD trimming**
   - only after the funnel is correct

## Success Metrics

1. Duplicate normalized report URLs from scan-driven evaluate: `0`
2. Median queued-to-start delay at 100 candidates: `< 2 min`
3. Full evaluations per 100 promoted scan rows: `< 30`
4. No increase in user-marked false negatives on desirable roles

## Implementation Notes

- Report dedup now happens in bridge enrich before pipeline append.
- Pipeline/history URL sets now normalize tracking params before dedup.
- Worker-pool defaults are `evalConcurrency=2` and `evalRPM=30`, both env-configurable.
- Full evaluation now runs only on true enrich survivors (`entries`), not the broader candidate set.
- Structured detail-page fields now feed a deterministic `0-10` value gate before pipeline append and full evaluation.
- The value gate uses site match percentages, seniority labels, skill tags, recommendation tags, salary range, sponsorship signals, and posting completeness.
- User tuning lives in `config/profile.yml` via `newgrad_scan.detail_value_threshold` and `compensation.minimum`.
- Real Codex smoke run confirmed intake/backpressure behavior: 10 accepted quickly, 2 evaluating, 8 queued.
- Real Codex reports may use unaccented Spanish headings (`# Evaluacion:`); parser now accepts that alongside `# Evaluación:` and `# Evaluation:`.
- Pending-stage replay no longer trusts legacy `scan-history` promotions with no local JD / value score, because those rows materially increase token burn without improving report quality.
- For rich local JD inputs, Codex now runs in local-only mode instead of defaulting to web search, which cuts per-job latency and token burn on already-enriched jobs.
- Bulk pending replay now tries one local hidden-tab capture before queueing a thin-context legacy entry; if that still fails to produce enough JD text, the extension skips it instead of paying full-eval cost for a low-information job.
- Bridge local-only eligibility now starts at the same `1200`-char threshold used by extension-side pending hydration, reducing false trips into the slower search-heavy Codex path.
- Future pending replay now benefits from thicker `jds/*.txt` caches because local JD files include structured requirements, responsibilities, tags, and company context instead of only raw description text.
- Legacy pending replay now closes the loop: when the extension hydrates a thin old pending row in a hidden tab, it calls back into the bridge to persist that JD locally and patch the original `pipeline.md` row, so subsequent runs reuse local cache instead of repeating browser capture or web search.
- For one-shot cleanup of existing history, `npm run pending:warm-cache` walks current pending rows that still lack `local:jds/...`, captures page text sequentially with Playwright, and batches the backfill through the bridge.
- Bulk newgrad evaluation now has two stages: local signal extraction / JD compression in the extension, then a compact quick screen in the bridge. Only `decision=deep_eval` runs the heavyweight full worker.
- Low-value quick screens now write a short markdown report plus a `SKIP` tracker row so the same pipeline entry does not keep coming back as pending.
- The newest local precheck sits one step earlier than the model quick-screen: if structured signals already prove `no sponsorship`, `restricted work authorization`, `active clearance`, `salary below minimum`, `experience above limit`, or `local value score below threshold`, the bridge skips Codex entirely and persists the skip deterministically.

## Non-Goals

- Rewriting the evaluator prompt
- Replacing the report format
- Parallelizing `enrichNewGradRows`
- Increasing browser-tab enrichment concurrency beyond current UX constraints
