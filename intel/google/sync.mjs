/**
 * Sync Coordinator — thin orchestrator that wires together sheets-push and sheets-pull
 * to keep the Google Sheets tracker and applications.md in sync.
 *
 * No tests for this file — it's a thin coordinator over tested modules.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseTrackerRow, appendRow, updateStatus } from './sheets-push.mjs';
import { readSheet, detectManualEdits, reconcileRow } from './sheets-pull.mjs';

/**
 * Parse the applications.md content into an array of tracker row objects.
 *
 * @param {string} content — raw file content of applications.md
 * @returns {Array<object>}
 */
export function parseApplicationsMd(content) {
  return content
    .split('\n')
    .map(parseTrackerRow)
    .filter(Boolean);
}

/**
 * Pull edits from the Google Sheet and apply them back to applications.md.
 * Detects rows where status or notes differ from the local tracker, then
 * overwrites those lines in the markdown file.
 *
 * @param {string} sheetId
 * @param {string} applicationsMdPath — absolute path to applications.md
 * @returns {Array<object>} edits applied
 */
export async function pullEdits(sheetId, applicationsMdPath) {
  const sheetRows = readSheet(sheetId);
  const content = readFileSync(applicationsMdPath, 'utf8');
  const trackerRows = parseApplicationsMd(content);

  const edits = detectManualEdits(sheetRows, trackerRows);
  if (edits.length === 0) return edits;

  // Build a map of num -> reconciled row for quick lookup
  const editMap = new Map(edits.map(e => [e.num, e]));

  // Re-write the file, applying edits line by line
  const lines = content.split('\n');
  const updated = lines.map(line => {
    const row = parseTrackerRow(line);
    if (!row) return line;
    const edit = editMap.get(row.num);
    if (!edit) return line;
    const reconciled = reconcileRow(row, edit);
    // Rebuild the markdown table row preserving original column order
    return `| ${reconciled.num} | ${reconciled.date} | ${reconciled.company} | ${reconciled.role} | ${reconciled.score} | ${reconciled.status} | ${reconciled.pdf} | ${reconciled.report} | ${reconciled.notes ?? ''} |`;
  });

  writeFileSync(applicationsMdPath, updated.join('\n'), 'utf8');
  return edits;
}

/**
 * Push a new evaluation row to the Google Sheet.
 *
 * @param {string} sheetId
 * @param {object} row — tracker row object
 */
export function pushNewEvaluation(sheetId, row) {
  appendRow(sheetId, row);
}

/**
 * Push a status update for an existing row to the Google Sheet.
 *
 * @param {string} sheetId
 * @param {number|string} rowNumber — 1-based sheet row number
 * @param {string} status
 */
export function pushStatusUpdate(sheetId, rowNumber, status) {
  updateStatus(sheetId, rowNumber, status);
}

/**
 * Run a full sync: pull edits from the sheet into applications.md.
 * Returns a summary of what changed.
 *
 * @param {string} sheetId
 * @param {string} applicationsMdPath
 * @returns {Promise<{ editsPulled: number }>}
 */
export async function syncAll(sheetId, applicationsMdPath) {
  const edits = await pullEdits(sheetId, applicationsMdPath);
  return { editsPulled: edits.length };
}
