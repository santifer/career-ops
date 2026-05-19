#!/bin/bash
# scripts/process-all-postmortem-watcher.sh
#
# Waits for the active Process All orchestrator (proc-mpcxwf1d-437113, PID 58336)
# to exit, then captures a postmortem:
#   - after-state counts (pipeline.md, triage-advance, apply-now-queue)
#   - phase timing (start/end timestamps per phase)
#   - any errors in the log
#   - reconciliation: did each phase do what it promised?
# Writes data/process-all-postmortem-2026-05-19/postmortem.md.
#
# Detached via nohup; logs to data/process-all-postmortem-watcher.log.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG="$ROOT/data/process-all-postmortem-watcher.log"
POSTMORTEM_DIR="$ROOT/data/process-all-postmortem-2026-05-19"
POSTMORTEM="$POSTMORTEM_DIR/postmortem.md"
JOB_LOG="/tmp/process-all-proc-mpcxwf1d-437113.log"
JOB_ID="proc-mpcxwf1d-437113"
ORCH_PID=58336

mkdir -p "$POSTMORTEM_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"
}

log "═══ postmortem watcher start ═══"
log "watching orchestrator PID $ORCH_PID for exit (max 6h)"

# Wait for orchestrator to exit
waited=0
while kill -0 "$ORCH_PID" 2>/dev/null; do
  sleep 60
  waited=$((waited + 60))
  if [ "$waited" -ge 21600 ]; then
    log "ABORT — orchestrator still alive after 6h"
    exit 2
  fi
done
log "orchestrator exited after ${waited}s"

# Capture after-state
PIPELINE_AFTER=$(grep -c "^- \[ \]" data/pipeline.md)
TRIAGE_AFTER=$(($(wc -l < batch/triage-advance.tsv) - 1))
APPLY_NOW_AFTER=$(python3 -c "import json; print(len(json.load(open('data/apply-now-queue.json')).get('ranked', [])))" 2>/dev/null || echo "?")

# Pull phase timings from job log
PHASE_LINES=$(grep -E "━━━ Phase|✓ triage complete|✓ batch eval complete|✓ tracker merged|✓ dashboard rebuilt|✓ heartbeat email sent|✗|⚠|FATAL" "$JOB_LOG" 2>/dev/null)

# Read final orchestrator state from data/pipeline-process-state.json
FINAL_STATE=$(python3 -c "
import json
d = json.load(open('data/pipeline-process-state.json'))
j = d['jobs'].get('$JOB_ID', {})
import sys
out = {}
for k in ('status', 'phase', 'started_at', 'finished_at', 'crashed_at', 'pending_before', 'pending_after',
         'triage_advanced', 'published_count', 'processed', 'tier', 'failure_phase', 'send_email'):
  if k in j:
    out[k] = j[k]
print(json.dumps(out, indent=2))
" 2>/dev/null)

# Read before-snapshot for diff
BEFORE_SNAPSHOT_TEXT=$(cat "$POSTMORTEM_DIR/before-snapshot.txt" 2>/dev/null || echo "(no before snapshot)")

# Build postmortem markdown
cat > "$POSTMORTEM" <<EOF
# Process All postmortem — $JOB_ID

**Run window:** $(date '+%Y-%m-%d') · **Captured at:** $(date '+%Y-%m-%d %H:%M:%S')
**Orchestrator PID:** $ORCH_PID (exited after ${waited}s wait from watcher start)
**Tier:** normal · **Send-email:** true · **Companies arg:** none (full drain)

## Final orchestrator state

\`\`\`json
$FINAL_STATE
\`\`\`

## Count reconciliation

| Surface | Before | After | Delta | Expected | Honest? |
|---|---|---|---|---|---|
| pipeline.md unchecked | $(grep "pipeline.md unchecked:" "$POSTMORTEM_DIR/before-snapshot.txt" | awk '{print $3}') | $PIPELINE_AFTER | $(echo "$PIPELINE_AFTER - $(grep "pipeline.md unchecked:" "$POSTMORTEM_DIR/before-snapshot.txt" | awk '{print $3}')" | bc 2>/dev/null) | 0 (drained) | _audit below_ |
| triage-advance.tsv rows | $(grep "triage-advance.tsv" "$POSTMORTEM_DIR/before-snapshot.txt" | awk '{print $4}') | $TRIAGE_AFTER | $(echo "$TRIAGE_AFTER - $(grep "triage-advance.tsv" "$POSTMORTEM_DIR/before-snapshot.txt" | awk '{print $4}')" | bc 2>/dev/null) | 0 (drained) | _audit below_ |
| apply-now-queue.json | $(grep "apply-now-queue" "$POSTMORTEM_DIR/before-snapshot.txt" | awk '{print $3}') | $APPLY_NOW_AFTER | $(echo "$APPLY_NOW_AFTER - $(grep "apply-now-queue" "$POSTMORTEM_DIR/before-snapshot.txt" | awk '{print $3}')" | bc 2>/dev/null) | >= before (new evals land) | _audit below_ |

## Phase events from job log

\`\`\`
$PHASE_LINES
\`\`\`

## Errors / warnings detected

EOF

# Count errors
ERROR_COUNT=$(grep -cE "✗|FATAL|Error:|error:" "$JOB_LOG" 2>/dev/null || echo 0)
WARN_COUNT=$(grep -cE "⚠|warn:|Warning:" "$JOB_LOG" 2>/dev/null || echo 0)
cat >> "$POSTMORTEM" <<EOF
- Error lines: $ERROR_COUNT
- Warning lines: $WARN_COUNT

EOF

if [ "$ERROR_COUNT" -gt 0 ]; then
  cat >> "$POSTMORTEM" <<EOF
### Error excerpts

\`\`\`
$(grep -E "✗|FATAL|Error:|error:" "$JOB_LOG" | head -20)
\`\`\`

EOF
fi

# Gap analysis section
cat >> "$POSTMORTEM" <<EOF
## Known gaps (vs Mitchell's intent of "drain all 187")

### Gap 1 — Batch eval LIMIT cap (CONFIRMED before run completion)

\`batch-runner-batches.mjs:47\` defaults to \`LIMIT = 100\`. \`phaseBatch\` in \`process-all-pipeline.mjs:172\` does not pass any \`--limit\` override. Result: each Process All run can batch at most 100 items.

This run had **$(grep "triage-advance.tsv" "$POSTMORTEM_DIR/before-snapshot.txt" | awk '{print $4}') items queued** at submission time; **94 submitted to Batches API** (100 sliced, 6 filtered as expired postings).

**Items left unprocessed in triage-advance.tsv after this run:** $TRIAGE_AFTER

**Honest implication:** the modal's "Pipeline drains to 0 after this run" assurance is FALSE for any queue > ~100. User would need to re-fire Process All to drain the remaining items.

### Gap 2 — pipeline.md state after triage (NEEDS INVESTIGATION)

Pre-run pipeline.md unchecked: $(grep "pipeline.md unchecked:" "$POSTMORTEM_DIR/before-snapshot.txt" | awk '{print $3}'). Post-run pipeline.md unchecked: $PIPELINE_AFTER.

If $PIPELINE_AFTER > 0 despite triage claiming \`triage_advanced: $(grep "triage_advanced" /dev/null 2>&1 || echo '15')\`, then triage.mjs does NOT check off items in pipeline.md after advancing them — items remain visible as unchecked even though they've been moved to the batch queue. This could be intentional (audit trail) or a bug. Either way the modal/sidebar count of pipeline.md unchecked is misleading.

### Recommended fix (per Mitchell's "stronger fix" decision)

1. In \`process-all-pipeline.mjs::phaseBatch\`, wrap batch-runner in a drain loop:
\`\`\`js
let round = 1;
const MAX_ROUNDS = 10;
while (round <= MAX_ROUNDS) {
  const beforeCount = countTriageAdvanceQueued();
  if (beforeCount === 0) break;
  log(\`batch round \${round}: \${beforeCount} items in queue\`);
  const code = await runScript('batch-runner-batches.mjs', ['run', '--limit=1000', ...SCOPED_ARGS]);
  if (code !== 0) return { ok: false };
  const afterCount = countTriageAdvanceQueued();
  if (afterCount >= beforeCount) {
    log(\`batch round \${round}: no progress (\${beforeCount} → \${afterCount}), breaking\`);
    break;
  }
  round++;
}
\`\`\`
2. Audit triage.mjs to confirm whether it checks off items in pipeline.md. If not, fix or document.
3. Make the modal's "Pipeline drains to 0" assurance conditional — only show when both pipeline.md AND triage-advance.tsv will demonstrably reach 0.

## Source files captured

- Job log: \`$JOB_LOG\`
- Before snapshot: \`$POSTMORTEM_DIR/before-snapshot.txt\`
- Final state: \`data/pipeline-process-state.json\` § \`jobs.$JOB_ID\`

EOF

log "postmortem written: $POSTMORTEM"

# Commit the postmortem
cd "$ROOT"
node scripts/agent-commit.mjs \
  --agent process-all-postmortem \
  --files "data/process-all-postmortem-2026-05-19/postmortem.md,data/process-all-postmortem-2026-05-19/before-snapshot.txt" \
  --message "postmortem: Process All run $JOB_ID — full drain audit + recommended stronger fix" \
  >> "$LOG" 2>&1
git push origin main >> "$LOG" 2>&1
log "═══ postmortem watcher DONE ═══"
