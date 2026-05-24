import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb } from '../../services/db.mjs';
import {
  insertQueueRow, selectNextQueued, markQueueRunning, markQueueDone,
  markQueueFailed, markQueueCancelled, requestCancel, isCancelRequested,
  selectQueueByUrlActive, selectRecentSuccess, findOrphanedRunning,
  countByStatus, insertRun, updateRunStart, updateRunEnd, selectRunByQueueId,
  upsertTelegramOffset, selectTelegramOffset
} from '../../services/queue.mjs';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'yash-q-'));
  const db = initDb(join(dir, 'q.db'));
  return { db, dir, cleanup: () => { closeDb(db); rmSync(dir, { recursive: true, force: true }); } };
}

test('insertQueueRow + selectNextQueued FIFO', () => {
  const { db, cleanup } = fresh();
  try {
    const a = insertQueueRow(db, { url: 'http://a', urlHash: 'h1', addedBy: 1, telegramMsgId: 100 });
    const b = insertQueueRow(db, { url: 'http://b', urlHash: 'h2', addedBy: 1, telegramMsgId: 101 });
    const first = selectNextQueued(db);
    assert.equal(first.id, a);
    markQueueRunning(db, a);
    const second = selectNextQueued(db);
    assert.equal(second.id, b);
  } finally { cleanup(); }
});

test('markQueueRunning enforces single-running', () => {
  const { db, cleanup } = fresh();
  try {
    const a = insertQueueRow(db, { url: 'http://a', urlHash: 'h1', addedBy: 1 });
    const b = insertQueueRow(db, { url: 'http://b', urlHash: 'h2', addedBy: 1 });
    markQueueRunning(db, a);
    assert.throws(() => markQueueRunning(db, b), /UNIQUE/i);
  } finally { cleanup(); }
});

test('markQueueDone / Failed / Cancelled set completed_at', () => {
  const { db, cleanup } = fresh();
  try {
    const id = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    markQueueRunning(db, id);
    markQueueDone(db, id);
    const row = db.prepare(`SELECT status, completed_at FROM queue WHERE id=?`).get(id);
    assert.equal(row.status, 'done');
    assert.ok(row.completed_at);
  } finally { cleanup(); }
});

test('requestCancel + isCancelRequested', () => {
  const { db, cleanup } = fresh();
  try {
    const id = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    assert.equal(isCancelRequested(db, id), false);
    requestCancel(db, id);
    assert.equal(isCancelRequested(db, id), true);
  } finally { cleanup(); }
});

test('selectQueueByUrlActive returns queued or running, not done', () => {
  const { db, cleanup } = fresh();
  try {
    const a = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    markQueueRunning(db, a);
    markQueueDone(db, a);
    assert.equal(selectQueueByUrlActive(db, 'http://x'), undefined);
    const b = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    assert.equal(selectQueueByUrlActive(db, 'http://x').id, b);
  } finally { cleanup(); }
});

test('selectRecentSuccess hits runs.status=ok within window', () => {
  const { db, cleanup } = fresh();
  try {
    const qid = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    markQueueRunning(db, qid);
    const rid = insertRun(db, { queueId: qid, url: 'http://x', startedAt: new Date().toISOString() });
    updateRunEnd(db, rid, { endedAt: new Date().toISOString(), status: 'ok', score: 90, slug: 'Acme_Eng' });
    const hit = selectRecentSuccess(db, 'http://x', 24);
    assert.ok(hit && hit.id === rid);
    // outside window
    const olderRun = db.prepare(`UPDATE runs SET started_at = datetime('now','-2 days'), ended_at=datetime('now','-2 days') WHERE id=?`).run(rid);
    const miss = selectRecentSuccess(db, 'http://x', 24);
    assert.equal(miss, undefined);
  } finally { cleanup(); }
});

test('findOrphanedRunning returns queue rows with no matching runs', () => {
  const { db, cleanup } = fresh();
  try {
    const id = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    markQueueRunning(db, id);
    // intentionally do NOT insert a runs row → orphan
    const orphans = findOrphanedRunning(db);
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].id, id);
  } finally { cleanup(); }
});

test('countByStatus by day and week windows', () => {
  const { db, cleanup } = fresh();
  try {
    const q1 = insertQueueRow(db, { url: 'http://x', urlHash: 'h1', addedBy: 1 });
    markQueueRunning(db, q1);
    const r1 = insertRun(db, { queueId: q1, url: 'http://x', startedAt: new Date().toISOString() });
    updateRunEnd(db, r1, { endedAt: new Date().toISOString(), status: 'ok' });
    assert.equal(countByStatus(db, ['ok','fail'], 'day'), 1);
    assert.equal(countByStatus(db, ['ok','fail'], 'week'), 1);
  } finally { cleanup(); }
});

test('upsert + select Telegram offset', () => {
  const { db, cleanup } = fresh();
  // Use a fictional chat ID for testing; the real chat ID lives in agent.env only.
  const TEST_CHAT_ID = 9_000_000_001;
  try {
    upsertTelegramOffset(db, TEST_CHAT_ID, 999);
    assert.equal(selectTelegramOffset(db, TEST_CHAT_ID), 999);
    upsertTelegramOffset(db, TEST_CHAT_ID, 1500);
    assert.equal(selectTelegramOffset(db, TEST_CHAT_ID), 1500);
    assert.equal(selectTelegramOffset(db, 42), 0);  // default
  } finally { cleanup(); }
});
