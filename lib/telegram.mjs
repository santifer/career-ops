/**
 * lib/telegram.mjs — Shared Telegram Bot API helper
 *
 * Used by notify-telegram.mjs, auto-pipeline.mjs, apply-orchestrator.mjs,
 * and telegram-listener.mjs. Centralizes .env reading, sendMessage, and
 * getUpdates so the Telegram logic isn't duplicated across four scripts.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── Config ────────────────────────────────────────────────────────────

/**
 * Read .env file and return key-value pairs.
 * @param {string} envPath — path to .env file (default: .env in cwd)
 */
export function loadEnv(envPath = '.env') {
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

/**
 * Load Telegram config from .env or process.env.
 * @param {string} envPath — path to .env file
 * @returns {{ token: string, chatId: string }}
 */
export function loadTelegramConfig(envPath = '.env') {
  const env = loadEnv(envPath);
  return {
    token: env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
  };
}

// ── API calls ─────────────────────────────────────────────────────────

const API_BASE = 'https://api.telegram.org/bot';

/**
 * Send a message to a Telegram chat.
 * @param {{ token: string }} config
 * @param {string} chatId
 * @param {string} text — HTML-formatted message body
 * @param {object} [options] — extra options (reply_to_message_id, etc.)
 * @returns {Promise<object>} — Telegram API response with message_id
 */
export async function sendMessage(config, chatId, text, options = {}) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options,
  };

  const resp = await fetch(`${API_BASE}${config.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Telegram sendMessage error ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data.result;
}

/**
 * Send a reply to a specific message.
 */
export async function sendReply(config, chatId, text, replyToMessageId) {
  return sendMessage(config, chatId, text, {
    reply_to_message_id: replyToMessageId,
  });
}

/**
 * Long-poll for new updates from the Telegram Bot API.
 * @param {{ token: string }} config
 * @param {number} offset — update_id offset (last processed + 1)
 * @param {number} [timeout=30] — long-poll timeout in seconds
 * @returns {Promise<Array>} — array of update objects
 */
export async function getUpdates(config, offset, timeout = 30) {
  const params = new URLSearchParams({
    timeout: String(timeout),
    allowed_updates: JSON.stringify(['message']),
  });
  if (offset) params.set('offset', String(offset));

  const resp = await fetch(`${API_BASE}${config.token}/getUpdates?${params}`, {
    signal: AbortSignal.timeout((timeout + 10) * 1000), // extra 10s for network
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Telegram getUpdates error ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data.result || [];
}
