#!/bin/bash
# cloudflared-staging-nohup.sh
#
# Boot-time wrapper that `nohup`s the staging cloudflared tunnel out-of-band
# from launchd. Workaround for the macOS Tahoe (15.x) launchd regression that
# cannot spawn a second cloudflared instance even when the plist is correct.
#
# Pairs with com.mitchell.career-ops.cloudflared-staging-nohup-wrapper.plist
# (RunAtLoad=true, KeepAlive=false). The wrapper plist fires this script at
# boot/login, the script `nohup`s cloudflared into a detached session, then
# exits. Survives reboot because the wrapper plist fires at every Aqua login.
#
# Idempotent: if a staging cloudflared process is already running (matches the
# --config flag for config-staging.yml), this script no-ops and exits 0.
#
# Remove this wrapper plist + script when Apple patches the launchd spawn bug
# and a clean `launchctl bootstrap` on the canonical staging plist works again.

set -u

CONFIG="${HOME}/.cloudflared/config-staging.yml"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="${REPO}/data/logs"
LOG_OUT="${LOG_DIR}/cloudflared-staging-nohup.out"
LOG_ERR="${LOG_DIR}/cloudflared-staging-nohup.err"

mkdir -p "$LOG_DIR"

# Idempotency check: is a staging cloudflared already running?
if pgrep -f "cloudflared tunnel --config ${CONFIG}" >/dev/null 2>&1; then
  echo "$(date -Iseconds) cloudflared-staging already running, no-op" >> "$LOG_OUT"
  exit 0
fi

# Spawn detached via nohup. setsid would be cleaner but isn't on macOS by default.
nohup /opt/homebrew/bin/cloudflared tunnel --config "$CONFIG" run \
  >> "$LOG_OUT" 2>> "$LOG_ERR" </dev/null &

disown 2>/dev/null || true
echo "$(date -Iseconds) cloudflared-staging spawned via nohup (PID $!)" >> "$LOG_OUT"
exit 0
