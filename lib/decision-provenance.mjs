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
  // 2026-05-20 — The row num and the report file's prefix number are NOT
  // the same. Tracker row "| 2253 | ... | [1050](reports/1050-ema-...md)"
  // means rowId=2253 but the actual file is reports/1050-ema-...md.
  // Prior version did `files.find(f => f.startsWith(rowId + '-'))` which
  // missed every row where the two diverged → "no report file on disk"
  // popups for Ema, Pinecone, and any row where the report number was
  // assigned independently of the row num. Fix: parse the actual report
  // path from the row's markdown link in applications.md.
  const APPS = join(REPORTS_DIR, '..', 'data', 'applications.md');
  if (existsSync(APPS)) {
    try {
      const text = readFileSync(APPS, 'utf-8');
      // Match the row: "| <rowId> | <date> | ... | [N](reports/PATH.md) |"
      const rowRe = new RegExp(`^\\|\\s*${rowId}\\s*\\|.*?\\[[^\\]]+\\]\\(([^)]+\\.md)\\)`, 'm');
      const m = rowRe.exec(text);
      if (m && m[1]) {
        const rel = m[1].replace(/^reports\//, '');
        const abs = join(REPORTS_DIR, rel);
        if (existsSync(abs)) return abs;
      }
    } catch { /* fall through to prefix match */ }
  }
  // Fallback: prefix match (correct for rows where rowId === report
  // number, e.g. the early 001-* / 010-* reports).
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

// BRAVO 2026-05-19 (content sweep): the prior regex expected `**Label**: value`
// (colon AFTER the closing **) but every actual report writes `**Label:** value`
// (colon INSIDE the bold, before the closing **). The old regex never matched
// anything — `parseReportHeader()` returned an empty object — so `header.score`,
// `header.decision`, `header.council`, etc. were all undefined and the popout
// could not render a headline. Now we capture the colon-inside form and strip
// the trailing colon from the key.
const META_RE = /^\*\*([^*]+?):\*\*\s+(.+)$/;
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

// BRAVO 2026-05-19 (content sweep): the prior regex only caught TABLE-format
// gate rows (| H4 | ... | Yes). Council-format reports (Anthropic Applied AI
// Architect row 2059 etc.) write gates in code blocks like:
//   GATES: H4 fired (external enterprise customer-facing tenure required)
// That made every council-format report look like "Gates fired: none" even
// when 2 gates fired. The new regex catches both formats, and we capture the
// human rationale for each gate so the popout can quote the reason.
const HARD_GATE_LINE_RE = /\|\s*(H\d+)[^|]*\|[^|]*\|\s*Yes\b/gi;
const SOFT_GATE_LINE_RE = /soft\s+gap[:\s]+([^|\n·]+)/gi;
const GATE_CODEBLOCK_RE = /(H\d+)\s+fired\s*(?:\(([^)]+)\))?/gi;

function extractGatesFromReport(text) {
  const passed = [], failed = [], failedReasons = {};
  let m;
  HARD_GATE_LINE_RE.lastIndex = 0;
  while ((m = HARD_GATE_LINE_RE.exec(text)) !== null) {
    failed.push(m[1]);
    if (failed.length > 20) break;
  }
  // Council-format: GATES: H4 fired (reason) | H8 fired (reason).
  // BRAVO 2026-05-19 (content sweep): keep ONLY the first rationale per gate.
  // Subsequent occurrences (e.g. "H4 fired (1 gate)" in the composite-override
  // summary block) overwrote the rich rationale with a useless count. First
  // match wins because the primary GATES line appears before the override.
  GATE_CODEBLOCK_RE.lastIndex = 0;
  while ((m = GATE_CODEBLOCK_RE.exec(text)) !== null) {
    if (!failed.includes(m[1])) failed.push(m[1]);
    if (m[2] && !failedReasons[m[1]]) failedReasons[m[1]] = m[2].trim();
    if (failed.length > 20) break;
  }
  SOFT_GATE_LINE_RE.lastIndex = 0;
  const soft = [];
  while ((m = SOFT_GATE_LINE_RE.exec(text)) !== null) {
    soft.push(m[1].trim());
    if (soft.length > 10) break;
  }
  return { gates_passed: passed, gates_failed: failed, soft_gaps: soft, failed_reasons: failedReasons };
}

// ── cv.md snippet loader ──────────────────────────────────────────────────────
// BRAVO 2026-05-19 (content sweep): the prior provenance card listed bare
// cv.md line numbers (cv.md:19, cv.md:24, ...) which were useless to the
// reader. Now we read the actual text at those lines and return a 1-sentence
// snippet so the popout can show what content actually backs the score.

let _cvCache = null;
function loadCvLines() {
  if (_cvCache) return _cvCache;
  const p = join(ROOT, 'cv.md');
  if (!existsSync(p)) return [];
  try {
    _cvCache = readFileSync(p, 'utf-8').split('\n');
    return _cvCache;
  } catch { return []; }
}

function summarizeCvLine(lineNum) {
  const lines = loadCvLines();
  if (!lines.length || !lineNum || lineNum < 1) return null;
  // Read the cited line + up to 2 following lines until we hit a blank or
  // 200 chars. Strip markdown bullet / bold markers. Return the first sentence.
  const idx = lineNum - 1;
  if (idx >= lines.length) return null;
  let chunk = (lines[idx] || '').trim();
  // If the cited line is empty, peek at the next non-empty line.
  let peek = idx;
  while (!chunk && peek < lines.length - 1) {
    peek++;
    chunk = (lines[peek] || '').trim();
  }
  if (!chunk) return null;
  // If the line is a markdown heading, return it bare (no further joining)
  if (/^#+\s/.test(chunk)) {
    return chunk.replace(/^#+\s+/, '').replace(/\*\*/g, '').trim().slice(0, 200);
  }
  // Otherwise join up to 2 continuation lines while the next line is also content
  for (let i = peek + 1; i < Math.min(peek + 3, lines.length); i++) {
    const next = (lines[i] || '').trim();
    if (!next) break;
    if (/^[*#-]/.test(next) && !chunk.match(/[,;:—]\s*$/)) break;
    chunk += ' ' + next;
    if (chunk.length > 300) break;
  }
  // Clean markdown noise
  chunk = chunk
    .replace(/^\s*[-*]\s+/, '')           // leading bullet
    .replace(/\*\*([^*]+)\*\*/g, '$1')    // bold
    .replace(/`([^`]+)`/g, '$1')          // inline code
    .replace(/<!--[^>]*-->/g, '')         // HTML comments
    .replace(/\s+/g, ' ')
    .trim();
  // First sentence (or first 220 chars).
  const sentMatch = chunk.match(/^[^.!?]{20,220}[.!?]/);
  return (sentMatch ? sentMatch[0] : chunk.slice(0, 220)).trim();
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

  // BRAVO 2026-05-19 (content sweep): pull actual cv.md content at every
  // cited line so the popout can quote the evidence instead of showing a
  // bare "cv.md:19" reference. De-dup by line + cap at 6 (more than that
  // becomes noise rather than evidence).
  const cvSnippets = [];
  const seenLines = new Set();
  for (const ref of corpusRefs) {
    if (ref.source !== 'cv.md' || !ref.line || seenLines.has(ref.line)) continue;
    seenLines.add(ref.line);
    const text = summarizeCvLine(ref.line);
    if (text) cvSnippets.push({ source: 'cv.md', line: ref.line, text });
    if (cvSnippets.length >= 6) break;
  }

  // BRAVO 2026-05-19 (content sweep): pull human-language context from the
  // report header so the popout can lead with WHY the score landed where it
  // did instead of raw "Value / Computed" labels.
  const titleMatch = text.match(/^#\s+(.+?)$/m);
  const reportTitle = titleMatch ? titleMatch[1].trim() : null;
  const decision = header.decision || null;
  const confidence = header.confidence || null;
  const councilLine = header.council || null;

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
    failed_reasons: gateInfo.failed_reasons || {},
    soft_gaps:     gateInfo.soft_gaps,
    corpus_refs:   corpusRefs,
    corpus_snippets: cvSnippets,
    phase_history: phaseHist,
    report_file:   reportFile,
    report_title:  reportTitle,
    decision,
    confidence,
    council_line:  councilLine,
    archetype:     header.archetype || null,
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
    value, computed_at, inputs, gates_passed, gates_failed, failed_reasons,
    soft_gaps, corpus_refs, corpus_snippets, phase_history, report_file,
    report_title, decision, confidence, council_line, archetype, git_log, weights,
  } = prov;

  // ── BRAVO 2026-05-19 (content sweep) — complete rewrite ─────────────────
  // The prior renderer dumped raw fields (Value / Computed / Inputs N / Phase
  // history 0 / Weights snapshot) at the user with no synthesis. The new
  // renderer leads with WHAT THE SCORE MEANS, names WHAT'S BACKING IT (actual
  // cv.md sentences, not bare line numbers), names WHAT MIGHT BLOCK IT
  // (gates fired with the human reason), points at WHAT TO DO NEXT (apply,
  // re-verify, fix gap), and tucks the raw provenance into a collapsed
  // technical section for power users.

  // ── Headline: score band + decision ──
  const scoreBand = _scoreBandLabel(value);
  const decisionPhrase = _decisionPhrase(decision);
  const headline = scoreBand && decisionPhrase
    ? `<strong>${esc(value !== null ? String(value) : '—')}/5</strong> · ${scoreBand} · ${decisionPhrase}`
    : scoreBand
      ? `<strong>${esc(value !== null ? String(value) : '—')}/5</strong> · ${scoreBand}`
      : `<strong>${esc(value !== null ? String(value) : 'No score')}</strong>${decisionPhrase ? ' · ' + decisionPhrase : ''}`;

  // ── Why this score: 1-sentence council summary if available ──
  let councilSummary = '';
  if (council_line) {
    // Parse "sonnet=3.7/5 → DEFER · opus=4.2/5 → APPLY · gemini=4.1/5 → APPLY"
    const verdicts = (council_line.match(/(\w+)=([\d.]+)\/5\s*→?\s*(\w+)/gi) || []);
    const applyCount = (council_line.match(/APPLY/gi) || []).length;
    const deferCount = (council_line.match(/DEFER/gi) || []).length;
    const skipCount  = (council_line.match(/SKIP/gi) || []).length;
    const total = verdicts.length || (applyCount + deferCount + skipCount);
    if (total > 0) {
      const lead = applyCount === total
        ? `All ${total} council models recommend APPLY.`
        : applyCount > 0 && deferCount > 0 && skipCount === 0
          ? `${applyCount} of ${total} council models recommend APPLY, ${deferCount} recommends DEFER (the consensus is APPLY).`
          : `Council split: ${applyCount} APPLY / ${deferCount} DEFER / ${skipCount} SKIP.`;
      councilSummary = `<p style="margin:0 0 10px;color:var(--text-2);font-size:13px;line-height:1.55">${esc(lead)}${confidence ? ' Confidence: <strong>' + esc(confidence) + '</strong>.' : ''}</p>`;
    }
  }

  // ── What's backing the score: actual cv.md content snippets ──
  let backingHtml = '';
  if (corpus_snippets && corpus_snippets.length > 0) {
    const items = corpus_snippets.map(s =>
      `<li style="margin-bottom:6px;line-height:1.5">
        <span style="color:var(--text);">${esc(_normalizeVoice(s.text))}</span>
        <span style="color:var(--text-4);font-size:11px;margin-left:4px">— from your cv.md, line ${esc(String(s.line))}</span>
      </li>`,
    ).join('');
    backingHtml = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:6px">What is backing this score</div>
        <ul style="margin:0;padding-left:18px;font-size:12.5px;color:var(--text-2)">${items}</ul>
      </div>`;
  }

  // ── What might block it: failed gates with human reasons ──
  let blockersHtml = '';
  if (gates_failed && gates_failed.length > 0) {
    const items = gates_failed.map(g => {
      const reason = (failed_reasons || {})[g];
      return `<li style="margin-bottom:6px;line-height:1.5">
        <span style="background:var(--red-bg,#fee2e2);color:var(--red-fg,#dc2626);font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:3px;margin-right:6px">${esc(g)}</span>
        ${reason ? esc(_normalizeVoice(reason)) : '<span style="color:var(--text-3)">no rationale captured in report</span>'}
      </li>`;
    }).join('');
    blockersHtml = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:6px">What might block this apply</div>
        <ul style="margin:0;padding-left:0;list-style:none;font-size:12.5px;color:var(--text-2)">${items}</ul>
      </div>`;
  } else if (soft_gaps && soft_gaps.length > 0) {
    const items = soft_gaps.map(g =>
      `<li style="margin-bottom:6px;line-height:1.5">
        <span style="background:var(--amber-bg,#fef3c7);color:var(--amber-fg,#d97706);font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:3px;margin-right:6px">SOFT</span>
        ${esc(_normalizeVoice(g))}
      </li>`,
    ).join('');
    blockersHtml = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:6px">Soft gaps to address before applying</div>
        <ul style="margin:0;padding-left:0;list-style:none;font-size:12.5px;color:var(--text-2)">${items}</ul>
      </div>`;
  } else {
    // No blockers fired — frame as POSITIVE signal, not neutral "none".
    blockersHtml = `
      <div style="margin-bottom:14px">
        <div style="font-size:12.5px;color:var(--green,#10b981);background:var(--green-bg,#d1fae5);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green,#10b981)">
          <strong>No blocking gates fired.</strong> Every hard requirement in the role report is cleanly hit; the score above is the full picture.
        </div>
      </div>`;
  }

  // ── What to do next ──
  const nextAction = _nextActionPhrase(decision, gates_failed, soft_gaps);
  const nextActionHtml = nextAction
    ? `<div style="margin-bottom:10px;padding:10px 12px;background:var(--surface-2);border-radius:6px;font-size:12.5px;color:var(--text-2);line-height:1.55">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:4px">Next move</div>
        ${nextAction}
      </div>`
    : '';

  // ── Collapsed technical details ──
  const reportName = report_file ? report_file.split('/').pop() : null;
  const reportRelPath = report_file ? report_file.replace(/.*\/career-ops\//, '') : null;
  const reportLink = reportRelPath
    ? `<a href="/reports/${esc(reportName.replace(/\.md$/, '.html'))}" target="_blank" rel="noopener" style="color:var(--link,#0969da)">${esc(reportName)}</a>`
    : '<em>no report file on disk</em>';

  const gitCount = git_log.length;
  const lastEdit = git_log[0]
    ? `${git_log[0].date.slice(0, 10)} · ${git_log[0].sha.slice(0, 7)}`
    : null;

  const phaseRows = phase_history.length
    ? phase_history.map(p =>
        `<tr>
          <td style="padding:4px 8px">${esc(p.date)}</td>
          <td style="padding:4px 8px">${p.score !== null ? p.score.toFixed(1) : '—'}</td>
          <td style="padding:4px 8px">${p.phase_e ? 'Phase E' : '—'}</td>
          <td style="padding:4px 8px">${p.gates_fired.length ? esc(p.gates_fired.join(', ')) : '—'}</td>
        </tr>`,
      ).join('')
    : '';

  // BRAVO 2026-05-19 (content sweep — Mitchell second pass): the prior
  // technical section dumped "Score parsed: 4.6/5", "Report file edits: 0
  // git commits · last edited never", "Inputs the pipeline consulted (3):
  // data/hm-intel/_weights.json · archetype: B — Communications / Editorial
  // at AI-native (primary, with strong A2-AB secondary via Claude Code user
  // gate) · legitimacy: High Confidence", etc. None of those help a user
  // understand the score. New section is honest about what it is (a peek
  // for power users) and HIDES every row that resolves to a zero/empty
  // value instead of saying "0 git commits · last edited never".
  const techRows = [];
  techRows.push(`<p style="margin:0 0 4px"><strong>Source report:</strong> ${reportLink}</p>`);
  if (computed_at) {
    techRows.push(`<p style="margin:0 0 4px"><strong>Scored on:</strong> ${esc(computed_at)}</p>`);
  }
  if (gitCount > 0 && lastEdit) {
    techRows.push(`<p style="margin:0 0 4px"><strong>Report file edits:</strong> ${gitCount} git commit${gitCount === 1 ? '' : 's'} (last ${esc(lastEdit)})</p>`);
  }
  if (archetype) {
    techRows.push(`<p style="margin:0 0 4px"><strong>Role type:</strong> ${esc(archetype)}</p>`);
  }
  if (council_line) {
    techRows.push(`<p style="margin:0 0 4px"><strong>Council scores (raw):</strong> <code style="font-size:10.5px">${esc(council_line)}</code></p>`);
  }
  if (phase_history.length) {
    techRows.push(`<p style="margin:8px 0 4px"><strong>Re-scoring history:</strong></p>
          <table style="font-size:11px;border-collapse:collapse;margin-left:8px">
            <thead><tr><th style="padding:4px 8px;text-align:left">Date</th><th style="padding:4px 8px;text-align:left">Score</th><th style="padding:4px 8px;text-align:left">Pass</th><th style="padding:4px 8px;text-align:left">Gates fired</th></tr></thead>
            <tbody>${phaseRows}</tbody>
          </table>`);
  }
  // Inputs: only show if it tells us something the rest of the popout did
  // not. Skip the raw file path leak; surface a human-readable count.
  const corpusInputCount = (corpus_snippets || []).length;
  if (corpusInputCount > 0) {
    techRows.push(`<p style="margin:8px 0 4px"><strong>Backing evidence the pipeline read:</strong> <span style="color:var(--text-4)">${corpusInputCount} sentence${corpusInputCount === 1 ? '' : 's'} from <code>cv.md</code>${(weights && Object.keys(weights).length) ? ' + the weighting profile in <code>data/hm-intel/_weights.json</code>' : ''}</span></p>`);
  }

  const technicalSection = techRows.length === 1
    ? `<details style="margin-top:18px;padding-top:14px;border-top:1px dashed var(--border)">
        <summary style="cursor:pointer;font-size:11px;font-weight:600;color:var(--text-3);letter-spacing:.04em;text-transform:uppercase">
          See the source report
        </summary>
        <div style="margin-top:10px;font-size:11.5px;color:var(--text-3);line-height:1.55">
          ${techRows[0]}
        </div>
      </details>`
    : `<details style="margin-top:18px;padding-top:14px;border-top:1px dashed var(--border)">
        <summary style="cursor:pointer;font-size:11px;font-weight:600;color:var(--text-3);letter-spacing:.04em;text-transform:uppercase">
          Technical details · for the curious
        </summary>
        <div style="margin-top:10px;font-size:11.5px;color:var(--text-3);line-height:1.55">
          ${techRows.join('\n')}
        </div>
      </details>`;

  return `
<div class="prov-card" style="font-size:13px;line-height:1.55;color:var(--text)">
  <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text);line-height:1.4">
    ${headline}
  </div>
  ${councilSummary}
  ${backingHtml}
  ${blockersHtml}
  ${nextActionHtml}
  ${technicalSection}
</div>`.trim();
}

// ── Helpers used by the new renderer ──────────────────────────────────────────
// BRAVO 2026-05-19 (content sweep): score-band labels, decision phrases, and
// next-action phrases so the popout reads like a recommendation, not a
// database row.

// BRAVO 2026-05-19 (content sweep — Mitchell second pass): the eval pipeline
// writes about Mitchell in third person ("his network", "Mitchell's roster",
// "he ships"). When that content is rendered back TO Mitchell in a popout, it
// reads as alienating. Swap to second person at render time so the source data
// stays intact but the UI speaks to him directly. Conservative word-boundary
// anchored swaps; do not corrupt unrelated text.
function _normalizeVoice(text) {
  if (!text) return text;
  let s = String(text);
  s = s.replace(/\bhis\s+(network|CV|portfolio|background|profile|comp|reach|cohort|roster|cv\.md|article-digest|resume|work|writing|range|ask|application|outreach|positioning)\b/gi, 'your $1');
  s = s.replace(/\bhe\s+(ships|built|brings|gets|holds|sits|has|is|will|can|would|should|may|might|works|wrote|writes|landed|operates)\b/gi, 'you $1');
  s = s.replace(/\bhim\b/gi, 'you');
  s = s.replace(/\bMitchell['']s\b/g, 'your');
  s = s.replace(/\bMitchell\b(?=\s|$|,|\.|—|:|;)/g, 'you');
  s = s.replace(/\bMitchell-shaped\b/gi, 'aligned with your profile');
  return s;
}

function _scoreBandLabel(value) {
  if (value === null || value === undefined) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (v >= 4.5) return '<span style="color:var(--green,#10b981);font-weight:600">Ship-ready — top tier of your pipeline</span>';
  if (v >= 4.0) return '<span style="color:var(--green,#10b981);font-weight:600">Strong fit</span>';
  if (v >= 3.5) return '<span style="color:var(--amber-fg,#d97706);font-weight:600">Mixed signal — review gaps before applying</span>';
  if (v >= 3.0) return '<span style="color:var(--amber-fg,#d97706);font-weight:600">Borderline — likely a stretch apply</span>';
  return '<span style="color:var(--red-fg,#dc2626);font-weight:600">Below threshold — not recommended</span>';
}

function _decisionPhrase(decision) {
  if (!decision) return '';
  const d = String(decision).toUpperCase().replace(/\*\*/g, '').trim();
  if (d.includes('APPLY')) return 'recommended <strong>APPLY</strong>';
  if (d.includes('DEFER')) return 'recommended <strong>DEFER</strong>';
  if (d.includes('SKIP')) return 'recommended <strong>SKIP</strong>';
  return '';
}

function _nextActionPhrase(decision, gatesFailed, softGaps) {
  const d = (decision || '').toUpperCase();
  if (gatesFailed && gatesFailed.length > 0) {
    return `Reframe the ${gatesFailed.length === 1 ? 'gate' : gatesFailed.length + ' gates'} above in your cover letter (or apply pack) before submitting — these are the specific objections the eval surfaced.`;
  }
  if (softGaps && softGaps.length > 0) {
    return `Address the soft gap${softGaps.length === 1 ? '' : 's'} above in your cover letter, then apply.`;
  }
  if (d.includes('APPLY')) {
    return 'Generate the apply pack (CV + cover letter tailored to the JD), then submit. No re-verification needed.';
  }
  if (d.includes('DEFER')) {
    return 'The council recommended DEFER. Re-verify the role posting is still live + check for similar higher-fit roles at the same company before applying.';
  }
  if (d.includes('SKIP')) {
    return 'The council recommended SKIP. Mark Discarded unless you have a recruiter ask or internal referral that overrides the eval.';
  }
  return 'Open the source report to read the full eval rationale before deciding.';
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
