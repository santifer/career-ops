#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner
 *
 * Fetches Greenhouse, Ashby, and Lever APIs directly, applies title
 * filters from portals.yml, deduplicates against existing history,
 * and appends new offers to pipeline.md + scan-history.tsv.
 *
 * Zero Claude API tokens — pure HTTP + JSON.
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company Cohere # scan a single company
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

// Ensure required directories exist (fresh setup)
mkdirSync('data', { recursive: true });

const CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 10_000;

// ── API detection ───────────────────────────────────────────────────

function detectApi(company) {
  // Greenhouse: explicit api field
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api };
  }
  // Workable: explicit api field
  if (company.api && company.api.includes('workable.com')) {
    return { type: 'workable', url: company.api };
  }

  const url = company.careers_url || '';

  // Ashby
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  // Lever
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  // Greenhouse EU boards
  const ghEuMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
    };
  }

  // Workable (inferred from careers_url like apply.workable.com/{slug})
  const workableMatch = url.match(/apply\.workable\.com\/([^/?#]+)/);
  if (workableMatch) {
    return {
      type: 'workable',
      url: `https://apply.workable.com/api/v1/widget/accounts/${workableMatch[1]}`,
    };
  }

  // Ministère de l'Europe et des Affaires étrangères — emplois.diplomatie.gouv.fr
  // SPA with a public JSON API (no auth). Paginated: GET /api/v1/offres?page=N&limit=20
  const diplomatieMatch = url.match(/emplois\.diplomatie\.gouv\.fr/);
  if (diplomatieMatch) {
    return {
      type: 'diplomatie',
      url: 'https://emplois.diplomatie.gouv.fr/api/v1/offres',
    };
  }

  return null;
}

// ── API parsers ─────────────────────────────────────────────────────

// Detect workplace_type from a location string (Greenhouse fallback — no explicit field)
function inferWorkplaceFromLocation(loc) {
  if (!loc) return '';
  const l = loc.toLowerCase();
  if (/\bremote\b|\bremotely\b|\banywhere\b/.test(l)) return 'remote';
  if (/\bhybrid\b/.test(l)) return 'hybrid';
  return '';
}

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => {
    const location = j.location?.name || '';
    return {
      title: j.title || '',
      url: j.absolute_url || '',
      company: companyName,
      location,
      posted_at: j.first_published || j.updated_at || '',
      workplace_type: inferWorkplaceFromLocation(location),
    };
  });
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
    posted_at: j.publishedAt || '',
    // Ashby workplaceType values: "Remote", "Hybrid", "On-Site", "Unspecified"
    workplace_type: j.isRemote ? 'remote' : (j.workplaceType || '').toLowerCase().replace('-', ''),
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
    posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : '',
    // Lever workplaceType values: "remote", "hybrid", "on-site", "unspecified"
    workplace_type: (j.workplaceType || '').toLowerCase(),
  }));
}

function parseWorkable(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => {
    const loc = j.locations?.[0];
    const location = loc
      ? [loc.city, loc.region, loc.country].filter(Boolean).join(', ')
      : [j.city, j.state, j.country].filter(Boolean).join(', ');
    return {
      title: j.title || '',
      url: j.url || j.shortlink || '',
      company: companyName,
      location,
      posted_at: j.published_on || j.created_at || '',
      // Workable: telecommuting:true means remote
      workplace_type: j.telecommuting ? 'remote' : inferWorkplaceFromLocation(location),
    };
  });
}

// emplois.diplomatie.gouv.fr — paginated JSON API (max 20 per page).
// Async parser: it fetches every page itself, so the caller passes the BASE url
// and the first-page json it already fetched is ignored (we re-fetch page 1 for
// uniformity). Returns the full flattened list.
async function parseDiplomatie(_firstJson, companyName, baseUrl) {
  const LIMIT = 20;
  const all = [];
  let page = 1;
  let total = Infinity;
  // Hard cap at 20 pages (400 offers) to avoid any runaway loop.
  while (all.length < total && page <= 20) {
    const json = await fetchJson(`${baseUrl}?page=${page}&limit=${LIMIT}`);
    const offres = json.offres || [];
    total = typeof json.total === 'number' ? json.total : offres.length;
    if (offres.length === 0) break;
    for (const o of offres) {
      const country = o.codePays && o.codePays !== 'FRA' ? `, ${o.codePays}` : '';
      all.push({
        title: o.intitule || '',
        url: `https://emplois.diplomatie.gouv.fr/offre/${o.id}`,
        company: companyName,
        location: [o.ville, country].filter(Boolean).join('').replace(/^, /, ''),
        posted_at: o.datePriseFonction || '',
        // No remote concept in diplomatic postings — leave empty.
        workplace_type: '',
      });
    }
    page++;
  }
  return all;
}

const PARSERS = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever, workable: parseWorkable, diplomatie: parseDiplomatie };

// ── Fetch with timeout ──────────────────────────────────────────────

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Title filter ────────────────────────────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Location filter ─────────────────────────────────────────────────
// Optional. If `location_filter` is absent from portals.yml, all locations pass.
// Semantics:
//   - Empty location string → pass (don't penalize missing data)
//   - `block` matches → reject (takes precedence over allow)
//   - `allow` empty → pass (already cleared block)
//   - `allow` non-empty → must match at least one keyword
// All matches are case-insensitive substring.

function buildLocationFilter(locationFilter) {
  if (!locationFilter) return () => true;
  const allow = (locationFilter.allow || []).map(k => k.toLowerCase());
  const block = (locationFilter.block || []).map(k => k.toLowerCase());

  return (location) => {
    if (!location) return true;
    const lower = location.toLowerCase();
    if (block.length > 0 && block.some(k => lower.includes(k))) return false;
    if (allow.length === 0) return true;
    return allow.some(k => lower.includes(k));
  };
}

// ── Freshness filter ─────────────────────────────────────────────────
// Optional. Drop offers older than max_age_days based on posted_at.
// Empty posted_at → pass (don't penalize missing data).

function buildFreshnessFilter(freshnessFilter) {
  if (!freshnessFilter?.max_age_days) return () => true;
  const cutoffMs = Date.now() - freshnessFilter.max_age_days * 86_400_000;

  return (postedAt) => {
    if (!postedAt) return true;
    const t = Date.parse(postedAt);
    if (isNaN(t)) return true;
    return t >= cutoffMs;
  };
}

// ── Remote filter ────────────────────────────────────────────────────
// Optional. Keep only remote or hybrid roles based on workplace_type or
// location keywords. If `remote_filter` is absent, all offers pass.
// Empty workplace_type AND empty location → pass (don't penalize missing).

function buildRemoteFilter(remoteFilter) {
  if (!remoteFilter) return () => true;
  const types = (remoteFilter.workplace_types || []).map(k => k.toLowerCase());
  const keywords = (remoteFilter.location_keywords || []).map(k => k.toLowerCase());

  return (workplaceType, location) => {
    const wt = (workplaceType || '').toLowerCase();
    const loc = (location || '').toLowerCase();
    if (!wt && !loc) return true;
    if (types.length > 0 && types.some(t => wt.includes(t))) return true;
    if (keywords.length > 0 && keywords.some(k => loc.includes(k))) return true;
    return false;
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

// Returns two sets:
//   addedUrls — URLs we've previously added to pipeline/applications (dedup target).
//   anyUrls   — every URL ever logged in scan-history, used to avoid re-logging
//               the same skip_* event on every scan.
function loadHistoryIndex() {
  const addedUrls = new Set();
  const anyUrls = new Set();

  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const parts = line.split('\t');
      const url = parts[0];
      const status = parts[5] || '';
      if (!url) continue;
      anyUrls.add(url);
      if (status === 'added') addedUrls.add(url);
    }
  }

  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      addedUrls.add(match[1]);
      anyUrls.add(match[1]);
    }
  }

  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      addedUrls.add(match[0]);
      anyUrls.add(match[0]);
    }
  }

  return { addedUrls, anyUrls };
}

function loadSeenCompanyRoles() {
  const seen = new Set();
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    // Parse markdown table rows: | # | Date | Company | Role | ...
    for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const company = match[1].trim().toLowerCase();
      const role = match[2].trim().toLowerCase();
      if (company && role && company !== 'company') {
        seen.add(`${company}::${role}`);
      }
    }
  }
  return seen;
}

// ── Pipeline writer ─────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  // Find "## Pendientes" section and append after it
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No Pendientes section — append at end before Procesadas
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    // Find the end of existing Pendientes content (next ## or end)
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;

    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(entries, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(
      SCAN_HISTORY_PATH,
      'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tposted_at\tworkplace_type\n',
      'utf-8'
    );
  }

  const lines = entries.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\t${o.status}\t${o.location || ''}\t${o.posted_at || ''}\t${o.workplace_type || ''}`
  ).join('\n') + '\n';

  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Parallel fetch with concurrency limit ───────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;

  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filterCompanies = args
    .flatMap((a, i) => (a === '--company' ? [args[i + 1]] : []))
    .filter(Boolean)
    .flatMap(s => String(s).split(','))
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  // 1. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);
  const locationFilter = buildLocationFilter(config.location_filter);
  const freshnessFilter = buildFreshnessFilter(config.freshness_filter);
  const remoteFilter = buildRemoteFilter(config.remote_filter);

  // 2. Filter to enabled companies with detectable APIs
  const matchesSelection = c =>
    !filterCompanies.length || filterCompanies.some(fc => c.name.toLowerCase().includes(fc));

  const selected = companies
    .filter(c => c.enabled !== false)
    .filter(matchesSelection)
    .map(c => ({ ...c, _api: detectApi(c) }));

  const targets = selected.filter(c => c._api !== null);

  const skippedCount = companies.filter(c => c.enabled !== false).length - targets.length;

  console.log(`Scanning ${targets.length} companies via API (${skippedCount} skipped — no API detected)`);

  // When the user explicitly picked sources (selective scan from the UI), name the
  // ones that were skipped for lacking a supported ATS API — otherwise they'd silently
  // appear "selected" but never scanned.
  if (filterCompanies.length) {
    const skippedNamed = selected.filter(c => c._api === null).map(c => c.name);
    if (skippedNamed.length) {
      console.log(`⚠ Ignorées (pas d'API supportée) : ${skippedNamed.join(', ')}`);
    }
  }

  if (dryRun) console.log('(dry run — no files will be written)\n');

  // 3. Load dedup sets
  const { addedUrls, anyUrls } = loadHistoryIndex();
  const seenCompanyRoles = loadSeenCompanyRoles();

  // 4. Fetch all APIs
  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFilteredTitle = 0;
  let totalFilteredLocation = 0;
  let totalFilteredAge = 0;
  let totalFilteredRemote = 0;
  let totalDupes = 0;
  const newOffers = [];
  const skippedOffers = [];
  const errors = [];

  // Helper: log a skip event only the first time we ever see this URL,
  // so the TSV grows linearly with new offers — not with every re-scan.
  const logSkip = (job, type, status) => {
    if (anyUrls.has(job.url)) return;
    anyUrls.add(job.url);
    skippedOffers.push({ ...job, source: `${type}-api`, status });
  };

  const tasks = targets.map(company => async () => {
    const { type, url } = company._api;
    try {
      // Self-paginating parsers (diplomatie) fetch every page themselves from the
      // base url. Others get a single pre-fetched json blob, as before.
      const SELF_PAGING = new Set(['diplomatie']);
      const jobs = SELF_PAGING.has(type)
        ? await PARSERS[type](null, company.name, url)
        : PARSERS[type](await fetchJson(url), company.name);
      totalFound += jobs.length;

      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          totalFilteredTitle++;
          logSkip(job, type, 'skipped_title');
          continue;
        }
        if (!locationFilter(job.location)) {
          totalFilteredLocation++;
          logSkip(job, type, 'skipped_location');
          continue;
        }
        if (!freshnessFilter(job.posted_at)) {
          totalFilteredAge++;
          logSkip(job, type, 'skipped_age');
          continue;
        }
        if (!remoteFilter(job.workplace_type, job.location)) {
          totalFilteredRemote++;
          logSkip(job, type, 'skipped_remote');
          continue;
        }
        if (addedUrls.has(job.url)) {
          totalDupes++;
          // Already added before — already in history as 'added', do not re-log.
          continue;
        }
        const key = `${job.company.toLowerCase()}::${job.title.toLowerCase()}`;
        if (seenCompanyRoles.has(key)) {
          totalDupes++;
          logSkip(job, type, 'skipped_dup');
          continue;
        }
        addedUrls.add(job.url);
        anyUrls.add(job.url);
        seenCompanyRoles.add(key);
        newOffers.push({ ...job, source: `${type}-api`, status: 'added' });
      }
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  // 5. Write results
  if (!dryRun) {
    if (newOffers.length > 0) appendToPipeline(newOffers);
    const allEntries = [...newOffers, ...skippedOffers];
    if (allEntries.length > 0) appendToScanHistory(allEntries, date);
  }

  // 6. Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${targets.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFilteredTitle} removed`);
  console.log(`Filtered by location:  ${totalFilteredLocation} removed`);
  console.log(`Filtered by age:       ${totalFilteredAge} removed (older than max_age_days)`);
  console.log(`Filtered by remote:    ${totalFilteredRemote} removed (not remote/hybrid)`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);
  console.log(`Skip events logged:    ${skippedOffers.length} (first-time skips, for dashboard analytics)`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  console.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
  console.log('→ Share results and get help: https://discord.gg/8pRpHETxa4');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
