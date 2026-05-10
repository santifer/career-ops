#!/usr/bin/env node
// Render iOS PWA splash screens at canonical device sizes.
// Source mark is the favicon SVG (centered, ~22% of shortest axis).
// Background matches manifest theme_color (#0c0a09).
//
// Apple PWA splash specs: https://webhint.io/docs/user-guide/hints/hint-apple-touch-icons/
// We ship a curated set covering the most common modern iPhone + iPad form
// factors. The dashboard head injects matching <link rel=apple-touch-startup-image>
// tags with media queries; older iOS without a media match falls back to no
// splash (acceptable, not broken).

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const DIR = new URL('.', import.meta.url).pathname;

// width × height (portrait-primary). Each is the *device pixel* size; the
// dashboard's manifest is portrait-only so we don't render landscape pairs.
const DEVICES = [
  // iPhone — modern (notched / Dynamic Island)
  { w: 1290, h: 2796, label: 'iphone-15-pro-max' },   // 6.7" 14/15 Pro Max
  { w: 1179, h: 2556, label: 'iphone-15' },           // 6.1" 14/15
  { w: 1284, h: 2778, label: 'iphone-12-pro-max' },   // 6.7" 12/13 Pro Max
  { w: 1170, h: 2532, label: 'iphone-12' },           // 6.1" 12/13
  { w: 1242, h: 2688, label: 'iphone-xs-max' },       // 6.5" XS Max / 11 Pro Max
  { w: 1125, h: 2436, label: 'iphone-x' },            // 5.8" X / XS / 11 Pro
  { w: 828,  h: 1792, label: 'iphone-xr' },           // 6.1" XR / 11
  { w: 750,  h: 1334, label: 'iphone-8' },            // 4.7" SE2/8/7/6s
  // iPad
  { w: 1620, h: 2160, label: 'ipad-10-9' },           // iPad Air 10.9"
  { w: 1668, h: 2388, label: 'ipad-pro-11' },         // iPad Pro 11"
  { w: 2048, h: 2732, label: 'ipad-pro-12-9' },       // iPad Pro 12.9"
];

const BG = '#0c0a09';
const FG = '#fafaf9';
const ACCENT = '#4ade80';

function makeSplashHTML(w, h) {
  // Mark sizing: ~22% of shortest axis → readable on all devices, generous
  // safe area for the rounded corners + Dynamic Island cut-out.
  const markPx = Math.round(Math.min(w, h) * 0.22);
  const dotPx  = Math.round(markPx * 0.18);
  const labelPx = Math.round(markPx * 0.115);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; width: ${w}px; height: ${h}px;
      background: ${BG}; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; }
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: ${Math.round(markPx*0.18)}px; }
    .mark { position: relative; width: ${markPx}px; height: ${markPx}px;
      background: ${BG}; border-radius: ${Math.round(markPx*0.22)}px;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.04),
                  0 ${Math.round(markPx*0.04)}px ${Math.round(markPx*0.10)}px rgba(0,0,0,0.6);
      overflow: hidden; }
    .mark::before { content:''; position:absolute; inset:0;
      background: radial-gradient(circle at 25% 20%, rgba(74,222,128,0.18), transparent 55%); }
    .mark .letter { position:absolute; inset:0; display:flex; align-items:center;
      justify-content:center; color:${FG}; font-weight:900;
      font-size:${Math.round(markPx*0.62)}px; letter-spacing:-${Math.round(markPx*0.038)}px;
      line-height:1; padding-top:${Math.round(markPx*0.04)}px; }
    .mark .dot { position:absolute; top:${Math.round(markPx*0.16)}px;
      right:${Math.round(markPx*0.16)}px; width:${dotPx}px; height:${dotPx}px;
      background:${ACCENT}; border-radius:50%;
      box-shadow:0 0 0 ${Math.round(dotPx*0.18)}px ${BG}; }
    .label { color:${FG}; opacity:0.55; font-size:${labelPx}px; font-weight:600;
      letter-spacing:0.4px; text-transform:uppercase; }
  </style></head><body><div class="wrap">
    <div class="mark"><span class="letter">M</span><span class="dot"></span></div>
    <div class="label">Career-Ops</div>
  </div></body></html>`;
}

const browser = await chromium.launch();
console.log(`Rendering ${DEVICES.length} iOS PWA splash screens...`);

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.setContent(makeSplashHTML(d.w, d.h), { waitUntil: 'load' });
  const out = join(DIR, `splash-${d.w}x${d.h}.png`);
  await page.screenshot({ path: out, omitBackground: false,
    clip: { x: 0, y: 0, width: d.w, height: d.h } });
  console.log(`  ✓ ${out}  (${d.label})`);
  await ctx.close();
}

await browser.close();
console.log('Done. Add matching <link rel="apple-touch-startup-image"> tags to dashboard head.');
