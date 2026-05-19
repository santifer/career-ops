#!/usr/bin/env node
/**
 * One-shot inspection: visit live dashboard with CF service token, capture
 * the #tonight-pick-callout HTML + computed CSS + screenshot, and click each
 * button to verify handlers fire.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

try {
  const r = createRequire(import.meta.url);
  r('dotenv').config({ path: join(ROOT, '.env'), override: false });
} catch {}

const BASE = process.env.DASHBOARD_URL || 'https://dashboard.careers-ops.com';
const CID  = process.env.DASHBOARD_MCP_SERVICE_TOKEN_ID;
const CSEC = process.env.DASHBOARD_MCP_SERVICE_TOKEN_SECRET;

if (!CID || !CSEC) { console.error('Missing CF service token env'); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'CF-Access-Client-Id': CID, 'CF-Access-Client-Secret': CSEC },
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500); // let JS settle (tonight-pick init runs async)

// 1. Capture the tonight-pick HTML + computed styles
const info = await page.evaluate(() => {
  const el = document.getElementById('tonight-pick-callout');
  if (!el) return { found: false };
  const cs = getComputedStyle(el);
  const why = el.querySelector('.tonight-pick-why');
  const role = el.querySelector('.tonight-pick-role');
  const buttons = Array.from(el.querySelectorAll('button')).map(b => ({
    text: b.innerText.trim(),
    cls: b.className,
    onclick: b.getAttribute('onclick'),
    disabled: b.disabled,
    visible: b.offsetParent !== null,
  }));
  return {
    found: true,
    hidden: el.hidden,
    display: cs.display,
    width: cs.width,
    height: cs.height,
    whyText: why ? why.innerText : null,
    whyOverflow: why ? (why.scrollHeight > why.clientHeight) : null,
    whyClientHeight: why ? why.clientHeight : null,
    whyScrollHeight: why ? why.scrollHeight : null,
    roleText: role ? role.innerText : null,
    roleOverflow: role ? (role.scrollWidth > role.clientWidth) : null,
    buttons,
    // Check global handler bindings
    handlersExist: {
      tonightPickStart: typeof window.tonightPickStart === 'function',
      tonightPickLearnMore: typeof window.tonightPickLearnMore === 'function',
      tonightPickReviewMaterials: typeof window.tonightPickReviewMaterials === 'function',
      tonightPickCycle: typeof window.tonightPickCycle === 'function',
    },
  };
});

console.log('TONIGHT PICK INFO ──────────────────────');
console.log(JSON.stringify(info, null, 2));

// 2. Screenshot the callout
try {
  const loc = page.locator('#tonight-pick-callout');
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (box) {
    const buf = await page.screenshot({ type: 'png', clip: box });
    writeFileSync('/tmp/tonight-pick-callout.png', buf);
    console.log('Saved /tmp/tonight-pick-callout.png  box=' + JSON.stringify(box));
  }
} catch (e) { console.log('screenshot failed:', e.message); }

// 3. Click each button and watch for errors / new elements
const buttonsToTest = ['Learn more', 'Review materials', 'Pick another'];
for (const label of buttonsToTest) {
  try {
    consoleErrors.length = 0;
    await page.locator(`#tonight-pick-callout button:has-text("${label}")`).click({ timeout: 3000 });
    await page.waitForTimeout(800);
    const post = await page.evaluate(() => ({
      drawerOpen: !!document.querySelector('.drawer.open, .right-rail.open, [data-drawer-open="true"]'),
      url: location.href,
      visibleModal: !!document.querySelector('.modal.visible, [role="dialog"]:not([hidden])'),
    }));
    console.log(`Click "${label}":  ${JSON.stringify(post)}  errors=${consoleErrors.length}`);
    if (consoleErrors.length) console.log('  errors:', consoleErrors);
    // close any opened drawer/modal
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  } catch (e) {
    console.log(`Click "${label}":  FAILED — ${e.message.split('\n')[0]}`);
  }
}

console.log('\nALL CONSOLE ERRORS:', consoleErrors);
await browser.close();
