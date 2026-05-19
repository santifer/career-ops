#!/bin/bash
# scripts/post-polish-cost-trace-chain.sh
#
# 2026-05-19 chain automation:
# 1. Wait for current polish PID 87920 to exit (max 6h)
# 2. Backfill data/alpha-polish-cv-scope-comparison-2026-05-19.md with verdict
#    + per-artifact convergence + total cost from the original run
# 3. Fire FRESH polish run (same args as original) to exercise α's
#    cost-tracking decorator (lib/council.mjs onCostRecord → NDJSON file)
# 4. Wait for fresh polish to exit (max 6h)
# 5. Verify data/polish-cost-trace-{date}.json exists + has records
# 6. Write data/alpha-polish-cost-trace-verification.md with PASS/FAIL
# 7. Commit + push via scripts/agent-commit.mjs
#
# Safety:
#   - Reversible: the script archives the original polish-summary.* files
#     before the fresh run overwrites them.
#   - Bounded wait (6h × 2 phases = 12h max).
#   - PID files at data/post-polish-chain.{original,fresh}.pid so the
#     user can kill cleanly if needed.
#
# Launched detached via nohup; logs to data/post-polish-cost-trace-chain.log.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG="$ROOT/data/post-polish-cost-trace-chain.log"
PACK_DIR="$ROOT/data/apply-packs/044-anthropic-communications-lead-claude-code"
TODAY="$(date '+%Y-%m-%d')"
COST_TRACE="$ROOT/data/polish-cost-trace-${TODAY}.json"
FRAMEWORK="$ROOT/data/alpha-polish-cv-scope-comparison-2026-05-19.md"
VERIFY_REPORT="$ROOT/data/alpha-polish-cost-trace-verification.md"
ARCHIVE_DIR="$ROOT/data/alpha-polish-original-run-archive-${TODAY}"

ORIGINAL_PID=87920
MAX_WAIT_SECS=21600  # 6 hours per phase
POLL_INTERVAL=60

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"
}

log "═══ post-polish chain start ═══"
log "log: $LOG"
log "framework: $FRAMEWORK"
log "verify report: $VERIFY_REPORT"

# ── Step 1: Wait for original polish (PID 87920) to exit ────────────────
log "Step 1/7 — waiting for original polish PID $ORIGINAL_PID to exit (max 6h)..."
waited=0
while kill -0 "$ORIGINAL_PID" 2>/dev/null; do
  sleep "$POLL_INTERVAL"
  waited=$((waited + POLL_INTERVAL))
  if [ "$waited" -ge "$MAX_WAIT_SECS" ]; then
    log "ABORT — PID $ORIGINAL_PID still alive after 6h. Manual intervention required."
    exit 2
  fi
done
log "Step 1/7 — original polish PID $ORIGINAL_PID exited after ${waited}s"

# ── Step 2: Archive original run artifacts (reversible) ──────────────────
log "Step 2/7 — archiving original run artifacts to $ARCHIVE_DIR"
mkdir -p "$ARCHIVE_DIR"
for f in polish-summary.md polish-summary.json polish-orchestrator-summary.json polish-trace-cv-tailored.md polish-trace-cover-letter.md polish-trace-form-fields.md polish-trace-impact-doc.md polish-trace-references.md polish-trace-referrals.md polish-signals.json; do
  if [ -f "$PACK_DIR/$f" ]; then
    cp "$PACK_DIR/$f" "$ARCHIVE_DIR/$f" 2>/dev/null && log "  archived: $f"
  fi
done

# ── Step 3: Backfill the framework doc with original-run verdict ────────
log "Step 3/7 — backfilling framework doc"
node --input-type=module -e "
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const fp = '$FRAMEWORK';
const summaryPath = '$PACK_DIR/polish-summary.md';
const orchPath = '$PACK_DIR/polish-orchestrator-summary.json';
const archiveSummary = '$ARCHIVE_DIR/polish-summary.md';
const archiveOrch    = '$ARCHIVE_DIR/polish-orchestrator-summary.json';
const summary = existsSync(summaryPath) ? readFileSync(summaryPath, 'utf-8')
              : existsSync(archiveSummary) ? readFileSync(archiveSummary, 'utf-8') : '';
let orch = null;
try {
  const orchSrc = existsSync(orchPath) ? orchPath : (existsSync(archiveOrch) ? archiveOrch : null);
  if (orchSrc) orch = JSON.parse(readFileSync(orchSrc, 'utf-8'));
} catch (e) {}
let prev = existsSync(fp) ? readFileSync(fp, 'utf-8') : '';
let append = '';
append += '\n\n---\n\n## Post-Run Analysis — Original PID 87920\n\n';
append += '_Backfilled by scripts/post-polish-cost-trace-chain.sh after PID 87920 exited._\n\n';
if (orch) {
  append += '**Verdict:** ' + (orch.coherence?.final_recommendation || '(unknown)') + '\n\n';
  append += '**Total cost:** \$' + (orch.total_cost_usd ?? 0).toFixed(2) + '\n\n';
  append += '**Duration:** ' + Math.round((orch.duration_ms || 0) / 60000) + ' min\n\n';
  append += '**Cost-cap:** \$' + (orch.cost_cap_usd ?? '?') + '\n\n';
  if (orch.artifacts) {
    append += '### Per-artifact convergence\n\n';
    append += '| Artifact | Confidence | Rounds | Adversarial | Cost (USD) | Converged |\n';
    append += '|---|---|---|---|---|---|\n';
    for (const [name, a] of Object.entries(orch.artifacts)) {
      append += '| ' + name + ' | ' + (a.confidence?.toFixed(3) ?? '?')
              + ' | ' + (a.rounds_used ?? '?')
              + ' | ' + ((a.adversarial_findings || []).length) + ' finding(s)'
              + ' | \$' + (a.cost_usd ?? 0).toFixed(2)
              + ' | ' + (a.converged ? '✓' : '✗')
              + ' |\n';
    }
  }
  if (orch.coherence?.cross_coherence) {
    const cc = orch.coherence.cross_coherence;
    append += '\n### Cross-pack coherence\n\n';
    append += '- Claim consistency: ' + (cc.claim_consistency_pct ?? '?') + '%\n';
    append += '- JD keyword (CV): ' + (cc.jd_keyword_pct_cv ?? '?') + '%\n';
    append += '- JD keyword (avg): ' + (cc.jd_keyword_pct_avg ?? '?') + '%\n';
    append += '- Voice fidelity: ' + (cc.voice_fidelity_pct ?? 'null') + (cc.voice_fidelity_pct == null ? '' : '%') + '\n';
  }
  if (orch.coherence?.blocking_issues) {
    append += '\n### Blocking issues\n\n';
    for (const b of orch.coherence.blocking_issues) {
      append += '- [' + (b.severity || 'blocker').toUpperCase() + '] ' + (b.scope || b.artifact) + ': ' + (b.finding || '(no detail)') + '\n';
    }
  }
} else {
  append += '_No orchestrator summary found — orch may not have written summary or run was killed before completion._\n\n';
}
if (summary) {
  append += '\n### Polish-summary.md snapshot\n\n';
  append += '\`\`\`\n' + summary.trim() + '\n\`\`\`\n';
}
append += '\n### Cost-tracking decorator (α commits ffb5471 → c625f6f)\n\n';
append += 'Cost-trace file expected at \`data/polish-cost-trace-${TODAY}.json\`. ';
append += 'NOT written for this run — original polish process started BEFORE α decorator wiring landed. ';
append += 'Fresh polish run will be fired immediately (Step 4) to exercise the decorator.\n';
append += '\n_Archive of original-run artifacts: \`$ARCHIVE_DIR/\` (gitignored)._\n';
writeFileSync(fp, prev + append);
console.error('framework doc backfilled, +' + append.length + ' bytes');
"
log "Step 3/7 — framework doc backfilled"

# ── Step 4: Fire FRESH polish run (same args) ─────────────────────────────
log "Step 4/7 — firing FRESH polish run (--row 044 --artifacts cv,cover,form,impact,refs,referrals --target-confidence 0.99 --cost-cap 500)"
FRESH_LOG="/tmp/post-polish-fresh-${TODAY}.log"
nohup node "$ROOT/scripts/agents/apply-pack-polish.mjs" \
  --row 044 \
  --artifacts cv,cover,form,impact,refs,referrals \
  --target-confidence 0.99 \
  --cost-cap 500 \
  > "$FRESH_LOG" 2>&1 &
FRESH_PID=$!
echo "$FRESH_PID" > "$ROOT/data/post-polish-chain.fresh.pid"
log "Step 4/7 — fresh polish PID $FRESH_PID started (log: $FRESH_LOG)"
log "Step 4/7 — PID written to data/post-polish-chain.fresh.pid (kill -TERM \$(cat data/post-polish-chain.fresh.pid) to abort)"

# ── Step 5: Wait for fresh polish to exit ────────────────────────────────
log "Step 5/7 — waiting for fresh polish PID $FRESH_PID to exit (max 6h)..."
waited=0
while kill -0 "$FRESH_PID" 2>/dev/null; do
  sleep "$POLL_INTERVAL"
  waited=$((waited + POLL_INTERVAL))
  if [ "$waited" -ge "$MAX_WAIT_SECS" ]; then
    log "ABORT — fresh polish PID $FRESH_PID still alive after 6h. Manual intervention required."
    exit 3
  fi
done
log "Step 5/7 — fresh polish PID $FRESH_PID exited after ${waited}s"
rm -f "$ROOT/data/post-polish-chain.fresh.pid"

# ── Step 6: Verify cost-trace file ───────────────────────────────────────
log "Step 6/7 — verifying cost-trace file: $COST_TRACE"
if [ -f "$COST_TRACE" ]; then
  RECORDS=$(wc -l < "$COST_TRACE" | tr -d ' ')
  log "Step 6/7 — PASS — cost-trace exists, $RECORDS records"
  RESULT="PASS"
else
  log "Step 6/7 — FAIL — cost-trace MISSING after fresh polish — α decorator did not fire"
  RECORDS=0
  RESULT="FAIL"
fi

# ── Step 7: Write verification report ────────────────────────────────────
log "Step 7/7 — writing verification report"
node --input-type=module -e "
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const fp = '$VERIFY_REPORT';
const tracePath = '$COST_TRACE';
const freshSummaryPath = '$PACK_DIR/polish-summary.md';
const freshOrchPath = '$PACK_DIR/polish-orchestrator-summary.json';
const records = existsSync(tracePath)
  ? readFileSync(tracePath, 'utf-8').trim().split('\n').filter(Boolean)
  : [];
let totalCost = 0;
const byModel = new Map();
const byPhase = new Map();
for (const line of records) {
  try {
    const r = JSON.parse(line);
    totalCost += (r.cost_usd || 0);
    byModel.set(r.model || '?', (byModel.get(r.model || '?') || 0) + (r.cost_usd || 0));
    byPhase.set(r.phase || '?', (byPhase.get(r.phase || '?') || 0) + (r.cost_usd || 0));
  } catch (_) {}
}
let orch = null;
try { orch = JSON.parse(readFileSync(freshOrchPath, 'utf-8')); } catch (_) {}
const summary = existsSync(freshSummaryPath) ? readFileSync(freshSummaryPath, 'utf-8') : '';
let out = '';
out += '# α Cost-Trace Verification — ' + '$TODAY' + '\n\n';
out += 'Fresh polish run executed after original PID 87920 completed, to verify α cost-tracking decorator (lib/council.mjs onCostRecord → NDJSON file) emits records under production load.\n\n';
out += '**Verdict:** ' + (records.length > 0 ? '✓ PASS — decorator fires + writes records' : '✗ FAIL — no records written, decorator did NOT fire') + '\n\n';
out += '## Stats\n\n';
out += '- Cost-trace records: ' + records.length + '\n';
out += '- Total cost from trace: \$' + totalCost.toFixed(2) + '\n';
out += '- Trace file: \`' + tracePath.replace('$ROOT/', '') + '\`\n';
out += '- Fresh polish log: \`/tmp/post-polish-fresh-' + '$TODAY' + '.log\`\n';
if (orch) {
  out += '- Polish duration: ' + Math.round((orch.duration_ms || 0) / 60000) + ' min\n';
  out += '- Polish verdict: ' + (orch.coherence?.final_recommendation || '(unknown)') + '\n';
  out += '- Polish reported total_cost_usd: \$' + (orch.total_cost_usd ?? 0).toFixed(2) + '\n';
}
if (byModel.size > 0) {
  out += '\n### Cost by model\n\n';
  out += '| Model | Cost (USD) |\n|---|---|\n';
  const sorted = [...byModel.entries()].sort((a, b) => b[1] - a[1]);
  for (const [model, c] of sorted) {
    out += '| ' + model + ' | \$' + c.toFixed(2) + ' |\n';
  }
}
if (byPhase.size > 0) {
  out += '\n### Cost by phase\n\n';
  out += '| Phase | Cost (USD) |\n|---|---|\n';
  const sorted = [...byPhase.entries()].sort((a, b) => b[1] - a[1]);
  for (const [phase, c] of sorted) {
    out += '| ' + phase + ' | \$' + c.toFixed(2) + ' |\n';
  }
}
out += '\n## Reconciliation\n\n';
if (orch && records.length > 0) {
  const orchTotal = orch.total_cost_usd ?? 0;
  const drift = Math.abs(totalCost - orchTotal);
  const driftPct = orchTotal > 0 ? (drift / orchTotal * 100) : (totalCost > 0 ? 100 : 0);
  out += '- Trace total: \$' + totalCost.toFixed(2) + '\n';
  out += '- Orchestrator-reported total: \$' + orchTotal.toFixed(2) + '\n';
  out += '- Drift: \$' + drift.toFixed(2) + ' (' + driftPct.toFixed(1) + '%)\n';
  out += '- Status: ' + (driftPct < 5 ? '✓ within 5% tolerance' : '⚠ drift exceeds 5% — investigate') + '\n';
} else if (records.length > 0) {
  out += '- Trace total: \$' + totalCost.toFixed(2) + '\n';
  out += '- Orchestrator total: (no orchestrator summary)\n';
} else {
  out += 'No trace records to reconcile.\n';
}
if (summary) {
  out += '\n## Fresh polish-summary.md\n\n\`\`\`\n' + summary.trim() + '\n\`\`\`\n';
}
out += '\n## Original-run archive\n\nArtifacts from the original PID 87920 run (before fresh re-polish overwrite) at:\n  \`' + '$ARCHIVE_DIR'.replace('$ROOT/', '') + '/\`\n';
out += '\n_Generated by scripts/post-polish-cost-trace-chain.sh at ' + new Date().toISOString() + '._\n';
writeFileSync(fp, out);
console.error('verification report written: ' + out.length + ' bytes, verdict: ' + (records.length > 0 ? 'PASS' : 'FAIL'));
"
log "Step 7/7 — verification report written: $VERIFY_REPORT"

# ── Step 8: Commit + push ────────────────────────────────────────────────
log "Step 8/8 — committing + pushing via scripts/agent-commit.mjs"
cd "$ROOT"
node scripts/agent-commit.mjs \
  --agent alpha-cost-trace-verify \
  --files "data/alpha-polish-cv-scope-comparison-2026-05-19.md,data/alpha-polish-cost-trace-verification.md" \
  --message "verify(α): backfill original-run polish framework + fresh polish run to exercise cost-tracking decorator (NDJSON trace at data/polish-cost-trace-${TODAY}.json)" \
  >> "$LOG" 2>&1
git push origin main >> "$LOG" 2>&1
log "═══ post-polish chain DONE — result: $RESULT ═══"
