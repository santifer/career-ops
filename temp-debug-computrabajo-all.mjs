import { chromium } from 'playwright';
const browser = await chromium.launch();
const urls = [
  'https://co.computrabajo.com/trabajo-de-desarrollador-junior-en-bogota-dc',
  'https://co.computrabajo.com/trabajo-de-desarrollador-en-bogota-dc#0277DE05E194001061373E686DCF3405',
  'https://co.computrabajo.com/trabajo-de-desarrollador-fullstack-en-bogota-dc'
];
for (const url of urls) {
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
  console.log('URL', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const sels = [
    'span[data-href-offer-apply]',
    'span[data-apply-link]',
    'span[offer-detail-button]',
    'span[href*="/candidate/apply"]',
    'span[href*="candidato.co.computrabajo.com"]',
    'span:has-text("Aplicar")'
  ];
  for (const s of sels) {
    const n = await page.$$eval(s, els => els.length).catch(() => 0);
    console.log(`  ${s}: ${n}`);
  }
  await page.close();
}
await browser.close();
