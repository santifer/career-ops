/**
 * CLI client for the live variant mode poll/reply protocol.
 *
 * Usage:
 *   npx impeccable poll                         # Block until browser event, print JSON
 *   npx impeccable poll --stream                # Experimental: keep polling; one JSON line per event
 *   npx impeccable poll --timeout=600000        # Custom timeout (ms); default is long-poll friendly
 *   npx impeccable poll --reply <id> done       # Reply "done" to event <id>
 *   npx impeccable poll --reply <id> error "msg" # Reply with error
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completionAckForAcceptResult, completionTypeForAcceptResult } from './live-completion.mjs';
import { readLiveServerInfo } from './impeccable-paths.mjs';

// Node's built-in fetch (undici under the hood) enforces a 300s headers
// timeout that can't be lowered per-request. We cap each request below
// that ceiling and loop in `pollOnce` to synthesize a long poll without
// depending on the standalone undici package.
export const PER_REQUEST_TIMEOUT_MS = 270_000;
export const DEFAULT_EVENT_LEASE_MS = 600_000;

const EVENT_TYPES_NEEDING_AGENT_REPLY = new Set(['generate', 'steer', 'manual_edit_apply']);

function readServerInfo() {
  const record = readLiveServerInfo(process.cwd());
  if (!record) {
    console.error('No running live server found. Start one with: npx impeccable live');
    process.exit(1);
  }
  return record.info;
}

export function buildPollReplyPayload(token, { id, type, message, file, data }) {
  return { token, id, type, message, file, data };
}

export function manualApplyPollBanner(event = {}) {
  const id = event.id || 'EVENT_ID';
  return [
    `Manual Apply action required: edit source, then reply with \`live-poll.mjs --reply ${id} done --data '<json>'\`.`,
    'The JSON data must include status, appliedEntryIds, failed, files, and notes; summary counters are only a recovery fallback.',
    'Do not run live-commit-manual-edits.mjs for this leased event.',
    'Do not poll again before replying.',
  ].join('\n') + '\n';
}

/**
 * Parse `--reply <id> <status> [--file path] [--data '<json>'] [message]` argv
 * into a reply object. Returns null when `--reply` is absent. Throws (code
 * INVALID_REPLY_ARGS) when the reply shape is missing its event id/status and
 * INVALID_DATA_JSON when `--data` is present but not valid JSON.
 */
export function parseReplyArgs(args) {
  const replyIdx = args.indexOf('--reply');
  if (replyIdx === -1) return null;
  const id = args[replyIdx + 1];
  const status = args[replyIdx + 2];
  validateReplyArgs({ id, status });
  const fileIdx = args.indexOf('--file');
  const file = fileIdx !== -1 && fileIdx + 1 < args.length ? args[fileIdx + 1] : undefined;
  const dataIdx = args.indexOf('--data');
  let data;
  if (dataIdx !== -1 && dataIdx + 1 < args.length) {
    try {
      data = JSON.parse(args[dataIdx + 1]);
    } catch (err) {
      const wrapped = new Error('--data must be valid JSON: ' + err.message);
      wrapped.code = 'INVALID_DATA_JSON';
      throw wrapped;
    }
  }
  const message = args.find((a, i) =>
    i > replyIdx + 2
    && !a.startsWith('--')
    && i !== fileIdx + 1
    && i !== dataIdx + 1
  ) || undefined;
  return { id, type: status, message, file, data };
}

function validateReplyArgs({ id, status }) {
  const usage = "Usage: npx impeccable poll --reply <id> <status> [--file path] [--data '<json>'] [message]";
  if (!id || id.startsWith('--')) {
    const err = new Error(`${usage}\nMissing event id after --reply.`);
    err.code = 'INVALID_REPLY_ARGS';
    throw err;
  }
  if (['done', 'error', 'complete', 'discard', 'discarded'].includes(id)) {
    const err = new Error(`${usage}\nThe value after --reply must be the event id, not the status ${JSON.stringify(id)}. Use --reply EVENT_ID ${id}.`);
    err.code = 'INVALID_REPLY_ARGS';
    throw err;
  }
  if (!status || status.startsWith('--')) {
    const err = new Error(`${usage}\nMissing reply status after event id ${JSON.stringify(id)}.`);
    err.code = 'INVALID_REPLY_ARGS';
    throw err;
  }
}

export function requiresAgentReply(event) {
  return EVENT_TYPES_NEEDING_AGENT_REPLY.has(event?.type);
}

export async function postReply(base, token, reply) {
  const res = await fetch(`${base}/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPollReplyPayload(token, reply)),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const parts = [body.error || res.statusText, body.reason, body.hint].filter(Boolean);
    throw new Error(parts.join(': '));
  }
}

export async function fetchServerStatus(base, token) {
  const res = await fetch(`${base}/status?token=${token}`);
  if (res.status === 401) {
    const err = new Error('Authentication failed. The server token may have changed.');
    err.code = 'AUTH_FAILED';
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Status failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function isEventPending(status, eventId) {
  return (status.pendingEvents || []).some((entry) => entry.id === eventId);
}

export async function waitForEventAck(base, token, eventId, {
  pollIntervalMs = 400,
  maxWaitMs = 600_000,
} = {}) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const status = await fetchServerStatus(base, token);
    if (!isEventPending(status, eventId)) return true;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

export async function fetchNextEvent(base, token, { totalDeadline } = {}) {
  while (true) {
    if (totalDeadline && Date.now() >= totalDeadline) {
      return { type: 'timeout' };
    }

    const remaining = totalDeadline
      ? totalDeadline - Date.now()
      : PER_REQUEST_TIMEOUT_MS;
    const slice = Math.min(Math.max(remaining, 1000), PER_REQUEST_TIMEOUT_MS);
    const res = await fetch(`${base}/poll?token=${token}&timeout=${slice}&leaseMs=${DEFAULT_EVENT_LEASE_MS}`);

    if (res.status === 401) {
      const err = new Error('Authentication failed. The server token may have changed.');
      err.code = 'AUTH_FAILED';
      throw err;
    }

    if (!res.ok) {
      throw new Error(`Poll failed: ${res.status} ${res.statusText}`);
    }

    const next = await res.json();
    if (next?.type === 'timeout') {
      if (totalDeadline && Date.now() < totalDeadline) continue;
      if (!totalDeadline) continue;
      return next;
    }
    return next;
  }
}

export async function augmentEventWithAcceptHandling(event, base, token) {
  if (event.type !== 'accept' && event.type !== 'discard') return event;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const acceptScript = path.join(__dirname, 'live-accept.mjs');
  const scriptArgs = buildAcceptScriptArgs(event);

  try {
    const out = execFileSync(
      'node',
      [acceptScript, ...scriptArgs],
      { encoding: 'utf-8', cwd: process.cwd(), timeout: 30_000 },
    );
    event._acceptResult = JSON.parse(out.trim());
  } catch (err) {
    event._acceptResult = { handled: false, mode: 'error', error: err.message };
  }

  const completionType = completionTypeForAcceptResult(event.type, event._acceptResult);
  try {
    await postReply(base, token, {
      id: event.id,
      type: completionType,
      message: event._acceptResult?.error,
      file: event._acceptResult?.file,
      data: event._acceptResult?.carbonize === true ? { carbonize: true } : undefined,
    });
  } catch (err) {
    event._completionAck = { ok: false, error: err.message };
  }
  if (!event._completionAck) {
    event._completionAck = completionAckForAcceptResult(event.id, completionType, event._acceptResult);
  }

  return event;
}

export function buildAcceptScriptArgs(event) {
  const scriptArgs = event.type === 'discard'
    ? ['--id', String(event.id), '--discard']
    : ['--id', String(event.id), '--variant', String(event.variantId)];
  if (event.pageUrl) scriptArgs.push('--page-url', String(event.pageUrl));
  if (event.type === 'accept' && event.paramValues && Object.keys(event.paramValues).length > 0) {
    scriptArgs.push('--param-values', JSON.stringify(event.paramValues));
  }
  return scriptArgs;
}

export function writeCarbonizeBanner(event) {
  if (event.type === 'manual_edit_apply') {
    process.stderr.write('\n' + manualApplyPollBanner(event) + '\n');
  }
  if (event._acceptResult?.carbonize === true) {
    process.stderr.write('\n⚠ Carbonize cleanup REQUIRED before next poll. After cleanup, run live-complete.mjs --id ' + event.id + '. See reference/live.md "Required after accept".\n\n');
  }
}

export function printPollEvent(event) {
  console.log(JSON.stringify(event));
}

export async function runPollOnce(base, token, { totalTimeout = 600_000 } = {}) {
  const deadline = Date.now() + totalTimeout;
  const event = await fetchNextEvent(base, token, { totalDeadline: deadline });
  await augmentEventWithAcceptHandling(event, base, token);
  writeCarbonizeBanner(event);
  printPollEvent(event);
  return event;
}

export async function runPollStream(base, token, {
  ackTimeoutMs = 600_000,
  ackPollIntervalMs = 400,
  shouldContinue = () => true,
} = {}) {
  process.stderr.write('[impeccable-poll] stream mode: one JSON object per line on stdout; use --reply while this process stays running\n');

  while (shouldContinue()) {
    const event = await fetchNextEvent(base, token);
    await augmentEventWithAcceptHandling(event, base, token);
    writeCarbonizeBanner(event);
    printPollEvent(event);

    if (event.type === 'exit') return event;

    if (requiresAgentReply(event)) {
      const acked = await waitForEventAck(base, token, event.id, {
        pollIntervalMs: ackPollIntervalMs,
        maxWaitMs: ackTimeoutMs,
      });
      if (!acked) {
        const err = new Error(`Timed out waiting for --reply on event ${event.id}`);
        err.code = 'ACK_TIMEOUT';
        throw err;
      }
    }
  }

  return null;
}

function handlePollError(err) {
  if (err.code === 'AUTH_FAILED') {
    console.error(err.message);
    console.error('Try restarting: npx impeccable live stop && npx impeccable live');
    process.exit(1);
  }
  if (err.cause?.code === 'ECONNREFUSED') {
    console.error('Live server not running. Start one with: npx impeccable live');
    process.exit(1);
  }
  if (err.code === 'ACK_TIMEOUT') {
    console.error(err.message);
    process.exit(1);
  }
  console.error('Poll failed:', err.message);
  process.exit(1);
}

export async function pollCli() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: impeccable poll [options]

Wait for a browser event from the live variant server, or reply to one.

Modes:
  poll                             Block until a browser event arrives, print JSON, exit
  poll --stream                    Keep polling; print one JSON line per event (see live.md)
  poll --reply <id> done           Reply "done" to event <id> (replace or insert generate)
  poll --reply <id> steer_done     Reply after handling a steer event (unlocks Steer bar)
  poll --reply <id> error "msg"    Reply with an error message
  poll --reply <id> done --data '<json>'
                                   Reply with a structured JSON result (manual_edit_apply)

Options:
  --timeout=MS        One-shot poll timeout in ms (default: 600000). Ignored in --stream mode
  --ack-timeout=MS    Stream mode: max wait for --reply after generate/steer (default: 600000)
  --file PATH         Attach a source file path to the reply (generate/steer flow)
  --data JSON         Attach a JSON result object to the reply (manual_edit_apply flow). Must be valid JSON
  --help              Show this help message

Harness note:
  Default one-shot mode is the portable contract for Claude Code, Codex, and Cursor.
  --stream is experimental for harnesses with fast incremental stdout; do not use on Cursor.`);
    process.exit(0);
  }

  const info = readServerInfo();
  const base = `http://localhost:${info.port}`;

  // Reply mode: npx impeccable poll --reply <id> <status> [--file path] [--data '<json>'] [message]
  if (args.includes('--reply')) {
    let reply;
    try {
      reply = parseReplyArgs(args);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }

    try {
      await postReply(base, info.token, reply);
    } catch (err) {
      if (err.cause?.code === 'ECONNREFUSED') {
        console.error('Live server not running. Start one with: npx impeccable live');
      } else {
        console.error('Reply failed:', err.message);
      }
      process.exit(1);
    }
    return;
  }

  const streamMode = args.includes('--stream');
  const ackTimeoutArg = args.find((a) => a.startsWith('--ack-timeout='));
  const ackTimeoutMs = ackTimeoutArg ? parseInt(ackTimeoutArg.split('=')[1], 10) : 600_000;

  try {
    if (streamMode) {
      await runPollStream(base, info.token, { ackTimeoutMs });
      return;
    }

    const timeoutArg = args.find((a) => a.startsWith('--timeout='));
    const totalTimeout = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) : 600_000;
    await runPollOnce(base, info.token, { totalTimeout });
  } catch (err) {
    handlePollError(err);
  }
}

// Auto-execute when run directly
const _running = process.argv[1];
if (_running?.endsWith('live-poll.mjs') || _running?.endsWith('live-poll.mjs/')) {
  pollCli();
}
