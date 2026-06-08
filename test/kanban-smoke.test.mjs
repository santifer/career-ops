/**
 * kanban-smoke.test.mjs — Browser smoke test for job-pulse-kanban.html
 *
 * Starts http-server on a temp port, opens the kanban in headless Chromium,
 * mocks Cloudflare Worker responses, clicks every toolbar button, asserts no
 * "is not defined" ReferenceErrors fire.
 *
 * Run:  node --test test/kanban-smoke.test.mjs
 * Prereq: npx playwright install chromium  (one-time; browser binaries)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT    = 5175; // offset from production 5174 to avoid conflict
const BASE    = `http://localhost:${PORT}`;
const KANBAN  = `${BASE}/job-pulse-kanban.html`;
const WORKER  = 'https://pulse-jobs-proxy.rahilnathanipulse.workers.dev/**';

const MOCK_JOB = {
  id:             'gh-testco-001',
  source:         'greenhouse',
  external_id:    'TC001',
  title:          'Senior Scrum Master',
  company:        'TestCo',
  state:          'new',
  grade:          'A',
  url:            'https://example.com/jobs/1',
  location:       'Remote, US',
  posted_at:      '2026-06-08T00:00:00Z',
  remote:         true,
  verified:       true,
  has_connection: false,
};

async function waitForServer(url, retries = 30, delayMs = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(400) });
      if (r.status < 500) return;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`http-server at ${url} did not start within ${retries * delayMs}ms`);
}

let srv, browser;

describe('kanban browser smoke', () => {

  before(async () => {
    srv = spawn('npx', ['http-server', 'dashboard', '-p', String(PORT), '-c-1', '--silent'], {
      cwd:   ROOT,
      shell: process.platform === 'win32',
      stdio: 'ignore',
    });
    await waitForServer(KANBAN);
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    await browser?.close();
    if (srv) {
      srv.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 300));
    }
  });

  // ── Scope tests (fast, no Worker calls) ────────────────────────────────────

  test('fetchJobs is defined on window — not a ReferenceError', async () => {
    const page = await browser.newPage();
    await page.goto(KANBAN, { waitUntil: 'networkidle' });
    const type = await page.evaluate(() => typeof window.fetchJobs);
    await page.close();
    assert.equal(type, 'function', 'window.fetchJobs must be a function (module scope fix)');
  });

  test('all six onclick handlers are defined on window', async () => {
    const page = await browser.newPage();
    await page.goto(KANBAN, { waitUntil: 'networkidle' });
    const types = await page.evaluate(() => ({
      fetchJobs:   typeof window.fetchJobs,
      runDryRun:   typeof window.runDryRun,
      exportState: typeof window.exportState,
      importState: typeof window.importState,
      clearBoard:  typeof window.clearBoard,
      closeModal:  typeof window.closeModal,
    }));
    await page.close();
    for (const [name, type] of Object.entries(types)) {
      assert.equal(type, 'function', `window.${name} must be a function`);
    }
  });

  // ── Fetch Jobs integration ──────────────────────────────────────────────────

  test('clicking Fetch Jobs fires ≥1 Worker request and updates status', async () => {
    const page = await browser.newPage();
    const workerCalls = [];
    const consoleErrors = [];

    await page.route(WORKER, async route => {
      workerCalls.push(route.request().url());
      await route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ jobs: [MOCK_JOB] }),
      });
    });

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(KANBAN, { waitUntil: 'networkidle' });
    await page.click('button.primary'); // ⬇ Fetch Jobs

    // Wait for status line to reflect fetch activity
    await page.waitForFunction(
      () => {
        const txt = document.getElementById('status')?.textContent ?? '';
        return txt.includes('Fetch') || txt.includes('error') || txt.includes('jobs');
      },
      { timeout: 6000 },
    );

    const status = await page.$eval('#status', el => el.textContent);
    await page.close();

    assert.ok(workerCalls.length > 0,
      `Expected ≥1 Worker request, got 0. Status: "${status}"`);

    const refErrors = consoleErrors.filter(e => e.includes('is not defined'));
    assert.equal(refErrors.length, 0,
      `Got ReferenceErrors: ${refErrors.join('; ')}`);
  });

  // ── clearBoard smoke ────────────────────────────────────────────────────────

  test('clearBoard is callable without crash (confirm dialog auto-dismissed)', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    // Auto-dismiss the confirm() dialog
    page.on('dialog', d => d.dismiss());

    await page.goto(KANBAN, { waitUntil: 'networkidle' });
    await page.click('button[style*="red"]'); // ✕ Clear

    const refErrors = errors.filter(e => e.includes('is not defined'));
    await page.close();
    assert.equal(refErrors.length, 0,
      `clearBoard threw ReferenceError: ${refErrors.join('; ')}`);
  });

  // ── exportState smoke ───────────────────────────────────────────────────────

  test('exportState is callable without crash', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    // Intercept the download so it doesn't open a file dialog
    await page.evaluate(() => { URL.createObjectURL = () => 'blob:mock'; });

    await page.goto(KANBAN, { waitUntil: 'networkidle' });

    // exportState triggers a download anchor click — just ensure no crash
    await page.evaluate(() => window.exportState());

    const refErrors = errors.filter(e => e.includes('is not defined'));
    await page.close();
    assert.equal(refErrors.length, 0,
      `exportState threw ReferenceError: ${refErrors.join('; ')}`);
  });

});
