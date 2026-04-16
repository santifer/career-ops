#!/usr/bin/env node
import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
  await page.goto('https://co.computrabajo.com/trabajo-de-desarrollador-junior-en-bogota-dc', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  const html = await page.content();
  console.log(html.slice(0, 2000));
  const buttons = await page.$$eval('button, a, span[data-href-offer-apply], span[data-apply-link], span[offer-detail-button]', els => els.map(e => ({ tag: e.tagName, text: e.textContent?.trim(), href: e.getAttribute('href') || e.getAttribute('data-href-offer-apply') || e.getAttribute('data-apply-link'), name: e.getAttribute('name') })).filter(x => x.text || x.href));
  console.log(JSON.stringify(buttons, null, 2));
  const forms = await page.$$eval('form', els => els.map(e => ({ id: e.id, action: e.action, method: e.method })));
  console.log('FORMS', JSON.stringify(forms, null, 2));
  await browser.close();
})();