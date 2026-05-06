#!/usr/bin/env bash
set -euo pipefail

# career-ops batch runner — standalone orchestrator for claude -p workers
# Reads batch-input.tsv, delegates each offer to a claude -p worker,
# tracks state in batch-state.tsv for resumability.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BATCH_DIR="$SCRIPT_DIR"
INPUT_FILE="$BATCH_DIR/batch-input.tsv"
STATE_FILE="$BATCH_DIR/batch-state.tsv"
PROMPT_FILE="$BATCH_DIR/batch-prompt.md"
TRIAGE_PROMPT_FILE="$BATCH_DIR/batch-triage-prompt.md"
LOGS_DIR="$BATCH_DIR/logs"
TRACKER_DIR="$BATCH_DIR/tracker-additions"
REPORTS_DIR="$PROJECT_DIR/reports"
APPLICATIONS_FILE="$PROJECT_DIR/data/applications.md"
LOCK_FILE="$BATCH_DIR/batch-runner.pid"
STATE_LOCK_DIR="$BATCH_DIR/.batch-state.lock"
STATE_LOCK_PID_FILE="$STATE_LOCK_DIR/pid"
STATE_LOCK_TIMEOUT_SECONDS=30
MAIN_PID="${BASHPID:-$$}"

# Defaults
PARALLEL=1
DRY_RUN=false
RETRY_FAILED=false
START_FROM=0
MAX_RETRIES=2
MIN_SCORE=0
RUN_TRIAGE=false
RUN_FULL=false
RUN_ALL=false
TRIAGE_THRESHOLD=3.3

usage() {
  cat <<'USAGE'
career-ops batch runner — process job offers in batch via claude -p workers
Uses your default Claude model (Claude Max subscription).

Usage: batch-runner.sh [OPTIONS]

Pass control:
  --triage              Run Pass 1 only — score all pending via Haiku (fast, cheap)
  --triage-threshold N  Min triage score to pass (default: 3.3; scores >= N pass)
  --full                Run Pass 2 only — full eval on triage_pass entries
  --all                 Bypass triage, full eval on all pending (backward compat)
  (default)             Same as --full; falls back to all pending if no triage done

Options:
  --parallel N         Number of parallel workers (default: 1)
  --dry-run            Show what would be processed, don't execute
  --retry-failed       Only retry offers marked as "failed" in state
  --start-from N       Start from offer ID N (skip earlier IDs)
  --max-retries N      Max retry attempts per offer (default: 2)
  --min-score N        Skip PDF/tracker for offers scoring below N (default: 0 = off)
  -h, --help           Show this help

Files:
  batch-input.tsv        Input offers (id, url, source, notes)
  batch-state.tsv        Processing state (auto-managed)
  batch-prompt.md        Full eval prompt template (Pass 2)
  batch-triage-prompt.md Triage prompt template (Pass 1, Haiku)
  logs/                  Per-offer logs
  tracker-additions/     Tracker lines for post-batch merge

Examples:
  # Two-pass workflow (recommended):
  ./batch-runner.sh --triage --parallel 5
  ./batch-runner.sh --full --parallel 3

  # Dry run to see what would be triaged
  ./batch-runner.sh --triage --dry-run

  # Backward compat: skip triage, eval everything
  ./batch-runner.sh --all --parallel 3

  # Retry only failed offers
  ./batch-runner.sh --retry-failed
USAGE
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --triage) RUN_TRIAGE=true; shift ;;
    --triage-threshold) TRIAGE_THRESHOLD="$2"; shift 2 ;;
    --full) RUN_FULL=true; shift ;;
    --all) RUN_ALL=true; shift ;;
    --parallel) PARALLEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --retry-failed) RETRY_FAILED=true; shift ;;
    --start-from) START_FROM="$2"; shift 2 ;;
    --max-retries) MAX_RETRIES="$2"; shift 2 ;;
    --min-score) MIN_SCORE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Lock file to prevent double execution
acquire_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    local old_pid
    old_pid=$(cat "$LOCK_FILE")
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "ERROR: Another batch-runner is already running (PID $old_pid)"
      echo "If this is stale, remove $LOCK_FILE"
      exit 1
    else
      echo "WARN: Stale lock file found (PID $old_pid not running). Removing."
      rm -f "$LOCK_FILE"
    fi
  fi
  echo "$MAIN_PID" > "$LOCK_FILE"
}

release_lock() {
  if [[ "${BASHPID:-$$}" != "$MAIN_PID" ]]; then
    return
  fi
  rm -f "$LOCK_FILE"
}

trap release_lock EXIT

# Validate prerequisites
check_prerequisites() {
  if [[ ! -f "$INPUT_FILE" ]]; then
    echo "ERROR: $INPUT_FILE not found. Add offers first."
    exit 1
  fi

  if [[ "$RUN_TRIAGE" == "true" && ! -f "$TRIAGE_PROMPT_FILE" ]]; then
    echo "ERROR: $TRIAGE_PROMPT_FILE not found."
    exit 1
  fi

  if [[ "$RUN_TRIAGE" != "true" && ! -f "$PROMPT_FILE" ]]; then
    echo "ERROR: $PROMPT_FILE not found."
    exit 1
  fi

  if ! command -v claude &>/dev/null; then
    echo "ERROR: 'claude' CLI not found in PATH."
    exit 1
  fi

  mkdir -p "$LOGS_DIR" "$TRACKER_DIR" "$REPORTS_DIR"
}

# Initialize state file if it doesn't exist
init_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    printf 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries\n' > "$STATE_FILE"
  fi
}

acquire_state_lock() {
  local waited=0
  local max_waits=$((STATE_LOCK_TIMEOUT_SECONDS * 10))

  while true; do
    if mkdir "$STATE_LOCK_DIR" 2>/dev/null; then
      if printf '%s\n' "${BASHPID:-$$}" > "$STATE_LOCK_PID_FILE"; then
        return 0
      fi
      rm -f "$STATE_LOCK_PID_FILE" 2>/dev/null || true
      rmdir "$STATE_LOCK_DIR" 2>/dev/null || true
      echo "ERROR: Failed to initialize state lock metadata at $STATE_LOCK_DIR"
      return 1
    fi

    if [[ ! -d "$STATE_LOCK_DIR" ]]; then
      echo "ERROR: Failed to create state lock directory $STATE_LOCK_DIR"
      return 1
    fi

    if [[ -f "$STATE_LOCK_PID_FILE" ]]; then
      local lock_pid
      lock_pid=$(cat "$STATE_LOCK_PID_FILE" 2>/dev/null || true)
      if [[ -n "$lock_pid" ]] && ! kill -0 "$lock_pid" 2>/dev/null; then
        rm -f "$STATE_LOCK_PID_FILE"
        if rmdir "$STATE_LOCK_DIR" 2>/dev/null; then
          echo "WARN: Recovered stale state lock (PID $lock_pid not running)."
          continue
        fi
      fi
    fi

    if (( waited >= max_waits )); then
      echo "ERROR: Timed out waiting for state lock at $STATE_LOCK_DIR"
      echo "If no batch-runner worker is active, remove the stale lock directory."
      return 1
    fi

    sleep 0.1
    ((waited += 1))
  done
}

release_state_lock() {
  rm -f "$STATE_LOCK_PID_FILE" 2>/dev/null || true
  rmdir "$STATE_LOCK_DIR" 2>/dev/null || true
}

run_with_state_lock() {
  acquire_state_lock || return $?

  local status=0
  if "$@"; then
    status=0
  else
    status=$?
  fi

  release_state_lock
  return "$status"
}

# Get status of an offer from state file
get_status() {
  local id="$1"
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "none"
    return
  fi
  local status
  status=$(awk -F'\t' -v id="$id" '$1 == id { print $3 }' "$STATE_FILE")
  echo "${status:-none}"
}

# Get retry count for an offer
get_retries() {
  local id="$1"
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "0"
    return
  fi
  local retries
  retries=$(awk -F'\t' -v id="$id" '$1 == id { print $9 }' "$STATE_FILE")
  echo "${retries:-0}"
}

# Calculate next report number.
# Caller must hold STATE_LOCK_DIR while this runs.
next_report_num_unlocked() {
  local max_num=0
  if [[ -d "$REPORTS_DIR" ]]; then
    for f in "$REPORTS_DIR"/*.md; do
      [[ -f "$f" ]] || continue
      local basename
      basename=$(basename "$f")
      local num="${basename%%-*}"
      num=$((10#$num)) # Remove leading zeros for arithmetic
      if (( num > max_num )); then
        max_num=$num
      fi
    done
  fi
  # Also check state file for assigned report numbers
  if [[ -f "$STATE_FILE" ]]; then
    while IFS=$'\t' read -r _ _ _ _ _ rnum _ _ _; do
      [[ "$rnum" == "report_num" || "$rnum" == "-" || -z "$rnum" ]] && continue
      local n=$((10#$rnum))
      if (( n > max_num )); then
        max_num=$n
      fi
    done < "$STATE_FILE"
  fi
  printf '%03d' $((max_num + 1))
}

# Update or insert state for an offer.
# Caller must hold STATE_LOCK_DIR while this runs.
update_state_unlocked() {
  local id="$1" url="$2" status="$3" started="$4" completed="$5" report_num="$6" score="$7" error="$8" retries="$9"

  if [[ ! -f "$STATE_FILE" ]]; then
    init_state
  fi

  local tmp="$STATE_FILE.tmp"
  local found=false

  # Write header
  head -1 "$STATE_FILE" > "$tmp"

  # Process existing lines
  while IFS=$'\t' read -r sid surl sstatus sstarted scompleted sreport sscore serror sretries; do
    [[ "$sid" == "id" ]] && continue  # skip header
    if [[ "$sid" == "$id" ]]; then
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$id" "$url" "$status" "$started" "$completed" "$report_num" "$score" "$error" "$retries" >> "$tmp"
      found=true
    else
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$sid" "$surl" "$sstatus" "$sstarted" "$scompleted" "$sreport" "$sscore" "$serror" "$sretries" >> "$tmp"
    fi
  done < "$STATE_FILE"

  if [[ "$found" == "false" ]]; then
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$id" "$url" "$status" "$started" "$completed" "$report_num" "$score" "$error" "$retries" >> "$tmp"
  fi

  mv "$tmp" "$STATE_FILE"
}

update_state() {
  run_with_state_lock update_state_unlocked "$@"
}

reserve_report_num_unlocked() {
  local id="$1" url="$2" started="$3" retries="$4"

  local report_num=""
  if report_num=$(next_report_num_unlocked); then
    update_state_unlocked "$id" "$url" "processing" "$started" "-" "$report_num" "-" "-" "$retries"
  fi

  printf '%s\n' "$report_num"
}

reserve_report_num() {
  run_with_state_lock reserve_report_num_unlocked "$@"
}

# Triage a single offer (Pass 1 — Haiku, fast, no report/PDF/tracker)
process_triage() {
  local id="$1" url="$2"

  local started_at
  started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local retries
  retries=$(get_retries "$id")
  local jd_file="/tmp/batch-jd-${id}.txt"

  echo "--- Triaging offer #$id: $url (attempt $((retries + 1)))"

  local resolved_prompt="$BATCH_DIR/.resolved-triage-${id}.md"
  local esc_url esc_jd_file esc_id
  esc_url="${url//\\/\\\\}"
  esc_url="${esc_url//|/\\|}"
  esc_jd_file="${jd_file//\\/\\\\}"
  esc_jd_file="${esc_jd_file//|/\\|}"
  esc_id="${id//|/\\|}"
  sed \
    -e "s|{{URL}}|${esc_url}|g" \
    -e "s|{{JD_FILE}}|${esc_jd_file}|g" \
    -e "s|{{ID}}|${esc_id}|g" \
    "$TRIAGE_PROMPT_FILE" > "$resolved_prompt"

  local log_file="$LOGS_DIR/triage-${id}.log"
  local prompt="Triage this job offer. URL: $url. Output only a JSON object."

  local exit_code=0
  claude -p \
    --model claude-haiku-4-5-20251001 \
    --dangerously-skip-permissions \
    --append-system-prompt-file "$resolved_prompt" \
    "$prompt" \
    > "$log_file" 2>&1 || exit_code=$?

  rm -f "$resolved_prompt"

  local completed_at
  completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if [[ $exit_code -eq 0 ]]; then
    local triage_score="-"
    local score_match
    score_match=$(grep -o '"triage_score":[[:space:]]*[0-9.]*' "$log_file" 2>/dev/null | grep -o '[0-9.]*$' | head -1 || true)
    if [[ -n "$score_match" ]]; then
      triage_score="$score_match"
    fi

    local status="triage_fail"
    if [[ "$triage_score" != "-" ]] && (( $(echo "$triage_score >= $TRIAGE_THRESHOLD" | bc -l) )); then
      status="triage_pass"
    fi

    local triage_reason title_only_flag
    triage_reason=$(grep -o '"triage_reason":[[:space:]]*"[^"]*"' "$log_file" 2>/dev/null | sed 's/"triage_reason":[[:space:]]*"//' | sed 's/"$//' | head -1 || true)
    title_only_flag=$(grep -o '"title_only":[[:space:]]*[a-z]*' "$log_file" 2>/dev/null | grep -o '[a-z]*$' | head -1 || true)

    update_state "$id" "$url" "$status" "$started_at" "$completed_at" "-" "$triage_score" "-" "$retries"
    echo "    $([ "$status" = "triage_pass" ] && echo "✅" || echo "❌") Triage $status (score: $triage_score$([ "$title_only_flag" = "true" ] && echo ", title-only" || echo ""))"
    [[ -n "$triage_reason" ]] && echo "    → $triage_reason"
  else
    retries=$((retries + 1))
    local error_msg
    error_msg=$(tail -5 "$log_file" 2>/dev/null | tr '\n' ' ' | cut -c1-200 || echo "Unknown error (exit code $exit_code)")
    update_state "$id" "$url" "failed" "$started_at" "$completed_at" "-" "-" "$error_msg" "$retries"
    echo "    ❌ Triage failed (attempt $retries, exit code $exit_code)"
  fi
}

# Process a single offer
process_offer() {
  local id="$1" url="$2" source="$3" notes="$4"

  local started_at
  started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local retries
  retries=$(get_retries "$id")
  local report_num
  report_num=$(reserve_report_num "$id" "$url" "$started_at" "$retries")
  local date
  date=$(date +%Y-%m-%d)
  local jd_file="/tmp/batch-jd-${id}.txt"

  echo "--- Processing offer #$id: $url (report $report_num, attempt $((retries + 1)))"

  # Build the prompt with placeholders replaced
  local prompt
  prompt="Procesa esta oferta de empleo. Ejecuta el pipeline completo: evaluación A-F + report .md + PDF + tracker line."
  prompt="$prompt URL: $url"
  prompt="$prompt JD file: $jd_file"
  prompt="$prompt Report number: $report_num"
  prompt="$prompt Date: $date"
  prompt="$prompt Batch ID: $id"

  local log_file="$LOGS_DIR/${report_num}-${id}.log"

  # Prepare system prompt with placeholders resolved
  local resolved_prompt="$BATCH_DIR/.resolved-prompt-${id}.md"
  # Escape sed delimiter characters in variables to prevent substitution breakage
  local esc_url esc_jd_file esc_report_num esc_date esc_id
  esc_url="${url//\\/\\\\}"
  esc_url="${esc_url//|/\\|}"
  esc_jd_file="${jd_file//\\/\\\\}"
  esc_jd_file="${esc_jd_file//|/\\|}"
  esc_report_num="${report_num//|/\\|}"
  esc_date="${date//|/\\|}"
  esc_id="${id//|/\\|}"
  sed \
    -e "s|{{URL}}|${esc_url}|g" \
    -e "s|{{JD_FILE}}|${esc_jd_file}|g" \
    -e "s|{{REPORT_NUM}}|${esc_report_num}|g" \
    -e "s|{{DATE}}|${esc_date}|g" \
    -e "s|{{ID}}|${esc_id}|g" \
    "$PROMPT_FILE" > "$resolved_prompt"

  # Launch claude -p worker (uses default model from Claude Max subscription)
  local exit_code=0
  claude -p \
    --dangerously-skip-permissions \
    --append-system-prompt-file "$resolved_prompt" \
    "$prompt" \
    > "$log_file" 2>&1 || exit_code=$?

  # Cleanup resolved prompt
  rm -f "$resolved_prompt"

  local completed_at
  completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if [[ $exit_code -eq 0 ]]; then
    # Try to extract score from worker output
    local score="-"
    local score_match
   score_match=$(sed -nE 's/.*"score":[[:space:]]*([0-9.]+).*/\1/p' "$log_file" 2>/dev/null | head -1 || true)
    if [[ -n "$score_match" ]]; then
      score="$score_match"
    fi

    # Check min-score gate
    if [[ "$score" != "-" && -n "$score" ]] && (( $(echo "$MIN_SCORE > 0" | bc -l) )); then
      if (( $(echo "$score < $MIN_SCORE" | bc -l) )); then
        update_state "$id" "$url" "skipped" "$started_at" "$completed_at" "$report_num" "$score" "below-min-score" "$retries"
        echo "    ⏭️  Skipped (score: $score < min-score: $MIN_SCORE)"
        return
      fi
    fi

    update_state "$id" "$url" "completed" "$started_at" "$completed_at" "$report_num" "$score" "-" "$retries"
    echo "    ✅ Completed (score: $score, report: $report_num)"
  else
    retries=$((retries + 1))
    local error_msg
    error_msg=$(tail -5 "$log_file" 2>/dev/null | tr '\n' ' ' | cut -c1-200 || echo "Unknown error (exit code $exit_code)")
    update_state "$id" "$url" "failed" "$started_at" "$completed_at" "$report_num" "-" "$error_msg" "$retries"
    echo "    ❌ Failed (attempt $retries, exit code $exit_code)"
  fi
}

# Merge tracker additions into applications.md
merge_tracker() {
  echo ""
  echo "=== Merging tracker additions ==="
  node "$PROJECT_DIR/merge-tracker.mjs"
  echo ""
  echo "=== Verifying pipeline integrity ==="
  node "$PROJECT_DIR/verify-pipeline.mjs" || echo "⚠️  Verification found issues (see above)"
}

# Print summary
print_summary() {
  echo ""
  echo "=== Batch Summary ==="

  if [[ ! -f "$STATE_FILE" ]]; then
    echo "No state file found."
    return
  fi

  local total=0 completed=0 failed=0 pending=0
  local score_sum=0 score_count=0

  while IFS=$'\t' read -r sid _ sstatus _ _ _ sscore _ _; do
    [[ "$sid" == "id" ]] && continue
    total=$((total + 1))
    case "$sstatus" in
      completed) completed=$((completed + 1))
        if [[ "$sscore" != "-" && -n "$sscore" ]]; then
          score_sum=$(echo "$score_sum + $sscore" | bc 2>/dev/null || echo "$score_sum")
          score_count=$((score_count + 1))
        fi
        ;;
      failed) failed=$((failed + 1)) ;;
      *) pending=$((pending + 1)) ;;
    esac
  done < "$STATE_FILE"

  echo "Total: $total | Completed: $completed | Failed: $failed | Pending: $pending"

  if (( score_count > 0 )); then
    local avg
    avg=$(echo "scale=1; $score_sum / $score_count" | bc 2>/dev/null || echo "N/A")
    echo "Average score: $avg/5 ($score_count scored)"
  fi
}

# Main
main() {
  check_prerequisites

  if [[ "$DRY_RUN" == "false" ]]; then
    acquire_lock
  fi

  init_state

  # Count input offers (skip header, ignore blank lines)
  local total_input
  total_input=$(tail -n +2 "$INPUT_FILE" | grep -c '[^[:space:]]' 2>/dev/null || true)
  total_input="${total_input:-0}"

  if (( total_input == 0 )); then
    echo "No offers in $INPUT_FILE. Add offers first."
    exit 0
  fi

  # Determine pass mode
  # --triage: Pass 1 only. --full or default: Pass 2 (triage_pass entries).
  # --all: Pass 2 on all pending (backward compat).
  local MODE="full"
  if [[ "$RUN_TRIAGE" == "true" ]]; then
    MODE="triage"
  elif [[ "$RUN_ALL" == "true" ]]; then
    MODE="all"
  fi

  echo "=== career-ops batch runner ==="
  echo "Mode: $MODE | Parallel: $PARALLEL | Max retries: $MAX_RETRIES"
  [[ "$MODE" == "triage" ]] && echo "Triage threshold: >= $TRIAGE_THRESHOLD"
  echo "Input: $total_input offers"
  echo ""

  # Build list of offers to process
  local -a pending_ids=()
  local -a pending_urls=()
  local -a pending_sources=()
  local -a pending_notes=()

  # Detect whether any triage has been run (for smart default fallback)
  local any_triage_done=false
  if [[ -f "$STATE_FILE" ]]; then
    if grep -qE '	triage_pass|	triage_fail' "$STATE_FILE" 2>/dev/null; then
      any_triage_done=true
    fi
  fi

  while IFS=$'\t' read -r id url source notes; do
    [[ "$id" == "id" ]] && continue
    [[ -z "$id" || -z "$url" ]] && continue
    [[ "$id" =~ ^[0-9]+$ ]] || continue

    if (( id < START_FROM )); then
      continue
    fi

    local status
    status=$(get_status "$id")

    if [[ "$RETRY_FAILED" == "true" ]]; then
      if [[ "$status" != "failed" ]]; then
        continue
      fi
      local retries
      retries=$(get_retries "$id")
      if (( retries >= MAX_RETRIES )); then
        echo "SKIP #$id: max retries ($MAX_RETRIES) reached"
        continue
      fi
    else
      case "$MODE" in
        triage)
          # Pass 1: process entries that are pending/none/failed (not already triaged or completed)
          if [[ "$status" == "completed" || "$status" == "triage_pass" || "$status" == "triage_fail" ]]; then
            continue
          fi
          if [[ "$status" == "failed" ]]; then
            local retries
            retries=$(get_retries "$id")
            if (( retries >= MAX_RETRIES )); then
              echo "SKIP #$id: failed and max retries reached"
              continue
            fi
          fi
          ;;
        full)
          # Pass 2: process triage_pass entries only.
          # If no triage has been run yet, fall back to pending/none (backward compat).
          if [[ "$any_triage_done" == "true" ]]; then
            if [[ "$status" != "triage_pass" ]]; then
              continue
            fi
          else
            if [[ "$status" == "completed" || "$status" == "triage_fail" ]]; then
              continue
            fi
            if [[ "$status" == "failed" ]]; then
              local retries
              retries=$(get_retries "$id")
              if (( retries >= MAX_RETRIES )); then
                echo "SKIP #$id: failed and max retries reached"
                continue
              fi
            fi
          fi
          ;;
        all)
          # Bypass triage: process all pending/none (original behaviour)
          if [[ "$status" == "completed" ]]; then
            continue
          fi
          if [[ "$status" == "failed" ]]; then
            local retries
            retries=$(get_retries "$id")
            if (( retries >= MAX_RETRIES )); then
              echo "SKIP #$id: failed and max retries reached (use --retry-failed to force)"
              continue
            fi
          fi
          # Skip triage results in --all mode (re-eval only truly unprocessed)
          if [[ "$status" == "triage_fail" ]]; then
            continue
          fi
          ;;
      esac
    fi

    pending_ids+=("$id")
    pending_urls+=("$url")
    pending_sources+=("$source")
    pending_notes+=("$notes")
  done < "$INPUT_FILE"

  local pending_count=${#pending_ids[@]}

  if (( pending_count == 0 )); then
    echo "No offers to process."
    print_summary
    exit 0
  fi

  echo "Pending: $pending_count offers"
  echo ""

  # Dry run: just list
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "=== DRY RUN (no processing) ==="
    for i in "${!pending_ids[@]}"; do
      local status
      status=$(get_status "${pending_ids[$i]}")
      echo "  #${pending_ids[$i]}: ${pending_urls[$i]} [${pending_sources[$i]}] (status: $status)"
    done
    echo ""
    echo "Would process $pending_count offers"
    exit 0
  fi

  # Run the appropriate worker function
  run_workers() {
    local worker_fn="$1"
    shift
    if (( PARALLEL <= 1 )); then
      for i in "${!pending_ids[@]}"; do
        "$worker_fn" "${pending_ids[$i]}" "${pending_urls[$i]}" "${pending_sources[$i]}" "${pending_notes[$i]}"
      done
    else
      local running=0
      local -a pids=()
      local -a pid_ids=()

      for i in "${!pending_ids[@]}"; do
        while (( running >= PARALLEL )); do
          for j in "${!pids[@]}"; do
            if ! kill -0 "${pids[$j]}" 2>/dev/null; then
              wait "${pids[$j]}" 2>/dev/null || true
              unset 'pids[j]'
              unset 'pid_ids[j]'
              running=$((running - 1))
            fi
          done
          pids=("${pids[@]}")
          pid_ids=("${pid_ids[@]}")
          sleep 1
        done

        "$worker_fn" "${pending_ids[$i]}" "${pending_urls[$i]}" "${pending_sources[$i]}" "${pending_notes[$i]}" &
        pids+=($!)
        pid_ids+=("${pending_ids[$i]}")
        running=$((running + 1))
      done

      for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
      done
    fi
  }

  if [[ "$MODE" == "triage" ]]; then
    run_workers process_triage
    echo ""
    echo "=== Triage Summary ==="
    local t_pass=0 t_fail=0 t_score_sum=0 t_score_count=0
    while IFS=$'\t' read -r sid _ sstatus _ _ _ sscore _ _; do
      [[ "$sid" == "id" ]] && continue
      case "$sstatus" in
        triage_pass)
          t_pass=$((t_pass + 1))
          if [[ "$sscore" != "-" && -n "$sscore" ]]; then
            t_score_sum=$(echo "$t_score_sum + $sscore" | bc 2>/dev/null || echo "$t_score_sum")
            t_score_count=$((t_score_count + 1))
          fi
          ;;
        triage_fail) t_fail=$((t_fail + 1)) ;;
      esac
    done < "$STATE_FILE"
    echo "Passed: $t_pass | Failed: $t_fail"
    if (( t_score_count > 0 )); then
      local avg
      avg=$(echo "scale=1; $t_score_sum / $t_score_count" | bc 2>/dev/null || echo "N/A")
      echo "Average triage score: $avg/5"
    fi
    echo ""
    echo "→ Run ./batch-runner.sh --full to evaluate the $t_pass passed offers."
  else
    run_workers process_offer
    merge_tracker
    print_summary
  fi
}

main "$@"
