// services/pipeline-orchestrator.mjs
// State machine + main daemon entry. Pure orchestration logic is exported as
// tickOnce({db, projectRoot, capLimits, gitSha, claudeModel, spawn, notify})
// so it can be unit-tested without spawning real `claude -p`.
//
// The real daemon is in main() at the bottom; it wires real spawn() + notify()
// into tickOnce() and runs the poll loop with a 2-second cadence.

import { spawn as nodeSpawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdirSync, createWriteStream, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

import { initDb, integrityCheck, closeDb } from './db.mjs';
import {
  selectNextQueued, markQueueRunning, markQueueDone, markQueueFailed, markQueueCancelled,
  insertRun, updateRunStart, updateRunEnd, deleteCheckpoint,
  isCancelRequested, selectCheckpoint, selectQueueLen, countByStatus,
  findOrphanedRunning, repairOrphanedRunning,
} from './queue.mjs';
import { checkCap } from './cap.mjs';
import { analyzeRebootState, computeNextPhase, PHASE_ORDER } from './reboot-resume.mjs';
import { formatStart, formatSuccess, formatFailure, formatCapReached, formatPhaseEnd, formatCancelled } from './notifier.mjs';
// NOTE: telegram-client.mjs is NOT statically imported here — it doesn't exist until Task 3.1.
// All calls use lazy dynamic import() with try/catch fallback inside main() and tickOnce().

const POLL_MS = 2_000;
const CHECKPOINT_POLL_MS = 2_000;
const PER_URL_TIMEOUT_MS = 20 * 60 * 1000;   // 20 min per Q3 default
const SIGKILL_GRACE_MS = 10_000;

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return '(unknown)'; }
}

export async function tickOnce({ db, projectRoot, capLimits, gitSha, claudeModel, spawn, notify }) {
  const cap = checkCap(db, capLimits);
  const next = selectNextQueued(db);
  if (!next && !cap.capped) return { action: 'idle' };
  if (next && cap.capped) {
    notify(formatCapReached(cap));
    return { action: 'capped' };
  }

  // Race-safe mark-running (UNIQUE index protects us)
  try { markQueueRunning(db, next.id); }
  catch (e) { return { action: 'race_lost', error: e.message }; }

  const startedAt = new Date().toISOString();
  const runId = insertRun(db, { queueId: next.id, url: next.url, startedAt });
  updateRunStart(db, runId, { gitSha, claudeModel });

  notify(formatStart({ runId, hostname: hostnameOf(next.url) }));

  let result;
  try {
    result = await spawn({
      runId, queueId: next.id, url: next.url, urlHash: next.url_hash,
      projectRoot, claudeModel,
    });
  } catch (e) {
    result = { exitCode: -1, error: `spawn failed: ${e.message}`, failedPhase: 'spawn' };
  }

  const endedAt = new Date().toISOString();

  if (result.exitCode === 0) {
    updateRunEnd(db, runId, {
      endedAt, status: 'ok', score: result.score, slug: result.slug,
      jdPath: result.jdPath, resumePdf: result.resumePdf, coverLetterPdf: result.coverLetterPdf,
      tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: result.costUsd,
      phaseTimingsJson: result.phaseTimingsJson,
    });
    markQueueDone(db, next.id);
    deleteCheckpoint(db, runId);
    notify(formatSuccess({
      runId, company: result.company || hostnameOf(next.url), role: result.role || '(role unknown)',
      score: result.score ?? 0, totalMs: result.durationMs,
    }));
    // Lazy-import sendDocument only when we have a PDF to send. If telegram-client doesn't
    // exist yet (pre-Task 3.1), the catch swallows the import error gracefully.
    if (result.resumePdf && existsSync(result.resumePdf)) {
      try {
        const { sendDocument } = await import('./telegram-client.mjs');
        await sendDocument(result.resumePdf, { caption: `Resume #${runId}` });
      } catch (e) { notify(`⚠️ resume upload failed: ${e.message}`); }
    }
    if (result.coverLetterPdf && existsSync(result.coverLetterPdf)) {
      try {
        const { sendDocument } = await import('./telegram-client.mjs');
        await sendDocument(result.coverLetterPdf, { caption: `Cover Letter #${runId}` });
      } catch (e) { notify(`⚠️ cover-letter upload failed: ${e.message}`); }
    }
    return { action: 'completed_ok', runId };
  }

  // failure or cancelled
  const cancelled = isCancelRequested(db, next.id);
  if (cancelled) {
    updateRunEnd(db, runId, { endedAt, status: 'cancelled', error: 'user-cancelled' });
    markQueueCancelled(db, next.id);
    deleteCheckpoint(db, runId);
    notify(formatCancelled({ runId }));
    return { action: 'completed_cancelled', runId };
  }

  updateRunEnd(db, runId, {
    endedAt, status: 'fail',
    error: result.error || `exit ${result.exitCode}`,
    phaseTimingsJson: result.phaseTimingsJson,
  });
  markQueueFailed(db, next.id);
  deleteCheckpoint(db, runId);
  notify(formatFailure({
    runId, hostname: hostnameOf(next.url),
    phase: result.failedPhase || 'unknown', error: result.error || '',
  }));
  return { action: 'completed_fail', runId };
}

// --- real spawn(): one `claude -p` per URL, with checkpoint-polling for phase pings ---
//
// This is the production glue. The signature matches what tickOnce passes in.
export async function realSpawn({ runId, queueId, url, urlHash, projectRoot, dbPath, claudeModel }, { onPhaseEnd, db }) {
  const preamblePath = resolve(projectRoot, 'ops/preambles/fresh-run.md');
  const preamble = readFileSync(preamblePath, 'utf-8')
    .replaceAll('$URL', url)
    .replaceAll('$RUN_ID', String(runId))
    .replaceAll('$URL_HASH', urlHash)
    .replaceAll('$PROJECT_ROOT', projectRoot);

  const runDir = join(projectRoot, 'ops/runs', String(runId));
  mkdirSync(runDir, { recursive: true });
  const claudeLogPath = join(runDir, 'claude.log');
  const eventsPath = join(runDir, 'events.jsonl');
  const logStream = createWriteStream(claudeLogPath);

  const child = nodeSpawn('claude', [
    '-p', preamble,
    '--print',
    '--dangerously-skip-permissions',
    '--add-dir', projectRoot,
    '--model', claudeModel,
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      RUN_ID: String(runId),
      URL: url,
      URL_HASH: urlHash,
      PROJECT_ROOT: projectRoot,
      WORK_QUEUE_DB: dbPath,
      CHECKPOINT_DIR: join(projectRoot, 'ops/checkpoints'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  // checkpoint poll: every 2s, read checkpoints.last_phase; if changed, fire onPhaseEnd
  let lastSeenPhase = null;
  const phaseStarts = new Map();
  const phasePoll = setInterval(() => {
    const cp = selectCheckpoint(db, runId);
    if (cp && cp.last_phase !== lastSeenPhase) {
      const now = Date.now();
      const startedAt = phaseStarts.get(cp.last_phase) || now;
      onPhaseEnd({ phase: cp.last_phase, elapsedMs: now - startedAt });
      phaseStarts.set(cp.last_phase, now);
      lastSeenPhase = cp.last_phase;
    }
  }, CHECKPOINT_POLL_MS);

  // cancel poll: every 2s, check cancel_requested → SIGTERM → 10s grace → SIGKILL
  const cancelPoll = setInterval(() => {
    if (isCancelRequested(db, queueId)) {
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, SIGKILL_GRACE_MS);
    }
  }, CHECKPOINT_POLL_MS);

  // wall-clock timeout: 20 min
  const timeout = setTimeout(() => {
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, SIGKILL_GRACE_MS);
  }, PER_URL_TIMEOUT_MS);

  const exit = await new Promise((res) => {
    child.on('exit', (code, signal) => res({ code, signal }));
  });

  clearInterval(phasePoll);
  clearInterval(cancelPoll);
  clearTimeout(timeout);
  logStream.end();

  // grep audit log for the per-URL JSONL line
  const auditPath = resolve(projectRoot, 'data/yash-resume-runs.log');
  let parsed = null;
  if (existsSync(auditPath)) {
    const lines = readFileSync(auditPath, 'utf-8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.url === url) { parsed = obj; break; }
      } catch {}
    }
  }

  return {
    exitCode: exit.code === null ? 124 : exit.code,
    durationMs: parsed?.total_ms ?? null,
    slug: parsed?.slug ?? null,
    score: parsed?.score ?? null,
    jdPath: parsed?.jd ?? null,
    resumePdf: parsed?.pdf ?? null,
    coverLetterPdf: parsed?.cover_letter_pdf ?? null,
    failedPhase: lastSeenPhase ? computeNextPhase(lastSeenPhase) : 'jd_fetch_end',
    error: exit.code === 0 ? null : `claude -p exit ${exit.code} signal ${exit.signal || 'none'}`,
    phaseTimingsJson: parsed ? JSON.stringify(parsed) : null,
  };
}

// --- main entry ---
async function main() {
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const dbPath = process.env.WORK_QUEUE_DB || join(projectRoot, 'ops/work-queue.db');
  mkdirSync(join(projectRoot, 'ops/checkpoints'), { recursive: true });
  mkdirSync(join(projectRoot, 'ops/runs'), { recursive: true });

  const db = initDb(dbPath);

  const integrity = integrityCheck(db);
  if (integrity !== 'ok') {
    process.stderr.write(`PRAGMA integrity_check = ${integrity} → bailing\n`);
    process.exit(2);
  }

  // Startup recovery
  const recovery = analyzeRebootState(db);
  if (recovery.state === 'repair') {
    repairOrphanedRunning(db, recovery.queueId);
  } else if (recovery.state === 'restart_from_scratch') {
    markQueueFailed(db, recovery.queueId);
    updateRunEnd(db, recovery.runId, { status: 'cancelled', error: 'reboot-no-checkpoint' });
  } else if (recovery.state === 'resume') {
    // For v1: log it; full resume-from-checkpoint preamble path is in OPERATIONS.md Phase-2 backlog
    process.stderr.write(`reboot: would resume run ${recovery.runId} from ${recovery.lastPhase} → ${recovery.nextPhase}; using restart-from-scratch for v1\n`);
    markQueueFailed(db, recovery.queueId);
    updateRunEnd(db, recovery.runId, { status: 'cancelled', error: 'reboot-resume-not-implemented-v1' });
  } else if (recovery.state === 'corrupt') {
    process.stderr.write(`reboot: corrupt — > 1 running rows; bailing\n`);
    process.exit(3);
  }

  const claudeModel = process.env.CLAUDE_MODEL || 'claude-opus-4-7';
  const gitSha = execSync('git rev-parse HEAD', { cwd: projectRoot }).toString().trim();
  const notifyChatId = parseInt(process.env.TELEGRAM_NOTIFY_CHAT_ID || '0', 10);

  // Lazy-import sendMessage so that this module loads cleanly before telegram-client exists.
  const notify = async (msg) => {
    if (!notifyChatId) { console.log(`[notify-noop] ${msg}`); return; }
    try {
      const { sendMessage } = await import('./telegram-client.mjs');
      await sendMessage(msg, { chatId: notifyChatId });
    } catch (e) { console.error(`notify error: ${e.message}`); }
  };

  // Poll loop
  while (true) {
    try {
      await tickOnce({
        db, projectRoot,
        capLimits: { dailyMax: 20, weeklyMax: 100 },
        gitSha, claudeModel,
        // dbPath is in closure scope; pass it explicitly so realSpawn gets it without
        // mutating the db object (node:sqlite DatabaseSync has no .location property).
        spawn: (ctx) => realSpawn({ ...ctx, dbPath }, { db, onPhaseEnd: ({ phase, elapsedMs }) => notify(formatPhaseEnd({ runId: ctx.runId, phase, elapsedMs })) }),
        notify,
      });
    } catch (e) {
      console.error(`orchestrator tick error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(`fatal: ${e.message}`); process.exit(4); });
}
