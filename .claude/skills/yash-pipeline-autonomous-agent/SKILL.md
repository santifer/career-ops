---
name: yash-pipeline-autonomous-agent
description: 24/7 unattended wrapper around /yash-resume-pipeline. Telegram bot enqueues URLs, systemd orchestrator runs one claude -p per URL, delivers resume + cover letter PDFs back to Telegram. Use when the user mentions "autonomous-yash", "yash-24-7", "yash-bot", asks to /add a URL via Telegram, checks /status, debugs why the bot isn't responding, rotates the bot token, or needs to deploy / rollback the autonomous pipeline on the Hostinger VPS.
---

# yash-pipeline-autonomous-agent — runbook

This skill is operational, not generative. It does NOT modify resumes, JDs, or prompts — it spins up / inspects / rolls back the Telegram-triggered wrapper that drives the existing `/yash-resume-pipeline` skill on the VPS.

## When to use
- User asks why the bot isn't responding to /add or /status.
- User asks to deploy / re-deploy / roll back the autonomous agent.
- User asks to rotate the Telegram bot token, change the allowlist, or change the cap.
- User pastes a journalctl error from `telegram-listener` or `pipeline-orchestrator`.
- User asks for the runbook (see also `OPERATIONS.md` at repo root for the long form).

## Architecture (one-paragraph reminder)
Two systemd `--user` daemons (`telegram-listener`, `pipeline-orchestrator`) read from `/etc/yash-pipeline/agent.env`, share state through `ops/work-queue.db` (SQLite WAL), and spawn one `claude -p` per URL. Per-URL latency 6–14 min (preserves the existing `/yash-resume-pipeline` budget; no improvement). Spec: `docs/superpowers/specs/2026-05-24-yash-pipeline-autonomous-agent-architecture.md`.

## Quick diagnostic commands
```bash
# Are both daemons alive?
systemctl --user status telegram-listener pipeline-orchestrator --no-pager

# What's the bot been doing?
journalctl --user -u telegram-listener -n 50 --no-pager
journalctl --user -u pipeline-orchestrator -n 50 --no-pager

# What's in the queue right now?
sqlite3 ops/work-queue.db 'SELECT id, url, status FROM queue ORDER BY id DESC LIMIT 10;'

# How many runs today / this week?
sqlite3 ops/work-queue.db "SELECT status, COUNT(*) FROM runs WHERE date(started_at)=date('now') GROUP BY status;"
```

## Failure playbook
| Symptom | First check | If that's fine, then |
|---|---|---|
| Bot doesn't reply to /help | `systemctl --user status telegram-listener` | `journalctl --user -u telegram-listener -n 100` — look for `long-poll error` |
| /add accepted but nothing happens | `systemctl --user status pipeline-orchestrator` | Check `sqlite3 ops/work-queue.db 'SELECT * FROM queue WHERE status="queued"'`; check cap |
| Run failed with `tectonic exit` | Read `resume-logs/yash/<slug>.log` last 30 lines | Re-add via `/add <same-url>` after 24h, or `/readd` (Phase 3) |
| "OOM" notification | `dmesg \| tail -100` for the killed process | Reduce concurrency (already 1); inspect tectonic memory profile |
| Secret leak alert from pre-commit | `tools/check-secrets.sh` output | Move offending lines to `/etc/yash-pipeline/agent.env`, recommit |

## Rollback
```bash
systemctl --user disable --now telegram-listener pipeline-orchestrator
git revert <merge-commit-sha>
git push origin main
# DB and ops/ tree stay on disk (gitignored) — preserve for forensics
```

## Full reference
- Long-form ops doc: `OPERATIONS.md` (repo root)
- Spec: `docs/superpowers/specs/2026-05-24-yash-pipeline-autonomous-agent-architecture.md`
- Drift audit: `docs/superpowers/audits/2026-05-24-spec-vs-code-drift.md`
