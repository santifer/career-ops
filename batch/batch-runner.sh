#!/usr/bin/env bash
set -euo pipefail

# career-ops batch runner — standalone orchestrator for Claude, Codex, or manual workers
# Reads batch-input.tsv, delegates each offer to the selected worker backend,
# tracks state in batch-state.tsv for resumability.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BATCH_DIR="$SCRIPT_DIR"
INPUT_FILE="$BATCH_DIR/batch-input.tsv"
STATE_FILE="$BATCH_DIR/batch-state.tsv"
PROMPT_FILE="$BATCH_DIR/batch-prompt.md"
OUTPUT_SCHEMA_FILE="$BATCH_DIR/batch-output-schema.json"
CODEX_RUNNER_PS1="$BATCH_DIR/run-codex-worker.ps1"
LOGS_DIR="$BATCH_DIR/logs"
TRACKER_DIR="$BATCH_DIR/tracker-additions"
MANUAL_DIR="$BATCH_DIR/manual-work-items"
REPORTS_DIR="$PROJECT_DIR/reports"
APPLICATIONS_FILE="$PROJECT_DIR/data/applications.md"
LOCK_FILE="$BATCH_DIR/batch-runner.pid"

# Defaults
PARALLEL=1
DRY_RUN=false
RETRY_FAILED=false
START_FROM=0
MAX_RETRIES=2
AGENT_MODE="${BATCH_AGENT:-claude}"
RESOLVED_AGENT_MODE=""
AGENT_BIN=""

usage() {
  cat <<'USAGE'
career-ops batch runner — process job offers in batch via Claude, Codex, or manual work packets

Usage: batch-runner.sh [OPTIONS]

Options:
  --agent MODE        Worker backend: claude, codex, manual, auto (default: claude)
  --parallel N         Number of parallel workers (default: 1)
  --dry-run            Show what would be processed, don't execute
  --retry-failed       Only retry offers marked as "failed" in state
  --start-from N       Start from offer ID N (skip earlier IDs)
  --max-retries N      Max retry attempts per offer (default: 2)
  -h, --help           Show this help

Files:
  batch-input.tsv      Input offers (id, url, source, notes)
  batch-state.tsv      Processing state (auto-managed)
  batch-prompt.md      Prompt template for workers
  batch-output-schema.json  Codex output contract
  logs/                Per-offer logs
  tracker-additions/   Tracker lines for post-batch merge
  manual-work-items/   Prepared packets for manual fallback

Examples:
  # Dry run to see pending offers
  ./batch-runner.sh --dry-run

  # Run through Codex CLI
  ./batch-runner.sh --agent codex

  # Process all pending
  ./batch-runner.sh

  # Retry only failed offers
  ./batch-runner.sh --retry-failed

  # Process 2 at a time starting from ID 10
  ./batch-runner.sh --parallel 2 --start-from 10
USAGE
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT_MODE="$2"; shift 2 ;;
    --parallel) PARALLEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --retry-failed) RETRY_FAILED=true; shift ;;
    --start-from) START_FROM="$2"; shift 2 ;;
    --max-retries) MAX_RETRIES="$2"; shift 2 ;;
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
  echo $$ > "$LOCK_FILE"
}

release_lock() {
  rm -f "$LOCK_FILE"
}

trap release_lock EXIT

resolve_agent_mode() {
  case "$AGENT_MODE" in
    claude|codex|manual)
      RESOLVED_AGENT_MODE="$AGENT_MODE"
      ;;
    auto)
      if [[ -n "$(resolve_agent_bin "codex")" ]]; then
        RESOLVED_AGENT_MODE="codex"
      elif [[ -n "$(resolve_agent_bin "claude")" ]]; then
        RESOLVED_AGENT_MODE="claude"
      else
        RESOLVED_AGENT_MODE="manual"
      fi
      ;;
    *)
      echo "ERROR: Unsupported agent mode '$AGENT_MODE'. Use claude, codex, manual, or auto."
      exit 1
      ;;
  esac
}

resolve_agent_bin() {
  local primary="$1"
  command -v "$primary" 2>/dev/null \
    || command -v "${primary}.exe" 2>/dev/null \
    || command -v "${primary}.cmd" 2>/dev/null \
    || true
}

# Validate prerequisites
check_prerequisites() {
  if [[ ! -f "$INPUT_FILE" ]]; then
    echo "ERROR: $INPUT_FILE not found. Add offers first."
    exit 1
  fi

  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "ERROR: $PROMPT_FILE not found."
    exit 1
  fi

  if [[ ! -f "$OUTPUT_SCHEMA_FILE" ]]; then
    echo "ERROR: $OUTPUT_SCHEMA_FILE not found."
    exit 1
  fi

  if [[ ! -f "$CODEX_RUNNER_PS1" ]]; then
    echo "ERROR: $CODEX_RUNNER_PS1 not found."
    exit 1
  fi

  resolve_agent_mode

  case "$RESOLVED_AGENT_MODE" in
    claude)
      AGENT_BIN=$(resolve_agent_bin "claude")
      if [[ -z "$AGENT_BIN" ]]; then
        echo "ERROR: 'claude' CLI not found in PATH."
        exit 1
      fi
      ;;
    codex)
      AGENT_BIN=$(resolve_agent_bin "codex")
      if [[ -z "$AGENT_BIN" ]]; then
        echo "ERROR: 'codex' CLI not found in PATH."
        exit 1
      fi
      ;;
    manual)
      ;;
  esac

  mkdir -p "$LOGS_DIR" "$TRACKER_DIR" "$REPORTS_DIR" "$MANUAL_DIR"
}

# Initialize state file if it doesn't exist
init_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    printf 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries\n' > "$STATE_FILE"
  fi
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

# Calculate next report number
next_report_num() {
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

# Update or insert state for an offer
update_state() {
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

extract_json_field() {
  local file="$1" field="$2"
  [[ -f "$file" ]] || return 0
  local match
  match=$(grep -oP "\"${field}\":\\s*(\"[^\"]*\"|null|[0-9.]+)" "$file" 2>/dev/null | head -1 || true)
  if [[ -z "$match" ]]; then
    return 0
  fi
  echo "$match" | sed -E "s/\"${field}\":\\s*//" | sed -E 's/^"//; s/"$//'
}

to_host_path() {
  local path="$1"
  if command -v wslpath &>/dev/null; then
    wslpath -w "$path"
  else
    echo "$path"
  fi
}

run_worker() {
  local resolved_prompt="$1"
  local prompt="$2"
  local log_file="$3"
  local result_file="$4"
  local manual_dir="$5"

  case "$RESOLVED_AGENT_MODE" in
    claude)
      "$AGENT_BIN" -p \
        --dangerously-skip-permissions \
        --append-system-prompt-file "$resolved_prompt" \
        "$prompt" \
        > "$log_file" 2>&1
      ;;
    codex)
      local codex_bin_host
      local project_dir_host
      local output_schema_host
      local result_file_host
      local prompt_file_host
      local codex_runner_host
      codex_bin_host=$(to_host_path "$AGENT_BIN")
      project_dir_host=$(to_host_path "$PROJECT_DIR")
      output_schema_host=$(to_host_path "$OUTPUT_SCHEMA_FILE")
      result_file_host=$(to_host_path "$result_file")
      prompt_file_host=$(to_host_path "$resolved_prompt")
      codex_runner_host=$(to_host_path "$CODEX_RUNNER_PS1")

      powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$codex_runner_host" \
        -CodexPath "$codex_bin_host" \
        -ProjectDir "$project_dir_host" \
        -OutputSchemaFile "$output_schema_host" \
        -ResultFile "$result_file_host" \
        -PromptFile "$prompt_file_host" \
        > "$log_file" 2>&1
      ;;
    manual)
      mkdir -p "$manual_dir"
      cp "$resolved_prompt" "$manual_dir/prompt.md"
      cat > "$manual_dir/metadata.json" <<EOF
{
  "status": "prepared",
  "agent": "manual",
  "instructions": "Open prompt.md in Claude Code or Codex and execute the job manually. Save the final JSON result to result.json and generated outputs to the standard repo paths.",
  "prepared_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
      cat > "$result_file" <<EOF
{
  "status": "prepared",
  "id": null,
  "report_num": null,
  "company": null,
  "role": null,
  "score": null,
  "pdf": null,
  "report": null,
  "error": null
}
EOF
      {
        echo "Prepared manual work item:"
        echo "  prompt: $manual_dir/prompt.md"
        echo "  metadata: $manual_dir/metadata.json"
      } > "$log_file"
      ;;
  esac
}

# Process a single offer
process_offer() {
  local id="$1" url="$2" source="$3" notes="$4"

  local report_num
  report_num=$(next_report_num)
  local date
  date=$(date +%Y-%m-%d)
  local started_at
  started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local retries
  retries=$(get_retries "$id")
  local jd_file="/tmp/batch-jd-${id}.txt"

  echo "--- Processing offer #$id: $url (report $report_num, attempt $((retries + 1)))"

  # Mark as in-progress
  update_state "$id" "$url" "processing" "$started_at" "-" "$report_num" "-" "-" "$retries"

  # Build the prompt with placeholders replaced
  local prompt
  prompt="Process this job posting. Run the full pipeline: A-F evaluation, markdown report, PDF resume, and tracker line."
  prompt="$prompt URL: $url"
  prompt="$prompt JD file: $jd_file"
  prompt="$prompt Report number: $report_num"
  prompt="$prompt Date: $date"
  prompt="$prompt Batch ID: $id"

  local log_file="$LOGS_DIR/${report_num}-${id}.log"
  local result_file="$LOGS_DIR/${report_num}-${id}.result.json"
  local manual_dir="$MANUAL_DIR/${report_num}-${id}"

  # Prepare system prompt with placeholders resolved
  local resolved_prompt="$BATCH_DIR/.resolved-prompt-${id}.md"
  sed \
    -e "s|{{URL}}|${url}|g" \
    -e "s|{{JD_FILE}}|${jd_file}|g" \
    -e "s|{{REPORT_NUM}}|${report_num}|g" \
    -e "s|{{DATE}}|${date}|g" \
    -e "s|{{ID}}|${id}|g" \
    "$PROMPT_FILE" > "$resolved_prompt"

  local exit_code=0
  run_worker "$resolved_prompt" "$prompt" "$log_file" "$result_file" "$manual_dir" || exit_code=$?

  # Cleanup resolved prompt
  rm -f "$resolved_prompt"

  local completed_at
  completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if [[ $exit_code -eq 0 ]]; then
    local result_source="$result_file"
    if [[ ! -f "$result_source" || ! -s "$result_source" ]]; then
      result_source="$log_file"
    fi

    local worker_status
    worker_status=$(extract_json_field "$result_source" "status")

    if [[ "$worker_status" == "prepared" ]]; then
      update_state "$id" "$url" "prepared" "$started_at" "$completed_at" "$report_num" "-" "-" "$retries"
      echo "    📝 Prepared manual work item (report: $report_num)"
      return
    fi

    local score="-"
    local score_value
    score_value=$(extract_json_field "$result_source" "score")
    if [[ -n "$score_value" && "$score_value" != "null" ]]; then
      score="$score_value"
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

  local total=0 completed=0 failed=0 prepared=0 pending=0
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
      prepared) prepared=$((prepared + 1)) ;;
      failed) failed=$((failed + 1)) ;;
      *) pending=$((pending + 1)) ;;
    esac
  done < "$STATE_FILE"

  echo "Total: $total | Completed: $completed | Prepared: $prepared | Failed: $failed | Pending: $pending"

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

  echo "=== career-ops batch runner ==="
  echo "Agent: $RESOLVED_AGENT_MODE"
  echo "Parallel: $PARALLEL | Max retries: $MAX_RETRIES"
  echo "Input: $total_input offers"
  echo ""

  # Build list of offers to process
  local -a pending_ids=()
  local -a pending_urls=()
  local -a pending_sources=()
  local -a pending_notes=()

  while IFS=$'\t' read -r id url source notes; do
    [[ "$id" == "id" ]] && continue  # skip header
    [[ -z "$id" || -z "$url" ]] && continue

    # Skip if before start-from
    if (( id < START_FROM )); then
      continue
    fi

    local status
    status=$(get_status "$id")

    if [[ "$RETRY_FAILED" == "true" ]]; then
      # Only process failed offers
      if [[ "$status" != "failed" ]]; then
        continue
      fi
      # Check retry limit
      local retries
      retries=$(get_retries "$id")
      if (( retries >= MAX_RETRIES )); then
        echo "SKIP #$id: max retries ($MAX_RETRIES) reached"
        continue
      fi
    else
      # Skip completed offers
      if [[ "$status" == "completed" || "$status" == "prepared" ]]; then
        continue
      fi
      # Skip failed offers that hit retry limit (unless --retry-failed)
      if [[ "$status" == "failed" ]]; then
        local retries
        retries=$(get_retries "$id")
        if (( retries >= MAX_RETRIES )); then
          echo "SKIP #$id: failed and max retries reached (use --retry-failed to force)"
          continue
        fi
      fi
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

  # Process offers
  if (( PARALLEL <= 1 )); then
    # Sequential processing
    for i in "${!pending_ids[@]}"; do
      process_offer "${pending_ids[$i]}" "${pending_urls[$i]}" "${pending_sources[$i]}" "${pending_notes[$i]}"
    done
  else
    # Parallel processing with job control
    local running=0
    local -a pids=()
    local -a pid_ids=()

    for i in "${!pending_ids[@]}"; do
      # Wait if we're at parallel limit
      while (( running >= PARALLEL )); do
        # Wait for any child to finish
        for j in "${!pids[@]}"; do
          if ! kill -0 "${pids[$j]}" 2>/dev/null; then
            wait "${pids[$j]}" 2>/dev/null || true
            unset 'pids[j]'
            unset 'pid_ids[j]'
            running=$((running - 1))
          fi
        done
        # Compact arrays
        pids=("${pids[@]}")
        pid_ids=("${pid_ids[@]}")
        sleep 1
      done

      # Launch worker in background
      process_offer "${pending_ids[$i]}" "${pending_urls[$i]}" "${pending_sources[$i]}" "${pending_notes[$i]}" &
      pids+=($!)
      pid_ids+=("${pending_ids[$i]}")
      running=$((running + 1))
    done

    # Wait for remaining workers
    for pid in "${pids[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
  fi

  # Merge tracker additions
  merge_tracker

  # Print summary
  print_summary
}

main "$@"
