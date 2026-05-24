// tests/services/orchestrator.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb } from '../../services/db.mjs';
import { insertQueueRow } from '../../services/queue.mjs';
import { tickOnce } from '../../services/pipeline-orchestrator.mjs';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'yash-orch-'));
  mkdirSync(join(dir, 'ops/checkpoints'), { recursive: true });
  mkdirSync(join(dir, 'ops/runs'), { recursive: true });
  const db = initDb(join(dir, 'ops/work-queue.db'));
  return { db, dir, cleanup: () => { closeDb(db); rmSync(dir, { recursive: true, force: true }); } };
}

test('tickOnce: idle when queue empty', async () => {
  const { db, dir, cleanup } = fresh();
  try {
    const notifications = [];
    const r = await tickOnce({
      db, projectRoot: dir,
      capLimits: { dailyMax: 20, weeklyMax: 100 },
      gitSha: 'deadbee',
      claudeModel: 'claude-opus-4-7',
      spawn: async () => { throw new Error('should not spawn'); },
      notify: (msg) => notifications.push(msg),
    });
    assert.equal(r.action, 'idle');
    assert.equal(notifications.length, 0);
  } finally { cleanup(); }
});

test('tickOnce: spawns when queued, returns ok on clean exit', async () => {
  const { db, dir, cleanup } = fresh();
  try {
    insertQueueRow(db, { url: 'http://acme.com/job', urlHash: 'h1', addedBy: 1 });
    const notifications = [];
    const r = await tickOnce({
      db, projectRoot: dir,
      capLimits: { dailyMax: 20, weeklyMax: 100 },
      gitSha: 'cafebabe',
      claudeModel: 'claude-opus-4-7',
      spawn: async ({ url, runId }) => ({ exitCode: 0, durationMs: 1000, slug: 'Acme_Job', score: 91, jdPath: 'jds/yash/x.md', resumePdf: 'resumes/yash/x.pdf', coverLetterPdf: 'cover-letters/yash/x.pdf' }),
      notify: (msg) => notifications.push(msg),
    });
    assert.equal(r.action, 'completed_ok');
    assert.ok(notifications.some(n => /🚀/.test(n)), 'expected a start notification');
    assert.ok(notifications.some(n => /✅/.test(n)), 'expected a success notification');
    const queueRow = db.prepare('SELECT status FROM queue ORDER BY id DESC LIMIT 1').get();
    assert.equal(queueRow.status, 'done');
  } finally { cleanup(); }
});

test('tickOnce: marks failed and notifies on non-zero exit', async () => {
  const { db, dir, cleanup } = fresh();
  try {
    insertQueueRow(db, { url: 'http://acme.com/job', urlHash: 'h1', addedBy: 1 });
    const notifications = [];
    const r = await tickOnce({
      db, projectRoot: dir,
      capLimits: { dailyMax: 20, weeklyMax: 100 },
      gitSha: 'cafebabe',
      claudeModel: 'claude-opus-4-7',
      spawn: async () => ({ exitCode: 1, durationMs: 2000, error: 'tectonic exit 11', failedPhase: 'resume_compile_end' }),
      notify: (msg) => notifications.push(msg),
    });
    assert.equal(r.action, 'completed_fail');
    const queueRow = db.prepare('SELECT status FROM queue ORDER BY id DESC LIMIT 1').get();
    assert.equal(queueRow.status, 'failed');
    assert.ok(notifications.some(n => /❌/.test(n)));
  } finally { cleanup(); }
});

test('tickOnce: when cap reached, leaves queue alone and notifies once', async () => {
  const { db, dir, cleanup } = fresh();
  try {
    // seed 20 ok runs to trigger daily cap
    for (let i = 0; i < 20; i++) {
      const qid = insertQueueRow(db, { url: `http://x${i}`, urlHash: `h${i}`, addedBy: 1 });
      db.prepare(`UPDATE queue SET status='running', assigned_at=datetime('now') WHERE id=?`).run(qid);
      const r = db.prepare(`INSERT INTO runs(queue_id, url, started_at, status) VALUES(?,?,?,?)`).run(qid, `http://x${i}`, new Date().toISOString(), 'ok');
      db.prepare(`UPDATE runs SET ended_at=datetime('now') WHERE id=?`).run(Number(r.lastInsertRowid));
      db.prepare(`UPDATE queue SET status='done', completed_at=datetime('now') WHERE id=?`).run(qid);
    }
    insertQueueRow(db, { url: 'http://newcomer', urlHash: 'hn', addedBy: 1 });
    const notifications = [];
    const r = await tickOnce({
      db, projectRoot: dir,
      capLimits: { dailyMax: 20, weeklyMax: 100 },
      gitSha: 'cafebabe',
      claudeModel: 'claude-opus-4-7',
      spawn: async () => { throw new Error('should not spawn when capped'); },
      notify: (msg) => notifications.push(msg),
    });
    assert.equal(r.action, 'capped');
    assert.ok(notifications.some(n => /⏸️/.test(n)));
    const newcomer = db.prepare(`SELECT status FROM queue WHERE url='http://newcomer'`).get();
    assert.equal(newcomer.status, 'queued', 'capped URL stays queued for retry');
  } finally { cleanup(); }
});
