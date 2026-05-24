# OPERATIONS — yash-pipeline-autonomous-agent

Operational runbook for the 24/7 Telegram-triggered wrapper around `/yash-resume-pipeline`. Living document; update on every production incident.

**Owner:** yash@srv944193 (Hostinger VPS).
**Spec:** `docs/superpowers/specs/2026-05-24-yash-pipeline-autonomous-agent-architecture.md`.
**Skill:** `.claude/skills/yash-pipeline-autonomous-agent/SKILL.md`.

## 1. Deploy (first time)
```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
bash tools/bootstrap-vps.sh
# On first run, the script provisions /etc/yash-pipeline/agent.env with the
# template and EXITS so you can edit it. Fill in the three secrets, then re-run:
bash tools/bootstrap-vps.sh
```

## 2. Daily checks (1 min)
```bash
systemctl --user status telegram-listener pipeline-orchestrator --no-pager | head -20
sqlite3 ops/work-queue.db "SELECT status, COUNT(*) FROM runs WHERE date(started_at)=date('now') GROUP BY status;"
```
Expected: both units `active (running)`; today's run counts < 20.

## 3. Rotating the Telegram bot token
1. In Telegram, message `@BotFather` → `/revoke` → select your bot → confirm.
2. `/newtoken` → select your bot → copy the new token.
3. On the VPS:
   ```bash
   sudo $EDITOR /etc/yash-pipeline/agent.env  # paste the new TELEGRAM_BOT_TOKEN
   systemctl --user restart telegram-listener
   journalctl --user -u telegram-listener -n 10 --no-pager
   ```
   Expected: `long-poll error` lines disappear within 30s; `/help` from Telegram responds.

## 4. Changing the cap
Edit the constant in `services/pipeline-orchestrator.mjs` (`capLimits: { dailyMax: 20, weeklyMax: 100 }`) and commit; the daemon picks up on next restart:
```bash
systemctl --user restart pipeline-orchestrator
```

## 5. Manual cancellation
```bash
# From Telegram (preferred):
/cancel <queue_id>

# From the VPS shell (emergency):
sqlite3 ops/work-queue.db "UPDATE queue SET cancel_requested=1 WHERE id=<queue_id> AND status IN ('queued','running');"
# Orchestrator polls cancel_requested every 2s.
```

## 6. Inspecting a single run's claude transcript
```bash
ls ops/runs/<run_id>/
less ops/runs/<run_id>/claude.log
cat ops/runs/<run_id>/events.jsonl | jq .
```

## 7. Reading the canonical audit log
```bash
tail -50 data/yash-resume-runs.log | jq .
```
One JSONL line per URL. Fields: url, status, slug, score, jd, pdf, cover_letter_pdf, phase timings (ms).

## 8. Reboot procedure
```bash
sudo reboot
# Wait ~60s; both units auto-start because:
#  - `loginctl enable-linger yash` is set
#  - both .service files have `WantedBy=default.target`
# Verify:
ssh yash@srv944193 'systemctl --user status telegram-listener pipeline-orchestrator --no-pager | head -10'
```

## 9. Rollback (full, nuclear)
```bash
systemctl --user disable --now telegram-listener pipeline-orchestrator
git checkout main
git revert <bad-merge-sha>
git push origin main
# Optional: archive the DB before reinstalling
mv ops/work-queue.db ops/work-queue.db.bak.$(date +%s)
```

## 10. Secrets hygiene — DO NOT DO
- Do NOT `cat /etc/yash-pipeline/agent.env` into a Claude session (the token will end up in transcripts).
- Do NOT add the literal token or chat ID to any code, config, or commit message.
- Do NOT remove `ECC_DISABLED_HOOKS` from `~/.claude/settings.json` without verifying the gateguard hook isn't deadlocking the orchestrator-spawned Bash calls. If a fresh install resets settings.json, restore:
  ```json
  "env": {
    "ECC_DISABLED_HOOKS": "pre:bash:gateguard-fact-force,pre:edit-write:gateguard-fact-force",
    "CLAUDE_SESSION_ID": "yash-primary"
  }
  ```

## 11. Logs
- Daemon stdout/stderr → journald (`journalctl --user -u <unit>`).
- Per-URL Claude transcript → `ops/runs/<run_id>/claude.log` (keep forever).
- Per-URL phase timings JSONL → `data/yash-resume-runs.log` (existing, append-only, keep forever).
- Per-run state events → `ops/runs/<run_id>/events.jsonl` (keep forever).
- Tectonic stderr (resume) → `resume-logs/yash/<slug>...log` (existing, keep forever).
- Tectonic stderr (cover letter) → `cover-letter-logs/yash/<slug>...log` (existing, keep forever).
- (Future) `/var/log/yash-pipeline/*.log` mirror via `systemd-cat` or tee — wired by `tools/bootstrap-vps.sh` + `/etc/logrotate.d/yash-pipeline`.

## 12. On-call playbook
| Page | Action |
|---|---|
| `🚨 work-queue.db corrupt, archived` | `sqlite3 ops/work-queue.db.corrupt-* '.dump'` for forensics; bring up a fresh DB; re-add lost URLs from Telegram history |
| `❌ #N <hostname> failed at jd_fetch` | Open the Scrapling stderr; if Cloudflare blocked, ignore (retryable). Mass failures → check `scrapling_fetch.py` and `.venv/bin/python3` |
| `⏸️ Cap reached` | Working as designed; will resume tomorrow / next ISO week |
| `OOM detected` | `dmesg \| tail -100`; if tectonic killed, recompile smaller; if claude killed, restart and add memory caps |
| Telegram doesn't respond at all | `systemctl --user status telegram-listener`; if active, `journalctl --user -u telegram-listener` for `long-poll error`; if backoff still climbing, restart |
