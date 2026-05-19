// BRAVO post-impl snapshot grab — captures key AFTER states for the
// implementation report. Uses Playwright against localhost:3097 (the local
// origin the Cloudflare Tunnel forwards to); the captured pages are
// identical to https://dashboard.careers-ops.com/.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'data', 'bravo-post-impl-snapshots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const URL = 'http://localhost:3097/';

async function shot(name, fn) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  if (fn) await fn();
  await page.screenshot({ path: `${OUT}/${name}-AFTER.png`, fullPage: false });
  console.log(`saved: ${name}-AFTER.png`);
}

// 1. Overview hero — AAA-5 (Top of Pipe re-verify amber chips) + AA-3 (Top pick pill)
await shot('overview-hero', null);

// 2. Drawer w/ comp chip wrap — AAA-2 in action
await shot('drawer-comp-chip-wrap', async () => {
  const r = await page.locator('table tbody tr', { hasText: 'Engineering Editorial' }).first();
  await r.scrollIntoViewIfNeeded();
  await r.click();
  await page.waitForTimeout(1000);
});

// 3. Score popout — AAA-1 "Top of pipeline" instead of "Top 0%"
await shot('score-popout-top-of-pipeline', async () => {
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0,0));
  await page.waitForTimeout(500);
  const s = await page.locator('.score-badge-lg.drill-trigger').first();
  await s.click();
  await page.waitForTimeout(1000);
});

// 4. All Evals — AAA-4 (saved-view-prompt no longer leaks) + AAA-6 (new placeholder)
await shot('all-evals-saved-view-hidden', async () => {
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const el = document.getElementById('all-evaluations-section');
    if (el) el.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(500);
});

// 5. Top-10 4-year value table — AAA-3 column widths legible
await shot('top10-4yr-value-table', async () => {
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find(e => /Top 10 by 4-year value/i.test(e.innerText));
    if (h) h.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(500);
});

await browser.close();
console.log('done');
