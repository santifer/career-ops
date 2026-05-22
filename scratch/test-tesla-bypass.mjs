// scratch/test-tesla-bypass.mjs
import { chromium } from 'playwright';
import fs from 'fs';

async function testTesla() {
  console.log('--- Testing Tesla Playwright with Webdriver Bypass ---');
  const browser = await chromium.launch({ headless: true });
  
  // Try to mask automation signatures
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'de-DE',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    }
  });

  // Inject script to delete navigator.webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    // Mock chrome object
    window.chrome = {
      runtime: {},
    };
    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  });

  const page = await context.newPage();
  try {
    const url = 'https://www.tesla.com/careers/search?site=DE&location=Berlin';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const title = await page.title();
    console.log(`Page Title: ${title}`);
    console.log(`Current URL: ${page.url()}`);

    const html = await page.content();
    if (html.includes('Access Denied')) {
      console.log('Bypass failed: Access Denied still present.');
    } else {
      console.log('Bypass might have succeeded! Checking for job rows...');
      // Wait for the job listing container/cards
      try {
        await page.waitForSelector('.tds-table-row', { timeout: 5000 });
        const jobCount = await page.locator('.tds-table-row').count();
        console.log(`Found ${jobCount} Tesla job rows!`);
        if (jobCount > 0) {
          const firstJobText = await page.locator('.tds-table-row').first().innerText();
          console.log('First job text:', firstJobText.replace(/\n/g, ' | '));
        }
      } catch (e) {
        console.log('No tds-table-row found within timeout. Let\'s see what elements are present.');
        const buttonCount = await page.locator('button').count();
        console.log(`Found ${buttonCount} buttons on page.`);
      }
    }
    
    // Save debug assets
    fs.writeFileSync('scratch/tesla-bypass-debug.html', html, 'utf-8');
    await page.screenshot({ path: 'scratch/tesla-bypass-debug.png' });
    console.log('Saved screenshot and html.');
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

testTesla();
