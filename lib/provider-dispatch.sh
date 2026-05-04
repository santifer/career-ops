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
# Usage: _yaml_val "$profile" "provider.default"
# Reads the value after a dotted YAML key by iteratively descending through
# parent blocks. For "provider.default.cli_bin", it finds provider:, then
# default: within that block, then cli_bin: within that sub-block.
_yaml_val() {
  local file="$1" key="$2"
  local total_lines
  total_lines=$(wc -l < "$file")

  # Split key on dots and iterate through segments
  local search_start=1
  local search_end=$total_lines
  local current_indent=0
  local segments
  IFS='.' read -ra segments <<< "$key"
  local num_segments=${#segments[@]}

  for ((i = 0; i < num_segments; i++)); do
    local segment="${segments[$i]}"
    local is_last=$((i == num_segments - 1))

    # Find the segment at the current indentation level
    local segment_line
    segment_line=$(awk -v start="$search_start" -v end="$search_end" \
      -v seg="$segment" -v indent="$current_indent" '
      NR >= start && NR <= end {
        line = $0
        # Count leading spaces
        match(line, /^[[:space:]]*/)
        leading_spaces = RLENGTH
        # Check if indentation matches current level
        if (leading_spaces == indent) {
          # Strip leading whitespace and check if line starts with segment:
          sub(/^[[:space:]]*/, "", line)
          if (line ~ "^" seg ":") {
            print NR
            exit
          }
        }
      }
    ' "$file" 2>/dev/null || true)

    if [[ -z "$segment_line" ]]; then
      printf ''
      return
    fi

    if [[ "$is_last" == "1" ]]; then
      # Extract the scalar value from the last segment
      local val
      val=$(sed -n "${segment_line}p" "$file" \
        | sed "s/.*${segment}:[[:space:]]*//" \
        | sed 's/#.*//' \
        | tr -d ' \t' || true)
      printf '%s' "$val"
      return
    fi

    # Update search range to the block under this segment
    search_start=$((segment_line + 1))

    # Find next key at same or lower indentation (end of this block)
    local next_same_or_higher
    next_same_or_higher=$(awk -v start="$search_start" -v end="$search_end" \
      -v indent="$current_indent" '
      NR >= start && NR <= end {
        line = $0
        if (line ~ /^[[:space:]]*$/) next  # skip empty lines
        if (line ~ /^#/) next  # skip comments
        match(line, /^[[:space:]]*/)
        leading_spaces = RLENGTH
        if (leading_spaces <= indent) {
          print NR
          exit
        }
      }
    ' "$file" 2>/dev/null || true)

    if [[ -n "$next_same_or_higher" ]]; then
      search_end=$((next_same_or_higher - 1))
    else
      search_end=$total_lines
    fi

    # Next segment will be indented deeper (standard YAML: 2 spaces)
    current_indent=$((current_indent + 2))
  done

  printf ''
}

# ── Helper: load provider-specific cli_bin and model from profile.yml ──
_load_provider_config() {
  local profile="$1" provider_name="$2"
  local cli_bin model
  cli_bin=$(_yaml_val "$profile" "provider.${provider_name}.cli_bin")
  if [[ -n "$cli_bin" ]]; then
    export CAREER_OPS_PROVIDER_CLI_BIN="$cli_bin"
  fi
  model=$(_yaml_val "$profile" "provider.${provider_name}.model")
  if [[ -n "$model" ]]; then
    export CAREER_OPS_PROVIDER_MODEL="$model"
  fi
}

# ── Provider resolution ───────────────────────────────────────────
resolve_provider() {
  local profile="$PROJECT_DIR/config/profile.yml"

  # 1. CLI flag
  if [[ -n "$PROVIDER_OVERRIDE" ]]; then
    if [[ -f "$profile" ]]; then
      _load_provider_config "$profile" "$PROVIDER_OVERRIDE"
    fi
    printf '%s\n' "$PROVIDER_OVERRIDE"
    return
  fi

  # 2. Environment variable
  if [[ -n "${CAREER_OPS_PROVIDER:-}" ]]; then
    if [[ -f "$profile" ]]; then
      _load_provider_config "$profile" "$CAREER_OPS_PROVIDER"
    fi
    printf '%s\n' "$CAREER_OPS_PROVIDER"
    return
  fi

  # 3. config/profile.yml (provider.default, provider.{name}.cli_bin)
  if [[ -f "$profile" ]]; then
    local provider_name
    provider_name=$(_yaml_val "$profile" "provider\.default")
    if [[ -n "$provider_name" ]]; then
      _load_provider_config "$profile" "$provider_name"
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
