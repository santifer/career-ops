#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
try { createRequire(import.meta.url)('dotenv').config({ path: join(ROOT, '.env'), override: false }); } catch {}
const CID  = process.env.DASHBOARD_MCP_SERVICE_TOKEN_ID;
const CSEC = process.env.DASHBOARD_MCP_SERVICE_TOKEN_SECRET;
const BASE = 'https://dashboard.careers-ops.com';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'CF-Access-Client-Id': CID, 'CF-Access-Client-Secret': CSEC },
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// 1. whyPick text (should now end with full word + … or no truncation)
const info = await page.evaluate(() => {
  const why = document.querySelector('#tonight-pick-callout .tonight-pick-why');
  const gapChip = document.querySelector('#tonight-pick-callout .tp-sig-warn');
  const topOfPipeItems = document.querySelectorAll('#top-of-pipe-list .top-of-pipe-item').length;
  const nextMoveHero = document.querySelector('.next-move-hero') ? 'PRESENT' : 'REMOVED';
  return {
    whyText: why && why.innerText,
    whyLen: why ? why.innerText.length : 0,
    endsCleanly: why ? !/[a-z]$/.test(why.innerText.trim()) || why.innerText.trim().endsWith('…') || /[\.!?]$/.test(why.innerText.trim()) : null,
    gapChipTag: gapChip ? gapChip.tagName : null,
    gapChipOnclick: gapChip ? gapChip.getAttribute('onclick') : null,
    topOfPipeItems,
    nextMoveHero,
  };
});
console.log('VERIFICATION ──────────────');
console.log(JSON.stringify(info, null, 2));

// 2. Test gap chip click opens drawer
console.log('\n── Test: click gap chip opens drawer ──');
await page.locator('#tonight-pick-callout .tp-sig-warn').click();
await page.waitForTimeout(700);
const drawerOpen = await page.evaluate(() => !!document.querySelector('#right-rail-drawer.open'));
console.log('Drawer open after gap-chip click:', drawerOpen);

// 3. Score popout
console.log('\n── Test: score popout opens with HTML table ──');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const scoreClicked = await page.evaluate(() => {
  // try to click a score chip
  const chip = document.querySelector('[onclick*="drillIn(\'score\'"]');
  if (chip) { chip.click(); return true; }
  return false;
});
await page.waitForTimeout(800);
const scoreHtml = await page.evaluate(() => {
  const panel = document.querySelector('.drill-panel:not([hidden]), [data-drill]:not([hidden])');
  if (!panel) return { found: false };
  return {
    found: true,
    hasTable: !!panel.querySelector('table'),
    hasPipeChars: panel.innerText.includes('|'),  // markdown leak indicator
    leadText: panel.innerText.slice(0, 200),
  };
});
console.log('Score popout:', JSON.stringify(scoreHtml, null, 2));

// 4. Final screenshot
const loc = page.locator('#tonight-pick-callout');
await loc.scrollIntoViewIfNeeded();
const box = await loc.boundingBox();
if (box) {
  const buf = await page.screenshot({ type: 'png', clip: box });
  writeFileSync('/tmp/tonight-pick-after.png', buf);
  console.log('\nSaved /tmp/tonight-pick-after.png');
}

await browser.close();
