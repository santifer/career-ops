// @ts-check
//
// Shared applications.md column-map detection.
//
// The tracker table has an optional Location column (inserted after Role) and
// localized headers (e.g. "Empresa"/"Puesto" in the Spanish modes), so column
// positions are not fixed. Scripts must map columns by header NAME and fall
// back to the legacy fixed 9-column layout when no header row is present.
//
// merge-tracker.mjs and verify-pipeline.mjs already did this; the logic lived
// in two verbatim copies. The dedup-tracker / normalize-statuses /
// analyze-patterns / followup-cadence scripts hardcoded `parts[5]`/`parts[6]`
// instead, so they misread Score as Status (and could write a status back into
// the Score cell) whenever the Location column was enabled. Centralizing the
// detection here is the single source of truth for every tracker reader.

/** @type {Record<string, number>} */
export const LEGACY_COLMAP = { num: 1, date: 2, company: 3, role: 4, score: 5, status: 6, pdf: 7, report: 8, notes: 9 };

/** @type {Record<string, string>} */
export const HEADER_ALIASES = {
  '#': 'num', 'num': 'num', 'date': 'date', 'company': 'company', 'empresa': 'company',
  'role': 'role', 'puesto': 'role', 'location': 'location', 'score': 'score',
  'status': 'status', 'pdf': 'pdf', 'report': 'report', 'notes': 'notes',
};

/**
 * Detect tracker column indices from the markdown header row.
 *
 * Splits each table row on `|` (the leading `|` yields an empty cell at index
 * 0, so a header's `#` lands at index 1 — matching LEGACY_COLMAP). Returns the
 * first row that carries Company + Role and resolves the required columns.
 *
 * @param {string[]} lines - Lines of applications.md.
 * @returns {Record<string, number>|null} Column→index map, or null when no
 *   header row is found (caller should fall back to LEGACY_COLMAP).
 */
export function detectColumns(lines) {
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map(s => s.trim().toLowerCase());
    if (!cells.includes('company') || !cells.includes('role')) continue;
    const map = {};
    cells.forEach((c, i) => { if (HEADER_ALIASES[c] != null) map[HEADER_ALIASES[c]] = i; });
    if (['num', 'company', 'role', 'score', 'status'].every(k => map[k] != null)) return map;
  }
  return null;
}

/**
 * Resolve the column map for a tracker, falling back to the legacy layout.
 * @param {string[]} lines - Lines of applications.md.
 * @returns {Record<string, number>}
 */
export function resolveColumns(lines) {
  return detectColumns(lines) || LEGACY_COLMAP;
}

/**
 * Parse one applications.md table row into a normalized object using a column
 * map. Returns null for header/separator/malformed rows (num not an integer or
 * too few cells). The Location field is '' when the tracker has no Location
 * column.
 *
 * @param {string} line - A single line from applications.md.
 * @param {Record<string, number>} colmap - From resolveColumns().
 * @returns {{num:number,date:string,company:string,role:string,location:string,score:string,status:string,pdf:string,report:string,notes:string}|null}
 */
export function parseTrackerRow(line, colmap) {
  if (!line.startsWith('|')) return null;
  const parts = line.split('|').map(s => s.trim());
  const maxIdx = Math.max(...Object.values(colmap));
  if (parts.length <= maxIdx) return null;
  const num = parseInt(parts[colmap.num]);
  if (isNaN(num)) return null;
  return {
    num,
    date: parts[colmap.date],
    company: parts[colmap.company],
    role: parts[colmap.role],
    location: colmap.location != null ? parts[colmap.location] : '',
    score: parts[colmap.score],
    status: parts[colmap.status],
    pdf: parts[colmap.pdf],
    report: parts[colmap.report],
    notes: colmap.notes != null ? (parts[colmap.notes] || '') : '',
  };
}
