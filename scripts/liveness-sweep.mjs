#!/usr/bin/env node
/**
 * scripts/liveness-sweep.mjs — daily overnight liveness sweep.
 *
 * Iterates every active row in data/applications.md (status ∈
 * {Evaluated, Applied, Interview}), resolves the canonical JD URL via the
 * row's report Block A, probes liveness via lib/liveness.mjs, and applies
 * the configured mutation policy:
 *
 *   - status='Evaluated' + result='expired' → auto-mark Discarded (writes
 *     ⚠️ LINK EXPIRED note to the tracker)
 *   - status='Applied'|'Interview' + result='expired' → do NOT mutate; flag
 *     in data/liveness-state.json as needsReview (could mean hiring freeze,
 *     internal hire, etc. — needs Mitchell's eyes, not a silent discard)
 *   - result='uncertain' → never mutate; flag in liveness-state.json
 *   - result='active' → refresh lastChecked timestamp in liveness-state.json
 *
 * Schedule: 03:30 PT daily via
 *   ~/Library/LaunchAgents/com.mitchell.career-ops.liveness-sweep.plist
 * (post-scan at 02:00, pre-heartbeat at 09:00 so the heartbeat reads fresh
 * liveness state).
 *
 * Output:
 *   - data/liveness-state.json (sidecar — read by dashboard + heartbeat)
 *   - data/logs/liveness-sweep-{YYYY-MM-DD}.log (per-run audit trail)
 *
 * Exit codes:
 *   0 — success (any combination of active/expired/uncertain handled cleanly)
 *   1 — fatal error (parse failure, no rows found, etc.)
 *
 * Usage:
 *   node scripts/liveness-sweep.mjs                    # full sweep
 *   node scripts/liveness-sweep.mjs --dry-run          # check only, no tracker writes
 *   node scripts/liveness-sweep.mjs --rows=44,1357     # subset
 *   node scripts/liveness-sweep.mjs --concurrency=3    # override default 5
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseApplicationsFile } from '../lib/parse-applications.mjs';
import { poolMap } from '../lib/fetch-utils.mjs';
import { verifyApplyNowLink, markRowAsExpired } from '../lib/liveness.mjs';
import { getCachedUrl } from '../lib/resolve-ats-url.mjs';
import { hc } from '../lib/healthchecks-ping.mjs';
import { startRun, finishRun } from '../lib/job-runs-ledger.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SUBSET = (() => {
  const arg = args.find(a => a.startsWith('--rows='));
  if (!arg) return null;
  return new Set(arg.slice(7).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)));
})();
const CONCURRENCY = (() => {
  const arg = args.find(a => a.startsWith('--concurrency='));
  if (!arg) return 5;
  const n = parseInt(arg.slice(14), 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
})();

const ACTIVE_STATUSES = new Set(['Evaluated', 'Applied', 'Interview']);

const STATE_PATH = join(ROOT, 'data/liveness-state.json');
const LOG_DIR = join(ROOT, 'data/logs');
const LOG_PATH = join(LOG_DIR, `liveness-sweep-${new Date().toISOString().slice(0, 10)}.log`);

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  ensureLogDir();
  appendFileSync(LOG_PATH, stamped + '\n');
}

function getReportUrl(reportPath) {
  if (!reportPath) return '';
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return '';
  const text = readFileSync(fullPath, 'utf-8').slice(0, 2000);
  const m = text.match(/\*\*URL:\*\*\s*(\S+)/);
  if (!m) return '';
  return getCachedUrl(m[1], ROOT);
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { runs: [], rows: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    log('Warning: liveness-state.json unparseable, starting fresh.');
    return { runs: [], rows: {} };
  }
}

function saveState(state) {
  if (DRY_RUN) {
    log('DRY RUN — would have written liveness-state.json');
    return;
  }
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function main() {
  log('--- liveness-sweep starting ---');
  log(`mode=${DRY_RUN ? 'dry-run' : 'live'} concurrency=${CONCURRENCY}${SUBSET ? ` subset=[${[...SUBSET].join(',')}]` : ''}`);

  const APPLICATIONS = join(ROOT, 'data/applications.md');
  if (!existsSync(APPLICATIONS)) {
    log('FATAL: data/applications.md not found.');
    process.exit(1);
  }

  const allRows = parseApplicationsFile(APPLICATIONS);
  const activeRows = allRows.filter(r =>
    ACTIVE_STATUSES.has(r.status) && (!SUBSET || SUBSET.has(r.num))
  );
  log(`Loaded ${allRows.length} rows; ${activeRows.length} active (status ∈ {Evaluated, Applied, Interview}).`);

  if (activeRows.length === 0) {
    log('Nothing to sweep — exiting.');
    process.exit(0);
  }

  // Resolve URLs + probe in parallel via poolMap (same 5-way pool the heartbeat uses).
  const probed = await poolMap(
    activeRows,
    async (r) => {
      const url = getReportUrl(r.reportPath);
      const result = url
        ? await verifyApplyNowLink(url)
        : { result: 'no-url', reason: 'no URL in Block A' };
      return { row: r, url, result };
    },
    CONCURRENCY,
  );

  const state = loadState();
  const nowIso = new Date().toISOString();
  const summary = { active: 0, expired_discarded: 0, expired_needs_review: 0, uncertain: 0, no_url: 0 };

  for (const { row, url, result } of probed) {
    const key = String(row.num);
    const stateRow = state.rows[key] || {};

    if (result.result === 'active') {
      summary.active++;
      state.rows[key] = { ...stateRow, status: 'active', url, lastChecked: nowIso, reason: result.reason };
    } else if (result.result === 'expired') {
      if (row.status === 'Evaluated') {
        if (!DRY_RUN) {
          markRowAsExpired(row.num, result.reason);
        } else {
          log(`  DRY-RUN: would mark row #${row.num} as Discarded (${result.reason})`);
        }
        summary.expired_discarded++;
        state.rows[key] = { ...stateRow, status: 'expired_discarded', url, lastChecked: nowIso, reason: result.reason };
      } else {
        // Applied or Interview — needs Mitchell's eyes, don't auto-discard.
        log(`  ⚠ Row #${row.num} (${row.status}) ${row.company} — ${row.role.slice(0, 40)} posting appears closed: ${result.reason}`);
        summary.expired_needs_review++;
        state.rows[key] = { ...stateRow, status: 'expired_needs_review', url, lastChecked: nowIso, reason: result.reason, tracker_status: row.status };
      }
    } else if (result.result === 'uncertain') {
      summary.uncertain++;
      state.rows[key] = { ...stateRow, status: 'uncertain', url, lastChecked: nowIso, reason: result.reason, needsReview: true };
    } else if (result.result === 'no-url') {
      summary.no_url++;
      state.rows[key] = { ...stateRow, status: 'no_url', url: '', lastChecked: nowIso, reason: result.reason };
    }
  }

  state.runs = (state.runs || []).slice(-9); // keep last 9 + this run = 10 history
  state.runs.push({
    timestamp: nowIso,
    rows_checked: activeRows.length,
    summary,
    dry_run: DRY_RUN,
  });

  saveState(state);

  log(`Summary: active=${summary.active} expired_discarded=${summary.expired_discarded} expired_needs_review=${summary.expired_needs_review} uncertain=${summary.uncertain} no_url=${summary.no_url}`);
  log(`Wrote state to ${STATE_PATH}`);
  log('--- liveness-sweep done ---');
  return summary;
}

const ping = hc('LIVENESS_SWEEP');
const runId = startRun('liveness-sweep');
await ping.start();

main()
  .then((summary) => {
    finishRun(runId, { status: 'ok', urls_found: summary?.active ?? 0 });
    return ping.success(`active=${summary?.active ?? 0} discarded=${summary?.expired_discarded ?? 0} uncertain=${summary?.uncertain ?? 0}`);
  })
  .then(() => process.exit(0))
  .catch(async (err) => {
    log(`FATAL: ${err.message}`);
    console.error(err.stack);
    finishRun(runId, { status: 'fail', error: err.message });
    await ping.fail(err);
    process.exit(1);
  });
