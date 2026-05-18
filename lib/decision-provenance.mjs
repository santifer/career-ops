// lib/decision-provenance.mjs — "why did this score/decision happen?" trail.
//
// Per DESIGN_PRINCIPLES.md Pillar 4 (background transparency): every metric
// the dashboard surfaces must have an inspectable trail. This lib reads report
// markdown headers + data/hm-intel/_weights.json + git log of the report file
// to reconstruct the inputs that produced each per-row metric.
//
// Pillar 1 (scannability): renderProvenanceCard() emits a minimal HTML card
// using --text-sm/--text-base CSS custom-property tokens for font sizing.
//
// NO LLM calls. NO new npm dependencies. Pure file + git log parsing.

import { readFileSync, existsSync }       from 'fs';
import { join, dirname }                  from 'path';
import { fileURLToPath }                  from 'url';
import { execSync }                       from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── weights loader ────────────────────────────────────────────────────────────

let _weightsCache = null;

function loadWeights() {
  if (_weightsCache) return _weightsCache;
  const p = join(ROOT, 'data', 'hm-intel', '_weights.json');
  if (!existsSync(p)) return {};
  try {
    _weightsCache = JSON.parse(readFileSync(p, 'utf-8'));
    return _weightsCache;
  } catch { return {}; }
}

// ── Report file finder ────────────────────────────────────────────────────────

const REPORTS_DIR = join(ROOT, 'reports');

function findReportFile(rowId) {
  if (!existsSync(REPORTS_DIR)) return null;
  // Report filenames start with zero-padded rowId
  const prefix = String(rowId).padStart(3, '0');
  try {
    const { readdirSync } = await_fs();
    const files = readdirSync(REPORTS_DIR);
    const match = files.find(f => f.startsWith(prefix + '-') || f.startsWith(String(rowId) + '-'));
    return match ? join(REPORTS_DIR, match) : null;
  } catch { return null; }
}

// Sync wrapper — avoids async surface on the export
function await_fs() {
  return { readdirSync: (p) => {
    const { readdirSync } = await_require_fs();
    return readdirSync(p);
  }};
}
function await_require_fs() {
  // Inline require so the module stays ESM without dynamic import latency
  return { readdirSync: (p) => {
    const fs = { readdirSync: (dir) => {
      const { execSync: ex } = { execSync };
      try {
        return ex(`ls -1 "${dir}"`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
      } catch { return []; }
    }};
    return fs.readdirSync(p);
  }};
}

// Simpler: use execSync ls directly
function listReportsDir() {
  try {
    return execSync(`ls -1 "${REPORTS_DIR}"`, { encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean);
  } catch { return []; }
}

function findReportFileSync(rowId) {
  if (!existsSync(REPORTS_DIR)) return null;
  const files = listReportsDir();
  const prefixPadded = String(rowId).padStart(3, '0');
  const prefixRaw    = String(rowId);
  const match = files.find(f =>
    f.startsWith(prefixPadded + '-') || f.startsWith(prefixRaw + '-'),
  );
  return match ? join(REPORTS_DIR, match) : null;
}

// ── Report header parser ──────────────────────────────────────────────────────

// Parses the "metadata header" block of a report markdown file:
//   **Score:** 4.6/5
//   **Archetype:** Tier B
//   **Date:** 2026-04-25
//   **URL:** https://...
//   **Legitimacy:** High Confidence
//   **PDF:** pending
//   **Verification:** ...

const META_RE = /^\*\*([^*]+)\*\*:\s*(.+)$/;
const SCORE_RE = /(\d+(?:\.\d+)?)\/5/;
const GATE_RE  = /GATES?:\s*\[([^\]]+)\]/i;
const PHASE_E_RE = /\(Phase\s+E\)/i;
const RE_EVAL_RE = /Re-eval(?:uated)?\s+(\d{4}-\d{2}-\d{2})/i;

function parseReportHeader(text) {
  const meta = {};
  for (const line of text.split('\n').slice(0, 30)) {
    const m = META_RE.exec(line.trim());
    if (m) meta[m[1].toLowerCase().replace(/\s+/g, '_')] = m[2].trim();
    if (Object.keys(meta).length >= 10) break; // header ends
  }
  return meta;
}

function parsePhaseHistory(text) {
  // Collect all re-eval lines
  const phases = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const reEvalM = RE_EVAL_RE.exec(line);
    if (reEvalM) {
      const scoreM = SCORE_RE.exec(line);
      const gateM  = GATE_RE.exec(line);
      const isPhaseE = PHASE_E_RE.test(line);
      phases.push({
        date:        reEvalM[1],
        score:       scoreM ? parseFloat(scoreM[1]) : null,
        phase_e:     isPhaseE,
        gates_fired: gateM ? gateM[1].split(',').map(s => s.trim()) : [],
      });
    }
  }
  return phases;
}

// ── Git log ───────────────────────────────────────────────────────────────────

function gitLogForFile(filePath) {
  try {
    const raw = execSync(
      `git -C "${ROOT}" log --pretty=format:"%H|%ai|%s" -- "${filePath}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    if (!raw) return [];
    return raw.split('\n').map(line => {
      const [sha, date, ...subjectParts] = line.split('|');
      return { sha: sha?.trim(), date: date?.trim(), subject: subjectParts.join('|').trim() };
    }).filter(e => e.sha);
  } catch { return []; }
}

// ── Corpus refs extractor ─────────────────────────────────────────────────────

// Look for "cv.md:N" or "article-digest #N" refs in the report body
const CV_REF_RE      = /cv\.md(?::(\d+))?/g;
const DIGEST_REF_RE  = /article-digest\s*#(\d+)/gi;

function extractCorpusRefs(text) {
  const refs = [];
  let m;
  CV_REF_RE.lastIndex = 0;
  while ((m = CV_REF_RE.exec(text)) !== null) {
    refs.push({ source: 'cv.md', line: m[1] ? parseInt(m[1], 10) : null });
    if (refs.length > 20) break;
  }
  DIGEST_REF_RE.lastIndex = 0;
  while ((m = DIGEST_REF_RE.exec(text)) !== null) {
    refs.push({ source: 'article-digest', entry: parseInt(m[1], 10) });
    if (refs.length > 30) break;
  }
  // Deduplicate
  const seen = new Set();
  return refs.filter(r => {
    const k = JSON.stringify(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Gates from report body ────────────────────────────────────────────────────

const HARD_GATE_LINE_RE = /\|\s*(H\d+)[^|]*\|[^|]*\|\s*Yes\b/gi;
const SOFT_GATE_LINE_RE = /soft\s+gap[:\s]+([^|\n·]+)/gi;

function extractGatesFromReport(text) {
  const passed = [], failed = [];
  let m;
  HARD_GATE_LINE_RE.lastIndex = 0;
  while ((m = HARD_GATE_LINE_RE.exec(text)) !== null) {
    failed.push(m[1]);
    if (failed.length > 20) break;
  }
  SOFT_GATE_LINE_RE.lastIndex = 0;
  const soft = [];
  while ((m = SOFT_GATE_LINE_RE.exec(text)) !== null) {
    soft.push(m[1].trim());
    if (soft.length > 10) break;
  }
  return { gates_passed: passed, gates_failed: failed, soft_gaps: soft };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * getProvenance(rowId, metricKey) → full provenance trail
 *
 * Sources: reports/{num}-{slug}-{date}.md + git log of that file +
 *          data/hm-intel/_weights.json
 *
 * @param {number|string} rowId
 * @param {string} metricKey   e.g. 'score', 'comp', 'toxicity'
 * @returns {{
 *   value:         number|string|null,
 *   computed_at:   string|null,
 *   inputs:        string[],
 *   gates_passed:  string[],
 *   gates_failed:  string[],
 *   corpus_refs:   Array<{source:string}>,
 *   phase_history: Array<{date:string,score:number|null,phase_e:boolean,gates_fired:string[]}>,
 *   report_file:   string|null,
 *   git_log:       Array<{sha:string,date:string,subject:string}>,
 *   weights:       object,
 * }}
 */
export function getProvenance(rowId, metricKey) {
  const reportFile = findReportFileSync(rowId);
  const weights    = loadWeights();

  const base = {
    value:         null,
    computed_at:   null,
    inputs:        [],
    gates_passed:  [],
    gates_failed:  [],
    corpus_refs:   [],
    phase_history: [],
    report_file:   reportFile,
    git_log:       [],
    weights,
  };

  if (!reportFile || !existsSync(reportFile)) return base;

  const text   = readFileSync(reportFile, 'utf-8');
  const header = parseReportHeader(text);
  const gitLog = gitLogForFile(reportFile);

  // Value extraction per metric
  let value = null;
  if (metricKey === 'score') {
    const m = SCORE_RE.exec(header.score || '');
    value = m ? parseFloat(m[1]) : null;
  } else if (metricKey === 'comp') {
    value = header.listed_annual_salary || header.comp || null;
  } else {
    value = header[metricKey] || null;
  }

  const gateInfo    = extractGatesFromReport(text);
  const corpusRefs  = extractCorpusRefs(text);
  const phaseHist   = parsePhaseHistory(text);
  const computedAt  = header.date || (gitLog[0]?.date) || null;

  // Inputs: which cv.md lines, profile fields, weight keys were consulted
  const inputs = [];
  if (corpusRefs.length) {
    inputs.push(...corpusRefs.map(r => r.source + (r.line ? `:${r.line}` : r.entry ? `#${r.entry}` : '')));
  }
  if (Object.keys(weights).length) {
    inputs.push('data/hm-intel/_weights.json');
  }
  if (header.archetype) inputs.push(`archetype: ${header.archetype}`);
  if (header.legitimacy) inputs.push(`legitimacy: ${header.legitimacy}`);

  return {
    value,
    computed_at:   computedAt,
    inputs:        [...new Set(inputs)].slice(0, 30),
    gates_passed:  gateInfo.gates_passed,
    gates_failed:  gateInfo.gates_failed,
    corpus_refs:   corpusRefs,
    phase_history: phaseHist,
    report_file:   reportFile,
    git_log:       gitLog,
    weights,
  };
}

// ── HTML card renderer ────────────────────────────────────────────────────────

/**
 * renderProvenanceCard(prov) → HTML string
 *
 * Uses --text-sm / --text-base CSS custom-property tokens matching the
 * dashboard design token vocabulary.
 *
 * @param {ReturnType<typeof getProvenance>} prov
 * @returns {string}
 */
export function renderProvenanceCard(prov) {
  const {
    value, computed_at, inputs, gates_passed, gates_failed,
    corpus_refs, phase_history, report_file, git_log, weights,
  } = prov;

  const reportName = report_file ? report_file.split('/').pop() : '—';
  const gitCount   = git_log.length;
  const lastEdit   = git_log[0] ? `${git_log[0].date.slice(0, 10)} · ${git_log[0].sha.slice(0, 7)}` : '—';

  const inputList = inputs.length
    ? inputs.map(i => `<li>${esc(i)}</li>`).join('')
    : '<li><em>No corpus refs found in report</em></li>';

  const gatesFiredHtml = gates_failed.length
    ? `<span class="prov-gate-fail">${esc(gates_failed.join(', '))}</span>`
    : '<span class="prov-gate-ok">none</span>';

  const phaseRows = phase_history.length
    ? phase_history.map(p =>
        `<tr>
          <td>${esc(p.date)}</td>
          <td>${p.score !== null ? p.score.toFixed(1) : '—'}</td>
          <td>${p.phase_e ? 'Phase E' : '—'}</td>
          <td>${p.gates_fired.length ? esc(p.gates_fired.join(', ')) : '—'}</td>
        </tr>`,
      ).join('')
    : '<tr><td colspan="4"><em>No re-eval history found</em></td></tr>';

  const weightsHtml = Object.keys(weights).length
    ? `<pre style="font-size:var(--text-sm,11px);margin:0;white-space:pre-wrap">${esc(JSON.stringify(weights, null, 2))}</pre>`
    : '<em>weights file not found</em>';

  return `
<div class="prov-card" style="font-size:var(--text-base,13px);line-height:1.5">
  <dl class="prov-meta" style="display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;font-size:var(--text-sm,11px)">
    <dt>Value</dt>      <dd><strong>${value !== null ? esc(String(value)) : '—'}</strong></dd>
    <dt>Computed</dt>   <dd>${esc(computed_at || '—')}</dd>
    <dt>Report</dt>     <dd>${esc(reportName)}</dd>
    <dt>Git edits</dt>  <dd>${gitCount} commits · last: ${esc(lastEdit)}</dd>
    <dt>Gates fired</dt><dd>${gatesFiredHtml}</dd>
  </dl>

  <details style="margin-top:8px">
    <summary style="cursor:pointer;font-size:var(--text-sm,11px);font-weight:600">
      Inputs (${inputs.length})
    </summary>
    <ul style="font-size:var(--text-sm,11px);margin:4px 0 0 16px;padding:0">${inputList}</ul>
  </details>

  <details style="margin-top:8px">
    <summary style="cursor:pointer;font-size:var(--text-sm,11px);font-weight:600">
      Phase history (${phase_history.length})
    </summary>
    <table style="font-size:var(--text-sm,11px);border-collapse:collapse;width:100%;margin-top:4px">
      <thead><tr><th>Date</th><th>Score</th><th>Phase</th><th>Gates</th></tr></thead>
      <tbody>${phaseRows}</tbody>
    </table>
  </details>

  <details style="margin-top:8px">
    <summary style="cursor:pointer;font-size:var(--text-sm,11px);font-weight:600">
      Weights snapshot
    </summary>
    <div style="margin-top:4px">${weightsHtml}</div>
  </details>
</div>`.trim();
}

// ── Fix 5 (score-rationale): 1-line provenance summary ───────────────────────

/**
 * renderProvenanceSummary(rowId) → { summary: string, score: number|null, reportFile: string|null }
 *
 * Returns a short 1-line text summary of why the score is what it is:
 *   e.g. "All 6 must-haves clear; 1 soft gap; strong narrative + comp alignment"
 *
 * Used by the drawer header "Why N.N?" disclosure.
 *
 * @param {number|string} rowId
 * @returns {{ summary: string, score: number|null, reportFile: string|null,
 *             gatesPassed: string[], gatesFailed: string[], softGaps: string[] }}
 */
export function renderProvenanceSummary(rowId) {
  const reportFile = findReportFileSync(rowId);
  if (!reportFile || !existsSync(reportFile)) {
    return { summary: 'No report on file', score: null, reportFile: null, gatesPassed: [], gatesFailed: [], softGaps: [] };
  }

  const text    = readFileSync(reportFile, 'utf-8');
  const header  = parseReportHeader(text);
  const gateInfo = extractGatesFromReport(text);

  const scoreM = SCORE_RE.exec(header.score || '');
  const score  = scoreM ? parseFloat(scoreM[1]) : null;

  const passedCount = gateInfo.gates_passed.length;
  const failedCount = gateInfo.gates_failed.length;
  const softCount   = gateInfo.soft_gaps.length;

  // Build 1-line summary
  const parts = [];
  if (failedCount === 0 && passedCount > 0) {
    parts.push(`All ${passedCount} must-have${passedCount === 1 ? '' : 's'} clear`);
  } else if (failedCount > 0) {
    parts.push(`${failedCount} gate${failedCount === 1 ? '' : 's'} failed`);
  }
  if (softCount > 0) {
    parts.push(`${softCount} soft gap${softCount === 1 ? '' : 's'}`);
  }
  if (header.archetype) {
    parts.push(esc(header.archetype));
  }
  if (header.legitimacy && !/high confidence/i.test(header.legitimacy)) {
    parts.push(`legitimacy: ${esc(header.legitimacy)}`);
  }
  if (!parts.length) {
    parts.push(score !== null ? `Score ${score.toFixed(1)}/5` : 'No gate data in report');
  }

  const summary = parts.join('; ');

  return {
    summary,
    score,
    reportFile,
    gatesPassed: gateInfo.gates_passed,
    gatesFailed: gateInfo.gates_failed,
    softGaps:    gateInfo.soft_gaps,
  };
}

// ── HTML escape helper ────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
