#!/usr/bin/env node

/**
 * scan-rss.mjs — Zero-token aggregator-board scanner
 *
 * Companion to scan.mjs. scan.mjs hits company-direct ATS APIs
 * (Greenhouse, Ashby, Lever); this script ingests aggregator boards
 * (ai-jobs.net, RemoteOK, WeWorkRemotely) via RSS / JSON. Same
 * title filter and dedup as scan.mjs — writes to the same
 * data/pipeline.md and data/scan-history.tsv.
 *
 * Usage:
 *   node scan-rss.mjs               # scan all enabled feeds
 *   node scan-rss.mjs --dry-run     # preview without writing files
 *   node scan-rss.mjs --feed=remoteok  # scan single feed by substring
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import { decodeHtmlEntities } from './lib/html-decode.mjs';
const parseYaml = yaml.load;

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

mkdirSync('data', { recursive: true });

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'career-ops-scanner/1.0 (+https://github.com/santifer/career-ops)';

// ── HTTP helpers ────────────────────────────────────────────────────

async function fetchWith(url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': accept },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const res = await fetchWith(url, 'application/rss+xml, application/atom+xml, text/xml, text/html');
  return await res.text();
}

async function fetchJson(url) {
  const res = await fetchWith(url, 'application/json');
  return await res.json();
}

// ── XML / RSS helpers (purpose-built, not a general parser) ────────

function stripCdata(text) {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeHtmlEntities(stripCdata(m[1])).trim() : '';
}

function extractLinkHref(block) {
  // Atom uses <link href="..."/>; RSS uses <link>...</link>
  const atomMatch = block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
  if (atomMatch) return atomMatch[1].trim();
  const rssMatch = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
  if (rssMatch) return decodeHtmlEntities(stripCdata(rssMatch[1])).trim();
  return '';
}

function parseGenericRSS(xml, sourceName) {
  const offers = [];
  let matches = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (matches.length === 0) {
    matches = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  }
  for (const m of matches) {
    const block = m[1];
    const title = extractTag(block, 'title');
    const url = extractLinkHref(block);
    if (!title || !url) continue;
    offers.push({
      title,
      url,
      company: sourceName,
      location: extractTag(block, 'category') || '',
      source: sourceName,
    });
  }
  return offers;
}

// ── Per-feed adapters ──────────────────────────────────────────────

// ai-jobs.net: titles are formatted "<Title> @ <Company>"
function parseAiJobs(xml, sourceName) {
  const offers = parseGenericRSS(xml, sourceName);
  for (const o of offers) {
    const m = o.title.match(/^(.+?)\s+@\s+(.+?)$/);
    if (m) {
      o.title = m[1].trim();
      o.company = m[2].trim();
    }
  }
  return offers;
}

// RemoteOK JSON: array with metadata in [0], jobs in [1..]
function parseRemoteOK(json, sourceName) {
  if (!Array.isArray(json)) return [];
  return json
    .filter(j => j && j.position && j.url)
    .map(j => ({
      title: j.position,
      url: j.url,
      company: j.company || sourceName,
      location: Array.isArray(j.location) ? j.location.join(', ') : (j.location || ''),
      source: sourceName,
    }));
}

// WeWorkRemotely RSS: titles are "<Company>: <Title>"
function parseWeWorkRemotely(xml, sourceName) {
  const offers = parseGenericRSS(xml, sourceName);
  for (const o of offers) {
    const m = o.title.match(/^([^:]+):\s*(.+)$/);
    if (m) {
      o.company = m[1].trim();
      o.title = m[2].trim();
    }
  }
  return offers;
}

// Hacker News "Who is hiring?" — monthly thread, scraped via Algolia API.
// Each top-level comment is a job posting. We extract company, role, and
// the first ATS URL (job-boards.greenhouse / ashbyhq / lever / amazon /
// workable / etc.) from the comment HTML.
async function fetchHNWhoIsHiring(_url, sourceName) {
  // Find the most-recent "Ask HN: Who is hiring?" thread by author.
  const search = await fetch(
    'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10',
    { headers: { 'User-Agent': USER_AGENT } }
  ).then(r => r.json());
  const hits = (search.hits || []).filter(h =>
    /who is hiring/i.test(h.title || '') && !/wants to be hired/i.test(h.title || '')
  );
  if (hits.length === 0) return [];
  const threadId = hits[0].objectID;
  const thread = await fetch(
    `https://hn.algolia.com/api/v1/items/${threadId}`,
    { headers: { 'User-Agent': USER_AGENT } }
  ).then(r => r.json());
  const comments = thread.children || [];

  const offers = [];
  // ATS-host whitelist: only emit offers that link to a real job posting.
  const atsRe = /https?:\/\/(?:[\w-]+\.)*?(?:greenhouse\.io|ashbyhq\.com|lever\.co|workable\.com|amazon\.jobs|builtin\.com|wellfound\.com|otta\.com|workatastartup\.com|hire\.lever|jobs\.workable)\b[^\s<>"')]+/i;

  for (const c of comments) {
    const rawHtml = c.text || '';
    const decoded = decodeHtmlEntities(rawHtml);
    const stripped = decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!stripped) continue;
    // Standard HN format: "Company (Stage) | Role | Location | Comp | URL ..."
    const segs = stripped.split('|').map(s => s.trim());
    const company = (segs[0] || '').replace(/\([^)]*\)/g, '').trim().slice(0, 80);
    const role = (segs[1] || segs[0]).slice(0, 120);
    const urlMatch = decoded.match(atsRe);
    if (!urlMatch || !role || !company) continue;
    offers.push({
      title: role,
      url: urlMatch[0],
      company,
      location: segs[2] || '',
      source: sourceName,
    });
  }
  return offers;
}

// ── hnrss.org parser ───────────────────────────────────────────────
//
// hnrss.org/whoishiring?q=<keyword> returns an RSS feed of individual HN
// comments from "Who is Hiring?" threads that match the keyword. Each
// <description> is the raw comment HTML; we decode entities, strip tags,
// then extract any ATS URLs and company/role from the first pipe-delimited
// segment (standard HN hiring format).
//
// This is complementary to fetchHNWhoIsHiring (Algolia, monthly full dump):
//   - Algolia: fetches ALL comments, deduplicates via title filter
//   - hnrss.org: keyword pre-filtered, multi-month archive, lower false positives

function parseHNrss(xml, sourceName) {
  const atsRe = /https?:\/\/(?:[\w-]+\.)*?(?:greenhouse\.io|ashbyhq\.com|lever\.co|workable\.com|amazon\.jobs|wellfound\.com|workatastartup\.com|otta\.com)\b[^\s<>"')&]+/gi;

  const offers = [];
  let items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (items.length === 0) {
    items = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  }

  for (const m of items) {
    const block = m[1];
    // description may be in <description> or <content:encoded>
    const descRaw = extractTag(block, 'description') ||
                    block.match(/<content:encoded\b[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1] || '';
    const decoded = decodeHtmlEntities(descRaw);
    const stripped = decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Extract all ATS URLs from description
    const urls = [...decoded.matchAll(atsRe)].map(u => u[0]);
    if (urls.length === 0) continue;

    // Parse standard HN format: "Company (Stage) | Role | Location | ..."
    const segs = stripped.split('|').map(s => s.trim());
    const company = segs[0].replace(/\([^)]*\)/g, '').trim().slice(0, 80) || sourceName;
    const role = segs[1] || segs[0].slice(0, 120);
    const location = segs[2] || '';

    // Emit one offer per unique ATS URL in the comment
    for (const url of urls) {
      offers.push({
        title: role,
        url,
        company,
        location,
        source: sourceName,
      });
    }
  }
  return offers;
}

// ── Feed registry ──────────────────────────────────────────────────

const RSS_FEEDS = [
  {
    name: 'ai-jobs.net',
    url: 'https://ai-jobs.net/feed/',
    type: 'rss',
    parser: parseAiJobs,
    enabled: false,
    notes: 'TODO: Site redirects to aijobs.net which has no public RSS at common paths. Find correct feed URL or scrape /jobs HTML.',
  },
  {
    name: 'RemoteOK',
    url: 'https://remoteok.com/api',
    type: 'json',
    parser: parseRemoteOK,
    enabled: true,
    notes: 'Remote-first jobs. JSON API.',
  },
  {
    name: 'WeWorkRemotely — Programming',
    url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    type: 'rss',
    parser: parseWeWorkRemotely,
    enabled: true,
    notes: 'Remote programming. Title format: "<Company>: <Role>".',
  },
  {
    name: 'WeWorkRemotely — Product',
    url: 'https://weworkremotely.com/categories/remote-product-jobs.rss',
    type: 'rss',
    parser: parseWeWorkRemotely,
    enabled: true,
    notes: 'Remote product roles.',
  },
  {
    name: 'WeWorkRemotely — DevOps/Sysadmin',
    url: 'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
    type: 'rss',
    parser: parseWeWorkRemotely,
    enabled: true,
    notes: 'Remote DevOps/infra.',
  },
  // ── hnrss.org keyword feeds (complement to Algolia full-thread below) ──
  // Each URL is keyword-pre-filtered; the atsRe pattern in parseHNrss ensures
  // only real job board links are emitted. Covers multi-month archive.
  {
    name: 'HN Hiring — Forward Deployed',
    url: 'https://hnrss.org/whoishiring?q=forward+deployed',
    type: 'rss',
    parser: parseHNrss,
    enabled: true,
    notes: 'hnrss.org: HN Who is Hiring filtered to "forward deployed" comments.',
  },
  {
    name: 'HN Hiring — Solutions Architect',
    url: 'https://hnrss.org/whoishiring?q=solutions+architect',
    type: 'rss',
    parser: parseHNrss,
    enabled: true,
    notes: 'hnrss.org: HN Who is Hiring filtered to "solutions architect" comments.',
  },
  {
    name: 'HN Hiring — Applied AI',
    url: 'https://hnrss.org/whoishiring?q=applied+AI',
    type: 'rss',
    parser: parseHNrss,
    enabled: true,
    notes: 'hnrss.org: HN Who is Hiring filtered to "applied AI" comments.',
  },
  {
    name: 'HN Hiring — AI Enablement',
    url: 'https://hnrss.org/whoishiring?q=AI+enablement',
    type: 'rss',
    parser: parseHNrss,
    enabled: true,
    notes: 'hnrss.org: HN Who is Hiring filtered to "AI enablement" comments.',
  },
  {
    name: 'HN Hiring — Anthropic',
    url: 'https://hnrss.org/whoishiring?q=anthropic',
    type: 'rss',
    parser: parseHNrss,
    enabled: true,
    notes: 'hnrss.org: company-specific — Anthropic postings in HN threads.',
  },
  {
    name: 'HN Hiring — Sierra / Cognition / Perplexity',
    url: 'https://hnrss.org/whoishiring?q=sierra+OR+cognition+OR+perplexity',
    type: 'rss',
    parser: parseHNrss,
    enabled: true,
    notes: 'hnrss.org: company-specific — Tier 1 AI-native targets in HN threads.',
  },
  {
    name: 'Hacker News — Who is Hiring (Algolia full thread)',
    url: 'https://news.ycombinator.com/jobs',  // referenced for context; actual fetch hits Algolia
    type: 'custom',                              // signal to use fetchHNWhoIsHiring
    parser: null,
    fetcher: fetchHNWhoIsHiring,
    enabled: true,
    notes: 'Monthly Ask HN thread — extracts ATS URLs from ALL top-level job postings.',
  },
];

// ── Title filter — read from portals.yml so RSS and ATS scans agree ─

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

// ── Dedup (mirrors scan.mjs) ───────────────────────────────────────

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
    for (const m of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(m[1]);
    }
  }
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const m of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(m[0]);
    }
  }
  return seen;
}

// ── Pipeline / history writers (mirrors scan.mjs) ──────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;
  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
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
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const feedFilter = args.find(a => a.startsWith('--feed='))?.split('=')[1]?.toLowerCase();

  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const titleFilter = buildTitleFilter(config.title_filter);

  const targets = RSS_FEEDS
    .filter(f => f.enabled !== false)
    .filter(f => !feedFilter || f.name.toLowerCase().includes(feedFilter));

  console.log(`Scanning ${targets.length} RSS/JSON feeds`);
  if (dryRun) console.log('(dry run — no files will be written)\n');

  const seenUrls = loadSeenUrls();
  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  const newOffers = [];
  const errors = [];

  for (const feed of targets) {
    try {
      let offers;
      if (feed.type === 'custom' && typeof feed.fetcher === 'function') {
        // Custom fetcher (e.g., HN Algolia API) handles its own paging
        offers = await feed.fetcher(feed.url, feed.name);
      } else {
        const raw = feed.type === 'json'
          ? await fetchJson(feed.url)
          : await fetchText(feed.url);
        offers = feed.parser(raw, feed.name);
      }
      totalFound += offers.length;
      for (const o of offers) {
        if (!titleFilter(o.title)) {
          totalFiltered++;
          continue;
        }
        if (seenUrls.has(o.url)) {
          totalDupes++;
          continue;
        }
        seenUrls.add(o.url);
        newOffers.push(o);
      }
    } catch (err) {
      errors.push({ feed: feed.name, error: err.message });
    }
  }

  console.log('');
  console.log('━'.repeat(45));
  console.log(`RSS Scan — ${date}`);
  console.log('━'.repeat(45));
  console.log(`Feeds scanned:       ${targets.length}`);
  console.log(`Total jobs found:    ${totalFound}`);
  console.log(`Filtered by title:   ${totalFiltered} removed`);
  console.log(`Duplicates:          ${totalDupes} skipped`);
  console.log(`New offers added:    ${newOffers.length}`);

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers.slice(0, 30)) {
      console.log(`  + ${o.company} | ${o.title}`);
    }
    if (newOffers.length > 30) {
      console.log(`  ... and ${newOffers.length - 30} more`);
    }
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.feed}: ${e.error}`);
    }
  }

  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
    console.log('\nResults saved to data/pipeline.md and data/scan-history.tsv');
  } else if (dryRun) {
    console.log('\n(dry run — run without --dry-run to save results)');
  }
}

main().catch(err => {
  console.error('scan-rss error:', err.message);
  process.exit(1);
});
