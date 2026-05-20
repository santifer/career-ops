// lib/cron-health.mjs — Read recent scan-YYYY-MM-DD.log files and compute
// per-job health. Surfaces silent failures so future degradations like the
// imapflow / providers regressions of 2026-05-15 don't sit invisible for days.
//
// scan-unattended.mjs writes one log per day at data/logs/scan-YYYY-MM-DD.log
// with sections like:
//
//   --- scan.mjs ---
//   <stdout / stderr>
//   scan.mjs exit code: 0
//   --- scan-rss.mjs ---
//   …
//   --- scan-email.mjs ---
//   …
//
// This module walks the logs newest-first and extracts the most-recent
// run date + exit code per job, plus the most-recent date the job exited 0
// (used to compute "days since last success"). A job is HEALTHY when its
// last run exited 0 and the last success is within stale_days. FAILING when
// the last run had a non-zero exit. STALE when no success in stale_days but
// we lack a recent non-zero exit (e.g., the cron stopped firing entirely).
//
// Pure log-parser — no side effects, fully testable.

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOGS_DIR = join(ROOT, 'data/logs');

const TRACKED_JOBS = [
  { name: 'scan.mjs',       label: 'Portal scanner (Greenhouse/Ashby/Lever/Workable)', stale_days: 2 },
  { name: 'scan-rss.mjs',   label: 'RSS feeds (RemoteOK / WeWorkRemotely / HN Hiring)', stale_days: 2 },
  { name: 'scan-email.mjs', label: 'Email alerts (Gmail IMAP → pipeline.md)',           stale_days: 2 },
];

export function listScanLogs(dir = LOGS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => /^scan-\d{4}-\d{2}-\d{2}\.log$/.test(f))
    .sort()
    .reverse();
}

export function parseLog(text) {
  const sections = {};
  let current = null;
  for (const rawLine of text.split('\n')) {
    const start = rawLine.match(/^---\s+(.+?)\s+---$/);
    if (start) {
      current = start[1];
      if (!sections[current]) sections[current] = { exit_code: null };
      continue;
    }
    if (!current) continue;
    const ec = rawLine.match(/^(.+?)\s+exit code:\s*(-?\d+|null)\s*$/);
    if (ec && ec[1] === current) {
      sections[current].exit_code = ec[2] === 'null' ? null : parseInt(ec[2], 10);
    }
  }
  return sections;
}

function dateFromFilename(file) {
  const m = file.match(/^scan-(\d{4}-\d{2}-\d{2})\.log$/);
  return m ? m[1] : null;
}

function daysBetween(isoA, isoB) {
  const ms = new Date(isoB).getTime() - new Date(isoA).getTime();
  return Math.round(ms / 86_400_000);
}

function shortReasonFromSection(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    const m = ln.match(/^STDERR:\s*(.+)$/) || ln.match(/^Error:\s*(.+)$/);
    if (m) return m[1].slice(0, 140);
    if (/Cannot find package/.test(ln)) return ln.replace(/^.*?(Cannot find.+)$/, '$1').slice(0, 140);
  }
  return null;
}

export function getCronHealth({ today, logsDir } = {}) {
  const date = today || new Date().toISOString().slice(0, 10);
  const dir = logsDir || LOGS_DIR;
  const logs = listScanLogs(dir);

  const jobs = TRACKED_JOBS.map(j => ({
    name: j.name,
    label: j.label,
    stale_days: j.stale_days,
    last_run_date: null,
    last_run_exit: null,
    last_success_date: null,
    days_since_success: null,
    reason: null,
    status: 'unknown',
  }));

  for (const log of logs) {
    const runDate = dateFromFilename(log);
    if (!runDate) continue;
    let text;
    try { text = readFileSync(join(dir, log), 'utf-8'); }
    catch { continue; }
    const sections = parseLog(text);
    for (const job of jobs) {
      const sec = sections[job.name];
      if (!sec) continue;
      if (job.last_run_date === null) {
        job.last_run_date = runDate;
        job.last_run_exit = sec.exit_code;
        if (sec.exit_code !== 0 && sec.exit_code !== null) {
          const slice = text.split(`--- ${job.name} ---`)[1]?.split(/\n--- /)[0] || '';
          job.reason = shortReasonFromSection(slice);
        }
      }
      if (job.last_success_date === null && sec.exit_code === 0) {
        job.last_success_date = runDate;
      }
    }
  }

  for (const job of jobs) {
    if (job.last_success_date) {
      job.days_since_success = daysBetween(job.last_success_date, date);
    }
    if (job.last_run_date === null) {
      job.status = 'unknown';
    } else if (job.last_run_exit !== 0 && job.last_run_exit !== null) {
      job.status = 'failing';
    } else if (job.days_since_success !== null && job.days_since_success > job.stale_days) {
      job.status = 'stale';
    } else if (job.last_run_exit === 0) {
      job.status = 'healthy';
    } else {
      job.status = 'unknown';
    }
  }

  let overall;
  if (jobs.every(j => j.status === 'healthy')) overall = 'healthy';
  else if (jobs.some(j => j.status === 'failing')) overall = 'failing';
  else if (jobs.every(j => j.status === 'unknown')) overall = 'unknown';
  else overall = 'degraded';

  return { today: date, jobs, overall };
}
