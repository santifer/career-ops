// lib/system-health-snapshot.mjs — Reusable health-snapshot primitives.
//
// Authored as part of epsilon Ε.8 (2026-05-19). Each function returns
// structured findings rather than printing. The system-maintainer CLI
// (scripts/agents/system-maintainer.mjs) composes them into a markdown
// report identical in shape to data/epsilon-system-health-2026-05-19.md.
//
// Reusable from:
//   - scripts/agents/system-maintainer.mjs --health
//   - launchd nightly run (com.mitchell.career-ops.system-maintainer)
//   - ad-hoc CLI: `node -e "import('./lib/system-health-snapshot.mjs').then(m => m.snapshotAll().then(console.log))"`

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

/** Resolve repo root.
 *  Priority: (1) process.cwd() if it has AGENTS.md + dashboard-server.mjs — this
 *  honors the launchd WorkingDirectory setting and lets the agent run against
 *  main checkout even if the script file itself lives in a worktree. (2) Walk
 *  up from startDir as a fallback. */
export function findRepoRoot(startDir) {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'AGENTS.md')) && existsSync(join(cwd, 'dashboard-server.mjs'))) {
    return cwd;
  }
  let d = startDir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, 'AGENTS.md')) && existsSync(join(d, 'dashboard-server.mjs'))) {
      return d;
    }
    const up = join(d, '..');
    if (up === d) break;
    d = up;
  }
  throw new Error('Could not locate career-ops repo root');
}

/** Inventory all scripts/launchd/*.plist + their load status + last exit code. */
export function checkLaunchdPlists(root) {
  const plistDir = join(root, 'scripts/launchd');
  if (!existsSync(plistDir)) return { total: 0, loaded: 0, unloaded: 0, flapping: [], entries: [] };
  const plistFiles = readdirSync(plistDir).filter(f => f.endsWith('.plist'));
  let launchctlListOut = '';
  try { launchctlListOut = execSync('launchctl list 2>/dev/null', { encoding: 'utf-8' }); }
  catch { /* launchctl not available — return all unloaded */ }
  const launchctlLines = launchctlListOut.split('\n');
  const entries = [];
  let loaded = 0;
  const flapping = [];
  for (const f of plistFiles) {
    const plistPath = join(plistDir, f);
    let label;
    try {
      const content = readFileSync(plistPath, 'utf-8');
      const m = content.match(/<key>Label<\/key>\s*<string>([^<]+)<\/string>/);
      label = m ? m[1].trim() : f.replace(/\.plist$/, '');
    } catch { label = f.replace(/\.plist$/, ''); }
    const lctlLine = launchctlLines.find(l => l.includes(label));
    if (lctlLine) {
      loaded++;
      const cols = lctlLine.trim().split(/\s+/);
      const pid = cols[0];
      const exitCode = parseInt(cols[1], 10);
      const isFlap = (pid === '-' && exitCode !== 0 && !Number.isNaN(exitCode));
      if (isFlap) flapping.push({ label, pid, exitCode, plistFile: f });
      entries.push({ label, plistFile: f, loaded: true, pid, exitCode });
    } else {
      entries.push({ label, plistFile: f, loaded: false, pid: null, exitCode: null });
    }
  }
  return {
    total: plistFiles.length,
    loaded,
    unloaded: plistFiles.length - loaded,
    flapping,
    entries,
  };
}

/** Find duplicate IDs and (company, role) collisions in data/applications.md. */
export function checkApplicationsTracker(root) {
  const fp = join(root, 'data/applications.md');
  if (!existsSync(fp)) return { exists: false };
  const lines = readFileSync(fp, 'utf-8').split('\n');
  const ids = [];
  const companyRolePairs = new Map();
  for (const line of lines) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([^|]*)\s*\|\s*([^|]*)\s*\|\s*([^|]*)\s*\|/);
    if (!m) continue;
    ids.push(parseInt(m[1], 10));
    const company = (m[3] || '').trim();
    const role    = (m[4] || '').trim();
    const key = `${company}|${role}`;
    companyRolePairs.set(key, (companyRolePairs.get(key) || 0) + 1);
  }
  const idCounts = ids.reduce((m, id) => { m.set(id, (m.get(id) || 0) + 1); return m; }, new Map());
  const duplicateIds = [...idCounts.entries()].filter(([_, n]) => n > 1).map(([id, n]) => ({ id, count: n }));
  const duplicateCompanyRoles = [...companyRolePairs.entries()]
    .filter(([_, n]) => n > 1)
    .map(([key, n]) => { const [company, role] = key.split('|'); return { company, role, count: n }; });
  return {
    exists: true,
    totalRows: ids.length,
    uniqueIds: idCounts.size,
    duplicateIds,
    duplicateCompanyRoles,
  };
}

/** Bucket hm-intel files by age. */
export function checkHmIntelAge(root, staleDays = 30) {
  const dir = join(root, 'data/hm-intel');
  if (!existsSync(dir)) return { exists: false };
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const now = Date.now();
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  const stale = [];
  const fresh = [];
  for (const f of files) {
    const p = join(dir, f);
    const m = statSync(p).mtimeMs;
    if (now - m > staleMs) stale.push({ file: f, ageDays: Math.round((now - m) / 86400000) });
    else fresh.push({ file: f, ageDays: Math.round((now - m) / 86400000) });
  }
  return { exists: true, totalFiles: files.length, freshCount: fresh.length, staleCount: stale.length, stale, staleDaysThreshold: staleDays };
}

/** Compare reports/*.md basenames vs dashboard/reports/*.html basenames. */
export function checkReportOrphans(root) {
  const repDir = join(root, 'reports');
  const htmlDir = join(root, 'dashboard/reports');
  if (!existsSync(repDir) || !existsSync(htmlDir)) return { exists: false };
  const mdBase = new Set(readdirSync(repDir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')));
  const htmlBase = new Set(readdirSync(htmlDir).filter(f => f.endsWith('.html')).map(f => f.replace(/\.html$/, '')));
  const forwardOrphans = [...mdBase].filter(b => !htmlBase.has(b));
  const reverseOrphans = [...htmlBase].filter(b => !mdBase.has(b));
  return {
    exists: true,
    mdCount: mdBase.size,
    htmlCount: htmlBase.size,
    forwardOrphans, // .md exists, no .html
    reverseOrphans, // .html exists, no .md
  };
}

/** Inventory apply-packs and check tracker coverage. */
export function checkApplyPacks(root) {
  const dir = join(root, 'data/apply-packs');
  if (!existsSync(dir)) return { exists: false };
  const slugs = readdirSync(dir).filter(s => statSync(join(dir, s)).isDirectory());
  const trackerPath = join(root, 'data/applications.md');
  const trackerText = existsSync(trackerPath) ? readFileSync(trackerPath, 'utf-8') : '';
  const noTrackerRef = slugs.filter(s => !trackerText.includes(s));
  return {
    exists: true,
    totalPacks: slugs.length,
    noTrackerRef,
  };
}

/** /tmp leak check — files matching agent patterns older than 24h. */
export function checkTmpLeaks() {
  try {
    const out = execSync(
      'find /tmp -type f -mtime +1 -size +1c 2>/dev/null | grep -iE "career|claude|agent|cv-tailor|dealbreaker|council" | head -50',
      { encoding: 'utf-8' }
    );
    const lines = out.split('\n').filter(Boolean);
    return { leakedCount: lines.length, samples: lines.slice(0, 10) };
  } catch {
    return { leakedCount: 0, samples: [] };
  }
}

/** Pipeline + scan state. */
export function checkPipelineState(root) {
  const pipelineMd = join(root, 'data/pipeline.md');
  const batchInput = join(root, 'batch/batch-input.tsv');
  const scanHistory = join(root, 'data/scan-history.tsv');
  let pipelineLines = 0, batchLines = 0, scanLines = 0, scanMtimeMs = 0;
  if (existsSync(pipelineMd)) pipelineLines = readFileSync(pipelineMd, 'utf-8').split('\n').length;
  if (existsSync(batchInput)) batchLines = readFileSync(batchInput, 'utf-8').split('\n').length;
  if (existsSync(scanHistory)) {
    scanLines = readFileSync(scanHistory, 'utf-8').split('\n').length;
    scanMtimeMs = statSync(scanHistory).mtimeMs;
  }
  const scanAgeHours = scanMtimeMs ? Math.round((Date.now() - scanMtimeMs) / 3600000) : null;
  return { pipelineLines, batchLines, scanHistoryLines: scanLines, scanHistoryAgeHours: scanAgeHours };
}

/** Dashboard server listen check. */
export function checkDashboardServer(port = 3097) {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} 2>&1 | grep -v "^$" | head -3`, { encoding: 'utf-8' });
    return { port, listening: out.includes('LISTEN'), output: out.trim() };
  } catch {
    return { port, listening: false, output: '' };
  }
}

/** Compose full snapshot. */
export async function snapshotAll(root) {
  return {
    capturedAt: new Date().toISOString(),
    launchd: checkLaunchdPlists(root),
    tracker: checkApplicationsTracker(root),
    hmIntel: checkHmIntelAge(root),
    orphans: checkReportOrphans(root),
    applyPacks: checkApplyPacks(root),
    tmpLeaks: checkTmpLeaks(),
    pipeline: checkPipelineState(root),
    dashboardServer: checkDashboardServer(),
  };
}
