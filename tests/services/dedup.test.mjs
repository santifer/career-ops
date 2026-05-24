// tests/services/dedup.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb } from '../../services/db.mjs';
import { insertQueueRow, markQueueRunning, markQueueDone, insertRun, updateRunEnd } from '../../services/queue.mjs';
import { checkDuplicate } from '../../services/dedup.mjs';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'yash-d-'));
  const db = initDb(join(dir, 'd.db'));
  return { db, cleanup: () => { closeDb(db); rmSync(dir, { recursive: true, force: true }); } };
}

test('no duplicate when URL never seen', () => {
  const { db, cleanup } = fresh();
  try {
    const r = checkDuplicate(db, 'http://x');
    assert.equal(r.type, 'none');
  } finally { cleanup(); }
});

test('detects in-queue duplicate', () => {
  const { db, cleanup } = fresh();
  try {
    const id = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    const r = checkDuplicate(db, 'http://x');
    assert.equal(r.type, 'in_queue');
    assert.equal(r.existingId, id);
  } finally { cleanup(); }
});

test('detects recent-success duplicate within window', () => {
  const { db, cleanup } = fresh();
  try {
    const qid = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    markQueueRunning(db, qid);
    const rid = insertRun(db, { queueId: qid, url: 'http://x', startedAt: new Date().toISOString() });
    updateRunEnd(db, rid, { status: 'ok' });
    markQueueDone(db, qid);
    const r = checkDuplicate(db, 'http://x');
    assert.equal(r.type, 'recent_success');
  } finally { cleanup(); }
});

test('ignores recent failure (only ok counts as recent_success)', () => {
  const { db, cleanup } = fresh();
  try {
    const qid = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    markQueueRunning(db, qid);
    const rid = insertRun(db, { queueId: qid, url: 'http://x', startedAt: new Date().toISOString() });
    updateRunEnd(db, rid, { status: 'fail', error: 'tectonic' });
    // queue row is still 'running' — repair it to a non-active state so in-queue dedup doesn't shadow
    db.prepare(`UPDATE queue SET status='failed', completed_at=datetime('now') WHERE id=?`).run(qid);
    const r = checkDuplicate(db, 'http://x');
    assert.equal(r.type, 'none');
  } finally { cleanup(); }
});
