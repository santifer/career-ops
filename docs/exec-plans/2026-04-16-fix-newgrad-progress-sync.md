# Fix Newgrad Batch Progress Sync

**Date:** 2026-04-16
**Status:** implemented
**Owner:** Codex

## Background

The newgrad pending panel can show jobs as queued while the bridge is already advancing them through quick screen and deep evaluation.

Observed evidence from the current run:

- UI text: `Evaluation progress: 0/21 completed, 0 failed`
- Bridge logs show active work and completion:
  - one job finished after ~220s
  - other jobs advanced to `evaluating`, `extracting_jd`, and `codex exec report 142/143`

That means execution is progressing, but the injected panel is not staying in sync.

## Goal

Make the injected panel reflect real bridge progress for batch direct evaluations while it remains open.

## Scope

- Newgrad batch evaluation progress inside [`extension/src/panel/inject.ts`](/Users/hongxichen/Desktop/career-ops/extension/src/panel/inject.ts)
- Progress-copy cleanup directly caused by the new duplicate-dedup behavior
- Execution-plan documentation

Out of scope:

- Reworking bridge execution
- Persisting batch session state across tab reloads or panel recreation
- Replacing the single-job SSE flow

## Assumptions

- The bridge remains the source of truth for job status.
- The smallest reliable fix is for the injected panel to poll `/v1/jobs/:id` for queued/running batch jobs instead of relying only on background fan-out.
- Background push updates can remain in place; panel polling is a fallback and synchronization source, not a replacement for bridge state.

## Implementation Steps

1. Confirm where batch progress currently depends on background messages.
   Verify: inspect `newgradEvaluationProgress` handling and the absence of panel-owned polling for batch jobs.
2. Add panel-side polling for non-terminal batch jobs.
   Verify: inspect that seeded queued jobs now start a timer which refreshes queued/running items from `getJob`.
3. Keep UI state consistent when jobs finish.
   Verify: polling stops once all jobs are terminal and the recent jobs list refreshes.
4. Update duplicate-skip copy to match the new company/role dedup behavior.
   Verify: skip text no longer incorrectly says `duplicate pending URL` for company/role duplicates.

## Verification Approach

- `npm --prefix extension run typecheck`
- `npm run ext:build`
- Code inspection against the current failure mode: panel no longer relies solely on background-delivered progress events to move from `queued`

## Progress Log

- 2026-04-16: Confirmed a second issue after the duplicate-queue fix: bridge logs progressed while the injected panel still displayed `0/21 completed`.
- 2026-04-16: Traced the current panel flow to message-only updates for batch jobs; unlike the single-job UI, it had no panel-owned polling loop.
- 2026-04-16: Added panel-side polling for queued/running batch jobs via `getJob`, so the injected panel now refreshes bridge state even when background-delivered progress messages do not advance the UI.
- 2026-04-16: Updated duplicate-skip copy from `duplicate pending URL` to `duplicate pending job` to match the broader company/role dedup.
- 2026-04-16: Verified with `npm --prefix extension run typecheck` and `npm run ext:build`.

## Key Decisions

- Add a panel-local polling loop instead of trying to make the background worker own all batch progress delivery. The panel is the thing that renders the status, so it can safely ask the bridge for the current truth.
- Keep the current background progress messages. They can still provide faster updates when available.

## Risks And Blockers

- Polling issues one `getJob` request per queued/running job each cycle. That is acceptable for the current pending batch sizes but should be revisited if batches grow materially larger.
- This does not restore progress automatically after the panel is destroyed and recreated. It fixes the active-session sync gap while the panel stays open.

## Final Outcome

The injected panel no longer depends solely on background push messages for batch direct-evaluation progress. After seeding queued jobs, it now polls bridge job snapshots for all non-terminal jobs and re-renders from that source of truth until the batch reaches a terminal state.

Verification completed:

- `npm --prefix extension run typecheck`
- `npm run ext:build`
