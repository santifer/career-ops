#!/usr/bin/env node
/**
 * CLI helper: discard pending manual edits from the buffer without applying.
 *
 * Reads .impeccable/live/pending-manual-edits.json, drops entries, writes back.
 * No source-file writes. Use this when the user wants to throw away unsaved
 * manual edits.
 *
 * Trigger: only when the user explicitly asks the AI to discard / throw away /
 * clear pending manual edits.
 *
 * Usage:
 *   node live-discard-manual-edits.mjs              # discard all pending
 *   node live-discard-manual-edits.mjs --page-url=/ # discard only entries for "/"
 *
 * Output JSON: { discarded: N, entries: [...discardedEntries], totalCount: N }
 */

import { readBuffer, removeEntries, truncateBuffer } from './live-manual-edits-buffer.mjs';

function argVal(args, name) {
  const prefix = name + '=';
  for (const a of args) {
    if (a === name) return true;
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return null;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node live-discard-manual-edits.mjs [--page-url=<url>]');
  process.exit(0);
}

const pageUrlFilter = argVal(args, '--page-url');
const cwd = process.cwd();

let discarded;
let entries;
const buffer = readBuffer(cwd);
if (pageUrlFilter) {
  entries = buffer.entries.filter((entry) => entry.pageUrl === pageUrlFilter);
  discarded = removeEntries(cwd, (entry) => entry.pageUrl === pageUrlFilter);
} else {
  entries = buffer.entries;
  discarded = truncateBuffer(cwd);
}

const remaining = readBuffer(cwd).entries.reduce((n, e) => n + e.ops.length, 0);
console.log(JSON.stringify({ discarded, entries, totalCount: remaining }));
