# Newgrad 24h Scan Completion Fix

## Background

The browser extension's newgrad scanner extracts rows from `newgrad-jobs.com`/Jobright, scores recent rows, enriches promoted rows, writes pipeline entries, and launches direct evaluations. The current UI can show many rows as "passed filter" while only one row is actually queued, then later the same rows show as already scanned.

## Goal

Make a 24-hour newgrad scan reliably process all eligible recent rows through enrich/evaluate, and avoid marking promoted rows as already scanned before they reach a terminal outcome.

## Scope

- Fix scan-history semantics for promoted list rows.
- Preserve existing hard filters and thresholds unless they are only a UI clarity issue.
- Leave existing bad `promoted` scan-history rows in place but make them non-blocking.
- Improve UI status enough to show why rows did not queue.

## Assumptions

- The user expects "scan 24h" to keep retrying eligible recent rows until they are queued, filtered, or explicitly skipped for a durable reason.
- Rows that pass the initial list filter but fail detail extraction should remain retryable.
- Existing unrelated worktree changes are user/prior-session changes and must not be reverted.

## Implementation Steps

1. Inspect scoring, scan-history, enrich, and direct-evaluation paths.
   Verify: identify where rows become `already_scanned`.
2. Add/adjust tests around scan-history blocking semantics.
   Verify: promoted rows in scan history no longer block retries unless represented by pipeline/tracker state or a terminal status.
3. Implement the smallest code change in the bridge adapter/history reader.
   Verify: targeted bridge tests pass.
4. Make existing `promoted` scan-history rows harmless without mutating current user data.
   Verify: affected rows can be retried by scan because `promoted` is ignored when loading seen keys.
5. Rebuild extension if UI code changes.
   Verify: extension typecheck/build pass.

## Verification Approach

- Targeted Vitest for newgrad scan history and adapter behavior.
- `npm --prefix bridge run typecheck`
- `npm --prefix extension run typecheck`
- `npm --prefix extension run build`

## Progress Log

- 2026-04-17: Created plan after user reported that the scanner showed 12 passed rows but only queued one evaluation, then showed no pending candidates.
- 2026-04-17: Bridge logs confirmed the flow reached `/v1/newgrad-scan/score`, `/v1/newgrad-scan/enrich-stream`, and `/v1/evaluate`.
- 2026-04-17: Found that `scoreNewGradRows` appends all recent unseen rows to `data/scan-history.tsv`, including list-level `promoted` rows before enrich/evaluate has a durable result.
- 2026-04-17: Changed both bridge adapters so only terminal filtered rows are appended during list scoring; list-level `promoted` rows remain retryable until enrichment/evaluation creates pipeline/tracker state or a terminal skip.
- 2026-04-17: Changed scan-history loading so existing `promoted` rows are non-terminal, and added pipeline company-role keys so an external employer URL in `pipeline.md` still dedupes the original Jobright listing.
- 2026-04-17: Updated the panel enrich summary to show detail-page enrichment counts separately from queue/skipped/failed counts.
- 2026-04-17: Restarted the local extension bridge after adding the Codex app CLI path to `PATH`; the bridge is listening on `127.0.0.1:47319`.
- 2026-04-17: User confirmed scan can now process 97 recent rows, but enrich queued only 1 of 55 detail-enriched rows. Confirmed this is the configured second-stage gate: `pipeline_threshold: 7` plus `detail_value_threshold: 7`.
- 2026-04-17: Added enrich skip breakdown counts so the panel reports why rows were skipped after detail enrichment instead of only showing one aggregate number.
- 2026-04-17: Rebuilt and restarted the local bridge so skip breakdown data is returned from `/v1/newgrad-scan/enrich-stream`.

## Key Decisions

- Treat list-level `promoted` as non-terminal. It should not make a row permanently "already scanned".
- Keep below-threshold, hard-filtered, already-tracked, and older-than-24h outcomes terminal.
- Do not rewrite `data/scan-history.tsv`; ignoring historical `promoted` rows is less invasive and preserves audit context.

## Risks and Blockers

- Some rows may still be skipped after detail enrichment due `pipeline_threshold` or `detail_value_threshold`; the UI should make that distinct from "not scanned".
- Vitest is currently blocked by a local macOS `rolldown` native binding signature error before any tests execute.

## Final Outcome

Implemented and partially verified.

Verification run:

- `npm --prefix bridge run typecheck` passed.
- `npm --prefix extension run typecheck` passed.
- `npm --prefix extension run build` passed.
- Direct `tsx` smoke assertions passed for pipeline company-role dedupe and non-terminal `promoted` scan-history behavior.
- Local bridge restart succeeded and is listening on `127.0.0.1:47319`.
- `npm --prefix bridge run typecheck` passed after adding skip breakdown.
- `npm --prefix extension run typecheck` passed after rendering skip breakdown.
- `npm --prefix extension run build` passed after rendering skip breakdown.
- Direct `tsx` smoke assertions passed for enrich skip breakdown.
- Targeted Vitest command failed before tests executed because Node could not load `bridge/node_modules/@rolldown/binding-darwin-arm64/rolldown-binding.darwin-arm64.node` due a macOS code-signature/native-binding error.
