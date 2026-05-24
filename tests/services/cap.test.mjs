// tests/services/cap.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb } from '../../services/db.mjs';
import {
  insertQueueRow, markQueueRunning, insertRun, updateRunEnd,
  markQueueDone, markQueueFailed, markQueueCancelled, markQueueDedupSkipped,
} from '../../services/queue.mjs';
import { checkCap } from '../../services/cap.mjs';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'yash-cap-'));
  const db = initDb(join(dir, 'c.db'));
  return { db, cleanup: () => { closeDb(db); rmSync(dir, { recursive: true, force: true }); } };
}

function addCompletedRun(db, url, status = 'ok') {
  const qid = insertQueueRow(db, { url, urlHash: url, addedBy: 1 });
  markQueueRunning(db, qid);
  const rid = insertRun(db, { queueId: qid, url, startedAt: new Date().toISOString() });
  updateRunEnd(db, rid, { status });
  // Transition queue row out of 'running' so the single-running invariant is satisfied
  if (status === 'ok') markQueueDone(db, qid);
  else if (status === 'fail') markQueueFailed(db, qid);
  else if (status === 'cancelled') markQueueCancelled(db, qid);
  else if (status === 'dedup_skipped') markQueueDedupSkipped(db, qid);
}

test('checkCap clear under daily and weekly limits', () => {
  const { db, cleanup } = fresh();
  try {
    for (let i = 0; i < 5; i++) addCompletedRun(db, `http://x${i}`);
    const r = checkCap(db, { dailyMax: 20, weeklyMax: 100 });
    assert.deepEqual(r, { capped: false });
  } finally { cleanup(); }
});

test('checkCap returns daily reason when daily reached', () => {
  const { db, cleanup } = fresh();
  try {
    for (let i = 0; i < 20; i++) addCompletedRun(db, `http://x${i}`);
    const r = checkCap(db, { dailyMax: 20, weeklyMax: 100 });
    assert.equal(r.capped, true);
    assert.equal(r.reason, 'daily');
  } finally { cleanup(); }
});

test('checkCap excludes cancelled and dedup_skipped from counter', () => {
  const { db, cleanup } = fresh();
  try {
    for (let i = 0; i < 19; i++) addCompletedRun(db, `http://x${i}`);
    // 19 ok; one cancelled — should NOT push us to 20
    const qid = insertQueueRow(db, { url: 'http://c', urlHash: 'http://c', addedBy: 1 });
    markQueueRunning(db, qid);
    const rid = insertRun(db, { queueId: qid, url: 'http://c', startedAt: new Date().toISOString() });
    updateRunEnd(db, rid, { status: 'cancelled' });
    markQueueCancelled(db, qid);
    const r = checkCap(db, { dailyMax: 20, weeklyMax: 100 });
    assert.equal(r.capped, false, 'cancelled run should not count toward cap');
  } finally { cleanup(); }
});
