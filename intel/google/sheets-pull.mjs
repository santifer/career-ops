/**
 * Sheets Pull — reads a Google Sheets tracker and detects manual edits.
 * Pure functions are exported separately for testability.
 */

import { execFileSync } from 'node:child_process';

/**
 * Parse a row of sheet cells into a structured tracker row object.
 * Expects 8 or 9 cells; returns null if fewer than 8.
 *
 * @param {string[]|null|undefined} cells
 * @returns {{ num, date, company, role, score, status, pdf, report, notes }|null}
 */
export function parseSheetRow(cells) {
  if (!cells || cells.length < 8) return null;
  const [num, date, company, role, score, status, pdf, report, notes] = cells;
  return { num, date, company, role, score, status, pdf, report, notes };
}

/**
 * Detect rows in the sheet that have been manually edited versus the local tracker.
 * Compares by `num` field; flags differences in status or notes.
 *
 * @param {Array<{num: string, status: string, notes: string}>} sheetRows
 * @param {Array<{num: string, status: string, notes: string}>} trackerRows
 * @returns {Array<{num: string, newStatus: string, newNotes: string}>}
 */
export function detectManualEdits(sheetRows, trackerRows) {
  const trackerMap = new Map(trackerRows.map(r => [r.num, r]));
  const edits = [];

  for (const sheetRow of sheetRows) {
    const trackerRow = trackerMap.get(sheetRow.num);
    if (!trackerRow) continue; // No matching tracker entry — skip

    if (sheetRow.status !== trackerRow.status || sheetRow.notes !== trackerRow.notes) {
      edits.push({
        num: sheetRow.num,
        newStatus: sheetRow.status,
        newNotes: sheetRow.notes,
      });
    }
  }

  return edits;
}

/**
 * Merge an edit into a tracker row, applying status/notes overrides.
 * Falls back to trackerRow values when edit fields are undefined (using ??).
 *
 * @param {object} trackerRow
 * @param {{ num: string, newStatus?: string, newNotes?: string }} edit
 * @returns {object}
 */
export function reconcileRow(trackerRow, edit) {
  return {
    ...trackerRow,
    status: edit.newStatus ?? trackerRow.status,
    notes: edit.newNotes ?? trackerRow.notes,
  };
}

/**
 * Read a Google Sheet and return parsed rows.
 * Calls the `gws sheets +read` CLI command.
 *
 * @param {string} sheetId
 * @returns {Array<ReturnType<parseSheetRow>>}
 */
export function readSheet(sheetId) {
  try {
    const raw = execFileSync(
      'gws',
      ['sheets', '+read', '--spreadsheet', sheetId, '--range', 'A:I', '--format', 'json'],
      { encoding: 'utf8' }
    );
    const rows = JSON.parse(raw);
    return rows
      .slice(1) // Skip header row
      .map(parseSheetRow)
      .filter(Boolean);
  } catch {
    return [];
  }
}
