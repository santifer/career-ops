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
 *   ├── form-fields.md                ← essay field scaffolds with AI-detection flags
 *   ├── one-pager.md                  ← audition artifact / 90-day vision doc
 *   ├── interview-prep-teaser.md      ← Block F STAR stories (top 5)
 *   ├── interview-prep-full.md        ← full Phase 8: loop, all stories, hard Qs, defense
 *   ├── pre-application-checklist.md  ← gap-closing actions
 *   ├── grok-intel.md                 ← Block D (comp) + Block G + signals
 *   ├── ats-check.md                  ← keyword coverage + 70–80% sweet spot rationale
 *   ├── formatting-guide.md           ← font/spacing/margin/bullet design spec
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
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { runCheck as humanizeCheck } from './humanize-check.mjs';
import { SONNET } from '../lib/models.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const TOP_N = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1] || '3', 10);
const SPECIFIC_NUM = args.find(a => a.startsWith('--num='))?.split('=')[1];
const INCLUDE_TODAYS_TOP = args.includes('--include-todays-top');
const TODAY = new Date().toISOString().slice(0, 10);
const FLOOR = 4.0;
const ACTIONABLE = new Set(['Evaluated', 'Responded']);

// ── API Key ───────────────────────────────────────────────────────────
function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return process.env.ANTHROPIC_API_KEY.trim();
  // Check .env in project root (consistent with batch-runner-batches.mjs)
  try {
    const envContent = readFileSync(join(ROOT, '.env'), 'utf-8');
    const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match && match[1].trim() && !match[1].trim().startsWith('#')) return match[1].trim();
  } catch {}
  // Check ~/.career-ops-secrets
  try {
    const secretsPath = join(homedir(), '.career-ops-secrets');
    if (existsSync(secretsPath)) {
      const match = readFileSync(secretsPath, 'utf-8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (match) return match[1].trim();
    }
  } catch {}
  return null;
}
const API_KEY = loadApiKey();

// ── Voice Reference Brief ─────────────────────────────────────────────
function loadVoiceReferenceBrief() {
  const path = join(ROOT, 'data', 'voice-reference-brief.md');
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8');
}
const VOICE_BRIEF = loadVoiceReferenceBrief();

// ── Fabrication Guard ─────────────────────────────────────────────────
function fabricationCheck(text) {
  const HARD_BANS = [
    { pattern: /Principal.*Distinguished.*Fellow/i, risk: 'tier-claim-not-in-cv', reframe: 'Use "~1,000 senior technical ICs" exactly' },
    { pattern: /L8\b|L9\b|L10\b/i, risk: 'google-level-fabrication', reframe: 'Remove level claims; not in cv.md' },
    { pattern: /Node\.js/i, risk: 'stack-fabrication', reframe: 'Remove stack claim; cv.md does not specify production stack' },
    { pattern: /within 30 days/i, risk: 'commitment-fabrication', reframe: 'Remove timeline commitment; never stated in cv.md' },
    { pattern: /zero.token/i, risk: 'api-claim-fabrication', reframe: 'Use "direct ATS API integrations" not "zero-token"' },
    { pattern: /negative training/i, risk: 'terminology-drift', reframe: 'Use "Kill List of rejected drafts" — his canonical phrasing' },
    { pattern: /alignment.adjacent/i, risk: 'interpretive-frame', reframe: 'Remove or use "AI-native editorial operations"' },
  ];
  const flags = [];
  for (const ban of HARD_BANS) {
    if (ban.pattern.test(text)) flags.push(ban);
  }
  return { passed: flags.length === 0, flags };
}

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

**Optional but high-leverage:** See [one-pager.md](one-pager.md) — a 90-day vision doc that can be shared with the hiring manager before the recruiter call. If you post it on LinkedIn as a native document first, it often converts to inbound.

### 1. Tailored CV (10 min)

- [ ] Open [tailored-cv.pdf](tailored-cv.pdf) — verify it exists. If symlink is broken, re-run \`/career-ops pdf\` with the JD.
- [ ] Confirm the personalization plan from Block E of the report was applied (top-line skills section, reordered bullets, keyword injection).
- [ ] Apply [formatting-guide.md](formatting-guide.md) spec before exporting: Calibri 11pt, 0.75–1 in margins, standard bullet (•), ≤2 pages.

### 2. Cover letter + form fields (15 min)

- [ ] Open [cover-letter.md](cover-letter.md) — drafted from the report's "How to emphasize" hints + gap mitigations (verbatim).
- [ ] ⚠️ Read the cover letter aloud. Any sentence that sounds smooth or corporate needs to be roughened — add one specific detail only you'd know (a project name, a number, a tension moment).
- [ ] Open [form-fields.md](form-fields.md) — pre-drafted answers for all essay fields. Sections flagged 🔴 MUST REWRITE require your voice. Fill in the bracketed placeholders before pasting.
- [ ] See [formatting-guide.md](formatting-guide.md) for per-field length and structure rules.

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
| [form-fields.md](form-fields.md) | Pre-drafted application essay answers with AI-detection risk flags per field |
| [one-pager.md](one-pager.md) | Audition artifact / 90-day vision doc for hiring manager outreach or LinkedIn post |
| [interview-prep-full.md](interview-prep-full.md) | Full interview preparation: loop structure, all STAR stories, hard Q anticipation, defense drill |
| [formatting-guide.md](formatting-guide.md) | Visual design standards: fonts, spacing, margins, bullets, file format (sourced from recruiter communities) |
| [ats-check.md](ats-check.md) | ATS keyword coverage report + rationale for the 70–80% sweet spot (don't over-optimize) |
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

function buildCoverLetterTemplate(role, report) {
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
>
> ⚠️ **AI-DETECTION NOTICE:** This draft was generated from the eval report. Before submitting: (1) read it aloud — anything that sounds smooth or corporate needs to be roughened up; (2) add one specific detail only you could know (a project name, a precise date, a tension moment); (3) ensure no paragraph starts with "I". See [formatting-guide.md](formatting-guide.md) for font/spacing spec (Calibri 11pt, 250–400 words, left-aligned, single-spaced).

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

async function buildCoverLetter(role, report) {
  if (!API_KEY) {
    return buildCoverLetterTemplate(role, report);
  }

  const skipCritique = process.env.SKIP_CRITIQUE === 'true';

  const systemPrompt = `You are a cover letter writer for Mitchell Williams. Generate a cover letter that is indistinguishable from his own writing. Every claim must trace to the canonical sources provided. Fabrication is a hard failure.

VOICE REFERENCE
${VOICE_BRIEF}

COVER LETTER STRUCTURE (4 blocks, 300-340 words total — hard limit, count before returning)

Block 1 — Framing Frame (2-3 sentences):
Open with a company-specific tension — the exact AI comms, deployment, or enablement challenge this company faces that Mitchell is uniquely positioned to solve.
Do NOT open with "I." Do NOT open with "I am writing to express."
Pattern: State the problem space first, then position Mitchell as someone who has solved it.
Example shape: "The challenge of [specific company tension] is one I've spent [timeframe] solving: [what that means operationally]."

Block 2 — Signature Move (3-4 sentences):
State what he has uniquely built that maps directly to their need.
Lead with the highest-value proof point from the canonical sources.
Every sentence needs a metric or a named artifact. Use em-dash linking.
No bullet lists. Narrative prose only.
Pattern: "At [company], [what he built] — [metric]. [How it maps to their need]."

Block 3 — Human Differentiator (1-2 sentences):
Show how his journalism + AI production background gives him unusual leverage for their current phase. Make this about their likely blind spots, not his credentials.
One em-dash. One specific named credential or show/program.

Block 4 — Conversational Asymmetry CTA (2-3 sentences):
Offer a specific, named artifact or working example — give value upfront.
Do not say "I'd be happy to" or "please don't hesitate."
Do not use a generic "let me know if you're interested."
Pattern: "If [role condition], I'd value [specific time] to walk through [named artifact]. [Why that artifact is directly relevant]."

OUTPUT: Cover letter body only. No salutation. No sign-off. No subject line.
Word count: 300-340 words. Count before returning. If over 340, cut Block 2 by one sentence.`;

  const matches = report.matches.slice(0, 3);
  const topGaps = report.gaps.slice(0, 2);

  const userPrompt = `CANONICAL SOURCES (every claim in your output must trace here):

CV SUMMARY: ${report.tldr || ''}

TOP 3 MATCHES FROM EVAL REPORT:
${matches.map((m, i) => `${i + 1}. Requirement: "${m.requirement}"\n   Evidence: ${m.evidence.replace(/<br\s*\/?>/gi, ' ').slice(0, 300)}`).join('\n\n')}

TOP GAPS (acknowledge max 1 of these, only if it directly comes up):
${topGaps.map(g => `- ${g.gap}: ${g.mitigation.slice(0, 200)}`).join('\n')}

JOB CONTEXT:
Company: ${role.company}
Role: ${role.role}
Archetype: ${ledFraming(role)}
Score: ${role.score}/5

GOLD-STANDARD REFERENCE (match this quality and voice — do not copy it):
The central challenge of the Engineering Editorial Lead role is one I've spent a career solving: how do you encode editorial discipline into production systems that serve a deeply technical audience allergic to spin?

For the past two years at Google's Office of Cross-Google Engineering (xGE), I've architected and shipped production AI systems for an audience of ~1,000 senior engineers. My Executive RAG pipeline functions as a digital twin for VP-level communications, achieving 99% stylistic fidelity and a 90% reduction in drafting latency. Its discipline comes from a unique architecture: a curated Voice DNA corpus paired with a "Kill List" of rejected drafts that taught the agent risk tolerance. Next to it, my autonomous Communications Triage Agent recaptures ~160 operational hours per year at >90% classification accuracy.

This work is a direct translation of the operating discipline I built in high-stakes newsrooms. Before Google, I spent eight years inside the four properties that rewired digital journalism. I was on the founding team of Al Jazeera's 'The Stream' (RTS Most Innovative Programme), a segment producer at HuffPost Live (Webby Award, Pew Research case study), a line producer for 'America With Jorge Ramos' during its 179% primetime viewership growth, and a senior producer at AJ+. There, I designed a third production line that became a de facto talent pipeline — three producers I coached became on-air principals with subsequent Webbys, a Daytime Emmy, and a James Beard award.

The pattern is consistent: architecting systems that deliver quality at scale, whether the output is a broadcast segment, a viral video, or a VP's technical brief generated by an AI. Most candidates bring either the editorial background or the AI production experience; I have shipped both.

If the role is still open, I would value 15 minutes to walk through the design of the Voice DNA "Kill List" and the AJ+ talent pipeline. Both are direct, working examples of what your JD calls "editorial discipline at engineering scale."

Generate a cover letter for ${role.company} / ${role.role} at the same quality level.`;

  let draft = '';
  try {
    const genRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: SONNET,
        max_tokens: 1200,
        temperature: 1,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!genRes.ok) {
      const errText = await genRes.text();
      throw new Error(`${genRes.status}: ${errText.slice(0, 200)}`);
    }
    const genData = await genRes.json();
    draft = genData.content?.[0]?.text?.trim() || '';
  } catch (err) {
    console.log(`  ⚠ Cover letter LLM generation failed (${err.message}), falling back to template`);
    return buildCoverLetterTemplate(role, report);
  }

  if (!skipCritique && draft) {
    const criticUserPrompt = `Review this cover letter draft for Mitchell Williams. Your job: identify every sentence that fails his voice and rewrite it. Return the full corrected cover letter, not a list of changes.

DRAFT:
${draft}

CHECK EACH SENTENCE FOR:

1. KILL LIST violations (hard rewrite):
   Banned: "I believe," "I think," "perhaps," "might be," "could potentially," "thrilled,"
   "excited to," "passionate about," "game-changer," "world-class," "synergy," "leverage" (verb),
   "robust," "delve," "I'd be happy to," "It's worth noting," "In conclusion"

2. FABRICATION (hard remove):
   Any metric not in this list must be removed or replaced with a canonical one:
   ~160 ops hours/yr | >90% accuracy | 99% fidelity | 90% latency reduction |
   300%+ capacity scaling | 179% viewership growth | 50M+ views | 27.5M desktop views

3. VAGUE CLAIMS (rewrite with specifics):
   "improved results" → add metric
   "significant impact" → name the outcome
   Any impact claim without a number → add one from canonical list or remove

4. WEAK OPENING (rewrite if):
   First word is "I" → restructure to lead with context
   First sentence is generic ("I am writing to...") → replace with Framing Frame pattern

5. WORD COUNT: If over 340 words, cut one sentence from Block 2. Report final count.

OUTPUT: Full corrected cover letter. Final word count on the last line: [N words]`;

    try {
      const criticRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: SONNET,
          max_tokens: 1400,
          temperature: 0,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: draft },
            { role: 'user', content: criticUserPrompt },
          ],
        }),
      });
      if (!criticRes.ok) {
        const errText = await criticRes.text();
        throw new Error(`${criticRes.status}: ${errText.slice(0, 200)}`);
      }
      const criticData = await criticRes.json();
      const revised = criticData.content?.[0]?.text?.trim() || '';
      if (revised) draft = revised;
    } catch (err) {
      console.log(`  ⚠ Cover letter critic pass failed (${err.message}), using first-pass output`);
    }
  }

  const fabResult = fabricationCheck(draft);

  let output = `# Cover Letter — ${role.company}, ${role.role}

> LLM-generated (claude-sonnet-4-6) · Voice-critic reviewed · Fabrication-gated
> Add salutation ("Dear [Name]," or "Dear ${guessTeamName(report)} team,") and signature block before submitting.
> Signature: Mitchell Williams · Seattle, WA · mitwilli@gmail.com · linkedin.com/in/mitwilli · github.com/mitwilli-create · thestorytellermitch.com

---

${draft}

---

## Notes for the candidate

- The "${ledFraming(role)}" framing is the central reframe — keep it in any version.
- For a 50–100-word short pitch field, use the **Verdict** from the eval report:

  > *${oneLineVerdict(report, role)}*
`;

  if (!fabResult.passed) {
    output += `\n<!-- FABRICATION FLAGS\n${fabResult.flags.map(f => `RISK: ${f.risk}\nREFRAME: ${f.reframe}`).join('\n\n')}\n-->`;
    console.log(`  ⚠ Fabrication flags on #${role.num} cover letter: ${fabResult.flags.map(f => f.risk).join(', ')}`);
  }

  return output;
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
  return `I'm an 18-year editorial principal who shipped production AI agents at Google xGE for 1,000 senior engineers (Comms Triage Agent + Voice DNA). The shape I bring is the ${ledFraming(role)} hybrid — uncommon for ${role.company}'s ${role.role} brief, and the ${report.matches[0]?.requirement.toLowerCase().slice(0, 60) || 'top JD requirement'} is where my evidence is strongest.`;
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
// Form field helpers + new builders
// ────────────────────────────────────────────────────────────────────

function behavioralPrompts(archetype, roleTitle) {
  const r = (archetype + ' ' + roleTitle).toLowerCase();
  const core = [
    'Tell me about a time you navigated a disagreement with a key stakeholder.',
    "Describe a project you led that didn't go as planned. What did you learn and how did you course-correct?",
    'Give me an example of a time you had to influence without authority.',
  ];
  const domain = [];
  if (/comms|editorial|content|writer|communications/i.test(r)) {
    domain.push(
      'Walk me through a time you had to simplify a highly technical concept for a non-technical audience.',
      "Tell me about a time your editorial judgment conflicted with a business stakeholder's request. What happened?",
      'Describe a situation where you had to maintain quality under extreme time pressure.',
    );
  }
  if (/ai|ml|machine learning|agent|llm/i.test(r)) {
    domain.push(
      'Tell me about a production AI system you shipped. What went wrong, and how did you diagnose and resolve it?',
      "Describe how you've approached responsible AI or safety considerations in your work.",
    );
  }
  if (/product|pm|program manager/i.test(r)) {
    domain.push(
      'Tell me about a time you had to make a difficult product prioritization call with limited data.',
      "Describe a roadmap decision you made that you'd make differently now.",
    );
  }
  if (/engineer|engineering|developer|dev|software/i.test(r)) {
    domain.push(
      'Tell me about a technically complex system you designed. What were the key trade-offs?',
      'Describe a production incident you owned. How did you communicate it to stakeholders?',
    );
  }
  return [...core, ...domain].map(p =>
    `- **${p}**\n  → See [interview-prep-full.md](interview-prep-full.md) for the pre-loaded STAR answer for this prompt.`
  ).join('\n\n');
}

function technicalScaffolds(report, role) {
  const r = (report.archetype + ' ' + role.role).toLowerCase();
  if (/comms|editorial|content|writer|communications/i.test(r)) {
    return `

### Writing sample / portfolio submission

If the form requests a writing sample or portfolio link, submit in this order of preference:

1. **Production AI artifact** (methodology brief, Voice DNA doc, agent output explainer) — directly signals the role intersection
2. **High-stakes communication** (exec speech, crisis statement, board update) — signals seniority
3. **Published editorial piece** with a named byline

Portfolio anchor: **thestorytellermitch.com** + **github.com/mitwilli-create/career-ops** for the AI proof.

> ⚠️ **HUMAN REWRITE REQUIRED** if the form asks "describe your editorial philosophy" or "walk us through your approach to [craft X]." Paste your answer into a document and read it aloud — if it sounds like a LinkedIn post, rewrite it.`;
  }
  if (/forward deployed|solutions engineer|customer engineer|field engineer/i.test(r)) {
    return `

### Technical case study (if requested)

Lead with a specific customer outcome, not implementation details. Format: Problem → What I built → Measurable result → What broke and how I fixed it.

⚠️ Don't use AI to draft the case study body — the content should contain proprietary specifics that an LLM wouldn't know.`;
  }
  if (/developer|devrel|advocacy/i.test(r)) {
    return `

### Code sample / demo link

Lead with your most recent production project that a developer audience would recognize as real — not a tutorial. Include the GitHub link directly in the form field.`;
  }
  return '';
}

function buildFormFields(role, report) {
  return `# Application Form Fields — ${role.company}, ${role.role}

> Pre-drafted answers for the most common application essay fields. Sections marked ⚠️ HUMAN REWRITE REQUIRED carry high AI-detection risk — rewrite in your own voice before pasting. See [formatting-guide.md](formatting-guide.md) for spacing, length, and structure rules.

---

## Risk legend

| Symbol | Meaning |
|---|---|
| ⚠️ HUMAN REWRITE REQUIRED | Highest AI-detection risk — rewrite before pasting. Add one messy/specific detail (number, month, failure, tension) no LLM would generate. |
| 🟡 LIGHT EDIT NEEDED | Scaffold is sound; swap in one personal detail and verify tone. |
| 🟢 USE AS-IS | Factual / data-driven; AI voice is not a detection signal here. |

---

## "Why are you interested in this role / company?"

⚠️ **HUMAN REWRITE REQUIRED** — "I admire your mission" is the #1 AI-detection pattern. Lead with a specific personal trigger (something you read, a product you used, a person's work you follow). The scaffold below is a starting point only — do NOT paste verbatim.

**Scaffold:**

> [OPEN WITH A SPECIFIC TRIGGER — not a mission statement. E.g.: "I've used [product] in my own work for [specific purpose] since [month/year], and I kept running into [specific friction]. When I saw this brief, it mapped directly to that gap."]
>
> The ${role.role} brief maps to the intersection I've been building toward: [YOUR HONEST 1-SENTENCE characterization — not the JD's language].
>
> What I'd bring specifically: [STRONGEST MATCH — ${report.matches[0]?.requirement || 'see eval report Block B'}], and [SECOND MATCH — ${report.matches[1]?.requirement || 'see eval report Block B'}].

---

## "Tell us about yourself" / Open intro (50–150 words)

⚠️ **HUMAN REWRITE REQUIRED** — Add one messy/specific detail that no AI would generate (a specific project name, a precise metric, a month/year, a tension or failure you owned).

**Scaffold (150-word version — trim for shorter fields):**

> I'm a ${report.archetype || role.role.split(' ').slice(-2).join(' ')} who's spent [X] years at the intersection of [DOMAIN 1] and [DOMAIN 2]. Most recently, I [WHAT YOU ACTUALLY DID — plain language, not what the company does].
>
> The through-line: [HONEST CHARACTERIZATION of your approach — specific enough that someone who knows your work would say "yes, that's exactly how Mitchell works."]
>
> What I'm looking for now: [BE SPECIFIC — not "to grow" or "to make an impact", but the actual thing].

---

## "What excites you most about this role?"

⚠️ **HUMAN REWRITE REQUIRED** — Recruiters know this question by its generic answers. Lead with the specific problem, not the company's prestige.

**Scaffold:**

> The problem I'm most interested in: [SPECIFIC CHALLENGE from the JD — use their exact phrasing, not a paraphrase].
>
> I've been working adjacent to this at [PAST PROJECT/COMPANY] — specifically [1–2 sentences of concrete experience]. The gap I kept hitting was [HONEST FRICTION POINT — this is the "messy detail" that makes the answer credible].
>
> This role is the most direct path I've seen to closing that gap.

---

## Behavioral questions

${behavioralPrompts(report.archetype, role.role)}

---

## Technical / competency questions${technicalScaffolds(report, role)}

---

## Salary / compensation expectations

🟢 **USE AS-IS** — Data-driven responses are not AI-detected.

> My target base is in the [${report.salary || 'see grok-intel.md for comp signals'}] range. I'm comfortable discussing total comp structure including equity — open to landing toward the top of band given tenure and production deliverables. Not anchored to a single number; the right role and team weight more than a 10% comp delta.

---

## Work authorization / location

🟢 **USE AS-IS**

From eval report: **${report.locations || 'see eval report'}** · ${report.remote || ''} · Visa: ${report.visa || 'not flagged in JD'}

> Answer honestly and directly. Don't hedge or qualify more than the facts warrant.

---

## "How did you hear about this role?"

🟡 **LIGHT EDIT NEEDED**

> **Template:** "Via career-ops — a job-search automation system I built and open-sourced (github.com/mitwilli-create/career-ops). The system scored this role ${role.score.toFixed(2)}/5 against my profile."

Honest, references the OSS, signals technical sophistication. Only use if the form has a free-text field — not in a dropdown.

---

## "Do you have questions for us?" (form field version)

⚠️ **HUMAN REWRITE REQUIRED** — Generic curiosity is the second-most-detected AI pattern after "I admire your mission."

**Pattern:** "I noticed [SPECIFIC THING from grok-intel.md or recent company news] — I'm curious how the ${role.role} role intersects with [THAT SPECIFIC THING]."

**Examples of the right specificity level (adapt, don't copy):**
- "You shipped [product name] in [month] — how does the ${guessTeamName(report)} team decide what gets a full communications strategy vs. what ships quietly?"
- "I read [name]'s post about [specific topic] — is that framing representative of how the team thinks about [related challenge]?"

---

## Human-rewrite risk tracker

| Section | Risk | Action required |
|---|---|---|
| Why this company | 🔴 MUST REWRITE | Lead with a specific personal trigger |
| Tell us about yourself | 🔴 MUST REWRITE | Add one messy/specific detail |
| What excites you | 🔴 MUST REWRITE | Lead with problem, not prestige |
| Behavioral STAR answers | 🟡 EDIT | Swap in specific names, dates, numbers |
| Technical / writing sample | 🟡 EDIT | Verify specifics are real, not plausible |
| Salary expectations | 🟢 USE AS-IS | Data-driven = not flagged |
| Work authorization | 🟢 USE AS-IS | Factual = not flagged |
| "How did you hear" | 🟡 EDIT | Ensure it's honest |
| "Questions for us" | 🔴 MUST REWRITE | Make it specific to recent news |
`;
}

function buildOnePager(role, report) {
  const companyProblem = report.tldr
    ? report.tldr.split(/\.\s*/)[0].slice(0, 300)
    : `${role.company}'s ${role.role} brief`;

  return `# Audition Artifact / 1-Pager — ${role.company}, ${role.role}

> Phase 0.5 from the Application Prompt Guide. This is the **pre-application audition artifact** — a 1-page "proof-of-work" you attach alongside the cover letter, share with the hiring manager before the recruiter call, or post on LinkedIn to generate inbound. Its purpose is to demonstrate that you understand the company's problem deeply enough to have a point of view on it, before anyone asks.

**Submission options:**
- Attach as a separate PDF alongside your CV
- Share the link in the hiring manager DM (see [linkedin/hiring-manager.md](linkedin/hiring-manager.md))
- Post on LinkedIn as a native document (carousel format gets 3× reach vs. a link post)

---

## The problem I see at ${role.company}

> ⚠️ **HUMAN REWRITE REQUIRED** — Add 1–2 sentences based on what you personally observed or experienced as a user/observer of ${role.company}'s product or communications. Generic "the company faces X challenge" reads as AI.

${companyProblem}.

**What I believe is happening under the surface:** [YOUR SPECIFIC DIAGNOSIS — based on what you've read/used/observed, not what the JD says. This is the "smart insider" voice that makes audition artifacts worth reading.]

---

## What I would do in the first 90 days

> This section is the audition. Make it specific, opinionated, and actionable. "I would learn the team's priorities" is not an answer — write what you believe the priorities *should* be and why.

### Month 1 — Diagnosis
- [SPECIFIC THING to audit/observe/measure first — and why]
- [SPECIFIC CONVERSATION to have — with whom, and what the goal is]
- [SPECIFIC ARTIFACT to produce — a doc, a brief, a working prototype — and for what audience]

### Month 2 — First proof point
- [SPECIFIC DELIVERABLE — something the team can see and critique]
- [SPECIFIC METRIC — how you'd know if it's working]

### Month 3 — System, not project
- [SPECIFIC PROCESS or infrastructure to build so the work doesn't depend on you personally]

---

## My relevant proof

| Requirement (from JD) | My evidence |
|---|---|
${report.matches.slice(0, 3).map(m => `| ${m.requirement} | ${m.evidence.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').slice(0, 200)} |`).join('\n')}

---

## What I'm not claiming

> Optional but powerful — signals self-awareness and earns trust faster than a perfect CV.

${report.gaps.length > 0
  ? report.gaps.slice(0, 2).map(g => `- **${g.gap}** — ${g.mitigation.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n')
  : '- No material gaps flagged in the eval — this section can be omitted or used for a nuanced framing point.'}

---

## Format notes (apply before exporting to PDF)

- **Length:** 1 page hard limit. If it spills to page 2, cut Month 3 and tighten Month 1.
- **Font:** Calibri 11pt body, 14pt section headers. See [formatting-guide.md](formatting-guide.md) for full spec.
- **Title:** "${role.company} — 90-Day Vision: ${role.role}" or "${role.company} / Mitchell Williams — [SHORT REFRAME OF YOUR CONTRIBUTION]"
- **Footer:** Name · Email · LinkedIn URL · Date
- **File name:** \`mitch-williams-${slugify(role.company)}-90-day-vision.pdf\`
`;
}

function buildLoopPattern(role, report) {
  const archetype = (report.archetype || '').toLowerCase();
  if (/comms|editorial|content|writer|communications/i.test(archetype)) {
    return `**Typical Comms/Editorial loop at a tech company (5–6 rounds):**
1. **Recruiter screen (30 min)** — Background + motivation + basic comp check
2. **Hiring manager intro (45–60 min)** — Vision fit + how you work + role scope
3. **Writing/editorial exercise** — Usually 48–72h take-home. Expect a prompt requiring both craft and strategic judgment, not just clean prose.
4. **Cross-functional panel (60–90 min)** — 2–4 stakeholders (product, eng, design, legal). They're testing whether you can hold your ground while being collaborative.
5. **Leadership presentation (30–45 min)** — VP or C-level. Big-picture fit, strategic framing. They're checking whether you think at the right level.
6. **Reference calls** — Usually 2–3, including one they find independently.

**Typical duration:** 3–6 weeks from screen to offer.`;
  }
  if (/forward deployed|solutions|customer engineer/i.test(archetype)) {
    return `**Typical Forward Deployed / Solutions Engineering loop:**
1. **Recruiter screen (30 min)** — Background + motivation
2. **Technical screen (60 min)** — Coding + system design or a customer scenario
3. **Customer scenario role-play (60 min)** — You play the account lead, interviewer plays a skeptical customer.
4. **Behavioral panel (90 min)** — Cross-functional: solutions, product, eng. STAR-format behavioral questions.
5. **Leadership bar-raiser (30–45 min)** — Culture + strategic fit

**Typical duration:** 4–8 weeks.`;
  }
  return `**Typical loop for this role type at a scaling AI company:**
1. **Recruiter screen (30 min)** — Background, motivation, comp check
2. **Hiring manager (45–60 min)** — Vision + role scope + team fit
3. **Panel / loop (60–90 min)** — 3–4 interviewers, mix of behavioral and craft/technical
4. **Executive / leadership (30–45 min)** — Strategic fit + ambition signal

**Typical duration:** 3–6 weeks from screen to offer.`;
}

function buildInterviewPrepFull(role, report) {
  const allStories = starStories(report.blockF, 10);
  const storyBlocks = allStories.length > 0
    ? allStories.map((s, i) => `### Story ${i + 1} — ${s.requirement || 'Pre-loaded story'}

| | |
|---|---|
| **Situation** | ${s.s.replace(/<br\s*\/?>/g, ' ').slice(0, 600)} |
| **Task** | ${s.t.replace(/<br\s*\/?>/g, ' ').slice(0, 400)} |
| **Action** | ${s.a.replace(/<br\s*\/?>/g, ' ').slice(0, 800)} |
| **Result** | ${s.r.replace(/<br\s*\/?>/g, ' ').slice(0, 600)} |
`).join('\n')
    : '_No STAR stories in the eval report. Run `/career-ops interview-prep` to generate a full story bank for this role._';

  const hardQs = report.gaps.length > 0
    ? report.gaps.map((g, i) =>
      `${i + 1}. **"You don't have experience in ${g.gap} — how would you approach that?"**\n   → ${g.mitigation.replace(/\s+/g, ' ').slice(0, 300)}`
    ).join('\n\n')
    : '_No material gaps flagged in the eval report — standard behavioral prep applies._';

  const defenseDrill = report.matches.slice(0, 4).map((m, i) =>
    `**Drill ${i + 1}: "${m.requirement}"**
- Your 60-second answer: [Fill in — 1 sentence of context, 1 sentence of action, 1 specific result with a number]
- Most likely follow-up: "Tell me more about [SPECIFIC DETAIL from your answer]" — pre-think this now
- Failure mode to avoid: Generalizing. If you can't name a specific project/date/number, the answer is too vague.`
  ).join('\n\n');

  return `# Interview Prep (Full) — ${role.company}, ${role.role}

> Full Phase 8 interview preparation. STAR stories come from the eval report. Section 5 (Messy Story Extraction) requires your input — designed to surface the rough-edged specifics that make answers AI-undetectable.

---

## Section 1 — Interview loop structure (likely)

${buildLoopPattern(role, report)}

---

## Section 2 — All STAR stories from eval report

${storyBlocks}

---

## Section 3 — Hard questions to anticipate

> Based on gaps identified in the eval report. Prepare these before the recruiter screen — they will surface.

${hardQs}

---

## Section 4 — CV bullet defense drill

> For each top CV claim, prepare a 60-second expansion and anticipate the follow-up. Recruiters test CV bullets in ~40% of screens.

${defenseDrill}

---

## Section 5 — Messy story extraction (⚠️ requires your input)

> AI-generated interview answers are detected because they sound smooth. Real answers have edges — specific failure moments, precise numbers, named people, an admission of something that didn't work. Answer these in a voice note or doc — don't polish the output.

1. **The specific project name** — What's the informal name your team used for the project your strongest story comes from? (Not the official name — the one in Slack.)
2. **The number that surprised you** — What metric changed in a way you didn't expect? Larger or smaller than you predicted — either is useful.
3. **The person who pushed back** — Who was the hardest stakeholder to bring along? What was their actual concern (not the diplomatic version)?
4. **The thing that almost didn't ship** — What nearly derailed the project? What would a dispassionate observer say was the root cause?
5. **The result you're least proud of** — Where did the numbers land short of your internal target? Why?
6. **What you'd do differently** — Not "I'd communicate more" — name the specific decision you'd reverse.

Feed your answers into [../../docs/APPLICATION_PROMPT_GUIDE.md](../../docs/APPLICATION_PROMPT_GUIDE.md) Phase 8 for the full interview defense drill.

---

## Section 6 — Closing questions (one per round)

**Tier 1 — Strongest (specific + researched):**
- "I noticed [SPECIFIC THING from grok-intel.md — company news, product launch, team change] — how does that intersect with the priorities this role will own?"
- "What does success in this role look like at 6 months — in concrete terms, what artifact would exist that wouldn't exist today?"

**Tier 2 — Strong (shows systems thinking):**
- "How does the ${guessTeamName(report)} team get input into product decisions? What's the feedback loop?"
- "What's the one thing the previous person in this role did that you'd want the next person to continue?"

**Tier 3 — Acceptable:**
- "What's the hardest part of this role that doesn't show up in the JD?"
- "What does onboarding look like for this function specifically?"

**Avoid:**
- "What does ${role.company} do?" — read the JD
- "What are the growth opportunities?" — reads as self-interested in a first screen
- "When will I hear back?" — ask the recruiter separately

---

## After each interview round

- [ ] Write down 3 specific things that came up within 2 hours (before they blur)
- [ ] Send a thank-you within 24h referencing one specific moment from the conversation
- [ ] Update [../../data/applications.md](../../data/applications.md) row #${role.num} with the latest status
`;
}

function buildFormattingGuide(role, report) {
  return `# Visual Formatting Guide — ${role.company}, ${role.role}

> Sourced from r/resumes, r/cscareerquestions, Blind (AI company threads), Resume Genius 2026 survey, MIT/Columbia career development resources. These are the formatting standards hiring managers and recruiter communities have explicitly called for. Apply across ALL submitted materials: CV, cover letter, form fields, and one-pager.

---

## CV Formatting

### Font

| Setting | Value | Why |
|---|---|---|
| Primary font | **Calibri** (first choice) or Georgia | ATS-safe, clean on screen and print; r/resumes consensus |
| Alternate safe | Arial, Verdana, Garamond | Acceptable — avoid Times New Roman (reads dated 2026) |
| Body size | **11pt** | Below 10pt triggers readability rejection; above 12pt wastes space |
| Name (header) | **14–16pt, bold** | Must stand out from everything else on the page |
| Section headers | **11–12pt, bold, ALL CAPS or Title Case** | Pick one style — inconsistency is the #1 amateurism signal |
| Job title + company | **11pt, bold** | Visually separates from bullets beneath |

### Color

| Use | Value |
|---|---|
| Body text | **Pure black (#000000)** — not dark gray, not 90% black |
| Accent (optional) | ONE color max: dark navy (#1a3a5c) or dark teal (#1a5c4f) for your name or section rules only |
| Background | **White only** — colored backgrounds fail ATS and print poorly |

> Glassdoor and Blind threads consistently flag colored text boxes and shaded section headers as "design-school aesthetic that signals you don't understand enterprise hiring."

### Spacing and margins

| Setting | Value |
|---|---|
| Top / bottom margins | **0.75 in** — slightly tighter than default 1 in; allows more content without looking cramped |
| Left / right margins | **1 in** |
| Line spacing (body) | **1.0 (single)** |
| Space after each bullet | **2–3pt** — enough air to separate lines without wasting vertical space |
| Space between sections | **8–10pt** or a single thin horizontal rule |

### Page length

| Experience | Pages |
|---|---|
| Under 10 years | **1 page** |
| 10–20 years | **1–2 pages** — page 2 must add a strong signal, not just another job |
| 20+ years | **2 pages max** outside academia/research |

> Blind consensus (AI company applications, Q1 2026): "Anything over 2 pages gets skimmed at page 1 and discarded. The 3-page resume is a talent-acquisition meme — nobody reads it."

**Mitchell's profile (18+ years):** 2 pages is appropriate. Page 1 must stand alone — if a recruiter prints only page 1, it should be a complete picture.

### Visual hierarchy

| Level | Element | Format |
|---|---|---|
| 1 (highest) | Your name | Largest text on the page, 14–16pt, bold |
| 2 | Section headers | Bold, 11–12pt, separated by thin rule |
| 3 | Company + title | Bold, 11pt |
| 4 | Date / location | Right-aligned, regular weight, same size as body |
| 5 (lowest) | Bullet content | Regular weight, 11pt |

### Bullet point structure

**Formula:** Strong verb → specific context → measurable result (X-Y-Z)

| Rule | Good | Bad |
|---|---|---|
| Start with a strong verb | "Shipped a production RAG that drafted VP comms at 99% fidelity" | "Was responsible for developing a system that helped with communications" |
| Include a number | "Reduced turnaround from 4 days to 3 hours for 1,000 engineers" | "Significantly reduced turnaround time" |
| 1–2 lines max | 15–25 words per bullet | 40-word bullets that wrap to 3 lines |
| No terminal periods | Fragment structure | Full sentences with periods |
| Verb tense | Past tense for past roles, present for current | Mixed tense within a single role |

**Strong action verbs (r/resumes 2026 approved):**
- **Built / shipped:** Shipped, Engineered, Launched, Deployed, Authored, Architected
- **Led:** Owned, Directed, Spearheaded, Championed, Drove
- **Improved:** Reduced, Increased, Accelerated, Optimized, Cut
- **Collaborated:** Partnered, Advised, Coordinated, Aligned
- **Created:** Designed, Developed, Produced, Established

### Bullet symbols

| Rule | Format |
|---|---|
| Bullet type | **Standard round (•)** — no dashes, no arrows, no custom glyphs |
| Nested bullets | **Avoid** — ATS parses them poorly and they signal over-engineering |
| Em dashes | OK for clarity (e.g., "Google xGE — Office of the CTO") |
| Numbers in text | Always **%** not "percent", **$2M** not "two million dollars" |

---

## Cover Letter Formatting

### Structure

| Section | Content | Length |
|---|---|---|
| Header | Name, Email, LinkedIn, Date | 1–2 lines |
| Greeting | "Dear [Name] / [Team] team," — never "To Whom It May Concern" | 1 line |
| Opening | Specific trigger + 1-sentence role alignment | 3–4 sentences |
| Body | 2–3 paragraphs: evidence, gap acknowledgment, framing | 2–3 sentences each |
| Close | Clear ask + sign-off | 2 sentences |

**Length:** 250–400 words. 70% of hiring managers reject cover letters over 400 words. (Resume Genius 2026 survey)

**Font / spacing:** Match your CV exactly. Calibri 11pt, 1-inch margins, left-aligned, single-spaced, one blank line between paragraphs.

**File format:** PDF primary + .docx as backup. File name: \`mitch-williams-cover-letter-${slugify(role.company)}.pdf\`

### Paragraph grammar rules

- **Left-align only** — justified text creates uneven word spacing that slows scanning
- **Never start a paragraph with "I"** — standard style rule AND an AI-detection signal
- **Vary sentence length** — 2–3 short sentences (under 15 words) for impact, 1 longer sentence for complexity. A paragraph of all long sentences reads as AI.
- **No corporate filler:** "leverage," "synergize," "dynamic team environment," "results-driven" — replace with the specific thing you actually did

---

## Application Form Field Formatting

| Field type | Format |
|---|---|
| Short text (under 150 words) | Plain prose, no bullets, no headers |
| Long text (150–500 words) | Short paragraphs (3–4 sentences), 1 blank line between |
| Very long text (500+ words) | 2–3 sections with **bold subheadings**; treat as a mini-doc |
| Dropdown / checkbox | Answer directly; don't add caveats in a text field below |

> If the form has no character counter, assume 400–500 word max unless told otherwise. Going over reads as someone who can't edit.

---

## One-Pager / Audition Artifact Formatting

- **1 page hard limit** — use 0.7-inch margins and 10.5pt body to fit if needed
- **Title:** Large, bold, left-aligned — visible within 2 seconds of opening
- **Structure:** Problem → Diagnosis → 90-day plan → Your evidence → What you're not claiming
- **Visual accent:** One thin horizontal rule between sections. No borders, no shading.
- **Footer:** Name · Date · GitHub / portfolio URL

---

## What NOT to do (community consensus, r/resumes + Blind AI company threads Q1–Q2 2026)

- ❌ **No infographic resumes** — ATS and most enterprise HRMs can't parse them. At Anthropic/OpenAI/Perplexity, design is irrelevant; content wins.
- ❌ **No columns or text boxes** — ATS reads these as garbled or skips them
- ❌ **No photos** — US/Canada hiring; adds bias liability for the company
- ❌ **No "References available upon request"** — wastes space
- ❌ **No objective statement** — replace with a production-summary section at the top
- ❌ **No colored backgrounds or gradients**
- ❌ **No 3+ fonts** — every additional font reduces perceived professionalism
- ❌ **No tables in the CV body** — safe only in a dedicated skills-matrix section, and only if simple

---

## Pre-submission visual QA checklist

- [ ] Font: Calibri or Georgia, 11pt body, consistent throughout
- [ ] Margins: 0.75–1 in on all sides
- [ ] Line spacing: 1.0 (single), 8–10pt between sections
- [ ] Bullets: Standard round (•), 15–25 words, strong verb opening, at least one number
- [ ] Color: Black text, max one accent color
- [ ] Length: CV ≤2 pages; cover letter ≤400 words; form fields ≤500 words unless specified
- [ ] File format: PDF primary, .docx backup
- [ ] File name: descriptive (\`mitch-williams-${slugify(role.company)}-cv.pdf\`), not \`resume_final_v3.pdf\`
- [ ] Print test: Print page 1 in black and white — if it's hard to read, it won't survive recruiter printing
`;
}

function buildAtsCheck(role, report) {
  const matchRows = report.matches.map(m =>
    `| ✅ In CV | **${m.requirement}** | ${m.evidence.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').slice(0, 120)} |`
  ).join('\n');
  const gapRows = report.gaps.map(g =>
    `| ⚠️ Soft gap | **${g.gap}** | Add to CV summary or cover letter: ${g.mitigation.replace(/\s+/g, ' ').slice(0, 120)} |`
  ).join('\n');

  return `# ATS Keyword Check — ${role.company}, ${role.role}

> Auto-generated from the eval report's Block B match analysis. This is your CV's keyword coverage against the JD requirements — the same signal ATS systems use to score applications. Review before submitting.

---

## Why you should NOT aim for 100% ATS match

**The human screen is where applications are won or lost — not the ATS score.**

The ATS filters out the bottom 20–30% of applications. Once you're past the filter, a human reads your CV in 6–7 seconds. A CV optimized for 95%+ ATS match tends to:
- Use the exact JD phrasing verbatim (reads as keyword-stuffed to a recruiter)
- Repeat the same terms 4–6 times across different sections (obvious and off-putting)
- Use passive constructions ("experienced in X") instead of active proof ("shipped X that achieved Y")
- Sound like a job description, not a person

**The target sweet spot: 70–80% keyword match.**

At 70–80%:
- You clear the ATS filter (most systems use 60–70% as the passing threshold)
- You still sound like a human when the recruiter reads page 1
- You have room for specific proof points that no other candidate will have (the 20–30% that's yours alone)

**The actual risk at different match levels:**

| ATS score | ATS outcome | Human screen outcome |
|---|---|---|
| < 60% | Filtered out before human sees it | N/A |
| 60–70% | Borderline — depends on system thresholds | Reads human, but risky if ATS is strict |
| **70–80%** | **Cleared — you're in the human pile** | **Reads like a person. This is the target.** |
| 85–90% | Cleared with margin | Reads polished but slightly mechanical |
| 95–100% | Cleared | Reads as keyword-stuffed — recruiters notice |

---

## Current keyword coverage (from eval Block B)

| Status | Requirement | Coverage in your CV |
|---|---|---|
${matchRows}
${gapRows || '| — | No soft gaps flagged | All key requirements covered |}'}

---

## Keywords to add (if not already in CV)

Review the ⚠️ soft gap rows above. For each gap:
1. **Don't add the keyword verbatim** — add it as a proof point ("Led X which required Y" not "Experienced in Y")
2. **One addition per section max** — CV summary, one experience bullet, or skills section. Not all three.
3. **Check the count** — if a keyword already appears 2× in your CV, don't add a third instance.

---

## Manual ATS verification (optional — takes 5 min)

For a more precise score, paste your CV and the JD into one of these free tools:

- [Jobscan](https://www.jobscan.co) — most widely used; shows match % and missing keywords
- [resume.worded.com](https://resume.worded.com) — ATS simulation + line-by-line feedback
- [Rezi](https://www.rezi.ai) — ATS optimization with keyword injection suggestions

> Target: 70–80% match. If Jobscan returns < 65%, check the ⚠️ rows above and add the highest-priority keyword as a proof bullet.

---

## ATS format safety checklist

- [ ] No tables in the CV body (ATS skips them)
- [ ] No columns or text boxes (ATS reads these as garbled)
- [ ] Standard section headers: "Experience", "Education", "Skills" (not "My Journey", "Where I've Worked")
- [ ] File saved as .docx AND .pdf — some ATS systems only parse .docx cleanly
- [ ] Font: Calibri or Arial (ATS-safe) — not a script or display font
- [ ] No headers/footers with content — ATS often skips them
`;
}

// ────────────────────────────────────────────────────────────────────
// Humanize score section — appended to generated cover letters
// ────────────────────────────────────────────────────────────────────

function buildHumanizeSection(h) {
  const today = new Date().toISOString().slice(0, 10);
  const flaggedLines = h.checks.phrases.hits.length > 0
    ? h.checks.phrases.hits.slice(0, 8).map(({ label, weight }) =>
        `- ${weight === 3 ? '🔴' : weight === 2 ? '🟡' : '⚪'} "${label}"`
      ).join('\n')
    : '- None detected — clean.';

  return `
---

## AI Detection Score (auto-generated ${today})

**Likelihood of AI flag: ${h.score}% ${h.risk.emoji} ${h.risk.label}** — ${h.risk.action}

| Signal | Score |
|---|---|
| AI phrase density | ${h.checks.phrases.score}% |
| Burstiness (sentence variance) | ${h.checks.burstiness.score}% |
| Passive voice ratio | ${h.checks.passive.score}% |
| Transition opener density | ${h.checks.transitions.score}% |

**Flagged phrases:**
${flaggedLines}

> Re-score after edits: \`node scripts/humanize-check.mjs --file [this-file-path]\`
`;
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

async function buildPack(role) {
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
  const coverLetterContent = await buildCoverLetter(role, report);
  const humanize = humanizeCheck(coverLetterContent);
  writeFileSync(join(dir, 'cover-letter.md'), coverLetterContent + buildHumanizeSection(humanize));
  writeFileSync(join(dir, 'pre-application-checklist.md'), buildPreApplicationChecklist(role, report));
  writeFileSync(join(dir, 'grok-intel.md'), buildGrokIntel(role, report));
  writeFileSync(join(dir, 'interview-prep-teaser.md'), buildInterviewPrep(role, report));
  writeFileSync(join(dir, 'form-fields.md'), buildFormFields(role, report));
  writeFileSync(join(dir, 'one-pager.md'), buildOnePager(role, report));
  writeFileSync(join(dir, 'interview-prep-full.md'), buildInterviewPrepFull(role, report));
  writeFileSync(join(dir, 'formatting-guide.md'), buildFormattingGuide(role, report));
  writeFileSync(join(dir, 'ats-check.md'), buildAtsCheck(role, report));
  writeFileSync(join(linkedinDir, 'hiring-manager.md'), buildHiringManager(role, report));
  writeFileSync(join(linkedinDir, 'recruiter.md'), buildRecruiter(role, report));
  writeFileSync(join(linkedinDir, 'peer-referral.md'), buildPeerReferral(role, report));
  writeFileSync(join(linkedinDir, 'connection-search.md'), buildConnectionSearch(role, report));

  // CV PDF wiring — additive path (audit Item B 2026-05-18):
  //   1. If `apply-pack/<slug>/tailored-cv.md` exists, render via Typst →
  //      `tailored-cv.pdf` as a real file (preferred path; reflects the
  //      tonight's-design Typst template).
  //   2. Otherwise fall back to the legacy behavior: symlink to a matching
  //      tailored CV PDF in /output/ if `findCvPdf(role)` resolves one.
  // The HTML/Playwright path (generate-pdf.mjs) and the LaTeX path
  // (generate-latex.mjs) remain available as alternates — this is additive,
  // not a deprecation.
  const tailoredMdPath = join(dir, 'tailored-cv.md');
  const tailoredPdfPath = join(dir, 'tailored-cv.pdf');
  let cvWired = '';
  if (existsSync(tailoredMdPath)) {
    try {
      try { unlinkSync(tailoredPdfPath); } catch {}
      execSync(
        `node ${JSON.stringify(join(ROOT, 'scripts', 'render-cv-typst.mjs'))} --input ${JSON.stringify(tailoredMdPath)} --output ${JSON.stringify(tailoredPdfPath)}`,
        { cwd: ROOT, stdio: 'pipe' }
      );
      cvWired = 'rendered Typst from tailored-cv.md';
    } catch (err) {
      console.warn(`  ⚠ Typst render failed for ${dirName}: ${(err.message || '').slice(0, 200)} — falling back to symlink path`);
      cvWired = '';
    }
  }
  if (!cvWired) {
    const cvFile = findCvPdf(role);
    if (cvFile) {
      try { unlinkSync(tailoredPdfPath); } catch {}
      symlinkSync(`../../output/${cvFile}`, tailoredPdfPath);
      cvWired = `symlinked output/${cvFile}`;
    }
  }
  // Legacy compatibility: keep cvFile populated for the closing log line.
  const cvFile = cvWired.startsWith('symlinked')
    ? cvWired.replace('symlinked output/', '')
    : (cvWired || null);

  const phraseNote = humanize.checks.phrases.hits.length > 0
    ? ` — flagged: ${humanize.checks.phrases.hits.map(h => `"${h.label}"`).join(', ')}`
    : ' — clean';
  console.log(`  ✓ Built apply-pack/${dirName}/${cvFile ? '  (CV linked: ' + cvFile + ')' : '  (no CV PDF found)'}`);
  console.log(`  ${humanize.risk.emoji} Cover letter AI risk: ${humanize.score}% ${humanize.risk.label}${phraseNote}`);

  // Post-build quality gates (audit Items E + F 2026-05-18): JD-keyword
  // overlap + claim-consistency. Run as a soft check — failure produces a
  // warning, not a build error. The two scripts write keyword-alignment.md
  // and claim-consistency.md into the pack dir; the build log surfaces the
  // headline score so a reviewer can decide whether to drill in.
  try {
    const jdScore = execSync(
      `node ${JSON.stringify(join(ROOT, 'scripts', 'jd-keyword-score.mjs'))} --slug ${JSON.stringify(dirName)}`,
      { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString();
    const j = JSON.parse(jdScore.slice(jdScore.indexOf('{')));
    const cvHit = (j.results?.[0]?.artifacts || []).find(a => a.path.includes('tailored-cv') || a.path.includes('cv.md'));
    if (cvHit) {
      const icon = cvHit.score >= 50 ? '✓' : '⚠️';
      console.log(`  ${icon} JD keyword overlap (CV): ${cvHit.score}% (${cvHit.misses} misses)`);
    }
  } catch (err) {
    console.log(`  ⚠️ JD keyword score skipped: ${(err.message || '').slice(0, 80)}`);
  }
  try {
    const claimResult = execSync(
      `node ${JSON.stringify(join(ROOT, 'scripts', 'claim-consistency.mjs'))} --slug ${JSON.stringify(dirName)}`,
      { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString();
    const j = JSON.parse(claimResult.slice(claimResult.indexOf('{')));
    const totalUnverified = (j.results?.[0]?.artifacts || []).reduce((s, a) => s + (a.unverified || 0), 0);
    const totalClaims = (j.results?.[0]?.artifacts || []).reduce((s, a) => s + (a.total || 0), 0);
    if (totalClaims > 0) {
      const icon = totalUnverified === 0 ? '✓' : '⚠️';
      console.log(`  ${icon} Claim consistency: ${totalClaims - totalUnverified}/${totalClaims} verified across outbound artifacts`);
    }
  } catch (err) {
    console.log(`  ⚠️ Claim consistency skipped: ${(err.message || '').slice(0, 80)}`);
  }

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
    if (await buildPack(role)) built++;
  }
  console.log(`\nDone. ${built} pack${built === 1 ? '' : 's'} built or rebuilt; ${queue.length - built} skipped.`);
}

main().catch(err => {
  console.error('build-apply-packs error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
