#!/usr/bin/env node
// scan-hn-hiring.mjs — HN "Ask HN: Who is hiring?" ingestion.
//
// The monthly HN Who-Is-Hiring thread is one of the highest-density sources of
// AI-startup roles before they hit official ATS. Council/dealbreaker P1-1
// 2026-05-19: AI-native startups post here ~30% of the time before their ATS
// goes live.
//
// Strategy:
//   1. Hit hn.algolia.com search to find the CURRENT month's Who-Is-Hiring
//      story (matches "Ask HN: Who is hiring?" with a current-month date hint).
//   2. Fetch all top-level comments via the items API.
//   3. Filter each comment against title_filter.positive from portals.yml.
//   4. Extract apply URLs from the comment body (most include one).
//   5. Append matches to data/pipeline.md, deduped against existing entries.
//
// Idempotent — re-running on the same day adds only new comments. Schedule
// daily via launchd; the story persists for the whole month and accumulates
// comments as recruiters post them.
//
// Usage:
//   node scan-hn-hiring.mjs           # ingest current month
//   node scan-hn-hiring.mjs --dry-run # preview without writing

import { readFileSync, appendFileSync, existsSync, mkdirSync, writeSync, openSync, closeSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { startRun, finishRun } from './lib/job-runs-ledger.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Derive project root from this file's location (it lives at the repo root).
// Avoids hardcoding a user-specific path so the script is portable + the
// test-all.mjs absolute-path check passes without an explicit exclusion.
const PROJECT_DIR = dirname(fileURLToPath(import.meta.url));
const PORTALS_PATH = join(PROJECT_DIR, 'portals.yml');
const PIPELINE_PATH = join(PROJECT_DIR, 'data/pipeline.md');
const SCAN_HISTORY_PATH = join(PROJECT_DIR, 'data/scan-history.tsv');
const LOG_DIR = join(PROJECT_DIR, 'data/logs');
const DATE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const LOG_PATH = join(LOG_DIR, `scan-hn-${DATE}.log`);

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const logFd = openSync(LOG_PATH, 'a');
function log(msg) {
  const stamped = `[${new Date().toISOString()}] ${msg}`;
  console.log(stamped);
  writeSync(logFd, stamped + '\n');
}

function loadKeywords() {
  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const filter = config?.title_filter?.positive || [];
  return filter.map(k => k.toLowerCase());
}

async function fetchCurrentStory() {
  // Use search_by_date for deterministic date ordering. author_whoishiring posts
  // two monthly threads — "Who is hiring?" (recruiters) and "Who wants to be hired?"
  // (candidates). We want the hiring one.
  const url = 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();
  const hits = (json.hits || []).filter(h => /who is hiring/i.test(h.title || ''));
  if (hits.length === 0) {
    throw new Error('No Who-Is-Hiring story found in last 10 author_whoishiring stories');
  }
  return hits[0];
}

async function fetchStoryWithComments(storyId) {
  const url = `https://hn.algolia.com/api/v1/items/${storyId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  return await res.json();
}

function decodeHnEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&#47;/g, '/');
}

function extractTextFromHtml(html) {
  if (!html) return '';
  return decodeHnEntities(
    html
      .replace(/<p>/gi, '\n\n')
      .replace(/<br[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

// Domains that indicate a job-posting page. Companies post HN with their ATS link;
// we want those. Exclude social/profile/form/email pages even if they appear in HN.
const JOB_HOST_RE = /\b(greenhouse\.io|ashbyhq\.com|lever\.co|workable\.com|smartrecruiters\.com|breezy\.hr|workday\.com|recruiterbox\.com|jobvite\.com|freshteam\.com|applytojob\.com|joinhandshake\.com|builtin\.com|otta\.com|wellfound\.com|angel\.co|joinrise\.io|teamtailor\.com|recruitee\.com|polymer\.co|join\.com|comeet\.co|pinpointhq\.com|gem\.com)\b/i;
const JOB_PATH_RE = /\/(jobs?|careers?|positions?|openings?|apply|hiring|join-us|work-with-us|roles?)\b/i;
const NOISE_HOST_RE = /\b(linkedin\.com\/in\/|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|forms\.microsoft\.com|docs\.google\.com\/forms|forms\.gle|airtable\.com\/shr)\b/i;
const NOISE_EXT_RE = /\.(png|jpe?g|gif|svg|pdf|webp|mp4)(\?|$)/i;

function isJobUrl(url) {
  if (NOISE_HOST_RE.test(url)) return false;
  if (NOISE_EXT_RE.test(url)) return false;
  if (JOB_HOST_RE.test(url)) return true;
  if (JOB_PATH_RE.test(url)) return true;
  return false;
}

function extractUrls(html) {
  if (!html) return [];
  const decoded = decodeHnEntities(html);
  const out = new Set();
  const hrefRe = /href="([^"]+)"/gi;
  let m;
  while ((m = hrefRe.exec(decoded)) !== null) {
    const url = m[1].trim().replace(/[.,;:)]+$/, '');
    if (/^https?:\/\//i.test(url) && !url.includes('news.ycombinator.com') && isJobUrl(url)) {
      out.add(url);
    }
  }
  const bareUrlRe = /(https?:\/\/[^\s<>"')]+)/g;
  while ((m = bareUrlRe.exec(decoded)) !== null) {
    const url = m[1].replace(/[.,;:)]+$/, '');
    if (!url.includes('news.ycombinator.com') && isJobUrl(url)) {
      out.add(url);
    }
  }
  return [...out];
}

function matchesKeywords(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function loadExistingUrls() {
  const urls = new Set();
  if (existsSync(SCAN_HISTORY_PATH)) {
    const text = readFileSync(SCAN_HISTORY_PATH, 'utf-8');
    for (const line of text.split('\n')) {
      const [url] = line.split('\t');
      if (url) urls.add(url);
    }
  }
  return urls;
}

function appendToPipeline(entries) {
  if (entries.length === 0) return;
  const lines = entries.map(e => {
    return `- [ ] ${e.company} — ${e.titleHint} | ${e.url} (from HN Who-Is-Hiring #${e.commentId})`;
  });
  const block = `\n<!-- HN Who-Is-Hiring ingest ${DATE} (${entries.length} matches) -->\n${lines.join('\n')}\n`;
  if (!DRY_RUN) appendFileSync(PIPELINE_PATH, block);
}

function appendToScanHistory(entries) {
  if (entries.length === 0) return;
  const nowIso = new Date().toISOString();
  const lines = entries.map(e =>
    `${e.url}\t${nowIso}\tHN-WhoIsHiring\t${e.commentId}\t(from HN comment)\tadded`
  );
  if (!DRY_RUN) appendFileSync(SCAN_HISTORY_PATH, lines.join('\n') + '\n');
}

(async () => {
  const runId = DRY_RUN ? null : startRun('scan-hn-hiring');
  try {
    log(`=== scan-hn-hiring starting (${DRY_RUN ? 'DRY RUN' : 'live'}) ===`);
    const keywords = loadKeywords();
    if (keywords.length === 0) {
      log('WARN: no positive title-filter keywords found in portals.yml — would match nothing.');
      process.exit(0);
    }
    log(`Loaded ${keywords.length} keyword filters from portals.yml`);

    const story = await fetchCurrentStory();
    log(`Current Who-Is-Hiring story: #${story.objectID} "${story.title}" (${new Date(story.created_at).toISOString().slice(0,10)})`);

    const full = await fetchStoryWithComments(story.objectID);
    const topComments = (full.children || []).filter(c => c && c.text);
    log(`Story has ${topComments.length} top-level comments`);

    const existing = loadExistingUrls();
    const matches = [];
    let kwMatches = 0;
    let totalUrlsInKwMatches = 0;
    let dedupSkipped = 0;

    for (const comment of topComments) {
      const text = extractTextFromHtml(comment.text);
      if (!matchesKeywords(text, keywords)) continue;
      kwMatches++;

      const firstLine = text.split('\n')[0].split('|')[0].slice(0, 100).trim();
      const company = firstLine.split('|')[0].split('(')[0].slice(0, 50).trim() || 'Unknown';
      const titleHint = text.slice(0, 200).replace(/\s+/g, ' ').trim();

      const urls = extractUrls(comment.text);
      totalUrlsInKwMatches += urls.length;
      for (const url of urls) {
        if (existing.has(url)) { dedupSkipped++; continue; }
        existing.add(url);
        matches.push({
          company,
          titleHint,
          url,
          commentId: comment.id,
        });
      }
    }

    log(`Stats: ${kwMatches}/${topComments.length} comments matched keywords, ${totalUrlsInKwMatches} URLs total in those, ${dedupSkipped} dedup-skipped, ${matches.length} new`);
    appendToPipeline(matches);
    appendToScanHistory(matches);

    if (DRY_RUN) {
      log('DRY RUN — printing first 5 matches:');
      for (const m of matches.slice(0, 5)) log(`  ${m.company} | ${m.url}`);
    }

    log(`=== scan-hn-hiring completed ===`);
    closeSync(logFd);
    finishRun(runId, { status: 'ok', urls_found: matches.length });
    process.exit(0);
  } catch (err) {
    log(`FATAL: ${err.message}\n${err.stack}`);
    closeSync(logFd);
    finishRun(runId, { status: 'fail', error: err.message });
    process.exit(1);
  }
})();
