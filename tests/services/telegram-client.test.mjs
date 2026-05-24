// tests/services/telegram-client.test.mjs
// Two tests against a local mock HTTP server — zero real Telegram API calls.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Spin up a one-shot mock HTTP server on a random port, return { server, port }.
function createMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

test('getUpdates hits /getUpdates and returns parsed results', async () => {
  const capturedReqs = [];
  const mockUpdates = [
    { update_id: 1, message: { chat: { id: 42 }, text: '/add https://example.com' } },
    { update_id: 2, message: { chat: { id: 42 }, text: '/status' } },
  ];

  const { server, port } = await createMockServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      capturedReqs.push({ method: req.method, url: req.url, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: mockUpdates }));
    });
  });

  // Import with cache-buster so NODE caches don't mask implementation changes between test runs.
  const token = 'test-token-abc';
  process.env.TELEGRAM_BOT_TOKEN = token;
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${port}/bot`;

  const { getUpdates } = await import(`../../services/telegram-client.mjs?cb=${Date.now()}`);
  const result = await getUpdates({ offset: 0, timeout: 0 });

  server.close();

  // URL path must include /<token>/getUpdates
  assert.ok(capturedReqs.length >= 1, 'expected at least one request to mock server');
  const req = capturedReqs[0];
  assert.match(req.url, new RegExp(`${token}/getUpdates`), 'URL path must include token + method');
  assert.equal(Array.isArray(result), true, 'result should be an array');
  assert.equal(result.length, 2, 'should return 2 update objects');
  assert.equal(result[0].update_id, 1);
  assert.equal(result[1].update_id, 2);
});

test('sendMessage posts to /sendMessage with chat_id + text', async () => {
  const capturedReqs = [];
  const mockMsg = { message_id: 99, chat: { id: 42 }, text: 'Hello bot!' };

  const { server, port } = await createMockServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      capturedReqs.push({ method: req.method, url: req.url, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: mockMsg }));
    });
  });

  const token = 'test-token-xyz';
  process.env.TELEGRAM_BOT_TOKEN = token;
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${port}/bot`;

  const { sendMessage } = await import(`../../services/telegram-client.mjs?cb=${Date.now()}`);
  const result = await sendMessage('Hello bot!', { chatId: 42, parseMode: 'Markdown' });

  server.close();

  // Must POST (not GET) to /sendMessage
  assert.ok(capturedReqs.length >= 1, 'expected at least one request to mock server');
  const req = capturedReqs[0];
  assert.equal(req.method, 'POST', 'sendMessage must use POST');
  assert.match(req.url, new RegExp(`${token}/sendMessage`), 'URL path must include token + sendMessage');

  // Body must include chat_id and text
  const parsed = JSON.parse(req.body);
  assert.equal(parsed.chat_id, 42, 'chat_id must be 42');
  assert.equal(parsed.text, 'Hello bot!', 'text must match');
  assert.equal(parsed.parse_mode, 'Markdown', 'parse_mode must be forwarded');

  // Return value is the message object
  assert.equal(result.message_id, 99, 'returned message_id must match mock');
  assert.equal(result.text, 'Hello bot!', 'returned text must match mock');
});
