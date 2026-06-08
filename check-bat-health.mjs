#!/usr/bin/env node
/**
 * check-bat-health.mjs — Kaizen #1
 *
 * Reads data/last-refresh.json and reports whether the Windows AutoSubmit bat
 * (run-autosubmit.bat at 6:10am via Task Scheduler) has fired recently enough
 * to be clearing the deferred queue. Cloud 6am refresh should call this at
 * Step 0 and pipe the verdict into its run notes.
 *
 * The 6am cloud agent defers A/B cards when Chromium is missing in the sandbox
 * (exit 4). The Win bat is the relief valve. If the bat hasn't run in >30h
 * while we're still deferring, we have a silent backlog growing — flag loudly.
 *
 * JSON output (machine-readable, one-line):
 *   {"verdict":"healthy|stale|never_ran","bat_ran_at":"...","hours_since":N,"deferred_pending":N,"recommendation":"..."}
 *
 * Exit 0 = healthy or never_ran (informational), Exit 0 = stale (still 0 — this
 * is a notes-only signal, not a failure). Caller decides what to do.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const REFRESH_PATH = join(__dirname, 'data', 'last-refresh.json');

// Threshold: bat should fire at 6:10am daily. Allow up to 30h slack (one missed
// day + 6h grace) before we flag. Bumpable via env if needed.
const STALE_HOURS = parseInt(process.env.BAT_STALE_HOURS || '30', 10);

function emit(obj) {
  console.log(JSON.stringify(obj));
}

if (!existsSync(REFRESH_PATH)) {
  emit({
    verdict: 'never_ran',
    bat_ran_at: null,
    hours_since: null,
    deferred_pending: 0,
    recommendation: 'No last-refresh.json yet — first run; nothing to assess.',
  });
  process.exit(0);
}

let r;
try {
  r = JSON.parse(readFileSync(REFRESH_PATH, 'utf8'));
} catch (e) {
  emit({
    verdict: 'parse_error',
    bat_ran_at: null,
    hours_since: null,
    deferred_pending: 0,
    recommendation: `last-refresh.json unreadable: ${e.message}. Investigate.`,
  });
  process.exit(0);
}

const batRanAt        = r.bat_ran_at || null;
const deferredPending = r.deferred || 0;

if (!batRanAt) {
  emit({
    verdict: 'never_ran',
    bat_ran_at: null,
    hours_since: null,
    deferred_pending: deferredPending,
    recommendation: deferredPending > 0
      ? `Win bat has never written bat_ran_at, but ${deferredPending} cards were deferred yesterday. Verify Task Scheduler job "JobPulse-AutoSubmit" exists and is enabled.`
      : 'Win bat has never written bat_ran_at, but no cards were deferred — no urgency.',
  });
  process.exit(0);
}

const hoursSince = (Date.now() - Date.parse(batRanAt)) / 3_600_000;
const hoursRound = Math.round(hoursSince * 10) / 10;

if (hoursSince > STALE_HOURS) {
  emit({
    verdict: 'stale',
    bat_ran_at: batRanAt,
    hours_since: hoursRound,
    deferred_pending: deferredPending,
    recommendation: `Win bat last ran ${hoursRound}h ago (>${STALE_HOURS}h threshold). ${deferredPending} cards deferred today will queue on top of yesterday's. Check Task Scheduler history for "JobPulse-AutoSubmit".`,
  });
  process.exit(0);
}

emit({
  verdict: 'healthy',
  bat_ran_at: batRanAt,
  hours_since: hoursRound,
  deferred_pending: deferredPending,
  recommendation: `Win bat ran ${hoursRound}h ago — within ${STALE_HOURS}h SLA. Deferred queue is being cleared.`,
});
process.exit(0);
