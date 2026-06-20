#!/usr/bin/env node

/**
 * generate-dashboard.mjs — self-contained HTML dashboard for the job search.
 *
 * Reads the existing data contract (no new database, no server, no Docker):
 *   - data/applications.md   (source of truth tracker table)
 *   - templates/states.yml   (canonical statuses + dashboard groups)
 *   - data/activities.md     (optional, written by activity.mjs)
 *
 * Emits a single self-contained file: output/dashboard.html
 *   - zero runtime dependencies, no CDN, no network — open it in any browser
 *   - scorecards, status funnel, score distribution, applications-over-time,
 *     a kanban board grouped by status, and a recent-activity feed
 *
 * Inspiration: the visual-dashboard idea is borrowed from JobSync
 * (github.com/Gsync/jobsync, MIT). No code is ported — this is a native
 * career-ops generator over career-ops' own markdown data contract.
 *
 * Usage:
 *   node generate-dashboard.mjs            # write output/dashboard.html
 *   node generate-dashboard.mjs --open     # also open it in the default browser
 *   node generate-dashboard.mjs --out FILE # write somewhere else
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve, relative } from 'path';
import { spawn } from 'child_process';

const ACTIVITIES_PATH = process.env.CAREER_OPS_ACTIVITIES || 'data/activities.md';
const STATES_PATH = 'templates/states.yml';

// Resolve the tracker path: explicit env override, else the modern data/ layout,
// else the legacy root-level applications.md (mirrors merge-tracker/verify-pipeline).
function resolveTrackerPath() {
  const env = process.env.CAREER_OPS_TRACKER;
  if (env) {
    if (existsSync(env)) return env;
    throw new Error(`CAREER_OPS_TRACKER is set but does not exist: ${env}`);
  }
  if (existsSync('data/applications.md')) return 'data/applications.md';
  if (existsSync('applications.md')) return 'applications.md';
  return null;
}

// ---- status model ---------------------------------------------------------

// dashboard_group -> { label, color, order } — left-to-right pipeline order.
const GROUP_META = {
  evaluated: { label: 'Evaluated', color: '#7c8aa5', order: 0 },
  applied:   { label: 'Applied',   color: '#4c7fe0', order: 1 },
  responded: { label: 'Responded', color: '#22a39f', order: 2 },
  interview: { label: 'Interview', color: '#e0a93b', order: 3 },
  offer:     { label: 'Offer',     color: '#3aa856', order: 4 },
  rejected:  { label: 'Rejected',  color: '#d65a5a', order: 5 },
  discarded: { label: 'Discarded', color: '#9aa0a6', order: 6 },
  skip:      { label: 'SKIP',      color: '#b8a3c9', order: 7 },
};

function stripQuotes(s) {
  return s.replace(/^['"]|['"]$/g, '').trim();
}

function loadStates() {
  // Minimal parser for the fixed-format templates/states.yml (no yaml dep):
  // a flat list of states, each with id / label / aliases / dashboard_group.
  // Falls back to identity mapping (lowercased status == group) if absent.
  const aliasToGroup = new Map();
  const labelToGroup = new Map();
  if (existsSync(STATES_PATH)) {
    try {
      let cur = null;
      const flush = () => {
        if (!cur) return;
        const group = cur.group || cur.id;
        if (group) {
          if (cur.label) labelToGroup.set(cur.label.toLowerCase(), group);
          if (cur.id) labelToGroup.set(cur.id.toLowerCase(), group);
          for (const a of cur.aliases) if (a) aliasToGroup.set(a.toLowerCase(), group);
        }
        cur = null;
      };
      for (const raw of readFileSync(STATES_PATH, 'utf8').split('\n')) {
        const line = raw.replace(/#.*$/, '');
        let m = /^\s*-\s*id:\s*(.+?)\s*$/.exec(line);
        if (m) { flush(); cur = { id: stripQuotes(m[1]), label: '', group: '', aliases: [] }; continue; }
        if (!cur) continue;
        if ((m = /^\s*label:\s*(.+?)\s*$/.exec(line))) cur.label = stripQuotes(m[1]);
        else if ((m = /^\s*dashboard_group:\s*(.+?)\s*$/.exec(line))) cur.group = stripQuotes(m[1]);
        else if ((m = /^\s*aliases:\s*\[(.*)\]\s*$/.exec(line))) {
          cur.aliases = m[1].split(',').map((s) => stripQuotes(s.trim())).filter(Boolean);
        }
      }
      flush();
    } catch { /* fall through to identity mapping */ }
  }
  return { aliasToGroup, labelToGroup };
}

function statusToGroup(status, states) {
  const key = String(status || '').trim().toLowerCase();
  if (!key) return 'evaluated';
  return states.labelToGroup.get(key) || states.aliasToGroup.get(key) || key;
}

// ---- markdown table parsing ----------------------------------------------

function parseTable(md) {
  // Split a markdown table into its header cells (the "# | Date | ..." row) and
  // its data rows. Header detection keys on the canonical first two columns.
  let header = null;
  const rows = [];
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
    if (cells.join('').replace(/[-:\s]/g, '') === '') continue; // separator row
    if (!header && /^#$/.test(cells[0]) && /date/i.test(cells[1] || '')) { header = cells; continue; }
    rows.push(cells);
  }
  return { header, rows };
}

// Map canonical tracker fields to column indices by header name, so a custom
// tracker (e.g. an extra Location column) doesn't shift everything. Falls back
// to the documented positional layout for any field the header doesn't name.
const TRACKER_FIELDS = { num: '#', date: 'date', company: 'company', role: 'role', score: 'score', status: 'status', pdf: 'pdf', report: 'report', notes: 'notes' };
const TRACKER_DEFAULT_IDX = { num: 0, date: 1, company: 2, role: 3, score: 4, status: 5, pdf: 6, report: 7, notes: 8 };
function columnMap(header) {
  const idx = {};
  if (header) {
    header.forEach((h, i) => {
      const key = h.trim().toLowerCase();
      for (const [field, name] of Object.entries(TRACKER_FIELDS)) {
        if (key === name && idx[field] === undefined) idx[field] = i;
      }
    });
  }
  for (const f of Object.keys(TRACKER_DEFAULT_IDX)) if (idx[f] === undefined) idx[f] = TRACKER_DEFAULT_IDX[f];
  return idx;
}

function firstLink(cell) {
  const m = /\[([^\]]*)\]\(([^)]+)\)/.exec(cell || '');
  return m ? { text: m[1], href: m[2] } : null;
}

function parseApplications(trackerPath, states) {
  if (!trackerPath || !existsSync(trackerPath)) return [];
  const { header, rows } = parseTable(readFileSync(trackerPath, 'utf8'));
  const idx = columnMap(header);
  const apps = [];
  for (const c of rows) {
    const num = (c[idx.num] || '').trim();
    if (!/^\d+$/.test(num)) continue; // not a real entry row
    const status = c[idx.status] || '';
    const scoreMatch = /([0-9]+(?:\.[0-9]+)?)/.exec(c[idx.score] || '');
    const link = firstLink(c[idx.report]);
    // store the raw href; rebaseReportLinks() makes it relative to the output file
    const reportHref = link?.href || '';
    apps.push({
      num: Number(num),
      date: c[idx.date] || '',
      company: c[idx.company] || '',
      role: c[idx.role] || '',
      score: scoreMatch ? Number(scoreMatch[1]) : null,
      status,
      group: statusToGroup(status, states),
      pdf: /✅|yes|✓/i.test(c[idx.pdf] || ''),
      reportHref,
      notes: c[idx.notes] || '',
    });
  }
  return apps;
}

function rebaseReportLinks(apps, out, trackerPath) {
  // Report hrefs in the tracker are relative to the tracker file's own dir.
  // Re-relativize them to wherever the dashboard is actually written (any --out
  // depth), resolving through absolute paths. Leave URLs and empties alone.
  const outDir = dirname(out);
  const appsDir = trackerPath ? dirname(resolve(trackerPath)) : resolve('.');
  for (const a of apps) {
    if (!a.reportHref || /^https?:\/\//i.test(a.reportHref)) continue;
    let abs = resolve(appsDir, a.reportHref);
    // legacy root-relative links (e.g. "reports/001.md" in a data/ tracker that
    // predates link migration) — fall back to the repo-root reports/ path.
    if (!existsSync(abs)) {
      const fromRoot = resolve('.', a.reportHref);
      if (existsSync(fromRoot)) abs = fromRoot;
    }
    a.reportHref = relative(outDir, abs).split('\\').join('/');
  }
}

function parseActivities() {
  if (!existsSync(ACTIVITIES_PATH)) return [];
  const md = readFileSync(ACTIVITIES_PATH, 'utf8');
  const acts = [];
  for (const c of parseTable(md).rows) {
    // columns: Date | App# | Company | Role | Type | Minutes | Notes
    if (c.length < 5) continue;
    if (!/^\d{4}-\d{2}-\d{2}/.test(c[0] || '')) continue;
    const minMatch = /([0-9]+)/.exec(c[5] || '');
    acts.push({
      date: c[0],
      appNum: c[1] || '',
      company: c[2] || '',
      role: c[3] || '',
      type: (c[4] || 'other').toLowerCase(),
      minutes: minMatch ? Number(minMatch[1]) : 0,
      note: c[6] || '',
    });
  }
  return acts;
}

// ---- stats ----------------------------------------------------------------

function computeStats(apps, activities) {
  const byGroup = {};
  for (const g of Object.keys(GROUP_META)) byGroup[g] = [];
  for (const a of apps) (byGroup[a.group] ||= []).push(a);

  const scored = apps.filter((a) => typeof a.score === 'number');
  const avgScore = scored.length
    ? scored.reduce((s, a) => s + a.score, 0) / scored.length
    : null;

  // score histogram buckets 0-1 .. 4-5
  const buckets = [0, 0, 0, 0, 0];
  for (const a of scored) {
    const i = Math.min(4, Math.max(0, Math.floor(a.score)));
    buckets[i]++;
  }

  // applications over time (by date, ascending)
  const byDate = {};
  for (const a of apps) if (a.date) byDate[a.date] = (byDate[a.date] || 0) + 1;
  const timeline = Object.keys(byDate).sort().map((d) => ({ date: d, count: byDate[d] }));

  // activity time per company + per type
  const timeByCompany = {};
  const timeByType = {};
  let totalMinutes = 0;
  for (const e of activities) {
    totalMinutes += e.minutes;
    timeByCompany[e.company] = (timeByCompany[e.company] || 0) + e.minutes;
    timeByType[e.type] = (timeByType[e.type] || 0) + e.minutes;
  }

  const active = (byGroup.applied.length + byGroup.responded.length + byGroup.interview.length);

  // pipeline health — conversion rates over everything that went out the door
  const submitted = byGroup.applied.length + byGroup.responded.length +
    byGroup.interview.length + byGroup.offer.length + byGroup.rejected.length;
  const reached = byGroup.responded.length + byGroup.interview.length + byGroup.offer.length;
  const interviewed = byGroup.interview.length + byGroup.offer.length;
  const rate = (num) => (submitted ? num / submitted : null);
  const health = {
    submitted,
    responseRate: rate(reached),
    interviewRate: rate(interviewed),
    offerRate: rate(byGroup.offer.length),
  };

  // needs attention — active apps with no touch (application date or activity) in STALE_DAYS
  const STALE_DAYS = 10;
  const todayMs = Date.now();
  const daysSince = (s) => { const d = Date.parse(s); return Number.isNaN(d) ? null : Math.floor((todayMs - d) / 86400000); };
  const lastTouch = (app) => {
    let best = app.date || '';
    for (const e of activities) {
      // an activity tagged with an App# matches only that application; without
      // one, fall back to company so a same-company activity still counts.
      const matches = e.appNum
        ? String(e.appNum) === String(app.num)
        : (e.company && app.company && e.company.toLowerCase() === app.company.toLowerCase());
      if (matches && e.date > best) best = e.date;
    }
    return best;
  };
  const needsAttention = [];
  // every active stage is eligible — applied, responded, AND interview (matching
  // the `active` definition above), so a stalled interview isn't missed.
  for (const grp of ['applied', 'responded', 'interview']) {
    for (const app of byGroup[grp]) {
      const d = daysSince(lastTouch(app));
      if (d != null && d >= STALE_DAYS) {
        needsAttention.push({ num: app.num, company: app.company, role: app.role, status: app.status, days: d, reportHref: app.reportHref });
      }
    }
  }
  needsAttention.sort((a, b) => b.days - a.days);

  return {
    total: apps.length,
    active,
    offers: byGroup.offer.length,
    interviews: byGroup.interview.length,
    avgScore,
    scoredCount: scored.length,
    buckets,
    timeline,
    byGroup,
    totalMinutes,
    timeByCompany,
    timeByType,
    activityCount: activities.length,
    health,
    needsAttention,
    staleDays: STALE_DAYS,
  };
}

// ---- HTML rendering -------------------------------------------------------

function safeJson(obj) {
  // Safe to embed inside an inline <script>: a literal "</script>" or an HTML
  // comment opener in pasted/scraped job data would otherwise break out of the
  // tag before escapeHtml() ever runs. Escaping <, >, & to \uXXXX keeps the
  // parsed values identical while making a tag-closing sequence impossible.
  return JSON.stringify(obj).replace(/[<>&]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function renderHtml(apps, activities, stats) {
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const groupOrder = Object.keys(GROUP_META).sort((a, b) => GROUP_META[a].order - GROUP_META[b].order);

  const payload = {
    generatedAt,
    groupMeta: GROUP_META,
    groupOrder,
    stats: {
      total: stats.total,
      active: stats.active,
      offers: stats.offers,
      interviews: stats.interviews,
      avgScore: stats.avgScore,
      scoredCount: stats.scoredCount,
      buckets: stats.buckets,
      timeline: stats.timeline,
      totalMinutes: stats.totalMinutes,
      timeByCompany: stats.timeByCompany,
      timeByType: stats.timeByType,
      activityCount: stats.activityCount,
      health: stats.health,
      needsAttention: stats.needsAttention,
      staleDays: stats.staleDays,
    },
    columns: groupOrder.map((g) => ({
      group: g,
      label: GROUP_META[g].label,
      color: GROUP_META[g].color,
      cards: stats.byGroup[g].map((a) => ({
        num: a.num, company: a.company, role: a.role,
        score: a.score, date: a.date, reportHref: a.reportHref, notes: a.notes,
      })),
    })),
    activities: activities.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>career-ops · dashboard</title>
<style>
:root{
  --bg:#f6f7f9; --panel:#ffffff; --ink:#1f2430; --muted:#6b7280; --line:#e6e8ec;
  --accent:#4c7fe0; --shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.1);
}
@media (prefers-color-scheme: dark){
  :root{ --bg:#13161c; --panel:#1b1f27; --ink:#e7e9ee; --muted:#9aa1ad; --line:#2a2f3a;
    --shadow:0 1px 2px rgba(0,0,0,.4); }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
header{padding:20px 24px;display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px}
header h1{margin:0;font-size:18px;letter-spacing:.2px}
header .meta{color:var(--muted);font-size:12px}
main{padding:0 24px 48px;max-width:1280px;margin:0 auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.card .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.card .v{font-size:26px;font-weight:650;margin-top:4px}
.card .s{color:var(--muted);font-size:12px;margin-top:2px}
section{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:20px;box-shadow:var(--shadow)}
section h2{margin:0 0 14px;font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media (max-width:820px){.grid2{grid-template-columns:1fr}}
.bar-row{display:flex;align-items:center;gap:10px;margin:7px 0}
.bar-row .lbl{width:90px;font-size:12px;color:var(--muted);text-align:right;flex:none}
.bar-track{flex:1;background:var(--line);border-radius:6px;height:18px;overflow:hidden}
.bar-fill{height:100%;border-radius:6px}
.bar-row .n{width:44px;font-variant-numeric:tabular-nums;font-size:12px}
.toolbar{margin-bottom:10px}
.toolbar input{width:100%;max-width:340px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font-size:13px}
.toolbar input:focus{outline:none;border-color:var(--accent)}
.kanban{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(220px,1fr);gap:12px;overflow-x:auto;padding-bottom:6px}
.col{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px;min-height:80px}
.col h3{margin:2px 4px 8px;font-size:12px;display:flex;align-items:center;gap:6px}
.col h3 .dot{width:9px;height:9px;border-radius:50%}
.col h3 .ct{margin-left:auto;color:var(--muted);font-weight:500}
.kc{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:8px}
.kc .co{font-weight:600}
.kc .ro{color:var(--muted);font-size:12px;margin:1px 0 6px}
.kc .meta{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted)}
.badge{display:inline-block;padding:1px 7px;border-radius:20px;font-size:11px;font-weight:600;color:#fff}
.kc a{color:var(--accent);text-decoration:none}
.kc a:hover{text-decoration:underline}
.empty{color:var(--muted);font-size:12px;padding:14px;text-align:center}
table.act{width:100%;border-collapse:collapse;font-size:13px}
table.act th{text-align:left;color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.4px;padding:4px 8px;border-bottom:1px solid var(--line)}
table.act td{padding:6px 8px;border-bottom:1px solid var(--line)}
.spark{display:block;width:100%;height:90px}
.pill{font-variant-numeric:tabular-nums}
.rates{display:flex;gap:12px;flex-wrap:wrap}
.rate{flex:1;min-width:90px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.rate .rk{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px}
.rate .rv{font-size:22px;font-weight:650;margin-top:2px}
.attn .row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px}
.attn .row .co{font-weight:600}
.attn .row .ro{color:var(--muted);font-size:12px}
.attn .days{margin-left:auto;font-variant-numeric:tabular-nums;font-size:12px;color:#d65a5a;white-space:nowrap}
</style>
</head>
<body>
<header>
  <h1>📋 career-ops dashboard</h1>
  <div class="meta">generated <span id="gen"></span> · refresh with <code>node generate-dashboard.mjs</code></div>
</header>
<main>
  <div class="cards" id="cards"></div>
  <div class="grid2">
    <section><h2>Pipeline by status</h2><div id="funnel"></div></section>
    <section><h2>Score distribution</h2><div id="scores"></div></section>
  </div>
  <section><h2>Applications over time</h2><svg class="spark" id="timeline" preserveAspectRatio="none"></svg><div id="timeline-empty"></div></section>
  <section><h2>Pipeline board</h2>
    <div class="toolbar"><input id="q" type="search" placeholder="Filter by company, role, or note…" autocomplete="off"></div>
    <div class="kanban" id="kanban"></div></section>
  <section><h2>Pipeline health &amp; needs attention</h2><div class="grid2">
    <div id="health"></div>
    <div id="attention"></div>
  </div></section>
  <section><h2>Time logged &amp; recent activity</h2><div class="grid2">
    <div><div id="time-by"></div></div>
    <div><div id="activity"></div></div>
  </div></section>
</main>
<script>
const DATA = ${safeJson(payload)};
const $ = (id) => document.getElementById(id);
const fmtMin = (m) => m >= 60 ? (m/60).toFixed(m%60?1:0)+'h' : m+'m';

document.getElementById('gen').textContent = DATA.generatedAt;

// scorecards
(function(){
  const s = DATA.stats;
  const cards = [
    { k:'Total tracked', v:s.total, sub:s.scoredCount+' scored' },
    { k:'Active', v:s.active, sub:'applied · responded · interview' },
    { k:'Interviewing', v:s.interviews, sub:'' },
    { k:'Offers', v:s.offers, sub:'' },
    { k:'Avg score', v: s.avgScore==null?'—':s.avgScore.toFixed(1), sub:'out of 5' },
    { k:'Time logged', v: s.totalMinutes?fmtMin(s.totalMinutes):'—', sub:s.activityCount+' activities' },
  ];
  $('cards').innerHTML = cards.map(c =>
    '<div class="card"><div class="k">'+c.k+'</div><div class="v">'+c.v+'</div>'+
    (c.sub?'<div class="s">'+c.sub+'</div>':'')+'</div>').join('');
})();

// horizontal bar helper
function bars(el, rows, fmt){
  const max = Math.max(1, ...rows.map(r=>r.n));
  el.innerHTML = rows.map(r =>
    '<div class="bar-row"><div class="lbl">'+escapeHtml(r.lbl)+'</div>'+
    '<div class="bar-track"><div class="bar-fill" style="width:'+(100*r.n/max)+'%;background:'+r.color+'"></div></div>'+
    '<div class="n pill">'+(fmt?fmt(r.n):r.n)+'</div></div>').join('') || '<div class="empty">No data yet</div>';
}

// funnel (status counts in pipeline order)
bars($('funnel'), DATA.groupOrder.map(g => ({
  lbl: DATA.groupMeta[g].label, color: DATA.groupMeta[g].color,
  n: (DATA.columns.find(c=>c.group===g)||{cards:[]}).cards.length,
})));

// score distribution
const sb = DATA.stats.buckets;
bars($('scores'), [
  {lbl:'0–1',color:'#d65a5a',n:sb[0]},{lbl:'1–2',color:'#e0773b',n:sb[1]},
  {lbl:'2–3',color:'#e0a93b',n:sb[2]},{lbl:'3–4',color:'#7eb04a',n:sb[3]},
  {lbl:'4–5',color:'#3aa856',n:sb[4]},
]);

// timeline sparkline (cumulative applications)
(function(){
  const tl = DATA.stats.timeline;
  const svg = $('timeline');
  if (!tl.length){ svg.style.display='none'; $('timeline-empty').innerHTML='<div class="empty">No dated entries yet</div>'; return; }
  let cum=0; const pts = tl.map(t => { cum+=t.count; return cum; });
  const W=600,H=90,pad=4, maxV=Math.max(...pts);
  const x=(i)=> tl.length===1?W/2: pad + i*(W-2*pad)/(tl.length-1);
  const y=(v)=> H-pad - v*(H-2*pad)/Math.max(1,maxV);
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  const line = pts.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  const area = line+' L '+x(pts.length-1).toFixed(1)+' '+(H-pad)+' L '+x(0).toFixed(1)+' '+(H-pad)+' Z';
  svg.innerHTML = '<path d="'+area+'" fill="rgba(76,127,224,.15)"/>'+
    '<path d="'+line+'" fill="none" stroke="#4c7fe0" stroke-width="2"/>';
})();

// kanban board (with live text filter over company / role / notes)
function renderKanban(query){
  const needle = (query||'').trim().toLowerCase();
  const match = (c) => !needle || [c.company,c.role,c.notes].some(v => String(v||'').toLowerCase().includes(needle));
  $('kanban').innerHTML = DATA.columns.map(col => {
    const visible = col.cards.filter(match);
    const cards = visible.map(c => {
      const sc = c.score==null?'':'<span class="badge" style="background:'+col.color+'">'+c.score.toFixed(1)+'</span>';
      const rep = c.reportHref?'<a href="'+escapeAttr(c.reportHref)+'">report ↗</a>':'';
      return '<div class="kc"><div class="co">'+escapeHtml(c.company)+'</div>'+
        '<div class="ro">'+escapeHtml(c.role)+'</div>'+
        '<div class="meta">'+sc+'<span>'+escapeHtml(c.date)+'</span>'+rep+'</div></div>';
    }).join('') || '<div class="empty">—</div>';
    const count = needle ? visible.length+'/'+col.cards.length : String(col.cards.length);
    return '<div class="col"><h3><span class="dot" style="background:'+col.color+'"></span>'+
      col.label+'<span class="ct">'+count+'</span></h3>'+cards+'</div>';
  }).join('');
}
renderKanban('');
$('q').addEventListener('input', (e) => renderKanban(e.target.value));

// pipeline health + needs attention
(function(){
  const h = DATA.stats.health || {};
  const pct = (r) => r==null ? '—' : Math.round(r*100)+'%';
  $('health').innerHTML = h.submitted
    ? '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">'+h.submitted+' applications sent</div>'+
      '<div class="rates">'+
      '<div class="rate"><div class="rk">Response</div><div class="rv">'+pct(h.responseRate)+'</div></div>'+
      '<div class="rate"><div class="rk">Interview</div><div class="rv">'+pct(h.interviewRate)+'</div></div>'+
      '<div class="rate"><div class="rk">Offer</div><div class="rv">'+pct(h.offerRate)+'</div></div>'+
      '</div>'
    : '<div class="empty">No applications sent yet</div>';
  const na = DATA.stats.needsAttention || [];
  $('attention').innerHTML = '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">No touch in '+(DATA.stats.staleDays||10)+'+ days</div>'+
    (na.length
      ? '<div class="attn">'+na.map(a=>'<div class="row"><span><span class="co">'+escapeHtml(a.company)+'</span> '+
          '<span class="ro">'+escapeHtml(a.status)+'</span></span>'+
          (a.reportHref?'<a href="'+escapeAttr(a.reportHref)+'" style="color:var(--accent);text-decoration:none">↗</a>':'')+
          '<span class="days">'+a.days+'d</span></div>').join('')+'</div>'
      : '<div class="empty">Nothing stale — you\\'re on top of it ✓</div>');
})();

// time by company + recent activity
(function(){
  const tbc = DATA.stats.timeByCompany;
  const rows = Object.keys(tbc).sort((a,b)=>tbc[b]-tbc[a]).slice(0,8)
    .map(co => ({ lbl: co.length>12?co.slice(0,11)+'…':co, color:'#4c7fe0', n: tbc[co] }));
  if (rows.length){
    $('time-by').innerHTML = '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Time by company</div>';
    const wrap=document.createElement('div'); bars(wrap, rows, fmtMin); $('time-by').appendChild(wrap);
  } else {
    $('time-by').innerHTML = '<div class="empty">No time logged — use <code>node activity.mjs add</code></div>';
  }
  const acts = DATA.activities;
  $('activity').innerHTML = acts.length
    ? '<table class="act"><thead><tr><th>Date</th><th>Company</th><th>Type</th><th>Time</th></tr></thead><tbody>'+
      acts.map(a=>'<tr><td>'+escapeHtml(a.date)+'</td><td>'+escapeHtml(a.company)+'</td><td>'+
        escapeHtml(a.type)+'</td><td class="pill">'+(a.minutes?fmtMin(a.minutes):'—')+'</td></tr>').join('')+
      '</tbody></table>'
    : '<div class="empty">No activity logged yet</div>';
})();

function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escapeAttr(s){return escapeHtml(s);}
</script>
</body>
</html>`;
}

// ---- main -----------------------------------------------------------------

function flag(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : null;
}

function openInBrowser(file) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', (err) => process.stderr.write(`Could not auto-open dashboard: ${err.message}\n`));
  child.unref();
}

function main() {
  const out = resolve(typeof flag('--out') === 'string' ? flag('--out') : 'output/dashboard.html');
  const states = loadStates();
  const trackerPath = resolveTrackerPath();
  const apps = parseApplications(trackerPath, states);
  rebaseReportLinks(apps, out, trackerPath);
  const activities = parseActivities();
  const stats = computeStats(apps, activities);
  const html = renderHtml(apps, activities, stats);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);

  process.stdout.write(
    `Dashboard written: ${out}\n` +
    `  ${stats.total} applications · ${stats.active} active · ${stats.offers} offers` +
    `${stats.avgScore != null ? ` · avg ${stats.avgScore.toFixed(1)}/5` : ''}` +
    `${stats.totalMinutes ? ` · ${stats.totalMinutes}m logged` : ''}\n`,
  );
  if (apps.length === 0) {
    process.stdout.write('  (tracker is empty — evaluate offers or run a scan to populate it)\n');
  }
  if (flag('--open')) openInBrowser(out);
}

main();
