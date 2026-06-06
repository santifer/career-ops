/**
 * Shared helpers for the pending-manual-edits buffer on disk.
 *
 * Location: .impeccable/live/pending-manual-edits.json (project-local).
 * Schema:   { version: 1, entries: [{ id, pageUrl, element, ops, stagedAt }] }
 *
 * Each entry corresponds to one Save action from the browser. Ops merge by
 * (pageUrl, ref): if the user re-edits the same element before committing, the
 * existing entry's `newText` is replaced and `originalText` is kept (it holds
 * the real source state).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getLiveDir } from './impeccable-paths.mjs';

const BUFFER_VERSION = 1;
const BUFFER_FILENAME = 'pending-manual-edits.json';

export function getBufferPath(cwd = process.cwd()) {
  return path.join(getLiveDir(cwd), BUFFER_FILENAME);
}

export function readBuffer(cwd = process.cwd()) {
  return readBufferInternal(cwd, { strict: false });
}

export function readBufferStrict(cwd = process.cwd()) {
  return readBufferInternal(cwd, { strict: true });
}

function readBufferInternal(cwd, { strict }) {
  const filePath = getBufferPath(cwd);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
      if (strict) throw new Error('manual_edit_buffer_invalid_schema');
      return { version: BUFFER_VERSION, entries: [] };
    }
    return { version: BUFFER_VERSION, entries: parsed.entries };
  } catch (err) {
    if (strict && err?.code !== 'ENOENT') {
      throw new Error('manual_edit_buffer_unreadable: ' + (err.message || String(err)));
    }
    return { version: BUFFER_VERSION, entries: [] };
  }
}

export function writeBuffer(cwd, buffer) {
  const filePath = getBufferPath(cwd);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ version: BUFFER_VERSION, entries: buffer.entries }, null, 2));
}

/**
 * Merge a new entry into the buffer. For each op in the new entry, if there's
 * already a buffered op for the same (pageUrl, ref), update that op's newText
 * and keep its original originalText (the true source state). Otherwise add
 * the op (creating an entry if needed).
 *
 * Multiple ops in one Save are allowed; each is keyed by (pageUrl, ref).
 */
export function stageEntry(cwd, newEntry) {
  const buf = readBufferStrict(cwd);
  const pageUrl = newEntry.pageUrl;
  for (const newOp of newEntry.ops) {
    let mergedIntoExisting = false;
    for (const existing of buf.entries) {
      if (existing.pageUrl !== pageUrl) continue;
      const existingOpIdx = existing.ops.findIndex((op) => op.ref === newOp.ref);
      if (existingOpIdx >= 0) {
        // Keep the original source text but refresh the latest DOM/source evidence.
        existing.ops[existingOpIdx] = {
          ...newOp,
          originalText: existing.ops[existingOpIdx].originalText,
          newText: newOp.newText,
          deleted: newOp.deleted || false,
        };
        if (newEntry.element) existing.element = newEntry.element;
        existing.stagedAt = new Date().toISOString();
        mergedIntoExisting = true;
        break;
      }
    }
    if (mergedIntoExisting) continue;
    // No existing op for this (pageUrl, ref). Find or create an entry to hold it.
    let entry = buf.entries.find((e) => e.pageUrl === pageUrl && e.id === newEntry.id);
    if (!entry) {
      entry = {
        id: newEntry.id,
        pageUrl,
        element: newEntry.element,
        ops: [],
        stagedAt: new Date().toISOString(),
      };
      buf.entries.push(entry);
    }
    entry.ops.push(newOp);
    entry.stagedAt = new Date().toISOString();
  }
  writeBuffer(cwd, buf);
  return buf;
}

/**
 * Remove entries matching a predicate. Returns count of removed *ops* (not
 * entries) so callers report a unit consistent with truncateBuffer and the
 * pill's per-page op count. Empty entries (no ops left) are also pruned.
 */
export function removeEntries(cwd, predicate) {
  const buf = readBuffer(cwd);
  let removedOps = 0;
  const kept = [];
  for (const entry of buf.entries) {
    if (predicate(entry)) {
      removedOps += entry.ops?.length || 0;
    } else if (entry.ops && entry.ops.length > 0) {
      kept.push(entry);
    }
  }
  buf.entries = kept;
  writeBuffer(cwd, buf);
  return removedOps;
}

/**
 * Count by page for the counter UI. Returns { totalCount, perPage: {[pageUrl]: count} }.
 */
export function countByPage(cwd = process.cwd()) {
  const buf = readBuffer(cwd);
  const perPage = {};
  let totalCount = 0;
  for (const entry of buf.entries) {
    const n = entry.ops.length;
    perPage[entry.pageUrl] = (perPage[entry.pageUrl] || 0) + n;
    totalCount += n;
  }
  return { totalCount, perPage };
}

/**
 * Truncate the buffer to empty (used by discard-all). Returns the count of
 * removed ops.
 */
export function truncateBuffer(cwd) {
  const buf = readBuffer(cwd);
  let removed = 0;
  for (const entry of buf.entries) removed += entry.ops.length;
  writeBuffer(cwd, { version: BUFFER_VERSION, entries: [] });
  return removed;
}
