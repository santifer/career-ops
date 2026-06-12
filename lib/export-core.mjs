/**
 * export-core.mjs — Pure serialization helpers for the tracker exporter.
 *
 * Turns parsed application rows (see parseAppLine in tracker-core.mjs) into
 * CSV or JSON. No filesystem / process access here.
 */

// Column order for tabular exports, matching applications.md.
export const EXPORT_FIELDS = [
  'num', 'date', 'company', 'role', 'score', 'status', 'pdf', 'report', 'notes',
];

// Friendly CSV header labels.
const HEADER_LABELS = {
  num: '#', date: 'Date', company: 'Company', role: 'Role', score: 'Score',
  status: 'Status', pdf: 'PDF', report: 'Report', notes: 'Notes',
};

/**
 * Escape a single CSV field per RFC 4180: wrap in quotes when it contains a
 * comma, quote, or newline; double any embedded quotes.
 */
export function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Serialize parsed application rows to a CSV string (with header row).
 * Uses CRLF line endings, as Excel expects.
 */
export function toCsv(rows) {
  const header = EXPORT_FIELDS.map(f => csvEscape(HEADER_LABELS[f]));
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(EXPORT_FIELDS.map(f => csvEscape(row[f])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Serialize parsed application rows to pretty-printed JSON.
 * Drops the internal `raw` field; keeps only the export columns.
 */
export function toJson(rows) {
  const clean = rows.map(row => {
    const out = {};
    for (const f of EXPORT_FIELDS) out[f] = row[f] ?? '';
    return out;
  });
  return JSON.stringify(clean, null, 2) + '\n';
}
