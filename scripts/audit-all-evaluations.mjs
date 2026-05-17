#!/usr/bin/env node
/**
 * scripts/audit-all-evaluations.mjs — Block-completeness audit for high-scoring evals.
 *
 * Item #3 of the 2026-05-16 incomplete-task review. Loops every row in
 * data/applications.md with score ≥ THRESHOLD (default 4.0), locates the
 * linked report file, and checks for the seven required blocks (A–G per
 * modes/oferta.md) plus the URL + Legitimacy header fields. Outputs a
 * sortable markdown table to data/audit-evaluations-{ts}.md.
 *
 * Usage:
 *   node scripts/audit-all-evaluations.mjs
 *   node scripts/audit-all-evaluations.mjs --threshold 3.5
 *   node scripts/audit-all-evaluations.mjs --out data/my-audit.md
 *   node scripts/audit-all-evaluations.mjs --fix-suggestions
 *
 * Verdicts:
 *   ✅ complete    — 0 missing blocks/fields
 *   ⚠️  minor      — 1–2 missing
 *   🚩 thin       — ≥3 missing
 *
 * Pure reader — does not modify any reports or the tracker. Output file is
 * the only side effect (gitignored under data/).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseApplicationsFile } from '../lib/parse-applications.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Args ──────────────────────────────────────────────────────────
const ARGS = parseArgs(process.argv.slice(2));
const THRESHOLD = parseFloat(ARGS.threshold ?? '4.0');
const FIX_SUGGESTIONS = ARGS['fix-suggestions'] === true || ARGS['fix-suggestions'] === 'true';
const TS_SLUG = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_FILE = ARGS.out ?? join(ROOT, `data/audit-evaluations-${TS_SLUG}.md`);

const APPLICATIONS_FILE = join(ROOT, 'data/applications.md');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}

// ── Block-presence checks ─────────────────────────────────────────
// Each report block has multiple acceptable heading variants (English +
// Spanish — modes/oferta.md is Spanish, modes/_shared.md has English).
// We accept ANY variant: if the eval ran via either path, we count it.
const BLOCK_PATTERNS = {
  A: [
    /^##\s*A\)\s*Role Summary/im,
    /^##\s*A\)\s*Resumen del Rol/im,
    /^##\s*Bloque A\b/im,
    /^##\s*A\b.*Role Summary/im,
  ],
  B: [
    /^##\s*B\)\s*CV Match/im,
    /^##\s*B\)\s*Match con CV/im,
    /^##\s*Bloque B\b/im,
  ],
  C: [
    /^##\s*C\)\s*Level (and|&) Strategy/im,
    /^##\s*C\)\s*Nivel y Estrategia/im,
    /^##\s*C\)\s*Level Strategy/im,
    /^##\s*Bloque C\b/im,
  ],
  D: [
    /^##\s*D\)\s*Comp/im,
    /^##\s*D\)\s*Compensa/im,  // Compensación
    /^##\s*Bloque D\b/im,
  ],
  E: [
    /^##\s*E\)\s*Personaliz/im, // Personalization / Personalización
    /^##\s*E\)\s*Plan de Personalizaci/im,
    /^##\s*Bloque E\b/im,
  ],
  F: [
    /^##\s*F\)\s*Interview/im,
    /^##\s*F\)\s*Plan de Entrevista/im,
    /^##\s*F\)\s*STAR/im,
    /^##\s*Bloque F\b/im,
  ],
  G: [
    /^##\s*G\)\s*Posting Legitimacy/im,
    /^##\s*G\)\s*Legitimacy/im,
    /^##\s*Bloque G\b/im,
  ],
  // Council-eval schema (introduced by lib/eval-council.mjs in late 2026-05).
  // The newer council reports COLLAPSE the legacy A-G structure into:
  //   Bloque A (Resumen del Rol) + Bloque B (Match con CV) + Block H/I/J
  // — they intentionally skip C-G because the council brief format folds level/
  // comp/personalization/STAR/legitimacy into A+B's narrative + H/I/J
  // (citation audit / dissent / intel pack). These reports are NOT thin —
  // they're a different schema.
  H: [/^##\s*Block H\b/im, /^##\s*Bloque H\b/im],
  I: [/^##\s*Block I\b/im, /^##\s*Bloque I\b/im],
  J: [/^##\s*Block J\b/im, /^##\s*Bloque J\b/im],
};

// Detect which schema this report uses. Reports with explicit Block H/I/J
// headers are council-eval; everything else is legacy A-G.
function detectSchema(text) {
  const hasH = BLOCK_PATTERNS.H.some(p => p.test(text));
  const hasI = BLOCK_PATTERNS.I.some(p => p.test(text));
  const hasJ = BLOCK_PATTERNS.J.some(p => p.test(text));
  if (hasH || hasI || hasJ) return 'council';
  return 'legacy';
}

// Block A also needs a numeric comp signal — gate this separately so a thin
// "Role Summary" with no comp data is flagged. We look at any line within the
// first ~3000 chars of Block A for a $ amount or "TC", "comp", "salary" near digits.
function hasCompSignal(blockText) {
  if (!blockText) return false;
  // Accept $123K, $123,456, $123-$456K ranges, or "Listed: $..." patterns.
  return /\$\s*\d/.test(blockText) || /\b\d{2,3}K\b/i.test(blockText);
}

// Slice the text under a heading until the next ## or EOF.
function sliceBlock(text, headingPattern) {
  const m = text.match(headingPattern);
  if (!m) return '';
  const start = m.index + m[0].length;
  const remaining = text.slice(start);
  const nextH = remaining.match(/^##\s/m);
  return nextH ? remaining.slice(0, nextH.index) : remaining;
}

function matchAny(text, patterns) {
  return patterns.some(p => p.test(text));
}

function findBlockText(text, blockKey) {
  for (const p of BLOCK_PATTERNS[blockKey]) {
    if (p.test(text)) return sliceBlock(text, p);
  }
  return '';
}

function checkReport(path) {
  if (!existsSync(path)) {
    return {
      exists: false,
      missing: ['(report file not found)'],
      missingCount: 99,
      verdict: 'missing',
    };
  }
  const text = readFileSync(path, 'utf-8');

  // Header fields (first 50 lines is plenty)
  const header = text.split('\n').slice(0, 60).join('\n');
  const hasUrl = /^\*\*URL:\*\*/m.test(header);
  const hasLegit = /^\*\*Legitimacy:\*\*/m.test(header);

  // Schema-aware block presence check. Legacy reports get A-G; council-eval
  // reports get A+B+H+I+J. Comp-signal check adapts to whichever blocks exist.
  const schema = detectSchema(text);
  const requiredBlocks = schema === 'council'
    ? ['A', 'B', 'H', 'I', 'J']
    : ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  // Comp signal can live in A or D (legacy) or A or B (council — Bloque B
  // includes the comp narrative since C-G are folded into it).
  const compFallbackBlock = schema === 'council' ? 'B' : 'D';

  const missing = [];
  for (const blockKey of requiredBlocks) {
    const has = matchAny(text, BLOCK_PATTERNS[blockKey]);
    if (!has) {
      missing.push(`Block ${blockKey}`);
      continue;
    }
    if (blockKey === 'A') {
      const aText = findBlockText(text, 'A');
      if (!hasCompSignal(aText)) {
        // Comp signal may live in the schema's fallback block — only flag if BOTH lack it.
        const fbText = findBlockText(text, compFallbackBlock);
        if (!hasCompSignal(fbText)) {
          missing.push(`Block A (no comp signal in A or ${compFallbackBlock})`);
        }
      }
    }
  }

  if (!hasUrl)   missing.push('**URL:** header');
  if (!hasLegit) missing.push('**Legitimacy:** header');

  const missingCount = missing.length;
  const verdict =
    missingCount === 0   ? 'complete' :
    missingCount <= 2    ? 'minor'    :
    'thin';

  return { exists: true, missing, missingCount, verdict };
}

// ── Fix suggestions per missing-block pattern ─────────────────────
function suggestFix(row, missing) {
  const missingBlocks = missing.filter(m => /^Block /.test(m));
  const headerMissing = missing.filter(m => /header$/.test(m));
  const hints = [];
  if (missingBlocks.length >= 3) {
    hints.push(`Re-run full eval: \`node batch-runner-batches.mjs submit --limit=1\` after re-queueing in batch/triage-advance.tsv with this URL`);
  } else if (missingBlocks.length > 0) {
    hints.push(`Patch missing block${missingBlocks.length === 1 ? '' : 's'} (${missingBlocks.join(', ')}) — Phase E diff path or sibling-report graft from another ${row.company} eval`);
  }
  if (headerMissing.length > 0) {
    hints.push(`Manual edit: add ${headerMissing.join(' and ')} to report header (search prior reports for canonical format)`);
  }
  if (missing.includes('Block A (no comp signal in A or D)')) {
    hints.push(`Add comp band manually — usually visible on JD or via Levels.fyi for the company`);
  }
  return hints.length ? hints.join(' · ') : '(no automated suggestion — review manually)';
}

// ── Main ──────────────────────────────────────────────────────────
function main() {
  if (!existsSync(APPLICATIONS_FILE)) {
    console.error(`❌ ${APPLICATIONS_FILE} not found`);
    process.exit(1);
  }

  const allRows = parseApplicationsFile(APPLICATIONS_FILE);
  const eligible = allRows.filter(r => r.score >= THRESHOLD && r.reportPath);

  if (eligible.length === 0) {
    console.log(`No rows with score >= ${THRESHOLD} found in ${APPLICATIONS_FILE}`);
    process.exit(0);
  }

  console.log(`\nAuditing ${eligible.length} rows with score >= ${THRESHOLD}…\n`);

  // Run the audit
  const results = eligible.map(row => {
    const reportFull = join(ROOT, row.reportPath);
    const audit = checkReport(reportFull);
    return { row, audit };
  });

  // Sort: 🚩 thin first → ⚠️ minor → ✅ complete; tie-break by score desc, then number desc
  const verdictOrder = { thin: 0, missing: 0, minor: 1, complete: 2 };
  results.sort((a, b) => {
    const va = verdictOrder[a.audit.verdict] ?? 99;
    const vb = verdictOrder[b.audit.verdict] ?? 99;
    if (va !== vb) return va - vb;
    if (b.row.score !== a.row.score) return b.row.score - a.row.score;
    return b.row.num - a.row.num;
  });

  // Summary counts
  const complete = results.filter(r => r.audit.verdict === 'complete').length;
  const minor    = results.filter(r => r.audit.verdict === 'minor').length;
  const thin     = results.filter(r => r.audit.verdict === 'thin').length;
  const missing  = results.filter(r => r.audit.verdict === 'missing').length;

  // Build markdown
  const md = [];
  md.push(`# Evaluation completeness audit — ${new Date().toISOString().slice(0, 10)}`);
  md.push('');
  md.push(`_Audit run: ${new Date().toISOString()}_`);
  md.push(`_Source: \`data/applications.md\` (${allRows.length} total rows)_`);
  md.push(`_Threshold: score ≥ ${THRESHOLD.toFixed(1)} (${eligible.length} rows audited)_`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`- ✅ complete:  **${complete}** (${pct(complete, results.length)}%)`);
  md.push(`- ⚠️  minor gaps: **${minor}** (${pct(minor, results.length)}%) — 1–2 missing items`);
  md.push(`- 🚩 thin:       **${thin}** (${pct(thin, results.length)}%) — ≥3 missing items`);
  if (missing > 0) md.push(`- ❓ report file missing: **${missing}** — broken link in tracker`);
  md.push('');
  md.push('## Verdict definitions');
  md.push('');
  md.push('| Verdict | Threshold | Action |');
  md.push('|---|---|---|');
  md.push('| ✅ complete | 0 missing | none |');
  md.push('| ⚠️  minor    | 1–2 missing | patch missing blocks/fields manually or via Phase E diff |');
  md.push('| 🚩 thin     | ≥3 missing | re-run eval via batch-runner-batches.mjs |');
  md.push('| ❓ missing  | report file unreadable | fix tracker link or restore from git |');
  md.push('');
  md.push('## Audit table');
  md.push('');
  if (FIX_SUGGESTIONS) {
    md.push('| # | Company | Role | Score | Verdict | Missing | Suggested fix |');
    md.push('|---|---------|------|-------|---------|---------|---------------|');
  } else {
    md.push('| # | Company | Role | Score | Verdict | Missing |');
    md.push('|---|---------|------|-------|---------|---------|');
  }
  for (const { row, audit } of results) {
    const verdictGlyph = {
      complete: '✅ complete',
      minor:    '⚠️ minor',
      thin:     '🚩 thin',
      missing:  '❓ missing',
    }[audit.verdict] || '?';
    const missingStr = audit.missing.length ? audit.missing.join(', ') : '—';
    const role  = (row.role || '').replace(/\|/g, '\\|').slice(0, 70);
    const company = (row.company || '').replace(/\|/g, '\\|');
    const reportLink = `[${row.num}](${row.reportPath})`;
    if (FIX_SUGGESTIONS && audit.verdict === 'thin') {
      const fix = suggestFix(row, audit.missing).replace(/\|/g, '\\|');
      md.push(`| ${reportLink} | ${company} | ${role} | ${row.score.toFixed(1)} | ${verdictGlyph} | ${missingStr} | ${fix} |`);
    } else if (FIX_SUGGESTIONS) {
      md.push(`| ${reportLink} | ${company} | ${role} | ${row.score.toFixed(1)} | ${verdictGlyph} | ${missingStr} | — |`);
    } else {
      md.push(`| ${reportLink} | ${company} | ${role} | ${row.score.toFixed(1)} | ${verdictGlyph} | ${missingStr} |`);
    }
  }
  md.push('');
  md.push('## Notes');
  md.push('');
  md.push('- Block detection accepts English (`## A) Role Summary`) and Spanish (`## A) Resumen del Rol`) variants.');
  md.push('- Block A is flagged if neither A nor D contains a `$NNK` or `$NNN,NNN` comp signal.');
  md.push('- `**URL:**` and `**Legitimacy:**` are checked in the first 60 header lines only.');
  md.push('- Re-run after fixes: `node scripts/audit-all-evaluations.mjs --threshold ' + THRESHOLD.toFixed(1) + '`');

  // Write output
  if (!existsSync(dirname(OUT_FILE))) mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, md.join('\n') + '\n');

  // Console summary
  console.log(`${'─'.repeat(60)}`);
  console.log(`Audited:         ${results.length} rows (score >= ${THRESHOLD})`);
  console.log(`✅ complete:     ${complete}`);
  console.log(`⚠️  minor gaps:  ${minor}`);
  console.log(`🚩 thin:         ${thin}`);
  if (missing > 0) console.log(`❓ missing file: ${missing}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Output: ${OUT_FILE}`);
  if (FIX_SUGGESTIONS) console.log(`(fix suggestions enabled for 🚩 thin rows)`);
}

function pct(n, total) {
  if (!total) return '0';
  return ((n / total) * 100).toFixed(0);
}

main();
