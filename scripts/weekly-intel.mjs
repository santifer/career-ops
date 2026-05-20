#!/usr/bin/env node
/**
 * Weekly market intelligence pipeline for Mitchell's job search.
 *
 * Runs Sunday 02:00 PT via launchd (com.mitchell.career-ops.weekly-intel.plist).
 * Uses Claude to generate research on: target roles, company health, comp/equity
 * trends, IPO/stock signals, emerging skills, recommended LinkedIn contacts,
 * and optimal cities. Also writes ready-to-paste prompts for ChatGPT, Gemini,
 * Perplexity Pro, and Grok so Mitchell can run those manually.
 *
 * Outputs:
 *   data/weekly-intel/CURRENT.md          — always the latest report
 *   data/weekly-intel/YYYY-MM-DD.md       — dated archive
 *   data/weekly-intel/prompts/            — external-platform prompt files
 *
 * Usage:
 *   node scripts/weekly-intel.mjs            # full run
 *   node scripts/weekly-intel.mjs --dry-run  # print Claude prompt, skip writes
 *   node scripts/weekly-intel.mjs --prompts-only  # only regenerate prompt files
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { homedir } from 'os';
import { installRunRecord } from '../lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('weekly-intel');

const ROOT = process.cwd();
const INTEL_DIR   = join(ROOT, 'data/weekly-intel');
const PROMPTS_DIR = join(INTEL_DIR, 'prompts');
const CURRENT     = join(INTEL_DIR, 'CURRENT.md');
const DATE        = new Date().toISOString().slice(0, 10);
const DATED       = join(INTEL_DIR, `${DATE}.md`);

const args = process.argv.slice(2);
const DRY_RUN      = args.includes('--dry-run');
const PROMPTS_ONLY = args.includes('--prompts-only');

for (const d of [INTEL_DIR, PROMPTS_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ─── Load profile for research context ───────────────────────────────────────

let profileContext = '';
try {
  const profileYml = readFileSync(join(ROOT, 'config/profile.yml'), 'utf-8');
  const cvMd = readFileSync(join(ROOT, 'cv.md'), 'utf-8');
  // Pull target roles section from profile
  const rolesMatch = profileYml.match(/target_roles:([\s\S]*?)narrative:/);
  const roles = rolesMatch ? rolesMatch[1].trim() : '';
  // Pull headline
  const headlineMatch = profileYml.match(/headline:\s*"([^"]+)"/);
  const headline = headlineMatch ? headlineMatch[1] : '';
  // Pull comp target
  const compMatch = profileYml.match(/target_range:\s*"([^"]+)"/);
  const comp = compMatch ? compMatch[1] : '$200K-$320K';
  profileContext = `
CANDIDATE CONTEXT:
- Name: Mitchell Williams
- Current: ${headline}
- Target comp: ${comp}
- Primary archetypes: AI Solutions Architect, Forward Deployed Engineer, Applied AI Engineer, AI Enablement Lead, AI Program Manager, Communications Manager (AI-native), Developer Education Lead, Engineering Editorial Lead
- Location: Seattle WA, open to relocation globally
- Key differentiators: shipped 3 production AI systems at Google xGE for 1,000+ senior engineers; 18 years editorial (CNN, Al Jazeera, AJ+, Fusion, HuffPost); Voice DNA methodology; comms × builder hybrid
`.trim();
} catch {
  profileContext = 'Candidate: Mitchell Williams, AI Communications + Builder PgM @ Google xGE.';
}

// ─── Previous report for trend comparison ────────────────────────────────────

function lastReport() {
  if (!existsSync(INTEL_DIR)) return '';
  const files = readdirSync(INTEL_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
    .sort()
    .reverse();
  if (files.length === 0) return '';
  const prev = files[0];
  if (prev === `${DATE}.md`) return files[1] ? readFileSync(join(INTEL_DIR, files[1]), 'utf-8') : '';
  return readFileSync(join(INTEL_DIR, prev), 'utf-8');
}

const previousReport = lastReport();
const prevContext = previousReport
  ? `\nPREVIOUS REPORT DATE: ${previousReport.match(/# Weekly Intel — (\S+)/)?.[1] || 'prior week'}\nUse it to flag shifts, reversals, or confirmations of prior signals. Do not repeat unchanged info — only what changed.\n`
  : '\nThis is the first report — no prior baseline.\n';

// ─── Claude research prompt ───────────────────────────────────────────────────

const CLAUDE_PROMPT = `Role: senior career-intelligence analyst writing a weekly market briefing for Mitchell Williams.

${profileContext}
${prevContext}
TODAY: ${DATE}

PRIMARY FILTER (overrides all other ranking): total comp + pre-IPO equity timing + RSU value-at-vest. Mitchell will consider any role that needs his expertise OR aligns with his goals; comp/equity is what narrows. Surface IPO/equity signal BEFORE role/title fit. Frontier labs (Anthropic, OpenAI, xAI, Perplexity, Sierra) are the highest-priority pre-IPO targets given his AI builder positioning. Mature public comp (Google/Meta/MSFT/Amazon/Apple/NVIDIA) only ranks high if cash+RSU materially beats what a strong pre-IPO offer would compound into over 4 years.

Output rules (enforce strictly):
- Start at the H1; no preamble, no closing summary, no "I will now…" or meta lines.
- ≤2 sentences per bullet; no section intros; cut adjectives; point estimates over ranges.
- Every claim is either (a) sourced from training and tagged [VERIFY] if it could have moved in the last 6 months, or (b) a stable structural fact. No hedging filler ("varies", "depends").
- If a previous report exists, write deltas only — say "unchanged from prior week" or omit.
- Do NOT pad. A short, dense report is better than a long one. Skip a bullet if you have nothing concrete.

Output EXACTLY this structure (verbatim headers, in this order):

# Weekly Intel — ${DATE}

## 1. Equity & IPO Signals (PRIMARY)

Rank 8–12 companies by 12–18mo equity-upside-on-joining-now. Frontier labs first. One row each:

**[Company]** — stage: [seed/A/B/C/D/late/pre-IPO/public] — last raise: [$ @ valuation, date] [VERIFY] — IPO/exit window: [<12mo / 12–24mo / 24mo+ / none] — equity story: [refresher cadence, 409A vs preferred gap, tender/secondary, RSU vs ISO/NSO, cliff] — verdict: [LEAN IN / WATCH / SKIP for equity]

## 2. Compensation Bands — Mitchell's Archetypes

Tight table. Mid-of-band point estimates only.

| Role | Stage | Base | Annual equity ($) | TC | Δ vs 90d | Notes |
|------|-------|------|-------------------|-----|----------|-------|
[10–12 rows covering AI Solutions Architect, Forward Deployed Engineer, Applied AI Engineer, AI Enablement, AI PgM, Comms-AI hybrid — each at Series B/C, Series D+/pre-IPO, Big Tech AI div]

Below table: 1 line on which 3 companies are expanding bands; 1 line on which 3 are compressing. [VERIFY]

## 3. Hiring Activity — Highest Signal This Week

8–12 companies actively hiring Mitchell's archetypes RIGHT NOW. One line each:

**[Company]** — [archetype slot] — [signal: funding round / product launch / public headcount target / leader's X post] [VERIFY]

## 4. Company Health — Top 15 Targets

Targets: Anthropic, OpenAI, Google DeepMind, Mistral, Cohere, Perplexity, xAI, Character.AI, Sierra, Imbue, Runway, ElevenLabs, Harvey, Glean, Decagon. One line each:

**[Company]** — funding: [profitable / well-funded / runway <12mo] — hiring: [expanding / flat / contracting] — IPO/exit (24mo): [H/M/L] — risk flags: [if any] [VERIFY]

## 5. Skills Becoming Table-Stakes

5–8 skills/certs newly required vs 6mo ago:

**[Skill]** — frequency: [emerging / growing / table-stakes] — Mitchell action: [learn now / showcase existing / ignore]

Bias toward: agent eval frameworks, MCP, LLM orchestration (DSPy/LangGraph/LlamaIndex), RAG architecture, evals (Braintrust/Langfuse), Vertex AI/Bedrock, AI-native comms tooling.

## 6. Outreach Targets

Top 5 companies this week. Profile types only (titles change too fast for names):

**[Company]** — DM target: [title / team] — why: [hiring manager / gatekeeper / connector] — opener angle: [hook tied to a specific public artifact of theirs]

## 7. Geography

- Top 3 US metros — note remote-friendly vs onsite pressure.
- Top 3 international cities (visa-friendly + AI hiring expanding + good QoL/comp ratio).
- 1–2 cities to deprioritize and why.

## 8. Application Tactics — What's Working Now

5 bullets max:
- Resume format/length passing ATS at this seniority
- Profile elements triggering recruiter inbound
- Cover-letter approach landing interviews
- Auto-DQ patterns at screening
- One LinkedIn or GitHub signal that moved this week [VERIFY]

## 9. Top 5 Actions for Mitchell This Week

Ranked by expected $-impact-per-hour:
1. [Action] — why now: [signal] — time: [Xh] — payoff: [outcome]

## 10. Signals to Watch

3–5 uncertain signals: **[Signal]** — what would confirm/refute it.

---
*Generated by \`scripts/weekly-intel.mjs\` on ${DATE}. Verify [VERIFY] tags against live sources before acting.*`;

// ─── External platform prompts ────────────────────────────────────────────────

const SHARED_CONTEXT = `Candidate: Mitchell Williams. 18yr editorial (CNN, Al Jazeera, AJ+, HuffPost Live) + 6yr Google xGE shipping production AI for 1,000+ senior engineers. Targets: AI Solutions Architect, Forward Deployed Engineer, Applied AI Engineer, AI Enablement, AI PgM, AI-native Comms. Comp target $200K–$320K. Seattle, open to global relocation.

PRIMARY FILTER (overrides all other ranking): total comp + pre-IPO equity timing + RSU value-at-vest. Frontier labs (Anthropic, OpenAI, xAI, Perplexity, Sierra) are highest priority. Mature public comp only competes if cash+RSU materially beats a strong pre-IPO offer compounding over 4 years. Surface IPO/equity signals BEFORE role-fit.

Output rules: no preamble, no closing summary, no hedging. Point estimates with [VERIFY] tags. ≤2 sentences per bullet. Skip a bullet if you have nothing concrete — short and dense beats long and padded.`;

const PLATFORM_PROMPTS = {
  'chatgpt.md': `# ChatGPT Research Prompt — ${DATE}

Paste into ChatGPT (GPT-4o or newer with web search ON).

---

${SHARED_CONTEXT}

Research with web search and return EXACTLY these 5 sections (verbatim headers, no intro):

**1. Equity & IPO posture (PRIMARY)** — For each: Anthropic, OpenAI, xAI, Perplexity, Sierra, Cohere, Mistral, Harvey, Glean, Decagon — one line: stage / last raise ($ @ valuation, date) / IPO window (<12mo / 12–24mo / 24mo+ / none) / refresher cadence / 409A vs preferred gap / verdict (LEAN IN / WATCH / SKIP for equity). Cite source.

**2. Hiring activity** — 8–12 AI-native companies actively expanding headcount this week for AI Solutions Architect, Forward Deployed Engineer, AI PgM, or AI-native Comms. One line each: company — role family — signal (funding round / product launch / leader's public post). Cite.

**3. Compensation bands (Δ vs 90d)** — Table: Role | Stage | Base | Annual equity ($) | TC | Δ vs 90d. 8–10 rows covering my archetypes at Series B/C, Series D+/pre-IPO, Big Tech AI div. Mid-of-band point estimates, no ranges.

**4. Skills newly table-stakes** — 5–7 skills/certs in AI JDs now that weren't 6mo ago. One line: skill — frequency (emerging/growing/table-stakes) — my action (learn / showcase / ignore).

**5. Geography** — Top 3 US metros + top 3 international cities for my archetypes right now. Note visa pathways and remote-vs-onsite pressure. 1 line per city.

Cite sources. Tag uncertain claims [VERIFY]. No preamble.

---
`,

  'gemini.md': `# Gemini Research Prompt — ${DATE}

Paste into Gemini Advanced (2.0 Pro or newer, Google Search grounding ON).

---

${SHARED_CONTEXT}

Use Google Search grounding. Return EXACTLY these 4 sections (verbatim headers, no intro):

**Section A — Equity & IPO posture (PRIMARY)** — For each: Anthropic, OpenAI, xAI, Perplexity, Sierra, Cohere, Mistral, Character.AI, ElevenLabs, Runway, Harvey, Imbue — one row: stage / last raise ($ @ valuation, date) / IPO/exit window (<12mo / 12–24mo / 24mo+ / none) / known refresher cadence / verdict (LEAN IN / WATCH / SKIP for equity). One Google Search citation per company.

**Section B — Hiring filter intelligence** — At those companies, what are recruiters actually filtering for in AI Solutions Architect, Forward Deployed Engineer, and Applied AI PM roles right now? 5 bullets max: signal — what passes ATS — what gets screened.

**Section C — Compensation Δ vs 90d** — Is TC for senior AI-adjacent non-engineering roles (Comms, Enablement, PgM) up or down vs 90 days ago? Which 3 companies are expanding bands, which 3 compressing? Numbers preferred.

**Section D — LinkedIn outbound** — What outbound approach is hitting >20% reply rate from recruiters/hiring managers at AI-native companies right now? 3 bullets: opener pattern — context that earns reply — what kills the thread.

Cite sources inline. Tag uncertain [VERIFY]. No preamble.

---
`,

  'perplexity.md': `# Perplexity Pro Research Prompt — ${DATE}

Paste into Perplexity Pro (Focus: All).

---

${SHARED_CONTEXT}

Run these 4 targeted searches and synthesize. Return EXACTLY 4 sections, one per search (verbatim headers, no intro):

**Search 1 — IPO & secondary signals (PRIMARY)** — Query: "AI company IPO secondary tender 2026 Anthropic OpenAI xAI Perplexity Cohere Mistral Sierra". Return: which are preparing for IPO (banker selection, S-1 leaks), latest 409A or secondary marks, employee tender activity, expected window. 6–10 bullets.

**Search 2 — Forward Deployed / Solutions Architect hiring** — Query: "Forward Deployed Engineer Solutions Architect AI startup hiring 2026". Return: which companies posting volume is trending up, which are net-new openings vs backfill, any leader X posts about urgent hiring. 6–8 bullets.

**Search 3 — Comp benchmarks for AI-adjacent non-engineering** — Query: "AI Solutions Architect Forward Deployed comp Levels.fyi Blind 2026 equity refresher". Return: TC point estimates by stage (Series B/C, Series D+/pre-IPO, Big Tech AI div), refresher grant patterns, equity-to-base ratio shifts. Numbers, not adjectives.

**Search 4 — Geography & relocation** — Query: "AI company expansion city 2026 visa remote policy". Return: which cities are AI-native companies actively expanding into, which are reducing footprint, visa pathways for senior US-citizen relocation. 5–7 bullets.

For each section: top 3 most credible source URLs, what's confirmed, what's [VERIFY], one-action-this-week. No preamble.

---
`,

  'grok.md': `# Grok Research Prompt — ${DATE}

Paste into Grok (Heavy / Deep Search for X-thread coverage).

---

${SHARED_CONTEXT}

Search X posts, threads, leaked screenshots, and news from the last 7–14 days. Return EXACTLY 5 sections (verbatim headers, no intro), 3–5 bullets each, X-link or news-link cited per claim:

**1. Equity & IPO chatter (PRIMARY)** — X/insider sentiment on Anthropic, OpenAI, xAI, Perplexity, Sierra, Cohere, Mistral IPO/secondary timing. Any banker pings, S-1 rumors, secondary market spreads, employee tender screenshots, valuation marks. Lean toward concrete signals over speculation.

**2. Hiring signals** — Who's hiring loud (leader X posts, "we're hiring" threads, $$ bonuses), who's quietly freezing, who's offering retention/stay bonuses. Cover Forward Deployed, Solutions Architect, AI PgM, AI-native Comms. Cite the post.

**3. Comp & equity discussion** — What AI workers are posting about offers, refreshers, vesting changes, equity-to-base ratio shifts. Screenshots > anecdotes.

**4. Job-search meta** — What recruiters/hiring managers say is working vs ghosting candidates this week (cover letters, LinkedIn DMs, portfolio links, GitHub signals).

**5. Skills & geography deltas** — Newly required skills/certs surfacing in JDs (especially MCP, agent evals, DSPy/LangGraph), and any city/remote-policy shifts at AI-native companies.

Cite the X post or article URL. Flag contradictions [CONFLICT]. No preamble, no summary.

---
`,
};

// ─── Run Claude research ──────────────────────────────────────────────────────

function runClaudeResearch() {
  console.log('Running Claude market intelligence research…');
  const result = spawnSync('claude', ['-p', '--output-format=text'], {
    input: CLAUDE_PROMPT,
    encoding: 'utf-8',
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180_000,
  });

  if (result.status !== 0) {
    console.error('Claude research failed:');
    console.error(result.stderr || '(no stderr)');
    return null;
  }

  return (result.stdout || '').trim();
}

// ─── Write outputs ────────────────────────────────────────────────────────────

function writePrompts() {
  for (const [filename, content] of Object.entries(PLATFORM_PROMPTS)) {
    const path = join(PROMPTS_DIR, filename);
    writeFileSync(path, content);
    console.log(`Prompt written: ${path}`);
  }
}

function archiveCount() {
  return readdirSync(INTEL_DIR).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/)).length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log('\n=== CLAUDE RESEARCH PROMPT ===\n');
  console.log(CLAUDE_PROMPT);
  console.log('\n=== PLATFORM PROMPTS (would write) ===');
  for (const f of Object.keys(PLATFORM_PROMPTS)) console.log(`  data/weekly-intel/prompts/${f}`);
  console.log('\n[Dry run — no files written]');
  process.exit(0);
}

if (PROMPTS_ONLY) {
  writePrompts();
  console.log('Prompts updated. Copy from data/weekly-intel/prompts/ into each platform.');
  process.exit(0);
}

const report = runClaudeResearch();
if (!report) process.exit(1);

// Write dated archive
writeFileSync(DATED, report);
console.log(`Archive written: ${DATED}`);

// Overwrite CURRENT
writeFileSync(CURRENT, report);
console.log(`CURRENT updated: ${CURRENT}`);

// Write platform prompts
writePrompts();

console.log(`\nWeekly intel complete. ${archiveCount()} reports in archive.`);
console.log('Next: open data/weekly-intel/CURRENT.md and check sections marked [VERIFY].');
console.log('Then copy prompts from data/weekly-intel/prompts/ into ChatGPT / Gemini / Perplexity / Grok.');
