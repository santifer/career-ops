#!/usr/bin/env bash
# lib/providers/claude.sh — Claude Code provider wrapper
#
# Translates generic dispatch arguments into Claude Code CLI flags.
# This preserves the exact behavior that batch-runner.sh previously had,
# extracted into a standalone provider module.
#
# Claude CLI mapping:
#   --prompt        → positional argument (the user prompt)
#   --prompt-file   → --append-system-prompt-file <path>
#   --output-file   → stdout redirect (caller handles)
#   --validate-only → binary existence check only
#
# Flags used:
#   -p                              : headless / pipe mode
#   --dangerously-skip-permissions  : auto-approve all tool calls
#   --append-system-prompt-file     : inject resolved prompt as system context

set -euo pipefail

# ── Argument parsing ──────────────────────────────────────────────
PROMPT=""
PROMPT_FILE=""
OUTPUT_FILE=""
VALIDATE_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --validate-only)
      VALIDATE_ONLY=true
      shift
      ;;
    --prompt)
      PROMPT="$2"
      shift 2
      ;;
    --prompt-file)
      PROMPT_FILE="$2"
      shift 2
      ;;
    --output-file)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# ── Validate binary ───────────────────────────────────────────────
CLAUDE_BIN="${CAREER_OPS_PROVIDER_CLI_BIN:-claude}"
if ! command -v "$CLAUDE_BIN" &>/dev/null; then
  echo "ERROR: '$CLAUDE_BIN' CLI not found in PATH. Install Claude Code or set CAREER_OPS_PROVIDER=qwen." >&2
  exit 127
fi

if [[ "$VALIDATE_ONLY" == "true" ]]; then
  exit 0
fi

# ── Validate inputs ───────────────────────────────────────────────
if [[ -z "$PROMPT" ]]; then
  echo "ERROR: --prompt is required for claude provider" >&2
  exit 1
fi

if [[ -n "$PROMPT_FILE" && ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: Prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

# ── Build command ─────────────────────────────────────────────────
CLAUDE_ARGS=(
  -p
  --dangerously-skip-permissions
)

if [[ -n "$PROMPT_FILE" ]]; then
  CLAUDE_ARGS+=(--append-system-prompt-file "$PROMPT_FILE")
fi

CLAUDE_ARGS+=("$PROMPT")

# ── Execute ───────────────────────────────────────────────────────
if [[ -n "$OUTPUT_FILE" ]]; then
  "$CLAUDE_BIN" "${CLAUDE_ARGS[@]}" > "$OUTPUT_FILE" 2>&1
else
  "$CLAUDE_BIN" "${CLAUDE_ARGS[@]}"
fi
