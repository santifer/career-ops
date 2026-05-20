#!/usr/bin/env node

/**
 * scan-vc-portfolios.mjs — VC portfolio job-board scanner (P1-2).
 *
 * VC portfolio boards are an EARLY-SIGNAL discovery channel: ~25% of portfolio
 * companies post here before their own ATS goes live. This scraper iterates the
 * firms declared in config/vc-portfolios.yml and writes title-matching, location-
 * matching, deduplicated jobs to data/pipeline.md + data/scan-history.tsv —
 * exactly the same surface scan.mjs writes to, so the downstream pipeline (triage
 * → eval → batch) consumes VC findings indistinguishably from native ATS scans.
 *
 * Currently implemented platforms (verified live on 2026-05-19):
 *   - getro    — Accel, Insight Partners, Khosla Ventures (3 firms, ~46k jobs)
 *
 * Declared but disabled (Phase 2):
 *   - consider — a16z, Sequoia, Greylock, Lightspeed, Bessemer, NEA. Endpoint
 *                works in a real browser but Cloudflare tarpits curl/fetch;
 *                needs CDP-attached Playwright. Each firm's row in the config
 *                has `enabled: false` + `skip_reason: needs_playwright`.
 *   - indexvc  — Index Ventures uses a custom Vue + Elasticsearch backend on
 *                www.indexventures.com/startup-jobs. API not yet mapped.
 *
 * Incremental scraping: each firm's most-recent created_at is persisted to
 * data/vc-portfolios-state.json. Subsequent runs stop paginating as soon as
 * they hit a job older than the persisted timestamp.
 *
 * Hang-prevention per global rules: every fetch uses AbortSignal.timeout via
 * lib/fetch-utils.mjs::fetchWithTimeout. Exp backoff on HTTP 429 (capped).
 * Hard ceiling of 50 pages per firm per scrape.
 *
 * Usage:
 *   node scripts/scan-vc-portfolios.mjs              # scan all enabled firms
 *   node scripts/scan-vc-portfolios.mjs --dry-run    # preview without writing
 *   node scripts/scan-vc-portfolios.mjs --firm accel # scan a single firm
 *   node scripts/scan-vc-portfolios.mjs --full       # ignore state, full scan
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';

import { buildTitleFilter } from '../scan.mjs';
import { fetchWithTimeout, poolMap } from '../lib/fetch-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

// Resolve relative to REPO_ROOT so the script works from any cwd (matters for
// the launchd job which sets WorkingDirectory but worktrees may differ).
const VC_CONFIG_PATH    = path.join(REPO_ROOT, 'config/vc-portfolios.yml');
const PORTALS_PATH      = path.join(REPO_ROOT, 'portals.yml');
const PIPELINE_PATH     = path.join(REPO_ROOT, 'data/pipeline.md');
const SCAN_HISTORY_PATH = path.join(REPO_ROOT, 'data/scan-history.tsv');
const APPLICATIONS_PATH = path.join(REPO_ROOT, 'data/applications.md');
const STATE_PATH        = path.join(REPO_ROOT, 'data/vc-portfolios-state.json');

const FIRM_CONCURRENCY = 3;          // Politeness — 3 firms in flight at most
const GLOBAL_HARD_TIMEOUT_MS = 5 * 60_000;  // Whole-run guardrail

// ── Args ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    dryRun: args.includes('--dry-run'),
    full: args.includes('--full'),
    firm: null,
  };
  const fi = args.indexOf('--firm');
  if (fi !== -1) out.firm = (args[fi + 1] || '').toLowerCase();
  return out;
}

// ── Config + state ──────────────────────────────────────────────────

function loadVcConfig() {
  if (!existsSync(VC_CONFIG_PATH)) {
    throw new Error(`Missing ${VC_CONFIG_PATH}`);
  }
  const raw = yaml.load(readFileSync(VC_CONFIG_PATH, 'utf-8'));
  const defaults = raw.defaults || {};
  const firms = (raw.firms || []).map(f => ({ ...defaults, ...f }));
  return { defaults, firms };
}

function loadPortalsFilters() {
  if (!existsSync(PORTALS_PATH)) {
    console.error(`⚠️  ${PORTALS_PATH} not found — using no title filter (everything passes).`);
    return { titleFilter: () => true, locationFilter: () => true };
  }
  const portals = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const titleFilter = buildTitleFilter(portals.title_filter);
  const locationFilter = buildLocationFilter(portals.location_filter);
  return { titleFilter, locationFilter };
}

// Re-implements scan.mjs's internal buildLocationFilter (not exported there).
// Same semantics: empty location passes; block beats allow; empty allow passes.
function buildLocationFilter(locationFilter) {
  if (!locationFilter) return () => true;
  const allow = (locationFilter.allow || []).map(k => k.toLowerCase());
  const block = (locationFilter.block || []).map(k => k.toLowerCase());
  return (location) => {
    if (!location) return true;
    const lower = String(location).toLowerCase();
    if (block.length > 0 && block.some(k => lower.includes(k))) return false;
    if (allow.length === 0) return true;
    return allow.some(k => lower.includes(k));
  };
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { firms: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch (err) {
    console.error(`⚠️  Corrupt ${STATE_PATH} (${err.message}) — starting fresh`);
    return { firms: {} };
  }
}

function saveState(state) {
  mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

// ── Dedup ───────────────────────────────────────────────────────────
// Mirrors scan.mjs::loadSeenUrls. URLs seen anywhere in the existing system
// (history TSV, pending pipeline lines, processed applications) are skipped.

function loadSeenUrls() {
  const seen = new Set();
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const m of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) seen.add(m[1]);
  }
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const m of text.matchAll(/https?:\/\/[^\s|)]+/g)) seen.add(m[0]);
  }
  return seen;
}

// ── Writers (match scan.mjs format exactly) ─────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0 || !existsSync(PIPELINE_PATH)) return;
  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  // Format includes a trailing source annotation so a human reader can see
  // "this surfaced via the a16z board" without grepping scan-history.tsv.
  const fmt = o => `- [ ] ${o.url} | ${o.company} | ${o.title} | via ${o.vc_name}`;
  if (idx === -1) {
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(fmt).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;
    const block = '\n' + offers.map(fmt).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }
  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  mkdirSync(path.dirname(SCAN_HISTORY_PATH), { recursive: true });
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(
      SCAN_HISTORY_PATH,
      'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n',
      'utf-8',
    );
  }
  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded\t${o.location || ''}`,
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Platform: Getro ─────────────────────────────────────────────────

const GETRO_ENDPOINT = (id) => `https://api.getro.com/api/v2/collections/${id}/search/jobs`;

async function fetchGetroPage(firm, page) {
  const url = GETRO_ENDPOINT(firm.collection_id);
  const body = JSON.stringify({ page, per_page: firm.per_page, sort: '-created_at' });

  // Exp backoff on 429. Other non-2xx statuses fail-fast — the firm-level
  // try/catch in scanFirm() turns that into a per-firm error row.
  let attempt = 0;
  while (true) {
    const r = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body,
      },
      firm.fetch_timeout_ms,
    );
    if (r.ok) {
      try {
        return JSON.parse(r.text);
      } catch (err) {
        throw new Error(`getro: ${firm.id} page ${page} returned non-JSON (${err.message})`);
      }
    }
    if (r.status === 429 && attempt < firm.retry_on_429) {
      const delay = firm.retry_base_ms * (2 ** attempt);
      attempt++;
      await new Promise(res => setTimeout(res, delay));
      continue;
    }
    throw new Error(`getro: ${firm.id} page ${page} HTTP ${r.status}`);
  }
}

// Normalise a Getro job into the {title, url, company, location, created_at}
// shape the rest of the scanner expects.
function normaliseGetroJob(j) {
  return {
    title:      j.title || '',
    url:        j.url || '',
    company:    j.organization?.name || '',
    location:   (j.locations && j.locations[0]) || j.searchable_locations?.[0] || '',
    created_at: j.created_at || 0,
  };
}

// ── Per-firm scan ───────────────────────────────────────────────────

async function scanFirm(firm, state, filters) {
  const { titleFilter, locationFilter } = filters;
  const lastSeen = state.firms[firm.id]?.last_seen_created_at ?? 0;
  const args = parseArgs();

  // Cutoff timestamp (unix seconds). On first run / --full, use the freshness
  // window. Otherwise resume from the persisted last_seen.
  const windowSecs = firm.freshness_window_days * 24 * 60 * 60;
  const fallbackCutoff = Math.floor(Date.now() / 1000) - windowSecs;
  const cutoff = args.full ? fallbackCutoff : Math.max(lastSeen, fallbackCutoff);

  const summary = {
    firm: firm.id,
    name: firm.name,
    pages_fetched: 0,
    raw_jobs: 0,
    after_cutoff: 0,
    title_pass: 0,
    location_pass: 0,
    new_offers: [],
    total_advertised: null,
    max_created_at: lastSeen,
    error: null,
    skipped: false,
  };

  if (!firm.enabled) {
    summary.skipped = true;
    summary.error = `skipped: ${firm.skip_reason || 'enabled=false'}`;
    return summary;
  }

  if (firm.platform !== 'getro') {
    summary.skipped = true;
    summary.error = `unsupported platform "${firm.platform}" — only getro is wired up`;
    return summary;
  }

  try {
    for (let page = 1; page <= firm.max_pages; page++) {
      const data = await fetchGetroPage(firm, page);
      summary.pages_fetched++;
      if (summary.total_advertised === null) {
        summary.total_advertised = data?.results?.count ?? null;
      }
      const jobs = (data?.results?.jobs || []).map(normaliseGetroJob);
      summary.raw_jobs += jobs.length;

      if (jobs.length === 0) break;

      // Track newest created_at seen so we can persist state at end.
      for (const j of jobs) {
        if (j.created_at > summary.max_created_at) summary.max_created_at = j.created_at;
      }

      let hitStaleCount = 0;
      for (const j of jobs) {
        if (j.created_at <= cutoff) {
          // Continue scanning the page (jobs sort by -created_at but some
          // tied timestamps can interleave), but if the WHOLE page is stale
          // we're done.
          hitStaleCount++;
          continue;
        }
        summary.after_cutoff++;

        if (!titleFilter(j.title)) continue;
        summary.title_pass++;

        if (!locationFilter(j.location)) continue;
        summary.location_pass++;

        summary.new_offers.push({
          ...j,
          vc_id: firm.id,
          vc_name: firm.name,
          source: `vc-portfolio:${firm.id}-${firm.platform}`,
        });
      }

      // Stop paginating once the entire page is stale — no point fetching
      // the next 49 pages of jobs we've already seen.
      if (hitStaleCount === jobs.length) break;

      // Politeness pause unless this is the last allowed page.
      if (page < firm.max_pages) {
        await new Promise(res => setTimeout(res, firm.page_delay_ms));
      }
    }
  } catch (err) {
    summary.error = err.message;
  }

  return summary;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  // Global hard timeout — surrounds the whole run so a wedged firm can't
  // freeze a launchd job indefinitely (matches the global hang-prevention
  // policy: every long-running script needs a top-level deadline).
  const globalDeadline = setTimeout(() => {
    console.error(`Fatal: global timeout after ${GLOBAL_HARD_TIMEOUT_MS}ms — forcing exit`);
    process.exit(2);
  }, GLOBAL_HARD_TIMEOUT_MS);
  globalDeadline.unref();

  const { firms } = loadVcConfig();
  const filters = loadPortalsFilters();
  const state = loadState();
  const seen = loadSeenUrls();
  const date = new Date().toISOString().slice(0, 10);

  // Per-firm filter (--firm flag) is applied BEFORE the enabled gate so the
  // user can re-enable a single firm at runtime by editing the YAML and
  // re-running with --firm.
  let targets = firms;
  if (args.firm) targets = targets.filter(f => f.id.toLowerCase() === args.firm);

  if (targets.length === 0) {
    console.error('No firms matched. Check --firm flag or config/vc-portfolios.yml');
    process.exit(1);
  }

  console.log(`VC Portfolio Scan — ${date}`);
  console.log(`Firms in scope: ${targets.length} (${targets.filter(f => f.enabled).length} enabled)`);
  if (args.dryRun) console.log('(--dry-run — no writes will happen)');
  if (args.full)   console.log('(--full — ignoring incremental state)');
  console.log();

  const summaries = await poolMap(targets, f => scanFirm(f, state, filters), FIRM_CONCURRENCY);

  // Aggregate + dedupe across firms (a job might appear on multiple VC boards
  // if a portfolio company is co-invested).
  const newOffers = [];
  for (const s of summaries) {
    for (const o of s.new_offers) {
      if (seen.has(o.url)) continue;
      seen.add(o.url);
      newOffers.push(o);
    }
  }

  // Write outputs.
  if (!args.dryRun) {
    if (newOffers.length > 0) {
      if (!existsSync(PIPELINE_PATH)) {
        console.error(`⚠️  ${PIPELINE_PATH} missing — creating minimal scaffold`);
        mkdirSync(path.dirname(PIPELINE_PATH), { recursive: true });
        writeFileSync(PIPELINE_PATH, '# Pipeline\n\n## Pendientes\n\n## Procesadas\n', 'utf-8');
      }
      appendToPipeline(newOffers);
      appendToScanHistory(newOffers, date);
    }

    // Persist state per firm — track the newest created_at observed AND only
    // if the firm scan actually advanced (no error mid-run, or partial
    // progress where we still got at least one page).
    let stateChanged = false;
    for (const s of summaries) {
      if (s.skipped) continue;
      if (s.pages_fetched === 0) continue;
      if (s.max_created_at && s.max_created_at > (state.firms[s.firm]?.last_seen_created_at ?? 0)) {
        state.firms[s.firm] = {
          last_seen_created_at: s.max_created_at,
          last_run: new Date().toISOString(),
          last_run_pages: s.pages_fetched,
          last_run_offers: s.new_offers.length,
        };
        stateChanged = true;
      }
    }
    if (stateChanged) saveState(state);
  }

  // Print summary.
  console.log('─'.repeat(60));
  for (const s of summaries) {
    const status = s.error ? `✗ ${s.error}` : 'ok';
    console.log(
      `${s.firm.padEnd(11)} pages=${String(s.pages_fetched).padStart(2)}  raw=${String(s.raw_jobs).padStart(4)}  ` +
      `fresh=${String(s.after_cutoff).padStart(3)}  title=${String(s.title_pass).padStart(3)}  ` +
      `loc=${String(s.location_pass).padStart(3)}  new=${String(s.new_offers.length).padStart(3)}  ${status}`,
    );
  }
  console.log('─'.repeat(60));
  console.log(`New offers added: ${newOffers.length}${args.dryRun ? ' (dry run, not written)' : ''}`);

  if (newOffers.length > 0 && !args.dryRun) {
    console.log('\nFirst 10 new offers:');
    for (const o of newOffers.slice(0, 10)) {
      console.log(`  + ${o.company.padEnd(28).slice(0, 28)} ${o.title.slice(0, 60)}`);
    }
    if (newOffers.length > 10) console.log(`  ... ${newOffers.length - 10} more`);
  }

  // Exit code reflects whether ALL enabled firms succeeded — useful for
  // monitoring via launchd's stderr log.
  const failedEnabled = summaries.filter(s => !s.skipped && s.error).length;
  if (failedEnabled > 0) {
    console.error(`\n${failedEnabled} enabled firm(s) failed — see errors above`);
    process.exit(1);
  }
}

const __isEntry = import.meta.url === `file://${process.argv[1]}`;
if (__isEntry) {
  main().catch(err => {
    console.error('Fatal:', err.stack || err.message);
    process.exit(1);
  });
}

// Exports for unit testing.
export { fetchGetroPage, normaliseGetroJob, buildLocationFilter, scanFirm };
