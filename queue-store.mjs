#!/usr/bin/env node
/**
 * queue-store.mjs -- Shared read/write/query helpers for the apply queue.
 *
 * Single source of queue I/O. Cloud-safe discovery columns live in Supabase
 * active_roles / seen_urls; candidate-generated fields stay in the local
 * sidecar data/local-enrichments.json.
 *
 * Nothing in this file invokes any LLM.
 */

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { createSupabaseClient, isSupabaseConfigured } from './supabase-client.mjs';
import { checkUrlLivenessHttp } from './liveness-http.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const QUEUE_PATH = join(ROOT, 'data', 'apply-queue.json');
export const LOCAL_ENRICHMENTS_PATH = join(ROOT, 'data', 'local-enrichments.json');
const TMP_DIR = join(ROOT, 'data');

// --- Status lifecycle ---
// new -> scored -> prepare-queued -> prepared -> prefilled -> filled -> submitted | skipped | reviewed | closed
// 'prefilled' = headless fill complete, needs user review in headed browser
// 'filled'    = headed fill complete, user review + submit pending
export const ACTIVE_STATUSES  = new Set(['new', 'scored', 'prepare-queued', 'prepared', 'prefilled', 'filled']);
export const DONE_STATUSES    = new Set(['submitted', 'skipped', 'reviewed', 'closed']);
export const LANE_STATUSES    = new Set(['scored', 'prepare-queued', 'prepared', 'prefilled', 'filled']); // visible in lanes

// PII guard: only fields in this allowlist can ever be serialized to Supabase.
// Any new field on a role object defaults to the local sidecar until explicitly
// reviewed and added here as cloud-safe discovery data.
export const CLOUD_ROLE_FIELDS = new Set([
  'id',
  'company',
  'title',
  'url',
  'ats',
  'source',
  'location',
  'jd_text',
  'jd_path',
  'status',
  'score',
  'score_raw',
  'size_bucket',
  'eligibility',
  'employment_type',
  'confidence',
  'flags',
  'free_text_fields',
  'upload_fields',
  'ksc_criteria',
  'cover_letter_required',
  'requirements_snippet',
  'created_at',
  'scored_at',
  'prepared_at',
  'prefilled_at',
  'filled_at',
]);

export const LOCAL_ONLY_ROLE_FIELDS = new Set([
  'reason',
  'visa_answer',
  'drafts',
  'cv_pdf',
  'cover_letter_path',
  'cover_letter_paths',
  'ksc_path',
  'decided_at',
  'confirmation_number',
  'confirmation_screenshot',
]);

const EMPTY_QUEUE = () => ({
  version: 1,
  settings: { score_threshold: null, updated_at: null },
  roles: [],
});

const STATUS_TIMESTAMP = {
  scored:           'scored_at',
  prepared:         'prepared_at',
  prefilled:        'prefilled_at',
  filled:           'filled_at',
  submitted:        'decided_at',
  skipped:          'decided_at',
  reviewed:         'decided_at',
  closed:           'decided_at',
  'prepare-queued': null,
};

// -- Local JSON helpers -------------------------------------------------------

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(TMP_DIR, `.${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  renameSync(tmp, path);
}

function normalizeSidecar(raw = null) {
  if (!raw || typeof raw !== 'object') {
    return { version: 1, settings: {}, roles: {} };
  }
  if (raw.roles && typeof raw.roles === 'object') {
    return {
      version: raw.version ?? 1,
      settings: raw.settings ?? {},
      roles: raw.roles ?? {},
    };
  }

  // Backward-compatible shape from the design doc:
  // { "<role-id>": { reason, drafts, ... } }
  const roles = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'version' || key === 'settings') continue;
    if (value && typeof value === 'object') roles[key] = value;
  }
  return { version: raw.version ?? 1, settings: raw.settings ?? {}, roles };
}

function loadSidecar() {
  return normalizeSidecar(readJson(LOCAL_ENRICHMENTS_PATH, null));
}

function saveSidecar(sidecar) {
  atomicWriteJson(LOCAL_ENRICHMENTS_PATH, {
    version: 1,
    settings: sidecar.settings ?? {},
    roles: sidecar.roles ?? {},
  });
}

function loadShadowQueue() {
  return readJson(QUEUE_PATH, null);
}

function saveShadowQueue(queue) {
  atomicWriteJson(QUEUE_PATH, queue);
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function inferSource(role) {
  if (role.source) return role.source;
  if (role.ats === 'greenhouse') return 'greenhouse-api';
  if (role.ats === 'lever') return 'lever-api';
  if (role.ats === 'ashby') return 'ashby-api';
  return 'manual';
}

function normalizeCloudRole(row) {
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    url: row.url,
    ats: row.ats,
    source: row.source ?? inferSource(row),
    location: row.location ?? '',
    jd_text: row.jd_text ?? null,
    jd_path: row.jd_path ?? null,
    size_bucket: row.size_bucket ?? null,
    score_raw: row.score_raw == null ? null : Number(row.score_raw),
    score: row.score == null ? null : Number(row.score),
    eligibility: row.eligibility ?? null,
    employment_type: row.employment_type ?? null,
    confidence: row.confidence ?? null,
    flags: normalizeArray(row.flags),
    free_text_fields: Array.isArray(row.free_text_fields) ? row.free_text_fields : (row.free_text_fields ?? []),
    upload_fields: row.upload_fields ?? null,
    ksc_criteria: row.ksc_criteria ?? null,
    cover_letter_required: !!row.cover_letter_required,
    requirements_snippet: row.requirements_snippet ?? null,
    status: row.status,
    created_at: row.created_at ?? null,
    scored_at: row.scored_at ?? null,
    prepared_at: row.prepared_at ?? null,
    prefilled_at: row.prefilled_at ?? null,
    filled_at: row.filled_at ?? null,
  };
}

export function splitRoleForPersistence(role) {
  const cloud = {};
  const local = {};

  for (const [key, value] of Object.entries(role)) {
    if (value === undefined) continue;
    if (CLOUD_ROLE_FIELDS.has(key)) {
      cloud[key] = value;
    } else {
      // Default-local guard: unclassified fields never go to Supabase.
      local[key] = value;
    }
  }

  cloud.source = inferSource(cloud);
  cloud.flags = normalizeArray(cloud.flags);
  cloud.free_text_fields = Array.isArray(cloud.free_text_fields) ? cloud.free_text_fields : [];
  cloud.cover_letter_required = !!cloud.cover_letter_required;
  cloud.status = cloud.status ?? 'new';
  cloud.ats = cloud.ats ?? 'custom';

  return { cloud, local };
}

export function seenRowForDoneRole(role) {
  if (!DONE_STATUSES.has(role.status)) return null;
  return {
    url: role.url,
    company: role.company ?? null,
    title: role.title ?? null,
    final_status: role.status,
    first_seen: dateOnly(role.created_at),
    decided_at: role.decided_at ?? new Date().toISOString(),
  };
}

export function splitQueueForPersistence(queue, options = {}) {
  const active = [];
  const seen = [];
  const localRoles = {};

  for (const role of queue.roles ?? []) {
    const { cloud, local } = splitRoleForPersistence(role);

    if (role.id && Object.keys(local).length > 0) {
      localRoles[role.id] = local;
    }

    if (ACTIVE_STATUSES.has(role.status)) {
      active.push(cloud);
      continue;
    }

    const seenRow = seenRowForDoneRole(role);
    if (seenRow) seen.push(seenRow);
  }

  for (const row of options.extraSeen ?? []) {
    if (row?.url && row?.final_status) seen.push(row);
  }

  return {
    active,
    seen,
    sidecar: {
      version: 1,
      settings: queue.settings ?? {},
      roles: localRoles,
    },
  };
}

export function mergeCloudAndLocal(activeRows, sidecar) {
  const normalizedSidecar = normalizeSidecar(sidecar);
  const roles = activeRows.map((row) => {
    const cloud = normalizeCloudRole(row);
    const local = normalizedSidecar.roles?.[cloud.id] ?? {};
    return {
      ...cloud,
      decided_at: local.decided_at ?? null,
      ...local,
    };
  });

  return {
    version: 1,
    settings: {
      score_threshold: normalizedSidecar.settings?.score_threshold ?? null,
      updated_at: normalizedSidecar.settings?.updated_at ?? null,
    },
    roles,
  };
}

function loadFromSupabase() {
  const client = createSupabaseClient('dashboard');
  const rows = client.selectSync('active_roles', {
    select: '*',
    query: { order: 'score.desc.nullslast,created_at.asc' },
  });
  const queue = mergeCloudAndLocal(rows ?? [], loadSidecar());
  saveShadowQueue(queue);
  return queue;
}

// -- Load / Save --------------------------------------------------------------

export function loadQueue() {
  if (!isSupabaseConfigured('dashboard')) {
    const shadow = loadShadowQueue();
    if (shadow) {
      shadow.settings = shadow.settings ?? {};
      shadow.settings.store_backend = 'local-shadow';
      shadow.settings.store_warning = 'Supabase env is not configured; writes will fail until SUPABASE_URL and SUPABASE_DASHBOARD_KEY are set.';
      return shadow;
    }
    return EMPTY_QUEUE();
  }

  try {
    return loadFromSupabase();
  } catch (err) {
    const shadow = loadShadowQueue();
    if (!shadow) throw err;
    shadow.settings = shadow.settings ?? {};
    shadow.settings.store_backend = 'supabase-shadow';
    shadow.settings.store_warning = `Supabase unavailable; read-only local shadow returned: ${err.message}`;
    console.warn(`WARN: ${shadow.settings.store_warning}`);
    return shadow;
  }
}

export function saveQueue(queue, options = {}) {
  if (!isSupabaseConfigured('dashboard')) {
    throw new Error('Supabase env is not configured; refusing local-only write without replay support');
  }

  queue.settings = queue.settings ?? {};
  queue.settings.updated_at = new Date().toISOString();

  const existingSidecar = loadSidecar();
  const split = splitQueueForPersistence(queue, options);
  const client = createSupabaseClient('dashboard');

  client.rpcSync('save_queue', {
    active_payload: split.active,
    seen_payload: split.seen,
  });

  saveSidecar({
    version: 1,
    settings: split.sidecar.settings,
    roles: {
      ...existingSidecar.roles,
      ...split.sidecar.roles,
    },
  });
  saveShadowQueue(queue);
}

// -- Lane computation: pure function, no I/O ---------------------------------

/**
 * Returns 'ready' | 'needs-input' | 'review-carefully' | null.
 * null = not yet scored or already decided; not in any active lane.
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

// -- Record helpers -----------------------------------------------------------

export function getById(queue, id) {
  return queue.roles.find(r => r.id === id) ?? null;
}

export function updateById(queue, id, patches) {
  const idx = queue.roles.findIndex(r => r.id === id);
  if (idx === -1) return false;
  queue.roles[idx] = { ...queue.roles[idx], ...patches };
  return true;
}

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
    source: inferSource(role),
    created_at: role.created_at ?? now,
  });
  return true;
}

// -- Dedup helpers ------------------------------------------------------------

/** Build Sets of IDs, URLs, and company::title pairs already in the queue. */
export function buildQueueSeenSets(queue) {
  const ids          = new Set();
  const urls         = new Set();
  const companyRoles = new Set();
  for (const r of queue.roles) {
    if (r.id) ids.add(r.id);
    if (r.url) urls.add(r.url);
    if (r.company && r.title) {
      companyRoles.add(`${r.company.toLowerCase()}::${r.title.toLowerCase()}`);
    }
  }
  return { ids, urls, companyRoles };
}

export function loadQueueSeenSets(queue = loadQueue(), { role = 'dashboard' } = {}) {
  const sets = buildQueueSeenSets(queue);
  if (!isSupabaseConfigured(role)) return sets;

  const client = createSupabaseClient(role);
  const { ids, urls, companyRoles } = sets;
  const add = (row) => {
    if (row.id) ids.add(row.id);
    if (row.url) urls.add(row.url);
    if (row.company && row.title) {
      companyRoles.add(`${row.company.toLowerCase()}::${row.title.toLowerCase()}`);
    }
  };

  for (const row of client.selectSync('active_roles', { select: 'id,url,company,title' }) ?? []) {
    add(row);
  }
  for (const row of client.selectSync('seen_urls', { select: 'url,company,title' }) ?? []) {
    add(row);
  }
  return sets;
}

/**
 * Insert status='new' stubs via the cron credential (RLS-bounded direct REST).
 * Does NOT call save_queue, does NOT write sidecar or shadow JSON.
 * The cron role has no UPDATE grant and no execute on save_queue.
 *
 * @param {object[]} stubs — array of role objects (built by queue-ingest --cron)
 * @returns {{ inserted: number, skipped: number }}
 */
export async function insertNewStubsCron(stubs) {
  const client = createSupabaseClient('cron');
  const rows = [];
  let skipped = 0;

  for (const stub of stubs) {
    const { cloud } = splitRoleForPersistence(stub);
    // Hard-guard: defence in depth above RLS — only insert status='new'
    if (cloud.status !== 'new') {
      console.warn(`insertNewStubsCron: skipping stub with status='${cloud.status}' (${cloud.url})`);
      skipped++;
      continue;
    }
    rows.push(cloud);
  }

  if (rows.length === 0) return { attempted: 0, inserted: 0, skipped };

  // ON CONFLICT (url) DO NOTHING via PostgREST resolution header.
  // return=representation gives back only the rows actually inserted (duplicates
  // are dropped silently), so resp.length is a true inserted count.
  const resp = client.requestSync('POST', 'active_roles', {
    query: { on_conflict: 'url' },
    body: rows,
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
  });
  const inserted = Array.isArray(resp) ? resp.length : 0;

  return { attempted: rows.length, inserted, skipped };
}

// ── Cron eviction seam ────────────────────────────────────────────────────────

/**
 * App-logic guard for cron eviction — independent of RLS.
 * Only status='new' rows with a STRONG expired HTTP signal are evicted.
 * 'uncertain' (including insufficient_content, bot_challenge, fetch_error)
 * and 'active' are always kept to avoid losing live SPA postings that look
 * empty over plain HTTP.
 *
 * Invariant: only evict verdicts that classifyLiveness() decides BEFORE the
 * hasApplyControl(applyControls) gate (liveness-core.mjs:100). The HTTP path
 * omits applyControls, so any code decided after that gate (listing_page,
 * insufficient_content, no_apply_control) is unreliable — a live board/search
 * page with a visible Apply button would show 'active' in the browser but
 * 'listing_page' over HTTP, causing a false eviction and permanent seen_urls
 * lockout. Strong (pre-gate) codes: http_gone, expired_url, expired_body.
 *
 * Exported so regression tests can prove the guard independently of RLS/network.
 *
 * @param {{ status: string }|null} row
 * @param {{ result: string, code: string }|null} verdict
 * @returns {boolean}
 */
export function shouldEvict(row, verdict) {
  return row?.status === 'new'
    && verdict?.result === 'expired'
    && HTTP_EVICT_CODES.has(verdict?.code);
}

const HTTP_EVICT_CODES = new Set(['http_gone', 'expired_url', 'expired_body']);

/**
 * HTTP-liveness re-check of status='new' rows via the cron credential.
 * Deletes expired stubs and records them in seen_urls(final_status='expired')
 * so they are never re-inserted by the scanner. Mirrors insertNewStubsCron:
 * same credential wiring, same direct-REST pattern, no save_queue RPC.
 *
 * Eviction is conservative by design: only strong expired signals trigger a
 * delete (see shouldEvict). 'uncertain' and 'active' verdicts always keep the row.
 *
 * Write ordering: DELETE first, seen_urls only on confirmed delete.
 * If the DELETE returns 0 rows (status advanced between SELECT and DELETE),
 * seen_urls is NOT written — avoids permanently marking an active URL as expired.
 *
 * @param {{ check?: Function, dryRun?: boolean }} opts
 *   check   — injectable liveness function (url) → {result,code,reason}.
 *             Defaults to checkUrlLivenessHttp. Override in tests.
 *   dryRun  — when true, log would-be evictions but write/delete nothing.
 * @returns {Promise<{ checked: number, evicted: number, kept: number, errors: number, dryRun: boolean }>}
 */
export async function evictExpiredNewStubsCron({ check, dryRun = false } = {}) {
  const live = check ?? checkUrlLivenessHttp;
  const client = createSupabaseClient('cron');

  // SELECT only status='new' rows — the cron's eviction scope.
  const rows = client.selectSync('active_roles', {
    select: 'id,url,company,title,created_at,status',
    query: { status: 'eq.new' },
  }) ?? [];

  let checked = 0, evicted = 0, kept = 0, errors = 0;

  for (const row of rows) {
    if (!row.url) { kept++; continue; }
    checked++;

    let verdict;
    try {
      verdict = await live(row.url);
    } catch (e) {
      errors++;
      console.warn(`evictExpiredNewStubsCron: liveness threw for ${row.url}: ${e.message}`);
      continue;
    }

    if (!shouldEvict(row, verdict)) {
      kept++;
      continue;
    }

    if (dryRun) {
      evicted++;
      console.log(`  WOULD evict: ${row.url}  (${verdict.code})`);
      continue;
    }

    try {
      // Hard-guard: status=eq.new on the DELETE — defence in depth above RLS.
      // If the row has advanced past 'new' since our SELECT (race), the DELETE
      // returns 0 rows and we skip the seen_urls write to avoid a false-expired
      // dedup entry for a URL the human pipeline is actively working on.
      const resp = client.requestSync('DELETE', 'active_roles', {
        query: { id: `eq.${row.id}`, status: 'eq.new' },
        headers: { Prefer: 'return=representation' },
      });
      if ((Array.isArray(resp) ? resp.length : 0) === 0) {
        // Row was already gone or status advanced — skip seen_urls safely.
        kept++;
        continue;
      }

      // Row confirmed deleted. Record in seen_urls so it is never re-inserted.
      // ON CONFLICT (url) DO NOTHING — cron has no UPDATE grant on seen_urls.
      // decided_at left unset (NULL) per architecture doc §3.4.
      client.requestSync('POST', 'seen_urls', {
        query: { on_conflict: 'url' },
        body: [{
          url:          row.url,
          company:      row.company ?? null,
          title:        row.title ?? null,
          final_status: 'expired',
          first_seen:   dateOnly(row.created_at),
        }],
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      });
      evicted++;
    } catch (e) {
      errors++;
      console.warn(`evictExpiredNewStubsCron: failed to evict ${row.url}: ${e.message}`);
    }
  }

  return { checked, evicted, kept, errors, dryRun };
}

// -- Lane stats helper (used by server + SPA) --------------------------------

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
