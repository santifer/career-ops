#!/usr/bin/env bash
# dashboard-phase3-worker.sh — weekly Claude worker for Phase 3 dashboard items
#
# Fired by: scripts/launchd/com.mitchell.career-ops.dashboard-phase3.plist (Mon 06:00 PT)
# Reads:    data/dashboard-phase3-queue.md
# Picks:    first item with status `[pending]`
# Writes:   PR + commit, marks item `[in-progress]` in the queue
# Logs:     data/logs/dashboard-phase3.log
#
# To run manually: bash scripts/dashboard-phase3-worker.sh
# To dry-run:      bash scripts/dashboard-phase3-worker.sh --dry-run

set -euo pipefail

ROOT="/Users/mitchellwilliams/Documents/career-ops"
LOG="$ROOT/data/logs/dashboard-phase3.log"
QUEUE="$ROOT/data/dashboard-phase3-queue.md"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

mkdir -p "$ROOT/data/logs"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }

log "=== dashboard-phase3-worker start (dry-run=$DRY_RUN) ==="

cd "$ROOT"

# Bail if any pending Phase 3 worktree is still in flight (avoid stomping)
if git worktree list | grep -q "phase3-"; then
  log "ABORT: existing phase3-* worktree found. Resolve before next run."
  exit 0
fi

# Bail if any item is already [in-progress]
if grep -q "^### [0-9]*\. \[in-progress\]" "$QUEUE"; then
  log "ABORT: a queue item is already [in-progress]. Resolve before next run."
  exit 0
fi

# Find next [pending] item
NEXT_TITLE=$(grep -m1 "^### [0-9]*\. \[pending\]" "$QUEUE" | sed 's/^### [0-9]*\. \[pending\] //')
if [[ -z "$NEXT_TITLE" ]]; then
  log "Queue exhausted — no [pending] items. Nothing to do."
  exit 0
fi

log "Next item: $NEXT_TITLE"

if $DRY_RUN; then
  log "DRY RUN — would spawn Claude on this item. Exiting."
  exit 0
fi

# Spawn Claude headless to implement the item
PROMPT="You are the Phase 3 dashboard worker for career-ops. Read /Users/mitchellwilliams/Documents/career-ops/data/dashboard-phase3-queue.md in full. Pick the first item with status [pending] (it is: '$NEXT_TITLE'). Implement that item end-to-end following the worker rules at the top of the queue file. Commit, push the branch, then open a PR via:

  gh pr create --repo mitwilli-create/career-ops --base main --head <your-branch> --title 'feat(dashboard): $NEXT_TITLE' --body '...'

CRITICAL: --repo MUST be mitwilli-create/career-ops (the fork) and --base MUST be main. NEVER open PRs against santifer/career-ops upstream — gh's default fork-resolution will choose santifer:main as base if not overridden, which exposes the fork's confidential personal data files (data/portfolio-*, data/storytellermitch-*, data/cloudflare-domain-swap-runbook.md, data/applications.md, etc.) on a public upstream PR. The 2026-05-09 incident closed 5 such PRs after they leaked file path inventory to santifer's repo and CodeRabbit. Always pass --repo and --base explicitly.

Then edit the queue file to change that item's status from [pending] to [in-progress] and commit that change to main. Do NOT do more than one queue item in this run."

claude --model claude-opus-4-7 --dangerously-skip-permissions -p "$PROMPT" 2>&1 | tee -a "$LOG"

log "=== dashboard-phase3-worker end ==="
