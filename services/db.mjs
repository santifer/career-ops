// services/db.mjs
// SQLite schema + connection helper. Uses native `node:sqlite` (Node >= 22.5).
// All schema is idempotent (CREATE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS).

import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  url             TEXT    NOT NULL,
  url_hash        TEXT    NOT NULL,
  added_at        TEXT    NOT NULL,
  added_by        INTEGER NOT NULL,
  telegram_msg_id INTEGER,
  status          TEXT    NOT NULL DEFAULT 'queued',
  attempts        INTEGER NOT NULL DEFAULT 0,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  assigned_at     TEXT,
  completed_at    TEXT,
  CHECK (status IN ('queued','running','done','failed','cancelled','dedup_skipped'))
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_one_running ON queue(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS queue_url_active ON queue(url, status) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS queue_by_status ON queue(status, id);

CREATE TABLE IF NOT EXISTS runs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id           INTEGER NOT NULL REFERENCES queue(id),
  url                TEXT    NOT NULL,
  slug               TEXT,
  started_at         TEXT    NOT NULL,
  ended_at           TEXT,
  status             TEXT    NOT NULL,
  score              INTEGER,
  jd_path            TEXT,
  resume_pdf         TEXT,
  cover_letter_pdf   TEXT,
  tokens_in          INTEGER,
  tokens_out         INTEGER,
  cost_usd           REAL,
  git_sha            TEXT,
  claude_model       TEXT,
  phase_timings_json TEXT,
  error              TEXT
);
CREATE INDEX IF NOT EXISTS runs_started_at ON runs(started_at);
CREATE INDEX IF NOT EXISTS runs_status     ON runs(status, started_at);

CREATE TABLE IF NOT EXISTS telegram_state (
  chat_id        INTEGER PRIMARY KEY,
  last_update_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  run_id      INTEGER PRIMARY KEY REFERENCES runs(id),
  last_phase  TEXT NOT NULL,
  inputs_path TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
`;

export function initDb(path) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export function integrityCheck(db) {
  const row = db.prepare('PRAGMA integrity_check').get();
  if (!row) throw new Error('integrity_check PRAGMA returned no rows — DB may be unreadable');
  return row.integrity_check;
}

export function closeDb(db) {
  db.close();
}
