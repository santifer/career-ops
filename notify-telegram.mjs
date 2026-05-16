#!/usr/bin/env node

/**
 * notify-telegram.mjs — Telegram notifications for career-ops pipeline events
 *
 * Sends a Telegram message when new matches are found or interview invites
 * are detected. Works standalone or piped from other scan scripts.
 *
 * Zero Claude tokens — pure Telegram Bot API via native fetch.
 *
 * Setup:
 *   1. Message @BotFather on Telegram → /newbot → copy the token
 *   2. Start a chat with your bot (or add it to a group)
 *   3. Run: node notify-telegram.mjs --auth   to get your chat_id
 *   4. Add to config/profile.yml:
 *        telegram:
 *          bot_token: 123456789:ABC-xxx
 *          chat_id: "123456789"      # personal DM, or "-100xxx" for a group
 *
 * Usage:
 *   node notify-telegram.mjs --message "text"        # send a message directly
 *   node notify-telegram.mjs --digest                # daily summary from pipeline.md
 *   node notify-telegram.mjs --stdin                 # read JSON payload from stdin
 *   node notify-telegram.mjs --auth                  # test token + print chat_id
 *
 * Pipe from scan scripts (JSON on stdout):
 *   node scan.mjs --since 24h --json | node notify-telegram.mjs --stdin
 */

import { readFileSync, existsSync } from 'fs';
import { load as loadYaml } from 'js-yaml';

// ── Constants ────────────────────────────────────────────────────────
const TELEGRAM_BASE     = 'https://api.telegram.org';
const PIPELINE_PATH     = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';
const PROFILE_PATH      = 'config/profile.yml';
const TODAY             = new Date().toISOString().slice(0, 10);

// ── CLI flags ────────────────────────────────────────────────────────
const AUTH_MODE   = process.argv.includes('--auth');
const DIGEST_MODE = process.argv.includes('--digest');
const STDIN_MODE  = process.argv.includes('--stdin');
const DRY_RUN     = process.argv.includes('--dry-run');

const msgArgIdx = process.argv.indexOf('--message');
const MESSAGE   = msgArgIdx !== -1 ? process.argv[msgArgIdx + 1] : null;

// ── Config ───────────────────────────────────────────────────────────
function loadConfig() {
  let profile = {};
  if (existsSync(PROFILE_PATH)) {
    profile = loadYaml(readFileSync(PROFILE_PATH, 'utf8')) || {};
  } else {
    console.warn('⚠️  config/profile.yml not found — falling back to environment variables.');
  }
  const t = profile.telegram || {};
  const botToken = t.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = t.chat_id   || process.env.TELEGRAM_CHAT_ID;

  if (!AUTH_MODE && (!botToken || !chatId)) {
    console.error(
      '❌  Telegram not configured.\n' +
      '    Add to config/profile.yml:\n' +
      '      telegram:\n' +
      '        bot_token: 123456789:ABC-xxx\n' +
      '        chat_id: "123456789"\n' +
      '    Or set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID env vars.\n' +
      '    Run: node notify-telegram.mjs --auth   to find your chat_id.'
    );
    process.exit(1);
  }
  return { botToken, chatId };
}

// ── Fetch with timeout ────────────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── URL sanitizer ─────────────────────────────────────────────────────
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return encodeURI(decodeURI(parsed.toString())).replace(/"/g, '%22').replace(/'/g, '%27');
  } catch {
    return null;
  }
}

// ── Telegram API ─────────────────────────────────────────────────────
async function telegramFetch(method, body) {
  const { botToken } = loadConfig();
  const res = await fetchWithTimeout(`${TELEGRAM_BASE}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
  return data.result;
}

async function sendMessage(text) {
  if (DRY_RUN) {
    console.log('[dry-run] Would send to Telegram:');
    console.log('─'.repeat(40));
    console.log(text);
    console.log('─'.repeat(40));
    return;
  }
  const { chatId } = loadConfig();
  await telegramFetch('sendMessage', {
    chat_id:    chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

// ── Auth mode ─────────────────────────────────────────────────────────
async function runAuth() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
    || (existsSync(PROFILE_PATH) && loadYaml(readFileSync(PROFILE_PATH, 'utf8'))?.telegram?.bot_token);

  if (!botToken) {
    console.error('❌  No bot_token found. Set telegram.bot_token in config/profile.yml or TELEGRAM_BOT_TOKEN env var.');
    process.exit(1);
  }

  console.log('\nTesting Telegram bot token…');
  const res = await fetchWithTimeout(`${TELEGRAM_BASE}/bot${botToken}/getMe`);
  const data = await res.json();
  if (!data.ok) { console.error(`❌  Invalid token: ${data.description}`); process.exit(1); }
  console.log(`✅  Bot: @${data.result.username} (${data.result.first_name})`);

  console.log('\nFetching recent updates to find your chat_id…');
  console.log('(Send a message to your bot first if no updates appear)\n');
  const updates = await fetchWithTimeout(`${TELEGRAM_BASE}/bot${botToken}/getUpdates?limit=10`);
  const upData  = await updates.json();
  const chats   = new Map();
  for (const u of upData.result || []) {
    const chat = u.message?.chat || u.channel_post?.chat;
    if (chat) chats.set(chat.id, chat);
  }
  if (!chats.size) {
    console.log('  No recent messages. Send a message to your bot and re-run --auth.');
    return;
  }
  chats.forEach(chat => {
    const type = chat.type;
    const name = chat.title || `${chat.first_name || ''} ${chat.last_name || ''}`.trim();
    console.log(`  ${type === 'private' ? '👤' : '👥'} ${name} (${type})`);
    console.log(`     chat_id: "${chat.id}"`);
  });
  console.log('\nAdd chat_id to config/profile.yml under telegram:');
}

// ── Digest mode ───────────────────────────────────────────────────────
function buildDigest() {
  const lines = [];

  // New pipeline entries added today
  if (existsSync(PIPELINE_PATH)) {
    const md = readFileSync(PIPELINE_PATH, 'utf8');
    const sections = md.split('\n## ').filter(s => s.includes(TODAY));
    const newItems = [];
    for (const section of sections) {
      const matches = [...section.matchAll(/^- \[[ x]\] (https?:\/\/\S+) \| \([^)]+\) \| (.+)$/gm)];
      matches.forEach(m => newItems.push({ url: m[1], title: m[2] }));
    }
    if (newItems.length > 0) {
      lines.push(`<b>📥 New pipeline entries (${TODAY})</b>`);
      newItems.slice(0, 10).forEach(i => {
        const safeUrl = sanitizeUrl(i.url);
        lines.push(safeUrl
          ? `• <a href="${safeUrl}">${escapeHtml(i.title)}</a>`
          : `• ${escapeHtml(i.title)}`);
      });
      if (newItems.length > 10) lines.push(`  … and ${newItems.length - 10} more`);
      lines.push('');
    }
  }

  // Interview-stage entries from tracker
  if (existsSync(APPLICATIONS_PATH)) {
    const md = readFileSync(APPLICATIONS_PATH, 'utf8');
    const interviews = [...md.matchAll(/\| \d+ \| [\d-]+ \| ([^|]+) \| ([^|]+) \| [^|]* \| Interview[^|]*/gi)];
    if (interviews.length > 0) {
      lines.push(`<b>🎯 Active interviews (${interviews.length})</b>`);
      interviews.slice(0, 8).forEach(m => {
        const company = m[1].trim();
        const role    = m[2].trim();
        lines.push(`• ${escapeHtml(company)} — ${escapeHtml(role)}`);
      });
      lines.push('');
    }
  }

  if (!lines.length) return null;

  lines.unshift(`<b>career-ops daily digest — ${TODAY}</b>\n`);
  return lines.join('\n');
}

// ── Stdin / pipe mode ─────────────────────────────────────────────────
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}

function formatPipelinePayload(payload) {
  // Expected JSON shape from scan scripts (--json flag, future addition):
  // { source: string, date: string, items: [{ url, title, company, bucket }] }
  try {
    const { source, items = [] } = JSON.parse(payload);
    if (!items.length) return null;
    const lines = [`<b>📬 ${items.length} new job(s) found</b> via ${escapeHtml(source || 'scan')} — ${TODAY}\n`];
    const buckets = {};
    items.forEach(i => { (buckets[i.bucket || 'Other'] = buckets[i.bucket || 'Other'] || []).push(i); });
    for (const [bucket, entries] of Object.entries(buckets)) {
      lines.push(`<b>${escapeHtml(bucket)}</b>`);
      entries.slice(0, 5).forEach(e => {
        const co     = e.company ? ` (${escapeHtml(e.company)})` : '';
        const safeUrl = sanitizeUrl(e.url);
        lines.push(safeUrl
          ? `• <a href="${safeUrl}">${escapeHtml(e.title)}${co}</a>`
          : `• ${escapeHtml(e.title)}${co}`);
      });
      if (entries.length > 5) lines.push(`  … and ${entries.length - 5} more`);
    }
    return lines.join('\n');
  } catch {
    const safe = escapeHtml(payload);
    return safe.length > 4000 ? safe.slice(0, 4000) + '…' : safe;
  }
}

// ── HTML escaping ─────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  if (AUTH_MODE) { await runAuth(); return; }

  if (MESSAGE) {
    console.log('Sending message…');
    await sendMessage(MESSAGE);
    if (!DRY_RUN) console.log('✅  Sent.');
    return;
  }

  if (STDIN_MODE) {
    const raw = await readStdin();
    if (!raw) { console.log('No input received on stdin.'); return; }
    const text = formatPipelinePayload(raw);
    if (!text) { console.log('No notable items to notify.'); return; }
    await sendMessage(text);
    if (!DRY_RUN) console.log('✅  Sent.');
    return;
  }

  if (DIGEST_MODE) {
    const digest = buildDigest();
    if (!digest) { console.log('Nothing to report today.'); return; }
    await sendMessage(digest);
    if (!DRY_RUN) console.log('✅  Daily digest sent.');
    return;
  }

  // Default: print usage
  console.log([
    'notify-telegram.mjs — Telegram notifications for career-ops',
    '',
    'Usage:',
    '  node notify-telegram.mjs --message "text"   Send a message',
    '  node notify-telegram.mjs --digest           Daily pipeline summary',
    '  node notify-telegram.mjs --stdin            Read JSON payload from stdin',
    '  node notify-telegram.mjs --auth             Test token + print chat_id',
    '  node notify-telegram.mjs --dry-run [...]    Preview without sending',
    '',
    'Setup: add telegram.bot_token + telegram.chat_id to config/profile.yml',
  ].join('\n'));
}

main().catch(err => { console.error(err); process.exit(1); });
