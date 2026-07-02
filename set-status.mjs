#!/usr/bin/env node

/**
 * set-status.mjs — canonical CLI to update a tracker row's status/note (#1428).
 *
 * data/applications.md is a shared surface with multiple readers and writers.
 * One canonical write path is safer than N agents hand-editing markdown, so
 * modes (apply Step 9, followup, batch) call this instead of editing the table.
 *
 * Usage:
 *   node set-status.mjs <report#|company> <state> [--note "..."] [--role "..."] [--dry-run] [--json]
 *
 * Row resolution:
 *   - numeric argument → exact match on the # column
 *   - otherwise → company match (normalized, same key as merge-tracker dedup);
 *     multiple hits are narrowed with --role (fuzzy, role-matcher.mjs), and
 *     anything still ambiguous fails with a numbered candidate list.
 *
 * State validation is strict against templates/states.yml (labels, ids, and
 * aliases resolve to the canonical label; anything else is rejected before the
 * tracker is touched). --note appends to the Notes cell with "; " and is
 * idempotent — re-running the same command is always safe.
 *
 * The read-modify-write runs under the shared tracker lock (tracker-utils.mjs,
 * same lock as merge-tracker.mjs) and the file is replaced atomically. Only the
 * Status and Notes cells of the matched row change; every other byte of the
 * tracker round-trips untouched.
 *
 * Exit codes: 0 success (including no-op re-runs) · 1 usage error or
 * non-canonical state · 2 row not found · 3 ambiguous company match.
 *
 * When the new status is Applied, the JSON output carries
 * `"followupSeedCandidate": true` — the hook point for seeding
 * data/follow-ups.md with the default cadence (#1430, not implemented here).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveColumns, parseTrackerRow } from './tracker-parse.mjs';
import { roleFuzzyMatch } from './role-matcher.mjs';
import {
  rebuildRow, resolveTrackerPath, trackerLockDirFor, acquireTrackerLock,
  writeFileAtomic, loadCanonicalStates, resolveCanonicalState,
} from './tracker-utils.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const STATES_FILE = join(CAREER_OPS, 'templates/states.yml');

const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_NOT_FOUND = 2;
const EXIT_AMBIGUOUS = 3;

const USAGE = `Usage: node set-status.mjs <report#|company> <state> [--note "..."] [--role "..."] [--dry-run] [--json]

  <report#|company>  Row selector: tracker # (exact) or company name (normalized match)
  <state>            Canonical state from templates/states.yml (aliases accepted)
  --note "..."       Append to the Notes cell ("; "-separated, idempotent)
  --role "..."       Disambiguate when several rows share the company (fuzzy match)
  --dry-run          Resolve and validate, but write nothing
  --json             Machine-readable output on stdout (errors included)`;

// ── argument parsing ─────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const positional = [];
const flags = { note: null, role: null, dryRun: false, json: false };

for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--note') { flags.note = rawArgs[++i] ?? ''; }
  else if (a === '--role') { flags.role = rawArgs[++i] ?? ''; }
  else if (a === '--dry-run') { flags.dryRun = true; }
  else if (a === '--json') { flags.json = true; }
  else if (a.startsWith('--')) { failUsage(`Unknown flag: ${a}`); }
  else { positional.push(a); }
}

if (positional.length !== 2) {
  failUsage(positional.length === 0 ? null : `Expected 2 arguments (selector, state), got ${positional.length}`);
}

const [selector, stateInput] = positional;

/**
 * Emit a structured error and exit.
 *
 * With --json the error object goes to stdout so callers parse one stream; the
 * human-readable message always goes to stderr.
 *
 * @param {number} exitCode - Process exit code (see EXIT_* contract above).
 * @param {string} code - Stable machine-readable error code.
 * @param {string} message - Human-readable explanation.
 * @param {object} [extra] - Extra JSON fields (e.g. candidates).
 * @returns {never}
 */
function failWith(exitCode, code, message, extra = {}) {
  if (flags?.json) {
    console.log(JSON.stringify({ error: message, code, ...extra }));
  }
  console.error(`❌ ${message}`);
  process.exit(exitCode);
}

/**
 * Print usage (plus an optional specific complaint) and exit 1.
 *
 * @param {string|null} message - What was wrong with the invocation, if known.
 * @returns {never}
 */
function failUsage(message) {
  if (message) console.error(`❌ ${message}\n`);
  console.error(USAGE);
  process.exit(EXIT_USAGE);
}

// ── state validation (before anything touches the tracker) ──────

const states = loadCanonicalStates(STATES_FILE);
const newStatus = resolveCanonicalState(stateInput, states);
if (!newStatus) {
  const valid = states.map(s => s.label).join(' · ');
  failWith(EXIT_USAGE, 'invalid-state', `"${stateInput}" is not a canonical state. Valid states: ${valid}`);
}

// ── tracker access ───────────────────────────────────────────────

const APPS_FILE = resolveTrackerPath(CAREER_OPS);
if (!existsSync(APPS_FILE)) {
  failWith(EXIT_NOT_FOUND, 'no-tracker', `No tracker found at ${APPS_FILE}`);
}

/**
 * Normalize company names to the same key merge-tracker uses for dedup, so
 * "set-status globex" finds the row merge-tracker would treat as Globex.
 *
 * @param {string} name - Company name from the CLI or a tracker row.
 * @returns {string} Lowercase alphanumeric company key.
 */
function normalizeCompany(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Neutralize characters that would corrupt the markdown table. Same rule as
 * merge-tracker: rows are read with a raw split('|'), so a literal pipe or
 * newline in a note would shift every later column.
 *
 * @param {string} v - Free-text value headed for a table cell.
 * @returns {string} Table-safe value.
 */
function cell(v) {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\s*\|\s*/g, ' / ').trim();
}

/**
 * Find the tracker row matching the CLI selector.
 *
 * @param {object[]} rows - Parsed data rows (parseTrackerRow output + lineIdx).
 * @returns {object} The single matched row. Exits the process on 0 or 2+ matches.
 */
function resolveRow(rows) {
  if (/^\d+$/.test(selector)) {
    const num = parseInt(selector, 10);
    const row = rows.find(r => r.num === num);
    if (!row) {
      failWith(EXIT_NOT_FOUND, 'not-found', `No tracker row with #${num}`);
    }
    return row;
  }

  const key = normalizeCompany(selector);
  if (!key) failUsage(`Selector "${selector}" is empty after normalization`);
  let matches = rows.filter(r => normalizeCompany(r.company) === key);

  if (matches.length === 0) {
    failWith(EXIT_NOT_FOUND, 'not-found', `No tracker row with company matching "${selector}"`);
  }
  if (matches.length > 1 && flags.role) {
    const narrowed = matches.filter(r => roleFuzzyMatch(r.role, flags.role));
    if (narrowed.length === 1) return narrowed[0];
    // Fall through with the original list so the candidates stay visible.
  }
  if (matches.length > 1) {
    const candidates = matches.map(r => ({ num: r.num, company: r.company, role: r.role }));
    const listing = candidates.map(c => `#${c.num}\t${c.company}\t${c.role}`).join('\n');
    if (flags.json) {
      console.log(JSON.stringify({ error: `Company "${selector}" matches ${matches.length} rows`, code: 'ambiguous', candidates }));
    }
    console.error(`❌ Company "${selector}" matches ${matches.length} rows — pass the # or narrow with --role:\n${listing}`);
    process.exit(EXIT_AMBIGUOUS);
  }
  return matches[0];
}

// ── locked read-modify-write ─────────────────────────────────────

const lock = await acquireTrackerLock(trackerLockDirFor(APPS_FILE), { tracker: APPS_FILE });
process.once('exit', () => lock.release());

const content = readFileSync(APPS_FILE, 'utf-8');
const lines = content.split('\n');
const colmap = resolveColumns(lines);

const rows = [];
for (let i = 0; i < lines.length; i++) {
  const row = parseTrackerRow(lines[i], colmap);
  if (row) rows.push({ ...row, lineIdx: i });
}
if (rows.length === 0) {
  failWith(EXIT_NOT_FOUND, 'empty-tracker', `Tracker at ${APPS_FILE} has no data rows`);
}

const target = resolveRow(rows);
const oldStatus = target.status;
const note = flags.note != null ? cell(flags.note) : null;

// Rebuild only the matched line: change the Status cell, append the note, keep
// every other cell exactly as parsed.
const parts = lines[target.lineIdx].split('|').map(s => s.trim());
while (parts.length <= Math.max(colmap.status, colmap.notes ?? 0)) parts.push('');

const statusChanged = parts[colmap.status] !== newStatus;
parts[colmap.status] = newStatus;

let noteChanged = false;
if (note) {
  if (colmap.notes == null) {
    failWith(EXIT_USAGE, 'no-notes-column', 'Tracker has no Notes column — cannot apply --note');
  }
  const existing = parts[colmap.notes] ?? '';
  const hasNote = existing.split(';').map(s => s.trim()).includes(note);
  if (!hasNote) {
    parts[colmap.notes] = existing && existing !== '—' && existing !== '-' ? `${existing}; ${note}` : note;
    noteChanged = true;
  }
}

const changed = statusChanged || noteChanged;

if (changed && !flags.dryRun) {
  lines[target.lineIdx] = rebuildRow(parts);
  writeFileAtomic(APPS_FILE, lines.join('\n'));
}
lock.release();

// ── report ───────────────────────────────────────────────────────

const result = {
  changed,
  num: target.num,
  company: target.company,
  role: target.role,
  oldStatus,
  newStatus,
  ...(note != null ? { note } : {}),
  ...(flags.dryRun ? { dryRun: true } : {}),
  ...(newStatus === 'Applied' ? { followupSeedCandidate: true } : {}),
  tracker: APPS_FILE,
};

if (flags.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const verb = flags.dryRun ? 'would set' : changed ? 'set' : 'already';
  console.log(`✅ #${target.num} ${target.company} — ${target.role}: ${verb} ${oldStatus} → ${newStatus}${note ? ` (note: ${note})` : ''}`);
  if (newStatus === 'Applied') {
    console.error('ℹ️  Status is Applied — consider seeding follow-ups in data/follow-ups.md (#1430: node followup-cadence.mjs)');
  }
}
process.exit(EXIT_OK);
