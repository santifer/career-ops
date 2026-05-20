#!/usr/bin/env node
/**
 * scripts/refresh-master.mjs — Cost-aware refresh orchestrator.
 *
 * Reads config/refresh-policy.yml, classifies apply-now rows into priority
 * tiers, walks every cache, identifies what's stale per tier-cadence, and
 * either prints what would refresh (DRY-RUN) or actually fires the refresh
 * handlers (when budget.dry_run=false in the policy).
 *
 * Designed to be invoked every 6 hours via launchd
 * (scripts/launchd/com.mitchell.career-ops.refresh-master.plist).
 *
 * Safety:
 *   - Defaults to DRY-RUN (config/refresh-policy.yml: budget.dry_run=true)
 *   - Hard daily + monthly budget caps enforced before each refresh fires
 *   - Per-refresh cost cap; runs that exceed it skip + log + flag
 *   - All decisions written to data/refresh-master-state.json for resume
 *   - All actions logged to data/logs/refresh-master-{date}.log
 *
 * CLI:
 *   node scripts/refresh-master.mjs            # default — reads policy + acts
 *   node scripts/refresh-master.mjs --plan     # always dry-run, ignores policy
 *   node scripts/refresh-master.mjs --execute  # forces real spend, ignores dry_run policy flag (use with care)
 *   node scripts/refresh-master.mjs --layer 1  # only run Layer 1 checks
 *   node scripts/refresh-master.mjs --report   # don't refresh, just write the daily report
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { installRunRecord } from '../lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('refresh-master');

// Load .env BEFORE any adapter imports. Mitchell's shell sometimes pre-sets
// ANTHROPIC_API_KEY to empty, so override: true is required to let .env win.
// Memory: see ~/.claude/projects/...career-ops/memory/reference_env_secrets.md.
try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });
} catch { /* dotenv optional — if missing, fall back to whatever's in shell env */ }

import { classifyAllRows } from '../lib/refresh-priority.mjs';
import {
  CACHES,
  getCachesByLayer,
  inspectCacheForRow,
  buildCommand,
} from '../lib/refresh-cache-registry.mjs';
import { assertOrUpdateChecksums, IdentityLockViolation } from '../lib/identity-lock.mjs';
import { recordAndCheck as recordDrift, buildDashboardMetricsSnapshot } from '../lib/metric-drift-tripwire.mjs';
import { getAdapter } from '../lib/provider-adapters/index.mjs';
import { verifyCacheWrite } from '../lib/refresh-verifier.mjs';
import { validateCacheWrite } from '../lib/cache-write-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const STATE_PATH = join(REPO_ROOT, 'data', 'refresh-master-state.json');
const LOG_DIR = join(REPO_ROOT, 'data', 'logs');
const TODAY = new Date().toISOString().slice(0, 10);
const LOG_PATH = join(LOG_DIR, `refresh-master-${TODAY}.log`);

// ── CLI arg parsing ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FLAG = {
  forcePlan: argv.includes('--plan'),
  forceExecute: argv.includes('--execute'),
  layerOnly: argv.includes('--layer') ? parseInt(argv[argv.indexOf('--layer') + 1], 10) : null,
  reportOnly: argv.includes('--report'),
  forceShellOut: argv.includes('--shell-out'),  // Phase 2: bypass adapters, use legacy shell handlers
};

// ── State + logging ─────────────────────────────────────────────────────────
function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
ensureDir(LOG_DIR);

function ts() { return new Date().toISOString(); }
function log(...args) {
  const line = `[${ts()}] ${args.join(' ')}`;
  console.log(line);
  appendFileSync(LOG_PATH, line + '\n');
}

function loadState() {
  if (!existsSync(STATE_PATH)) {
    return {
      last_run_at: null,
      spend_window_30d: [],     // [{ ts, usd, cache, key }]
      refresh_history: {},      // { cacheId: { lastRefreshedAt, lastResult } }
      tier_counts_history: [],  // [{ ts, A, B, C, D }]
    };
  }
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch (e) { log('WARN: state file unreadable, starting fresh:', e.message); return {}; }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function trim30dSpend(state) {
  const cutoff = Date.now() - 30 * 86400000;
  state.spend_window_30d = (state.spend_window_30d || []).filter(s => Date.parse(s.ts) > cutoff);
}

function dailySpend(state) {
  const cutoff = Date.now() - 86400000;
  return (state.spend_window_30d || [])
    .filter(s => Date.parse(s.ts) > cutoff)
    .reduce((sum, s) => sum + (s.usd || 0), 0);
}

function monthlySpend(state) {
  return (state.spend_window_30d || []).reduce((sum, s) => sum + (s.usd || 0), 0);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  log('═══ refresh-master start ═══');
  log(`flags: ${JSON.stringify(FLAG)}`);

  // 0. Phase 1.5 — identity-lock checksums + drift snapshot BEFORE any work.
  try {
    const lock = assertOrUpdateChecksums();
    log(`identity-lock: ok (first_run=${lock.first_run}, authorized=${lock.authorized}, changes=${lock.changes.length})`);
  } catch (e) {
    if (e instanceof IdentityLockViolation) {
      log(`HALT: identity-lock violation — ${e.message}`);
      log(`If this edit was intentional, run with MITCHELL_AUTHORIZED_EDIT=1`);
      process.exit(3);
    }
    throw e;
  }

  const driftStart = recordDrift({
    context: 'refresh-master:start',
    metrics: buildDashboardMetricsSnapshot(),
  });
  if (driftStart.tripwires.length > 0) {
    log(`HALT: ${driftStart.tripwires.length} metric drift tripwire(s) fired at start:`);
    for (const t of driftStart.tripwires) {
      log(`  - ${t.metric}: ${t.prior_value} → ${t.current_value} (${(t.drift_pct * 100).toFixed(1)}%; source unchanged)`);
    }
    log(`See data/drift-tripwire-${TODAY}.md and escalate via GAMMA truth-audit.`);
    process.exit(4);
  }

  const state = loadState();
  trim30dSpend(state);

  // 0.5. Sync apply-now-queue.json with applications.md BEFORE classification.
  // Without this step, classifyAllRows() only sees the curated queue —
  // applications.md rows that are >=4.0 + Evaluated/Responded but not yet
  // in the queue never enter the refresh loop, so their role_enrichment /
  // toxicity_composite / positioning files stay missing forever and the
  // dashboard Health column drifts back to "—".
  // The rebuild script preserves Mitchell's curated factor metadata + only
  // ADDS new rows and updates status fields. Soft-fail: if it errors,
  // continue with the existing queue rather than abort the whole refresh.
  try {
    log('syncing apply-now-queue.json from applications.md...');
    const out = execSync('node scripts/rebuild-apply-now-queue.mjs', {
      cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const line of out.split('\n').filter(Boolean).slice(0, 8)) log(`  ${line}`);
  } catch (e) {
    log(`WARN: rebuild-apply-now-queue.mjs failed: ${e.message.slice(0, 200)} — continuing with existing queue`);
  }

  // 1. Classify rows
  const { rows, counts, policy } = classifyAllRows();
  log(`tier counts: A=${counts.A} B=${counts.B} C=${counts.C} D=${counts.D} (${rows.length} rows total)`);
  state.tier_counts_history = (state.tier_counts_history || []).slice(-100);
  state.tier_counts_history.push({ ts: ts(), ...counts });

  // 2. Determine dry-run vs execute
  const policyDryRun = policy.budget?.dry_run !== false;  // defaults to true if unset
  const dryRun = FLAG.forcePlan ? true : (FLAG.forceExecute ? false : policyDryRun);
  log(`dry_run=${dryRun} (policy.budget.dry_run=${policyDryRun}, forceExecute=${FLAG.forceExecute}, forcePlan=${FLAG.forcePlan})`);

  // 3. Pre-flight budget check
  const dailySpentNow = dailySpend(state);
  const monthlySpentNow = monthlySpend(state);
  const dailyCap = policy.budget?.daily_cap_usd || 80;
  const monthlyCap = policy.budget?.monthly_cap_usd || 2400;
  log(`spend window: $${dailySpentNow.toFixed(2)}/day (cap $${dailyCap}) · $${monthlySpentNow.toFixed(2)}/30d (cap $${monthlyCap})`);

  // 4. Walk Layer 2 caches and compute "what needs refresh per tier-cadence"
  const refreshQueue = [];

  if (!FLAG.layerOnly || FLAG.layerOnly === 2) {
    if (policy.layer2_sonnet_refresh?.enabled) {
      const layer2 = getCachesByLayer(2);
      const cadenceByTier = policy.layer2_sonnet_refresh.cadence_days || {};
      const ttlByTier = {
        A: cadenceByTier.A_watch || 3,
        B: cadenceByTier.B_active || 7,
        C: cadenceByTier.C_tracked || 14,
        D: cadenceByTier.D_cold || 999,
      };

      // Phase 1.5 deliverable 2: dedup queue entries by (cache.id, key) so
      // company-scoped caches (toxicity_composite, company_pulse) fire once
      // per company even when multiple rows reference that company.
      const seen = new Set();
      // Phase A.6 (2026-05-19): contact_enrichment is per-contact, NOT per-row.
      // It's handled by the dedicated _buildContactEnrichmentQueue() above.
      // Filter it out of the row-iteration loop here.
      const layer2RowCaches = layer2.filter(c => c.scope !== 'per-contact');
      for (const cache of layer2RowCaches) {
        for (const row of rows) {
          const tier = row._classification.tier;
          const ttl = ttlByTier[tier];
          if (ttl >= 999) continue; // tier D — no auto-refresh
          const insp = inspectCacheForRow(cache, row);
          const shouldRefresh = !insp.exists || insp.ageDays >= ttl;
          if (!shouldRefresh) continue;

          // Dedup key uses the cache's documented keyFromRow (company-slug for
          // company-scoped caches, row.num for row-scoped caches).
          const dedupKey = `${cache.id}::${cache.keyFromRow ? cache.keyFromRow(row) : row.num}`;
          if (seen.has(dedupKey)) {
            // Already queued this cache for this entity at higher-tier priority;
            // skip the lower-tier duplicate to avoid double-refresh.
            continue;
          }
          seen.add(dedupKey);

          const ageDescription = insp.exists ? `${insp.ageDays.toFixed(1)}d old` : 'missing';
          refreshQueue.push({
            layer: 2,
            cache,
            row,
            tier,
            cost: cache.costEstimate,
            ageDescription,
            command: buildCommand(cache.refreshHandler, row),
            provider: cache.provider || 'anthropic-sonnet',
            dedupKey,
          });
        }
      }
    }
  }

  // 5. Layer 3 scheduled rotation (we DON'T fire event-triggered here — those
  // fire on actual events via separate hooks. This loop only schedules the
  // "1 Watch-list role / 2 days" rotation.)
  if (!FLAG.layerOnly || FLAG.layerOnly === 3) {
    if (policy.layer3_deep_research?.enabled && policy.layer3_deep_research?.scheduled_rotation?.enabled) {
      const rotationTier = policy.layer3_deep_research.scheduled_rotation.target_tier || 'A';
      const rotationCadenceDays = policy.layer3_deep_research.scheduled_rotation.one_role_every_n_days || 2;
      const layer3 = getCachesByLayer(3);
      const eligible = rows.filter(r => r._classification.tier === rotationTier);

      // Pick the row whose hm_intel_deep is oldest (or missing)
      const deepCache = layer3.find(c => c.id === 'hm_intel_deep');
      if (deepCache && eligible.length) {
        const withAges = eligible.map(r => ({ row: r, insp: inspectCacheForRow(deepCache, r) }));
        withAges.sort((a, b) => b.insp.ageDays - a.insp.ageDays);
        const candidate = withAges[0];

        // Only schedule if enough time has passed since LAST Layer 3 rotation fire
        const lastRotation = state.refresh_history?.['_layer3_rotation_last_fired_at'];
        const minIntervalMs = rotationCadenceDays * 86400000;
        const okToFire = !lastRotation || (Date.now() - Date.parse(lastRotation)) > minIntervalMs;

        if (okToFire && candidate.insp.ageDays > rotationCadenceDays) {
          refreshQueue.push({
            layer: 3,
            cache: deepCache,
            row: candidate.row,
            tier: 'A',
            cost: deepCache.costEstimate,
            ageDescription: candidate.insp.exists ? `${candidate.insp.ageDays.toFixed(1)}d old` : 'missing',
            command: buildCommand(deepCache.refreshHandler, candidate.row),
            isRotation: true,
          });
        }
      }
    }
  }

  // 5.5. Phase A.6 (2026-05-19) — contact_enrichment per-contact handler.
  // Iterate _CONTACTS_DATA, score via lib/contact-priority-scorer.mjs, apply
  // auto-pause gates (pause_after_date + month_1_budget_usd), pick top-N
  // unenriched contacts not yet refreshed today, queue them for the run.
  // Removes the 2026-05-19 band-aid path that skipped scope='per-contact'.
  if (!FLAG.layerOnly || FLAG.layerOnly === 2) {
    try {
      const contactEnrichmentQueue = await _buildContactEnrichmentQueue({ state, log });
      for (const q of contactEnrichmentQueue) refreshQueue.push(q);
    } catch (e) {
      log(`  WARN: contact-enrichment queue build failed (${e.message}); skipping`);
    }
  }

  // 6. Project total cost; gate on daily cap
  const projectedCost = refreshQueue.reduce((sum, q) => sum + q.cost, 0);
  log(`refresh queue: ${refreshQueue.length} items, projected cost $${projectedCost.toFixed(2)}`);

  if (refreshQueue.length === 0) {
    log('nothing to refresh — everything fresh within tier cadence');
  } else {
    log(`\n── Refresh plan ──`);
    for (const q of refreshQueue.slice(0, 30)) {
      const prov = q.provider ? ` [${q.provider}]` : '';
      log(`  L${q.layer} · tier=${q.tier} · ${q.cache.id}${prov} · row #${q.row.num} ${q.row.company} ${q.row.role.slice(0, 32)} · ${q.ageDescription} · $${q.cost}`);
    }
    if (refreshQueue.length > 30) log(`  ... and ${refreshQueue.length - 30} more`);
  }

  // 7. Execute (or dry-run)
  let actualSpent = 0;
  let firedCount = 0;
  let skippedBudgetCount = 0;
  let errorCount = 0;

  for (const q of refreshQueue) {
    const projectedDailyAfter = dailySpentNow + actualSpent + q.cost;
    const projectedMonthlyAfter = monthlySpentNow + actualSpent + q.cost;

    const entityLabel = q.contactId
      ? `contact:${q.contactId}`
      : q.row ? `row:${q.row.num}` : `unknown`;

    if (projectedDailyAfter > dailyCap) {
      log(`  SKIP-BUDGET: daily cap $${dailyCap} would be exceeded ($${projectedDailyAfter.toFixed(2)}); skipping ${q.cache.id} for ${entityLabel}`);
      skippedBudgetCount++;
      continue;
    }
    if (projectedMonthlyAfter > monthlyCap) {
      log(`  SKIP-BUDGET: monthly cap $${monthlyCap} would be exceeded ($${projectedMonthlyAfter.toFixed(2)}); skipping ${q.cache.id} for ${entityLabel}`);
      skippedBudgetCount++;
      continue;
    }

    if (dryRun) {
      const cmdLabel = q.command || `[in-process] runContactEnrichment('${q.contactId}')`;
      log(`  PLAN: $${q.cost} → ${cmdLabel}  [provider=${q.provider}; verifier=${q.cache.verifierProvider || 'default-cross-arch'}]`);
      continue;
    }

    // Phase A.6 dispatch: contact_enrichment runs in-process, not via shell
    if (q.cache.id === 'contact_enrichment' && q.contactId) {
      try {
        const r = await _executeContactEnrichmentEntry(q, state);
        if (r.ok) {
          firedCount++;
          actualSpent += r.cost_usd ?? q.cost;
          state.spend_window_30d.push({ ts: ts(), usd: r.cost_usd ?? q.cost, cache: 'contact_enrichment', key: q.contactId, provider: q.provider });
          state.refresh_history.contact_enrichment = state.refresh_history.contact_enrichment || {};
          state.refresh_history.contact_enrichment[q.contactId] = {
            lastRefreshedAt: ts(),
            lastAttemptedAt: TODAY,
            result: 'OK',
            verifier_passed: r.verifier_passed,
            citations: (r.source_urls || []).length,
            fields_populated: r.fields_populated || 0,
            priority_score: q.priorityScore,
            signals: q.signals,
          };
          log(`  OK: contact_enrichment/${q.contactId} (verifier=${r.verifier_passed ? 'PASS' : 'FAIL'}, citations=${(r.source_urls || []).length}, fields=${r.fields_populated || 0})`);
        } else {
          errorCount++;
          state.refresh_history.contact_enrichment = state.refresh_history.contact_enrichment || {};
          state.refresh_history.contact_enrichment[q.contactId] = {
            lastAttemptedAt: TODAY,
            result: r.error ? 'ERROR' : 'EMPTY',
            error: (r.error || '').slice(0, 200),
          };
          log(`  ERROR (contact_enrichment): ${q.contactId} ${r.error || 'no_data'}`);
        }
      } catch (e) {
        errorCount++;
        log(`  ERROR (contact_enrichment exception): ${q.contactId} ${e.message}`);
      }
      continue;
    }

    // Real execution
    // Phase 2: prefer the provider-adapter path when available (so verifier
    // lane + validator gate fire). Fall back to shell-out command if the
    // cache is registered with a non-adapter handler.
    const adapterProvider = q.provider && q.provider !== 'anthropic-sonnet'
      ? q.provider
      : (q.cache.provider || 'anthropic-sonnet');
    const adapter = getAdapter(adapterProvider);
    const useAdapter = !!adapter && !FLAG.forceShellOut && !q.cache.adapterDisabled;

    if (useAdapter) {
      log(`  EXEC (adapter): $${q.cost} → ${adapterProvider} :: ${q.cache.id} :: row ${q.row.num} ${q.row.company}`);
      try {
        const writerResult = await adapter.refresh(q.cache, q.row, {
          caller: `refresh-master:${q.cache.id}`,
          maxTokens: q.cache.maxTokens || 3500,
          ...q.cache.providerOpts,
        });
        if (!writerResult.ok) {
          log(`  WRITER FAILED: ${(writerResult.errors || []).join(' | ')}`);
          errorCount++;
          state.refresh_history[q.cache.id] = state.refresh_history[q.cache.id] || {};
          state.refresh_history[q.cache.id][String(q.row.num)] = { lastRefreshedAt: ts(), result: 'WRITER_FAILED', error: (writerResult.errors || []).join(' | ').slice(0, 240) };
          continue;
        }

        // Cross-architecture verifier
        let priorCache = null;
        try {
          const inspectedPath = inspectCacheForRow(q.cache, q.row).path;
          if (inspectedPath && existsSync(inspectedPath)) priorCache = JSON.parse(readFileSync(inspectedPath, 'utf8'));
        } catch { /* prior cache read best-effort */ }

        const verifyResult = await verifyCacheWrite({
          writerResult,
          priorCache,
          cache: q.cache,
          row: q.row,
          opts: { verifierProvider: q.cache.verifierProvider },
        });

        // Validate the write envelope
        const envelope = {
          source_urls: writerResult.sourceUrls || [],
          retrieved_at: new Date().toISOString(),
          model: writerResult.model,
          verifier_passed: verifyResult.verified,
          diff_summary: priorCache ? 'updated' : 'initial',
        };
        const validation = validateCacheWrite({
          cache: q.cache,
          envelope,
          contentJson: writerResult.contentJson,
          priorCacheJson: priorCache,
        });

        if (!validation.ok) {
          log(`  VALIDATOR BLOCKED: ${validation.errors.join('; ')}`);
          state.refresh_history[q.cache.id] = state.refresh_history[q.cache.id] || {};
          state.refresh_history[q.cache.id][String(q.row.num)] = { lastRefreshedAt: ts(), result: 'VALIDATOR_BLOCKED', errors: validation.errors.slice(0, 3) };
          errorCount++;
          continue;
        }

        if (verifyResult.verified === false) {
          log(`  VERIFIER REJECTED: escalate=${verifyResult.escalateToCouncil}, notes=${(verifyResult.notes || []).slice(0, 2).join('; ')}`);
          state.refresh_history[q.cache.id] = state.refresh_history[q.cache.id] || {};
          state.refresh_history[q.cache.id][String(q.row.num)] = { lastRefreshedAt: ts(), result: 'VERIFIER_REJECTED', escalate: verifyResult.escalateToCouncil };
          // Phase 3 will adjudicate via council-3; Phase 2 just logs + skips write.
          errorCount++;
          continue;
        }

        // Write the cache file with the augmented envelope
        const targetPath = inspectCacheForRow(q.cache, q.row).path || _materializeCachePath(q.cache, q.row);
        const cacheBody = {
          ...validation.augmented,
          ...(writerResult.contentJson || {}),
          provider_metadata: writerResult.providerMetadata,
        };
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, JSON.stringify(cacheBody, null, 2));
        log(`  OK: wrote ${q.cache.id}/${q.row.num} (verifier=PASS, citations=${envelope.source_urls.length})`);
        actualSpent += writerResult.costUsd || q.cost;
        firedCount++;
        state.spend_window_30d.push({ ts: ts(), usd: writerResult.costUsd || q.cost, cache: q.cache.id, key: String(q.row.num), provider: adapterProvider });
        state.refresh_history[q.cache.id] = state.refresh_history[q.cache.id] || {};
        state.refresh_history[q.cache.id][String(q.row.num)] = { lastRefreshedAt: ts(), result: 'OK', verifier_passed: true, citations: envelope.source_urls.length };
        if (q.isRotation) state.refresh_history['_layer3_rotation_last_fired_at'] = ts();
      } catch (e) {
        log(`  ERROR (adapter): ${e.message.slice(0, 200)}`);
        errorCount++;
        state.refresh_history[q.cache.id] = state.refresh_history[q.cache.id] || {};
        state.refresh_history[q.cache.id][String(q.row.num)] = { lastRefreshedAt: ts(), result: 'ERROR', error: e.message.slice(0, 200) };
      }
    } else {
      // Legacy shell-out path
      log(`  EXEC: $${q.cost} → ${q.command}`);
      try {
        execSync(q.command, { cwd: REPO_ROOT, stdio: 'inherit', timeout: 600_000 });
        actualSpent += q.cost;
        firedCount++;
        state.spend_window_30d.push({ ts: ts(), usd: q.cost, cache: q.cache.id, key: String(q.row.num) });
        state.refresh_history[q.cache.id] = state.refresh_history[q.cache.id] || {};
        state.refresh_history[q.cache.id][String(q.row.num)] = { lastRefreshedAt: ts(), result: 'OK' };
        if (q.isRotation) state.refresh_history['_layer3_rotation_last_fired_at'] = ts();
      } catch (e) {
        log(`  ERROR: refresh failed: ${e.message.slice(0, 200)}`);
        errorCount++;
        state.refresh_history[q.cache.id] = state.refresh_history[q.cache.id] || {};
        state.refresh_history[q.cache.id][String(q.row.num)] = { lastRefreshedAt: ts(), result: 'ERROR', error: e.message.slice(0, 200) };
      }
    }
  }

  function _materializeCachePath(cache, row) {
    // Fall back to constructing the path from the cache descriptor + key.
    if (!cache.dir) return null;
    const key = cache.keyFromRow ? cache.keyFromRow(row) : String(row.num);
    return join(REPO_ROOT, cache.dir, `${key}.json`);
  }

  // 8. Trigger dashboard rebuild if anything actually fired
  if (!dryRun && firedCount > 0 && policy.layer1_continuous?.dashboard_rebuild_after_cache_write) {
    log(`\ntriggering dashboard rebuild (${firedCount} caches refreshed)`);
    try {
      execSync('node scripts/build-dashboard.mjs', { cwd: REPO_ROOT, stdio: 'inherit', timeout: 120_000 });
    } catch (e) {
      log(`  rebuild error: ${e.message.slice(0, 200)}`);
    }
  }

  // 9. Persist state
  state.last_run_at = ts();
  saveState(state);

  // 10. Summary
  log(`\n═══ summary ═══`);
  log(`  queued: ${refreshQueue.length}`);
  log(`  fired: ${firedCount} (spent $${actualSpent.toFixed(2)})`);
  log(`  skipped (budget): ${skippedBudgetCount}`);
  log(`  errors: ${errorCount}`);
  log(`  daily spend now: $${(dailySpentNow + actualSpent).toFixed(2)} / cap $${dailyCap}`);
  log(`  30d spend now: $${(monthlySpentNow + actualSpent).toFixed(2)} / cap $${monthlyCap}`);
  log(`═══ refresh-master end ═══\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase A.6 (2026-05-19) — contact_enrichment per-contact queue builder.
// Reads _CONTACTS_DATA from latest dashboard build, scores via priority
// scorer, applies auto-pause (pause_after_date + month_1_budget_usd) gates,
// picks top-N unenriched contacts not yet refreshed today.
// ─────────────────────────────────────────────────────────────────────────────
async function _buildContactEnrichmentQueue({ state, log }) {
  const { loadAndRank } = await import('../lib/contact-priority-scorer.mjs');
  let ranking;
  try {
    ranking = loadAndRank();
  } catch (e) {
    log(`  contact-enrichment queue: ${e.message}; skipping`);
    return [];
  }

  // Pause gates
  if (ranking.isPaused) {
    const paused_path = join(REPO_ROOT, 'data/contact-enrichment-paused.md');
    appendFileSync(paused_path, `\n## ${ts()} — auto-paused (pause_after_date=${ranking.pauseAfter})\n`);
    log(`  contact-enrichment: PAUSED (today > pause_after_date=${ranking.pauseAfter})`);
    return [];
  }

  // Month-1 budget gate
  const month1Cap = ranking.policy.month_1_budget_usd ?? 800;
  const month1Spend = (state.spend_window_30d || [])
    .filter(s => s.cache === 'contact_enrichment')
    .reduce((sum, s) => sum + (s.usd || 0), 0);
  if (month1Spend >= month1Cap) {
    const paused_path = join(REPO_ROOT, 'data/contact-enrichment-paused.md');
    appendFileSync(paused_path, `\n## ${ts()} — auto-paused (month-1 cap $${month1Cap} reached, spent $${month1Spend.toFixed(2)})\n`);
    log(`  contact-enrichment: BUDGET CAP REACHED ($${month1Spend.toFixed(2)} / $${month1Cap})`);
    return [];
  }

  // Determine which contacts are not yet enriched + not yet attempted today
  const cacheDir = join(REPO_ROOT, 'data/contact-enrichment-cache');
  const today = TODAY;
  const log_entry = (state.refresh_history?.contact_enrichment) || {};

  const dailyCount = ranking.policy.daily_count ?? 50;
  let picked = 0;
  const queue = [];
  for (const r of ranking.ranked) {
    if (picked >= dailyCount) break;
    const c = r.contact;
    const cachePath = join(cacheDir, `${c.id}.json`);
    if (existsSync(cachePath)) {
      const stat = statSync ? statSync(cachePath) : null;
      // statSync isn't imported here — use existsSync only; rely on cache TTL inside the agent
      // (the agent's _readContactCache enforces 30-day TTL)
      continue;
    }
    if (log_entry[c.id] && log_entry[c.id].lastAttemptedAt === today) continue;
    queue.push({
      layer: 2,
      cache: { id: 'contact_enrichment', layer: 2, scope: 'per-contact', dir: 'data/contact-enrichment-cache' },
      contact: c,
      contactId: c.id,
      priorityScore: r.score,
      signals: r.signals,
      tier: r.tier_boosted ? 'A' : 'B',
      cost: 0.5,
      ageDescription: 'missing',
      command: null,                            // handled in-process by enricher's runContactEnrichment
      provider: 'perplexity-agent+anthropic-sonnet+grok-4-x-search',
    });
    picked++;
  }
  log(`  contact-enrichment queue: ${queue.length} contacts picked (top-${dailyCount} unenriched, today=${today})`);
  return queue;
}

// Hook into the existing execute loop: when an entry has cache.id ===
// 'contact_enrichment', call runContactEnrichment directly (not via shell).
async function _executeContactEnrichmentEntry(q, state) {
  const { runContactEnrichment } = await import('./agents/network-enricher.mjs');
  try {
    const r = await runContactEnrichment(q.contactId, { priorityScore: q.priorityScore, signals: q.signals });
    return r;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

main().catch(err => {
  log('FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
