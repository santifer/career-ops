#!/usr/bin/env bash
# tools/check-secrets.sh
# Scan tracked + staged files for the Telegram bot-token prefix and known chat IDs.
# Fails with non-zero exit if any hit. Exempts .env files (gitignored) and node_modules.
set -euo pipefail

# Token prefix = numeric bot ID before ':'. Pulled from /etc/yash-pipeline/agent.env at runtime;
# here we hardcode the KNOWN prefix from the design brief so the scan can fail-fast.
TOKEN_PREFIX="8810239101"
KNOWN_CHAT_ID="1674727728"

# Look only at files git knows about (tracked) OR currently staged.
FILES=$(git ls-files --cached --others --exclude-standard | grep -vE '^(node_modules|\.git/|ops/telegram\.env$|/etc/yash-pipeline/|tools/check-secrets\.sh$)' || true)
[ -z "$FILES" ] && { echo "check-secrets: no files to scan"; exit 0; }

HITS=$(echo "$FILES" | xargs -r grep -nE "${TOKEN_PREFIX}:[A-Za-z0-9_-]{30,}|\b${KNOWN_CHAT_ID}\b" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "check-secrets: SECRET FOUND IN REPO — refusing commit"
  echo "$HITS"
  echo ""
  echo "Move the secret to /etc/yash-pipeline/agent.env (chmod 600, owner yash:yash)."
  exit 1
fi
echo "check-secrets: clean (${#FILES} files scanned)"
