/**
 * merge-core.mjs — Pure helpers for merge-tracker.mjs.
 *
 * Extracted verbatim so the TSV-parsing logic (including the column-order
 * heuristic, which is easy to break) can be unit-tested in isolation.
 * No filesystem / process access here.
 *
 * NOTE: merge-tracker has historically used its own variants of normalizeCompany
 * / role matching that differ from lib/tracker-core.mjs (e.g. it strips ALL
 * non-alphanumerics including spaces). Those differences are preserved here on
 * purpose — this module documents and tests the behavior that already ships.
 */

import { parseScore } from './tracker-core.mjs';

export { parseScore };

// Canonical states accepted by the merge step.
export const CANONICAL_STATES = [
  'Evaluada', 'Aplicado', 'Respondido', 'Entrevista',
  'Oferta', 'Rechazado', 'Descartado', 'NO APLICAR',
];

/**
 * Coerce an incoming status into a canonical state.
 * Unknown statuses default to 'Evaluada' (and the caller logs a warning).
 * Note: 'monitor' maps to 'NO APLICAR' here (merge semantics), which differs
 * from normalize-statuses' 'Evaluada' — preserved as-is.
 */
export function validateStatus(status) {
  const clean = status.replace(/\*\*/g, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  const lower = clean.toLowerCase();

  for (const valid of CANONICAL_STATES) {
    if (valid.toLowerCase() === lower) return valid;
  }

  const aliases = {
    'enviada': 'Aplicado', 'aplicada': 'Aplicado', 'applied': 'Aplicado', 'sent': 'Aplicado',
    'cerrada': 'Descartado', 'descartada': 'Descartado', 'cancelada': 'Descartado',
    'rechazada': 'Rechazado',
    'no aplicar': 'NO APLICAR', 'no_aplicar': 'NO APLICAR', 'skip': 'NO APLICAR', 'monitor': 'NO APLICAR',
    'condicional': 'Evaluada', 'hold': 'Evaluada', 'evaluar': 'Evaluada', 'verificar': 'Evaluada',
    'geo blocker': 'NO APLICAR',
  };

  if (aliases[lower]) return aliases[lower];

  // DUPLICADO/Repost → Descartado
  if (/^(duplicado|dup|repost)/i.test(lower)) return 'Descartado';

  console.warn(`⚠️  Non-canonical status "${status}" → defaulting to "Evaluada"`);
  return 'Evaluada';
}

/**
 * Merge-step company key: strips ALL non-alphanumerics (including spaces).
 */
export function normalizeCompany(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Fuzzy role match on raw (non-normalized) words; true on >= 2 shared len>3 words.
 */
export function roleFuzzyMatch(a, b) {
  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  return overlap.length >= 2;
}

/**
 * Pull a report number out of a "[123]" reference. Returns null when absent.
 */
export function extractReportNum(reportStr) {
  const m = reportStr.match(/\[(\d+)\]/);
  return m ? parseInt(m[1]) : null;
}

/**
 * Parse a pipe-delimited applications.md row. Rejects num 0 / NaN.
 */
export function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1]);
  if (isNaN(num) || num === 0) return null;
  return {
    num, date: parts[2], company: parts[3], role: parts[4],
    score: parts[5], status: parts[6], pdf: parts[7], report: parts[8],
    notes: parts[9] || '', raw: line,
  };
}

/**
 * Parse a tracker-addition file into a structured addition object.
 * Handles 9-col TSV, 8-col TSV, and pipe-delimited markdown rows, including
 * the (status, score) vs (score, status) column-order ambiguity.
 * Returns null for empty / malformed / numberless input.
 */
export function parseTsvContent(content, filename) {
  content = content.trim();
  if (!content) return null;

  let parts;
  let addition;

  // Detect pipe-delimited (markdown table row)
  if (content.startsWith('|')) {
    parts = content.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length < 8) {
      console.warn(`⚠️  Skipping malformed pipe-delimited ${filename}: ${parts.length} fields`);
      return null;
    }
    // Format: num | date | company | role | score | status | pdf | report | notes
    addition = {
      num: parseInt(parts[0]),
      date: parts[1],
      company: parts[2],
      role: parts[3],
      score: parts[4],
      status: validateStatus(parts[5]),
      pdf: parts[6],
      report: parts[7],
      notes: parts[8] || '',
    };
  } else {
    // Tab-separated
    parts = content.split('\t');
    if (parts.length < 8) {
      console.warn(`⚠️  Skipping malformed TSV ${filename}: ${parts.length} fields`);
      return null;
    }

    // Detect column order: some TSVs have (status, score), others have (score, status)
    // Heuristic: if col4 looks like a score and col5 looks like a status, they're swapped
    const col4 = parts[4].trim();
    const col5 = parts[5].trim();
    const col4LooksLikeScore = /^\d+\.?\d*\/5$/.test(col4) || col4 === 'N/A' || col4 === 'DUP';
    const col5LooksLikeScore = /^\d+\.?\d*\/5$/.test(col5) || col5 === 'N/A' || col5 === 'DUP';
    const col4LooksLikeStatus = /^(evaluada|aplicado|respondido|entrevista|oferta|rechazado|descartado|no aplicar|cerrada|duplicado|repost|condicional|hold|monitor)/i.test(col4);
    const col5LooksLikeStatus = /^(evaluada|aplicado|respondido|entrevista|oferta|rechazado|descartado|no aplicar|cerrada|duplicado|repost|condicional|hold|monitor)/i.test(col5);

    let statusCol, scoreCol;
    if (col4LooksLikeStatus && !col4LooksLikeScore) {
      // Standard format: col4=status, col5=score
      statusCol = col4; scoreCol = col5;
    } else if (col4LooksLikeScore && col5LooksLikeStatus) {
      // Swapped format: col4=score, col5=status
      statusCol = col5; scoreCol = col4;
    } else if (col5LooksLikeScore && !col4LooksLikeScore) {
      // col5 is definitely score → col4 must be status
      statusCol = col4; scoreCol = col5;
    } else {
      // Default: standard format (status before score)
      statusCol = col4; scoreCol = col5;
    }

    addition = {
      num: parseInt(parts[0]),
      date: parts[1],
      company: parts[2],
      role: parts[3],
      status: validateStatus(statusCol),
      score: scoreCol,
      pdf: parts[6],
      report: parts[7],
      notes: parts[8] || '',
    };
  }

  if (isNaN(addition.num) || addition.num === 0) {
    console.warn(`⚠️  Skipping ${filename}: invalid entry number`);
    return null;
  }

  return addition;
}
