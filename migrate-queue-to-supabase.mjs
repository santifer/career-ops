#!/usr/bin/env node
/**
 * migrate-queue-to-supabase.mjs -- dry-run-first legacy queue migration.
 *
 * Default mode prints the full insert plan and writes nothing.
 * Use --apply only after reviewing the plan.
 */

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { createSupabaseClient, isSupabaseConfigured } from './supabase-client.mjs';
import {
  ACTIVE_STATUSES,
  LOCAL_ENRICHMENTS_PATH,
  QUEUE_PATH,
  splitQueueForPersistence,
} from './queue-store.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCAN_HISTORY = join(ROOT, 'data', 'scan-history.tsv');
const APPLICATIONS = join(ROOT, 'data', 'applications.md');
const APPLY = process.argv.includes('--apply');

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  renameSync(tmp, path);
}

function parseTsv(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines.shift().split('\t');
  return lines.map((line) => {
    const cells = line.split('\t');
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function normalizeSource(portal = '') {
  const p = portal.toLowerCase();
  if (p.includes('greenhouse-api')) return 'greenhouse-api';
  if (p.includes('lever-api')) return 'lever-api';
  if (p.includes('ashby-api')) return 'ashby-api';
  if (p.includes('websearch') || p.includes('seek') || p.includes('indeed')) return 'websearch';
  return 'manual';
}

function scanHistoryByUrl(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.url) continue;
    map.set(row.url, {
      source: normalizeSource(row.portal),
      first_seen: row.first_seen || null,
      company: row.company || null,
      title: row.title || null,
      status: row.status || 'added',
    });
  }
  return map;
}

function seenRowsFromScanHistory(rows) {
  return rows
    .filter((row) => row.url)
    .map((row) => ({
      url: row.url,
      company: row.company || null,
      title: row.title || null,
      final_status: row.status || 'added',
      first_seen: row.first_seen || null,
      decided_at: null,
    }));
}

function statusFromTracker(status = '') {
  const s = status.trim().toLowerCase();
  if (s === 'applied') return 'submitted';
  if (s === 'skip') return 'skipped';
  if (s === 'discarded') return 'reviewed';
  if (s === 'rejected') return 'closed';
  if (s === 'evaluated') return 'reviewed';
  return s || 'reviewed';
}

function seenRowsFromApplications(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  const text = readFileSync(path, 'utf-8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|') || /^\|[-\s|]+\|$/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 9 || cells[1] === '#') continue;
    const url = line.match(/https?:\/\/[^\s|)]+/)?.[0];
    if (!url) continue;
    rows.push({
      url,
      company: cells[3] || null,
      title: cells[4] || null,
      final_status: statusFromTracker(cells[6]),
      first_seen: cells[2] || null,
      decided_at: cells[2] ? `${cells[2]}T00:00:00.000Z` : null,
    });
  }
  return rows;
}

const STATUS_RANK = {
  added: 0,
  filtered: 1,
  expired: 2,
  reviewed: 3,
  closed: 4,
  skipped: 5,
  submitted: 6,
};

function mergeSeenRows(rows) {
  const byUrl = new Map();
  for (const row of rows) {
    if (!row?.url || !row.final_status) continue;
    const existing = byUrl.get(row.url);
    if (!existing) {
      byUrl.set(row.url, row);
      continue;
    }
    const currentRank = STATUS_RANK[existing.final_status] ?? 0;
    const nextRank = STATUS_RANK[row.final_status] ?? 0;
    const winner = nextRank >= currentRank ? row : existing;
    byUrl.set(row.url, {
      ...existing,
      ...winner,
      company: winner.company ?? existing.company,
      title: winner.title ?? existing.title,
      first_seen: [existing.first_seen, winner.first_seen].filter(Boolean).sort()[0] ?? null,
      decided_at: winner.decided_at ?? existing.decided_at ?? null,
    });
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function normalizeQueueForMigration(queue, scanByUrl) {
  return {
    ...queue,
    roles: (queue.roles ?? []).map((role) => {
      const seen = scanByUrl.get(role.url);
      return {
        ...role,
        source: role.source || seen?.source || 'manual',
      };
    }),
  };
}

function buildPlan() {
  const queue = readJson(QUEUE_PATH, { version: 1, settings: {}, roles: [] });
  const scanRows = parseTsv(SCAN_HISTORY);
  const scanByUrl = scanHistoryByUrl(scanRows);
  const migratedQueue = normalizeQueueForMigration(queue, scanByUrl);

  const extraSeen = [
    ...seenRowsFromScanHistory(scanRows),
    ...seenRowsFromApplications(APPLICATIONS),
  ];

  const split = splitQueueForPersistence(migratedQueue, { extraSeen });
  const seen = mergeSeenRows(split.seen);
  const statusCounts = {};
  for (const role of queue.roles ?? []) {
    statusCounts[role.status] = (statusCounts[role.status] ?? 0) + 1;
  }

  return {
    generated_at: new Date().toISOString(),
    apply: APPLY,
    summary: {
      legacy_roles: queue.roles?.length ?? 0,
      legacy_status_counts: statusCounts,
      active_roles_to_upsert: split.active.length,
      seen_urls_to_upsert: seen.length,
      scan_history_rows: scanRows.length,
      application_rows_with_urls: seenRowsFromApplications(APPLICATIONS).length,
      local_enrichment_roles: Object.keys(split.sidecar.roles).length,
    },
    active_roles: split.active.sort((a, b) => a.id.localeCompare(b.id)),
    seen_urls: seen,
    local_enrichments: split.sidecar,
  };
}

function mergeSidecar(existing, next) {
  const current = existing?.roles ? existing : { version: 1, settings: existing?.settings ?? {}, roles: existing ?? {} };
  return {
    version: 1,
    settings: {
      ...(current.settings ?? {}),
      ...(next.settings ?? {}),
    },
    roles: {
      ...(current.roles ?? {}),
      ...(next.roles ?? {}),
    },
  };
}

function main() {
  const plan = buildPlan();
  console.log(JSON.stringify(plan, null, 2));

  if (!APPLY) {
    console.log('\nDRY RUN ONLY: review the plan above, then re-run with --apply to write to Supabase and data/local-enrichments.json.');
    return;
  }

  if (!isSupabaseConfigured('dashboard')) {
    throw new Error('SUPABASE_URL and SUPABASE_DASHBOARD_KEY are required before --apply');
  }

  const client = createSupabaseClient('dashboard');
  client.rpcSync('save_queue', {
    active_payload: plan.active_roles,
    seen_payload: plan.seen_urls,
  });

  const existingSidecar = readJson(LOCAL_ENRICHMENTS_PATH, null);
  atomicWriteJson(LOCAL_ENRICHMENTS_PATH, mergeSidecar(existingSidecar, plan.local_enrichments));
  console.log(`\nAPPLIED: upserted ${plan.active_roles.length} active role(s), ${plan.seen_urls.length} seen URL(s), and wrote ${LOCAL_ENRICHMENTS_PATH}.`);
}

main();
