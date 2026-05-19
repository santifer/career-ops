#!/usr/bin/env node
/**
 * One-shot screenshot harvester for data/dashboard-snapshots/.
 * Uses Playwright + CF Access service token (no interactive login needed).
 * Run: node scripts/harvest-screenshots.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

try {
  const r = createRequire(import.meta.url);
  r('dotenv').config({ path: join(ROOT, '.env'), override: false });
} catch {}

const BASE   = process.env.DASHBOARD_URL || 'https://dashboard.careers-ops.com';
const CID    = process.env.DASHBOARD_MCP_SERVICE_TOKEN_ID;
const CSEC   = process.env.DASHBOARD_MCP_SERVICE_TOKEN_SECRET;
const OUT    = join(ROOT, 'data/dashboard-snapshots');

if (!CID || !CSEC) { console.error('Missing service token env vars'); process.exit(1); }

function save(dir, name, buf) {
  const d = join(OUT, dir);
  mkdirSync(d, { recursive: true });
  const p = join(d, name + '.png');
  writeFileSync(p, buf);
  console.log('  saved:', p.replace(ROOT + '/', ''));
}

async function shot(page, dir, name, opts = {}) {
  await page.waitForTimeout(opts.wait || 400);
  try {
    let buf;
    if (opts.selector) {
      const loc = page.locator(opts.selector).first();
      const box = await loc.boundingBox();
      if (!box || box.width === 0 || box.height === 0) {
        console.log(`  skip (zero-size box): ${opts.selector}`);
        return;
      }
      buf = await page.screenshot({ type: 'png', clip: box });
    } else {
      buf = await page.screenshot({ type: 'png', fullPage: !!opts.fullPage });
    }
    save(dir, name, buf);
  } catch (err) {
    console.log(`  skip (screenshot error for ${name}): ${err.message.split('\n')[0]}`);
  }
}

async function go(page, path, wait = 1500) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForTimeout(wait);
}

// ── Story/Report discovery ─────────────────────────────────────────────────
function pickN(arr, n) {
  if (arr.length <= n) return arr;
  const step = Math.floor(arr.length / n);
  return arr.filter((_, i) => i % step === 0).slice(0, n);
}

const storyFiles = existsSync(join(ROOT, 'dashboard/stories'))
  ? readdirSync(join(ROOT, 'dashboard/stories')).filter(f => f.endsWith('.html')).slice(0, 5)
  : [];
const reportFiles = existsSync(join(ROOT, 'dashboard/reports'))
  ? readdirSync(join(ROOT, 'dashboard/reports')).filter(f => f.endsWith('.html') || f.endsWith('.md')).slice(0, 5)
  : [];

// ── Main ───────────────────────────────────────────────────────────────────
const viewports = [
  { name: '1440', w: 1440, h: 900 },
  { name: '768-tablet', w: 768, h: 1024 },
  { name: '375-mobile', w: 375, h: 812 },
];

const browser = await chromium.launch({ headless: true });

try {
  for (const vp of viewports) {
    console.log(`\n── viewport: ${vp.name} ──────────────────`);
    const ctx = await browser.newContext({
      extraHTTPHeaders: {
        'CF-Access-Client-Id':     CID,
        'CF-Access-Client-Secret': CSEC,
      },
      viewport: { width: vp.w, height: vp.h },
    });
    const page = await ctx.newPage();

    // Full page
    await go(page, '/');
    await shot(page, 'full-page', `home-${vp.name}`, { fullPage: true });

    await ctx.close();
  }

  // ── Detailed captures at 1440px ─────────────────────────────────────────
  const ctx = await browser.newContext({
    extraHTTPHeaders: {
      'CF-Access-Client-Id':     CID,
      'CF-Access-Client-Secret': CSEC,
    },
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  await go(page, '/');
  console.log('\n── sidebar widgets ──────────────────');

  // Sidebar sections visible at load
  const sidebarWidgets = [
    { sel: '#sidebar',                   name: 'sidebar-full' },
    { sel: '#sidebar-batch',             name: 'batch' },
    { sel: '#sidebar-runway',            name: 'runway' },
    { sel: '#sidebar-contacts',          name: 'contacts' },
    { sel: '#sidebar-pipeline-actions',  name: 'pipeline-actions' },
    { sel: '#sidebar-recent-updates',    name: 'recent-updates' },
    { sel: '#sidebar-readiness',         name: 'readiness' },
  ];

  for (const w of sidebarWidgets) {
    const exists = await page.locator(w.sel).count();
    if (exists) {
      // Scroll element into view before screenshotting
      await page.locator(w.sel).first().scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, 'sidebar', w.name, { selector: w.sel });
    } else {
      console.log(`  skip (not found): ${w.sel}`);
    }
  }

  // Main table area
  await shot(page, 'full-page', 'apply-now-table-1440', {});

  // ── Run Batch modal ──────────────────────────────────────────────────────
  console.log('\n── modals ───────────────────────────');
  await go(page, '/');

  // Open Run Batch modal
  const batchBtn = page.locator('.pipeline-btn-batch, button:has-text("Run Batch")').first();
  if (await batchBtn.count()) {
    await batchBtn.click();
    await page.waitForTimeout(1200);
    await shot(page, 'modals', 'run-batch-modal-open', {});
    // Close via Escape (avoids selector ambiguity with other Cancel buttons)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // Open Process All modal
  const processBtn = page.locator('.pipeline-btn-nuclear, button:has-text("Process All")').first();
  if (await processBtn.count()) {
    await processBtn.click();
    await page.waitForTimeout(2000); // loads per-company preview
    await shot(page, 'modals', 'process-all-modal-phase-a', {});
    // Close via Escape (avoids selector ambiguity with other Cancel buttons)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ── Apply-now drawer ─────────────────────────────────────────────────────
  const firstRow = page.locator('.apply-now-row, [data-apply-row], .row-clickable').first();
  if (await firstRow.count()) {
    await firstRow.click();
    await page.waitForTimeout(800);
    await shot(page, 'modals', 'apply-now-drawer-open', {});
    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ── Story pages ──────────────────────────────────────────────────────────
  console.log('\n── story pages ──────────────────────');
  for (const f of storyFiles) {
    const slug = f.replace('.html', '').slice(0, 40);
    await go(page, `/stories/${f}`, 800);
    await shot(page, 'stories', slug);  // viewport only — full-page exceeds 2000px
  }

  // ── Report pages ─────────────────────────────────────────────────────────
  console.log('\n── report pages ─────────────────────');
  for (const f of reportFiles) {
    const slug = f.replace(/\.(html|md)$/, '').slice(0, 40);
    await go(page, `/reports/${f}`, 800);
    await shot(page, 'reports', slug);  // viewport only
  }

  await ctx.close();
  console.log('\n✓ all screenshots done →', OUT.replace(ROOT + '/', ''));

} finally {
  await browser.close();
}
