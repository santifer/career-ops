#!/usr/bin/env node
/**
 * test-yash-pipeline-smoke.mjs — end-to-end smoke test for the deterministic
 * portion of the yash-resume-pipeline.
 *
 * Validates: Playwright can extract title+text from local fixture HTML, slugify
 * round-trip, .tex compile via tectonic produces a real PDF.
 *
 * Does NOT cover: the V2.0 prompt application (LLM-bound, exercised manually).
 *
 * Usage: node tests/test-yash-pipeline-smoke.mjs
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const execFileP = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = resolve(ROOT, 'tests/fixtures/jds');
const SCRIPT = resolve(ROOT, 'yash-resume-pipeline.mjs');

// Use a per-run writable session directory so playwright-cli can write its
// .playwright-cli/ session files without hitting the root-owned /tmp dir.
const PW_CWD = resolve('/tmp', `pw-smoke-${process.pid}`);

let pass = 0, fail = 0;
function ok(msg) { console.log('  ✅', msg); pass++; }
function ng(msg) { console.log('  ❌', msg); fail++; }

// Whitelist of fixture filenames the test server is allowed to serve.
// Prevents path-traversal via `req.url` (CodeQL: "Uncontrolled data in path").
const ALLOWED_FIXTURES = new Set([
  'lever-sample.html',
  'ashby-sample.html',
  'greenhouse-sample.html',
]);

function serveFixtures(port) {
  return new Promise((resolveSrv) => {
    const server = createServer((req, res) => {
      const file = (req.url || '/').replace(/^\//, '') || 'lever-sample.html';
      if (!ALLOWED_FIXTURES.has(file)) {
        res.writeHead(404); res.end('not found');
        return;
      }
      try {
        const content = readFileSync(resolve(FIXTURES, file));
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(content);
      } catch (e) {
        res.writeHead(404); res.end('not found');
      }
    });
    server.listen(port, () => resolveSrv(server));
  });
}

async function runFixture(port, fixtureName, expectedCompany, expectedRole) {
  const url = `http://localhost:${port}/${fixtureName}`;
  console.log(`\n-> Fixture: ${fixtureName}`);

  // Use playwright-cli to fetch title + body text.
  await execFileP('playwright-cli', ['open', url, '--browser=chromium'], { cwd: PW_CWD });
  let title;
  let body;
  try {
    const t = await execFileP('playwright-cli', ['eval', '() => document.title'], { cwd: PW_CWD });
    title = t.stdout.trim();
    const b = await execFileP('playwright-cli', ['eval', '() => document.body.innerText'], { cwd: PW_CWD });
    body = b.stdout.trim();
  } finally {
    await execFileP('playwright-cli', ['close'], { cwd: PW_CWD }).catch(() => {});
  }

  if (title.includes(expectedCompany) || body.includes(expectedCompany)) ok('extracts company');
  else ng(`expected company "${expectedCompany}" in title or body`);

  if (body.includes(expectedRole)) ok('extracts role');
  else ng(`expected role "${expectedRole}" in body`);

  // Slugify
  const slug = await execFileP('node', [SCRIPT, 'slugify',
    '--company', expectedCompany,
    '--role', expectedRole,
  ], { cwd: ROOT });
  const slugObj = JSON.parse(slug.stdout.trim());
  if (slugObj.status === 'ok' && slugObj.company_slug && slugObj.role_slug) ok('slugify ok');
  else ng('slugify failed');
}

async function main() {
  // Ensure writable playwright-cli session directory exists
  await mkdir(PW_CWD, { recursive: true });

  const server = await serveFixtures(8765);
  try {
    // === Scrapling helper: source-hint detection (no network) ===
    {
      const HELPER = resolve(ROOT, 'scrapling_fetch.py');
      const cases = [
        ['https://jobs.lever.co/openai/123',                         'lever'],
        ['https://jobs.ashbyhq.com/anthropic/456',                   'ashby'],
        ['https://boards.greenhouse.io/scale/jobs/789',              'greenhouse'],
        ['https://example.workday.com/job/abc',                      'workday'],
        ['https://mogo.applytojob.com/apply/x/y',                    'other'],
      ];
      const PY = resolve(ROOT, '.venv/bin/python3');
      for (const [url, expected] of cases) {
        try {
          const out = await execFileP(PY, [HELPER, '--detect-source', url], { cwd: ROOT, timeout: 10000 });
          const obj = JSON.parse(out.stdout.trim());
          if (obj.source_hint === expected) ok(`source_hint(${url}) → ${expected}`);
          else ng(`source_hint(${url}) expected ${expected}, got ${obj.source_hint}`);
        } catch (e) {
          ng(`source_hint(${url}) crashed: ${e.message?.split('\n')[0] ?? String(e)}`);
        }
      }
    }

    await runFixture(8765, 'lever-sample.html',
      'Lever Demo Corp', 'Senior AI Engineer');
    await runFixture(8765, 'ashby-sample.html',
      'Ashby Demo Inc', 'Machine Learning Engineer');
    await runFixture(8765, 'greenhouse-sample.html',
      'Greenhouse Demo LLC', 'AI Automation Engineer');

    // Tectonic round-trip on a known-good .tex
    const tmpDir = resolve(ROOT, '.tmp-smoke');
    await mkdir(resolve(tmpDir, 'resumes'), { recursive: true });
    await writeFile(resolve(tmpDir, 'resumes/sm.tex'),
      `\\documentclass{article}\\begin{document}smoke\\end{document}`);
    const gen = await readFile(resolve(ROOT, 'generate-pdf-latex.mjs'), 'utf-8');
    await writeFile(resolve(tmpDir, 'generate-pdf-latex.mjs'), gen);

    const out = await execFileP('node', [SCRIPT, 'compile-resume',
      '--tex', 'resumes/sm.tex', '--pdf', 'resumes/sm.pdf',
    ], { cwd: tmpDir, timeout: 120000 });
    const obj = JSON.parse(out.stdout.trim());
    if (obj.status === 'ok') ok('tectonic compile happy path');
    else ng(`tectonic compile failed: ${obj.error}`);

    const st = await stat(resolve(tmpDir, 'resumes/sm.pdf'));
    if (st.size > 100) ok('pdf is non-trivial size');
    else ng(`pdf too small: ${st.size} bytes`);

    await rm(tmpDir, { recursive: true, force: true });
  } finally {
    server.close();
    // Clean up playwright session dir
    await rm(PW_CWD, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\nSmoke test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
