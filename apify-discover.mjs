#!/usr/bin/env node
/**
 * apify-discover.mjs — Step 3b: Apify-based job discovery (local prototype).
 *
 * Calls three Apify actors (Seek, Indeed, Fantastic.jobs Workday) via the
 * run-sync-get-dataset-items endpoint, normalises each result into a
 * status='new' stub, deduplicates against existing Supabase active_roles /
 * seen_urls, and inserts survivors through the existing insertNewStubsCron
 * seam in queue-store.mjs.
 *
 * Usage:
 *   node apify-discover.mjs                        # dry-run (default — safe first run)
 *   node apify-discover.mjs --source seek          # dry-run, Seek actor only
 *   node apify-discover.mjs --source seek,indeed   # dry-run, two actors
 *   node apify-discover.mjs --apply                # write survivors to Supabase
 *   node apify-discover.mjs --source seek --apply  # single-actor live write
 *
 * Env vars required:
 *   APIFY_TOKEN                   — Apify personal API token
 *   SUPABASE_URL                  — for dedup query (cron role)
 *   SUPABASE_CRON_PUBLISHABLE_KEY — cron apikey header
 *   SUPABASE_CRON_JWT             — minted career_ops_cron JWT
 *
 * Role targeting:
 *   Post-fetch, every stub is gated through the canonical title_filter from
 *   portals.yml (same buildTitleFilter() used by scan.mjs).  Override path via
 *   CAREER_OPS_PORTALS env var.  Fantastic's server-side titleExclusionSearch
 *   is derived from the same portals.yml negative list.
 *
 * Zero model tokens — pure HTTP + JSON.
 */

import 'dotenv/config';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import yaml from 'js-yaml';

import { insertNewStubsCron, loadQueueSeenSets } from './queue-store.mjs';
import { isSupabaseConfigured } from './supabase-client.mjs';
import { fetchJson } from './providers/_http.mjs';
import { buildTitleFilter } from './scan.mjs';

// ── CLI flags ──────────────────────────────────────────────────────────────────

const APPLY   = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

// --source seek           → run seek only
// --source seek,indeed    → run seek + indeed
// (omitted)               → run all three
const SOURCE_ARG = (() => {
  const idx = process.argv.indexOf('--source');
  if (idx === -1) return null;
  return (process.argv[idx + 1] ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
})();

// ── Constants ─────────────────────────────────────────────────────────────────

// Discovery search-query seeds. Source of truth: config/profile.yml
// target_roles.primary + the Data Scientist archetype. Keep in sync.
const TITLES = [
  'data analyst',
  'data engineer',
  'analytics engineer',
  'business intelligence analyst',
  'data scientist',
  'forward deployed engineer',
];

// Apify run-sync can take several minutes for large actors (Fantastic 200-job min).
const ACTOR_RUN_TIMEOUT_MS = 300_000;

// ── Canonical title filter ────────────────────────────────────────────────────

/**
 * Load the canonical role filter from portals.yml — identical to the gate that
 * scan.mjs applies to every ATS/search result.  Returns:
 *   filter(title) → boolean   post-fetch gate for all stubs
 *   negative[]                raw negative keyword list for Fantastic's
 *                             server-side titleExclusionSearch
 *
 * Throws if portals.yml is absent or unreadable.  The caller decides the
 * fail policy: fail closed under --apply, fail open (with a warning) on
 * dry-runs.  This mirrors the Supabase-dedup pattern in main().
 */
function loadTitleFilter() {
  const portalsPath = process.env.CAREER_OPS_PORTALS || 'portals.yml';
  const cfg = yaml.load(readFileSync(portalsPath, 'utf-8')) || {};
  const tf  = cfg.title_filter || {};
  return { filter: buildTitleFilter(tf), negative: tf.negative || [] };
}

// ── Apify transport ───────────────────────────────────────────────────────────

function apifyToken() {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new Error('APIFY_TOKEN is not set; add it to .env');
  return token;
}

/**
 * Run an Apify actor synchronously and return the dataset items.
 *
 * @param {string} actorId  — e.g. 'blackfalcondata/seek-scraper'
 * @param {object} input    — actor input object
 * @param {string} token    — Apify API token
 * @returns {Promise<object[]>}
 */
async function runApifyActor(actorId, input, token) {
  // PostgREST uses '~' as the namespace separator in run-sync endpoint paths.
  const slug = actorId.replace('/', '~');
  const url  = `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items`;

  const items = await fetchJson(url, {
    method:    'POST',
    headers:   {
      'Authorization':  `Bearer ${token}`,
      'Content-Type':   'application/json',
    },
    body:      JSON.stringify(input),
    timeoutMs: ACTOR_RUN_TIMEOUT_MS,
  });

  return Array.isArray(items) ? items : [];
}

// ── Stub helpers ──────────────────────────────────────────────────────────────

/** Stable, source-tagged ID from a canonical URL. */
function stubId(source, url) {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `${source}:${hash}`;
}

/**
 * Build a normalised status='new' stub ready for insertNewStubsCron.
 * `posted_at` and `valid_through` are in-memory only — no DB columns exist for
 * them yet. splitRoleForPersistence in queue-store.mjs will silently drop them.
 */
function makeStub({ source, title, url, company, location, posted_at, valid_through }) {
  return {
    id:            stubId(source, url),
    company:       company || '',
    title:         title   || '',
    url,
    ats:           'custom',
    source,
    location:      location    || '',
    posted_at:     posted_at   ?? null,   // informational; dropped on Supabase insert
    valid_through: valid_through ?? null, // informational; dropped on Supabase insert
    status:        'new',
  };
}

// ── Actor 1: Seek ─────────────────────────────────────────────────────────────

/**
 * blackfalcondata/seek-scraper
 *
 * The actor's `query` field accepts a string only (not an array), so we run
 * once per title and merge — same pattern as fetchIndeed below.
 * Incremental mode with a per-title stateKey tracks what was already emitted;
 * changeType NEW or REAPPEARED are the only accepted records.
 */
async function fetchSeek(token) {
  const stubs = [];

  for (const title of TITLES) {
    const items = await runApifyActor('blackfalcondata/seek-scraper', {
      query:           title,
      country:         'AU',
      location:        'Melbourne VIC',
      dateRange:       '1',
      maxResults:      20,
      compact:         true,
      includeDetails:  false,
      incrementalMode: true,
      // Unique stateKey per title so incremental state is tracked per query.
      stateKey:        `careerops-seek-melbourne-${title.replace(/\s+/g, '-')}`,
    }, token);

    for (const item of items) {
      // Skip records not flagged as new/reappeared — including missing changeType (strict per spec).
      const ct = (item.changeType ?? '').toUpperCase();
      if (ct !== 'NEW' && ct !== 'REAPPEARED') continue;
      if (!item.canonicalUrl) continue;

      stubs.push(makeStub({
        source:        'seek',
        title:         item.title         ?? '',
        url:           item.canonicalUrl,
        company:       item.company       ?? '',
        location:      item.location      ?? '',
        posted_at:     item.postedDate    ?? null,
        valid_through: item.validThrough  ?? null,
      }));
    }
  }
  return stubs;
}

// ── Actor 2: Indeed ───────────────────────────────────────────────────────────

/**
 * automation-lab/indeed-scraper
 *
 * Runs once per title and merges; keeps URL as the dedup key.
 */
async function fetchIndeed(token) {
  const stubs = [];

  for (const title of TITLES) {
    const items = await runApifyActor('automation-lab/indeed-scraper', {
      query:              title,
      location:           'Melbourne VIC',
      country:            'AU',
      datePosted:         '1',   // "1" = last 24 hours (actor enum: "", "1", "3", "7", "14")
      maxItems:           20,
      includeDescription: false,
    }, token);

    for (const item of items) {
      if (!item.jobUrl) continue;
      stubs.push(makeStub({
        source:        'indeed',
        title:         item.title    ?? '',
        url:           item.jobUrl,
        company:       item.company  ?? '',
        location:      item.location ?? '',
        posted_at:     item.datePosted ?? null,
        valid_through: null,
      }));
    }
  }

  return stubs;
}

// ── Actor 3: Fantastic.jobs Workday API ───────────────────────────────────────

/**
 * fantastic-jobs/workday-jobs-api
 *
 * Minimum 200 jobs per run — intentionally weekly cadence, not daily.
 * Running it daily would waste Apify credits for diminishing returns.
 * Schedule this actor separately (weekly) once the prototype is promoted to cron.
 */
async function fetchFantastic(token, exclusions = []) {
  const items = await runApifyActor('fantastic-jobs/workday-jobs-api', {
    titleSearch:           TITLES,
    locationSearch:        ['Melbourne'],  // actor requires an array
    maxJobs:               200,
    descriptionType:       'text',
    aiTaxonomiesFilter:    ['Data & Analytics'],
    aiExperienceLevelFilter: ['0-2', '2-5'],
    // Derived from portals.yml title_filter.negative.  The caller omits
    // whitespace-sensitive entries here; the post-fetch title filter handles
    // those so Fantastic cannot over-exclude matches like "JavaScript".
    titleExclusionSearch:  exclusions,
    removeAgency:          true,
  }, token);

  const stubs = [];
  for (const item of items) {
    if (!item.url) continue;

    const location = Array.isArray(item.locations_derived)
      ? item.locations_derived.join(', ')
      : (item.locations_derived ?? '');

    stubs.push(makeStub({
      source:        'fantastic-ats',
      title:         item.title        ?? '',
      url:           item.url,
      company:       item.organization ?? '',
      location,
      posted_at:     item.date_posted         ?? null,
      valid_through: item.date_valid_through  ?? null,
    }));
  }
  return stubs;
}

// ── Dedup helpers ─────────────────────────────────────────────────────────────

/**
 * Dedup stubs by url and company::title in a single pass, seeded from existing
 * Supabase sets (mirrors queue-ingest.mjs cron-mode dedup behaviour).
 *
 * `existing.urls` and `existing.companyRoles` are the Sets returned by
 * loadQueueSeenSets — pass empty Sets when dedup could not be loaded.
 *
 * Limitation: raw scraped titles vary in formatting across boards (e.g. "Data
 * Analyst" vs "Data Analyst (Hybrid)"), so company::title catches exact matches
 * only. Imperfect but strictly better than url-only and consistent with the
 * existing queue path.
 *
 * @param {object[]} stubs
 * @param {{ urls: Set<string>, companyRoles: Set<string> }} existing
 * @returns {object[]}
 */
function dedupStubs(stubs, { urls = new Set(), companyRoles = new Set() } = {}) {
  const seenUrls = new Set(urls);
  const seenCR   = new Set(companyRoles);
  const out = [];
  for (const stub of stubs) {
    if (!stub.url) continue;
    if (seenUrls.has(stub.url)) continue;
    const crKey = `${(stub.company ?? '').toLowerCase()}::${(stub.title ?? '').toLowerCase()}`;
    if (crKey !== '::' && seenCR.has(crKey)) continue;
    seenUrls.add(stub.url);
    if (crKey !== '::') seenCR.add(crKey);
    out.push(stub);
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const ALL_SOURCES = [
  { name: 'seek',         fetch: fetchSeek      },
  { name: 'indeed',       fetch: fetchIndeed     },
  { name: 'fantastic-ats', fetch: fetchFantastic },
];

async function main() {
  // Pre-flight: refuse to run --apply when cron Supabase creds are absent.
  // Checked here so we don't pay for Apify actor runs we can't persist.
  if (APPLY && !isSupabaseConfigured('cron')) {
    throw new Error(
      'Supabase cron credentials are not configured ' +
      '(SUPABASE_URL / SUPABASE_CRON_PUBLISHABLE_KEY / SUPABASE_CRON_JWT). ' +
      'Set them in .env or run without --apply for a dry-run.',
    );
  }

  const token = apifyToken();

  // Load canonical role filter from portals.yml — same gate as scan.mjs.
  // Fail closed under --apply (throw before any Apify fetch); warn + pass-through on dry-run.
  let titleFilter = () => true;
  let negative    = [];
  try {
    ({ filter: titleFilter, negative } = loadTitleFilter());
  } catch (err) {
    if (APPLY) {
      throw new Error(`Cannot load portals.yml title_filter — refusing --apply without role gating (${err.message})`);
    }
    console.warn(`  ⚠️  Could not load title_filter (${err.message}) — no title gating applied (dry-run only)`);
  }

  // Fantastic server-side titleExclusionSearch: canonical negatives MINUS any
  // whitespace-sensitive entries ("Java ", "SAP ", "VP ").  Those rely on a
  // trailing-space substring trick that Fantastic's server-side matcher would
  // not honour — a plain "Java" substring would drop "JavaScript Data Engineer".
  // The post-fetch buildTitleFilter gate enforces them correctly instead.
  const fantasticExclusions = negative.filter(s => typeof s === 'string' && s === s.trim() && s.length > 0);

  // Which sources to run this invocation?
  const sources = SOURCE_ARG
    ? ALL_SOURCES.filter(s => SOURCE_ARG.includes(s.name))
    : ALL_SOURCES;

  if (sources.length === 0) {
    console.error(`--source filter matched no known sources. Valid values: ${ALL_SOURCES.map(s => s.name).join(', ')}`);
    process.exit(1);
  }

  if (DRY_RUN) console.log('Apify discover (dry run — pass --apply to write to Supabase)\n');
  else          console.log('Apify discover (--apply — writing survivors to Supabase)\n');

  // ── 1. Fetch each actor; failures are isolated ─────────────────────────────

  const allStubs      = [];
  const fetchedCount  = {};

  for (const src of sources) {
    try {
      console.log(`  Fetching ${src.name}…`);
      const stubs = await src.fetch(token, fantasticExclusions);
      fetchedCount[src.name] = stubs.length;
      allStubs.push(...stubs);
      console.log(`    → ${stubs.length} raw record(s)`);
    } catch (err) {
      fetchedCount[src.name] = 0;
      console.warn(`  ⚠️  ${src.name} actor failed: ${err.message}`);
    }
  }

  // ── 1b. Gate on canonical title_filter (portals.yml) ──────────────────────
  // Applied post-fetch across all sources — identical to scan.mjs behaviour.
  // Seek/Indeed had no negative filter before; now all three are consistent.

  const onTarget        = allStubs.filter(s => titleFilter(s.title || ''));
  const droppedByFilter = allStubs.length - onTarget.length;
  if (droppedByFilter > 0) {
    console.log(`  → ${droppedByFilter} off-target stub(s) dropped by title_filter`);
  }

  // ── 2 + 3. Dedup intra-run and against Supabase (active_roles + seen_urls) ──
  // Single dedupStubs pass seeded with the existing url/companyRole sets from
  // Supabase.  Fail-closed: if --apply and dedup cannot load, throw rather than
  // silently writing without it (the url unique index on active_roles does NOT
  // block a URL in seen_urls that was already evicted from active_roles).

  let existingSeen = { urls: new Set(), companyRoles: new Set() };
  try {
    const seen = loadQueueSeenSets({ roles: [] }, { role: 'cron' });
    existingSeen = { urls: seen.urls, companyRoles: seen.companyRoles };
  } catch (err) {
    if (APPLY) {
      throw new Error(`Cannot load Supabase dedup sets — refusing --apply without dedup (${err.message})`);
    }
    console.warn(`  ⚠️  Could not load existing seen sets (${err.message}) — skipping cloud dedup (dry-run only)`);
  }

  const survivors = dedupStubs(onTarget, existingSeen);

  // ── 4. Group survivors by source for per-source reporting ─────────────────

  const bySource = {};
  for (const src of sources) bySource[src.name] = [];
  for (const stub of survivors) {
    if (bySource[stub.source]) bySource[stub.source].push(stub);
  }

  // ── 5. Insert (--apply only) ───────────────────────────────────────────────

  const insertedCount = {};
  for (const src of sources) insertedCount[src.name] = 0;

  let insertFailures = 0;

  if (!DRY_RUN) {
    for (const src of sources) {
      const group = bySource[src.name];
      if (group.length === 0) continue;
      try {
        const { inserted } = await insertNewStubsCron(group);
        insertedCount[src.name] = inserted;
      } catch (err) {
        insertFailures++;
        console.warn(`  ⚠️  Insert failed for ${src.name}: ${err.message}`);
      }
    }
  }

  // ── 6. Summary ────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`Apify Discover — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`${'─'.repeat(52)}`);
  console.log(`${'Source'.padEnd(16)} ${'Fetched'.padStart(7)} ${'After dedup'.padStart(11)} ${'Inserted / Would'.padStart(17)}`);
  console.log(`${'─'.repeat(52)}`);

  let totalFetched = 0, totalSurvivors = 0, totalInserted = 0;
  for (const src of sources) {
    const f  = fetchedCount[src.name]  ?? 0;
    const s  = (bySource[src.name]     ?? []).length;
    const i  = DRY_RUN ? `would insert ${s}` : `${insertedCount[src.name]} inserted`;
    console.log(`${src.name.padEnd(16)} ${String(f).padStart(7)} ${String(s).padStart(11)}   ${i}`);
    totalFetched    += f;
    totalSurvivors  += s;
    totalInserted   += insertedCount[src.name];
  }

  console.log(`${'─'.repeat(52)}`);
  const totalInsertedStr = DRY_RUN ? `would insert ${totalSurvivors}` : `${totalInserted} inserted`;
  console.log(`${'TOTAL'.padEnd(16)} ${String(totalFetched).padStart(7)} ${String(totalSurvivors).padStart(11)}   ${totalInsertedStr}`);

  if (DRY_RUN) {
    console.log(`\n→ Dry run complete. Re-run with --apply to write to Supabase.`);
  } else {
    console.log(`\n→ Done. New stubs are in Supabase active_roles (status='new').`);
    console.log(`  Next: /career-ops queue  to score them.`);
    if (insertFailures > 0) {
      // Set nonzero exit so cron/automation sees a red run rather than a false green.
      // Use process.exitCode (not process.exit) so the summary above flushes first.
      console.error(`\n⚠️  ${insertFailures} source(s) failed to insert — exiting nonzero.`);
      process.exitCode = 1;
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
