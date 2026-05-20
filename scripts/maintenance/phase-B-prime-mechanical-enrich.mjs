#!/usr/bin/env node
/**
 * scripts/maintenance/phase-B-prime-mechanical-enrich.mjs
 *
 * Phase B' — the Mitchell-aligned pivot to the halted Phase B.
 *
 * Halted Phase B used a 3-way LLM council ($97/contact) that produced empty
 * results because models can't see LinkedIn behind auth. The output violated
 * Mitchell's VIA #1 (Beauty/Excellence) + Authenticity values — fabricated
 * citations to unrelated URLs.
 *
 * Phase B' inverts the approach:
 *   1. Playwright scrapes REAL authenticated LinkedIn data (posts, recent
 *      activity, named team if visible). NO HALLUCINATION POSSIBLE — what
 *      you see is what's on the page.
 *   2. A SINGLE Sonnet 4.6 call per contact synthesizes the scraped JSON
 *      into Mitchell-voice positioning + DM draft + recommended action.
 *      ~$0.05/contact (vs $97 with 3-way council).
 *
 * Cost projection: 100 contacts × $0.05 ≈ $5 (vs Phase B's projected $4,850
 * if extrapolated from the 1 contact actually run).
 *
 * Authenticity alignment: the scraped data is what's literally visible. The
 * Sonnet synthesis cites the actual URLs. Mitchell's VIA #1 detector won't
 * flag it as performed.
 *
 * Requires: Mitchell to run `node scripts/scrape-contact-photo.mjs --setup-auth`
 * once to establish data/linkedin-storage-state.json. Without it, falls back
 * to queue-only mode and the script is a no-op.
 *
 * CLI:
 *   node scripts/maintenance/phase-B-prime-mechanical-enrich.mjs --top 100 --cost-cap 10
 *   node scripts/maintenance/phase-B-prime-mechanical-enrich.mjs --contact jake-standish-openai
 *   node scripts/maintenance/phase-B-prime-mechanical-enrich.mjs --dry-run
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* */ }

import { loadAndRank } from '../../lib/contact-priority-scorer.mjs';
import { callAnthropicCached } from '../../lib/anthropic-cache-helper.mjs';
import { isCdpAvailable, connectToChromeCDP } from '../../lib/cdp-browser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const STORAGE_STATE_PATH = join(ROOT, 'data/linkedin-storage-state.json');
const ENRICHMENT_CACHE_DIR = join(ROOT, 'data/contact-enrichment-cache');
const STATE_PATH = join(ROOT, 'data/refresh-master-state.json');
const LOG_DIR = join(ROOT, 'data/logs');
const TODAY = new Date().toISOString().slice(0, 10);
const LOG_PATH = join(LOG_DIR, `phase-B-prime-${TODAY}.log`);

const argv = process.argv.slice(2);
function flag(name, def = null) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; }
function flagInt(name, def) { const v = parseInt(flag(name, ''), 10); return Number.isFinite(v) ? v : def; }
function flagFloat(name, def) { const v = parseFloat(flag(name, '')); return Number.isFinite(v) ? v : def; }

const TOP_N = flagInt('--top', 100);
const COST_CAP = flagFloat('--cost-cap', 10);
const RATE_PER_MIN = flagInt('--rate-per-min', 20);
const SINGLE_CONTACT = flag('--contact');
const DRY_RUN = argv.includes('--dry-run');
const VERBOSE = argv.includes('--verbose') || argv.includes('-v');

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

function ts() { return new Date().toISOString(); }
function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.error(line);
  try { appendFileSync(LOG_PATH, line + '\n'); } catch { /* */ }
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { spend_window_30d: [], refresh_history: {} };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return { spend_window_30d: [], refresh_history: {} }; }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Playwright scrape — authenticated LinkedIn profile.
 *
 * Takes a session handle (built once per run by main()) that abstracts
 * over the two auth modes:
 *   - CDP-attached: page is created in the running Chrome's default
 *     context; auth comes from the live LinkedIn login.
 *   - storage-state: page is created in a fresh context loaded from
 *     data/linkedin-storage-state.json.
 *
 * Returns a structured JSON of what's visible, OR { ok: false, reason }.
 */
async function scrapeLinkedinAuthenticated(contact, session) {
  if (!contact.linkedin_url) return { ok: false, reason: 'no_linkedin_url' };
  const { page, cleanup } = await session.newPage();
  let scraped = null;
  try {
    // ── Pass 1: profile page (name, headline, location, mutual count) ──────
    await page.goto(contact.linkedin_url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2500);

    // Auth-wall detection — if redirected to /authwall or /login, abort.
    const profileUrl = page.url();
    if (/\/(authwall|login|checkpoint)/.test(profileUrl)) {
      return { ok: false, reason: `redirected_to_${profileUrl.split('/').slice(0,5).join('/')}` };
    }

    const profileData = await page.evaluate(() => {
      const out = {};
      // Profile name: LinkedIn moved this around. Use sections + section-aria-label.
      // From observed DOM (2026-05-19 via Chrome MCP): the name is inside the top card
      // section and shows up as an h2 (not h1) at the start of allHeadingsBelowH1.
      const nameEl =
        document.querySelector('main section:first-of-type h1') ||
        document.querySelector('main section:first-of-type h2') ||
        document.querySelector('main h1') ||
        document.querySelector('main h2');
      out.name = nameEl ? nameEl.textContent.trim() : null;

      // Headline: in the same top card, below the name.
      const topCardText = (document.querySelector('main section:first-of-type') || document).innerText || '';
      const headlineMatch = topCardText.split('\n').find(line => line.length > 10 && line.length < 250 && !line.includes(out.name || '___'));
      out.headline = (headlineMatch || '').trim().slice(0, 240) || null;

      // Location + followers via text mining the top card section
      const fullText = topCardText.replace(/\s+/g, ' ');
      const locMatch = fullText.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,3},\s*(?:[A-Z][a-z]+\s*,\s*)?[A-Z][a-z]+(?:\sStates|\sKingdom)?)/);
      out.location = locMatch ? locMatch[1].slice(0, 120) : null;
      const followerMatch = fullText.match(/([\d,]+)\s+followers?/i);
      out.followers = followerMatch ? followerMatch[1].replace(/,/g, '') : null;
      // Connection degree (1st / 2nd / 3rd)
      const degMatch = fullText.match(/·\s*(1st|2nd|3rd)\b/);
      out.connection_degree = degMatch ? degMatch[1] : null;

      // About section text (if visible)
      const aboutHeading = Array.from(document.querySelectorAll('main section')).find(s => /^About\b/i.test((s.querySelector('h2')||{}).textContent||''));
      if (aboutHeading) {
        const aboutText = (aboutHeading.innerText || '').replace(/^About\s*/i, '').trim();
        out.about = aboutText.slice(0, 2500);
      }

      // Recent activity link — separate URL we'll navigate to next
      const activityLink = Array.from(document.querySelectorAll('a')).find(a => /\/recent-activity\//.test(a.href || ''));
      out.activity_url = activityLink ? activityLink.href : null;
      return out;
    });

    // ── Pass 2: scroll main profile to lazy-load Activity section ────────
    // LinkedIn's /in/{user}/recent-activity/all/ URL redirects to authwall
    // for non-Premium scrapes — but the Activity preview embedded in the
    // main profile loads the most recent ~2-3 posts when scrolled to.
    let activityPosts = [];
    let activityUrl = profileData.activity_url || contact.linkedin_url.replace(/\/$/, '') + '/recent-activity/all/';
    try {
      // Scroll progressively to trigger lazy-loaded sections (Experience,
      // Education, Activity, Recommendations all load as you scroll past).
      for (let scroll = 0; scroll < 5; scroll++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(700);
      }
      // Then scroll to the Activity heading specifically if it exists
      await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('main section h2'));
        const actHeading = headings.find(h => /^Activity\b/i.test(h.textContent.trim()));
        if (actHeading) actHeading.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(1500);

      activityPosts = await page.evaluate(() => {
        // First find the Activity section by its h2
        const sections = Array.from(document.querySelectorAll('main section'));
        const actSection = sections.find(s => {
          const h2 = s.querySelector('h2');
          return h2 && /^Activity\b/i.test(h2.textContent.trim());
        });
        if (!actSection) return [];

        // Within the Activity section, find post-like elements. LinkedIn's
        // embedded activity preview uses different selectors than the full
        // activity feed.
        const cards = actSection.querySelectorAll(
          '[data-urn^="urn:li:activity"], [data-id^="urn:li:activity"], ' +
          '.feed-shared-update-v2, .occludable-update, ' +
          '.update-components-text, .update-components-actor__sub-description, ' +
          'article'
        );

        // De-duplicate by closest ancestor with the activity URN/id.
        const seen = new Set();
        const out = [];
        for (const card of cards) {
          // Find the URN/id by walking up
          let urn = null;
          let walker = card;
          while (walker && walker !== actSection) {
            urn = walker.getAttribute('data-urn') || walker.getAttribute('data-id');
            if (urn && urn.startsWith('urn:li:activity')) break;
            walker = walker.parentElement;
          }
          if (urn && seen.has(urn)) continue;
          if (urn) seen.add(urn);

          // Find the text content
          const root = walker && walker !== actSection ? walker : card;
          const textEl =
            root.querySelector('.update-components-text, .feed-shared-update-v2__commentary, .feed-shared-text') ||
            (card.matches('.update-components-text, .feed-shared-text') ? card : null);
          if (!textEl) continue;

          const timeEl = root.querySelector('time') || root.querySelector('.update-components-actor__sub-description span');
          const linkEl = root.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]') ||
                         (urn ? root.querySelector(`a[href*="${urn.split(':').pop()}"]`) : null);

          const summary = textEl.innerText.trim().slice(0, 700);
          if (!summary || summary.length < 20) continue;

          out.push({
            summary,
            ts: timeEl ? (timeEl.getAttribute('datetime') || timeEl.textContent.trim()) : null,
            url: linkEl ? linkEl.href : (urn ? `https://www.linkedin.com/feed/update/${urn}` : null),
          });
          if (out.length >= 15) break;
        }
        return out;
      });
    } catch (e) {
      if (VERBOSE) log(`activity scrape failed for ${contact.id}: ${e.message.slice(0, 160)}`);
    }

    scraped = {
      ok: true,
      name: profileData.name,
      headline: profileData.headline,
      location: profileData.location,
      followers: profileData.followers,
      connection_degree: profileData.connection_degree,
      about: profileData.about || null,
      recent_posts: activityPosts,
      profile_url: profileUrl,
      activity_url: activityUrl,
    };
  } catch (e) {
    if (VERBOSE) log(`scrape error for ${contact.id}: ${e.message.slice(0, 160)}`);
    scraped = { ok: false, reason: `scrape_error: ${e.message.slice(0, 200)}` };
  } finally {
    await cleanup();
  }
  return scraped;
}

/**
 * Build the Sonnet synthesis prompt — small, focused, voice-aligned.
 * Reuses the voice rules from network-enricher.mjs's _buildContactPrompt.
 */
function buildSynthesisPrompt(contact, scraped) {
  const cvSnippet = (() => {
    const cvPath = join(ROOT, 'cv.md');
    if (!existsSync(cvPath)) return '';
    try {
      // First 2000 chars of cv.md — gives Sonnet enough to pull a hook from
      return readFileSync(cvPath, 'utf8').slice(0, 2500);
    } catch { return ''; }
  })();

  return `# Role
You are synthesizing real authenticated-LinkedIn data into Mitchell Williams's relationship-intelligence card. Mitchell will read this and decide whether to DM today. Be specific. Be useful.

# About Mitchell
- **Enneagram 4w3 (98%) + INTJ-T (Turbulent 88%)** — values authenticity above all.
- CliftonStrengths: **Activator (#1) — wants the SPECIFIC step he takes this week.** Futuristic (#2). Positivity. Empathy. Focus.
- VIA: **Beauty & Excellence (#1)** — detects performed vs true at a sensory level.
- Communication: **Shared Vision 93** / **Concise Facts 7**. Lead with conclusion, then reasoning.
- DISC: DI (direct + decisive + persuasive).

# Mitchell's cv.md (first 2500 chars — pull a SPECIFIC hook from here, never paraphrase his metrics)
${cvSnippet}

# Contact
  Name: ${contact.name}
  Company: ${contact.company || '?'}
  Role on file: ${contact.position || '?'}
  Shared employers with Mitchell: ${(contact.overlap_with_mitchell || []).map(o => `${o.company} (${o.mitchell_years || '?'})`).join(', ') || 'none'}
  In active outreach: ${contact.in_outreach ? 'yes, status=' + (contact.outreach_status || '?') : 'no'}

# Scraped LinkedIn data (THIS IS GROUND TRUTH — cite specific posts via their URL)
${JSON.stringify(scraped, null, 2).slice(0, 6000)}

# Your output (STRICT JSON, no commentary, no markdown fences)
{
  "schema_version": 1,
  "engagement": {
    "linkedin_topics": ["short tag", ...],
    "linkedin_last_active": "YYYY-MM-DD" | null,
    "x_topics": [],
    "x_last_active": null,
    "recent_engaged_posts": [ { "url": "...", "ts": "YYYY-MM-DD" | null, "summary": "<=400 chars about what the post was about" } ]
  },
  "outreach_recommendation": {
    "positioning": "<=320 chars in Mitchell-voice — lead with the move, cite a SPECIFIC post or named team from the scrape, never generic",
    "best_channel": "linkedin_dm",
    "suggested_opening_lines": [ "<=160 chars, cites a specific post URL, never generic" ],
    "recommended_next_action": "<=200 chars — ONE concrete step Mitchell takes this week"
  },
  "inferred_relationship": {
    "arc": "<=240 char synthesis of their professional story arc and where it intersects with Mitchell",
    "why_we_might_connect_now": "<=240 chars citing TODAY's signal from the scraped posts — never a platitude",
    "shared_interests": ["short tag", ...]
  },
  "no_data_reason": null | "string — only if scrape returned 0 posts or empty"
}

# Voice rules
- Lead with the conclusion. Mitchell wants the move, then the reasoning.
- Cite SPECIFIC posts (URL + actual content from the scrape). "Worth a 20-min call about the X you posted on YYYY-MM-DD?" beats "I noticed your work on X."
- Kill list — never use: delve, leverage, synergy, tapestry, passionate, robust, comprehensive, "It's worth noting", exclamation marks, em-dashes (use parentheses or commas).
- One Mitchell-canonical hook per output. Pull from cv.md verbatim — don't paraphrase his metrics.
- Activator-friendly: recommended_next_action MUST be ONE specific thing he does this week, not "consider X".

# Authenticity gate (run before finalizing)
Would Mitchell instinctively trust this, or feel templated? If templated → rewrite. The output should reference at LEAST one specific URL from the scrape, at least one cv.md detail, and have NO kill-list words.

# Refuse-to-commit
If scraped.recent_posts is empty or scraped.ok is false → return JSON with all fields null/empty and a specific no_data_reason ("LinkedIn profile was visible but no public posts found in the last 90 days" or "scrape failed: " + scraped.reason). Better an honest gap than fabricated positioning.

Return the JSON now.`;
}

async function callSonnetSynthesis(prompt) {
  try {
    const r = await callAnthropicCached({
      model: 'claude-sonnet-4-6',
      systemPrompt: 'You synthesize authenticated LinkedIn scrape data into Mitchell-voice outreach recommendations. Return STRICT JSON. Never fabricate.',
      stableCorpus: [],
      varyingPrompt: prompt,
      maxTokens: 2000,
      caller: 'phase-B-prime-mechanical-enrich',
      signal: AbortSignal.timeout(120_000),
    });
    return { ok: true, content: r.content || '', costUsd: r.costUsd ?? 0, model: 'claude-sonnet-4-6' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function parseSynthesisJson(content) {
  const stripped = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(stripped); } catch { /* */ }
  const m = stripped.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function enrichOneContact(contact, session) {
  const t0 = Date.now();
  log(`enriching ${contact.name} (${contact.id})…`);

  // 1. Scrape LinkedIn (authenticated)
  const scraped = await scrapeLinkedinAuthenticated(contact, session);
  if (!scraped.ok) {
    log(`  scrape FAIL (${scraped.reason}) — writing no-data envelope`);
    const envelope = {
      schema_version: 1,
      id: contact.id,
      engagement: { linkedin_topics: [], linkedin_last_active: null, x_topics: [], x_last_active: null, recent_engaged_posts: [] },
      outreach_recommendation: { positioning: null, best_channel: 'unknown', suggested_opening_lines: [], recommended_next_action: null },
      inferred_relationship: { arc: null, why_we_might_connect_now: null, shared_interests: [] },
      no_data_reason: `Scrape failed: ${scraped.reason}`,
      source_urls: [],
      retrieved_at: new Date().toISOString(),
      model: 'playwright-scrape-only',
      verifier_passed: false,
      fields_populated: 0,
      cost_usd: 0,
      latency_ms: Date.now() - t0,
    };
    if (!existsSync(ENRICHMENT_CACHE_DIR)) mkdirSync(ENRICHMENT_CACHE_DIR, { recursive: true });
    writeFileSync(join(ENRICHMENT_CACHE_DIR, `${contact.id}.json`), JSON.stringify(envelope, null, 2));
    return { ok: false, contactId: contact.id, reason: scraped.reason, cost_usd: 0 };
  }

  log(`  scrape OK: ${(scraped.recent_posts || []).length} posts, headline="${(scraped.headline || '').slice(0, 60)}"`);

  // 2. Sonnet synthesis call
  const prompt = buildSynthesisPrompt(contact, scraped);
  const synth = await callSonnetSynthesis(prompt);
  if (!synth.ok) {
    log(`  synthesis FAIL: ${synth.error}`);
    return { ok: false, contactId: contact.id, error: synth.error, cost_usd: 0 };
  }
  const parsed = parseSynthesisJson(synth.content);
  if (!parsed) {
    log(`  synthesis returned unparseable JSON; raw preview: ${synth.content.slice(0, 200)}`);
    return { ok: false, contactId: contact.id, error: 'unparseable_synthesis_json', cost_usd: synth.costUsd };
  }

  // 3. Validate: did the synthesis actually cite a scrape URL?
  const scrapeUrls = new Set((scraped.recent_posts || []).map(p => p.url).filter(Boolean));
  const synthUrls = new Set();
  for (const p of (parsed.engagement?.recent_engaged_posts || [])) {
    if (p.url) synthUrls.add(p.url);
  }
  const verifierPassed = synthUrls.size > 0 && Array.from(synthUrls).some(u => scrapeUrls.has(u)) ||
    (parsed.no_data_reason && (scraped.recent_posts || []).length === 0);

  // 4. Write cache envelope
  const envelope = {
    ...parsed,
    schema_version: 1,
    id: contact.id,
    source_urls: Array.from(scrapeUrls),
    retrieved_at: new Date().toISOString(),
    model: 'playwright-scrape + claude-sonnet-4-6',
    verifier_passed: !!verifierPassed,
    fields_populated: _countPopulated(parsed),
    cost_usd: +(synth.costUsd || 0).toFixed(4),
    latency_ms: Date.now() - t0,
    diff_summary: 'initial',
  };
  if (!existsSync(ENRICHMENT_CACHE_DIR)) mkdirSync(ENRICHMENT_CACHE_DIR, { recursive: true });
  writeFileSync(join(ENRICHMENT_CACHE_DIR, `${contact.id}.json`), JSON.stringify(envelope, null, 2));

  log(`  OK (verifier=${envelope.verifier_passed ? 'PASS' : 'FAIL'}, cost=$${envelope.cost_usd}, fields=${envelope.fields_populated}, citations=${envelope.source_urls.length})`);
  return { ok: true, contactId: contact.id, cost_usd: envelope.cost_usd, fields_populated: envelope.fields_populated, verifier_passed: envelope.verifier_passed };
}

function _countPopulated(p) {
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

/**
 * Build the scrape session — prefers CDP-attached Chrome if available
 * (lets refresh-master fire autonomously without storage-state going
 * stale), falls back to storage-state mode if not.
 *
 * Returns { mode, session, dispose } where:
 *   - mode is 'cdp' or 'storage-state'
 *   - session.newPage() → { page, cleanup() } that scrapeLinkedinAuthenticated uses
 *   - dispose() tears down the browser/CDP connection at end of run
 */
async function buildScrapeSession() {
  const cdpUp = await isCdpAvailable();
  if (cdpUp) {
    log(`CDP detected at http://127.0.0.1:9222 — attaching to live Chrome (auth-fresh mode).`);
    const cdp = await connectToChromeCDP();
    const session = {
      mode: 'cdp',
      async newPage() {
        const page = await cdp.defaultContext.newPage();
        await page.setViewportSize({ width: 1280, height: 900 });
        return { page, cleanup: async () => { try { await page.close(); } catch { /* */ } } };
      },
    };
    return { mode: 'cdp', session, dispose: async () => { await cdp.disconnect(); } };
  }

  // Fallback: launch our own headless Chromium with storage-state.
  log(`CDP not detected — falling back to storage-state mode.`);
  if (!existsSync(STORAGE_STATE_PATH)) {
    throw new Error(`No CDP listener AND no storage-state at ${STORAGE_STATE_PATH}. Run \`node scripts/launch-debug-chrome.mjs\` first (recommended), or \`node scripts/scrape-contact-photo.mjs --setup-auth\` (legacy).`);
  }
  let chromium;
  try { chromium = (await import('playwright')).chromium; }
  catch { throw new Error('playwright not installed. Run `npm install playwright` first.'); }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: STORAGE_STATE_PATH,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  });
  const session = {
    mode: 'storage-state',
    async newPage() {
      const page = await ctx.newPage();
      return { page, cleanup: async () => { try { await page.close(); } catch { /* */ } } };
    },
  };
  return { mode: 'storage-state', session, dispose: async () => { await ctx.close(); await browser.close(); } };
}

async function main() {
  log(`═══ phase-B-prime start (TOP_N=${TOP_N}, COST_CAP=$${COST_CAP}, DRY_RUN=${DRY_RUN}, SINGLE=${SINGLE_CONTACT || 'none'}) ═══`);

  // Build candidate list
  let candidates;
  if (SINGLE_CONTACT) {
    const ranking = loadAndRank({ limit: 5000 });
    const c = ranking.ranked.find(r => r.contact.id === SINGLE_CONTACT);
    if (!c) { log(`HALT: contact "${SINGLE_CONTACT}" not in ranking.`); process.exit(4); }
    candidates = [c];
  } else {
    const ranking = loadAndRank({ limit: TOP_N + 50 });
    if (ranking.isPaused) {
      log(`HALT: pause_after_date=${ranking.pauseAfter} reached (auto-paused).`);
      process.exit(2);
    }
    // Skip already-cached contacts (resumable)
    candidates = ranking.ranked.filter(r => !existsSync(join(ENRICHMENT_CACHE_DIR, `${r.contact.id}.json`))).slice(0, TOP_N);
  }

  log(`candidates: ${candidates.length}`);
  log(`top-5 preview:`);
  for (const r of candidates.slice(0, 5)) {
    log(`  ${r.score.toFixed(3)} ${r.tier_boosted ? '★' : ' '} ${r.contact.name} ${r.contact.company} ${(r.contact.position || '').slice(0, 50)}`);
  }

  if (DRY_RUN) {
    log(`DRY-RUN — would enrich ${candidates.length} contacts at ~$0.05 each = ~$${(candidates.length * 0.05).toFixed(2)}`);
    return;
  }

  const state = loadState();
  state.refresh_history = state.refresh_history || {};
  state.refresh_history.contact_enrichment = state.refresh_history.contact_enrichment || {};

  // Build scrape session (CDP-attached if available, storage-state otherwise)
  let scrapeHandle;
  try {
    scrapeHandle = await buildScrapeSession();
  } catch (e) {
    log(`HALT: ${e.message}`);
    process.exit(2);
  }
  const { mode, session, dispose } = scrapeHandle;
  log(`scrape-session mode: ${mode}`);

  const minMsBetween = Math.max(50, Math.floor(60_000 / RATE_PER_MIN));
  let spent = 0;
  let ok = 0;
  let fail = 0;
  let i = 0;
  for (const r of candidates) {
    i++;
    if (spent >= COST_CAP) {
      log(`COST CAP REACHED ($${spent.toFixed(2)} >= $${COST_CAP}); halting at ${i - 1}/${candidates.length}`);
      break;
    }
    const t0 = Date.now();
    const result = await enrichOneContact(r.contact, session);
    const took = Date.now() - t0;
    if (result.ok) {
      ok++;
      spent += result.cost_usd || 0;
      state.spend_window_30d.push({ ts: ts(), usd: result.cost_usd || 0, cache: 'contact_enrichment', key: r.contact.id, provider: 'playwright+sonnet' });
      state.refresh_history.contact_enrichment[r.contact.id] = {
        lastRefreshedAt: ts(),
        lastAttemptedAt: TODAY,
        result: 'OK',
        verifier_passed: result.verifier_passed,
        fields_populated: result.fields_populated || 0,
        priority_score: r.score,
        signals: r.signals,
        cost_usd: result.cost_usd || 0,
        method: 'phase-B-prime-mechanical',
      };
    } else {
      fail++;
      state.refresh_history.contact_enrichment[r.contact.id] = {
        lastAttemptedAt: TODAY,
        result: 'ERROR',
        error: (result.error || result.reason || '').slice(0, 200),
        priority_score: r.score,
        method: 'phase-B-prime-mechanical',
      };
    }
    // Persist every 10
    if (i % 10 === 0) saveState(state);
    // Throttle
    const wait = Math.max(0, minMsBetween - took);
    if (wait > 0 && i < candidates.length) await new Promise(r2 => setTimeout(r2, wait));
  }
  saveState(state);
  await dispose();

  log(`═══ phase-B-prime complete ═══`);
  log(`  scrape mode: ${mode}`);
  log(`  enriched:    ${ok}/${candidates.length}`);
  log(`  failed:      ${fail}`);
  log(`  spent:       $${spent.toFixed(2)} / cap $${COST_CAP}`);
  log(`  cache:       ${ENRICHMENT_CACHE_DIR}`);
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
