#!/usr/bin/env node

/**
 * validate-websearch-seeds.mjs
 *
 * Pre-flight validator for WebSearch secondary scan query seeds.
 * Must achieve a dead-URL rate below --threshold (default 2%) before
 * Step 1 of the 6am SKILL can be re-enabled (KAIZEN-01).
 *
 * Verification strategy:
 *   - Greenhouse/Lever/Ashby URLs  → ATS API call (authoritative, zero false positives)
 *   - All other URLs               → WebFetch + liveness-core classify (best-effort)
 *   - Login-walled (LinkedIn etc.) → counted as "login-walled", excluded from dead rate
 *
 * Usage:
 *   node validate-websearch-seeds.mjs --input candidate-urls.txt
 *   node validate-websearch-seeds.mjs --input urls.txt --threshold 2 --min-urls 20
 *   cat urls.txt | node validate-websearch-seeds.mjs --stdin
 *
 * Input format (--input file or --stdin):
 *   One URL per line. Blank lines and lines starting with # are ignored.
 *
 * Exit codes:
 *   0  PASS  — dead rate < threshold (safe to re-enable WebSearch secondary)
 *   1  FAIL  — dead rate >= threshold (do NOT re-enable yet)
 *   2  ERROR — fewer than --min-urls verifiable URLs in input
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { classifyLiveness } from './liveness-core.mjs';

// ── CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag, defaultVal) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : defaultVal;
}

const INPUT_FILE  = getArg('--input', null);
const USE_STDIN   = args.includes('--stdin');
const THRESHOLD   = parseFloat(getArg('--threshold', '2'));   // % dead rate ceiling
const MIN_URLS    = parseInt(getArg('--min-urls', '20'), 10); // min sample size
const OUTPUT_FILE = getArg('--output', null);                 // optional JSON report
const VERBOSE     = args.includes('--verbose') || args.includes('-v');
const TIMEOUT_MS  = parseInt(getArg('--timeout', '10000'), 10);

// ── Platform detectors ────────────────────────────────────────────────

function detectPlatform(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname;

    // Greenhouse
    const ghBoard = host.match(/^(?:boards|job-boards)(?:-api)?(?:\.eu)?\.greenhouse\.io$/);
    if (ghBoard || (u.hostname.includes('greenhouse') && path.includes('/jobs/'))) {
      // Extract board slug and job id from path: /v1/boards/{board}/jobs/{id}
      // or job-boards.greenhouse.io/{board}/jobs/{id}
      const m = path.match(/(?:boards\/|\/v1\/boards\/)([^/]+)\/jobs\/(\d+)/i)
             || path.match(/\/([^/]+)\/jobs\/(\d+)/);
      if (m) return { type: 'greenhouse', board: m[1], jobId: m[2] };
    }

    // Lever
    if (host.includes('lever.co')) {
      const m = path.match(/^\/([^/]+)\/([0-9a-f-]{36})/i);
      if (m) return { type: 'lever', company: m[1], jobId: m[2] };
    }

    // Ashby
    if (host.includes('ashbyhq.com')) {
      const m = path.match(/^\/([^/]+)(?:\/([^/?#]+))?/);
      if (m) return { type: 'ashby', company: m[1], jobId: m[2] || null };
    }

    // Login-walled platforms (always uncertain — exclude from dead rate)
    if (host.includes('linkedin.com')) return { type: 'login-walled', platform: 'linkedin' };
    if (host.includes('indeed.com'))   return { type: 'login-walled', platform: 'indeed' };
    if (host.includes('theladders.com')) return { type: 'login-walled', platform: 'theladders' };

    // iCIMS / SmartRecruiters / Workday — body-fetch
    if (host.includes('icims.com'))          return { type: 'fetch', platform: 'icims' };
    if (host.includes('smartrecruiters.com')) return { type: 'fetch', platform: 'smartrecruiters' };
    if (host.includes('myworkdayjobs.com'))  return { type: 'fetch', platform: 'workday' };
    if (host.includes('hiring.cafe'))        return { type: 'fetch', platform: 'hiringcafe' };

    return { type: 'fetch', platform: 'unknown' };
  } catch {
    return { type: 'invalid', platform: 'invalid' };
  }
}

// ── Fetch helpers ─────────────────────────────────────────────────────

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── ATS API verifiers ─────────────────────────────────────────────────

async function verifyGreenhouse(board, jobId) {
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`;
  try {
    const res = await fetchWithTimeout(apiUrl);
    if (res.status === 200) return { result: 'active',  reason: `Greenhouse API 200 (board=${board} job=${jobId})` };
    if (res.status === 404) return { result: 'dead',    reason: `Greenhouse API 404 (board=${board} job=${jobId})` };
    return { result: 'uncertain', reason: `Greenhouse API HTTP ${res.status}` };
  } catch (err) {
    return { result: 'uncertain', reason: `Greenhouse API error: ${err.message}` };
  }
}

async function verifyLever(company, jobId) {
  const apiUrl = `https://api.lever.co/v0/postings/${company}/${jobId}?mode=json`;
  try {
    const res = await fetchWithTimeout(apiUrl);
    if (res.status === 200) return { result: 'active',  reason: `Lever API 200 (${company}/${jobId})` };
    if (res.status === 404) return { result: 'dead',    reason: `Lever API 404 (${company}/${jobId})` };
    return { result: 'uncertain', reason: `Lever API HTTP ${res.status}` };
  } catch (err) {
    return { result: 'uncertain', reason: `Lever API error: ${err.message}` };
  }
}

async function verifyAshby(company, jobId) {
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${company}`;
  try {
    const res = await fetchWithTimeout(apiUrl);
    if (!res.ok) return { result: 'uncertain', reason: `Ashby board API HTTP ${res.status}` };
    const json = await res.json();
    const jobs = json.jobs || [];
    if (!jobId) {
      return { result: 'uncertain', reason: `Ashby board found (${jobs.length} jobs) — no specific jobId to match` };
    }
    const found = jobs.some(j => j.id === jobId || (j.jobUrl || '').includes(jobId));
    if (found) return { result: 'active', reason: `Ashby job ${jobId} found in board listing` };
    return { result: 'dead', reason: `Ashby job ${jobId} not found in board listing (${jobs.length} total)` };
  } catch (err) {
    return { result: 'uncertain', reason: `Ashby API error: ${err.message}` };
  }
}

async function verifyByFetch(url) {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; career-ops-validator/1.0)' },
      redirect: 'follow',
    });
    const bodyText = await res.text();
    const { result, reason } = classifyLiveness({
      status: res.status,
      finalUrl: res.url,
      bodyText: bodyText.slice(0, 8000),
      applyControls: [],
    });
    // Map liveness-core results to our vocabulary
    if (result === 'active')    return { result: 'active',    reason };
    if (result === 'expired')   return { result: 'dead',      reason };
    return                             { result: 'uncertain', reason };
  } catch (err) {
    return { result: 'uncertain', reason: `fetch error: ${err.message}` };
  }
}

// ── Single URL verifier ───────────────────────────────────────────────

async function verifyUrl(url) {
  const info = detectPlatform(url);

  if (info.type === 'invalid') {
    return { url, platform: 'invalid', result: 'dead', reason: 'malformed URL' };
  }

  if (info.type === 'login-walled') {
    return { url, platform: info.platform, result: 'login-walled', reason: 'login required — excluded from dead-rate calc' };
  }

  if (info.type === 'greenhouse') {
    const v = await verifyGreenhouse(info.board, info.jobId);
    return { url, platform: 'greenhouse', ...v };
  }

  if (info.type === 'lever') {
    const v = await verifyLever(info.company, info.jobId);
    return { url, platform: 'lever', ...v };
  }

  if (info.type === 'ashby') {
    const v = await verifyAshby(info.company, info.jobId);
    return { url, platform: 'ashby', ...v };
  }

  // fetch-based (iCIMS, SmartRecruiters, Workday, HiringCafe, unknown)
  const v = await verifyByFetch(url);
  return { url, platform: info.platform, ...v };
}

// ── Concurrency pool ──────────────────────────────────────────────────

async function verifyAll(urls, concurrency = 8) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      const r = await verifyUrl(url);
      results.push(r);
      if (VERBOSE) {
        const icon = r.result === 'active' ? '✅' : r.result === 'dead' ? '❌' : r.result === 'login-walled' ? '🔒' : '❓';
        console.log(`  ${icon} [${r.platform}] ${r.url}`);
        console.log(`     → ${r.result}: ${r.reason}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Input reader ──────────────────────────────────────────────────────

async function readUrls() {
  let raw = '';

  if (USE_STDIN) {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) raw += line + '\n';
  } else if (INPUT_FILE) {
    if (!existsSync(INPUT_FILE)) {
      console.error(`Error: input file not found: ${INPUT_FILE}`);
      process.exit(2);
    }
    raw = readFileSync(INPUT_FILE, 'utf-8');
  } else {
    console.error('Error: specify --input <file> or --stdin');
    console.error('Usage: node validate-websearch-seeds.mjs --input urls.txt');
    process.exit(2);
  }

  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const urls = await readUrls();

  console.log(`\n${'━'.repeat(55)}`);
  console.log(`WebSearch Seed Validator — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`${'━'.repeat(55)}`);
  console.log(`URLs to verify:   ${urls.length}`);
  console.log(`Dead-rate ceiling: ${THRESHOLD}%   Min sample: ${MIN_URLS}`);
  console.log(`Timeout per URL:  ${TIMEOUT_MS}ms`);
  console.log('');

  if (urls.length === 0) {
    console.error('ERROR: no URLs found in input.');
    process.exit(2);
  }

  if (VERBOSE) console.log('Verifying...\n');
  else console.log(`Verifying ${urls.length} URLs (use --verbose for per-URL output)...\n`);

  const results = await verifyAll(urls);

  // ── Tally ──────────────────────────────────────────────────────────
  const active      = results.filter(r => r.result === 'active');
  const dead        = results.filter(r => r.result === 'dead');
  const uncertain   = results.filter(r => r.result === 'uncertain');
  const loginWalled = results.filter(r => r.result === 'login-walled');

  // Dead rate is calculated over verifiable URLs only (excludes login-walled + uncertain)
  // Conservative mode: treat uncertain as dead for the rate calc
  const verifiable  = results.length - loginWalled.length;
  const deadCount   = dead.length + uncertain.length; // conservative
  const deadRate    = verifiable > 0 ? (deadCount / verifiable) * 100 : 100;

  // ── Report ─────────────────────────────────────────────────────────
  console.log(`${'━'.repeat(55)}`);
  console.log('Results');
  console.log(`${'━'.repeat(55)}`);
  console.log(`✅  Active (ATS-confirmed live):  ${active.length}`);
  console.log(`❌  Dead (ATS-confirmed dead):    ${dead.length}`);
  console.log(`❓  Uncertain (no apply signal):  ${uncertain.length}  (counted as dead)`);
  console.log(`🔒  Login-walled (excluded):      ${loginWalled.length}`);
  console.log(`─────────────────────────────────────────────────────`);
  console.log(`Verifiable URLs:                  ${verifiable}`);
  console.log(`Dead rate (conservative):         ${deadRate.toFixed(1)}%`);
  console.log(`Threshold:                        ${THRESHOLD}%`);
  console.log('');

  // Platform breakdown
  const byPlatform = {};
  for (const r of results) {
    const p = r.platform;
    if (!byPlatform[p]) byPlatform[p] = { active: 0, dead: 0, uncertain: 0, loginWalled: 0 };
    if (r.result === 'active')       byPlatform[p].active++;
    else if (r.result === 'dead')    byPlatform[p].dead++;
    else if (r.result === 'uncertain') byPlatform[p].uncertain++;
    else                             byPlatform[p].loginWalled++;
  }

  console.log('Platform breakdown:');
  for (const [platform, counts] of Object.entries(byPlatform)) {
    const total = counts.active + counts.dead + counts.uncertain + counts.loginWalled;
    const pDead = counts.dead + counts.uncertain;
    const pRate = total > 0 ? ((pDead / total) * 100).toFixed(0) : '—';
    const loginNote = counts.loginWalled ? ` (${counts.loginWalled} login-walled)` : '';
    console.log(`  ${platform.padEnd(16)} ${counts.active}✅  ${pDead}❌  dead=${pRate}%${loginNote}`);
  }

  // Dead URL list (for investigation)
  if (dead.length > 0 || uncertain.length > 0) {
    console.log('\nDead / uncertain URLs:');
    for (const r of [...dead, ...uncertain]) {
      const icon = r.result === 'dead' ? '❌' : '❓';
      console.log(`  ${icon} ${r.url}`);
      console.log(`     ${r.reason}`);
    }
  }

  // ── Verdict ────────────────────────────────────────────────────────
  console.log(`\n${'━'.repeat(55)}`);

  if (verifiable < MIN_URLS) {
    console.log(`⚠️  INSUFFICIENT SAMPLE`);
    console.log(`   Only ${verifiable} verifiable URLs — minimum is ${MIN_URLS}.`);
    console.log(`   Add more seed URLs and re-run.`);
    if (OUTPUT_FILE) writeReport(OUTPUT_FILE, { pass: false, reason: 'insufficient-sample', verifiable, deadRate, results });
    process.exit(2);
  }

  if (deadRate < THRESHOLD) {
    console.log(`✅  PASS — dead rate ${deadRate.toFixed(1)}% is below ${THRESHOLD}% ceiling`);
    console.log(`   WebSearch secondary scan is safe to re-enable.`);
    console.log(`\n   Resume checklist:`);
    console.log(`   1. Remove the KAIZEN-01 suspension block from docs/scheduled-tasks/job-pulse-6am-refresh.SKILL.md`);
    console.log(`   2. Update CLAUDE.md Tech Debt Log: KAIZEN-01 → ✅ RESOLVED`);
    console.log(`   3. Paste updated SKILL into the Cowork scheduled task`);
    if (OUTPUT_FILE) writeReport(OUTPUT_FILE, { pass: true, deadRate, verifiable, results });
    process.exit(0);
  } else {
    console.log(`❌  FAIL — dead rate ${deadRate.toFixed(1)}% exceeds ${THRESHOLD}% ceiling`);
    console.log(`   Do NOT re-enable WebSearch secondary yet.`);
    console.log(`   Fix the dead URLs above, refresh query seeds, and re-run.`);
    if (OUTPUT_FILE) writeReport(OUTPUT_FILE, { pass: false, reason: 'dead-rate-exceeded', deadRate, verifiable, results });
    process.exit(1);
  }
}

function writeReport(path, data) {
  writeFileSync(path, JSON.stringify({ ran_at: new Date().toISOString(), ...data }, null, 2), 'utf-8');
  console.log(`\nReport written to: ${path}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(2);
});
