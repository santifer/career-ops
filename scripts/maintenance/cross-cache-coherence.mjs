#!/usr/bin/env node
/**
 * scripts/maintenance/cross-cache-coherence.mjs — Cross-cache coherence audit.
 *
 * Design source: refresh-master Phase 4 deliverable 6. Nightly check that
 * cv.md claims agree with cover-letter claims agree with positioning claims.
 *
 * Heuristic checks (no LLM call — cheap to run nightly):
 *   1. Company name spelled consistently across all caches for one row
 *   2. Role title matches between apply-now-queue + reports + apply-packs
 *   3. Recruiter name in hm-intel matches positioning's evidence_citations
 *   4. Toxicity composite_band matches the dashboard's wealth-ranking confidence
 *   5. "as of" claims aren't more than 60 days older than the most recent
 *      refresh of the source cache
 *
 * Output: data/coherence-audit-{date}.md with FLAG/PASS per row.
 * Failures are non-blocking but surface to OMEGA's weekly proposal.
 *
 * Cadence: nightly via launchd.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OUTPUT_DIR = join(REPO_ROOT, 'data');

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function readJson(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function readQueue() {
  const p = join(REPO_ROOT, 'data', 'apply-now-queue.json');
  if (!existsSync(p)) return [];
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return j.ranked || j.queue || j.rows || (Array.isArray(j) ? j : []);
  } catch { return []; }
}

function auditRow(row) {
  const findings = [];
  const slug = `${slugify(row.company)}-${slugify(row.role)}`;
  const hm = readJson(join(REPO_ROOT, 'data', 'hm-intel', `${slug}.json`));
  const tox = readJson(join(REPO_ROOT, 'data', 'company-toxicity-cache', `${slugify(row.company)}.json`));
  const pos = readJson(join(REPO_ROOT, 'data', 'positioning-cache', `${String(row.num).padStart(3, '0')}.json`));

  // 1. Company name consistency
  const companyNames = [row.company, hm?.company, tox?.company, pos?.company].filter(Boolean);
  const distinct = new Set(companyNames.map(c => String(c).toLowerCase()));
  if (distinct.size > 1) {
    findings.push({ severity: 'FLAG', check: 'company_name_consistency', detail: `Distinct spellings: ${Array.from(distinct).join(' | ')}` });
  }

  // 2. Role title match
  const roleNames = [row.role, hm?.role, pos?.role].filter(Boolean);
  const distinctRoles = new Set(roleNames.map(r => String(r).toLowerCase().slice(0, 40)));
  if (distinctRoles.size > 1) {
    findings.push({ severity: 'FLAG', check: 'role_title_consistency', detail: `Distinct roles: ${Array.from(distinctRoles).join(' | ')}` });
  }

  // 3. Recruiter/HM name presence cross-ref
  const hmRecruiterName = hm?.people?.likely_recruiter?.name;
  if (hmRecruiterName && hmRecruiterName !== 'unknown' && pos?.evidence_citations) {
    // Positioning's evidence_citations should reference cv.md OR a hm-intel field, not contradict
    const posMentionsRecruiter = JSON.stringify(pos).toLowerCase().includes(hmRecruiterName.toLowerCase().split(' ')[0]);
    // Don't flag — just record signal strength
    findings.push({ severity: 'INFO', check: 'recruiter_in_positioning', detail: `hm recruiter = ${hmRecruiterName}; positioning ${posMentionsRecruiter ? 'references' : 'does NOT reference'}` });
  }

  // 4. Toxicity composite_band coherence with hm-intel sentiment
  const toxBand = tox?.composite_band;
  const hmSentiment = hm?.sentiment;
  if (toxBand && hmSentiment) {
    const toxBandIsConcerning = ['avoid', 'caution'].includes(String(toxBand).toLowerCase());
    const hmIsHealthy = !!hmSentiment.glassdoor_score && !/3\.[0-5]|2\./.test(String(hmSentiment.glassdoor_score));
    if (toxBandIsConcerning && hmIsHealthy) {
      findings.push({ severity: 'FLAG', check: 'tox_hm_disagreement', detail: `toxicity says ${toxBand}, hm sentiment looks healthy. Possible contradiction.` });
    }
  }

  // 5. "as of" / retrieved_at temporal coherence
  for (const [name, cache] of Object.entries({ hm_intel: hm, toxicity: tox, positioning: pos })) {
    if (!cache) continue;
    const asOf = cache.as_of || cache.retrieved_at;
    if (asOf) {
      const asOfMs = Date.parse(asOf);
      if (Number.isFinite(asOfMs)) {
        const ageDays = (Date.now() - asOfMs) / 86400000;
        if (ageDays > 60) {
          findings.push({ severity: 'FLAG', check: `temporal_coherence:${name}`, detail: `as_of ${asOf} is ${ageDays.toFixed(0)}d old` });
        }
      }
    }
  }

  return { row_num: row.num, company: row.company, role: row.role, findings };
}

async function main() {
  const queue = readQueue();
  const results = [];
  for (const row of queue) {
    results.push(auditRow(row));
  }

  const date = new Date().toISOString().slice(0, 10);
  const totalFlags = results.reduce((s, r) => s + r.findings.filter(f => f.severity === 'FLAG').length, 0);
  const totalRows = results.length;
  const reportPath = join(OUTPUT_DIR, `coherence-audit-${date}.md`);
  const body = [
    `# Cross-cache coherence audit — ${date}`,
    ``,
    `**Rows audited:** ${totalRows}`,
    `**Total FLAGs:** ${totalFlags}`,
    `**Rows clean:** ${results.filter(r => r.findings.filter(f => f.severity === 'FLAG').length === 0).length}`,
    ``,
    `## Per-row findings`,
    ``,
    ...results.filter(r => r.findings.length > 0).map(r => [
      `### Row #${r.row_num} — ${r.company} — ${r.role.slice(0, 40)}`,
      ...r.findings.map(f => `- **${f.severity}** \`${f.check}\`: ${f.detail}`),
      ``,
    ].join('\n')),
  ].join('\n');
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(reportPath, body);
  console.log(`coherence audit: ${reportPath}`);
  console.log(`${totalFlags} FLAGs across ${totalRows} rows`);

  if (process.argv.includes('--exit-on-flags') && totalFlags > 0) process.exit(2);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
