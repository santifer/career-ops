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

// C6 (2026-05-18): the previous default-null branch meant peer-context for
// health/toxicity/age/response_rate/eval_to_apply_days/apply_to_response_days
// returned an empty peer table. These accessors fill that gap.

const STATUS_PHASE = { evaluated: 1, applied: 2, responded: 3, interview: 4, offer: 5, rejected: 0, discarded: 0, skip: 0 };

function daysBetween(a, b) {
  const ms = Date.parse(b) - Date.parse(a);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

function _ageDays(row) {
  if (!row.date) return null;
  const ms = Date.now() - Date.parse(row.date);
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}

function _health(row) {
  // Composite 0-1: score-weight + age-decay + status-progress
  if (!row.score) return null;
  const scoreNorm = Math.min(1, row.score / 5);
  const age = _ageDays(row);
  // Roles older than 30 days lose 30% health, older than 60 lose 60%
  const ageDecay = age == null ? 1 : (age <= 30 ? 1 : age <= 60 ? 0.7 : 0.4);
  const phase = STATUS_PHASE[String(row.status || '').toLowerCase()] || 0;
  const phaseBonus = phase === 0 ? -0.3 : phase >= 3 ? 0.2 : 0;
  return Math.max(0, Math.min(1, scoreNorm * ageDecay + phaseBonus));
}

function _toxicity(row) {
  // Manual toxic tags in notes column score 1.0; else 0 (deferred to lib/toxicity-composite.mjs for true composite)
  if (!row.notes) return 0;
  return /toxic|layoff|hiring freeze|leadership exit|culture (issue|problem|toxic)|ethics (violation|concern)|red flag/i.test(row.notes) ? 1 : 0;
}

function _responseRate(rows) {
  // Pipeline-wide stat — not per-row; returned by the caller as a single value
  const applied = rows.filter(r => /^(applied|responded|interview|offer|rejected)$/i.test(r.status));
  if (!applied.length) return null;
  const responded = applied.filter(r => /^(responded|interview|offer|rejected)$/i.test(r.status));
  return responded.length / applied.length;
}

function _evalToApplyDays(row) {
  // Days between eval (row.date) and Applied status transition.
  // Status-changes.jsonl isn't always present; fall back to a date in the notes
  // matching "Applied {date}" if any.
  if (!row.notes) return null;
  const m = row.notes.match(/Applied\s+(\d{4}-\d{2}-\d{2})/i);
  if (!m) return null;
  return daysBetween(row.date, m[1]);
}

function _applyToResponseDays(row) {
  if (!row.notes) return null;
  const applied = row.notes.match(/Applied\s+(\d{4}-\d{2}-\d{2})/i);
  const responded = row.notes.match(/Respon(?:ded|se)\s+(\d{4}-\d{2}-\d{2})/i);
  if (!applied || !responded) return null;
  return daysBetween(applied[1], responded[1]);
}

function rowValue(row, metricType) {
  switch (metricType) {
    case 'score':                   return row.score || null;
    case 'comp':                    return parseCompK(row.notes);
    case 'health':                  return _health(row);
    case 'toxicity':                return _toxicity(row);
    case 'age':                     return _ageDays(row);
    case 'eval_to_apply_days':      return _evalToApplyDays(row);
    case 'apply_to_response_days':  return _applyToResponseDays(row);
    case 'response_rate':           return null; // pipeline-wide, handled below
    default:                        return null;
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

  // C6 (2026-05-18): source-quality classification by metric.
  // - 'pipeline': metric is derivable from data/applications.md directly (TSV-only).
  // - 'partial': metric requires notes-string parsing or fallback heuristics
  //   (toxicity reads tags from notes; eval_to_apply_days reads dates from notes).
  const TSV_NATIVE = new Set(['score', 'comp', 'age']);
  const NOTES_DERIVED = new Set(['toxicity', 'eval_to_apply_days', 'apply_to_response_days']);
  const COMPOSITE = new Set(['health', 'response_rate']);
  const source = !metricTypes.includes(metricType)
    ? 'partial'
    : TSV_NATIVE.has(metricType)
      ? 'pipeline'
      : NOTES_DERIVED.has(metricType)
        ? 'partial' // dependent on notes-column hygiene
        : COMPOSITE.has(metricType)
          ? 'pipeline' // derived from TSV columns even if computed
          : 'partial';

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

/**
 * renderPeerTableHtml(context, opts?) → HTML string
 *
 * Same data as renderPeerTable() but formatted for dashboard popouts. Includes
 * a plain-language explanation of what each section means so a non-engineer
 * can understand the comparison without reading the schema.
 *
 * @param {object} context  Output of getPeerContext()
 * @param {object} [opts]   { kind: 'score'|'comp', label?: string }
 * @returns {string}        HTML
 */
export function renderPeerTableHtml(context, opts = {}) {
  const { sameCompany, peerCompanies, percentileInPipeline, n, source } = context;
  const kind = opts.kind || 'score';
  const valueLabel = kind === 'comp' ? 'Comp ($K)' : 'Score';
  const noun = kind === 'comp' ? 'base salary' : 'score';
  const out = [];

  // Percentile banner with plain-language gloss.
  // BRAVO 2026-05-19 (AAA-1): when topPct rounds to 0 (row beats 100% of
  // pipeline), the literal "Top 0%" reads as worst-percentile and contradicts
  // the body text. Surface "Top of pipeline" instead. For all other values
  // keep "Top X%".
  if (percentileInPipeline !== null) {
    const topPct = 100 - percentileInPipeline;
    const topLabel = topPct <= 0
      ? '<span style="color:var(--accent,#7c6bea)">Top of pipeline</span>'
      : 'Top <span style="color:var(--accent,#7c6bea)">' + topPct + '%</span> of ' + n + ' evaluated roles';
    out.push(
      '<div style="background:rgba(124,107,234,0.08);border-radius:6px;padding:10px 12px;margin-bottom:10px">'
      + '<div style="font-size:13px;font-weight:600;margin-bottom:4px">'
      + topLabel
      + '</div>'
      + '<div style="font-size:11.5px;opacity:0.7;line-height:1.45">'
      + 'This role&rsquo;s ' + noun + ' beats <strong>' + percentileInPipeline + '%</strong> of all ' + n
      + ' evaluations in your pipeline. Source: <code>' + escapeHtml(source) + '</code>.'
      + '</div>'
      + '</div>'
    );
  } else {
    out.push(
      '<div style="background:rgba(124,107,234,0.05);border-radius:6px;padding:10px 12px;margin-bottom:10px;opacity:0.7">'
      + '<div style="font-size:12px">Not enough data yet — need more evaluations in this range to compute a percentile.</div>'
      + '</div>'
    );
  }

  // Same-company history table
  if (sameCompany.length > 0) {
    out.push(
      '<div style="margin-bottom:14px">'
      + '<div style="font-size:11px;font-weight:600;opacity:0.85;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">'
      + 'Other roles at the same company you&rsquo;ve evaluated'
      + '</div>'
      + _renderHtmlTable(['#', 'Date', valueLabel], sameCompany.slice(0, 5).map(r => [
          String(r.num),
          escapeHtml(r.date || '—'),
          r.value !== null ? r.value.toFixed(kind === 'comp' ? 0 : 1) : '—',
        ]))
      + '</div>'
    );
  }

  // Peer companies table
  if (peerCompanies.length > 0) {
    out.push(
      '<div>'
      + '<div style="font-size:11px;font-weight:600;opacity:0.85;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em">'
      + 'Companies with similar ' + noun + 's in your pipeline'
      + '</div>'
      + '<div style="font-size:11px;opacity:0.6;margin-bottom:6px;line-height:1.4">'
      + 'Average ' + noun + ' across <em>n</em> evaluated roles at each company. Ranked highest-first.'
      + '</div>'
      + _renderHtmlTable(['Company', 'Avg ' + valueLabel, 'n'], peerCompanies.map(p => [
          escapeHtml(p.company),
          p.value.toFixed(kind === 'comp' ? 0 : 2),
          String(p.n),
        ]))
      + '</div>'
    );
  }

  return out.join('');
}

function _renderHtmlTable(headers, rows) {
  const th = headers.map((h, i) => {
    const align = i === 0 ? 'left' : 'right';
    return '<th style="text-align:' + align + ';padding:6px 8px;font-size:10.5px;font-weight:600;opacity:0.6;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid rgba(255,255,255,0.08)">' + h + '</th>';
  }).join('');
  const tr = rows.map(r => {
    const tds = r.map((c, i) => {
      const align = i === 0 ? 'left' : 'right';
      const mono = i === 0 ? '' : 'font-variant-numeric:tabular-nums;';
      return '<td style="text-align:' + align + ';padding:6px 8px;font-size:12px;' + mono + 'border-bottom:1px solid rgba(255,255,255,0.04)">' + c + '</td>';
    }).join('');
    return '<tr>' + tds + '</tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse;font-family:inherit"><thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table>';
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
