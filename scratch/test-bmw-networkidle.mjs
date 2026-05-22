// scratch/test-bmw-networkidle.mjs
import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  const url = 'https://www.bmwgroup.jobs/de/de/jobfinder.html';
  console.log(`Navigating to ${url}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'de-DE',
  });
  const page = await context.newPage();

  try {
    // Navigate and wait for networkidle
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(5000);

    // Save page content for inspection
    const html = await page.content();
    fs.writeFileSync('scratch/bmw-networkidle.html', html, 'utf-8');
    await page.screenshot({ path: 'scratch/bmw-networkidle.png' });
    console.log('Saved page content and screenshot.');

    // Check if input exists
    const inputCount = await page.locator('input').count();
    console.log(`Found ${inputCount} total input elements.`);
    
    const searchInput = page.locator('input.grp-jobfinder-search');
    const isVisible = await searchInput.isVisible().catch(() => false);
    console.log(`Is input.grp-jobfinder-search visible? ${isVisible}`);

    if (inputCount > 0) {
      const inputsInfo = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(el => ({
          type: el.type,
          class: el.className,
          placeholder: el.placeholder,
          id: el.id
        }));
      });
      console.log('All input elements:', inputsInfo);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

run();
