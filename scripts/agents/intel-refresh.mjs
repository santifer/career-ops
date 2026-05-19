#!/usr/bin/env node
/**
 * scripts/agents/intel-refresh.mjs — Intel-refresh agent.
 *
 * Mitchell · ALPHA overnight haul · 2026-05-19.
 *
 * Fills 4 cache slots for one apply-now row (or every row when --all):
 *   1. hm-intel        — data/hm-intel/<slug>.json   (HM + recruiter + comp + gaps)
 *   2. toxicity        — data/company-toxicity-cache/<companySlug>.json
 *   3. strategy-ceiling — data/strategy-ceiling/<num>-<metric>.json (per-metric advice)
 *   4. positioning     — data/positioning-cache/<num>.json (council-generated)
 *
 * Cache TTL: 3 days. Resumable via data/intel-refresh-state.json.
 * Concurrency: serial per slot inside a row (sequencer in caller); rate-limit
 *   backoff handled by callCouncil internally.
 *
 * CLI:
 *   node scripts/agents/intel-refresh.mjs --row 044
 *   node scripts/agents/intel-refresh.mjs --row 044 --slots hm-intel,toxicity
 *   node scripts/agents/intel-refresh.mjs --all
 *   node scripts/agents/intel-refresh.mjs --all --slots positioning
 *
 * Each refresh emits NDJSON progress to stderr so the dashboard SSE wrapper
 * can stream it.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* dotenv optional */ }

import { callCouncil } from '../../lib/council.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const TTL_MS = 3 * 24 * 60 * 60 * 1000;
const VALID_SLOTS = ['hm-intel', 'toxicity', 'strategy-ceiling', 'positioning'];
const SLOT_METRICS = ['alignment', 'interview-likelihood', 'hm-noticing'];
const STATE_PATH = join(ROOT, 'data', 'intel-refresh-state.json');

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function emit(obj) {
  try { process.stderr.write(JSON.stringify({ t: new Date().toISOString(), ...obj }) + '\n'); } catch (_) {}
}

function readJsonSafe(path) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : null; } catch { return null; }
}

function isCacheFresh(path, ttlMs = TTL_MS) {
  if (!existsSync(path)) return false;
  try { return Date.now() - statSync(path).mtimeMs < ttlMs; } catch { return false; }
}

function loadState() {
  return readJsonSafe(STATE_PATH) || { rows: {}, last_run: null };
}

function saveState(state) {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (_) { /* */ }
}

function extractJson(c) {
  const t = String(c || '').trim();
  if (t.startsWith('{')) { try { return JSON.parse(t); } catch (_) {} }
  const fenced = c.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const s = c.indexOf('{'); const e = c.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(c.slice(s, e + 1)); } catch (_) {} }
  return null;
}

/* -------- SLOT 1: hm-intel — shell out to the existing researcher script -------- */
async function refreshHmIntel(row, opts = {}) {
  const slug = `${slugify(row.company)}-${slugify(row.role)}`;
  const target = join(ROOT, 'data', 'hm-intel', `${slug}.json`);
  if (!opts.force && isCacheFresh(target)) {
    emit({ slot: 'hm-intel', row: row.num, cache: 'hit', path: target });
    return { ok: true, cache: 'hit', path: target };
  }
  // The existing hiring-manager-research.mjs script handles the full multi-LLM
  // research pipeline. Shell out to it with --row so it writes the canonical
  // cache file. We do NOT replicate its logic here — that script is the source
  // of truth for hm-intel research.
  emit({ slot: 'hm-intel', row: row.num, step: 'starting-research', no_skip_deep: true });
  const { spawnSync } = await import('child_process');
  const args = [join(ROOT, 'scripts', 'hiring-manager-research.mjs'), '--role', String(row.num), '--no-skip-deep'];
  const result = spawnSync('node', args, { cwd: ROOT, stdio: 'inherit', env: process.env, timeout: 1200_000 });
  const ok = result.status === 0;
  emit({ slot: 'hm-intel', row: row.num, step: 'research-done', exit_code: result.status, path: target });
  return { ok, exit_code: result.status, path: target };
}

/* -------- SLOT 2: toxicity composite -------- */
async function refreshToxicity(row, opts = {}) {
  const companySlug = slugify(row.company);
  const target = join(ROOT, 'data', 'company-toxicity-cache', `${companySlug}.json`);
  mkdirSync(dirname(target), { recursive: true });
  if (!opts.force && isCacheFresh(target)) {
    emit({ slot: 'toxicity', company: row.company, cache: 'hit', path: target });
    return { ok: true, cache: 'hit', path: target };
  }

  emit({ slot: 'toxicity', company: row.company, step: 'researching' });
  const prompt = [
    `# Task — toxicity research for ${row.company}`,
    `Pull employee + ex-employee sentiment from the last 90 days. Sources: Glassdoor, Blind, Reddit r/cscareerquestions, Levels.fyi forums, LinkedIn employee posts, X mentions.`,
    `For each signal, quote the EXACT excerpt (≤200 chars), cite the URL, give a verdict (good/neutral/concerning/blocker).`,
    ``,
    `Return STRICT JSON:`,
    `{`,
    `  "company": "${row.company}",`,
    `  "as_of": "ISO date",`,
    `  "signals": [{ "source": "glassdoor|blind|reddit|levels|linkedin|x", "excerpt": "...", "url": "...", "verdict": "good|neutral|concerning|blocker", "topic": "comp|wlb|management|tech|culture|reorg" }],`,
    `  "composite_score": 0.0,`,
    `  "composite_band": "healthy|mixed|caution|avoid",`,
    `  "drivers": ["1-line summary of the top 3 drivers"],`,
    `  "blockers": ["any single signal that should kill the application by itself"]`,
    `}`,
    `Only include signals where you have a real URL. Never invent quotes.`,
  ].join('\n');

  let cost = 0;
  let council;
  try {
    council = await callCouncil({
      prompt,
      models: ['perplexity:sonar-deep-research', 'xai:grok-4-x-search'],
      opts: { maxTokens: 4000 },
    });
    cost = council.report?.totalCost || 0;
  } catch (e) {
    emit({ slot: 'toxicity', company: row.company, error: String(e.message || e) });
    return { ok: false, error: String(e.message || e) };
  }

  // Merge signals across the two models
  const allSignals = [];
  let composite_score = null;
  let composite_band = null;
  for (const r of council.results || []) {
    if (r.error || !r.content) continue;
    const parsed = extractJson(r.content);
    if (!parsed) continue;
    if (Array.isArray(parsed.signals)) allSignals.push(...parsed.signals);
    if (typeof parsed.composite_score === 'number') composite_score = parsed.composite_score;
    if (parsed.composite_band) composite_band = parsed.composite_band;
  }

  const cache = {
    company: row.company,
    company_slug: companySlug,
    as_of: new Date().toISOString(),
    signals: allSignals,
    composite_score,
    composite_band,
    blockers: allSignals.filter(s => s.verdict === 'blocker'),
    drivers: [...new Set(allSignals.map(s => s.topic).filter(Boolean))].slice(0, 5),
    meta: { cost_usd: cost, models_responded: (council.results || []).filter(r => !r.error).map(r => r.model) },
  };
  writeFileSync(target, JSON.stringify(cache, null, 2), 'utf-8');
  emit({ slot: 'toxicity', company: row.company, step: 'done', signals_count: allSignals.length, composite_band, cost_usd: cost });
  return { ok: true, cache: 'miss', path: target, cost_usd: cost };
}

/* -------- SLOT 3: strategy-ceiling — per-metric per-row -------- */
async function refreshStrategyCeiling(row, opts = {}) {
  const padded = String(row.num).padStart(3, '0');
  const cvText = existsSync(join(ROOT, 'cv.md')) ? readFileSync(join(ROOT, 'cv.md'), 'utf-8').slice(0, 5000) : '';
  const results = {};
  let totalCost = 0;
  for (const metric of SLOT_METRICS) {
    const target = join(ROOT, 'data', 'strategy-ceiling', `${padded}-${metric}.json`);
    mkdirSync(dirname(target), { recursive: true });
    if (!opts.force && isCacheFresh(target)) {
      results[metric] = { cache: 'hit', path: target };
      emit({ slot: 'strategy-ceiling', metric, row: row.num, cache: 'hit' });
      continue;
    }
    emit({ slot: 'strategy-ceiling', metric, row: row.num, step: 'computing' });
    const prompt = [
      `# Task — strategy-ceiling for metric "${metric}" — ${row.company} ${row.role}`,
      `Mitchell is targeting this role. Given the JD + his cv.md + HM intel, what is Mitchell's CURRENT ceiling on ${metric}, and what concrete moves would raise it 5-15 points before he applies?`,
      ``,
      `## cv.md (trimmed)`,
      cvText,
      ``,
      `## Role`,
      `${row.company} — ${row.role}`,
      ``,
      `Return STRICT JSON:`,
      `{`,
      `  "metric": "${metric}",`,
      `  "current_estimate_pct": 0,`,
      `  "ceiling_estimate_pct": 0,`,
      `  "ceiling_lift_moves": [{ "move": "...", "lift_pct": 5, "effort": "low|medium|high", "evidence_citation": "cv.md:NN or hm-intel field" }],`,
      `  "blockers": ["specific blocker that caps the ceiling"],`,
      `  "next_action": "the single highest-leverage move this week"`,
      `}`,
    ].join('\n');

    let council;
    try {
      council = await callCouncil({ prompt, models: ['anthropic:claude-sonnet-4-6', 'openai:gpt-5'], opts: { maxTokens: 2000 } });
      totalCost += council.report?.totalCost || 0;
    } catch (e) {
      emit({ slot: 'strategy-ceiling', metric, error: String(e.message || e) });
      results[metric] = { ok: false, error: String(e.message || e) };
      continue;
    }
    const parses = (council.results || []).map(r => (r.content ? extractJson(r.content) : null)).filter(Boolean);
    // Take the parse with the most ceiling_lift_moves (richest)
    const best = parses.sort((a, b) => ((b.ceiling_lift_moves || []).length - (a.ceiling_lift_moves || []).length))[0] || {};
    const cache = {
      metric, row: row.num, company: row.company, role: row.role,
      as_of: new Date().toISOString(),
      ...best,
      meta: { models_responded: (council.results || []).filter(r => !r.error).map(r => r.model), cost_usd: council.report?.totalCost || 0 },
    };
    writeFileSync(target, JSON.stringify(cache, null, 2), 'utf-8');
    results[metric] = { cache: 'miss', path: target, lift_moves: (best.ceiling_lift_moves || []).length };
    emit({ slot: 'strategy-ceiling', metric, row: row.num, step: 'done', lift_moves: (best.ceiling_lift_moves || []).length });
  }
  return { ok: true, per_metric: results, cost_usd: totalCost };
}

/* -------- SLOT 4: positioning -------- */
async function refreshPositioning(row, opts = {}) {
  const padded = String(row.num).padStart(3, '0');
  const target = join(ROOT, 'data', 'positioning-cache', `${padded}.json`);
  mkdirSync(dirname(target), { recursive: true });
  if (!opts.force && isCacheFresh(target)) {
    emit({ slot: 'positioning', row: row.num, cache: 'hit', path: target });
    return { ok: true, cache: 'hit', path: target };
  }
  emit({ slot: 'positioning', row: row.num, step: 'asking-council' });

  const hmIntelPath = join(ROOT, 'data', 'hm-intel', `${slugify(row.company)}-${slugify(row.role)}.json`);
  const hmIntel = readJsonSafe(hmIntelPath) || {};
  const cvText = existsSync(join(ROOT, 'cv.md')) ? readFileSync(join(ROOT, 'cv.md'), 'utf-8').slice(0, 5000) : '';

  const prompt = [
    `# Task — strongest 3-sentence positioning for Mitchell at ${row.company} — ${row.role}`,
    `Given Mitchell's cv.md, the JD, and HM intel below, what are the strongest 3 sentences that frame Mitchell's positioning for THIS role? Position him as: (1) the must-meet candidate the HM has on their short list, (2) a 90-day net positive, (3) someone who closes a specific team gap.`,
    ``,
    `## cv.md`,
    cvText,
    ``,
    `## HM intel`,
    JSON.stringify(hmIntel).slice(0, 4000),
    ``,
    `Return STRICT JSON:`,
    `{`,
    `  "positioning_three_sentences": ["sentence 1", "sentence 2", "sentence 3"],`,
    `  "positioning_one_sentence": "the strongest single positioning sentence — for LinkedIn DM use",`,
    `  "anti_positioning": ["framings to AVOID — would hurt the application"],`,
    `  "evidence_citations": ["cv.md:NN — what proof point each sentence anchors to"],`,
    `  "warnings": ["any concern about overclaim or stretch"]`,
    `}`,
  ].join('\n');

  let council, cost = 0;
  try {
    council = await callCouncil({
      prompt,
      models: ['anthropic:claude-sonnet-4-6', 'openai:gpt-5', 'google:gemini-2.5-pro', 'perplexity:sonar-pro'],
      opts: { maxTokens: 2500 },
    });
    cost = council.report?.totalCost || 0;
  } catch (e) {
    emit({ slot: 'positioning', error: String(e.message || e) });
    return { ok: false, error: String(e.message || e) };
  }

  // Adjudicate via Opus
  const allParses = (council.results || []).map(r => (r.content ? extractJson(r.content) : null)).filter(Boolean);
  const adjPrompt = [
    `You are the Opus dealbreaker layer. Adjudicate the council's positioning candidates for Mitchell at ${row.company} — ${row.role}.`,
    `Per-model responses: ${JSON.stringify(allParses).slice(0, 5000)}`,
    `cv.md (trimmed): ${cvText.slice(0, 2500)}`,
    ``,
    `Return STRICT JSON with the FINAL positioning Mitchell should use:`,
    `{ "positioning_three_sentences": [...], "positioning_one_sentence": "...", "anti_positioning": [...], "evidence_citations": [...], "warnings": [...], "dealbreaker_notes": "..." }`,
    ``,
    `Be ruthless. Prune anything no model could ground in cv.md / HM intel.`,
  ].join('\n');

  let final = allParses[0] || {};
  try {
    const adj = await callCouncil({ prompt: adjPrompt, models: ['anthropic:claude-opus-4-7'], opts: { maxTokens: 2000 } });
    cost += adj.report?.totalCost || 0;
    const adjParsed = adj.results?.[0]?.content ? extractJson(adj.results[0].content) : null;
    if (adjParsed) final = adjParsed;
  } catch (e) {
    emit({ slot: 'positioning', adj_error: String(e.message || e) });
  }

  const cache = {
    row: row.num, company: row.company, role: row.role,
    as_of: new Date().toISOString(),
    ...final,
    meta: { models_responded: (council.results || []).filter(r => !r.error).map(r => r.model), cost_usd: cost },
  };
  writeFileSync(target, JSON.stringify(cache, null, 2), 'utf-8');
  emit({ slot: 'positioning', row: row.num, step: 'done', cost_usd: cost });
  return { ok: true, cache: 'miss', path: target, cost_usd: cost };
}

/* -------- Main orchestrator -------- */
async function refreshRow(row, slots, opts = {}) {
  const out = {};
  if (slots.includes('hm-intel') || slots.includes('all')) out['hm-intel'] = await refreshHmIntel(row, opts);
  if (slots.includes('toxicity') || slots.includes('all')) out.toxicity = await refreshToxicity(row, opts);
  if (slots.includes('strategy-ceiling') || slots.includes('strategy') || slots.includes('all')) out['strategy-ceiling'] = await refreshStrategyCeiling(row, opts);
  if (slots.includes('positioning') || slots.includes('all')) out.positioning = await refreshPositioning(row, opts);
  return out;
}

export async function runIntelRefresh({ row, rowId, slots = ['all'], all = false, opts = {} } = {}) {
  const t0 = Date.now();
  const state = loadState();

  const apqPath = join(ROOT, 'data', 'apply-now-queue.json');
  if (!existsSync(apqPath)) return { ok: false, error: 'apply-now-queue.json missing' };
  const apq = JSON.parse(readFileSync(apqPath, 'utf-8'));
  const ranked = apq.ranked || [];

  let targetRows;
  if (all) {
    targetRows = ranked.filter(r => r && r.num);
  } else {
    const id = Number(rowId || row);
    targetRows = ranked.filter(r => r && Number(r.num) === id);
    if (!targetRows.length) return { ok: false, error: `row ${rowId || row} not in apply-now-queue` };
  }

  emit({ phase: 'init', rows: targetRows.length, slots });

  const results = {};
  for (const r of targetRows) {
    emit({ phase: 'row-start', row: r.num, company: r.company, role: r.role });
    try {
      results[r.num] = await refreshRow(r, slots, opts);
      state.rows[r.num] = { last_refresh: new Date().toISOString(), slots_done: Object.keys(results[r.num]) };
      saveState(state);
    } catch (e) {
      results[r.num] = { error: String(e.message || e) };
      emit({ phase: 'row-error', row: r.num, error: String(e.message || e) });
    }
    emit({ phase: 'row-done', row: r.num });
  }

  state.last_run = new Date().toISOString();
  saveState(state);

  const summary = { ok: true, duration_ms: Date.now() - t0, rows_processed: targetRows.length, results };
  emit({ phase: 'complete', ...summary, results: undefined });
  return summary;
}

/* CLI */
async function cliMain() {
  const args = process.argv.slice(2);
  function arg(f, fb) { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : fb; }
  function flag(f) { return args.includes(f); }
  const row = arg('--row', null);
  const all = flag('--all');
  const force = flag('--force');
  const slotsArg = arg('--slots', 'all');
  const slots = slotsArg.split(',').map(s => s.trim()).filter(Boolean);
  if (!all && !row) {
    process.stderr.write('Usage: node scripts/agents/intel-refresh.mjs --row <N>  OR  --all\n');
    process.exit(2);
  }
  const out = await runIntelRefresh({ row, all, slots, opts: { force } });
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(out.ok ? 0 : 1);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) cliMain().catch(err => { process.stderr.write(`FATAL: ${err.stack || err}\n`); process.exit(3); });
