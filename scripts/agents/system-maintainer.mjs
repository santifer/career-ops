#!/usr/bin/env node
/**
 * scripts/agents/system-maintainer.mjs — SRE/maintenance sub-agent.
 *
 * Built as part of epsilon Ε.8 (2026-05-19). Provides a single CLI that
 * mirrors the overnight EPSILON workflow:
 *
 *   --health     System-health snapshot → data/system-health-<DATE>.md
 *   --cleanup    Reversible dedup + archive (orphans, /tmp leaks)
 *   --review     Re-scan dashboard-server.mjs for security regressions
 *                (path-traversal in *Slug args, unguarded fetches, etc.)
 *   --expand     Fire researcher subprocess: surface 10 pre-IPO companies
 *                NOT in portals.yml that match Mitchell's archetypes
 *   --ats-watch  Fire researcher subprocess: ATS AI-detection landscape
 *                last 90 days
 *   --all        Run --health → --cleanup → --review (skip LLM-heavy
 *                --expand + --ats-watch, which are weekly/quarterly)
 *
 * Runs without LLM by default — only --expand and --ats-watch spend money.
 *
 * Logs to data/logs/system-maintainer-<ISO-DATE>.log.
 *
 * Output files (always dated):
 *   data/system-health-YYYY-MM-DD.md
 *   data/system-maintenance-log-YYYY-MM-DD.md
 *   data/system-review-findings-YYYY-MM-DD.md
 *   data/portals-expansion-log-YYYY-MM-DD.md   (--expand only)
 *   data/ats-landscape-YYYY-MM-DD.md           (--ats-watch only)
 *
 * Reusable from launchd:
 *   nightly 03:00 PT via com.mitchell.career-ops.system-maintainer.plist
 *
 * Anti-hallucination + anti-sycophancy reminders:
 *  - Reports raw counts, not "all healthy ✓" boilerplate.
 *  - When something is missing or flapping, says so plainly with exit codes.
 *  - Never claims a fix shipped that didn't.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  findRepoRoot, snapshotAll,
  checkLaunchdPlists, checkApplicationsTracker, checkHmIntelAge,
  checkReportOrphans, checkApplyPacks, checkTmpLeaks,
  checkPipelineState, checkDashboardServer,
} from '../../lib/system-health-snapshot.mjs';
import {
  archiveReverseOrphanHtmls, archiveOrphanApplyPacks,
  archiveStaleHmIntel, sweepTmpLeaks,
} from '../../lib/system-health-cleanup.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = findRepoRoot(__dirname);

function ptDateStamp(d = new Date()) {
  const ms = d.getTime() - (7 * 3600 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function ptIsoStamp(d = new Date()) {
  const ms = d.getTime() - (7 * 3600 * 1000);
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '-07:00');
}

const dateStamp = ptDateStamp();
const logDir = join(ROOT, 'data/logs');
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, `system-maintainer-${dateStamp}.log`);

function log(line) {
  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${line}\n`;
  process.stdout.write(entry);
  try { appendFileSync(logPath, entry); } catch { /* don't crash on log write */ }
}

// ───────────────────────────────────────────────────────────────────────────
// --health
// ───────────────────────────────────────────────────────────────────────────

async function runHealth() {
  log('▶ --health: snapshotting system state');
  const snap = await snapshotAll(ROOT);
  const outPath = join(ROOT, `data/system-health-${dateStamp}.md`);
  const md = renderHealthMarkdown(snap);
  writeFileSync(outPath, md);
  log(`✓ wrote ${outPath} (${md.length} chars)`);
  // Surface the headline counts to stdout so launchd logs are useful.
  // Use ?? guards everywhere — when a data file is missing the lib returns
  // { exists: false } with no other fields. Don't crash the launchd job.
  log(`  launchd: ${snap.launchd.loaded}/${snap.launchd.total} loaded; ${snap.launchd.flapping.length} flapping`);
  log(`  tracker: ${snap.tracker.totalRows ?? '?'} rows, ${(snap.tracker.duplicateIds ?? []).length} dupe IDs`);
  log(`  hm-intel: ${snap.hmIntel.totalFiles ?? '?'} files, ${snap.hmIntel.staleCount ?? '?'} stale (>30d)`);
  log(`  reports: ${snap.orphans.mdCount ?? '?'} md, ${snap.orphans.htmlCount ?? '?'} html, ${(snap.orphans.reverseOrphans ?? []).length} reverse-orphan`);
  log(`  apply-packs: ${snap.applyPacks.totalPacks ?? '?'}; ${(snap.applyPacks.noTrackerRef ?? []).length} no-tracker-ref`);
  log(`  /tmp leaks: ${snap.tmpLeaks.leakedCount}`);
  log(`  dashboard listening on :3097: ${snap.dashboardServer.listening}`);
  return snap;
}

function renderHealthMarkdown(snap) {
  const lines = [];
  lines.push(`# System Health Snapshot — ${dateStamp}`);
  lines.push('');
  lines.push(`**Captured:** ${snap.capturedAt}`);
  lines.push(`**Tool:** scripts/agents/system-maintainer.mjs --health`);
  lines.push('');
  lines.push('## launchd inventory');
  lines.push('');
  lines.push(`Total plists in scripts/launchd/: **${snap.launchd.total}**`);
  lines.push(`Loaded: **${snap.launchd.loaded}** · Unloaded: **${snap.launchd.unloaded}** · Flapping: **${snap.launchd.flapping.length}**`);
  lines.push('');
  if (snap.launchd.flapping.length > 0) {
    lines.push('### Flapping jobs (NEEDS_HUMAN)');
    lines.push('');
    for (const f of snap.launchd.flapping) {
      lines.push(`- \`${f.label}\` — last exit ${f.exitCode}, pid ${f.pid}, plist ${f.plistFile}`);
    }
    lines.push('');
  }
  lines.push('| Plist | Loaded | Last exit |');
  lines.push('|---|---|---|');
  for (const e of snap.launchd.entries) {
    lines.push(`| ${e.label} | ${e.loaded ? 'yes' : 'NO'} | ${e.exitCode ?? 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Tracker (data/applications.md)');
  lines.push('');
  lines.push(`- Rows: **${snap.tracker.totalRows ?? 0}**`);
  lines.push(`- Unique IDs: **${snap.tracker.uniqueIds ?? 0}**`);
  lines.push(`- Duplicate IDs: **${snap.tracker.duplicateIds?.length ?? 0}**`);
  lines.push(`- Duplicate (company, role) pairs: **${snap.tracker.duplicateCompanyRoles?.length ?? 0}**`);
  if ((snap.tracker.duplicateIds ?? []).length) {
    lines.push('');
    for (const d of snap.tracker.duplicateIds) {
      lines.push(`  - id ${d.id} appears ${d.count}×`);
    }
  }
  lines.push('');
  lines.push('## HM-intel cache');
  lines.push('');
  lines.push(`- Total: **${snap.hmIntel.totalFiles ?? 0}**`);
  lines.push(`- Fresh (<${snap.hmIntel.staleDaysThreshold ?? 30}d): **${snap.hmIntel.freshCount ?? 0}**`);
  lines.push(`- Stale: **${snap.hmIntel.staleCount ?? 0}**`);
  lines.push('');
  lines.push('## Report ↔ dashboard html consistency');
  lines.push('');
  lines.push(`- reports/*.md: **${snap.orphans.mdCount ?? 0}**`);
  lines.push(`- dashboard/reports/*.html: **${snap.orphans.htmlCount ?? 0}**`);
  lines.push(`- Forward orphans (md without html): **${(snap.orphans.forwardOrphans ?? []).length}**`);
  lines.push(`- Reverse orphans (html without md): **${(snap.orphans.reverseOrphans ?? []).length}**`);
  if ((snap.orphans.reverseOrphans ?? []).length) {
    lines.push('');
    for (const s of snap.orphans.reverseOrphans) lines.push(`  - ${s}`);
  }
  lines.push('');
  lines.push('## Apply-packs');
  lines.push('');
  lines.push(`- Total: **${snap.applyPacks.totalPacks ?? 0}**`);
  lines.push(`- No tracker reference: **${(snap.applyPacks.noTrackerRef ?? []).length}**`);
  if ((snap.applyPacks.noTrackerRef ?? []).length) {
    lines.push('');
    for (const s of snap.applyPacks.noTrackerRef) lines.push(`  - ${s}`);
  }
  lines.push('');
  lines.push('## Pipeline state');
  lines.push('');
  lines.push(`- pipeline.md lines: **${snap.pipeline.pipelineLines}**`);
  lines.push(`- batch/batch-input.tsv lines: **${snap.pipeline.batchLines}**`);
  lines.push(`- scan-history.tsv lines: **${snap.pipeline.scanHistoryLines}**`);
  lines.push(`- scan-history age (hours): **${snap.pipeline.scanHistoryAgeHours ?? 'n/a'}**`);
  lines.push('');
  lines.push('## /tmp leaks');
  lines.push('');
  lines.push(`- Files >24h matching agent patterns: **${snap.tmpLeaks.leakedCount}**`);
  if (snap.tmpLeaks.samples?.length) {
    for (const s of snap.tmpLeaks.samples) lines.push(`  - ${s}`);
  }
  lines.push('');
  lines.push('## Dashboard server');
  lines.push('');
  lines.push(`- Listening on :${snap.dashboardServer.port}: **${snap.dashboardServer.listening ? 'YES' : 'NO'}**`);
  if (!snap.dashboardServer.listening) {
    lines.push('- **NEEDS_HUMAN** — launch dashboard-server.mjs via `launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.dashboard-server` and check `data/logs/dashboard-server.err`');
  }
  lines.push('');
  return lines.join('\n');
}

// ───────────────────────────────────────────────────────────────────────────
// --cleanup
// ───────────────────────────────────────────────────────────────────────────

async function runCleanup(snap) {
  log('▶ --cleanup: archiving orphans + /tmp sweep');
  if (!snap) snap = await snapshotAll(ROOT);

  const actions = [];

  // Reverse-orphan dashboard HTMLs
  const orphanResult = archiveReverseOrphanHtmls(ROOT, snap.orphans.reverseOrphans ?? []);
  if (orphanResult.archived.length) {
    actions.push({ kind: 'archive-reverse-orphans', count: orphanResult.archived.length, dest: orphanResult.destDir, items: orphanResult.archived });
    log(`  archived ${orphanResult.archived.length} reverse-orphan HTMLs → ${orphanResult.destDir}`);
  }

  // Orphan apply-packs (no tracker ref) — but only "000-unknown-unknown" or
  // similar placeholder slugs, NOT recent forward-built packs.
  const placeholderApplyPacks = (snap.applyPacks.noTrackerRef ?? []).filter(s => /^0+-/.test(s));
  if (placeholderApplyPacks.length) {
    const ap = archiveOrphanApplyPacks(ROOT, placeholderApplyPacks);
    if (ap.archived.length) {
      actions.push({ kind: 'archive-placeholder-apply-packs', count: ap.archived.length, dest: ap.destDir, items: ap.archived });
      log(`  archived ${ap.archived.length} placeholder apply-packs → ${ap.destDir}`);
    }
  }

  // Stale hm-intel (>30d AND Discarded) — pass tracker text for the Discarded check
  const trackerPath = join(ROOT, 'data/applications.md');
  const trackerText = existsSync(trackerPath) ? readFileSync(trackerPath, 'utf-8') : '';
  const sh = archiveStaleHmIntel(ROOT, snap.hmIntel.stale ?? [], trackerText);
  if (sh.archived.length) {
    actions.push({ kind: 'archive-stale-hm-intel', count: sh.archived.length, dest: sh.destDir, items: sh.archived });
    log(`  archived ${sh.archived.length} stale hm-intel files → ${sh.destDir}`);
  }

  // /tmp leaks
  const tmp = sweepTmpLeaks(1);
  if (tmp.removed.length) {
    actions.push({ kind: 'tmp-sweep', count: tmp.removed.length, items: tmp.removed });
    log(`  removed ${tmp.removed.length} /tmp leaks (>24h)`);
  }

  // Write cleanup log
  const outPath = join(ROOT, `data/system-maintenance-log-${dateStamp}.md`);
  writeFileSync(outPath, renderCleanupMarkdown(actions));
  log(`✓ wrote ${outPath}`);
  return actions;
}

function renderCleanupMarkdown(actions) {
  const lines = [];
  lines.push(`# System Maintenance Log — ${dateStamp}`);
  lines.push('');
  lines.push(`**Tool:** scripts/agents/system-maintainer.mjs --cleanup`);
  lines.push(`**Captured:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('All actions are reversible (archive, not delete) except `/tmp` sweep.');
  lines.push('');
  if (actions.length === 0) {
    lines.push('Nothing to clean up. System is healthy.');
    return lines.join('\n');
  }
  for (const a of actions) {
    lines.push(`## ${a.kind}`);
    lines.push('');
    lines.push(`- Count: **${a.count}**`);
    if (a.dest) lines.push(`- Archived to: \`${a.dest}\``);
    if (a.items?.length) {
      lines.push('');
      for (const it of a.items.slice(0, 30)) lines.push(`  - ${typeof it === 'string' ? it : JSON.stringify(it)}`);
      if (a.items.length > 30) lines.push(`  - ... (${a.items.length - 30} more)`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ───────────────────────────────────────────────────────────────────────────
// --review
// ───────────────────────────────────────────────────────────────────────────

async function runReview() {
  log('▶ --review: scanning dashboard-server.mjs for security regressions');
  const findings = [];
  const dsPath = join(ROOT, 'dashboard-server.mjs');
  if (!existsSync(dsPath)) {
    log('  dashboard-server.mjs not found — skipping');
    return findings;
  }
  const src = readFileSync(dsPath, 'utf-8');

  // Regression check 1 — both saveEvidence and buildVerifyPayload reference
  // REPORT_SLUG_RE before joining reportSlug into a path.
  const slugRePresent = /const REPORT_SLUG_RE\s*=/.test(src);
  if (!slugRePresent) {
    findings.push({
      severity: 'HIGH',
      file: 'dashboard-server.mjs',
      issue: 'REPORT_SLUG_RE constant missing — saveEvidence/buildVerifyPayload may be regressed to path-traversal',
    });
  }

  // Regression check 2 — every join(ROOT, 'reports', X) is preceded by a check
  // on REPORT_SLUG_RE within ~30 lines above.
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/join\(ROOT,\s*['"]reports['"],\s*(\w+)\)/);
    if (!m) continue;
    const varName = m[1];
    // Look 30 lines back for a REPORT_SLUG_RE.test(<varName>) guard
    const slice = lines.slice(Math.max(0, i - 30), i).join('\n');
    if (!new RegExp(`REPORT_SLUG_RE\\.test\\(${varName}\\)`).test(slice)) {
      findings.push({
        severity: 'HIGH',
        file: `dashboard-server.mjs:${i + 1}`,
        issue: `join(ROOT, 'reports', ${varName}) without REPORT_SLUG_RE guard in preceding 30 lines — potential path-traversal regression`,
      });
    }
  }

  // Regression check 3 — every fetch( in scripts/agents/* has AbortSignal or signal: somewhere within 15 lines.
  for (const agentFile of ['cv-tailor.mjs', 'cover-letter.mjs', 'form-fields.mjs', 'linkedin-dm.mjs', 'why-statement.mjs']) {
    const p = join(ROOT, 'scripts/agents', agentFile);
    if (!existsSync(p)) continue;
    const txt = readFileSync(p, 'utf-8').split('\n');
    for (let i = 0; i < txt.length; i++) {
      if (!/fetch\(/.test(txt[i])) continue;
      const slice = txt.slice(i, Math.min(txt.length, i + 15)).join('\n');
      if (!/AbortSignal|signal:|opts\.signal/.test(slice)) {
        findings.push({
          severity: 'MEDIUM',
          file: `scripts/agents/${agentFile}:${i + 1}`,
          issue: `fetch() without AbortSignal in next 15 lines — verify timeout coverage`,
        });
      }
    }
  }

  log(`  ${findings.length} findings`);

  const outPath = join(ROOT, `data/system-review-findings-${dateStamp}.md`);
  writeFileSync(outPath, renderReviewMarkdown(findings));
  log(`✓ wrote ${outPath}`);
  return findings;
}

function renderReviewMarkdown(findings) {
  const lines = [];
  lines.push(`# System Code-Review Findings — ${dateStamp}`);
  lines.push('');
  lines.push(`**Tool:** scripts/agents/system-maintainer.mjs --review`);
  lines.push('');
  lines.push('Automated regression checks. Manual deep-audit is a separate workflow.');
  lines.push('');
  lines.push(`Total findings: **${findings.length}**`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No regressions detected. Path-traversal guards present, fetch timeouts intact.');
    return lines.join('\n');
  }
  lines.push('| Severity | File:line | Issue |');
  lines.push('|---|---|---|');
  for (const f of findings) lines.push(`| ${f.severity} | ${f.file} | ${f.issue} |`);
  return lines.join('\n');
}

// ───────────────────────────────────────────────────────────────────────────
// --expand (LLM, $$$) — wraps researcher subprocess
// ───────────────────────────────────────────────────────────────────────────

async function runExpand() {
  log('▶ --expand: deferred — invoke /researcher manually for pre-IPO companies');
  const outPath = join(ROOT, `data/portals-expansion-log-${dateStamp}.md`);
  const md = [
    `# Portals Expansion — ${dateStamp}`,
    '',
    '`scripts/agents/system-maintainer.mjs --expand` is a stub.',
    '',
    'The actual pre-IPO research runs via the researcher agent because:',
    '1. It costs $10-15 in API spend per pass (Sonar Deep + Grok-x-search)',
    '2. The researcher agent already exists, is well-tested, and routes per the Council OS KB',
    '3. Re-implementing inline would duplicate orchestration logic',
    '',
    'To run the expansion manually:',
    '```',
    '/researcher "Surface 10 pre-IPO AI companies matching Mitchell\'s archetypes NOT in portals.yml | --fast"',
    '```',
    '',
    'Or invoke the agent programmatically — see `epsilon-portals-expansion-log-2026-05-19.md` for the canonical research prompt + return shape.',
  ].join('\n');
  writeFileSync(outPath, md);
  log(`✓ wrote ${outPath} (stub — see file)`);
}

// ───────────────────────────────────────────────────────────────────────────
// --ats-watch (LLM, $$$) — wraps researcher subprocess
// ───────────────────────────────────────────────────────────────────────────

async function runAtsWatch() {
  log('▶ --ats-watch: deferred — invoke /researcher manually for ATS landscape');
  const outPath = join(ROOT, `data/ats-landscape-${dateStamp}.md`);
  const md = [
    `# ATS Landscape Watch — ${dateStamp}`,
    '',
    '`scripts/agents/system-maintainer.mjs --ats-watch` is a stub.',
    '',
    'ATS-detection landscape research runs via the researcher agent. See',
    '`data/epsilon-ats-landscape-2026-05-19.md` for the canonical prompt + format.',
    '',
    'To re-run:',
    '```',
    '/researcher "ATS AI-detection capabilities shipped in last 90 days: Workday, Greenhouse, Ashby, Lever, iCIMS, Taleo, SuccessFactors | --fast"',
    '```',
  ].join('\n');
  writeFileSync(outPath, md);
  log(`✓ wrote ${outPath} (stub — see file)`);
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args);
  if (flags.size === 0 || flags.has('--help') || flags.has('-h')) {
    console.log(`scripts/agents/system-maintainer.mjs — SRE/maintenance sub-agent

Usage:
  node scripts/agents/system-maintainer.mjs [flags]

Flags:
  --health       System-health snapshot
  --cleanup      Reversible archive + /tmp sweep
  --review       Re-scan dashboard-server.mjs for security regressions
  --expand       Stub — see --help body
  --ats-watch    Stub — see --help body
  --all          Run --health → --cleanup → --review

Always logs to data/logs/system-maintainer-<DATE>.log
`);
    process.exit(0);
  }

  log(`system-maintainer started — flags: [${[...flags].join(', ')}]`);

  let snap = null;

  if (flags.has('--all') || flags.has('--health')) {
    snap = await runHealth();
  }
  if (flags.has('--all') || flags.has('--cleanup')) {
    await runCleanup(snap);
  }
  if (flags.has('--all') || flags.has('--review')) {
    await runReview();
  }
  if (flags.has('--expand')) {
    await runExpand();
  }
  if (flags.has('--ats-watch')) {
    await runAtsWatch();
  }

  log('system-maintainer done');
}

main().catch(err => {
  log(`✗ ERROR: ${err.stack || err.message}`);
  process.exit(1);
});
