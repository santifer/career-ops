#!/usr/bin/env bash
# setup-cloudflare-tunnel.sh — interactive setup for remote dashboard access
#
# Walks through the manual Cloudflare steps that can't be automated:
#   1. cloudflared tunnel login (browser auth)
#   2. cloudflared tunnel create career-ops-dashboard
#   3. write ~/.cloudflared/config.yml pointing at localhost:7777
#   4. cloudflared tunnel route dns career-ops-dashboard <subdomain>
#   5. (optional) install the launchd plist so it runs at login
#
# After this finishes, see docs/REMOTE_ACCESS.md for the Cloudflare Access
# (email magic link) policy setup, which has to be done in the Cloudflare
# Zero Trust dashboard UI.

set -euo pipefail

CF_BIN="${CF_BIN:-/opt/homebrew/bin/cloudflared}"
TUNNEL_NAME="${TUNNEL_NAME:-career-ops-dashboard}"
LOCAL_PORT="${CAREER_OPS_DASHBOARD_PORT:-7777}"
CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/config.yml"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_SRC="$PROJECT_DIR/scripts/launchd/com.mitchell.career-ops.cloudflared.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.mitchell.career-ops.cloudflared.plist"

cyan()   { printf "\033[36m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }

if ! command -v "$CF_BIN" >/dev/null 2>&1; then
  red "cloudflared not found at $CF_BIN"
  yellow "  Install with: brew install cloudflared"
  exit 1
fi

cyan "═══ career-ops remote access setup ═══"
echo
echo "This will walk through:"
echo "  1. Authenticate cloudflared with your Cloudflare account (browser)"
echo "  2. Create a tunnel called '$TUNNEL_NAME'"
echo "  3. Write ~/.cloudflared/config.yml pointing at localhost:$LOCAL_PORT"
echo "  4. Route a DNS record (you choose the subdomain)"
echo "  5. Install the tunnel as a launchd service so it starts at login"
echo
echo "Prereqs:"
echo "  - A Cloudflare account (free is fine)"
echo "  - A domain managed by Cloudflare (any domain you own works)"
echo
read -r -p "Ready to proceed? [y/N] " ack
[[ "$ack" =~ ^[Yy]$ ]] || { yellow "Aborted."; exit 0; }

mkdir -p "$CONFIG_DIR"

# ── Step 1: tunnel login (browser flow) ────────────────────────────────
if [[ -f "$CONFIG_DIR/cert.pem" ]]; then
  green "✓ Already authenticated (cert.pem present at $CONFIG_DIR/cert.pem)"
else
  cyan "→ Step 1/5: Authenticating with Cloudflare"
  echo "   This will open a browser window. Pick the domain you want to use."
  "$CF_BIN" tunnel login
  green "✓ Authenticated"
fi
echo

# ── Step 2: create tunnel (idempotent — succeeds even if already exists) ──
cyan "→ Step 2/5: Creating tunnel '$TUNNEL_NAME'"
if "$CF_BIN" tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  green "✓ Tunnel '$TUNNEL_NAME' already exists"
else
  "$CF_BIN" tunnel create "$TUNNEL_NAME"
  green "✓ Tunnel created"
fi
echo

# Capture the tunnel UUID for the config
TUNNEL_UUID=$("$CF_BIN" tunnel list 2>/dev/null | awk -v name="$TUNNEL_NAME" '$2==name {print $1}' | head -n 1)
if [[ -z "$TUNNEL_UUID" ]]; then
  red "Could not resolve UUID for tunnel '$TUNNEL_NAME'."
  red "Run '$CF_BIN tunnel list' manually and inspect the output."
  exit 1
fi
green "  UUID: $TUNNEL_UUID"
echo

# ── Step 3: ask for the public hostname ──────────────────────────────────
cyan "→ Step 3/5: Pick the hostname for your dashboard"
echo "   Format: subdomain.yourdomain.com"
echo "   Example: careerops.example.com"
echo "   The domain must be one you've added to Cloudflare."
read -r -p "   Hostname: " HOSTNAME
if [[ -z "$HOSTNAME" ]]; then
  red "No hostname given. Aborted."
  exit 1
fi

# ── Step 4: write the config file ────────────────────────────────────────
cyan "→ Step 4/5: Writing $CONFIG_FILE"
cat > "$CONFIG_FILE" <<EOF
# career-ops dashboard tunnel — generated $(date -u '+%Y-%m-%dT%H:%M:%SZ')
# Keep credentials-file in $CONFIG_DIR/<UUID>.json — cloudflared writes
# it during 'tunnel create'. Do not commit either file to git.
tunnel: $TUNNEL_UUID
credentials-file: $CONFIG_DIR/$TUNNEL_UUID.json

ingress:
  - hostname: $HOSTNAME
    service: http://localhost:$LOCAL_PORT
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  # Catch-all — required by cloudflared. 404 anything that doesn't match
  # the hostname above so we never inadvertently expose another service.
  - service: http_status:404
EOF
green "✓ Config written"
echo

# ── Step 5: create the DNS record ───────────────────────────────────────
cyan "→ Step 5a: Creating DNS record for $HOSTNAME"
"$CF_BIN" tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" || {
  yellow "DNS route may already exist. If you want to overwrite, delete the record in"
  yellow "the Cloudflare DNS dashboard first, then re-run this script."
}
echo

# ── Step 5b: launchd install ────────────────────────────────────────────
cyan "→ Step 5b: Installing launchd service"
if [[ -f "$PLIST_DST" ]]; then
  yellow "  $PLIST_DST already exists — unloading the old one first"
  launchctl unload "$PLIST_DST" 2>/dev/null || true
fi
cp "$PLIST_SRC" "$PLIST_DST"
launchctl load "$PLIST_DST"
green "✓ launchd service loaded — tunnel will start at login"
echo

# ── Final guidance ──────────────────────────────────────────────────────
green "═══ Tunnel is up ═══"
echo
echo "Test it now:  https://$HOSTNAME"
echo "  (give DNS ~30 seconds to propagate)"
echo
yellow "⚠️  Right now this is publicly accessible — anyone with the URL can read"
yellow "    your dashboard. To lock it down to just you, set up Cloudflare Access:"
echo
echo "  1. Open https://one.dash.cloudflare.com → Access → Applications"
echo "  2. Add an Application → Self-hosted"
echo "  3. Application domain: $HOSTNAME"
echo "  4. Add an Access Policy:"
echo "       Action: Allow"
echo "       Include: Emails → mitwilli@gmail.com"
echo "       Authentication: One-time PIN (email magic link)"
echo "  5. Save"
echo
echo "After that, every request to $HOSTNAME will require an email magic link"
echo "before it reaches your laptop. Each device authenticates once and the"
echo "session lasts ~24h (configurable)."
echo
echo "Detailed walkthrough: docs/REMOTE_ACCESS.md"
