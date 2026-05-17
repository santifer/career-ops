// lib/peer-context.mjs — "compared to what?" lens for dashboard metrics.
//
// Per DESIGN_PRINCIPLES.md Pillar 3 (strengths AND limitations): a score
// or comp number in isolation is meaningless. This lib reads the live tracker
// (data/applications.md) and reports headers to produce pipeline-relative
// percentile + peer comparisons — giving every metric the "compared to what?"
// context it needs.
//
// Pillar 1 (scannability): renderPeerTable() produces a markdown table ready
// for drawer / tooltip rendering with no additional formatting.
//
// NO LLM calls. NO new npm dependencies. In-memory cache keyed by file mtime.

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname }                       from 'path';
import { fileURLToPath }                       from 'url';
import { parseApplicationsText }               from './parse-applications.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

/** Supported metric types and their accessor + label. */
export const metricTypes = [
  'comp',
  'score',
  'health',
  'toxicity',
  'age',
  'response_rate',
  'eval_to_apply_days',
  'apply_to_response_days',
];

// ── Cache ─────────────────────────────────────────────────────────────────────

const _cache = {
  rows:       null,
  reportMeta: null, // { rowId: { score, comp, phase_count, last_date } }
  mtime:      null,
};

function getAppsPath() {
  return join(ROOT, 'data', 'applications.md');
}

function freshRows() {
  const p = getAppsPath();
  if (!existsSync(p)) return [];
  const mtime = statSync(p).mtimeMs;
  if (_cache.mtime !== mtime || _cache.rows === null) {
    _cache.rows  = parseApplicationsText(readFileSync(p, 'utf-8'));
    _cache.mtime = mtime;
    _cache.reportMeta = null; // invalidate downstream
  }
  return _cache.rows;
}

// ── Accessor functions ────────────────────────────────────────────────────────

const COMP_RE = /\$(\d[\d,.]+)[Kk]?/;

function parseCompK(notes) {
  // Extract first dollar figure from notes — may be "4.5/5 Comp" or "$255,000" etc.
  const m = COMP_RE.exec(notes || '');
  if (!m) return null;
  const raw = parseFloat(m[1].replace(/,/g, ''));
  // If the raw number looks like a base-salary figure (>= 1000 → in dollars, < 1000 → in K)
  return raw >= 1000 ? raw / 1000 : raw;
}

function rowValue(row, metricType) {
  switch (metricType) {
    case 'score':  return row.score || null;
    case 'comp':   return parseCompK(row.notes);
    // Other metrics require richer data not in the TSV; return null (partial source)
    default:       return null;
  }
}

// ── Percentile ────────────────────────────────────────────────────────────────

function percentileOf(value, values) {
  const sorted = values.filter(v => v !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const below = sorted.filter(v => v < value).length;
  return Math.round((below / sorted.length) * 100);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * getPeerContext(metricType, currentValue, opts) → peer context object
 *
 * @param {'comp'|'score'|'health'|'toxicity'|'age'|'response_rate'|'eval_to_apply_days'|'apply_to_response_days'} metricType
 * @param {number} currentValue
 * @param {{ company?: string, excludeRowId?: number }} [opts]
 * @returns {{
 *   sameCompany:         Array<{num:number,date:string,score:number|null,value:number|null}>,
 *   peerCompanies:       Array<{company:string,value:number,n:number}>,
 *   percentileInPipeline: number|null,
 *   n:                   number,
 *   source:              'pipeline'|'cached'|'partial',
 * }}
 */
export function getPeerContext(metricType, currentValue, opts = {}) {
  const { company = null, excludeRowId = null } = opts;
  const rows = freshRows();

  if (!rows.length) {
    return {
      sameCompany:          [],
      peerCompanies:        [],
      percentileInPipeline: null,
      n:                    0,
      source:               'partial',
    };
  }

  // All pipeline values for this metric
  const allValues = rows.map(r => rowValue(r, metricType));
  const validVals = allValues.filter(v => v !== null);

  // Source quality
  const source = metricTypes.includes(metricType) && (metricType === 'score' || metricType === 'comp')
    ? 'pipeline'
    : 'partial'; // other metrics need richer data not yet in TSV

  // Same-company history
  const sameCompany = company
    ? rows
        .filter(r =>
          r.company.toLowerCase() === company.toLowerCase() &&
          r.num !== excludeRowId &&
          rowValue(r, metricType) !== null,
        )
        .map(r => ({
          num:   r.num,
          date:  r.date,
          score: r.score,
          value: rowValue(r, metricType),
        }))
        .sort((a, b) => (a.date > b.date ? -1 : 1))
    : [];

  // Peer companies aggregate (top 8 by mean)
  const byCompany = {};
  for (const r of rows) {
    const v = rowValue(r, metricType);
    if (v === null) continue;
    const key = r.company;
    if (!byCompany[key]) byCompany[key] = [];
    byCompany[key].push(v);
  }
  const peerCompanies = Object.entries(byCompany)
    .map(([comp, vals]) => ({
      company: comp,
      value:   vals.reduce((a, b) => a + b, 0) / vals.length,
      n:       vals.length,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return {
    sameCompany,
    peerCompanies,
    percentileInPipeline: validVals.length ? percentileOf(currentValue, validVals) : null,
    n:                    validVals.length,
    source,
  };
}

// ── Render ────────────────────────────────────────────────────────────────────

/**
 * renderPeerTable(context) → markdown string
 *
 * Produces a scannable 2-section table:
 *   1. Pipeline percentile banner
 *   2. Top peer companies
 *
 * @param {{ sameCompany, peerCompanies, percentileInPipeline, n, source }} context
 * @returns {string}
 */
export function renderPeerTable(context) {
  const { sameCompany, peerCompanies, percentileInPipeline, n, source } = context;
  const lines = [];

  // Percentile banner
  if (percentileInPipeline !== null) {
    lines.push(`**Pipeline rank:** top ${100 - percentileInPipeline}% of ${n} evaluated (source: ${source})`);
  } else {
    lines.push(`**Pipeline rank:** insufficient data (source: ${source})`);
  }

  // Same-company history
  if (sameCompany.length > 0) {
    lines.push('');
    lines.push('**Same company — recent evals:**');
    lines.push('| # | Date | Value |');
    lines.push('|---|------|-------|');
    for (const row of sameCompany.slice(0, 5)) {
      lines.push(`| ${row.num} | ${row.date} | ${row.value !== null ? row.value.toFixed(1) : '—'} |`);
    }
  }

  // Peer table
  if (peerCompanies.length > 0) {
    lines.push('');
    lines.push('**Top peers in pipeline (by avg):**');
    lines.push('| Company | Avg | n |');
    lines.push('|---------|-----|---|');
    for (const p of peerCompanies) {
      lines.push(`| ${p.company} | ${p.value.toFixed(2)} | ${p.n} |`);
    }
  }

  return lines.join('\n');
}
