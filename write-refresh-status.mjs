#!/usr/bin/env node
/**
 * write-refresh-status.mjs
 * Writes (or merges into) the daily run summary at data/last-refresh.json.
 *
 * Called by TWO consumers:
 *   1. 6am Cowork scheduled task  → writes the full record (cloud side)
 *   2. run-autosubmit.bat          → merges bat-side submission results in
 *
 * Output: data/last-refresh.json
 *
 * Usage (6am cloud):
 *   node write-refresh-status.mjs --attempted N --submitted N --blocked N \
 *     --sus-new N --errors N [--deferred N] [--seed-version vNN-live-jobs] \
 *     [--notes "free-form text"]
 *
 * Usage (bat merge — only updates bat_* fields, preserves cloud fields):
 *   node write-refresh-status.mjs --bat-merge \
 *     --submitted N --blocked N --sus-new N --errors N \
 *     [--notes "free-form text"]
 *
 * All counts default to 0. ran_at / bat_ran_at are set automatically.
 *
 * Exit codes: 0 = wrote file, 1 = bad args / write failed
 */

import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH  = join(__dirname, 'data', 'last-refresh.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

function intArg(args, key, def = 0) {
  if (args[key] === undefined) return def;
  const n = parseInt(args[key], 10);
  if (Number.isNaN(n)) {
    console.error(`ERROR: --${key} must be an integer, got "${args[key]}"`);
    process.exit(1);
  }
  return n;
}

const args      = parseArgs(process.argv.slice(2));
const isBatMerge = !!args['bat-merge'];
const now       = new Date();

/** Atomic JSON write: write to .tmp then rename — prevents truncation (Kaizen 2026-05-22). */
function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, filePath);
}

mkdirSync(join(__dirname, 'data'), { recursive: true });

if (isBatMerge) {
  // ── BAT MERGE MODE ─────────────────────────────────────────────────────
  // Read existing record written by 6am cloud task, update bat_* fields only.
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
  } catch {
    // If 6am didn't write yet, create a minimal skeleton so bat results aren't lost
    existing = { ran_at: null, refresh_ran: false };
  }

  const merged = {
    ...existing,
    bat_ran_at:    now.toISOString(),
    bat_attempted: intArg(args, 'bat-attempted', 0), // KAIZEN-10
    bat_submitted: intArg(args, 'submitted', 0),
    bat_blocked:   intArg(args, 'blocked',   0),
    bat_sus_new:   intArg(args, 'sus-new',   0),
    bat_errors:    intArg(args, 'errors',    0),
    bat_notes:     args['notes'] || '',
  };

  // Combined submitted = cloud submitted + bat submitted (for 8am score)
  merged.submitted_total = (existing.submitted || 0) + merged.bat_submitted;

  try {
    writeJsonAtomic(OUT_PATH, merged);
    console.log(`[write-refresh-status] bat-merge written → submitted_total: ${merged.submitted_total}`);
  } catch (e) {
    console.error('ERROR: could not write last-refresh.json:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

// ── CLOUD WRITE MODE ───────────────────────────────────────────────────────
const rawAttempted = intArg(args, 'attempted', 0);
const submitted    = intArg(args, 'submitted', 0);
const blocked      = intArg(args, 'blocked',   0);
const sus_new      = intArg(args, 'sus-new',   0);
const errors       = intArg(args, 'errors',    0);
const deferred     = intArg(args, 'deferred',  0);

// TD-01: "attempted" must exclude deferred (exit 4).
// Guard: if caller accidentally passed attempted == deferred with no real outcomes,
// auto-correct to 0 so Submit Rate doesn't score 0 on deferred-only runs.
const realOutcomes = submitted + blocked + sus_new + errors;
const attempted = (rawAttempted === deferred && realOutcomes === 0) ? 0 : rawAttempted;
if (attempted !== rawAttempted) {
  console.warn(`[write-refresh-status] TD-01 guard: corrected attempted ${rawAttempted} → 0 (all were deferred)`);
}

const payload = {
  ran_at:       now.toISOString(),
  date:         now.toISOString().slice(0, 10),
  refresh_ran:  true,
  attempted,
  submitted,
  blocked,
  sus_new,
  sus_pending:  intArg(args, 'sus-pending', 0),
  errors,
  deferred,
  cls_generated: intArg(args, 'cls-generated', 0),
  cls_reused:    intArg(args, 'cls-reused',    0),
  grade_a:       intArg(args, 'grade-a',       0),
  grade_b:       intArg(args, 'grade-b',       0),
  grade_c:       intArg(args, 'grade-c',       0),
  referral_count:   intArg(args, 'referral-count',   0),
  cards_injected:   intArg(args, 'cards-injected',   0),
  workday_jobs_found: intArg(args, 'workday-jobs-found', 0),
  seed_version:  args['seed-version'] || '',
  notes:         args['notes'] || '',
  // bat_* fields preserved if bat already ran before cloud (rare edge case)
  bat_ran_at:    null,
  bat_attempted: 0, // KAIZEN-10
  bat_submitted: 0,
  bat_blocked:   0,
  bat_sus_new:   0,
  bat_errors:    0,
  bat_notes:     '',
  submitted_total: submitted, // updated by bat-merge later
};

// KAIZEN-14: submission drought detection
// Count days since most recent Applied/Submitted row in applications.md
try {
  const appsPath = join(__dirname, 'data', 'applications.md');
  const appsContent = readFileSync(appsPath, 'utf8');
  const submittedRows = [...appsContent.matchAll(/\|\s*(\d{4}-\d{2}-\d{2})\s*\|[^|]*\|[^|]*\|[^|]*\|\s*(Applied|Submitted)\s*\|/gi)];
  if (submittedRows.length > 0) {
    const lastDate = submittedRows.map(m => m[1]).sort().pop();
    const droughtDays = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
    payload.submission_drought_days = droughtDays;
    payload.last_submission_date = lastDate;
    if (droughtDays >= 5) {
      payload.submission_drought_alert = true;
      console.warn(`[write-refresh-status] ⚠ DROUGHT ALERT: ${droughtDays} days since last confirmed submission (${lastDate})`);
    }
  }
} catch { /* non-fatal — applications.md may not exist yet */ }

try {
  writeJsonAtomic(OUT_PATH, payload);
  console.log(`[write-refresh-status] written → attempted:${attempted} submitted:${submitted} deferred:${deferred}`);
} catch (e) {
  console.error('ERROR: could not write last-refresh.json:', e.message);
  process.exit(1);
}
process.exit(0);
