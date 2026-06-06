#!/usr/bin/env node
/**
 * Live variant mode server (self-contained, zero dependencies).
 *
 * Serves the browser script (/live.js), the detection overlay (/detect.js),
 * uses Server-Sent Events (SSE) for server→browser push, and HTTP POST for
 * browser→server events. Agent communicates via HTTP long-poll (/poll).
 *
 * Usage:
 *   node <scripts_path>/live-server.mjs              # start
 *   node <scripts_path>/live-server.mjs stop         # stop + remove injected live.js tag
 *   node <scripts_path>/live-server.mjs stop --keep-inject   # stop only
 *   node <scripts_path>/live-server.mjs --help
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseDesignMd } from './design-parser.mjs';
import { resolveContextDir } from './context.mjs';
import { createLiveSessionStore } from './live-session-store.mjs';
import { validateEvent } from './live-event-validation.mjs';
import { LIVE_COMMANDS } from './live-vocabulary.mjs';
import {
  getDesignSidecarPath,
  getLiveDir,
  getLiveAnnotationsDir,
  readLiveServerInfo,
  removeLiveServerInfo,
  resolveDesignSidecarPath,
  writeLiveServerInfo,
} from './impeccable-paths.mjs';
import {
  countByPage as countPendingByPage,
  readBuffer as readManualEditsBuffer,
  removeEntries as removeManualEditEntries,
  stageEntry as stageManualEditEntry,
  truncateBuffer as truncateManualEditsBuffer,
} from './live-manual-edits-buffer.mjs';
import { buildManualEditEvidence } from './live-manual-edit-evidence.mjs';
import { commitManualEdits } from './live-commit-manual-edits.mjs';
import {
  applyDeferredSvelteComponentAccepts,
  removeAllSvelteComponentSessions,
} from './live-svelte-component.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PRODUCT.md / DESIGN.md live wherever context.mjs resolves. The generated
// DESIGN sidecar is project-local at .impeccable/design.json, with legacy
// DESIGN.json fallback for existing projects.
const CONTEXT_DIR = resolveContextDir(process.cwd());
const DEFAULT_POLL_TIMEOUT = 600_000;   // 10 min — agent re-polls on timeout anyway
const SSE_HEARTBEAT_INTERVAL = 30_000;  // keepalive ping every 30s

// ---------------------------------------------------------------------------
// Port detection
// ---------------------------------------------------------------------------

async function findOpenPort(start = 8400) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(start, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => resolve(findOpenPort(start + 1)));
  });
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

const state = {
  token: null,
  port: null,
  sseClients: new Set(),   // SSE response objects (server→browser push)
  pendingEvents: [],        // browser events waiting for agent ack ({ event, leaseUntil })
  pendingPolls: [],         // agent poll callbacks waiting for browser events
  nextEventSeq: 1,
  lastAgentPollingBroadcast: null,
  exitTimer: null,
  sessionDir: null,         // per-session tmp dir for annotation screenshots
  sessionStore: null,
  leaseTimer: null,
  manualEditActivity: null,
  nextManualEditSeq: 1,
  // Deferreds for in-flight chat-routed Apply events. Keyed by event id; each
  // entry is resolved when the chat agent POSTs an ack carrying the batch
  // result, or rejected when the hard timeout fires.
  pendingApplyDeferreds: new Map(),
  // Updated whenever a /poll long-poll request arrives or is resolved with an
  // event. Used to detect "a chat agent is likely attached" without requiring
  // a poll to be parked at the exact moment we dispatch.
  lastPollAt: 0,
  timedOutApplyIds: new Map(),
};

const CHAT_POLL_FRESHNESS_MS = 60_000;
const APPLY_EVENT_HARD_TIMEOUT_MS = Number(process.env.IMPECCABLE_LIVE_APPLY_EVENT_HARD_TIMEOUT_MS || 150_000);
const APPLY_EVENT_SOFT_DEADLINE_MS = Number(process.env.IMPECCABLE_LIVE_APPLY_EVENT_SOFT_DEADLINE_MS || 120_000);
const DEFAULT_MANUAL_EDIT_APPLY_CHUNK_SIZE = 3;
const MIN_MANUAL_EDIT_APPLY_CHUNK_SIZE = 1;
const MAX_MANUAL_EDIT_APPLY_CHUNK_SIZE = 20;
const MANUAL_APPLY_COMPACT_TEXT_LIMIT = 240;
const MANUAL_APPLY_COMPACT_NEARBY_LIMIT = 4;
const POLL_LEASE_EXPIRY_TIMER_GRACE_MS = 2;
const DEBUG_MANUAL_EDIT_EVENTS = /^(1|true|yes)$/i.test(process.env.IMPECCABLE_LIVE_DEBUG_EVENTS || '');

function tombstoneTimedOutApplyId(eventId, details = {}) {
  if (!eventId) return;
  state.timedOutApplyIds.set(eventId, details);
  if (state.timedOutApplyIds.size <= 200) return;
  const oldest = state.timedOutApplyIds.keys().next().value;
  state.timedOutApplyIds.delete(oldest);
}

function chatAgentLikelyActive() {
  if (state.pendingPolls.length > 0) return true;
  if (!state.lastPollAt) return false;
  return Date.now() - state.lastPollAt < CHAT_POLL_FRESHNESS_MS;
}

function manualEditApplyChunkSize(env = process.env) {
  const raw = Number(env.IMPECCABLE_LIVE_MANUAL_EDIT_CHUNK_SIZE);
  if (!Number.isFinite(raw)) return DEFAULT_MANUAL_EDIT_APPLY_CHUNK_SIZE;
  const size = Math.trunc(raw);
  return Math.max(MIN_MANUAL_EDIT_APPLY_CHUNK_SIZE, Math.min(MAX_MANUAL_EDIT_APPLY_CHUNK_SIZE, size));
}

function countManualApplyOps(entriesOrBatch) {
  const entries = Array.isArray(entriesOrBatch)
    ? entriesOrBatch
    : Array.isArray(entriesOrBatch?.entries) ? entriesOrBatch.entries : [];
  let count = 0;
  for (const entry of entries) count += Array.isArray(entry.ops) ? entry.ops.length : 0;
  return count;
}

function pushApplyEventAndWait(batch, pageUrl, chunk = null, repair = null) {
  const eventId = randomUUID().replace(/-/g, '').slice(0, 8);
  const evidencePath = writeManualApplyEvidence(eventId, batch);
  const event = {
    type: 'manual_edit_apply',
    id: eventId,
    pageUrl,
    batch: compactManualApplyBatch(batch),
    evidencePath,
    agentAction: buildManualApplyAgentAction(eventId),
    schemaVersion: 1,
    deadlineMs: APPLY_EVENT_SOFT_DEADLINE_MS,
  };
  if (chunk) event.chunk = chunk;
  if (repair) event.repair = repair;
  const rollbackSnapshot = snapshotApplyEventFiles(batch);
  recordManualEditActivity('manual_edit_apply_dispatched', {
    id: eventId,
    pageUrl,
    chunk,
    repair,
    entryCount: Array.isArray(batch.entries) ? batch.entries.length : 0,
    opCount: countManualApplyOps(batch),
    fileCount: collectManualApplyFiles(batch).length,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pendingApplyDeferreds.delete(eventId);
      tombstoneTimedOutApplyId(eventId, { batch, rollbackSnapshot });
      acknowledgePendingEvent(eventId);
      removeManualApplyEvidence(evidencePath);
      recordManualEditActivity('manual_edit_apply_timeout', {
        id: eventId,
        pageUrl,
        chunk,
        entryCount: Array.isArray(batch.entries) ? batch.entries.length : 0,
        opCount: countManualApplyOps(batch),
      });
      reject(new Error('chat_agent_timeout'));
    }, APPLY_EVENT_HARD_TIMEOUT_MS);
    state.pendingApplyDeferreds.set(eventId, { resolve, reject, timer, event, batch, pageUrl, rollbackSnapshot });
    enqueueEvent(event);
  });
}

function writeManualApplyEvidence(eventId, batch) {
  const dir = manualApplyEvidenceDir(process.cwd());
  fs.mkdirSync(dir, { recursive: true });
  const evidencePath = path.join(dir, `${eventId}.json`);
  fs.writeFileSync(evidencePath, JSON.stringify(batch, null, 2) + '\n', 'utf-8');
  return evidencePath;
}

function manualApplyEvidenceDir(cwd = process.cwd()) {
  return path.join(getLiveDir(cwd), 'manual-edit-evidence');
}

function normalizeManualApplyEvidencePath(evidencePath, cwd = process.cwd()) {
  if (!evidencePath || typeof evidencePath !== 'string') return null;
  const fullPath = path.isAbsolute(evidencePath) ? evidencePath : path.resolve(cwd, evidencePath);
  const evidenceDir = manualApplyEvidenceDir(cwd);
  const relative = path.relative(evidenceDir, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (path.extname(relative) !== '.json') return null;
  return fullPath;
}

function removeManualApplyEvidence(evidencePath, cwd = process.cwd()) {
  const fullPath = normalizeManualApplyEvidencePath(evidencePath, cwd);
  if (!fullPath) return false;
  try {
    fs.unlinkSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

function referencedManualApplyEvidencePaths(cwd = process.cwd()) {
  const referenced = new Set();
  const add = (event) => {
    const fullPath = normalizeManualApplyEvidencePath(event?.evidencePath, cwd);
    if (fullPath) referenced.add(fullPath);
  };
  for (const entry of state.pendingEvents) add(entry.event);
  for (const deferred of state.pendingApplyDeferreds.values()) add(deferred.event);
  return referenced;
}

function pruneStaleManualApplyEvidence(cwd = process.cwd()) {
  const dir = manualApplyEvidenceDir(cwd);
  if (!fs.existsSync(dir)) return [];
  const referenced = referencedManualApplyEvidencePaths(cwd);
  const removed = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const fullPath = path.join(dir, name);
    if (referenced.has(fullPath)) continue;
    try {
      fs.unlinkSync(fullPath);
      removed.push(fullPath);
    } catch {
      // Stale evidence cleanup is best-effort; Apply verification never relies
      // on deleting these files.
    }
  }
  return removed;
}

function compactManualApplyBatch(batch = {}) {
  const entries = (batch.entries || []).map(compactManualApplyEntry);
  const candidates = compactManualApplyCandidates(batch.candidates || []);
  return {
    version: batch.version,
    pageUrl: batch.pageUrl || null,
    count: batch.count,
    entries,
    ops: entries.flatMap((entry) => entry.ops.map((op) => ({ ...op, entryId: entry.id }))),
    candidates: candidates.length > 0 ? candidates : undefined,
    context: batch.context ? {
      bufferPath: batch.context.bufferPath,
      totalEntries: batch.context.totalEntries,
      totalOps: batch.context.totalOps,
      chunkIndex: batch.context.chunkIndex,
      chunkTotal: batch.context.chunkTotal,
      totalApplyOps: batch.context.totalApplyOps,
    } : undefined,
  };
}

function compactManualApplyCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .slice(0, 24)
    .map((candidate) => ({
      entryId: candidate.entryId,
      ref: candidate.ref,
      sourceHint: compactManualApplySourceMatch(candidate.sourceHint),
      textMatches: compactManualApplySourceMatches(candidate.textMatches, 8),
      objectKeyMatches: compactManualApplySourceMatches(candidate.objectKeyMatches, 8),
      contextTextMatches: compactManualApplySourceMatches(candidate.contextTextMatches, 8),
      locatorMatches: compactManualApplySourceMatches(candidate.locatorMatches, 6),
    }));
}

function compactManualApplySourceMatches(matches, limit) {
  return (Array.isArray(matches) ? matches : [])
    .slice(0, limit)
    .map(compactManualApplySourceMatch)
    .filter(Boolean);
}

function compactManualApplySourceMatch(match) {
  if (!match || typeof match !== 'object') return null;
  const file = match.relativeFile || match.file;
  if (!file && !match.line) return null;
  return {
    file: summarizeManualLogFile(file),
    line: match.line || null,
    column: match.column || null,
    reason: match.reason || match.kind || undefined,
    status: match.status || undefined,
  };
}

function compactManualApplyEntry(entry = {}) {
  return {
    id: entry.id,
    pageUrl: entry.pageUrl,
    stagedAt: entry.stagedAt || null,
    element: compactManualApplyContext(entry.element),
    ops: (entry.ops || []).map(compactManualApplyOp),
  };
}

function compactManualApplyOp(op = {}) {
  return {
    entryId: op.entryId,
    ref: op.ref,
    contextRef: op.contextRef,
    tag: op.tag,
    elementId: op.elementId,
    classes: Array.isArray(op.classes) ? op.classes : [],
    originalText: op.originalText,
    newText: op.newText,
    deleted: op.deleted === true || undefined,
    sourceHint: op.sourceHint || null,
    leaf: compactManualApplyContext(op.leaf),
    nearbyEditableTexts: compactNearbyManualEditTexts(op.nearbyEditableTexts),
    container: compactManualApplyContext(op.container),
    contextHints: Array.isArray(op.contextHints) ? op.contextHints.slice(0, 8) : undefined,
  };
}

function compactManualApplyContext(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    ref: value.ref,
    tagName: value.tagName || value.tag || null,
    id: value.id || null,
    classes: Array.isArray(value.classes) ? value.classes : [],
    textContent: truncateManualApplyText(value.textContent, MANUAL_APPLY_COMPACT_TEXT_LIMIT),
  };
}

function compactNearbyManualEditTexts(items) {
  return (Array.isArray(items) ? items : [])
    .slice(0, MANUAL_APPLY_COMPACT_NEARBY_LIMIT)
    .map((item) => typeof item === 'string' ? { text: truncateManualApplyText(item, MANUAL_APPLY_COMPACT_TEXT_LIMIT) } : {
      ref: item?.ref,
      tag: item?.tag,
      classes: Array.isArray(item?.classes) ? item.classes : [],
      text: truncateManualApplyText(item?.text, MANUAL_APPLY_COMPACT_TEXT_LIMIT),
    });
}

function truncateManualApplyText(value, max) {
  if (typeof value !== 'string') return value || null;
  return value.length > max ? value.slice(0, max) : value;
}

async function pushApplyBatchInChunksAndWait(batch, pageUrl, context = {}) {
  const repair = context?.repair || batch?.repair || null;
  if (repair) return pushApplyEventAndWait(batch, pageUrl, null, repair);
  const chunks = splitManualApplyBatch(batch, manualEditApplyChunkSize());
  if (chunks.length <= 1) return pushApplyEventAndWait(batch, pageUrl);

  const expectedOpsByEntry = new Map();
  for (const entry of batch?.entries || []) {
    expectedOpsByEntry.set(entry.id, Array.isArray(entry.ops) ? entry.ops.length : 0);
  }

  const appliedOpsByEntry = new Map();
  const failedByEntry = new Map();
  const files = new Set();
  const notes = [];
  let aborted = false;

  for (const chunk of chunks) {
    if (aborted) {
      markChunkEntriesFailed(failedByEntry, chunk, 'manual_edit_chunk_aborted');
      continue;
    }

    let result;
    try {
      result = normalizeApplyChunkResult(await pushApplyEventAndWait(chunk.batch, pageUrl, chunk.meta));
    } catch (err) {
      markChunkEntriesFailed(failedByEntry, chunk, err.message || 'chat_agent_error');
      aborted = true;
      continue;
    }

    for (const file of result.files) files.add(file);
    notes.push(...result.notes);

    const chunkFailedIds = new Set();
    for (const item of result.failed) {
      const entryId = item.entryId || item.id;
      if (!entryId) continue;
      chunkFailedIds.add(entryId);
      if (!failedByEntry.has(entryId)) {
        failedByEntry.set(entryId, {
          entryId,
          reason: item.reason || item.message || 'failed',
          candidates: Array.isArray(item.candidates) ? item.candidates : [],
        });
      }
    }

    if (result.status === 'error') {
      markChunkEntriesFailed(failedByEntry, chunk, result.message || firstFailureReason(result) || 'chat_agent_error');
      aborted = true;
      continue;
    }

    const reportedAppliedIds = new Set(result.appliedEntryIds);
    for (const entryId of reportedAppliedIds) {
      if (!chunk.entryIds.has(entryId) || chunkFailedIds.has(entryId)) continue;
      appliedOpsByEntry.set(entryId, (appliedOpsByEntry.get(entryId) || 0) + (chunk.opCountsByEntry.get(entryId) || 0));
    }

    for (const entryId of chunk.entryIds) {
      if (reportedAppliedIds.has(entryId) || chunkFailedIds.has(entryId)) continue;
      if (!failedByEntry.has(entryId)) {
        failedByEntry.set(entryId, { entryId, reason: 'not_reported_applied', candidates: [] });
      }
    }
  }

  const appliedEntryIds = [];
  for (const [entryId, expectedOps] of expectedOpsByEntry.entries()) {
    if (failedByEntry.has(entryId)) continue;
    if ((appliedOpsByEntry.get(entryId) || 0) === expectedOps && expectedOps > 0) {
      appliedEntryIds.push(entryId);
    } else if (!failedByEntry.has(entryId)) {
      failedByEntry.set(entryId, { entryId, reason: 'not_reported_applied', candidates: [] });
    }
  }

  const failed = [...failedByEntry.values()];
  return {
    status: failed.length === 0 ? 'done' : appliedEntryIds.length > 0 ? 'partial' : 'error',
    appliedEntryIds,
    failed,
    files: [...files],
    notes,
  };
}

function normalizeApplyChunkResult(result) {
  const status = result?.status === 'partial' ? 'partial' : result?.status === 'error' ? 'error' : 'done';
  return {
    status,
    message: typeof result?.message === 'string' ? result.message : null,
    appliedEntryIds: Array.isArray(result?.appliedEntryIds) ? result.appliedEntryIds.filter((id) => typeof id === 'string') : [],
    failed: Array.isArray(result?.failed) ? result.failed.filter(Boolean) : [],
    files: Array.isArray(result?.files) ? result.files.filter((file) => typeof file === 'string') : [],
    notes: Array.isArray(result?.notes) ? result.notes.filter((note) => typeof note === 'string') : [],
  };
}

function manualApplyResultShapeHint(eventId = 'EVENT_ID') {
  return `Use live-poll.mjs --reply ${eventId} done --data '{"status":"done","appliedEntryIds":["ENTRY_ID"],"failed":[],"files":["src/page.html"],"notes":[]}'`;
}

function invalidManualApplyResult(reason, eventId, extra = {}) {
  return {
    ok: false,
    body: {
      error: 'invalid_manual_apply_result',
      reason,
      hint: manualApplyResultShapeHint(eventId),
      ...extra,
    },
  };
}

function validateManualApplyResultMessage(msg, deferred) {
  let data = msg?.data;
  const eventId = msg?.id || deferred?.event?.id || 'EVENT_ID';
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return invalidManualApplyResult('missing_result_data', eventId);
  }
  if ('entries' in data || 'ops' in data) {
    return invalidManualApplyResult('summary_result_not_allowed', eventId);
  }
  if (!['done', 'partial', 'error'].includes(data.status)) {
    return invalidManualApplyResult('invalid_status', eventId, { status: data.status ?? null });
  }

  for (const key of ['appliedEntryIds', 'failed', 'files', 'notes']) {
    if (!Array.isArray(data[key])) {
      return invalidManualApplyResult(`${key}_must_be_array`, eventId);
    }
  }

  for (const [index, value] of data.appliedEntryIds.entries()) {
    if (typeof value !== 'string' || !value) {
      return invalidManualApplyResult('appliedEntryIds_must_contain_strings', eventId, { index });
    }
  }
  for (const [index, value] of data.files.entries()) {
    if (typeof value !== 'string' || !value) {
      return invalidManualApplyResult('files_must_contain_strings', eventId, { index });
    }
  }
  for (const [index, value] of data.notes.entries()) {
    if (typeof value !== 'string') {
      return invalidManualApplyResult('notes_must_contain_strings', eventId, { index });
    }
  }
  for (const [index, item] of data.failed.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return invalidManualApplyResult('failed_must_contain_objects', eventId, { index });
    }
    if (typeof item.entryId !== 'string' || !item.entryId) {
      return invalidManualApplyResult('failed_entryId_required', eventId, { index });
    }
    if (typeof item.reason !== 'string' || !item.reason) {
      return invalidManualApplyResult('failed_reason_required', eventId, { index });
    }
  }

  const eventEntryIds = new Set((deferred?.batch?.entries || []).map((entry) => entry.id).filter(Boolean));
  for (const entryId of data.appliedEntryIds) {
    if (eventEntryIds.size > 0 && !eventEntryIds.has(entryId)) {
      return invalidManualApplyResult('applied_entry_id_not_in_event', eventId, { entryId });
    }
  }
  for (const item of data.failed) {
    if (eventEntryIds.size > 0 && !eventEntryIds.has(item.entryId)) {
      return invalidManualApplyResult('failed_entry_id_not_in_event', eventId, { entryId: item.entryId });
    }
  }

  if (data.status === 'done') {
    if (data.failed.length > 0) {
      return invalidManualApplyResult('done_result_has_failed_entries', eventId);
    }
    if (countManualApplyOps(deferred?.batch) > 0 && data.appliedEntryIds.length === 0) {
      return invalidManualApplyResult('done_result_missing_applied_entry_ids', eventId);
    }
  }
  if (data.status === 'partial' && data.appliedEntryIds.length === 0 && data.failed.length === 0) {
    return invalidManualApplyResult('partial_result_has_no_entries', eventId);
  }
  if (data.status === 'error' && data.appliedEntryIds.length > 0) {
    return invalidManualApplyResult('error_result_has_applied_entries', eventId);
  }

  return {
    ok: true,
    result: {
      status: data.status,
      message: typeof data.message === 'string' ? data.message : undefined,
      appliedEntryIds: data.appliedEntryIds,
      failed: data.failed,
      files: data.files,
      notes: data.notes,
    },
  };
}

function firstFailureReason(result) {
  const first = Array.isArray(result?.failed) ? result.failed.find(Boolean) : null;
  return first?.reason || first?.message || null;
}

function markChunkEntriesFailed(failedByEntry, chunk, reason) {
  for (const entryId of chunk.entryIds) {
    if (failedByEntry.has(entryId)) continue;
    failedByEntry.set(entryId, { entryId, reason, candidates: [] });
  }
}

function splitManualApplyBatch(batch, maxOps) {
  const totalOpCount = countManualApplyOps(batch);
  if (totalOpCount <= maxOps) {
    return [{
      batch,
      meta: null,
      entryIds: new Set((batch?.entries || []).map((entry) => entry.id).filter(Boolean)),
      opCountsByEntry: new Map((batch?.entries || []).map((entry) => [entry.id, Array.isArray(entry.ops) ? entry.ops.length : 0])),
    }];
  }

  const rawChunks = [];
  let current = createManualApplyChunkBuilder();
  for (const entry of batch?.entries || []) {
    const ops = entry.ops || [];
    if (ops.length <= maxOps) {
      if (current.opCount > 0 && current.opCount + ops.length > maxOps) {
        rawChunks.push(current);
        current = createManualApplyChunkBuilder();
      }
      for (const op of ops) addOpToManualApplyChunk(current, entry, op);
      continue;
    }
    if (current.opCount > 0) {
      rawChunks.push(current);
      current = createManualApplyChunkBuilder();
    }
    for (const op of ops) {
      if (current.opCount >= maxOps) {
        rawChunks.push(current);
        current = createManualApplyChunkBuilder();
      }
      addOpToManualApplyChunk(current, entry, op);
    }
  }
  if (current.opCount > 0) rawChunks.push(current);

  return rawChunks.map((chunk, index) => ({
    batch: {
      ...batch,
      count: chunk.opCount,
      entries: chunk.entries,
      ops: chunk.ops,
      candidates: filterManualApplyChunkCandidates(batch, chunk.refsByEntry),
      context: {
        ...(batch?.context || {}),
        totalEntries: chunk.entries.length,
        totalOps: chunk.opCount,
        chunkIndex: index + 1,
        chunkTotal: rawChunks.length,
        totalApplyOps: totalOpCount,
      },
    },
    meta: {
      index: index + 1,
      total: rawChunks.length,
      opCount: chunk.opCount,
      totalOpCount,
    },
    entryIds: new Set(chunk.entries.map((entry) => entry.id).filter(Boolean)),
    opCountsByEntry: chunk.opCountsByEntry,
  }));
}

function createManualApplyChunkBuilder() {
  return {
    entries: [],
    entryById: new Map(),
    entryIds: new Set(),
    ops: [],
    refsByEntry: new Map(),
    opCountsByEntry: new Map(),
    opCount: 0,
  };
}

function addOpToManualApplyChunk(chunk, entry, op) {
  let chunkEntry = chunk.entryById.get(entry.id);
  if (!chunkEntry) {
    chunkEntry = { ...entry, ops: [] };
    chunk.entryById.set(entry.id, chunkEntry);
    chunk.entryIds.add(entry.id);
    chunk.entries.push(chunkEntry);
  }
  chunkEntry.ops.push(op);
  chunk.ops.push({ ...op, entryId: op.entryId || entry.id });
  if (!chunk.refsByEntry.has(entry.id)) chunk.refsByEntry.set(entry.id, new Set());
  if (op.ref) chunk.refsByEntry.get(entry.id).add(op.ref);
  chunk.opCountsByEntry.set(entry.id, (chunk.opCountsByEntry.get(entry.id) || 0) + 1);
  chunk.opCount += 1;
}

function filterManualApplyChunkCandidates(batch, refsByEntry) {
  return (batch?.candidates || []).filter((candidate) => {
    const refs = refsByEntry.get(candidate.entryId);
    if (!refs) return false;
    if (!candidate.ref) return true;
    return refs.has(candidate.ref);
  });
}

function resolveApplyDeferred(eventId, body) {
  const deferred = state.pendingApplyDeferreds.get(eventId);
  if (!deferred) return false;
  state.pendingApplyDeferreds.delete(eventId);
  clearTimeout(deferred.timer);
  removeManualApplyEvidence(deferred.event?.evidencePath);
  deferred.resolve(body);
  return true;
}

function rejectApplyDeferred(eventId, reason) {
  const deferred = state.pendingApplyDeferreds.get(eventId);
  if (!deferred) return false;
  state.pendingApplyDeferreds.delete(eventId);
  clearTimeout(deferred.timer);
  removeManualApplyEvidence(deferred.event?.evidencePath);
  deferred.reject(new Error(reason || 'chat_agent_error'));
  return true;
}

function snapshotApplyEventFiles(batch) {
  const snapshot = new Map();
  for (const relativeFile of collectManualApplyFiles(batch)) {
    const absolute = path.resolve(process.cwd(), relativeFile);
    try {
      snapshot.set(relativeFile, {
        exists: fs.existsSync(absolute),
        content: fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf-8') : '',
      });
    } catch {
      // If a file cannot be read before dispatch, do not attempt late rollback.
    }
  }
  return snapshot;
}

function manualApplyTransactionPath(cwd = process.cwd()) {
  return path.join(getLiveDir(cwd), 'manual-edit-apply-transaction.json');
}

function readManualApplyTransaction(cwd = process.cwd()) {
  const file = manualApplyTransactionPath(cwd);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function writeManualApplyTransaction({ cwd = process.cwd(), pageUrl = null, batch }) {
  const file = manualApplyTransactionPath(cwd);
  const files = collectManualApplyFiles(batch);
  const transaction = {
    version: 1,
    id: randomUUID().replace(/-/g, '').slice(0, 8),
    createdAt: new Date().toISOString(),
    pageUrl,
    entryIds: (batch?.entries || []).map((entry) => entry.id).filter(Boolean),
    files: files.map((relativeFile) => {
      const absolute = path.resolve(cwd, relativeFile);
      const exists = fs.existsSync(absolute);
      return {
        file: relativeFile,
        exists,
        content: exists ? fs.readFileSync(absolute, 'utf-8') : '',
      };
    }),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(transaction, null, 2) + '\n', 'utf-8');
  fs.renameSync(`${file}.tmp`, file);
  return transaction;
}

function clearManualApplyTransaction(cwd = process.cwd(), transactionId = null) {
  const file = manualApplyTransactionPath(cwd);
  if (!fs.existsSync(file)) return false;
  if (transactionId) {
    const existing = readManualApplyTransaction(cwd);
    if (existing?.id && existing.id !== transactionId) return false;
  }
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

function rollbackManualApplyTransaction({ cwd = process.cwd(), pageUrl = null, reason = 'manual_edit_transaction_rollback' } = {}) {
  const transaction = readManualApplyTransaction(cwd);
  if (!transaction) return null;
  if (pageUrl && transaction.pageUrl && transaction.pageUrl !== pageUrl) return null;

  let pendingIds = new Set();
  try {
    const buffer = readManualEditsBuffer(cwd);
    pendingIds = new Set((buffer.entries || []).map((entry) => entry.id).filter(Boolean));
  } catch {
    pendingIds = new Set(transaction.entryIds || []);
  }
  const shouldRollback = (transaction.entryIds || []).some((id) => pendingIds.has(id));
  if (!shouldRollback) {
    clearManualApplyTransaction(cwd, transaction.id);
    return { id: transaction.id, reason, rolledBackFiles: [], rollbackFailures: [], skipped: 'entries_not_pending' };
  }

  const rolledBackFiles = [];
  const rollbackFailures = [];
  for (const item of transaction.files || []) {
    const relativeFile = normalizeProjectFile(item.file);
    if (!relativeFile) continue;
    const absolute = path.resolve(cwd, relativeFile);
    try {
      if (item.exists) {
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, item.content || '', 'utf-8');
      } else if (fs.existsSync(absolute)) {
        fs.rmSync(absolute);
      }
      rolledBackFiles.push(relativeFile);
    } catch (err) {
      rollbackFailures.push({ file: relativeFile, reason: 'restore_failed', message: err.message || String(err) });
    }
  }
  clearManualApplyTransaction(cwd, transaction.id);
  recordManualEditActivity('manual_edit_transaction_rolled_back', {
    id: transaction.id,
    pageUrl: transaction.pageUrl || null,
    reason,
    entryIds: transaction.entryIds || [],
    rolledBackFiles: rolledBackFiles.map(summarizeManualLogFile).filter(Boolean),
    rollbackFailures: summarizeManualDiagnostics(rollbackFailures),
  });
  return { id: transaction.id, reason, rolledBackFiles, rollbackFailures };
}

function collectManualApplyFiles(batch, extraFiles = []) {
  const files = [];
  for (const entry of batch?.entries || []) {
    for (const op of entry.ops || []) files.push(op.sourceHint?.file);
  }
  for (const candidate of batch?.candidates || []) {
    files.push(candidate.sourceHint?.relativeFile, candidate.sourceHint?.file);
    for (const item of candidate.textMatches || []) files.push(item.file);
    for (const item of candidate.objectKeyMatches || []) files.push(item.file);
    for (const item of candidate.locatorMatches || []) files.push(item.file);
    for (const item of candidate.contextTextMatches || []) files.push(item.file);
  }
  files.push(...(extraFiles || []));
  return [...new Set(files)]
    .map((file) => normalizeProjectFile(file))
    .filter(Boolean);
}

function normalizeProjectFile(file) {
  if (!file || typeof file !== 'string') return null;
  const absolute = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  const relative = path.relative(process.cwd(), absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative;
}

function rollbackApplySnapshot(batch, rollbackSnapshot, extraFiles = [], reason = 'manual_edit_apply_snapshot_rollback') {
  const scope = collectManualApplyFiles(batch, extraFiles);
  const rolledBackFiles = [];
  const rollbackFailures = [];
  for (const relativeFile of scope) {
    const before = rollbackSnapshot?.get(relativeFile);
    if (!before) continue;
    const absolute = path.resolve(process.cwd(), relativeFile);
    try {
      if (before.exists) {
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, before.content, 'utf-8');
      } else if (fs.existsSync(absolute)) {
        fs.rmSync(absolute);
      }
      rolledBackFiles.push(relativeFile);
    } catch (err) {
      rollbackFailures.push({ file: relativeFile, reason: 'restore_failed', message: err.message || String(err) });
    }
  }
  return { rolledBackFiles, rollbackFailures };
}

function rollbackTimedOutApplyReply(msg) {
  const details = state.timedOutApplyIds.get(msg.id);
  if (!details) return { rolledBackFiles: [], rollbackFailures: [] };
  state.timedOutApplyIds.delete(msg.id);
  return rollbackApplySnapshot(details.batch, details.rollbackSnapshot, msg.data?.files || [], 'stale_manual_edit_apply_reply');
}

// Cap per-annotation upload size. A full 1920×1080 PNG is typically <1 MB;
// cap at 10 MB to guard against runaway writes from a misbehaving client.
const MAX_ANNOTATION_BYTES = 10 * 1024 * 1024;

function enqueueEvent(event) {
  if (!event || (event.id && state.pendingEvents.some((entry) => entry.event?.id === event.id && entry.event?.type === event.type))) return;
  state.pendingEvents.push({ event, leaseUntil: 0, seq: state.nextEventSeq++ });
  flushPendingPolls();
}

function restorePendingEventsFromStore() {
  if (!state.sessionStore) return;
  for (const snapshot of state.sessionStore.listActiveSessions()) {
    if (snapshot.pendingEvent) enqueueEvent(snapshot.pendingEvent);
  }
}

function findAvailablePendingEvent(now = Date.now()) {
  for (const entry of state.pendingEvents) {
    if (entry.leaseUntil && entry.leaseUntil > now) continue;
    return entry;
  }
  return null;
}

function leaseEvent(entry, leaseMs) {
  if (!entry.event?.id) {
    const idx = state.pendingEvents.indexOf(entry);
    if (idx !== -1) state.pendingEvents.splice(idx, 1);
    return entry.event;
  }
  entry.leaseUntil = Date.now() + leaseMs;
  scheduleLeaseFlush();
  broadcastAgentPollingIfChanged();
  return entry.event;
}

function acknowledgePendingEvent(id) {
  if (!id) return false;
  const idx = state.pendingEvents.findIndex((entry) => entry.event?.id === id);
  if (idx === -1) return false;
  const acknowledged = state.pendingEvents[idx].event;
  state.pendingEvents.splice(idx, 1);
  scheduleLeaseFlush();
  broadcastAgentPollingIfChanged();
  return acknowledged;
}

function findPendingEventById(id) {
  if (!id) return null;
  const entry = state.pendingEvents.find((item) => item.event?.id === id);
  return entry?.event || null;
}

function manualApplyReplyCommand(eventOrId = 'EVENT_ID') {
  const id = typeof eventOrId === 'string' ? eventOrId : eventOrId?.id || 'EVENT_ID';
  return `live-poll.mjs --reply ${id} done --data '<json>'`;
}

function buildManualApplyAgentAction(eventOrId = 'EVENT_ID') {
  return {
    kind: 'manual_edit_apply',
    required: 'apply_source_edits_then_reply',
    replyCommand: manualApplyReplyCommand(eventOrId),
    warning: 'Polling only leases this work item; it does not commit source edits.',
  };
}

function summarizeManualApplyEvent(event = {}, batch = event.batch) {
  const entries = Array.isArray(batch?.entries) ? batch.entries : [];
  const opCount = entries.reduce((sum, entry) => sum + (Array.isArray(entry.ops) ? entry.ops.length : 0), 0);
  return {
    pageUrl: event.pageUrl || null,
    chunk: event.chunk || null,
    entryCount: entries.length,
    opCount,
    files: collectManualApplyFiles(batch),
  };
}

function summarizePendingEventForStatus(entry) {
  const event = entry.event || {};
  const summary = {
    id: event.id,
    type: event.type,
    leased: !!(entry.leaseUntil && entry.leaseUntil > Date.now()),
    leaseUntil: entry.leaseUntil || null,
  };
  if (event.type === 'manual_edit_apply') {
    summary.pageUrl = event.pageUrl || null;
    summary.chunk = event.chunk || null;
    summary.repair = event.repair || null;
    summary.evidencePath = event.evidencePath || null;
    summary.agentAction = event.agentAction || buildManualApplyAgentAction(event);
    summary.manualApplySummary = summarizeManualApplyEvent(event, state.pendingApplyDeferreds.get(event.id)?.batch || event.batch);
  }
  return summary;
}

function summarizeActiveSessionForClient(snapshot = {}) {
  return {
    id: snapshot.id,
    phase: snapshot.phase,
    pageUrl: snapshot.pageUrl ?? null,
    sourceFile: snapshot.sourceFile ?? null,
    previewFile: snapshot.previewFile ?? null,
    previewMode: snapshot.previewMode ?? null,
    expectedVariants: snapshot.expectedVariants ?? 0,
    arrivedVariants: snapshot.arrivedVariants ?? 0,
    visibleVariant: snapshot.visibleVariant ?? null,
    checkpointRevision: snapshot.checkpointRevision ?? 0,
    paramValues: snapshot.paramValues || {},
  };
}

function activeSessionSummaries() {
  if (!state.sessionStore) return [];
  return state.sessionStore.listActiveSessions().map((snapshot) => summarizeActiveSessionForClient(snapshot));
}

function cancelQueuedAnonymousExitEvents() {
  let removed = 0;
  for (let i = state.pendingEvents.length - 1; i >= 0; i -= 1) {
    const event = state.pendingEvents[i]?.event;
    if (event?.type !== 'exit' || event.id) continue;
    state.pendingEvents.splice(i, 1);
    removed += 1;
  }
  if (removed > 0) {
    scheduleLeaseFlush();
    broadcastAgentPollingIfChanged();
  }
  return removed;
}

function cancelPendingManualApplyEvents(pageUrl, reason = 'manual_edit_discarded') {
  const canceledById = new Map();
  const shouldCancel = (event) => event?.type === 'manual_edit_apply' && (!pageUrl || event.pageUrl === pageUrl);

  for (let i = state.pendingEvents.length - 1; i >= 0; i -= 1) {
    const event = state.pendingEvents[i]?.event;
    if (!shouldCancel(event)) continue;
    state.pendingEvents.splice(i, 1);
    removeManualApplyEvidence(event.evidencePath);
    canceledById.set(event.id, {
      id: event.id,
      pageUrl: event.pageUrl,
      entryCount: event.batch?.entries?.length || 0,
    });
  }

  for (const [eventId, deferred] of [...state.pendingApplyDeferreds.entries()]) {
    if (!shouldCancel(deferred.event)) continue;
    state.pendingApplyDeferreds.delete(eventId);
    clearTimeout(deferred.timer);
    const rollback = rollbackApplySnapshot(deferred.batch, deferred.rollbackSnapshot, [], reason);
    tombstoneTimedOutApplyId(eventId, {
      batch: deferred.batch,
      rollbackSnapshot: deferred.rollbackSnapshot,
      reason,
    });
    removeManualApplyEvidence(deferred.event?.evidencePath);
    canceledById.set(eventId, {
      id: eventId,
      pageUrl: deferred.pageUrl,
      entryCount: deferred.batch?.entries?.length || 0,
      rolledBackFiles: rollback.rolledBackFiles,
      rollbackFailures: rollback.rollbackFailures,
    });
    deferred.reject(new Error(reason));
  }

  if (canceledById.size > 0) flushPendingPolls();
  return [...canceledById.values()];
}

function scheduleLeaseFlush() {
  if (state.leaseTimer) {
    clearTimeout(state.leaseTimer);
    state.leaseTimer = null;
  }
  const now = Date.now();
  const nextLeaseUntil = state.pendingEvents
    .map((entry) => entry.leaseUntil || 0)
    .filter((leaseUntil) => leaseUntil > now)
    .sort((a, b) => a - b)[0];
  if (!nextLeaseUntil) return;
  state.leaseTimer = setTimeout(() => {
    state.leaseTimer = null;
    flushPendingPolls();
    broadcastAgentPollingIfChanged();
  }, Math.max(0, nextLeaseUntil - now + POLL_LEASE_EXPIRY_TIMER_GRACE_MS));
}

function flushPendingPolls() {
  let changed = false;
  while (state.pendingPolls.length > 0) {
    const entry = findAvailablePendingEvent();
    if (!entry) {
      scheduleLeaseFlush();
      broadcastAgentPollingIfChanged();
      return;
    }
    const poll = state.pendingPolls.shift();
    poll.resolve(leaseEvent(entry, poll.leaseMs));
    changed = true;
  }
  scheduleLeaseFlush();
  if (changed) broadcastAgentPollingIfChanged();
}

function agentPollingConnected() {
  const now = Date.now();
  return state.pendingPolls.length > 0
    || state.pendingEvents.some((entry) => entry.leaseUntil && entry.leaseUntil > now);
}

function broadcastAgentPollingIfChanged() {
  const connected = agentPollingConnected();
  if (state.lastAgentPollingBroadcast === connected) return;
  state.lastAgentPollingBroadcast = connected;
  broadcast({ type: 'agent_polling', connected });
}

/** Push a message to all connected SSE clients. */
function broadcast(msg) {
  const data = 'data: ' + JSON.stringify(msg) + '\n\n';
  for (const res of state.sseClients) {
    try { res.write(data); } catch { /* client gone */ }
  }
}

function recordManualEditActivity(type, details = {}) {
  const entry = {
    seq: state.nextManualEditSeq++,
    type,
    ts: new Date().toISOString(),
    ...details,
  };
  state.manualEditActivity = entry;
  if (DEBUG_MANUAL_EDIT_EVENTS) {
    try {
      const filePath = path.join(getLiveDir(process.cwd()), 'manual-edit-events.jsonl');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
    } catch {
      /* diagnostics are best-effort; never block live mode on observability */
    }
  }
  broadcast(entry);
  return entry;
}

function getManualEditStatus() {
  try {
    const { totalCount, perPage } = countPendingByPage(process.cwd());
    return { totalCount, perPage, lastActivity: state.manualEditActivity };
  } catch (err) {
    return {
      totalCount: null,
      perPage: {},
      lastActivity: state.manualEditActivity,
      error: err.message,
    };
  }
}

function summarizePendingManualEditBatch(pageUrl = null) {
  try {
    const buffer = readManualEditsBuffer(process.cwd());
    const entries = (buffer.entries || [])
      .filter((entry) => !pageUrl || entry.pageUrl === pageUrl);
    return {
      pendingEntryCount: entries.length,
      pendingOpCount: entries.reduce((sum, entry) => sum + (entry.ops?.length || 0), 0),
    };
  } catch (err) {
    return { pendingSummaryError: err.message || String(err) };
  }
}

function summarizeManualApplyFailures(failed) {
  if (!Array.isArray(failed)) return [];
  return failed.slice(0, 20).map((item) => ({
    id: item.id || item.entryId || null,
    reason: item.reason || item.message || 'failed',
    message: compactManualLogText(item.message, 300),
    files: Array.isArray(item.files) ? item.files.slice(0, 12).map(summarizeManualLogFile).filter(Boolean) : undefined,
    checks: summarizeManualDiagnostics(item.checks),
    failures: summarizeManualDiagnostics(item.failures),
    candidates: summarizeManualDiagnostics(item.candidates),
  }));
}

function summarizeManualDiagnostics(items) {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return items.slice(0, 12).map((item) => ({
    reason: item.reason || item.kind || undefined,
    detail: compactManualLogText(item.detail, 220),
    message: compactManualLogText(item.message, 300),
    file: summarizeManualLogFile(item.file || item.relativeFile),
    line: item.line || undefined,
    ref: compactManualLogText(item.ref, 180),
    marker: compactManualLogText(item.marker, 120),
    files: Array.isArray(item.files) ? item.files.slice(0, 8).map(summarizeManualLogFile).filter(Boolean) : undefined,
  }));
}

function summarizeManualLogFile(file) {
  if (!file || typeof file !== 'string') return undefined;
  if (!path.isAbsolute(file)) return file;
  const relative = path.relative(process.cwd(), file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
}

function compactManualLogText(value, max = 200) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max) + `... [truncated ${normalized.length - max} chars]`;
}

// ---------------------------------------------------------------------------
// Load scripts
// ---------------------------------------------------------------------------

function loadBrowserScripts() {
  // Detection script: prefer the skill-bundled detector, then fall back to
  // source/npm package locations for local development and older installs.
  // This one IS cached — detect.js rarely changes during a session.
  const detectPaths = [
    path.join(__dirname, 'detector', 'detect-antipatterns-browser.js'),
    path.join(__dirname, '..', '..', 'cli', 'engine', 'detect-antipatterns-browser.js'),
    path.join(__dirname, '..', '..', '..', '..', 'cli', 'engine', 'detect-antipatterns-browser.js'),
    path.join(process.cwd(), 'node_modules', 'impeccable', 'cli', 'engine', 'detect-antipatterns-browser.js'),
  ];
  let detectScript = '';
  for (const p of detectPaths) {
    try { detectScript = fs.readFileSync(p, 'utf-8'); break; } catch { /* try next */ }
  }

  // live-browser.js: DO NOT cache. Return the path so the /live.js handler
  // can re-read on every request. Editing the browser script during iteration
  // should land on the next tab reload, not require a server restart.
  const sessionPath = path.join(__dirname, 'live-browser-session.js');
  const livePath = path.join(__dirname, 'live-browser.js');
  for (const p of [sessionPath, livePath]) {
    if (!fs.existsSync(p)) {
      process.stderr.write('Error: live browser script not found at ' + p + '\n');
      process.exit(1);
    }
  }

  return { detectScript, sessionPath, livePath };
}

function hasProjectContext() {
  // PRODUCT.md carries brand voice / anti-references — that's what determines
  // whether variants are brand-aware. DESIGN.md (visual tokens) is a separate
  // concern, surfaced by the design panel's own empty state.
  try {
    fs.accessSync(path.join(CONTEXT_DIR, 'PRODUCT.md'), fs.constants.R_OK);
    return true;
  } catch { return false; }
}

function statOrNull(filePath) {
  try { return fs.statSync(filePath); } catch { return null; }
}

// HTTP request handler
// ---------------------------------------------------------------------------

function createRequestHandler({ detectScript, sessionPath, livePath }) {
  return (req, res) => {
    const url = new URL(req.url, `http://localhost:${state.port}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const p = url.pathname;

    // --- Scripts ---
    if (p === '/live.js') {
      // Re-read from disk each request so edits to live-browser.js land on
      // the next tab reload. No-store headers prevent browser caching across
      // sessions — during iteration, a cached old script silently breaks
      // every subsequent session.
      let sessionScript;
      let liveScript;
      try {
        sessionScript = fs.readFileSync(sessionPath, 'utf-8');
        liveScript = fs.readFileSync(livePath, 'utf-8');
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error reading live browser scripts: ' + err.message);
        return;
      }
      const body =
        `window.__IMPECCABLE_TOKEN__ = '${state.token}';\n` +
        `window.__IMPECCABLE_PORT__ = ${state.port};\n` +
        // Canonical command vocabulary (values + labels + icons). live-browser.js
        // builds its action picker from this instead of an inline copy.
        `window.__IMPECCABLE_VOCAB__ = ${JSON.stringify(LIVE_COMMANDS)};\n` +
        sessionScript + '\n' +
        liveScript;
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
      });
      res.end(body);
      return;
    }
    if (p === '/detect.js' || p === '/') {
      if (!detectScript) { res.writeHead(404); res.end('Not available'); return; }
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(detectScript);
      return;
    }

    // --- Vendored modern-screenshot (UMD build) ---
    // Lazy-loaded by live.js when the user clicks Go; exposes
    // window.modernScreenshot.domToBlob(...) for capture.
    if (p === '/modern-screenshot.js') {
      const vendorPath = path.join(__dirname, 'modern-screenshot.umd.js');
      try {
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        res.end(fs.readFileSync(vendorPath));
      } catch {
        res.writeHead(404); res.end('Vendor script not found');
      }
      return;
    }

    // --- Annotation upload (browser → server, raw PNG body) ---
    // Client generates the eventId, POSTs the PNG, then POSTs the generate
    // event with screenshotPath already set. Keeps bytes out of the SSE/poll
    // bridge and preserves the "one shot from the user's POV" UX.
    if (p === '/annotation' && req.method === 'POST') {
      const token = url.searchParams.get('token');
      if (token !== state.token) { res.writeHead(401); res.end('Unauthorized'); return; }
      const eventId = url.searchParams.get('eventId');
      if (!eventId || !/^[A-Za-z0-9_-]{1,64}$/.test(eventId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid eventId' }));
        return;
      }
      if ((req.headers['content-type'] || '').toLowerCase() !== 'image/png') {
        res.writeHead(415, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Content-Type must be image/png' }));
        return;
      }
      if (!state.sessionDir) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session dir unavailable' }));
        return;
      }
      const chunks = [];
      let total = 0;
      let aborted = false;
      req.on('data', (c) => {
        if (aborted) return;
        total += c.length;
        if (total > MAX_ANNOTATION_BYTES) {
          aborted = true;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (aborted) return;
        const absPath = path.join(state.sessionDir, eventId + '.png');
        try {
          fs.writeFileSync(absPath, Buffer.concat(chunks));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Write failed: ' + err.message }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: absPath }));
      });
      req.on('error', () => {
        if (!aborted) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Upload failed' }));
        }
      });
      return;
    }

    // --- Health ---
    if (p === '/status') {
      const token = url.searchParams.get('token');
      if (token !== state.token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const sessions = activeSessionSummaries();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        port: state.port,
        connectedClients: state.sseClients.size,
        pendingEvents: state.pendingEvents.map((entry) => summarizePendingEventForStatus(entry)),
        agentPolling: agentPollingConnected(),
        activeSessions: sessions,
        manualEdits: getManualEditStatus(),
      }));
      return;
    }

    if (p === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok', port: state.port, mode: 'variant',
        hasProjectContext: hasProjectContext(),
        connectedClients: state.sseClients.size,
      }));
      return;
    }

    // --- Design system (unified v2 response) + raw ---
    //   /design-system.json    returns both parsed DESIGN.md and .impeccable/design.json
    //                          sidecar when present. Panel merges them:
    //                            { present, parsed, sidecar, hasMd, hasSidecar,
    //                              mdNewerThanJson, parseError?, sidecarError? }
    //                          - parsed: output of parseDesignMd (frontmatter
    //                            + six canonical sections) when DESIGN.md exists.
    //                          - sidecar: .impeccable/design.json contents when present.
    //                            Expected shape: schemaVersion 2, carrying
    //                            extensions + components + narrative.
    //   /design-system/raw     returns DESIGN.md markdown verbatim
    if (p === '/design-system.json' || p === '/design-system/raw') {
      const token = url.searchParams.get('token');
      if (token !== state.token) { res.writeHead(401); res.end('Unauthorized'); return; }

      const mdPath = path.join(CONTEXT_DIR, 'DESIGN.md');
      const jsonPath = resolveDesignSidecarPath(process.cwd(), CONTEXT_DIR) || getDesignSidecarPath(process.cwd());
      const mdStat = statOrNull(mdPath);
      const jsonStat = statOrNull(jsonPath);

      if (p === '/design-system/raw') {
        if (!mdStat) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(fs.readFileSync(mdPath, 'utf-8'));
        return;
      }

      if (!mdStat && !jsonStat) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ present: false }));
        return;
      }

      const response = {
        present: true,
        hasMd: !!mdStat,
        hasSidecar: !!jsonStat,
        mdNewerThanJson: !!(mdStat && jsonStat && mdStat.mtimeMs > jsonStat.mtimeMs + 1000),
      };

      if (mdStat) {
        try {
          response.parsed = parseDesignMd(fs.readFileSync(mdPath, 'utf-8'));
        } catch (err) {
          response.parseError = err.message;
        }
      }

      if (jsonStat) {
        try {
          response.sidecar = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch (err) {
          response.sidecarError = 'Failed to parse .impeccable/design.json: ' + err.message;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }

    // --- Source file (no-HMR fallback) ---
    if (p === '/source') {
      const token = url.searchParams.get('token');
      if (token !== state.token) { res.writeHead(401); res.end('Unauthorized'); return; }
      const filePath = url.searchParams.get('path');
      if (!filePath || filePath.includes('..')) { res.writeHead(400); res.end('Bad path'); return; }
      const absPath = path.resolve(process.cwd(), filePath);
      if (!absPath.startsWith(process.cwd())) { res.writeHead(403); res.end('Forbidden'); return; }
      let content;
      try { content = fs.readFileSync(absPath, 'utf-8'); }
      catch { res.writeHead(404); res.end('File not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    }

    // --- SSE: server→browser push (replaces WebSocket) ---
    if (p === '/events' && req.method === 'GET') {
      const token = url.searchParams.get('token');
      if (token !== state.token) { res.writeHead(401); res.end('Unauthorized'); return; }
      clearTimeout(state.exitTimer);
      state.exitTimer = null;
      cancelQueuedAnonymousExitEvents();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: ' + JSON.stringify({
        type: 'connected',
        hasProjectContext: hasProjectContext(),
        agentPolling: agentPollingConnected(),
        activeSessions: activeSessionSummaries(),
      }) + '\n\n');

      state.sseClients.add(res);

      // Keepalive: SSE comment every 30s prevents silent connection drops.
      const heartbeat = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch { clearInterval(heartbeat); }
      }, SSE_HEARTBEAT_INTERVAL);

      req.on('close', () => {
        clearInterval(heartbeat);
        state.sseClients.delete(res);
        if (state.sseClients.size === 0) {
          clearTimeout(state.exitTimer);
          state.exitTimer = setTimeout(() => {
            if (state.sseClients.size === 0) enqueueEvent({ type: 'exit' });
          }, 8000);
        }
      });
      return;
    }

    // --- Manual copy edits: Save stages entries, Apply commits the staged
    // page batch through the local AI copy-edit runner.
    if (p === '/manual-edit-stash' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let msg;
        try { msg = JSON.parse(body); } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        if (msg.token !== state.token) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        const error = validateEvent({ ...msg, type: 'manual_edits' });
        if (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error }));
          return;
        }
        try {
          stageManualEditEntry(process.cwd(), {
            id: msg.id,
            pageUrl: msg.pageUrl,
            element: msg.element,
            ops: msg.ops,
          });
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'stash_write_failed', message: err.message }));
          return;
        }
        const { totalCount, perPage } = countPendingByPage(process.cwd());
        const pendingCount = perPage[msg.pageUrl] || 0;
        recordManualEditActivity('manual_edit_stashed', {
          id: msg.id,
          pageUrl: msg.pageUrl,
          opCount: msg.ops.length,
          pendingCount,
          totalCount,
          hintedFileCount: new Set((msg.ops || []).map((op) => summarizeManualLogFile(op.sourceHint?.file)).filter(Boolean)).size,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, pendingCount, totalCount, perPage }));
      });
      return;
    }

    // GET /manual-edit-stash?pageUrl=<url>  →  { count, totalCount, perPage, entries }
    if (p === '/manual-edit-stash' && req.method === 'GET') {
      const token = url.searchParams.get('token');
      if (token !== state.token) { res.writeHead(401); res.end('Unauthorized'); return; }
      const pageUrl = url.searchParams.get('pageUrl') || '';
      const { totalCount, perPage } = countPendingByPage(process.cwd());
      const buffer = readManualEditsBuffer(process.cwd());
      const entriesForPage = pageUrl ? buffer.entries.filter((e) => e.pageUrl === pageUrl) : buffer.entries;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        count: pageUrl ? (perPage[pageUrl] || 0) : totalCount,
        totalCount,
        perPage,
        entries: entriesForPage,
      }));
      return;
    }

    // POST /manual-edit-commit?pageUrl=<url>  →  ask the AI to apply the staged page batch.
    if (p === '/manual-edit-commit' && req.method === 'POST') {
      const token = url.searchParams.get('token');
      if (token !== state.token) { res.writeHead(401); res.end('Unauthorized'); return; }
      const pageUrl = url.searchParams.get('pageUrl');
      const asyncMode = /^(1|true|yes)$/i.test(url.searchParams.get('async') || '');
      const repairOnly = /^(1|true|yes)$/i.test(url.searchParams.get('repair') || '');
      const existingTransaction = readManualApplyTransaction(process.cwd());
      if (repairOnly && !existingTransaction) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'manual_edit_repair_transaction_missing' }));
        return;
      }
      const recoveredTransaction = repairOnly ? null : rollbackManualApplyTransaction({
        cwd: process.cwd(),
        pageUrl,
        reason: 'manual_edit_commit_recovered_abandoned_transaction',
      });
      const before = getManualEditStatus();
      const pendingCount = pageUrl ? (before.perPage[pageUrl] || 0) : before.totalCount;
      recordManualEditActivity('manual_edit_commit_started', {
        pageUrl,
        repairOnly,
        pendingCount,
        totalCount: before.totalCount,
        recoveredTransaction: recoveredTransaction ? {
          id: recoveredTransaction.id,
          reason: recoveredTransaction.reason,
          skipped: recoveredTransaction.skipped,
          rolledBackFiles: recoveredTransaction.rolledBackFiles,
          rollbackFailures: summarizeManualDiagnostics(recoveredTransaction.rollbackFailures),
        } : null,
        ...summarizePendingManualEditBatch(pageUrl),
      });
      if (asyncMode) {
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'started',
          pendingCount,
          totalCount: before.totalCount,
          perPage: before.perPage,
        }));
      }
      (async () => {
        let result;
        let routedProvider = 'subprocess';
        let transaction = null;
        let commitBatch = null;
        try {
          if (pendingCount > 0) {
            const transactionBatch = buildManualEditEvidence({ cwd: process.cwd(), pageUrl });
            commitBatch = transactionBatch;
            if (!repairOnly && countManualApplyOps(transactionBatch) > 0) {
              transaction = writeManualApplyTransaction({
                cwd: process.cwd(),
                pageUrl,
                batch: transactionBatch,
              });
            } else if (repairOnly && existingTransaction) {
              transaction = existingTransaction;
            }
          }
          const requestedMode = (process.env.IMPECCABLE_LIVE_COPY_AGENT || 'auto').trim().toLowerCase();
          const useChatRoute = requestedMode === 'chat'
            || (requestedMode === 'auto' && chatAgentLikelyActive());
          if (useChatRoute) {
            routedProvider = 'chat';
            const timeoutMs = Number(process.env.IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS || 120000);
            result = await commitManualEdits({
              cwd: process.cwd(),
              pageUrl,
              provider: 'chat',
              env: process.env,
              timeoutMs,
              chatAvailable: chatAgentLikelyActive,
              applyBatchToSource: (batch, context) => pushApplyBatchInChunksAndWait(batch, pageUrl, context),
              repairOnly,
              transactionId: transaction?.id || existingTransaction?.id || null,
              batch: commitBatch,
            });
          } else {
            const timeoutMs = Number(process.env.IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS || 120000);
            const provider = ['codex', 'claude', 'mock'].includes(requestedMode) ? requestedMode : undefined;
            result = await commitManualEdits({
              cwd: process.cwd(),
              pageUrl,
              provider,
              env: process.env,
              timeoutMs,
              chatAvailable: chatAgentLikelyActive,
              repairOnly,
              transactionId: transaction?.id || existingTransaction?.id || null,
              batch: commitBatch,
            });
          }
        } catch (err) {
          if (transaction) {
            rollbackManualApplyTransaction({
              cwd: process.cwd(),
              pageUrl,
              reason: 'manual_edit_commit_exception',
            });
          }
          const message = err.stderr?.toString?.() || err.message;
          recordManualEditActivity('manual_edit_commit_failed', {
            pageUrl,
            provider: routedProvider,
            error: 'manual_edit_commit_failed',
            message,
            transactionId: transaction?.id || null,
          });
          if (!asyncMode) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'manual_edit_commit_failed',
              message,
            }));
          }
          return;
        } finally {
          if (transaction) {
            const shouldKeepTransaction = result?.needsManualDecision === true;
            if (!shouldKeepTransaction) clearManualApplyTransaction(process.cwd(), transaction.id);
          }
        }
        const { totalCount, perPage } = countPendingByPage(process.cwd());
        if (result?.needsManualDecision) {
          recordManualEditActivity('manual_edit_repair_needs_decision', {
            pageUrl,
            provider: routedProvider,
            transactionId: transaction?.id || existingTransaction?.id || null,
            repair: result.repair || null,
            failed: summarizeManualApplyFailures(result.failed),
            files: Array.isArray(result.files) ? result.files.slice(0, 20).map(summarizeManualLogFile).filter(Boolean) : [],
            remainingCount: pageUrl ? (perPage[pageUrl] || 0) : totalCount,
            totalCount,
          });
        } else {
          recordManualEditActivity('manual_edit_commit_done', {
            pageUrl,
            provider: routedProvider,
            reason: result.reason || null,
            repair: result.repair || null,
            appliedCount: Array.isArray(result.applied) ? result.applied.length : 0,
            failedCount: Array.isArray(result.failed) ? result.failed.length : 0,
            failed: summarizeManualApplyFailures(result.failed),
            files: Array.isArray(result.files) ? result.files.slice(0, 20).map(summarizeManualLogFile).filter(Boolean) : [],
            warnings: summarizeManualDiagnostics(result.warnings),
            rolledBackFiles: Array.isArray(result.rolledBackFiles) ? result.rolledBackFiles.slice(0, 20).map(summarizeManualLogFile).filter(Boolean) : [],
            rollbackFailures: summarizeManualDiagnostics(result.rollbackFailures),
            unreportedFiles: Array.isArray(result.unreportedFiles) ? result.unreportedFiles.slice(0, 20).map(summarizeManualLogFile).filter(Boolean) : undefined,
            noteCount: Array.isArray(result.notes) ? result.notes.length : 0,
            cleared: result.cleared || 0,
            remainingCount: pageUrl ? (perPage[pageUrl] || 0) : totalCount,
            totalCount,
          });
        }
        if (!asyncMode) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ...result, totalCount, perPage }));
        }
      })();
      return;
    }

    // POST /manual-edit-repair-decision  →  user resolves an exhausted repair loop.
    if (p === '/manual-edit-repair-decision' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let payload = {};
        try { payload = body ? JSON.parse(body) : {}; } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        const token = payload.token || url.searchParams.get('token');
        if (token !== state.token) { res.writeHead(401); res.end('Unauthorized'); return; }
        const pageUrl = payload.pageUrl || url.searchParams.get('pageUrl') || null;
        const action = String(payload.action || url.searchParams.get('action') || '').trim().toLowerCase();
        if (action !== 'rollback') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'unsupported_manual_edit_repair_decision', action }));
          return;
        }
        const rollback = rollbackManualApplyTransaction({
          cwd: process.cwd(),
          pageUrl,
          reason: 'manual_edit_user_requested_rollback',
        });
        const { totalCount, perPage } = countPendingByPage(process.cwd());
        const response = {
          action,
          pageUrl,
          rollback,
          remainingCount: pageUrl ? (perPage[pageUrl] || 0) : totalCount,
          totalCount,
          perPage,
        };
        recordManualEditActivity('manual_edit_repair_rollback_done', response);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      });
      return;
    }

    // POST /manual-edit-discard?pageUrl=<url>  →  drops entries (all if no pageUrl)
    if (p === '/manual-edit-discard' && req.method === 'POST') {
      const token = url.searchParams.get('token');
      if (token !== state.token) { res.writeHead(401); res.end('Unauthorized'); return; }
      const pageUrl = url.searchParams.get('pageUrl');
      let discarded;
      let discardedEntries = [];
      let canceledApplyEvents = [];
      let transactionRollback = null;
      try {
        const buffer = readManualEditsBuffer(process.cwd());
        transactionRollback = rollbackManualApplyTransaction({
          cwd: process.cwd(),
          pageUrl,
          reason: 'manual_edit_discarded',
        });
        if (pageUrl) {
          discardedEntries = buffer.entries.filter((entry) => entry.pageUrl === pageUrl);
          discarded = removeManualEditEntries(process.cwd(), (entry) => entry.pageUrl === pageUrl);
        } else {
          discardedEntries = buffer.entries;
          discarded = truncateManualEditsBuffer(process.cwd());
        }
        canceledApplyEvents = cancelPendingManualApplyEvents(pageUrl);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'discard_failed', message: err.message }));
        return;
      }
      const { totalCount, perPage } = countPendingByPage(process.cwd());
      recordManualEditActivity('manual_edit_discarded', {
        pageUrl,
        discarded,
        canceledApplyIds: canceledApplyEvents.map((event) => event.id),
        transactionRollback: transactionRollback ? {
          id: transactionRollback.id,
          rolledBackFiles: transactionRollback.rolledBackFiles?.map(summarizeManualLogFile).filter(Boolean) || [],
          rollbackFailures: summarizeManualDiagnostics(transactionRollback.rollbackFailures),
          skipped: transactionRollback.skipped,
        } : undefined,
        totalCount,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ discarded, entries: discardedEntries, canceledApplyEvents, totalCount, perPage }));
      return;
    }

    // Defense in depth: redirect any stragglers from the old /manual-edit endpoint.
    if (p === '/manual-edit' && req.method === 'POST') {
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '/manual-edit is removed; use /manual-edit-stash and /manual-edit-commit for staged copy edits.' }));
      return;
    }

    // --- Browser→server events (replaces WebSocket messages) ---
    if (p === '/events' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let msg;
        try { msg = JSON.parse(body); } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        if (msg.token !== state.token) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        // Defense in depth: manual copy edits must use the staged stash/apply
        // endpoints. The direct Save event path is disabled in the browser.
        if (msg.type === 'manual_edits') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'manual_edits must POST to /manual-edit-stash, not /events' }));
          return;
        }
        if (msg.type === 'manual_edit_apply') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'manual_edit_apply is disabled; use /manual-edit-stash then /manual-edit-commit' }));
          return;
        }
        const error = validateEvent(msg);
        if (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error }));
          return;
        }
        if (state.sessionStore && msg.id) {
          try {
            state.sessionStore.appendEvent(msg);
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'session_store_append_failed', message: err.message }));
            return;
          }
        }
        if (msg.type === 'exit') {
          cleanupSvelteComponentSessionsBeforeExit();
        }
        if (msg.type !== 'checkpoint') {
          enqueueEvent(msg);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // --- Stop ---
    if (p === '/stop') {
      const token = url.searchParams.get('token');
      if (token !== state.token) { res.writeHead(401); res.end('Unauthorized'); return; }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('stopping');
      shutdown();
      return;
    }

    // --- Agent poll ---
    if (p === '/poll' && req.method === 'GET') {
      handlePollGet(req, res, url);
      return;
    }
    if (p === '/poll' && req.method === 'POST') {
      handlePollPost(req, res);
      return;
    }

    res.writeHead(404); res.end('Not found');
  };
}

// ---------------------------------------------------------------------------
// Agent poll endpoints (unchanged from WS version)
// ---------------------------------------------------------------------------

function handlePollGet(req, res, url) {
  const token = url.searchParams.get('token');
  if (token !== state.token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  state.lastPollAt = Date.now();
  const timeout = parseInt(url.searchParams.get('timeout') || DEFAULT_POLL_TIMEOUT, 10);
  const leaseMs = parseInt(url.searchParams.get('leaseMs') || '30000', 10);
  const available = findAvailablePendingEvent();
  if (available) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(leaseEvent(available, leaseMs)));
    return;
  }
  const poll = { resolve, leaseMs };
  const timer = setTimeout(() => {
    const idx = state.pendingPolls.indexOf(poll);
    if (idx !== -1) state.pendingPolls.splice(idx, 1);
    broadcastAgentPollingIfChanged();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'timeout' }));
  }, timeout);
  function resolve(event) {
    clearTimeout(timer);
    state.lastPollAt = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(event));
  }
  state.pendingPolls.push(poll);
  broadcastAgentPollingIfChanged();
  scheduleLeaseFlush();
  req.on('close', () => {
    clearTimeout(timer);
    const idx = state.pendingPolls.indexOf(poll);
    if (idx !== -1) state.pendingPolls.splice(idx, 1);
    broadcastAgentPollingIfChanged();
  });
}

function sessionFileMetadataFromPollReply(file) {
  if (!file || typeof file !== 'string') return { file };
  const normalized = file.split(path.sep).join('/');
  const base = { file: normalized };
  if (!normalized.endsWith('/manifest.json') && normalized !== 'manifest.json') return base;
  if (!normalized.includes('node_modules/.impeccable-live/') && !normalized.includes('src/lib/impeccable/')) return base;

  let full;
  try {
    full = path.resolve(process.cwd(), normalized);
    const rel = path.relative(process.cwd(), full);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return base;
  } catch {
    return base;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(full, 'utf-8'));
    if (manifest?.previewMode !== 'svelte-component' || !manifest.sourceFile) return base;
    return {
      file: String(manifest.sourceFile).split(path.sep).join('/'),
      sourceFile: String(manifest.sourceFile).split(path.sep).join('/'),
      previewFile: normalized,
      previewMode: 'svelte-component',
    };
  } catch {
    return base;
  }
}

function handlePollPost(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let msg;
    try { msg = JSON.parse(body); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
    if (msg.token !== state.token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const pendingApplyDeferred = state.pendingApplyDeferreds.get(msg.id);
    if (pendingApplyDeferred) {
      const validation = validateManualApplyResultMessage(msg, pendingApplyDeferred);
      if (!validation.ok) {
        recordManualEditActivity('manual_edit_apply_reply_invalid', {
          id: msg.id,
          pageUrl: pendingApplyDeferred.pageUrl,
          chunk: pendingApplyDeferred.event?.chunk || null,
          repair: pendingApplyDeferred.event?.repair || null,
          reason: validation.body?.reason || validation.body?.error || 'invalid_manual_apply_result',
          status: msg.data?.status || null,
        });
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(validation.body));
        return;
      }
      recordManualEditActivity('manual_edit_apply_reply_received', {
        id: msg.id,
        pageUrl: pendingApplyDeferred.pageUrl,
        chunk: pendingApplyDeferred.event?.chunk || null,
        repair: pendingApplyDeferred.event?.repair || null,
        status: validation.result.status,
        appliedCount: validation.result.appliedEntryIds.length,
        failed: summarizeManualApplyFailures(validation.result.failed),
        fileCount: validation.result.files.length,
        noteCount: validation.result.notes.length,
      });
      resolveApplyDeferred(msg.id, validation.result);
      acknowledgePendingEvent(msg.id);
      flushPendingPolls();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (state.timedOutApplyIds.has(msg.id)) {
      const rollback = rollbackTimedOutApplyReply(msg);
      recordManualEditActivity('manual_edit_apply_stale_reply_rejected', {
        id: msg.id,
        rolledBackFileCount: rollback.rolledBackFiles?.length || 0,
        rollbackFailureCount: rollback.rollbackFailures?.length || 0,
      });
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'stale_manual_edit_apply_reply', ...rollback }));
      return;
    }
    const pendingEventBeforeAck = findPendingEventById(msg.id);
    if (pendingEventBeforeAck?.type === 'steer' && msg.type === 'steer_done'
        && !msg.file && !(typeof msg.message === 'string' && msg.message.trim())) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'steer_done_requires_file_or_message',
        hint: 'Reply with --file after writing source, or include a message explaining an intentional no-op.',
      }));
      return;
    }
    const acknowledgedEvent = acknowledgePendingEvent(msg.id);
    let skipJournalReply = false;
    let existingSession = null;
    if (!acknowledgedEvent && state.sessionStore && msg.id) {
      try {
        existingSession = state.sessionStore.getSnapshot(msg.id, { includeCompleted: true });
        if (!existingSession?.updatedAt) existingSession = null;
        skipJournalReply = existingSession?.phase === 'completed' || existingSession?.phase === 'discarded';
      } catch { /* fall through and record the reply normally */ }
    }
    if (!acknowledgedEvent && !existingSession) {
      recordManualEditActivity('manual_edit_poll_reply_unknown', {
        id: msg.id || null,
        type: msg.type || null,
      });
      res.writeHead(msg.id ? 404 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: msg.id ? 'unknown_poll_reply_id' : 'missing_poll_reply_id',
        id: msg.id,
      }));
      return;
    }
    const replyFileMeta = sessionFileMetadataFromPollReply(msg.file);
    if (state.sessionStore && msg.id && !skipJournalReply) {
      try {
        const eventType = msg.type === 'steer_done'
          ? 'steer_done'
          : msg.type === 'discard' || msg.type === 'discarded'
            ? 'discarded'
            : msg.type === 'complete'
              ? 'complete'
              : msg.type === 'error'
                ? 'agent_error'
                : 'agent_done';
        state.sessionStore.appendEvent({
          type: eventType,
          id: msg.id,
          file: replyFileMeta.file,
          sourceFile: replyFileMeta.sourceFile,
          previewFile: replyFileMeta.previewFile,
          previewMode: replyFileMeta.previewMode,
          message: msg.message,
          sourceEventType: acknowledgedEvent?.type,
          carbonize: msg.data?.carbonize === true,
        });
      } catch { /* keep reply path best-effort; browser still needs SSE */ }
    }
    flushPendingPolls();
    // Forward the reply to the browser via SSE
    broadcast({
      type: msg.type || 'done',
      id: msg.id,
      message: msg.message,
      file: msg.file,
      sourceFile: replyFileMeta.sourceFile,
      previewFile: replyFileMeta.previewFile,
      previewMode: replyFileMeta.previewMode,
      data: msg.data,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let httpServer = null;

function shutdown() {
  cleanupSvelteComponentSessionsBeforeExit();
  removeLiveServerInfo(process.cwd());
  if (state.leaseTimer) clearTimeout(state.leaseTimer);
  state.leaseTimer = null;
  if (state.sessionDir) {
    try { fs.rmSync(state.sessionDir, { recursive: true, force: true }); } catch {}
  }
  for (const res of state.sseClients) { try { res.end(); } catch {} }
  state.sseClients.clear();
  for (const poll of state.pendingPolls) poll.resolve({ type: 'exit' });
  state.pendingPolls.length = 0;
  if (httpServer) httpServer.close();
  process.exit(0);
}

function cleanupSvelteComponentSessionsBeforeExit() {
  try {
    removeAllSvelteComponentSessions(process.cwd());
  } catch (err) {
    console.warn('[impeccable] Svelte component session cleanup failed:', err.message);
  }
}

function applyLegacyDeferredAcceptsOnStartup() {
  try {
    const result = applyDeferredSvelteComponentAccepts(process.cwd());
    if (result.applied > 0 || result.failed > 0) {
      console.log('[impeccable] applied legacy deferred Svelte component accepts:', JSON.stringify(result));
    }
  } catch (err) {
    console.warn('[impeccable] legacy deferred Svelte component accept apply failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node live-server.mjs [options]

Start the live variant mode server (zero dependencies).

Commands:
  (default)     Start the server (foreground)
  stop          Stop the server and remove the injected live.js script tag
  stop --keep-inject   Stop the server only (leave the script tag in the HTML entry)

Options:
  --background  Start detached, print connection JSON to stdout, then exit
  --port=PORT   Use a specific port (default: auto-detect starting at 8400)
  --keep-inject Only with stop: skip live-inject.mjs --remove
  --help        Show this help

Endpoints:
  /live.js             Browser script (element picker + variant cycling)
  /detect.js           Detection overlay (backwards compatible)
  /modern-screenshot.js Vendored modern-screenshot UMD build (lazy-loaded by live.js)
  /annotation          POST raw image/png to stage a variant screenshot
  /events              SSE stream (server→browser) + POST (browser→server)
  /poll                Long-poll for agent CLI
  /manual-edit-stash   Stage browser copy edits
  /manual-edit-commit  Apply staged browser copy edits
  /manual-edit-discard Discard staged browser copy edits
  /source              Raw source file reader (no-HMR fallback)
  /status              Durable recovery status (token-protected)
  /health              Health check`);
  process.exit(0);
}

if (args.includes('stop')) {
  const keepInject = args.includes('--keep-inject');
  try {
    const { info } = readLiveServerInfo(process.cwd()) || {};
    const res = await fetch(`http://localhost:${info.port}/stop?token=${info.token}`);
    if (res.ok) console.log(`Stopped live server on port ${info.port}.`);
  } catch {
    console.log('No running live server found.');
  }
  if (!keepInject) {
    const injectPath = path.join(__dirname, 'live-inject.mjs');
    try {
      const out = execFileSync(process.execPath, [injectPath, '--remove'], {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      const line = out.trim().split('\n').filter(Boolean).pop();
      if (line) {
        try {
          const j = JSON.parse(line);
          if (j.removed === true) {
            console.log(`Removed live script tag from ${j.file}.`);
          }
        } catch {
          /* ignore non-JSON lines */
        }
      }
    } catch (err) {
      const detail = err.stderr?.toString?.().trim?.()
        || err.stdout?.toString?.().trim?.()
        || err.message
        || String(err);
      console.warn(`Note: could not remove live script tag (${detail.split('\n')[0]})`);
    }
  }
  process.exit(0);
}

// --background: spawn a detached child server, wait for it to be ready,
// print the connection JSON, then exit.  This keeps the startup command
// simple (no shell backgrounding or chained commands).
if (args.includes('--background')) {
  const childArgs = args.filter(a => a !== '--background');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...childArgs], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });
  child.unref();

  // Poll for the PID file (the child writes it once the HTTP server is listening).
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const { info } = readLiveServerInfo(process.cwd()) || {};
      if (info.pid !== process.pid) {
        // Output JSON so the agent can read port + token from stdout.
        console.log(JSON.stringify(info));
        process.exit(0);
      }
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  console.error('Timed out waiting for live server to start.');
  process.exit(1);
}

// Check for existing session
const existingRecord = readLiveServerInfo(process.cwd());
if (existingRecord?.info) {
  const existing = existingRecord.info;
  try {
    process.kill(existing.pid, 0);
    console.error(`Live server already running on port ${existing.port} (pid ${existing.pid}).`);
    console.error('Stop it first with: node ' + path.basename(fileURLToPath(import.meta.url)) + ' stop');
    process.exit(1);
  } catch {
    try { fs.unlinkSync(existingRecord.path); } catch {}
  }
}

state.token = randomUUID();
state.sessionStore = createLiveSessionStore({ cwd: process.cwd() });
rollbackManualApplyTransaction({
  cwd: process.cwd(),
  reason: 'manual_edit_server_start_recovered_abandoned_transaction',
});
applyLegacyDeferredAcceptsOnStartup();
restorePendingEventsFromStore();
pruneStaleManualApplyEvidence(process.cwd());
const portArg = args.find(a => a.startsWith('--port='));
state.port = portArg ? parseInt(portArg.split('=')[1], 10) : await findOpenPort();
// Annotation screenshots live in the project root so the agent's Read tool
// doesn't trip a per-file permission prompt. Sessioned by token so concurrent
// projects (or quick restarts) don't collide.
const annotRoot = getLiveAnnotationsDir(process.cwd());
fs.mkdirSync(annotRoot, { recursive: true });
state.sessionDir = fs.mkdtempSync(path.join(annotRoot, 'session-'));

const { detectScript, sessionPath, livePath } = loadBrowserScripts();
httpServer = http.createServer(createRequestHandler({ detectScript, sessionPath, livePath }));

httpServer.listen(state.port, '127.0.0.1', () => {
  writeLiveServerInfo(process.cwd(), { pid: process.pid, port: state.port, token: state.token });
  const url = `http://localhost:${state.port}`;
  console.log(`\nImpeccable live server running on ${url}`);
  console.log(`Token: ${state.token}\n`);
  console.log(`Script: ${url}/live.js`);
  console.log('Inject: managed by live-inject.mjs; Astro source tags use is:inline automatically.');
  console.log(`Stop:   node ${path.basename(fileURLToPath(import.meta.url))} stop`);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
