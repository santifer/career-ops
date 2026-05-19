# Email-Review Scheduler

This directory holds the launchd plist + bash wrapper for the `/email-review` skill's 09:30 PT daily run.

## Files

| File | Purpose |
|---|---|
| `com.mitchell.career-ops.email-review.plist` | launchd job definition — fires at 09:30 PT Mon-Fri |
| `run-email-review.sh` | Wrapper that loads `.env`, validates preconditions, invokes `claude --bare -p ...` |

## Install (Mitchell runs this once)

```bash
launchctl bootstrap gui/$(id -u) /Users/mitchellwilliams/Documents/career-ops/.claude/scheduler/com.mitchell.career-ops.email-review.plist
launchctl enable gui/$(id -u)/com.mitchell.career-ops.email-review
```

## Verify

```bash
launchctl list | grep email-review
launchctl print gui/$(id -u)/com.mitchell.career-ops.email-review
```

## Test fire (without waiting for 09:30 PT)

```bash
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.email-review
```

Tail the logs:

```bash
tail -f /Users/mitchellwilliams/Documents/career-ops/.claude/audit/email-review/cron.log
```

## Uninstall

```bash
launchctl bootout gui/$(id -u)/com.mitchell.career-ops.email-review
```

## Schedule

Mon–Fri at 09:30 PT. The wrapper additionally enforces Saturday/Sunday skip as defense-in-depth. Heartbeat itself fires at 09:00 PT via `com.mitchell.career-ops.heartbeat`, so the email-review job gets a 30-minute window for the HTML archive to be written.

## Preconditions checked by the wrapper before spending API budget

1. `.env` exists at `/Users/mitchellwilliams/Documents/career-ops/.env` (sourced for `ANTHROPIC_API_KEY`)
2. `claude` CLI is on `PATH` (PATH is set in the plist + the wrapper retries common install dirs)
3. Today's archive exists at `data/heartbeat-archive/heartbeat-<today>.html`
4. Today is a weekday (DOW 1–5)

If any precondition fails, the wrapper exits 0 with a logged reason — no API spend, no error noise.

## Cost contract

- Per-run cap: $1.50 (enforced by orchestrator Phase 0 budget gate)
- Monthly cap: $30 (approx 20 review days × $1.50)
- Per-run `claude --bare ... --max-turns 40` ceiling enforced by the wrapper

## Reading the audit trail

```bash
# Daily report
cat .claude/audit/email-review/$(date +%Y-%m-%d)-report.md

# Daily trace (JSON lines, one per tool call)
cat .claude/audit/email-review/$(date +%Y-%m-%d)-trace.jsonl

# Council ledger (which persona voted what on each contested finding)
cat .claude/audit/email-review/$(date +%Y-%m-%d)-council-ledger.md

# Patches applied today (one .patch file per finding)
ls .claude/audit/email-review/$(date +%Y-%m-%d)-patches/

# Findings archived (not surfaced in the report but kept for audit)
cat .claude/audit/email-review/$(date +%Y-%m-%d)-archived-findings.md

# Wrapper cron log (every invocation, every failure)
tail .claude/audit/email-review/cron.log
```
