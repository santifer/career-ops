#!/usr/bin/env node
/**
 * merge-bat-results.mjs
 * Step 3 of the Windows AutoSubmit bat: read data/autosubmit-results.json
 * and merge tallies into data/last-refresh.json via write-refresh-status.mjs
 * --bat-merge mode.
 *
 * Extracted from run-autosubmit.bat 2026-05-13 — inline node -e multiline JS
 * fails in Windows CMD.
 *
 * TD-10 fix 2026-05-17: bat_notes was being truncated when the card-ID list
 * exceeded the CLI arg buffer. Fix: write full detail to data/bat-run-log.json
 * and pass only a short summary string to --notes (≤200 chars).
 *
 * Exit codes: 0 = merged, 1 = results file missing or write failed
 */

import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { join, dirname }                           from 'path';
import { fileURLToPath }                           from 'url';
import { execFileSync }                            from 'child_process';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = join(__dirname, 'data', 'autosubmit-results.json');
const BAT_LOG_PATH = join(__dirname, 'data', 'bat-run-log.json');

let r;
try {
  r = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
} catch (e) {
  console.error('Cannot read results:', e.message);
  process.exit(1);
}

// TD-10 fix: write full per-card detail to bat-run-log.json so nothing is lost
// even when the notes string is long. The 8am report can read this file directly.
const batLog = {
  ran_at:       new Date().toISOString(),
  bat_attempted: (r.submitted ?? 0) + (r.blocked ?? 0) + (r.sus_new ?? 0) + (r.errors ?? 0), // KAIZEN-10
  submitted:    r.submitted  ?? 0,
  blocked:      r.blocked    ?? 0,
  sus_new:      r.sus_new    ?? 0,
  errors:       r.errors     ?? 0,
  deferred:     r.deferred   ?? 0,
  detail:       r.notes      ?? '',   // full comma-separated card:outcome list
};
try {
  const tmp = BAT_LOG_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(batLog, null, 2), 'utf8');
  renameSync(tmp, BAT_LOG_PATH);
  console.log('[merge-bat] Wrote full detail to data/bat-run-log.json');
} catch (e) {
  console.warn('[merge-bat] Could not write bat-run-log.json:', e.message);
}

// Build a short summary (≤200 chars) for last-refresh.json bat_notes field
const summary = `bat: submitted=${r.submitted ?? 0} blocked=${r.blocked ?? 0} sus=${r.sus_new ?? 0} errors=${r.errors ?? 0} — see data/bat-run-log.json`;

const args = [
  'write-refresh-status.mjs', '--bat-merge',
  '--bat-attempted', String(batLog.bat_attempted),
  '--submitted',     String(r.submitted  ?? 0),
  '--blocked',       String(r.blocked    ?? 0),
  '--sus-new',       String(r.sus_new   ?? 0),
  '--errors',        String(r.errors    ?? 0),
  '--deferred',      String(r.deferred  ?? 0),
  '--notes',         summary,
];

try {
  execFileSync('node', args, { stdio: 'inherit', cwd: __dirname });
  console.log('[merge-bat] Merged into data/last-refresh.json');
  process.exit(0);
} catch (e) {
  console.error('[merge-bat] Merge failed:', e.message);
  process.exit(1);
}
