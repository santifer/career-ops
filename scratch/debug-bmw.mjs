// scratch/debug-bmw.mjs
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'de-DE'
  });
  const page = await context.newPage();
  
  try {
    const url = 'https://www.bmwgroup.jobs/de/de/jobfinder.html';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    console.log(`Title: ${await page.title()}`);
    console.log(`Current URL: ${page.url()}`);
    
    // Save HTML and screenshot
    const html = await page.content();
    fs.writeFileSync('scratch/bmw-debug.html', html, 'utf-8');
    await page.screenshot({ path: 'scratch/bmw-debug.png' });
    console.log('Saved debug files.');
    
    // Check for job links or search components
    const linksCount = await page.locator('a').count();
    console.log(`Found ${linksCount} links on the page.`);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
