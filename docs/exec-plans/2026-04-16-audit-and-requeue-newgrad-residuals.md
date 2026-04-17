# Audit And Requeue Newgrad Residuals

**Date:** 2026-04-16
**Status:** completed
**Owner:** Codex

## Background

The user asked for two things:

1. inspect the real completion status of the recent `21 queued for direct evaluation` batch,
2. evaluate the previously scanned jobs that did not enter evaluation.

The bridge logs already showed active work, but the panel UI had been stale. That required checking the repository and bridge state directly rather than trusting the panel.

## Goal

- Produce a repo-backed completion audit for the recent 21-job batch.
- Identify the residual previously scanned newgrad jobs that remain unevaluated in `data/pipeline.md`.
- Queue that residual set for bridge evaluation using existing project machinery.

## Scope

- Operational audit of recent reports / tracker rows / pipeline state
- Residual-set identification from `data/pipeline.md`
- Bridge intake for the residual set
- Thread follow-up scheduling because the batch will run longer than one turn

Out of scope:

- Changing evaluation scoring rules
- Editing existing historical tracker rows by hand
- Removing old pending lines from `data/pipeline.md`
- Waiting synchronously for the full residual batch to finish

## Assumptions

- The repository is the source of truth, so completion is determined from `reports/`, `data/applications.md`, bridge health, and pipeline residue.
- "Previously scanned but not evaluated" is interpreted as unchecked `via newgrad-scan` pipeline entries that still do not have a corresponding tracker row, after normalized company/role dedup.
- The safe operational path is to queue the residual set into the existing bridge worker pool rather than invent a second processing path.

## Implementation Steps

1. Audit the 21-job batch from reports and tracker.
   Verify: confirm whether report generation and tracker merge completed.
2. Compute the raw unevaluated residual set from `data/pipeline.md`.
   Verify: exclude entries already represented in `data/applications.md`, then dedupe by normalized company/role.
3. Queue the residual set through `/v1/evaluate`.
   Verify: bridge accepts the jobs and records successful queue intake.
4. Attach a thread heartbeat for later completion follow-up.
   Verify: automation is created and active.

## Verification Approach

- `curl /v1/health` with the local bridge token
- repo inspection of [`data/applications.md`](/Users/hongxichen/Desktop/career-ops/data/applications.md#L1) and recent [`reports/`](/Users/hongxichen/Desktop/career-ops/reports)
- residual-set counts computed directly from `data/pipeline.md`
- bridge intake results recorded from the queueing script

## Progress Log

- 2026-04-16: Read project instructions, career-ops routing skill, and pipeline mode docs.
- 2026-04-16: Confirmed the local bridge is healthy and running in `real/codex` mode.
- 2026-04-16: Confirmed the recent 21-job batch actually progressed via reports `129` through `149` and corresponding tracker rows.
- 2026-04-16: Corrected the residual-set parser to read the tracker table columns correctly and to parse `pipeline` lines with the Unicode `—` separator.
- 2026-04-16: Recomputed the residual set from unchecked `via newgrad-scan` lines in `data/pipeline.md`; 94 raw rows remain, 93 after normalized company/role dedup.
- 2026-04-16: Queued all 93 deduped residual entries through the bridge with zero intake failures; summary saved to `/tmp/newgrad-residual-requeue-summary.json`.
- 2026-04-16: Captured a post-queue snapshot: 13 of the residual entries already landed in `data/applications.md` as `SKIP`, while 80 remain in flight.
- 2026-04-16: Created the thread heartbeat automation `residual-eval-check` to keep checking the batch until it finishes.
- 2026-04-16: Final heartbeat audit confirmed the residual batch is fully evaluated: all 93 queued entries now have report artifacts `150` through `242`, with 0 queue failures and 0 jobs still missing both report and tracker state.
- 2026-04-16: Current merge snapshot: 70 residual entries are already present in `data/applications.md` (`65` `SKIP`, `5` `Evaluated`), while 23 additional entries have report files but have not yet appeared in the tracker table.
- 2026-04-16: Pipeline state remains stale for this batch: the original unchecked `via newgrad-scan` lines are still present in `data/pipeline.md` (94 raw lines / 93 deduped keys), so pipeline residue is not a reliable completion signal.

## Key Decisions

- Use repo state instead of panel state for audit.
- Define the residual set from raw pipeline leftovers, not the bridge's current pending endpoint, because the current pending reader already filters that set down to zero under newer gating rules.
- Requeue through the existing bridge so evaluation continues to use the current worker pool, report generation, and tracker merge path.
- Fix the audit script inputs instead of trusting the first residual count; the initial 95-count was caused by parsing the tracker markdown table with the wrong column offsets and by not handling the Unicode separator in `pipeline`.

## Risks And Blockers

- 93 residual jobs is a large batch. Queue intake is feasible, but total completion will outlive this turn.
- Most residual rows do not have local JD cache, so many evaluations will require live extraction and may finish slowly or fail on inaccessible pages.
- Some residual rows may be weak or obviously blocked roles; the user explicitly asked to evaluate the leftovers anyway.
- Report generation can finish ahead of tracker merge, so `reports/` is currently the authoritative completion signal for this batch.

## Final Outcome

Completion audit and residual queueing are done.

- Recent direct-eval batch: confirmed complete in repo state via reports `129` through `149` and tracker rows `83` through `97`.
- Residual requeue: 93 deduped unchecked `via newgrad-scan` entries were accepted by the bridge, with 0 queue-intake failures.
- Residual batch completion: all 93 queued entries now have report artifacts `150` through `242`; there are 0 residual jobs still missing both report and tracker state.
- Final repo snapshot: 70 residual entries are merged into `data/applications.md` (`65` `SKIP`, `5` `Evaluated`), and 23 more are report-complete but not yet reflected in the tracker table.
- Follow-up: the monitoring heartbeat can be deleted because the evaluation batch itself is done.
