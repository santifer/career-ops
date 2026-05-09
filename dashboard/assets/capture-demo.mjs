#!/usr/bin/env node
// Capture dashboard demo screenshots at multiple viewports.
// Used as visual proof / interview-loop attachment.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DIR = new URL('.', import.meta.url).pathname;
const OUT = join(DIR, 'demo');
mkdirSync(OUT, { recursive: true });

const TARGET_URL = 'http://localhost:3000/?v=demo-' + Date.now();

const VIEWPORTS = [
  { label: 'desktop-1440',  width: 1440, height: 900,  scale: 2 },
  { label: 'desktop-1920',  width: 1920, height: 1080, scale: 2 },
  { label: 'tablet-1024',   width: 1024, height: 1366, scale: 2 },
  { label: 'mobile-iphone', width: 390,  height: 844,  scale: 3 },
];

const browser = await chromium.launch();
console.log(`Capturing dashboard demo at ${VIEWPORTS.length} viewports...`);

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
  });
  const page = await ctx.newPage();
  await page.goto(TARGET_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  // Top of page
  await page.screenshot({ path: join(OUT, `${vp.label}-top.png`) });
  // Full-page
  await page.screenshot({ path: join(OUT, `${vp.label}-full.png`), fullPage: true });
  // Dark mode variant — toggle dark, snap top
  await page.evaluate(() => document.body.classList.add('dark'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${vp.label}-dark-top.png`) });
  console.log(`  ✓ ${vp.label} (light + dark)`);
  await ctx.close();
}

await browser.close();
console.log(`\nDone. Files in ${OUT}/`);
console.log('Recommended for interview attachments: desktop-1440-top.png and desktop-1440-dark-top.png.');
