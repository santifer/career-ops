#!/usr/bin/env bash
# scripts/wrappers/cron-run.sh — Generic launchd wrapper for career-ops recurring agents.
#
# Usage:
#   cron-run.sh <agent-label> <cadence-guard> <command...>
#
# cadence-guard values:
#   always           — no skip (caller already at correct cadence)
#   biweekly-even    — only run on even ISO weeks
#   biweekly-odd     — only run on odd ISO weeks
#   monthly-first    — only run on day-of-month <= 7 (combine with launchd Weekday for "1st X of month")
#
# Behavior:
#   - Cadence guard short-circuits with rc=0 + log entry if skipped (launchd treats this as success).
#   - Missing target script → log + exit 0 (so a pre-overnight cron firing doesn't fail loudly).
#   - All output captured to data/logs/<label>-<YYYY-MM-DD>.log.
#   - Repo root hardcoded; launchd inherits PATH via plist EnvironmentVariables.
#
# Anti-hallucination guard: this wrapper does NOT invoke any LLM. It only orchestrates.

set -uo pipefail

LABEL="${1:?missing agent-label}"
GUARD="${2:?missing cadence-guard}"
shift 2

REPO="/Users/mitchellwilliams/Documents/career-ops"
LOG_DIR="$REPO/data/logs"
LOG="$LOG_DIR/${LABEL}-$(date +%Y-%m-%d).log"
mkdir -p "$LOG_DIR"

ts() { date -u +%FT%TZ; }

# ── Cadence guard ──────────────────────────────────────────────────────────
case "$GUARD" in
    always) ;;
    biweekly-even)
        WEEK=$(date +%V)
        # Force base-10 interpretation to avoid octal parsing of leading-zero weeks
        if (( 10#$WEEK % 2 != 0 )); then
            echo "$(ts) [SKIP] biweekly-even: ISO week $WEEK is odd" >> "$LOG"
            exit 0
        fi
        ;;
    biweekly-odd)
        WEEK=$(date +%V)
        if (( 10#$WEEK % 2 == 0 )); then
            echo "$(ts) [SKIP] biweekly-odd: ISO week $WEEK is even" >> "$LOG"
            exit 0
        fi
        ;;
    monthly-first)
        DAY=$(date +%d)
        if (( 10#$DAY > 7 )); then
            echo "$(ts) [SKIP] monthly-first: day-of-month $DAY > 7" >> "$LOG"
            exit 0
        fi
        ;;
    *)
        echo "$(ts) [ERROR] unknown cadence-guard: $GUARD" >> "$LOG"
        exit 2
        ;;
esac

# ── Existence guard for node scripts ───────────────────────────────────────
# If the command starts with `node <script>`, verify the script exists before invoking.
# Lets us deploy plists before the underlying agent ships, without launchd flapping.
if [[ "${1:-}" == "node" && -n "${2:-}" ]]; then
    SCRIPT="$2"
    # Resolve relative paths against the repo root.
    if [[ "$SCRIPT" != /* ]]; then
        SCRIPT="$REPO/$SCRIPT"
    fi
    if [[ ! -f "$SCRIPT" ]]; then
        echo "$(ts) [SKIP] target script not found: $SCRIPT (likely awaiting overnight haul deploy)" >> "$LOG"
        exit 0
    fi
fi

# ── Execute ────────────────────────────────────────────────────────────────
cd "$REPO" || { echo "$(ts) [ERROR] cd $REPO failed" >> "$LOG"; exit 3; }
echo "$(ts) [START] $LABEL: $*" >> "$LOG"
"$@" >> "$LOG" 2>&1
RC=$?
echo "$(ts) [END] $LABEL rc=$RC" >> "$LOG"
exit $RC
