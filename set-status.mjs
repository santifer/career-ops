#!/usr/bin/env node
/**
 * set-status.mjs - canonical status updater for data/applications.md (#1428).
 *
 * Usage:
 *   node set-status.mjs <report#|tracker#|company> <CanonicalState> [--note "..."] [--dry-run]
 *
 * The tracker is the source of truth, so this script updates the markdown table
 * directly while preserving its current column layout. It refuses ambiguous
 * matches, validates statuses against templates/states.yml, and writes
 * atomically after creating an applications.md.bak backup.
 */

import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';
import { roleFuzzyMatch } from './role-matcher.mjs';
import { rebuildRow } from './tracker-utils.mjs';
import { parseTrackerRow, resolveColumns } from './tracker-parse.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TRACKER_PATH = process.env.CAREER_OPS_TRACKER
  ? process.env.CAREER_OPS_TRACKER
  : existsSync(join(ROOT, 'data/applications.md'))
    ? join(ROOT, 'data/applications.md')
    : join(ROOT, 'applications.md');
const STATES_PATH = existsSync(join(ROOT, 'templates/states.yml'))
  ? join(ROOT, 'templates/states.yml')
  : join(ROOT, 'states.yml');

/**
 * Normalize a report/tracker number so "007" and "7" compare equal.
 *
 * @param {string|number|null|undefined} value - Raw numeric identifier.
 * @returns {string} Normalized numeric string.
 */
function normNum(value) {
  return String(value ?? '').trim().replace(/^0+(?=\d)/, '');
}

/**
 * Normalize free text for loose company and role matching.
 *
 * @param {string} value - Raw company, role, or query text.
 * @returns {string} Lowercase alphanumeric text with collapsed spaces.
 */
function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the report number from a markdown report link cell.
 *
 * @param {string} reportCell - Raw Report column cell.
 * @returns {string|null} Normalized report number, or null.
 */
function extractReportNum(reportCell) {
  const match = String(reportCell ?? '').match(/\[(\d+)\]/);
  return match ? normNum(match[1]) : null;
}

/**
 * Sanitize a note before placing it in a markdown table cell.
 *
 * Existing tracker parsers split rows on raw pipe characters, so notes must not
 * introduce newlines or pipes that would shift later columns.
 *
 * @param {string} note - Raw note from CLI args.
 * @returns {string} Single-line table-safe note.
 */
function sanitizeNote(note) {
  return String(note ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Load canonical status labels from templates/states.yml.
 *
 * The command accepts canonical labels and IDs case-insensitively, but always
 * writes the canonical label. Legacy aliases are deliberately not accepted so
 * this remains a canonical write path.
 *
 * @param {string} statesPath - Path to templates/states.yml.
 * @returns {Map<string,string>} Lowercase label/id -> canonical label.
 */
export function loadCanonicalStatuses(statesPath = STATES_PATH) {
  if (!existsSync(statesPath)) {
    throw new Error(`${statesPath} not found - cannot validate statuses.`);
  }
  const doc = yaml.load(readFileSync(statesPath, 'utf-8'));
  const map = new Map();
  for (const state of doc?.states || []) {
    if (!state?.label) continue;
    map.set(String(state.label).toLowerCase(), state.label);
    if (state.id) map.set(String(state.id).toLowerCase(), state.label);
  }
  return map;
}

/**
 * Parse applications.md into rows with line indexes attached.
 *
 * @param {string} text - Full tracker markdown.
 * @returns {{lines:string[], colmap:object, rows:Array<object>}}
 */
export function parseTracker(text) {
  const lines = String(text ?? '').split('\n');
  const colmap = resolveColumns(lines);
  const rows = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const row = parseTrackerRow(lines[lineIndex], colmap);
    if (!row) continue;
    rows.push({
      ...row,
      reportNum: extractReportNum(row.report),
      lineIndex,
    });
  }
  return { lines, colmap, rows };
}

/**
 * Find tracker rows matching a report number, tracker number, company, or role.
 *
 * @param {Array<object>} rows - Parsed tracker rows.
 * @param {string} query - User query.
 * @returns {Array<object>} Matching rows.
 */
export function findRows(rows, query) {
  const raw = String(query ?? '').trim();
  if (!raw) return [];

  if (/^\d+$/.test(raw)) {
    const wanted = normNum(raw);
    return rows.filter((row) =>
      normNum(row.num) === wanted || row.reportNum === wanted);
  }

  const normalizedQuery = normalizeText(raw);
  return rows.filter((row) => {
    const company = normalizeText(row.company);
    const role = normalizeText(row.role);
    return company.includes(normalizedQuery) ||
      role.includes(normalizedQuery) ||
      roleFuzzyMatch(row.company, raw) ||
      roleFuzzyMatch(row.role, raw);
  });
}

/**
 * Append a note without losing existing tracker context.
 *
 * @param {string} existing - Current Notes cell.
 * @param {string} note - Sanitized note to append.
 * @returns {string} Updated notes cell.
 */
export function appendNote(existing, note) {
  if (!note) return existing;
  const current = String(existing ?? '').trim();
  if (!current || current === '\u2014' || current === '-') return note;
  if (current.includes(note)) return current;
  const separator = /[.!?)]$/.test(current) ? ' ' : '. ';
  return `${current}${separator}${note}`;
}

/**
 * Replace the matched row's status and optional note.
 *
 * @param {string} text - Current tracker markdown.
 * @param {string} query - Report/tracker number or company fragment.
 * @param {string} status - Canonical status label/id.
 * @param {string} [note=''] - Optional note.
 * @param {Map<string,string>} [statusMap] - From loadCanonicalStatuses().
 * @returns {{changed:boolean, lines:string[], row:object, status:string, oldStatus:string, oldNotes:string, notes:string}}
 */
export function updateTrackerStatus(text, query, status, note = '', statusMap = loadCanonicalStatuses()) {
  const canonicalStatus = statusMap.get(String(status ?? '').trim().toLowerCase());
  if (!canonicalStatus) {
    const allowed = [...new Set(statusMap.values())].join(', ');
    throw new Error(`Invalid status "${status}". Use one of: ${allowed}`);
  }

  const parsed = parseTracker(text);
  const matches = findRows(parsed.rows, query);
  if (matches.length === 0) {
    throw new Error(`No tracker row matches "${query}".`);
  }
  if (matches.length > 1) {
    const summary = matches
      .map((row) => `#${row.num}${row.reportNum ? ` / report ${row.reportNum}` : ''}: ${row.company} - ${row.role}`)
      .join('\n');
    throw new Error(`Ambiguous query "${query}" matched ${matches.length} rows:\n${summary}`);
  }

  const row = matches[0];
  const parts = parsed.lines[row.lineIndex].split('|').map((cell) => cell.trim());
  const oldStatus = parts[parsed.colmap.status] ?? '';
  const oldNotes = parsed.colmap.notes != null ? (parts[parsed.colmap.notes] ?? '') : '';
  const cleanNote = sanitizeNote(note);
  const notes = parsed.colmap.notes != null ? appendNote(oldNotes, cleanNote) : oldNotes;

  parts[parsed.colmap.status] = canonicalStatus;
  if (cleanNote && parsed.colmap.notes == null) {
    throw new Error('Tracker has no Notes column, so --note cannot be applied.');
  }
  if (parsed.colmap.notes != null) parts[parsed.colmap.notes] = notes;

  const newLine = rebuildRow(parts);
  const changed = newLine !== parsed.lines[row.lineIndex];
  parsed.lines[row.lineIndex] = newLine;
  return { changed, lines: parsed.lines, row, status: canonicalStatus, oldStatus, oldNotes, notes };
}

/**
 * Atomically write a text file, cleaning up a temp file on failure.
 *
 * @param {string} filePath - Target path.
 * @param {string} content - New file contents.
 * @returns {void}
 */
function atomicWriteFile(filePath, content) {
  const tmpPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, filePath);
  } catch (err) {
    rmSync(tmpPath, { force: true });
    throw err;
  }
}

/**
 * Parse command-line args.
 *
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{help:boolean,dryRun:boolean,json:boolean,query:string,status:string,note:string}}
 */
function parseArgs(argv) {
  const args = [...argv];
  const parsed = { help: false, dryRun: false, json: false, query: '', status: '', note: '' };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--note') {
      if (i + 1 >= args.length) throw new Error('--note requires a value.');
      parsed.note = args[++i];
    } else if (arg.startsWith('--note=')) {
      parsed.note = arg.slice('--note='.length);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  parsed.query = positional[0] ?? '';
  parsed.status = positional.slice(1).join(' ').trim();
  return parsed;
}

function printUsage() {
  console.log(`Usage: node set-status.mjs <report#|tracker#|company> <CanonicalState> [--note "..."] [--dry-run] [--json]

Examples:
  node set-status.mjs 371 Rejected --note "Rejected after R1; feedback captured"
  node set-status.mjs "Acme" Applied --dry-run

Statuses come from templates/states.yml and are written as canonical labels.`);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.query || !args.status) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!existsSync(TRACKER_PATH)) {
    console.error(`Error: ${TRACKER_PATH} not found - nothing to update.`);
    process.exitCode = 1;
    return;
  }

  try {
    const text = readFileSync(TRACKER_PATH, 'utf-8');
    const result = updateTrackerStatus(text, args.query, args.status, args.note);
    if (args.json) {
      console.log(JSON.stringify({
        changed: result.changed,
        trackerPath: resolve(TRACKER_PATH),
        row: {
          num: result.row.num,
          reportNum: result.row.reportNum,
          company: result.row.company,
          role: result.row.role,
        },
        oldStatus: result.oldStatus,
        status: result.status,
        notes: result.notes,
        dryRun: args.dryRun,
      }, null, 2));
    } else {
      console.log(`#${result.row.num}: ${result.row.company} - ${result.row.role}`);
      console.log(`Status: ${result.oldStatus || '-'} -> ${result.status}`);
      if (args.note) console.log(`Note: ${result.notes}`);
      if (!result.changed) console.log('No changes needed.');
    }

    if (!args.dryRun && result.changed) {
      copyFileSync(TRACKER_PATH, `${TRACKER_PATH}.bak`);
      atomicWriteFile(TRACKER_PATH, result.lines.join('\n'));
      if (!args.json) console.log(`Written to ${TRACKER_PATH} (backup: ${TRACKER_PATH}.bak)`);
    } else if (args.dryRun && !args.json) {
      console.log('(dry-run - no changes written)');
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
