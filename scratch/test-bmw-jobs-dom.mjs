// scratch/test-bmw-jobs-dom.mjs
import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  const url = 'https://www.bmwgroup.jobs/de/de/jobs.html';
  console.log(`Navigating to ${url}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'de-DE',
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('DOM content loaded. Waiting 5s for hydration...');
    await page.waitForTimeout(5000);

    // Let's see if the search input is present
    const searchInput = page.locator('input.grp-jobfinder-search');
    const isVisible = await searchInput.isVisible().catch(() => false);
    console.log(`Is input.grp-jobfinder-search visible? ${isVisible}`);

    // If not visible, let's look for cookie consent or usercentrics root
    const usercentrics = await page.locator('#usercentrics-root').count();
    console.log(`Usercentrics root element count: ${usercentrics}`);

    const html = await page.content();
    fs.writeFileSync('scratch/bmw-jobs-dom.html', html, 'utf-8');
    await page.screenshot({ path: 'scratch/bmw-jobs-dom.png' });
    console.log('Saved html and screenshot.');

    // Count all inputs
    const inputCount = await page.locator('input').count();
    console.log(`Found ${inputCount} input elements.`);

    if (inputCount > 0) {
      const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(el => ({
          type: el.type,
          class: el.className,
          placeholder: el.placeholder
        }));
      });
      console.log('Inputs info:', inputs);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

run();
