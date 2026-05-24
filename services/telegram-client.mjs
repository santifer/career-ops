// services/telegram-client.mjs
// Vanilla node:https (and node:http for test override) Telegram Bot API client.
// Zero third-party deps — only node:https, node:http, node:fs, node:path.
//
// Env:
//   TELEGRAM_BOT_TOKEN  (required)
//   TELEGRAM_API_BASE   (default: https://api.telegram.org/bot)
//                       Test override points to a local mock HTTP server.

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Env vars are READ on every call (not at module-load) so importing this
// module is safe in any environment. The check fires only when an API is invoked.
function envBase() { return process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org/bot'; }
function envToken() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN env var is required');
  return t;
}

/** Choose http or https module based on URL scheme. */
function chooseClient(urlStr) {
  return urlStr.startsWith('https://') ? https : http;
}

/** POST a JSON body to a Bot API method. Returns the parsed `result` field. */
function postJSON(method, payload) {
  const urlStr = `${envBase()}${envToken()}/${method}`;
  const body = JSON.stringify(payload);
  const url = new URL(urlStr);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const client = chooseClient(urlStr);
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { return reject(new Error(`JSON parse error: ${e.message} — body: ${data.slice(0, 200)}`)); }
        if (!parsed.ok) return reject(new Error(`Telegram API error: ${parsed.description ?? JSON.stringify(parsed)}`));
        resolve(parsed.result);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * getUpdates — long-poll for new updates.
 * @param {object} opts
 * @param {number} [opts.offset=0]   - Exclude updates before this update_id.
 * @param {number} [opts.timeout=30] - Long-poll timeout in seconds.
 * @returns {Promise<object[]>} Array of update objects.
 */
export async function getUpdates({ offset = 0, timeout = 30 } = {}) {
  return postJSON('getUpdates', { offset, timeout });
}

/**
 * sendMessage — POST a text message to a chat.
 * @param {string} text           - Message text.
 * @param {object} opts
 * @param {number} opts.chatId    - Telegram chat ID.
 * @param {string} [opts.parseMode] - 'Markdown' | 'HTML' | undefined.
 * @returns {Promise<object>} The sent message object.
 */
export async function sendMessage(text, { chatId, parseMode } = {}) {
  const payload = { chat_id: chatId, text };
  if (parseMode) payload.parse_mode = parseMode;
  return postJSON('sendMessage', payload);
}

/**
 * sendDocument — multipart/form-data POST to upload a file to a chat.
 * @param {string} filePath         - Absolute path to the file.
 * @param {object} opts
 * @param {number} opts.chatId      - Telegram chat ID.
 * @param {string} [opts.caption]   - Optional caption text.
 * @returns {Promise<object>} The sent message object.
 */
export async function sendDocument(filePath, { chatId, caption } = {}) {
  const urlStr = `${envBase()}${envToken()}/sendDocument`;
  const url = new URL(urlStr);
  const boundary = `----TelegramBoundary${Date.now()}`;
  const filename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  // Build multipart body manually — no FormData polyfill needed in Node 22.
  const parts = [];

  // chat_id field
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
    `${chatId}\r\n`
  );

  // caption field (optional)
  if (caption) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="caption"\r\n\r\n` +
      `${caption}\r\n`
    );
  }

  // document field (binary)
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="document"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`);

  const textParts = Buffer.from(parts.join(''));
  const totalBody = Buffer.concat([textParts, preamble, fileBuffer, closing]);

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': totalBody.length,
    },
  };

  return new Promise((resolve, reject) => {
    const client = chooseClient(urlStr);
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { return reject(new Error(`JSON parse error: ${e.message}`)); }
        if (!parsed.ok) return reject(new Error(`Telegram API error: ${parsed.description ?? JSON.stringify(parsed)}`));
        resolve(parsed.result);
      });
    });
    req.on('error', reject);
    req.write(totalBody);
    req.end();
  });
}
