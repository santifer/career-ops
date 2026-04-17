# Fix Newgrad Direct-Eval Duplicates

**Date:** 2026-04-16
**Status:** implemented
**Owner:** Codex

## Background

The extension's newgrad scan UI showed `21 queued for direct evaluation` even though the visible pending set was smaller and clearly contained duplicate company/role pairs from different source URLs.

Concrete evidence already written into the repo:

- [reports/130-naes-2026-04-16.md](/Users/hongxichen/Desktop/career-ops/reports/130-naes-2026-04-16.md)
- [reports/131-naes-2026-04-16.md](/Users/hongxichen/Desktop/career-ops/reports/131-naes-2026-04-16.md)

Those two reports are the same company and role (`NAES | Software Engineer 1`) evaluated twice from two different URLs during one direct-evaluation batch.

## Goal

Stop extension-driven direct evaluation from queueing the same company/role twice in one batch when the URLs differ.

## Scope

- Extension-side direct evaluation dedup for scan/pending batch runs
- Execution-plan documentation for the bug, fix, and verification

Out of scope:

- Cleaning up already-generated duplicate reports
- Changing bridge-side report/tracker merge behavior
- Reworking pipeline-level pending dedup

## Assumptions

- The intended product behavior is already established by the pending loader, which dedupes by both canonical URL and normalized company/role.
- The smallest safe fix is to align extension-side batch queue dedup with that existing behavior.

## Implementation Steps

1. Confirm the duplicate path in the extension queue code.
   Verify: locate the direct-evaluation dedup function and compare it against the observed duplicate reports.
2. Update direct-evaluation dedup so a batch skips entries when either the canonical URL or normalized company/role was already seen.
   Verify: inspect the changed helper + queue loop logic.
3. Run targeted verification.
   Verify: extension typecheck/build succeed and the plan records the outcome.

## Verification Approach

- Static verification: `npm --prefix extension run typecheck`
- Build verification: `npm run ext:build`
- Behavioral verification: repo evidence plus code-path inspection showing that `NAES`, `Intuit`, and `Dassault Systèmes` style duplicates now collapse before queueing

## Progress Log

- 2026-04-16: Read project instructions, Codex routing docs, and the existing evaluate-scaling plan.
- 2026-04-16: Confirmed the user-visible symptom: direct evaluation queued duplicate company/role rows (`NAES`, `Intuit`, `Dassault Systèmes`) from distinct URLs.
- 2026-04-16: Confirmed duplicate artifact generation via [reports/130-naes-2026-04-16.md](/Users/hongxichen/Desktop/career-ops/reports/130-naes-2026-04-16.md) and [reports/131-naes-2026-04-16.md](/Users/hongxichen/Desktop/career-ops/reports/131-naes-2026-04-16.md).
- 2026-04-16: Traced root cause to extension-side `directEvaluationDedupKey()`, which returns canonical URL when available and therefore never falls back to company/role dedup for cross-source duplicates.
- 2026-04-16: Patched extension-side direct evaluation to keep separate seen-sets for canonical URLs and normalized `company|role`, skipping duplicates when either key repeats inside the same batch.
- 2026-04-16: Verified with `npm --prefix extension run typecheck` and `npm run ext:build`.

## Key Decisions

- Fix the dedup at the extension queue boundary instead of adding more downstream cleanup. This prevents wasted evaluations instead of merely masking their artifacts later.
- Keep the change surgical: no prompt, tracker, or bridge merge changes in this patch.

## Risks And Blockers

- Existing duplicate reports remain on disk after the fix. They should be treated as prior-run artifacts, not evidence that the patched queue still duplicates work.
- There may still be cross-run duplicates if a role re-enters from a later scan and no stronger report/tracker guard blocks it. That is separate from the one-batch duplicate queue bug fixed here.

## Final Outcome

Direct-evaluation batches now dedupe on both canonical URL and normalized `company|role` before queueing. This closes the specific failure mode that produced duplicate same-role evaluations like the two NAES reports from one run.

Verification completed:

- `npm --prefix extension run typecheck`
- `npm run ext:build`
