#!/usr/bin/env bash
# tools/bootstrap-vps.sh
# One-shot installation on the Hostinger VPS.
# Idempotent: safe to re-run.
set -euo pipefail

REPO_ROOT="/yash-superClaudeHuman/projects/yash-ai-automation-career"
SECRETS_DIR="/etc/yash-pipeline"
SECRETS_FILE="$SECRETS_DIR/agent.env"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
LOG_DIR="/var/log/yash-pipeline"

[ "$(id -un)" = "yash" ] || { echo "must run as yash"; exit 1; }
[ -d "$REPO_ROOT" ] || { echo "repo root missing: $REPO_ROOT"; exit 1; }

echo "==> 1/7  Creating ops/ directories"
mkdir -p "$REPO_ROOT/ops/checkpoints" "$REPO_ROOT/ops/runs"

echo "==> 2/7  Provisioning secrets dir (requires sudo)"
sudo mkdir -p "$SECRETS_DIR"
sudo chown yash:yash "$SECRETS_DIR"
sudo chmod 750 "$SECRETS_DIR"
if [ ! -f "$SECRETS_FILE" ]; then
  sudo cp "$REPO_ROOT/ops/telegram.env.example" "$SECRETS_FILE"
  sudo chown yash:yash "$SECRETS_FILE"
  sudo chmod 600 "$SECRETS_FILE"
  echo "    ⚠️  EDIT $SECRETS_FILE NOW — fill TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWLIST, TELEGRAM_NOTIFY_CHAT_ID, then re-run this script."
  exit 0
fi

echo "==> 3/7  Init SQLite DB"
node -e "import('./services/db.mjs').then(({initDb,closeDb,integrityCheck})=>{const db=initDb('$REPO_ROOT/ops/work-queue.db'); console.log('integrity:',integrityCheck(db)); closeDb(db);})"

echo "==> 4/7  Installing systemd user units"
mkdir -p "$SYSTEMD_USER_DIR"
cp "$REPO_ROOT/systemd/telegram-listener.service" "$SYSTEMD_USER_DIR/"
cp "$REPO_ROOT/systemd/pipeline-orchestrator.service" "$SYSTEMD_USER_DIR/"
systemctl --user daemon-reload

echo "==> 5/7  Enabling linger (so services run when SSH is closed)"
loginctl show-user yash 2>/dev/null | grep -q '^Linger=yes' || sudo loginctl enable-linger yash

echo "==> 6/7  Configuring logrotate"
sudo mkdir -p "$LOG_DIR"
sudo chown yash:yash "$LOG_DIR"
sudo cp "$REPO_ROOT/systemd/logrotate-yash-pipeline.conf" /etc/logrotate.d/yash-pipeline

echo "==> 7/7  Enabling + starting services"
systemctl --user enable --now telegram-listener.service pipeline-orchestrator.service
sleep 2
systemctl --user status telegram-listener.service pipeline-orchestrator.service --no-pager | head -30

echo
echo "✅ Bootstrap complete."
echo "Test: send /help to your bot in Telegram. Expected reply within 2s."
