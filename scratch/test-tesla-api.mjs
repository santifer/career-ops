// scratch/test-tesla-api.mjs
import { chromium } from 'playwright';

async function testTesla() {
  console.log('--- Testing Tesla API ---');
  try {
    const res = await fetch('https://www.tesla.com/careers/search-results.json');
    if (res.status === 200) {
      const data = await res.json();
      console.log('Tesla API works! First job:', data[0]);
      return;
    }
    console.log('Tesla search-results.json status:', res.status);
  } catch (e) {
    console.error('Tesla API error:', e.message);
  }

  console.log('\n--- Testing Tesla Playwright ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const url = 'https://www.tesla.com/careers/search?site=DE&location=Berlin';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for the job listing container/cards
    await page.waitForSelector('.tds-table-row', { timeout: 10000 });
    const jobCount = await page.locator('.tds-table-row').count();
    console.log(`Found ${jobCount} Tesla job rows.`);
    
    if (jobCount > 0) {
      const firstJobText = await page.locator('.tds-table-row').first().innerText();
      console.log('First job text:', firstJobText.replace(/\n/g, ' | '));
    }
  } catch (e) {
    console.error('Tesla Playwright error:', e.message);
  } finally {
    await browser.close();
  }
}

testTesla();
