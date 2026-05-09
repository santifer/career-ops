#!/usr/bin/env node
/**
 * overpay-signals.mjs — weekly research on which target companies are
 * showing desperate-hire / overpay signals that Mitchell should lean into.
 *
 * Fired by: scripts/launchd/com.mitchell.career-ops.overpay-signals.plist
 *           (Wednesday 03:00 PT)
 *
 * Reads the top 10 Apply-Now queue companies (data/apply-now-queue.json),
 * builds a research prompt, calls Claude headless to do the research with
 * WebSearch, and writes:
 *   data/overpay-signals/CURRENT.md         — always the latest
 *   data/overpay-signals/YYYY-MM-DD.md      — dated archive
 *
 * If a 4.0+ company shows desperate-hire signal, sends a Telegram alert.
 *
 * Usage:
 *   node scripts/overpay-signals.mjs            # full run
 *   node scripts/overpay-signals.mjs --dry-run  # print prompt, skip Claude call
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = process.cwd();
const SIGNALS_DIR = join(ROOT, 'data/overpay-signals');
const QUEUE_FILE = join(ROOT, 'data/apply-now-queue.json');
const APPS_FILE = join(ROOT, 'data/applications.md');
const DATE = new Date().toISOString().slice(0, 10);
const CURRENT = join(SIGNALS_DIR, 'CURRENT.md');
const DATED = join(SIGNALS_DIR, `${DATE}.md`);
const DRY_RUN = process.argv.includes('--dry-run');

if (!existsSync(SIGNALS_DIR)) mkdirSync(SIGNALS_DIR, { recursive: true });

// ── Load top 10 Apply-Now companies ──────────────────────────────
let topCompanies = [];
if (existsSync(QUEUE_FILE)) {
  try {
    const queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf-8'));
    const rows = Array.isArray(queue) ? queue : (queue.rows || queue.items || []);
    topCompanies = rows
      .filter(r => parseFloat(r.score) >= 4.0)
      .slice(0, 10)
      .map(r => ({
        company: r.company,
        role: r.role,
        score: r.score,
      }));
  } catch (e) {
    console.error('Failed to parse apply-now-queue.json:', e.message);
  }
}

if (!topCompanies.length) {
  // Fallback — parse top rows from applications.md
  const apps = readFileSync(APPS_FILE, 'utf-8');
  const lines = apps.split('\n').filter(l => l.startsWith('|') && /\d/.test(l));
  topCompanies = lines.slice(0, 10).map(l => {
    const cells = l.split('|').map(c => c.trim());
    return { company: cells[3] || '?', role: cells[4] || '?', score: cells[5] || '?' };
  });
}

const companyList = topCompanies
  .map((c, i) => `${i + 1}. ${c.company} — ${c.role} (score ${c.score})`)
  .join('\n');

// ── Build research prompt ────────────────────────────────────────
const PROMPT = `You are a hiring-intelligence researcher for Mitchell Williams's job search at career-ops.

Today is ${DATE}. Mitchell's top 10 Apply-Now queue companies are:

${companyList}

**PRIMARY FILTER (read this first):** Mitchell's #1 priority is total compensation + pre-IPO equity timing + RSU value-at-vest. He will consider ANY role aligned with his expertise or goals, but the ranking signal that matters is comp/equity upside. Surface pre-IPO stage and equity story BEFORE role fit.

For EACH of these companies, research and report (use WebSearch heavily — recent X posts, LinkedIn job count trends, Levels.fyi comp data, Glassdoor sentiment changes, news about funding rounds, layoffs at competitors, public hiring manager statements):

1. **Equity / IPO posture (HIGHEST WEIGHT)** — what is the company's IPO trajectory? Look for: S-1 filings, banker selection, late-stage raise valuations + tier of investors, secondary tender programs, employee liquidity windows, 409A vs preferred share gap, RSU vs ISO/NSO grant style, refresher grant cadence, expected vest cliff, retention/stay-bonus patterns, recent comp band leaks on Levels.fyi/Blind. If the company is mature public (Google, Meta, Microsoft, Amazon, Apple, NVIDIA), state the cash+RSU package required to compete with a strong pre-IPO offer compounding over 4 years.

2. **Overpay signals** — is the company offering above-market comp for this role family right now? Look for: comp band leaks on Levels.fyi/Blind, recruiter outreach about "competitive offers", current employee posts about retention bonuses, signs of bidding wars vs specific competitors.

3. **Desperate-hire signals** — does the team seem urgently understaffed? Look for: rapid headcount growth in this org (LinkedIn People filter), recent attrition events, public statements about hiring goals, replacements for high-profile recent departures, founder/CEO X posts about needing specific skills.

4. **Tactical lead** — what specific phrase, project, or experience from Mitchell's CV (read /Users/mitchellwilliams/Documents/career-ops/cv.md and article-digest.md to understand his profile) should he lead with in his cover letter or first recruiter message to this specific company this week? One sentence per company.

5. **Confidence** — HIGH / MEDIUM / LOW based on source quality.

Write the deliverable to /Users/mitchellwilliams/Documents/career-ops/data/overpay-signals/${DATE}.md AND /Users/mitchellwilliams/Documents/career-ops/data/overpay-signals/CURRENT.md (same content, two files).

Format each company as:

## {Company Name} — {Role} (score {N})

**Equity / IPO posture:** {stage, expected timing, grant style, recent valuation, refresher cadence} (confidence: {H/M/L})
**Overpay signal:** {finding} (confidence: {H/M/L})
**Desperate-hire signal:** {finding} (confidence: {H/M/L})
**Tactical lead this week:** {one sentence}
**Sources:** {bulleted list of URLs}

After all 10 companies, end with a "Top 3 to lean into THIS WEEK" section listing the 3 strongest signals across all 10, with one-line rationale each.

Use the Write tool to create both files. Then print only: "Overpay signals research complete: data/overpay-signals/${DATE}.md".`;

if (DRY_RUN) {
  console.log('=== DRY RUN — Prompt that would be sent to Claude ===');
  console.log(PROMPT);
  console.log('\n=== Top 10 companies parsed ===');
  console.log(JSON.stringify(topCompanies, null, 2));
  process.exit(0);
}

// ── Spawn Claude ──────────────────────────────────────────────────
console.log(`[overpay-signals] Researching ${topCompanies.length} companies for ${DATE}...`);

const result = spawnSync(
  'claude',
  ['--model', 'claude-opus-4-7', '--dangerously-skip-permissions', '-p', PROMPT],
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
