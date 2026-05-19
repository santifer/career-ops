/**
 * lib/layer3-event-watcher.mjs — Layer-3 event watcher.
 *
 * Design source: refresh-master Phase 3 deliverable 1. Detects events that
 * justify a full Layer-3 deep-research refresh:
 *
 *   1. status→Interview: scan data/applications.md for rows whose status
 *      changed from non-Interview to Interview since last poll.
 *   2. status→Offer: same, for Offer.
 *   3. new top-15 row: scan data/apply-now-queue.json ranked[] for rows
 *      whose rank dropped into ≤15 since last snapshot.
 *   4. recruiter_message_received: placeholder hook for future Gmail webhook
 *      wiring. Returns no events from this watcher today.
 *   5. manual_deep_refresh_cta: not detected here; fires via dashboard
 *      drawer POST /api/refresh-deep (separate code path).
 *   6. company_major_news_event: surfaced by Layer-1 company-pulse; not
 *      detected here.
 *
 * State persisted at data/layer3-watcher-state.json (last-poll snapshot of
 * statuses + apply-now ranks).
 *
 * Exports:
 *   detectEvents() → { events: [{ type, row, prior_status, new_status, ts }] }
 *   recordHandled(event) → void  (marks an event as fired so it doesn't re-trigger)
 *   onEventForRow(row, event) → suggested LineupForTier (for council-dispatch)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const STATE_PATH = join(REPO_ROOT, 'data', 'layer3-watcher-state.json');
const APPLICATIONS_PATH = join(REPO_ROOT, 'data', 'applications.md');
const APPLY_NOW_QUEUE_PATH = join(REPO_ROOT, 'data', 'apply-now-queue.json');

function loadState() {
  if (!existsSync(STATE_PATH)) return { last_poll_at: null, statuses: {}, ranks: {}, handled: [] };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return { last_poll_at: null, statuses: {}, ranks: {}, handled: [] }; }
}

function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Parse data/applications.md → { num → { company, role, status } } map.
 * applications.md is a markdown table; we extract row #s + statuses.
 */
function parseApplicationsMd() {
  if (!existsSync(APPLICATIONS_PATH)) return {};
  const text = readFileSync(APPLICATIONS_PATH, 'utf8');
  const rows = {};
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 5) continue;
    const num = parseInt(cells[0], 10);
    if (!Number.isFinite(num) || num < 1) continue;
    // Column order per applications.md header: # | Date | Company | Role | Status | Score | PDF | Report | Notes
    const [_n, _date, company, role, statusOrScore, scoreOrStatus] = cells;
    // Sometimes the status column may include a date — strip non-canonical chars
    const status = (statusOrScore || '').replace(/[*`]/g, '').trim();
    rows[String(num)] = { num, company, role, status };
  }
  return rows;
}

function readApplyNowQueue() {
  if (!existsSync(APPLY_NOW_QUEUE_PATH)) return [];
  try {
    const j = JSON.parse(readFileSync(APPLY_NOW_QUEUE_PATH, 'utf8'));
    return j.ranked || j.queue || j.rows || (Array.isArray(j) ? j : []);
  } catch { return []; }
}

/**
 * Compare current state against last snapshot and emit events.
 */
export function detectEvents() {
  const state = loadState();
  const events = [];
  const ts = new Date().toISOString();

  // 1+2. Status→Interview/Offer
  const currentApps = parseApplicationsMd();
  for (const [num, row] of Object.entries(currentApps)) {
    const priorStatus = state.statuses?.[num] || null;
    if (priorStatus === row.status) continue;
    if (row.status === 'Interview' && priorStatus !== 'Interview') {
      events.push({ type: 'status_change', new_status: 'Interview', prior_status: priorStatus, row, ts });
    }
    if (row.status === 'Offer' && priorStatus !== 'Offer') {
      events.push({ type: 'status_change', new_status: 'Offer', prior_status: priorStatus, row, ts });
    }
  }

  // 3. New top-15 row
  const queue = readApplyNowQueue();
  for (const item of queue) {
    if (typeof item.rank !== 'number' || item.rank > 15) continue;
    const num = String(item.num);
    const priorRank = state.ranks?.[num];
    if (priorRank === undefined || priorRank > 15) {
      events.push({ type: 'new_top_15_role', row: item, prior_rank: priorRank ?? null, ts });
    }
  }

  // Update state snapshot
  const newStatuses = {};
  for (const [num, row] of Object.entries(currentApps)) newStatuses[num] = row.status;
  const newRanks = {};
  for (const item of queue) if (typeof item.rank === 'number') newRanks[String(item.num)] = item.rank;

  state.last_poll_at = ts;
  state.statuses = newStatuses;
  state.ranks = newRanks;
  // Prune handled events older than 30 days
  state.handled = (state.handled || []).filter(h => Date.now() - Date.parse(h.ts || 0) < 30 * 86400000);

  saveState(state);
  return { events, polled_at: ts };
}

export function recordHandled(event) {
  const state = loadState();
  state.handled = state.handled || [];
  state.handled.push({
    type: event.type,
    row_num: event.row?.num,
    new_status: event.new_status,
    ts: new Date().toISOString(),
  });
  saveState(state);
}

/**
 * For a given event, return the recommended council tier for council-dispatch.
 */
export function tierForEvent(event) {
  if (event.type === 'status_change' && (event.new_status === 'Interview' || event.new_status === 'Offer')) return 'deep';
  if (event.type === 'new_top_15_role') return 'contested';
  if (event.type === 'manual_deep') return 'deep';
  return 'routine';
}

// CLI: node lib/layer3-event-watcher.mjs --detect
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--detect')) {
    const r = detectEvents();
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log('usage: --detect');
  }
}
