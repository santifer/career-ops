#!/usr/bin/env node
/**
 * scripts/weekly-progress-tracker.mjs — Phase 9 weekly skill / 1:1 / project tracker.
 *
 * Per calibration brief 2026-05-16, system capability #8: "Weekly skill / project
 * tracker (Mitchell explicitly requested)." This script extracts Mitchell's
 * professional progress for an ISO week from local + agentic sources and writes
 * a structured `data/weekly-progress/{YYYY-WNN}.md` (+ `.json`) summarizing
 * skills practiced, 1:1s held, projects shipped, public artifacts, plus
 * candidates for cv.md proof points and interview-prep/story-bank.md stories.
 *
 * Hybrid extraction model (Phase 4 pattern):
 *   1. Local sources Node can read directly (git log, linkedin activity dirs,
 *      career-history dir, week-tagged notes) are pulled inline.
 *   2. Sources that require MCP (Gmail, Calendar, Drive) get emitted to an
 *      orchestration task template at `data/weekly-progress-tasks/{week}.md`.
 *      A parent Claude session reads that template, executes the MCP calls,
 *      writes the raw output back to `data/weekly-progress-tasks/{week}.raw.md`,
 *      then re-runs this script which picks up the raw file and proceeds to
 *      Gemini synthesis.
 *   3. All collected raw signal goes to gemini-2.5-pro for structured extraction
 *      into the canonical markdown shape (see RENDER_TEMPLATE below).
 *
 * Hard rules (per parent task brief):
 *   - Never modifies cv.md or interview-prep/story-bank.md — extractor surfaces
 *     candidate bullets; Mitchell decides what lands.
 *   - Never commits or pushes — parent session commits.
 *   - Honors PER_RUN_CAP_WEEKLY_TRACKER_USD (default $3) and MONTHLY_BUDGET_USD.
 *   - --dry-run never spends money.
 *
 * CLI:
 *   node scripts/weekly-progress-tracker.mjs                      # current ISO week
 *   node scripts/weekly-progress-tracker.mjs --week 2026-W19
 *   node scripts/weekly-progress-tracker.mjs --since 2026-05-09 --until 2026-05-15
 *   node scripts/weekly-progress-tracker.mjs --sources gmail,calendar,drive,git
 *   node scripts/weekly-progress-tracker.mjs --dry-run
 *   node scripts/weekly-progress-tracker.mjs --max-cost 3
 *
 * Wired by AGENTS.md skill modes / Mitchell on demand. Default cadence is
 * "manual every Monday morning" until proven safe — no launchd entry yet.
 */

import {
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync,
} from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Bootstrap .env (override:true so user env doesn't clobber dotenv) ──────
try {
  const { config } = await import('dotenv');
  config({ override: true });
} catch { /* dotenv optional */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ──────────────────────────────────────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────────────────────────────────────

const PATHS = {
  outputDir:        join(ROOT, 'data/weekly-progress'),
  tasksDir:         join(ROOT, 'data/weekly-progress-tasks'),
  costLog:          join(ROOT, 'data/cost-log.tsv'),
  cv:               join(ROOT, 'cv.md'),
  storyBank:        join(ROOT, 'interview-prep/story-bank.md'),
  linkedinActivity: join(ROOT, 'data/linkedin/activity'),
  xActivity:        join(ROOT, 'data/linkedin/x-activity'),
  careerHistoryInbox:     join(ROOT, 'data/career-history/inbox'),
  careerHistoryProcessed: join(ROOT, 'data/career-history/processed'),
  notesGlobs: [
    'data/notes',
    'data/journal',
    'data/work-updates.md',
    'data/skill-tracker.md',
  ].map(p => join(ROOT, p)),
};

// ──────────────────────────────────────────────────────────────────────────────
// CLI parsing
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
function flag(name) { return args.includes(name); }

if (flag('--help') || flag('-h')) {
  process.stdout.write(`
weekly-progress-tracker — Phase 9 weekly skill / 1:1 / project extractor.

  node scripts/weekly-progress-tracker.mjs
  node scripts/weekly-progress-tracker.mjs --week 2026-W19
  node scripts/weekly-progress-tracker.mjs --since 2026-05-09 --until 2026-05-15
  node scripts/weekly-progress-tracker.mjs --sources gmail,calendar,drive,git
  node scripts/weekly-progress-tracker.mjs --dry-run
  node scripts/weekly-progress-tracker.mjs --max-cost 3

Outputs:
  data/weekly-progress/{YYYY-WNN}.md         human-readable structured summary
  data/weekly-progress/{YYYY-WNN}.json       machine-readable mirror
  data/weekly-progress-tasks/{YYYY-WNN}.md   MCP orchestration template
                                             (read this with a Claude session,
                                              run the MCP calls listed inside,
                                              save raw output back as .raw.md,
                                              then re-run this script)

Env:
  GEMINI_API_KEY                 required for non-dry-run extraction
  PER_RUN_CAP_WEEKLY_TRACKER_USD per-run cap (default 3.00)
  MONTHLY_BUDGET_USD             rolling 30-day cap (default 500.00)
  WEEKLY_PROGRESS_MODEL          override gemini model (default gemini-2.5-pro)
`);
  process.exit(0);
}

const CLI = {
  week:      arg('--week'),
  since:     arg('--since'),
  until:     arg('--until'),
  sources:   (arg('--sources', 'gmail,calendar,drive,git,local') || '').split(',').map(s => s.trim()).filter(Boolean),
  dryRun:    flag('--dry-run'),
  maxCost:   parseFloat(arg('--max-cost', String(process.env.PER_RUN_CAP_WEEKLY_TRACKER_USD || '3'))),
  noTasks:   flag('--no-tasks'),
  force:     flag('--force'),
};

const MONTHLY_BUDGET = parseFloat(process.env.MONTHLY_BUDGET_USD || '500');
// 2026-05-17 — upgraded to gemini-3.1-pro-preview per Mitchell's preference
// for Pro tier. Falls back via WEEKLY_PROGRESS_MODEL env var if needed.
const GEMINI_MODEL   = process.env.WEEKLY_PROGRESS_MODEL || 'gemini-3.1-pro-preview';

// ──────────────────────────────────────────────────────────────────────────────
// ISO-week math
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get the Monday of the ISO week containing `date` (UTC normalised).
 * Returns a Date at 00:00:00 UTC on Monday.
 */
function isoWeekMonday(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weekday: Mon=1 ... Sun=7. JS getUTCDay: Sun=0 ... Sat=6.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dayNum - 1));
  return d;
}

/**
 * Compute ISO year-week pair for a Date (UTC). Returns { year, week }.
 */
function isoYearWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Parse an ISO week label like "2026-W19" into { year, week }.
 */
function parseIsoWeekLabel(label) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(label);
  if (!m) throw new Error(`Bad --week format: "${label}" (expected YYYY-WNN, e.g. 2026-W19)`);
  return { year: parseInt(m[1], 10), week: parseInt(m[2], 10) };
}

/**
 * Compute Monday and Sunday for a given ISO year+week (per ISO 8601:
 * Week 1 is the week containing the first Thursday of the year).
 */
function isoWeekBounds(year, week) {
  // ISO week 1 contains Jan 4. Find Monday of that week, then add (week-1)*7 days.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monW1 = isoWeekMonday(jan4);
  const mon = new Date(monW1);
  mon.setUTCDate(monW1.getUTCDate() + (week - 1) * 7);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return { mon, sun };
}

// ──────────────────────────────────────────────────────────────────────────────
// Resolve target window from CLI flags
// ──────────────────────────────────────────────────────────────────────────────

function resolveWindow() {
  if (CLI.since && CLI.until) {
    const sinceDate = new Date(`${CLI.since}T00:00:00Z`);
    const untilDate = new Date(`${CLI.until}T23:59:59Z`);
    if (isNaN(+sinceDate) || isNaN(+untilDate)) {
      throw new Error(`Bad --since/--until: "${CLI.since}".."${CLI.until}" — expected YYYY-MM-DD`);
    }
    const { year, week } = isoYearWeek(sinceDate);
    return {
      label: `${year}-W${pad2(week)}`,
      mon: sinceDate, sun: untilDate, custom: true,
    };
  }
  if (CLI.week) {
    const { year, week } = parseIsoWeekLabel(CLI.week);
    const { mon, sun } = isoWeekBounds(year, week);
    return { label: `${year}-W${pad2(week)}`, mon, sun, custom: false };
  }
  // Default: ISO week containing today.
  const today = new Date();
  const mon = isoWeekMonday(today);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const { year, week } = isoYearWeek(today);
  return { label: `${year}-W${pad2(week)}`, mon, sun, custom: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// Local-source collectors (no MCP, no LLM)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * git log for the window, all branches, includes file-change stats so the
 * extractor can spot meaningful work (lines changed, files touched) vs. typo
 * commits.
 */
function collectGitLog(mon, sun) {
  const sinceArg = isoDate(mon);
  const untilArg = isoDate(new Date(sun.getTime() + 86399999)); // inclusive end-of-day
  try {
    const out = execSync(
      `git log --all --since="${sinceArg}" --until="${untilArg}" --no-merges ` +
      `--format="COMMIT|%h|%ai|%an|%s" --shortstat`,
      { cwd: ROOT, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 }
    );
    return { ok: true, raw: out.trim(), commitCount: (out.match(/^COMMIT\|/gm) || []).length };
  } catch (e) {
    return { ok: false, reason: `git log failed: ${e.message}` };
  }
}

/**
 * Read every file under `dir` modified within [mon, sun] (mtime-based) and
 * return their concatenated content with a path header. Skips files >200KB.
 */
function collectDirActivity(dir, mon, sun, label) {
  if (!existsSync(dir)) return { ok: false, reason: `${label} dir absent: ${dir}` };
  let files;
  try { files = readdirSync(dir); }
  catch (e) { return { ok: false, reason: `readdir ${label} failed: ${e.message}` }; }

  const startMs = mon.getTime();
  const endMs   = sun.getTime() + 86399999;
  const picked = [];
  for (const f of files) {
    if (f.startsWith('.')) continue;
    const full = join(dir, f);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (!stat.isFile()) continue;
    if (stat.size > 200 * 1024) continue;
    if (stat.mtimeMs < startMs || stat.mtimeMs > endMs) continue;
    try {
      const txt = readFileSync(full, 'utf-8');
      picked.push(`---\n## ${label}: ${f} (mtime ${new Date(stat.mtimeMs).toISOString()})\n\n${txt}`);
    } catch { /* skip unreadable */ }
  }
  if (picked.length === 0) return { ok: true, raw: '', fileCount: 0, note: `no ${label} files in window` };
  return { ok: true, raw: picked.join('\n\n'), fileCount: picked.length };
}

/**
 * Look in `data/notes/`, `data/journal/`, and standalone files like
 * `data/work-updates.md` for week-tagged content. We pick up:
 *   - Standalone files whose mtime is in window
 *   - Inside markdown files: H2/H3 sections matching the window's date range
 *     (string-search for YYYY-MM-DD inside the file)
 */
function collectLocalNotes(mon, sun) {
  const startMs = mon.getTime();
  const endMs   = sun.getTime() + 86399999;
  const dateStrings = [];
  for (let d = new Date(mon); d <= sun; d.setUTCDate(d.getUTCDate() + 1)) {
    dateStrings.push(isoDate(d));
  }

  const chunks = [];
  for (const path of PATHS.notesGlobs) {
    if (!existsSync(path)) continue;
    let stat;
    try { stat = statSync(path); } catch { continue; }
    if (stat.isFile()) {
      if (stat.size > 500 * 1024) continue;
      let raw;
      try { raw = readFileSync(path, 'utf-8'); } catch { continue; }
      // If mtime in window, include whole file. Otherwise grep for week dates.
      if (stat.mtimeMs >= startMs && stat.mtimeMs <= endMs) {
        chunks.push(`---\n## notes: ${path.replace(ROOT + '/', '')} (whole file — mtime in window)\n\n${raw}`);
      } else {
        const matches = dateStrings.filter(ds => raw.includes(ds));
        if (matches.length > 0) {
          // Pull ±20 lines around each match for context.
          const lines = raw.split('\n');
          const sections = new Set();
          for (let i = 0; i < lines.length; i++) {
            if (matches.some(ds => lines[i].includes(ds))) {
              const start = Math.max(0, i - 5);
              const end = Math.min(lines.length, i + 20);
              sections.add(lines.slice(start, end).join('\n'));
            }
          }
          chunks.push(
            `---\n## notes: ${path.replace(ROOT + '/', '')} (date-matched excerpts)\n\n` +
            [...sections].join('\n\n…\n\n')
          );
        }
      }
    } else if (stat.isDirectory()) {
      const dirResult = collectDirActivity(path, mon, sun, `notes/${path.split('/').pop()}`);
      if (dirResult.ok && dirResult.raw) chunks.push(dirResult.raw);
    }
  }
  return { ok: true, raw: chunks.join('\n\n'), fileCount: chunks.length };
}

// ──────────────────────────────────────────────────────────────────────────────
// MCP task template (hybrid pattern — Phase 4)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Emit an orchestration template describing the exact MCP calls a Claude
 * parent session should make to enrich the local-only baseline.
 *
 * Convention: parent session pastes the raw responses from each MCP call into
 * `data/weekly-progress-tasks/{week}.raw.md` under matching ## headers,
 * then re-runs this script.
 */
function renderMcpTaskTemplate(window, sources) {
  const sinceIso = isoDate(window.mon);
  const untilIso = isoDate(window.sun);

  const wantGmail    = sources.includes('gmail');
  const wantCalendar = sources.includes('calendar');
  const wantDrive    = sources.includes('drive');

  const lines = [];
  lines.push(`# MCP Enrichment Tasks — ${window.label}`);
  lines.push('');
  lines.push(`**Window:** ${sinceIso} to ${untilIso} (inclusive)`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Consumer:** scripts/weekly-progress-tracker.mjs (Phase 9)`);
  lines.push('');
  lines.push('A parent Claude session should execute the MCP calls in each section');
  lines.push('below, then paste raw responses into a sibling file named');
  lines.push(`\`${window.label}.raw.md\` in this directory, using the same ## headers.`);
  lines.push('After the raw file exists, re-run `node scripts/weekly-progress-tracker.mjs`');
  lines.push('— it will pick up the raw output and synthesise the full report.');
  lines.push('');
  lines.push('---');
  lines.push('');

  if (wantGmail) {
    lines.push('## gmail');
    lines.push('');
    lines.push('Use the connected Gmail MCP (server prefix typically `mcp__gmail__*` or the workspace UUID variant `mcp__111895ab-…__*`).');
    lines.push('');
    lines.push('1. `search_threads` with query:');
    lines.push('   ```');
    lines.push(`   after:${sinceIso.replace(/-/g, '/')} before:${untilIso.replace(/-/g, '/')} (from:me OR to:me OR meeting OR 1:1 OR 1on1 OR sync OR review OR feedback)`);
    lines.push('   ```');
    lines.push('   Cap at 50 threads. Skip newsletters / marketing.');
    lines.push('');
    lines.push('2. For any thread with `1:1`, `feedback`, `review`, or `mentor` keywords:');
    lines.push('   call `get_thread` and paste the full body verbatim.');
    lines.push('');
    lines.push('3. For threads that look like project / shipping confirmations (e.g. PR-merged,');
    lines.push('   launch-announce, demo-recap, status-update), include subject + first 500 chars.');
    lines.push('');
    lines.push('Paste under `## gmail` in the .raw.md file. Use a `### thread: <subject>` sub-header per thread.');
    lines.push('');
  }

  if (wantCalendar) {
    lines.push('## calendar');
    lines.push('');
    lines.push('Use the connected Calendar MCP (`mcp__calendar__*` or `mcp__8cb73d08-…__*`).');
    lines.push('');
    lines.push(`1. \`list_events\` between ${sinceIso}T00:00 and ${untilIso}T23:59 (Mitchell's PT timezone).`);
    lines.push('   Cap at 200 events.');
    lines.push('');
    lines.push('2. Filter OUT: heads-down focus blocks Mitchell self-scheduled, recurring sync templates with no attendees, OOO blocks.');
    lines.push('');
    lines.push('3. For each remaining event, capture: title, attendees (names + roles where visible), duration, location/conference link, any description / agenda body.');
    lines.push('');
    lines.push('4. Bucket per day. Note which were 1:1s (exactly two attendees including Mitchell) vs group meetings.');
    lines.push('');
    lines.push('Paste under `## calendar` in the .raw.md file.');
    lines.push('');
  }

  if (wantDrive) {
    lines.push('## drive');
    lines.push('');
    lines.push('Use the connected Drive MCP (`mcp__drive__*` or `mcp__88e88cb7-…__*`).');
    lines.push('');
    lines.push('1. `list_recent_files` filtered to `modifiedTime >= "' + sinceIso + 'T00:00:00Z" and modifiedTime <= "' + untilIso + 'T23:59:59Z"`. Cap at 50.');
    lines.push('');
    lines.push('2. For each doc, capture: name, mime type, modifiedTime, who modified, web link.');
    lines.push('');
    lines.push('3. For any doc with a name containing `1:1`, `weekly`, `status`, `proposal`, `spec`, `design`, `launch`, `review`, `retro`: call `read_file_content` and paste the body (cap at 5000 chars per doc).');
    lines.push('');
    lines.push('Paste under `## drive` in the .raw.md file.');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Notes for the parent session');
  lines.push('');
  lines.push('- This file is overwritten on every dry-run / real run — safe to regenerate.');
  lines.push('- The `.raw.md` sibling is consumed but **never modified** by this script.');
  lines.push('- If a source MCP isn\'t connected, skip its section in `.raw.md` and add a one-line reason; the script will record it under "Sources skipped".');
  lines.push('- Do NOT include API keys, OAuth tokens, or message-IDs in the raw paste — only human-readable content.');
  lines.push('');

  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// Gemini synthesis
// ──────────────────────────────────────────────────────────────────────────────

const SYNTHESIS_PROMPT_TEMPLATE = `You are a structured-extraction agent for Mitchell Williams' career-ops system.

Your job: read the raw weekly signal below (git commits, calendar events, email threads, drive docs, local notes, LinkedIn activity, X activity) and produce a clean weekly progress report in EXACTLY the markdown structure shown.

ABSOLUTE RULES
- Output ONLY the markdown report — no preamble, no closing remarks, no "I will now…" lines.
- Every bullet MUST cite a concrete piece of evidence from the raw signal (commit hash, calendar event title, doc name, thread subject, file path).
- Speculative or unverifiable claims are forbidden. If the raw signal is silent on a category, write "(no evidence in window)" under that heading rather than inventing one.
- Proof-point candidates and story candidates must point to specific events from THIS week's signal — do not rewrite existing cv.md bullets.
- Patterns + ratios must be computed from the raw signal (commit count, meeting count, distinct collaborators) — no made-up numbers.

OUTPUT STRUCTURE (use these headings verbatim)

# Weekly Progress — Week of {MON_DATE} to {SUN_DATE}

**Generated:** {TS}
**Sources used:** {SOURCES_USED}
**Sources skipped:** {SOURCES_SKIPPED}
**Extraction model:** {MODEL}
**Cost:** {COST_PLACEHOLDER}

## Skills practiced / learned
- {one-line bullet with concrete evidence}

## 1:1s held
- {colleague, role if known, topic, action items captured}

## Projects shipped / advanced
- {project, status delta this week, evidence}

## Public artifacts
- {LinkedIn post / X post / GitHub commit / blog post / podcast appearance with link or commit hash}

## Proof points eligible for cv.md
- {specific candidate bullet, optionally with a "(could land in: cv.md section X)" hint}

## Stories eligible for story-bank.md
- {STAR-shaped — Situation / Task / Action / Result / Reflection — drawn from the week's events}

## Patterns + ratios
- {meeting-load / deep-work-hours / outbound-touches / commit-cadence — pulled from calendar + git logs}

---
RAW SIGNAL (DO NOT QUOTE BACK IN FULL — synthesize only):

{RAW}
`;

/**
 * Call Gemini 2.5 Pro to synthesise the structured report. Returns
 * { ok, markdown, usage, costUsd } or { ok:false, reason }.
 */
async function callGeminiSynthesis({ rawBundle, window, sourcesUsed, sourcesSkipped }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'GEMINI_API_KEY not set' };

  let GoogleGenerativeAI;
  try {
    ({ GoogleGenerativeAI } = await import('@google/generative-ai'));
  } catch (e) {
    return { ok: false, reason: `@google/generative-ai not installed: ${e.message}` };
  }

  const prompt = SYNTHESIS_PROMPT_TEMPLATE
    .replace('{MON_DATE}', isoDate(window.mon))
    .replace('{SUN_DATE}', isoDate(window.sun))
    .replace('{TS}', new Date().toISOString())
    .replace('{SOURCES_USED}', sourcesUsed.join(', ') || 'none')
    .replace('{SOURCES_SKIPPED}', sourcesSkipped.length
      ? sourcesSkipped.map(s => `${s.source} (${s.reason})`).join('; ')
      : 'none')
    .replace('{MODEL}', GEMINI_MODEL)
    .replace('{COST_PLACEHOLDER}', '$PENDING — patched after API returns')
    .replace('{RAW}', rawBundle.slice(0, 200_000)); // 200KB raw cap → Gemini 2.5 Pro handles fine, keeps cost bounded

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4000,
      // Thinking budget: 0 keeps cost predictable (~$0.30-1.50/run for a typical
      // week of signal). Mitchell can raise via WEEKLY_PROGRESS_THINKING_BUDGET
      // env if deeper synthesis is desired.
      thinkingConfig: {
        thinkingBudget: parseInt(process.env.WEEKLY_PROGRESS_THINKING_BUDGET || '0', 10),
      },
    },
  });

  try {
    const result = await model.generateContent([{ text: prompt }]);
    const text = result.response.text();
    const usage = result.response.usageMetadata || {};
    // gemini-2.5-pro current pricing (per 1M tokens): input $1.25 / output $10.00
    // up to 128K tokens; >128K tier: input $2.50 / output $15.00. Use the lower
    // tier here since our prompt is well under 128K — promptTokenCount stays
    // well below that on a single week of signal.
    const inputTok  = usage.promptTokenCount     || 0;
    const outputTok = usage.candidatesTokenCount || 0;
    const isHighTier = inputTok > 128_000;
    const inputRate  = isHighTier ? 2.50  / 1e6 : 1.25  / 1e6;
    const outputRate = isHighTier ? 15.00 / 1e6 : 10.00 / 1e6;
    const costUsd = inputTok * inputRate + outputTok * outputRate;
    return { ok: true, markdown: text, usage, costUsd };
  } catch (err) {
    return { ok: false, reason: `gemini error: ${err.message}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Cost log (matches dashboard short-form rows)
// ──────────────────────────────────────────────────────────────────────────────

function logCost({ label, costUsd, requests = 1 }) {
  // Append a short-form row: date \t label \t cost \t requests. The
  // dashboard's getRolling30dSpend tolerates this 4-col shape (process-all-council-intel.mjs line 191).
  if (!existsSync(dirname(PATHS.costLog))) {
    try { mkdirSync(dirname(PATHS.costLog), { recursive: true }); } catch { /* ignore */ }
  }
  const row = `${isoDate(new Date())}\t${label}\t${costUsd.toFixed(4)}\t${requests}\n`;
  try { appendFileSync(PATHS.costLog, row); } catch (e) {
    process.stderr.write(`[cost-log] append failed: ${e.message}\n`);
  }
}

function getRolling30dSpend() {
  if (!existsSync(PATHS.costLog)) return 0;
  const cutoff = Date.now() - 30 * 86400000;
  let total = 0;
  for (const line of readFileSync(PATHS.costLog, 'utf-8').split('\n')) {
    if (!line.trim() || line.startsWith('date\t')) continue;
    const cols = line.split('\t');
    let dateStr, cost;
    if (cols.length >= 9) { dateStr = cols[0]; cost = parseFloat(cols[7]); }
    else if (cols.length >= 4) { dateStr = cols[0]; cost = parseFloat(cols[2]); }
    else continue;
    if (!isFinite(cost)) continue;
    const t = Date.parse(dateStr);
    if (isNaN(t) || t < cutoff) continue;
    total += cost;
  }
  return total;
}

// ──────────────────────────────────────────────────────────────────────────────
// Raw-signal assembly
// ──────────────────────────────────────────────────────────────────────────────

function assembleRawSignal(window, requestedSources) {
  const sourcesUsed = [];
  const sourcesSkipped = [];
  const chunks = [];

  // 1. git log (always available, fast)
  if (requestedSources.includes('git')) {
    const gl = collectGitLog(window.mon, window.sun);
    if (gl.ok && gl.commitCount > 0) {
      chunks.push(`## git_log (${gl.commitCount} commits)\n\n${gl.raw}`);
      sourcesUsed.push('git_log');
    } else if (gl.ok) {
      sourcesSkipped.push({ source: 'git', reason: 'no commits in window' });
    } else {
      sourcesSkipped.push({ source: 'git', reason: gl.reason });
    }
  }

  // 2. Local cached LinkedIn activity (operator-managed file)
  if (requestedSources.includes('local')) {
    const li = collectDirActivity(PATHS.linkedinActivity, window.mon, window.sun, 'linkedin/activity');
    if (li.ok && li.fileCount > 0) {
      chunks.push(`## linkedin_activity (${li.fileCount} files)\n\n${li.raw}`);
      sourcesUsed.push('linkedin_activity');
    } else {
      sourcesSkipped.push({ source: 'linkedin_activity', reason: li.reason || li.note || 'no files in window' });
    }

    const xa = collectDirActivity(PATHS.xActivity, window.mon, window.sun, 'linkedin/x-activity');
    if (xa.ok && xa.fileCount > 0) {
      chunks.push(`## x_activity (${xa.fileCount} files)\n\n${xa.raw}`);
      sourcesUsed.push('x_activity');
    } else {
      sourcesSkipped.push({ source: 'x_activity', reason: xa.reason || xa.note || 'no files in window' });
    }

    // 3. Career-history inbox / processed (Mitchell drops 1:1 notes here per AGENTS.md doc)
    const chi = collectDirActivity(PATHS.careerHistoryInbox, window.mon, window.sun, 'career-history/inbox');
    if (chi.ok && chi.fileCount > 0) {
      chunks.push(`## career_history_inbox (${chi.fileCount} files)\n\n${chi.raw}`);
      sourcesUsed.push('career_history_inbox');
    } else {
      sourcesSkipped.push({ source: 'career_history_inbox', reason: chi.reason || chi.note || 'no files in window' });
    }
    const chp = collectDirActivity(PATHS.careerHistoryProcessed, window.mon, window.sun, 'career-history/processed');
    if (chp.ok && chp.fileCount > 0) {
      chunks.push(`## career_history_processed (${chp.fileCount} files)\n\n${chp.raw}`);
      sourcesUsed.push('career_history_processed');
    } else {
      sourcesSkipped.push({ source: 'career_history_processed', reason: chp.reason || chp.note || 'no files in window' });
    }

    // 4. Notes / journal / work-updates
    const notes = collectLocalNotes(window.mon, window.sun);
    if (notes.ok && notes.fileCount > 0) {
      chunks.push(`## local_notes (${notes.fileCount} chunks)\n\n${notes.raw}`);
      sourcesUsed.push('local_notes');
    } else {
      sourcesSkipped.push({ source: 'local_notes', reason: 'no week-tagged notes found in known paths' });
    }
  }

  // 5. MCP-derived raw paste (if the parent session already wrote it)
  const rawMcpPath = join(PATHS.tasksDir, `${window.label}.raw.md`);
  if (existsSync(rawMcpPath)) {
    try {
      const mcpRaw = readFileSync(rawMcpPath, 'utf-8');
      chunks.push(`## mcp_enriched (${rawMcpPath.replace(ROOT + '/', '')})\n\n${mcpRaw}`);
      // The .raw.md file is structured by ## headers per source — detect which.
      for (const src of ['gmail', 'calendar', 'drive']) {
        if (requestedSources.includes(src)) {
          if (new RegExp(`^##\\s+${src}\\b`, 'mi').test(mcpRaw)) {
            sourcesUsed.push(src);
          } else {
            sourcesSkipped.push({ source: src, reason: 'no section in mcp .raw.md' });
          }
        }
      }
    } catch (e) {
      sourcesSkipped.push({ source: 'mcp', reason: `raw.md unreadable: ${e.message}` });
    }
  } else {
    for (const src of ['gmail', 'calendar', 'drive']) {
      if (requestedSources.includes(src)) {
        sourcesSkipped.push({ source: src, reason: 'MCP enrichment not yet run (see weekly-progress-tasks/)' });
      }
    }
  }

  return { rawBundle: chunks.join('\n\n'), sourcesUsed, sourcesSkipped };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  // 0. Ensure dirs (output dir is gitignored — see .gitignore patch).
  for (const d of [PATHS.outputDir, PATHS.tasksDir]) {
    if (!existsSync(d)) {
      try { mkdirSync(d, { recursive: true }); }
      catch (e) {
        process.stderr.write(`[fatal] cannot create ${d}: ${e.message}\n`);
        process.exit(1);
      }
    }
  }

  const window = resolveWindow();
  process.stdout.write(`\nweekly-progress-tracker — ${window.label}\n`);
  process.stdout.write(`  window: ${isoDate(window.mon)} to ${isoDate(window.sun)}` +
    (window.custom ? ' (custom --since/--until)' : ' (ISO week)') + '\n');
  process.stdout.write(`  sources requested: ${CLI.sources.join(', ')}\n`);
  process.stdout.write(`  max-cost: $${CLI.maxCost.toFixed(2)} per run\n`);
  process.stdout.write(`  dry-run: ${CLI.dryRun}\n\n`);

  // 1. Emit MCP task template (always — it's free and useful even on dry-run).
  if (!CLI.noTasks) {
    const tasksTemplate = renderMcpTaskTemplate(window, CLI.sources);
    const tasksPath = join(PATHS.tasksDir, `${window.label}.md`);
    writeFileSync(tasksPath, tasksTemplate, 'utf-8');
    process.stdout.write(`  task template: ${tasksPath.replace(ROOT + '/', '')}\n`);
  }

  // 2. Assemble local + MCP-enriched raw signal.
  const { rawBundle, sourcesUsed, sourcesSkipped } = assembleRawSignal(window, CLI.sources);
  process.stdout.write(`  sources used:    ${sourcesUsed.join(', ') || '(none)'}\n`);
  process.stdout.write(`  sources skipped: ${sourcesSkipped.length} (${sourcesSkipped.map(s => s.source).join(', ') || 'none'})\n`);
  process.stdout.write(`  raw signal bytes: ${rawBundle.length.toLocaleString()}\n\n`);

  // 3. Cost estimate.
  // Rough math: 200KB raw ≈ ~50K tokens; with prompt template overhead ≈ 55K.
  // gemini-2.5-pro: $1.25/MTok input × ~55K = $0.069 + output (~3K tokens × $10/MTok = $0.030)
  // Typical week: ~$0.05–$0.20. We cap at --max-cost regardless.
  const approxInputTokens = Math.ceil(rawBundle.length / 4) + 1000;
  const estCost = (approxInputTokens * 1.25 / 1e6) + (3000 * 10 / 1e6);
  process.stdout.write(`  estimated Gemini cost: ~$${estCost.toFixed(4)}\n`);

  // 4. Dry-run: report and exit.
  if (CLI.dryRun) {
    process.stdout.write('\n  --dry-run: skipping Gemini call, skipping report write. No money spent.\n');
    process.stdout.write('\n  Next steps:\n');
    if (sourcesSkipped.some(s => ['gmail', 'calendar', 'drive'].includes(s.source))) {
      process.stdout.write(`    1. Open a Claude session and follow data/weekly-progress-tasks/${window.label}.md\n`);
      process.stdout.write(`    2. Paste MCP responses into data/weekly-progress-tasks/${window.label}.raw.md\n`);
      process.stdout.write('    3. Re-run this script (no --dry-run) to synthesize.\n');
    } else {
      process.stdout.write('    Local sources only — re-run without --dry-run to synthesize.\n');
    }
    process.stdout.write('\n');
    process.exit(0);
  }

  // 5. Budget guards (real run only).
  if (estCost > CLI.maxCost && !CLI.force) {
    process.stderr.write(
      `\n[abort] estimated cost $${estCost.toFixed(4)} > --max-cost $${CLI.maxCost.toFixed(2)}. ` +
      `Use --force to override or raise --max-cost.\n`
    );
    process.exit(2);
  }
  const spent30d = getRolling30dSpend();
  if (spent30d >= MONTHLY_BUDGET && !CLI.force) {
    process.stderr.write(
      `\n[abort] rolling 30-day spend $${spent30d.toFixed(2)} >= MONTHLY_BUDGET_USD $${MONTHLY_BUDGET}. ` +
      `Use --force to override or set MONTHLY_BUDGET_USD higher.\n`
    );
    process.exit(2);
  }

  // 6. Synthesise with Gemini.
  if (rawBundle.length === 0) {
    process.stderr.write('[abort] no raw signal collected — nothing to synthesise.\n');
    process.exit(3);
  }

  process.stdout.write(`\n  calling ${GEMINI_MODEL}…\n`);
  const result = await callGeminiSynthesis({ rawBundle, window, sourcesUsed, sourcesSkipped });
  if (!result.ok) {
    process.stderr.write(`[abort] ${result.reason}\n`);
    process.exit(4);
  }

  // 7. Patch the cost placeholder, then write outputs.
  const finalMarkdown = result.markdown.replace(
    /\$PENDING — patched after API returns/,
    `$${result.costUsd.toFixed(4)} (input ${result.usage.promptTokenCount || '?'} tok / output ${result.usage.candidatesTokenCount || '?'} tok)`
  );

  const mdPath   = join(PATHS.outputDir, `${window.label}.md`);
  const jsonPath = join(PATHS.outputDir, `${window.label}.json`);

  writeFileSync(mdPath, finalMarkdown, 'utf-8');
  writeFileSync(jsonPath, JSON.stringify({
    week: window.label,
    window: { since: isoDate(window.mon), until: isoDate(window.sun) },
    generated_at: new Date().toISOString(),
    model: GEMINI_MODEL,
    cost_usd: result.costUsd,
    usage: result.usage,
    sources_used: sourcesUsed,
    sources_skipped: sourcesSkipped,
    raw_bytes: rawBundle.length,
    markdown_path: mdPath.replace(ROOT + '/', ''),
  }, null, 2), 'utf-8');

  // 8. Log cost.
  logCost({ label: 'weekly-progress-tracker', costUsd: result.costUsd });

  process.stdout.write(`\n  wrote: ${mdPath.replace(ROOT + '/', '')}\n`);
  process.stdout.write(`  wrote: ${jsonPath.replace(ROOT + '/', '')}\n`);
  process.stdout.write(`  cost:  $${result.costUsd.toFixed(4)} (logged to data/cost-log.tsv)\n`);
  process.stdout.write(`  rolling 30d spend now: $${(spent30d + result.costUsd).toFixed(2)} / $${MONTHLY_BUDGET}\n\n`);
}

main().catch(err => {
  process.stderr.write(`[fatal] ${err.stack || err.message}\n`);
  process.exit(1);
});
