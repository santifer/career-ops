#!/usr/bin/env node
import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://co.computrabajo.com/trabajo-de-desarrollador-junior-en-bogota-dc', { waitUntil: 'networkidle' });
  const data = await page.$$eval('button, a', els => els.map(e => ({ tag: e.tagName, text: e.textContent?.trim(), href: e.href || '', name: e.getAttribute('name') })).filter(x => x.text));
  console.log(JSON.stringify(data, null, 2));
  const forms = await page.$$eval('form', els => els.map(e => ({ id: e.id, action: e.action, method: e.method }))); 
  console.log('FORMS', JSON.stringify(forms, null, 2));
  await browser.close();
})();