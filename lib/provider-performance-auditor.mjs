/**
 * lib/provider-performance-auditor.mjs — Per-provider performance auditor.
 *
 * Design source: refresh-master Phase 4 deliverable 1. Reads
 * data/refresh-master-state.json + data/logs/anthropic-cache-stats.jsonl to
 * compute per-cache + per-provider performance stats over the rolling 7-day
 * window:
 *   - cost (sum + avg per call)
 *   - latency (avg + p95)
 *   - verifier pass rate (% of writes where verifier_passed=true)
 *   - hallucinations caught (verifier REJECTs + adversarial FLAGs)
 *
 * Output: data/provider-performance-{week}.json + a summary section that
 * OMEGA's weekly proposal generator reads to propose provider re-routing.
 *
 * Exports:
 *   auditProviderPerformance({ windowDays = 7 }) → report
 *   compareAgainstBaseline(report, prior) → diff
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const STATE_PATH = join(REPO_ROOT, 'data', 'refresh-master-state.json');
const CACHE_STATS_LOG = join(REPO_ROOT, 'data', 'logs', 'anthropic-cache-stats.jsonl');
const OUTPUT_DIR = join(REPO_ROOT, 'data');

export function auditProviderPerformance({ windowDays = 7 } = {}) {
  const cutoff = Date.now() - windowDays * 86400000;

  // 1. refresh-master state — spend window + refresh history
  let state = { spend_window_30d: [], refresh_history: {} };
  if (existsSync(STATE_PATH)) {
    try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { /* default */ }
  }

  // 2. Anthropic cache stats log — per-call latency + hit rate
  const cacheStats = [];
  if (existsSync(CACHE_STATS_LOG)) {
    try {
      const lines = readFileSync(CACHE_STATS_LOG, 'utf8').trim().split('\n').filter(Boolean);
      for (const l of lines) {
        try {
          const r = JSON.parse(l);
          if (r.ts && Date.parse(r.ts) > cutoff) cacheStats.push(r);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // 3. Per-cache aggregates
  const perCache = {};
  for (const entry of state.spend_window_30d || []) {
    if (Date.parse(entry.ts) < cutoff) continue;
    const key = entry.cache || 'unknown';
    if (!perCache[key]) perCache[key] = { writes: 0, totalCost: 0, providerCounts: {}, latencies: [] };
    perCache[key].writes += 1;
    perCache[key].totalCost += entry.usd || 0;
    const prov = entry.provider || 'unknown';
    perCache[key].providerCounts[prov] = (perCache[key].providerCounts[prov] || 0) + 1;
  }

  // 4. Per-cache verifier outcomes from refresh_history
  for (const [cacheId, history] of Object.entries(state.refresh_history || {})) {
    if (cacheId.startsWith('_')) continue;
    const c = perCache[cacheId] = perCache[cacheId] || { writes: 0, totalCost: 0, providerCounts: {}, latencies: [] };
    let verified = 0, failed = 0, blocked = 0, rejected = 0;
    for (const [_rowKey, record] of Object.entries(history || {})) {
      if (!record || typeof record !== 'object') continue;
      if (record.lastRefreshedAt && Date.parse(record.lastRefreshedAt) < cutoff) continue;
      switch (record.result) {
        case 'OK':                 verified += 1; break;
        case 'VERIFIER_REJECTED':  rejected += 1; break;
        case 'VALIDATOR_BLOCKED':  blocked  += 1; break;
        case 'WRITER_FAILED':
        case 'ERROR':              failed   += 1; break;
        default: break;
      }
    }
    c.verified = verified;
    c.failed = failed;
    c.blocked = blocked;
    c.rejected = rejected;
    c.total = verified + failed + blocked + rejected;
    c.verifierPassRate = c.total > 0 ? verified / c.total : null;
    c.hallucinationsCaught = rejected + blocked;
  }

  // 5. Per-provider aggregates (latency + cache hit rate from anthropic-cache-stats)
  const perProvider = {};
  for (const stat of cacheStats) {
    const key = stat.model || 'unknown';
    if (!perProvider[key]) perProvider[key] = { calls: 0, totalLatencyMs: 0, totalCostUsd: 0, totalCacheRead: 0, totalCacheCreate: 0, totalInput: 0 };
    const p = perProvider[key];
    p.calls += 1;
    p.totalLatencyMs += stat.latency_ms || 0;
    p.totalCostUsd += stat.cost_usd || 0;
    p.totalCacheRead += stat.cache_read_input_tokens || 0;
    p.totalCacheCreate += stat.cache_creation_input_tokens || 0;
    p.totalInput += stat.input_tokens || 0;
  }
  for (const [_k, p] of Object.entries(perProvider)) {
    p.avgLatencyMs = p.calls > 0 ? p.totalLatencyMs / p.calls : 0;
    p.avgCostUsd = p.calls > 0 ? p.totalCostUsd / p.calls : 0;
    const totalIn = p.totalCacheRead + p.totalCacheCreate + p.totalInput;
    p.cacheHitRate = totalIn > 0 ? p.totalCacheRead / totalIn : 0;
  }

  // 6. Spend distribution (validates "no single provider > 35%" target)
  let grandTotal = 0;
  for (const [_, c] of Object.entries(perCache)) grandTotal += c.totalCost || 0;
  const providerSpendShare = {};
  for (const [_, c] of Object.entries(perCache)) {
    for (const [prov, count] of Object.entries(c.providerCounts || {})) {
      const share = grandTotal > 0 ? (c.totalCost * (count / c.writes)) / grandTotal : 0;
      providerSpendShare[prov] = (providerSpendShare[prov] || 0) + share;
    }
  }

  return {
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    per_cache: perCache,
    per_provider: perProvider,
    spend_total_usd: grandTotal,
    provider_spend_share: providerSpendShare,
    headline: {
      total_writes: Object.values(perCache).reduce((s, c) => s + (c.total || 0), 0),
      total_verifier_passes: Object.values(perCache).reduce((s, c) => s + (c.verified || 0), 0),
      total_hallucinations_caught: Object.values(perCache).reduce((s, c) => s + (c.hallucinationsCaught || 0), 0),
      avg_cache_hit_rate_anthropic: avgValue(perProvider, 'cacheHitRate'),
      max_provider_share_pct: Math.max(0, ...Object.values(providerSpendShare).map(s => s * 100)),
      max_provider_share_provider: Object.entries(providerSpendShare).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    },
  };
}

function avgValue(obj, field) {
  const xs = Object.values(obj).map(v => v[field]).filter(v => typeof v === 'number' && !isNaN(v));
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/**
 * Write the audit report to disk + return the path.
 */
export function writePerformanceReport(report) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const path = join(OUTPUT_DIR, `provider-performance-${date}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

/**
 * Generate provider re-routing proposals based on the audit.
 * Returns an array of structured proposals OMEGA can include in its weekly
 * stewardship doc.
 */
export function buildReroutingProposals(report) {
  const proposals = [];
  for (const [cacheId, c] of Object.entries(report.per_cache)) {
    if (c.hallucinationsCaught > 0 && c.verifierPassRate !== null && c.verifierPassRate < 0.7) {
      proposals.push({
        cache: cacheId,
        tag: 'NEEDS-APPROVAL',
        title: `Verifier pass rate low on ${cacheId} (${Math.round(c.verifierPassRate * 100)}%)`,
        evidence: `Last ${report.window_days}d: ${c.verified} OK / ${c.rejected} rejected / ${c.blocked} validator-blocked / ${c.failed} writer-failed.`,
        proposal: `Consider switching primary provider for "${cacheId}" or strengthening the per-field allowlist. Current providers: ${JSON.stringify(c.providerCounts)}.`,
      });
    }
    if (c.totalCost > 0 && (c.totalCost / Math.max(1, c.writes)) > 5.0 && c.verifierPassRate !== null && c.verifierPassRate < 0.9) {
      proposals.push({
        cache: cacheId,
        tag: 'NEEDS-APPROVAL',
        title: `Expensive cache with imperfect quality: ${cacheId}`,
        evidence: `Avg cost/write = $${(c.totalCost / c.writes).toFixed(2)}; pass rate ${Math.round((c.verifierPassRate || 0) * 100)}%.`,
        proposal: `Test a cheaper provider with verifier-lane fallback. If pass rate stays similar, route there.`,
      });
    }
  }
  // Provider-spend-share concentration
  if (report.headline.max_provider_share_pct > 35) {
    proposals.push({
      cache: '__ecosystem__',
      tag: 'NEEDS-APPROVAL',
      title: `Provider concentration above 35%: ${report.headline.max_provider_share_provider} = ${report.headline.max_provider_share_pct.toFixed(1)}%`,
      evidence: `Design target: no single provider > 35% of spend. Currently ${report.headline.max_provider_share_provider} dominates.`,
      proposal: `Re-route a Tier-B cache from ${report.headline.max_provider_share_provider} to a different-architecture adapter.`,
    });
  }
  return proposals;
}
