#!/usr/bin/env bash
# run-lighthouse.sh — wrapper around `lhci autorun` for the dashboard.
#
# Verifies a dashboard server is reachable on localhost (default :3000),
# runs Lighthouse CI with the budgets in lighthouserc.json, and prints
# a pass/fail summary.
#
# Usage:
#   bash scripts/run-lighthouse.sh
#   PORT=7777 bash scripts/run-lighthouse.sh   # custom dashboard port
#
# Exit codes:
#   0  — all assertions passed
#   1  — one or more assertions failed
#   2  — dashboard server not reachable (skipped)
#   3  — lhci binary not installed

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

echo "[lighthouse] target: $URL"

# Pre-flight: lhci installed?
if [[ ! -x "$ROOT_DIR/node_modules/.bin/lhci" ]] && ! command -v lhci >/dev/null 2>&1; then
  echo "[lighthouse] FAIL — @lhci/cli is not installed. Run: npm install --save-dev @lhci/cli" >&2
  exit 3
fi

# Pre-flight: dashboard reachable?
if ! curl -fsS --max-time 5 "$URL" >/dev/null 2>&1; then
  echo "[lighthouse] SKIP — no dashboard server responding on $URL." >&2
  echo "[lighthouse]        Start it first:  node scripts/dashboard-server.mjs" >&2
  echo "[lighthouse]        Or override port: PORT=7777 bash scripts/run-lighthouse.sh" >&2
  exit 2
fi

echo "[lighthouse] dashboard reachable — running lhci autorun (3 runs)..."

# Run lhci. Capture exit code without aborting so we can print summary.
set +e
if [[ -x "$ROOT_DIR/node_modules/.bin/lhci" ]]; then
  "$ROOT_DIR/node_modules/.bin/lhci" autorun
else
  lhci autorun
fi
LHCI_EXIT=$?
set -e

echo
if [[ $LHCI_EXIT -eq 0 ]]; then
  echo "[lighthouse] ✅ PASS — all budgets met (perf ≥ 0.9, a11y ≥ 0.95, best-practices ≥ 0.9, seo ≥ 0.85)."
else
  echo "[lighthouse] ❌ FAIL — at least one assertion missed budget. See output above for the failing audits."
fi

exit $LHCI_EXIT
