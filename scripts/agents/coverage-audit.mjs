#!/usr/bin/env node
/**
 * scripts/agents/coverage-audit.mjs
 *
 * Audits the dashboard's apply-now rows for missing data in the EQUITY and
 * HEALTH columns. Both columns went stale at various points in 2026-05 because
 * the populators (overpay-signals.mjs / enrich-apply-now.mjs) read from a queue
 * that didn't always reflect newly-promoted applications.md rows.
 *
 * Apply-now filter (matches build-dashboard.mjs::parseApplicationsFile):
 *   score >= 4.0  AND  status ∈ {Evaluated, Responded}
 *
 * Sources:
 *   - Equity column:  data/overpay-signals/CURRENT.md (per-company markdown blocks)
 *   - Health column:  data/role-enrichment/*.json (per-role JSON files)
 *
 * Usage:
 *   node scripts/agents/coverage-audit.mjs                     # report only
 *   node scripts/agents/coverage-audit.mjs --json              # machine-readable
 *   node scripts/agents/coverage-audit.mjs --print-cmds        # print fix commands
 *   node scripts/agents/coverage-audit.mjs --apply             # auto-run fixes
 *                                                                (LLM spend! ~$0.50-15)
 *
 * Output (also written): data/coverage-audit-YYYY-MM-DD.md +
 *                        data/coverage-audit-YYYY-MM-DD.json
 *
 * Exit codes:
 *   0 — all apply-now rows covered for both equity + health
 *   1 — one or more rows missing coverage
 *   2 — runtime error
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TODAY = new Date().toISOString().slice(0, 10);
const ACTIVE_STATUSES = new Set(['Evaluated', 'Responded']);
const SCORE_FLOOR = 4.0;

const FLAGS = new Set(process.argv.slice(2));
const JSON_MODE = FLAGS.has('--json');
const PRINT_CMDS = FLAGS.has('--print-cmds');
const APPLY = FLAGS.has('--apply');

function parseTracker() {
  const txt = readFileSync(join(ROOT, 'data/applications.md'), 'utf8');
  const lines = txt.split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('|').slice(1, -1).map(x => x.trim());
    if (c.length < 8) continue;
    const num = c[0];
    if (!/^\d+$/.test(num)) continue;
    const score = parseFloat((c[4] || '').replace(/[^\d.]/g, ''));
    if (!(score >= SCORE_FLOOR)) continue;
    if (!ACTIVE_STATUSES.has(c[5])) continue;
    rows.push({ num, date: c[1], company: c[2], role: c[3], score, status: c[5] });
  }
  return rows;
}

function loadOverpayCompanies() {
  const p = join(ROOT, 'data/overpay-signals/CURRENT.md');
  if (!existsSync(p)) return [];
  const txt = readFileSync(p, 'utf8');
  return [...txt.matchAll(/^##\s+(.+?)(?:\s+\(|—|$)/gm)]
    .map(m => m[1].trim().toLowerCase());
}

function loadEnrichments() {
  const dir = join(ROOT, 'data/role-enrichment');
  if (!existsSync(dir)) return new Map();
  const map = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (!j.company || !j.role) continue;
      map.set((j.company + '|' + j.role).toLowerCase(), {
        file: f,
        tox: j.sentiment?.team_toxicity_grade,
      });
    } catch { /* skip */ }
  }
  return map;
}

function matchEquity(rowCompany, overpayCompanies) {
  const cLower = rowCompany.toLowerCase();
  // Match if overpay heading starts with company name OR contains it
  return overpayCompanies.find(c =>
    c.startsWith(cLower + ' ') || c === cLower || c.includes(cLower) || cLower.includes(c.split(' ')[0])
  );
}

function matchHealth(rowCompany, rowRole, enrichments) {
  const exactKey = (rowCompany + '|' + rowRole).toLowerCase();
  if (enrichments.has(exactKey)) return enrichments.get(exactKey);
  // Tolerant fallback — same logic as build-dashboard.mjs::getRoleEnrichment.
  const cLower = rowCompany.toLowerCase();
  const rPrefix = rowRole.toLowerCase().slice(0, 20);
  for (const [k, v] of enrichments) {
    if (k.startsWith(cLower + '|') && k.slice(cLower.length + 1, cLower.length + 21) === rPrefix) {
      return v;
    }
  }
  return null;
}

function audit() {
  const rows = parseTracker();
  const overpay = loadOverpayCompanies();
  const enrichments = loadEnrichments();

  const missingEquity = [];
  const missingHealth = [];
  for (const r of rows) {
    if (!matchEquity(r.company, overpay)) missingEquity.push(r);
    if (!matchHealth(r.company, r.role, enrichments)) missingHealth.push(r);
  }

  return {
    generated_at: new Date().toISOString(),
    apply_now_rows: rows.length,
    equity: {
      covered: rows.length - missingEquity.length,
      missing: missingEquity.length,
      missing_rows: missingEquity,
    },
    health: {
      covered: rows.length - missingHealth.length,
      missing: missingHealth.length,
      missing_rows: missingHealth,
    },
    overpay_companies_in_file: overpay.length,
    enrichment_files: enrichments.size,
  };
}

function fmtCmd(label, cmd) {
  return `  # ${label}\n  ${cmd}`;
}

function buildCommands(report) {
  const cmds = [];
  if (report.health.missing > 0) {
    const nums = report.health.missing_rows.map(r => r.num).join(',');
    cmds.push({
      label: `Backfill health (role-enrichment) for ${report.health.missing} row(s)`,
      cmd: `node scripts/enrich-apply-now.mjs --rows=${nums}`,
      cost_estimate_usd: report.health.missing * 0.10,
    });
  }
  if (report.equity.missing > 0) {
    cmds.push({
      label: `Refresh equity (overpay-signals) — covers ALL queue companies, including the ${report.equity.missing} missing`,
      cmd: `node scripts/rebuild-apply-now-queue.mjs && node scripts/overpay-signals.mjs`,
      cost_estimate_usd: 5, // rough — headless Opus + WebSearch
    });
  }
  return cmds;
}

function renderMarkdown(report, cmds) {
  const out = [];
  out.push(`# Coverage Audit — ${TODAY}`);
  out.push('');
  out.push(`Apply-now filter: score ≥ ${SCORE_FLOOR}, status ∈ {Evaluated, Responded}`);
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push(`- **Apply-now rows:** ${report.apply_now_rows}`);
  out.push(`- **Equity coverage:** ${report.equity.covered}/${report.apply_now_rows} (${Math.round(100 * report.equity.covered / Math.max(1, report.apply_now_rows))}%)`);
  out.push(`- **Health coverage:** ${report.health.covered}/${report.apply_now_rows} (${Math.round(100 * report.health.covered / Math.max(1, report.apply_now_rows))}%)`);
  out.push('');
  if (report.equity.missing > 0) {
    out.push('## Missing equity (data/overpay-signals/CURRENT.md)');
    out.push('');
    out.push('| # | Score | Company | Role |');
    out.push('|---|-------|---------|------|');
    for (const r of report.equity.missing_rows) {
      out.push(`| ${r.num} | ${r.score} | ${r.company} | ${r.role} |`);
    }
    out.push('');
  }
  if (report.health.missing > 0) {
    out.push('## Missing health (data/role-enrichment/*.json)');
    out.push('');
    out.push('| # | Score | Company | Role |');
    out.push('|---|-------|---------|------|');
    for (const r of report.health.missing_rows) {
      out.push(`| ${r.num} | ${r.score} | ${r.company} | ${r.role} |`);
    }
    out.push('');
  }
  if (cmds.length) {
    out.push('## Fix commands');
    out.push('');
    out.push('```bash');
    let total = 0;
    for (const c of cmds) {
      out.push(fmtCmd(c.label + ` (~$${c.cost_estimate_usd.toFixed(2)})`, c.cmd));
      total += c.cost_estimate_usd;
    }
    out.push('```');
    out.push('');
    out.push(`Estimated total spend: **~$${total.toFixed(2)}**.`);
    out.push('');
    out.push('Re-run with `--apply` to execute. Re-run with `--print-cmds` to see commands only.');
  } else {
    out.push('## Status: ✓ All apply-now rows fully covered.');
  }
  out.push('');
  return out.join('\n');
}

async function main() {
  const report = audit();
  const cmds = buildCommands(report);

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify({ report, fix_commands: cmds }, null, 2) + '\n');
    process.exit(report.equity.missing > 0 || report.health.missing > 0 ? 1 : 0);
  }

  if (PRINT_CMDS) {
    for (const c of cmds) {
      console.log(`# ${c.label} (~$${c.cost_estimate_usd.toFixed(2)})`);
      console.log(c.cmd);
    }
    process.exit(report.equity.missing > 0 || report.health.missing > 0 ? 1 : 0);
  }

  // Default: write report + optionally apply
  const md = renderMarkdown(report, cmds);
  const mdPath = join(ROOT, `data/coverage-audit-${TODAY}.md`);
  const jsonPath = join(ROOT, `data/coverage-audit-${TODAY}.json`);
  writeFileSync(mdPath, md);
  writeFileSync(jsonPath, JSON.stringify({ report, fix_commands: cmds }, null, 2));
  console.log(md);
  console.log(`Report: ${mdPath}`);
  console.log(`JSON:   ${jsonPath}`);

  if (APPLY && cmds.length) {
    console.log('\n--- APPLY MODE: executing fix commands ---\n');
    for (const c of cmds) {
      console.log(`> ${c.cmd}`);
      const parts = c.cmd.split(/\s*&&\s*/);
      for (const part of parts) {
        const argv = part.trim().split(/\s+/);
        const res = spawnSync(argv[0], argv.slice(1), { cwd: ROOT, stdio: 'inherit' });
        if (res.status !== 0) {
          console.error(`  ✗ exit ${res.status} — stopping`);
          process.exit(res.status || 1);
        }
      }
    }
    console.log('\n--- re-auditing post-apply ---\n');
    const report2 = audit();
    console.log(`Equity: ${report2.equity.covered}/${report2.apply_now_rows} · Health: ${report2.health.covered}/${report2.apply_now_rows}`);
    process.exit(report2.equity.missing > 0 || report2.health.missing > 0 ? 1 : 0);
  }
  process.exit(report.equity.missing > 0 || report.health.missing > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
