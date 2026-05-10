#!/usr/bin/env node
/**
 * scripts/enrich-roles-corroborate.mjs
 *
 * Layer-2 enrichment pass — calls Grok via xAI's Responses API with the
 * web_search + x_search tools enabled, asks for social-media corroboration
 * of comp / benefits / sentiment claims that the primary council pass made.
 * Writes the result back into each role's existing JSON under
 * `social_corroboration` (preserves all other fields).
 *
 * Why this is a separate pass: Grok with x_search is the only model in
 * the council that indexes Blind / TeamBlind / cscareerquestions / X
 * (Twitter) employee threads in real time. The other models read these
 * sources only via Google indirection. This pass adds the "what
 * employees actually post about it" layer that's hardest to fake.
 *
 * Usage:
 *   node scripts/enrich-roles-corroborate.mjs               # all enriched roles
 *   node scripts/enrich-roles-corroborate.mjs --rank=4      # single role
 *   node scripts/enrich-roles-corroborate.mjs --skip-existing  # only roles
 *                                              missing social_corroboration
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callCouncil } from '../lib/council.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'data/role-enrichment');

const args = process.argv.slice(2);
const SINGLE_RANK = args.find(a => a.startsWith('--rank=')) ? parseInt(args.find(a => a.startsWith('--rank=')).split('=')[1], 10) : null;
const SKIP_EXISTING = args.includes('--skip-existing');

function buildPrompt(company, role, posture) {
  return `You are a hiring-intelligence researcher. Use Google Web Search AND X/Twitter Search aggressively to corroborate (or refute) the following claims about working at ${company} in 2026, specifically for the "${role}" role family. Cite SPECIFIC posts, threads, or URLs inline.

Today is ${new Date().toISOString().slice(0, 10)}. Mitchell Williams (Seattle-based, senior IC) is evaluating this offer. PRIMARY filter: total comp + pre-IPO equity + RSU value-at-vest.

Existing claims to corroborate (from a separate Anthropic+Gemini+Perplexity council pass — verify or contradict each):
${posture}

Output exactly this JSON (no markdown, no preamble):

{
  "comp_corroboration": {
    "blind_thread_evidence": "{quote 1-2 specific Blind threads with rough date stamps; e.g. 'L5 Anthropic offer Feb 2026: $450K cash + $2.4M RSU/4yr — confirmed in https://teamblind.com/post/...'. If no Blind data found, state 'no Blind evidence found' explicitly.}",
    "x_twitter_evidence": "{quote 1-2 specific X posts; founder/exec posts about hiring or comp leaks. If none found, state 'no X evidence found'.}",
    "leveling_evidence": "{Levels.fyi data points with URL — band median, P25/P75 if shown}",
    "agreement_with_council": "{HIGH | MEDIUM | LOW + 1-sentence explanation of where social signal agrees/disagrees}"
  },
  "benefits_corroboration": {
    "401k_signal": "{employee post or HR doc citation if found, else 'no public signal'}",
    "healthcare_signal": "{review thread / post citation if found, else 'no public signal'}",
    "mental_health_signal": "{posts about EAP / Lyra / Spring usage at this company, else 'no public signal'}",
    "agreement_with_council": "{HIGH | MEDIUM | LOW + 1-sentence}"
  },
  "sentiment_corroboration": {
    "blind_recent_posts": "{summary of last 90 days of Blind threads at this company, with 1-2 quoted snippets}",
    "x_team_signal": "{recent founder/exec/team posts about culture, attrition, hiring. quote a specific post.}",
    "reddit_signal": "{r/cscareerquestions / r/ExperiencedDevs / r/MachineLearning thread quote, with subreddit + month}",
    "toxicity_grade_corroborated": "{1-5 integer based on social signal alone, separate from council's grade}",
    "biggest_red_flag_in_socials": "{ONE concrete artifact if any, else 'none surfaced'}",
    "biggest_green_flag_in_socials": "{ONE concrete artifact if any, else 'none surfaced'}",
    "agreement_with_council": "{HIGH | MEDIUM | LOW + 1-sentence}"
  },
  "people_corroboration": {
    "named_employees_posting": "{names of current employees observed posting about this team in last 90 days, with link or thread title}",
    "hiring_team_visibility": "{HIGH | MEDIUM | LOW — how visible is this team's leadership on X/LinkedIn?}",
    "recommended_outreach_target": "{If any specific person stands out as the highest-leverage warm-outreach target based on social presence, name them + why. Else 'none identified'.}"
  },
  "_meta": {
    "model": "grok-4-fast-reasoning+web_search+x_search",
    "generated_at": "${new Date().toISOString()}",
    "confidence": "{H|M|L}"
  }
}

CRITICAL: be HONEST. If a section truly returns no signal, state so. Do NOT fabricate Blind URLs or quote text. The JSON MUST parse — no trailing commas.`;
}

function summarizeForPrompt(j) {
  const lines = [];
  if (j.relocation?.amount_estimate_usd) lines.push(`- Relocation amount estimate: ${j.relocation.amount_estimate_usd}`);
  if (j.benefits?.['401k_match'] && j.benefits['401k_match'] !== 'unknown') lines.push(`- 401(k) match: ${j.benefits['401k_match']}`);
  if (j.benefits?.healthcare && j.benefits.healthcare !== 'unknown') lines.push(`- Healthcare: ${String(j.benefits.healthcare).slice(0, 200)}`);
  if (j.sentiment?.team_toxicity_grade) lines.push(`- Council toxicity grade: ${j.sentiment.team_toxicity_grade}/5`);
  if (j.sentiment?.blind_score) lines.push(`- Council Blind summary: ${String(j.sentiment.blind_score).slice(0, 200)}`);
  if (j.sentiment?.glassdoor_score) lines.push(`- Council Glassdoor: ${String(j.sentiment.glassdoor_score).slice(0, 200)}`);
  return lines.join('\n');
}

function tryParseJson(text) {
  if (!text) return null;
  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  // Find first { and matching last }
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(cleaned.slice(first, last + 1)); } catch { return null; }
}

const files = readdirSync(DIR)
  .filter(f => f.endsWith('.json') && /^\d{2}-/.test(f))
  .sort();

let targets = files;
if (SINGLE_RANK) {
  const prefix = String(SINGLE_RANK).padStart(2, '0') + '-';
  targets = files.filter(f => f.startsWith(prefix));
}

if (!targets.length) { console.error('No matching enrichment files'); process.exit(1); }

console.log(`[corroborate] Scanning ${targets.length} role enrichment files...\n`);

let totalCost = 0;
let updated = 0;
let skipped = 0;
let failed = 0;

for (const f of targets) {
  const fp = join(DIR, f);
  const j = JSON.parse(readFileSync(fp, 'utf-8'));
  if (SKIP_EXISTING && j.social_corroboration) {
    console.log(`  ⊘ ${f} (already has social_corroboration)`);
    skipped++;
    continue;
  }
  process.stdout.write(`  ${f.padEnd(60)} → `);
  const t0 = Date.now();
  try {
    const r = await callCouncil({
      prompt: buildPrompt(j.company, j.role, summarizeForPrompt(j)),
      models: ['xai:grok-4-x-search'],
      opts: { maxTokens: 3500 },
    });
    const out = r.results[0];
    if (out.error) {
      console.log(`❌ ${out.error.slice(0, 80)}`);
      failed++;
      continue;
    }
    const parsed = tryParseJson(out.content);
    if (!parsed) {
      console.log(`❌ JSON parse failed (got ${out.content.length} chars)`);
      failed++;
      continue;
    }
    j.social_corroboration = parsed;
    if (Array.isArray(out.citations) && out.citations.length) {
      j.social_corroboration._citations = out.citations.slice(0, 12);
    }
    writeFileSync(fp, JSON.stringify(j, null, 2));
    const cost = (out.tokens || 0) * 0.000005; // ballpark grok pricing
    totalCost += cost;
    console.log(`✓ ${out.tokens} tok · ${out.ms}ms · ~$${cost.toFixed(4)}`);
    updated++;
  } catch (e) {
    console.log(`❌ ${e.message.slice(0, 80)}`);
    failed++;
  }
}

console.log(`\n[corroborate] Done. ${updated} updated · ${skipped} skipped · ${failed} failed`);
console.log(`Total cost: ~$${totalCost.toFixed(2)}`);
console.log(`Run \`node scripts/build-dashboard.mjs\` to surface in the UI.`);
