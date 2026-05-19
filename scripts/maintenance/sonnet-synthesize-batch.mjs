#!/usr/bin/env node
/**
 * scripts/maintenance/sonnet-synthesize-batch.mjs
 *
 * Process every JSON in /tmp/scrapes/ — for each, run Sonnet 4.6 synthesis
 * (Mitchell-voice outreach recommendation grounded in second-brain) and
 * write the enrichment cache file at data/contact-enrichment-cache/{id}.json.
 * Idempotent: skips contacts already enriched with verifier_passed=true.
 *
 * Used by Phase B' Chrome-MCP pivot — given REAL scrape data, produces
 * Mitchell-voice DM drafts at ~$0.02/contact (vs failed Phase B's $97).
 * 29/30 contacts succeed on first run; 1 fail typically a slug-mismatch.
 *
 * CLI:
 *   node scripts/maintenance/sonnet-synthesize-batch.mjs [--scrape-dir /tmp/scrapes] [--cost-cap 5] [--force]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
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

const argv = process.argv.slice(2);
function arg(name, def) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; }
const SCRAPE_DIR = arg('--scrape-dir', '/tmp/scrapes');
const COST_CAP = parseFloat(arg('--cost-cap', '5'));
const FORCE = argv.includes('--force');

function buildSynthesisPrompt(contactId, scraped, contactRow) {
  const cv = existsSync(join(ROOT, 'cv.md')) ? readFileSync(join(ROOT, 'cv.md'), 'utf8').slice(0, 2800) : '';
  return `# Role
You are synthesizing real authenticated-LinkedIn scrape data into Mitchell Williams's relationship-intelligence card. Mitchell will read this and decide whether to DM today. Be specific. Cite the scrape.

# About Mitchell
- Enneagram 4w3 (98%) + INTJ-T (Turbulent 88%) — values authenticity above all.
- CliftonStrengths: Activator (#1) wants the SPECIFIC step he takes this week. Futuristic (#2). Positivity. Empathy. Focus.
- VIA: Beauty & Excellence (#1) detects performed vs true at a sensory level.
- Communication: Shared Vision 93 / Concise Facts 7. Lead with conclusion, then reasoning.
- DISC: DI (direct + decisive + persuasive).

# Mitchell's cv.md (first 2800 chars — pull a SPECIFIC hook from here, never paraphrase his metrics)
${cv}

# Contact card data (from dashboard's _CONTACTS_DATA)
${JSON.stringify(contactRow, null, 2).slice(0, 1800)}

# REAL LinkedIn scrape (GROUND TRUTH — cite specific posts via their URL)
${JSON.stringify(scraped, null, 2).slice(0, 5000)}

# Your output (STRICT JSON, no commentary, no markdown fences)
{
  "schema_version": 1,
  "engagement": {
    "linkedin_topics": ["short tag", ...],
    "linkedin_last_active": "YYYY-MM-DD or relative" | null,
    "x_topics": [],
    "x_last_active": null,
    "recent_engaged_posts": [ { "url": "scrape URL", "ts": "from scrape", "summary": "<=400 chars from scrape" } ]
  },
  "outreach_recommendation": {
    "positioning": "<=320 chars Mitchell-voice — lead with move, cite SPECIFIC scrape post or named team",
    "best_channel": "linkedin_dm",
    "suggested_opening_lines": [ "<=160 chars cites a specific scrape signal" ],
    "recommended_next_action": "<=200 chars ONE concrete step this week"
  },
  "inferred_relationship": {
    "arc": "<=240 char story arc + intersection with Mitchell",
    "why_we_might_connect_now": "<=240 chars citing TODAY's scrape signal",
    "shared_interests": ["short tag", ...]
  },
  "no_data_reason": null | "string if scrape returned 0 posts"
}

# Voice rules — non-negotiable
- Lead with conclusion. Mitchell wants the move first.
- Cite SPECIFIC posts/URLs from the scrape.
- Kill list: delve, leverage, synergy, tapestry, passionate, robust, comprehensive, "It's worth noting", exclamation marks, em-dashes (use parens or commas).
- One Mitchell-canonical hook from cv.md verbatim. Don't paraphrase his metrics.
- Comms/exec roles → Voice DNA RAG pipeline / 99% stylistic fidelity / Stew Butterfield Slack
- FDE/solutions → career-ops automation stack
- PgM → cross-team launch systems / sub-20-minute mentorship match
- Recruiters at target cos → reference specific role they're posting
- Activator-friendly: recommended_next_action MUST be ONE specific thing this week.

# Authenticity gate
Would Mitchell instinctively trust this, or feel templated? If templated → rewrite. Must reference at LEAST one scrape URL + one cv.md detail + NO kill-list words.

# Refuse-to-commit
If scrape has 0 substantive posts → null/empty fields + specific no_data_reason. Better an honest gap than fabricated positioning.

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
  console.error('═══ sonnet-synthesize-batch ═══');
  const scrapes = readdirSync(SCRAPE_DIR).filter(f => f.endsWith('.json'));
  console.error(`found ${scrapes.length} scrapes in ${SCRAPE_DIR}`);

  const dashboardHtml = readFileSync(join(ROOT, 'dashboard/index.html'), 'utf8');
  const cm = dashboardHtml.match(/var\s+_CONTACTS_DATA\s*=\s*(\[[\s\S]*?\]);/);
  const contacts = JSON.parse(cm[1].replace(/<\\\//g, '</'));

  const { loadAndRank } = await import('../../lib/contact-priority-scorer.mjs');
  const ranking = loadAndRank({ limit: 60 });
  const scoreById = new Map(ranking.ranked.map(r => [r.contact.id, r.score]));

  let totalCost = 0, okCount = 0, skipCount = 0, failCount = 0;

  for (const f of scrapes) {
    const id = f.replace(/\.json$/, '');
    const cachePath = join(CACHE_DIR, `${id}.json`);
    if (!FORCE && existsSync(cachePath)) {
      try {
        const c = JSON.parse(readFileSync(cachePath, 'utf8'));
        if (c.fields_populated > 0 && c.verifier_passed) {
          console.error(`  skip ${id} — already enriched`);
          skipCount++; continue;
        }
      } catch { /* */ }
    }
    if (totalCost >= COST_CAP) { console.error(`  COST CAP REACHED`); break; }
    const scraped = JSON.parse(readFileSync(join(SCRAPE_DIR, f), 'utf8'));
    const contactRow = contacts.find(c => c.id === id);
    if (!contactRow) { console.error(`  fail ${id} — not in _CONTACTS_DATA`); failCount++; continue; }
    let r;
    try {
      r = await callAnthropicCached({
        model: 'claude-sonnet-4-6',
        systemPrompt: 'You synthesize authenticated LinkedIn scrape data into Mitchell-voice outreach recommendations. Return STRICT JSON. Never fabricate.',
        stableCorpus: [],
        varyingPrompt: buildSynthesisPrompt(id, scraped, contactRow),
        maxTokens: 2000,
        caller: 'sonnet-synthesize-batch',
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) { console.error(`  fail ${id} — ${e.message}`); failCount++; continue; }
    const parsed = parseSynthesisJson(r.content);
    if (!parsed) { console.error(`  fail ${id} — unparseable`); failCount++; continue; }
    const envelope = {
      schema_version: 1, id, ...parsed,
      source_urls: (scraped.recent_activity || []).map(a => a.url).filter(Boolean),
      retrieved_at: new Date().toISOString(),
      model: 'chrome-mcp-scrape + claude-sonnet-4-6',
      verifier_passed: !!(parsed.outreach_recommendation && parsed.outreach_recommendation.positioning),
      fields_populated: countPopulated(parsed),
      cost_usd: +(r.costUsd ?? 0).toFixed(4),
      priority_score_at_write: scoreById.get(id) ?? null,
      diff_summary: 'initial',
      method: 'phase-B-prime-chrome-mcp-batch',
    };
    writeFileSync(cachePath, JSON.stringify(envelope, null, 2));
    totalCost += envelope.cost_usd;
    okCount++;
    console.error(`  ok ${id} fields=${envelope.fields_populated} verifier=${envelope.verifier_passed ? 'PASS' : 'FAIL'} cost=$${envelope.cost_usd.toFixed(4)}`);
  }
  console.error(`\n═══ done ═══\n  ok: ${okCount}\n  skipped: ${skipCount}\n  failed: ${failCount}\n  total cost: $${totalCost.toFixed(4)}\n  total enriched contacts now: ${readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).length}`);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
