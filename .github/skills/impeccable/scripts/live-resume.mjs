#!/usr/bin/env node
/**
 * Recover the next agent action from the durable live-session journal.
 */

import { createLiveSessionStore } from './live-session-store.mjs';

function manualApplyReplyCommand(eventOrId = 'EVENT_ID') {
  const id = typeof eventOrId === 'string' ? eventOrId : eventOrId?.id || 'EVENT_ID';
  return `live-poll.mjs --reply ${id} done --data '<json>'`;
}

export function manualApplyResumeHint(event = {}) {
  const summary = event.manualApplySummary || summarizeManualApplyEvent(event);
  const parts = [];
  if (summary.pageUrl) parts.push(`page ${summary.pageUrl}`);
  if (summary.chunk) parts.push(`chunk ${summary.chunk.index}/${summary.chunk.total}`);
  if (Number.isFinite(summary.opCount)) parts.push(`${summary.opCount} op(s)`);
  if (Number.isFinite(summary.entryCount)) parts.push(`${summary.entryCount} entr${summary.entryCount === 1 ? 'y' : 'ies'}`);
  if (summary.files?.length) parts.push(`likely files: ${summary.files.join(', ')}`);
  const scope = parts.length ? ` (${parts.join(', ')})` : '';
  return `Manual Apply pending${scope}. If you have not already leased it, run live-poll.mjs. Apply the source edits from the manual_edit_apply batch, then reply with ${manualApplyReplyCommand(event.id)}. Polling only leases this work item; it does not commit source edits. Do not run live-commit-manual-edits.mjs for this leased event. Do not poll again before replying.`;
}

function summarizeManualApplyEvent(event = {}) {
  const entries = Array.isArray(event.batch?.entries) ? event.batch.entries : [];
  const opCount = entries.reduce((sum, entry) => sum + (Array.isArray(entry.ops) ? entry.ops.length : 0), 0);
  return {
    pageUrl: event.pageUrl || null,
    chunk: event.chunk || null,
    entryCount: entries.length,
    opCount,
    files: collectManualApplyFiles(event.batch),
  };
}

function collectManualApplyFiles(batch) {
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
  return [...new Set(files.filter((file) => typeof file === 'string' && file.length > 0))].sort();
}

function parseArgs(argv) {
  const out = { id: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--id') out.id = argv[++i];
    else if (arg.startsWith('--id=')) out.id = arg.slice('--id='.length);
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

export async function resumeCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node live-resume.mjs [--id SESSION_ID]\n\nPrint the active durable session checkpoint and the next safe agent action.`);
    return;
  }

  const store = createLiveSessionStore({ cwd: process.cwd(), sessionId: args.id || undefined });
  const snapshot = args.id ? store.getSnapshot(args.id) : store.listActiveSessions()[0] || null;
  if (!snapshot) {
    console.log(JSON.stringify({ active: false, nextAction: 'No active durable live session found.' }, null, 2));
    return;
  }

  const pending = snapshot.pendingEvent || null;
  const nextAction = pending
    ? pending.type === 'manual_edit_apply'
      ? manualApplyResumeHint(pending)
      : `Run live-poll.mjs, handle ${pending.type} ${pending.id}, then acknowledge with live-poll.mjs --reply ${pending.id} done.`
    : snapshot.phase === 'carbonize_required'
      ? `Finish carbonize cleanup${snapshot.sourceFile ? ` in ${snapshot.sourceFile}` : ''}, then run live-complete.mjs --id ${snapshot.id}.`
      : snapshot.phase === 'accept_requested'
        ? `Run live-complete.mjs --id ${snapshot.id} after verifying the accepted variant is written.`
        : `Inspect ${snapshot.id}; no pending agent event is currently queued.`;

  console.log(JSON.stringify({ active: true, snapshot, pendingEvent: pending, nextAction }, null, 2));
}

const _running = process.argv[1];
if (_running?.endsWith('live-resume.mjs') || _running?.endsWith('live-resume.mjs/')) {
  resumeCli();
}
