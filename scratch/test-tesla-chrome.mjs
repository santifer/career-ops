// scratch/test-tesla-chrome.mjs
import { chromium } from 'playwright';
import fs from 'fs';

async function testTesla(headless) {
  console.log(`--- Testing Tesla with channel: 'chrome', headless: ${headless} ---`);
  try {
    const browser = await chromium.launch({
      channel: 'chrome',
      headless: headless
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'de-DE',
    });
    const page = await context.newPage();
    const url = 'https://www.tesla.com/careers/search?site=DE&location=Berlin';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const title = await page.title();
    console.log(`Page Title: ${title}`);

    const html = await page.content();
    if (html.includes('Access Denied')) {
      console.log(`Failed with headless: ${headless}`);
    } else {
      console.log(`SUCCESS with headless: ${headless}!`);
      try {
        await page.waitForSelector('.tds-table-row', { timeout: 10000 });
        const jobCount = await page.locator('.tds-table-row').count();
        console.log(`Found ${jobCount} Tesla job rows.`);
        if (jobCount > 0) {
          const firstJobText = await page.locator('.tds-table-row').first().innerText();
          console.log('First job text:', firstJobText.replace(/\n/g, ' | '));
        }
      } catch (e) {
        console.log('No tds-table-row found within timeout.');
      }
    }
    await browser.close();
  } catch (e) {
    console.error(`Error with headless: ${headless}:`, e.message);
  }
}

async function run() {
  // Test headless: true first
  await testTesla(true);
  console.log('\n');
  // If that fails, test headless: false
  await testTesla(false);
}

run();
