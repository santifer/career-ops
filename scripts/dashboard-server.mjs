#!/usr/bin/env node
/**
 * dashboard-server.mjs — tiny localhost-only static file server
 *
 * Why this exists: the heartbeat email needs clickable links to
 * `dashboard/index.html` and individual `reports/NNN-*.md` files.
 * Gmail strips `file://` URLs, but `http://localhost:PORT/` URLs
 * stay clickable in both Gmail web and Apple Mail. So we run a
 * dedicated server bound to 127.0.0.1 (never exposed externally)
 * that serves the project root.
 *
 * Bound to 127.0.0.1 only — never 0.0.0.0 — so this is not reachable
 * from any other device on your network. Reports stay private.
 *
 * Markdown reports are converted to HTML on the fly so the email's
 * "Open report" link renders as a readable page in Chrome instead
 * of as raw markdown.
 *
 * Usage:
 *   node scripts/dashboard-server.mjs              # start (default port 7777)
 *   PORT=8080 node scripts/dashboard-server.mjs    # custom port
 *
 * Run via launchd for always-on (see scripts/com.mitchell.career-ops.dashboard-server.plist).
 */

import http from 'http';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { extname, join, normalize, resolve, sep, basename } from 'path';
import { marked } from 'marked';

const ROOT = resolve(process.cwd());
const PORT = parseInt(process.env.PORT || process.env.CAREER_OPS_DASHBOARD_PORT || '7777', 10);

// Canonical states from templates/states.yml. Anything outside this set
// gets rejected by /mark to keep applications.md in valid shape. Updating
// this list also requires updating templates/states.yml — keep in sync.
const CANONICAL_STATES = new Set([
  'Evaluated', 'Applied', 'Responded', 'Interview',
  'Offer', 'Rejected', 'Discarded', 'SKIP',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.tsv':  'text/tab-separated-values; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
  '.yml':  'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
};

// Detect the metadata block at the top of an evaluation report (the run
// of `**Field:** value` lines that sits between the H1 and the first
// `---` separator) and render it as a clean two-column key/value grid.
// CommonMark collapses single newlines into one paragraph, which made
// this section unreadable as a wall of bold-prefixed prose.
function extractMetadataBlock(md) {
  const lines = md.split('\n');
  const out = { entries: [], skipUntil: 0 };

  // Locate the H1 (first '# ' line) and start scanning after it.
  let i = 0;
  while (i < lines.length && !/^# /.test(lines[i])) i++;
  if (i === lines.length) return out;
  const h1End = i;
  i++;

  const meta = [];
  let lastMetaLine = i;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^---\s*$/.test(line)) break;          // explicit separator
    if (/^#{1,6}\s/.test(line)) break;          // next heading
    const m = line.match(/^\*\*([^:*]+):\*\*\s*(.*)$/);
    if (!m) break;                              // first non-metadata line ends the block
    meta.push({ key: m[1].trim(), value: m[2].trim() });
    lastMetaLine = i;
    i++;
  }
  // Consume one trailing `---` if present so we don't render a stray <hr>
  while (i < lines.length && /^\s*$/.test(lines[i])) i++;
  if (i < lines.length && /^---\s*$/.test(lines[i])) {
    out.skipUntil = i + 1;
  } else {
    out.skipUntil = lastMetaLine + 1;
  }
  out.entries = meta;
  out.h1End = h1End;
  return out;
}

function renderMetadataCard(entries) {
  if (!entries.length) return '';
  // Linkify URLs and inline `code`. marked.parseInline handles both safely.
  const rows = entries.map(({ key, value }) => {
    const inline = marked.parseInline(value);
    return `<div class="meta-row"><div class="meta-key">${key}</div><div class="meta-val">${inline}</div></div>`;
  }).join('');
  return `<div class="meta-card">${rows}</div>`;
}

// Render markdown reports as a styled HTML page so the email's "Open
// report" link opens a readable view in Chrome rather than raw .md.
function renderMarkdownPage(mdContent, fileName) {
  marked.setOptions({ gfm: true, breaks: false });

  // Pull the metadata block out of the source, render it as a separate
  // styled card, then render the rest of the document normally.
  const meta = extractMetadataBlock(mdContent);
  const lines = mdContent.split('\n');
  const h1Line = meta.h1End != null ? lines[meta.h1End] : '';
  const restLines = meta.skipUntil ? lines.slice(meta.skipUntil) : lines;
  const h1Html = h1Line ? marked.parse(h1Line) : '';
  const restHtml = marked.parse(restLines.join('\n'));
  const metaHtml = renderMetadataCard(meta.entries);

  const inner = `${h1Html}${metaHtml}${restHtml}`;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${fileName} · career-ops</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 920px; margin: 32px auto; padding: 0 24px; color: #1e293b; line-height: 1.6; background: #f8fafc; }
  .nav { font-size: 13px; color: #64748b; margin-bottom: 18px; }
  .nav a { color: #4338ca; text-decoration: none; }
  .nav a:hover { text-decoration: underline; }
  article { background: #ffffff; padding: 32px 40px; border-radius: 12px; border: 1px solid #e2e8f0; }
  h1 { font-size: 26px; margin: 0 0 14px; color: #0f172a; letter-spacing: -0.01em; }
  h2 { font-size: 19px; margin: 28px 0 10px; color: #0f172a; border-left: 4px solid #6366f1; padding-left: 10px; letter-spacing: -0.01em; }
  h3 { font-size: 16px; margin: 22px 0 8px; color: #1e293b; }
  a { color: #4338ca; }
  code { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  pre { background: #f1f5f9; padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; }
  blockquote { margin: 16px 0; padding: 12px 18px; border-left: 4px solid #6366f1; background: #eef2ff; color: #312e81; border-radius: 0 8px 8px 0; }
  hr { border: none; height: 1px; background: #e2e8f0; margin: 24px 0; }
  ul, ol { padding-left: 24px; }
  li { margin: 4px 0; }
  /* Metadata card — the "Date / Archetype / Score / Legitimacy / URL / PDF / ..." block at the top of every evaluation report. Two-column grid so each field is scannable at a glance. */
  .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px 0; margin: 0 0 24px; font-size: 14px; }
  .meta-row { display: grid; grid-template-columns: 150px 1fr; gap: 12px; padding: 9px 18px; border-bottom: 1px solid #eef2f6; align-items: baseline; }
  .meta-row:last-child { border-bottom: none; }
  .meta-key { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
  .meta-val { color: #1e293b; word-break: break-word; }
  .meta-val a { word-break: break-all; }
  .meta-val code { font-size: 12.5px; }
  @media (max-width: 640px) {
    .meta-row { grid-template-columns: 1fr; gap: 2px; padding: 8px 14px; }
    .meta-key { font-size: 10.5px; }
  }
</style>
</head><body>
<div class="nav"><a href="/dashboard/">← back to dashboard</a> · <code>${fileName}</code></div>
<article>${inner}</article>
</body></html>`;
}

// Pipeline detail API — returns structured JSON for the stat panel popout.
// Parses data/pipeline.md into items with platform, company, role, age.
function buildPipelineDetail() {
  const path = join(ROOT, 'data/pipeline.md');
  if (!existsSync(path)) return { title: 'Pipeline Pending', total: 0, tiers: [], items: [] };
  const lines = readFileSync(path, 'utf-8').split('\n');
  const items = [];
  const platformCounts = {};
  const today = Date.now();

  function detectPlatform(url) {
    if (!url) return 'Unknown';
    if (url.includes('linkedin.com/jobs')) return 'LinkedIn';
    if (url.includes('ashbyhq.com')) return 'Ashby';
    if (url.includes('greenhouse.io') || url.includes('boards.greenhouse')) return 'Greenhouse';
    if (url.includes('lever.co')) return 'Lever';
    if (url.includes('myworkdayjobs.com')) return 'Workday';
    if (url.includes('weworkremotely.com')) return 'WWR';
    if (url.includes('remoteok.com')) return 'RemoteOK';
    if (url.includes('amazon.jobs') || url.includes('amazonjobs.com')) return 'Amazon';
    if (url.includes('icims.com')) return 'iCIMS';
    if (url.includes('hnrss.org') || url.includes('news.ycombinator.com')) return 'HN';
    return 'Other';
  }

  for (const line of lines) {
    if (!line.startsWith('- [ ]')) continue;
    const body = line.replace(/^- \[ \]\s*/, '').trim();
    const parts = body.split(' | ').map(p => p.trim());
    const url = parts[0] || '';
    let company = parts[1] || '';
    let role = parts[2] || '';
    const dateField = parts[3] || '';
    // Normalize "(from email)" placeholder companies
    if (company === '(from email)') company = '';
    if (role === 'view') role = '';
    // Strip resolved-by-grok tag from role
    role = role.replace(/\s*\|\s*resolved-by-grok\s*$/, '').trim();
    const platform = detectPlatform(url);
    let daysInQueue = null;
    if (dateField && /^\d{4}-\d{2}-\d{2}/.test(dateField)) {
      const d = Date.parse(dateField.slice(0, 10));
      if (!isNaN(d)) daysInQueue = Math.floor((today - d) / 86400000);
    }
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    items.push({ url, company, role, platform, daysInQueue });
  }

  const tiers = Object.entries(platformCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  return { title: 'Pipeline Pending', total: items.length, tiers, items };
}

// Status-flip endpoint — GET /mark?num=47&status=Applied edits the row in
// data/applications.md, appends an audit note, and returns a confirmation
// page with an Undo link. Wired into the heartbeat email's per-row "✅
// Applied" button so Mitchell can clear his queue without leaving Gmail.
//
// Why GET (not POST): email clients strip <form> tags entirely, so a
// one-click experience requires a clickable link. Mitigations against
// accidental triggers (e.g., link prefetchers): (1) localhost binding
// blocks external prefetchers; (2) once exposed via Cloudflare Tunnel,
// Cloudflare Access auth blocks unauthenticated prefetchers; (3) the
// confirmation page shows an Undo link that reverts the previous status.
function handleMarkRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const num = parseInt(url.searchParams.get('num') || '', 10);
  const status = (url.searchParams.get('status') || 'Applied').trim();
  const previousStatus = (url.searchParams.get('from') || '').trim();

  if (!Number.isFinite(num) || num < 1) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderMarkPage({ ok: false, message: `Invalid row number: ${url.searchParams.get('num')}` }));
    return;
  }
  if (!CANONICAL_STATES.has(status)) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderMarkPage({
      ok: false,
      message: `Invalid status "${status}". Allowed: ${[...CANONICAL_STATES].join(', ')}`,
    }));
    return;
  }

  const path = join(ROOT, 'data/applications.md');
  if (!existsSync(path)) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderMarkPage({ ok: false, message: 'data/applications.md not found' }));
    return;
  }

  const text = readFileSync(path, 'utf-8');
  const lines = text.split('\n');
  let priorStatus = '';
  let priorCompany = '';
  let priorRole = '';
  let lineIdx = -1;

  // Find the row by its leading number cell
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*(\d+)\s*\|/);
    if (m && parseInt(m[1], 10) === num) {
      lineIdx = i;
      const cells = lines[i].split('|').map(c => c.trim());
      priorCompany = cells[3] || '';
      priorRole = cells[4] || '';
      priorStatus = cells[6] || '';
      break;
    }
  }

  if (lineIdx === -1) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderMarkPage({ ok: false, message: `Row #${num} not found in applications.md` }));
    return;
  }

  // Idempotent: if status already matches, just confirm without rewriting
  if (priorStatus === status) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderMarkPage({
      ok: true,
      idempotent: true,
      num,
      company: priorCompany,
      role: priorRole,
      status,
      priorStatus,
      message: `#${num} is already marked ${status} — no change needed.`,
    }));
    return;
  }

  // Replace the status cell. The status is column 6 (1-indexed cells[6]),
  // sitting between score (cells[5]) and pdf (cells[7]). We rewrite by
  // splitting on |, replacing cells[6], and rejoining — preserves all
  // surrounding whitespace and other columns verbatim.
  const cells = lines[lineIdx].split('|');
  // Cell layout: cells[0]='', cells[1]=' num ', cells[2]=' date ',
  // cells[3]=' company ', cells[4]=' role ', cells[5]=' score ',
  // cells[6]=' status ', cells[7]=' pdf ', cells[8]=' report ',
  // cells[9]=' notes ', cells[10]=''.
  if (cells.length < 10) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderMarkPage({ ok: false, message: `Row #${num} has unexpected column count (${cells.length}). Refusing to edit.` }));
    return;
  }
  // Preserve the original cell padding (leading + trailing spaces) so the
  // markdown table's column alignment doesn't shift.
  const original = cells[6];
  const leading = original.match(/^\s*/)[0];
  const trailing = original.match(/\s*$/)[0];
  cells[6] = `${leading}${status}${trailing}`;

  // Append an audit note to the notes cell (cells[9]) so we have a record
  // of when + how the flip happened. Keep it concise — applications.md
  // rows are already wide.
  const today = new Date().toISOString().slice(0, 10);
  const noteSnippet = ` · marked ${status} via heartbeat ${today}`;
  const notesOriginal = cells[9] || '';
  const notesLeading = notesOriginal.match(/^\s*/)[0];
  const notesTrailing = notesOriginal.match(/\s*$/)[0];
  cells[9] = `${notesLeading}${notesOriginal.trim()}${noteSnippet}${notesTrailing}`;

  lines[lineIdx] = cells.join('|');
  writeFileSync(path, lines.join('\n'));

  console.log(`  ✓ Marked #${num} ${priorCompany} (${priorRole}): ${priorStatus} → ${status}`);

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderMarkPage({
    ok: true,
    num,
    company: priorCompany,
    role: priorRole,
    status,
    priorStatus,
    message: `#${num} ${priorCompany} marked ${priorStatus} → ${status}.`,
  }));
}

// Render a small confirmation page for /mark — green for success, red for
// errors, with an Undo button (re-runs /mark using the prior status) and
// a Back to Dashboard link.
function renderMarkPage(ctx) {
  const isOk = !!ctx.ok;
  const accent = isOk ? '#1a7f37' : '#cf222e';
  const tone = isOk ? '#dafbe1' : '#ffebe9';
  const icon = isOk ? '✅' : '⚠️';
  let body = `<h1 style="margin:0 0 12px;color:${accent}">${icon} ${isOk ? (ctx.idempotent ? 'Already marked' : 'Status updated') : 'Could not mark'}</h1>`;
  body += `<p style="font-size:15px;color:#1f2328">${ctx.message || ''}</p>`;
  if (isOk && ctx.role) {
    body += `<p style="font-size:14px;color:#57606a">${ctx.role}</p>`;
  }
  if (isOk && ctx.priorStatus && ctx.priorStatus !== ctx.status && !ctx.idempotent) {
    const undoUrl = `/mark?num=${ctx.num}&status=${encodeURIComponent(ctx.priorStatus)}&from=${encodeURIComponent(ctx.status)}`;
    body += `<p style="margin-top:18px"><a href="${undoUrl}" style="background:#fff;color:#cf222e;padding:8px 14px;border:1px solid #cf222e;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">↶ Undo (revert to ${ctx.priorStatus})</a></p>`;
  }
  body += `<p style="margin-top:22px"><a href="/dashboard/" style="color:#0969da;text-decoration:none;font-weight:500">← Back to dashboard</a></p>`;
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>career-ops · mark status</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f6f8fa;color:#1f2328;margin:0;padding:0;line-height:1.55">
  <main style="max-width:640px;margin:64px auto;padding:0 20px">
    <div style="background:#ffffff;border:1px solid #d0d7de;border-left:4px solid ${accent};border-radius:10px;padding:28px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
      <div style="display:inline-block;background:${tone};color:${accent};padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:14px">career-ops</div>
      ${body}
    </div>
  </main>
</body></html>`;
}

// Allowlist: only these path prefixes may be served. The server was designed
// for localhost-only use; when exposed via Cloudflare Tunnel this list is the
// only thing standing between the internet and cv.md / .career-ops-secrets.
const ALLOWED_PREFIXES = ['/dashboard', '/reports', '/mark', '/api', '/favicon.ico'];

function isAllowed(p) {
  if (p === '/') return true; // redirected below, not served
  return ALLOWED_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'));
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

    // Redirect bare root to the dashboard index.
    if (urlPath === '/') {
      res.writeHead(302, { Location: '/dashboard/' });
      res.end();
      return;
    }

    // Status-flip endpoint — handled before the static-file resolver so
    // /mark never collides with a file in the project root.
    if (urlPath === '/mark') {
      handleMarkRequest(req, res);
      return;
    }

    // Live API endpoints — /api/detail/{key}
    if (urlPath.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (urlPath === '/api/detail/pending') {
        res.writeHead(200);
        res.end(JSON.stringify(buildPipelineDetail()));
        return;
      }
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    // Block anything outside the allowlist — prevents directory traversal
    // and stops .career-ops-secrets / cv.md / data/ from being served
    // when the server is reachable via Cloudflare Tunnel.
    if (!isAllowed(urlPath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const safe = normalize(urlPath).replace(/^(\.\.[\/\\])+/g, '');
    if (safe.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    let filePath = join(ROOT, safe);
    // Default index for directories
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      const idx = join(filePath, 'index.html');
      if (existsSync(idx)) {
        filePath = idx;
      } else {
        // Directory listing for the root only — useful for navigation
        const entries = readdirSync(filePath).slice(0, 200).sort();
        const items = entries.map(e => `<li><a href="${safe.replace(/\/$/, '')}/${e}">${e}</a></li>`).join('');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;max-width:820px;margin:32px auto;padding:0 24px"><h1>${safe}</h1><ul>${items}</ul></body></html>`);
        return;
      }
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${safe}`);
      return;
    }

    const ext = extname(filePath).toLowerCase();

    // Markdown → rendered HTML page
    if (ext === '.md') {
      const md = readFileSync(filePath, 'utf-8');
      const html = renderMarkdownPage(md, basename(filePath));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const mime = MIME[ext] || 'application/octet-stream';
    const content = readFileSync(filePath);
    // HTML must never be served from cache — send no-store so Chrome always
    // fetches the rebuilt dashboard on every bookmark open.
    const cacheHeader = (ext === '.html' || ext === '.htm')
      ? 'no-store, no-cache, must-revalidate'
      : 'no-cache';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheHeader, 'Pragma': 'no-cache' });
    res.end(content);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Server error: ${err.message}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`career-ops dashboard server: http://localhost:${PORT}/dashboard/`);
  console.log(`  serving from ${ROOT}`);
  console.log(`  bound to 127.0.0.1 only (not exposed to network)`);
});

// Graceful shutdown when launchd asks us to stop
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
