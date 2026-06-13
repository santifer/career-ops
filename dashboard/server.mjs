import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3000;

// Helper to parse applications.md
function parseApplications() {
  const filePath = path.join(ROOT, 'data', 'applications.md');
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const applications = [];

  for (const line of lines) {
    if (line.trim().startsWith('|') && !line.includes('Date') && !line.includes('---')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 10) {
        // | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
        const reportRaw = parts[8] || '';
        // Extract report link filename from [001](../reports/filename.md)
        const reportMatch = reportRaw.match(/\[\d+\]\((.+?)\)/);
        const reportPath = reportMatch ? reportMatch[1] : '';

        applications.push({
          id: parts[1],
          date: parts[2],
          company: parts[3],
          role: parts[4],
          score: (parts[5] || '').replace('/5', ''),
          status: parts[6],
          pdf: parts[7] === '✅',
          report: reportPath,
          notes: parts[9]
        });
      }
    }
  }

  // Sort by ID descending
  return applications.sort((a, b) => parseInt(b.id) - parseInt(a.id));
}

// Helper to write applications back to applications.md
function writeApplications(apps) {
  const filePath = path.join(ROOT, 'data', 'applications.md');
  let content = '# Applications Tracker\n\n';
  content += '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n';
  content += '|---|------|---------|------|-------|--------|-----|--------|-------|\n';

  // Sort by ID ascending to preserve correct history order
  const sorted = [...apps].sort((a, b) => parseInt(a.id) - parseInt(b.id));
  for (const app of sorted) {
    const scoreStr = app.score ? (app.score.includes('/5') ? app.score : `${app.score}/5`) : '—';
    const reportLink = app.report ? `[${String(app.id).padStart(3, '0')}](${app.report})` : '—';
    content += `| ${app.id} | ${app.date} | ${app.company} | ${app.role} | ${scoreStr} | ${app.status} | ${app.pdf ? '✅' : '❌'} | ${reportLink} | ${app.notes || ''} |\n`;
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Serve Dashboard HTML
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const htmlPath = path.join(__dirname, 'job-tracker.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(htmlPath));
    return;
  }

  // 2. API: Get Applications
  if (url.pathname === '/api/applications' && req.method === 'GET') {
    try {
      const apps = parseApplications();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(apps));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. API: Update Status & Notes of an Application
  if (url.pathname.startsWith('/api/applications/') && req.method === 'PUT') {
    const id = url.pathname.split('/').pop();
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { status, notes } = JSON.parse(body);
        const apps = parseApplications();
        const appIndex = apps.findIndex(a => String(a.id) === String(id));

        if (appIndex !== -1) {
          if (status !== undefined) apps[appIndex].status = status;
          if (notes !== undefined) apps[appIndex].notes = notes;
          writeApplications(apps);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, app: apps[appIndex] }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Application not found' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. API: Run New Evaluation
  if (url.pathname === '/api/evaluate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { jdText } = JSON.parse(body);
        if (!jdText) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Job description text required' }));
          return;
        }

        // Save JD to temporary file
        const tempPath = path.join(ROOT, 'jds', `temp-eval-${Date.now()}.txt`);
        fs.mkdirSync(path.dirname(tempPath), { recursive: true });
        fs.writeFileSync(tempPath, jdText, 'utf8');

        // Run evaluation script using node
        console.log(`Evaluating new job from dashboard...`);
        const { stdout, stderr } = await execAsync(`node gemini-eval.mjs --file "${tempPath}"`);
        console.log(stdout);

        // Delete temporary file
        try { fs.unlinkSync(tempPath); } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, log: stdout }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5. API: Serve Report File Content
  if (url.pathname.startsWith('/api/reports/') && req.method === 'GET') {
    const reportName = url.pathname.split('/').pop();
    const reportsDir = path.join(ROOT, 'reports');
    // Sanitize path traversal
    const safeReportName = path.basename(reportName);
    const reportPath = path.join(reportsDir, safeReportName);

    if (fs.existsSync(reportPath)) {
      res.writeHead(200, { 'Content-Type': 'text/markdown' });
      res.end(fs.readFileSync(reportPath));
    } else {
      // Try resolving relative path if provided in applications.md like ../reports/filename.md
      const resolvedPath = path.resolve(ROOT, 'data', reportName);
      if (fs.existsSync(resolvedPath)) {
        res.writeHead(200, { 'Content-Type': 'text/markdown' });
        res.end(fs.readFileSync(resolvedPath));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Report file not found' }));
      }
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 Clean Dashboard Server is running at http://localhost:${PORT}`);
});
