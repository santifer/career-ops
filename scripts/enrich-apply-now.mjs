#!/usr/bin/env node
/**
 * scripts/enrich-apply-now.mjs
 *
 * Unified council-enrichment for any rank range in data/apply-now-queue.json.
 * Replaces the prior pair of one-off scripts (enrich-apply-now-top5.mjs and
 * enrich-apply-now-6-23.mjs) which hard-coded specific ranks and role names.
 *
 * Output: data/role-enrichment/{NN}-{slug}.json (zero-padded rank) +
 *         appends to data/role-enrichment/INDEX.md (never overwrites).
 *
 * Both anti-hallucination guards (no fake recruiter names) and the
 * integer-only `team_toxicity_grade` rules from the 6-23 version are
 * applied unconditionally.
 *
 * Usage:
 *   source ~/.career-ops-secrets && node scripts/enrich-apply-now.mjs --ranks=1-5
 *   source ~/.career-ops-secrets && node scripts/enrich-apply-now.mjs --ranks=6-23
 *   node scripts/enrich-apply-now.mjs --ranks=1-23 --dry-run    # plan only, no API calls
 *   node scripts/enrich-apply-now.mjs --rows=2049,2059,2110     # backfill specific apps.md row numbers
 *
 * --rows pulls each row from data/applications.md (filtered by score >= 4 and
 * Evaluated/Responded status — the same filter the dashboard uses for the
 * apply-now table). Use this mode for sparse backfill when ranks are stale.
 *
 * Env:
 *   ENRICH_BUDGET_CAP_USD  — hard cap for total spend per run (default $5)
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env BEFORE importing council.mjs so provider.envKey lookups work
// even when the shell pre-sets ANTHROPIC_API_KEY (and others) to empty.
// override:true matches the pattern used by scripts/refresh-master.mjs.
try {
  const { config } = await import('dotenv');
  config({ path: new URL('../.env', import.meta.url).pathname, override: true });
} catch { /* dotenv optional — fall back to shell env */ }

const { callCouncil } = await import('../lib/council.mjs');
const { parseApplicationsFile } = await import('../lib/parse-applications.mjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'data', 'role-enrichment');
const QUEUE_PATH = join(ROOT, 'data', 'apply-now-queue.json');
const APPS_PATH = join(ROOT, 'data', 'applications.md');

const ARGS = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v = true] = a.slice(2).split('='); return [k, v]; })
);
const RANKS_ARG = ARGS.ranks || ARGS.rank;
const ROWS_ARG = ARGS.rows;
const DRY_RUN = ARGS['dry-run'] === true || ARGS['dry-run'] === 'true';
const BUDGET_CAP_USD = Number(process.env.ENRICH_BUDGET_CAP_USD || '5');

if (!RANKS_ARG && !ROWS_ARG) {
  console.error('Usage:');
  console.error('  node scripts/enrich-apply-now.mjs --ranks=N-M [--dry-run]');
  console.error('  node scripts/enrich-apply-now.mjs --rows=NN,NN,NN [--dry-run]');
  console.error('Examples:');
  console.error('  --ranks=1-5     enrich queue ranks 1..5 (from data/apply-now-queue.json)');
  console.error('  --ranks=6-23    enrich queue ranks 6..23');
  console.error('  --rows=2049,2110   enrich specific applications.md row numbers (sparse backfill)');
  process.exit(2);
}

let RANK_START = null;
let RANK_END = null;
let ROW_NUMS = null;

if (ROWS_ARG) {
  ROW_NUMS = String(ROWS_ARG).split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0);
  if (ROW_NUMS.length === 0) {
    console.error(`Invalid --rows value: ${ROWS_ARG} (expected comma-separated integers, e.g. 2049,2110,2198)`);
    process.exit(2);
  }
} else {
  const rangeMatch = String(RANKS_ARG).match(/^(\d+)\s*-\s*(\d+)$/);
  if (!rangeMatch) {
    console.error(`Invalid --ranks value: ${RANKS_ARG} (expected N-M, e.g. 6-23)`);
    process.exit(2);
  }
  RANK_START = Number(rangeMatch[1]);
  RANK_END = Number(rangeMatch[2]);
  if (RANK_START < 1 || RANK_END < RANK_START) {
    console.error(`Invalid range: ${RANK_START}-${RANK_END}`);
    process.exit(2);
  }
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function slugify(s, maxLen = 60) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
}

// Reads ranks [RANK_START..RANK_END] from the queue (1-indexed ranks → 0-indexed slice).
function loadRolesByRank() {
  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  const ranked = queue.ranked || queue.entries || queue;
  if (!Array.isArray(ranked)) throw new Error('apply-now-queue.json: no `ranked` array found');
  const slice = ranked.slice(RANK_START - 1, RANK_END);
  return slice.map((entry, i) => {
    const rank = RANK_START + i;
    const company = entry.company || 'Unknown';
    const role = entry.role || entry.title || '';
    const num = entry.num || entry.id || entry.pipeline_num || '';
    const rankPad = String(rank).padStart(2, '0');
    const slug = `${rankPad}-${slugify(company)}-${slugify(role)}`.slice(0, 120);
    return { rank, num, company, role, slug };
  });
}

// Pulls specific row numbers from data/applications.md. Used for sparse backfill
// when ranks in apply-now-queue.json are stale and the rows you need to enrich
// aren't represented there. Filename gets a `bf` (backfill) prefix in place of
// the rank so it sorts after the curated 01..NN ranks but is still picked up by
// `filePattern: '{rank}-{slug}.json'` matching in the cache registry (matches by
// `-${slug}.json` suffix).
function loadRolesByNum() {
  const apps = parseApplicationsFile(APPS_PATH);
  const byNum = new Map(apps.map(r => [r.num, r]));
  const out = [];
  for (const num of ROW_NUMS) {
    const r = byNum.get(num);
    if (!r) {
      console.error(`  [warn] #${num} not found in applications.md — skipping`);
      continue;
    }
    if (!r.company || !r.role) {
      console.error(`  [warn] #${num} missing company or role — skipping`);
      continue;
    }
    out.push({
      rank: `bf${String(num)}`,
      num: r.num,
      company: r.company,
      role: r.role,
      slug: `bf${String(num)}-${slugify(r.company)}-${slugify(r.role)}`.slice(0, 120),
    });
  }
  return out;
}

function loadRoles() {
  return ROW_NUMS ? loadRolesByNum() : loadRolesByRank();
}

// Anti-hallucination + integer-only toxicity rules baked in.
function buildPrompt(company, role) {
  return `You are a hiring-intelligence researcher for Mitchell Williams's career-ops job search. Today is ${new Date().toISOString().slice(0, 10)}. Mitchell targets senior comms / forward-deployed / solutions-architect / AI-enablement / strategic-ops roles at frontier AI labs. He's currently Seattle-based. PRIMARY filter: total comp + pre-IPO equity timing + RSU value-at-vest.

Research **${company} — ${role}**. Use Google Search aggressively. Cite sources inline.

ANTI-HALLUCINATION INSTRUCTIONS for the \`people\` section (CRITICAL):
- DO NOT invent recruiter or hiring-manager names. If you cannot find a SPECIFIC person via a Google Search citation (LinkedIn URL or company press release), set name to "unknown" and rationale to a 1-line note about what kind of search the user should run themselves (e.g., "Search LinkedIn: '${company}' recruiter + 'forward deployed'").
- DO NOT fabricate LinkedIn URLs of the form \`/in/firstname-lastname-company\`. Only return a URL if you cited it from a real search hit. Otherwise: "unknown".
- It is CORRECT and PREFERRED to return name="unknown" rather than a guess. The dashboard will render "Not confidently identified — manual LinkedIn search recommended" with a People-Search prelink.

For \`sentiment.team_toxicity_grade\`: MUST be a single integer between 1 and 5 (1 = healthiest, 5 = avoid). NO TEXT, NO EXPLANATION inside this field. Put justification in the surrounding sentiment fields (\`reddit_pulse\`, \`x_pulse\`, etc.).

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
    "team_toxicity_grade": 3,
    "sources": ["url1", "url2"]
  },
  "people": {
    "likely_recruiter": {
      "name": "{Specific person from a cited LinkedIn URL or 'unknown'}",
      "linkedin_url": "{full URL or 'unknown'}",
      "rationale": "{Why this person — match between their tenure/role and this hiring track, OR a search-it-yourself note if unknown}"
    },
    "likely_hiring_manager": {
      "name": "{Specific person from cited URL or 'unknown'}",
      "linkedin_url": "{full URL or 'unknown'}",
      "rationale": "{Why — title + team + reporting structure inferred from JD or org chart, OR a search-it-yourself note if unknown}"
    },
    "sources": ["url1", "url2"]
  },
  "confidence": "H/M/L"
}

If a field is genuinely unknown after web search, use the string "unknown" — do NOT fabricate. The JSON MUST parse — no trailing commas, no comments. team_toxicity_grade MUST be a bare integer 1-5.`;
}

function extractJson(content) {
  if (!content) return null;
  let s = content.trim();
  const fenceMatch = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) s = fenceMatch[1];
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0) return null;
  s = s.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(s);
  } catch {
    try {
      const fixed = s.replace(/,\s*([}\]])/g, '$1').replace(/\bNaN\b/g, 'null');
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

function normalizeToxicity(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.round(v);
    if (n >= 1 && n <= 5) return n;
  }
  if (typeof v === 'string') {
    const m = v.match(/^\s*([1-5])\b/);
    if (m) return Number(m[1]);
    const m2 = v.match(/\b([1-5])\s*\/\s*5\b/);
    if (m2) return Number(m2[1]);
  }
  return null;
}

function estCostUsd(model, tokens) {
  const rates = {
    'perplexity:sonar-deep-research':  0.000040,
    'perplexity:sonar-reasoning-pro':  0.000015,
    'xai:grok-4':                       0.000020,
    'xai:grok-4-fast-reasoning':        0.000005,
    'openai:gpt-5':                     0.000020,
    'google:gemini-2.5-pro':            0.000012,
  };
  const rate = rates[model] ?? 0.00001;
  return Number((tokens * rate).toFixed(4));
}

function mergeField(values) {
  const real = values.filter(v => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'string' && v.toLowerCase().trim() === 'unknown') return false;
    return true;
  });
  if (real.length === 0) return { value: 'unknown', conflict: false };
  const tally = new Map();
  for (const v of real) {
    const key = JSON.stringify(v);
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const winner = JSON.parse(sorted[0][0]);
  const conflict = sorted.length > 1 && new Set(real.map(v => JSON.stringify(v))).size > 1;
  return { value: winner, conflict };
}

function mergeResponses(parsed, role) {
  if (parsed.length === 0) return { error: 'all models failed to return parseable JSON' };

  const merged = {
    company: role.company,
    role: role.role,
    relocation: {},
    benefits: {},
    sentiment: {},
    people: { likely_recruiter: {}, likely_hiring_manager: {} },
    confidence: 'L',
    _disagreements: [],
  };

  const sections = {
    relocation: ['package_summary', 'amount_estimate_usd', 'policy_notes', 'sources'],
    benefits:   ['401k_match', 'healthcare', 'dental_vision', 'estimated_copay', 'meals_provided', 'mental_health', 'other_perks', 'sources'],
    sentiment:  ['blind_score', 'glassdoor_score', 'reddit_pulse', 'x_pulse', 'sources'],
  };

  for (const [section, fields] of Object.entries(sections)) {
    for (const f of fields) {
      const vals = parsed.map(p => p?.[section]?.[f]).filter(v => v !== undefined);
      const { value, conflict } = mergeField(vals);
      merged[section][f] = value;
      if (conflict) merged._disagreements.push(`${section}.${f}`);
    }
  }

  const toxVals = parsed.map(p => normalizeToxicity(p?.sentiment?.team_toxicity_grade)).filter(v => v !== null);
  if (toxVals.length === 0) {
    merged.sentiment.team_toxicity_grade = 'unknown';
  } else {
    const tally = new Map();
    for (const v of toxVals) tally.set(v, (tally.get(v) || 0) + 1);
    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    merged.sentiment.team_toxicity_grade = sorted[0][0];
    if (sorted.length > 1) merged._disagreements.push('sentiment.team_toxicity_grade');
  }

  for (const personKey of ['likely_recruiter', 'likely_hiring_manager']) {
    for (const f of ['name', 'linkedin_url', 'rationale']) {
      const vals = parsed.map(p => p?.people?.[personKey]?.[f]).filter(v => v !== undefined);
      const { value, conflict } = mergeField(vals);
      merged.people[personKey][f] = value;
      if (conflict) merged._disagreements.push(`people.${personKey}.${f}`);
    }
  }
  {
    const vals = parsed.map(p => p?.people?.sources).filter(Boolean);
    const { value } = mergeField(vals);
    merged.people.sources = value;
  }

  const confs = parsed.map(p => p?.confidence).filter(Boolean);
  const score = { H: 3, M: 2, L: 1 };
  const avg = confs.length ? confs.reduce((a, c) => a + (score[c] || 1), 0) / confs.length : 1;
  merged.confidence = avg >= 2.5 ? 'H' : avg >= 1.5 ? 'M' : 'L';

  return merged;
}

async function main() {
  const t0 = Date.now();
  const ROLES = loadRoles();
  const tag = ROW_NUMS
    ? `enrich-rows-${ROW_NUMS.join(',')}`
    : `enrich-${RANK_START}-${RANK_END}`;
  console.log(`[${tag}] starting ${ROLES.length}-role council enrichment`);

  if (DRY_RUN) {
    console.log(`[${tag}] DRY RUN — roles that would be enriched:`);
    for (const r of ROLES) console.log(`  rank ${r.rank}: ${r.company} — ${r.role}`);
    return;
  }

  console.log(`[${tag}] env keys: GEMINI=${!!process.env.GEMINI_API_KEY} PERPLEXITY=${!!process.env.PERPLEXITY_API_KEY} XAI=${!!process.env.XAI_API_KEY} OPENAI=${!!process.env.OPENAI_API_KEY}`);
  console.log(`[${tag}] budget cap: $${BUDGET_CAP_USD}`);

  const councilModels = [
    'google:gemini-2.5-pro',
    'perplexity:sonar-reasoning-pro',
    'xai:grok-4-fast-reasoning',
  ];
  if (process.env.OPENAI_API_KEY) councilModels.push('openai:gpt-5');

  const indexLines = [
    '',
    ROW_NUMS
      ? `## Backfill rows ${ROW_NUMS.join(',')} (generated ${new Date().toISOString()})`
      : `## Ranks ${RANK_START}-${RANK_END} (generated ${new Date().toISOString()})`,
    '',
  ];
  let totalCost = 0;
  const summary = [];

  for (const role of ROLES) {
    const tRole = Date.now();
    const outFile = join(OUT_DIR, `${role.slug}.json`);
    if (existsSync(outFile)) {
      console.log(`\n[${tag}] === Rank ${role.rank}: ${role.company} — ${role.role} === SKIP (exists)`);
      summary.push({ rank: role.rank, company: role.company, role: role.role, status: 'skipped-exists' });
      continue;
    }

    if (totalCost >= BUDGET_CAP_USD) {
      console.log(`[${tag}] BUDGET CAP REACHED ($${totalCost.toFixed(4)} >= $${BUDGET_CAP_USD}). Aborting.`);
      summary.push({ rank: role.rank, company: role.company, role: role.role, status: 'budget-cap-skipped' });
      continue;
    }

    console.log(`\n[${tag}] === Rank ${role.rank}: ${role.company} — ${role.role} ===`);
    const prompt = buildPrompt(role.company, role.role);

    let results;
    try {
      ({ results } = await callCouncil({
        prompt,
        models: councilModels,
        opts: { maxTokens: 2500 },
      }));
    } catch (e) {
      console.log(`  [council] hard error: ${e.message}`);
      summary.push({ rank: role.rank, company: role.company, role: role.role, status: 'council-failed', error: e.message });
      continue;
    }

    const modelsUsed = [];
    const modelsFailed = [];
    const parsed = [];

    for (const r of results) {
      if (r.error) {
        modelsFailed.push({ model: r.model, error: String(r.error).slice(0, 200) });
        console.log(`  [${r.model}] FAIL (${r.ms}ms): ${String(r.error).slice(0, 120)}`);
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

    writeFileSync(outFile, JSON.stringify(merged, null, 2));
    console.log(`  → wrote ${outFile}`);

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
      toxicity: tox,
      confidence: merged.confidence,
      cost_usd: merged._meta.total_cost_usd,
      status: 'ok',
    });
  }

  appendFileSync(join(OUT_DIR, 'INDEX.md'), indexLines.join('\n') + '\n');

  console.log(`\n[${tag}] DONE — ${ROLES.length} roles, total $${totalCost.toFixed(4)}, ${Math.round((Date.now()-t0)/1000)}s`);
  console.log(JSON.stringify({ summary, total_cost_usd: Number(totalCost.toFixed(4)) }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
