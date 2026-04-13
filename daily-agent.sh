#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# daily-agent.sh — Full Auto Job Search & Apply Pipeline
#
# Chains: Scan → Evaluate → PDF → Apply → Report
#
# This is the agent you schedule to run daily. It:
# 1. Scans 73+ company portals for new AI/ML jobs (zero LLM cost)
# 2. Evaluates each new offer against your CV (uses claude CLI)
# 3. Generates tailored PDF resumes for high-scoring matches
# 4. Submits applications via ATS APIs (Greenhouse/Lever/Ashby)
# 5. Updates the tracker and generates a daily results report
#
# Usage:
#   ./daily-agent.sh                    # full pipeline
#   ./daily-agent.sh --scan-only        # just scan, no evaluate/apply
#   ./daily-agent.sh --eval-only        # evaluate pipeline, no scan
#   ./daily-agent.sh --apply-only       # apply to already-evaluated 4.0+ offers
#   ./daily-agent.sh --dry-run          # preview everything, submit nothing
#   ./daily-agent.sh --threshold 3.8    # custom score threshold (default: 4.0)
#   ./daily-agent.sh --max-apply 10     # max applications per run (default: 5)
#
# Schedule (cron):
#   0 9 * * * cd /path/to/career-ops && ./daily-agent.sh >> logs/daily.log 2>&1
#   0 18 * * * cd /path/to/career-ops && ./daily-agent.sh --apply-only >> logs/daily.log 2>&1
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Defaults ────────────────────────────────────────────────────
SCAN_ONLY=false
EVAL_ONLY=false
APPLY_ONLY=false
DRY_RUN=false
THRESHOLD=4.0
MAX_APPLY=5
PARALLEL=2
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H-%M-%S)
LOG_DIR="$SCRIPT_DIR/logs"
REPORT_DIR="$SCRIPT_DIR/reports/daily-reports"
RESULTS_FILE="$REPORT_DIR/$DATE-results.md"

# ── Parse args ──────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scan-only) SCAN_ONLY=true; shift ;;
    --eval-only) EVAL_ONLY=true; shift ;;
    --apply-only) APPLY_ONLY=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --max-apply) MAX_APPLY="$2"; shift 2 ;;
    --parallel) PARALLEL="$2"; shift 2 ;;
    -h|--help)
      head -30 "$0" | grep "^#" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ─────────────────────────────────────────────────────
mkdir -p "$LOG_DIR" "$REPORT_DIR" "batch/tracker-additions" "output"

log() { echo "[$(date +%H:%M:%S)] $1"; }
section() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Initialize results report ───────────────────────────────────
cat > "$RESULTS_FILE" <<EOF
# Daily Agent Results — $DATE

**Run time:** $(date)
**Threshold:** $THRESHOLD/5 | **Max apply:** $MAX_APPLY | **Dry run:** $DRY_RUN

---

EOF

##############################################################################
# PHASE 1: SCAN
##############################################################################
if [[ "$APPLY_ONLY" == false && "$EVAL_ONLY" == false ]]; then
  section "PHASE 1 — Scanning Portals"

  SCAN_OUTPUT=$(node scan.mjs ${DRY_RUN:+--dry-run} 2>&1 || true)
  echo "$SCAN_OUTPUT"

  NEW_COUNT=$(echo "$SCAN_OUTPUT" | sed -n 's/.*New offers added:[[:space:]]*\([0-9]*\).*/\1/p' || echo "0")
  log "Scan complete: $NEW_COUNT new offers found"

  SCAN_COMPANIES=$(echo "$SCAN_OUTPUT" | sed -n 's/.*Companies scanned:[[:space:]]*\([0-9]*\).*/\1/p' || echo "?")
  SCAN_TOTAL=$(echo "$SCAN_OUTPUT" | sed -n 's/.*Total jobs found:[[:space:]]*\([0-9]*\).*/\1/p' || echo "?")

  cat >> "$RESULTS_FILE" <<EOF
## Phase 1: Scan
- **Companies scanned:** $SCAN_COMPANIES
- **Total jobs found:** $SCAN_TOTAL
- **New offers added:** $NEW_COUNT

EOF

  if [[ "$SCAN_ONLY" == true ]]; then
    log "SCAN ONLY mode — exiting"
    echo "## Mode: Scan Only" >> "$RESULTS_FILE"
    echo "Scan complete. Run without --scan-only to evaluate and apply." >> "$RESULTS_FILE"
    cat "$RESULTS_FILE"
    exit 0
  fi
fi

##############################################################################
# PHASE 2: EVALUATE (using claude CLI for AI-powered evaluation)
##############################################################################
if [[ "$APPLY_ONLY" == false ]]; then
  section "PHASE 2 — Evaluating New Offers"

  # Count pending pipeline entries
  PENDING=$(grep -c '^\- \[ \]' data/pipeline.md 2>/dev/null || echo "0")
  log "Pending offers in pipeline: $PENDING"

  if [[ "$PENDING" -gt 0 ]]; then
    # Extract pending URLs and create batch input
    NEXT_NUM=$(awk -F'|' '/^\|[[:space:]]*[0-9]/ { gsub(/[[:space:]]/, "", $2); if ($2+0 > max) max=$2+0 } END { print (max+1) }' data/applications.md 2>/dev/null || echo "1")

    log "Creating batch input starting at #$NEXT_NUM..."

    # Write batch-input.tsv from pipeline
    echo -e "id\turl\tsource\tnotes" > batch/batch-input.tsv
    ID=$NEXT_NUM
    while IFS= read -r line; do
      URL=$(echo "$line" | grep -oE 'https?://\S+' | head -1)
      COMPANY=$(echo "$line" | sed 's/.*| *//' | awk -F'|' '{print $1}' | sed 's/^ *//;s/ *$//')
      TITLE=$(echo "$line" | sed 's/.*| *//' | awk -F'|' '{print $2}' | sed 's/^ *//;s/ *$//')
      if [[ -n "$URL" ]]; then
        PADDED=$(printf "%03d" "$ID")
        echo -e "${PADDED}\t${URL}\t${COMPANY}\t${TITLE}" >> batch/batch-input.tsv
        ID=$((ID + 1))
      fi
    done < <(grep '^\- \[ \]' data/pipeline.md | head -20)

    BATCH_COUNT=$((ID - NEXT_NUM))
    log "Batch input created: $BATCH_COUNT offers"

    if [[ "$DRY_RUN" == false && "$BATCH_COUNT" -gt 0 ]]; then
      # Run evaluation via claude CLI (each offer gets full A-G evaluation)
      log "Running batch evaluation with $PARALLEL parallel workers..."
      log "This uses Claude CLI — each offer takes ~2-3 min to evaluate"

      if command -v claude &>/dev/null; then
        # Use batch-runner if available
        if [[ -x batch/batch-runner.sh ]]; then
          bash batch/batch-runner.sh --parallel "$PARALLEL" 2>&1 || log "Batch runner completed with warnings"
        else
          # Fallback: evaluate one at a time via claude -p
          while IFS=$'\t' read -r ID URL SOURCE NOTES; do
            [[ "$ID" == "id" ]] && continue  # skip header
            log "Evaluating #$ID: $SOURCE — $NOTES"

            PROMPT=$(cat batch/batch-prompt.md)
            PROMPT="${PROMPT//\{\{URL\}\}/$URL}"
            PROMPT="${PROMPT//\{\{REPORT_NUM\}\}/$ID}"
            PROMPT="${PROMPT//\{\{DATE\}\}/$DATE}"
            PROMPT="${PROMPT//\{\{ID\}\}/$ID}"
            PROMPT="${PROMPT//\{\{JD_FILE\}\}/}"

            echo "$PROMPT" | claude -p --max-turns 15 > "batch/logs/${ID}.log" 2>&1 || true
          done < batch/batch-input.tsv
        fi
      else
        log "WARNING: claude CLI not found. Skipping evaluation."
        log "Install: https://docs.anthropic.com/claude-code"
      fi

      # Merge tracker additions
      log "Merging tracker additions..."
      node merge-tracker.mjs 2>&1 || log "Merge completed with warnings"

      # Mark evaluated offers as processed in pipeline
      while IFS=$'\t' read -r ID URL SOURCE NOTES; do
        [[ "$ID" == "id" ]] && continue
        sed -i '' "s|- \[ \] ${URL}|- [x] ${URL}|" data/pipeline.md 2>/dev/null || true
      done < batch/batch-input.tsv
    fi

    cat >> "$RESULTS_FILE" <<EOF
## Phase 2: Evaluation
- **Pending in pipeline:** $PENDING
- **Evaluated this run:** $BATCH_COUNT
- **Dry run:** $DRY_RUN

EOF
  else
    log "No pending offers to evaluate"
    echo -e "## Phase 2: Evaluation\n- No pending offers\n" >> "$RESULTS_FILE"
  fi
fi

##############################################################################
# PHASE 3: APPLY (to offers scoring >= threshold)
##############################################################################
section "PHASE 3 — Applying to High-Scoring Offers"

# Read applications.md and find offers >= threshold with status "Evaluated"
APPLY_QUEUE=""
APPLIED_COUNT=0

while IFS='|' read -r _ NUM ADATE COMPANY ROLE SCORE STATUS PDF REPORT NOTES _; do
  # Clean whitespace
  NUM=$(echo "$NUM" | tr -d ' ')
  SCORE=$(echo "$SCORE" | tr -d ' ' | sed 's|/5||')
  STATUS=$(echo "$STATUS" | tr -d ' ')
  COMPANY=$(echo "$COMPANY" | sed 's/^ *//;s/ *$//')
  ROLE=$(echo "$ROLE" | sed 's/^ *//;s/ *$//')

  # Skip non-numeric or header rows
  [[ ! "$NUM" =~ ^[0-9]+$ ]] && continue
  [[ -z "$SCORE" || "$SCORE" == "N/A" ]] && continue

  # Only apply to "Evaluated" offers above threshold
  if [[ "$STATUS" == "Evaluated" ]] && (( $(echo "$SCORE >= $THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
    # Find the job URL from the report
    REPORT_PATH=$(echo "$REPORT" | sed -n 's/.*(\(reports\/[^)]*\)).*/\1/p' || true)
    JOB_URL=""
    if [[ -n "$REPORT_PATH" && -f "$REPORT_PATH" ]]; then
      JOB_URL=$(sed -n 's/\*\*URL:\*\* *\(http[^ ]*\)/\1/p' "$REPORT_PATH" | head -1 || true)
    fi

    if [[ -n "${JOB_URL:-}" ]]; then
      APPLIED_COUNT=$((APPLIED_COUNT + 1))
      if [[ "$APPLIED_COUNT" -gt "$MAX_APPLY" ]]; then
        log "Reached max apply limit ($MAX_APPLY). Remaining queued for next run."
        break
      fi

      log "APPLYING: $COMPANY — $ROLE (score: $SCORE) $JOB_URL"

      # Check if a tailored PDF exists
      COMPANY_SLUG=$(echo "$COMPANY" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
      PDF_PATH="output/cv-jagadeesh-${COMPANY_SLUG}-${DATE}.pdf"

      if [[ "$DRY_RUN" == true ]]; then
        log "  DRY RUN — would apply to: $JOB_URL"
        log "  Resume: ${PDF_PATH} ($([ -f "$PDF_PATH" ] && echo 'exists' || echo 'would generate'))"

        cat >> "$RESULTS_FILE" <<EOF
### $COMPANY — $ROLE ⭐ $SCORE/5
- **URL:** $JOB_URL
- **Status:** DRY RUN — would apply
- **PDF:** $PDF_PATH

EOF
      else
        # Submit via Playwright browser automation
        RESUME_ARG=""
        if [[ -f "$PDF_PATH" ]]; then
          RESUME_ARG="--resume $PDF_PATH"
        fi
        APPLY_RESULT=$(node apply-browser.mjs --url "$JOB_URL" $RESUME_ARG 2>&1 || echo '{"status":"error","error":"apply-browser.mjs failed"}')
        APPLY_STATUS=$(echo "$APPLY_RESULT" | node -pe "try{JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).status}catch(e){'error'}" 2>/dev/null || echo "error")

        if [[ "$APPLY_STATUS" == "applied" ]]; then
          log "  ✅ Applied successfully!"
          # Update tracker status to Applied
          sed -i '' "s/| *${NUM} *|.*Evaluated/| ${NUM} | $(echo "$ADATE" | tr -d ' ') | $COMPANY | $ROLE | $SCORE\/5 | Applied/" data/applications.md 2>/dev/null || true

          cat >> "$RESULTS_FILE" <<EOF
### ✅ $COMPANY — $ROLE ⭐ $SCORE/5
- **URL:** $JOB_URL
- **Status:** APPLIED
- **ATS:** $(echo "$APPLY_RESULT" | node -pe "try{JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).ats}catch(e){'unknown'}" 2>/dev/null || echo "unknown")

EOF
        else
          log "  ⚠️  Application failed: $APPLY_STATUS"
          APPLY_ERROR=$(echo "$APPLY_RESULT" | node -pe "try{JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).error}catch(e){'unknown error'}" 2>/dev/null || echo "unknown")
          log "  Error: $APPLY_ERROR"

          cat >> "$RESULTS_FILE" <<EOF
### ⚠️ $COMPANY — $ROLE ⭐ $SCORE/5
- **URL:** $JOB_URL
- **Status:** FAILED — $APPLY_ERROR
- **Action needed:** Apply manually at the URL above

EOF
        fi
      fi
    fi
  fi
done < data/applications.md

if [[ "$APPLIED_COUNT" -eq 0 ]]; then
  log "No offers above threshold ($THRESHOLD) ready to apply"
  echo -e "## Phase 3: Apply\n- No offers above $THRESHOLD/5 threshold with 'Evaluated' status\n" >> "$RESULTS_FILE"
else
  echo -e "\n**Total applications attempted:** $APPLIED_COUNT\n" >> "$RESULTS_FILE"
fi

##############################################################################
# PHASE 4: DAILY SUMMARY
##############################################################################
section "PHASE 4 — Daily Summary"

# Count stats from tracker
TOTAL=$(grep -c '^\|[[:space:]]*[0-9]' data/applications.md 2>/dev/null || echo "0")
EVALUATED=$(grep -c 'Evaluated' data/applications.md 2>/dev/null || echo "0")
APPLIED=$(grep -c 'Applied' data/applications.md 2>/dev/null || echo "0")
ABOVE_THRESHOLD=$(awk -F'|' -v t="$THRESHOLD" '/^\|[[:space:]]*[0-9]/ {
  gsub(/[[:space:]]/, "", $6); gsub(/\/5/, "", $6);
  if ($6+0 >= t+0) count++
} END { print count+0 }' data/applications.md 2>/dev/null || echo "0")

cat >> "$RESULTS_FILE" <<EOF
---

## Summary
| Metric | Count |
|--------|-------|
| Total tracked | $TOTAL |
| Evaluated (pending apply) | $EVALUATED |
| Applied | $APPLIED |
| Above threshold ($THRESHOLD) | $ABOVE_THRESHOLD |

---

## Top Offers (score >= $THRESHOLD)

EOF

# List high-scoring offers
awk -F'|' -v t="$THRESHOLD" '/^\|[[:space:]]*[0-9]/ {
  gsub(/[[:space:]]/, "", $6); score=$6; gsub(/\/5/, "", score);
  if (score+0 >= t+0) {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $4);  # company
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $5);  # role
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $6);  # score (already has /5)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $7);  # status
    printf "- **%s** | %s — %s | Status: %s\n", $6, $4, $5, $7
  }
}' data/applications.md >> "$RESULTS_FILE" 2>/dev/null

echo "" >> "$RESULTS_FILE"
echo "---" >> "$RESULTS_FILE"
echo "*Generated by career-ops daily-agent at $(date)*" >> "$RESULTS_FILE"

# Print results
echo ""
cat "$RESULTS_FILE"
log "Results saved to: $RESULTS_FILE"
log "Full report: cat $RESULTS_FILE"
