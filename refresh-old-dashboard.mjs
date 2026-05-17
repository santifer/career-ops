#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

function parseApplications() {
  const lines = readFileSync(resolve(ROOT, 'data/applications.md'), 'utf8').split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.startsWith('|') || line.startsWith('|---') || line.includes('| # |')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 8) continue;
    // schema: num date company role score status pdf applied report notes
    const [num, date, company, role, scoreRaw, status, pdf, applied, reportRaw, ...noteParts] = cols;
    const score = parseFloat(scoreRaw) || 0;
    const reportMatch = reportRaw?.match(/\[(\d+)\]\(([^)]+)\)/);
    rows.push({
      num: parseInt(num) || 0,
      date: date || '',
      company: company || '',
      role: role || '',
      score,
      scoreRaw: scoreRaw || '',
      status: status || '',
      pdf: pdf === '✅',
      applied: applied === '✅',
      reportNum: reportMatch?.[1] || '',
      reportPath: reportMatch?.[2] || '',
      notes: noteParts.join('|').trim(),
      url: '',
      archetype: '',
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}

function parsePipeline() {
  const path = resolve(ROOT, 'data/pipeline.md');
  if (!existsSync(path)) return { pending: [], processed: [] };
  const content = readFileSync(path, 'utf8');
  const pending = [], processed = [];
  for (const line of content.split('\n')) {
    const pm = line.match(/^- \[ \] (.+)/);
    const xm = line.match(/^- \[x\] (.+)/);
    if (pm) {
      const parts = pm[1].split('|').map(s => s.trim());
      pending.push({ url: parts[0], company: parts[1] || '', role: parts[2] || '', extra: parts[3] || '' });
    } else if (xm) {
      processed.push({ raw: xm[1] });
    }
  }
  return { pending, processed };
}

function parseScanHistory() {
  // Prefer merged, fallback to original
  const paths = [
    resolve(ROOT, 'data/scan-history-merged.tsv'),
    resolve(ROOT, 'data/scan-history.tsv'),
  ];
  const path = paths.find(existsSync);
  if (!path) return [];
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
      const urlMatch       = content.match(/\*\*URL:\*\*\s*(https?:\/\/[^\s|]+)/);
      const archetypeMatch = content.match(/\*\*Archetype:\*\*\s*(.+)/);
      // Salary: inline "| **Salary:** GBP 150K" or table "| **Salary** | $350K |" or "| **Comp** | ..."
      const salaryMatch =
        content.match(/\*\*Salary:\*\*\s*([^|\n]+)/) ||
        content.match(/\|\s*\*\*Salary\*\*\s*\|\s*([^|]+)\|/) ||
        content.match(/\|\s*\*\*Comp\*\*\s*\|\s*([^|]+)\|/);
      const salary = salaryMatch?.[1]?.trim().replace(/\s+/g, ' ') || '';
      const mtime = statSync(filepath).mtime.toISOString();
      meta[num] = { url: urlMatch?.[1]?.trim() || '', archetype: archetypeMatch?.[1]?.trim() || '', salary, file, content, mtime };
    } catch {}
  }
  return meta;
}

// ── Build DATA ────────────────────────────────────────────────────────────────
const apps       = parseApplications();
const pipeline   = parsePipeline();
const scanHistory = parseScanHistory();
const reportMeta = getReportMeta();

for (const app of apps) {
  const meta = reportMeta[app.num] || {};
  app.url         = meta.url || '';
  app.archetype   = meta.archetype || '';
  app.salary      = meta.salary || '';
  app.reportMtime = meta.mtime || '';
}

const reportsContent = {};
for (const [num, meta] of Object.entries(reportMeta)) {
  if (meta.content) reportsContent[num] = meta.content;
}

const total      = apps.length;
const applied    = apps.filter(a => ['Applied','Responded','Interview','Offer'].includes(a.status)).length;
const interviews = apps.filter(a => ['Interview','Offer'].includes(a.status)).length;
const offers     = apps.filter(a => a.status === 'Offer').length;
const avgScore   = apps.length ? (apps.reduce((s,a) => s+a.score, 0) / apps.length).toFixed(1) : 0;
const topScore   = apps.length ? Math.max(...apps.map(a => a.score)).toFixed(1) : 0;
const applyNow   = apps.filter(a => a.score >= 4.0 && a.status === 'Evaluated').length;

const scoreDist = { '4.5-5':0, '4.0-4.4':0, '3.5-3.9':0, '3.0-3.4':0, '<3.0':0 };
for (const a of apps) {
  if      (a.score >= 4.5) scoreDist['4.5-5']++;
  else if (a.score >= 4.0) scoreDist['4.0-4.4']++;
  else if (a.score >= 3.5) scoreDist['3.5-3.9']++;
  else if (a.score >= 3.0) scoreDist['3.0-3.4']++;
  else                      scoreDist['<3.0']++;
}

const statusCounts = {};
for (const a of apps) statusCounts[a.status] = (statusCounts[a.status]||0)+1;

const archetypeCounts = {};
for (const a of apps) {
  if (a.archetype) archetypeCounts[a.archetype] = (archetypeCounts[a.archetype]||0)+1;
}

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
    avgScore: (roles.reduce((s,r) => s+r.score, 0) / roles.length).toFixed(1),
    applied: roles.filter(r => ['Applied','Interview','Offer'].includes(r.status)).length,
  }))
  .sort((a,b) => b.maxScore - a.maxScore);

const followUp = apps
  .filter(a => ['Applied','Responded','Interview','Offer'].includes(a.status))
  .sort((a,b) => new Date(b.date) - new Date(a.date));

const evaluatedUrls = new Set(apps.map(a => a.url).filter(Boolean));
const prospectPending = scanHistory
  .filter(h => h.status === 'pipeline' && !evaluatedUrls.has(h.url))
  .slice(0, 50);

const DATA = JSON.stringify({
  kpis: { total, applied, interviews, offers, avgScore, topScore, applyNow, pending: pipeline.pending.length },
  scoreDist,
  statusCounts,
  archetypeCounts,
  apps,
  companies,
  followUp,
  pipeline: pipeline.pending,
  prospectPending,
  scanHistory: scanHistory.slice(0, 300),
  reports: reportsContent,
  generated: new Date().toISOString(),
});

// ── Inject into dashboard-old.html ────────────────────────────────────────────
const htmlPath = resolve(ROOT, 'dashboard/dashboard-old.html');
const html = readFileSync(htmlPath, 'utf8');
const updated = html.replace(/const DATA = \{.*?\};/s, `const DATA = ${DATA};`);
writeFileSync(htmlPath, updated);

console.log(`✅ dashboard-old.html atualizado com dados frescos`);
console.log(`   Vagas: ${total} | Applied: ${applied} | Avg: ${avgScore} | Top: ${topScore}`);
console.log(`   Reports carregados: ${Object.keys(reportsContent).length}`);
console.log(`   Scan history: ${scanHistory.length} entradas`);
console.log(`   Pipeline pendente: ${pipeline.pending.length}`);
