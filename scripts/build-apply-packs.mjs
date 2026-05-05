#!/usr/bin/env node
/**
 * build-apply-packs.mjs — generate per-role Apply Packs for the top N
 * scored Apply-Now roles in applications.md. Designed to run nightly
 * after the batch eval completes (wired into scan-unattended.mjs).
 *
 * Output per role: apply-pack/{NUM}-{company-slug}-{role-slug}/
 *   ├── README.md                     ← one-page checklist + links
 *   ├── cover-letter.md               ← drafted from eval report's
 *   │                                    "How to emphasize" hints + gap
 *   │                                    mitigations (verbatim from report)
 *   ├── pre-application-checklist.md  ← gap-closing actions
 *   ├── grok-intel.md                 ← Block D (comp) + Block G + recent
 *   │                                    web research signals
 *   ├── interview-prep-teaser.md      ← Block F STAR stories
 *   ├── linkedin/
 *   │   ├── hiring-manager.md         ← 3 DM variants
 *   │   ├── recruiter.md              ← search URL + DM template
 *   │   ├── peer-referral.md          ← non-pitch DM pattern
 *   │   └── connection-search.md      ← LinkedIn search URLs
 *   └── tailored-cv.pdf               ← symlink to /output/ if exists
 *
 * Existing packs are NOT overwritten — preserves any hand-edited content.
 * Pass --force to rebuild everything.
 *
 * Usage:
 *   node scripts/build-apply-packs.mjs                       # build top 3
 *   node scripts/build-apply-packs.mjs --top=5               # build top 5
 *   node scripts/build-apply-packs.mjs --force               # rebuild existing
 *   node scripts/build-apply-packs.mjs --num=48              # build specific row
 *   node scripts/build-apply-packs.mjs --include-todays-top  # build top N + today's #1 new role
 *
 * The unattended pipeline (scripts/batch-runner-unattended.mjs) calls this
 * with --include-todays-top so the heartbeat email's "What's New Overnight"
 * section can guarantee a fresh Apply Pack on its #1 row even when that
 * role doesn't crack the cumulative top-3.
 */

import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync,
  symlinkSync, unlinkSync, statSync,
} from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const TOP_N = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1] || '3', 10);
const SPECIFIC_NUM = args.find(a => a.startsWith('--num='))?.split('=')[1];
const INCLUDE_TODAYS_TOP = args.includes('--include-todays-top');
const TODAY = new Date().toISOString().slice(0, 10);
const FLOOR = 4.0;
const ACTIONABLE = new Set(['Evaluated', 'Responded']);

// ────────────────────────────────────────────────────────────────────
// Parsers
// ────────────────────────────────────────────────────────────────────

function parseTracker(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line.split('|').map(c => c.trim());
    const num = parseInt(cells[1], 10);
    const date = cells[2];
    const company = cells[3];
    const role = cells[4];
    const scoreMatch = (cells[5] || '').match(/(\d+(?:\.\d+)?)/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    const status = cells[6];
    const reportMatch = (cells[8] || '').match(/\(([^)]+)\)/);
    rows.push({
      num, date, company, role, score, status,
      reportPath: reportMatch ? reportMatch[1] : '',
      notes: cells[9] || '',
    });
  }
  return rows;
}

// Standard MDN regex-escape — character class with proper `]` and `\` escaping.
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Read a section from an evaluation report by H2 heading prefix.
// e.g. sectionByHeading(text, 'A)') returns everything between '## A)' and
// the next '## ' (or EOF). Implemented via split rather than regex because
// the lazy lookahead `(?=\n##\s|$)` interacts badly with the `m` flag —
// `$` matches end-of-line under `m`, causing the lazy match to terminate
// at the heading line itself.
function sectionByHeading(text, prefix) {
  const chunks = text.split(/\n##\s+/);
  for (let i = 1; i < chunks.length; i++) {
    if (chunks[i].startsWith(prefix)) {
      const body = chunks[i].split('\n').slice(1).join('\n');
      return body.trim();
    }
  }
  return '';
}

// Read a value from a markdown table row keyed by the first cell.
function tableValueByKey(blockText, key) {
  const re = new RegExp(`^\\|\\s*${escapeRe(key)}[^|]*\\|\\s*([\\s\\S]*?)\\s*\\|\\s*$`, 'mi');
  const m = blockText.match(re);
  return m ? m[1].replace(/\s*<br>\s*/g, ' ').replace(/\s+/g, ' ').replace(/\*\*/g, '').trim() : '';
}

// Pull the URL out of the report header `**URL:** ...`
function reportUrl(text) {
  const m = text.match(/\*\*URL:\*\*\s*(\S+)/);
  return m ? m[1] : '';
}

function reportHeader(text, key) {
  const re = new RegExp(`\\*\\*${key}:\\*\\*\\s*([^\\n]+)`);
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

// Top match rows from Block B (CV Match) — returns up to N highest-scoring
// JD requirements with their evidence and "How to emphasize" hint.
function topMatches(blockBText, limit = 4) {
  const rows = [];
  for (const line of blockBText.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;
    if (/^\|\s*JD\s+Requirement/i.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    const requirement = cells[0].replace(/\*\*/g, '');
    const evidence = cells[1];
    const matchCell = cells[2];
    const numMatch = matchCell.match(/(\d+(?:\.\d+)?)\s*\/\s*5/);
    const score = numMatch ? parseFloat(numMatch[1]) : 0;
    if (score < 4.0 || !requirement) continue;
    const empMatch = evidence.match(/→\s*\*?\*?How to emphasize:?\*?\*?\s*([^\n]+?)(?=\.\s*<br>|\.$|<br>|$)/i);
    const emphasize = empMatch ? empMatch[1].trim().replace(/\.$/, '') : '';
    const cleanEvidence = evidence.replace(/→\s*\*?\*?How to emphasize:?\*?\*?[^\n]+/i, '').trim();
    rows.push({ score, requirement, evidence: cleanEvidence, emphasize });
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Gap-mitigation rows from Block B's "Gaps and Mitigation" subsection.
// Handles both formats the evaluator emits (Markdown table + bulleted-per-gap).
function gapMitigations(blockBText, limit = 5) {
  const startMatch = blockBText.match(/^### (?:Gaps and Mitigation|Gaps and mitigation|Gaps & mitigation|Gap mitigation)[^\n]*$/im);
  if (!startMatch) return [];
  const rest = blockBText.slice(startMatch.index + startMatch[0].length);
  const block = rest.split(/\n##\s|\n---\s*\n/)[0];

  const rows = [];
  // Format A: table
  for (const line of block.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;
    if (/^\|\s*Gap\s*\|/i.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    rows.push({
      gap: cells[0].replace(/\*\*/g, ''),
      blocker: cells[1],
      mitigation: cells[2],
    });
  }
  // Format B: bullet-list per gap
  if (rows.length === 0) {
    const chunks = block.split(/\n(?=\*\*Gap\s+\d+:)/i);
    for (const chunk of chunks) {
      const titleMatch = chunk.match(/^\*\*Gap\s+\d+:\s+([^*\n]+)\*\*/i);
      if (!titleMatch) continue;
      const gap = titleMatch[1].trim();
      const blockerMatch = chunk.match(/[-*]\s+Hard blocker\??\s*[:?\-—]?\s*([^\n]+)/i);
      const blocker = blockerMatch ? blockerMatch[1].replace(/\*\*/g, '').slice(0, 100) : '';
      const mitMatch = chunk.match(/(?:\*\*Mitigation:\*\*|\*\*Mitigation\*\*:|^[-*]\s+\*\*Mitigation:?\*\*)\s*([\s\S]*?)(?=\n\*\*Gap\s+\d+:|\n###|\n##|$)/im);
      const mitigation = mitMatch
        ? mitMatch[1].trim().replace(/\n[-*]\s+/g, ' · ').replace(/\s+/g, ' ').slice(0, 600)
        : '';
      if (mitigation) rows.push({ gap, blocker: blocker || 'see report', mitigation });
    }
  }
  return rows.slice(0, limit);
}

// STAR stories from Block F. Each row is a record with S/T/A/R cells.
function starStories(blockFText, limit = 5) {
  const stories = [];
  for (const line of blockFText.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;
    if (/^\|\s*#\s*\|/i.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 7) continue;
    const [num, requirement, story, s, t, a, r] = cells;
    if (!story || !s) continue;
    stories.push({
      num, requirement: requirement.replace(/\*\*/g, ''), story: story.replace(/\*\*/g, ''),
      s, t, a, r,
    });
  }
  return stories.slice(0, limit);
}

function parseReport(reportPath) {
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return null;
  const text = readFileSync(fullPath, 'utf-8');
  const blockA = sectionByHeading(text, 'A)');
  const blockB = sectionByHeading(text, 'B)');
  const blockC = sectionByHeading(text, 'C)');
  const blockD = sectionByHeading(text, 'D)');
  const blockF = sectionByHeading(text, 'F)');
  const blockG = sectionByHeading(text, 'G)');

  return {
    archetype: reportHeader(text, 'Archetype'),
    score: parseFloat((reportHeader(text, 'Score') || '0').match(/(\d+\.\d+)/)?.[1] || '0'),
    legitimacy: reportHeader(text, 'Legitimacy'),
    url: reportUrl(text),
    seniority: tableValueByKey(blockA, 'Seniority'),
    locations: tableValueByKey(blockA, 'Locations'),
    remote: tableValueByKey(blockA, 'Remote policy'),
    salary: tableValueByKey(blockA, 'Listed Salary'),
    visa: tableValueByKey(blockA, 'Visa'),
    domain: tableValueByKey(blockA, 'Domain'),
    function_: tableValueByKey(blockA, 'Function'),
    tldr: tableValueByKey(blockA, 'TL;DR') || tableValueByKey(blockA, 'TLDR'),
    matches: topMatches(blockB, 4),
    gaps: gapMitigations(blockB, 5),
    starStories: starStories(blockF, 5),
    blockC, blockD, blockG, blockF,
  };
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

const slugify = (s) => (s || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const pad = (n) => String(n).padStart(3, '0');

function packDirName(role) {
  return `${pad(role.num)}-${slugify(role.company)}-${slugify(role.role)}`;
}

// LinkedIn company-id lookup from a curated map. Used to build accurate
// "currentCompany=[ID]" search URLs. Fallback to keyword search by company
// name if not in the map (works but less precise).
const LINKEDIN_COMPANY_IDS = {
  anthropic: '10906105',
  openai: '11008149',
  perplexity: '67723761',
  cohere: '34737817',
  mistralai: '94094995',
  'mistral ai': '94094995',
  elevenlabs: '76536678',
  synthesia: '13362562',
  cursor: '90376687',
  'cursor (anysphere)': '90376687',
  cognition: '102203036',
  glean: '11030139',
  sierra: '102204306',
  decagon: '94470988',
  harvey: '76925492',
  modal: '79049143',
  langchain: '88370553',
  vercel: '11241894',
  stripe: '2135371',
  notion: '20312316',
  linear: '37177490',
  figma: '4383710',
  pinecone: '70814528',
  sourcegraph: '4978041',
  replit: '7173651',
  runway: '15201919',
  'hugging face': '67843356',
  huggingface: '67843356',
  microsoft: '1035',
  amazon: '1586',
  google: '1441',
  meta: '10667',
  adobe: '1480',
  nvidia: '3608',
  netflix: '165158',
};

function linkedinCompanyId(name) {
  const key = (name || '').toLowerCase().trim();
  return LINKEDIN_COMPANY_IDS[key] || null;
}

function linkedinSearchUrl(role, opts = {}) {
  const id = linkedinCompanyId(role.company);
  const params = new URLSearchParams();
  if (id) params.set('currentCompany', `["${id}"]`);
  else params.set('keywords', role.company);
  if (opts.network) params.set('network', `["${opts.network.split(',').map(n => n).join('","')}"]`);
  if (opts.keywords) params.set('keywords', opts.keywords);
  if (opts.pastCompany) params.set('pastCompany', `["${opts.pastCompany}"]`);
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

function looksLikeAtsLink(url) {
  return /greenhouse\.io|ashbyhq\.com|lever\.co|workday|jobs|careers/i.test(url);
}

function findCvPdf(role) {
  const outputDir = join(ROOT, 'output');
  if (!existsSync(outputDir)) return null;
  const companySlug = slugify(role.company);
  const roleTokens = slugify(role.role).split('-').filter(t => t.length >= 3);
  // Filter to PDFs that mention the company (substring match — handles
  // multi-word company names like "Cursor (Anysphere)" → "cursor-anysphere").
  const companyMatches = readdirSync(outputDir)
    .filter(f => f.endsWith('.pdf'))
    .filter(f => {
      const lower = f.toLowerCase();
      // Match on first significant token of company slug
      const companyHead = companySlug.split('-')[0];
      return lower.includes(companyHead);
    });
  if (companyMatches.length === 0) return null;
  // Score each candidate by # of role tokens it contains. Best score wins.
  const scored = companyMatches.map(f => {
    const lower = f.toLowerCase();
    const score = roleTokens.reduce((acc, t) => lower.includes(t) ? acc + 1 : acc, 0);
    return { f, score };
  });
  scored.sort((a, b) => b.score - a.score);
  // Require at least 2 role-token matches OR fall back to most recent if
  // only company matches. (For roles whose CV slug doesn't match the JD
  // role string exactly — common when xGE hand-named files differently.)
  if (scored[0].score >= 2) return scored[0].f;
  // Fall back: most-recently-modified by date in filename
  const dateRe = /(\d{4}-\d{2}-\d{2})/;
  scored.sort((a, b) => {
    const da = (a.f.match(dateRe) || ['', ''])[1];
    const db = (b.f.match(dateRe) || ['', ''])[1];
    return db.localeCompare(da);
  });
  return scored[0].f;
}

// ────────────────────────────────────────────────────────────────────
// Builders — one function per pack file
// ────────────────────────────────────────────────────────────────────

function buildReadme(role, report) {
  const linkBits = role.score >= 4.5 ? '🟢 Priority — apply this week'
                 : role.score >= 4.25 ? '🟡 Strong — apply this week or next'
                 : '🔵 Qualifying — apply if energy allows';
  const urlLine = report.url || '(no JD URL captured)';
  return `# Apply Pack — ${role.company}, ${role.role}

> Auto-generated by [scripts/build-apply-packs.mjs](../../scripts/build-apply-packs.mjs). Hand-edit any file freely — the generator skips existing files unless re-run with \`--force\`.

| Field | Value |
|---|---|
| **Score** | ${role.score.toFixed(2)} / 5 — ${linkBits} |
| **Archetype** | ${report.archetype || '(see report)'} |
| **Comp band** | ${report.salary || '(see report Block D)'} |
| **Locations** | ${report.locations || '—'} · ${report.remote || ''} |
| **Visa** | ${report.visa || '—'} |
| **JD** | ${urlLine} |
| **Eval report** | [${role.reportPath.replace(/^reports\//, '')}](../../${role.reportPath}) |
| **Generated** | ${new Date().toISOString().slice(0, 10)} |

---

## ⚡ The 60-minute apply path

### 0. Pre-application prep (build BEFORE you submit)

See [pre-application-checklist.md](pre-application-checklist.md) — gap-closing actions extracted from the eval report.

### 1. Tailored CV (10 min)

- [ ] Open [tailored-cv.pdf](tailored-cv.pdf) — verify it exists. If symlink is broken, re-run \`/career-ops pdf\` with the JD.
- [ ] Confirm the personalization plan from Block E of the report was applied (top-line skills section, reordered bullets, keyword injection).

### 2. Cover letter (5 min)

- [ ] Open [cover-letter.md](cover-letter.md) — drafted from the report's "How to emphasize" hints + gap mitigations (verbatim).
- [ ] Read through, swap any wording that doesn't sound like you, paste into the application form.

### 3. Outreach drafts (15 min — copy/paste, you send)

- [ ] [linkedin/hiring-manager.md](linkedin/hiring-manager.md) — hiring chain candidates + 3 DM variants ≤300 chars.
- [ ] [linkedin/recruiter.md](linkedin/recruiter.md) — pre-built recruiter search URLs + DM template.
- [ ] [linkedin/peer-referral.md](linkedin/peer-referral.md) — non-pitch DM pattern for peer-level connections.
- [ ] [linkedin/connection-search.md](linkedin/connection-search.md) — pre-built LinkedIn search URLs (1st-degree, 2nd-degree, function-targeted, alumni).

### 4. Submit (10 min)

- [ ] Open the JD in Chrome → run \`/career-ops apply <JD URL>\` from this repo.
- [ ] Apply assistant reads the form, generates copy-paste answers per question.
- [ ] **Attach:** tailored CV PDF + any portfolio artifacts referenced in the cover letter.
- [ ] Cover letter body = [cover-letter.md](cover-letter.md).
- [ ] Status flips \`Evaluated → Applied\` automatically when you confirm submission.

### 5. Send the outreach (10 min)

- [ ] LinkedIn → message the primary hiring-chain candidate from [linkedin/hiring-manager.md](linkedin/hiring-manager.md).
- [ ] LinkedIn → identify recruiter via [linkedin/recruiter.md](linkedin/recruiter.md) search URL → send DM.
- [ ] LinkedIn → engage with one post from a current ${role.company} contributor (don't pitch — just an authentic comment) per [linkedin/peer-referral.md](linkedin/peer-referral.md).

### 6. After submission

- [ ] Add to follow-up cadence: \`node followup-cadence.mjs --add ${role.num} --date $(date +%Y-%m-%d)\`
- [ ] Day 7: nudge recruiter if no response.
- [ ] Day 14: warm follow-up via second hiring-team channel.
- [ ] Day 21: flag for re-evaluation if cold.

---

## 📂 Files in this pack

| File | What it is |
|---|---|
| [README.md](README.md) | This file — one-page checklist |
| [cover-letter.md](cover-letter.md) | Drafted cover letter, leads with strongest matches and owns gaps proactively |
| [pre-application-checklist.md](pre-application-checklist.md) | Pre-submission gap-closing actions extracted from the eval report |
| [grok-intel.md](grok-intel.md) | Comp benchmarks, posting legitimacy signals, current company state |
| [interview-prep-teaser.md](interview-prep-teaser.md) | Top 5 STAR stories pre-loaded for the recruiter screen |
| [linkedin/hiring-manager.md](linkedin/hiring-manager.md) | Hiring-chain DM drafts |
| [linkedin/recruiter.md](linkedin/recruiter.md) | Recruiter search URLs + DM template |
| [linkedin/peer-referral.md](linkedin/peer-referral.md) | Peer / referral DM pattern (non-pitch) |
| [linkedin/connection-search.md](linkedin/connection-search.md) | LinkedIn search URLs for connection mining |
| tailored-cv.pdf | Symlink to the JD-tailored CV in /output/ (if it exists) |

---

## ⚠️ Hard constraints

- **All LinkedIn DMs are drafts** — copy into LinkedIn manually. Auto-sending is a TOS violation.
- **Hiring manager identification is heuristic** (~50–70% confidence depending on company size). The generator pulls from public LinkedIn signals but doesn't guarantee accuracy. Verify in your own LinkedIn search before sending.
- **Don't update LinkedIn headline / About per application** — the steady-state pre-application-checklist applies; per-app churn at 5+/week tanks the recruiter algorithm and signals "actively looking" to colleagues.
`;
}

function buildCoverLetter(role, report) {
  const matches = report.matches.slice(0, 3);
  const topGaps = report.gaps.slice(0, 3);
  const matchLines = matches.map(m => {
    const evidence = m.evidence.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').slice(0, 400);
    return `- **${m.requirement}** — ${evidence}`;
  }).join('\n');
  const gapLines = topGaps.map((g, i) =>
    `${i + 1}. **${g.gap}** — ${g.mitigation.replace(/\s+/g, ' ').slice(0, 400)}`
  ).join('\n');

  return `# Cover Letter — ${role.company}, ${role.role}

> Drafted from the eval report's strongest matches and gap mitigations. Read through, swap any wording that doesn't sound like you, then paste into the application form.

---

Dear ${role.company} ${guessTeamName(report)} team,

I'd like to be considered for the ${role.role} role.

${tldrToOpening(report.tldr, role)}

Three of the report's strongest matches that I'd lead with in conversation:

${matchLines}

Three things I want to be transparent about before the recruiter conversation:

${gapLines}

What I'm offering is a hybrid that's genuinely uncommon: ${role.role.toLowerCase()} craft applied at scale, with production AI tooling as the proof.

Thank you for considering me.

Mitchell Williams
Seattle, WA · mitwilli@gmail.com · linkedin.com/in/mitwilli · github.com/mitwilli-create · thestorytellermitch.com

---

## Notes for the candidate (not part of the letter)

- Length target: ~500 words. If the form has a 300-word cap, drop two of the three transparency notes and keep the strongest gap mitigation.
- The "${ledFraming(role)}" framing is the central reframe — keep it in any version.
- For a 50–100-word short pitch field, use the **Verdict** from the eval report:

  > *${oneLineVerdict(report, role)}*
`;
}

function tldrToOpening(tldr, role) {
  if (!tldr) {
    return `My background in editorial leadership and AI-native communications maps directly to this brief — 18 years of editorial craft (digital newsrooms + Google Communications) plus 22 months shipping production AI agents at Google's Office of Cross-Google Engineering for ~1,000 Principal/Distinguished/Fellow engineers.`;
  }
  // First sentence of the TL;DR is usually the strongest framing line.
  const first = tldr.split(/\.\s+/)[0];
  return first.length < 350 ? first + '.' : first.slice(0, 350) + '…';
}

function ledFraming(role) {
  const r = role.role.toLowerCase();
  if (r.includes('editorial') || r.includes('content') || r.includes('comms') || r.includes('writer')) return 'editor-who-builds';
  if (r.includes('forward deployed') || r.includes('solutions') || r.includes('customer engineer') || r.includes('field')) return 'production-AI builder with editorial discipline';
  if (r.includes('developer') || r.includes('devrel') || r.includes('advocate')) return 'editor-who-builds, applied to engineer-audience enablement';
  return 'editor-who-builds';
}

function guessTeamName(report) {
  if (/comms|communications|editorial/i.test(report.archetype)) return 'Communications';
  if (/forward deployed|solutions|customer engineer/i.test(report.archetype)) return 'Forward Deployed';
  if (/developer|devrel/i.test(report.archetype)) return 'Developer Relations';
  return 'Hiring';
}

function oneLineVerdict(report, role) {
  return `I'm an 18-year editorial principal who shipped three production AI agents at Google xGE for 1,000 senior engineers. The shape I bring is the ${ledFraming(role)} hybrid — uncommon for ${role.company}'s ${role.role} brief, and the ${report.matches[0]?.requirement.toLowerCase().slice(0, 60) || 'top JD requirement'} is where my evidence is strongest.`;
}

function buildPreApplicationChecklist(role, report) {
  const gapsList = report.gaps.length > 0
    ? report.gaps.map((g, i) => `### Gap ${i + 1}: ${g.gap}\n\n**Hard blocker?** ${g.blocker || 'see report'}\n\n**Mitigation:** ${g.mitigation.replace(/\s+/g, ' ').slice(0, 600)}\n`).join('\n')
    : '_No specific gaps flagged in the eval report — your CV maps cleanly to this JD. Standard pre-application hygiene applies (LinkedIn Featured row up to date, GitHub pinned, certs visible)._';

  return `# Pre-application checklist — ${role.company}, ${role.role}

> Pulled directly from the eval report's "Gaps and Mitigation" section. Each gap-closer below is verbatim from the report — don't try to argue around them; close them or own them in the cover letter.

---

## Gap-closers (priority order, highest leverage first)

${gapsList}

---

## Steady-state LinkedIn cadence (DOES NOT change per application)

> Per the 2026 LinkedIn algorithm guidance, **don't update headline / About / Skills per submission**. Per-app churn at 5+/week tanks recruiter visibility and broadcasts job-hunting to your xGE colleagues. The Featured row is the only safe per-application surface.

| Surface | Cadence | Action this application |
|---|---|---|
| Headline | Once per quarter | _No change. Keep your audience-aware headline that maps across Tier B + A2 archetype band._ |
| About | Once per quarter | _No change._ |
| Skills | Once per quarter | _No change._ |
| **Featured row** | **Anytime** | **Pin the most relevant artifact** to this role — repo / methodology brief / writing sample. |
| Comments | 2–3 per week | This week: comment substantively on one post by a ${role.company} engineer / leader. Authentic engagement only — no pitching. |
| Open To Work badge | One-time toggle | Recruiter-only visibility (NOT public). |

---

## Final pre-flight check before clicking Submit

- [ ] [Tailored CV PDF](tailored-cv.pdf) is current and matches the personalization plan from Block E of the report.
- [ ] [Cover letter](cover-letter.md) owns the soft gaps proactively rather than letting the recruiter discount silently.
- [ ] LinkedIn Featured row reflects the artifact you reference in the cover letter.
- [ ] At least one [LinkedIn DM](linkedin/hiring-manager.md) is ready to send within 24h of submission.
- [ ] Application form's "Where did you hear about this role?" answer reflects how you actually heard about it (don't fabricate a referral).
`;
}

function buildHiringManager(role, report) {
  const id = linkedinCompanyId(role.company);
  const teamName = guessTeamName(report);
  const searchUrl = linkedinSearchUrl(role, {
    keywords: `head OR director OR lead ${teamName.toLowerCase()}`,
    network: 'F,S',
  });

  return `# LinkedIn — Hiring Manager outreach

> All drafts ≤300 chars (LinkedIn connection-request limit). The hiring manager for this specific req isn't always publicly named — use the search URL below to identify the chain owner before sending.

---

## Find the chain owner (2 min)

[**LinkedIn search → ${role.company} ${teamName} leadership**](${searchUrl})

Heuristic: the chain owner usually has "Head of" / "Director of" / "Lead" in their headline, with a function keyword matching the role (${teamName.toLowerCase()}). Cross-check by:

1. Opening the JD on LinkedIn → scroll to bottom → check "posted by [employee]" if present.
2. Reading 2–3 of the candidate's recent posts to confirm they own this brief specifically.
3. If still unclear, default to the highest-titled person in the function — escalation is structurally better than mis-identification.

Paste the identified person here for next time:

\`\`\`
Hiring chain owner: [name]
Title: [title]
URL: [linkedin.com/in/...]
Confidence: [high/medium/low]
Found: ${new Date().toISOString().slice(0, 10)}
\`\`\`

---

## DM Variant A — title-symmetry hook (recommended, ~280 chars)

\`\`\`
Hi [first name] — I'm a Comms Lead at Google xGE serving 1,000+ Principal/Distinguished/Fellow ICs, and I built a production RAG that drafts VP comms at 99% stylistic fidelity. Applying for ${role.role.slice(0, 60)} this week — would love a 15-min before the recruiter ping.
\`\`\`

## DM Variant B — proof-artifact hook (~290 chars)

\`\`\`
Hi [first name] — applying for ${role.role.slice(0, 50)}. Built Voice DNA + Kill List at Google xGE: a RAG that drafts VP comms at 99% fidelity for 1,000+ senior engineers. Public OSS at github.com/mitwilli-create/career-ops. Open to a 15-min if useful.
\`\`\`

## DM Variant C — gap-acknowledgment hook (~295 chars; use if your CV reads as cross-functional rather than direct-fit)

\`\`\`
Hi [first name] — applying for ${role.role.slice(0, 45)}. 18 yrs editorial + 22mo shipping production AI agents at Google xGE for 1,000 senior engineers. Not a standard CV for this role; happy to walk through why the shape works in 15 min.
\`\`\`

---

## What NOT to do

- ❌ Don't message multiple people at ${role.company} on the same day — looks like spray-and-pray.
- ❌ Don't pitch the role in the first message ("I'd be a great fit because…"). The hook is *the proof artifact*, not the role-fit narrative.
- ❌ Don't share phone or email in the connect note.
- ❌ Don't follow up if they don't accept the connection within 7 days. One nudge max, after the application is in.
`;
}

function buildRecruiter(role, report) {
  const recruiterSearch = linkedinSearchUrl(role, {
    keywords: 'recruiter OR sourcer OR "talent acquisition"',
  });
  const postsSearch = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent('"' + role.role.slice(0, 50) + '" ' + role.company)}&datePosted=%22past-month%22&sortBy=%22date_posted%22`;

  return `# LinkedIn — Recruiter outreach

> The recruiter for this specific req isn't always publicly named on the JD. The fastest way to identify them: LinkedIn content search for posters of this exact role.

---

## Step 1 — Find the recruiter (2 min)

1. **Posters of this exact role:** [LinkedIn content search](${postsSearch})
2. **${role.company} recruiters generally:** [people search](${recruiterSearch})
3. **Cross-check via the JD page on Greenhouse / LinkedIn** — sometimes the recruiter's name appears in the application questions or "Who referred you?" field.

Paste the identified recruiter here:

\`\`\`
Recruiter: [name]
URL: [linkedin.com/in/...]
Posted role on: [date]
\`\`\`

---

## Step 2 — Send the connect-with-note (≤300 chars)

### Variant A — fit-first (recommended, ~290 chars)

\`\`\`
Hi [first name] — saw you posted ${role.role.slice(0, 60)}. Applying this week. 18 yrs editorial (AJ+, HuffPost Live, Fusion) + 22mo shipping production AI at Google xGE for 1,000 senior engineers. Voice DNA RAG drafts VP comms at 99% fidelity. Worth a 15-min?
\`\`\`

### Variant B — gap-cover (use if your CV reads as cross-functional)

\`\`\`
Hi [first name] — applying for ${role.role.slice(0, 50)}. The category I actually fit is "${ledFraming(role)}": 18yrs editorial + 4 Anthropic certs Mar 2026 + public OSS career-ops. Happy to share more if useful.
\`\`\`

---

## Step 3 — Pre-load screen-call answers

| Likely question | One-sentence answer |
|---|---|
| "Walk me through your background." | "${ledFraming(role)} — 18 years editorial across digital newsrooms (HuffPost Live, Fusion, AJ+, CNN) and Google Comms, 22 months shipping production AI agents at Google xGE for 1,000 senior engineers." |
| "Why ${role.company}?" | _Pre-load this — read the eval report's Block A (Role Summary) + Block D (company state) for the right specific answer._ |
| "Why this role specifically?" | "${report.matches[0]?.requirement.slice(0, 80) || 'The strongest match in the JD'} is in production at xGE — I want to do that craft externally for ${role.company}." |
| "What's your comp expectation?" | "The disclosed band ${report.salary || '(see report)'} sits inside my target. I'd want to land toward the top given my tenure, but I'm comfortable across the band if equity is at standard for senior IC." |
| "Are you flexible on location?" | "${report.locations || 'Open'} works — SF / NYC are on my approved-relocation list. I'm also open to a Seattle-based hybrid that hits the in-office expectation via monthly travel. Whichever fits the team better." |
| "When can you start?" | "Standard 2-week notice; I can be in role within 30 days." |

---

## What NOT to do

- ❌ Don't apply through the form *without* messaging the recruiter — both pieces compound.
- ❌ Don't send the recruiter your phone number in the first message.
- ❌ Don't ask the recruiter to "tell you about the role" — read the JD first, lead with what you bring.
`;
}

function buildPeerReferral(role, report) {
  const peerSearch = linkedinSearchUrl(role, {
    keywords: `${guessTeamName(report).toLowerCase()} OR engineer OR writer OR editor`,
  });
  return `# LinkedIn — Peer / Referral path

> The referral path is structurally different from cold outreach. **Don't pitch.** Build genuine engagement with current ${role.company} contributors — referrals happen organically if the conversation is real.

---

## Find peer-level contributors

[**LinkedIn search → ${role.company} ${guessTeamName(report)}/engineering contributors**](${peerSearch})

For each substantive candidate, scan their last 10 posts. Pick someone who's posted in the last ~30 days on something technically adjacent to your work (Voice DNA, agent skills, editorial-at-scale, etc.).

---

## The DM pattern (peer / referral) — ≤300 chars, NO pitch

The structure is **3 sentences, no ask**:

1. **Genuine reference** to their work — name a specific post, idea, or comment.
2. **Light conversational connection** — something you're doing in adjacent territory (not a pitch).
3. **CTA that opens conversation, not asks for anything** — "would love your take on…"

### Template (replace [bracketed parts])

\`\`\`
Hi [name] — read your "[post title]" piece — the [specific point about a specific paragraph] landed for me. I've been working on [adjacent topic — voice DNA RAG / agent-skill design / Kill List training] in production at Google xGE. Would love your take on [specific question].
\`\`\`

**Why this works:**
- Specific reference proves you actually read the post (not a template blast).
- Sharing your own adjacent work establishes peer-level — you're not asking for help, you're swapping notes.
- Referrals happen *naturally* if the conversation goes well — they think "we should hire this person" without you asking.

### What to do AFTER they reply

- **If they engage substantively:** continue the conversation for 2–4 messages on the technical thread. Mention casually in message 3 or 4: "FYI I'm in process for the ${role.role.slice(0, 50)} role over your way — happy to keep the technical convo going either way." Let them volunteer the referral.
- **If they reply briefly:** thank them, exit cleanly. Don't push.
- **If they don't reply within 14 days:** don't follow up. They saw it.

---

## What NOT to do

- ❌ **Never lead with "I'm applying to ${role.company} — would you refer me?"** Most common cold-referral mistake.
- ❌ **Don't connect with 5+ ${role.company} employees in the same week.** Anti-spam surfaces flag this.
- ❌ **Don't reference the role in the first message.** It enters the conversation organically in message 3+ if at all.
- ❌ **Don't fabricate having read their post if you didn't.** Engineers can tell.
`;
}

function buildConnectionSearch(role, report) {
  const id = linkedinCompanyId(role.company);
  const idHint = id ? `currentCompany=%5B%22${id}%22%5D` : `keywords=${encodeURIComponent(role.company)}`;
  const u = (extra) => `https://www.linkedin.com/search/results/people/?${idHint}&${extra}`;
  const teamName = guessTeamName(report);
  return `# LinkedIn — Connection mining

> LinkedIn doesn't expose its connection graph via API — every search below is a pre-built URL. Open in Chrome (logged into LinkedIn) and the filters are pre-applied. **30 seconds per search.**

---

## 1. 1st-degree connections at ${role.company}

[**LinkedIn search → 1st-degree at ${role.company}**](${u('network=%5B%22F%22%5D')})

What to do with the list:
- **Score 1: any 1st-degree → request a 30-min coffee chat** ("not asking for a referral, asking for a read on the team and the role").
- **Score 2: 1st-degree in ${teamName}/Brand/Marketing/DevRel/Engineering** → these are gold; prioritize.

---

## 2. 2nd-degree connections (warm intros)

[**LinkedIn search → 2nd-degree at ${role.company}**](${u('network=%5B%22S%22%5D')})

For each 2nd-degree match worth pursuing:
1. Hover their card → see "Mutual connections" → identify a strong-tie 1st-degree.
2. Message the strong-tie 1st-degree first — *not* the 2nd-degree directly.

---

## 3. Function-targeted searches

[**${role.company} ${teamName} team (1st + 2nd)**](${u('keywords=' + encodeURIComponent(teamName.toLowerCase()) + '&network=%5B%22F%22%2C%22S%22%5D')})

[**${role.company} Engineering / Editorial bloggers (1st + 2nd)**](${u('keywords=' + encodeURIComponent('"engineering blog" OR "technical writer"') + '&network=%5B%22F%22%2C%22S%22%5D')})

[**${role.company} Recruiters**](${u('keywords=recruiter%20OR%20sourcer')})

---

## 4. Ex-${role.company} (warm "what's it really like" insights)

[**Past ${role.company} + ${teamName.toLowerCase()} keywords**](${u('past' + (id ? 'Company' : '') + '=' + (id ? `%5B%22${id}%22%5D` : encodeURIComponent(role.company)) + '&keywords=' + encodeURIComponent(teamName.toLowerCase()))})

---

## 5. Google → ${role.company} alumni (your strongest single warm-intro vector)

[**1st-degree Google alums now at ${role.company}**](${u('pastCompany=%5B%221441%22%5D&network=%5B%22F%22%5D')})

[**2nd-degree Google alums now at ${role.company}**](${u('pastCompany=%5B%221441%22%5D&network=%5B%22S%22%5D')})

These people share your home culture (Google, big-tech-comms) — the conversation is faster.

---

## Mining cadence

| Day | Action |
|-----|--------|
| Day 0 (apply day) | Search 1 (1st-degree). Pick top 1–2 strong ties. Message asking for a 15-min read on the team. |
| Day 1 | Search 5 (Google alums). Pick top 1 1st-degree, 1–2 2nd-degree. |
| Day 2 | Search 3 (function). Pick 1 person to engage on a recent post (no DM yet). |
| Day 3 | Send the comment-then-connect to the engaged-on person. |
| Day 5 | Follow up with Day 0 strong-tie if no response. |
| Day 7 | Search 4 (ex-${role.company}). Reach out to 1 ex-employee for an honest read. |
`;
}

function buildGrokIntel(role, report) {
  return `# Grok intel — ${role.company}, ${role.role}

> Compiled from the evaluation report (Block D + Block G + sources). Run a fresh Grok-on-X query day-of-submission to catch 24-hour shifts (hiring announcements, layoff signals, leadership changes).

---

## Comp signals (from eval Block D)

${report.blockD.split('\n').slice(0, 25).join('\n').slice(0, 2000)}

---

## Posting legitimacy (from eval Block G)

${report.blockG.split('\n').slice(0, 20).join('\n').slice(0, 2000)}

---

## Day-of-submission Grok queries to run

If you want last-mile intel before clicking Submit:

1. \`${role.company} engineering ${guessTeamName(report).toLowerCase()} new hires Q2 2026 site:linkedin.com\` — recent hires tell you if the team is mid-build (favorable for an applicant) or already-staffed.
2. \`"@${slugify(role.company).replace(/-/g, '')}" engineering ${guessTeamName(report).toLowerCase()} site:twitter.com OR site:x.com\` — current voice / brief / what they're frustrated with.
3. \`${role.company} layoffs OR reorg OR "team restructure"\` — last-mile risk check.
4. \`${role.company} ${guessTeamName(report).toLowerCase()} strategy 2026\` — public stated priorities.

If the day-of sweep returns anything material that contradicts the eval report, update [README.md](README.md) before submitting.

---

## Risk flags

${report.gaps.length > 0 ? '- Soft gaps from the eval (see [pre-application-checklist.md](pre-application-checklist.md)) — pre-empt in cover letter, not in screen.' : ''}
${/anthropic/i.test(role.company) ? '- ⚠️ **Three prior Anthropic application-screen rejections** in your history (Comms AI Productivity Lead Apr 2026, Developer Education Lead Mar 2026, Managing Editor Aug 2025). Recruiter ATS may flag a fourth Anthropic submission. This role is a stronger archetype fit than all three priors — defensible if raised.' : ''}
${/seattle|hybrid/i.test(report.locations || '') ? '' : '- ⚠️ **Location:** ' + (report.locations || 'see report') + '. Pre-empt in cover letter and again in screen, in that order.'}

---

## "How did you hear about this role?" form answer

If you didn't hear about it via referral or recruiter: *"career-ops job-search system I built — github.com/mitwilli-create/career-ops flagged this role at ${role.score.toFixed(2)}/5 against my profile."*

Honest, references the public OSS, signals technical sophistication.
`;
}

function buildInterviewPrep(role, report) {
  const stories = report.starStories.slice(0, 5);
  const storyBlocks = stories.length > 0
    ? stories.map((s, i) => `## Story ${i + 1} — ${s.requirement || 'Pre-loaded story'}

| | |
|---|---|
| **Situation** | ${s.s.replace(/<br\s*\/?>/g, ' ').slice(0, 600)} |
| **Task** | ${s.t.replace(/<br\s*\/?>/g, ' ').slice(0, 400)} |
| **Action** | ${s.a.replace(/<br\s*\/?>/g, ' ').slice(0, 800)} |
| **Result** | ${s.r.replace(/<br\s*\/?>/g, ' ').slice(0, 600)} |
`).join('\n')
    : '_The eval report didn\'t produce a STAR story table for this role. Run `/career-ops interview-prep` to generate one once you advance past the recruiter screen._';

  return `# Interview prep — ${role.company}, ${role.role}

> Top 5 STAR stories pulled directly from the eval report's Block F. This is the pre-application teaser — full interview prep happens once you advance.

---

${storyBlocks}

---

## What to do when you advance past the recruiter screen

1. Run \`/career-ops interview-prep\` with company=${role.company} role="${role.role}" — generates the full interview-prep dossier (process intel from Glassdoor / Blind / company-specific question patterns / loop structure).
2. Run \`/career-ops contacto\` to refresh hiring-manager / interviewer outreach with names you now have from the loop.
3. Move row #${role.num} status \`Evaluated → Interview\` in \`data/applications.md\` — this triggers the post-interview follow-up cadence.
`;
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

function buildPack(role) {
  const report = parseReport(role.reportPath);
  if (!report) {
    console.log(`  ✗ Skipping #${role.num} ${role.company}: report not found at ${role.reportPath}`);
    return false;
  }
  const dirName = packDirName(role);
  const dir = join(ROOT, 'apply-pack', dirName);
  const linkedinDir = join(dir, 'linkedin');

  // Skip if README exists and not forcing — preserves any hand-edits.
  if (existsSync(join(dir, 'README.md')) && !FORCE) {
    console.log(`  → Pack already exists for #${role.num} ${role.company} (use --force to rebuild)`);
    return false;
  }

  mkdirSync(dir, { recursive: true });
  mkdirSync(linkedinDir, { recursive: true });

  writeFileSync(join(dir, 'README.md'), buildReadme(role, report));
  writeFileSync(join(dir, 'cover-letter.md'), buildCoverLetter(role, report));
  writeFileSync(join(dir, 'pre-application-checklist.md'), buildPreApplicationChecklist(role, report));
  writeFileSync(join(dir, 'grok-intel.md'), buildGrokIntel(role, report));
  writeFileSync(join(dir, 'interview-prep-teaser.md'), buildInterviewPrep(role, report));
  writeFileSync(join(linkedinDir, 'hiring-manager.md'), buildHiringManager(role, report));
  writeFileSync(join(linkedinDir, 'recruiter.md'), buildRecruiter(role, report));
  writeFileSync(join(linkedinDir, 'peer-referral.md'), buildPeerReferral(role, report));
  writeFileSync(join(linkedinDir, 'connection-search.md'), buildConnectionSearch(role, report));

  // Symlink the tailored CV PDF if one exists in /output/.
  const cvFile = findCvPdf(role);
  if (cvFile) {
    const linkPath = join(dir, 'tailored-cv.pdf');
    try { unlinkSync(linkPath); } catch {}
    symlinkSync(`../../output/${cvFile}`, linkPath);
  }

  console.log(`  ✓ Built apply-pack/${dirName}/${cvFile ? '  (CV linked: ' + cvFile + ')' : '  (no CV PDF found)'}`);
  return true;
}

async function main() {
  const tracker = parseTracker(join(ROOT, 'data/applications.md'));
  let queue;
  if (SPECIFIC_NUM) {
    queue = tracker.filter(r => String(r.num) === SPECIFIC_NUM);
    if (queue.length === 0) {
      console.error(`No row with #${SPECIFIC_NUM} in applications.md`);
      process.exit(1);
    }
  } else {
    const eligible = tracker
      .filter(r => ACTIONABLE.has(r.status) && r.score >= FLOOR)
      .sort((a, b) => b.score - a.score);
    queue = eligible.slice(0, TOP_N);

    // Optionally append the highest-scoring role added today, even if it
    // doesn't crack the cumulative top-N. The heartbeat's "What's New
    // Overnight" section guarantees this row a freshly built pack.
    if (INCLUDE_TODAYS_TOP) {
      const todaysTop = eligible
        .filter(r => r.date === TODAY)
        .sort((a, b) => b.score - a.score)[0];
      if (todaysTop && !queue.some(r => r.num === todaysTop.num)) {
        console.log(`Including today's #1 new role: #${todaysTop.num} ${todaysTop.company} (${todaysTop.score.toFixed(2)})`);
        queue.push(todaysTop);
      }
    }
  }

  console.log(`Building Apply Packs for ${queue.length} role${queue.length === 1 ? '' : 's'}...`);
  let built = 0;
  for (const role of queue) {
    if (buildPack(role)) built++;
  }
  console.log(`\nDone. ${built} pack${built === 1 ? '' : 's'} built or rebuilt; ${queue.length - built} skipped.`);
}

main().catch(err => {
  console.error('build-apply-packs error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
