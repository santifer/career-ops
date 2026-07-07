#!/usr/bin/env bash
# sync-ct203.sh — keep local checkout and the CT 203 scanner (10.1.30.50) in sync.
#
# CT 203 is the daily writer (triage.mjs adds tracker rows + reports via cron).
# Local sessions are interactive writers (in-session evals). To avoid split-brain:
#   - START of a local work session:  ./sync-ct203.sh pull
#   - END of a local work session:    ./sync-ct203.sh push
#   - Any time:                       ./sync-ct203.sh status
#
# pull   = CT 203 → local   (tracker, reports, scan data, digests, follow-ups)
# push   = local → CT 203   (tracker, reports)
# status = md5sum compare of pipeline scripts both sides

set -euo pipefail
CT=root@10.1.30.50
REMOTE=/opt/career-ops
LOCAL="$(cd "$(dirname "$0")" && pwd)"

SCRIPTS=(scan.mjs triage.mjs openrouter-eval.mjs notify-telegram.mjs followup-check.mjs \
         merge-tracker.mjs telegram-listener.mjs apply-orchestrator.mjs apply-auto.mjs \
         lib/location-gate.mjs lib/ats-fetch.mjs lib/telegram.mjs)

case "${1:-}" in
  pull)
    echo "⬇️  Pulling data from CT 203..."
    rsync -az "$CT:$REMOTE/data/applications.md" "$LOCAL/data/"
    rsync -az "$CT:$REMOTE/data/scan-history.tsv" "$LOCAL/data/"
    rsync -az "$CT:$REMOTE/data/pipeline.md" "$LOCAL/data/" 2>/dev/null || true
    rsync -az "$CT:$REMOTE/data/last-digest.json" "$LOCAL/data/" 2>/dev/null || true
    rsync -az "$CT:$REMOTE/data/follow-ups.md" "$LOCAL/data/" 2>/dev/null || true
    rsync -az "$CT:$REMOTE/reports/" "$LOCAL/reports/"
    echo "✅ Pulled. Tracker rows: $(grep -c '^|' "$LOCAL/data/applications.md")"
    ;;
  push)
    echo "⬆️  Pushing tracker + reports to CT 203..."
    rsync -az "$LOCAL/data/applications.md" "$CT:$REMOTE/data/"
    rsync -az "$LOCAL/reports/" "$CT:$REMOTE/reports/"
    echo "✅ Pushed."
    ;;
  status)
    for f in "${SCRIPTS[@]}"; do
      L=$(md5sum "$LOCAL/$f" 2>/dev/null | cut -d' ' -f1 || true)
      R=$(ssh "$CT" "md5sum $REMOTE/$f 2>/dev/null" | cut -d' ' -f1 || true)
      if [ -n "$L" ] && [ "$L" = "$R" ]; then echo "SAME  $f"; else echo "DIFF  $f"; fi
    done
    ;;
  *)
    echo "Usage: $0 pull|push|status"; exit 1 ;;
esac
