// lib/job-runs-status.mjs — Joins lib/job-runs-ledger.mjs (run history) with
// scripts/launchd/*.plist (expected schedules) to produce the dashboard's
// chip-strip status (P1-5).
//
// State definitions (per data/input-quality-roadmap.md P1-5):
//   green     — ran within the expected window, status=ok, urls_found > 0 (or N/A)
//   purple    — ran successfully but urls_found == 0 (signal-quality concern)
//   yellow    — next-expected fire passed by <2× grace
//   red       — next-expected fire passed by >2× grace (job missed entirely)
//   skipped   — most recent run is a cadence-guard skip; or launchd never fired
//   unknown   — no run history yet (job hasn't run since wiring landed)
//
// The "skipped via Healthchecks" cross-reference (roadmap P0-1 dependency)
// is wired through `loadHealthchecksPings()`; if that file doesn't exist
// yet, the cross-check is skipped silently and we only use ledger signals.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recentRuns, lastRun } from './job-runs-ledger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const PLIST_DIR = join(ROOT, 'scripts', 'launchd');
const HEALTHCHECKS_PINGS = join(ROOT, 'data', 'healthchecks-pings.jsonl');

// Plists that don't represent "scheduled jobs" (long-lived daemons, debug
// sessions, or pure delivery wrappers). Excluded from the chip strip.
const DAEMON_LABELS = new Set([
  'dashboard-server',
  'cloudflared',
  'cloudflared-staging',
  'cloudflared-staging-nohup-wrapper',
  'telegram-bot',
  'chrome-debugging',
  'dashboard-phase3',
]);

// Jobs whose signal IS URL discovery (purple = urls_found==0 is meaningful).
// For jobs where url-count isn't applicable, urls_found==0 doesn't trigger purple.
const URL_DISCOVERY_JOBS = new Set([
  'scan',
  'community-scan',
  'signal-monitor',
  'company-pulse',
  'liveness-sweep',
]);

/**
 * Parse a launchd plist for its schedule. Returns:
 *   { kind: 'interval', seconds }
 *   { kind: 'calendar', entries: [{ weekday?, hour?, minute?, day?, month? }, ...] }
 *   { kind: 'unscheduled' } — RunAtLoad-only or KeepAlive daemons
 */
function parsePlistSchedule(plistPath) {
  const xml = readFileSync(plistPath, 'utf-8');

  // StartInterval — seconds between fires
  const intervalMatch = xml.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/);
  if (intervalMatch) {
    return { kind: 'interval', seconds: Number(intervalMatch[1]) };
  }

  // StartCalendarInterval — array of dicts OR single dict
  const calMatch = xml.match(/<key>StartCalendarInterval<\/key>\s*((?:<array>[\s\S]*?<\/array>)|(?:<dict>[\s\S]*?<\/dict>))/);
  if (calMatch) {
    const inner = calMatch[1];
    // Iterate every <dict>...</dict> in the matched chunk.
    const entries = [];
    const dictRe = /<dict>([\s\S]*?)<\/dict>/g;
    let m;
    while ((m = dictRe.exec(inner)) !== null) {
      const body = m[1];
      const fields = {};
      const fieldRe = /<key>(Hour|Minute|Weekday|Day|Month)<\/key>\s*<integer>(\d+)<\/integer>/g;
      let f;
      while ((f = fieldRe.exec(body)) !== null) {
        fields[f[1].toLowerCase()] = Number(f[2]);
      }
      entries.push(fields);
    }
    if (entries.length) return { kind: 'calendar', entries };
  }

  return { kind: 'unscheduled' };
}

/**
 * Compute the next expected fire time (in local time) AFTER `from` for a
 * calendar-style schedule. Returns a Date.
 *
 * Heuristic for grace-window math (NOT a full cron solver):
 *   - For pure {hour, minute} dicts: fire daily at that wall-clock time.
 *   - For {weekday, hour, minute}: fire weekly. weekday matches JS getDay()
 *     (0=Sun, 1=Mon, ...).
 *   - For {day, month, hour, minute}: yearly. (Rare in this repo.)
 *   - Multiple entries → return the earliest next fire across all of them.
 */
function nextFireAfter(schedule, from = new Date()) {
  if (schedule.kind === 'interval') {
    // Best-effort: assume previous fire was "now - interval" if we have no
    // last-fire history; the caller will use lastRun() instead.
    return new Date(from.getTime() + schedule.seconds * 1000);
  }
  if (schedule.kind === 'calendar') {
    let best = null;
    for (const entry of schedule.entries) {
      const candidate = new Date(from);
      candidate.setSeconds(0, 0);
      if (typeof entry.minute === 'number') candidate.setMinutes(entry.minute);
      else candidate.setMinutes(0);
      if (typeof entry.hour === 'number') candidate.setHours(entry.hour);
      else candidate.setHours(0);

      if (typeof entry.weekday === 'number') {
        // launchd Weekday: 0=Sun, 1=Mon, ..., 7=Sun (we'll mod 7)
        const targetDow = entry.weekday % 7;
        let dayDelta = (targetDow - candidate.getDay() + 7) % 7;
        if (dayDelta === 0 && candidate <= from) dayDelta = 7;
        candidate.setDate(candidate.getDate() + dayDelta);
      } else if (typeof entry.day === 'number') {
        candidate.setDate(entry.day);
        if (typeof entry.month === 'number') candidate.setMonth(entry.month - 1);
        if (candidate <= from) {
          if (typeof entry.month === 'number') candidate.setFullYear(candidate.getFullYear() + 1);
          else candidate.setMonth(candidate.getMonth() + 1);
        }
      } else {
        // Daily — bump to tomorrow if already past today's target time
        if (candidate <= from) candidate.setDate(candidate.getDate() + 1);
      }

      if (!best || candidate < best) best = candidate;
    }
    return best;
  }
  return null;
}

/**
 * Compute the previous expected fire time at or BEFORE `from`.
 * Same heuristic as nextFireAfter but walks backwards.
 */
function previousFireBefore(schedule, from = new Date()) {
  if (schedule.kind === 'interval') {
    // Assume the last fire was at the most recent multiple of `seconds`
    // before `from` (rough — actual fire times depend on launchd's clock).
    const t = from.getTime();
    const sec = schedule.seconds * 1000;
    return new Date(Math.floor(t / sec) * sec);
  }
  if (schedule.kind === 'calendar') {
    let best = null;
    for (const entry of schedule.entries) {
      const candidate = new Date(from);
      candidate.setSeconds(0, 0);
      if (typeof entry.minute === 'number') candidate.setMinutes(entry.minute);
      else candidate.setMinutes(0);
      if (typeof entry.hour === 'number') candidate.setHours(entry.hour);
      else candidate.setHours(0);

      if (typeof entry.weekday === 'number') {
        const targetDow = entry.weekday % 7;
        let dayDelta = (candidate.getDay() - targetDow + 7) % 7;
        if (dayDelta === 0 && candidate > from) dayDelta = 7;
        candidate.setDate(candidate.getDate() - dayDelta);
      } else if (typeof entry.day === 'number') {
        candidate.setDate(entry.day);
        if (typeof entry.month === 'number') candidate.setMonth(entry.month - 1);
        if (candidate > from) {
          if (typeof entry.month === 'number') candidate.setFullYear(candidate.getFullYear() - 1);
          else candidate.setMonth(candidate.getMonth() - 1);
        }
      } else {
        // Daily — pull back to yesterday if target time hasn't happened today
        if (candidate > from) candidate.setDate(candidate.getDate() - 1);
      }

      if (!best || candidate > best) best = candidate;
    }
    return best;
  }
  return null;
}

/**
 * Grace window per cadence — how late "yellow" tolerates before flipping
 * to "red". Defaults: 1× cadence period for daily/weekly, 2× period for
 * sub-hourly so a single skipped fire doesn't panic.
 */
function graceMillisFor(schedule) {
  if (schedule.kind === 'interval') {
    const sec = schedule.seconds;
    if (sec <= 600) return sec * 2 * 1000;           // sub-10min → 2× grace
    if (sec <= 3600) return sec * 1.5 * 1000;        // sub-hourly → 1.5×
    return sec * 1.25 * 1000;                        // 6h+ → 1.25×
  }
  if (schedule.kind === 'calendar') {
    const hasWeekday = schedule.entries.some(e => typeof e.weekday === 'number');
    if (hasWeekday) return 24 * 60 * 60 * 1000;      // weekly → 1 day grace
    return 60 * 60 * 1000;                           // daily → 1 hour grace
  }
  return 60 * 60 * 1000;
}

/**
 * Load Healthchecks ping log if present (writer = roadmap P0-1).
 * Returns map { jobName → most-recent-ping-iso }, or {} if file absent.
 */
function loadHealthchecksPings() {
  if (!existsSync(HEALTHCHECKS_PINGS)) return {};
  try {
    const out = {};
    const lines = readFileSync(HEALTHCHECKS_PINGS, 'utf-8').trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.job_name && obj.ts) {
          const prev = out[obj.job_name];
          if (!prev || obj.ts > prev) out[obj.job_name] = obj.ts;
        }
      } catch { /* skip malformed lines */ }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Discover all plist labels in scripts/launchd/. Returns
 *   [{ label, plistPath, schedule }, ...]
 * with daemon labels filtered out and label stripped of the
 * "com.mitchell.career-ops." prefix.
 */
function discoverScheduledJobs() {
  if (!existsSync(PLIST_DIR)) return [];
  const out = [];
  for (const file of readdirSync(PLIST_DIR)) {
    if (!file.endsWith('.plist')) continue;
    if (!file.startsWith('com.mitchell.career-ops.')) continue;
    const label = basename(file, '.plist').replace(/^com\.mitchell\.career-ops\./, '');
    if (DAEMON_LABELS.has(label)) continue;
    const plistPath = join(PLIST_DIR, file);
    try {
      const schedule = parsePlistSchedule(plistPath);
      if (schedule.kind === 'unscheduled') continue;
      out.push({ label, plistPath, schedule });
    } catch { /* skip unparseable plists */ }
  }
  return out;
}

/**
 * Main entry point for the dashboard endpoint. Returns a status payload:
 *   {
 *     generated_at: iso,
 *     jobs: [
 *       {
 *         job_name, label,
 *         state: 'green'|'yellow'|'red'|'purple'|'skipped'|'unknown',
 *         last_run: { started_at, finished_at, status, urls_found, error } | null,
 *         next_expected_at: iso | null,
 *         previous_expected_at: iso | null,
 *         minutes_late: number | null,
 *         cadence_summary: string,
 *         healthchecks_last_ping: iso | null,
 *       }, ...
 *     ],
 *     summary: { green, yellow, red, purple, skipped, unknown }
 *   }
 */
export function computeJobRunsStatus({ now = new Date() } = {}) {
  const jobs = discoverScheduledJobs();
  const hcPings = loadHealthchecksPings();
  const counters = { green: 0, yellow: 0, red: 0, purple: 0, skipped: 0, unknown: 0 };

  const rows = jobs.map(({ label, schedule }) => {
    const last = lastRun(label);
    const prevExpected = previousFireBefore(schedule, now);
    const nextExpected = nextFireAfter(schedule, now);
    const grace = graceMillisFor(schedule);
    const hcPing = hcPings[label] || null;

    let state = 'unknown';
    let minutesLate = null;

    if (!last) {
      // No ledger history. Only classify with positive evidence:
      //   - Healthchecks ping present → launchd fired but job didn't ledger
      //     (could mean wiring missing OR the job crashed before init)
      //   - No ping AND P0-1 Healthchecks is wired (file exists) → 'skipped'
      //     (genuinely no fire detected)
      //   - No ping AND no Healthchecks → 'unknown' (can't tell)
      const hcWired = Object.keys(hcPings).length > 0;
      if (prevExpected) {
        const lateMs = now.getTime() - prevExpected.getTime();
        if (lateMs > grace * 2) {
          if (hcPing) {
            state = 'red';
            minutesLate = Math.round(lateMs / 60_000);
          } else if (hcWired) {
            state = 'skipped';
            minutesLate = Math.round(lateMs / 60_000);
          } else {
            state = 'unknown';
          }
        } else if (lateMs > grace) {
          state = hcPing || hcWired ? 'yellow' : 'unknown';
          if (state === 'yellow') minutesLate = Math.round(lateMs / 60_000);
        }
      }
    } else {
      const lastStartMs = new Date(last.started_at).getTime();

      // Most recent run is a cadence-guard skip
      if (last.status === 'skipped') {
        state = 'skipped';
      } else if (last.status === 'fail') {
        // Failed runs are noisier than late runs — treat as red unless the
        // job has already run successfully MORE recently than the failure.
        const ok = recentRuns(label, 5).find(r => r.status === 'ok' && new Date(r.started_at) > new Date(last.started_at));
        state = ok ? 'green' : 'red';
      } else if (last.status === 'ok') {
        // Did it run inside the expected window?
        const lateMs = prevExpected ? (now.getTime() - lastStartMs) : 0;
        // For daily schedules: "expected window" = within graceMillis of the most recent expected fire.
        // For interval schedules: same logic, just with the interval as the period.
        const periodMs = schedule.kind === 'interval'
          ? schedule.seconds * 1000
          : (schedule.entries.some(e => typeof e.weekday === 'number') ? 7 * 86400_000 : 86400_000);

        if (lateMs <= periodMs + grace) {
          // Inside window. Check urls_found signal-quality.
          if (URL_DISCOVERY_JOBS.has(label) && last.urls_found === 0) {
            state = 'purple';
          } else {
            state = 'green';
          }
        } else if (lateMs <= periodMs + grace * 2) {
          state = 'yellow';
          minutesLate = Math.round((lateMs - periodMs) / 60_000);
        } else {
          state = 'red';
          minutesLate = Math.round((lateMs - periodMs) / 60_000);
        }
      } else if (last.status === 'running') {
        // Long-running. If started more than 2× period ago, mark red (likely hung).
        const periodMs = schedule.kind === 'interval'
          ? schedule.seconds * 1000
          : (schedule.entries.some(e => typeof e.weekday === 'number') ? 7 * 86400_000 : 86400_000);
        const ageMs = now.getTime() - lastStartMs;
        if (ageMs > periodMs * 2) {
          state = 'red';
          minutesLate = Math.round(ageMs / 60_000);
        } else {
          state = 'green'; // in flight
        }
      }
    }

    counters[state] = (counters[state] || 0) + 1;

    return {
      job_name: label,
      label,
      state,
      last_run: last ? {
        id: last.id,
        started_at: last.started_at,
        finished_at: last.finished_at,
        status: last.status,
        urls_found: last.urls_found,
        error: last.error,
      } : null,
      next_expected_at: nextExpected ? nextExpected.toISOString() : null,
      previous_expected_at: prevExpected ? prevExpected.toISOString() : null,
      minutes_late: minutesLate,
      cadence_summary: summarizeSchedule(schedule),
      healthchecks_last_ping: hcPing,
    };
  });

  // Stable sort: red/yellow/purple first (so attention-grabbing chips lead),
  // then green, then skipped, then unknown.
  const order = { red: 0, yellow: 1, purple: 2, skipped: 3, green: 4, unknown: 5 };
  rows.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || a.label.localeCompare(b.label));

  return {
    generated_at: new Date().toISOString(),
    jobs: rows,
    summary: counters,
  };
}

/**
 * Human-readable cadence summary, e.g., "daily 02:00", "every 30m", "Sun 02:00".
 */
function summarizeSchedule(schedule) {
  if (schedule.kind === 'interval') {
    const s = schedule.seconds;
    if (s < 60) return `every ${s}s`;
    if (s < 3600) return `every ${Math.round(s / 60)}m`;
    if (s < 86400) return `every ${Math.round(s / 3600)}h`;
    return `every ${Math.round(s / 86400)}d`;
  }
  if (schedule.kind === 'calendar') {
    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const parts = schedule.entries.map(e => {
      const hh = String(e.hour ?? 0).padStart(2, '0');
      const mm = String(e.minute ?? 0).padStart(2, '0');
      if (typeof e.weekday === 'number') return `${dows[e.weekday % 7]} ${hh}:${mm}`;
      if (typeof e.day === 'number') return `${e.month ?? '?'}/${e.day} ${hh}:${mm}`;
      return `daily ${hh}:${mm}`;
    });
    return parts.join(' • ');
  }
  return 'unscheduled';
}

/**
 * Most-recent N runs for a job — used by the click-through modal.
 * @param {string} jobName
 * @param {number} limit
 */
export function jobRunHistory(jobName, limit = 10) {
  return recentRuns(jobName, limit);
}
