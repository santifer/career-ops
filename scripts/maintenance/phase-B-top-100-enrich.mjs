#!/usr/bin/env node
/**
 * scripts/maintenance/phase-B-top-100-enrich.mjs — One-off priority batch.
 *
 * Phase B of the 2026-05-19 contacts month-1 launch. Scores every contact
 * via lib/contact-priority-scorer.mjs, picks top-100 unenriched, fires the
 * 3-way council enricher per contact, records every write to
 * data/refresh-master-state.json so the Day-30 audit can correlate signals
 * with outcomes.
 *
 * Cost cap: $80 (above brief's $60 estimate for safety headroom).
 * Per-contact cost: ~$0.20–0.50 (sonar-pro + sonnet + grok-X).
 *
 * No dashboard rebuild until all 100 contacts complete — keeps the
 * orchestrator process from racing BRAVO's parallel build-dashboard edits.
 *
 * Resumable: if interrupted, re-run — already-enriched contacts skip.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* */ }

import { loadAndRank } from '../../lib/contact-priority-scorer.mjs';
import { runContactEnrichment } from '../agents/network-enricher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const STATE_PATH = join(ROOT, 'data/refresh-master-state.json');
const LOG_DIR = join(ROOT, 'data/logs');
const TODAY = new Date().toISOString().slice(0, 10);
const LOG_PATH = join(LOG_DIR, `phase-B-top-100-${TODAY}.log`);

const argv = process.argv.slice(2);
function flagInt(name, def) {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = parseInt(argv[i + 1], 10);
  return Number.isFinite(v) ? v : def;
}
function flagFloat(name, def) {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = parseFloat(argv[i + 1]);
  return Number.isFinite(v) ? v : def;
}
const TOP_N = flagInt('--top', 100);
const COST_CAP = flagFloat('--cost-cap', 80);
const DRY_RUN = argv.includes('--dry-run');
const SKIP_SCORED_TOP = flagInt('--skip', 0);

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

function ts() { return new Date().toISOString(); }
function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_PATH, line + '\n'); } catch { /* */ }
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { spend_window_30d: [], refresh_history: {} };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return { spend_window_30d: [], refresh_history: {} }; }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function main() {
  log(`═══ phase-B-top-100-enrich start (TOP_N=${TOP_N}, COST_CAP=$${COST_CAP}, SKIP=${SKIP_SCORED_TOP}, DRY_RUN=${DRY_RUN}) ═══`);

  const ranking = loadAndRank({ limit: TOP_N + SKIP_SCORED_TOP });
  if (ranking.isPaused) {
    log(`HALT: pause_after_date=${ranking.pauseAfter} reached; auto-paused.`);
    process.exit(2);
  }

  const candidates = ranking.ranked.slice(SKIP_SCORED_TOP, SKIP_SCORED_TOP + TOP_N);
  log(`scoring complete: ${ranking.ranked.length} ranked, taking top-${TOP_N} after skip-${SKIP_SCORED_TOP}`);
  log(`top-5 preview:`);
  for (const r of candidates.slice(0, 5)) {
    log(`  ${r.score.toFixed(3)} ${r.tier_boosted ? '★' : ' '} ${r.contact.name} ${r.contact.company} ${r.contact.position?.slice(0, 40) || ''}`);
  }

  const state = loadState();
  state.refresh_history = state.refresh_history || {};
  state.refresh_history.contact_enrichment = state.refresh_history.contact_enrichment || {};

  // Filter out already-enriched (cache file present, not stale beyond 30d)
  const cacheDir = join(ROOT, 'data/contact-enrichment-cache');
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const ineligible = [];
  const eligible = [];
  for (const r of candidates) {
    const fp = join(cacheDir, `${r.contact.id}.json`);
    if (existsSync(fp)) {
      ineligible.push({ id: r.contact.id, reason: 'cached' });
    } else {
      eligible.push(r);
    }
  }
  log(`eligible: ${eligible.length} (${ineligible.length} already cached)`);

  if (DRY_RUN) {
    log(`DRY-RUN — would enrich ${eligible.length} contacts, projected spend ~$${(eligible.length * 0.20).toFixed(2)}`);
    return;
  }

  let spent = 0;
  let ok = 0;
  let fail = 0;
  let verifierFail = 0;
  let i = 0;
  for (const r of eligible) {
    i++;
    if (spent >= COST_CAP) {
      log(`COST CAP REACHED ($${spent.toFixed(2)} >= $${COST_CAP}); halting at ${i - 1}/${eligible.length}`);
      break;
    }
    log(`${i}/${eligible.length}  → enriching ${r.contact.name} (${r.contact.id}) priority=${r.score.toFixed(2)}…`);
    let result;
    try {
      result = await runContactEnrichment(r.contact.id, {
        priorityScore: r.score,
        signals: r.signals,
        refresh: false,
      });
    } catch (e) {
      log(`  EXCEPTION: ${e.message.slice(0, 200)}`);
      fail++;
      state.refresh_history.contact_enrichment[r.contact.id] = {
        lastAttemptedAt: TODAY,
        result: 'EXCEPTION',
        error: e.message.slice(0, 200),
        priority_score: r.score,
      };
      continue;
    }
    if (!result.ok) {
      log(`  FAIL: ${result.error || 'no_data'}`);
      fail++;
      state.refresh_history.contact_enrichment[r.contact.id] = {
        lastAttemptedAt: TODAY,
        result: 'ERROR',
        error: (result.error || '').slice(0, 200),
        priority_score: r.score,
      };
    } else {
      ok++;
      if (!result.verifier_passed) verifierFail++;
      spent += result.cost_usd || 0;
      log(`  OK (verifier=${result.verifier_passed ? 'PASS' : 'FAIL'}, cost=$${(result.cost_usd || 0).toFixed(3)}, citations=${(result.source_urls || []).length}, fields=${result.fields_populated || 0})`);
      state.spend_window_30d = state.spend_window_30d || [];
      state.spend_window_30d.push({
        ts: ts(),
        usd: result.cost_usd || 0,
        cache: 'contact_enrichment',
        key: r.contact.id,
        provider: 'perplexity+sonnet+grok-X',
      });
      state.refresh_history.contact_enrichment[r.contact.id] = {
        lastRefreshedAt: ts(),
        lastAttemptedAt: TODAY,
        result: 'OK',
        verifier_passed: result.verifier_passed,
        citations: (result.source_urls || []).length,
        fields_populated: result.fields_populated || 0,
        priority_score: r.score,
        signals: r.signals,
        cost_usd: result.cost_usd || 0,
      };
    }
    // Persist state every 10 contacts (resumability)
    if (i % 10 === 0) saveState(state);
  }
  saveState(state);

  log(`═══ phase-B complete ═══`);
  log(`  enriched: ${ok}/${eligible.length}`);
  log(`  failed:   ${fail}`);
  log(`  verifier fail: ${verifierFail}`);
  log(`  spent:    $${spent.toFixed(2)} / cap $${COST_CAP}`);
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
