#!/usr/bin/env node
/**
 * triage.mjs — the missing "evaluate" step for the CT 203 daily pipeline.
 *
 * The deployed scanner does scan → notify → followup but never SCORES anything
 * (see memory: project_scanner_no_eval — every digest job is score:null). This
 * closes that gap with a cheap funnel:
 *
 *   scan-history rows → title gate → fetch JD → location gate (JD-body aware,
 *   lib/location-gate.mjs) → comp floor → OpenRouter A–G eval on survivors only.
 *
 * Hard gates run with ZERO LLM cost and kill the ~90% that are presales/territory/
 * non-US/onsite/sub-floor; only genuine contenders reach the (paid) LLM eval.
 *
 * Usage:
 *   node triage.mjs --date 2026-06-04            # one scan day
 *   node triage.mjs --since 2026-05-26           # a backlog range
 *   node triage.mjs --since 2026-05-26 --dry-run # gates only, no LLM, no cost
 *   node triage.mjs --date 2026-06-04 --write    # also write reports + TSVs for >=4.0
 *   node triage.mjs --date 2026-06-04 --update-digest  # backfill scores into last-digest.json
 *
 * Needs OPENROUTER_API_KEY (or ~/.secrets/openrouter.txt) unless --dry-run.
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { fetchJob } from './lib/ats-fetch.mjs';
import { assessLocation } from './lib/location-gate.mjs';
import { evaluateJD, buildReportMarkdown, jobToJdText, nextReportNumber, slugify, REPORTS_DIR, DEFAULT_MODEL } from './openrouter-eval.mjs';
import { loadTelegramConfig, sendMessage } from './lib/telegram.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCAN = join(ROOT, 'data/scan-history.tsv');
const TRACKER = join(ROOT, 'data/applications.md');
const DIGEST = join(ROOT, 'data/last-digest.json');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const onDate = opt('--date', null);
const sinceDate = opt('--since', null);
const limit = parseInt(opt('--limit', '0')) || Infinity;
const dryRun = has('--dry-run');
const doWrite = has('--write');
const updateDigest = has('--update-digest');
const COMP_FLOOR = 160; // $160K base, per modes/_profile.md

// Presales / territory / off-archetype title negatives (the big SKIP bucket).
const TITLE_NEG = [
  /solutions?\s+(architect|engineer|consultant)/i, /customer engineer/i, /sales engineer/i,
  /account (exec|manager)/i, /presales|pre-sales/i, /field (solutions?|engineer)/i, /\bgtm\b/i,
  /business development/i, /\bpartner\b/i, /developer relations|devrel|advocate/i,
  /machine learning|\bml engineer\b|data scientist|data analyst|research (scientist|engineer)/i,
  /product manager|program manager|\bvp\b|vice president|\bchief\b/i,
  /frontend|front-end|\bux\b|design systems/i, /\bintern\b|working student|\bjunior\b|associate/i,
];
const titleSkip = (t) => (TITLE_NEG.find(re => re.test(t)) || null) && TITLE_NEG.find(re => re.test(t)).source;

// Parse a single comp token to $K. Handles "214.2K", "$252K", "120,000", "$140,000".
function tokenToK(tok) {
  const hasK = /[kK]/.test(tok);
  const v = parseFloat(tok.replace(/[$,\skK]/g, '')); // strip $ , whitespace K
  if (isNaN(v)) return null;
  return (!hasK && v > 900) ? v / 1000 : v; // bare full-dollar amount -> K
}
function compGate(comp) {
  if (!comp) return { ok: true, note: 'no comp listed' };
  const toks = comp.match(/\$?\s?\d{2,3}(?:[.,]\d{1,3})?\s?[kK]?/g) || [];
  const nums = toks.map(tokenToK).filter(n => n != null && n >= 50 && n <= 900);
  if (!nums.length) return { ok: true, note: 'comp unparsed' };
  const max = Math.round(Math.max(...nums));
  return max < COMP_FLOOR ? { ok: false, note: `comp max $${max}K < $${COMP_FLOOR}K floor` } : { ok: true, note: `comp max $${max}K` };
}

// Dedup against tracker (company+role already evaluated/applied).
function trackerKeys() {
  if (!existsSync(TRACKER)) return new Set();
  const keys = new Set();
  for (const line of readFileSync(TRACKER, 'utf-8').split('\n')) {
    const m = line.match(/^\|\s*\d+\s*\|[^|]*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (m) keys.add((m[1] + '|' + m[2]).toLowerCase().replace(/[^a-z0-9|]/g, ''));
  }
  return keys;
}
const seen = trackerKeys();
const inTracker = (company, title) => seen.has((company + '|' + title).toLowerCase().replace(/[^a-z0-9|]/g, ''));

function rows() {
  if (!existsSync(SCAN)) { console.error('no scan-history.tsv'); process.exit(1); }
  return readFileSync(SCAN, 'utf-8').split('\n').slice(1).filter(Boolean)
    .map(l => { const [url, date, portal, title, company] = l.split('\t'); return { url, date, portal, title, company }; })
    .filter(r => r.title && r.date !== 'first_seen' &&
      (onDate ? r.date === onDate : sinceDate ? r.date >= sinceDate : true));
}

const escapeHtml = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function telegramAlert(scored) {
  const cfg = loadTelegramConfig(join(ROOT, '.env'));
  if (!cfg.token || !cfg.chatId) { console.log('(no telegram config — skipping alert)'); return; }
  const apply = scored.filter(s => parseFloat(s.score) >= 4.0).sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
  let msg = `<b>career-ops triage</b> — ${scored.length} evaluated, ${apply.length} ≥4.0`;
  if (apply.length) for (const s of apply)
    msg += `\n\n🎯 <b>${s.score}</b> — ${escapeHtml(s.company)}: ${escapeHtml(s.role)}${s.location_verdict === 'confirm' ? ' ⚠️confirm-remote' : ''}\n${s.url}`;
  else msg += `\nNothing ≥4.0 today.`;
  try { await sendMessage(cfg, cfg.chatId, msg); console.log('📨 Telegram alert sent'); }
  catch (e) { console.error('telegram failed:', e.message); }
}

// ── run ──────────────────────────────────────────────────────────────────
const all = rows().slice(0, limit === Infinity ? undefined : limit);
const buckets = { 'skip-title': 0, 'skip-location': 0, 'skip-comp': 0, 'in-tracker': 0, 'fetch-fail': 0, survivors: 0 };
const survivors = [];

console.log(`\n🔎 triage: ${all.length} scanned jobs ${onDate ? `on ${onDate}` : sinceDate ? `since ${sinceDate}` : '(all)'}${dryRun ? '  [DRY-RUN: gates only]' : ''}\n`);

for (const r of all) {
  if (titleSkip(r.title)) { buckets['skip-title']++; continue; }
  if (inTracker(r.company, r.title)) { buckets['in-tracker']++; continue; }
  const job = await fetchJob(r.url, { company: r.company });
  if (!job.ok) { buckets['fetch-fail']++; console.log(`  ⚠️  fetch-fail: ${r.company} — ${r.title} (${job.error})`); continue; }
  const loc = assessLocation(job);
  if (loc.verdict === 'skip') { buckets['skip-location']++; continue; }
  const cg = compGate(job.comp);
  if (!cg.ok) { buckets['skip-comp']++; console.log(`  💸 skip-comp: ${r.company} — ${r.title} (${cg.note})`); continue; }
  buckets.survivors++;
  survivors.push({ ...r, job, loc, cg });
  console.log(`  ✅ survivor: ${r.company} — ${r.title}  [loc:${loc.verdict}, ${cg.note}]`);
}

console.log(`\n── Funnel ──`);
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(14)} ${v}`);

if (dryRun) { console.log(`\n(dry-run — ${survivors.length} would go to LLM eval)\n`); process.exit(0); }
if (!survivors.length) { console.log('\nNo survivors to evaluate.\n'); process.exit(0); }

console.log(`\n── Evaluating ${survivors.length} survivors via OpenRouter (${DEFAULT_MODEL}) ──\n`);
const scored = [];
for (const s of survivors) {
  let result, text;
  try { ({ result, text } = await evaluateJD({ jdText: jobToJdText(s.job), company: s.company, url: s.url, locVerdict: s.loc })); }
  catch (e) { console.log(`  ❌ ${s.company} — ${s.title}: ${e.message}`); continue; }
  scored.push({ ...s, ...result, text });
  console.log(`  ${parseFloat(result.score) >= 4.0 ? '🟢' : '⚪'} ${result.score}/5  ${s.company} — ${result.role}  [${result.location_verdict}]`);
}
scored.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

// Auto-write reports + TSVs for >=4.0, then merge once.
if (doWrite) {
  const today = onDate || new Date().toISOString().split('T')[0];
  let num = parseInt(nextReportNumber(), 10);
  let written = 0;
  for (const s of scored.filter(x => parseFloat(x.score) >= 4.0)) {
    const n = String(num++).padStart(3, '0');
    const slug = slugify(s.company + '-' + s.role);
    const fn = `${n}-${slug}-${today}.md`;
    writeFileSync(join(REPORTS_DIR, fn), buildReportMarkdown({ result: s, text: s.text, url: s.url, locVerdict: s.loc, date: today }), 'utf-8');
    const note = `Auto-eval (OpenRouter ${DEFAULT_MODEL}): ${s.archetype}; loc:${s.location_verdict}; ${s.cg.note}`.replace(/[\t\n]/g, ' ').slice(0, 200);
    writeFileSync(join(ROOT, 'batch/tracker-additions', `${n}-${slug}.tsv`),
      `${n}\t${today}\t${s.company}\t${s.role}\tEvaluated\t${s.score}/5\t❌\t[${n}](reports/${fn})\t${note}\n`, 'utf-8');
    written++;
    console.log(`  📝 report ${n} + TSV: ${s.company} — ${s.role} (${s.score})`);
  }
  if (written) { try { execFileSync('node', [join(ROOT, 'merge-tracker.mjs')], { cwd: ROOT, stdio: 'inherit' }); } catch (e) { console.error('  merge failed:', e.message); } }
}

// Backfill digest scores.
if ((updateDigest || doWrite) && existsSync(DIGEST)) {
  try {
    const d = JSON.parse(readFileSync(DIGEST, 'utf-8'));
    for (const j of d.jobs || []) { const hit = scored.find(s => s.url === j.url); if (hit) j.score = parseFloat(hit.score); }
    writeFileSync(DIGEST, JSON.stringify(d, null, 2));
    console.log(`📝 Backfilled scores into data/last-digest.json`);
  } catch (e) { console.error('digest backfill failed:', e.message); }
}

const apply = scored.filter(s => parseFloat(s.score) >= 4.0);
console.log(`\n🎯 ${apply.length} role(s) ≥ 4.0:`);
for (const s of apply) console.log(`   ${s.score}  ${s.company} — ${s.role}  ${s.url}`);

if (doWrite) await telegramAlert(scored);
console.log('');
