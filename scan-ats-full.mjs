#!/usr/bin/env node

/**
 * scan-ats-full.mjs — Reverse ATS discovery scanner. Part of #230.
 *
 * Where scan.mjs scans the companies you track in portals.yml, this script
 * inverts the direction: it walks public directories of companies per ATS
 * (Greenhouse, Lever, Ashby, Workday) and surfaces fresh postings that match
 * your portals.yml `title_filter` / `location_filter` — no manual company
 * curation needed.
 *
 * Company directories come from the public job-board-aggregator dataset
 * (github.com/Feashliaa/job-board-aggregator), cached in data/cache/ for 24h.
 *
 * Zero LLM tokens — pure HTTP + JSON, same providers/ modules as scan.mjs.
 * Postings without a usable publish date are skipped: a reverse scan is only
 * useful for fresh postings, and stale results would flood the pipeline.
 *
 * Usage:
 *   node scan-ats-full.mjs                      # scan all ATS directories, last 3 days
 *   node scan-ats-full.mjs --since 7            # postings from the last 7 days
 *   node scan-ats-full.mjs --ats greenhouse,workday  # subset of sources
 *   node scan-ats-full.mjs --limit 200          # max companies per ATS (default: all)
 *   node scan-ats-full.mjs --dry-run            # preview without writing files
 *   node scan-ats-full.mjs --liveness           # Playwright-verify matches before writing
 *   node scan-ats-full.mjs --verbose            # log per-board fetch failures
 *   node scan-ats-full.mjs --md-out <dir>       # also write a dated markdown digest to <dir>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import yaml from 'js-yaml';

import { makeHttpCtx, fetchJson } from './providers/_http.mjs';
import greenhouse from './providers/greenhouse.mjs';
import lever from './providers/lever.mjs';
import ashby from './providers/ashby.mjs';
import workday from './providers/workday.mjs';
import { buildTitleFilter, buildLocationFilter, loadSeenUrls, appendToPipeline, appendToScanHistory } from './scan.mjs';

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = process.env.CAREER_OPS_PORTALS || 'portals.yml';
const PIPELINE_PATH = 'data/pipeline.md';
const CACHE_DIR = 'data/cache/ats-companies';
const CACHE_TTL_HOURS = 24;
// Tracks `main` deliberately: the dataset's value is freshness (new boards
// appear weekly), so pinning a commit would defeat the purpose. Integrity rests
// on two layers instead: SLUG_RE validates every entry against a safe charset
// before interpolation, and entryOnHost (below) re-parses each finished
// careers_url and drops anything that doesn't resolve to the ATS's own host —
// so a tampered dataset can at worst name boards that don't exist.
const DATASET_BASE = 'https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data';
const CONCURRENCY = 20;

// Dataset entries are external input destined for URL interpolation — reject
// anything outside a conservative slug charset.
const SLUG_RE = /^[A-Za-z0-9._-]+$/;

// SSRF guard / defense in depth: confirm a constructed careers_url actually
// resolves to the expected ATS host before it reaches provider.fetch. Returns
// the synthetic entry, or null if the URL won't parse or the host isn't canonical.
export function entryOnHost(name, careersUrl, isCanonicalHost) {
  let hostname;
  try {
    ({ hostname } = new URL(careersUrl));
  } catch {
    return null;
  }
  return isCanonicalHost(hostname) ? { name, careers_url: careersUrl } : null;
}

// Each source: the provider module that does the fetching, plus how to turn a
// dataset entry into a synthetic PortalEntry the provider can detect/fetch.
const SOURCES = {
  greenhouse: {
    provider: greenhouse,
    dataset: `${DATASET_BASE}/greenhouse_companies.json`,
    toEntry: (slug) => SLUG_RE.test(String(slug))
      ? entryOnHost(String(slug), `https://job-boards.greenhouse.io/${slug}`, h => h === 'job-boards.greenhouse.io')
      : null,
  },
  lever: {
    provider: lever,
    dataset: `${DATASET_BASE}/lever_companies.json`,
    toEntry: (slug) => SLUG_RE.test(String(slug))
      ? entryOnHost(String(slug), `https://jobs.lever.co/${slug}`, h => h === 'jobs.lever.co')
      : null,
  },
  ashby: {
    provider: ashby,
    dataset: `${DATASET_BASE}/ashby_companies.json`,
    toEntry: (slug) => SLUG_RE.test(String(slug))
      ? entryOnHost(String(slug), `https://jobs.ashbyhq.com/${slug}`, h => h === 'jobs.ashbyhq.com')
      : null,
  },
  workday: {
    provider: workday,
    dataset: `${DATASET_BASE}/workday_companies.json`,
    // Dataset entries are "tenant|instance|site" triples.
    toEntry: (line) => {
      const [tenant, instance, site] = String(line).split('|');
      if (![tenant, instance, site].every(p => p && SLUG_RE.test(p))) return null;
      return entryOnHost(
        tenant,
        `https://${tenant}.${instance}.myworkdayjobs.com/${site}`,
        h => h === `${tenant}.${instance}.myworkdayjobs.com` && h.endsWith('.myworkdayjobs.com'),
      );
    },
  },
};

// ── CLI args ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const valueOf = (flag) => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
    const kv = args.find(a => a.startsWith(flag + '='));
    return kv ? kv.split('=').slice(1).join('=') : null;
  };
  const sinceDays = Number(valueOf('--since')) || 3;
  const limit = Number(valueOf('--limit')) || Infinity;
  const atsArg = valueOf('--ats');
  const ats = atsArg ? atsArg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : Object.keys(SOURCES);
  const unknown = ats.filter(a => !SOURCES[a]);
  if (unknown.length) {
    console.error(`Error: unknown ATS source(s): ${unknown.join(', ')}. Valid: ${Object.keys(SOURCES).join(', ')}`);
    process.exit(1);
  }
  return {
    sinceDays,
    limit,
    ats,
    dryRun: args.includes('--dry-run'),
    liveness: args.includes('--liveness'),
    verbose: args.includes('--verbose'),
    mdOut: valueOf('--md-out'),
    json: args.includes('--json'),
    includeUndated: args.includes('--include-undated'),
    shuffle: args.includes('--shuffle'),
  };
}

// ── Company list cache (24h TTL) ────────────────────────────────────

// Returns { list, status } where status is:
//   'ok'    — fresh fetch, or a cache entry still within TTL
//   'stale' — network fetch failed; falling back to an expired cache
//   'empty' — no data at all (no cache, fetch failed/non-array)
// The status lets callers (and --json) distinguish a degraded scan from an empty one.
async function loadCompanyList(name, url) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${name}.json`);
  if (existsSync(cacheFile)) {
    const ageHours = (Date.now() - statSync(cacheFile).mtimeMs) / 3_600_000;
    if (ageHours < CACHE_TTL_HOURS) {
      try { return { list: JSON.parse(readFileSync(cacheFile, 'utf-8')), status: 'ok' }; } catch { /* refetch below */ }
    }
  }
  try {
    const data = await fetchJson(url, { timeoutMs: 30_000 });
    if (Array.isArray(data)) {
      writeFileSync(cacheFile, JSON.stringify(data), 'utf-8');
      return { list: data, status: 'ok' };
    }
  } catch (err) {
    console.error(`⚠️  ${name}: could not download company list — ${err.message}`);
  }
  // Stale cache beats nothing.
  if (existsSync(cacheFile)) {
    try { return { list: JSON.parse(readFileSync(cacheFile, 'utf-8')), status: 'stale' }; } catch { /* fall through */ }
  }
  return { list: [], status: 'empty' };
}

// Date gate for one posting in a reverse (fresh-first) scan:
//   'stale'   — dated, but older than the cutoff → always dropped
//   'undated' — no usable publish date → dropped by default, kept with --include-undated
//   'keep'    — dated and within the window
export function classifyPostingDate(job, cutoff) {
  if (job.postedAt && job.postedAt < cutoff) return 'stale';
  if (!job.postedAt) return 'undated';
  return 'keep';
}

// Cap-aware company sampling. Default: the dataset's natural (alphabetical)
// prefix. With --shuffle: a random sample of `limit` companies, so a capped
// scan isn't always biased to the same alphabetical-first slice. Pure; returns
// a new array and never mutates `list`.
export function sampleCompanies(list, limit, shuffle) {
  if (!shuffle || limit >= list.length) return list.slice(0, limit);
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, limit);
}

// ── Parallel fetch with concurrency limit ───────────────────────────

async function parallelEach(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

// ── Liveness verification (reuses liveness-browser.mjs) ────────────

async function filterLive(offers) {
  let chromium, checkUrlLiveness, newLivenessPage;
  try {
    ({ chromium } = await import('playwright'));
    ({ checkUrlLiveness, newLivenessPage } = await import('./liveness-browser.mjs'));
  } catch (err) {
    throw new Error(
      `--liveness requires Playwright with Chromium (run "npx playwright install chromium"): ${err.message}`,
      { cause: err },
    );
  }
  console.error(`\nVerifying liveness of ${offers.length} match(es) with Playwright (sequential)...`);
  const browser = await chromium.launch({ headless: true });
  const live = [];
  try {
    const page = await newLivenessPage(browser);
    // Sequential — project rule: never Playwright in parallel
    for (const offer of offers) {
      const { result, reason } = await checkUrlLiveness(page, offer.url);
      const icon = result === 'active' ? '✅' : result === 'expired' ? '❌' : '⚠️';
      console.error(`  ${icon} ${result.padEnd(9)} ${offer.company} | ${offer.title}${result === 'expired' ? ` (${reason})` : ''}`);
      if (result !== 'expired') live.push(offer); // keep 'uncertain' — transient errors retry next scan
    }
  } finally {
    await browser.close();
  }
  console.error(`  → ${live.length}/${offers.length} passed liveness`);
  return live;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const cutoff = Date.now() - opts.sinceDays * 86_400_000;
  // In --json mode, stdout is reserved for the single machine-readable result,
  // so every human-facing line goes to stderr instead.
  const log = opts.json ? (...a) => console.error(...a) : (...a) => console.log(...a);
  const progress = (s) => { if (!opts.json) process.stdout.write(s); };

  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first — the reverse scan reuses its title_filter/location_filter.');
    process.exit(1);
  }
  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const titleFilter = buildTitleFilter(config?.title_filter);
  const locationFilter = buildLocationFilter(config?.location_filter);
  if (!config?.title_filter?.positive?.length) {
    console.error('⚠️  portals.yml has no title_filter.positive — every fresh posting on every board will match. Consider adding keywords.');
  }

  log(`Reverse ATS scan — sources: ${opts.ats.join(', ')} | since ${opts.sinceDays}d${opts.limit < Infinity ? ` | limit ${opts.limit}/ats` : ''}${opts.shuffle ? ' | shuffled' : ''}${opts.includeUndated ? ' | +undated' : ''}${opts.liveness ? ' | liveness' : ''}${opts.dryRun ? ' | DRY RUN' : ''}`);

  const { seen: seenUrls } = loadSeenUrls();
  const ctx = makeHttpCtx();
  const date = new Date().toISOString().slice(0, 10);

  const newOffers = [];
  let totalCompaniesScanned = 0;
  let totalCompaniesAvailable = 0;
  let totalErrors = 0;
  let droppedNoDate = 0;
  let capHit = false;
  const datasetStatus = {};

  for (const name of opts.ats) {
    const source = SOURCES[name];
    const { list, status } = await loadCompanyList(name, source.dataset);
    datasetStatus[name] = status;
    totalCompaniesAvailable += list.length;
    if (opts.limit < list.length) capHit = true;
    const entries = sampleCompanies(list, opts.limit, opts.shuffle).map(source.toEntry).filter(Boolean);
    totalCompaniesScanned += entries.length;
    log(`\n⚙  ${name} — ${entries.length} companies${status !== 'ok' ? ` (dataset: ${status})` : ''}`);

    let done = 0;
    let errors = 0;
    await parallelEach(entries, CONCURRENCY, async (entry) => {
      try {
        const jobs = await source.provider.fetch(entry, ctx);
        for (const job of jobs) {
          if (!job.url || !job.title) continue;
          // Confirmed-stale postings are always dropped. Undated postings are
          // dropped by default (a reverse scan targets *fresh* roles) but
          // COUNTED so callers see the gap; --include-undated keeps them, marked.
          const dateClass = classifyPostingDate(job, cutoff);
          if (dateClass === 'stale') continue;
          if (dateClass === 'undated' && !opts.includeUndated) { droppedNoDate++; continue; }
          if (!titleFilter(job.title)) continue;
          if (!locationFilter(job.location)) continue;
          if (seenUrls.has(job.url)) continue;
          seenUrls.add(job.url); // intra-scan dedup
          newOffers.push({ ...job, source: `${name}-full`, dateStatus: job.postedAt ? 'dated' : 'unknown' });
        }
      } catch (err) {
        // Mostly defunct boards in the public dataset — expected noise, so the
        // default stays quiet; --verbose surfaces per-board failures.
        errors++;
        if (opts.verbose) console.error(`  ✗ ${name}/${entry.name}: ${err.message}`);
      }
      done++;
      if (done % 200 === 0 || done === entries.length) {
        progress(`  ${done}/${entries.length} scanned, ${newOffers.length} total matches\r`);
      }
    });
    totalErrors += errors;
    log(`\n  done (${errors} unreachable boards skipped)`);
  }

  let offers = newOffers;
  if (offers.length && opts.liveness) offers = await filterLive(newOffers);
  offers.sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0));

  log(`\n${'━'.repeat(45)}`);
  log(`Reverse ATS Scan — ${date}`);
  log(`${'━'.repeat(45)}`);
  log(`Companies scanned:  ${totalCompaniesScanned}${capHit ? ` of ${totalCompaniesAvailable} (capped)` : ''}`);
  log(`Unreachable boards: ${totalErrors}`);
  if (droppedNoDate) log(`Undated dropped:    ${droppedNoDate}${opts.includeUndated ? '' : ' (use --include-undated to keep)'}`);
  log(`New matches:        ${offers.length}`);

  if (offers.length) {
    log('\nNew offers:');
    for (const o of offers) {
      const posted = o.postedAt ? new Date(o.postedAt).toISOString().slice(0, 10) : 'n/a';
      log(`  + [${o.source}] ${posted} | ${o.company} | ${o.title} | ${o.location || 'N/A'}\n    ${o.url}`);
    }
  }

  // Persist (unless dry-run, or nothing to save).
  let saved = false;
  if (offers.length && !opts.dryRun) {
    // appendToPipeline assumes the file exists (onboarding creates it) — cover fresh setups.
    if (!existsSync(PIPELINE_PATH)) {
      mkdirSync(path.dirname(PIPELINE_PATH), { recursive: true });
      writeFileSync(PIPELINE_PATH, '# Pipeline\n\n## Pendientes\n', 'utf-8');
    }
    appendToPipeline(offers);
    appendToScanHistory(offers, date);
    saved = true;
    log(`\nResults saved to ${PIPELINE_PATH} and data/scan-history.tsv`);

    if (opts.mdOut) {
      try {
        mkdirSync(opts.mdOut, { recursive: true });
        const digest = [
          `# Reverse ATS Scan — ${date}`,
          `> ${offers.length} jobs | since ${opts.sinceDays}d | ${opts.liveness ? 'liveness ✓' : 'no liveness check'}`,
          '',
          ...offers.map(o => {
            const posted = o.postedAt ? new Date(o.postedAt).toISOString().slice(0, 10) : 'n/a';
            return `- [${o.title} @ ${o.company}](${o.url}) — ${o.location || 'N/A'} | ${o.source} | ${posted}`;
          }),
          '',
        ].join('\n');
        writeFileSync(path.join(opts.mdOut, `${date}.md`), digest, 'utf-8');
        log(`Markdown digest saved to ${path.join(opts.mdOut, `${date}.md`)}`);
      } catch (err) {
        console.error(`⚠️  Could not write markdown digest: ${err.message}`);
      }
    }
  }

  // The authoritative machine-readable result: lets a caller (e.g. the web)
  // tell a *degraded* scan (capped / stale dataset / undated dropped) apart
  // from a genuinely *empty* one. In --json mode stdout carries ONLY this.
  if (opts.json) {
    process.stdout.write(JSON.stringify({
      date,
      sources: opts.ats,
      sinceDays: opts.sinceDays,
      companiesAvailable: totalCompaniesAvailable,
      companiesScanned: totalCompaniesScanned,
      capHit,
      datasetStatus,
      postingsKept: offers.length,
      postingsDroppedNoDate: droppedNoDate,
      unreachableBoards: totalErrors,
      saved,
      offers: offers.map(o => ({
        company: o.company,
        title: o.title,
        url: o.url,
        location: o.location || null,
        postedAt: o.postedAt ? new Date(o.postedAt).toISOString().slice(0, 10) : null,
        dateStatus: o.dateStatus || (o.postedAt ? 'dated' : 'unknown'),
        source: o.source,
      })),
    }) + '\n');
    return;
  }

  if (!offers.length) {
    log('\nNothing new.');
    return;
  }
  if (opts.dryRun) {
    log('\n(dry run — run without --dry-run to save results)');
    return;
  }
  log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
}

// Only run main() when invoked directly, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
