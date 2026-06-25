/**
 * tracker-utils.mjs — shared helpers for rewriting `data/applications.md` rows.
 *
 * The tracker is a markdown table that several scripts mutate in place
 * (`dedup-tracker.mjs`, `normalize-statuses.mjs`). Keeping the row-rewrite logic
 * here means a fix lands once instead of drifting between copies.
 */

/**
 * Rebuild a markdown table row from the cells produced by `line.split('|')`.
 *
 * `split('|')` yields a leading empty element (before the opening `|`) and,
 * when the row ends with a trailing `|`, a trailing empty element too. A naive
 * `slice(1, -1)` assumes that trailing empty always exists — but a row written
 * without a trailing pipe (`| 5 | … | note`, still a valid row) keeps its real
 * last cell (the notes) at the end, so `slice(1, -1)` silently drops it. Here we
 * drop the leading empty and only drop a trailing element when it is genuinely
 * empty, preserving every real cell regardless of trailing-pipe style (and
 * tolerating extra columns like a custom Location).
 *
 * @param {string[]} parts - Trimmed cells from `line.split('|').map(s => s.trim())`.
 * @returns {string} The rebuilt `| a | b | … |` row.
 */
export function rebuildRow(parts) {
  const cells = parts.slice(1);
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return '| ' + cells.join(' | ') + ' |';
}
