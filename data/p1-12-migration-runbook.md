# P1-12 — GitHub Actions cutover runbook

**Status (2026-05-19):** workflows committed to main; secrets not yet
configured; launchd plists still authoritative. Cutover is gated on:

1. Secrets uploaded to GitHub Actions
2. Healthchecks.io project created (P0-1 already wired locally — same secret
   names used here)
3. 14 consecutive days of green portal-scan workflow runs
4. State-cache restore verified at least once across runs

Once all four hold, the launchd `com.mitchell.career-ops.scan` plist can be
booted out and deleted (or kept disabled as a manual fallback — disk cost is
zero).

## How this layers on top of the existing P1-8 infrastructure

The P1-8 work is already on main (commit `d4ed468 feat(infra): reliability
foundation`):

- `scripts/launchd-wrapper.mjs` — retry shim
- `lib/healthchecks-ping.mjs` — shared `hc('JOB_KEY')` helper reading
  `HEALTHCHECKS_<JOBKEY>_PING` from `~/.career-ops-secrets`
- `lib/job-runs-ledger.mjs` — SQLite ledger powering the dashboard
  scraper-health widget
- `scripts/migrate-plists-to-wrapper.mjs` — one-shot transform of every
  cron-style plist to invoke the wrapper

Inside `scan-unattended.mjs` the wiring already exists:

```js
const ping = hc('PORTAL_SCAN');
const runId = startRun('portal-scan');
await ping.start();
// ... scan work ...
finishRun(runId, { status: 'ok', urls_found: bridgeCount });
await ping.success(`bridged ${bridgeCount} rows`);
```

P1-12 reuses every piece of that. The GH Actions workflow synthesizes a
`~/.career-ops-secrets` file from the workflow's `HEALTHCHECKS_PORTAL_SCAN_PING`
secret so `hc('PORTAL_SCAN')` works identically on the Linux runner. The
ledger writes (SQLite-backed) happen the same way locally and on the runner;
the only difference is that the runner's SQLite file is ephemeral (lives in
the actions/cache) so the dashboard widget reflects only the LOCAL runs, not
the GH Actions ones. That's intentional: the dashboard is for what's running
on the Mac, and the GH Actions side has its own UI (the Actions tab).

## Failure-mode coverage matrix

| Failure mode | Caught by |
|---|---|
| Script crashes mid-run | P1-8 wrapper retry + `hc('JOB_KEY').fail()` |
| Script exits non-zero | Wrapper retry + Healthchecks `/fail` |
| Script hangs (no exit) | hang-watchdog (separate system, see lib/safe-fetch.mjs patterns) |
| launchd never spawns the job | Healthchecks dead-man's-switch (grace period fires) + GH Actions cron firing the same work |
| Whole Mac is asleep / crashed | GH Actions cron + health-probe workflow's external HTTP check |
| dashboard-server / telegram-bot died silently | `health-probe.yml` (15-min cadence) catches within 30 min |

## Workflow inventory

| File | Replaces / monitors | Cron | Min/run | Min/month |
|---|---|---|---|---|
| `.github/workflows/portal-scan.yml` | replaces `com.mitchell.career-ops.scan.plist` | every 4h business hours (4×/day) | ≤50 | ≤6,000 budgeted, expect ~1,800 |
| `.github/workflows/health-probe.yml` | monitors dashboard-server + telegram-bot (does NOT replace) | every 15min | ≤3 | ≤290 |

## Required GitHub Actions secrets

Open **Settings → Secrets and variables → Actions → New repository secret**.

| Secret name | Source | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env` | portal-scan (triage) |
| `GMAIL_USER` | `.env` | portal-scan (scan-email) |
| `GMAIL_APP_PASSWORD` | `.env` | portal-scan (scan-email) |
| `TELEGRAM_BOT_TOKEN` | `.env` | both workflows |
| `TELEGRAM_CHAT_ID` | `.env` | both workflows |
| `HEALTHCHECKS_PORTAL_SCAN_PING` | `~/.career-ops-secrets` (same value used locally) | portal-scan |
| `HEALTHCHECKS_DASHBOARD_SERVER_PING` | `~/.career-ops-secrets` | health-probe |
| `HEALTHCHECKS_TELEGRAM_BOT_PING` | `~/.career-ops-secrets` | health-probe |

Note: the workflow synthesizes a `~/.career-ops-secrets` file on the runner
from the `HEALTHCHECKS_*_PING` secret before invoking the script, so
`lib/healthchecks-ping.mjs`'s `hc()` reader works identically on both
platforms. The synth file is wiped when the runner is recycled.

## Healthchecks.io setup

P0-1 is already wired locally (commit `d4ed468`). To enable end-to-end:

1. Sign up at https://healthchecks.io/ (free tier: 20 checks).
2. Create one check per `hc('JOB_KEY')` call site. Current call sites + their
   suggested cadences:
   - `PORTAL_SCAN` — every 4h, grace 30 min
   - `LIVENESS_SWEEP` — every 4h, grace 30 min
   - `DASHBOARD_SERVER` — every 15 min, grace 5 min (this one needs the
     setInterval patch — see below)
   - `TELEGRAM_BOT` — every 15 min, grace 5 min (same)
3. Each check has a unique ping URL like `https://hc-ping.com/<uuid>`. Add to
   `~/.career-ops-secrets`:
   ```
   HEALTHCHECKS_PORTAL_SCAN_PING=https://hc-ping.com/<scan-uuid>
   HEALTHCHECKS_LIVENESS_SWEEP_PING=https://hc-ping.com/<liveness-uuid>
   HEALTHCHECKS_DASHBOARD_SERVER_PING=https://hc-ping.com/<dashboard-uuid>
   HEALTHCHECKS_TELEGRAM_BOT_PING=https://hc-ping.com/<telegram-uuid>
   ```
4. Add the SAME URLs as GitHub Actions secrets (table above).
5. Configure Healthchecks to email + Telegram you when a check fires its
   grace timer.

## Cutover steps for portal-scan

Run **after** secrets are uploaded and the workflow has fired at least once
manually (use **Actions → portal-scan → Run workflow** to test).

### Phase A — parallel mode (days 0-14)

Both launchd plist AND GH Actions workflow fire on their own schedules.
Duplicate scans are harmless: `data/scan-history.tsv` dedups by URL. Compare
the two outputs:

```bash
# Macbook (launchd ran — also captured in the SQLite ledger)
node -e "
import('./lib/job-runs-ledger.mjs').then(m => {
  const rows = m.listRuns('portal-scan', { limit: 5 });
  console.table(rows);
});
" --input-type=module

# GH Actions (download log artifact)
gh run download -R mitwilli-create/career-ops --name scan-log-<run-id> -D /tmp/scan-gh
wc -l /tmp/scan-gh/scan-*.log
```

If the two outputs diverge meaningfully (more than ±5 URLs), the GH Actions
run is missing something — usually a file that's gitignored AND not in the
cache. Audit which file is missing, add it to the workflow's cache list,
bump the cache `key` suffix to invalidate.

### Phase B — cutover (day 14)

After 14 consecutive green GH Actions runs **and** matching scan counts:

```bash
# 1. Disable the launchd plist (keeps the file on disk; reversible)
launchctl bootout gui/$(id -u)/com.mitchell.career-ops.scan

# 2. Verify gone
launchctl list | grep com.mitchell.career-ops.scan && echo "STILL LOADED — abort" || echo "✓ unloaded"

# 3. (optional) Remove the loaded copy to prevent reboot re-loading
rm ~/Library/LaunchAgents/com.mitchell.career-ops.scan.plist

# 4. Keep scripts/launchd/com.mitchell.career-ops.scan.plist in git as
#    the rollback artifact. To undo, copy it back and bootstrap.
```

### Phase C — observe (day 14+)

GH Actions is now authoritative. Healthchecks fires within the grace period
if the cron misses. Recovery:

```bash
cp scripts/launchd/com.mitchell.career-ops.scan.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mitchell.career-ops.scan.plist
launchctl start com.mitchell.career-ops.scan
```

## Cutover NOT possible for dashboard-server + telegram-bot

Both are persistent KeepAlive processes. GH Actions runs are time-bounded
(6h hard cap per job, ephemeral runners) so they can't host long-running
daemons. `health-probe.yml` is a strict *monitoring layer*, not a
replacement.

If you eventually want to migrate these off the Mac entirely (so they
survive reboots / sleeps / OS upgrades), the right targets are:

- **Cloudflare Workers + Durable Objects** — already using CF for the tunnel
- **Fly.io / Railway / Render free tier** — drop-in Node hosting
- **Self-hosted GitHub Actions runner on a VPS** — keep the workflows
  pattern, host the daemons separately

Until then, local launchd stays. The probe gives you external alerting.

### Optional: make the telegram-bot probe useful

Right now `health-probe.yml` `probe-telegram-bot` only verifies that the
bot token is valid via `getMe`. It does NOT detect that the LOCAL bot binary
has died — `getMe` returns success even if the bot is dead, because
Telegram's API doesn't know.

For real liveness, modify `telegram-bot.mjs` to use the existing helper:

```js
import { hc } from './lib/healthchecks-ping.mjs';

const ping = hc('TELEGRAM_BOT_LOCAL'); // reads HEALTHCHECKS_TELEGRAM_BOT_LOCAL_PING
if (ping.enabled) {
  setInterval(() => { ping.success(); }, 60_000);
}
```

Add the env var to `~/.career-ops-secrets`, configure the Healthchecks check
to alert if no ping for >5 min, and local-process-death is covered.

The same pattern works for `dashboard-server.mjs` — add a setInterval
calling `hc('DASHBOARD_SERVER_LOCAL').success()`. External probe checks
HTTP reachability; internal ping checks event-loop liveness.

## Budget guardrail

`portal-scan.yml` runs 4×/day × ~30min = 3,600 min/month. `health-probe.yml`
runs 96×/day × ~2min = 5,760 min/month. Combined ~9,360 min/month —
**over the 2,000 min/month free tier**.

Options if you actually want both at the listed cadences:

1. **Make the repo public.** Unlimited minutes. Audit committed personal
   data first (cv.md and applications.md are gitignored, but check
   `.github/workflows/*.yml` for any leaked context).
2. **Pay GitHub for more minutes.** ~$8 / 3,000 extra min.
3. **Drop health-probe cron to `*/30`** — half the cost, 30-min detection.
4. **Use Healthchecks.io's own uptime monitor** for the dashboard probe
   (runs FROM HEALTHCHECKS, no GH Actions minutes). Set up at
   https://healthchecks.io/uptime/. This is **the recommended option**.

Recommendation: option 4 for dashboard URL + keep portal-scan.yml on the
4×/day cron. Gets you the same coverage at near-zero cost.

## Rollback (if any of this is wrong)

Both workflows are net-new files. Disable by:

```bash
# In GitHub UI: Settings → Actions → General → Disable Actions
# OR move the workflow files out of .github/workflows/ on a branch + merge
```

The portability shim in `scripts/scan-unattended.mjs` is additive (env vars
default to the old hardcoded paths when unset). Local launchd is unchanged
by P1-12 — the only risk is the workflows themselves, and they're disabled
in one click.
