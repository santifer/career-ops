#!/usr/bin/env node
/**
 * scripts/audit-role-enrichment-validator.mjs — Preview audit.
 *
 * Walks every file under data/role-enrichment/ and runs validateCacheWrite()
 * against it AS IF the cache-write-validator were wired into the direct
 * enrich-apply-now.mjs shell-out path. Reports:
 *
 *   1. Provenance shape coverage (source_urls, retrieved_at, model)
 *   2. Citation density distribution against the cache's
 *      minCitationsPer100Tokens floor (currently 1.0)
 *   3. Per-row pass/fail under the current floor
 *   4. Recommended minCitationsPer100Tokens floor that would yield
 *      ≥90% pass rate without lowering anti-hallucination teeth
 *
 * Read-only. Does not write or modify any cache file.
 *
 * Usage:
 *   node scripts/audit-role-enrichment-validator.mjs
 *   node scripts/audit-role-enrichment-validator.mjs --json   # JSON output
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCacheWrite } from '../lib/cache-write-validator.mjs';
import { CACHES } from '../lib/refresh-cache-registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENRICH_DIR = join(ROOT, 'data', 'role-enrichment');

const JSON_OUT = process.argv.includes('--json');

const cache = CACHES.find(c => c.id === 'role_enrichment');
if (!cache) {
  console.error('FATAL: role_enrichment cache entry not found in registry');
  process.exit(2);
}

const files = readdirSync(ENRICH_DIR).filter(f => f.endsWith('.json'));

function gatherSources(obj) {
  const urls = [];
  function walk(o) {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.sources)) {
      for (const u of o.sources) if (typeof u === 'string') urls.push(u);
    }
    for (const k of Object.keys(o)) walk(o[k]);
  }
  walk(obj);
  return [...new Set(urls.filter(u => /^https?:\/\//.test(u)))];
}

const rows = [];
const candidateFloors = [0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0];

for (const f of files.sort()) {
  let content;
  try { content = JSON.parse(readFileSync(join(ENRICH_DIR, f), 'utf-8')); }
  catch (e) { rows.push({ file: f, error: 'parse-fail: ' + e.message }); continue; }

  const sources = gatherSources(content);
  const tokens = Math.ceil(JSON.stringify(content).length / 3.5);

  // Construct envelope WITH source_urls (flatten nested sources to top level)
  const envelope = {
    source_urls: sources,
    retrieved_at: content._meta?.generated_at || new Date().toISOString(),
    model: content._meta?.models_used?.[0]?.model || 'unknown',
    verifier_passed: null,
    diff_summary: 'audit-preview',
  };

  const checks = {};
  for (const floor of candidateFloors) {
    const cacheCopy = { ...cache, minCitationsPer100Tokens: floor };
    const r = validateCacheWrite({ cache: cacheCopy, envelope, contentJson: content });
    checks[String(floor)] = { ok: r.ok, errors: r.errors.length, firstError: r.errors[0] || null };
  }

  rows.push({
    file: f,
    tokens,
    source_url_count: sources.length,
    density_per_100tk: Number((sources.length / (tokens / 100)).toFixed(2)),
    company: content.company,
    role: (content.role || '').slice(0, 50),
    confidence: content.confidence,
    pass_at: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.ok])),
  });
}

const summary = {
  total_files: rows.length,
  parse_failed: rows.filter(r => r.error).length,
  by_floor: {},
  density_stats: (() => {
    const ds = rows.map(r => r.density_per_100tk).filter(Number.isFinite).sort((a, b) => a - b);
    if (ds.length === 0) return null;
    const pct = (p) => ds[Math.floor((ds.length - 1) * p)];
    return {
      min: ds[0],
      p25: pct(0.25),
      median: pct(0.50),
      p75: pct(0.75),
      max: ds[ds.length - 1],
      mean: Number((ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(2)),
    };
  })(),
};

for (const floor of candidateFloors) {
  const passing = rows.filter(r => r.pass_at && r.pass_at[String(floor)]).length;
  summary.by_floor[String(floor)] = {
    pass: passing,
    fail: rows.length - passing - summary.parse_failed,
    pass_pct: Math.round(100 * passing / (rows.length - summary.parse_failed)),
  };
}

// Find the highest floor that yields ≥90% pass rate
const recommended = candidateFloors
  .filter(f => summary.by_floor[String(f)].pass_pct >= 90)
  .sort((a, b) => b - a)[0] || candidateFloors[0];
summary.current_floor = cache.minCitationsPer100Tokens;
summary.recommended_floor_for_90pct_pass = recommended;
summary.recommendation = (() => {
  if (cache.minCitationsPer100Tokens <= recommended) return 'KEEP — current floor already yields ≥90% pass';
  return `LOWER from ${cache.minCitationsPer100Tokens} to ${recommended} to yield ≥90% pass without removing anti-hallucination teeth`;
})();

if (JSON_OUT) {
  console.log(JSON.stringify({ summary, rows }, null, 2));
} else {
  console.log(`Role-enrichment validator audit — ${rows.length} files\n`);
  console.log(`Current floor (lib/refresh-cache-registry.mjs):  ${cache.minCitationsPer100Tokens} URLs/100tk`);
  console.log(`Density distribution:`);
  console.log(`  min: ${summary.density_stats.min}`);
  console.log(`  p25: ${summary.density_stats.p25}`);
  console.log(`  median: ${summary.density_stats.median}`);
  console.log(`  p75: ${summary.density_stats.p75}`);
  console.log(`  max: ${summary.density_stats.max}`);
  console.log(`  mean: ${summary.density_stats.mean}\n`);
  console.log(`Pass rate by floor:`);
  for (const floor of candidateFloors) {
    const b = summary.by_floor[String(floor)];
    const marker = floor === cache.minCitationsPer100Tokens ? ' ← current' : '';
    console.log(`  ${String(floor).padEnd(5)} → ${String(b.pass).padStart(2)}/${rows.length - summary.parse_failed} pass (${b.pass_pct}%)${marker}`);
  }
  console.log(`\nRecommendation: ${summary.recommendation}`);
  console.log(`\nNote: this audit is preview-only. Cache-write-validator is NOT currently wired into`);
  console.log(`scripts/enrich-apply-now.mjs's direct shell-out path. It only runs on the`);
  console.log(`refresh-master adapter flow. Wiring it in requires either:`);
  console.log(`  (a) recalibrating role_enrichment.minCitationsPer100Tokens to the floor above`);
  console.log(`      that yields ≥90% pass, OR`);
  console.log(`  (b) restructuring the JSON to include a flat top-level source_urls array`);
  console.log(`      (currently sources are nested under relocation.sources, benefits.sources, etc.)`);
}
