#!/usr/bin/env node
/**
 * scripts/agents/voice-corpus-grower.mjs — Mitchell voice-corpus growth pipeline.
 *
 * Design source: refresh-master Phase 4 deliverable 5. DELTA's morning-handoff
 * 2026-05-19 flagged that the 5-sample voice corpus is statistically insufficient
 * (Sadasivan 2023 + RAID + Liang 2023 all require hundreds-to-thousands). This
 * script mines additional verified-Mitchell writing samples from local sources
 * and proposes them for inclusion in lib/voice-corpus.mjs.
 *
 * Sources (in priority order):
 *   1. data/linkedin/outreach/*.md — Mitchell's actual sent LinkedIn DMs
 *   2. data/applications.md "notes" column — short authored snippets
 *   3. apply-pack archive: data/apply-packs/<slug>/cover-letter.md (HUMAN-EDITED-AT
 *      flag presence indicates Mitchell took the draft + made it his)
 *   4. data/cv-archives/cv-*.md (his own CV in past versions)
 *   5. data/autobiography-project/*.md (long-form Mitchell prose)
 *
 * Cadence: monthly via launchd (or manual `--run`).
 * Output: data/voice-corpus-growth-{date}.md with proposed new exemplars.
 *
 * Does NOT auto-edit lib/voice-corpus.mjs — that's Mitchell-only territory.
 * Writes a NEEDS-APPROVAL proposal to data/omega-proposals-{date}.md
 * (appended) for OMEGA review.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OUTPUT_DIR = join(REPO_ROOT, 'data');

const argv = process.argv.slice(2);
const isRun = argv.includes('--run');
const limit = (() => {
  const i = argv.indexOf('--limit');
  return i >= 0 ? parseInt(argv[i + 1], 10) || 50 : 50;
})();

function readLinesIfExists(p) {
  if (!existsSync(p)) return [];
  try { return readFileSync(p, 'utf8').split('\n'); } catch { return []; }
}

function walkDir(dir, predicate) {
  if (!existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (predicate(e.name, p)) out.push(p);
    }
  }
  return out;
}

function* sampleSentences(text, opts = {}) {
  // Heuristic: pull sentences that are >= 12 words and <= 50 words, no all-caps,
  // no markdown headers, no "Returns" / "@param" doc syntax.
  const lines = String(text || '').split(/\n+/);
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    if (s.startsWith('#') || s.startsWith('-') || s.startsWith('*') || s.startsWith('|')) continue;
    if (s.startsWith('```') || s.includes('```')) continue;
    if (s.includes('@param') || s.includes('Returns:')) continue;
    if (s === s.toUpperCase()) continue;
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length < 12 || words.length > 50) continue;
    if (s.length > 400) continue;
    yield s;
  }
}

function hashSample(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

async function mineCandidates() {
  const candidates = [];

  // 1. LinkedIn outreach (highest signal — Mitchell wrote these himself)
  const linkedinDir = join(REPO_ROOT, 'data', 'linkedin', 'outreach');
  const linkedinFiles = walkDir(linkedinDir, (n) => n.endsWith('.md'));
  for (const f of linkedinFiles.slice(0, 30)) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const s of sampleSentences(text)) {
      candidates.push({ source: f.replace(REPO_ROOT + '/', ''), source_type: 'linkedin_outreach', text: s, length_words: s.split(/\s+/).length });
    }
  }

  // 2. Apply-pack archives (cover letters Mitchell edited)
  const applyPacksDir = join(REPO_ROOT, 'data', 'apply-packs');
  const coverLetters = walkDir(applyPacksDir, (n) => n === 'cover-letter.md');
  for (const f of coverLetters.slice(0, 20)) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    if (!text.includes('HUMAN-EDITED-AT') && !text.includes('mitchell:')) continue; // require Mitchell-edit flag
    for (const s of sampleSentences(text)) {
      candidates.push({ source: f.replace(REPO_ROOT + '/', ''), source_type: 'apply_pack_cover_letter', text: s, length_words: s.split(/\s+/).length });
    }
  }

  // 3. CV archives
  const cvArchivesDir = join(REPO_ROOT, 'data', 'cv-archives');
  if (existsSync(cvArchivesDir)) {
    for (const f of readdirSync(cvArchivesDir).filter(n => n.endsWith('.md')).slice(0, 5)) {
      const text = readFileSync(join(cvArchivesDir, f), 'utf8');
      for (const s of sampleSentences(text)) {
        candidates.push({ source: `data/cv-archives/${f}`, source_type: 'cv_archive', text: s, length_words: s.split(/\s+/).length });
      }
    }
  }

  // 4. Autobiography project
  const autoDir = join(REPO_ROOT, 'data', 'autobiography-project');
  if (existsSync(autoDir)) {
    for (const f of walkDir(autoDir, (n) => n.endsWith('.md')).slice(0, 10)) {
      const text = readFileSync(f, 'utf8');
      for (const s of sampleSentences(text)) {
        candidates.push({ source: f.replace(REPO_ROOT + '/', ''), source_type: 'autobiography', text: s, length_words: s.split(/\s+/).length });
      }
    }
  }

  // Dedup by hash
  const seen = new Set();
  const deduped = [];
  for (const c of candidates) {
    const h = hashSample(c.text);
    if (seen.has(h)) continue;
    seen.add(h);
    deduped.push({ ...c, hash: h });
  }

  return deduped.slice(0, limit);
}

async function main() {
  if (!isRun) {
    console.log('usage: --run [--limit N]');
    process.exit(0);
  }
  const candidates = await mineCandidates();
  const date = new Date().toISOString().slice(0, 10);

  const reportPath = join(OUTPUT_DIR, `voice-corpus-growth-${date}.md`);
  const body = [
    `# Voice corpus growth — ${date}`,
    ``,
    `**Source distribution:**`,
    Object.entries(candidates.reduce((acc, c) => { acc[c.source_type] = (acc[c.source_type] || 0) + 1; return acc; }, {})).map(([k, v]) => `- ${k}: ${v}`).join('\n'),
    ``,
    `**Total candidate exemplars:** ${candidates.length}`,
    `**Target corpus size (per DELTA 2026-05-19):** ≥20 verified human exemplars (currently 5).`,
    ``,
    `## NEEDS-APPROVAL`,
    `Adding these exemplars to lib/voice-corpus.mjs requires Mitchell's explicit approval. Each is a sentence Mitchell authored (LinkedIn DM / CV / cover letter he hand-edited / autobiography). Review for accuracy + provenance.`,
    ``,
    `## Candidate exemplars`,
    ``,
    ...candidates.map((c, i) => [
      `### Exemplar ${i + 1} (${c.source_type}, ${c.length_words} words, hash ${c.hash})`,
      `**Source:** \`${c.source}\``,
      `> ${c.text}`,
      ``,
    ].join('\n')),
  ].join('\n');
  writeFileSync(reportPath, body);
  console.log(`Wrote ${reportPath} — ${candidates.length} candidates`);

  // Append a NEEDS-APPROVAL proposal to today's omega-proposals if it exists
  const proposalsPath = join(OUTPUT_DIR, `omega-proposals-${date}.md`);
  const proposalSnippet = `\n\n## Phase-4 voice-corpus-grower NEEDS-APPROVAL — ${date}\n\nMined ${candidates.length} candidate exemplars from local Mitchell-authored sources. Review at \`${reportPath.replace(REPO_ROOT + '/', '')}\`. Approval mechanism: append \`approve voice-corpus-grower ${date}\` to data/omega-approvals.md.\n`;
  if (existsSync(proposalsPath)) {
    try {
      writeFileSync(proposalsPath, readFileSync(proposalsPath, 'utf8') + proposalSnippet);
    } catch { /* skip */ }
  }
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
