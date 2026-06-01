#!/usr/bin/env node

import crypto from 'crypto';
import { existsSync } from 'fs';
import { join, normalize } from 'path';
import express from 'express';
import multer from 'multer';
import { config } from './config.mjs';
import { evaluateJob } from './evaluator.mjs';
import { generateResumePdf } from './pdf.mjs';
import {
  paths,
  ensureDirs,
  readCv,
  writeCv,
  readProfile,
  writeProfile,
  nextReportNumber,
  slugify,
  writeReport,
  appendApplication,
  listApplications,
} from './storage.mjs';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/login', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>career-ops login</title></head>
<body>
<h1>career-ops login</h1>
<form method="post" action="/login">
  <label>Password <input name="password" type="password" autofocus></label>
  <button type="submit">Sign in</button>
</form>
</body>
</html>`);
});

app.post('/login', (req, res) => {
  if (!config.sessionPassword || req.body.password !== config.sessionPassword) {
    res.status(401).type('text').send('Unauthorized');
    return;
  }
  res.setHeader('Set-Cookie', `career_ops_session=${sessionToken()}; HttpOnly; SameSite=Lax; Path=/`);
  res.redirect('/');
});

app.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'career_ops_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.redirect('/login');
});

app.use((req, res, next) => {
  if (!config.sessionPassword) return next();
  if (req.path === '/login') return next();
  const provided = req.header('x-career-ops-password');
  if (provided === config.sessionPassword || cookieValue(req, 'career_ops_session') === sessionToken()) return next();
  if (req.accepts('html')) {
    res.redirect('/login');
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
});

app.get('/', (_req, res) => {
  res.type('html').send(renderHomePage());
});

app.get('/api/config/status', (_req, res) => {
  res.json({
    storage: 'local-files',
    azureOpenAI: Boolean(config.azure.openAiEndpoint && config.azure.openAiDeployment),
    authMode: config.azure.openAiApiKey ? 'api-key' : 'entra-keyless',
    authEnabled: Boolean(config.sessionPassword),
  });
});

app.get('/api/profile', async (_req, res, next) => {
  try {
    res.json(await readProfile());
  } catch (err) {
    next(err);
  }
});

app.put('/api/profile', async (req, res, next) => {
  try {
    const { fullName, email, location, timezone, targetRoles = [] } = req.body;
    const profile = await writeProfile({ fullName, email, location, timezone, targetRoles });
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

app.post('/api/resumes', upload.single('resume'), async (req, res, next) => {
  try {
    const file = req.file;
    const markdown = req.body?.canonicalMarkdown
      || (file && isTextLike(file.mimetype) ? file.buffer.toString('utf-8') : '');

    if (!markdown.trim()) {
      res.status(400).json({ error: 'Provide canonicalMarkdown or upload a text/markdown resume. PDF/DOCX parsing is not implemented yet.' });
      return;
    }

    // A new upload overwrites cv.md — there is only one resume for one person.
    await writeCv(markdown);
    res.status(201).json({ ok: true, length: markdown.length });
  } catch (err) {
    next(err);
  }
});

app.get('/api/resumes/current', async (_req, res, next) => {
  try {
    const markdown = await readCv();
    res.json(markdown == null ? null : { canonicalMarkdown: markdown });
  } catch (err) {
    next(err);
  }
});

app.post('/api/evaluations', async (req, res, next) => {
  try {
    const { company, title, url, description } = req.body;
    if (!title || !description) {
      res.status(400).json({ error: 'title and description are required' });
      return;
    }

    const [profile, resumeMarkdown] = await Promise.all([readProfile(), readCv()]);
    if (!profile) {
      res.status(400).json({ error: 'Save a profile before evaluating jobs' });
      return;
    }
    if (!resumeMarkdown) {
      res.status(400).json({ error: 'Upload a resume before evaluating jobs' });
      return;
    }

    const evaluation = await evaluateJob({
      profile,
      resumeMarkdown,
      job: { company, title, url, description },
    });

    const date = new Date().toISOString().slice(0, 10);
    const num = await nextReportNumber();
    const slug = slugify(company || title);
    const reportName = await writeReport({ num, slug, date, content: evaluation.reportMarkdown });

    const pdfName = `cv-${slug}-${date}.pdf`;
    await generateResumePdf({ resumeMarkdown, jobTitle: title, company, outputName: pdfName });

    await appendApplication({
      num,
      date,
      company: company || 'Unknown',
      role: title,
      score: evaluation.score,
      pdfName,
      reportName,
      note: url || '',
    });

    res.status(201).json({
      num,
      date,
      company: company || 'Unknown',
      role: title,
      score: evaluation.score,
      reportName,
      pdfName,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/evaluations', async (_req, res, next) => {
  try {
    res.json(await listApplications());
  } catch (err) {
    next(err);
  }
});

app.get('/api/files/report/:name', (req, res) => {
  serveFile(res, paths.reportsDir, req.params.name, 'text/markdown; charset=utf-8');
});

app.get('/api/files/pdf/:name', (req, res) => {
  serveFile(res, paths.outputDir, req.params.name, 'application/pdf');
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

await ensureDirs();

app.listen(config.port, () => {
  console.log(`career-ops web listening on port ${config.port}`);
});

function serveFile(res, baseDir, name, contentType) {
  const safe = normalize(name).replace(/^([.][.][/\\])+/, '');
  const filePath = join(baseDir, safe);
  if (!filePath.startsWith(baseDir) || !existsSync(filePath)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.type(contentType).sendFile(filePath);
}

function isTextLike(contentType = '') {
  return contentType.startsWith('text/') || contentType.includes('markdown') || contentType.includes('json');
}

function sessionToken() {
  return crypto.createHash('sha256').update(config.sessionPassword || '').digest('hex');
}

function cookieValue(req, name) {
  const cookie = req.header('cookie');
  if (!cookie) return null;
  const pairs = cookie.split(';').map(part => part.trim().split('='));
  const found = pairs.find(([key]) => key === name);
  return found ? found.slice(1).join('=') : null;
}

function renderHomePage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>career-ops web</title>
<style>
body { font-family: Arial, sans-serif; margin: 32px auto; max-width: 960px; color: #1a1a2e; }
section { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
label { display: block; font-weight: 700; margin: 12px 0 4px; }
input, textarea { box-sizing: border-box; width: 100%; padding: 8px; }
textarea { min-height: 140px; }
button { margin-top: 12px; padding: 8px 14px; cursor: pointer; }
pre { background: #f6f8fa; padding: 12px; overflow: auto; white-space: pre-wrap; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.muted { color: #666; }
</style>
</head>
<body>
<h1>career-ops web</h1>
<p class="muted">Single-user app. Data is stored in local career-ops files (cv.md, config/profile.yml, reports/, data/applications.md, output/).</p>

<section>
  <h2>1. Profile</h2>
  <div class="row">
    <div><label>Full name</label><input id="fullName"></div>
    <div><label>Email</label><input id="email"></div>
  </div>
  <div class="row">
    <div><label>Location</label><input id="location"></div>
    <div><label>Timezone</label><input id="timezone"></div>
  </div>
  <label>Target roles (one per line)</label>
  <textarea id="targetRoles" placeholder="Senior AI Engineer&#10;Solutions Architect"></textarea>
  <button onclick="saveProfile()">Save profile</button>
</section>

<section>
  <h2>2. Resume</h2>
  <p class="muted">Paste canonical markdown. Uploading a new resume overwrites cv.md.</p>
  <label>Resume markdown</label>
  <textarea id="resumeMarkdown" placeholder="# Your Name&#10;&#10;## Experience"></textarea>
  <button onclick="saveResume()">Save resume</button>
</section>

<section>
  <h2>3. Evaluate a job</h2>
  <div class="row">
    <div><label>Company</label><input id="company"></div>
    <div><label>Title</label><input id="title"></div>
  </div>
  <label>URL</label><input id="url">
  <label>Job description</label>
  <textarea id="description" placeholder="Paste the job description here"></textarea>
  <button onclick="evaluateJob()">Evaluate and generate PDF</button>
</section>

<section>
  <h2>Results</h2>
  <button onclick="loadEvaluations()">Refresh evaluations</button>
  <button onclick="loadProfile()">Load saved profile</button>
  <pre id="output">Ready.</pre>
</section>

<script>
async function request(path, options = {}) {
  const response = await fetch(path, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(typeof body === 'string' ? body : body.error || response.statusText);
  return body;
}

function show(value) {
  document.getElementById('output').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function loadProfile() {
  try {
    const profile = await request('/api/profile');
    if (profile && profile.candidate) {
      document.getElementById('fullName').value = profile.candidate.full_name || '';
      document.getElementById('email').value = profile.candidate.email || '';
      document.getElementById('location').value = profile.candidate.location || '';
      document.getElementById('timezone').value = profile.candidate.timezone || '';
      document.getElementById('targetRoles').value = (profile.target_roles && profile.target_roles.primary || []).join('\\n');
    }
    show(profile);
  } catch (err) {
    show(err.message);
  }
}

async function saveProfile() {
  try {
    const targetRoles = document.getElementById('targetRoles').value.split('\\n').map(v => v.trim()).filter(Boolean);
    const profile = await request('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName: document.getElementById('fullName').value,
        email: document.getElementById('email').value,
        location: document.getElementById('location').value,
        timezone: document.getElementById('timezone').value,
        targetRoles,
      }),
    });
    show(profile);
  } catch (err) {
    show(err.message);
  }
}

async function saveResume() {
  try {
    const form = new FormData();
    form.append('canonicalMarkdown', document.getElementById('resumeMarkdown').value);
    const result = await request('/api/resumes', { method: 'POST', body: form });
    show(result);
  } catch (err) {
    show(err.message);
  }
}

async function evaluateJob() {
  try {
    show('Evaluating. This can take a while...');
    const result = await request('/api/evaluations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        company: document.getElementById('company').value,
        title: document.getElementById('title').value,
        url: document.getElementById('url').value,
        description: document.getElementById('description').value,
      }),
    });
    show(result);
  } catch (err) {
    show(err.message);
  }
}

async function loadEvaluations() {
  try {
    const rows = await request('/api/evaluations');
    show(rows.map(row => ({
      ...row,
      report_url: row.reportName ? '/api/files/report/' + row.reportName : null,
    })));
  } catch (err) {
    show(err.message);
  }
}
</script>
</body>
</html>`;
}
