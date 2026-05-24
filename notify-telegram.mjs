#!/usr/bin/env node

/**
 * notify-telegram.mjs — Daily Telegram digest for career-ops
 *
 * Reads today's new entries from data/scan-history.tsv, classifies
 * each by archetype, and sends a formatted digest to Telegram.
 * Zero API tokens — pure heuristics + Telegram Bot API.
 *
 * Config (in .env):
 *   TELEGRAM_BOT_TOKEN=bot123456:ABC-...
 *   TELEGRAM_CHAT_ID=123456789
 *
 * To find your chat ID:
 *   1. Start a conversation with @career_ops_bot_bot
 *   2. Visit https://api.telegram.org/bot<TOKEN>/getUpdates
 *   3. Copy "chat":{"id": <NUMBER>} from the response
 *
 * Usage:
 *   node notify-telegram.mjs              # today's new matches
 *   node notify-telegram.mjs --date 2026-05-23   # specific date
 *   node notify-telegram.mjs --dry-run    # print message, don't send
 */

import { readFileSync, existsSync } from 'fs';

// ── Config ────────────────────────────────────────────────────────────

const SCAN_HISTORY_PATH = 'data/scan-history.tsv';

// ── Helpers ───────────────────────────────────────────────────────────

function readEnv(path = '.env') {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// Dream-tier companies — surface these first regardless of archetype
const DREAM_TIER = new Set([
  'anthropic', 'openai', 'google deepmind', 'mistral ai', 'cohere',
  'lakera', 'robust intelligence', 'hiddenlayer', 'crowdstrike',
  'sentinelone', 'ping identity', 'tempus', 'abridge', 'ambience healthcare',
]);

function isDream(company) {
  return DREAM_TIER.has(company.toLowerCase().trim());
}

// Heuristic archetype from job title — ordered most-specific first
function archetype(title) {
  const t = title.toLowerCase();
  if (/clinical ai|healthcare ai|health ai|oncology|ehr|emr/.test(t))  return 'Healthcare AI';
  if (/ai security|llm security|model security|ai guard|ai safety/.test(t)) return 'AI Security';
  if (/ai governance|ai policy|ai compliance/.test(t))                  return 'AI Governance';
  if (/llm|llmops|mlops|applied ai|ai platform|ai infra|agentic|genai|generative ai|mcp/.test(t)) return 'AI Platform';
  if (/agent/.test(t))                                                  return 'AI Agent';
  if (/identity|zero trust|sso|saml/.test(t))                          return 'Identity/IAM';
  if (/cloud security|devsecops|appsec|security engineer|cybersecurity|cspm|siem|\biam\b/.test(t)) return 'Cloud Security';
  if (/site reliability|sre|reliability engineer|platform engineer/.test(t)) return 'SRE/Platform';
  if (/solutions architect|forward deployed|customer engineer|deployed engineer/.test(t)) return 'Solutions Arch';
  if (/automation engineer/.test(t))                                    return 'Automation';
  if (/\bai\b|machine learning|\bml\b/.test(t))                         return 'AI/ML';
  return 'Engineering';
}

// Truncate URLs for display (keep portal domain + ID)
function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.host.replace('job-boards.', '').replace('jobs.', '') + u.pathname.slice(0, 40);
  } catch {
    return url.slice(0, 60);
  }
}

// ── Telegram sender ───────────────────────────────────────────────────

async function sendTelegram(token, chatId, text) {
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Telegram error ${resp.status}: ${JSON.stringify(err)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateIdx = args.indexOf('--date');
const dateArg = args.find(a => a.startsWith('--date='))?.split('=')[1]
  ?? (dateIdx !== -1 ? args[dateIdx + 1] : undefined);
const targetDate = dateArg || todayDate();

const env = readEnv('.env');
const TOKEN = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

if (!dryRun && (!TOKEN || !CHAT_ID)) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
  console.error('Add them to .env or set as env vars. Run with --dry-run to test without sending.');
  process.exit(1);
}

if (!existsSync(SCAN_HISTORY_PATH)) {
  console.log('No scan history yet — run `node scan.mjs` first.');
  process.exit(0);
}

// Parse scan-history.tsv — header: url\tfirst_seen\tportal\ttitle\tcompany\tstatus
const rows = readFileSync(SCAN_HISTORY_PATH, 'utf-8')
  .split('\n')
  .slice(1)               // skip header
  .filter(Boolean)
  .map(line => {
    const [url, first_seen, portal, title, company] = line.split('\t');
    return { url, first_seen, portal, title: (title || '').trim(), company: (company || '').trim() };
  })
  .filter(r => r.first_seen === targetDate);

if (rows.length === 0) {
  console.log(`No new matches for ${targetDate} — nothing to send.`);
  process.exit(0);
}

// Classify + sort: dream-tier first, then by archetype
const classified = rows.map(r => ({
  ...r,
  arch: archetype(r.title),
  dream: isDream(r.company),
}));
classified.sort((a, b) => {
  if (a.dream !== b.dream) return a.dream ? -1 : 1;
  return a.arch.localeCompare(b.arch);
});

// Build message (cap at 20 jobs to stay under Telegram's 4096-char limit)
const MAX_JOBS = 20;
const shown = classified.slice(0, MAX_JOBS);
const overflow = classified.length - shown.length;

const dreamJobs = shown.filter(j => j.dream);
const otherJobs = shown.filter(j => !j.dream);

let msg = `<b>career-ops scan · ${targetDate}</b>\n`;
msg += `${classified.length} new match${classified.length !== 1 ? 'es' : ''}\n`;
msg += '━━━━━━━━━━━━━━━━━━━━━━\n';

if (dreamJobs.length > 0) {
  msg += '\n⭐ <b>DREAM TIER</b>\n';
  for (const j of dreamJobs) {
    msg += `• <b>${j.company}</b> — ${j.title}\n`;
    msg += `  [${j.arch}] <a href="${j.url}">${shortUrl(j.url)}</a>\n`;
  }
}

if (otherJobs.length > 0) {
  let lastArch = '';
  for (const j of otherJobs) {
    if (j.arch !== lastArch) {
      msg += `\n<b>${j.arch}</b>\n`;
      lastArch = j.arch;
    }
    msg += `• <b>${j.company}</b> — ${j.title}\n`;
    msg += `  <a href="${j.url}">${shortUrl(j.url)}</a>\n`;
  }
}

if (overflow > 0) {
  msg += `\n<i>+${overflow} more — check pipeline.md</i>\n`;
}

msg += `\n<i>→ /career-ops pipeline to evaluate</i>`;

if (dryRun) {
  console.log('\n── DRY RUN — message that would be sent ──\n');
  console.log(msg);
  console.log('\n──────────────────────────────────────────');
} else {
  await sendTelegram(TOKEN, CHAT_ID, msg);
  console.log(`✓ Sent digest to Telegram: ${classified.length} matches for ${targetDate}`);
}
