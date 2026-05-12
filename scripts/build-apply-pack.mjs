#!/usr/bin/env node
/**
 * Build apply-pack — scaffold an apply-pack folder for a given row in applications.md.
 *
 * Reads `data/applications.md`, finds the row matching --row=N, extracts
 * company / role / score / report path, creates `apply-pack/{N}-{slug}/`
 * with stubs for cv / cover-letter / linkedin-dm / README.
 *
 * Stubs are not filled in — Mitchell uses templates from `data/tailored-resume-bullets.md`,
 * `templates/cover-letter-template.md`, and `data/outreach-templates.md` to fill them.
 *
 * Usage:
 *   node scripts/build-apply-pack.mjs --row=48
 *   node scripts/build-apply-pack.mjs --row=48 --force   # overwrite existing folder
 *
 * Exit codes:
 *   0 — apply-pack created or already-exists (idempotent)
 *   1 — row not found in applications.md
 *   2 — row exists but score < 4.0 (per ethical invariants)
 *   3 — bad arguments
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TRACKER = join(ROOT, 'data/applications.md');
const APPLY_PACK_ROOT = join(ROOT, 'apply-pack');

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const ROW = parseInt(args.row, 10);
const FORCE = !!args.force;

if (!ROW || Number.isNaN(ROW)) {
  console.error('Usage: node scripts/build-apply-pack.mjs --row=N [--force]');
  process.exit(3);
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function findRow(rowNum) {
  const lines = readFileSync(TRACKER, 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cols = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    if (cols.length < 9) continue;
    const num = parseInt(cols[0], 10);
    if (num !== rowNum) continue;
    const scoreMatch = cols[4].match(/(\d+(?:\.\d+)?)\/5/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    const linkMatch = cols[7].match(/\[(\d+)\]\(([^)]+\.md)\)/);
    return {
      num,
      date: cols[1],
      company: cols[2],
      role: cols[3],
      score,
      status: cols[5],
      pdf: cols[6],
      reportNum: linkMatch ? linkMatch[1] : '',
      reportPath: linkMatch ? linkMatch[2] : '',
      notes: cols[8],
    };
  }
  return null;
}

const row = findRow(ROW);
if (!row) {
  console.error(`Row #${ROW} not found in ${TRACKER}`);
  process.exit(1);
}

if (row.score < 4.0) {
  console.error(`Row #${ROW} (${row.company} — ${row.role}) has score ${row.score}/5, below the 4.0 floor.`);
  console.error('Per ethical invariants, applications below 4.0 require explicit override.');
  console.error('To override, run with --force (and document the override in the tracker Notes column).');
  if (!FORCE) process.exit(2);
}

const folderSlug = `${String(ROW).padStart(3, '0')}-${slugify(row.company + '-' + row.role)}`;
const folder = join(APPLY_PACK_ROOT, folderSlug);

if (existsSync(folder) && !FORCE) {
  console.log(`Apply-pack already exists at: ${folder}`);
  console.log('Use --force to overwrite. Skipping.');
  process.exit(0);
}

mkdirSync(folder, { recursive: true });

// README.md — entry point for the apply-pack
const readmePath = join(folder, 'README.md');
const readme = `# Apply Pack — ${row.company} — ${row.role}

**Row in tracker:** #${ROW}
**Score:** ${row.score}/5
**Evaluated:** ${row.date}
**Status:** ${row.status}
**Report:** [${row.reportNum}](../../${row.reportPath})

---

## Files in this pack

- \`cv-mitchell-williams.html\` — tailored CV (HTML source). Generate PDF: \`node ../../generate-pdf.mjs --in=cv-mitchell-williams.html --out=cv-mitchell-williams.pdf\`
- \`cover-letter.md\` — cover letter draft. Use \`templates/cover-letter-template.md\` as the base.
- \`linkedin-dm.md\` — LinkedIn DM / cold email draft. Use \`data/outreach-templates.md\` Variant A/B/C.
- \`essay-prompts.md\` — populated when the application has free-text fields.
- \`README.md\` — this file.

## Workflow

Follow [\`data/HOW-TO-APPLY.md\`](../../data/HOW-TO-APPLY.md). Specifically for this role:

1. Read [report ${row.reportNum}](../../${row.reportPath}) — Block A through G (~5 min)
2. Use the per-company guide in [\`data/tailored-resume-bullets.md\`](../../data/tailored-resume-bullets.md) for ${row.company}
3. Compose the tailored CV in \`cv-mitchell-williams.html\`. Strip \`[cv.md:L{line}]\` citations from the final text.
4. Compose the cover letter from [\`templates/cover-letter-template.md\`](../../templates/cover-letter-template.md)
5. Pick the right LinkedIn DM variant from [\`data/outreach-templates.md\`](../../data/outreach-templates.md)
6. Run [\`data/pre-flight-checklist.md\`](../../data/pre-flight-checklist.md) before submitting
7. Submit via the company portal (you click — never Claude)
8. Mark Applied via heartbeat email button or \`node scripts/mark-applied.mjs --row=${ROW}\`

## Notes from the report

${row.notes.slice(0, 500)}${row.notes.length > 500 ? '…' : ''}

[Full notes in tracker row #${ROW}](../../data/applications.md)

---

*Generated: ${new Date().toISOString()} by \`scripts/build-apply-pack.mjs --row=${ROW}\`*
`;
writeFileSync(readmePath, readme);

// cv stub
const cvPath = join(folder, 'cv-mitchell-williams.html');
if (!existsSync(cvPath) || FORCE) {
  writeFileSync(cvPath, `<!--
Tailored CV stub for ${row.company} — ${row.role}.

To build:
1. Copy templates/cv-template.html as the base
2. Use data/tailored-resume-bullets.md per-company guide for ${row.company}
3. Strip [cv.md:L{line}] citations from final bullet text
4. Generate PDF: node ../../generate-pdf.mjs --in=cv-mitchell-williams.html --out=cv-mitchell-williams.pdf
-->

<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Mitchell Williams — CV (TAILORED FOR ${row.company} — ${row.role})</title></head>
<body>
<h1>STUB — Replace with templates/cv-template.html as base</h1>
<p>Per-company guidance: see <code>data/tailored-resume-bullets.md</code> table — find <strong>${row.company}</strong> in the per-company guide.</p>
</body></html>
`);
}

// cover letter stub
const coverPath = join(folder, 'cover-letter.md');
if (!existsSync(coverPath) || FORCE) {
  writeFileSync(coverPath, `# Cover Letter — ${row.company} — ${row.role}

<!--
Use templates/cover-letter-template.md as the base.
Voice constraints from corpus/voice-profile.md apply.
350-word cap for cold submissions; 200-word cap for warm.
40% cut test must pass.
-->

[HOOK — earns attention in sentence one]

[PROOF — 1-2 STAR+R proof points from article-digest.md, with cv.md citation in your head]

[DIFFERENTIATOR — broadcast + AI angle in one sentence]

[CTA — specific, low-friction ask]

Mitchell Williams
mitwilli@gmail.com · linkedin.com/in/mitwilli · github.com/mitwilli-create
`);
}

// linkedin DM stub
const dmPath = join(folder, 'linkedin-dm.md');
if (!existsSync(dmPath) || FORCE) {
  writeFileSync(dmPath, `# LinkedIn DM — ${row.company} — ${row.role}

<!--
Use data/outreach-templates.md to pick the variant:
- Anthropic / OpenAI Comms / Editorial → Variant A
- xAI / Sierra / DevRel → Variant B
- General pre-IPO (Groq / Sierra Comms / Perplexity) → Variant C

Voice profile applies. Conversational > formal. Under 250 words.
-->

[HOOK — specific observation about ${row.company}]

[PROOF — single metric from cv.md, no citation tag in final]

[DIFFERENTIATOR]

[CTA — low-friction ask, e.g. "open to a 15-min call this week?"]

— Mitchell
`);
}

// essay-prompts stub (only created if needed; populated by hand)
const essayPath = join(folder, 'essay-prompts.md');
if (!existsSync(essayPath) || FORCE) {
  writeFileSync(essayPath, `# Essay Prompts — ${row.company} — ${row.role}

<!--
Populate this file ONLY if the application has free-text essay fields.
If REQUIRES-HUMAN-REWRITE flag fires (per modes/_profile.md §5), Mitchell hand-writes — no auto-draft.
For each prompt:
- Quote the prompt verbatim
- Note the word limit
- Pull 2-3 STAR+R candidate stories from interview-prep/story-bank.md
- Mitchell writes the answer himself
-->

(none yet — populate if the application portal asks essay questions)
`);
}

console.log(`✅ Apply-pack scaffolded: ${folder}`);
console.log('');
console.log(`Files created:`);
console.log(`  - ${readmePath}`);
console.log(`  - ${cvPath}`);
console.log(`  - ${coverPath}`);
console.log(`  - ${dmPath}`);
console.log(`  - ${essayPath}`);
console.log('');
console.log(`Next: open ${folder}/README.md and follow the workflow.`);
