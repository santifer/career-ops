// tests/services/telegram-listener.test.mjs
// 7 tests for telegram-listener (handleUpdate + parseCommand).
// Uses fictional chat_id 9_000_000_001 — never the real production chat ID.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb } from '../../services/db.mjs';
import { ALLOWLIST_REJECT, parseCommand, handleUpdate } from '../../services/telegram-listener.mjs';

// Fictional chat ID — NOT the real production chat ID.
const CHAT_ID = 9_000_000_001;
const ALLOW   = new Set([9_000_000_001]);

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'yash-tl-'));
  const db  = initDb(join(dir, 'tl.db'));
  return {
    db,
    dir,
    cleanup: () => { closeDb(db); rmSync(dir, { recursive: true, force: true }); },
  };
}

// Build a minimal Telegram update object.
function makeUpdate({ text = '', from_id = CHAT_ID, chat_id = CHAT_ID, update_id = 1 } = {}) {
  return {
    update_id,
    message: {
      message_id: update_id,
      from:  { id: from_id, is_bot: false, first_name: 'Yash' },
      chat:  { id: chat_id, type: 'private' },
      text,
    },
  };
}

// ── Test 1: parseCommand ────────────────────────────────────────────────────

test('parseCommand: splits /command and args', () => {
  assert.deepEqual(parseCommand('/add https://example.com'), { cmd: 'add', args: 'https://example.com' });
  assert.deepEqual(parseCommand('/status'), { cmd: 'status', args: '' });
  assert.deepEqual(parseCommand('/cancel 42'), { cmd: 'cancel', args: '42' });
  assert.deepEqual(parseCommand('/help'), { cmd: 'help', args: '' });
  assert.deepEqual(parseCommand('hello world'), { cmd: '', args: 'hello world' });
});

// ── Test 2: allowlist reject ────────────────────────────────────────────────

test('handleUpdate: non-allowlisted from.id returns ALLOWLIST_REJECT silently', async () => {
  const { db, cleanup } = fresh();
  try {
    const replies = [];
    const update  = makeUpdate({ from_id: 99999, chat_id: CHAT_ID });
    const result  = await handleUpdate({
      update,
      db,
      allowlist:    ALLOW,
      notifyChatId: CHAT_ID,
      send:         (msg) => replies.push(msg),
    });
    assert.equal(result, ALLOWLIST_REJECT, 'must return ALLOWLIST_REJECT sentinel');
    assert.equal(replies.length, 0, 'must not send any reply to non-allowlisted sender');
  } finally { cleanup(); }
});

// ── Test 3: /add valid URL inserts + replies ────────────────────────────────

test('handleUpdate: /add valid URL inserts into queue and replies queued', async () => {
  const { db, cleanup } = fresh();
  try {
    const replies = [];
    const update  = makeUpdate({ text: '/add https://jobs.example.com/senior-engineer', update_id: 10 });
    await handleUpdate({
      update,
      db,
      allowlist:    ALLOW,
      notifyChatId: CHAT_ID,
      send:         (msg) => replies.push(msg),
    });
    assert.equal(replies.length, 1, 'must send exactly one reply');
    assert.match(replies[0], /Queued|queued|✅/, 'reply must confirm queuing');
    // Verify DB row exists
    const row = db.prepare(`SELECT * FROM queue WHERE url=?`).get('https://jobs.example.com/senior-engineer');
    assert.ok(row, 'queue row must exist in DB');
    assert.equal(row.status, 'queued');
    assert.equal(row.added_by, CHAT_ID);
  } finally { cleanup(); }
});

// ── Test 4: /add rejects invalid URL (localhost) ────────────────────────────

test('handleUpdate: /add rejects localhost URL and replies with error', async () => {
  const { db, cleanup } = fresh();
  try {
    const replies = [];
    const update  = makeUpdate({ text: '/add http://localhost/secret', update_id: 20 });
    await handleUpdate({
      update,
      db,
      allowlist:    ALLOW,
      notifyChatId: CHAT_ID,
      send:         (msg) => replies.push(msg),
    });
    assert.equal(replies.length, 1, 'must reply with validation error');
    assert.match(replies[0], /invalid|Invalid|error|Error|❌/, 'reply must indicate failure');
    const count = db.prepare(`SELECT COUNT(*) AS n FROM queue`).get().n;
    assert.equal(count, 0, 'must not insert invalid URL into queue');
  } finally { cleanup(); }
});

// ── Test 5: /add detects in-queue duplicate ─────────────────────────────────

test('handleUpdate: /add duplicate URL already in queue replies with already-queued notice', async () => {
  const { db, cleanup } = fresh();
  try {
    const replies = [];
    const url = 'https://jobs.example.com/backend-dev';

    // First /add — succeeds
    await handleUpdate({
      update: makeUpdate({ text: `/add ${url}`, update_id: 30 }),
      db, allowlist: ALLOW, notifyChatId: CHAT_ID,
      send: (msg) => replies.push(msg),
    });
    assert.equal(replies.length, 1);
    assert.match(replies[0], /Queued|queued|✅/);

    // Second /add — same URL, still queued
    await handleUpdate({
      update: makeUpdate({ text: `/add ${url}`, update_id: 31 }),
      db, allowlist: ALLOW, notifyChatId: CHAT_ID,
      send: (msg) => replies.push(msg),
    });
    assert.equal(replies.length, 2, 'second /add must also send a reply');
    assert.match(replies[1], /already|duplicate|queue|ℹ️/i, 'second reply must say already queued');

    // Still only one DB row
    const count = db.prepare(`SELECT COUNT(*) AS n FROM queue`).get().n;
    assert.equal(count, 1, 'must not insert duplicate row');
  } finally { cleanup(); }
});

// ── Test 6: /cancel sets cancel_requested ──────────────────────────────────

test('handleUpdate: /cancel sets cancel_requested=1 and replies', async () => {
  const { db, cleanup } = fresh();
  try {
    const replies = [];

    // First insert a queued row directly via /add
    await handleUpdate({
      update: makeUpdate({ text: '/add https://jobs.example.com/pm-role', update_id: 40 }),
      db, allowlist: ALLOW, notifyChatId: CHAT_ID,
      send: (msg) => replies.push(msg),
    });
    const row = db.prepare(`SELECT id FROM queue`).get();
    assert.ok(row, 'queue row must exist before cancel');
    const queueId = row.id;

    // /cancel <id>
    await handleUpdate({
      update: makeUpdate({ text: `/cancel ${queueId}`, update_id: 41 }),
      db, allowlist: ALLOW, notifyChatId: CHAT_ID,
      send: (msg) => replies.push(msg),
    });

    assert.equal(replies.length, 2, 'must reply to /cancel');
    assert.match(replies[1], /cancel|🛑/i, 'cancel reply must mention cancellation');

    const updated = db.prepare(`SELECT cancel_requested FROM queue WHERE id=?`).get(queueId);
    assert.equal(updated.cancel_requested, 1, 'cancel_requested must be set to 1');
  } finally { cleanup(); }
});

// ── Test 7: /help replies with command list ─────────────────────────────────

test('handleUpdate: /help replies with command summary', async () => {
  const { db, cleanup } = fresh();
  try {
    const replies = [];
    const update  = makeUpdate({ text: '/help', update_id: 50 });
    await handleUpdate({
      update,
      db,
      allowlist:    ALLOW,
      notifyChatId: CHAT_ID,
      send:         (msg) => replies.push(msg),
    });
    assert.equal(replies.length, 1, '/help must send exactly one reply');
    // Help text must mention at least /add and /status
    assert.match(replies[0], /\/add/, 'help must mention /add');
    assert.match(replies[0], /\/status/, 'help must mention /status');
  } finally { cleanup(); }
});
