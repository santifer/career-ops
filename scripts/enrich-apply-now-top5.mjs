#!/usr/bin/env node
/**
 * scripts/enrich-apply-now-top5.mjs
 *
 * Runs the multi-model council against the top-5 apply-now roles to enrich
 * each with relocation, benefits, sentiment, and people intelligence.
 *
 * Output: data/role-enrichment/{rank}-{slug}.json + INDEX.md
 *
 * Usage:
 *   source ~/.career-ops-secrets && node scripts/enrich-apply-now-top5.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callCouncil } from '../lib/council.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'data', 'role-enrichment');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// --- Top 5 roles (per task spec; verified against data/apply-now-queue.json) ---
const ROLES = [
  { rank: 1, num: '1509', company: 'OpenAI',    role: 'AI Deployment Engineer — Media Partnerships',          slug: '01-openai-ai-deployment-engineer-media-partnerships' },
  { rank: 2, num: '1511', company: 'OpenAI',    role: 'Onboarding & Enablement Program Manager FDE',          slug: '02-openai-onboarding-enablement-program-manager-fde' },
  { rank: 3, num: '2050', company: 'Anthropic', role: 'Strategic Operations Manager, Claude Marketplace',     slug: '03-anthropic-strategic-operations-manager-claude-marketplace' },
  { rank: 4, num: '59',   company: 'Sierra',    role: 'Developer Relations Engineer (SF)',                    slug: '04-sierra-developer-relations-engineer-sf' },
  { rank: 5, num: '48',   company: 'Anthropic', role: 'Engineering Editorial Lead',                           slug: '05-anthropic-engineering-editorial-lead' },
];

// --- Prompt builder ---
function buildPrompt(company, role) {
  return `You are a hiring-intelligence researcher for Mitchell Williams's career-ops job search. Today is 2026-05-10. Mitchell targets senior comms / forward-deployed / solutions-architect / AI-enablement / strategic-ops roles at frontier AI labs. He's currently Seattle-based. PRIMARY filter: total comp + pre-IPO equity timing + RSU value-at-vest.

Research **${company} — ${role}**. Use Google Search aggressively. Cite sources inline.

Return a JSON object with these fields (no markdown, no preamble — just the JSON):

{
  "company": "${company}",
  "role": "${role}",
  "relocation": {
    "package_summary": "1-2 sentence description of typical ${company} relocation packages — lump sum vs broker-managed, $ amount range, what's covered (movers, temp housing, flights, sign-on relo bonus, lease-break)",
    "amount_estimate_usd": "{e.g. $25000-$60000 or 'lump-sum ~$10k' or 'unknown'}",
    "policy_notes": "{What's the cooldown? Tax-grossed-up? Vest-cliff for relo bonus? Source citations.}",
    "sources": ["url1", "url2"]
  },
  "benefits": {
    "401k_match": "{e.g. '4% Safe Harbor' or '6% match dollar-for-dollar' or 'unknown'}",
    "healthcare": "{plan tier (Premium PPO / HDHP / etc), insurer, employer-paid premium %, network breadth}",
    "dental_vision": "{coverage summary}",
    "estimated_copay": "{For Mitchell at his expected base — what's monthly out-of-pocket realistically?}",
    "meals_provided": "{breakfast/lunch/dinner/snacks/none, in-office only?}",
    "mental_health": "{EAP, Lyra/Spring/Modern Health/Headspace, # sessions/yr, dependent coverage?}",
    "other_perks": "{commuter, fitness, learning stipend, parental leave specifics, sabbatical}",
    "sources": ["url1", "url2"]
  },
  "sentiment": {
    "blind_score": "{rating + recent thread sentiment one-liner}",
    "glassdoor_score": "{star rating + key recurring themes}",
    "reddit_pulse": "{r/cscareerquestions, r/ExperiencedDevs sentiment in last 90 days; quote 1-2 specific threads}",
    "x_pulse": "{recent founder/exec posts about culture, attrition, hiring}",
    "team_toxicity_grade": "{1-5 integer where 1 = healthiest, 5 = avoid; explain in 1 sentence}",
    "sources": ["url1", "url2"]
  },
  "people": {
    "likely_recruiter": {
      "name": "{Best guess based on LinkedIn/Levels.fyi search for who recruits this role family at this company}",
      "linkedin_url": "{full URL or 'unknown'}",
      "rationale": "{Why this person — match between their tenure/role and this hiring track}"
    },
    "likely_hiring_manager": {
      "name": "{Best guess for the manager-of-hire for this role}",
      "linkedin_url": "{full URL or 'unknown'}",
      "rationale": "{Why — title + team + reporting structure inferred from JD or org chart}"
    },
    "sources": ["url1", "url2"]
  },
  "confidence": "H/M/L"
}

If a field is genuinely unknown after web search, use the string "unknown" — do NOT fabricate. The JSON MUST parse — no trailing commas, no comments.`;
}

// --- JSON extraction (models love wrapping in markdown fences) ---
function extractJson(content) {
  if (!content) return null;
  // Strip markdown fences
  let s = content.trim();
  // Common fence patterns
  const fenceMatch = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) s = fenceMatch[1];
  // Find first { and matching last }
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0) return null;
  s = s.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(s);
  } catch {
    // Try one round of common fix-ups
    try {
      const fixed = s
        .replace(/,\s*([}\]])/g, '$1')   // trailing commas
        .replace(/\bNaN\b/g, 'null');
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

// --- Cost estimation (rough, conservative) ---
function estCostUsd(model, tokens) {
  // Per-token rates approximate, output-blended (used for budget logging only)
  const rates = {
    'perplexity:sonar-deep-research':     0.000040,  // $40/1M output blended
    'perplexity:sonar-reasoning-pro':     0.000015,
    'xai:grok-4':                          0.000020,
    'xai:grok-4-fast-reasoning':           0.000005,
    'openai:gpt-5':                        0.000020,
    'google:gemini-2.5-pro':               0.000012,
  };
  const rate = rates[model] ?? 0.00001;
  return Number((tokens * rate).toFixed(4));
}

// --- Field-level merge: majority vote with conflict tracking ---
function mergeField(values) {
  // values = array of strings/objects from each model; "unknown" is lowest weight
  const real = values.filter(v => v && (typeof v !== 'string' || v.toLowerCase().trim() !== 'unknown'));
  if (real.length === 0) return { value: 'unknown', conflict: false };
  // Tally exact matches
  const tally = new Map();
  for (const v of real) {
    const key = JSON.stringify(v);
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  // Pick most common; if all distinct, prefer longest string (most info)
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const winner = JSON.parse(sorted[0][0]);
  const conflict = sorted.length > 1 && new Set(real.map(v => JSON.stringify(v))).size > 1;
  return { value: winner, conflict };
}

function mergeResponses(parsed, role) {
  if (parsed.length === 0) {
    return { error: 'all models failed to return parseable JSON' };
  }
  const merged = {
    company: role.company,
    role: role.role,
    relocation: {},
    benefits: {},
    sentiment: {},
    people: {
      likely_recruiter: {},
      likely_hiring_manager: {},
    },
    confidence: 'L',
    _disagreements: [],
  };

  const sections = {
    relocation: ['package_summary', 'amount_estimate_usd', 'policy_notes', 'sources'],
    benefits:   ['401k_match', 'healthcare', 'dental_vision', 'estimated_copay', 'meals_provided', 'mental_health', 'other_perks', 'sources'],
    sentiment:  ['blind_score', 'glassdoor_score', 'reddit_pulse', 'x_pulse', 'team_toxicity_grade', 'sources'],
  };

  for (const [section, fields] of Object.entries(sections)) {
    for (const f of fields) {
      const vals = parsed.map(p => p?.[section]?.[f]).filter(v => v !== undefined);
      const { value, conflict } = mergeField(vals);
      merged[section][f] = value;
      if (conflict) merged._disagreements.push(`${section}.${f}`);
    }
  }

  // people sub-objects
  for (const personKey of ['likely_recruiter', 'likely_hiring_manager']) {
    for (const f of ['name', 'linkedin_url', 'rationale']) {
      const vals = parsed.map(p => p?.people?.[personKey]?.[f]).filter(v => v !== undefined);
      const { value, conflict } = mergeField(vals);
      merged.people[personKey][f] = value;
      if (conflict) merged._disagreements.push(`people.${personKey}.${f}`);
    }
  }
  // people sources
  {
    const vals = parsed.map(p => p?.people?.sources).filter(Boolean);
    const { value } = mergeField(vals);
    merged.people.sources = value;
  }

  // confidence: take majority; if H/M/L mix, take median weight
  const confs = parsed.map(p => p?.confidence).filter(Boolean);
  const score = { H: 3, M: 2, L: 1 };
  const avg = confs.length ? confs.reduce((a, c) => a + (score[c] || 1), 0) / confs.length : 1;
  merged.confidence = avg >= 2.5 ? 'H' : avg >= 1.5 ? 'M' : 'L';

  return merged;
}

// --- Main ---
async function main() {
  const t0 = Date.now();
  console.log(`[enrich] starting ${ROLES.length}-role council enrichment`);
  console.log(`[enrich] env keys: GEMINI=${!!process.env.GEMINI_API_KEY} PERPLEXITY=${!!process.env.PERPLEXITY_API_KEY} XAI=${!!process.env.XAI_API_KEY} OPENAI=${!!process.env.OPENAI_API_KEY}`);

  // Restrict to the cost-efficient council per task spec:
  // grounded Gemini + Sonar Reasoning Pro + Grok-4-fast-reasoning + GPT-5 (if key)
  const councilModels = [
    'google:gemini-2.5-pro',
    'perplexity:sonar-reasoning-pro',
    'xai:grok-4-fast-reasoning',
  ];
  if (process.env.OPENAI_API_KEY) councilModels.push('openai:gpt-5');

  const indexLines = ['# Role Enrichment Index', '', `Generated: ${new Date().toISOString()}`, ''];
  let totalCost = 0;
  const summary = [];

  for (const role of ROLES) {
    const tRole = Date.now();
    console.log(`\n[enrich] === Rank ${role.rank}: ${role.company} — ${role.role} ===`);
    const prompt = buildPrompt(role.company, role.role);

    const { results } = await callCouncil({
      prompt,
      models: councilModels,
      opts: { maxTokens: 2500 },
    });

    const modelsUsed = [];
    const modelsFailed = [];
    const parsed = [];

    for (const r of results) {
      if (r.error) {
        modelsFailed.push({ model: r.model, error: r.error.slice(0, 200) });
        console.log(`  [${r.model}] FAIL (${r.ms}ms): ${r.error.slice(0, 120)}`);
        continue;
      }
      const j = extractJson(r.content);
      if (!j) {
        modelsFailed.push({ model: r.model, error: 'JSON parse failed' });
        console.log(`  [${r.model}] PARSE-FAIL (${r.ms}ms, ${r.tokens} tok)`);
        continue;
      }
      parsed.push(j);
      const cost = estCostUsd(r.model, r.tokens);
      totalCost += cost;
      modelsUsed.push({ model: r.model, modelUsed: r.modelUsed, tokens: r.tokens, ms: r.ms, costUsd: cost });
      console.log(`  [${r.model}] OK (${r.ms}ms, ${r.tokens} tok, $${cost.toFixed(4)})`);
    }

    const merged = mergeResponses(parsed, role);
    merged._meta = {
      generated_at: new Date().toISOString(),
      rank: role.rank,
      pipeline_num: role.num,
      models_used: modelsUsed,
      models_failed: modelsFailed,
      total_cost_usd: Number(modelsUsed.reduce((a, m) => a + m.costUsd, 0).toFixed(4)),
      duration_ms: Date.now() - tRole,
      raw_responses_count: parsed.length,
    };

    const outFile = join(OUT_DIR, `${role.slug}.json`);
    writeFileSync(outFile, JSON.stringify(merged, null, 2));
    console.log(`  → wrote ${outFile}`);

    // Index line
    const tox = merged.sentiment?.team_toxicity_grade ?? 'unknown';
    const recruiter = merged.people?.likely_recruiter?.name ?? 'unknown';
    const reloc = merged.relocation?.amount_estimate_usd ?? 'unknown';
    indexLines.push(`- **${role.rank}. ${role.company} — ${role.role}** | toxicity ${tox}/5 | recruiter ${recruiter} | relocation ${reloc} | confidence ${merged.confidence}`);
    summary.push({
      rank: role.rank,
      company: role.company,
      role: role.role,
      models_ok: modelsUsed.length,
      models_failed: modelsFailed.length,
      sections: {
        relocation: !!(merged.relocation?.package_summary && merged.relocation.package_summary !== 'unknown'),
        benefits: !!(merged.benefits?.['401k_match'] && merged.benefits['401k_match'] !== 'unknown'),
        sentiment: !!(merged.sentiment?.blind_score && merged.sentiment.blind_score !== 'unknown'),
        people: !!(merged.people?.likely_recruiter?.name && merged.people.likely_recruiter.name !== 'unknown'),
      },
      confidence: merged.confidence,
      cost_usd: merged._meta.total_cost_usd,
    });
  }

  writeFileSync(join(OUT_DIR, 'INDEX.md'), indexLines.join('\n') + '\n');
  console.log(`\n[enrich] DONE — ${ROLES.length} roles, total $${totalCost.toFixed(4)}, ${Math.round((Date.now()-t0)/1000)}s`);
  console.log(JSON.stringify({ summary, total_cost_usd: Number(totalCost.toFixed(4)) }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
