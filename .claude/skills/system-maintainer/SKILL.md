---
name: system-maintainer
description: Run a system-maintenance pass on the career-ops infrastructure — snapshot launchd plist health, dedup the tracker, sweep orphan reports / apply-packs / /tmp leaks, scan dashboard-server.mjs for security regressions, expand portals.yml with new pre-IPO companies, watch the ATS AI-detection landscape. Slash-command wrapper around `scripts/agents/system-maintainer.mjs`. Each pass is reversible (archives, never deletes personal data). Triggers when Mitchell types /system-maintainer, says "run system health," "dedup the trackers," "review the codebase for hardening opportunities," "expand the pipeline with pre-IPO companies," "check the ATS landscape," "audit the launchd jobs," or any phrasing that calls for routine SRE hygiene work on career-ops. Heavy LLM-spend modes (--expand, --ats-watch) are stubs that delegate to /researcher when explicitly requested.
user_invocable: true
args: mode
argument-hint: "[health | cleanup | review | expand | ats-watch | all] (default: all)"
---

# system-maintainer — SRE / data-steward sub-agent

## Purpose

career-ops accretes state: orphan dashboard HTMLs, stale hm-intel JSON, /tmp leaks from killed agents, drift between AGENTS.md and the actual plist count, slow regression in dashboard-server.mjs as multiple personas edit it. This skill runs a single end-to-end hygiene pass to surface AND fix what it finds.

Built as part of the overnight EPSILON haul (2026-05-19) — first nightly run scheduled via `com.mitchell.career-ops.system-maintainer.plist` at 03:00 PT.

## Modes

| Mode | What it does | Spend |
|---|---|---|
| `health` | Snapshot launchd plist health, tracker dupes, hm-intel age, orphan reports, /tmp leaks, dashboard server listen status. Write `data/system-health-<DATE>.md`. | $0 |
| `cleanup` | Archive (NEVER delete) reverse-orphan dashboard HTMLs, placeholder apply-packs, stale-and-Discarded hm-intel, sweep /tmp leaks >24h. Write `data/system-maintenance-log-<DATE>.md`. | $0 |
| `review` | Re-scan `dashboard-server.mjs` for security regressions: REPORT_SLUG_RE guards, path-traversal patterns, fetch-without-AbortSignal in `scripts/agents/`. Write `data/system-review-findings-<DATE>.md`. | $0 |
| `expand` | Stub — delegates to `/researcher` to surface 10 pre-IPO companies for `portals.yml`. Manual trigger only (cost: $10-15). | $10-15 |
| `ats-watch` | Stub — delegates to `/researcher` for ATS-detection landscape watch (last 90 days). Manual trigger only (cost: $5-8). | $5-8 |
| `all` (default) | Runs health → cleanup → review (skips LLM-heavy expand + ats-watch). | $0 |

## Triggers

- "run system health" / "run system maintainer"
- "dedup the tracker" / "clean up orphans"
- "review dashboard-server for hardening"
- "expand portals with pre-IPO companies" → invokes `--expand` (asks before spending)
- "check ATS landscape" → invokes `--ats-watch` (asks before spending)
- `/system-maintainer` slash command
- Mitchell says "do the maintenance pass" or similar

## Example invocations

```
/system-maintainer
/system-maintainer health
/system-maintainer cleanup
/system-maintainer review
/system-maintainer expand    (asks before spending API budget)
/system-maintainer ats-watch (asks before spending API budget)
/system-maintainer all
```

## Inputs / outputs / constraints

**Inputs:** Reads from the current working directory's `scripts/launchd/`, `data/applications.md`, `data/hm-intel/`, `data/apply-packs/`, `reports/`, `dashboard/reports/`, `dashboard-server.mjs`, `data/pipeline.md`, `batch/batch-input.tsv`, `data/scan-history.tsv`, `/tmp/`. Uses `launchctl list` for the plist load status. Uses `lsof -nP -iTCP:3097` to check dashboard listen status.

**Outputs:**
- `data/system-health-<DATE>.md` (health mode)
- `data/system-maintenance-log-<DATE>.md` (cleanup mode — reversal commands included)
- `data/system-review-findings-<DATE>.md` (review mode)
- `data/portals-expansion-log-<DATE>.md` (expand mode — stub w/ researcher prompt)
- `data/ats-landscape-<DATE>.md` (ats-watch mode — stub w/ researcher prompt)
- Append to `data/logs/system-maintainer-<DATE>.log`

**Constraints:**
- NEVER deletes personal data. Always archives to dated directories.
- NEVER modifies `cv.md`, `modes/_profile.md`, `config/profile.yml`.
- NEVER auto-merges its own commits. Mitchell merges via the standard workflow.
- LLM modes (expand, ats-watch) STUBBED in the agent — delegate to the existing `/researcher` skill rather than duplicating orchestration. This keeps the maintenance pass $0 by default.
- Tracker dedup is conservative — relies on existing `dedup-tracker.mjs` if present, otherwise just FLAGS dupes (does not auto-merge rows).

## Anti-hallucination reminders (inline)

- Report raw counts. Never say "all green" if anything is flapping or stale.
- Per-plist exit codes must come from `launchctl list`, not memory.
- Reverse-orphan list comes from a real basename diff, not "probably stale" guesses.
- AbortSignal coverage check looks at the actual 15 source lines after each fetch site — no "I'm sure it's covered" hand-waving.
- If a finding lacks file:line, do not include it.

## Anti-sycophancy reminders (inline)

- If the launchd job is flapping, say "FLAPPING" not "minor issue."
- If `dashboard-server` is down, say it's down. Don't bury behind a "system is mostly healthy."
- If `/tmp` is clean, say "0 leaks" and move on — don't claim a "thorough sweep was completed" for a no-op.

## Scheduled run

`scripts/launchd/com.mitchell.career-ops.system-maintainer.plist` runs `--all` nightly at **03:00 PT**. `KeepAlive: false` (one-shot per day). Logs to `data/logs/system-maintainer-<DATE>.log`. Mitchell's morning heartbeat can then ingest the latest `data/system-health-<DATE>.md`.

## How this skill differs from existing tooling

- `verify-pipeline.mjs` checks tracker integrity — `--health` covers that plus the broader system state (launchd, /tmp, orphans, etc.).
- `dedup-tracker.mjs` runs only when dupes exist — `--cleanup` calls it conditionally.
- `merge-tracker.mjs` is a different flow (batch → tracker), not maintenance.
- The existing `audit` plist runs a quality audit against reports — different scope (content) vs system-maintainer (infrastructure).
