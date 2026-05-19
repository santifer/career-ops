#!/usr/bin/env node
/**
 * scripts/maintenance/sonnet-synthesize-top5.mjs
 *
 * One-off: take 5 LinkedIn scrape JSONs (saved to /tmp/) and run Sonnet 4.6
 * synthesis on each, writing data/contact-enrichment-cache/{id}.json with the
 * full second-brain-aligned schema (positioning, opening lines, why-now, etc.).
 *
 * The scrapes were captured via Chrome MCP (real auth) on 2026-05-19 to avoid
 * the LinkedIn Playwright authwall. This script is the synthesis-only half of
 * Phase B' — given REAL scrape data, produce Mitchell-voice outreach material.
 *
 * Cost: ~$0.05/contact × 5 = ~$0.25 total.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* */ }

import { callAnthropicCached } from '../../lib/anthropic-cache-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const CACHE_DIR = join(ROOT, 'data/contact-enrichment-cache');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const TARGETS = [
  { id: 'jake-standish-openai', scrapePath: '/tmp/jake-scrape.json', priorityScore: 8.25 },
  { id: 'kevin-dubouis-openai', scrapePath: '/tmp/kevin-dubouis-scrape.json', priorityScore: 4.80 },
  { id: 'diana-clough-databricks', scrapePath: '/tmp/diana-scrape.json', priorityScore: 4.80 },
  { id: 'matt-hunter-deepgram', scrapePath: '/tmp/matt-hunter-scrape.json', priorityScore: 4.80 },
  { id: 'luke-stockmayer-glean', scrapePath: '/tmp/luke-stockmayer-scrape.json', priorityScore: 3.90 },
];

function buildSynthesisPrompt(contactId, scraped, contactRow) {
  const cv = existsSync(join(ROOT, 'cv.md')) ? readFileSync(join(ROOT, 'cv.md'), 'utf8').slice(0, 2800) : '';
  return `# Role
You are synthesizing real authenticated-LinkedIn scrape data into Mitchell Williams's relationship-intelligence card. Mitchell will read this and decide whether to DM today. Be specific. Be useful. Cite the scrape.

# About Mitchell
- **Enneagram 4w3 (98%) + INTJ-T (Turbulent 88%)** — values authenticity above all.
- CliftonStrengths: **Activator (#1)** wants the SPECIFIC step he takes this week. Futuristic (#2). Positivity. Empathy. Focus.
- VIA: **Beauty & Excellence (#1)** detects performed vs true at a sensory level.
- Communication: **Shared Vision 93 / Concise Facts 7**. Lead with conclusion, then reasoning.
- DISC: DI (direct + decisive + persuasive).

# Mitchell's cv.md (first 2800 chars — pull a SPECIFIC hook from here, never paraphrase his metrics)
${cv}

# Contact card data (from dashboard's _CONTACTS_DATA)
${JSON.stringify(contactRow, null, 2).slice(0, 2000)}

# REAL LinkedIn scrape (GROUND TRUTH — cite specific posts via their URL)
${JSON.stringify(scraped, null, 2).slice(0, 5000)}

# Your output (STRICT JSON, no commentary, no markdown fences)
{
  "schema_version": 1,
  "engagement": {
    "linkedin_topics": ["short tag", ...],
    "linkedin_last_active": "YYYY-MM-DD or relative if exact date unknown" | null,
    "x_topics": [],
    "x_last_active": null,
    "recent_engaged_posts": [ { "url": "actual scrape URL", "ts": "from scrape", "summary": "<=400 chars about what the post was about, drawn FROM THE SCRAPE" } ]
  },
  "outreach_recommendation": {
    "positioning": "<=320 chars in Mitchell-voice — lead with the move, cite a SPECIFIC scrape post or named team, never generic",
    "best_channel": "linkedin_dm",
    "suggested_opening_lines": [ "<=160 chars, cites a specific scrape signal (the contact's actual post URL or topic), never generic" ],
    "recommended_next_action": "<=200 chars — ONE concrete step Mitchell takes this week"
  },
  "inferred_relationship": {
    "arc": "<=240 char synthesis of their professional story arc and where it intersects with Mitchell",
    "why_we_might_connect_now": "<=240 chars citing TODAY's signal from the scraped posts — never a platitude",
    "shared_interests": ["short tag", ...]
  },
  "no_data_reason": null | "string — only if scrape returned 0 posts or empty"
}

# Voice rules — non-negotiable

**Lead with conclusion.** Mitchell wants the move first, reasoning second.

**Cite SPECIFIC posts.** Reference the scraped URL or the actual content of a recent post. "Worth a 20-min call about the FDE founding team you posted about 1 week ago?" beats "I noticed your work at Glean."

**Kill list — NEVER use:**
- delve, leverage, synergy, tapestry, passionate, robust, comprehensive
- "It's worth noting that", "In today's fast-paced world"
- Exclamation marks for emphasis
- Em-dashes (use parentheses or commas instead)
- Vague positivity ("exciting opportunity", "amazing chance")

**One Mitchell-canonical hook per output.** Pull from cv.md verbatim — don't paraphrase his metrics. Examples that match different contact archetypes:
- For comms/exec roles: reference his Slack/Butterfield work or career-ops voice corpus
- For FDE/solutions: reference career-ops as a personal automation stack (740+ roles scored, refresh orchestrator with cost caps, cross-arch verifiers)
- For product/PgM: reference cross-team launch systems
- For recruiters at target cos: reference the specific role they're posting

**Activator-friendly action.** recommended_next_action MUST be ONE specific thing he does this week, not "consider X".

# Authenticity gate
Before finalizing: would Mitchell instinctively trust this, or feel templated? If templated → rewrite. Output must reference at LEAST one specific URL from the scrape, at least one cv.md detail, and have NO kill-list words.

# Refuse-to-commit
If the scrape has 0 substantive recent posts → return JSON with null/empty fields and specific no_data_reason. Better an honest gap than fabricated positioning.

Return the JSON now.`;
}

function parseSynthesisJson(content) {
  const stripped = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(stripped); } catch { /* */ }
  const m = stripped.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function countPopulated(p) {
  let n = 0;
  if ((p.engagement?.linkedin_topics || []).length) n++;
  if (p.engagement?.linkedin_last_active) n++;
  if ((p.engagement?.recent_engaged_posts || []).length) n++;
  if (p.outreach_recommendation?.positioning) n++;
  if ((p.outreach_recommendation?.suggested_opening_lines || []).length) n++;
  if (p.outreach_recommendation?.recommended_next_action) n++;
  if (p.inferred_relationship?.arc) n++;
  if (p.inferred_relationship?.why_we_might_connect_now) n++;
  if ((p.inferred_relationship?.shared_interests || []).length) n++;
  return n;
}

async function main() {
  console.log('═══ sonnet-synthesize-top5 ═══');
  const dashboardHtml = readFileSync(join(ROOT, 'dashboard/index.html'), 'utf8');
  const contactsMatch = dashboardHtml.match(/var\s+_CONTACTS_DATA\s*=\s*(\[[\s\S]*?\]);/);
  const contacts = JSON.parse(contactsMatch[1].replace(/<\\\//g, '</'));
  let totalCost = 0;
  let okCount = 0;
  let failCount = 0;

  for (const target of TARGETS) {
    console.log(`\n→ ${target.id}`);
    if (!existsSync(target.scrapePath)) {
      console.log(`  scrape file missing: ${target.scrapePath}`);
      failCount++;
      continue;
    }
    const scraped = JSON.parse(readFileSync(target.scrapePath, 'utf8'));
    const contactRow = contacts.find(c => c.id === target.id);
    if (!contactRow) {
      console.log(`  contact ${target.id} not in _CONTACTS_DATA`);
      failCount++;
      continue;
    }
    const prompt = buildSynthesisPrompt(target.id, scraped, contactRow);
    let r;
    try {
      r = await callAnthropicCached({
        model: 'claude-sonnet-4-6',
        systemPrompt: 'You synthesize authenticated LinkedIn scrape data into Mitchell-voice outreach recommendations. Return STRICT JSON. Never fabricate.',
        stableCorpus: [],
        varyingPrompt: prompt,
        maxTokens: 2000,
        caller: 'sonnet-synthesize-top5',
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      console.log(`  Sonnet error: ${e.message}`);
      failCount++;
      continue;
    }
    const parsed = parseSynthesisJson(r.content);
    if (!parsed) {
      console.log(`  Unparseable JSON; first 300 chars: ${(r.content || '').slice(0, 300)}`);
      failCount++;
      continue;
    }
    const envelope = {
      schema_version: 1,
      id: target.id,
      ...parsed,
      source_urls: (scraped.recent_activity || []).map(a => a.url).filter(Boolean),
      retrieved_at: new Date().toISOString(),
      model: 'chrome-mcp-scrape + claude-sonnet-4-6',
      verifier_passed: parsed.outreach_recommendation && parsed.outreach_recommendation.positioning ? true : false,
      fields_populated: countPopulated(parsed),
      cost_usd: +(r.costUsd ?? 0).toFixed(4),
      priority_score_at_write: target.priorityScore,
      diff_summary: 'initial',
      method: 'phase-B-prime-chrome-mcp-pivot',
    };
    writeFileSync(join(CACHE_DIR, `${target.id}.json`), JSON.stringify(envelope, null, 2));
    totalCost += envelope.cost_usd;
    okCount++;
    console.log(`  OK fields=${envelope.fields_populated} verifier=${envelope.verifier_passed ? 'PASS' : 'FAIL'} cost=$${envelope.cost_usd.toFixed(4)}`);
  }
  console.log(`\n═══ done ═══`);
  console.log(`  ok: ${okCount}/${TARGETS.length}`);
  console.log(`  failed: ${failCount}`);
  console.log(`  total cost: $${totalCost.toFixed(4)}`);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
