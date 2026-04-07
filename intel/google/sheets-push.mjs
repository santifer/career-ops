/**
 * Google Sheets push module — append and update rows in the applications tracker.
 *
 * Uses the `gws` CLI via execFileSync. Pure functions are exported for testing.
 */

import { execFileSync } from 'node:child_process';

// Matches header rows like "| # | Date | Company | ..."
const HEADER_RE = /^\|\s*#\s*\|/;
// Matches separator rows like "|---|---| ..." including alignment markers
const SEPARATOR_RE = /^\|[\s\-:|]+\|$/;

/**
 * Parse a single line from applications.md into a structured row object.
 * Returns null for header rows, separator rows, and empty/non-table lines.
 *
 * @param {string} line
 * @returns {{ num, date, company, role, score, status, pdf, report, notes } | null}
 */
export function parseTrackerRow(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('|')) return null;
  if (HEADER_RE.test(trimmed)) return null;
  if (SEPARATOR_RE.test(trimmed)) return null;

  const parts = trimmed
    .split('|')
    .map(s => s.trim())
    .filter(s => s !== '');

  if (parts.length < 9) return null;

  const [num, date, company, role, score, status, pdf, report, ...rest] = parts;
  return {
    num,
    date,
    company,
    role,
    score,
    status,
    pdf,
    report,
    notes: rest.join('|').trim(),
  };
}

/**
 * Build gws CLI args for appending a row to a spreadsheet.
 *
 * @param {string} sheetId
 * @param {{ num, date, company, role, score, status, pdf, report, notes }} row
 * @returns {string[]}
 */
export function buildAppendArgs(sheetId, row) {
  const values = [
    row.num,
    row.date,
    row.company,
    row.role,
    row.score,
    row.status,
    row.pdf,
    row.report,
    row.notes,
  ].join(',');

  return [
    'sheets',
    '+append',
    '--spreadsheet', sheetId,
    '--range', 'A:I',
    '--values', values,
  ];
}

/**
 * Build gws CLI args for updating a cell range in a spreadsheet.
 *
 * @param {string} sheetId
 * @param {string} range  — e.g. 'F5'
 * @param {string} updates — the value(s) to write
 * @returns {string[]}
 */
export function buildUpdateArgs(sheetId, range, updates) {
  return [
    'sheets',
    '+update',
    '--spreadsheet', sheetId,
    '--range', range,
    '--values', updates,
  ];
}

/**
 * Append a parsed tracker row to the spreadsheet.
 *
 * @param {string} sheetId
 * @param {{ num, date, company, role, score, status, pdf, report, notes }} row
 * @returns {string} stdout from gws
 */
export function appendRow(sheetId, row) {
  const args = buildAppendArgs(sheetId, row);
  return execFileSync('gws', args, { encoding: 'utf8' });
}

/**
 * Update the status column (F) for a specific row number.
 *
 * @param {string} sheetId
 * @param {number} rowNumber — 1-based row index in the sheet
 * @param {string} status
 * @returns {string} stdout from gws
 */
export function updateStatus(sheetId, rowNumber, status) {
  const range = `F${rowNumber}`;
  const args = buildUpdateArgs(sheetId, range, status);
  return execFileSync('gws', args, { encoding: 'utf8' });
}
