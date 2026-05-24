// tests/services/reboot-resume.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb } from '../../services/db.mjs';
import { insertQueueRow, markQueueRunning, insertRun, upsertCheckpoint } from '../../services/queue.mjs';
import { analyzeRebootState, computeNextPhase, PHASE_ORDER } from '../../services/reboot-resume.mjs';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'yash-rr-'));
  const db = initDb(join(dir, 'r.db'));
  return { db, cleanup: () => { closeDb(db); rmSync(dir, { recursive: true, force: true }); } };
}

test('computeNextPhase advances from _end to next _start; url_end is terminal', () => {
  assert.equal(computeNextPhase('jd_fetch_end'), 'resume_gen_start');
  assert.equal(computeNextPhase('resume_gen_end'), 'resume_compile_start');
  assert.equal(computeNextPhase('cl_compile_end'), 'url_end');
  assert.equal(computeNextPhase('url_end'), null);
});

test('analyzeRebootState clean — 0 running rows → null', () => {
  const { db, cleanup } = fresh();
  try {
    const id = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    // never marked running
    assert.deepEqual(analyzeRebootState(db), { state: 'clean' });
  } finally { cleanup(); }
});

test('analyzeRebootState repair — running row with no runs row', () => {
  const { db, cleanup } = fresh();
  try {
    const id = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    markQueueRunning(db, id);
    // no insertRun() call — orphan
    const r = analyzeRebootState(db);
    assert.equal(r.state, 'repair');
    assert.equal(r.queueId, id);
  } finally { cleanup(); }
});

test('analyzeRebootState resume — running row + runs row + checkpoint', () => {
  const { db, cleanup } = fresh();
  try {
    const qid = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    markQueueRunning(db, qid);
    const rid = insertRun(db, { queueId: qid, url: 'http://x', startedAt: new Date().toISOString() });
    upsertCheckpoint(db, { runId: rid, lastPhase: 'resume_gen_end', inputsPath: '/tmp/h.json' });
    const r = analyzeRebootState(db);
    assert.equal(r.state, 'resume');
    assert.equal(r.queueId, qid);
    assert.equal(r.runId, rid);
    assert.equal(r.lastPhase, 'resume_gen_end');
    assert.equal(r.nextPhase, 'resume_compile_start');
  } finally { cleanup(); }
});

test('analyzeRebootState restart_from_scratch — running but no checkpoint', () => {
  const { db, cleanup } = fresh();
  try {
    const qid = insertQueueRow(db, { url: 'http://x', urlHash: 'h', addedBy: 1 });
    markQueueRunning(db, qid);
    const rid = insertRun(db, { queueId: qid, url: 'http://x', startedAt: new Date().toISOString() });
    // no checkpoint
    const r = analyzeRebootState(db);
    assert.equal(r.state, 'restart_from_scratch');
    assert.equal(r.queueId, qid);
    assert.equal(r.runId, rid);
  } finally { cleanup(); }
});

test('analyzeRebootState corrupt — > 1 running rows', () => {
  const { db, cleanup } = fresh();
  try {
    // bypass our helpers and INSERT directly to force two running rows (defeats UNIQUE index by toggling status)
    const a = insertQueueRow(db, { url: 'http://x', urlHash: 'ha', addedBy: 1 });
    const b = insertQueueRow(db, { url: 'http://y', urlHash: 'hb', addedBy: 1 });
    // Cannot actually create > 1 running rows because UNIQUE index forbids it.
    // Simulate by deleting the index temporarily.
    db.exec('DROP INDEX queue_one_running');
    markQueueRunning(db, a);
    markQueueRunning(db, b);
    const r = analyzeRebootState(db);
    assert.equal(r.state, 'corrupt');
  } finally { cleanup(); }
});
