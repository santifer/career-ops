# launchctl Commands — career-ops Job Restart + Status Reference

**Generated:** 2026-05-07 (overnight autonomous session)
**Plists location:** `scripts/launchd/`
**Currently tracked plists (7):**
1. `com.mitchell.career-ops.batch.plist` — overnight batch evaluator (08:05 PT post-quota-reset)
2. `com.mitchell.career-ops.scan.plist` — portal scanner
3. `com.mitchell.career-ops.heartbeat.plist` — daily heartbeat email
4. `com.mitchell.career-ops.dashboard-server.plist` — dashboard HTTP server
5. `com.mitchell.career-ops.cloudflared.plist` — Cloudflare tunnel for dashboard
6. `com.mitchell.career-ops.weekly-intel.plist` — weekly Grok intel run
7. `com.mitchell.career-ops.skill-ingest.plist` — weekly skill-ingest --apply (Sunday 21:00 PT — added 2026-05-17)

---

## Quick reference

```bash
# List all career-ops launchd jobs and their state
launchctl list | grep career-ops

# Check whether a specific job is loaded (returns plist label if yes)
launchctl print gui/$(id -u)/com.mitchell.career-ops.batch | head -20
```

---

## Per-job restart commands

Replace `{job-name}` with one of: `batch`, `scan`, `heartbeat`, `dashboard-server`, `cloudflared`, `weekly-intel`, `skill-ingest`.

### Restart (kickstart-kill, force re-run)

```bash
# Restart batch
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.batch

# Restart scan
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.scan

# Restart heartbeat
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.heartbeat

# Restart dashboard-server
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.dashboard-server

# Restart cloudflared
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.cloudflared

# Restart weekly-intel
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.weekly-intel

# Restart skill-ingest (force one-shot run NOW instead of waiting for Sunday 21:00)
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.skill-ingest
```

### Install / register skill-ingest weekly auto-fire (one-time setup)

```bash
# Copy or symlink the plist into LaunchAgents:
cp /Users/mitchellwilliams/Documents/career-ops/scripts/launchd/com.mitchell.career-ops.skill-ingest.plist ~/Library/LaunchAgents/

# Bootstrap into the user-domain launchd (loads + arms the calendar trigger):
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mitchell.career-ops.skill-ingest.plist

# Verify registration:
launchctl list | grep skill-ingest
```

The plist fires Sundays at 21:00 PT (Weekday=0, Hour=21). It runs:
`node scripts/skill-ingest.mjs --apply` (defaults to current ISO week).

Idempotency: SHA-1 evidence markers prevent re-merge of unchanged data.
Cost: ~$0.05/run on Gemini 3.1 Pro Preview (per Phase 4 strategy).

### Run once on demand (without kill, queue if currently running)

```bash
launchctl kickstart gui/$(id -u)/com.mitchell.career-ops.{job-name}
```

### Stop / unload (disable until reload)

```bash
# Stop running instance + remove from launchd
launchctl bootout gui/$(id -u)/com.mitchell.career-ops.{job-name}

# Or unload by plist path (older syntax, equivalent)
launchctl unload ~/Library/LaunchAgents/com.mitchell.career-ops.{job-name}.plist
```

### Load (after editing plist or after bootout)

```bash
# Load via plist path
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mitchell.career-ops.{job-name}.plist

# Older syntax (still works)
launchctl load ~/Library/LaunchAgents/com.mitchell.career-ops.{job-name}.plist
```

---

## After a code change — typical reload flow

When `scripts/heartbeat.mjs`, `scripts/batch-runner-unattended.mjs`, or any script referenced from a plist changes, the launchd job picks up the new code on next run. **No restart is required** unless:
- The plist itself was edited (env vars, schedule, paths).
- The job is currently running and you want the change to take effect immediately.

If the plist was edited:

```bash
# Bootout + bootstrap = reload
launchctl bootout gui/$(id -u)/com.mitchell.career-ops.{job-name}
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mitchell.career-ops.{job-name}.plist

# Or if the plist file is symlinked to scripts/launchd/, edit the source and reload:
launchctl bootout gui/$(id -u)/com.mitchell.career-ops.{job-name}
launchctl bootstrap gui/$(id -u) /Users/mitchellwilliams/Documents/career-ops/scripts/launchd/com.mitchell.career-ops.{job-name}.plist
```

---

## Inspect last run state

```bash
# Last exit status, PID, last run time
launchctl list com.mitchell.career-ops.{job-name}

# Or full state
launchctl print gui/$(id -u)/com.mitchell.career-ops.{job-name}
```

The `last exit code` field is the most useful signal:
- `0` — last run succeeded
- non-zero — last run failed; check stderr/stdout paths in the plist for log location

---

## Common tasks

### "Did the batch run this morning?"

```bash
launchctl list com.mitchell.career-ops.batch
# Look at the LastExitStatus and PID fields
```

### "Restart everything"

```bash
for job in batch scan heartbeat dashboard-server cloudflared weekly-intel; do
  launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.${job}
  echo "kicked: ${job}"
done
```

### "Disable batch temporarily (e.g., during a refactor)"

```bash
launchctl bootout gui/$(id -u)/com.mitchell.career-ops.batch
# Re-enable when ready:
launchctl bootstrap gui/$(id -u) /Users/mitchellwilliams/Documents/career-ops/scripts/launchd/com.mitchell.career-ops.batch.plist
```

### "Where do logs go?"

Check the plist's `StandardOutPath` and `StandardErrorPath` keys:

```bash
grep -E "StandardOutPath|StandardErrorPath" scripts/launchd/com.mitchell.career-ops.{job-name}.plist
```

---

## Notes on macOS launchd behavior

- `gui/$(id -u)` is the user-domain Aqua session — required for jobs that depend on the logged-in user environment.
- After macOS reboot, plists in `~/Library/LaunchAgents/` auto-load. Plists kept only in `scripts/launchd/` (not symlinked) do NOT auto-load.
- If a plist references a hardcoded node binary path (e.g., `/Users/mitchellwilliams/.nvm/versions/node/v24.14.0/bin/node`), an nvm version change breaks the job silently. Audit per-plist after `nvm install`.

---

**This file is NOT auto-updated.** Re-generate when launchd plists are added, removed, or significantly restructured.
