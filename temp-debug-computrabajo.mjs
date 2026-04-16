import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
await page.goto('https://co.computrabajo.com/trabajo-de-desarrollador-junior-en-bogota-dc', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);
const sels = ['span[href*="/candidate/apply"]', 'span[href*="candidato.co.computrabajo.com"]', 'span[data-href-offer-apply]', 'span[data-apply-link]', 'span[offer-detail-button]'];
for (const s of sels) {
  const n = await page.$$eval(s, els => els.length).catch(() => 0);
  console.log(`${s}: ${n}`);
}
for (const s of ['span:has-text("Aplicar")', 'a:has-text("Aplicar")', 'button:has-text("Aplicar")']) {
  const n = await page.$$eval(s, els => els.length).catch(() => 0);
  console.log(`${s}: ${n}`);
}
const nodes = await page.$$eval('span[href*="/candidate/apply"], span[href*="candidato.co.computrabajo.com"]', els => els.map(e => ({ tag: e.tagName, text: e.textContent.trim(), href: e.getAttribute('href') })));
console.log(JSON.stringify(nodes, null, 2));
await browser.close();
