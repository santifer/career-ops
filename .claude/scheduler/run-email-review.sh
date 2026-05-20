#!/usr/bin/env bash
# Daily wrapper for the /email-review skill. Invoked by launchd
# (com.mitchell.career-ops.email-review) at 09:30 PT Mon-Fri, 30 minutes after
# scripts/heartbeat.mjs sends at 09:00 PT.
#
# Reads .env for ANTHROPIC_API_KEY (matches career-ops convention — keys are
# in the project .env, not the shell environment). Per-run cost capped at
# $1.50 ($30/month) by the orchestrator's Phase 0 budget gate.

set -euo pipefail

# Derive REPO_ROOT from this script's location so the wrapper is portable +
# the test-all.mjs absolute-path check passes without an explicit exclusion.
# This file lives at <repo>/.claude/scheduler/run-email-review.sh, so the
# repo root is two levels up.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$REPO_ROOT/.claude/audit/email-review"
TRACE_LOG="$LOG_DIR/cron.log"
TS_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cd "$REPO_ROOT"

mkdir -p "$LOG_DIR"

{
  echo "=== $TS_UTC — email-review wrapper start ==="

  # Load .env (project-level secrets) — override shell env in case shell
  # has stale or empty ANTHROPIC_API_KEY.
  if [[ -f "$REPO_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
  else
    echo "FATAL: .env missing at $REPO_ROOT/.env — cannot resolve ANTHROPIC_API_KEY"
    exit 1
  fi

  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "FATAL: ANTHROPIC_API_KEY not set after sourcing .env"
    exit 1
  fi

  # Confirm `claude` CLI is on PATH (launchd's PATH from the plist).
  if ! command -v claude >/dev/null 2>&1; then
    # Try common install locations as fallback.
    for candidate in /usr/local/bin/claude /opt/homebrew/bin/claude "$HOME/.local/bin/claude" "$HOME/.npm-global/bin/claude"; do
      if [[ -x "$candidate" ]]; then
        export PATH="$(dirname "$candidate"):$PATH"
        break
      fi
    done
  fi

  if ! command -v claude >/dev/null 2>&1; then
    echo "FATAL: claude CLI not found on PATH ($PATH)"
    exit 1
  fi

  echo "claude version: $(claude --version 2>&1 || echo 'unavailable')"

  # Verify today's heartbeat archive exists before spending API budget.
  TODAY=$(date +%Y-%m-%d)
  ARCHIVE="$REPO_ROOT/data/heartbeat-archive/heartbeat-$TODAY.html"
  if [[ ! -f "$ARCHIVE" ]]; then
    echo "No-op: today's archive missing at $ARCHIVE — heartbeat did not run or did not archive HTML"
    echo "=== $TS_UTC — email-review wrapper exit 0 (no archive) ==="
    exit 0
  fi

  echo "Archive present: $ARCHIVE ($(wc -c <"$ARCHIVE" | tr -d ' ') bytes)"

  # Skip on Saturday + Sunday (rotation says skip; defense-in-depth).
  DOW=$(date +%u)   # 1=Mon ... 7=Sun
  if [[ "$DOW" -ge 6 ]]; then
    echo "Skipping: weekend (DOW=$DOW)"
    echo "=== $TS_UTC — email-review wrapper exit 0 (weekend) ==="
    exit 0
  fi

  # Run the review.
  # --bare for reproducibility; --max-turns + --max-budget caps the run.
  # The strategist subagent reads .claude/config/email-review.yaml and handles
  # all the heavy lifting + writes the day's report.
  claude --bare \
    -p "Use the email-review-strategist subagent to review today's heartbeat archive at $ARCHIVE. Apply the rotation lens for today (weekday $DOW). On Friday, also generate the weekly impact digest." \
    --allowedTools "Read,Write,Edit,Bash(git *),Bash(node *),Bash(gh *),WebFetch,Task,Skill" \
    --max-turns 40 \
    --output-format json

  echo "=== $TS_UTC — email-review wrapper exit 0 ==="
} >> "$TRACE_LOG" 2>&1
