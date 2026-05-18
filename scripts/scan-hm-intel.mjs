#!/usr/bin/env node
/**
 * scripts/scan-hm-intel.mjs — Batch HM-Intel refresher
 *
 * Reads data/applications.md, identifies rows that need HM-intel:
 *   - Apply-Now status rows (or any row when --all-apply-now)
 *   - Rows where data/hm-intel/{slug}.json is missing or > 7d stale
 *
 * Routes each through lib/hm-intel-research.mjs which calls the
 * /researcher agent. Respects a max-cost guard.
 *
 * CLI:
 *   node scripts/scan-hm-intel.mjs                      — top-3 Apply-Now by score, max $3
 *   node scripts/scan-hm-intel.mjs --row 50              — single row
 *   node scripts/scan-hm-intel.mjs --company ElevenLabs  — filter by company
 *   node scripts/scan-hm-intel.mjs --all-apply-now       — all Apply-Now rows
 *   node scripts/scan-hm-intel.mjs --max-cost-usd 5      — budget override
 *   node scripts/scan-hm-intel.mjs --dry-run             — show what would run, no API calls
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ── CLI args ────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const getArg     = (flag) => { const i = args.indexOf(flag); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
const hasFlag    = (flag) => args.includes(flag);

const ROW_FILTER       = getArg('--row') ? parseInt(getArg('--row'), 10) : null;
const COMPANY_FILTER   = getArg('--company') ?? null;
const ALL_APPLY_NOW    = hasFlag('--all-apply-now');
const MAX_COST_USD     = parseFloat(getArg('--max-cost-usd') ?? '3');
const DRY_RUN          = hasFlag('--dry-run');
const FORCE_LIVE       = hasFlag('--force-live');
const DEFAULT_LIMIT    = 3; // top-N when no filters given

// ── parse applications.md ───────────────────────────────────────

function parseApplications(filePath) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const rows  = [];
  for (const line of lines) {
    // Format: | num | date | company | role | score | status | pdf | report | notes |
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
    if (!m) continue;
    const [, num, date, company, role, score, status] = m.map(s => s.trim());
    const scoreNum = parseFloat(score);
    rows.push({
      num:     parseInt(num, 10),
      date:    date.trim(),
      company: company.trim(),
      role:    role.trim(),
      score:   isNaN(scoreNum) ? 0 : scoreNum,
      status:  status.trim(),
    });
  }
  return rows;
}

// ── cache staleness check ───────────────────────────────────────

// Synchronous slug helper (duplicates toSlug to avoid async import just for filtering)
function toSlugSync(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isCacheStale(company, role, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const slug = `${toSlugSync(company)}-${toSlugSync(role)}`;
  const p    = join(REPO_ROOT, 'data', 'hm-intel', `${slug}.json`);
  if (!existsSync(p)) return true;
  try {
    const entry = JSON.parse(readFileSync(p, 'utf8'));
    const age   = Date.now() - new Date(entry.refreshed_at).getTime();
    return age > maxAgeMs;
  } catch {
    return true;
  }
}

// ── main ────────────────────────────────────────────────────────

async function main() {
  const appsPath = join(REPO_ROOT, 'data', 'applications.md');
  const allRows  = parseApplications(appsPath);

  if (!allRows.length) {
    console.error('[scan-hm-intel] No rows parsed from data/applications.md — is the file present?');
    process.exit(1);
  }

  // ── Build candidate list ──
  let candidates = allRows.filter(r => {
    if (ROW_FILTER  !== null) return r.num === ROW_FILTER;
    if (COMPANY_FILTER)       return r.company.toLowerCase().includes(COMPANY_FILTER.toLowerCase());
    // Default: rows with Apply-Now-adjacent statuses (Applied, Evaluated, or explicit Apply-Now)
    const applyStatuses = /^(evaluated|applied|apply.now|responded|interview|offer)/i;
    return applyStatuses.test(r.status);
  });

  // Filter to only stale unless --force-live
  if (!FORCE_LIVE) {
    candidates = candidates.filter(r => isCacheStale(r.company, r.role));
  }

  // Sort by score desc; limit unless --all-apply-now or explicit row/company filter
  candidates.sort((a, b) => b.score - a.score);
  if (!ALL_APPLY_NOW && ROW_FILTER === null && !COMPANY_FILTER) {
    candidates = candidates.slice(0, DEFAULT_LIMIT);
  }

  if (!candidates.length) {
    console.log('[scan-hm-intel] All candidates are fresh. Nothing to refresh.');
    process.exit(0);
  }

  console.log(`[scan-hm-intel] ${candidates.length} candidate(s) to refresh:`);
  for (const c of candidates) {
    console.log(`  row ${c.num}: ${c.company} / ${c.role} (score ${c.score}, status ${c.status})`);
  }

  if (DRY_RUN) {
    console.log('[scan-hm-intel] --dry-run: stopping here, no API calls made.');
    process.exit(0);
  }

  // ── Import lib (deferred so --dry-run + --check don't need Agent) ──
  const { getHmIntelForRole } = await import('../lib/hm-intel-research.mjs');

  let totalCost = 0;
  const results = [];

  for (const c of candidates) {
    if (totalCost >= MAX_COST_USD) {
      console.warn(`[scan-hm-intel] Budget cap $${MAX_COST_USD} reached — stopping after ${results.length} refreshes.`);
      break;
    }

    console.log(`\n[scan-hm-intel] → refreshing row ${c.num}: ${c.company} / ${c.role}`);
    try {
      const result = await getHmIntelForRole({
        rowId:   c.num,
        company: c.company,
        role:    c.role,
        opts:    { forceLive: FORCE_LIVE, budgetUsd: Math.min(3, MAX_COST_USD - totalCost) },
      });
      totalCost += result.cost_estimate ?? 0;
      results.push({ row: c.num, company: c.company, role: c.role, path: result.path, ok: true });
      console.log(`  ✓ written to ${result.path}`);
    } catch (err) {
      console.error(`  ✗ failed: ${err.message}`);
      results.push({ row: c.num, company: c.company, role: c.role, ok: false, error: err.message });
    }
  }

  // ── Summary ──
  const ok   = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n[scan-hm-intel] done. ${ok} refreshed, ${fail} failed. Estimated cost: $${totalCost.toFixed(2)}`);

  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('[scan-hm-intel] fatal:', err.message);
  process.exit(1);
});
