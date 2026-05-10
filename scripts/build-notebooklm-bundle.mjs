#!/usr/bin/env node
/**
 * scripts/build-notebooklm-bundle.mjs
 *
 * Assembles a single concatenated markdown bundle per Apply-Now role for
 * upload to NotebookLM (consumer or Enterprise). Each bundle includes:
 *   - CV.md
 *   - The role's evaluation report
 *   - The company-specific corpus stub (corpus/companies/{slug}.md)
 *   - Article digest (proof points)
 *   - Voice reference (writing style anchor)
 *   - Cover letter template
 *   - Overpay-signals entry for the company
 *
 * Output: data/notebooklm-bundles/{rank}-{company-slug}-{role-slug}.md
 *
 * Usage:
 *   node scripts/build-notebooklm-bundle.mjs --top=3   # default
 *   node scripts/build-notebooklm-bundle.mjs --rank=1  # single role
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const QUEUE_FILE = join(ROOT, 'data/apply-now-queue.json');
const OUT_DIR = join(ROOT, 'data/notebooklm-bundles');

const args = process.argv.slice(2);
const TOP = parseInt((args.find(a => a.startsWith('--top=')) || '--top=3').split('=')[1], 10);
const SINGLE_RANK = args.find(a => a.startsWith('--rank=')) ? parseInt(args.find(a => a.startsWith('--rank=')).split('=')[1], 10) : null;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function readSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function findCompanyCorpus(company) {
  const dir = join(ROOT, 'corpus/companies');
  if (!existsSync(dir)) return null;
  const want = slug(company);
  const files = readdirSync(dir);
  // Try exact match first, then prefix
  let m = files.find(f => f === `${want}.md`);
  if (!m) m = files.find(f => f.startsWith(want.split('-')[0]));
  return m ? readSafe(join(dir, m)) : null;
}

function findOverpayBlock(company) {
  const txt = readSafe(join(ROOT, 'data/overpay-signals/CURRENT.md'));
  if (!txt) return null;
  // Each block starts with "## {Company} —" and runs to the next "## " or EOF.
  const blocks = txt.split(/^## /m);
  const want = slug(company).split('-')[0]; // first token
  const match = blocks.find(b => slug(b.split('\n')[0]).startsWith(want));
  return match ? '## ' + match.trim() : null;
}

function reportPathFromMarkdownLink(s) {
  if (!s) return null;
  const m = s.match(/\((reports\/[^)]+)\)/);
  return m ? m[1] : null;
}

function buildBundle(row) {
  const cv = readSafe(join(ROOT, 'cv.md')) || '';
  const reportPath = reportPathFromMarkdownLink(row.report);
  const report = reportPath ? readSafe(join(ROOT, reportPath)) : null;
  const corpus = findCompanyCorpus(row.company);
  const overpay = findOverpayBlock(row.company);
  const articleDigest = readSafe(join(ROOT, 'article-digest.md'));
  const voiceRef = readSafe(join(ROOT, 'writing-samples/voice-reference.md')) || readSafe(join(ROOT, 'corpus/voice-profile.md'));
  const coverTpl = readSafe(join(ROOT, 'templates/cover-letter-template.md'));
  const storyBank = readSafe(join(ROOT, 'interview-prep/story-bank.md'));

  const sections = [];
  sections.push(`# NotebookLM Briefing Bundle — ${row.company} · ${row.role}\n\n*Generated ${new Date().toISOString().slice(0,10)} for use with NotebookLM Audio Overview. Drag this single .md into a fresh NotebookLM notebook → click "Generate Audio Overview" → ~8-min commute listen.*\n\n**Role meta:** rank #${row.rank} · composite ${row.composite} · score ${row.eval_score} · status ${row.status} · evaluated ${row.eval_date}\n`);

  if (report)        sections.push(`---\n\n# §1 · Evaluation Report\n\n*Source: ${reportPath}*\n\n${report}`);
  if (overpay)       sections.push(`---\n\n# §2 · Equity / IPO Posture (Overpay-Signals Latest)\n\n${overpay}`);
  if (corpus)        sections.push(`---\n\n# §3 · Company Corpus (Positioning Context)\n\n${corpus}`);
  if (cv)            sections.push(`---\n\n# §4 · Mitchell's CV (Source of Truth — Don't Invent Beyond This)\n\n${cv}`);
  if (articleDigest) sections.push(`---\n\n# §5 · Article Digest (Proof Points)\n\n${articleDigest}`);
  if (voiceRef)      sections.push(`---\n\n# §6 · Voice Reference (Style Calibration Only)\n\n${voiceRef}`);
  if (storyBank)     sections.push(`---\n\n# §7 · Story Bank (STAR+R Stories for Interview Prep)\n\n${storyBank}`);
  if (coverTpl)      sections.push(`---\n\n# §8 · Cover Letter Template (Shape, Not Content)\n\n${coverTpl}`);

  sections.push(`---\n\n# §9 · Suggested Audio Overview Focus\n\nWhen NotebookLM generates the Audio Overview, prompt it to emphasize:\n\n1. The **equity / IPO posture** for this company specifically (per §2). What's the timing risk?\n2. The **2-3 strongest specific cv-to-role matches** (per §1 Block E + §4). Quote the cv.md line numbers if available.\n3. The **tactical lead this week** for outreach (per §2's Tactical Lead).\n4. Any **flagged risks** in the report (ANTHROPIC-POSTING / EQUITY-RISK / LATERAL-MOVE / etc.) — don't gloss over.\n5. **Negotiation posture**: based on the comp band in §1 + equity stage in §2, what's the floor and where should negotiation start?\n\nDo NOT regurgitate the CV. Synthesize what's distinctive about THIS application.\n`);

  return sections.join('\n\n');
}

const queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
const targets = SINGLE_RANK
  ? queue.ranked.filter(r => r.rank === SINGLE_RANK)
  : queue.ranked.slice(0, TOP);

if (!targets.length) {
  console.error('No matching rows in apply-now-queue.json');
  process.exit(1);
}

console.log(`[notebooklm-bundle] Building ${targets.length} bundles...\n`);
const built = [];
for (const row of targets) {
  const fname = `${String(row.rank).padStart(2,'0')}-${slug(row.company)}-${slug(row.role)}.md`;
  const fpath = join(OUT_DIR, fname);
  const content = buildBundle(row);
  writeFileSync(fpath, content);
  const sizeKb = Math.round(Buffer.byteLength(content, 'utf8') / 1024);
  console.log(`  ✓ #${row.rank} ${row.company} — ${row.role.slice(0, 60)}`);
  console.log(`    ${fpath}`);
  console.log(`    ${sizeKb} KB · ${content.split('\n').length} lines\n`);
  built.push({ row, fpath, sizeKb });
}

console.log(`[notebooklm-bundle] Done. Bundles in ${OUT_DIR}\n`);
console.log(`Next steps:`);
console.log(`  1. Open https://notebooklm.google.com (or NotebookLM Enterprise)`);
console.log(`  2. Create a new notebook per role`);
console.log(`  3. Drag the .md file in as a source`);
console.log(`  4. Click "Generate Audio Overview" → ~8-min commute briefing`);
console.log(`  5. (Optional) sync the .md files to Drive/Career-Ops/notebooklm-briefings/`);
