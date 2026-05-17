#!/usr/bin/env node
/**
 * scripts/recommend-next-action.mjs — Recompute next-action recommendations
 * for outreach contacts. Two modes:
 *
 *   1. HEURISTIC (default, free, fast) — runs lib/strategy-recommender.mjs only.
 *      Use after logging a touch or after refresh-intel.mjs updates intel.
 *
 *   2. CONSENSUS (--consensus) — calls Gemini + Grok + Claude in parallel and
 *      computes majority agreement. Caches result with 24h TTL to avoid
 *      repeat spend. Use weekly or when you want a sanity-check on the
 *      heuristic recommendation. Confidence < 0.66 routes to "human review"
 *      badge in the dashboard.
 *
 * Each provider gracefully degrades — if the API key isn't set or the
 * circuit breaker is open, the provider is skipped and consensus is computed
 * on the remaining N. With <2 providers reachable, falls back to heuristic.
 *
 * Usage:
 *   node scripts/recommend-next-action.mjs --contact "linkedin.com/in/jane-doe"
 *   node scripts/recommend-next-action.mjs --all
 *   node scripts/recommend-next-action.mjs --all --consensus
 *   node scripts/recommend-next-action.mjs --contact ... --consensus --dry-run
 *   node scripts/recommend-next-action.mjs --all --consensus --force   # ignore 24h TTL
 */

import { readFileSync, existsSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from the career-ops project root before importing anything that
// depends on env vars (GEMINI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY).
// override:true is required because Mitchell's shell may pre-set these keys
// to empty strings (which dotenv otherwise treats as "already set, skip").
try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });
} catch { /* dotenv optional */ }

import { getContact, listContacts, setNextAction } from '../lib/outreach-tracker.mjs';
import { recommend, STRATEGIES } from '../lib/strategy-recommender.mjs';
import { withRetryBackoff, isCircuitOpen } from '../lib/provider-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SECRETS_PATH = join(homedir(), '.career-ops-secrets');
const SPEND_LOG = join(ROOT, 'data/grok-spend.log');

// Per-provider cost estimate (output-heavy short JSON; ~$0.005-$0.02 per
// call on Sonnet/Grok-fast/Gemini-flash). Logged for spend visibility.
const COST_ESTIMATE = { anthropic: 0.012, grok: 0.008, gemini: 0.000 };
const TTL_HOURS = 24;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else { out[key] = true; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
recommend-next-action.mjs — refresh next-action recommendations

  --contact <id>     refresh single contact
  --all              refresh all awaiting_reply contacts
  --consensus        call Gemini + Grok + Claude for multi-LLM agreement
                     (default mode is heuristic-only — free + fast)
  --force            ignore 24h TTL on cached consensus
  --dry-run          show what would be called; skip API calls
  --providers <list> comma-separated subset of: gemini,grok,anthropic
                     (default: all three)
`);
  process.exit(0);
}

// ── Secret loader (.env-style ~/.career-ops-secrets file) ─────────────────
function loadSecrets() {
  if (!existsSync(SECRETS_PATH)) return;
  try {
    for (const line of readFileSync(SECRETS_PATH, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_]+)\s*=\s*['"]?([^'"\s]+)['"]?/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadSecrets();

// ── Prompt construction ───────────────────────────────────────────────────
// One prompt, three providers. Same strategy catalog + same input shape
// so consensus is computed on the strategy_id field directly.

function buildPrompt(contact, heuristic) {
  const lastTouch = contact.touches?.[contact.touches.length - 1];
  const intel = contact.intel || {};
  return `You are advising on a LinkedIn / email / X outreach follow-up. A job-search contact has gone silent. Pick the optimal next strategy from this catalog:

${Object.entries(STRATEGIES).map(([id, s]) => `${id}. ${s.name}`).join('\n')}

CONTACT:
- name: ${contact.name || '(unknown)'}
- company: ${contact.company || '(unknown)'}
- title: ${contact.title_at_send || '(unknown)'}
- contact_type: ${contact.contact_type || 'unknown'} (sourcer/recruiter/hm/peer/exec/founder)
- degree: ${contact.degree || 1}
- touches sent: ${contact.touches?.length || 0}
- last touch: ${lastTouch ? `${lastTouch.channel} on ${lastTouch.ts}` : 'none'}
- status: ${contact.status}
- tier: ${contact.tier || 'B'}

INTEL:
- LinkedIn recent posts: ${(intel.linkedin_recent_posts || []).length || 0} in cache
- X handle / last post: ${intel.x_handle || 'none'} / ${intel.x_last_post_ts || 'unknown'}
- X recent themes: ${(intel.x_recent_themes || []).join(', ') || 'none'}
- Email guess: ${intel.email_guess?.address || 'unknown'} (${intel.email_guess?.confidence || 'no confidence'})
- Referral bonus: ${intel.referral?.bonus_range || 'unknown'} (post-app eligible: ${intel.referral?.post_app_eligible || 'unknown'})

HEURISTIC RECOMMENDATION: Strategy ${heuristic.strategy_id} (${heuristic.strategy_name}), confidence ${heuristic.confidence}, rationale: ${heuristic.rationale}

Return ONLY a single line of JSON, no preamble, no explanation:
{"strategy_id": <1-10>, "rationale": "<one-sentence why this strategy beats the others>"}`;
}

function parseLLMResponse(text) {
  if (!text) return null;
  // Match the first {...} block in the response.
  const m = text.match(/\{[^}]*"strategy_id"[\s\S]*?\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    if (typeof obj.strategy_id !== 'number' || !STRATEGIES[obj.strategy_id]) return null;
    return { strategy_id: obj.strategy_id, rationale: String(obj.rationale || '').slice(0, 300) };
  } catch { return null; }
}

// ── Provider callers ──────────────────────────────────────────────────────

async function callGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) return { skipped: 'GEMINI_API_KEY not set' };
  if (isCircuitOpen('gemini')) return { skipped: 'gemini circuit open' };
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({
    // 2026-05-17 — Default Flash slot is now gemini-3-flash-preview (full
    // Flash 3.0 preview). gemini-2.0-flash was deprecated Feb 18 2026
    // (shuts down June 1 2026). Override with GEMINI_MODEL env var.
    model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 250,
      // Gemini 3 uses thinking_level (minimal/low/medium/high), default
      // high. For "pick a strategy from this list" structured output,
      // minimal is correct. Sending both keys so 2.x fallback also disables
      // thinking — Google silently ignores the param that doesn't apply.
      thinking_level: 'minimal',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return withRetryBackoff(async () => {
    const res = await model.generateContent([{ text: prompt }]);
    return parseLLMResponse(res.response.text());
  }, 'gemini');
}

async function callGrok(prompt) {
  if (!process.env.XAI_API_KEY) return { skipped: 'XAI_API_KEY not set' };
  if (isCircuitOpen('grok')) return { skipped: 'grok circuit open' };
  return withRetryBackoff(async () => {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:        process.env.XAI_MODEL || 'grok-4-fast-reasoning',
        input:        prompt,
        max_output_tokens: 120,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`Grok HTTP ${res.status}`);
    const data = await res.json();
    // Mirror the extraction pattern from scripts/grok-research.mjs.
    let text = data.output_text || '';
    if (!text && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) if (c.type === 'output_text' && c.text) text += c.text;
        }
      }
    }
    return parseLLMResponse(text);
  }, 'grok');
}

async function callClaude(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: 'ANTHROPIC_API_KEY not set' };
  if (isCircuitOpen('anthropic')) return { skipped: 'anthropic circuit open' };
  return withRetryBackoff(async () => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:       process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        // Increased from 150 — Claude wraps JSON in markdown fences and
        // can add brief preamble; 300 gives headroom for the structured
        // reply without inviting verbose tangents.
        max_tokens:  300,
        temperature: 0,
        messages:    [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    return parseLLMResponse(text);
  }, 'anthropic');
}

// ── Consensus ─────────────────────────────────────────────────────────────

function computeConsensus(votes) {
  // votes = [{ provider, strategy_id, rationale }] (only successful ones)
  const counts = {};
  for (const v of votes) counts[v.strategy_id] = (counts[v.strategy_id] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  const [winnerId, winnerVotes] = sorted[0];
  const confidence = votes.length >= 3 ? winnerVotes / 3 : winnerVotes / votes.length;
  const supporters = votes.filter(v => v.strategy_id === Number(winnerId));
  return {
    strategy_id: Number(winnerId),
    confidence,
    agreement:   `${winnerVotes}/${votes.length}`,
    supporters:  supporters.map(s => s.provider),
    rationales:  supporters.map(s => `${s.provider}: ${s.rationale}`),
  };
}

function logSpend(label, cost) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const ts = new Date().toISOString();
    appendFileSync(SPEND_LOG, `${today}\t${ts}\t${cost.toFixed(4)}\t[recommend-next-action] ${label}\n`);
  } catch {}
}

function withinTTL(contact) {
  const cachedAt = contact.next_action?.consensus_cached_at;
  if (!cachedAt) return false;
  const age = (Date.now() - Date.parse(cachedAt)) / (3600 * 1000);
  return age < TTL_HOURS;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function recommendOne(contact, opts) {
  const heuristic = recommend(contact);

  // Heuristic-only mode: just persist the heuristic and exit.
  if (!opts.consensus) {
    setNextAction(contact.contact_id, heuristic);
    return { contact_id: contact.contact_id, mode: 'heuristic', ...heuristic };
  }

  // Consensus mode: respect 24h TTL unless --force.
  if (!opts.force && withinTTL(contact)) {
    return { contact_id: contact.contact_id, mode: 'cached', cached: true, ...contact.next_action };
  }

  const prompt = buildPrompt(contact, heuristic);

  if (opts.dryRun) {
    console.log(`\n=== ${contact.contact_id} ===`);
    console.log(prompt);
    return { contact_id: contact.contact_id, mode: 'dry-run' };
  }

  const providers = opts.providers || ['gemini', 'grok', 'anthropic'];
  const callMap = { gemini: callGemini, grok: callGrok, anthropic: callClaude };
  const results = await Promise.all(providers.map(async p => {
    try {
      const r = await callMap[p](prompt);
      if (r && r.skipped) return { provider: p, skipped: r.skipped };
      if (r && r.strategy_id) {
        logSpend(`${p} consensus call (${contact.contact_id})`, COST_ESTIMATE[p] || 0);
        return { provider: p, ...r };
      }
      return { provider: p, error: 'unparseable response' };
    } catch (err) {
      return { provider: p, error: err.message };
    }
  }));

  const votes = results.filter(r => r.strategy_id);
  const skipped = results.filter(r => r.skipped || r.error);
  // Always log per-provider outcomes so partial-consensus failures are
  // diagnosable without re-running with --dry-run.
  for (const r of results) {
    if (r.skipped)      console.log(`    [${r.provider}] skipped: ${r.skipped}`);
    else if (r.error)   console.log(`    [${r.provider}] error: ${r.error}`);
    else if (r.strategy_id) console.log(`    [${r.provider}] vote: S${r.strategy_id} — ${(r.rationale||'').slice(0,120)}`);
  }

  // Need ≥ 2 votes for a true consensus, but single-provider mode (user
  // ran with --providers grok) is a valid testing path — trust the single
  // voter when that's all that was requested.
  const minVotes = Math.min(2, providers.length);
  if (votes.length < minVotes) {
    const final = {
      ...heuristic,
      consensus_cached_at: new Date().toISOString(),
      consensus_note:      `Only ${votes.length}/${providers.length} providers responded — heuristic used as fallback. Skipped/errored: ${skipped.map(s => s.provider + ':' + (s.skipped || s.error)).join(', ')}`,
    };
    setNextAction(contact.contact_id, final);
    return { contact_id: contact.contact_id, mode: 'consensus-fallback', ...final };
  }

  const consensus = computeConsensus(votes);
  const winningStrategy = STRATEGIES[consensus.strategy_id];
  const final = {
    strategy_id:         consensus.strategy_id,
    strategy_name:       winningStrategy.name,
    due_date:            heuristic.due_date, // heuristic's due_date is fine — strategies don't change the due date meaningfully
    confidence:          consensus.confidence,
    rationale:           consensus.rationales.join(' | '),
    draft_template_id:   winningStrategy.default_template,
    consensus_cached_at: new Date().toISOString(),
    consensus_agreement: consensus.agreement,
    consensus_supporters: consensus.supporters,
  };
  setNextAction(contact.contact_id, final);
  return { contact_id: contact.contact_id, mode: 'consensus', ...final };
}

async function main() {
  const opts = {
    consensus: !!args.consensus,
    dryRun:    !!args['dry-run'],
    force:     !!args.force,
    providers: args.providers ? String(args.providers).split(',').map(s => s.trim()) : null,
  };

  const targets = args.all
    ? listContacts({ status: 'awaiting_reply' })
    : (args.contact ? [getContact(args.contact)].filter(Boolean) : []);

  if (!targets.length) {
    console.error('No targets. Use --contact <id> or --all.');
    process.exit(1);
  }

  console.log(`Processing ${targets.length} contact(s) in ${opts.consensus ? 'CONSENSUS' : 'HEURISTIC'} mode${opts.dryRun ? ' (dry-run)' : ''}.`);

  for (const c of targets) {
    const result = await recommendOne(c, opts);
    if (result.mode === 'dry-run') continue;
    const conf = (typeof result.confidence === 'number') ? result.confidence.toFixed(2) : '?';
    const tag = result.mode === 'cached' ? '[cached <24h]' : `[${result.mode}]`;
    console.log(`  ${c.name || c.contact_id}: S${result.strategy_id} ${result.strategy_name || ''} (conf ${conf}) ${tag}`);
    if (result.consensus_note) console.log(`    note: ${result.consensus_note}`);
  }
}

main().catch(err => { console.error(err); process.exit(2); });
