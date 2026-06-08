#!/usr/bin/env bash
# pre-commit hook: guards against the r7 truncation/corruption failure mode.
#
# Checks every staged .mjs/.js file for:
#   1. Syntax errors (node --check)
#   2. Trailing null bytes (OneDrive corruption pattern)
#   3. Last-line truncation (file ending mid-token)
#
# Install:
#   cp scripts/pre-commit.sh .githooks/pre-commit
#   chmod +x .githooks/pre-commit
#   git config core.hooksPath .githooks

set -euo pipefail

FAILED=0

# Get list of staged .mjs/.js files
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(mjs|js)$' || true)

if [ -z "$STAGED" ]; then
  exit 0
fi

echo "pre-commit: checking staged JS/MJS files…"

for file in $STAGED; do
  if [ ! -f "$file" ]; then
    continue
  fi

  # 1. Syntax check
  if ! node --check "$file" 2>/dev/null; then
    echo "  ✗ SYNTAX ERROR: $file"
    node --check "$file" 2>&1 | sed 's/^/    /'
    FAILED=1
    continue
  fi

  # 2. Trailing null bytes
  if LC_ALL=C grep -qP '\x00' "$file" 2>/dev/null; then
    echo "  ✗ TRAILING NULL BYTES (r7 corruption): $file"
    FAILED=1
    continue
  fi

  # 3. Last-line truncation heuristic
  LAST_LINE=$(tail -1 "$file")
  # Open brace/paren/bracket/backslash/comma at end of last line (after trimming)
  TRIMMED=$(echo "$LAST_LINE" | sed 's/[[:space:]]*$//')
  LAST_CHAR="${TRIMMED: -1}"
  case "$LAST_CHAR" in
    '{'|'('|'['|','|'\')
      echo "  ✗ POSSIBLE TRUNCATION (ends mid-token on last line): $file"
      echo "    last line: $TRIMMED"
      FAILED=1
      continue
      ;;
  esac

  echo "  ✓ $file"
done

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "pre-commit: BLOCKED — fix the above errors before committing."
  echo "Tip: run 'node scripts/safe-edit.mjs --selftest' to verify the guardrail."
  exit 1
fi

echo "pre-commit: all checks passed."
exit 0
