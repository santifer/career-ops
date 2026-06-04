#!/usr/bin/env node
/**
 * queue-store.mjs — Shared read/write/query helpers for data/apply-queue.json.
 *
 * Single source of queue I/O — used by queue-ingest, dashboard-server, and form-fill.
 * Atomic writes via tmp-file + rename to avoid partial-read corruption on power loss.
 *
 * Nothing in this file makes network calls or invokes any LLM.
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const QUEUE_PATH = join(ROOT, 'data', 'apply-queue.json');
const TMP_DIR = join(ROOT, 'data');

// --- Status lifecycle ---
// new → scored → prepare-queued → prepared → filled → submitted | skipped | reviewed | closed
// 'filled' = form fill complete, user review + submit pending
export const ACTIVE_STATUSES  = new Set(['new', 'scored', 'prepare-queued', 'prepared', 'filled']);
export const DONE_STATUSES    = new Set(['submitted', 'skipped', 'reviewed', 'closed']);
export const LANE_STATUSES    = new Set(['scored', 'prepare-queued', 'prepared', 'filled']); // visible in lanes

const EMPTY_QUEUE = () => ({
  version: 1,
  settings: { score_threshold: null, updated_at: null },
  roles: [],
});

// ── Load / Save ──────────────────────────────────────────────────────────────

export function loadQueue() {
  if (!existsSync(QUEUE_PATH)) return EMPTY_QUEUE();
  try {
    return JSON.parse(readFileSync(QUEUE_PATH, 'utf-8'));
  } catch {
    return EMPTY_QUEUE();
  }
}

export function saveQueue(queue) {
  queue.settings = queue.settings ?? {};
  queue.settings.updated_at = new Date().toISOString();
  const tmp = join(TMP_DIR, `.apply-queue-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(queue, null, 2) + '\n', 'utf-8');
  renameSync(tmp, QUEUE_PATH); // atomic on same filesystem
}

// ── Lane computation — pure function, no I/O ────────────────────────────────

/**
 * Returns 'ready' | 'needs-input' | 'review-carefully' | null.
 * null = not yet scored or already decided — not in any active lane.
 */
export function computeLane(role) {
  if (!LANE_STATUSES.has(role.status)) return null;
  if (role.score == null) return null; // not scored yet

  // review-carefully: eligibility issue, ambiguous employment type, or low confidence
  if (
    role.eligibility !== 'ok' ||
    role.employment_type === 'ambiguous' ||
    role.confidence === 'low'
  ) {
    return 'review-carefully';
  }

  // needs-input: has unresolved custom free-text fields, manual-field, or knockout flag
  if (Array.isArray(role.flags) && (role.flags.includes('manual-field') || role.flags.includes('knockout-flag'))) {
    return 'needs-input';
  }
  if (Array.isArray(role.free_text_fields) && role.free_text_fields.some(f => f.kind === 'custom')) {
    return 'needs-input';
  }

  // ready: eligible, confident, and all fields are either standard (drafted in prepare) or absent
  return 'ready';
}

// ── Record helpers ───────────────────────────────────────────────────────────

export function getById(queue, id) {
  return queue.roles.find(r => r.id === id) ?? null;
}

export function updateById(queue, id, patches) {
  const idx = queue.roles.findIndex(r => r.id === id);
  if (idx === -1) return false;
  queue.roles[idx] = { ...queue.roles[idx], ...patches };
  return true;
}

const STATUS_TIMESTAMP = {
  scored:           'scored_at',
  prepared:         'prepared_at',
  filled:           'filled_at',
  submitted:        'decided_at',
  skipped:          'decided_at',
  reviewed:         'decided_at',
  closed:           'decided_at',
  'prepare-queued': null,
};

export function setStatus(queue, id, status) {
  const patches = { status };
  const tsField = STATUS_TIMESTAMP[status];
  if (tsField) patches[tsField] = new Date().toISOString();
  return updateById(queue, id, patches);
}

/** Append a new role stub. Returns false (and does nothing) if the ID already exists. */
export function appendRole(queue, role) {
  if (queue.roles.some(r => r.id === role.id)) return false;
  const now = new Date().toISOString();
  queue.roles.push({
    scored_at: null,
    prepared_at: null,
    decided_at: null,
    ...role,
    created_at: now,
  });
  return true;
}

// ── Dedup helpers ────────────────────────────────────────────────────────────

/** Build Sets of IDs, URLs, and company::title pairs already in the queue. */
export function buildQueueSeenSets(queue) {
  const ids          = new Set();
  const urls         = new Set();
  const companyRoles = new Set();
  for (const r of queue.roles) {
    ids.add(r.id);
    if (r.url)              urls.add(r.url);
    if (r.company && r.title) {
      companyRoles.add(`${r.company.toLowerCase()}::${r.title.toLowerCase()}`);
    }
  }
  return { ids, urls, companyRoles };
}

// ── Lane stats helper (used by server + SPA) ─────────────────────────────────

export function computeStats(queue) {
  let ready = 0, needsInput = 0, reviewCarefully = 0, newCount = 0, doneCount = 0;
  let scoreSum = 0, scoreCount = 0;

  for (const role of queue.roles) {
    if (role.status === 'new') { newCount++; continue; }
    if (DONE_STATUSES.has(role.status)) { doneCount++; continue; }
    const lane = computeLane(role);
    if (lane === 'ready')            ready++;
    else if (lane === 'needs-input') needsInput++;
    else if (lane === 'review-carefully') reviewCarefully++;
    if (role.score != null) { scoreSum += role.score; scoreCount++; }
  }

  const avgScore = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null;
  return { ready, needsInput, reviewCarefully, newCount, doneCount, avgScore };
}
