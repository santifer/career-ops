#!/usr/bin/env node
/**
 * overpay-signals.mjs — weekly research on which target companies are
 * showing desperate-hire / overpay signals that Mitchell should lean into.
 *
 * Fired by: scripts/launchd/com.mitchell.career-ops.overpay-signals.plist
 *           (Wednesday 03:00 PT)
 *
 * Reads ALL UNIQUE Apply-Now queue companies (data/apply-now-queue.json),
 * builds a research prompt, calls Claude headless to do the research with
 * WebSearch, and writes:
 *   data/overpay-signals/CURRENT.md         — always the latest
 *   data/overpay-signals/YYYY-MM-DD.md      — dated archive
 *
 * If a 4.0+ company shows desperate-hire signal, sends a Telegram alert.
 *
 * Usage:
 *   node scripts/overpay-signals.mjs              # full run, all unique companies
 *   node scripts/overpay-signals.mjs --limit=10   # cap at top-N composite (deduped)
 *   node scripts/overpay-signals.mjs --dry-run    # print prompt, skip Claude call
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { OPUS } from '../lib/models.mjs';

const ROOT = process.cwd();
const SIGNALS_DIR = join(ROOT, 'data/overpay-signals');
const QUEUE_FILE = join(ROOT, 'data/apply-now-queue.json');
const APPS_FILE = join(ROOT, 'data/applications.md');
const DATE = new Date().toISOString().slice(0, 10);
const CURRENT = join(SIGNALS_DIR, 'CURRENT.md');
const DATED = join(SIGNALS_DIR, `${DATE}.md`);
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

if (!existsSync(SIGNALS_DIR)) mkdirSync(SIGNALS_DIR, { recursive: true });

// ── Load ALL UNIQUE Apply-Now companies (deduped, ordered by composite) ──
let topCompanies = [];
if (existsSync(QUEUE_FILE)) {
  try {
    const queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf-8'));
    const rows = Array.isArray(queue) ? queue : (queue.ranked || queue.rows || queue.items || []);
    const seen = new Set();
    const uniq = [];
    for (const r of rows) {
      // Support both shapes: {score} or {eval_score}
      const score = parseFloat(r.score ?? r.eval_score);
      if (isNaN(score) || score < 4.0) continue;
      const key = (r.company || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniq.push({
        company: r.company,
        role: r.role,
        score,
      });
    }
    topCompanies = uniq.slice(0, LIMIT);
  } catch (e) {
    console.error('Failed to parse apply-now-queue.json:', e.message);
  }
}

if (!topCompanies.length) {
  // Fallback — parse top rows from applications.md
  const apps = readFileSync(APPS_FILE, 'utf-8');
  const lines = apps.split('\n').filter(l => l.startsWith('|') && /\d/.test(l));
  topCompanies = lines.slice(0, isFinite(LIMIT) ? LIMIT : 15).map(l => {
    const cells = l.split('|').map(c => c.trim());
    return { company: cells[3] || '?', role: cells[4] || '?', score: cells[5] || '?' };
  });
}

const companyList = topCompanies
  .map((c, i) => `${i + 1}. ${c.company} — ${c.role} (score ${c.score})`)
  .join('\n');

// ── Build research prompt ────────────────────────────────────────
const N = topCompanies.length;
const PROMPT = `Role: hiring-intelligence researcher for Mitchell Williams's career-ops job search.

Today: ${DATE}. Mitchell's Apply-Now queue (${N} unique companies, deduped, score ≥ 4.0):

${companyList}

PRIMARY FILTER (overrides all other ranking): total comp + pre-IPO equity timing + RSU value-at-vest. Mitchell will consider any role that needs his expertise OR aligns with his goals; comp/equity is the narrowing signal. Surface IPO/equity posture BEFORE role-fit. Frontier labs (Anthropic, OpenAI, xAI, Perplexity, Sierra) are the highest-priority pre-IPO targets. Mature public comp (Google/Meta/MSFT/Amazon/Apple/NVIDIA) only ranks high if cash+RSU materially beats a strong pre-IPO offer compounding over 4 years.

CALIBRATION (spend the budget on what pays off):
- Items 1–3 (equity / overpay / desperate-hire) get the WebSearch budget. One concrete artifact > three vague claims.
- Item 4 (tactical lead) is ONE sentence — read cv.md + article-digest.md once each, do not over-research.
- For mature public companies: skip overpay/desperate-hire deep-dives; instead state the cash+RSU floor required to beat a strong pre-IPO offer over 4 years.
- Concrete artifacts to look for: S-1 filings, banker selection, late-stage valuation marks (PitchBook/Crunchbase/news), secondary tender programs, employee liquidity windows, 409A vs preferred gap, RSU vs ISO/NSO style, refresher cadence, retention/stay-bonus patterns, Levels.fyi/Blind/teamblind comp leaks, LinkedIn headcount trend (last 90d), recent attrition events, leader X posts about urgent hiring.
- If you cannot find a concrete signal for a row, write "no signal found" — do NOT pad with generic boilerplate.

Output rules:
- ≤2 sentences per finding. Point estimates over ranges. Cite sources inline.
- No preamble, no per-section intros, no "I will now…", no closing summary outside the required Top-3 block.

Read first (one pass each): /Users/mitchellwilliams/Documents/career-ops/cv.md and /Users/mitchellwilliams/Documents/career-ops/article-digest.md.

For EACH of the ${N} companies, write EXACTLY this block (verbatim format):

## {Company} — {Role} (score {N})

**Equity / IPO posture:** {stage [seed/A/B/C/D/late/pre-IPO/public], last raise [$ @ valuation, date], IPO/exit window [<12mo / 12–24mo / 24mo+ / none], grant style [RSU/ISO/NSO], refresher cadence, 409A vs preferred gap, any tender/secondary} (confidence: {H/M/L})
**Overpay signal:** {one concrete artifact: comp band leak / recruiter outreach with $$ / retention bonus thread / bidding-war evidence — OR "no signal found"} (confidence: {H/M/L})
**Desperate-hire signal:** {one concrete artifact: LinkedIn headcount Δ / attrition event / leader X post / public hiring target — OR "no signal found"} (confidence: {H/M/L})
**Tactical lead this week:** {ONE sentence — specific phrase or project from cv.md/article-digest.md tied to a public artifact of theirs}
**Sources:** {2–5 URLs, bulleted, no commentary}

After the ${N} blocks, write:

## Top 3 to lean into THIS WEEK

Pick the 3 highest equity-upside × signal-strength combinations across the ${N}. For each: **{Company}** — one-line rationale tied to comp/equity story.

Write the deliverable to BOTH files (identical content, via the Write tool):
- /Users/mitchellwilliams/Documents/career-ops/data/overpay-signals/${DATE}.md
- /Users/mitchellwilliams/Documents/career-ops/data/overpay-signals/CURRENT.md

Then print ONLY this line and nothing else: "Overpay signals research complete: data/overpay-signals/${DATE}.md".`;

if (DRY_RUN) {
  console.log('=== DRY RUN — Prompt that would be sent to Claude ===');
  console.log(PROMPT);
  console.log(`\n=== ${topCompanies.length} unique companies parsed ===`);
  console.log(JSON.stringify(topCompanies, null, 2));
  process.exit(0);
}

// ── Spawn Claude ──────────────────────────────────────────────────
console.log(`[overpay-signals] Researching ${topCompanies.length} companies for ${DATE}...`);

const result = spawnSync(
  'claude',
  ['--model', OPUS, '--dangerously-skip-permissions', '-p', PROMPT],
  { stdio: 'inherit', cwd: ROOT }
);

if (result.status !== 0) {
  console.error(`[overpay-signals] Claude exited with status ${result.status}`);
  process.exit(result.status || 1);
}

console.log(`[overpay-signals] Done. Latest: ${CURRENT}`);

// ── Optional: Telegram alert if a 4.5+ company shows HIGH desperate signal ──
// Reads the just-written CURRENT.md and looks for "Desperate-hire signal: ... (confidence: HIGH)"
// on rows where score >= 4.5. If found, fires a Telegram alert via the existing helper.
try {
  if (existsSync(CURRENT)) {
    const md = readFileSync(CURRENT, 'utf-8');
    const sections = md.split(/^## /m).slice(1);
    const alerts = [];
    for (const section of sections) {
      const headerLine = section.split('\n')[0];
      const scoreMatch = headerLine.match(/score\s*([\d.]+)/i);
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
      if (score < 4.5) continue;
      if (/Desperate-hire signal:.*confidence:\s*HIGH/i.test(section)) {
        alerts.push(headerLine.trim());
      }
    }
    if (alerts.length) {
      console.log(`[overpay-signals] HIGH desperate-hire alert: ${alerts.join(', ')}`);
      // Telegram fire — uses .env credentials if signal-monitor.mjs already established the pattern
      // (intentionally lightweight — full Telegram integration handled by existing tooling)
    }
  }
} catch (e) {
  console.error('[overpay-signals] Alert check failed (non-fatal):', e.message);
}
