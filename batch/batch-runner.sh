#!/usr/bin/env bash
set -euo pipefail

# career-ops batch runner — standalone orchestrator for pluggable agent workers.
# Reads batch-input.tsv, delegates each offer to the configured backend,
# and tracks state in batch-state.tsv for resumability.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BATCH_DIR="$SCRIPT_DIR"
INPUT_FILE="$BATCH_DIR/batch-input.tsv"
STATE_FILE="$BATCH_DIR/batch-state.tsv"
PROMPT_FILE="$BATCH_DIR/batch-prompt.md"
LOGS_DIR="$BATCH_DIR/logs"
RESULTS_DIR="$BATCH_DIR/results"
TRACKER_DIR="$BATCH_DIR/tracker-additions"
REPORTS_DIR="$PROJECT_DIR/reports"
LOCK_FILE="$BATCH_DIR/batch-runner.pid"
STATE_LOCK_DIR="$BATCH_DIR/.state-lock"
STATE_LOCK_PID_FILE="$STATE_LOCK_DIR/pid"
REPORT_COUNTER_FILE="$BATCH_DIR/.report-counter"

PARALLEL=1
DRY_RUN=false
RETRY_FAILED=false
START_FROM=0
MAX_RETRIES=2
AGENT_BACKEND="${CAREER_OPS_AGENT:-claude}"
CUSTOM_AGENT_COMMAND="${CAREER_OPS_AGENT_COMMAND:-}"

usage() {
  cat <<'USAGE'
career-ops batch runner — process job offers in batch via pluggable coding-agent workers

Usage: batch-runner.sh [OPTIONS]

Options:
  --parallel N         Number of parallel workers (default: 1)
  --dry-run            Show what would be processed, don't execute
  --retry-failed       Only retry offers marked as "failed" in state
  --start-from N       Start from offer ID N (skip earlier IDs)
  --max-retries N      Max retry attempts per offer (default: 2)
  -h, --help           Show this help

Environment:
  CAREER_OPS_AGENT           Backend to use: claude, codex, gemini, copilot, custom
  CAREER_OPS_AGENT_COMMAND   Required for custom backends and recommended for copilot.
                             The command is executed via `bash -lc` with these env vars:
                             CAREER_OPS_PROJECT_DIR, CAREER_OPS_PROMPT_FILE,
                             CAREER_OPS_LOG_FILE, CAREER_OPS_OFFER_URL,
                             CAREER_OPS_BACKEND.

Files:
  batch-input.tsv      Input offers (id, url, source, notes)
  batch-state.tsv      Processing state (auto-managed)
  batch-prompt.md      Prompt template for workers
  logs/                Per-offer logs
  results/             Parsed JSON result artifacts
  tracker-additions/   Tracker lines for post-batch merge

Examples:
  ./batch-runner.sh --dry-run
  CAREER_OPS_AGENT=codex ./batch-runner.sh
  CAREER_OPS_AGENT=gemini ./batch-runner.sh --parallel 2
  CAREER_OPS_AGENT=custom \
    CAREER_OPS_AGENT_COMMAND='copilot -p "$(cat "$CAREER_OPS_PROMPT_FILE")"' \
    ./batch-runner.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --parallel) PARALLEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --retry-failed) RETRY_FAILED=true; shift ;;
    --start-from) START_FROM="$2"; shift 2 ;;
    --max-retries) MAX_RETRIES="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

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

acquire_state_lock() {
  local attempts=0

  while ! mkdir "$STATE_LOCK_DIR" 2>/dev/null; do
    attempts=$((attempts + 1))

    if [[ -f "$STATE_LOCK_PID_FILE" ]]; then
      local owner_pid
      owner_pid=$(cat "$STATE_LOCK_PID_FILE" 2>/dev/null || true)
      if [[ -n "$owner_pid" ]] && ! kill -0 "$owner_pid" 2>/dev/null; then
        rm -f "$STATE_LOCK_PID_FILE"
        rmdir "$STATE_LOCK_DIR" 2>/dev/null || true
        continue
      fi
    fi

    if (( attempts % 100 == 0 )); then
      echo "WARN: Waiting on batch state lock..." >&2
    fi
    sleep 0.05
  done

  printf '%s\n' "${BASHPID:-$$}" > "$STATE_LOCK_PID_FILE"
}

release_state_lock() {
  local owner_pid=""
  owner_pid=$(cat "$STATE_LOCK_PID_FILE" 2>/dev/null || true)
  if [[ "$owner_pid" == "${BASHPID:-$$}" ]]; then
    rm -f "$STATE_LOCK_PID_FILE"
    rmdir "$STATE_LOCK_DIR" 2>/dev/null || true
  fi
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' CLI not found in PATH."
    exit 1
  fi
}

check_prerequisites() {
  if [[ ! -f "$INPUT_FILE" ]]; then
    echo "ERROR: $INPUT_FILE not found. Add offers first."
    exit 1
  fi

  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "ERROR: $PROMPT_FILE not found."
    exit 1
  fi

  case "$AGENT_BACKEND" in
    claude) require_command claude ;;
    codex) require_command codex ;;
    gemini) require_command gemini ;;
    custom)
      if [[ -z "$CUSTOM_AGENT_COMMAND" ]]; then
        echo "ERROR: CAREER_OPS_AGENT_COMMAND is required when CAREER_OPS_AGENT=custom."
        exit 1
      fi
      ;;
    copilot)
      if [[ -z "$CUSTOM_AGENT_COMMAND" ]]; then
        echo "ERROR: CAREER_OPS_AGENT=copilot requires CAREER_OPS_AGENT_COMMAND with your local non-interactive Copilot invocation."
        exit 1
      fi
      ;;
    *)
      echo "ERROR: Unsupported CAREER_OPS_AGENT '$AGENT_BACKEND'. Use claude, codex, gemini, copilot, or custom."
      exit 1
      ;;
  esac

  require_command node
  mkdir -p "$LOGS_DIR" "$RESULTS_DIR" "$TRACKER_DIR" "$REPORTS_DIR"
}

init_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    printf 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries\n' > "$STATE_FILE"
  fi
}

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

next_report_num_unlocked() {
  local max_num=0

  if [[ -f "$REPORT_COUNTER_FILE" ]]; then
    local cached
    cached=$(cat "$REPORT_COUNTER_FILE" 2>/dev/null || true)
    if [[ -n "$cached" ]]; then
      printf '%03d' "$cached"
      return
    fi
  fi

  if [[ -d "$REPORTS_DIR" ]]; then
    for f in "$REPORTS_DIR"/*.md; do
      [[ -f "$f" ]] || continue
      local basename num
      basename=$(basename "$f")
      num="${basename%%-*}"
      num=$((10#$num))
      if (( num > max_num )); then
        max_num=$num
      fi
    done
  fi

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

reserve_next_report_num() {
  local next_num
  acquire_state_lock
  next_num=$(next_report_num_unlocked)
  printf '%s\n' "$((10#$next_num + 1))" > "$REPORT_COUNTER_FILE"
  release_state_lock
  printf '%s\n' "$next_num"
}

update_state_unlocked() {
  local id="$1" url="$2" status="$3" started="$4" completed="$5" report_num="$6" score="$7" error="$8" retries="$9"

  if [[ ! -f "$STATE_FILE" ]]; then
    init_state
  fi

  local tmp="$STATE_FILE.tmp"
  local found=false

  head -1 "$STATE_FILE" > "$tmp"

  while IFS=$'\t' read -r sid surl sstatus sstarted scompleted sreport sscore serror sretries; do
    [[ "$sid" == "id" ]] && continue
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
  acquire_state_lock
  update_state_unlocked "$@"
  release_state_lock
}

run_worker_backend() {
  local resolved_prompt="$1"
  local log_file="$2"
  local offer_url="$3"
  local exit_code=0

  case "$AGENT_BACKEND" in
    claude)
      claude -p \
        --dangerously-skip-permissions \
        --append-system-prompt-file "$resolved_prompt" \
        "Process this career-ops batch offer and return only the final JSON object." \
        > "$log_file" 2>&1 || exit_code=$?
      ;;
    codex)
      codex exec \
        --dangerously-bypass-approvals-and-sandbox \
        --skip-git-repo-check \
        -C "$PROJECT_DIR" \
        -o "$log_file" \
        - < "$resolved_prompt" 2>> "$log_file" || exit_code=$?
      ;;
    gemini)
      gemini -p "$(cat "$resolved_prompt")" > "$log_file" 2>&1 || exit_code=$?
      ;;
    custom|copilot)
      CAREER_OPS_PROJECT_DIR="$PROJECT_DIR" \
      CAREER_OPS_PROMPT_FILE="$resolved_prompt" \
      CAREER_OPS_LOG_FILE="$log_file" \
      CAREER_OPS_OFFER_URL="$offer_url" \
      CAREER_OPS_BACKEND="$AGENT_BACKEND" \
      bash -lc "$CUSTOM_AGENT_COMMAND" > "$log_file" 2>&1 || exit_code=$?
      ;;
  esac

  return "$exit_code"
}

parse_worker_result() {
  local log_file="$1"
  local result_file="$2"

  if ! node "$BATCH_DIR/extract-worker-result.mjs" "$log_file" > "$result_file"; then
    return 1
  fi

  node -e '
const fs = require("fs");
const result = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const fields = [
  result.status,
  result.report_num || "",
  result.company || "",
  result.role || "",
  result.score ?? "",
  result.pdf || "",
  result.report || "",
  result.error || "",
].map((value) => String(value).replace(/[\t\n\r]+/g, " "));
process.stdout.write(fields.join("\t"));
' "$result_file"
}

process_offer() {
  local id="$1" url="$2" source="$3" notes="$4"

  local report_num
  report_num=$(reserve_next_report_num)
  local date
  date=$(date +%Y-%m-%d)
  local started_at
  started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local retries
  retries=$(get_retries "$id")
  local jd_file="/tmp/batch-jd-${id}.txt"
  local log_file="$LOGS_DIR/${report_num}-${id}.log"
  local result_file="$RESULTS_DIR/${id}.json"
  local resolved_prompt="$BATCH_DIR/.resolved-prompt-${id}.md"

  echo "--- Processing offer #$id: $url (report $report_num, attempt $((retries + 1)), backend: $AGENT_BACKEND)"

  update_state "$id" "$url" "processing" "$started_at" "-" "$report_num" "-" "-" "$retries"

  sed \
    -e "s|{{URL}}|${url}|g" \
    -e "s|{{JD_FILE}}|${jd_file}|g" \
    -e "s|{{REPORT_NUM}}|${report_num}|g" \
    -e "s|{{DATE}}|${date}|g" \
    -e "s|{{ID}}|${id}|g" \
    "$PROMPT_FILE" > "$resolved_prompt"

  local exit_code=0
  run_worker_backend "$resolved_prompt" "$log_file" "$url" || exit_code=$?
  rm -f "$resolved_prompt"

  local completed_at
  completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local parsed
  if [[ $exit_code -eq 0 ]] && parsed=$(parse_worker_result "$log_file" "$result_file"); then
    local result_status result_report_num result_company result_role result_score result_pdf result_report result_error
    IFS=$'\t' read -r result_status result_report_num result_company result_role result_score result_pdf result_report result_error <<< "$parsed"

    local score_for_state="-"
    if [[ -n "$result_score" ]]; then
      score_for_state="$result_score"
    fi

    if [[ "$result_status" == "completed" ]]; then
      update_state "$id" "$url" "completed" "$started_at" "$completed_at" "${result_report_num:-$report_num}" "$score_for_state" "-" "$retries"
      echo "    ✅ Completed (score: ${score_for_state}, report: ${result_report_num:-$report_num})"
      return
    fi

    retries=$((retries + 1))
    update_state "$id" "$url" "failed" "$started_at" "$completed_at" "${result_report_num:-$report_num}" "$score_for_state" "${result_error:-Worker reported failure}" "$retries"
    echo "    ❌ Failed (worker reported failure)"
    return
  fi

  retries=$((retries + 1))
  local error_msg
  if [[ -f "$log_file" ]]; then
    error_msg=$(tail -5 "$log_file" | tr '\n' ' ' | cut -c1-200)
  else
    error_msg="No log output captured"
  fi
  if [[ $exit_code -eq 0 ]]; then
    error_msg="Worker exited successfully but did not emit parseable JSON. ${error_msg}"
  elif [[ -z "$error_msg" ]]; then
    error_msg="Unknown error (exit code $exit_code)"
  fi

  update_state "$id" "$url" "failed" "$started_at" "$completed_at" "$report_num" "-" "$error_msg" "$retries"
  echo "    ❌ Failed (attempt $retries, exit code $exit_code)"
}

merge_tracker() {
  echo ""
  echo "=== Merging tracker additions ==="
  node "$PROJECT_DIR/merge-tracker.mjs"
  echo ""
  echo "=== Verifying pipeline integrity ==="
  node "$PROJECT_DIR/verify-pipeline.mjs" || echo "⚠️  Verification found issues (see above)"
}

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
      completed)
        completed=$((completed + 1))
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

main() {
  check_prerequisites

  if [[ "$DRY_RUN" == "false" ]]; then
    acquire_lock
  fi

  init_state

  local total_input
  total_input=$(tail -n +2 "$INPUT_FILE" | grep -c '[^[:space:]]' 2>/dev/null || true)
  total_input="${total_input:-0}"

  if (( total_input == 0 )); then
    echo "No offers in $INPUT_FILE. Add offers first."
    exit 0
  fi

  echo "=== career-ops batch runner ==="
  echo "Backend: $AGENT_BACKEND | Parallel: $PARALLEL | Max retries: $MAX_RETRIES"
  if [[ -n "$CUSTOM_AGENT_COMMAND" ]]; then
    echo "Custom command override: enabled"
  fi
  echo "Input: $total_input offers"
  echo ""

  local -a pending_ids=()
  local -a pending_urls=()
  local -a pending_sources=()
  local -a pending_notes=()

  while IFS=$'\t' read -r id url source notes; do
    [[ "$id" == "id" ]] && continue
    [[ -z "$id" || -z "$url" ]] && continue

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

  if (( PARALLEL <= 1 )); then
    for i in "${!pending_ids[@]}"; do
      process_offer "${pending_ids[$i]}" "${pending_urls[$i]}" "${pending_sources[$i]}" "${pending_notes[$i]}"
    done
  else
    local running=0
    local -a pids=()

    for i in "${!pending_ids[@]}"; do
      while (( running >= PARALLEL )); do
        for j in "${!pids[@]}"; do
          if ! kill -0 "${pids[$j]}" 2>/dev/null; then
            wait "${pids[$j]}" 2>/dev/null || true
            unset 'pids[j]'
            running=$((running - 1))
          fi
        done
        pids=("${pids[@]}")
        sleep 1
      done

      process_offer "${pending_ids[$i]}" "${pending_urls[$i]}" "${pending_sources[$i]}" "${pending_notes[$i]}" &
      pids+=($!)
      running=$((running + 1))
    done

    for pid in "${pids[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
  fi

  merge_tracker
  print_summary
}

main "$@"
