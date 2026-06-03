#!/usr/bin/env node

/**
 * reserve-eval-id.mjs - Reserve the next evaluation/report/tracker number.
 *
 * Agents must call this before writing a new report, PDF, or tracker TSV.
 * The script stores claimed-but-not-yet-merged numbers in data/eval-sequence.json
 * so parallel agents do not all choose the same "max existing + 1" value.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { acquireFileLock } from './scripts/file-lock.mjs';

const ROOT = process.env.CAREER_OPS_ROOT
  ? resolve(process.env.CAREER_OPS_ROOT)
  : dirname(fileURLToPath(import.meta.url));
const APPS_FILE = process.env.CAREER_OPS_TRACKER
  ? process.env.CAREER_OPS_TRACKER
  : existsSync(join(ROOT, 'data/applications.md'))
    ? join(ROOT, 'data/applications.md')
    : join(ROOT, 'applications.md');
const REPORTS_DIR = process.env.CAREER_OPS_REPORTS_DIR || join(ROOT, 'reports');
const ADDITIONS_DIR = process.env.CAREER_OPS_ADDITIONS_DIR || join(ROOT, 'batch/tracker-additions');
const SEQUENCE_FILE = process.env.CAREER_OPS_SEQUENCE_FILE || join(ROOT, 'data/eval-sequence.json');
const LOCK_ROOT = process.env.CAREER_OPS_LOCK_DIR || join(ROOT, 'data/.locks');
const LOCK_DIR = join(LOCK_ROOT, 'eval-sequence.lock');

const args = process.argv.slice(2);
const owner = argValue('--owner') || process.env.CAREER_OPS_RESERVATION_OWNER || 'agent';
const timeoutMs = numberArg('--timeout-ms', process.env.CAREER_OPS_LOCK_TIMEOUT_MS, 60_000);
const retryDelayMs = numberArg('--retry-ms', process.env.CAREER_OPS_LOCK_RETRY_MS, 75);
const staleMs = numberArg('--stale-ms', process.env.CAREER_OPS_LOCK_STALE_MS, 10 * 60_000);
const holdMs = numberArg('--hold-ms', process.env.CAREER_OPS_RESERVE_HOLD_MS, 0);

function argValue(name) {
  const exact = args.find(arg => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

function numberArg(name, envValue, fallback) {
  const raw = argValue(name) ?? envValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readText(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

function parseJsonOrDefault(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return fallback;
    throw new Error(`Could not parse ${path}: ${err.message}`);
  }
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmpPath, path);
}

function maxNumber(values) {
  return values
    .filter(Number.isInteger)
    .reduce((max, value) => Math.max(max, value), 0);
}

function maxFromTracker() {
  return maxNumber(readText(APPS_FILE)
    .split('\n')
    .map(line => {
      if (!line.startsWith('|') || line.includes('---')) return null;
      const num = parseInt(line.split('|')[1]?.trim(), 10);
      return Number.isInteger(num) ? num : null;
    }));
}

function maxFromReports() {
  if (!existsSync(REPORTS_DIR)) return 0;
  return maxNumber(readdirSync(REPORTS_DIR)
    .map(file => {
      const match = file.match(/^(\d{3,})-/);
      return match ? parseInt(match[1], 10) : null;
    }));
}

function numbersFromTrackerAddition(content) {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const fields = trimmed.startsWith('|')
    ? trimmed.split('|').map(part => part.trim()).filter(Boolean)
    : trimmed.split('\t').map(part => part.trim());
  const nums = [];
  const rowNum = parseInt(fields[0], 10);
  if (Number.isInteger(rowNum)) nums.push(rowNum);

  const reportMatch = trimmed.match(/\[(\d+)\]\(/);
  if (reportMatch) nums.push(parseInt(reportMatch[1], 10));

  return nums;
}

function maxFromPendingAdditions() {
  if (!existsSync(ADDITIONS_DIR)) return 0;

  return maxNumber(readdirSync(ADDITIONS_DIR)
    .filter(file => file.endsWith('.tsv'))
    .flatMap(file => numbersFromTrackerAddition(readText(join(ADDITIONS_DIR, file)))));
}

function reservationId(num) {
  return `${String(num).padStart(3, '0')}-${Date.now()}-${process.pid}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const lock = await acquireFileLock(LOCK_DIR, {
  owner: `reserve-eval-id:${owner}`,
  timeoutMs,
  retryDelayMs,
  staleMs,
});

try {
  const sequence = parseJsonOrDefault(SEQUENCE_FILE, {
    last_issued: 0,
    reservations: [],
  });
  const lastIssued = Number.isInteger(sequence.last_issued) ? sequence.last_issued : 0;
  const sourceMax = Math.max(maxFromTracker(), maxFromReports(), maxFromPendingAdditions());
  const previousMax = Math.max(lastIssued, sourceMax);
  const num = previousMax + 1;
  const reportNum = String(num).padStart(3, '0');
  const id = reservationId(num);
  const reservations = Array.isArray(sequence.reservations) ? sequence.reservations : [];

  sequence.last_issued = num;
  sequence.updated_at = new Date().toISOString();
  sequence.reservations = reservations.concat({
    id,
    num,
    report_num: reportNum,
    owner,
    status: 'reserved',
    created_at: sequence.updated_at,
  }).slice(-1000);

  writeJsonAtomic(SEQUENCE_FILE, sequence);

  if (holdMs > 0) await sleep(holdMs);

  console.log(JSON.stringify({
    num,
    report_num: reportNum,
    reservation_id: id,
    previous_max: previousMax,
    source_max: sourceMax,
    previous_last_issued: lastIssued,
    sequence_file: SEQUENCE_FILE,
    lock_wait_ms: lock.waitMs,
    lock_attempts: lock.attempts,
  }, null, 2));
} finally {
  lock.release();
}
