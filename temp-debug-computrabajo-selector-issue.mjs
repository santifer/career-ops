import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
await page.goto('https://co.computrabajo.com/trabajo-de-desarrollador-junior-en-bogota-dc', { waitUntil: 'networkidle', timeout: 60000 });
const sel1 = 'span[data-href-offer-apply], span[href*="candidato.co.computrabajo.com"]';
const sel2 = 'span[data-href-offer-apply], span[href*="candidato.co.computrabajo.com"], span:has-text("Aplicar")';
console.log('sel1', await page.$$eval(sel1, els => els.length).catch(e => e.message));
console.log('sel2', await page.$$eval(sel2, els => els.length).catch(e => e.message));
await browser.close();
