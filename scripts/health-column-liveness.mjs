#!/usr/bin/env node
/**
 * scripts/health-column-liveness.mjs — daily Health column coverage check.
 *
 * Scans every apply-now row (score ≥ 4.0, status Evaluated/Responded) in
 * data/applications.md and verifies each one has a matching enrichment file
 * under data/role-enrichment/ with a valid sentiment.team_toxicity_grade.
 *
 * Writes the result to data/health-column-coverage.json (gitignored — see
 * .gitignore). The dashboard freshness widget reads this file so the user
 * sees "Health coverage: 14/17 rows" instead of having to inspect the table.
 *
 * Exit codes:
 *   0 — coverage ≥ 90% AND no stale-coverage flags (file freshness OK)
 *   1 — coverage < 90% (one or more rows have no enrichment)
 *   2 — runtime error (applications.md missing, etc.)
 *
 * Intended to fire daily via launchd at 04:30 PT
 * (scripts/launchd/com.mitchell.career-ops.health-column-liveness.plist).
 * Also callable on-demand:
 *   node scripts/health-column-liveness.mjs
 *   node scripts/health-column-liveness.mjs --json
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPS_PATH = join(ROOT, 'data', 'applications.md');
const ENRICH_DIR = join(ROOT, 'data', 'role-enrichment');
const OUT_PATH = join(ROOT, 'data', 'health-column-coverage.json');

const ARGS = new Set(process.argv.slice(2));

function loadEnrichments() {
  const map = new Map();
  if (!existsSync(ENRICH_DIR)) return map;
  let entries;
  try { entries = readdirSync(ENRICH_DIR); } catch { return map; }
  for (const f of entries) {
    if (!f.endsWith('.json')) continue;
    const abs = join(ENRICH_DIR, f);
    try {
      const j = JSON.parse(readFileSync(abs, 'utf-8'));
      if (!j.company || !j.role) continue;
      const key = (j.company + '|' + j.role).toLowerCase();
      const tox = j.sentiment?.team_toxicity_grade;
      const toxInt = typeof tox === 'number' ? Math.round(tox)
                   : typeof tox === 'string' ? parseInt(tox, 10) : NaN;
      const stat = statSync(abs);
      map.set(key, {
        file: f,
        path: abs,
        company: j.company,
        role: j.role,
        team_toxicity_grade: Number.isFinite(toxInt) && toxInt >= 1 && toxInt <= 5 ? toxInt : null,
        ageDays: Number(((Date.now() - stat.mtimeMs) / 86400000).toFixed(1)),
      });
    } catch { /* skip unparseable */ }
  }
  return map;
}

function getEnrichmentFor(map, company, role) {
  const exact = map.get((company + '|' + role).toLowerCase());
  if (exact) return exact;
  // Tolerant fallback — same logic as build-dashboard.mjs::getRoleEnrichment.
  const cLower = company.toLowerCase();
  const rLower = role.toLowerCase();
  for (const [k, v] of map.entries()) {
    if (k.startsWith(cLower + '|') && rLower.startsWith(v.role.toLowerCase().slice(0, 20))) return v;
  }
  return null;
}

async function main() {
  if (!existsSync(APPS_PATH)) {
    console.error(`ERROR: applications.md not found at ${APPS_PATH}`);
    process.exit(2);
  }
  const { parseApplicationsFile } = await import('../lib/parse-applications.mjs');
  const apps = parseApplicationsFile(APPS_PATH);
  const applyNow = apps
    .filter(r => r.score >= 4.0 && /^(evaluated|responded)$/i.test(r.status))
    .sort((a, b) => b.score - a.score);

  const enrichMap = loadEnrichments();
  const STALE_DAYS = 14;

  const rows = [];
  let covered = 0;
  let stale = 0;
  let missingTox = 0;
  for (const r of applyNow) {
    const e = getEnrichmentFor(enrichMap, r.company, r.role);
    const isCovered = !!e;
    const isStale = e && e.ageDays > STALE_DAYS;
    const missingGrade = e && e.team_toxicity_grade == null;
    if (isCovered) covered++;
    if (isStale) stale++;
    if (missingGrade) missingTox++;
    rows.push({
      num: r.num,
      score: r.score,
      status: r.status,
      company: r.company,
      role: r.role,
      covered: isCovered,
      stale: isStale,
      missingTox: missingGrade,
      enrichmentFile: e?.file || null,
      team_toxicity_grade: e?.team_toxicity_grade ?? null,
      ageDays: e?.ageDays ?? null,
    });
  }

  const coveragePct = applyNow.length === 0 ? 100 : Math.round((covered / applyNow.length) * 100);
  const healthOk = coveragePct >= 90 && stale === 0 && missingTox === 0;

  const out = {
    generated_at: new Date().toISOString(),
    apply_now_rows: applyNow.length,
    covered,
    coverage_pct: coveragePct,
    stale,
    missing_tox: missingTox,
    healthy: healthOk,
    stale_threshold_days: STALE_DAYS,
    rows,
    summary: applyNow.length === 0
      ? 'No active apply-now rows.'
      : `${covered}/${applyNow.length} rows covered (${coveragePct}%) | ${stale} stale (>${STALE_DAYS}d) | ${missingTox} missing toxicity grade`,
  };

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

  if (ARGS.has('--json')) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`[health-column-liveness] ${out.summary}`);
    if (!healthOk) {
      console.log('[health-column-liveness] HEALTH NOT OK — see data/health-column-coverage.json for per-row detail');
      const missingRows = rows.filter(r => !r.covered);
      if (missingRows.length) {
        console.log('Missing enrichment:');
        for (const m of missingRows) console.log(`  #${m.num} ${m.company} — ${m.role}`);
        const nums = missingRows.map(r => r.num).join(',');
        console.log(`  → backfill cmd: node scripts/enrich-apply-now.mjs --rows=${nums}`);
      }
      const staleRows = rows.filter(r => r.stale);
      if (staleRows.length) {
        console.log(`Stale (>${STALE_DAYS}d):`);
        for (const m of staleRows) console.log(`  #${m.num} ${m.company} — ${m.role} (${m.ageDays}d)`);
      }
    }
  }
  process.exit(healthOk ? 0 : 1);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(2);
});
