# Process All postmortem — `proc-mpcxwf1d-437113`

**Run window:** 2026-05-19 11:01 – 11:08 PT (6m 34s end-to-end)
**Tier:** normal · **Send-email:** true · **Companies arg:** none (full drain intent)

## Headline

Modal claimed: "Pipeline drains to 0 after this run · 187 items (15 to triage + 172 already queued) · 25 companies fully processed."

What actually happened:
- ✓ 94 items evaluated by Anthropic Batches API
- ✓ 33 new entries added to tracker, 21 updated, 40 skipped (existing scores higher)
- ✓ Dashboard rebuilt (137 → 170 total evals)
- ✓ Heartbeat email sent
- ✗ **pipeline.md unchecked: 15 → 15** (nothing drained)
- ✗ **triage-advance.tsv rows: 191 → 191** (nothing dequeued)
- ✗ **0 items published** (none of the 94 scored ≥ 4.0)
- ✗ **Only 100 of 187 reached batch eval** (LIMIT=100 cap), of which 6 were filtered as expired = 94 submitted

The "drain to 0" assurance was wrong on three independent axes.

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

| Surface | Before | After | Delta | Modal promise | Actual |
|---|---|---|---|---|---|
| `pipeline.md` unchecked | 15 | 15 | **0** | "drain to 0" | ❌ no drain |
| `batch/triage-advance.tsv` rows | 191 | 191 | **0** | (implicit drain via Phase 2) | ❌ no dequeue |
| `data/apply-now-queue.json` ranked | 21 | 21 | **0** | (publish promotes new high scorers) | ⚠ no new publishes — but tracker grew |
| `data/applications.md` rows (tracker) | 137 | 170 | **+33** | (not surfaced in modal) | ✓ new evals landed |
| Batches API submissions | — | 94 | — | (eval all 187) | ❌ 100 sliced, 6 filtered |

## Phase timing (from job log)

| Phase | Start | End | Duration |
|---|---|---|---|
| 1 — Triage (Haiku) | 18:01:42 | 18:01:54 | 12s |
| 2 — Batch eval (Sonnet) | 18:01:54 | ~18:07:55 | ~6m |
| 2.5 — Merge tracker | ~18:07:55 | 18:08:01 | 6s |
| 3 — Dashboard rebuild | 18:08:01 | 18:08:08 | 7s |
| 4 — Heartbeat email | 18:08:08 | 18:08:16 | 8s |
| **Total** | | | **6m 34s** |

Phase 2 was much faster than expected (~6m vs the spec's "up to 2h poll wait") because the Batches API completed quickly on 94 items.

## Errors / warnings

Job log: zero `✗ / FATAL / Error:` lines after Phase 1 completion. The orchestrator reports success.

## Confirmed gaps (vs Mitchell's intent of "drain all 187")

### Gap 1 — `LIMIT=100` cap in `batch-runner-batches.mjs:47`

`phaseBatch` in `process-all-pipeline.mjs:172` calls `batch-runner-batches.mjs run` without a `--limit` override, so the script defaults to its built-in `LIMIT = parseInt(ARGS.limit ?? '100')`. Per-run output: max 100 items sliced from `triage-advance.tsv`, fetched, filtered for expired postings (94 survived), submitted.

**Implication:** even if pipeline.md → triage-advance flow worked correctly, no single Process All run can drain a queue > 100.

### Gap 2 — `pipeline.md` items NOT checked off after triage advances them

`triage_advanced: 15` in the orchestrator state, but `pending_after: 15` (same as `pending_before`). `triage.mjs` writes the URL to `batch/triage-advance.tsv` but **does not modify the `- [ ]` checkbox in `data/pipeline.md`**. The 15 items remain visible as "unchecked / pending" forever — until a separate process (or a human) marks them.

**Implication:** the Process All sidebar's `pending_pipeline: 15` will read 15 again on the next click, suggesting the queue regenerated when in fact those are the *same* 15 items, already in the batch queue.

### Gap 3 — `triage-advance.tsv` items NOT dequeued after batch submission

`batch-runner-batches.mjs` submitted 94 items, the Batches API returned scores, `merge-tracker` rolled them into `applications.md`. But `triage-advance.tsv` rows went from 191 → 191. **batch-runner does not remove processed URLs from the queue file.**

**Implication:** the same URLs sit in `triage-advance.tsv` forever. Each subsequent Process All would re-submit them to the Batches API (real spend) unless deduped at submission time via the URL cache or applications.md lookup. The "queued_for_batch: 172" sidebar count is a **log of historical triage decisions**, not a live queue. Mitchell's mental model ("172 items waiting for batch eval") does not match reality ("172 items have-been-or-are-still-eligible-for batch eval, dedup happens elsewhere").

### Gap 4 — Modal "Pipeline drains to 0" assurance is fictional

The drain-assurance copy in the Process All modal (Phase A + Phase B) claims `Pipeline drains to 0 after this run · 187 total · 25 companies fully processed`. Given Gaps 1-3, no single Process All run can deliver this state. The assurance is aspirational marketing.

## Recommended stronger fix

Three changes, in priority order:

### Fix 1 — Drain loop + raise per-call cap in `phaseBatch`

```js
// scripts/process-all-pipeline.mjs phaseBatch (replacement)
async function phaseBatch() {
  updateJob({ phase: 'batch', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 2/4: BATCH EVAL ━━━');
  if (DRY_RUN) { log('(dry-run) skipping batch'); return { ok: true }; }

  const MAX_ROUNDS = parseInt(process.env.PROCESS_ALL_MAX_BATCH_ROUNDS || '10', 10);
  let round = 1;
  let totalProcessed = 0;
  while (round <= MAX_ROUNDS) {
    const beforeCount = countTriageAdvanceRowsRemaining();
    if (beforeCount === 0) {
      log(`batch round ${round}: queue empty, breaking`);
      break;
    }
    log(`━━━ Batch round ${round}/${MAX_ROUNDS} — ${beforeCount} items in queue ━━━`);
    const code = await runScript('batch-runner-batches.mjs', ['run', '--limit=1000', ...SCOPED_ARGS]);
    if (code !== 0) {
      log(`✗ batch round ${round} failed (exit ${code})`);
      return { ok: false };
    }
    const afterCount = countTriageAdvanceRowsRemaining();
    const drained = beforeCount - afterCount;
    totalProcessed += drained;
    log(`batch round ${round}: ${beforeCount} → ${afterCount} (drained ${drained})`);
    if (drained <= 0) {
      log(`batch round ${round}: no progress, breaking (likely dedup-against-tracker)`);
      break;
    }
    round++;
  }
  log(`✓ batch eval complete — ${totalProcessed} items processed across ${round - 1} round(s)`);
}
```

**But Fix 1 alone fails if Gap 3 is true** — `batch-runner` doesn't dequeue items, so the loop would re-submit the same 191 URLs every round, spending real money on duplicates.

### Fix 2 — Dequeue after successful batch processing

`batch-runner-batches.mjs` should rewrite `batch/triage-advance.tsv` after a successful batch, removing the URLs that were submitted. Options:
- (a) Move processed rows to `batch/triage-advance-archive/{date}.tsv` (audit trail preserved)
- (b) Filter the file in-place, keeping only un-submitted rows
- (c) Mark rows with a `processed_at` column instead of removing

Option (c) is cleanest — preserves the audit trail AND lets `phaseBatch`'s drain loop check `processed_at IS NULL` as the queue filter.

### Fix 3 — Check off `pipeline.md` after triage advance

In `triage.mjs`, after writing a URL to `batch/triage-advance.tsv`, also rewrite the source line in `data/pipeline.md` from `- [ ]` to `- [x]`. This makes the sidebar's `pending_pipeline` count honest (it reflects items NOT yet triaged) and makes the modal's drain assurance accurate.

Each fix is independent and safe to ship in isolation. Recommend all three together so the modal assurance becomes truthful end-to-end.

## What this run DID accomplish (giving credit honestly)

- 94 fresh Sonnet evaluations completed in ~6 minutes
- 33 net-new tracker entries added (mostly NVIDIA + Anthropic + Ramp + OpenAI + LinkedIn)
- 21 existing entries updated with re-eval scores
- Dashboard rebuilt cleanly (137 → 170 evals)
- Heartbeat email delivered
- Total spend: ~$3.29 (per batch-runner's estimate)

The run was successful in the narrow sense — Anthropic returned results, the tracker grew, the dashboard reflects the new state. What it did NOT do is the broader "drain to 0" promise the modal made.

## Source artifacts

- Job log: `/tmp/process-all-proc-mpcxwf1d-437113.log` (full text preserved)
- Before snapshot: `data/process-all-postmortem-2026-05-19/before-snapshot.txt`
- State: `data/pipeline-process-state.json` § `jobs.proc-mpcxwf1d-437113`
- Batch ID: `msgbatch_01BTtVLcFhbiYA9K6CNTJ2kD`

_Generated by manual postmortem after watcher run, 2026-05-19 11:15 PT._
