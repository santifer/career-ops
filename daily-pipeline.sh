#!/bin/bash
# daily-pipeline.sh — Daily career-ops pipeline chain
#
# Runs on CT 203 via cron: 07:00 MDT daily
#   0 7 * * * /opt/career-ops/daily-pipeline.sh >> /var/log/career-ops-daily.log 2>&1
#
# Chain: API scan → BIC scan → notify → followup → interview-prep-check
# Each step runs even if the previous fails (||true guards).

set -u
cd /opt/career-ops || exit 1

DATE=$(date +%Y-%m-%d)
echo "━━━ career-ops daily pipeline — $DATE ━━━"

# Step 1: Scan portals via API (Greenhouse/Ashby/Lever)
echo "→ [1/5] Scanning portal APIs..."
node scan.mjs 2>&1 || true

# Step 2: Scan Built In Colorado via Playwright (Denver-specific)
echo "→ [2/5] Scanning Built In Colorado..."
node scan-builtin.mjs 2>&1 || true

# Step 3: Send Telegram digest of new finds
echo "→ [3/5] Sending Telegram digest..."
node notify-telegram.mjs 2>&1 || true

# Step 4: Check for applications needing follow-up (5+ business days)
echo "→ [4/5] Checking follow-ups..."
node followup-check.mjs 2>&1 || true

# Step 5: Generate interview prep for any new Interview/Responded entries
echo "→ [5/5] Checking interview prep..."
node generate-interview-prep.mjs --check 2>&1 || true

echo "━━━ pipeline complete — $DATE ━━━"
