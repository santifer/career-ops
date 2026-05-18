#!/usr/bin/env node

/**
 * scripts/cv-assemble-tailored.mjs — assemble a full tailored-cv.md from
 * cv-tailor's bullet ledger + master cv.md (Phase 4.1 Item K long-term fix,
 * 2026-05-18).
 *
 * Bridges the structural gap between:
 *   - cv-tailor.mjs → emits a BULLET LEDGER at
 *     data/apply-packs/<padded-slug>/cv-tailored.md (highlights + top-N
 *     tailored bullets with [cv.md:N] citations + summary + warnings)
 *   - consumers (build-apply-packs.mjs, dashboard, the Typst renderer)
 *     expect a FULL CV MARKDOWN at apply-pack/<slug>/tailored-cv.md
 *
 * Assembly steps for each row:
 *   1. Read master cv.md.
 *   2. Read the ledger from data/apply-packs/<padded-companySlug-roleSlug>/cv-tailored.md.
 *   3. Parse the ledger's `## Highlights` section → 4-6 highlight strings.
 *   4. Parse the ledger's `## Tailored Bullets` section → array of
 *      { text, cv_ref } where cv_ref looks like `cv.md:N`.
 *   5. For each tailored bullet whose cv_ref points to an existing bullet
 *      line in master cv.md: replace the original bullet (and its indented
 *      continuation lines) with the tailored text.
 *   6. Insert a new `## Highlights` H2 section between `## Summary` and the
 *      next horizontal-rule break. The Typst renderer reads this section
 *      and emits the {{HIGHLIGHTS}} pull-quote box.
 *   7. Write the result to apply-pack/<slug>/tailored-cv.md.
 *   8. Optionally render Typst PDF.
 *
 * Cost: zero. No LLM calls — pure file assembly from already-paid-for ledger.
 *
 * CLI:
 *   node scripts/cv-assemble-tailored.mjs --row 48
 *   node scripts/cv-assemble-tailored.mjs --row 48 --no-render  # skip PDF
 *   node scripts/cv-assemble-tailored.mjs --all                  # every pack with a ledger
 *   node scripts/cv-assemble-tailored.mjs --row 48 --dry-run    # print to stdout
 *
 * Exit: 0 on success, 1 if any row failed.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveRoot() {
  const parent = dirname(__dirname);
  if (existsSync(join(parent, 'cv.md')) || existsSync(join(parent, 'AGENTS.md'))) return parent;
  return process.cwd();
}
const ROOT = resolveRoot();

function parseArgs(argv) {
  const a = { row: null, all: false, render: true, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--row' && argv[i + 1]) { a.row = Number(argv[++i]); continue; }
    if (argv[i] === '--all') { a.all = true; continue; }
    if (argv[i] === '--no-render') { a.render = false; continue; }
    if (argv[i] === '--dry-run') { a.dryRun = true; continue; }
  }
  return a;
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve a row id → { company, role, applyPackSlug, ledgerPath }
 */
function resolveRow(rowId) {
  const appsMd = readFileSync(join(ROOT, 'data/applications.md'), 'utf-8');
  let company = '', role = '';
  for (const line of appsMd.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cols = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    if (cols.length < 9 || cols[0] !== String(rowId)) continue;
    company = cols[2];
    role = cols[3];
    break;
  }
  if (!company) throw new Error(`Row ${rowId} not found in applications.md`);

  // Locate the apply-pack/<slug> directory. When multiple variants share a
  // row number (e.g. row 59 has Sierra DRE × {SF, NYC, London}), prefer the
  // variant whose slug matches the role from applications.md.
  const applyPackDir = join(ROOT, 'apply-pack');
  const dirs = readdirSync(applyPackDir).filter(d =>
    statSync(join(applyPackDir, d)).isDirectory()
  );
  const padded = rowId < 100 ? String(rowId).padStart(3, '0') : String(rowId);
  const candidates = dirs.filter(d =>
    d.startsWith(`${padded}-`) || d.startsWith(`${rowId}-`)
  );
  const roleSlug = slugify(role);
  // Best match: dir whose name contains the role slug as a contiguous substring.
  // Fall back: first matching candidate (alphabetical).
  const applyPackSlug =
    candidates.find(d => d.endsWith(`-${roleSlug}`)) ||
    candidates.find(d => d.includes(`-${roleSlug}`)) ||
    candidates[0];

  // Locate the ledger at data/apply-packs/<padded>-<companySlug>-<roleSlug>/cv-tailored.md.
  const ledgerSlug = `${padded}-${slugify(company)}-${slugify(role)}`;
  const ledgerPath = join(ROOT, 'data', 'apply-packs', ledgerSlug, 'cv-tailored.md');

  return { rowId, company, role, applyPackSlug, ledgerSlug, ledgerPath };
}

/**
 * Parse a ledger markdown file. Returns { highlights, bullets, summary, warnings }.
 *   highlights: string[]
 *   bullets: { text, cv_ref }[]
 *   summary: string
 *   warnings: string[]
 */
function parseLedger(text) {
  const sections = {};
  let current = null;
  for (const raw of text.split('\n')) {
    const h2 = raw.match(/^##\s+(.+)$/);
    if (h2) {
      current = h2[1].trim().toLowerCase();
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(raw);
  }

  const highlights = (sections['highlights'] || [])
    .filter(l => /^\s*[-*]\s+/.test(l))
    .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);

  const bullets = [];
  for (const l of (sections['tailored bullets'] || [])) {
    if (!/^\s*[-*]\s+/.test(l)) continue;
    const body = l.replace(/^\s*[-*]\s+/, '');
    // Match a trailing `[cv.md:N]` citation; tolerate trailing punctuation.
    const m = body.match(/^(.*?)\s*\[cv\.md:(\d+)\]\s*$/);
    if (m) {
      bullets.push({ text: m[1].trim(), cv_ref: `cv.md:${m[2]}`, line: Number(m[2]) });
    } else {
      bullets.push({ text: body.trim(), cv_ref: null, line: null });
    }
  }

  const summary = (sections['summary'] || []).join(' ').replace(/\s+/g, ' ').trim();
  const warnings = (sections['warnings'] || [])
    .filter(l => /^\s*[-*]\s+/.test(l))
    .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);

  return { highlights, bullets, summary, warnings };
}

/**
 * Replace a multi-line bullet block in cv.md starting at line index `idx`
 * (1-based) with new bullet text. A bullet block is:
 *   - "First bullet line\n"
 *   - "  continuation 1\n"
 *   - "  continuation 2\n"   (zero or more)
 * Returns { newLines, removedCount }.
 */
function replaceBulletAt(cvLines, idx, newText) {
  if (idx < 1 || idx > cvLines.length) return { newLines: cvLines, removedCount: 0 };
  const startIndex = idx - 1; // 0-based
  const startLine = cvLines[startIndex];
  if (!/^\s*[-*]\s+/.test(startLine)) return { newLines: cvLines, removedCount: 0 };

  // Capture the indent (e.g. "- " or "  - ") for the new bullet.
  const indentMatch = startLine.match(/^(\s*[-*]\s+)/);
  const bulletPrefix = indentMatch ? indentMatch[1] : '- ';

  // Find the end of the bullet block: continuation lines start with whitespace
  // (more indented than the bullet marker).
  let endIndex = startIndex;
  for (let i = startIndex + 1; i < cvLines.length; i++) {
    const next = cvLines[i];
    if (next.trim() === '') break;          // blank line ends the block
    if (/^\s*[-*]\s+/.test(next)) break;     // next bullet starts
    if (/^\S/.test(next)) break;             // non-bullet line at column 0 ends block
    endIndex = i;
  }

  const removedCount = endIndex - startIndex + 1;
  const newBullet = `${bulletPrefix}${newText}`;
  const newLines = [
    ...cvLines.slice(0, startIndex),
    newBullet,
    ...cvLines.slice(endIndex + 1),
  ];
  return { newLines, removedCount };
}

/**
 * Insert a `## Highlights` H2 section into cv.md immediately after the
 * `## Summary` section (between the summary paragraph and the next `---`
 * horizontal rule). If no `## Summary` section exists, insert after the H1.
 */
function insertHighlightsSection(cvLines, highlights) {
  if (!highlights.length) return cvLines;
  const block = ['', '## Highlights', '', ...highlights.map(h => `- ${h}`), '', '---', ''];

  // Find the `## Summary` header.
  let summaryIdx = cvLines.findIndex(l => /^##\s+summary\b/i.test(l));
  if (summaryIdx < 0) {
    // Insert after H1.
    const h1Idx = cvLines.findIndex(l => /^#\s+/.test(l));
    if (h1Idx < 0) return cvLines;
    return [...cvLines.slice(0, h1Idx + 1), ...block, ...cvLines.slice(h1Idx + 1)];
  }

  // Insert before the FIRST `---` after the summary's paragraph body.
  let insertAt = cvLines.length;
  for (let i = summaryIdx + 1; i < cvLines.length; i++) {
    if (/^---\s*$/.test(cvLines[i])) { insertAt = i; break; }
  }
  return [...cvLines.slice(0, insertAt), ...block, ...cvLines.slice(insertAt)];
}

function assemble(rowId, opts) {
  const meta = resolveRow(rowId);
  if (!meta.applyPackSlug) {
    return { rowId, ok: false, error: 'no_apply_pack_dir', meta };
  }
  if (!existsSync(meta.ledgerPath)) {
    return { rowId, ok: false, error: 'ledger_not_found', expected: meta.ledgerPath };
  }

  const cvText = readFileSync(join(ROOT, 'cv.md'), 'utf-8');
  let cvLines = cvText.split('\n');

  const ledger = parseLedger(readFileSync(meta.ledgerPath, 'utf-8'));

  let bulletsReplaced = 0;
  let bulletsMismatched = 0;
  // Sort by line number DESC so that earlier replacements don't shift indices
  // for later ones (we replace bottom-up).
  const sortedBullets = ledger.bullets
    .filter(b => b.line)
    .sort((a, b) => b.line - a.line);
  for (const b of sortedBullets) {
    const before = cvLines.length;
    const { newLines } = replaceBulletAt(cvLines, b.line, b.text);
    if (newLines.length < before) bulletsReplaced++;
    else if (newLines !== cvLines) bulletsReplaced++;
    else bulletsMismatched++;
    cvLines = newLines;
  }

  // Inject highlights after Summary.
  cvLines = insertHighlightsSection(cvLines, ledger.highlights);

  // Append a footer comment so a human reader can trace provenance. Footer
  // (not header) because the renderer scans the first 20 lines for a
  // portfolio URL and a filename in a header comment would match the URL
  // regex (e.g. cv-assemble-tailored.mjs → mis-extracted as PORTFOLIO_URL).
  const footer = [
    '',
    '<!--',
    'AUTO-ASSEMBLED — DO NOT EDIT BY HAND.',
    `Source: scripts/cv-assemble-tailored.mjs (audit Phase 4.1 Item K).`,
    `Row: ${rowId} | Company: ${meta.company} | Role: ${meta.role}.`,
    `Ledger: ${meta.ledgerPath.replace(ROOT + '/', '')}`,
    `Replaced ${bulletsReplaced} of ${ledger.bullets.length} bullets via [cv md] citations.`,
    `Highlights injected: ${ledger.highlights.length}.`,
    `Generated: ${new Date().toISOString()}.`,
    '-->',
    '',
  ].join('\n');
  const finalMd = cvLines.join('\n') + footer;

  const outPath = join(ROOT, 'apply-pack', meta.applyPackSlug, 'tailored-cv.md');

  if (opts.dryRun) {
    process.stdout.write(finalMd);
    return {
      rowId, ok: true, dryRun: true, meta, bulletsReplaced,
      bulletsTotal: ledger.bullets.length, highlights: ledger.highlights.length,
    };
  }

  writeFileSync(outPath, finalMd);

  // Render PDF via Typst if requested.
  let pdfPath = null;
  if (opts.render) {
    pdfPath = join(ROOT, 'apply-pack', meta.applyPackSlug, 'tailored-cv.pdf');
    try {
      execSync(
        `node ${JSON.stringify(join(ROOT, 'scripts', 'render-cv-typst.mjs'))} --input ${JSON.stringify(outPath)} --output ${JSON.stringify(pdfPath)}`,
        { cwd: ROOT, stdio: 'pipe' }
      );
    } catch (err) {
      return {
        rowId, ok: false, error: 'render_failed',
        details: err.message.slice(0, 240),
        consumerMd: outPath.replace(ROOT + '/', ''),
        meta, bulletsReplaced, bulletsTotal: ledger.bullets.length,
      };
    }
  }

  return {
    rowId, ok: true,
    consumerMd: outPath.replace(ROOT + '/', ''),
    consumerPdf: pdfPath ? pdfPath.replace(ROOT + '/', '') : null,
    bulletsReplaced,
    bulletsTotal: ledger.bullets.length,
    bulletsMismatched,
    highlights: ledger.highlights.length,
    summary: ledger.summary.slice(0, 200),
    warnings: ledger.warnings,
    meta: {
      company: meta.company,
      role: meta.role,
      applyPackSlug: meta.applyPackSlug,
    },
  };
}

function discoverLedgerRows() {
  // Scan data/apply-packs/*/cv-tailored.md and infer the row id from the
  // directory prefix.
  const base = join(ROOT, 'data', 'apply-packs');
  if (!existsSync(base)) return [];
  const rows = [];
  for (const d of readdirSync(base)) {
    if (!statSync(join(base, d)).isDirectory()) continue;
    if (!existsSync(join(base, d, 'cv-tailored.md'))) continue;
    const m = d.match(/^(\d+)-/);
    if (m) rows.push(Number(m[1]));
  }
  return [...new Set(rows)].sort((a, b) => a - b);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = args.all ? discoverLedgerRows() : (args.row ? [args.row] : []);
  if (rows.length === 0) {
    console.error('Usage: node scripts/cv-assemble-tailored.mjs --row N [--no-render] [--dry-run]');
    console.error('       node scripts/cv-assemble-tailored.mjs --all');
    process.exit(1);
  }

  const results = [];
  for (const r of rows) {
    try {
      const out = assemble(r, args);
      results.push(out);
      console.error(`[row ${r}] ${out.ok ? 'OK' : 'FAIL: ' + out.error} bullets=${out.bulletsReplaced || 0}/${out.bulletsTotal || 0} highlights=${out.highlights || 0}`);
    } catch (err) {
      results.push({ rowId: r, ok: false, error: 'exception', details: err.message });
      console.error(`[row ${r}] EXCEPTION: ${err.message}`);
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    rows_attempted: results.length,
    rows_ok: results.filter(r => r.ok).length,
    rows_failed: results.filter(r => !r.ok).length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.rows_failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
