#!/usr/bin/env bash
# lib/providers/qwen.sh — Qwen Code provider wrapper (v0.14.x)
#
# Translates generic dispatch arguments into Qwen Code CLI flags.
# Qwen Code shares the same Gemini CLI heritage as Claude Code, so the
# mapping is straightforward:
#
#   Claude flag                      → Qwen equivalent
#   ──────────────────────────────────────────────────────
#   -p                               → -p (both use -p for headless)
#   --dangerously-skip-permissions   → --yolo (auto-approve all tools)
#   --append-system-prompt-file F    → --append-system-prompt "$(cat F)"
#
# Qwen Code CLI flags (v0.14.x):
#   -p, --prompt <text>              : headless mode, non-interactive
#   --yolo                           : auto-approve all tool calls
#   --append-system-prompt "<text>"  : appends instructions after defaults
#   --output-format json             : structured output for parsing
#   --model, -m <name>               : select model
#
# Environment variables (set by lib/provider-dispatch.sh):
#   CAREER_OPS_PROVIDER_CLI_BIN  : Override binary path (default: "qwen")
#   CAREER_OPS_PROVIDER_MODEL    : Override model name (currently unused)
#
# The provider reads the prompt file content and passes it as a string
# because Qwen's --append-system-prompt takes inline text, not a file path.

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
      echo "Warning: Unknown argument: $1, ignoring" >&2
      shift
      ;;
  esac
done

# ── Validate binary ───────────────────────────────────────────────
QWEN_BIN="${CAREER_OPS_PROVIDER_CLI_BIN:-qwen}"
if ! command -v "$QWEN_BIN" &>/dev/null; then
  echo "ERROR: '$QWEN_BIN' CLI not found in PATH. Install Qwen Code or set CAREER_OPS_PROVIDER=claude." >&2
  exit 127
fi

if [[ "$VALIDATE_ONLY" == "true" ]]; then
  exit 0
fi

# ── Validate inputs ───────────────────────────────────────────────
if [[ -z "$PROMPT" ]]; then
  echo "ERROR: --prompt is required for qwen provider" >&2
  exit 1
fi

if [[ -n "$PROMPT_FILE" && ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: Prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

# ── Build command ─────────────────────────────────────────────────
QWEN_ARGS=(
  -p
  --yolo
)

if [[ -n "$PROMPT_FILE" ]]; then
  # Guard against very large prompt files (ARG_MAX limit)
  prompt_size=$(wc -c < "$PROMPT_FILE" 2>/dev/null || echo 0)
  if [[ "$prompt_size" -gt 102400 ]]; then
    echo "ERROR: Prompt file exceeds 100KB limit ($prompt_size bytes). Please reduce prompt size." >&2
    exit 1
  fi
  prompt_content=$(cat "$PROMPT_FILE")
  QWEN_ARGS+=(--append-system-prompt "$prompt_content")
fi

QWEN_ARGS+=("$PROMPT")

# ── Execute ───────────────────────────────────────────────────────
if [[ -n "$OUTPUT_FILE" ]]; then
  "$QWEN_BIN" "${QWEN_ARGS[@]}" > "$OUTPUT_FILE" 2>&1
else
  "$QWEN_BIN" "${QWEN_ARGS[@]}"
fi
