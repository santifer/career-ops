import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
const url = 'https://co.computrabajo.com/trabajo-de-desarrollador-junior-en-bogota-dc';
console.log('URL', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('after domcontentloaded', page.url());
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { console.log('networkidle timeout'); });
console.log('after networkidle', page.url());
const sels = ['span[data-href-offer-apply]', 'span[data-apply-link]', 'span[offer-detail-button]', 'span[href*="/candidate/apply"]', 'span[href*="candidato.co.computrabajo.com"]', 'span:has-text("Aplicar")'];
for (const s of sels) {
  const n = await page.$$eval(s, els => els.length).catch(() => 0);
  console.log(`  ${s}: ${n}`);
}
await browser.close();
