# Newgrad Batch Reliability Summary

**Status:** completed
**Scope Covered:** 2026-04-16 newgrad direct-evaluation reliability fixes and residual batch audit

## Background

The newgrad direct-evaluation path had three related operational problems:

1. one batch could queue the same company/role twice from different URLs,
2. the injected panel could stay stuck at `0/N completed` while the bridge was already advancing jobs,
3. residual `via newgrad-scan` jobs remained unevaluated and needed a repo-backed audit plus controlled requeue.

These fixes were part of the broader evaluation-funnel hardening tracked in `2026-04-16-evaluate-scaling-plan.md`, but the step-by-step execution detail no longer needs to stay in the top-level plan surface.

## Scope Covered

This summary consolidates the completed detail from:

- `2026-04-16-fix-newgrad-direct-eval-duplicates.md`
- `2026-04-16-fix-newgrad-progress-sync.md`
- `2026-04-16-audit-and-requeue-newgrad-residuals.md`

Related higher-level context that remains top-level:

- `2026-04-16-evaluate-scaling-plan.md`

## Key Decisions

- Deduplicate direct-evaluation batches at the extension queue boundary using both canonical URL and normalized `company|role`, instead of relying on downstream cleanup.
- Treat the bridge as the source of truth for batch progress and let the panel poll bridge job snapshots while it stays open.
- Use repository state, not panel state, to audit residual work and batch completion.
- Requeue residual unevaluated jobs through the existing bridge worker path instead of inventing a side channel.

## Implemented Changes

- Direct evaluation now skips same-batch duplicates when either the canonical URL or normalized company/role repeats.
- The injected panel now polls `/v1/jobs/:id` for queued and running batch jobs so progress stays in sync with bridge execution.
- Duplicate skip copy was updated to match broader `company|role` dedup behavior.
- Residual newgrad jobs were recomputed from `data/pipeline.md` using normalized dedup and requeued through the bridge with corrected parsing.
- The residual audit established that report artifacts are the authoritative completion signal when tracker merge lags behind report generation.

## Verification Completed

- `npm --prefix extension run typecheck`
- `npm run ext:build`
- bridge health check via `/v1/health`
- repository audit of `reports/`, `data/applications.md`, and `data/pipeline.md`
- residual queue intake verification with zero bridge queue-intake failures

## Open Issues

- Historical duplicate reports created before the dedup fix remain on disk unless cleaned up separately.
- Batch progress polling scales linearly with queued/running jobs and should be revisited if batch sizes increase materially.
- `data/pipeline.md` residue is not a reliable completion signal for this workstream; completion should be confirmed from reports and tracker state.

## Next Recommended Steps

- Keep using `2026-04-16-evaluate-scaling-plan.md` as the high-signal overview for the broader newgrad evaluation funnel.
- Run future plan consolidations on other completed multi-file workstreams once they cross the same threshold.
- If duplicate historical reports become operationally confusing, handle them in a separate cleanup pass rather than inside the queue-boundary fix.

## Archived References

- `docs/exec-plans/archive/stub-manifest.md` (newgrad reliability detail replacements)
