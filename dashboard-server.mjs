#!/usr/bin/env node
// dashboard-server.mjs — serves dashboard/index.html + live API endpoints
// Usage: node dashboard-server.mjs [--port=3000]

import { createServer } from 'http';
import { readFileSync, existsSync, readdirSync, appendFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import yaml from 'js-yaml';
import { parseApplicationsFile } from './lib/parse-applications.mjs';
import { statusKey, statusBadgeClass } from './lib/status-key.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '3000');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

// ── Report summary parser ──────────────────────────────────────

function stripMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseReportSummary(reportPath) {
  const empty = { score: null, archetype: null, url: null, legitimacy: null, tldr: null, topEdges: [], topGaps: [] };
  try {
    const abs = join(ROOT, reportPath);
    if (!existsSync(abs)) return empty;
    const text = readFileSync(abs, 'utf8');
    const lines = text.split('\n');

    // Extract header fields
    const scoreMatch   = text.match(/\*\*Score:\*\*\s*([\d.]+)/);
    const archMatch    = text.match(/\*\*Archetype:\*\*\s*([^\n]+)/);
    const urlMatch     = text.match(/\*\*URL:\*\*\s*(https?:\/\/[^\s\n]+)/);
    const legitMatch   = text.match(/\*\*Legitimacy:\*\*\s*([^\n]+)/);

    // TL;DR: text after first ## B) or TLDR or Final Recommendation heading
    let tldr = null;
    const tldrSectionIdx = lines.findIndex(l =>
      /^##\s+B\)/.test(l) || /tldr/i.test(l) || /final recommendation/i.test(l)
    );
    if (tldrSectionIdx >= 0) {
      const chunk = lines.slice(tldrSectionIdx + 1, tldrSectionIdx + 30).join(' ');
      const clean = stripMarkdown(chunk);
      tldr = clean.slice(0, 300) || null;
    }

    // Top edges: first 3 bullet lines after ## D)
    const edgeSectionIdx = lines.findIndex(l => /^##\s+D\b/.test(l));
    let topEdges = [];
    if (edgeSectionIdx >= 0) {
      let count = 0;
      for (let i = edgeSectionIdx + 1; i < lines.length && count < 3; i++) {
        const l = lines[i];
        if (/^##/.test(l)) break;
        if (/^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
          const clean = stripMarkdown(l).slice(0, 120);
          if (clean) { topEdges.push(clean); count++; }
        }
      }
    }

    // Top gaps: first 2 bullet lines after ## E) or ## Gap
    const gapSectionIdx = lines.findIndex(l => /^##\s+E\b/.test(l) || /^##.*gap/i.test(l));
    let topGaps = [];
    if (gapSectionIdx >= 0) {
      let count = 0;
      for (let i = gapSectionIdx + 1; i < lines.length && count < 2; i++) {
        const l = lines[i];
        if (/^##/.test(l)) break;
        if (/^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
          const clean = stripMarkdown(l).slice(0, 100);
          if (clean) { topGaps.push(clean); count++; }
        }
      }
    }

    return {
      score:      scoreMatch  ? parseFloat(scoreMatch[1])       : null,
      archetype:  archMatch   ? archMatch[1].trim()              : null,
      url:        urlMatch    ? urlMatch[1].trim()               : null,
      legitimacy: legitMatch  ? legitMatch[1].trim()             : null,
      tldr,
      topEdges,
      topGaps,
    };
  } catch (_) {
    return empty;
  }
}

// ── Shared parsers ─────────────────────────────────────────────

// parseApplications lives in lib/parse-applications.mjs (single source of
// truth — also used by build-dashboard.mjs). The rest of this file expects
// `r.report` for the report path, but the lib returns `reportPath`; we
// add `report` as an alias here so call sites stay unchanged.
function parseApplications() {
  return parseApplicationsFile(join(ROOT, 'data/applications.md'))
    .map(r => ({ ...r, report: r.reportPath || null }));
}

function parsePipeline() {
  const path = join(ROOT, 'data/pipeline.md');
  if (!existsSync(path)) return { tier1: 0, tier2: 0, tier3: 0, total: 0 };
  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  let tier = 0, t1 = 0, t2 = 0, t3 = 0;
  for (const l of lines) {
    if (l.includes('Tier 1')) tier = 1;
    else if (l.includes('Tier 2')) tier = 2;
    else if (l.includes('Tier 3')) tier = 3;
    if (l.startsWith('- [ ]')) {
      if (tier === 1) t1++;
      else if (tier === 2) t2++;
      else if (tier === 3) t3++;
    }
  }
  return { tier1: t1, tier2: t2, tier3: t3, total: t1 + t2 + t3 };
}

function parseBatch() {
  const statePath = join(ROOT, 'batch/batch-state.tsv');
  const inputPath = join(ROOT, 'batch/batch-input.tsv');
  const batch = { completed: 0, failed: 0, total: 0, runs: 0, recent: [] };

  if (existsSync(statePath)) {
    const lines = readFileSync(statePath, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('id'));
    const startedAts = [];
    for (const l of lines) {
      const [id, url, status, started, completed, report] = l.split('\t');
      if (status === 'completed') {
        batch.completed++;
        batch.recent.push({ id, url, report, completed });
      }
      if (status === 'failed') batch.failed++;
      if (started) startedAts.push(started);
    }
    batch.recent = batch.recent.slice(-10).reverse();
    // Count distinct runs via 15-min gap heuristic on started_at (matches detailBatches).
    const GAP_MS = 15 * 60 * 1000;
    startedAts.sort();
    let prev = 0;
    for (const s of startedAts) {
      const ts = new Date(s).getTime();
      if (!batch.runs || (ts - prev) > GAP_MS) batch.runs++;
      prev = ts;
    }
  }
  if (existsSync(inputPath)) {
    batch.total = readFileSync(inputPath, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('id')).length;
  }
  return batch;
}

function parseScanHistory() {
  const path = join(ROOT, 'data/scan-history.tsv');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('url'))
    .map(l => {
      const [url, first_seen, portal, title, company, status] = l.split('\t');
      return { url, first_seen, portal, title, company, status };
    });
}

// ── Summary stats (30s poll) ───────────────────────────────────

function computeStats() {
  const apps = parseApplications();
  const pipeline = parsePipeline();
  const batch = parseBatch();
  const scanned = parseScanHistory();

  const companies = new Set(apps.map(a => a.company));
  const applyNow = apps.filter(a =>
    a.score >= 4.0 && ['Evaluated','Applied','Interview','Offer'].includes(a.status)
  ).length;
  const applied = apps.filter(a => ['Applied','Interview','Offer'].includes(a.status)).length;

  return {
    applyNow,
    totalEvals: apps.length,
    applied,
    pipelinePending: pipeline.total,
    companies: companies.size,
    scanned: scanned.length,
    batch,
    lastUpdated: new Date().toISOString(),
  };
}

// ── Detail endpoints (on-demand) ───────────────────────────────

function detailApplyNow() {
  const apps = parseApplications();
  const rows = apps
    .filter(a => a.score >= 4.0 && ['Evaluated','Applied','Interview','Offer'].includes(a.status))
    .sort((a, b) => b.score - a.score)
    .slice(0, 200)
    .map(r => ({ ...r, reportSummary: r.report ? parseReportSummary(r.report) : {} }));
  return { title: 'Apply-Now Queue (≥ 4.0)', rows };
}

function detailEvaluations() {
  const apps = parseApplications();
  const buckets = { '4.5+': 0, '4.0–4.4': 0, '3.5–3.9': 0, '3.0–3.4': 0, '<3.0': 0 };
  for (const a of apps) {
    if (a.score >= 4.5) buckets['4.5+']++;
    else if (a.score >= 4.0) buckets['4.0–4.4']++;
    else if (a.score >= 3.5) buckets['3.5–3.9']++;
    else if (a.score >= 3.0) buckets['3.0–3.4']++;
    else buckets['<3.0']++;
  }
  const allSorted = [...apps].sort((a, b) => b.num - a.num).slice(0, 200)
    .map(r => ({ ...r, reportSummary: r.report ? parseReportSummary(r.report) : {} }));
  const recent = allSorted.slice(0, 20);
  const byStatus = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  return { title: 'All Evaluations', buckets, byStatus, recent, rows: allSorted, total: apps.length };
}

function detailApplied() {
  const apps = parseApplications();
  const today = new Date('2026-05-07');
  const rows = apps
    .filter(a => ['Applied','Interview','Offer','Responded'].includes(a.status))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(r => {
      const appDate = new Date(r.date);
      const daysSince = isNaN(appDate) ? null : Math.floor((today - appDate) / 86400000);
      return { ...r, daysSince };
    });
  return { title: 'Applied / In Process', rows };
}

function detailPending() {
  const pipeline = parsePipeline();
  const batch = parseBatch();
  const pct = batch.total > 0 ? Math.round((batch.completed / batch.total) * 100) : 0;

  // Parse actual pipeline items with tier
  const pipelinePath = join(ROOT, 'data/pipeline.md');
  const items = [];
  if (existsSync(pipelinePath)) {
    const content = readFileSync(pipelinePath, 'utf8');
    const lines = content.split('\n');
    let tier = 0;
    for (const l of lines) {
      if (l.includes('Tier 1')) tier = 1;
      else if (l.includes('Tier 2')) tier = 2;
      else if (l.includes('Tier 3')) tier = 3;
      if (l.startsWith('- [ ]') && items.length < 500) {
        const rest = l.replace(/^- \[ \]\s*/, '').trim();
        // Format: URL | Company | Role  or just URL
        const parts = rest.split('|').map(p => p.trim());
        const url     = parts[0] || '';
        const company = parts[1] || '';
        const role    = parts[2] || '';
        items.push({ tier, url, company, role });
      }
    }
  }

  return {
    title: 'Pipeline Pending',
    tiers: [
      { label: 'Tier 1 — Target companies', count: pipeline.tier1 },
      { label: 'Tier 2 — Title match', count: pipeline.tier2 },
      { label: 'Tier 3 — Unknown', count: pipeline.tier3 },
    ],
    total: pipeline.total,
    items,
    batch: { ...batch, pct },
  };
}

function detailCompanies() {
  // 1. Apps grouped by company
  const apps = parseApplications();
  const appByCompany = {};
  for (const a of apps) {
    if (!a.company) continue;
    if (!appByCompany[a.company]) appByCompany[a.company] = { evals: 0, applyNow: 0, totalScore: 0, bestScore: 0, bestRole: '', statuses: {} };
    const c = appByCompany[a.company];
    c.evals++;
    c.totalScore += a.score || 0;
    if ((a.score || 0) > c.bestScore) { c.bestScore = a.score || 0; c.bestRole = a.role || ''; }
    if ((a.score || 0) >= 4.0 && ['Evaluated','Applied','Interview','Offer','Responded'].includes(a.status)) c.applyNow++;
    c.statuses[a.status] = (c.statuses[a.status] || 0) + 1;
  }

  // 2. Scan history grouped by company (last_seen + roles count + first portal seen)
  const scans = parseScanHistory();
  const scanByCompany = {};
  for (const s of scans) {
    if (!s.company) continue;
    if (!scanByCompany[s.company]) scanByCompany[s.company] = { lastScanned: '', portal: '', count: 0 };
    const sc = scanByCompany[s.company];
    sc.count++;
    if ((s.first_seen || '') > sc.lastScanned) sc.lastScanned = s.first_seen || '';
    if (!sc.portal && s.portal) sc.portal = s.portal;
  }

  // 3. portals.yml — enabled tracked companies + portal type
  const portalByCompany = {};
  let trackedTotal = 0;
  try {
    const portalsPath = join(ROOT, 'portals.yml');
    if (existsSync(portalsPath)) {
      const cfg = yaml.load(readFileSync(portalsPath, 'utf8'));
      for (const tc of (cfg?.tracked_companies || [])) {
        if (tc.enabled === false) continue;
        trackedTotal++;
        const api = (tc.api || '') + ' ' + (tc.careers_url || '');
        let portal = '';
        if (api.includes('greenhouse')) portal = 'greenhouse';
        else if (api.includes('ashby')) portal = 'ashby';
        else if (api.includes('lever.co')) portal = 'lever';
        else if (api.includes('workday') || api.includes('myworkdayjobs')) portal = 'workday';
        else if (tc.careers_url) portal = 'web';
        if (tc.name) portalByCompany[tc.name] = portal;
      }
    }
  } catch (err) {
    console.error('[detailCompanies] portals.yml parse error:', err.message);
  }

  // 4. Merge: union of (portal companies, app companies, scan companies)
  const allNames = new Set([
    ...Object.keys(portalByCompany),
    ...Object.keys(appByCompany),
    ...Object.keys(scanByCompany),
  ]);

  const todayMs = Date.now();
  const rows = [];
  for (const name of allNames) {
    if (!name) continue;
    const a = appByCompany[name] || { evals: 0, applyNow: 0, totalScore: 0, bestScore: 0, bestRole: '' };
    const s = scanByCompany[name] || { lastScanned: '', portal: '', count: 0 };
    const portal = portalByCompany[name] || s.portal || '';
    const lastScanned = s.lastScanned || '';
    let daysSinceScan = null;
    if (lastScanned) {
      const ms = todayMs - new Date(lastScanned).getTime();
      if (!isNaN(ms)) daysSinceScan = Math.floor(ms / 86400000);
    }
    rows.push({
      company:       name,
      portal,
      evals:         a.evals,
      applyNow:      a.applyNow,
      lastScanned,
      daysSinceScan,
      rolesFound:    s.count,
      avgScore:      a.evals ? Math.round((a.totalScore / a.evals) * 10) / 10 : 0,
      bestScore:     a.bestScore,
      bestRole:      a.bestRole,
      tracked:       portalByCompany[name] !== undefined,
    });
  }
  rows.sort((x, y) =>
    (y.evals - x.evals) ||
    (y.applyNow - x.applyNow) ||
    (y.rolesFound - x.rolesFound) ||
    x.company.localeCompare(y.company)
  );

  // 5. Bucket counts
  const trackedNow = trackedTotal || rows.filter(r => r.tracked).length;
  const withEvals  = rows.filter(r => r.evals > 0).length;
  const inApplyNow = rows.filter(r => r.applyNow > 0).length;
  const inactive   = rows.filter(r => r.tracked && (r.daysSinceScan == null || r.daysSinceScan > 30)).length;

  return {
    title: 'Companies Tracked',
    buckets: {
      'Total tracked':    trackedNow,
      'With evals':       withEvals,
      'In Apply-Now':     inApplyNow,
      'Inactive (>30d)':  inactive,
    },
    rows,
    total: rows.length,
  };
}

// Group batch-state rows into runs using a gap heuristic on started_at.
// Two consecutive rows (sorted by started_at asc) belong to the same run when
// the gap between starts is ≤ BATCH_RUN_GAP_MIN minutes (default 15).
function detailBatches() {
  const statePath = join(ROOT, 'batch/batch-state.tsv');
  if (!existsSync(statePath)) return { title: 'Batch History', total: 0, batches: [] };

  // Score column in batch-state.tsv is unpopulated (`-`); reach into applications.md.
  const scoreByReportNum = {};
  for (const a of parseApplications()) {
    const n = parseInt(a.num, 10);
    if (!isNaN(n) && a.score) scoreByReportNum[String(n)] = a.score;
  }

  const GAP_MIN = parseInt(process.env.BATCH_RUN_GAP_MIN || '15', 10);
  const GAP_MS  = GAP_MIN * 60 * 1000;

  const rows = readFileSync(statePath, 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('id'))
    .map(l => {
      const [id, url, status, started_at, completed_at, report_num, score, error, retries] = l.split('\t');
      return { id: parseInt(id) || 0, url: url || '', status: status || '', started_at: started_at || '', completed_at: completed_at || '', report_num: report_num || '', error: error !== '-' ? error : null, retries: parseInt(retries) || 0 };
    })
    .filter(r => r.started_at);

  rows.sort((a, b) => a.started_at.localeCompare(b.started_at));

  const groups = [];
  let prevStartMs = 0;
  for (const r of rows) {
    const ts = new Date(r.started_at).getTime();
    if (!groups.length || (ts - prevStartMs) > GAP_MS) groups.push({ rows: [] });
    groups[groups.length - 1].rows.push(r);
    prevStartMs = ts;
  }

  const batches = groups.map(g => {
    const startedAts   = g.rows.map(r => r.started_at).filter(Boolean).sort();
    const completedAts = g.rows.map(r => r.completed_at).filter(Boolean).sort();
    const startedAt    = startedAts[0] || null;
    const completedAt  = completedAts[completedAts.length - 1] || null;
    const durationMs   = (startedAt && completedAt) ? (new Date(completedAt) - new Date(startedAt)) : null;
    const completed = g.rows.filter(r => r.status === 'completed').length;
    const failed    = g.rows.filter(r => r.status === 'failed').length;
    const running   = g.rows.filter(r => r.status === 'running').length;
    const pending   = g.rows.filter(r => !['completed','failed','running'].includes(r.status)).length;

    const scores = g.rows
      .filter(r => r.status === 'completed' && r.report_num && r.report_num !== '-')
      .map(r => scoreByReportNum[String(parseInt(r.report_num, 10))])
      .filter(s => typeof s === 'number' && !isNaN(s) && s > 0);
    const avgScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

    return {
      batch_id: startedAt,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      total: g.rows.length,
      completed, failed, running, pending,
      avgScore,
      reports: g.rows
        .filter(r => r.status === 'completed' && r.report_num && r.report_num !== '-')
        .map(r => ({ id: r.id, report_num: r.report_num, url: r.url, score: scoreByReportNum[String(parseInt(r.report_num, 10))] || null })),
    };
  });

  batches.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
  return { title: 'Batch History', total: batches.length, batches: batches.slice(0, 10) };
}

function detailScanned() {
  const items = parseScanHistory();
  const total = items.length;
  const todayMs = Date.now();
  const dayMs = 86400000;

  // Bucket counts (24h / 7d / 30d / all-time)
  let last24h = 0, last7d = 0, last30d = 0;
  for (const i of items) {
    const t = new Date(i.first_seen || '').getTime();
    if (isNaN(t)) continue;
    const age = todayMs - t;
    if (age <= dayMs) last24h++;
    if (age <= 7 * dayMs) last7d++;
    if (age <= 30 * dayMs) last30d++;
  }

  // Daily counts for last 30 days (chronological asc, zero-fill missing dates)
  const byDate = {};
  for (const i of items) {
    const d = (i.first_seen || '').slice(0, 10);
    if (!d) continue;
    byDate[d] = (byDate[d] || 0) + 1;
  }
  const daily = [];
  const start = new Date(todayMs - 29 * dayMs);
  for (let i = 0; i < 30; i++) {
    const dt = new Date(start.getTime() + i * dayMs);
    const key = dt.toISOString().slice(0, 10);
    daily.push({ date: key, count: byDate[key] || 0 });
  }

  // Recent scan events: aggregate (date, company, portal) → new_roles_found
  const eventsMap = new Map();
  for (const i of items) {
    const date = (i.first_seen || '').slice(0, 10);
    if (!date) continue;
    const key = `${date}|${i.company || ''}|${i.portal || ''}`;
    if (!eventsMap.has(key)) {
      eventsMap.set(key, { timestamp: date, company: i.company || '', portal: i.portal || '', newRolesFound: 0, status: 'success' });
    }
    eventsMap.get(key).newRolesFound++;
  }
  const recent = [...eventsMap.values()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.company.localeCompare(b.company))
    .slice(0, 200);

  // Per-portal breakdown still useful for dashboard tooltips
  const byPortal = {};
  for (const i of items) {
    byPortal[i.portal || 'unknown'] = (byPortal[i.portal || 'unknown'] || 0) + 1;
  }

  return {
    title: 'URLs Scanned',
    total,
    buckets: {
      'Last 24h': last24h,
      'Last 7d':  last7d,
      'Last 30d': last30d,
      'All time': total,
    },
    daily,
    recent,
    byPortal,
  };
}

function batchLive() {
  const statePath = join(ROOT, 'batch/batch-state.tsv');
  const inputPath = join(ROOT, 'batch/batch-input.tsv');
  const triagePath = join(ROOT, 'batch/triage-advance.tsv');

  const stateRows = [];
  let total = 0;

  if (existsSync(statePath)) {
    const lines = readFileSync(statePath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('id'));
    for (const l of lines) {
      const [id, url, status, started_at, completed_at, report_num, score, error, retries] = l.split('\t');
      let company = 'Unknown';
      try {
        const h = new URL(url || '').hostname.replace(/^www\./, '');
        if ((url || '').includes('greenhouse.io')) company = 'Greenhouse';
        else if ((url || '').includes('ashbyhq.com')) company = 'Ashby';
        else if ((url || '').includes('lever.co')) company = 'Lever';
        else company = h.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      } catch (_) {}
      stateRows.push({ id: parseInt(id) || 0, url: url || '', status: status || 'pending', started_at, completed_at, report_num, score: score !== '-' ? score : null, error: error !== '-' ? error : null, retries: parseInt(retries) || 0, company });
    }
  }

  if (existsSync(inputPath)) {
    total = readFileSync(inputPath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('id')).length;
  }

  const completed = stateRows.filter(r => r.status === 'completed').length;
  const failed = stateRows.filter(r => r.status === 'failed').length;
  const running = stateRows.filter(r => r.status === 'running').length;
  const pending = total - completed - failed - running;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Triage advance queue
  const triageItems = [];
  if (existsSync(triagePath)) {
    const lines = readFileSync(triagePath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('url'));
    for (const l of lines) {
      const [url, tier, score, archetype, reason] = l.split('\t');
      triageItems.push({ url, tier, score, archetype, reason });
    }
  }

  // Sort: running first, then completed by time desc, then failed, then pending
  const sorted = [
    ...stateRows.filter(r => r.status === 'running').sort((a, b) => (b.started_at || '').localeCompare(a.started_at || '')),
    ...stateRows.filter(r => r.status === 'completed').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    ...stateRows.filter(r => r.status === 'failed'),
    ...stateRows.filter(r => !['running','completed','failed'].includes(r.status)),
  ];

  return { total, completed, failed, running, pending, pct, rows: sorted.slice(0, 500), triageItems: triageItems.slice(0, 200) };
}

// ── Claim verification helpers ─────────────────────────────────

function buildVerifyPayload(reportSlug) {
  const reportPath = join(ROOT, 'reports', reportSlug);
  if (!existsSync(reportPath)) return null;
  const text = readFileSync(reportPath, 'utf8');
  const lines = text.split('\n');

  const titleMatch  = text.match(/^#\s+Evaluation:\s+(.+)/m);
  const scoreMatch  = text.match(/\*\*Score:\*\*\s*([\d.]+)/);
  const archMatch   = text.match(/\*\*Archetype:\*\*\s*([^\n]+)/);
  const urlMatch    = text.match(/\*\*URL:\*\*\s*(https?:\/\/[^\s\n]+)/);

  // Split "Company — Role" from title
  let company = '', role = '';
  if (titleMatch) {
    const parts = titleMatch[1].split(/\s*[—–-]\s*/);
    company = parts[0]?.trim() || '';
    role    = parts.slice(1).join(' — ').trim() || '';
  }

  // Extract key claims from B (CV Match), C (Level/Strategy), D (Positioning/Edges)
  const extractSection = (headerRe, maxBullets = 5) => {
    const idx = lines.findIndex(l => headerRe.test(l));
    if (idx < 0) return [];
    const out = [];
    for (let i = idx + 1; i < lines.length && out.length < maxBullets; i++) {
      if (/^##/.test(lines[i])) break;
      const m = lines[i].match(/^[-*]\s+(.+)/);
      if (m) out.push(stripMarkdown(m[1]).slice(0, 160));
    }
    return out;
  };

  // Extract STAR-style bullets from Block C
  const extractStarStories = () => {
    const cIdx = lines.findIndex(l => /^##\s+C\b/.test(l));
    if (cIdx < 0) return [];
    const out = [];
    for (let i = cIdx + 1; i < lines.length && out.length < 4; i++) {
      if (/^##\s+[D-Z]/.test(lines[i])) break;
      const m = lines[i].match(/^[-*]\s+\*\*(.+?)\*\*\s*[—–:]\s*(.+)/);
      if (m) out.push({ label: m[1].trim(), detail: stripMarkdown(m[2]).slice(0, 200) });
    }
    return out;
  };

  // Extract "what to emphasize" from Block D/E/positioning
  const edges = extractSection(/^##\s+[DE]\b/, 5);
  const starStories = extractStarStories();
  const cvMatchClaims = extractSection(/^##\s+B\b/, 4);

  // Extract final recommendation text
  let finalRec = '';
  const finalIdx = lines.findIndex(l => /final recommendation/i.test(l));
  if (finalIdx >= 0) {
    finalRec = lines.slice(finalIdx + 1, finalIdx + 12)
      .map(l => stripMarkdown(l)).join(' ').slice(0, 400);
  }

  // Whether evidence block already exists
  const hasEvidence = text.includes('## H) Evidence & Verification');

  // Build research queries
  const grokQuery = `site:reddit.com OR site:linkedin.com OR site:teamblind.com OR site:levels.fyi ${company} "${role}" hiring interview culture 2024 2025`;
  const perplexityQuery = `What do hiring managers and recruiters at ${company} actually screen for when hiring a ${role}? What are the real day-to-day responsibilities and team culture signals from employee reviews and public interviews?`;
  const claudeQuery = `Research ${company}'s AI roadmap, recent product launches, and any public statements by their leadership about the ${role} function. Cross-reference with Glassdoor/Blind signals about interview difficulty and culture. Summarize what claims an applicant for this role should be able to substantiate.`;

  return {
    reportSlug,
    company,
    role,
    score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
    archetype: archMatch ? archMatch[1].trim() : null,
    url: urlMatch ? urlMatch[1].trim() : null,
    cvMatchClaims,
    starStories,
    edges,
    finalRec: finalRec.trim(),
    hasEvidence,
    queries: {
      grok:      { platform: 'Grok (social)', label: '🐦 Social signals', query: grokQuery },
      perplexity:{ platform: 'Perplexity Pro', label: '🔍 Deep research', query: perplexityQuery },
      claude:    { platform: 'Claude Research', label: '🤖 AI synthesis', query: claudeQuery },
    },
  };
}

function saveEvidence(reportSlug, evidenceText) {
  const reportPath = join(ROOT, 'reports', reportSlug);
  if (!existsSync(reportPath)) return { ok: false, error: 'Report not found' };
  const text = readFileSync(reportPath, 'utf8');

  const block = `\n\n---\n\n## H) Evidence & Verification\n\n_Added ${new Date().toISOString().slice(0, 10)} via dashboard verify panel._\n\n${evidenceText.trim()}\n`;

  if (text.includes('## H) Evidence & Verification')) {
    // Replace existing block
    const updated = text.replace(/\n\n---\n\n## H\) Evidence & Verification[\s\S]*$/, block);
    writeFileSync(reportPath, updated);
  } else {
    appendFileSync(reportPath, block);
  }
  return { ok: true };
}

const DETAIL_FNS = {
  'apply-now':    detailApplyNow,
  'evaluations':  detailEvaluations,
  'applied':      detailApplied,
  'pending':      detailPending,
  'companies':    detailCompanies,
  'scanned':      detailScanned,
  'batches':      detailBatches,
};

// ── Status writeback ───────────────────────────────────────────

function loadCanonicalStatuses() {
  // Read labels from templates/states.yml. Falls back to the AGENTS.md
  // canonical list if states.yml is missing or malformed.
  const fallback = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP'];
  try {
    const text = readFileSync(join(ROOT, 'templates/states.yml'), 'utf8');
    const doc = yaml.load(text);
    const labels = (doc?.states || [])
      .map(s => typeof s?.label === 'string' ? s.label.trim() : '')
      .filter(Boolean);
    return labels.length ? labels : fallback;
  } catch (_) {
    return fallback;
  }
}

const CANONICAL_STATUSES = loadCanonicalStatuses();

function updateApplicationStatus({ num, status, note }) {
  if (num === undefined || num === null || Number.isNaN(parseInt(num, 10))) {
    return { ok: false, code: 400, error: 'num is required and must be an integer' };
  }
  if (!status || typeof status !== 'string') {
    return { ok: false, code: 400, error: 'status is required (string)' };
  }
  // Case-insensitive match against canonical labels; reply with canonical casing
  const canonical = CANONICAL_STATUSES.find(s => s.toLowerCase() === status.trim().toLowerCase());
  if (!canonical) {
    return {
      ok: false, code: 400,
      error: `Invalid status "${status}". Must be one of: ${CANONICAL_STATUSES.join(', ')}`,
    };
  }

  const appsPath = join(ROOT, 'data/applications.md');
  if (!existsSync(appsPath)) {
    return { ok: false, code: 500, error: 'data/applications.md not found' };
  }

  const text = readFileSync(appsPath, 'utf8');
  const lines = text.split('\n');
  const targetNum = String(parseInt(num, 10));
  let updatedRow = null;
  let oldStatus = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;
    if (line.match(/^[\|\s\-:]+$/)) continue;
    if (line.includes('| # |')) continue;

    const cols = line.split('|').map(c => c.trim());
    // cols: [empty, num, date, company, role, score, status, pdf, report, notes, (empty)]
    if (cols.length < 10 || cols[1] !== targetNum) continue;

    oldStatus = cols[6];
    cols[6] = canonical;
    if (typeof note === 'string' && note.length) {
      // Sanitize: pipes break the markdown table
      cols[9] = note.replace(/\|/g, '\\|').slice(0, 600);
    }
    lines[i] = '| ' + cols.slice(1, 10).join(' | ') + ' |';

    const reportMatch = cols[8]?.match(/\[(\d+)\]\(([^)]+)\)/);
    updatedRow = {
      num: cols[1],
      date: cols[2],
      company: cols[3],
      role: cols[4],
      score: parseFloat(cols[5]) || 0,
      status: cols[6],
      pdf: cols[7],
      report: reportMatch ? reportMatch[2] : null,
      notes: cols[9] || '',
    };
    break;
  }

  if (!updatedRow) {
    // AGENTS.md rule: NEVER create new entries — update only.
    return { ok: false, code: 404, error: `Row #${targetNum} not found in applications.md (refusing to create)` };
  }

  // Atomic write: write to temp then rename
  const tmpPath = appsPath + '.tmp.' + process.pid + '.' + Date.now();
  try {
    writeFileSync(tmpPath, lines.join('\n'));
    renameSync(tmpPath, appsPath);
  } catch (err) {
    return { ok: false, code: 500, error: `Atomic write failed: ${err.message}` };
  }

  // Auto-log status change to per-row activity (best-effort; never block status update)
  if (oldStatus && oldStatus !== canonical) {
    try {
      appendRowEvent(targetNum, {
        ts: new Date().toISOString(),
        type: 'status',
        text: `${oldStatus} → ${canonical}`,
      });
    } catch (_) {}
  }

  return { ok: true, row: updatedRow };
}

function updateApplicationStatusBulk({ nums, status }) {
  if (!Array.isArray(nums) || nums.length === 0) {
    return { ok: false, code: 400, error: 'nums is required (non-empty array of integers)' };
  }
  if (nums.length > 200) {
    return { ok: false, code: 400, error: `Too many rows in one request (${nums.length} > 200)` };
  }
  if (!status || typeof status !== 'string') {
    return { ok: false, code: 400, error: 'status is required (string)' };
  }
  const canonical = CANONICAL_STATUSES.find(s => s.toLowerCase() === status.trim().toLowerCase());
  if (!canonical) {
    return {
      ok: false, code: 400,
      error: `Invalid status "${status}". Must be one of: ${CANONICAL_STATUSES.join(', ')}`,
    };
  }

  const targets = new Set();
  for (const n of nums) {
    const parsed = parseInt(n, 10);
    if (Number.isNaN(parsed)) {
      return { ok: false, code: 400, error: `Invalid num "${n}" — must be integer` };
    }
    targets.add(String(parsed));
  }

  const appsPath = join(ROOT, 'data/applications.md');
  if (!existsSync(appsPath)) {
    return { ok: false, code: 500, error: 'data/applications.md not found' };
  }

  const text = readFileSync(appsPath, 'utf8');
  const lines = text.split('\n');
  const updated = [];
  const oldStatusByNum = {};
  const stillMissing = new Set(targets);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;
    if (line.match(/^[\|\s\-:]+$/)) continue;
    if (line.includes('| # |')) continue;

    const cols = line.split('|').map(c => c.trim());
    if (cols.length < 10) continue;
    if (!targets.has(cols[1])) continue;

    oldStatusByNum[cols[1]] = cols[6];
    cols[6] = canonical;
    lines[i] = '| ' + cols.slice(1, 10).join(' | ') + ' |';

    const reportMatch = cols[8]?.match(/\[(\d+)\]\(([^)]+)\)/);
    updated.push({
      num: cols[1],
      date: cols[2],
      company: cols[3],
      role: cols[4],
      score: parseFloat(cols[5]) || 0,
      status: cols[6],
      pdf: cols[7],
      report: reportMatch ? reportMatch[2] : null,
      notes: cols[9] || '',
    });
    stillMissing.delete(cols[1]);
  }

  if (updated.length === 0) {
    return {
      ok: false, code: 404,
      error: `No matching rows found for: ${[...stillMissing].join(', ')}`,
    };
  }

  // Atomic write — single rename for the entire batch
  const tmpPath = appsPath + '.tmp.' + process.pid + '.' + Date.now();
  try {
    writeFileSync(tmpPath, lines.join('\n'));
    renameSync(tmpPath, appsPath);
  } catch (err) {
    return { ok: false, code: 500, error: `Atomic write failed: ${err.message}` };
  }

  // Auto-log status change to per-row activity (best-effort; never block)
  const ts = new Date().toISOString();
  for (const row of updated) {
    const old = oldStatusByNum[row.num];
    if (old && old !== canonical) {
      try {
        appendRowEvent(row.num, { ts, type: 'status', text: `${old} → ${canonical}` });
      } catch (_) {}
    }
  }

  return {
    ok: true,
    updated,
    notFound: [...stillMissing],
  };
}

// ── Quick-add to pipeline (dashboard "Add role" modal) ─────────

const ATS_PATTERNS = [
  { id: 'greenhouse', test: /(?:job-boards|boards)\.greenhouse\.io/i },
  { id: 'ashby',      test: /jobs\.ashbyhq\.com/i },
  { id: 'lever',      test: /jobs\.lever\.co/i },
  { id: 'workday',    test: /myworkdayjobs\.com|workday/i },
  { id: 'linkedin',   test: /linkedin\.com\/jobs/i },
];

function detectAts(url) {
  for (const p of ATS_PATTERNS) if (p.test.test(url)) return p.id;
  return 'unknown';
}

function extractCompanyFromAts(parsedUrl, ats) {
  try {
    if (ats === 'greenhouse') {
      const m = parsedUrl.pathname.match(/^\/([^\/]+)\/jobs\//);
      if (m) return m[1];
    } else if (ats === 'ashby' || ats === 'lever') {
      const m = parsedUrl.pathname.match(/^\/([^\/]+)/);
      if (m) return m[1];
    } else if (ats === 'workday') {
      // {company}.wd1.myworkdayjobs.com or workday subdomain
      return parsedUrl.hostname.split('.')[0];
    }
    return parsedUrl.hostname.replace(/^www\./, '').split('.')[0];
  } catch (_) {
    return 'Unknown';
  }
}

function urlInScanHistory(url) {
  const path = join(ROOT, 'data/scan-history.tsv');
  if (!existsSync(path)) return false;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    if (!line || line.startsWith('url\t')) continue;
    if (line.split('\t')[0] === url) return true;
  }
  return false;
}

function urlInPipeline(url) {
  const path = join(ROOT, 'data/pipeline.md');
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf8').includes(url);
}

function addUrlToPipeline({ url, company, title, ats, date }) {
  const path = join(ROOT, 'data/pipeline.md');
  if (!existsSync(path)) return { ok: false, code: 500, error: 'data/pipeline.md not found' };

  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');

  // Insert at the top of "### Tier 2" so newest-first matches scan.mjs.
  // Skip at most one blank line that follows the header (preserve any
  // trailing blank line before "### Tier 3").
  let insertIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+Tier 2\b/i.test(lines[i])) {
      insertIdx = i + 1;
      if (insertIdx < lines.length && lines[insertIdx].trim() === '') insertIdx++;
      break;
    }
  }
  if (insertIdx < 0) {
    if (lines[lines.length - 1] !== '') lines.push('');
    lines.push('### Tier 2 — Quick-add (manual)');
    lines.push('');
    insertIdx = lines.length;
  }

  const tag = ats && ats !== 'unknown' ? ' [' + ats + ']' : '';
  const safeCompany = (company || 'Unknown').replace(/\|/g, '/').slice(0, 80);
  const safeTitle   = ((title || '(pending triage)') + tag).replace(/\|/g, '/').slice(0, 200);
  const newLine = '- [ ] ' + url + ' | ' + safeCompany + ' | ' + safeTitle + ' | ' + date;
  lines.splice(insertIdx, 0, newLine);

  const tmp = path + '.tmp.' + process.pid + '.' + Date.now();
  try {
    writeFileSync(tmp, lines.join('\n'));
    renameSync(tmp, path);
  } catch (err) {
    return { ok: false, code: 500, error: 'Atomic write failed: ' + err.message };
  }
  return { ok: true, line: newLine };
}

function quickAddToPipeline(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return { ok: false, code: 400, error: 'url is required' };
  if (trimmed.length > 2048) return { ok: false, code: 400, error: 'URL too long' };

  let parsedUrl;
  try { parsedUrl = new URL(trimmed); }
  catch (_) { return { ok: false, code: 400, error: 'Not a valid URL — paste a full http(s) link.' }; }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, code: 400, error: 'URL must use http or https' };
  }

  // Normalize: drop fragment, keep query (some ATS slugs live there).
  const cleanUrl = parsedUrl.origin + parsedUrl.pathname + parsedUrl.search;

  if (urlInScanHistory(cleanUrl) || urlInPipeline(cleanUrl)) {
    return { ok: false, code: 200, duplicate: true, error: 'already in pipeline' };
  }

  const ats = detectAts(cleanUrl);
  const company = extractCompanyFromAts(parsedUrl, ats);
  const date = new Date().toISOString().slice(0, 10);

  const result = addUrlToPipeline({ url: cleanUrl, company, title: '(pending triage)', ats, date });
  if (!result.ok) return result;

  return { ok: true, ats, company, date, url: cleanUrl, line: result.line };
}

// ── Share-link tokens (24h read-only recruiter links) ─────────

const SHARE_TOKENS_PATH = join(ROOT, 'data/share-tokens.json');
const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

function loadShareTokens() {
  try {
    if (!existsSync(SHARE_TOKENS_PATH)) return { tokens: [] };
    const raw = JSON.parse(readFileSync(SHARE_TOKENS_PATH, 'utf8'));
    if (!raw || !Array.isArray(raw.tokens)) return { tokens: [] };
    return raw;
  } catch (_) {
    return { tokens: [] };
  }
}

function saveShareTokens(data) {
  const dir = dirname(SHARE_TOKENS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = SHARE_TOKENS_PATH + '.tmp.' + process.pid + '.' + Date.now();
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, SHARE_TOKENS_PATH);
}

function pruneExpired(data, now = Date.now()) {
  const before = data.tokens.length;
  data.tokens = data.tokens.filter(t => new Date(t.expires).getTime() > now);
  return { data, removed: before - data.tokens.length };
}

function lookupShareToken(token) {
  if (!token || typeof token !== 'string') return { status: 'missing' };
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return { status: 'invalid' };
  const data = loadShareTokens();
  const row = data.tokens.find(t => t.token === token);
  if (!row) return { status: 'invalid' };
  if (new Date(row.expires).getTime() <= Date.now()) return { status: 'expired', row };
  return { status: 'valid', row };
}

function createShareToken() {
  const token = randomBytes(16).toString('hex'); // 32 hex chars
  const created = new Date().toISOString();
  const expires = new Date(Date.now() + SHARE_TTL_MS).toISOString();
  const data = pruneExpired(loadShareTokens()).data;
  data.tokens.push({ token, created, expires });
  saveShareTokens(data);
  return { token, created, expires };
}

// ── Per-row notes & activity log ───────────────────────────────
// Append-only timestamped events keyed by row num. Stored at
// data/row-notes.json (gitignored). Two event types:
//   { ts, type: 'note',   text: '<freeform user note>' }
//   { ts, type: 'status', text: 'OldStatus → NewStatus' }
// Atomic writes via tmp + rename. Per-note text capped at 1000 chars.

const ROW_NOTES_PATH    = join(ROOT, 'data/row-notes.json');
const NOTE_MAX_CHARS    = 1000;

function loadRowNotes() {
  try {
    if (!existsSync(ROW_NOTES_PATH)) return {};
    const raw = JSON.parse(readFileSync(ROW_NOTES_PATH, 'utf8'));
    return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  } catch (_) {
    return {};
  }
}

function saveRowNotes(data) {
  const dir = dirname(ROW_NOTES_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = ROW_NOTES_PATH + '.tmp.' + process.pid + '.' + Date.now();
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, ROW_NOTES_PATH);
}

function appendRowEvent(num, entry) {
  // Internal — unconditionally append. Validation happens at the public
  // entry points (appendRowNote, status-change call sites).
  const parsed = parseInt(num, 10);
  if (Number.isNaN(parsed)) return false;
  const key = String(parsed);
  const data = loadRowNotes();
  if (!Array.isArray(data[key])) data[key] = [];
  data[key].push(entry);
  try {
    saveRowNotes(data);
    return true;
  } catch (_) {
    return false;
  }
}

function appendRowNote({ num, text }) {
  if (num === undefined || num === null || Number.isNaN(parseInt(num, 10))) {
    return { ok: false, code: 400, error: 'num is required and must be an integer' };
  }
  if (typeof text !== 'string') {
    return { ok: false, code: 400, error: 'text is required (string)' };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, code: 400, error: 'text must not be empty' };
  }
  if (trimmed.length > NOTE_MAX_CHARS) {
    return { ok: false, code: 400, error: `text exceeds ${NOTE_MAX_CHARS}-char limit` };
  }

  const entry = { ts: new Date().toISOString(), type: 'note', text: trimmed };
  const ok = appendRowEvent(num, entry);
  if (!ok) {
    return { ok: false, code: 500, error: 'Failed to write row-notes.json' };
  }
  const all = loadRowNotes()[String(parseInt(num, 10))] || [];
  // Newest first to match the UI expectation.
  return { ok: true, num: String(parseInt(num, 10)), entries: [...all].reverse() };
}

function getRowNotes(num) {
  const parsed = parseInt(num, 10);
  if (Number.isNaN(parsed)) {
    return { ok: false, code: 400, error: 'num must be an integer' };
  }
  const key = String(parsed);
  const all = loadRowNotes()[key] || [];
  return { ok: true, num: key, entries: [...all].reverse() };
}

// ── HTTP server ────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const query = Object.fromEntries(new URLSearchParams(queryString));

  const json = (data, code = 200) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
  };

  // Share-link endpoints
  if (url === '/api/share/create') {
    const { token, expires, created } = createShareToken();
    const host = req.headers.host || `localhost:${PORT}`;
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const shareUrl = `${proto}://${host}/?share=${token}&demo=1`;
    return json({ token, expires, created, url: shareUrl });
  }
  if (url === '/api/share/verify') {
    const result = lookupShareToken(query.share || query.token);
    if (result.status === 'valid') return json({ valid: true, expires: result.row.expires });
    if (result.status === 'expired') return json({ valid: false, reason: 'expired', expires: result.row.expires }, 410);
    return json({ valid: false, reason: result.status }, 401);
  }

  if (url === '/api/stats') return json(computeStats());
  if (url === '/api/batch-live') {
    try { return json(batchLive()); }
    catch (err) { res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ error: err.message })); return; }
  }

  const verifyMatch = url.match(/^\/api\/verify\/(.+\.md)$/);
  if (verifyMatch) {
    const payload = buildVerifyPayload(verifyMatch[1]);
    if (!payload) { res.writeHead(404); res.end('Report not found'); return; }
    return json(payload);
  }

  if (url === '/api/save-evidence' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { reportSlug, evidenceText } = JSON.parse(body);
        const result = saveEvidence(reportSlug, evidenceText || '');
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url === '/api/status' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 8 * 1024) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
        return;
      }
      const result = updateApplicationStatus({
        num:    parsed.num,
        status: parsed.status,
        note:   parsed.note,
      });
      const code = result.ok ? 200 : (result.code || 400);
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result.ok
        ? { ok: true, row: result.row, canonicalStatuses: CANONICAL_STATUSES }
        : { ok: false, error: result.error }));
    });
    return;
  }

  if (url === '/api/status' && req.method === 'GET') {
    return json({ canonicalStatuses: CANONICAL_STATUSES });
  }

  if (url === '/api/status/bulk' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 64 * 1024) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
        return;
      }
      const result = updateApplicationStatusBulk({
        nums:   parsed.nums,
        status: parsed.status,
      });
      const code = result.ok ? 200 : (result.code || 400);
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result.ok
        ? { ok: true, updated: result.updated, notFound: result.notFound, canonicalStatuses: CANONICAL_STATUSES }
        : { ok: false, error: result.error }));
    });
    return;
  }

  if (url === '/api/pipeline/add' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 8 * 1024) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch (_) {
        return json({ ok: false, error: 'Invalid JSON body' }, 400);
      }
      const result = quickAddToPipeline(parsed.url);
      const code = result.ok ? 200 : (result.code || 400);
      return json(result, code);
    });
    return;
  }

  // ── Notes & activity (per-row append-only log) ───────────────
  if (url === '/api/notes/add' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 8 * 1024) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch (_) {
        return json({ ok: false, error: 'Invalid JSON body' }, 400);
      }
      const result = appendRowNote({ num: parsed.num, text: parsed.text });
      const code = result.ok ? 200 : (result.code || 400);
      return json(result.ok
        ? { ok: true, num: result.num, entries: result.entries }
        : { ok: false, error: result.error }, code);
    });
    return;
  }

  const notesGetMatch = url.match(/^\/api\/notes\/(\d+)$/);
  if (notesGetMatch && req.method === 'GET') {
    const result = getRowNotes(notesGetMatch[1]);
    const code = result.ok ? 200 : (result.code || 400);
    return json(result.ok
      ? { ok: true, num: result.num, entries: result.entries }
      : { ok: false, error: result.error }, code);
  }

  const detailMatch = url.match(/^\/api\/detail\/(.+)$/);
  if (detailMatch) {
    const fn = DETAIL_FNS[detailMatch[1]];
    if (fn) {
      try {
        return json(fn());
      } catch (err) {
        console.error(`[detail/${detailMatch[1]}] error:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }
    res.writeHead(404); res.end('Unknown category');
    return;
  }

  const reportMatch = url.match(/^\/api\/report\/(.+\.md)$/);
  if (reportMatch) {
    const summary = parseReportSummary('reports/' + reportMatch[1]);
    return json(summary);
  }

  // Share-token middleware: when ?share=<token> is on the dashboard request,
  // validate before serving the HTML. Expired → 410 Gone. Invalid → 401.
  if (url === '/' && query.share) {
    const result = lookupShareToken(query.share);
    if (result.status === 'expired') {
      res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>Share link expired</title><body style="font-family:system-ui;padding:40px;max-width:520px;margin:0 auto"><h1>Share link expired</h1><p>This read-only dashboard share link has expired. Ask Mitchell for a fresh link.</p></body>');
      return;
    }
    if (result.status !== 'valid') {
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>Invalid share link</title><body style="font-family:system-ui;padding:40px;max-width:520px;margin:0 auto"><h1>Invalid share link</h1><p>This share token is not recognized.</p></body>');
      return;
    }
  }

  // Static files from dashboard/
  let filePath = url === '/' ? '/dashboard/index.html' : `/dashboard${url}`;
  filePath = join(ROOT, filePath);
  if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = extname(filePath);
  const headers = { 'Content-Type': MIME[ext] || 'text/plain' };
  // Default cache policy: HTML is rebuilt by build-dashboard.mjs on every change,
  // so the browser must revalidate on every load (no-cache forces ETag round-trip
  // but no full re-download when content unchanged). Without this, every UI fix
  // requires the user to hard-refresh (Cmd-Shift-R) to see new HTML/inline CSS+JS.
  // Static assets (PNG, JSON, manifest) get a 5-min cache so revisits are fast.
  if (ext === '.html' || url === '/' || url === '/dashboard/index.html') {
    headers['Cache-Control'] = 'no-cache, must-revalidate';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  } else if (url === '/manifest.json') {
    headers['Content-Type'] = 'application/manifest+json';
    headers['Cache-Control'] = 'public, max-age=300';
  } else if (url === '/service-worker.js') {
    headers['Content-Type'] = 'application/javascript';
    headers['Service-Worker-Allowed'] = '/';
    headers['Cache-Control'] = 'no-cache';
  } else {
    // Static assets (PNG, ICO, etc.) — short cache for snappy revisits.
    headers['Cache-Control'] = 'public, max-age=300';
  }
  res.writeHead(200, headers);
  res.end(readFileSync(filePath));
});

server.listen(PORT, () => {
  console.log(`Dashboard → http://localhost:${PORT}`);
});
