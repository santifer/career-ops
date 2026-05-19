#!/usr/bin/env node
import { chromium } from 'playwright';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = '/Users/mitchellwilliams/Documents/career-ops';
try { createRequire(import.meta.url)('dotenv').config({ path: join(ROOT, '.env'), override: false }); } catch {}
const CID  = process.env.DASHBOARD_MCP_SERVICE_TOKEN_ID;
const CSEC = process.env.DASHBOARD_MCP_SERVICE_TOKEN_SECRET;
const BASE = 'https://dashboard.careers-ops.com';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'CF-Access-Client-Id': CID, 'CF-Access-Client-Secret': CSEC },
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
const logs = []; page.on('console', m => logs.push(m.type() + ':' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR:' + e.message));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Test 1: Learn more — should open right-rail drawer for the row
console.log('\n── TEST 1: Learn more (expected: right-rail drawer opens) ──');
logs.length = 0;
await page.locator('#tonight-pick-callout button:has-text("Learn more")').click();
await page.waitForTimeout(800);
const t1 = await page.evaluate(() => ({
  detailOpen: Array.from(document.querySelectorAll('[id^="detail-apply-"]')).filter(d => !d.hidden && d.offsetParent !== null).length,
  rightRailVisible: !!document.querySelector('.right-rail.open, #right-rail.open, [data-right-rail-open]'),
  bodies: Array.from(document.querySelectorAll('.right-rail, #right-rail, [class*=right-rail], [id*=right-rail]')).map(el => ({ id: el.id, cls: el.className, hidden: el.hidden, display: getComputedStyle(el).display })).slice(0,5),
  anyDialog: !!document.querySelector('[role="dialog"]:not([hidden])'),
  dialogIds: Array.from(document.querySelectorAll('[role="dialog"]:not([hidden])')).map(d => d.id || d.className).slice(0,3),
}));
console.log(JSON.stringify(t1, null, 2));
if (logs.length) console.log('logs:', logs.slice(0,5));

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Test 2: Review materials — should show apply-pack path / open modal
console.log('\n── TEST 2: Review materials (expected: path/modal/clipboard) ──');
logs.length = 0;
await page.locator('#tonight-pick-callout button:has-text("Review materials")').click();
await page.waitForTimeout(800);
const t2 = await page.evaluate(() => ({
  anyAlert: !!document.querySelector('[role="alert"]:not([hidden]), .toast.visible, .notification.visible'),
  modalOpen: Array.from(document.querySelectorAll('[role="dialog"], .modal')).filter(d => !d.hidden && getComputedStyle(d).display !== 'none').map(d => ({ id: d.id, txt: d.textContent.slice(0, 200) })).slice(0,2),
  copyToast: document.body.innerText.includes('Copied') || document.body.innerText.includes('clipboard'),
}));
console.log(JSON.stringify(t2, null, 2));
if (logs.length) console.log('logs:', logs.slice(0,5));

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Test 3: Pick another — should cycle the in-place callout to a different role
console.log('\n── TEST 3: Pick another (expected: card content changes to a different role) ──');
const before = await page.evaluate(() => {
  const role = document.querySelector('#tonight-pick-callout .tonight-pick-role');
  const company = document.querySelector('#tonight-pick-callout .tonight-pick-company');
  return { role: role && role.innerText, company: company && company.innerText };
});
console.log('before:', JSON.stringify(before));
logs.length = 0;
await page.locator('#tonight-pick-callout button:has-text("Pick another")').click();
await page.waitForTimeout(800);
const after = await page.evaluate(() => {
  const role = document.querySelector('#tonight-pick-callout .tonight-pick-role');
  const company = document.querySelector('#tonight-pick-callout .tonight-pick-company');
  return { role: role && role.innerText, company: company && company.innerText };
});
console.log('after :', JSON.stringify(after));
console.log('changed?', before.role !== after.role || before.company !== after.company);
if (logs.length) console.log('logs:', logs.slice(0,5));

// Test 4: Start tonight's apply — should open the live JD in a new tab
console.log('\n── TEST 4: Start tonight\'s apply (expected: new tab opens) ──');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
logs.length = 0;
const newPagePromise = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);
await page.locator('#tonight-pick-callout button:has-text("Start tonight")').click();
await page.waitForTimeout(800);
const newPage = await newPagePromise;
if (newPage) {
  console.log('NEW TAB OPENED to:', newPage.url());
  await newPage.close();
} else {
  console.log('NO NEW TAB. Checking for modal/error...');
  const t4 = await page.evaluate(() => ({
    anyDialog: Array.from(document.querySelectorAll('[role="dialog"]')).filter(d => !d.hidden && getComputedStyle(d).display !== 'none').map(d => ({ id: d.id, txt: d.textContent.slice(0, 300) })).slice(0,2),
  }));
  console.log(JSON.stringify(t4, null, 2));
}
if (logs.length) console.log('logs:', logs.slice(0,5));

await browser.close();
