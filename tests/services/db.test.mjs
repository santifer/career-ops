import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, integrityCheck, closeDb } from '../../services/db.mjs';

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'yash-db-'));
  return { dir, path: join(dir, 'work-queue.db') };
}

test('initDb creates schema and returns a connection', () => {
  const { dir, path } = tempDbPath();
  try {
    const db = initDb(path);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
    assert.deepEqual(tables.sort(), ['checkpoints', 'queue', 'runs', 'telegram_state']);
    closeDb(db);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('queue table enforces single-running invariant', () => {
  const { dir, path } = tempDbPath();
  try {
    const db = initDb(path);
    db.prepare(`INSERT INTO queue(url, url_hash, added_at, added_by, status) VALUES('a', 'h1', '2026-05-24T00:00:00Z', 1, 'queued')`).run();
    db.prepare(`INSERT INTO queue(url, url_hash, added_at, added_by, status) VALUES('b', 'h2', '2026-05-24T00:00:01Z', 1, 'queued')`).run();
    db.prepare(`UPDATE queue SET status='running' WHERE url='a'`).run();
    assert.throws(
      () => db.prepare(`UPDATE queue SET status='running' WHERE url='b'`).run(),
      /UNIQUE constraint/i,
      'second running row must be rejected'
    );
    closeDb(db);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('queue status CHECK rejects invalid values', () => {
  const { dir, path } = tempDbPath();
  try {
    const db = initDb(path);
    assert.throws(
      () => db.prepare(`INSERT INTO queue(url, url_hash, added_at, added_by, status) VALUES('a','h','t',1,'bogus')`).run(),
      /CHECK constraint/i,
    );
    closeDb(db);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('initDb is idempotent (running twice on same file is safe)', () => {
  const { dir, path } = tempDbPath();
  try {
    const db1 = initDb(path); closeDb(db1);
    const db2 = initDb(path);
    db2.prepare(`INSERT INTO queue(url, url_hash, added_at, added_by, status) VALUES('a','h','t',1,'queued')`).run();
    const row = db2.prepare(`SELECT id FROM queue WHERE url='a'`).get();
    assert.ok(row && row.id);
    closeDb(db2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('integrityCheck returns "ok" on healthy DB', () => {
  const { dir, path } = tempDbPath();
  try {
    const db = initDb(path);
    assert.equal(integrityCheck(db), 'ok');
    closeDb(db);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('PRAGMA journal_mode is WAL after initDb', () => {
  const { dir, path } = tempDbPath();
  try {
    const db = initDb(path);
    const row = db.prepare('PRAGMA journal_mode').get();
    assert.equal(row.journal_mode, 'wal');
    closeDb(db);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('closeDb closes the connection (prepare after close throws)', () => {
  const { dir, path } = tempDbPath();
  try {
    const db = initDb(path);
    closeDb(db);
    assert.throws(() => db.prepare('SELECT 1').get(), /closed|not open|connection/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
