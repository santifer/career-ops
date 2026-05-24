// services/notifier.mjs
// Formats Telegram outbound messages. The HTTP send paths are thin wrappers around
// services/telegram-client.mjs and require live env vars (TELEGRAM_BOT_TOKEN,
// TELEGRAM_NOTIFY_CHAT_ID) — tested separately in Task 3.x.

const MAX_ERROR_CHARS = 200;
const MAX_MSG_CHARS = 480;  // keeps room under Telegram's 4096; leaves headroom for formatting

function fmtDuration(ms) {
  if (!Number.isFinite(ms)) return '?';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function clip(s, max) {
  if (typeof s !== 'string') return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function formatStart({ runId, hostname }) {
  return `🚀 Starting run #${runId} for ${hostname}`;
}

export function formatPhaseEnd({ runId, phase, elapsedMs }) {
  return `⏱️ #${runId} ${phase} done · ${fmtDuration(elapsedMs)}`;
}

export function formatSuccess({ runId, company, role, score, totalMs }) {
  return clip(`✅ #${runId} ${company} — ${role}\nScore ${score}/100 · total ${fmtDuration(totalMs)}`, MAX_MSG_CHARS);
}

export function formatFailure({ runId, hostname, phase, error }) {
  return clip(`❌ #${runId} ${hostname} failed at ${phase}:\n${clip(error || '', MAX_ERROR_CHARS)}`, MAX_MSG_CHARS);
}

export function formatCapReached({ reason, count, limit }) {
  return `⏸️ Cap reached (${reason}: ${count}/${limit}). New URLs will wait.`;
}

export function formatCancelled({ runId, queueId }) {
  return `🛑 Cancelled #${runId ?? queueId}`;
}

export function formatStatus({ idle, runningRunId, runningCompany, runningRole, runningPhase, runningElapsedMs, queueLen, todayCount, todayLimit, weekCount, weekLimit, lastRunSummary, uptimeListenerSec, uptimeOrchSec }) {
  if (idle) {
    return [
      `📭 Idle.`,
      `Queue:  ${queueLen} waiting · 0 running`,
      `Today:  ${todayCount}/${todayLimit} runs · Week: ${weekCount}/${weekLimit}`,
      lastRunSummary ? `Last:   ${lastRunSummary}` : null,
      `Uptime: orchestrator ${fmtDuration(uptimeOrchSec * 1000)} · listener ${fmtDuration(uptimeListenerSec * 1000)}`,
    ].filter(Boolean).join('\n');
  }
  return [
    `🏃 Run #${runningRunId} — ${runningCompany} / ${runningRole}`,
    `Phase:    ${runningPhase}`,
    `Elapsed:  ${fmtDuration(runningElapsedMs)}`,
    `Queue:    ${queueLen} waiting after this`,
    `Today:    ${todayCount}/${todayLimit} · Week: ${weekCount}/${weekLimit}`,
  ].join('\n');
}

export function formatHelp() {
  return [
    '*yash-pipeline bot — commands*',
    '`/add <url>` — queue a job URL',
    '`/queue` — show next up to 10 queued',
    '`/status` — what the orchestrator is doing now',
    '`/cancel <queue_id>` — request cancellation',
    '`/help` — this message',
  ].join('\n');
}
