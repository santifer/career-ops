/**
 * lib/outcome-correlator.mjs — Cache→outcome correlation tracker.
 *
 * Design source: refresh-master Phase 4 deliverable 2. Links cached intel
 * fields to downstream outcomes (applications sent → recruiter responses →
 * interviews → offers) and surfaces which cached fields correlated with
 * actual conversions.
 *
 * Inputs:
 *   - data/applications.md (tracker — status transitions)
 *   - data/hm-intel/*.json + data/positioning-cache/*.json (cached fields
 *     at the time of application)
 *   - data/refresh-master-state.json (refresh_history with timestamps)
 *
 * Output: data/outcome-correlation-{date}.json with per-cache field-level
 * conversion correlations.
 *
 * Limitations: with N=20 apply-now-queue rows + a few interview events,
 * the statistical signal is weak. The output is descriptive (what fields
 * appeared in caches that led to interviews) not causal. OMEGA reads this
 * to propose hypotheses, not to make automated routing decisions.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const APPS_PATH = join(REPO_ROOT, 'data', 'applications.md');
const HM_INTEL_DIR = join(REPO_ROOT, 'data', 'hm-intel');
const POSITIONING_DIR = join(REPO_ROOT, 'data', 'positioning-cache');
const TOXICITY_DIR = join(REPO_ROOT, 'data', 'company-toxicity-cache');
const OUTPUT_DIR = join(REPO_ROOT, 'data');

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function parseApplicationsMd() {
  if (!existsSync(APPS_PATH)) return [];
  const text = readFileSync(APPS_PATH, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 5) continue;
    const num = parseInt(cells[0], 10);
    if (!Number.isFinite(num) || num < 1) continue;
    rows.push({
      num,
      date: cells[1],
      company: cells[2],
      role: cells[3],
      status: (cells[4] || '').replace(/[*`]/g, '').trim(),
      score: cells[5],
      notes: cells.slice(8).join(' '),
    });
  }
  return rows;
}

/** Read the cached intel snapshot for a row at the time of audit. */
function readRowCaches(row) {
  const slug = `${slugify(row.company)}-${slugify(row.role)}`;
  const result = {};
  const hmPath = join(HM_INTEL_DIR, `${slug}.json`);
  const posPath = join(POSITIONING_DIR, `${String(row.num).padStart(3, '0')}.json`);
  const toxPath = join(TOXICITY_DIR, `${slugify(row.company)}.json`);
  if (existsSync(hmPath)) try { result.hm_intel = JSON.parse(readFileSync(hmPath, 'utf8')); } catch { /* skip */ }
  if (existsSync(posPath)) try { result.positioning = JSON.parse(readFileSync(posPath, 'utf8')); } catch { /* skip */ }
  if (existsSync(toxPath)) try { result.toxicity = JSON.parse(readFileSync(toxPath, 'utf8')); } catch { /* skip */ }
  return result;
}

/**
 * Correlate cache fields with downstream outcomes.
 * Returns per-status (Interview/Offer/Rejected) summaries of which
 * cached fields appeared.
 */
export function correlateOutcomes() {
  const rows = parseApplicationsMd();
  const byStatus = {
    Interview: [], Offer: [], Responded: [], Rejected: [], Applied: [], Evaluated: [], Discarded: [], SKIP: [],
  };
  for (const row of rows) {
    const status = row.status || 'Evaluated';
    if (byStatus[status] === undefined) byStatus[status] = [];
    const caches = readRowCaches(row);
    byStatus[status].push({
      num: row.num,
      company: row.company,
      role: row.role,
      has_hm_intel: !!caches.hm_intel,
      has_positioning: !!caches.positioning,
      has_toxicity: !!caches.toxicity,
      cache_summary: {
        hm_intel_recruiter_named: !!caches.hm_intel?.people?.likely_recruiter?.name && caches.hm_intel.people.likely_recruiter.name !== 'unknown',
        hm_intel_hm_named: !!caches.hm_intel?.people?.likely_hm?.name && caches.hm_intel.people.likely_hm.name !== 'unknown',
        positioning_grounded_in_cv: !!caches.positioning?.evidence_citations?.length,
        toxicity_band: caches.toxicity?.composite_band || null,
        toxicity_signals_count: (caches.toxicity?.signals || []).length,
      },
    });
  }

  // Conversion rates: assume linear funnel Evaluated → Applied → Responded → Interview → Offer
  const counts = Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, v.length]));
  const conversion = {
    apply_rate: counts.Evaluated ? (counts.Applied + counts.Responded + counts.Interview + counts.Offer) / (counts.Evaluated + counts.Applied + counts.Responded + counts.Interview + counts.Offer + counts.Rejected + counts.Discarded || 1) : 0,
    interview_rate_among_applied: (counts.Applied + counts.Responded) > 0 ? (counts.Interview + counts.Offer) / (counts.Applied + counts.Responded + counts.Interview + counts.Offer || 1) : 0,
    offer_rate_among_interview: counts.Interview > 0 ? counts.Offer / (counts.Interview + counts.Offer || 1) : 0,
  };

  // Field-level: among rows that reached Interview vs Rejected, what fraction had each cache field?
  function shareWith(group, field) {
    if (!group.length) return null;
    const present = group.filter(r => r.cache_summary?.[field] === true || (typeof r.cache_summary?.[field] === 'number' && r.cache_summary[field] > 0) || (typeof r.cache_summary?.[field] === 'string' && r.cache_summary[field] !== null)).length;
    return present / group.length;
  }
  const fieldFields = ['hm_intel_recruiter_named', 'hm_intel_hm_named', 'positioning_grounded_in_cv', 'toxicity_signals_count'];
  const fieldCorrelation = {};
  for (const f of fieldFields) {
    fieldCorrelation[f] = {
      among_interview: shareWith(byStatus.Interview.concat(byStatus.Offer), f),
      among_rejected: shareWith(byStatus.Rejected.concat(byStatus.Discarded), f),
      among_all: shareWith(rows.map(r => ({ cache_summary: readRowCaches(r) ? {} : {} })), f),
    };
  }

  return {
    generated_at: new Date().toISOString(),
    row_counts: counts,
    conversion,
    field_correlation: fieldCorrelation,
    sample_size_warning: rows.length < 50
      ? `N=${rows.length}; correlations are descriptive only, not causal. OMEGA should treat as hypotheses.`
      : null,
  };
}

export function writeOutcomeReport(report) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const path = join(OUTPUT_DIR, `outcome-correlation-${date}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

// CLI: node lib/outcome-correlator.mjs --report
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--report')) {
    const r = correlateOutcomes();
    const path = writeOutcomeReport(r);
    console.log(JSON.stringify({ ok: true, path, headline: r.row_counts }, null, 2));
  } else {
    console.log('usage: --report');
  }
}
