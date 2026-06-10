#!/usr/bin/env node
/**
 * dashboard-web.mjs — lightweight HTTP preview of the career-ops pipeline.
 * Reads data/applications.md and serves it as a styled HTML table.
 * Port: 3141 (or PORT env var).
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3141);

const pathArg = process.argv.indexOf('--path');
const PROJECT_ROOT = pathArg !== -1 ? process.argv[pathArg + 1] : __dirname;

const STATUS_COLOUR = {
  Evaluated: '#6366f1', Applied: '#0ea5e9', Responded: '#f59e0b',
  Interview: '#8b5cf6', Offer: '#10b981', Rejected: '#ef4444',
  Discarded: '#94a3b8', SKIP: '#94a3b8',
};

function parseTable(md) {
  const lines = md.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split('|').slice(1, -1).map(h => h.trim());
  const rows = lines.slice(2).map(l =>
    l.split('|').slice(1, -1).map(c => c.trim())
  ).filter(r => r.some(Boolean));
  return { headers, rows };
}

function statusBadge(text) {
  const colour = STATUS_COLOUR[text] ?? '#64748b';
  return `<span style="background:${colour};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;white-space:nowrap">${esc(text)}</span>`;
}

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function renderCell(h, text) {
  const lower = h.toLowerCase();
  if (lower === 'status') return statusBadge(text);
  // Render markdown links: [label](url)
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
    `<a href="${esc(url)}" target="_blank">${esc(label)}</a>`
  ) || '—';
}

async function render() {
  let md = '';
  try {
    md = await readFile(join(PROJECT_ROOT, 'data', 'applications.md'), 'utf8');
  } catch {
    return '<p style="color:red">Could not read data/applications.md</p>';
  }
  const { headers, rows } = parseTable(md);
  if (!rows.length) return '<p>No applications yet.</p>';

  const thead = `<tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const tbody = rows.map(row =>
    `<tr>${headers.map((h, i) => `<td>${renderCell(h, row[i] ?? '')}</td>`).join('')}</tr>`
  ).join('');

  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

const HTML = (body) => `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>career-ops dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px}
  h1{font-size:20px;margin-bottom:16px;color:#f8fafc}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th{background:#1e293b;color:#94a3b8;text-align:left;padding:8px 12px;border-bottom:1px solid #334155;white-space:nowrap}
  td{padding:8px 12px;border-bottom:1px solid #1e293b;vertical-align:middle}
  tr:hover td{background:#1e293b55}
  a{color:#38bdf8;text-decoration:none}
  a:hover{text-decoration:underline}
  .refresh{float:right;font-size:12px;color:#475569}
</style>
</head><body>
<h1>career-ops <span class="refresh">auto-refreshes every 30 s</span></h1>
${body}
<script>setTimeout(()=>location.reload(),30000)</script>
</body></html>`;

const server = createServer(async (req, res) => {
  const body = await render();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML(body));
});

server.listen(PORT, () => {
  process.stdout.write(`career-ops dashboard listening on http://localhost:${PORT}\n`);
});
