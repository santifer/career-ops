/**
 * lib/job-runs-ledger.mjs
 *
 * SQLite-backed ledger for tracking scraper and scheduler job runs.
 * Used by P1-6 (ledger) and P1-5 (dashboard widget / /api/job-runs-status).
 *
 * All public functions are wrapped in try/catch so a ledger write failure
 * never propagates to the calling job — the job continues regardless.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hostname } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEFAULT_DB_PATH = join(ROOT, 'data', 'job-runs.sqlite');

const _HOST = hostname();

let _db = null;
let _dbPath = null;

function openDb(dbPath = DEFAULT_DB_PATH) {
  if (_db && _dbPath === dbPath) return _db;
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _dbPath = dbPath;
  return _db;
}

export function initSchema(dbPath = DEFAULT_DB_PATH) {
  try {
    const db = openDb(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_runs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name     TEXT    NOT NULL,
        started_at   TEXT    NOT NULL,
        finished_at  TEXT,
        status       TEXT    NOT NULL,
        urls_found   INTEGER,
        error        TEXT,
        host         TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
        ON job_runs(job_name, started_at DESC);
    `);
  } catch (_) {
    // Ledger failure must never surface to callers.
  }
}

/**
 * Record a job start. Returns the new run ID, or null if the insert fails.
 * @param {string} jobName
 * @param {string} [dbPath]
 * @returns {number|null}
 */
export function startRun(jobName, dbPath = DEFAULT_DB_PATH) {
  try {
    initSchema(dbPath);
    const db = openDb(dbPath);
    const stmt = db.prepare(
      `INSERT INTO job_runs (job_name, started_at, status, host)
       VALUES (?, ?, 'running', ?)`
    );
    const result = stmt.run(jobName, new Date().toISOString(), _HOST);
    return result.lastInsertRowid ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * Finalise a run.
 * @param {number|null} runId   — returned by startRun; no-op if null
 * @param {{ status: 'ok'|'fail'|'skipped', urls_found?: number|null, error?: string|null }} opts
 * @param {string} [dbPath]
 */
export function finishRun(runId, { status, urls_found = null, error = null } = {}, dbPath = DEFAULT_DB_PATH) {
  if (runId == null) return;
  try {
    initSchema(dbPath);
    const db = openDb(dbPath);
    const stmt = db.prepare(
      `UPDATE job_runs
          SET finished_at = ?, status = ?, urls_found = ?, error = ?
        WHERE id = ?`
    );
    stmt.run(new Date().toISOString(), status ?? 'fail', urls_found, error ? String(error).slice(0, 2000) : null, runId);
  } catch (_) {
    // Ledger failure must never surface to callers.
  }
}

/**
 * Return the most recent `limit` finished runs for a given job (newest first).
 * Returns [] if no data or on error.
 * @param {string} jobName
 * @param {number} [limit=20]
 * @param {string} [dbPath]
 * @returns {object[]}
 */
export function recentRuns(jobName, limit = 20, dbPath = DEFAULT_DB_PATH) {
  try {
    initSchema(dbPath);
    const db = openDb(dbPath);
    return db.prepare(
      `SELECT * FROM job_runs
        WHERE job_name = ?
        ORDER BY started_at DESC
        LIMIT ?`
    ).all(jobName, limit);
  } catch (_) {
    return [];
  }
}

/**
 * Return the most recently *finished* run for a job (status != 'running'),
 * or null if none exists or on error.
 * @param {string} jobName
 * @param {string} [dbPath]
 * @returns {object|null}
 */
export function lastFinishedRun(jobName, dbPath = DEFAULT_DB_PATH) {
  try {
    initSchema(dbPath);
    const db = openDb(dbPath);
    return db.prepare(
      `SELECT * FROM job_runs
        WHERE job_name = ? AND status != 'running'
        ORDER BY started_at DESC
        LIMIT 1`
    ).get(jobName) ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * Convenience: close the cached DB connection (useful in tests with tmp paths).
 */
export function _closeDb() {
  try { if (_db) _db.close(); } catch (_) {}
  _db = null;
  _dbPath = null;
}
