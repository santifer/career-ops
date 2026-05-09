#!/usr/bin/env node
// Render favicon-source.html to PNGs at all standard sizes.
// Outputs: 16, 32, 48, 64, 128, 180 (apple-touch), 192 (android), 256, 512
// Plus an apple-touch-icon and an SVG sketch of the same mark.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const DIR = new URL('.', import.meta.url).pathname;
const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512];

const browser = await chromium.launch();
console.log(`Rendering favicon at ${SIZES.length} sizes...`);

for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto('file://' + join(DIR, 'favicon-source.html'));
  await page.waitForLoadState('networkidle');
  // Page is built at 512x512; scale via CSS transform for crisper small renders
  await page.addStyleTag({ content: `html, body { width: 512px; height: 512px; transform: scale(${size / 512}); transform-origin: top left; }` });
  await page.waitForTimeout(200);
  const out = join(DIR, `favicon-${size}.png`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`  ✓ ${out}`);
  await context.close();
}

// Also write a minimal SVG version (scales infinitely, ~600 bytes)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="hi" cx="25%" cy="20%" r="55%"><stop offset="0%" stop-color="#4ade80" stop-opacity="0.18"/><stop offset="100%" stop-color="#4ade80" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="#0c0a09"/>
  <rect width="512" height="512" rx="96" fill="url(#hi)"/>
  <text x="256" y="356" font-family="Inter, -apple-system, sans-serif" font-weight="900" font-size="320" fill="#fafaf9" text-anchor="middle" letter-spacing="-19">M</text>
  <circle cx="426" cy="86" r="28" fill="#4ade80"/>
  <circle cx="426" cy="86" r="34" fill="none" stroke="#0c0a09" stroke-width="6"/>
</svg>`;
writeFileSync(join(DIR, 'favicon.svg'), svg);
console.log(`  ✓ ${join(DIR, 'favicon.svg')}`);

await browser.close();
console.log('Done. Use favicon-32.png as the primary; favicon-180.png as apple-touch-icon; favicon.svg as the modern preferred source.');
