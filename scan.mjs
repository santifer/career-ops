#!/usr/bin/env node
/* eslint-env node */
/* global process, console, fetch, AbortController, setTimeout, clearTimeout */

/**
 * scan.mjs — Zero-token portal scanner
 *
 * Fetches Greenhouse, Ashby, Lever, BambooHR, Teamtailor, Workable,
 * SmartRecruiters, and Recruitee APIs directly, plus global job boards
 * (RemoteOK, Remotive, Himalayas, Arbeitnow, The Muse, WeWorkRemotely,
 * Findwork, Indeed) and Hacker News "Who is Hiring" monthly thread.
 *
 * Applies title filters from portals.yml, deduplicates against existing
 * history, and appends new offers to pipeline.md + scan-history.tsv.
 *
 * Zero Claude API tokens — pure HTTP + JSON/RSS.
 *
 * Usage:
 *   node scan.mjs                        # scan all enabled companies + all enabled boards
 *   node scan.mjs --dry-run              # preview without writing files
 *   node scan.mjs --company Cohere       # scan a single company
 *   node scan.mjs --source boards        # scan job boards only
 *   node scan.mjs --source companies     # scan tracked_companies only
 *   node scan.mjs --source hn            # scan HN Who is Hiring only
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

  // BambooHR: explicit api_provider or {slug}.bamboohr.com
  if (company.api_provider === 'bamboohr' && company.bamboohr_slug) {
    return {
      type: 'bamboohr',
      url: `https://${company.bamboohr_slug}.bamboohr.com/careers/list`,
      meta: { slug: company.bamboohr_slug },
    };
  }
  const bambooMatch = url.match(/([^/]+)\.bamboohr\.com/);
  if (bambooMatch) {
    return {
      type: 'bamboohr',
      url: `https://${bambooMatch[1]}.bamboohr.com/careers/list`,
      meta: { slug: bambooMatch[1] },
    };
  }

  // Teamtailor: {slug}.teamtailor.com — returns RSS feed
  if (company.api_provider === 'teamtailor' && company.teamtailor_slug) {
    return {
      type: 'teamtailor',
      url: `https://${company.teamtailor_slug}.teamtailor.com/jobs.rss`,
    };
  }
  const ttMatch = url.match(/([^/]+)\.teamtailor\.com/);
  if (ttMatch) {
    return {
      type: 'teamtailor',
      url: `https://${ttMatch[1]}.teamtailor.com/jobs.rss`,
    };
  }

  // Workable: apply.workable.com/{slug}
  if (company.api_provider === 'workable' && company.workable_slug) {
    return {
      type: 'workable',
      url: `https://apply.workable.com/api/v3/accounts/${company.workable_slug}/jobs`,
    };
  }
  const workableMatch = url.match(/apply\.workable\.com\/([^/?#]+)/);
  if (workableMatch) {
    return {
      type: 'workable',
      url: `https://apply.workable.com/api/v3/accounts/${workableMatch[1]}/jobs`,
    };
  }

  // SmartRecruiters: careers.smartrecruiters.com/{id}
  if (company.api_provider === 'smartrecruiters' && company.smartrecruiters_id) {
    return {
      type: 'smartrecruiters',
      url: `https://api.smartrecruiters.com/v1/companies/${company.smartrecruiters_id}/postings?status=PUBLIC`,
    };
  }
  const srMatch = url.match(/careers\.smartrecruiters\.com\/([^/?#]+)/);
  if (srMatch) {
    return {
      type: 'smartrecruiters',
      url: `https://api.smartrecruiters.com/v1/companies/${srMatch[1]}/postings?status=PUBLIC`,
    };
  }

  // Recruitee: careers.{slug}.com/o/api/jobs
  if (company.api_provider === 'recruitee' && company.recruitee_slug) {
    return {
      type: 'recruitee',
      url: `https://careers.${company.recruitee_slug}.com/o/api/jobs`,
    };
  }

  return null;
}

// ── API parsers ─────────────────────────────────────────────────────

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
  }));
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
  }));
}

// ── BambooHR / Teamtailor / Workable / SmartRecruiters / Recruitee parsers ─────

function parseBambooHR(json, companyName, _url, meta) {
  const jobs = json.result || [];
  const slug = meta?.slug || '';
  return jobs.map(j => ({
    title: j.jobOpeningName || '',
    url: j.jobOpeningShareUrl || `https://${slug}.bamboohr.com/careers/${j.id}/detail`,
    company: companyName,
    location: j.location?.city || j.location?.country || '',
  }));
}

function parseTeamtailor(xmlText, companyName) {
  // Teamtailor publishes an RSS feed — parse items with regex
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xmlText)) !== null) {
    const block = m[1];
    const titleM = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const linkM = block.match(/<link>(.*?)<\/link>|<guid[^>]*>(.*?)<\/guid>/);
    const locationM = block.match(/<location>(.*?)<\/location>/);
    if (titleM && linkM) {
      items.push({
        title: (titleM[1] || titleM[2] || '').trim(),
        url: (linkM[1] || linkM[2] || '').trim(),
        company: companyName,
        location: locationM ? (locationM[1] || '').trim() : '',
      });
    }
  }
  return items;
}

function parseWorkable(json, companyName) {
  const jobs = json.results || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.url || j.shortlink || '',
    company: companyName,
    location: j.location?.telecommuting ? 'Remote'
      : j.location?.city || j.location?.country || '',
  }));
}

function parseSmartRecruiters(json, companyName) {
  const jobs = json.content || [];
  return jobs.map(j => ({
    title: j.name || '',
    url: `https://jobs.smartrecruiters.com/${j.company?.identifier || ''}/${j.id}`,
    company: companyName,
    location: j.location?.city || j.location?.country || '',
  }));
}

function parseRecruitee(json, companyName) {
  const jobs = json.offers || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.careers_url || '',
    company: companyName,
    location: j.city || j.country || '',
  }));
}

const ALL_PARSERS = {
  greenhouse: parseGreenhouse,
  ashby: parseAshby,
  lever: parseLever,
  bamboohr: parseBambooHR,
  teamtailor: parseTeamtailor,
  workable: parseWorkable,
  smartrecruiters: parseSmartRecruiters,
  recruitee: parseRecruitee,
};

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

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── Generic RSS parser (used by WeWorkRemotely, Indeed, and others) ─

function parseRSSItems(xmlText, sourceLabel) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xmlText)) !== null) {
    const block = m[1];
    const titleM = block.match(
      /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/,
    );
    const linkM =
      block.match(/<link>(.*?)<\/link>/) ||
      block.match(/<guid[^>]*isPermaLink="true"[^>]*>(.*?)<\/guid>/);
    const companyM = block.match(
      /<company>(.*?)<\/company>|<companyName>(.*?)<\/companyName>/,
    );
    const locationM = block.match(
      /<location>(.*?)<\/location>|<region>(.*?)<\/region>/,
    );
    if (titleM && linkM) {
      items.push({
        title: (titleM[1] || titleM[2] || '')
          .replace(/<!\[CDATA\[|\]\]>/g, '')
          .trim(),
        url: (linkM[1] || '').trim(),
        company: (companyM ? companyM[1] || companyM[2] || '' : '')
          .replace(/<!\[CDATA\[|\]\]>/g, '')
          .trim(),
        location: (locationM ? locationM[1] || locationM[2] || '' : '')
          .replace(/<!\[CDATA\[|\]\]>/g, '')
          .trim(),
        source: sourceLabel,
      });
    }
  }
  return items;
}

// ── Global job board fetchers ────────────────────────────────────────

/**
 * RemoteOK — remoteok.com/api
 * JSON array. First element is a notice object (skip it).
 * Filter by ?tags=react,typescript (comma-separated).
 */
async function fetchRemoteOK(boardConfig) {
  const tags = (boardConfig.tags || []).join(',');
  const url = tags
    ? `https://remoteok.com/api?tags=${encodeURIComponent(tags)}`
    : 'https://remoteok.com/api';
  const json = await fetchJson(url);
  const jobs = Array.isArray(json) ? json.slice(1) : []; // skip first notice element
  return jobs
    .filter(j => j.position)
    .map(j => ({
      title: j.position || '',
      url: j.url || j.apply_url || `https://remoteok.com/remote-jobs/${j.slug}`,
      company: j.company || '',
      location: j.location || 'Remote',
      source: 'remoteok',
    }));
}

/**
 * Remotive — remotive.com/api/remote-jobs
 * Free public API. ?category=software-dev&search=react
 */
async function fetchRemotive(boardConfig) {
  const params = new URLSearchParams();
  if (boardConfig.category) params.set('category', boardConfig.category);
  if (boardConfig.search) params.set('search', boardConfig.search);
  const url = `https://remotive.com/api/remote-jobs${params.toString() ? '?' + params : ''}`;
  const json = await fetchJson(url);
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.url || '',
    company: j.company_name || '',
    location: j.candidate_required_location || 'Remote',
    source: 'remotive',
  }));
}

/**
 * Himalayas — himalayas.app/jobs/api
 * Free JSON API. Paginated with ?page=N&limit=100
 */
async function fetchHimalayas(boardConfig) {
  const allJobs = [];
  const limit = boardConfig.limit || 100;
  const maxPages = boardConfig.max_pages || 5;
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (boardConfig.skills) params.set('skills', boardConfig.skills);
  if (boardConfig.seniority) params.set('seniority', boardConfig.seniority);
  if (boardConfig.search) params.set('search', boardConfig.search);

  for (let page = 1; page <= maxPages; page++) {
    params.set('page', String(page));
    let json;
    try {
      json = await fetchJson(`https://himalayas.app/jobs/api?${params}`);
    } catch {
      break;
    }
    const jobs = json.jobs || [];
    if (jobs.length === 0) break;
    for (const j of jobs) {
      allJobs.push({
        title: j.title || '',
        url: j.applicationLink || j.jobUrl || `https://himalayas.app/jobs/${j.slug}`,
        company: j.company?.name || j.companyName || '',
        location: j.location || 'Remote',
        source: 'himalayas',
      });
    }
    if (!json.pagination?.hasNextPage) break;
  }
  return allJobs;
}

/**
 * Arbeitnow — arbeitnow.com/api/job-board-api
 * Free JSON API, paginated, EU-focused. ?tag=React&remote=true
 */
async function fetchArbeitnow(boardConfig) {
  const allJobs = [];
  const maxPages = boardConfig.max_pages || 3;
  const params = new URLSearchParams();
  if (boardConfig.tag) params.set('tag', boardConfig.tag);
  if (boardConfig.remote) params.set('remote', 'true');

  for (let page = 1; page <= maxPages; page++) {
    params.set('page', String(page));
    let json;
    try {
      json = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?${params}`);
    } catch {
      break;
    }
    const jobs = json.data || [];
    if (jobs.length === 0) break;
    for (const j of jobs) {
      allJobs.push({
        title: j.title || '',
        url: j.url || '',
        company: j.company_name || '',
        location: j.location || '',
        source: 'arbeitnow',
      });
    }
    if (!json.links?.next) break;
  }
  return allJobs;
}

/**
 * The Muse — themuse.com/api/public/jobs
 * Free JSON API. ?category=Engineering&page=N (0-indexed)
 */
async function fetchTheMuse(boardConfig) {
  const allJobs = [];
  const maxPages = boardConfig.max_pages || 5;
  const params = new URLSearchParams();
  if (boardConfig.category) params.set('category', boardConfig.category);
  if (boardConfig.level) params.set('level', boardConfig.level);
  params.set('per_page', '100');

  for (let page = 0; page < maxPages; page++) {
    params.set('page', String(page));
    let json;
    try {
      json = await fetchJson(`https://www.themuse.com/api/public/jobs?${params}`);
    } catch {
      break;
    }
    const jobs = json.results || [];
    if (jobs.length === 0) break;
    for (const j of jobs) {
      allJobs.push({
        title: j.name || '',
        url: j.refs?.landing_page || '',
        company: j.company?.name || '',
        location: (j.locations || []).map(l => l.name).join(', ') || '',
        source: 'themuse',
      });
    }
    const pageCount = json.page_count || 1;
    if (page + 1 >= pageCount) break;
  }
  return allJobs;
}

/**
 * WeWorkRemotely — weworkremotely.com RSS feeds
 * Title format: "Company: Job Title" — extract company from title.
 */
async function fetchWeWorkRemotely(boardConfig) {
  const feeds = boardConfig.feeds || [
    'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  ];
  const allJobs = [];
  for (const feedUrl of feeds) {
    let xml;
    try {
      xml = await fetchText(feedUrl);
    } catch {
      continue;
    }
    const items = parseRSSItems(xml, 'weworkremotely');
    for (const item of items) {
      // WWR title format: "Company: Job Title" — parse company from title prefix
      if (!item.company && item.title.includes(':')) {
        const colonIdx = item.title.indexOf(':');
        item.company = item.title.slice(0, colonIdx).trim();
        item.title = item.title.slice(colonIdx + 1).trim();
      }
      allJobs.push(item);
    }
  }
  return allJobs;
}

/**
 * Findwork — findwork.dev/api/jobs
 * Requires free API key. ?search=react&remote=true
 */
async function fetchFindwork(boardConfig) {
  if (!boardConfig.api_key) return []; // skip if no key configured
  const params = new URLSearchParams();
  if (boardConfig.search) params.set('search', boardConfig.search);
  if (boardConfig.remote) params.set('remote', 'true');
  const url = `https://findwork.dev/api/jobs/?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let json;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Token ${boardConfig.api_key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const jobs = json.results || [];
  return jobs.map(j => ({
    title: j.role || '',
    url: j.url || '',
    company: j.company_name || '',
    location: j.location || 'Remote',
    source: 'findwork',
  }));
}

/**
 * Indeed RSS — indeed.com/rss public feed
 * Supports multiple search queries per board entry.
 * Company extracted from <source> element (Indeed-specific tag).
 */
async function fetchIndeed(boardConfig) {
  const queries = boardConfig.queries || [
    { q: boardConfig.search || 'software engineer', l: boardConfig.location || 'remote' },
  ];
  const allJobs = [];
  for (const query of queries) {
    const params = new URLSearchParams({
      q: query.q || '',
      l: query.l || 'remote',
      sort: 'date',
      limit: String(boardConfig.results_per_query || 50),
    });
    const url = `https://www.indeed.com/rss?${params}`;
    let xml;
    try {
      xml = await fetchText(url);
    } catch {
      continue;
    }
    const items = parseRSSItems(xml, 'indeed');
    // Indeed uses <source url="...">Company Name</source> — not standard <company> tag
    const srcRegex = /<source[^>]*>([^<]+)<\/source>/g;
    const sources = [];
    let sm;
    while ((sm = srcRegex.exec(xml)) !== null) {
      sources.push(sm[1].trim());
    }
    items.forEach((item, i) => {
      if (!item.company && sources[i]) item.company = sources[i];
    });
    allJobs.push(...items);
  }
  return allJobs;
}

// ── HN Who is Hiring fetcher ────────────────────────────────────────

/**
 * Fetch the most recent "Ask HN: Who is Hiring?" thread via Algolia HN API.
 * Searches by date (not relevance) to get the latest thread.
 * Parses top-level comments and extracts job entries.
 */
async function fetchHNWhoIsHiring(titleFilter) {
  // Step 1: Find the most recent monthly thread (sorted by date)
  const searchUrl =
    'https://hn.algolia.com/api/v1/search_by_date?query=Ask+HN+Who+is+hiring&tags=story,author_whoishiring&hitsPerPage=1';
  const searchJson = await fetchJson(searchUrl);
  const hits = searchJson.hits || [];
  if (hits.length === 0) throw new Error('HN: no hiring thread found');

  const threadId = hits[0].objectID;
  const threadTitle = hits[0].title || 'Ask HN: Who is Hiring?';
  console.log(`  HN thread: ${threadTitle} (${threadId})`);

  // Step 2: Fetch top-level comments (kids)
  const story = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${threadId}.json`);
  const kids = (story.kids || []).slice(0, 500); // limit to 500 comments

  // Step 3: Fetch comments in parallel batches
  const jobs = [];
  const BATCH = 20;
  for (let i = 0; i < kids.length; i += BATCH) {
    const batch = kids.slice(i, i + BATCH);
    const fetched = await Promise.allSettled(
      batch.map(id => fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)),
    );
    for (const result of fetched) {
      if (result.status !== 'fulfilled') continue;
      const comment = result.value;
      if (!comment || comment.dead || comment.deleted) continue;
      const text = comment.text || '';
      // HN hiring comments typically start with "Company | Role | ..."
      const firstLine = text
        .replace(/<[^>]+>/g, ' ')
        .split('\n')[0]
        .trim();
      if (!firstLine || firstLine.length < 10) continue;

      const parts = firstLine.split('|').map(p => p.trim());
      const company = parts[0] || '';
      const title = parts[1] || firstLine.slice(0, 100);
      const location =
        parts.slice(2).find(p => /remote|hybrid|onsite|on.site/i.test(p)) ||
        parts[2] ||
        '';

      if (!titleFilter(title)) continue;

      jobs.push({
        title: title.slice(0, 200),
        url: `https://news.ycombinator.com/item?id=${comment.id}`,
        company: company.slice(0, 100),
        location: location.slice(0, 100),
        source: 'hn-hiring',
      });
    }
  }
  return jobs;
}

// ── Board dispatcher ────────────────────────────────────────────────

const BOARD_FETCHERS = {
  remoteok: fetchRemoteOK,
  remotive: fetchRemotive,
  himalayas: fetchHimalayas,
  arbeitnow: fetchArbeitnow,
  themuse: fetchTheMuse,
  weworkremotely: fetchWeWorkRemotely,
  findwork: cfg => fetchFindwork(cfg).catch(() => []),
  indeed: fetchIndeed,
};

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

// ── Dedup ───────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  // scan-history.tsv
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) { // skip header
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  // pipeline.md — extract URLs from checkbox lines
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  // applications.md — extract URLs from report links and any inline URLs
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
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

function appendToScanHistory(offers, date) {
  // Ensure file + header exist
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }

  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`
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
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;
  const sourceIdx = args.indexOf('--source');
  const sourceFlag = sourceIdx !== -1 ? args[sourceIdx + 1] : null; // 'boards' | 'companies' | 'hn' | null

  // 1. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);

  if (dryRun) console.log('(dry run — no files will be written)\n');

  // 2. Load dedup sets
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();

  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  const newOffers = [];
  const errors = [];

  // Helper: apply title filter + dedup, push to newOffers if OK
  function processJob(job, sourceLabel) {
    totalFound++;
    if (!titleFilter(job.title)) { totalFiltered++; return; }
    if (seenUrls.has(job.url)) { totalDupes++; return; }
    const key = `${(job.company || '').toLowerCase()}::${job.title.toLowerCase()}`;
    if (seenCompanyRoles.has(key)) { totalDupes++; return; }
    seenUrls.add(job.url);
    seenCompanyRoles.add(key);
    newOffers.push({ ...job, source: sourceLabel });
  }

  // ── Phase A: Tracked companies (Greenhouse, Ashby, Lever, BambooHR, etc.) ──

  const runCompanies = sourceFlag == null || sourceFlag === 'companies';
  if (runCompanies) {
    const targets = companies
      .filter(c => c.enabled !== false)
      .filter(c => !filterCompany || c.name.toLowerCase().includes(filterCompany))
      .map(c => ({ ...c, _api: detectApi(c) }))
      .filter(c => c._api !== null);

    const skippedCount = companies.filter(c => c.enabled !== false).length - targets.length;
    console.log(`Scanning ${targets.length} companies via API (${skippedCount} skipped — no API detected)`);

    const tasks = targets.map(company => async () => {
      const { type, url, meta } = company._api;
      try {
        let jobs;
        if (type === 'teamtailor') {
          const xml = await fetchText(url);
          jobs = parseTeamtailor(xml, company.name);
        } else {
          const json = await fetchJson(url);
          const parser = ALL_PARSERS[type];
          if (!parser) throw new Error(`No parser for type: ${type}`);
          jobs = parser(json, company.name, url, meta);
        }
        for (const job of jobs) processJob(job, `${type}-api`);
      } catch (err) {
        errors.push({ company: company.name, error: err.message });
      }
    });

    await parallelFetch(tasks, CONCURRENCY);
  }

  // ── Phase B: Global job boards ────────────────────────────────────────────

  const runBoards = sourceFlag == null || sourceFlag === 'boards';
  if (runBoards) {
    const boards = (config.job_boards || []).filter(b => b.enabled !== false);
    if (boards.length > 0) {
      console.log(`\nScanning ${boards.length} job boards...`);
      for (const board of boards) {
        const fetcher = BOARD_FETCHERS[board.type];
        if (!fetcher) {
          errors.push({ company: `board:${board.name}`, error: `Unknown board type: ${board.type}` });
          continue;
        }
        process.stdout.write(`  → ${board.name} ... `);
        try {
          const jobs = await fetcher(board);
          for (const job of jobs) processJob(job, board.type);
          console.log(`${jobs.length} found`);
        } catch (err) {
          console.log('error');
          errors.push({ company: `board:${board.name}`, error: err.message });
        }
      }
    }
  }

  // ── Phase C: HN Who is Hiring ─────────────────────────────────────────────

  const runHN = sourceFlag == null || sourceFlag === 'hn';
  if (runHN && config.hn_hiring?.enabled !== false && config.hn_hiring) {
    console.log('\nFetching HN Who is Hiring...');
    try {
      const hnJobs = await fetchHNWhoIsHiring(titleFilter);
      for (const job of hnJobs) {
        // HN jobs already passed titleFilter inside fetchHNWhoIsHiring
        if (seenUrls.has(job.url)) { totalDupes++; continue; }
        seenUrls.add(job.url);
        newOffers.push(job);
      }
      console.log(`  ${hnJobs.length} matching HN comments found`);
    } catch (err) {
      errors.push({ company: 'HN Who is Hiring', error: err.message });
    }
  }

  // ── Write results ─────────────────────────────────────────────────────────

  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  // Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  if (runCompanies) {
    const targets = companies
      .filter(c => c.enabled !== false)
      .filter(c => !filterCompany || c.name.toLowerCase().includes(filterCompany))
      .map(c => ({ ...c, _api: detectApi(c) }))
      .filter(c => c._api !== null);
    console.log(`Companies scanned:     ${targets.length}`);
  }
  if (runBoards) {
    const boards = (config.job_boards || []).filter(b => b.enabled !== false);
    if (boards.length) console.log(`Job boards scanned:    ${boards.length}`);
  }
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company || '?'} | ${o.title} | ${o.location || 'N/A'}`);
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
