#!/usr/bin/env node
// Build a single static HTML dashboard for career-ops.
// Reads: reports/*.md, data/applications.md, data/pipeline.md, data/scan-history.tsv
// Writes: web/index.html (open with double-click, no server needed)

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readOr(path, fallback = '') {
  return existsSync(path) ? readFileSync(path, 'utf8') : fallback;
}

function parseReports() {
  const dir = join(ROOT, 'reports');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => /^\d{3}-.+\.md$/.test(f))
    .sort()
    .reverse()
    .map(filename => {
      const raw = readFileSync(join(dir, filename), 'utf8');
      const num = filename.slice(0, 3);
      const title = (raw.match(/^#\s+(.+)$/m) || [, filename])[1];
      const meta = {};
      for (const key of ['Fecha', 'Date', 'Arquetipo', 'Score', 'Legitimacy', 'URL']) {
        const m = raw.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`));
        if (m) meta[key.toLowerCase()] = m[1].trim();
      }
      return { num, filename, title, content: raw, ...meta };
    });
}

function parseApplications() {
  const raw = readOr(join(ROOT, 'data', 'applications.md'));
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('|') || line.includes('---') || /\|\s*#\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 9 || !/^\d+$/.test(cells[0])) continue;
    const [num, date, company, role, score, status, pdf, report, notes] = cells;
    const reportMatch = report.match(/\((reports\/[^)]+)\)/);
    rows.push({
      num, date, company, role, score, status, pdf,
      reportPath: reportMatch ? reportMatch[1] : null,
      notes
    });
  }
  return rows;
}

function parsePipeline() {
  const raw = readOr(join(ROOT, 'data', 'pipeline.md'));
  const items = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^-\s+\[([ x])\]\s+(.+)$/);
    if (!m) continue;
    const done = m[1] === 'x';
    const body = m[2];
    const parts = body.split('|').map(s => s.trim());
    const urlMatch = body.match(/https?:\/\/\S+/);
    items.push({
      done,
      tag: parts[0] || '',
      url: urlMatch ? urlMatch[0] : '',
      raw: body
    });
  }
  return items;
}

function parseScanHistory() {
  const raw = readOr(join(ROOT, 'data', 'scan-history.tsv'));
  const lines = raw.split('\n').filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split('\t');
  const rows = lines.slice(1).map(l => {
    const cells = l.split('\t');
    const obj = {};
    headers.forEach((h, i) => obj[h] = cells[i] || '');
    return obj;
  });
  return { headers, rows };
}

const data = {
  generated: new Date().toISOString(),
  reports: parseReports(),
  applications: parseApplications(),
  pipeline: parsePipeline(),
  scanHistory: parseScanHistory()
};

const template = readFileSync(join(__dirname, 'template.html'), 'utf8');
const html = template.replace(
  '/*__DATA__*/',
  'window.DATA = ' + JSON.stringify(data) + ';'
);

const outPath = join(__dirname, 'index.html');
writeFileSync(outPath, html);

console.log(`[dashboard] wrote ${outPath}`);
console.log(`  reports: ${data.reports.length}`);
console.log(`  applications: ${data.applications.length}`);
console.log(`  pipeline: ${data.pipeline.length}`);
console.log(`  scan-history: ${data.scanHistory.rows.length}`);
console.log(`\nOpen in browser:`);
console.log(`  open ${outPath}`);
