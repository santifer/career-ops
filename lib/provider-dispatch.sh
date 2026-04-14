#!/usr/bin/env bash
# lib/provider-dispatch.sh — Provider-agnostic evaluation dispatch
#
# Resolves the active provider (claude | qwen) from:
#   1. CLI flag: --provider <name>
#   2. Env var:  CAREER_OPS_PROVIDER=<name>
#   3. Config:   config/profile.yml  (provider.default)
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

  # 3. config/profile.yml (provider.default key)
  local profile="$PROJECT_DIR/config/profile.yml"
  if [[ -f "$profile" ]]; then
    local val
    val=$(grep -E '^\s+default:' "$profile" 2>/dev/null | head -1 | sed 's/.*default:\s*//' | sed 's/#.*//' | tr -d ' \t' || true)
    if [[ -n "$val" ]]; then
      printf '%s\n' "$val"
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
    chmod +x "$script"
  fi

  # Let the provider-specific script validate its own binary
  "$script" --validate-only "${DISPATCH_ARGS[@]}" 2>&1 || exit $?
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
