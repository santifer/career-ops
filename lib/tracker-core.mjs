/**
 * tracker-core.mjs — Pure, side-effect-free helpers shared by the tracker scripts.
 *
 * These functions contain the core parsing/normalization logic used by
 * normalize-statuses.mjs, dedup-tracker.mjs, merge-tracker.mjs and
 * verify-pipeline.mjs. They are extracted here so they can be imported by
 * those scripts AND unit-tested in isolation (see test/tracker-core.test.mjs).
 *
 * Nothing in this module touches the filesystem, the network, or process state.
 */

// Canonical pipeline states (per templates/states.yml).
export const CANONICAL_STATUSES = [
  'Evaluada', 'Aplicado', 'Respondido', 'Entrevista',
  'Oferta', 'Rechazado', 'Descartado', 'NO APLICAR',
];

// Status advancement order (higher = more advanced in pipeline).
// Aplicado > Rechazado because an active application beats a terminal state.
export const STATUS_RANK = {
  'no aplicar': 0,
  'descartado': 0,
  'rechazado': 1, // Terminal — below active states
  'evaluada': 2,
  'aplicado': 3,
  'respondido': 4,
  'entrevista': 5,
  'oferta': 6,
};

/**
 * Rank for a status string (case-insensitive). Unknown → -1.
 */
export function statusRank(status) {
  if (status == null) return -1;
  const r = STATUS_RANK[String(status).trim().toLowerCase()];
  return r === undefined ? -1 : r;
}

/**
 * Map any non-canonical status to a canonical one.
 * Returns { status, moveToNotes?, unknown? }.
 * status === null with unknown === true means it could not be mapped.
 */
export function normalizeStatus(raw) {
  // Strip markdown bold
  let s = raw.replace(/\*\*/g, '').trim();
  const lower = s.toLowerCase();

  // DUPLICADO variants → Descartado
  if (/^duplicado/i.test(s) || /^dup\b/i.test(s)) {
    return { status: 'Descartado', moveToNotes: raw.trim() };
  }

  // CERRADA → Descartado
  if (/^cerrada$/i.test(s)) return { status: 'Descartado' };

  // Cancelada (possibly with date) → Descartado
  if (/^cancelada/i.test(s)) return { status: 'Descartado' };

  // Descartada → Descartado
  if (/^descartada$/i.test(s)) return { status: 'Descartado' };

  // Rechazada → Rechazado
  if (/^rechazada$/i.test(s)) return { status: 'Rechazado' };

  // Rechazado with date → Rechazado (strip date)
  if (/^rechazado\s+\d{4}/i.test(s)) return { status: 'Rechazado' };

  // Aplicado with date → Aplicado (strip date)
  if (/^aplicado\s+\d{4}/i.test(s)) return { status: 'Aplicado' };

  // CONDICIONAL → Evaluada
  if (/^condicional$/i.test(s)) return { status: 'Evaluada' };

  // HOLD → Evaluada
  if (/^hold$/i.test(s)) return { status: 'Evaluada' };

  // MONITOR → Evaluada
  if (/^monitor$/i.test(s)) return { status: 'Evaluada' };

  // EVALUAR → Evaluada
  if (/^evaluar$/i.test(s)) return { status: 'Evaluada' };

  // Verificar → Evaluada
  if (/^verificar$/i.test(s)) return { status: 'Evaluada' };

  // GEO BLOCKER → NO APLICAR
  if (/geo.?blocker/i.test(s)) return { status: 'NO APLICAR' };

  // Repost #NNN → Descartado
  if (/^repost/i.test(s)) return { status: 'Descartado', moveToNotes: raw.trim() };

  // "—" (em dash, no status) → Descartado
  if (s === '—' || s === '-' || s === '') return { status: 'Descartado' };

  // Already canonical — just fix casing/bold
  for (const c of CANONICAL_STATUSES) {
    if (lower === c.toLowerCase()) return { status: c };
  }

  // Aliases from states.yml
  if (['enviada', 'aplicada', 'applied', 'sent'].includes(lower)) return { status: 'Aplicado' };
  if (['cerrada', 'descartada'].includes(lower)) return { status: 'Descartado' };
  if (['no aplicar', 'no_aplicar', 'skip'].includes(lower)) return { status: 'NO APLICAR' };

  // Unknown — flag it
  return { status: null, unknown: true };
}

/**
 * Normalize a company name for grouping/dedup (lowercase, strip punctuation).
 */
export function normalizeCompany(name) {
  return name.toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

/**
 * Normalize a role title for fuzzy matching (keeps "/" for things like "Frontend/Backend").
 */
export function normalizeRole(role) {
  return role.toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 /]/g, '')
    .trim();
}

/**
 * Fuzzy role match: true when two roles share >= 2 significant (len>3) words.
 */
export function roleMatch(a, b) {
  const wordsA = normalizeRole(a).split(/\s+/).filter(w => w.length > 3);
  const wordsB = normalizeRole(b).split(/\s+/).filter(w => w.length > 3);
  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  return overlap.length >= 2;
}

/**
 * Parse a score cell ("4.25/5", "**3.8**", "N/A") to a number. Non-numeric → 0.
 */
export function parseScore(s) {
  const m = s.replace(/\*\*/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Parse a pipe-delimited applications.md row into a structured object.
 * Returns null for separators, headers, or malformed rows.
 */
export function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1]);
  if (isNaN(num)) return null;
  return {
    num,
    date: parts[2],
    company: parts[3],
    role: parts[4],
    score: parts[5],
    status: parts[6],
    pdf: parts[7],
    report: parts[8],
    notes: parts[9] || '',
    raw: line,
  };
}
