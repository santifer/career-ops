# Process All postmortem — proc-mpcxwf1d-437113

**Run window:** 2026-05-19 · **Captured at:** 2026-05-19 11:09:15
**Orchestrator PID:** 58336 (exited after 0s wait from watcher start)
**Tier:** normal · **Send-email:** true · **Companies arg:** none (full drain)

## Final orchestrator state

```json
{
  "status": "completed",
  "phase": "done",
  "started_at": "2026-05-19T18:01:42.613Z",
  "finished_at": "2026-05-19T18:08:16.707Z",
  "pending_before": 15,
  "pending_after": 15,
  "triage_advanced": 15,
  "published_count": 0,
  "processed": 0,
  "tier": "normal",
  "send_email": true
}
```

## Count reconciliation

| Surface | Before | After | Delta | Expected | Honest? |
|---|---|---|---|---|---|
| pipeline.md unchecked | 15 | 15 | 0 | 0 (drained) | _audit below_ |
| triage-advance.tsv rows | 191 | 191 | 0 | 0 (drained) | _audit below_ |
| apply-now-queue.json | 21 | 21 | 0 | >= before (new evals land) | _audit below_ |

## Phase events from job log

```
[2026-05-19T18:01:42.617Z] ━━━ Phase 1/4: TRIAGE (Haiku) ━━━
      ⚠️  uncertain (content present but no visible apply control found) → keeping
      ⚠️  uncertain (content present but no visible apply control found) → keeping
      ⚠️  uncertain (content present but no visible apply control found) → keeping
      ⚠️  uncertain (content present but no visible apply control found) → keeping
      ⚠️  uncertain (content present but no visible apply control found) → keeping
      ⚠️  uncertain (content present but no visible apply control found) → keeping
      ⚠️  uncertain (content present but no visible apply control found) → keeping
[2026-05-19T18:01:54.001Z] ✓ triage complete — 15 advanced to batch queue
[2026-05-19T18:01:54.006Z] ━━━ Phase 2/4: BATCH EVAL ━━━
[2026-05-19T18:07:59.587Z] ✓ batch eval complete
[2026-05-19T18:07:59.588Z] ━━━ Phase 2.6/4: POLISH PACKS ━━━ (skipped — POLISH_PACK_ENABLED!=1)
[2026-05-19T18:07:59.588Z] ━━━ Phase 2.75/4: APPLY-PACK PREGEN ━━━ (skipped — Tier-5 only)
[2026-05-19T18:07:59.588Z] ━━━ Phase 2.5/4: MERGE TRACKER ━━━
[stderr] ⚠️  Non-canonical status "—" → defaulting to "Evaluated"
[2026-05-19T18:08:01.195Z] ✓ tracker merged
[2026-05-19T18:08:01.196Z] ━━━ Phase 3/4: DASHBOARD REBUILD ━━━
[2026-05-19T18:08:08.693Z] ✓ dashboard rebuilt
[2026-05-19T18:08:08.694Z] ━━━ Phase 4/4: HEARTBEAT EMAIL ━━━
[2026-05-19T18:08:16.704Z] ✓ heartbeat email sent
```

## Errors / warnings detected

- Error lines: 0
0
- Warning lines: 8

## Known gaps (vs Mitchell's intent of "drain all 187")

### Gap 1 — Batch eval LIMIT cap (CONFIRMED before run completion)

`batch-runner-batches.mjs:47` defaults to `LIMIT = 100`. `phaseBatch` in `process-all-pipeline.mjs:172` does not pass any `--limit` override. Result: each Process All run can batch at most 100 items.

This run had **191 items queued** at submission time; **94 submitted to Batches API** (100 sliced, 6 filtered as expired postings).

**Items left unprocessed in triage-advance.tsv after this run:** 191

**Honest implication:** the modal's "Pipeline drains to 0 after this run" assurance is FALSE for any queue > ~100. User would need to re-fire Process All to drain the remaining items.

### Gap 2 — pipeline.md state after triage (NEEDS INVESTIGATION)

Pre-run pipeline.md unchecked: 15. Post-run pipeline.md unchecked: 15.

If 15 > 0 despite triage claiming `triage_advanced: 15`, then triage.mjs does NOT check off items in pipeline.md after advancing them — items remain visible as unchecked even though they've been moved to the batch queue. This could be intentional (audit trail) or a bug. Either way the modal/sidebar count of pipeline.md unchecked is misleading.

### Recommended fix (per Mitchell's "stronger fix" decision)

1. In `process-all-pipeline.mjs::phaseBatch`, wrap batch-runner in a drain loop:
```js
let round = 1;
const MAX_ROUNDS = 10;
while (round <= MAX_ROUNDS) {
  const beforeCount = countTriageAdvanceQueued();
  if (beforeCount === 0) break;
  log(`batch round ${round}: ${beforeCount} items in queue`);
  const code = await runScript('batch-runner-batches.mjs', ['run', '--limit=1000', ...SCOPED_ARGS]);
  if (code !== 0) return { ok: false };
  const afterCount = countTriageAdvanceQueued();
  if (afterCount >= beforeCount) {
    log(`batch round ${round}: no progress (${beforeCount} → ${afterCount}), breaking`);
    break;
  }
  round++;
}
```
2. Audit triage.mjs to confirm whether it checks off items in pipeline.md. If not, fix or document.
3. Make the modal's "Pipeline drains to 0" assurance conditional — only show when both pipeline.md AND triage-advance.tsv will demonstrably reach 0.

## Source files captured

- Job log: `/tmp/process-all-proc-mpcxwf1d-437113.log`
- Before snapshot: `/Users/mitchellwilliams/Documents/career-ops/data/process-all-postmortem-2026-05-19/before-snapshot.txt`
- Final state: `data/pipeline-process-state.json` § `jobs.proc-mpcxwf1d-437113`

