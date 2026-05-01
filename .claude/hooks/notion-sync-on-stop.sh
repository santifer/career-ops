#!/usr/bin/env bash
# Stop hook — if data/applications.md changed since the last Notion sync,
# tell Claude to run the 'update Notion tracker' flow before truly stopping.

set -e

INPUT=$(cat)

# Loop guard: if this hook already blocked earlier in the turn, exit silently.
if echo "$INPUT" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
APP_FILE="$REPO_ROOT/data/applications.md"
MARKER="$REPO_ROOT/.claude/.last-notion-sync"

[ -f "$APP_FILE" ] || exit 0

# First run: seed marker to applications.md mtime so we don't fire on a clean session.
if [ ! -f "$MARKER" ]; then
  touch -r "$APP_FILE" "$MARKER"
  exit 0
fi

# applications.md newer than marker → drift exists, fire.
if [ "$APP_FILE" -nt "$MARKER" ]; then
  # Update marker now (before blocking) so we don't re-fire if Claude doesn't sync.
  touch "$MARKER"
  cat <<'JSON'
{"decision":"block","reason":"data/applications.md was modified this session. Run the career-ops 'update Notion tracker' flow before stopping: read data/applications.md, diff against the Notion 🎯 Applications Tracker DB (data source 7004383c-f00e-4db4-8957-31879b75aa37, https://app.notion.com/p/33178c8b3f4249a2ab30312128464096), and upsert any rows that differ (status, score, last-touch, notes, comp). For new rows use notion-create-pages with parent.data_source_id; for updates use notion-update-page on the matching page (find by Company + Role). When done, summarize: '{N} updated, {N} created, {N} unchanged'."}
JSON
  exit 0
fi

exit 0
