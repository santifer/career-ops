#!/usr/bin/env node
/**
 * scripts/equity-deep-research.mjs
 *
 * Per-company equity / IPO posture research via Gemini 2.5 Pro WITH Google Search
 * grounding. Acts as a cross-check signal layered on top of the Anthropic-Claude
 * overpay-signals.mjs run.
 *
 * Output: data/equity-deep-research/{company-slug}.md (per-company)
 *         data/equity-deep-research/INDEX.md           (side-by-side comparison)
 *
 * Usage:
 *   node scripts/equity-deep-research.mjs            # all 11 unique Apply-Now
 *   node scripts/equity-deep-research.mjs --top=3    # top 3 by composite
 *   node scripts/equity-deep-research.mjs --company=Anthropic  # single company
 *
 * Cost: ~$0.30 for all 11 companies (Gemini 2.5 Pro grounded).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callCouncil } from '../lib/council.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const QUEUE_FILE = join(ROOT, 'data/apply-now-queue.json');
const OUT_DIR = join(ROOT, 'data/equity-deep-research');
const OVERPAY_PATH = join(ROOT, 'data/overpay-signals/CURRENT.md');

const args = process.argv.slice(2);
const TOP = args.find(a => a.startsWith('--top=')) ? parseInt(args.find(a => a.startsWith('--top=')).split('=')[1], 10) : null;
const SINGLE_COMPANY = args.find(a => a.startsWith('--company=')) ? args.find(a => a.startsWith('--company=')).split('=')[1] : null;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
const seen = new Set();
let companies = [];
for (const r of queue.ranked) {
  const c = r.company;
  if (seen.has(c)) continue;
  seen.add(c);
  companies.push({ company: c, role: r.role, score: r.eval_score, composite: r.composite });
}
if (TOP) companies = companies.sort((a, b) => b.composite - a.composite).slice(0, TOP);
if (SINGLE_COMPANY) companies = companies.filter(c => slug(c.company).startsWith(slug(SINGLE_COMPANY)));

if (!companies.length) { console.error('No matching companies'); process.exit(1); }

const overpayText = existsSync(OVERPAY_PATH) ? readFileSync(OVERPAY_PATH, 'utf8') : '';
function findOverpayBlock(company) {
  const blocks = overpayText.split(/^## /m);
  const want = slug(company).split('-')[0];
  const m = blocks.find(b => slug(b.split('\n')[0]).startsWith(want));
  return m ? '## ' + m.trim() : null;
}

function buildPrompt(company, role) {
  return `You are a hiring-intelligence researcher for Mitchell Williams's career-ops job search. Today is ${new Date().toISOString().slice(0,10)}.

Use Google Search aggressively. Mitchell's PRIMARY filter is total comp + pre-IPO equity timing + RSU value-at-vest. Surface IPO/equity posture BEFORE role-fit.

Research ${company} for the role "${role}". Focus on the LAST 60 DAYS of public signal.

Output exactly this format (verbatim, no preamble):

## ${company} — Equity Deep Research (${new Date().toISOString().slice(0,10)}, Gemini 2.5 Pro grounded)

**Equity / IPO posture:** [stage / last raise $ @ valuation, date / IPO/exit window <12mo / 12-24mo / 24mo+ / none / grant style RSU/ISO/NSO/PPU / refresher cadence / 409A vs preferred gap / any tender or secondary] (confidence: H/M/L)

**Overpay signal:** [ONE concrete artifact: comp band leak / recruiter outreach $ / retention bonus thread / bidding-war evidence — OR "no signal found"] (confidence: H/M/L)

**Desperate-hire signal:** [ONE concrete artifact: LinkedIn headcount delta over 30/60/90d / attrition event / leader X post about urgent hiring / public hiring target — OR "no signal found"] (confidence: H/M/L)

**Tactical lead this week:** [ONE sentence — specific phrase, project, or recent event tied to a public artifact of theirs that Mitchell could reference in cold outreach this week]

**Grant-instrument detail (Gemini's specific value-add):** [PPU vs RSU vs ISO/NSO transition status; estimated 409A-to-preferred discount %; RSU double-trigger or single-trigger structure if known]

**Sources:** [3-6 URLs from your search, bulleted]

Be concrete. Cite. Point estimates over ranges. Under 400 words.`;
}

function readSafe(p) { try { return readFileSync(p, 'utf8'); } catch { return null; } }

console.log(`[equity-deep-research] Researching ${companies.length} companies via Gemini 2.5 Pro grounded...\n`);

const results = [];
let totalCost = 0;
for (const c of companies) {
  process.stdout.write(`  ${c.company.padEnd(20)} → `);
  const t0 = Date.now();
  try {
    const r = await callCouncil({ prompt: buildPrompt(c.company, c.role), models: ['google:gemini-2.5-pro'], opts: { maxTokens: 2500 } });
    const out = r.results[0];
    if (out.error) {
      console.log(`❌ ${out.error}`);
      results.push({ ...c, error: out.error });
      continue;
    }
    const fpath = join(OUT_DIR, `${slug(c.company)}.md`);
    writeFileSync(fpath, out.content);
    const tok = out.tokens || 0;
    const cost = tok * 0.000005; // ballpark gemini-2.5-pro pricing
    totalCost += cost;
    console.log(`✓ ${tok} tok · ${out.ms}ms · ~$${cost.toFixed(4)}`);
    results.push({ ...c, content: out.content, tokens: tok, ms: out.ms, fpath });
  } catch (e) {
    console.log(`❌ ${e.message}`);
    results.push({ ...c, error: e.message });
  }
}

// Build INDEX.md side-by-side comparison
const indexLines = [
  `# Equity Deep Research INDEX — ${new Date().toISOString().slice(0,10)}`,
  '',
  `Side-by-side comparison: **Gemini 2.5 Pro (grounded)** vs **Anthropic-CURRENT (data/overpay-signals/CURRENT.md)**.`,
  '',
  `Total Gemini cost: ~$${totalCost.toFixed(2)} · ${results.filter(r => !r.error).length}/${results.length} succeeded`,
  '',
  '## Per-company comparison',
  '',
  '| Company | Gemini posture (1-line) | Anthropic-CURRENT posture (1-line) |',
  '|---|---|---|',
];
for (const r of results) {
  if (r.error) { indexLines.push(`| ${r.company} | ❌ ${r.error.slice(0, 60)} | — |`); continue; }
  const gPosture = (r.content.match(/\*\*Equity \/ IPO posture:\*\*\s*([^\n]+)/) || ['', ''])[1].slice(0, 100);
  const overpayBlock = findOverpayBlock(r.company);
  const aPosture = overpayBlock ? (overpayBlock.match(/\*\*Equity \/ IPO posture:\*\*\s*([^\n]+)/) || ['', ''])[1].slice(0, 100) : '—';
  indexLines.push(`| ${r.company} | ${gPosture}... | ${aPosture}... |`);
}
indexLines.push('', '## Files', '');
results.forEach(r => indexLines.push(`- [${r.company}](./${slug(r.company)}.md)${r.error ? ' (errored)' : ''}`));

writeFileSync(join(OUT_DIR, 'INDEX.md'), indexLines.join('\n') + '\n');

console.log(`\n[equity-deep-research] Done. ${results.filter(r=>!r.error).length}/${results.length} succeeded.`);
console.log(`Total cost: ~$${totalCost.toFixed(2)}`);
console.log(`Output: ${OUT_DIR}`);
