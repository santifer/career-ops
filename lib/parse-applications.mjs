// lib/parse-applications.mjs — single source of truth for the
// applications.md table parser. Imported by both build-dashboard.mjs
// (build-time HTML generator) and dashboard-server.mjs (live API).
//
// Returns an array of row objects:
//   { num, date, company, role, score, status, pdf, reportPath, notes }
//
// Permissive: accepts any pipe-table data row (whitespace padding,
// non-numeric # column, etc.) so neither consumer silently skips rows.
// Rejects only the separator (|---|) and header (| # | Date | …).

import { readFileSync, existsSync } from 'fs';

const HEADER_RE     = /\|\s*#\s*\|/;
const SEPARATOR_RE  = /^[\|\s\-:]+$/;

export function parseApplicationsText(text) {
  if (!text) return [];
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (SEPARATOR_RE.test(line)) continue;
    if (HEADER_RE.test(line))    continue;

    const cells = line.split('|').map(c => c.trim());
    // cells: ['', '#', 'date', 'company', 'role', 'score', 'status', 'pdf', 'report', 'notes', '']
    const numStr     = cells[1] || '';
    const date       = cells[2] || '';
    const company    = cells[3] || '';
    const role       = cells[4] || '';
    const scoreStr   = cells[5] || '';
    const status     = cells[6] || '';
    const pdf        = cells[7] || '';
    const reportCell = cells[8] || '';
    const notes      = cells[9] || '';

    if (!company) continue; // a data row must at least have a company

    const numMatch    = numStr.match(/(\d+)/);
    const num         = numMatch ? parseInt(numMatch[1], 10) : 0;
    const scoreMatch  = scoreStr.match(/(\d+(?:\.\d+)?)/);
    const score       = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    const reportMatch = reportCell.match(/\(([^)]+)\)/);
    const reportPath  = reportMatch ? reportMatch[1] : '';

    rows.push({ num, date, company, role, score, status, pdf, reportPath, notes });
  }
  return rows;
}

export function parseApplicationsFile(path) {
  if (!existsSync(path)) return [];
  return parseApplicationsText(readFileSync(path, 'utf8'));
}
