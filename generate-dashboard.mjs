#!/usr/bin/env node
/**
 * generate-dashboard.mjs — Career-Ops Interactive Dashboard (Kinetic Design)
 * Usage: node generate-dashboard.mjs [--open]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const OUT = resolve(ROOT, 'output/dashboard.html');

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseApplications() {
  const path = resolve(ROOT, 'data/applications.md');
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.startsWith('|') || line.startsWith('|---') || line.includes('| # |')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 8) continue;
    const [num, date, company, role, scoreRaw, status, pdf, reportRaw, ...noteParts] = cols;
    const score = parseFloat(scoreRaw) || 0;
    const reportMatch = reportRaw?.match(/\[(\d+)\]\(([^)]+)\)/);
    const reportNum = reportMatch?.[1] || '';
    const reportPath = reportMatch?.[2] || '';
    rows.push({
      num: parseInt(num) || 0,
      date: date || '',
      company: company || '',
      role: role || '',
      score,
      scoreRaw: scoreRaw || '',
      status: status || '',
      pdf: pdf === '✅',
      reportNum,
      reportPath,
      notes: noteParts.join('|').trim(),
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}

function parsePipeline() {
  const path = resolve(ROOT, 'data/pipeline.md');
  if (!existsSync(path)) return { pending: [], processed: [] };
  const content = readFileSync(path, 'utf8');
  const pending = [];
  const processed = [];
  for (const line of content.split('\n')) {
    const pendingMatch = line.match(/^- \[ \] (.+)/);
    const processedMatch = line.match(/^- \[x\] (.+)/);
    if (pendingMatch) {
      const parts = pendingMatch[1].split('|').map(s => s.trim());
      pending.push({ url: parts[0], company: parts[1] || '', role: parts[2] || '', extra: parts[3] || '' });
    } else if (processedMatch) {
      processed.push({ raw: processedMatch[1] });
    }
  }
  return { pending, processed };
}

function parseScanHistory() {
  const path = resolve(ROOT, 'data/scan-history.tsv');
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n').slice(1);
  return lines.filter(Boolean).map(line => {
    const [url, first_seen, portal, title, company, status] = line.split('\t');
    return { url, first_seen, portal, title, company, status };
  });
}

function getReportMeta() {
  const dir = resolve(ROOT, 'reports');
  if (!existsSync(dir)) return {};
  const meta = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md') || file === 'analysis.md') continue;
    const numMatch = file.match(/^(\d+)-/);
    if (!numMatch) continue;
    const num = parseInt(numMatch[1]);
    try {
      const filepath = resolve(dir, file);
      const content = readFileSync(filepath, 'utf8');
      const urlMatch = content.match(/\*\*URL:\*\*\s*(https?:\/\/[^\s|]+)/);
      const archetypeMatch = content.match(/\*\*Archetype:\*\*\s*(.+)/);
      const mtime = statSync(filepath).mtime.toISOString();
      meta[num] = {
        url: urlMatch?.[1]?.trim() || '',
        archetype: archetypeMatch?.[1]?.trim() || '',
        file,
        content,
        mtime,
      };
    } catch {}
  }
  return meta;
}

// ── Data assembly ─────────────────────────────────────────────────────────────

const apps = parseApplications();
const pipeline = parsePipeline();
const scanHistory = parseScanHistory();
const reportMeta = getReportMeta();

// Enrich apps with report meta
for (const app of apps) {
  const meta = reportMeta[app.num] || {};
  app.url = meta.url || '';
  app.archetype = meta.archetype || '';
  app.reportMtime = meta.mtime || '';
}

// Reports content map (num → markdown string)
const reportsContent = {};
for (const [num, meta] of Object.entries(reportMeta)) {
  if (meta.content) reportsContent[num] = meta.content;
}

// KPIs
const total = apps.length;
const applied = apps.filter(a => ['Applied', 'Responded', 'Interview', 'Offer'].includes(a.status)).length;
const interviews = apps.filter(a => ['Interview', 'Offer'].includes(a.status)).length;
const offers = apps.filter(a => a.status === 'Offer').length;
const avgScore = apps.length ? (apps.reduce((s, a) => s + a.score, 0) / apps.length).toFixed(1) : 0;
const topScore = apps.length ? Math.max(...apps.map(a => a.score)).toFixed(1) : 0;
const applyNow = apps.filter(a => a.score >= 4.0 && a.status === 'Evaluada').length;

// Score distribution
const scoreDist = { '4.5-5': 0, '4.0-4.4': 0, '3.5-3.9': 0, '3.0-3.4': 0, '<3.0': 0 };
for (const a of apps) {
  if (a.score >= 4.5) scoreDist['4.5-5']++;
  else if (a.score >= 4.0) scoreDist['4.0-4.4']++;
  else if (a.score >= 3.5) scoreDist['3.5-3.9']++;
  else if (a.score >= 3.0) scoreDist['3.0-3.4']++;
  else scoreDist['<3.0']++;
}

// Companies grouping
const byCompany = {};
for (const a of apps) {
  if (!byCompany[a.company]) byCompany[a.company] = [];
  byCompany[a.company].push(a);
}
const companies = Object.entries(byCompany)
  .map(([name, roles]) => ({
    name,
    roles,
    maxScore: Math.max(...roles.map(r => r.score)),
    avgScore: (roles.reduce((s, r) => s + r.score, 0) / roles.length).toFixed(1),
    applied: roles.filter(r => ['Applied','Interview','Offer'].includes(r.status)).length,
  }))
  .sort((a, b) => b.maxScore - a.maxScore);

// Status distribution
const statusCounts = {};
for (const a of apps) {
  statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
}

// Follow-up list
const followUp = apps
  .filter(a => ['Applied', 'Responded', 'Interview', 'Offer'].includes(a.status))
  .sort((a, b) => new Date(b.date) - new Date(a.date));

// Prospect pipeline
const evaluatedUrls = new Set(apps.map(a => a.url).filter(Boolean));
const prospectPending = scanHistory
  .filter(h => h.status === 'pipeline' && !evaluatedUrls.has(h.url))
  .slice(0, 50);

// ── JSON payload ──────────────────────────────────────────────────────────────

const DATA = JSON.stringify({
  kpis: { total, applied, interviews, offers, avgScore, topScore, applyNow, pending: pipeline.pending.length },
  scoreDist,
  statusCounts,
  apps,
  companies,
  followUp,
  pipeline: pipeline.pending,
  prospectPending,
  scanHistory: scanHistory.slice(0, 300),
  reports: reportsContent,
  generated: new Date().toISOString(),
});

// ── HTML ─────────────────────────────────────────────────────────────────────
// THEME: edit the :root block (~25 variables) in the <style> tag below.
// Run `node generate-dashboard.mjs` to regenerate with the new palette.
// ──────────────────────────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Career-Ops | Command Center</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<script>
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary":           "var(--p)",
        "secondary":         "var(--p-soft)",
        "tertiary":          "var(--warn)",
        "error":             "var(--err)",
        "surface":           "var(--bg)",
        "surface-low":       "var(--s0)",
        "surface-container": "var(--s1)",
        "surface-high":      "var(--s2)",
        "surface-highest":   "var(--s3)",
        "on-surface":        "var(--tx)",
        "on-surface-dim":    "var(--tx-mid)",
      },
      fontFamily: {
        "headline": ["Manrope", "sans-serif"],
        "body":     ["Inter", "sans-serif"],
        "label":    ["Inter", "sans-serif"]
      }
    }
  }
}
</script>
<style>
  /* ═══════════════════════════════════════════════════════
     THEME — edit these ~25 variables to change the palette.
     Then run: node generate-dashboard.mjs
     ═══════════════════════════════════════════════════════ */
  :root {
    /* Brand */
    --p:        #22c55e;   /* primary accent */
    --p-dark:   #006e2f;   /* gradient start / CTA shadow */
    --p-soft:   #4ade80;   /* secondary / lighter accent */
    --warn:     #facc15;   /* warning / mid score */
    --err:      #f87171;   /* error / low score */

    /* Surfaces — progressively lighter layers (no borders needed) */
    --bg:       #0c1210;   /* page background */
    --s0:       #101a14;   /* sidebar / lowest surface */
    --s1:       #14201a;   /* cards */
    --s2:       #192720;   /* elevated elements */
    --s3:       #1f3027;   /* highest elevation */

    /* Text */
    --tx:       #dff0de;   /* primary text */
    --tx-mid:   #8fa890;   /* secondary text */
    --tx-dim:   #4a6050;   /* muted / placeholder */

    /* Avatar rotation (company initial circles) */
    --av0: #22c55e; --av1: #4ade80; --av2: #a3e635;
    --av3: #facc15; --av4: #34d399; --av5: #86efac; --av6: #6ee7b7;

    /* Score distribution bars */
    --dist0: #22c55e; --dist1: #4ade80; --dist2: #facc15;
    --dist3: #fb923c; --dist4: #f87171;

    /* Status pills — semantic, not brand-tied */
    --pill-pos-bg:   rgba(34,197,94,0.15);  --pill-pos:  #4ade80;
    --pill-warn-bg:  rgba(234,179,8,0.15);  --pill-warn: #facc15;
    --pill-err-bg:   rgba(248,113,113,0.12);--pill-err:  #f87171;
    --pill-mute-bg:  rgba(100,116,139,0.10);--pill-mute: #64748b;
    --pill-soft-bg:  rgba(163,230,53,0.10); --pill-soft: #86efac;

    /* Derived — computed from brand above */
    --glass: rgba(20,32,26,0.80);
    --grad:  linear-gradient(135deg, var(--p-dark), var(--p));
  }

  /* Light mode override — same variables, light values */
  body.light {
    --p:      #006e2f;
    --p-dark: #004d20;
    --p-soft: #16a34a;
    --warn:   #b45309;
    --err:    #dc2626;
    --bg:     #f6fafe;
    --s0:     #f0f4f8;
    --s1:     #ffffff;
    --s2:     #e8f0e8;
    --s3:     #dceadc;
    --tx:     #171c1f;
    --tx-mid: #5a7060;
    --tx-dim: #3d4a3d;
    --glass:  rgba(255,255,255,0.88);
    --pill-pos-bg:  rgba(0,110,47,0.10);  --pill-pos:  #006e2f;
    --pill-warn-bg: rgba(180,83,9,0.10);  --pill-warn: #b45309;
    --pill-err-bg:  rgba(220,38,38,0.10); --pill-err:  #dc2626;
  }

  * { box-sizing: border-box; }
  body { font-family:'Inter',sans-serif; background:var(--bg); color:var(--tx); }
  .headline { font-family:'Manrope',sans-serif; }
  .ms-fill { font-variation-settings:'FILL' 1; }
  .glass { background:var(--glass); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); }
  .btn-primary { background:var(--grad); color:var(--tx); font-weight:700; border-radius:9999px; padding:8px 20px; font-size:13px; border:none; cursor:pointer; transition:opacity 0.2s; }
  .btn-primary:hover { opacity:0.88; }

  /* Pills */
  .pill { display:inline-flex; align-items:center; padding:2px 10px; border-radius:9999px; font-size:10px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; }
  .pill-applied   { background:var(--pill-pos-bg);  color:var(--pill-pos);  }
  .pill-evaluated { background:var(--pill-soft-bg); color:var(--pill-soft); }
  .pill-interview { background:var(--pill-warn-bg); color:var(--pill-warn); }
  .pill-offer     { background:var(--pill-pos-bg);  color:var(--pill-pos); box-shadow:0 0 8px var(--pill-pos-bg); }
  .pill-rejected  { background:var(--pill-err-bg);  color:var(--pill-err);  }
  .pill-skip      { background:var(--pill-mute-bg); color:var(--pill-mute); }
  .pill-discarded { background:var(--pill-mute-bg); color:var(--pill-mute); }
  .pill-responded { background:var(--pill-soft-bg); color:var(--pill-soft); }

  /* Views */
  .view { display:none; }
  .view.active { display:flex; flex-direction:column; flex:1; }

  /* Nav */
  .nav-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; cursor:pointer; transition:all 0.18s; color:var(--tx-dim); font-size:13px; font-weight:500; }
  .nav-item:hover  { background:var(--s1); color:var(--tx); }
  .nav-item.active { background:var(--s2); color:var(--p); }
  .nav-item .material-symbols-outlined { font-size:20px; }

  /* Scrollbar */
  ::-webkit-scrollbar { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:var(--s3); border-radius:4px; }

  /* Table hover */
  #app-tbody tr:hover td { background:var(--s2); }

  /* Modal */
  #report-modal { display:none; position:fixed; inset:0; z-index:1000; align-items:center; justify-content:center; }
  #report-modal.open { display:flex; }
  #modal-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.82); backdrop-filter:blur(8px); }
  #modal-panel { position:relative; z-index:1; width:min(840px,96vw); max-height:92vh; background:var(--s0); border-radius:20px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 40px 100px rgba(0,0,0,0.7); }
  #modal-header { padding:22px 30px 18px; background:var(--s1); display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0; }
  #modal-body-wrap { padding:24px 30px; overflow-y:auto; flex:1; }
  #modal-close { background:none; border:none; color:var(--tx-dim); cursor:pointer; font-size:18px; padding:4px 8px; border-radius:8px; flex-shrink:0; margin-left:12px; transition:all 0.15s; }
  #modal-close:hover { color:var(--tx); background:var(--s2); }

  /* Markdown */
  .md h1 { font-size:1.2rem; font-weight:800; color:var(--tx); font-family:'Manrope',sans-serif; margin-bottom:14px; padding:8px 12px; background:var(--s2); border-radius:6px; }
  .md h2 { font-size:1rem; font-weight:700; color:var(--p-soft); font-family:'Manrope',sans-serif; margin:20px 0 8px; }
  .md h3 { font-size:0.9rem; font-weight:600; color:var(--p); margin:14px 0 6px; }
  .md p  { color:var(--tx-mid); line-height:1.75; margin-bottom:10px; font-size:0.88rem; }
  .md strong { color:var(--tx); font-weight:600; }
  .md em { color:var(--tx-dim); font-style:italic; }
  .md code { background:var(--s1); color:var(--p); padding:1px 6px; border-radius:4px; font-size:0.82rem; font-family:monospace; }
  .md ul { padding-left:18px; margin-bottom:10px; }
  .md li { color:var(--tx-mid); line-height:1.75; font-size:0.88rem; margin-bottom:2px; list-style:disc; }
  .md li strong { color:var(--tx); }
  .md table { width:100%; border-collapse:collapse; margin-bottom:14px; font-size:0.84rem; }
  .md thead tr { background:var(--s1); }
  .md th { padding:7px 10px; text-align:left; color:var(--tx-dim); font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; }
  .md td { padding:7px 10px; color:var(--tx-mid); }
  .md tr:nth-child(even) td { background:var(--s2); }
  .md blockquote { border-left:3px solid var(--p); padding:10px 16px; background:var(--s2); margin-bottom:10px; border-radius:0 8px 8px 0; }
  .md blockquote p { margin:0; color:var(--p-soft); font-size:0.88rem; }
  .md a { color:var(--p); text-decoration:underline; }

  /* Form elements */
  input::placeholder { color: var(--tx-dim); opacity: 1; }
  select option { background: var(--s1); color: var(--tx); }
</style>
</head>
<body class="bg-surface text-on-surface font-body overflow-hidden h-screen">

<div class="flex h-full">

  <!-- ═══ SIDEBAR ═══ -->
  <aside class="w-[220px] flex-shrink-0 flex flex-col px-3 py-5 bg-surface-low overflow-y-auto">
    <!-- Logo -->
    <div class="px-3 mb-6">
      <h1 class="text-base font-black text-on-surface headline tracking-tight">career<span class="text-primary">·ops</span></h1>
      <p class="text-[10px] text-on-surface-dim mt-0.5 font-medium">Command Center</p>
    </div>

    <!-- Nav -->
    <nav class="flex flex-col gap-1">
      <button class="nav-item active" onclick="switchView(event,'dashboard')" data-view="dashboard">
        <span class="material-symbols-outlined">space_dashboard</span>Dashboard
      </button>
      <button class="nav-item" onclick="switchView(event,'applications')" data-view="applications">
        <span class="material-symbols-outlined">work</span>Applications
      </button>
      <button class="nav-item" onclick="switchView(event,'companies')" data-view="companies">
        <span class="material-symbols-outlined">corporate_fare</span>Companies
      </button>
      <button class="nav-item" onclick="switchView(event,'pipeline')" data-view="pipeline">
        <span class="material-symbols-outlined">account_tree</span>Pipeline
      </button>
      <button class="nav-item" onclick="switchView(event,'followups')" data-view="followups">
        <span class="material-symbols-outlined">mark_email_read</span>Follow-ups
      </button>
      <button class="nav-item" onclick="switchView(event,'scan')" data-view="scan">
        <span class="material-symbols-outlined">radar</span>Scan History
      </button>
    </nav>

    <!-- Bottom -->
    <div class="mt-auto pt-4">
      <div class="grid grid-cols-2 gap-2 mb-3 px-1">
        <div class="bg-surface-container p-2.5 rounded-lg text-center">
          <div class="text-lg font-black text-secondary headline" id="sb-total">—</div>
          <div class="text-[9px] text-on-surface-dim uppercase font-bold">Total</div>
        </div>
        <div class="bg-surface-container p-2.5 rounded-lg text-center">
          <div class="text-lg font-black text-primary headline" id="sb-applied">—</div>
          <div class="text-[9px] text-on-surface-dim uppercase font-bold">Applied</div>
        </div>
      </div>
      <button onclick="toggleTheme()" class="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-container transition-all text-on-surface-dim hover:text-on-surface text-xs font-medium">
        <span class="material-symbols-outlined text-[16px]" id="theme-icon">dark_mode</span>
        Toggle theme
      </button>
      <div class="text-[9px] text-on-surface-dim mt-2 text-center px-2 opacity-60" id="gen-time"></div>
    </div>
  </aside>

  <!-- ═══ MAIN ═══ -->
  <main class="flex-1 overflow-y-auto bg-surface">

    <!-- ══════════════ VIEW: DASHBOARD ══════════════ -->
    <section class="view active" id="view-dashboard">
      <div class="p-6 lg:p-10 space-y-8 max-w-[1600px] mx-auto">

        <!-- Header -->
        <div class="flex justify-between items-center">
          <div>
            <nav class="flex items-center gap-2 text-[10px] text-on-surface-dim mb-2 font-bold uppercase tracking-widest">
              <span>Career-Ops</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
              <span class="text-primary/70">Dashboard</span>
            </nav>
            <h2 class="text-4xl font-extrabold text-on-surface tracking-tight headline">Command Center</h2>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-on-surface-dim font-bold uppercase tracking-widest">Generated</div>
            <div class="text-xs text-on-surface-dim mt-0.5" id="gen-time-main"></div>
          </div>
        </div>

        <!-- KPI Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div class="bg-surface-container p-4 rounded-xl text-center group hover:bg-surface-container-high transition-all">
            <div class="text-2xl font-black text-on-surface headline" id="kpi-total">—</div>
            <div class="text-[9px] text-on-surface-dim uppercase font-bold tracking-widest mt-1">Total</div>
          </div>
          <div class="bg-surface-container p-4 rounded-xl text-center group hover:bg-surface-container-high transition-all">
            <div class="text-2xl font-black text-primary headline" id="kpi-applied">—</div>
            <div class="text-[9px] text-on-surface-dim uppercase font-bold tracking-widest mt-1">Applied</div>
          </div>
          <div class="bg-surface-container p-4 rounded-xl text-center group hover:bg-surface-container-high transition-all">
            <div class="text-2xl font-black text-secondary headline" id="kpi-interviews">—</div>
            <div class="text-[9px] text-on-surface-dim uppercase font-bold tracking-widest mt-1">Interviews</div>
          </div>
          <div class="bg-surface-container p-4 rounded-xl text-center group hover:bg-surface-container-high transition-all">
            <div class="text-2xl font-black text-tertiary headline" id="kpi-offers">—</div>
            <div class="text-[9px] text-on-surface-dim uppercase font-bold tracking-widest mt-1">Offers</div>
          </div>
          <div class="bg-surface-container p-4 rounded-xl text-center group hover:bg-surface-container-high transition-all">
            <div class="text-2xl font-black text-on-surface headline" id="kpi-avg">—</div>
            <div class="text-[9px] text-on-surface-dim uppercase font-bold tracking-widest mt-1">Avg Score</div>
          </div>
          <div class="bg-surface-container p-4 rounded-xl text-center group hover:bg-surface-container-high transition-all">
            <div class="text-2xl font-black text-secondary headline" id="kpi-top">—</div>
            <div class="text-[9px] text-on-surface-dim uppercase font-bold tracking-widest mt-1">Top Score</div>
          </div>
          <div class="bg-surface-container p-4 rounded-xl text-center group hover:bg-surface-container-high transition-all">
            <div class="text-2xl font-black text-error headline" id="kpi-apply-now">—</div>
            <div class="text-[9px] text-on-surface-dim uppercase font-bold tracking-widest mt-1">Apply Now</div>
          </div>
          <div class="bg-surface-container p-4 rounded-xl text-center group hover:bg-surface-container-high transition-all">
            <div class="text-2xl font-black text-on-surface-dim headline" id="kpi-pending">—</div>
            <div class="text-[9px] text-on-surface-dim uppercase font-bold tracking-widest mt-1">Pending</div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <!-- Score Distribution -->
          <div class="glass rounded-xl p-6 border ">
            <h3 class="text-xs font-black text-on-surface-dim uppercase tracking-widest mb-5">Score Distribution</h3>
            <div class="flex items-end gap-3 px-2" id="score-dist-bars" style="height:140px"></div>
            <div class="flex gap-3 px-2 mt-2" id="score-dist-labels"></div>
          </div>

          <!-- Status Breakdown -->
          <div class="glass rounded-xl p-6 border ">
            <h3 class="text-xs font-black text-on-surface-dim uppercase tracking-widest mb-5">Status Breakdown</h3>
            <div id="status-breakdown" class="space-y-2.5"></div>
          </div>

          <!-- Pipeline Insight -->
          <div class="glass rounded-xl p-6 border  flex flex-col justify-between">
            <div>
              <h3 class="text-xs font-black text-on-surface-dim uppercase tracking-widest mb-4">Pipeline Insight</h3>
              <div id="pipeline-insight" class="space-y-3"></div>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-5">
              <div class="p-3 bg-surface-container-low rounded-xl">
                <p class="text-[9px] font-bold text-on-surface-dim uppercase tracking-widest mb-1">Companies</p>
                <p class="text-xl font-bold text-secondary headline" id="insight-companies">—</p>
              </div>
              <div class="p-3 bg-surface-container-low rounded-xl">
                <p class="text-[9px] font-bold text-on-surface-dim uppercase tracking-widest mb-1">Qualify ≥4.0</p>
                <p class="text-xl font-bold text-primary headline" id="insight-qualify">—</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Prospects Table -->
        <div class="glass rounded-xl overflow-hidden border ">
          <div class="p-6 border-b  flex justify-between items-center">
            <h3 class="text-xl font-bold text-on-surface headline">Top Prospects</h3>
            <button class="text-primary text-sm font-bold hover:underline" onclick="switchView(event,'applications')">View All</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="bg-surface-container-low">
                <tr>
                  <th class="px-6 py-4 text-[10px] text-on-surface-dim uppercase tracking-widest font-bold">#</th>
                  <th class="px-6 py-4 text-[10px] text-on-surface-dim uppercase tracking-widest font-bold">Company</th>
                  <th class="px-6 py-4 text-[10px] text-on-surface-dim uppercase tracking-widest font-bold">Role</th>
                  <th class="px-6 py-4 text-[10px] text-on-surface-dim uppercase tracking-widest font-bold">Score</th>
                  <th class="px-6 py-4 text-[10px] text-on-surface-dim uppercase tracking-widest font-bold">Status</th>
                  <th class="px-6 py-4 text-[10px] text-on-surface-dim uppercase tracking-widest font-bold text-right">Links</th>
                </tr>
              </thead>
              <tbody id="top-prospects-tbody"></tbody>
            </table>
          </div>
        </div>

      </div>
    </section>

    <!-- ══════════════ VIEW: APPLICATIONS ══════════════ -->
    <section class="view" id="view-applications">
      <div class="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto w-full">

        <!-- Header -->
        <div class="flex justify-between items-end">
          <div>
            <nav class="flex items-center gap-2 text-[10px] text-on-surface-dim mb-2 font-bold uppercase tracking-widest">
              <span>Career-Ops</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
              <span class="text-primary/70">Applications</span>
            </nav>
            <h2 class="text-4xl font-extrabold text-on-surface tracking-tight headline">Active Applications</h2>
          </div>
        </div>

        <!-- Stats bar -->
        <div class="grid grid-cols-3 gap-4">
          <div class="bg-surface-container p-5 rounded-xl relative overflow-hidden">
            <p class="text-[9px] font-bold text-on-surface-dim uppercase tracking-widest mb-1">Total Evaluated</p>
            <h3 class="text-3xl font-black text-on-surface headline" id="apps-stat-total">—</h3>
          </div>
          <div class="bg-surface-container p-5 rounded-xl relative overflow-hidden">
            <p class="text-[9px] font-bold text-on-surface-dim uppercase tracking-widest mb-1">Avg Score</p>
            <h3 class="text-3xl font-black text-on-surface headline" id="apps-stat-avg">—<span class="text-base text-on-surface-dim">/5</span></h3>
          </div>
          <div class="bg-surface-container p-5 rounded-xl relative overflow-hidden">
            <p class="text-[9px] font-bold text-on-surface-dim uppercase tracking-widest mb-1">Ready to Apply</p>
            <h3 class="text-3xl font-black text-on-surface headline" id="apps-stat-ready">—</h3>
          </div>
        </div>

        <!-- Table Container -->
        <div class="bg-surface-container rounded-xl overflow-hidden">
          <!-- Filter bar -->
          <div class="px-5 py-3 bg-surface-container-high/30 flex items-center gap-3 flex-wrap">
            <input type="text" id="apps-search" placeholder="Search company, role, notes…"
              class="flex-1 min-w-[180px] bg-surface-container border  rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
              oninput="filterApps()"/>
            <select id="apps-status" onchange="filterApps()"
              class="bg-surface-container border  rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50">
              <option value="">All statuses</option>
              <option>Evaluada</option><option>Evaluated</option><option>Applied</option>
              <option>Interview</option><option>Offer</option><option>Rejected</option>
              <option>Discarded</option><option>SKIP</option>
            </select>
            <select id="apps-score" onchange="filterApps()"
              class="bg-surface-container border  rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50">
              <option value="">All scores</option>
              <option value="4.5">≥ 4.5 (Hot)</option>
              <option value="4.0">≥ 4.0</option>
              <option value="3.5">≥ 3.5</option>
              <option value="3.0">≥ 3.0</option>
            </select>
            <span id="apps-count" class="text-xs text-on-surface-dim font-medium ml-auto"></span>
          </div>

          <!-- Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-left" id="app-table">
              <thead>
                <tr class="bg-surface-container-high/20">
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest cursor-pointer hover:text-primary transition-colors" onclick="sortApps('#')">#</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest cursor-pointer hover:text-primary transition-colors" onclick="sortApps('date')">Date ↕</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest cursor-pointer hover:text-primary transition-colors" onclick="sortApps('company')">Company ↕</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Role</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest cursor-pointer hover:text-primary transition-colors" onclick="sortApps('score')">Score ↕</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Status</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">PDF</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Notes</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Links</th>
                </tr>
              </thead>
              <tbody id="app-tbody"></tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="px-5 py-3 flex items-center justify-between bg-surface-container-high/20">
            <div class="flex gap-1" id="pagination"></div>
            <div class="text-xs text-on-surface-dim">Page <span id="current-page">1</span> of <span id="total-pages">1</span></div>
          </div>
        </div>

      </div>
    </section>

    <!-- ══════════════ VIEW: COMPANIES ══════════════ -->
    <section class="view" id="view-companies">
      <div class="p-6 lg:p-8 space-y-6 max-w-[1400px] w-full mx-auto">
        <div class="flex justify-between items-end">
          <div>
            <nav class="flex items-center gap-2 text-[10px] text-on-surface-dim mb-2 font-bold uppercase tracking-widest">
              <span>Career-Ops</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
              <span class="text-primary/70">Companies</span>
            </nav>
            <h2 class="text-4xl font-extrabold tracking-tight text-on-surface headline">Tracked Companies</h2>
          </div>
          <input type="text" id="co-search" placeholder="Search company…" oninput="filterCompanies()"
            class="bg-surface-container border  rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50 w-56"/>
        </div>
        <div id="companies-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"></div>
      </div>
    </section>

    <!-- ══════════════ VIEW: PIPELINE ══════════════ -->
    <section class="view" id="view-pipeline">
      <div class="p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6">
        <div>
          <nav class="flex items-center gap-2 text-[10px] text-on-surface-dim mb-2 font-bold uppercase tracking-widest">
            <span>Career-Ops</span>
            <span class="material-symbols-outlined text-sm">chevron_right</span>
            <span class="text-primary/70">Pipeline</span>
          </nav>
          <h2 class="text-4xl font-extrabold tracking-tight text-on-surface headline">Pipeline</h2>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h3 class="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
              <span class="material-symbols-outlined text-primary">inbox</span>
              Pending Evaluation <span class="text-on-surface-dim font-normal" id="pending-count"></span>
            </h3>
            <div id="pipeline-pending-list" class="space-y-3"></div>
          </div>
          <div>
            <h3 class="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
              <span class="material-symbols-outlined text-secondary">radar</span>
              Prospect Queue <span class="text-on-surface-dim font-normal" id="prospect-count"></span>
            </h3>
            <div id="prospect-pipeline-list" class="space-y-3"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════════ VIEW: FOLLOW-UPS ══════════════ -->
    <section class="view" id="view-followups">
      <div class="p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-8">
        <div>
          <nav class="flex items-center gap-2 text-[10px] text-on-surface-dim mb-2 font-bold uppercase tracking-widest">
            <span>Career-Ops</span>
            <span class="material-symbols-outlined text-sm">chevron_right</span>
            <span class="text-primary/70">Follow-ups</span>
          </nav>
          <h2 class="text-4xl font-extrabold tracking-tight text-on-surface headline">Follow-up Hub</h2>
        </div>

        <!-- Follow-up table -->
        <div class="bg-surface-container rounded-xl overflow-hidden">
          <div class="px-5 py-3 bg-surface-container-high/30 text-xs font-black text-on-surface-dim uppercase tracking-widest">Active Applications</div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="bg-surface-container-high/20">
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Company</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Role</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Score</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Status</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Date</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Days</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Links</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Notes</th>
                </tr>
              </thead>
              <tbody id="followup-tbody" class="divide-y divide-outline-variant/10"></tbody>
            </table>
          </div>
        </div>

        <!-- Contacts -->
        <div class="bg-surface-container rounded-xl overflow-hidden">
          <div class="px-5 py-3 bg-surface-container-high/30 text-xs font-black text-on-surface-dim uppercase tracking-widest">Contacts (saved locally)</div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="bg-surface-container-high/20">
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Company</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Role</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Contact Name</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">LinkedIn</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest text-center">Contacted</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Date</th>
                </tr>
              </thead>
              <tbody id="contacts-tbody" class="divide-y divide-outline-variant/10"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════════ VIEW: SCAN HISTORY ══════════════ -->
    <section class="view" id="view-scan">
      <div class="p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6">
        <div>
          <nav class="flex items-center gap-2 text-[10px] text-on-surface-dim mb-2 font-bold uppercase tracking-widest">
            <span>Career-Ops</span>
            <span class="material-symbols-outlined text-sm">chevron_right</span>
            <span class="text-primary/70">Scan History</span>
          </nav>
          <h2 class="text-4xl font-extrabold tracking-tight text-on-surface headline">Scan History</h2>
        </div>
        <div class="flex gap-3 flex-wrap">
          <input type="text" id="scan-search" placeholder="Search URL, company, title…" oninput="filterScan()"
            class="flex-1 min-w-[200px] bg-surface-container border  rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"/>
          <select id="scan-status" onchange="filterScan()"
            class="bg-surface-container border  rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50">
            <option value="">All statuses</option>
            <option value="added_linear">Added</option>
            <option value="pipeline">Pipeline</option>
            <option value="skipped_title">Skipped title</option>
            <option value="skipped_dup">Skipped dup</option>
          </select>
          <span id="scan-count" class="text-xs text-on-surface-dim font-medium self-center"></span>
        </div>
        <div class="bg-surface-container rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="bg-surface-container-high/20">
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Company</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Title</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Status</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Portal</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Date</th>
                  <th class="px-4 py-3 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">URL</th>
                </tr>
              </thead>
              <tbody id="scan-tbody" class="divide-y divide-outline-variant/10"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

  </main>
</div>

<!-- ═══ REPORT MODAL ═══ -->
<div id="report-modal">
  <div id="modal-backdrop" onclick="closeModal()"></div>
  <div id="modal-panel">
    <div id="modal-header">
      <div>
        <div id="modal-company" class="text-[10px] text-on-surface-dim font-bold uppercase tracking-widest mb-1"></div>
        <div id="modal-title" class="text-on-surface font-bold text-sm leading-tight"></div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0 ml-3">
        <a id="modal-url-link" href="#" target="_blank" class="hidden text-xs text-primary hover:underline font-bold flex items-center gap-1">
          View JD <span class="material-symbols-outlined text-[14px]">open_in_new</span>
        </a>
        <button id="modal-close" onclick="closeModal()" title="Close (Esc)">✕</button>
      </div>
    </div>
    <div id="modal-body-wrap" class="md"></div>
  </div>
</div>

<script>
const DATA = ${DATA};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s) {
  if (s >= 4.5) return 'var(--p)';
  if (s >= 4.0) return 'var(--p-soft)';
  if (s >= 3.5) return 'var(--warn)';
  return 'var(--err)';
}

function pillHtml(status) {
  const cls = {
    'Applied':'pill-applied','Interview':'pill-interview','Offer':'pill-offer',
    'Rejected':'pill-rejected','SKIP':'pill-skip','Discarded':'pill-discarded',
    'Responded':'pill-responded',
  }[status] || 'pill-evaluated';
  return \`<span class="pill \${cls}">\${status}</span>\`;
}

function truncate(s, n=60) { return s && s.length > n ? s.slice(0,n)+'…' : (s||''); }

function daysSince(dateStr) {
  if (!dateStr) return '—';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1d';
  return diff + 'd';
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1d ago';
  if (diff < 7) return diff + 'd ago';
  if (diff < 30) return Math.floor(diff/7) + 'w ago';
  return Math.floor(diff/30) + 'mo ago';
}

function letterAvatar(name) {
  return name ? name.trim()[0].toUpperCase() : '?';
}

// ── View switching ────────────────────────────────────────────────────────────

function switchView(e, viewId) {
  if (e) e.stopPropagation();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = document.getElementById('view-' + viewId);
  if (view) view.classList.add('active');
  const btn = document.querySelector(\`[data-view="\${viewId}"]\`);
  if (btn) btn.classList.add('active');
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  document.documentElement.classList.toggle('dark', !isLight);
  document.getElementById('theme-icon').textContent = isLight ? 'light_mode' : 'dark_mode';
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

function renderKPIs() {
  const k = DATA.kpis;
  document.getElementById('kpi-total').textContent = k.total;
  document.getElementById('kpi-applied').textContent = k.applied;
  document.getElementById('kpi-interviews').textContent = k.interviews;
  document.getElementById('kpi-offers').textContent = k.offers;
  document.getElementById('kpi-avg').textContent = k.avgScore;
  document.getElementById('kpi-top').textContent = k.topScore;
  document.getElementById('kpi-apply-now').textContent = k.applyNow;
  document.getElementById('kpi-pending').textContent = k.pending;
  document.getElementById('sb-total').textContent = k.total;
  document.getElementById('sb-applied').textContent = k.applied;
  document.getElementById('apps-stat-total').textContent = k.total;
  document.getElementById('apps-stat-avg').innerHTML = k.avgScore + '<span class="text-base text-on-surface-dim">/5</span>';
  document.getElementById('apps-stat-ready').textContent = k.applyNow;
  const genStr = new Date(DATA.generated).toLocaleString();
  document.getElementById('gen-time').textContent = genStr;
  const gm = document.getElementById('gen-time-main');
  if (gm) gm.textContent = genStr;
}

// ── Score Distribution ────────────────────────────────────────────────────────

function renderScoreDist() {
  const dist = DATA.scoreDist;
  const entries = Object.entries(dist);
  const maxVal = Math.max(...entries.map(e => e[1]), 1);
  const DIST_COLORS = ['var(--dist0)','var(--dist1)','var(--dist2)','var(--dist3)','var(--dist4)'];
  const barsEl = document.getElementById('score-dist-bars');
  const labelsEl = document.getElementById('score-dist-labels');
  const BAR_H = 140;

  barsEl.innerHTML = entries.map(([label, val], i) => {
    const h = Math.max(4, Math.round((val / maxVal) * BAR_H));
    const col = DIST_COLORS[i];
    return \`<div class="flex-1 flex flex-col items-center gap-1.5">
      <span class="text-xs font-black" style="color:\${col}">\${val}</span>
      <div class="w-full rounded-t-md" style="height:\${h}px;background:\${col};opacity:0.25;border-top:2px solid \${col}"></div>
    </div>\`;
  }).join('');

  labelsEl.innerHTML = entries.map(([label]) =>
    \`<div class="flex-1 text-center text-[9px] text-on-surface-dim font-bold">\${label}</div>\`
  ).join('');
}

// ── Status Breakdown ──────────────────────────────────────────────────────────

function renderStatusBreakdown() {
  const counts = DATA.statusCounts;
  const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
  const colors = { Applied:'var(--p)', Interview:'var(--warn)', Offer:'var(--p-soft)', Rejected:'var(--err)', SKIP:'var(--tx-dim)', Discarded:'var(--tx-dim)', Evaluated:'var(--p-soft)', Evaluada:'var(--p-soft)', Responded:'var(--p-soft)' };
  const fallback = 'var(--tx-mid)';
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  document.getElementById('status-breakdown').innerHTML = sorted.map(([s, n]) => {
    const pct = Math.round((n / total) * 100);
    const col = colors[s] || fallback;
    return \`<div>
      <div class="flex justify-between text-xs mb-1">
        <span style="color:\${col}" class="font-medium">\${s}</span>
        <span class="text-on-surface-dim">\${n}</span>
      </div>
      <div class="h-1.5 rounded-full bg-surface-container-high/60 overflow-hidden">
        <div class="h-full rounded-full" style="width:\${pct}%;background:\${col}"></div>
      </div>
    </div>\`;
  }).join('');
}

// ── Pipeline Insight ──────────────────────────────────────────────────────────

function renderPipelineInsight() {
  const qualify = DATA.apps.filter(a => a.score >= 4.0).length;
  const applied = DATA.apps.filter(a => ['Applied','Interview','Offer'].includes(a.status)).length;
  document.getElementById('insight-companies').textContent = DATA.companies.length;
  document.getElementById('insight-qualify').textContent = qualify;
  const topApp = [...DATA.apps].sort((a, b) => b.score - a.score)[0];
  document.getElementById('pipeline-insight').innerHTML = \`
    <div class="text-sm text-on-surface-dim leading-relaxed">
      <span class="text-on-surface font-bold">\${qualify}</span> offers scored ≥4.0 across
      <span class="text-on-surface font-bold">\${DATA.companies.length}</span> companies.
      \${applied ? \`<span class="text-on-surface font-bold">\${applied}</span> applications in progress.\` : ''}
    </div>
    \${topApp ? \`<div class="mt-3 p-3 bg-surface-container-low rounded-lg">
      <div class="text-[9px] text-on-surface-dim uppercase font-bold tracking-widest mb-1">Top Prospect</div>
      <div class="font-bold text-on-surface text-sm">\${topApp.company}</div>
      <div class="text-xs text-on-surface-dim mt-0.5">\${truncate(topApp.role,40)} · \${topApp.score}/5</div>
    </div>\` : ''}
  \`;
}

// ── Top Prospects Table ───────────────────────────────────────────────────────

function renderProspects() {
  const top = [...DATA.apps].filter(a => a.score >= 4.0).sort((a, b) => b.score - a.score).slice(0, 8);
  document.getElementById('top-prospects-tbody').innerHTML = top.map(a => \`
    <tr class="border-t  hover:bg-surface-container/50 transition-colors">
      <td class="px-6 py-4 text-xs text-on-surface-dim">\${a.num}</td>
      <td class="px-6 py-4 font-bold text-on-surface whitespace-nowrap">\${a.company}</td>
      <td class="px-6 py-4 text-on-surface-dim max-w-xs text-sm">\${truncate(a.role,45)}</td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="flex items-center gap-2">
          <span class="font-black text-sm" style="color:\${scoreColor(a.score)}">\${a.score}/5</span>
          <div class="w-16 h-1 rounded-full bg-surface-high overflow-hidden">
            <div class="h-full rounded-full" style="width:\${(a.score/5)*100}%;background:\${scoreColor(a.score)}"></div>
          </div>
        </div>
      </td>
      <td class="px-6 py-4">\${pillHtml(a.status)}</td>
      <td class="px-6 py-4 text-right">
        <div class="flex items-center justify-end gap-3">
          \${a.reportNum ? \`<button onclick="openReport(\${+a.reportNum},\${JSON.stringify(a.company).replace(/"/g,'&quot;')},\${JSON.stringify(a.role).replace(/"/g,'&quot;')},\${JSON.stringify(a.url||'').replace(/"/g,'&quot;')})" class="text-xs text-primary hover:underline font-bold">report</button>\` : ''}
          \${a.url ? \`<a href="\${a.url}" target="_blank" class="text-xs text-on-surface-dim hover:text-on-surface font-bold flex items-center gap-0.5">jd <span class="material-symbols-outlined text-[12px]">open_in_new</span></a>\` : ''}
        </div>
      </td>
    </tr>
  \`).join('') || \`<tr><td colspan="6" class="px-6 py-8 text-center text-on-surface-dim text-sm">No prospects with score ≥ 4.0 yet.</td></tr>\`;
}

// ── Applications Table ────────────────────────────────────────────────────────

const PAGE_SIZE = 15;
let appsData = [...DATA.apps];
let appsSortKey = 'score';
let appsSortDir = -1;
let appsPage = 1;

function filterApps() {
  const q = (document.getElementById('apps-search').value || '').toLowerCase();
  const st = document.getElementById('apps-status').value;
  const sc = parseFloat(document.getElementById('apps-score').value) || 0;
  appsData = DATA.apps.filter(a => {
    const match = !q || [a.company, a.role, a.notes, a.archetype].join(' ').toLowerCase().includes(q);
    const status = !st || a.status === st;
    const score = !sc || a.score >= sc;
    return match && status && score;
  });
  appsPage = 1;
  sortAppsBy(appsSortKey);
}

function sortApps(key) {
  if (appsSortKey === key) appsSortDir *= -1;
  else { appsSortKey = key; appsSortDir = -1; }
  appsPage = 1;
  sortAppsBy(key);
}

function sortAppsBy(key) {
  const keyMap = { '#':'num', date:'date', company:'company', role:'role', score:'score', status:'status', pdf:'pdf', notes:'notes' };
  const k = keyMap[key] || key;
  appsData = [...appsData].sort((a, b) => {
    const av = a[k], bv = b[k];
    if (typeof av === 'number') return (av - bv) * appsSortDir;
    return String(av||'').localeCompare(String(bv||'')) * appsSortDir;
  });
  renderAppsTable();
}

function renderAppsTable() {
  const start = (appsPage - 1) * PAGE_SIZE;
  const page = appsData.slice(start, start + PAGE_SIZE);
  const total = appsData.length;
  const pages = Math.ceil(total / PAGE_SIZE) || 1;
  document.getElementById('apps-count').textContent = total + ' offers';
  document.getElementById('current-page').textContent = appsPage;
  document.getElementById('total-pages').textContent = pages;

  document.getElementById('app-tbody').innerHTML = page.map(a => \`
    <tr class="bg-surface/30 border-t  transition-colors">
      <td class="px-4 py-2.5 text-xs text-on-surface-dim">\${a.num}</td>
      <td class="px-4 py-2.5 text-xs text-on-surface-dim whitespace-nowrap">\${a.date}</td>
      <td class="px-4 py-2.5 font-bold text-on-surface whitespace-nowrap text-sm">\${a.company}</td>
      <td class="px-4 py-2.5 text-on-surface-dim text-sm max-w-xs">\${truncate(a.role,45)}</td>
      <td class="px-4 py-2.5 whitespace-nowrap">
        <div class="flex items-center gap-2">
          <span class="font-black text-sm" style="color:\${scoreColor(a.score)}">\${a.score}</span>
          <div class="w-10 h-1 rounded-full bg-surface-high overflow-hidden">
            <div class="h-full rounded-full" style="width:\${(a.score/5)*100}%;background:\${scoreColor(a.score)}"></div>
          </div>
        </div>
      </td>
      <td class="px-4 py-2.5">\${pillHtml(a.status)}</td>
      <td class="px-4 py-2.5 text-center text-sm">\${a.pdf ? '✅' : '—'}</td>
      <td class="px-4 py-2.5 text-xs text-on-surface-dim max-w-[220px]" title="\${a.notes}">\${truncate(a.notes,55)}</td>
      <td class="px-4 py-2.5 text-xs whitespace-nowrap">
        <div class="flex items-center gap-2">
          \${a.reportNum ? \`<button onclick="openReport(\${+a.reportNum},\${JSON.stringify(a.company).replace(/"/g,'&quot;')},\${JSON.stringify(a.role).replace(/"/g,'&quot;')},\${JSON.stringify(a.url||'').replace(/"/g,'&quot;')})" class="text-primary hover:underline font-bold">report</button>\` : ''}
          \${a.url ? \`<a href="\${a.url}" target="_blank" class="text-on-surface-dim hover:text-on-surface font-bold flex items-center gap-0.5">jd <span class="material-symbols-outlined text-[12px]">open_in_new</span></a>\` : ''}
          \${a.reportMtime ? \`<span class="text-on-surface-dim">\${timeAgo(a.reportMtime)}</span>\` : ''}
        </div>
      </td>
    </tr>
  \`).join('');

  // Pagination
  const pg = document.getElementById('pagination');
  pg.innerHTML = '';
  for (let i = 1; i <= pages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = \`px-3 py-1.5 rounded-lg text-xs font-bold transition-all \${i === appsPage ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-dim hover:bg-surface-container-high hover:text-on-surface'}\`;
    btn.onclick = () => { appsPage = i; renderAppsTable(); };
    pg.appendChild(btn);
  }
}

// ── Companies ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['var(--av0)','var(--av1)','var(--av2)','var(--av3)','var(--av4)','var(--av5)','var(--av6)'];

function renderCompanies(data) {
  document.getElementById('companies-grid').innerHTML = data.map((c, i) => {
    const col = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const topRole = [...c.roles].sort((a, b) => b.score - a.score)[0];
    const statusTag = c.applied > 0 ? 'Applied' : (c.maxScore >= 4.0 ? 'Hot Pick' : 'Tracked');
    const tagCls = c.applied > 0 ? 'bg-secondary/15 text-secondary border-secondary/25' : (c.maxScore >= 4.0 ? 'bg-tertiary/15 text-tertiary border-tertiary/25' : 'bg-surface-container-highest text-on-surface-dim border-transparent');
    return \`
      <div class="group bg-surface-container hover:bg-surface-container-high rounded-xl p-6 transition-all duration-300 relative overflow-hidden">
        <div class="absolute top-4 right-4">
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border \${tagCls}">\${statusTag}</span>
        </div>
        <div class="flex items-start gap-4 mb-5">
          <div class="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-xl font-black flex-shrink-0" style="color:\${col}">\${letterAvatar(c.name)}</div>
          <div>
            <h3 class="text-lg font-bold text-on-surface headline">\${c.name}</h3>
            <p class="text-xs text-on-surface-dim">\${c.roles.length} role\${c.roles.length>1?'s':''} · avg \${c.avgScore}/5 · \${c.applied} applied</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-5">
          <div class="bg-surface-container-low rounded-lg p-3">
            <p class="text-[9px] font-bold text-on-surface-dim uppercase tracking-widest mb-1">Top Score</p>
            <p class="text-xl font-black headline" style="color:\${scoreColor(c.maxScore)}">\${c.maxScore}<span class="text-xs text-on-surface-dim font-medium">/5</span></p>
          </div>
          <div class="bg-surface-container-low rounded-lg p-3">
            <p class="text-[9px] font-bold text-on-surface-dim uppercase tracking-widest mb-1">Roles</p>
            <p class="text-xl font-black text-primary headline">\${c.roles.length}</p>
          </div>
        </div>
        <ul class="space-y-1.5">
          \${c.roles.sort((a, b) => b.score - a.score).slice(0, 4).map(r => \`
            <li class="flex items-center justify-between text-xs bg-surface-container-highest/30 px-3 py-2 rounded-lg hover:bg-surface-container-highest/60 transition-colors">
              <span class="text-on-surface-dim truncate max-w-[170px]" title="\${r.role}">\${truncate(r.role,30)}</span>
              <div class="flex items-center gap-2 flex-shrink-0 ml-1">
                \${pillHtml(r.status)}
                \${r.reportNum ? \`<button onclick="openReport(\${+r.reportNum},\${JSON.stringify(r.company).replace(/"/g,'&quot;')},\${JSON.stringify(r.role).replace(/"/g,'&quot;')},\${JSON.stringify(r.url||'').replace(/"/g,'&quot;')})" class="text-primary font-bold hover:underline text-[10px]">rep</button>\` : ''}
                \${r.url ? \`<a href="\${r.url}" target="_blank" class="text-on-surface-dim hover:text-primary"><span class="material-symbols-outlined text-[12px]">open_in_new</span></a>\` : ''}
              </div>
            </li>
          \`).join('')}
          \${c.roles.length > 4 ? \`<li class="text-[10px] text-on-surface-dim px-3 py-1">+\${c.roles.length-4} more roles…</li>\` : ''}
        </ul>
      </div>
    \`;
  }).join('');
}

function filterCompanies() {
  const q = (document.getElementById('co-search').value || '').toLowerCase();
  renderCompanies(DATA.companies.filter(c => !q || c.name.toLowerCase().includes(q)));
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

function renderPipeline() {
  const pending = DATA.pipeline;
  document.getElementById('pending-count').textContent = \`(\${pending.length})\`;
  document.getElementById('pipeline-pending-list').innerHTML = pending.length
    ? pending.slice(0, 50).map(p => \`
      <div class="group bg-surface-container hover:bg-surface-container-high p-4 rounded-xl transition-all border-l-4 border-transparent hover:border-primary">
        \${p.company ? \`<div class="font-bold text-on-surface text-sm">\${p.company}</div>\` : ''}
        \${p.role ? \`<div class="text-xs text-on-surface-dim mb-2">\${p.role}</div>\` : ''}
        <a href="\${p.url}" target="_blank" class="text-xs text-primary hover:underline break-all flex items-center gap-1">
          <span class="material-symbols-outlined text-[12px]">link</span>\${truncate(p.url, 70)}
        </a>
      </div>
    \`).join('')
    : '<p class="text-on-surface-dim text-sm py-6">No pending URLs in pipeline.md ✅</p>';

  const prospects = DATA.prospectPending;
  document.getElementById('prospect-count').textContent = \`(\${prospects.length})\`;
  document.getElementById('prospect-pipeline-list').innerHTML = prospects.length
    ? prospects.map(p => \`
      <div class="bg-surface-container hover:bg-surface-container-high p-4 rounded-xl transition-all">
        <div class="flex justify-between items-start mb-2">
          <div>
            <div class="font-bold text-on-surface text-sm">\${p.company || '—'}</div>
            <div class="text-xs text-on-surface-dim">\${truncate(p.title||'',45)}</div>
          </div>
          <span class="text-[10px] text-on-surface-dim flex-shrink-0 ml-2">\${p.first_seen||''}</span>
        </div>
        <a href="\${p.url}" target="_blank" class="text-xs text-primary hover:underline flex items-center gap-1">
          <span class="material-symbols-outlined text-[12px]">open_in_new</span>\${truncate(p.url,60)}
        </a>
      </div>
    \`).join('')
    : '<p class="text-on-surface-dim text-sm py-6">Prospect pipeline empty</p>';
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

function renderFollowUp() {
  const pri = { Offer:0, Interview:1, Responded:2, Applied:3 };
  const data = [...DATA.followUp].sort((a, b) => (pri[a.status]||9) - (pri[b.status]||9));
  document.getElementById('followup-tbody').innerHTML = data.map(a => \`
    <tr class="bg-surface/30 hover:bg-surface-container/50 transition-colors">
      <td class="px-4 py-2.5 font-bold text-on-surface text-sm whitespace-nowrap">\${a.company}</td>
      <td class="px-4 py-2.5 text-on-surface-dim text-sm max-w-xs">\${truncate(a.role,40)}</td>
      <td class="px-4 py-2.5 font-black text-sm whitespace-nowrap" style="color:\${scoreColor(a.score)}">\${a.score}/5</td>
      <td class="px-4 py-2.5">\${pillHtml(a.status)}</td>
      <td class="px-4 py-2.5 text-xs text-on-surface-dim whitespace-nowrap">\${a.date}</td>
      <td class="px-4 py-2.5 text-xs text-on-surface-dim whitespace-nowrap">\${daysSince(a.date)}</td>
      <td class="px-4 py-2.5 text-xs whitespace-nowrap">
        <div class="flex items-center gap-2">
          \${a.reportNum ? \`<button onclick="openReport(\${+a.reportNum},\${JSON.stringify(a.company).replace(/"/g,'&quot;')},\${JSON.stringify(a.role).replace(/"/g,'&quot;')},\${JSON.stringify(a.url||'').replace(/"/g,'&quot;')})" class="text-primary hover:underline font-bold">report</button>\` : ''}
          \${a.url ? \`<a href="\${a.url}" target="_blank" class="text-on-surface-dim hover:text-on-surface font-bold flex items-center gap-0.5">jd <span class="material-symbols-outlined text-[12px]">open_in_new</span></a>\` : ''}
        </div>
      </td>
      <td class="px-4 py-2.5 text-xs text-on-surface-dim max-w-xs">\${truncate(a.notes,50)}</td>
    </tr>
  \`).join('') || \`<tr><td colspan="8" class="px-4 py-8 text-center text-on-surface-dim">No active applications yet</td></tr>\`;
}

// ── Contacts (localStorage) ───────────────────────────────────────────────────

function loadContacts() { try { return JSON.parse(localStorage.getItem('career-ops-contacts') || '{}'); } catch { return {}; } }
function saveContacts(c) { localStorage.setItem('career-ops-contacts', JSON.stringify(c)); }

function renderContacts() {
  const contacts = loadContacts();
  document.getElementById('contacts-tbody').innerHTML = DATA.followUp.map(a => {
    const key = String(a.num);
    const c = contacts[key] || {};
    return \`
      <tr class="bg-surface/30 hover:bg-surface-container/50 transition-colors">
        <td class="px-4 py-2.5 font-bold text-on-surface text-sm whitespace-nowrap">\${a.company}</td>
        <td class="px-4 py-2.5 text-on-surface-dim text-xs max-w-xs">\${truncate(a.role,35)}</td>
        <td class="px-4 py-2.5">
          <input type="text" placeholder="Name…" value="\${c.name||''}" onchange="updateContact('\${key}','name',this.value)"
            class="bg-surface-container border  rounded-lg px-2 py-1 text-xs text-on-surface w-32 focus:outline-none focus:border-primary/50"/>
        </td>
        <td class="px-4 py-2.5">
          <input type="text" placeholder="linkedin.com/in/…" value="\${c.linkedin||''}" onchange="updateContact('\${key}','linkedin',this.value)"
            class="bg-surface-container border  rounded-lg px-2 py-1 text-xs text-on-surface-dim w-48 focus:outline-none focus:border-primary/50"/>
        </td>
        <td class="px-4 py-2.5 text-center">
          <input type="checkbox" \${c.contacted?'checked':''} title="Mark as contacted"
            onchange="toggleContacted('\${key}',this.checked)" class="w-4 h-4 cursor-pointer accent-primary"/>
        </td>
        <td class="px-4 py-2.5">
          <input type="date" value="\${c.date||''}" \${c.contacted?'':'disabled'} id="contact-date-\${key}"
            onchange="updateContact('\${key}','date',this.value)"
            class="bg-surface-container border  rounded-lg px-2 py-1 text-xs text-on-surface disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:border-primary/50"/>
        </td>
      </tr>
    \`;
  }).join('') || \`<tr><td colspan="6" class="px-4 py-8 text-center text-on-surface-dim">No active applications yet</td></tr>\`;
}

function updateContact(key, field, value) {
  const contacts = loadContacts();
  if (!contacts[key]) contacts[key] = {};
  contacts[key][field] = value;
  saveContacts(contacts);
}

function toggleContacted(key, checked) {
  const contacts = loadContacts();
  if (!contacts[key]) contacts[key] = {};
  contacts[key].contacted = checked;
  if (checked && !contacts[key].date) contacts[key].date = new Date().toISOString().split('T')[0];
  saveContacts(contacts);
  const dateInput = document.getElementById('contact-date-' + key);
  if (dateInput) { dateInput.disabled = !checked; if (checked) dateInput.value = contacts[key].date; }
}

// ── Scan History ──────────────────────────────────────────────────────────────

function renderScanTable(data) {
  const statusColors = { added_linear:'var(--p)', pipeline:'var(--p-soft)', skipped_title:'var(--tx-dim)', skipped_dup:'var(--tx-dim)' };
  document.getElementById('scan-count').textContent = data.length + ' entries';
  document.getElementById('scan-tbody').innerHTML = data.map(h => \`
    <tr class="bg-surface/30 hover:bg-surface-container/50 transition-colors">
      <td class="px-4 py-2 text-on-surface text-sm whitespace-nowrap">\${h.company||'—'}</td>
      <td class="px-4 py-2 text-on-surface-dim text-sm max-w-xs">\${truncate(h.title||'',45)}</td>
      <td class="px-4 py-2 text-xs font-bold" style="color:\${statusColors[h.status]||'var(--tx-mid)'}">\${h.status||''}</td>
      <td class="px-4 py-2 text-xs text-on-surface-dim">\${h.portal||''}</td>
      <td class="px-4 py-2 text-xs text-on-surface-dim whitespace-nowrap">\${h.first_seen||''}</td>
      <td class="px-4 py-2 text-xs">
        \${h.url ? \`<a href="\${h.url}" target="_blank" class="text-primary hover:underline flex items-center gap-0.5">\${truncate(h.url,50)} <span class="material-symbols-outlined text-[12px]">open_in_new</span></a>\` : ''}
      </td>
    </tr>
  \`).join('');
}

function filterScan() {
  const q = (document.getElementById('scan-search').value || '').toLowerCase();
  const st = document.getElementById('scan-status').value;
  renderScanTable(DATA.scanHistory.filter(h =>
    (!q || [h.company,h.title,h.url].join(' ').toLowerCase().includes(q)) &&
    (!st || h.status === st)
  ));
}

// ── Markdown Renderer ─────────────────────────────────────────────────────────

function renderMd(md) {
  if (!md) return '<p class="text-on-surface-dim">No content available.</p>';
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Tables first
  md = md.replace(/((?:^\|.+\|.*\n?)+)/gm, block => {
    const rows = block.trim().split('\n').filter(r => r.trim() && !/^[\s|:-]+$/.test(r));
    if (rows.length < 2) return block;
    const [head, ...body] = rows;
    const ths = head.split('|').map(c => c.trim()).filter(Boolean);
    const thead = '<thead><tr>' + ths.map(h => \`<th>\${esc(h)}</th>\`).join('') + '</tr></thead>';
    const tbody = '<tbody>' + body.map(row => {
      const tds = row.split('|').map(c => c.trim()).filter(Boolean);
      return '<tr>' + tds.map(d => \`<td>\${inline(esc(d))}</td>\`).join('') + '</tr>';
    }).join('') + '</tbody>';
    return \`<table>\${thead}\${tbody}</table>\n\`;
  });

  function inline(s) {
    return s
      .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  }

  const lines = md.split('\n');
  let out = '', inUl = false;
  for (const line of lines) {
    if (line.startsWith('<table>')) { if (inUl) { out += '</ul>'; inUl = false; } out += line; continue; }
    if (/^# /.test(line))  { if (inUl) { out += '</ul>'; inUl = false; } out += \`<h1>\${inline(esc(line.slice(2).trim()))}</h1>\`; continue; }
    if (/^## /.test(line)) { if (inUl) { out += '</ul>'; inUl = false; } out += \`<h2>\${inline(esc(line.slice(3).trim()))}</h2>\`; continue; }
    if (/^### /.test(line)){ if (inUl) { out += '</ul>'; inUl = false; } out += \`<h3>\${inline(esc(line.slice(4).trim()))}</h3>\`; continue; }
    if (/^> /.test(line))  { if (inUl) { out += '</ul>'; inUl = false; } out += \`<blockquote><p>\${inline(esc(line.slice(2)))}</p></blockquote>\`; continue; }
    if (/^[-*] /.test(line)){ if (!inUl) { out += '<ul>'; inUl = true; } out += \`<li>\${inline(esc(line.slice(2)))}</li>\`; continue; }
    if (line.trim() === '') { if (inUl) { out += '</ul>'; inUl = false; } continue; }
    if (inUl) { out += '</ul>'; inUl = false; }
    out += \`<p>\${inline(esc(line))}</p>\`;
  }
  if (inUl) out += '</ul>';
  return out;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openReport(num, company, role, url) {
  const content = DATA.reports[+num];
  const app = DATA.apps.find(a => a.num === +num);
  const mtime = app?.reportMtime ? ' · ' + timeAgo(app.reportMtime) : '';
  document.getElementById('modal-company').textContent = company + mtime;
  document.getElementById('modal-title').textContent = role;
  document.getElementById('modal-body-wrap').innerHTML = renderMd(content);
  const urlLink = document.getElementById('modal-url-link');
  const urlToUse = url || app?.url || '';
  if (urlToUse) {
    urlLink.href = urlToUse;
    urlLink.classList.remove('hidden');
  } else {
    urlLink.classList.add('hidden');
  }
  document.getElementById('report-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('report-modal').classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Init ──────────────────────────────────────────────────────────────────────

renderKPIs();
renderScoreDist();
renderStatusBreakdown();
renderPipelineInsight();
renderProspects();
filterApps();
renderCompanies(DATA.companies);
renderPipeline();
renderFollowUp();
renderContacts();
renderScanTable(DATA.scanHistory);
</script>
</body>
</html>`;

writeFileSync(OUT, html, 'utf8');
console.log(`Dashboard gerado: ${OUT}`);
console.log(`  ${total} offers · ${applied} applied · ${applyNow} apply now · ${pipeline.pending.length} pending`);

if (process.argv.includes('--open') || !process.argv.includes('--no-open')) {
  try { execSync(`open "${OUT}"`, { stdio: 'ignore' }); } catch {}
}
