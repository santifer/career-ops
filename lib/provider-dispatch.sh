#!/usr/bin/env bash
# lib/provider-dispatch.sh — Provider-agnostic evaluation dispatch
#
# Resolves the active provider (claude | qwen) from:
#   1. CLI flag: --provider <name>
#   2. Env var:  CAREER_OPS_PROVIDER=<name>
#   3. Config:   config/profile.yml  (provider.default, provider.{name}.cli_bin)
#   4. Fallback: claude
#
# Validates the provider binary, then delegates to lib/providers/<name>.sh
# which handles provider-specific CLI flag translation.
#
# Usage:
#   lib/provider-dispatch.sh \
#     --provider <name> \
#     --prompt "<text>" \
#     --prompt-file "<path>" \
#     --output-file "<path>"
#
# All arguments except --provider are forwarded verbatim to the provider script.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROVIDERS_DIR="$SCRIPT_DIR/providers"

# ── Argument parsing ──────────────────────────────────────────────
PROVIDER_OVERRIDE=""
DISPATCH_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)
      PROVIDER_OVERRIDE="$2"
      shift 2
      ;;
    *)
      DISPATCH_ARGS+=("$1")
      shift
      ;;
  esac
done

# ── YAML value extractor (POSIX-safe, strips inline comments) ────
# Usage: _yaml_val "$profile" "provider\.default"
# Reads the value after a dotted YAML key, strips comments and whitespace.
# CONTEXT-AWARE: locates the parent top-level key (e.g. "provider:") and
# searches only within that section (from parent line to the next top-level
# key) to avoid matching duplicate keys in nested blocks.
_yaml_val() {
  local file="$1" key="$2"
  # Escape dots in key for grep regex
  local escaped_key
  escaped_key=$(printf '%s' "$key" | sed 's/\./\\./g')

  # Extract the parent section name from the key (everything before the last dot)
  # e.g. "provider\.default" → "^provider:"
  local parent_key
  parent_key=$(printf '%s' "$escaped_key" | sed 's/\\.[^.]*$//')
  # Build a regex for the parent top-level key (no leading whitespace)
  local parent_regex="^${parent_key}:"

  # Find the line number of the parent key
  local parent_line
  parent_line=$(grep -nE "$parent_regex" "$file" 2>/dev/null | head -1 | cut -d: -f1 || true)
  if [[ -z "$parent_line" ]]; then
    printf ''
    return
  fi

  # Find the next top-level key (no leading whitespace) after the parent
  local total_lines
  total_lines=$(wc -l < "$file")
  local search_from=$((parent_line + 1))
  local next_parent_line
  next_parent_line=$(sed -n "${search_from},${total_lines}p" "$file" \
    | grep -nE '^[a-zA-Z]' 2>/dev/null | head -1 | cut -d: -f1 || true)

  local end_line
  if [[ -n "$next_parent_line" ]]; then
    end_line=$((parent_line + next_parent_line - 1))
  else
    end_line=$total_lines
  fi

  # Search only within the parent section for the child key
  local val
  val=$(sed -n "${parent_line},${end_line}p" "$file" \
    | grep -E "^[[:space:]]+${escaped_key}:" 2>/dev/null | head -1 \
    | sed "s/.*${escaped_key}:[[:space:]]*//" \
    | sed 's/#.*//' \
    | tr -d ' \t' || true)
  printf '%s' "$val"
}

# ── Provider resolution ───────────────────────────────────────────
resolve_provider() {
  # 1. CLI flag
  if [[ -n "$PROVIDER_OVERRIDE" ]]; then
    printf '%s\n' "$PROVIDER_OVERRIDE"
    return
  fi

  # 2. Environment variable
  if [[ -n "${CAREER_OPS_PROVIDER:-}" ]]; then
    printf '%s\n' "$CAREER_OPS_PROVIDER"
    return
  fi

  # 3. config/profile.yml (provider.default, provider.{name}.cli_bin)
  local profile="$PROJECT_DIR/config/profile.yml"
  if [[ -f "$profile" ]]; then
    local provider_name
    provider_name=$(_yaml_val "$profile" "provider\.default")
    if [[ -n "$provider_name" ]]; then
      # Export cli_bin and model for the provider wrapper to use
      local cli_bin
      cli_bin=$(_yaml_val "$profile" "provider\.${provider_name}\.cli_bin")
      if [[ -n "$cli_bin" ]]; then
        export CAREER_OPS_PROVIDER_CLI_BIN="$cli_bin"
      fi
      local model
      model=$(_yaml_val "$profile" "provider\.${provider_name}\.model")
      if [[ -n "$model" ]]; then
        export CAREER_OPS_PROVIDER_MODEL="$model"
      fi
      printf '%s\n' "$provider_name"
      return
    fi
  fi

  # 4. Fallback
  printf '%s\n' "claude"
}

# ── Validation ────────────────────────────────────────────────────
validate_provider() {
  local name="$1"
  local script="$PROVIDERS_DIR/${name}.sh"

  if [[ ! -f "$script" ]]; then
    echo "ERROR: Unknown provider '$name'. Supported: claude, qwen" >&2
    exit 1
  fi

  if [[ ! -x "$script" ]]; then
    echo "ERROR: Provider script not executable: $script" >&2
    exit 1
  fi

  # Let the provider-specific script validate its own binary
  "$script" --validate-only 2>&1 || exit $?
}

# ── Dispatch ──────────────────────────────────────────────────────
main() {
  local provider
  provider=$(resolve_provider)

  validate_provider "$provider"

  # Delegate to provider-specific wrapper
  exec "$PROVIDERS_DIR/${provider}.sh" "${DISPATCH_ARGS[@]}"
}

main "$@"
