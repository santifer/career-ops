#!/usr/bin/env node
/**
 * community-scan.mjs — Reddit + community RSS → pipeline.md feeder
 *
 * Monitors subreddits and community RSS feeds for job posting URLs.
 * Extracts links matching known job board patterns (Ashby, Greenhouse,
 * Lever, Workday, LinkedIn Jobs, etc.) and adds new ones to pipeline.md
 * for triage. Deduplicates against scan-history.tsv.
 *
 * Runs nightly alongside scan.mjs. No AI tokens used.
 *
 * Usage:
 *   node community-scan.mjs           # run one check cycle
 *   node community-scan.mjs --dry-run # show what would be added, no writes
 *   node community-scan.mjs --reset   # clear seen state (re-check all)
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installRunRecord } from './lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('community-scan');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PIPELINE_FILE   = join(ROOT, 'data/pipeline.md');
const HISTORY_FILE    = join(ROOT, 'data/scan-history.tsv');
const STATE_FILE      = join(ROOT, 'data/community-scan-state.json');
const DRY_RUN         = process.argv.includes('--dry-run');
const RESET           = process.argv.includes('--reset');

// ── Community sources to watch ────────────────────────────────────
const SOURCES = [
  // Reddit — subreddits with active job/hiring discussions
  // RSS gives last 25 posts per subreddit; filter by job URL presence
  { name: 'r/MachineLearning',    url: 'https://www.reddit.com/r/MachineLearning/.rss',    tier: 2 },
  { name: 'r/AiBuilders',         url: 'https://www.reddit.com/r/AiBuilders/.rss',         tier: 1 },
  { name: 'r/LocalLLaMA',         url: 'https://www.reddit.com/r/LocalLLaMA/.rss',         tier: 2 },
  { name: 'r/MLOps',              url: 'https://www.reddit.com/r/MLOps/.rss',              tier: 1 },
  { name: 'r/AI_Agents',          url: 'https://www.reddit.com/r/AI_Agents/.rss',          tier: 1 },
  { name: 'r/cscareerquestions',  url: 'https://www.reddit.com/r/cscareerquestions/.rss',  tier: 3 },
  { name: 'r/datascience',        url: 'https://www.reddit.com/r/datascience/.rss',        tier: 3 },
  { name: 'r/artificial',         url: 'https://www.reddit.com/r/artificial/.rss',         tier: 3 },
  // HN Who's Hiring — monthly thread (May 2026)
  { name: 'HN Who\'s Hiring',     url: 'https://hn.algolia.com/api/v1/search?tags=ask_hn&query=who+is+hiring&numericFilters=created_at_i>1746057600', tier: 2, type: 'hn' },
];

// ── Job board URL patterns to extract ────────────────────────────
const JOB_URL_PATTERNS = [
  /https?:\/\/[^\s"'<>)]+(?:greenhouse\.io|ashbyhq\.com|lever\.co|workday\.com|myworkdayjobs\.com|jobs\.smartrecruiters\.com|apply\.workable\.com|boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.ashbyhq\.com|jobs\.lever\.co)[^\s"'<>)]+/gi,
  /https?:\/\/(?:www\.)?linkedin\.com\/jobs\/view\/[0-9]+[^\s"'<>)]*/gi,
  /https?:\/\/[^\s"'<>)]+\.(?:com|ai|io)\/(?:jobs|careers|positions|openings|apply)\/[^\s"'<>)]{10,}/gi,
];

// Keywords that suggest a job-related post/comment
const JOB_KEYWORDS = [
  'hiring', 'job', 'position', 'role', 'opening', 'career', 'apply',
  'remote', 'full.?time', 'engineer', 'pm ', 'product manager', 'architect',
  'anthropic', 'openai', 'xai', 'sierra', 'perplexity', 'groq', 'databricks',
  'cerebras', 'cursor', 'mistral', 'deepmind',
];
const JOB_KW_RE = new RegExp(JOB_KEYWORDS.join('|'), 'i');

// ── State management ──────────────────────────────────────────────
function loadState() {
  if (RESET) return { seen: [], pipeline: [] };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return { seen: [], pipeline: [] }; }
}
function saveState(s) {
  if (!DRY_RUN) writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// ── History dedup ─────────────────────────────────────────────────
function loadHistory() {
  try {
    const lines = readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
    return new Set(lines.map(l => l.split('\t')[0]));
  } catch { return new Set(); }
}

function inPipeline(url) {
  try {
    const content = readFileSync(PIPELINE_FILE, 'utf8');
    return content.includes(url);
  } catch { return false; }
}

// ── HTML entity decoder ───────────────────────────────────────────
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

// ── URL extractor ─────────────────────────────────────────────────
function extractJobUrls(rawText) {
  // Decode HTML entities so href="https://..." becomes accessible
  const text = decodeEntities(rawText);
  const found = new Set();
  for (const re of JOB_URL_PATTERNS) {
    re.lastIndex = 0;
    const matches = text.matchAll(re);
    for (const m of matches) {
      // Clean trailing punctuation and HTML artifacts
      const url = m[0].replace(/[.,;:!?)'"<>]+$/, '');
      if (url.length > 20) found.add(url);
    }
  }
  return [...found];
}

// ── RSS/HN fetcher ────────────────────────────────────────────────
async function fetchSource(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'career-ops/1.0 community-scan (bot)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const text = await res.text();

    if (source.type === 'hn') {
      return parseHN(text, source);
    }
    return parseRSS(text, source);
  } catch (e) {
    console.log(`  [${source.name}] fetch error: ${e.message}`);
    return [];
  }
}

function parseRSS(xml, source) {
  const posts = [];
  const itemRe = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeEntities((block.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim());
    const link  = (block.match(/<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/i)?.[1] || '').trim()
               || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '').trim();
    const desc  = (block.match(/<(?:description|content:encoded|content)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|content:encoded|content)>/i)?.[1] || '').trim();
    const fullText = `${title} ${decodeEntities(desc)}`;

    if (!JOB_KW_RE.test(fullText)) continue; // skip non-job posts

    const urls = extractJobUrls(fullText);
    // Also check if the post link itself is a job board URL
    if (link && JOB_URL_PATTERNS.some(re => { re.lastIndex=0; return re.test(link); })) {
      urls.push(link.replace(/[.,;:!?)'"]+$/, ''));
    }

    if (urls.length > 0) {
      posts.push({ title, urls, source: source.name, tier: source.tier });
    }
  }
  return posts;
}

function parseHN(json, source) {
  try {
    const data = JSON.parse(json);
    const posts = [];
    for (const hit of (data.hits || [])) {
      const text = `${hit.title || ''} ${hit.story_text || hit.comment_text || ''}`;
      const urls = extractJobUrls(text);
      if (urls.length > 0) {
        posts.push({ title: hit.title || 'HN post', urls, source: source.name, tier: source.tier });
      }
    }
    return posts;
  } catch { return []; }
}

// ── Pipeline writer ───────────────────────────────────────────────
function getTierSection(pipelineContent, tier) {
  // Find where Tier N section starts
  const tierRe = new RegExp(`^## Tier ${tier}`, 'm');
  const m = tierRe.exec(pipelineContent);
  return m ? m.index : -1;
}

function addToPipeline(url, tier, sourceNote) {
  const content = readFileSync(PIPELINE_FILE, 'utf8');
  const entry = `- [ ] ${url}`;

  // Find insertion point: after Tier section header, before next ## or end
  const tierRe = new RegExp(`(## Tier ${tier}[^\n]*\n)`, 'm');
  const m = tierRe.exec(content);

  let updated;
  if (m) {
    const insertAt = m.index + m[0].length;
    updated = content.slice(0, insertAt) + entry + '\n' + content.slice(insertAt);
  } else {
    // Fallback: append at end
    updated = content.trimEnd() + `\n\n## Tier ${tier} (community-sourced)\n${entry}\n`;
  }

  writeFileSync(PIPELINE_FILE, updated);
}

function logToHistory(url, source) {
  const line = `${url}\t${new Date().toISOString().slice(0,10)}\tcommunity\t${source}\n`;
  appendFileSync(HISTORY_FILE, line);
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] community-scan starting${DRY_RUN ? ' (DRY-RUN)' : ''}${RESET ? ' (RESET)' : ''}`);

  const state = loadState();
  const seen  = new Set(state.seen || []);
  const history = loadHistory();
  let added = 0;
  let skipped = 0;

  for (const source of SOURCES) {
    process.stdout.write(`  [${source.name}] fetching… `);
    const posts = await fetchSource(source);
    console.log(`${posts.length} job-relevant posts`);

    for (const post of posts) {
      for (const url of post.urls) {
        if (seen.has(url) || history.has(url) || inPipeline(url)) {
          skipped++;
          continue;
        }

        console.log(`    + ${url.slice(0, 80)} (T${post.tier} via ${post.source})`);

        if (!DRY_RUN) {
          addToPipeline(url, post.tier, post.source);
          logToHistory(url, post.source);
        }
        seen.add(url);
        added++;
      }
    }
  }

  state.seen = [...seen].slice(-5000); // cap memory
  saveState(state);

  console.log(`\n[community-scan] Done. Added: ${added} URLs  |  Skipped (dupes): ${skipped}`);
  if (added > 0 && !DRY_RUN) {
    console.log(`Run: node triage.mjs --limit=${Math.min(added * 2, 50)} to score new items`);
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
