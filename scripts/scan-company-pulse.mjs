#!/usr/bin/env node
/**
 * scripts/scan-company-pulse.mjs — Batch company-pulse refresher
 *
 * Reads data/applications.md, identifies companies by cadence:
 *   Apply-Now status → daily refresh (24h TTL)
 *   Evaluated/Responded → every 3 days (72h TTL)
 *   Older/inactive → on-demand only
 *
 * Routes each through lib/company-pulse.mjs which calls the /researcher agent.
 *
 * CLI:
 *   node scripts/scan-company-pulse.mjs                    — top-5 Apply-Now, max $4
 *   node scripts/scan-company-pulse.mjs --company anthropic — single company
 *   node scripts/scan-company-pulse.mjs --all-active        — all active-status companies
 *   node scripts/scan-company-pulse.mjs --max-cost-usd 5    — budget override
 *   node scripts/scan-company-pulse.mjs --dry-run           — show plan, no API calls
 *
 * Install the launchd plist to run daily at 06:00 PT:
 *   cp scripts/launchd/com.mitchell.career-ops.company-pulse.plist \
 *      ~/Library/LaunchAgents/
 *   launchctl load -w ~/Library/LaunchAgents/com.mitchell.career-ops.company-pulse.plist
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installRunRecord } from '../lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('company-pulse');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ── CLI args ────────────────────────────────────────────────────

const args           = process.argv.slice(2);
const getArg         = (f) => { const i = args.indexOf(f); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
const hasFlag        = (f) => args.includes(f);

const COMPANY_FILTER = getArg('--company') ?? null;
const ALL_ACTIVE     = hasFlag('--all-active');
const MAX_COST_USD   = parseFloat(getArg('--max-cost-usd') ?? '4');
const DRY_RUN        = hasFlag('--dry-run');
const FORCE_LIVE     = hasFlag('--force-live');
const DEFAULT_LIMIT  = 5;

// ── cadence TTLs (ms) ───────────────────────────────────────────

const TTL = {
  apply_now:   24 * 60 * 60 * 1000,       // 24h
  active:      3  * 24 * 60 * 60 * 1000,  // 72h
  inactive:    Infinity,                   // never auto-refresh
};

function getCadenceForStatus(status) {
  const s = status.toLowerCase();
  if (/apply.now|applied|interview|offer|responded/.test(s)) return 'apply_now';
  if (/evaluated/.test(s))                                   return 'active';
  return 'inactive';
}

// ── slug helper ─────────────────────────────────────────────────

function toSlugSync(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── cache staleness check ───────────────────────────────────────

function isPulseStale(slug, maxAgeMs) {
  const p = join(REPO_ROOT, 'data', 'company-pulse', `${slug}.json`);
  if (!existsSync(p)) return true;
  try {
    const entry = JSON.parse(readFileSync(p, 'utf8'));
    const age   = Date.now() - new Date(entry.refreshed_at).getTime();
    return age > maxAgeMs;
  } catch {
    return true;
  }
}

// ── parse applications.md ───────────────────────────────────────

function parseApplications(filePath) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const rows  = [];
  for (const line of lines) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
    if (!m) continue;
    const [, num, date, company, , score, status] = m.map(s => s.trim());
    rows.push({
      num:     parseInt(num, 10),
      company: company.trim(),
      slug:    toSlugSync(company.trim()),
      score:   parseFloat(score) || 0,
      status:  status.trim(),
    });
  }
  return rows;
}

// ── deduplicate by company slug ─────────────────────────────────

function deduplicateByCompany(rows) {
  const seen = new Map();
  for (const r of rows) {
    if (!seen.has(r.slug) || r.score > seen.get(r.slug).score) {
      seen.set(r.slug, r);
    }
  }
  return [...seen.values()];
}

// ── main ────────────────────────────────────────────────────────

async function main() {
  const appsPath = join(REPO_ROOT, 'data', 'applications.md');
  const allRows  = parseApplications(appsPath);

  if (!allRows.length) {
    console.error('[scan-company-pulse] No rows parsed from data/applications.md');
    process.exit(1);
  }

  // ── Build candidate list (deduplicated by company) ──
  let candidates = deduplicateByCompany(allRows).filter(r => {
    if (COMPANY_FILTER) return r.slug.includes(COMPANY_FILTER.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const cadence = getCadenceForStatus(r.status);
    if (!ALL_ACTIVE && cadence === 'inactive') return false;
    return true;
  });

  // Filter to stale only (unless --force-live)
  if (!FORCE_LIVE) {
    candidates = candidates.filter(r => {
      const cadence = getCadenceForStatus(r.status);
      const ttl     = TTL[cadence];
      if (ttl === Infinity) return false; // inactive — never auto-run
      return isPulseStale(r.slug, ttl);
    });
  }

  // Sort by score desc; limit unless --all-active or company filter
  candidates.sort((a, b) => b.score - a.score);
  if (!ALL_ACTIVE && !COMPANY_FILTER) {
    candidates = candidates.slice(0, DEFAULT_LIMIT);
  }

  if (!candidates.length) {
    console.log('[scan-company-pulse] All candidates are fresh. Nothing to refresh.');
    process.exit(0);
  }

  console.log(`[scan-company-pulse] ${candidates.length} company/companies to refresh:`);
  for (const c of candidates) {
    console.log(`  ${c.slug} (score ${c.score}, status ${c.status})`);
  }

  if (DRY_RUN) {
    console.log('[scan-company-pulse] --dry-run: stopping here, no API calls made.');
    process.exit(0);
  }

  // ── Import lib (deferred so --check doesn't need Agent) ──
  const { getPulseForCompany } = await import('../lib/company-pulse.mjs');

  let totalCost = 0;
  const results = [];

  for (const c of candidates) {
    if (totalCost >= MAX_COST_USD) {
      console.warn(`[scan-company-pulse] Budget cap $${MAX_COST_USD} reached — stopping.`);
      break;
    }

    console.log(`\n[scan-company-pulse] → refreshing ${c.slug} (${c.company})`);
    try {
      const { pulse } = await getPulseForCompany(c.slug, {
        forceLive:   FORCE_LIVE,
        companyName: c.company,
        budgetUsd:   Math.min(2, MAX_COST_USD - totalCost),
      });
      totalCost += pulse.cost_estimate ?? 0;
      const p    = join(REPO_ROOT, 'data', 'company-pulse', `${c.slug}.json`);
      results.push({ slug: c.slug, path: p, ok: true });
      console.log(`  ✓ written to ${p}`);
    } catch (err) {
      console.error(`  ✗ failed: ${err.message}`);
      results.push({ slug: c.slug, ok: false, error: err.message });
    }
  }

  const ok   = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n[scan-company-pulse] done. ${ok} refreshed, ${fail} failed. Estimated cost: $${totalCost.toFixed(2)}`);

  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('[scan-company-pulse] fatal:', err.message);
  process.exit(1);
});
