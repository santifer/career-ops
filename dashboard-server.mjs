#!/usr/bin/env node
// dashboard-server.mjs — serves dashboard/index.html + live API endpoints
// Usage: node dashboard-server.mjs [--port=3000]

import { createServer } from 'http';
import { readFileSync, existsSync, readdirSync, appendFileSync, writeFileSync, renameSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

function parseApplications() {
  const appsPath = join(ROOT, 'data/applications.md');
  if (!existsSync(appsPath)) return [];
  const rows = readFileSync(appsPath, 'utf8').split('\n').filter(l =>
    l.startsWith('|') && !l.match(/^[\|\s\-:]+$/) && !l.includes('| # |')
  ).slice(1);

  return rows.map(row => {
    const cols = row.split('|').map(c => c.trim());
    // cols: [empty, #, date, company, role, score, status, pdf, report, notes]
    const reportMatch = cols[8]?.match(/\[(\d+)\]\(([^)]+)\)/);
    return {
      num:     cols[1],
      date:    cols[2],
      company: cols[3],
      role:    cols[4],
      score:   parseFloat(cols[5]) || 0,
      status:  cols[6],
      report:  reportMatch ? reportMatch[2] : null,
      notes:   cols[9] || '',
    };
  }).filter(r => r.company);
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
  const apps = parseApplications();
  const map = {};
  for (const a of apps) {
    if (!map[a.company]) map[a.company] = { evals: 0, totalScore: 0, bestScore: 0, bestRole: '', statuses: {}, roles: [] };
    const c = map[a.company];
    c.evals++;
    c.totalScore += a.score || 0;
    if (a.score > c.bestScore) { c.bestScore = a.score; c.bestRole = a.role; }
    c.statuses[a.status] = (c.statuses[a.status] || 0) + 1;
    c.roles.push({ role: a.role, score: a.score, status: a.status, date: a.date });
  }
  const rows = Object.entries(map)
    .map(([company, d]) => ({
      company,
      evals: d.evals,
      avgScore: d.evals > 0 ? Math.round((d.totalScore / d.evals) * 10) / 10 : 0,
      bestScore: d.bestScore,
      bestRole: d.bestRole,
      statuses: d.statuses,
      roles: d.roles.sort((a, b) => b.score - a.score),
    }))
    .sort((a, b) => b.bestScore - a.bestScore);
  return { title: 'Companies Tracked', rows };
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
  const byPortal = {};
  for (const i of items) {
    byPortal[i.portal || 'unknown'] = (byPortal[i.portal || 'unknown'] || 0) + 1;
  }
  const byDate = {};
  for (const i of items) {
    const d = (i.first_seen || '').slice(0, 10);
    if (d) byDate[d] = (byDate[d] || 0) + 1;
  }
  const recentDates = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const added = items.filter(i => i.status === 'added').length;
  // Return a subset of items for the detail table view
  const recentItems = [...items]
    .sort((a, b) => (b.first_seen || '').localeCompare(a.first_seen || ''))
    .slice(0, 500);
  return { title: 'URLs Scanned', total: items.length, added, byPortal, recentDates, items: recentItems };
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
  // Parse templates/states.yml without pulling a YAML dep — extract the
  // `label:` value of every state in the file. Falls back to the AGENTS.md
  // canonical list if states.yml is unreadable.
  const fallback = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP'];
  try {
    const text = readFileSync(join(ROOT, 'templates/states.yml'), 'utf8');
    const labels = [];
    for (const m of text.matchAll(/^\s+label:\s+(.+?)\s*$/gm)) {
      const v = m[1].trim();
      if (v) labels.push(v);
    }
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;
    if (line.match(/^[\|\s\-:]+$/)) continue;
    if (line.includes('| # |')) continue;

    const cols = line.split('|').map(c => c.trim());
    // cols: [empty, num, date, company, role, score, status, pdf, report, notes, (empty)]
    if (cols.length < 10 || cols[1] !== targetNum) continue;

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
  return { ok: true, row: updatedRow };
}

// ── HTTP server ────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = req.url.split('?')[0];

  const json = (data) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
  };

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

  // Static files from dashboard/
  let filePath = url === '/' ? '/dashboard/index.html' : `/dashboard${url}`;
  filePath = join(ROOT, filePath);
  if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = extname(filePath);
  const headers = { 'Content-Type': MIME[ext] || 'text/plain' };
  // PWA: manifest needs the manifest mime type; service worker must be served
  // from the root scope with no-cache so updates propagate.
  if (url === '/manifest.json') {
    headers['Content-Type'] = 'application/manifest+json';
  } else if (url === '/service-worker.js') {
    headers['Content-Type'] = 'application/javascript';
    headers['Service-Worker-Allowed'] = '/';
    headers['Cache-Control'] = 'no-cache';
  }
  res.writeHead(200, headers);
  res.end(readFileSync(filePath));
});

server.listen(PORT, () => {
  console.log(`Dashboard → http://localhost:${PORT}`);
});
