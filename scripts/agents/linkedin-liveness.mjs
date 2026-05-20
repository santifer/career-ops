#!/usr/bin/env node
/**
 * scripts/agents/linkedin-liveness.mjs
 *
 * Per-row liveness probe for LinkedIn-hosted job URLs in data/applications.md.
 *
 * Why this is separate from scripts/liveness-sweep.mjs:
 *   The shared lib/liveness.mjs probe uses node fetch() — which LinkedIn
 *   blocks at the edge (HTTP 999 anti-bot, or 200 with a login wall). That
 *   would mis-classify live roles as expired and auto-discard them. This
 *   script connects to Mitchell's CDP-attached Chrome at 127.0.0.1:9222
 *   (already authenticated to LinkedIn — see data/cdp-auth-state.json)
 *   and reads the actual logged-in DOM.
 *
 * Behavior (mirrors scripts/liveness-sweep.mjs):
 *   - status=Evaluated + expired  → marked Discarded with closure reason
 *   - status=Applied|Responded|Interview + expired → flagged for review,
 *     NOT auto-modified (those need Mitchell's eyes).
 *   - status=active → state.json updated, tracker untouched
 *   - status=uncertain → state.json updated, tracker untouched, flagged
 *
 * Usage:
 *   node scripts/agents/linkedin-liveness.mjs                    # full sweep
 *   node scripts/agents/linkedin-liveness.mjs --dry-run          # report only
 *   node scripts/agents/linkedin-liveness.mjs --rows=2235,2236   # subset
 *   node scripts/agents/linkedin-liveness.mjs --targets=PATH     # explicit JSON list
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connectToChromeCDP, isCdpAvailable } from '../../lib/cdp-browser.mjs';
import { markRowAsExpired } from '../../lib/liveness.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TODAY = new Date().toISOString().slice(0, 10);
const STATE_PATH = join(ROOT, 'data/liveness-state.json');
const LOG_DIR = join(ROOT, 'data/logs');
mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = join(LOG_DIR, `linkedin-liveness-${TODAY}.log`);
const REPORT_PATH = join(ROOT, `data/linkedin-liveness-report-${TODAY}.md`);

const DRY_RUN = process.argv.includes('--dry-run');
const ROW_FLAG = process.argv.find(a => a.startsWith('--rows='));
const TARGETS_FLAG = process.argv.find(a => a.startsWith('--targets='));
const SUBSET = ROW_FLAG
  ? new Set(ROW_FLAG.slice(7).split(',').map(s => s.trim()))
  : null;

// LinkedIn-specific hard-expired phrases (matched against page text)
const HARD_EXPIRED_RE = /\b(?:no longer accepting applications|this job is no longer (?:available|active|accepting)|the role is no longer available|posting (?:is )?(?:closed|expired)|this position has been filled|the hiring (?:team )?has (?:filled|closed))\b/i;
// "Page not found" / 404
const NOT_FOUND_RE = /\b(?:page not found|we (?:can'?t|cannot) find the page|404 not found)\b/i;
// "Sign in" / login wall heuristic
const LOGIN_WALL_RE = /(?:sign in to LinkedIn|join now to see who's hiring|welcome back\s*sign in)/i;

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { writeFileSync(LOG_PATH, line, { flag: 'a' }); } catch {}
}

function loadTargets() {
  if (TARGETS_FLAG) {
    const p = TARGETS_FLAG.slice(10);
    return JSON.parse(readFileSync(p, 'utf8'));
  }
  const files = readdirSync(join(ROOT, 'data'))
    .filter(f => /^linkedin-liveness-targets-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (files.length) {
    const p = join(ROOT, 'data', files.at(-1));
    logLine(`Using targets: ${p}`);
    return JSON.parse(readFileSync(p, 'utf8'));
  }
  throw new Error('No linkedin-liveness-targets-*.json found. Re-run the upstream extractor first.');
}

function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { schema_version: 2, rows: {}, runs: [] };
  }
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return { schema_version: 2, rows: {}, runs: [] }; }
}

function saveState(state) {
  if (DRY_RUN) {
    logLine('DRY RUN — would have written liveness-state.json');
    return;
  }
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function classifyLinkedInPage(finalUrl, bodyText) {
  if (LOGIN_WALL_RE.test(bodyText) && !/Apply on company website|Easy Apply/i.test(bodyText)) {
    return { result: 'uncertain', reason: 'login wall — CDP session may have dropped' };
  }
  if (/\/jobs\/(search|collections|jobs-you-have-saved)/i.test(finalUrl)) {
    return { result: 'expired', reason: 'redirect to /jobs/search (posting removed)' };
  }
  if (NOT_FOUND_RE.test(bodyText)) {
    return { result: 'expired', reason: 'LinkedIn 404 page' };
  }
  if (HARD_EXPIRED_RE.test(bodyText)) {
    const m = bodyText.match(HARD_EXPIRED_RE);
    return { result: 'expired', reason: `phrase: "${m[0].slice(0, 60)}"` };
  }
  const strong = /\bEasy Apply\b|Apply on company website|Apply now|See who LinkedIn members have hired|Be one of the first applicants|Set alert for similar jobs/i.test(bodyText);
  const weak   = /\b(\d+ applicants?|\d+ (?:hour|day|week|month)s? ago|Posted\s+\d|About the job|Job description|Seniority level|Employment type|Job function)\b/i.test(bodyText);
  if (strong || weak) {
    const sigs = [strong && 'strong', weak && 'weak'].filter(Boolean).join('+');
    return { result: 'active', reason: `${sigs} signals present` };
  }
  return { result: 'uncertain', reason: 'no expired markers, no active signals' };
}

async function probeOne(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);
    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    return classifyLinkedInPage(finalUrl, bodyText);
  } catch (err) {
    return { result: 'uncertain', reason: `nav error: ${err.message.split('\n')[0].slice(0, 80)}` };
  }
}

async function main() {
  logLine('--- linkedin-liveness starting ---');
  logLine(`mode=${DRY_RUN ? 'dry-run' : 'live'} subset=${SUBSET ? [...SUBSET].join(',') : 'all'}`);

  if (!(await isCdpAvailable())) {
    logLine('FATAL: CDP not available at 127.0.0.1:9222. Start the debug Chrome first.');
    process.exit(2);
  }

  const targets = loadTargets()
    .filter(t => !SUBSET || SUBSET.has(t.num));
  logLine(`Probing ${targets.length} LinkedIn URL(s) sequentially via CDP.`);

  const cdp = await connectToChromeCDP();
  const page = await cdp.newPageInDefaultContext();

  const state = loadState();
  const nowIso = new Date().toISOString();
  const summary = { active: 0, expired_discarded: 0, expired_needs_review: 0, uncertain: 0, errors: 0 };
  const perRow = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    logLine(`  [${i + 1}/${targets.length}] #${t.num} (${t.status}) ${t.company} — ${t.role.slice(0, 50)}`);
    let result;
    try {
      result = await probeOne(page, t.url);
    } catch (err) {
      result = { result: 'uncertain', reason: `probe threw: ${err.message.slice(0, 80)}` };
      summary.errors++;
    }
    logLine(`     → ${result.result} (${result.reason})`);
    perRow.push({ ...t, classification: result.result, reason: result.reason });

    const key = String(t.num);
    const stateRow = state.rows[key] || {};

    if (result.result === 'active') {
      summary.active++;
      state.rows[key] = { ...stateRow, status: 'active', url: t.url, lastChecked: nowIso, reason: result.reason };
    } else if (result.result === 'expired') {
      if (t.status === 'Evaluated') {
        if (!DRY_RUN) {
          markRowAsExpired(t.num, result.reason, { silent: true });
        }
        summary.expired_discarded++;
        state.rows[key] = { ...stateRow, status: 'expired_discarded', url: t.url, lastChecked: nowIso, reason: result.reason };
      } else {
        summary.expired_needs_review++;
        logLine(`     ⚠ ${t.status} row — NOT auto-discarded, flagged for review`);
        state.rows[key] = { ...stateRow, status: 'expired_needs_review', url: t.url, lastChecked: nowIso, reason: result.reason, tracker_status: t.status };
      }
    } else {
      summary.uncertain++;
      state.rows[key] = { ...stateRow, status: 'uncertain', url: t.url, lastChecked: nowIso, reason: result.reason, needsReview: true };
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  await page.close();
  await cdp.disconnect();

  state.runs = (state.runs || []).slice(-9);
  state.runs.push({
    timestamp: nowIso, tool: 'linkedin-liveness',
    rows_checked: targets.length, summary, dry_run: DRY_RUN,
  });
  saveState(state);

  const md = [];
  md.push(`# LinkedIn Liveness Sweep — ${TODAY}`);
  md.push('');
  md.push(`Probed ${targets.length} LinkedIn-hosted URLs via CDP-authenticated Chrome at 127.0.0.1:9222.`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`- **active:** ${summary.active}`);
  md.push(`- **expired → auto-discarded:** ${summary.expired_discarded}`);
  md.push(`- **expired → needs review (Applied/Interview/Responded):** ${summary.expired_needs_review}`);
  md.push(`- **uncertain (login wall / no clear signal):** ${summary.uncertain}`);
  md.push(`- **errors:** ${summary.errors}`);
  md.push('');
  md.push(`Mode: \`${DRY_RUN ? 'dry-run (no tracker writes)' : 'live'}\``);
  md.push('');
  md.push('## Per-row results');
  md.push('');
  md.push('| # | Status (was) | Result | Company | Role | Reason |');
  md.push('|---|--------------|--------|---------|------|--------|');
  for (const r of perRow.sort((a, b) => {
    const order = { expired: 0, uncertain: 1, active: 2 };
    return (order[a.classification] ?? 9) - (order[b.classification] ?? 9);
  })) {
    md.push(`| ${r.num} | ${r.status} | ${r.classification} | ${r.company} | ${r.role.slice(0, 50)} | ${r.reason} |`);
  }
  md.push('');
  md.push(`Log: \`${LOG_PATH.replace(ROOT + '/', '')}\``);
  md.push('');
  writeFileSync(REPORT_PATH, md.join('\n'));
  logLine(`Wrote report: ${REPORT_PATH}`);

  logLine(`--- linkedin-liveness done ---`);
  logLine(`Summary: active=${summary.active} discarded=${summary.expired_discarded} needs_review=${summary.expired_needs_review} uncertain=${summary.uncertain} errors=${summary.errors}`);
  return summary;
}

main().then(() => process.exit(0)).catch(err => {
  logLine(`FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
