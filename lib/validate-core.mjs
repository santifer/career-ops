/**
 * validate-core.mjs — Pure predicates used by verify-pipeline.mjs.
 *
 * Extracted so the health-check rules can be unit-tested without running the
 * full pipeline scan. No filesystem / process access here.
 */

// Canonical statuses, lowercased (verify-pipeline compares case-insensitively).
export const CANONICAL_STATUSES = [
  'evaluada', 'aplicado', 'respondido', 'entrevista',
  'oferta', 'rechazado', 'descartado', 'no aplicar',
];

// Accepted aliases → canonical (lowercased).
export const ALIASES = {
  'enviada': 'aplicado', 'aplicada': 'aplicado', 'applied': 'aplicado', 'sent': 'aplicado',
  'cerrada': 'descartado', 'descartada': 'descartado', 'cancelada': 'descartado',
  'rechazada': 'rechazado',
  'no_aplicar': 'no aplicar', 'skip': 'no aplicar', 'monitor': 'no aplicar',
};

/**
 * True when a status cell is canonical (or a known alias), ignoring bold markup
 * and a trailing ISO date. Mirrors verify-pipeline's "Check 1" acceptance test.
 */
export function isCanonicalStatus(status) {
  const clean = status.replace(/\*\*/g, '').trim().toLowerCase();
  const statusOnly = clean.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  return CANONICAL_STATUSES.includes(statusOnly) || Boolean(ALIASES[statusOnly]);
}

/**
 * True when a score cell is a valid "N.N/5" value, or the sentinels N/A / DUP.
 * Bold markup is ignored. Mirrors verify-pipeline's "Check 4".
 */
export function isValidScore(score) {
  const s = score.replace(/\*\*/g, '').trim();
  return /^\d+\.?\d*\/5$/.test(s) || s === 'N/A' || s === 'DUP';
}
