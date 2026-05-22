// scratch/debug-tesla.mjs
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US'
  });
  const page = await context.newPage();
  
  try {
    const url = 'https://www.tesla.com/careers/search?site=DE&location=Berlin';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Sleep a few seconds to let any client-side JavaScript execute and load data
    await page.waitForTimeout(5000);
    
    // Print page title and url
    console.log(`Title: ${await page.title()}`);
    console.log(`Current URL: ${page.url()}`);
    
    // Let's dump some selectors to see what elements are present
    const html = await page.content();
    fs.writeFileSync('scratch/tesla-debug.html', html, 'utf-8');
    console.log('Saved HTML to scratch/tesla-debug.html');
    
    // Screenshot
    await page.screenshot({ path: 'scratch/tesla-debug.png' });
    console.log('Saved screenshot to scratch/tesla-debug.png');
    
    // Check if there are tables, list items, or links
    const links = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('a'));
      return all.map(a => ({ text: a.innerText, href: a.href })).filter(a => a.href.includes('/careers/job/'));
    });
    console.log(`Found ${links.length} career job links.`);
    if (links.length > 0) {
      console.log('Sample links:', links.slice(0, 5));
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
