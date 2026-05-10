#!/usr/bin/env node
/**
 * signal-monitor.mjs — autonomous hiring signal monitor
 *
 * Watches company blogs/RSS feeds for product milestones (launches, new models,
 * agent frameworks, API updates). When a company posts something significant,
 * they typically open headcount within 48 hours. This script:
 *   1. Polls RSS/blog feeds every 6 hours (via launchd)
 *   2. Detects "product milestone" keywords in new posts
 *   3. Sends Telegram alert with the signal + jobs page link
 *   4. Optionally triggers scan.mjs for that company's portal
 *
 * Usage:
 *   node signal-monitor.mjs           # run one check cycle
 *   node signal-monitor.mjs --dry-run # show what would be alerted, no sends
 *   node signal-monitor.mjs --reset   # clear state (re-detect all as new)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { decodeHtmlEntities } from './lib/html-decode.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const STATE_FILE = join(ROOT, 'data/signal-monitor-state.json');
const DRY_RUN = process.argv.includes('--dry-run');
const RESET = process.argv.includes('--reset');

// ── Load credentials ──────────────────────────────────────────────
function loadEnv() {
  try {
    const text = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv();

// ── Company watch list ────────────────────────────────────────────
const COMPANIES = [
  {
    name: 'Anthropic',
    feeds: [
      'https://www.anthropic.com/rss.xml',
      'https://www.anthropic.com/news',
    ],
    jobs: 'https://www.anthropic.com/careers',
    portal: 'anthropic',
  },
  {
    name: 'OpenAI',
    feeds: [
      'https://openai.com/blog/rss.xml',
      'https://openai.com/blog',
    ],
    jobs: 'https://openai.com/careers',
    portal: 'openai',
  },
  {
    name: 'xAI',
    feeds: [
      'https://x.ai/blog',
      'https://x.ai/news',
    ],
    jobs: 'https://x.ai/careers',
    portal: 'xai',
  },
  {
    name: 'Perplexity',
    feeds: [
      'https://blog.perplexity.ai/rss',
      'https://blog.perplexity.ai',
    ],
    jobs: 'https://www.perplexity.ai/hub/careers',
    portal: 'perplexity',
  },
  {
    name: 'Groq',
    feeds: [
      'https://wow.groq.com/feed/',
      'https://wow.groq.com/news/',
    ],
    jobs: 'https://groq.com/careers/',
    portal: 'groq',
  },
  {
    name: 'Mistral',
    feeds: [
      'https://mistral.ai/news',
      'https://mistral.ai/feed',
    ],
    jobs: 'https://jobs.lever.co/mistral',
    portal: 'mistral',
  },
  {
    name: 'Sierra',
    feeds: [
      'https://sierra.ai/blog',
    ],
    jobs: 'https://sierra.ai/careers',
    portal: 'sierra',
  },
  {
    name: 'Databricks',
    feeds: [
      'https://www.databricks.com/blog/feed',
      'https://www.databricks.com/blog',
    ],
    jobs: 'https://www.databricks.com/company/careers/open-positions',
    portal: 'databricks',
  },
  {
    name: 'Cerebras',
    feeds: [
      'https://www.cerebras.ai/blog',
    ],
    jobs: 'https://jobs.ashbyhq.com/cerebras-systems',
    portal: 'cerebras',
  },
  {
    name: 'Cursor',
    feeds: [
      'https://www.cursor.com/blog',
      'https://changelog.cursor.com',
    ],
    jobs: 'https://www.cursor.com/careers',
    portal: 'cursor',
  },
  {
    name: 'DeepMind',
    feeds: [
      'https://deepmind.google/research/publications/',
      'https://blog.google/technology/ai/',
    ],
    jobs: 'https://deepmind.google/about/careers/',
    portal: 'deepmind',
  },
  {
    name: 'Hugging Face',
    feeds: [
      'https://huggingface.co/blog/feed.xml',
    ],
    jobs: 'https://apply.workable.com/huggingface/',
    portal: 'huggingface',
  },
];

// Keywords that signal headcount typically follows
const MILESTONE_KEYWORDS = [
  'launch', 'launched', 'launching', 'release', 'released', 'releasing',
  'introducing', 'announce', 'announced', 'ship', 'shipped', 'shipping',
  'new model', 'new agent', 'new api', 'api update', 'new sdk', 'new feature',
  'partnership', 'funding', 'series', 'raised', 'valuation',
  'general availability', 'ga', 'beta', 'public preview',
  'framework', 'platform', 'integration', 'open source', 'open-source',
  'research', 'paper', 'breakthrough', 'milestone',
];

// ── State management ──────────────────────────────────────────────
function loadState() {
  if (RESET) return {};
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(s) {
  if (!DRY_RUN) writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// ── Telegram sender ───────────────────────────────────────────────
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) { console.log('[Telegram] no credentials, skipping send'); return; }
  if (DRY_RUN) { console.log('[DRY-RUN] Would send Telegram:', text.slice(0, 80) + '...'); return; }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.error('[Telegram] send failed:', e.message);
  }
}

// ── RSS/HTML fetcher ──────────────────────────────────────────────
async function fetchFeed(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'career-ops/1.0 signal-monitor' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── Post extractor (RSS XML + HTML fallback) ──────────────────────
function extractPosts(html, sourceUrl) {
  const posts = [];

  // RSS/Atom XML
  const itemRe = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m = itemRe.exec(html)) !== null) {
    const block = m[1];
    const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || '';
    const link  = block.match(/<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim()
                || block.match(/<link[^>]*href="([^"]+)"/i)?.[1]?.trim() || '';
    const pubDate = block.match(/<(?:pubDate|published|updated)[^>]*>(.*?)<\/(?:pubDate|published|updated)>/i)?.[1]?.trim() || '';
    if (title) posts.push({ title: decodeHtmlEntities(title), link, pubDate });
  }

  // HTML fallback — look for article/blog post links with headlines
  if (posts.length === 0) {
    const headlineRe = /<h[123][^>]*>(.*?)<\/h[123]>/gi;
    while ((m = headlineRe.exec(html)) !== null) {
      const raw = m[1].replace(/<[^>]+>/g, '').trim();
      if (raw.length > 10 && raw.length < 200) {
        posts.push({ title: decodeHtmlEntities(raw), link: sourceUrl, pubDate: '' });
      }
    }
  }

  return posts.slice(0, 20); // cap per feed
}

// ── Milestone detector ────────────────────────────────────────────
function isMilestone(title) {
  const t = title.toLowerCase();
  return MILESTONE_KEYWORDS.some(kw => t.includes(kw));
}

// ── Trigger scan for a company ────────────────────────────────────
// scan.mjs `--company <substr>` does case-insensitive substring matching
// against the company name in portals.yml (scan.mjs:375). The `portal`
// field on each entry above is the slug we pass through.
function triggerScan(companyPortal) {
  if (DRY_RUN) { console.log(`[DRY-RUN] Would trigger scan.mjs for portal: ${companyPortal}`); return; }
  const result = spawnSync('node', [join(ROOT, 'scan.mjs'), '--company', companyPortal], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 120_000,
  });
  if (result.error) {
    console.error(`[signal-monitor] Scan trigger failed for ${companyPortal}: ${result.error.message}`);
  } else if (result.status !== 0) {
    console.error(`[signal-monitor] Scan exited with code ${result.status} for ${companyPortal}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] signal-monitor starting${DRY_RUN ? ' (DRY-RUN)' : ''}${RESET ? ' (RESET)' : ''}`);
  const state = loadState();
  const alerts = [];

  for (const company of COMPANIES) {
    const seenKey = company.name;
    const seen = new Set(state[seenKey] || []);
    const newSeen = new Set(seen);
    const triggered = [];

    for (const feedUrl of company.feeds) {
      const html = await fetchFeed(feedUrl);
      if (!html) {
        console.log(`  [${company.name}] feed unreachable: ${feedUrl}`);
        continue;
      }

      const posts = extractPosts(html, feedUrl);
      for (const post of posts) {
        const id = post.link || post.title;
        if (seen.has(id)) continue; // already processed
        newSeen.add(id);

        if (isMilestone(post.title)) {
          triggered.push(post);
          console.log(`  🚨 [${company.name}] SIGNAL: "${post.title}"`);
        } else {
          console.log(`  ℹ️  [${company.name}] new post (no milestone): "${post.title.slice(0, 60)}"`);
        }
      }
    }

    if (triggered.length > 0) {
      const postLines = triggered.map(p => `• <a href="${p.link || company.jobs}">${p.title}</a>`).join('\n');
      const msg = [
        `🚨 <b>Hiring signal — ${company.name}</b>`,
        '',
        `New product post(s) detected — headcount often opens within 48h:`,
        postLines,
        '',
        `👉 Check jobs now: ${company.jobs}`,
        ``,
        `<i>To scan their portal: run node scan.mjs from career-ops</i>`,
      ].join('\n');

      alerts.push({ company: company.name, count: triggered.length });
      await sendTelegram(msg);
      triggerScan(company.portal);
    }

    state[seenKey] = [...newSeen];
  }

  saveState(state);

  if (alerts.length === 0) {
    console.log('[signal-monitor] No new milestones detected this cycle.');
  } else {
    const summary = alerts.map(a => `${a.company} (${a.count})`).join(', ');
    console.log(`[signal-monitor] Alerts sent for: ${summary}`);
  }

  console.log(`[${new Date().toISOString()}] signal-monitor done.`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
