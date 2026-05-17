/**
 * lib/eval-citation-validator.mjs — Validate eval claim-to-source citations.
 *
 * The council prompt forces every factual claim about Mitchell's experience
 * to cite a source span like [cv.md:L42] or [article-digest.md:L8] or
 * [priors:#1509]. This validator extracts those spans and verifies:
 *
 *   1. Cited file exists
 *   2. Cited line number is within file bounds
 *   3. Cited line is non-blank (catches hallucinated line numbers in
 *      whitespace-only zones)
 *   4. For [priors:#N], the row exists in applications.md
 *
 * Returns:
 *   {
 *     ok:                  boolean,
 *     total_citations:     number,
 *     valid_citations:     number,
 *     broken_citations:    [{ span, reason }],
 *     citations_by_source: { 'cv.md': [...lines], ... }
 *   }
 *
 * v1 scope: structural validation only (file + line + non-blank). Does NOT
 * verify the cited line *semantically* supports the surrounding claim — that
 * requires another LLM call which is Phase 5. For now, structural validation
 * catches the most common hallucination pattern: model invents "cv.md:L120"
 * when cv.md only has 95 lines.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Match patterns:
//   [cv.md:L42]              — line 42 of cv.md
//   [cv.md:42]               — same, no L prefix
//   [cv.md:L42-L48]          — span
//   [article-digest.md:L8]   — line 8 of article-digest.md
//   [priors:#1509]           — tracker row #1509
//   [priors:#1509,#2059]     — multiple rows
//   [JD]                     — generic JD reference (always valid, no check needed)
//   [grok]                   — generic Grok reference (always valid)
const SOURCE_SPAN_RE = /\[([a-zA-Z0-9_\-./]+)(?::([LlR#0-9,\-]+))?\]/g;

/**
 * validateCitations — main entry point.
 * @param {string} evalText — full eval text from council.primary_text
 * @returns {object}        — validation report
 */
export function validateCitations(evalText) {
  if (!evalText) return { ok: false, total_citations: 0, valid_citations: 0, broken_citations: [{ span: '(no text)', reason: 'empty eval text' }], citations_by_source: {} };

  const spans = [];
  let m;
  // Reset regex state for each call.
  SOURCE_SPAN_RE.lastIndex = 0;
  while ((m = SOURCE_SPAN_RE.exec(evalText)) !== null) {
    spans.push({ raw: m[0], source: m[1], detail: m[2] || '' });
  }

  const broken = [];
  const bySource = {};

  for (const span of spans) {
    const { raw, source, detail } = span;
    bySource[source] = bySource[source] || [];

    // Generic refs — always valid by convention
    if (['jd', 'grok', 'network', 'comp', 'priors'].includes(source.toLowerCase()) && !detail) {
      bySource[source].push({ raw, valid: true, generic: true });
      continue;
    }

    // priors:#N — tracker row reference
    if (source.toLowerCase() === 'priors' && detail.startsWith('#')) {
      const nums = detail.split(',').map(s => s.replace(/^#/, '').trim());
      const trackerPath = join(ROOT, 'data/applications.md');
      if (!existsSync(trackerPath)) {
        broken.push({ span: raw, reason: 'applications.md not found' });
        continue;
      }
      const text = readFileSync(trackerPath, 'utf-8');
      let allValid = true;
      for (const n of nums) {
        const re = new RegExp(`^\\|\\s*${n}\\s*\\|`, 'm');
        if (!re.test(text)) {
          allValid = false;
          broken.push({ span: raw, reason: `tracker row #${n} not found in applications.md` });
        }
      }
      bySource[source].push({ raw, valid: allValid });
      continue;
    }

    // File:line reference — check file exists + line numbers in bounds + non-blank
    if (detail.match(/L?\d+/)) {
      const filePath = join(ROOT, source);
      if (!existsSync(filePath)) {
        broken.push({ span: raw, reason: `file ${source} not found in repo` });
        bySource[source].push({ raw, valid: false });
        continue;
      }
      const lines = readFileSync(filePath, 'utf-8').split('\n');
      // Parse line numbers: L42, 42, L42-L48, 42-48
      const range = detail.replace(/L/gi, '').split('-').map(s => parseInt(s, 10));
      const start = range[0];
      const end = range[1] || start;
      if (isNaN(start) || start < 1 || start > lines.length) {
        broken.push({ span: raw, reason: `line ${start} out of bounds (${source} has ${lines.length} lines)` });
        bySource[source].push({ raw, valid: false });
        continue;
      }
      if (end < start || end > lines.length) {
        broken.push({ span: raw, reason: `range end ${end} out of bounds (${source} has ${lines.length} lines)` });
        bySource[source].push({ raw, valid: false });
        continue;
      }
      // Check non-blank
      const cited = lines.slice(start - 1, end).join('\n').trim();
      if (cited.length === 0) {
        broken.push({ span: raw, reason: `cited lines ${start}-${end} of ${source} are blank` });
        bySource[source].push({ raw, valid: false });
        continue;
      }
      bySource[source].push({ raw, valid: true, lines: [start, end], excerpt: cited.slice(0, 200) });
      continue;
    }

    // Unrecognized format — log but don't fail
    bySource[source].push({ raw, valid: true, note: 'unrecognized format, treated as generic' });
  }

  const totalCitations = spans.length;
  const validCitations = totalCitations - broken.length;

  return {
    ok:                  broken.length === 0,
    total_citations:     totalCitations,
    valid_citations:     validCitations,
    broken_citations:    broken,
    citations_by_source: bySource,
  };
}

// CLI smoke test
if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = `
SCORE: 4.3
ARCHETYPE: A2
DECISION: APPLY

Mitchell's xGE comms triage agent [cv.md:L39-L42] and Voice DNA RAG pipeline
[article-digest.md:L14] are direct production-AI proof points for this role.
Prior Anthropic evals [priors:#002,#1199] show consistent A2 archetype fit.
The JD's "frontier lab safety" angle [JD] aligns with the Comms Triage
methodology. Grok intel [grok] confirms hiring scope through Q3.

⚠ Hallucinated reference: [cv.md:L9999]
⚠ Wrong file: [imaginary.md:L1]
⚠ Bad prior: [priors:#99999]
`;
  console.log(JSON.stringify(validateCitations(sample), null, 2));
}
