#!/usr/bin/env node
/**
 * scripts/draft-outreach.mjs — Phase 5: voice-calibrated outreach drafting
 *
 * Given a contact card (Phase 4 output) or a manual contact dict, generates
 * voice-calibrated outreach drafts across multiple channels. Each draft runs
 * through humanize-check; only 🟢 LOW are surfaced clean. 🟡 MEDIUM gets a
 * WARNING flag. 🟠/🔴 are blocked.
 *
 * USAGE
 *   # Single contact, default all channels:
 *   node scripts/draft-outreach.mjs --contact data/contact-cards/anthropic/contact-card-{ts}.json --target "Deepish Sunny Matani"
 *
 *   # Manual contact:
 *   node scripts/draft-outreach.mjs --name "Deepish Sunny Matani" --company "Anthropic" \
 *     --role "Strategic Ops" --linkedin "https://linkedin.com/in/deepish..." --mutual "Matthew Molli"
 *
 *   # Specific channels:
 *   node scripts/draft-outreach.mjs --contact ... --channels linkedin_dm,email
 *
 *   # Force regen (ignore cache):
 *   node scripts/draft-outreach.mjs --contact ... --no-cache
 *
 *   # Cost cap (per-invocation):
 *   node scripts/draft-outreach.mjs --contact ... --max-cost 5
 *
 *   # Dry-run (no LLM calls; print plan + cost estimate):
 *   node scripts/draft-outreach.mjs --contact ... --dry-run
 *
 * HARD RULES
 *   - Never sends. Mitchell sends manually after review.
 *   - Never commits/pushes.
 *   - Never modifies cv.md, story-bank.md, voice-reference.md, humanize-check.mjs.
 *   - Pulls factual claims only from cv.md + article-digest.md.
 *   - Humanize-check 🟢 LOW for clean surface; 🟡 MEDIUM = WARNING flag; 🟠/🔴 = block.
 *
 * OUTPUT
 *   data/outreach-drafts/{company-slug}/{contact-slug}/
 *     ├── linkedin_dm-{ts}.md
 *     ├── linkedin_dm-{ts}.meta.json
 *     ├── email-{ts}.md            (if applicable)
 *     ├── email-{ts}.meta.json
 *     ├── referral_ask-{ts}.md     (if applicable)
 *     ├── referral_ask-{ts}.meta.json
 *     ├── follow_up-{ts}.md        (if applicable — prior touch >= 7d, no reply)
 *     ├── follow_up-{ts}.meta.json
 *     └── _summary.md              (human index of all drafts for this run)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { SONNET } from '../lib/models.mjs';
import { runCheck as humanizeCheck } from './humanize-check.mjs';
import { getContact, daysSinceLastTouch, touchCount } from '../lib/outreach-tracker.mjs';
import { normalizeCompany } from '../lib/linkedin-network.mjs';

// ── env bootstrap ─────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '..');
try {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m && (!process.env[m[1]] || process.env[m[1]].trim() === '')) {
        process.env[m[1]] = m[2].trim();
      }
    }
  }
} catch {}

// ── constants ─────────────────────────────────────────────────────────────
const DEFAULT_CHANNELS = ['linkedin_dm', 'email', 'referral_ask', 'follow_up'];
const ALL_CHANNELS     = new Set(DEFAULT_CHANNELS);

const COST_LOG = join(ROOT, 'data', 'cost-log.tsv');
const COST_LOG_HEADER = 'date\tbatch_id\trequests\tinput_tokens\toutput_tokens\tcache_read_tokens\tcache_write_tokens\tcost_usd\tmodel\n';

const DRAFTS_ROOT = join(ROOT, 'data', 'outreach-drafts');

// Sonnet 4.6 standard pricing (NOT batches — direct messages API):
//   input  $3.00 / 1M tokens
//   output $15.00 / 1M tokens
const RATE_INPUT_PER_TOKEN  = 3.00  / 1e6;
const RATE_OUTPUT_PER_TOKEN = 15.00 / 1e6;

// Per-draft rough envelope used for dry-run estimates:
//   prompt: voice anchors + cv excerpt + article-digest + contact ≈ 4,800 input tokens
//   output: capped at ~500 tokens per draft (DMs ≤280 words, emails ≤350)
const EST_INPUT_TOKENS_PER_DRAFT  = 4800;
const EST_OUTPUT_TOKENS_PER_DRAFT = 500;

const PER_RUN_CAP_DEFAULT = parseFloat(process.env.PER_RUN_CAP_DRAFT_OUTREACH_USD || '10');
const MONTHLY_BUDGET      = parseFloat(process.env.MONTHLY_BUDGET_USD || '500');

const HUMANIZE_RETRY_MAX = 2;

// ── CLI parsing ───────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    contact:   null,
    target:    null,
    name:      null,
    company:   null,
    role:      null,
    linkedin:  null,
    email:     null,
    mutual:    null,
    introducer: null,
    channels:  null,
    noCache:   false,
    maxCost:   PER_RUN_CAP_DEFAULT,
    dryRun:    false,
    help:      false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--contact':    out.contact = next(); break;
      case '--target':     out.target = next(); break;
      case '--name':       out.name = next(); break;
      case '--company':    out.company = next(); break;
      case '--role':       out.role = next(); break;
      case '--linkedin':   out.linkedin = next(); break;
      case '--email':      out.email = next(); break;
      case '--mutual':     out.mutual = next(); break;
      case '--introducer': out.introducer = next(); break;
      case '--channels':   out.channels = next().split(',').map(s => s.trim()).filter(Boolean); break;
      case '--no-cache':   out.noCache = true; break;
      case '--max-cost':   out.maxCost = parseFloat(next()); break;
      case '--dry-run':    out.dryRun = true; break;
      case '--help':
      case '-h':           out.help = true; break;
      default:
        if (a.startsWith('--')) {
          console.error(`[draft-outreach] unknown arg: ${a}`);
          process.exit(2);
        }
    }
  }
  return out;
}

function printUsage() {
  console.log(`Usage: node scripts/draft-outreach.mjs [options]

Required (one of):
  --contact <path>           Path to Phase 4 contact card JSON
  --name <name>              Manual contact name (with --company)

Optional:
  --target <name>            Pick a specific person from a multi-contact card
  --company <name>           Company name (required with --name)
  --role <title>             Role being pursued at the company
  --linkedin <url>           Contact's LinkedIn URL
  --email <addr>             Contact's email (enables 'email' channel)
  --mutual <name>            Mutual connection name (for cold DM framing)
  --introducer <name>        Name of 2nd-degree introducer (for referral_ask)
  --channels <list>          Comma-sep: linkedin_dm,email,referral_ask,follow_up
                             (default: all applicable)
  --no-cache                 Force regenerate even if drafts exist for this contact today
  --max-cost <usd>           Per-invocation USD cap (default $${PER_RUN_CAP_DEFAULT})
  --dry-run                  Print plan + cost estimate; no LLM calls
  --help, -h                 This message
`);
}

// ── helpers ───────────────────────────────────────────────────────────────
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function nowTs() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function safeRead(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// ── source corpus loaders (cv + article-digest + voice + templates) ──────
function loadCorpus() {
  return {
    cv:        safeRead(join(ROOT, 'cv.md')),
    digest:    safeRead(join(ROOT, 'article-digest.md')),
    voice:     safeRead(join(ROOT, 'writing-samples', 'voice-reference.md')),
    templates: safeRead(join(ROOT, 'data', 'outreach-templates.md')),
  };
}

// Slice the largest files so prompts stay bounded.
function trimForPrompt(text, charBudget) {
  if (!text) return '';
  if (text.length <= charBudget) return text;
  return text.slice(0, charBudget) + '\n\n[...truncated for prompt budget...]';
}

// ── contact loader ────────────────────────────────────────────────────────
// Accepts either a Phase 4 contact card JSON or a manual contact dict.
// Phase 4 schema is not yet published (Phase 4 hasn't shipped). We accept a
// permissive shape and use whatever keys are present.
function loadContact(args) {
  if (args.contact) {
    if (!existsSync(args.contact)) {
      throw new Error(`contact card not found: ${args.contact}`);
    }
    const raw = JSON.parse(readFileSync(args.contact, 'utf8'));
    // If the card is a multi-contact map and --target was passed, narrow.
    if (Array.isArray(raw.contacts)) {
      if (args.target) {
        const match = raw.contacts.find(c =>
          (c.name || '').toLowerCase() === args.target.toLowerCase());
        if (!match) throw new Error(`target "${args.target}" not in card (${raw.contacts.length} contacts)`);
        return mergeContact(match, raw, args);
      }
      // No target — default to first.
      if (!raw.contacts.length) throw new Error('contact card has empty contacts[]');
      return mergeContact(raw.contacts[0], raw, args);
    }
    // Single-contact card.
    return mergeContact(raw, raw, args);
  }
  // Manual mode.
  if (!args.name) {
    throw new Error('must provide --contact <path> OR --name <name>');
  }
  return {
    name:       args.name,
    company:    args.company || '',
    role:       args.role || '',
    linkedin:   args.linkedin || '',
    email:      args.email || '',
    mutual:     args.mutual || '',
    introducer: args.introducer || '',
    title:      args.role || '',
    notes:      '',
    contact_id: args.linkedin || `${args.name}|${args.company || ''}`,
  };
}

function mergeContact(person, card, args) {
  const company = args.company || person.company || card.company || '';
  const role    = args.role    || person.role    || card.role    || person.target_role || '';
  return {
    name:        person.name || person.full_name || '',
    company,
    role,
    title:       person.title || person.title_at_send || person.headline || '',
    linkedin:    args.linkedin    || person.linkedin || person.linkedin_url || person.url || '',
    email:       args.email       || person.email || '',
    mutual:      args.mutual      || person.mutual || person.mutuals?.[0] || '',
    introducer:  args.introducer  || person.introducer || person.referral_path?.[0] || '',
    notes:       person.notes || person.why || person.intel || '',
    contact_id:  person.contact_id || person.linkedin || person.linkedin_url ||
                 `${person.name || ''}|${company}`,
  };
}

// ── channel applicability ─────────────────────────────────────────────────
function applicableChannels(contact, requested) {
  const want = requested || [...ALL_CHANNELS];
  const reasons = {};
  const out = [];

  for (const ch of want) {
    if (!ALL_CHANNELS.has(ch)) {
      reasons[ch] = `unknown channel (allowed: ${[...ALL_CHANNELS].join(', ')})`;
      continue;
    }
    if (ch === 'email' && !contact.email) {
      reasons.email = 'no email address known';
      continue;
    }
    if (ch === 'referral_ask' && !contact.introducer) {
      reasons.referral_ask = 'no 2nd-degree introducer named';
      continue;
    }
    if (ch === 'follow_up') {
      // Need prior outreach in tracker, >= 7 days ago, no reply.
      const tracked = getContact(contact.contact_id);
      if (!tracked) {
        reasons.follow_up = 'no prior touch in outreach-tracker for this contact';
        continue;
      }
      const days = daysSinceLastTouch(tracked);
      if (days === null || days < 7) {
        reasons.follow_up = `last touch too recent (${days === null ? 'none' : days + 'd ago'}; need >= 7d)`;
        continue;
      }
      if (tracked.status !== 'awaiting_reply') {
        reasons.follow_up = `tracker status is "${tracked.status}" (need "awaiting_reply")`;
        continue;
      }
      // Will reference prior touch in prompt.
      out.push(ch);
      continue;
    }
    out.push(ch);
  }
  return { channels: out, skipped: reasons };
}

// ── prompt construction ───────────────────────────────────────────────────
const CHANNEL_SPECS = {
  linkedin_dm: {
    label:      'LinkedIn DM',
    wordCap:    280,
    fileBase:   'linkedin_dm',
    templateRef: 'data/outreach-templates.md §"Channel 1: LinkedIn DM" — variants 1.A / 1.B / 1.C',
  },
  email: {
    label:      'Email (cold)',
    wordCap:    350,
    fileBase:   'email',
    templateRef: 'data/outreach-templates.md §"Channel 4: Email to recruiter" — variants 4.A / 4.B / 4.C',
  },
  referral_ask: {
    label:      'Referral ask (to introducer)',
    wordCap:    220,
    fileBase:   'referral_ask',
    templateRef: 'data/outreach-templates.md §"FOLLOW-UP TEMPLATES" — referral_ask_v1',
  },
  follow_up: {
    label:      'Follow-up (prior contact >=7d)',
    wordCap:    180,
    fileBase:   'follow_up',
    templateRef: 'data/outreach-templates.md §"FOLLOW-UP TEMPLATES" — linkedin_dm_2nd_touch_news_hook',
  },
};

function buildPrompt({ channel, contact, corpus, priorTouch, humanizeFeedback }) {
  const spec = CHANNEL_SPECS[channel];
  const voiceAnchor   = trimForPrompt(corpus.voice, 4000);
  const cvSlice       = trimForPrompt(corpus.cv,    8000);
  const digestSlice   = trimForPrompt(corpus.digest, 6000);
  const templateSlice = trimForPrompt(corpus.templates, 6000);

  // Channel-specific scaffolding instructions.
  const scaffolds = {
    linkedin_dm: `STRUCTURE (LinkedIn DM, max ${spec.wordCap} words):
1. Open with mutual or specific signal (no "I'm reaching out", no "Hi I'm Mitchell")
2. ONE role mention with the FULL role title (e.g., "Strategic Operations Manager, Claude Marketplace" — never "Strategic Ops")
3. Paragraph break before the impact line (a single proof point from cv.md)
4. Soft CTA — "If a 15-minute call lands in the next two weeks, I'd take it." or similar
5. Sign-off: "Mitchell Williams" or "Mitchell" with optional handles`,

    email: `STRUCTURE (cold email, max ${spec.wordCap} words):
1. Subject line on first line as: "Subject: <line>"
2. Greeting (one line)
3. Open with mutual or specific signal
4. 2-3 line proof block with one concrete metric from cv.md / article-digest.md
5. Brief role-fit hypothesis (one sentence)
6. CTA — specific 15-minute call window OR calendar link placeholder
7. Sign-off "— Mitchell" with optional contact lines`,

    referral_ask: `STRUCTURE (referral ask TO THE INTRODUCER, NOT the target, max ${spec.wordCap} words):
1. Address the INTRODUCER by name (this is "${contact.introducer}", not the target)
2. Name the target person + role + company explicitly
3. Two questions: (a) does company's policy allow referring a candidate already in ATS, (b) if yes, are you open to it
4. Offer to send cover letter + portfolio for full context BEFORE they decide
5. Explicit low-pressure exit: "if it's not a fit for you, totally understand."
6. Sign-off "— Mitchell"`,

    follow_up: `STRUCTURE (LinkedIn follow-up, max ${spec.wordCap} words):
1. Anchor on something NEW since the prior touch (recent post, news, mutual update). Never "just checking in."
2. One-line restatement of the role/company context from initial DM
3. ONE new piece of intel (a project, a mutual contact, a sharper angle)
4. Even softer CTA than the first touch — "if a 15-minute call lands in the next two weeks" OR offer to step back
5. Sign-off "— Mitchell"

PRIOR TOUCH CONTEXT:
${priorTouch ? JSON.stringify(priorTouch, null, 2) : '(no prior touch summary available)'}`,
  };

  const humanizeBlock = humanizeFeedback
    ? `\n\nHUMANIZE-CHECK FEEDBACK FROM PREVIOUS ATTEMPT (rewrite to clear these):
- Risk score: ${humanizeFeedback.score}% (${humanizeFeedback.risk}) — target is ≤20% (🟢 LOW)
- Flagged phrases to REMOVE entirely: ${(humanizeFeedback.phrases || []).map(p => `"${p.label}"`).join(', ') || 'none'}
- Burstiness: ${humanizeFeedback.burstiness?.note || 'n/a'} — vary sentence length more aggressively (mix 4-word and 30-word sentences)
- Transitions to remove from sentence starts: Furthermore, Moreover, Additionally, Consequently, However at sentence-opens
- Passive voice ratio is ${humanizeFeedback.passive?.ratio || 0}% — rewrite to active voice where it reads
DO NOT acknowledge this feedback in the output. Just write the cleaner draft.\n`
    : '';

  return `You are drafting a single outreach message in Mitchell Williams's voice. Match his cadence and word choice exactly.

VOICE ANCHOR (do not invent metrics or claims beyond what cv.md + article-digest.md document):
---
${voiceAnchor}
---

CV PROOF POINTS (use ONLY metrics that appear here; never extrapolate):
---
${cvSlice}
---

ARTICLE DIGEST (additional proof, same rule):
---
${digestSlice}
---

TEMPLATE LIBRARY (calibration only — do NOT copy verbatim; write fresh in Mitchell's voice):
---
${templateSlice}
---

CONTACT:
- Name:        ${contact.name}
- Title:       ${contact.title || '(not provided)'}
- Company:     ${contact.company}
- Target role: ${contact.role || '(not specified — generic outreach)'}
- LinkedIn:    ${contact.linkedin || '(n/a)'}
- Mutual:      ${contact.mutual || '(none)'}
- Introducer:  ${contact.introducer || '(none)'}
- Notes:       ${contact.notes || '(none)'}

CHANNEL: ${spec.label}
TEMPLATE REFERENCE: ${spec.templateRef}

${scaffolds[channel]}

HARD RULES — read every one:
- NEVER invent metrics, dates, names, or claims not present in cv.md / article-digest.md.
- Use FULL role titles (never abbreviate "Strategic Ops" — say "Strategic Operations Manager, Claude Marketplace").
- Use TIME CHUNKS not aggregates ("over the past two years" not "for years").
- Add CONCRETE QUALIFIERS to metrics ("1,000+ Principal and Distinguished engineers" not "many engineers").
- Insert a PARAGRAPH BREAK before the impact/proof line.
- BAN these AI tells entirely: "delve", "leverage", "seamlessly", "robust", "comprehensive", "holistic", "transformative", "furthermore", "moreover", "additionally", "consequently", "it's worth noting", "I am excited to", "I am thrilled to", "feel free to", "rest assured", "tapestry", "multifaceted", "I am writing to express", "in today's rapidly evolving".
- BAN sentence-opening transitions ("Furthermore,", "Moreover,", "Additionally,", "However,", "Therefore," at the start of any sentence).
- Vary sentence length AGGRESSIVELY — mix 4-word sentences with 25+ word sentences.
- Active voice. Cut passive constructions.
- Cap: ${spec.wordCap} words total.
- Specific CTA. "Connect" / "chat" / "let's connect" are forbidden — use "15-minute call in the next two weeks" or similar.
${humanizeBlock}

OUTPUT:
Output ONLY the draft text itself — no preamble, no "Here's the draft:", no markdown code fences, no explanation. Just the message body, formatted as it would be sent.`;
}

// ── Claude API ────────────────────────────────────────────────────────────
async function callClaude({ prompt, model = SONNET, maxTokens = 800 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens:  maxTokens,
      temperature: 0.6,
      messages:    [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  const usage = data.usage || {};
  const cost  = (usage.input_tokens || 0)  * RATE_INPUT_PER_TOKEN +
                (usage.output_tokens || 0) * RATE_OUTPUT_PER_TOKEN;
  return { text, usage, cost, model };
}

// ── humanize feedback shaping ─────────────────────────────────────────────
function shapeHumanizeFeedback(result) {
  return {
    score:      result.score,
    risk:       result.risk.label,
    phrases:    result.checks.phrases.hits.map(h => ({ label: h.label, weight: h.weight, count: h.count })),
    burstiness: { score: result.checks.burstiness.score, note: result.checks.burstiness.note },
    passive:    { score: result.checks.passive.score,    ratio: result.checks.passive.ratio },
    transitions:{ score: result.checks.transitions.score, ratio: result.checks.transitions.ratio },
  };
}

// ── cost log + budget guard ───────────────────────────────────────────────
function logCostRow({ requests, usage, cost, model, label = 'draft-outreach' }) {
  ensureDir(dirname(COST_LOG));
  if (!existsSync(COST_LOG)) writeFileSync(COST_LOG, COST_LOG_HEADER);
  const row = [
    todayISO(),
    label,
    requests,
    usage.input_tokens   || 0,
    usage.output_tokens  || 0,
    usage.cache_read_input_tokens     || 0,
    usage.cache_creation_input_tokens || 0,
    cost.toFixed(4),
    model || SONNET,
  ].join('\t') + '\n';
  appendFileSync(COST_LOG, row);
}

function read30dSpend() {
  if (!existsSync(COST_LOG)) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  let total = 0;
  for (const line of readFileSync(COST_LOG, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const d = new Date(cols[0]);
    if (d >= cutoff) total += parseFloat(cols[7]) || 0;
  }
  return total;
}

// ── per-channel draft pipeline ────────────────────────────────────────────
async function draftOneChannel({ channel, contact, corpus, priorTouch, outDir, ts, dryRun }) {
  const spec = CHANNEL_SPECS[channel];
  const meta = {
    channel,
    contact_id:      contact.contact_id,
    contact_name:    contact.name,
    company:         contact.company,
    role:            contact.role,
    template_basis:  spec.templateRef,
    word_cap:        spec.wordCap,
    timestamp:       new Date().toISOString(),
    humanize_score:  null,
    humanize_risk:   null,
    retry_count:     0,
    cost_usd:        0,
    model:           SONNET,
    flagged:         false,
    flag_reason:     null,
    mitchell_action: 'review_then_send',
  };

  if (dryRun) {
    meta.cost_usd = (EST_INPUT_TOKENS_PER_DRAFT * RATE_INPUT_PER_TOKEN +
                     EST_OUTPUT_TOKENS_PER_DRAFT * RATE_OUTPUT_PER_TOKEN);
    return {
      ok: true,
      dryRun: true,
      channel,
      meta,
      draft: `[DRY-RUN] would generate ${spec.label} draft for ${contact.name} at ${contact.company}\n` +
             `[DRY-RUN] template basis: ${spec.templateRef}\n` +
             `[DRY-RUN] word cap: ${spec.wordCap}\n` +
             `[DRY-RUN] est. cost: $${meta.cost_usd.toFixed(4)}`,
    };
  }

  let draftText  = '';
  let humanize   = null;
  let totalCost  = 0;
  let totalUsage = { input_tokens: 0, output_tokens: 0 };
  let lastFeedback = null;

  for (let attempt = 0; attempt <= HUMANIZE_RETRY_MAX; attempt++) {
    const prompt = buildPrompt({
      channel,
      contact,
      corpus,
      priorTouch,
      humanizeFeedback: lastFeedback,
    });
    const { text, usage, cost, model } = await callClaude({ prompt, maxTokens: 900 });
    draftText  = text;
    totalCost += cost;
    totalUsage.input_tokens  += usage.input_tokens  || 0;
    totalUsage.output_tokens += usage.output_tokens || 0;
    meta.model = model;
    meta.retry_count = attempt;

    humanize = humanizeCheck(text);
    lastFeedback = shapeHumanizeFeedback(humanize);

    if (humanize.risk.label === 'LOW') break;
    if (attempt === HUMANIZE_RETRY_MAX) break;
    // retry — re-loop with shaped feedback
  }

  meta.humanize_score = humanize.score;
  meta.humanize_risk  = humanize.risk.label;
  meta.cost_usd       = +totalCost.toFixed(4);

  // Surface gate:
  //   LOW      → clean
  //   MEDIUM   → flagged WARNING (still saved)
  //   HIGH/CRIT → blocked (NOT saved)
  if (humanize.risk.label === 'HIGH' || humanize.risk.label === 'CRITICAL') {
    meta.flagged     = true;
    meta.flag_reason = `humanize-check ${humanize.risk.label} (${humanize.score}%) after ${HUMANIZE_RETRY_MAX + 1} attempts — draft NOT surfaced`;
    return { ok: false, channel, meta, draft: draftText, blocked: true };
  }

  if (humanize.risk.label === 'MEDIUM') {
    meta.flagged     = true;
    meta.flag_reason = `humanize-check MEDIUM (${humanize.score}%) after retries — review flagged phrases before sending`;
  }

  // Write files.
  ensureDir(outDir);
  const baseName = `${spec.fileBase}-${ts}`;
  const draftPath = join(outDir, `${baseName}.md`);
  const metaPath  = join(outDir, `${baseName}.meta.json`);

  const draftFile = renderDraftFile({ contact, channel, draftText, meta });
  writeFileSync(draftPath, draftFile);
  writeFileSync(metaPath,  JSON.stringify(meta, null, 2));

  return { ok: true, channel, meta, draft: draftText, draftPath, metaPath };
}

function renderDraftFile({ contact, channel, draftText, meta }) {
  const spec = CHANNEL_SPECS[channel];
  const flag = meta.flagged ? `\n> **WARNING:** ${meta.flag_reason}\n` : '';
  return `# ${spec.label} — ${contact.name} (${contact.company})

**Generated:** ${meta.timestamp}
**Humanize:** ${meta.humanize_risk} (${meta.humanize_score}%)${meta.flagged ? ' WARN' : ''}
**Retries:** ${meta.retry_count}
**Cost:** $${meta.cost_usd}
**Mitchell action:** ${meta.mitchell_action}
**Template basis:** ${meta.template_basis}
${flag}
---

${draftText}

---

## Send checklist (Mitchell)
1. Re-verify the recipient is still at ${contact.company}.
2. Check their recent activity (last 7-10 days). If a relevant post exists, optionally add a one-line reference BEFORE the opening.
3. Verify mutual ("${contact.mutual || 'n/a'}") still appears if referenced.
4. Re-run humanize-check if any edits are made before sending.
5. Log the touch via \`npm run outreach:log\` after sending.
`;
}

function renderSummary({ contact, results, totalCost }) {
  const lines = [];
  lines.push(`# Outreach drafts — ${contact.name} (${contact.company})`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Total cost:** $${totalCost.toFixed(4)}`);
  lines.push(`**Drafts attempted:** ${results.length}`);
  lines.push('');
  lines.push('## Drafts');
  lines.push('');
  for (const r of results) {
    const spec = CHANNEL_SPECS[r.channel];
    if (r.blocked) {
      lines.push(`- ${spec.label} — BLOCKED (humanize ${r.meta.humanize_risk} ${r.meta.humanize_score}%) — not saved`);
    } else if (r.meta.flagged) {
      lines.push(`- ${spec.label} — WARNING (humanize ${r.meta.humanize_risk} ${r.meta.humanize_score}%) — review before sending`);
    } else {
      lines.push(`- ${spec.label} — clean (humanize ${r.meta.humanize_risk} ${r.meta.humanize_score}%) — ready for Mitchell review`);
    }
  }
  lines.push('');
  lines.push('## Hard rules (reminder)');
  lines.push('- Mitchell sends manually via LinkedIn / Gmail after review.');
  lines.push('- This script never sends, commits, or pushes.');
  lines.push('- All factual claims are from cv.md + article-digest.md only.');
  return lines.join('\n') + '\n';
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printUsage(); return; }

  // 1. Load contact.
  let contact;
  try { contact = loadContact(args); }
  catch (err) {
    console.error(`[draft-outreach] ${err.message}`);
    printUsage();
    process.exit(2);
  }

  if (!contact.company) {
    console.error('[draft-outreach] company is required (via --company or contact card)');
    process.exit(2);
  }

  console.log(`[draft-outreach] contact: ${contact.name} @ ${contact.company} (${contact.role || 'role TBD'})`);

  // 2. Resolve applicable channels.
  const { channels, skipped } = applicableChannels(contact, args.channels);
  if (!channels.length) {
    console.error('[draft-outreach] no applicable channels. Skip reasons:');
    for (const [ch, why] of Object.entries(skipped)) console.error(`  - ${ch}: ${why}`);
    process.exit(2);
  }
  console.log(`[draft-outreach] channels: ${channels.join(', ')}`);
  if (Object.keys(skipped).length) {
    console.log('[draft-outreach] skipped channels:');
    for (const [ch, why] of Object.entries(skipped)) console.log(`  - ${ch}: ${why}`);
  }

  // 3. Cost gate (estimate first, abort if too high).
  const estCostPerDraft = EST_INPUT_TOKENS_PER_DRAFT * RATE_INPUT_PER_TOKEN +
                          EST_OUTPUT_TOKENS_PER_DRAFT * RATE_OUTPUT_PER_TOKEN;
  // Assume worst-case: each draft retries twice (3 total attempts).
  const worstCaseAttempts = HUMANIZE_RETRY_MAX + 1;
  const estTotal = channels.length * estCostPerDraft * worstCaseAttempts;
  console.log(`[draft-outreach] cost estimate (worst-case ${worstCaseAttempts}x per draft): $${estTotal.toFixed(4)}`);

  if (estTotal > args.maxCost) {
    console.error(`[draft-outreach] estimate $${estTotal.toFixed(4)} exceeds --max-cost $${args.maxCost}. Aborting.`);
    if (!args.dryRun) process.exit(3);
  }

  const spent30d = read30dSpend();
  if (spent30d + estTotal > MONTHLY_BUDGET) {
    console.error(`[draft-outreach] 30d spend $${spent30d.toFixed(2)} + estimate $${estTotal.toFixed(4)} ` +
                  `would exceed MONTHLY_BUDGET_USD ($${MONTHLY_BUDGET}). Aborting.`);
    if (!args.dryRun) process.exit(3);
  }

  // 4. Load corpus.
  const corpus = loadCorpus();
  if (!corpus.cv) console.warn('[draft-outreach] WARNING: cv.md not found — drafts will lack proof points');
  if (!corpus.voice) console.warn('[draft-outreach] WARNING: writing-samples/voice-reference.md not found — voice fidelity at risk');

  // 5. Prior touch (for follow_up channel).
  let priorTouch = null;
  if (channels.includes('follow_up')) {
    const tracked = getContact(contact.contact_id);
    if (tracked) {
      const last = tracked.touches?.[tracked.touches.length - 1];
      priorTouch = {
        ts:           last?.ts,
        channel:      last?.channel,
        template_id:  last?.template_id,
        summary:      last?.summary,
        days_ago:     daysSinceLastTouch(tracked),
        total_touches: touchCount(tracked),
      };
    }
  }

  // 6. Output directory.
  const companySlug = slugify(normalizeCompany(contact.company));
  const contactSlug = slugify(contact.name);
  const outDir = join(DRAFTS_ROOT, companySlug, contactSlug);

  // 7. Cache check (skip if drafts already exist for today and --no-cache not passed).
  if (!args.noCache && !args.dryRun) {
    const todaysDrafts = existsSync(outDir)
      ? readFileSync(join(outDir, '_summary.md'), 'utf8').slice(0, 200).includes(todayISO())
        ? true
        : false
      : false;
    if (todaysDrafts) {
      console.log(`[draft-outreach] drafts already exist for ${contactSlug} today. Pass --no-cache to regenerate.`);
      console.log(`[draft-outreach] existing dir: ${outDir}`);
      return;
    }
  }

  // 8. Dry-run: print plan and exit.
  if (args.dryRun) {
    console.log('\n=== DRY RUN — no LLM calls ===');
    console.log(`contact:        ${contact.name}`);
    console.log(`company:        ${contact.company}`);
    console.log(`role:           ${contact.role || '(none)'}`);
    console.log(`linkedin:       ${contact.linkedin || '(none)'}`);
    console.log(`email:          ${contact.email || '(none)'}`);
    console.log(`mutual:         ${contact.mutual || '(none)'}`);
    console.log(`introducer:     ${contact.introducer || '(none)'}`);
    console.log(`output_dir:     ${outDir.replace(ROOT, '.')}`);
    console.log('\nPlanned drafts:');
    for (const ch of channels) {
      const spec = CHANNEL_SPECS[ch];
      console.log(`  - ${spec.label.padEnd(38)}  cap=${spec.wordCap}w  template=${spec.templateRef}`);
    }
    if (Object.keys(skipped).length) {
      console.log('\nSkipped:');
      for (const [ch, why] of Object.entries(skipped)) {
        console.log(`  - ${ch.padEnd(38)}  reason=${why}`);
      }
    }
    console.log(`\nCost (single-attempt per draft): $${(channels.length * estCostPerDraft).toFixed(4)}`);
    console.log(`Cost (worst-case ${worstCaseAttempts}x retries):    $${estTotal.toFixed(4)}`);
    console.log('\nSources used:');
    console.log(`  - cv.md                          (${corpus.cv.length} chars)`);
    console.log(`  - article-digest.md              (${corpus.digest.length} chars)`);
    console.log(`  - writing-samples/voice-reference.md (${corpus.voice.length} chars)`);
    console.log(`  - data/outreach-templates.md     (${corpus.templates.length} chars)`);
    console.log('\nExiting (dry-run). Pass without --dry-run to spend money.');
    return;
  }

  // 9. Execute draft pipeline (serial — each draft is small and cheap; serial avoids rate-limit retries).
  const ts = nowTs();
  const results = [];
  let totalCost = 0;
  for (const channel of channels) {
    process.stdout.write(`[draft-outreach] drafting ${channel}...`);
    try {
      const r = await draftOneChannel({ channel, contact, corpus, priorTouch, outDir, ts, dryRun: false });
      results.push(r);
      totalCost += r.meta.cost_usd;
      const status = r.blocked ? 'BLOCKED' : r.meta.flagged ? 'WARN' : 'OK';
      console.log(` ${status} (${r.meta.humanize_risk} ${r.meta.humanize_score}%, $${r.meta.cost_usd}, retries=${r.meta.retry_count})`);
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
      results.push({
        ok: false, channel,
        meta: { channel, error: err.message, cost_usd: 0 },
      });
    }
  }

  // 10. Log aggregate cost row.
  if (totalCost > 0) {
    logCostRow({
      requests: results.filter(r => r.ok).length,
      usage:    { input_tokens: 0, output_tokens: 0 }, // per-call usage not aggregated here; aggregate cost is sufficient
      cost:     totalCost,
      model:    SONNET,
      label:    `draft-outreach:${companySlug}:${contactSlug}`,
    });
  }

  // 11. Summary file.
  ensureDir(outDir);
  writeFileSync(join(outDir, '_summary.md'), renderSummary({ contact, results, totalCost }));

  console.log(`\n[draft-outreach] done. Total cost: $${totalCost.toFixed(4)}`);
  console.log(`[draft-outreach] output: ${outDir.replace(ROOT, '.')}`);
  console.log(`[draft-outreach] summary: ${join(outDir, '_summary.md').replace(ROOT, '.')}`);
  console.log('[draft-outreach] NEXT STEP: Mitchell reviews drafts before sending. Script does NOT send.');
}

// Only run as CLI when invoked directly.
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  main().catch(err => {
    console.error('[draft-outreach] FATAL:', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}
