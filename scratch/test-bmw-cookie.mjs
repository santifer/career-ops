// scratch/test-bmw-cookie.mjs
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
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Accept cookies - check what buttons exist on the page first
    const buttonsInfo = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, a, div')).map(el => {
        const text = el.innerText ? el.innerText.trim() : '';
        const id = el.id || '';
        const className = el.className || '';
        if (text.toLowerCase().includes('akzeptieren') || text.toLowerCase().includes('accept') || id.includes('cookie') || id.includes('uc-btn')) {
          return { tag: el.tagName, id, class: className, text: text.substring(0, 100) };
        }
        return null;
      }).filter(Boolean);
    });
    console.log('Consent-related or action buttons found:', buttonsInfo);

    // Try to find the accept button and click it
    const clickedAccept = await page.evaluate(() => {
      // Look for button with id uc-btn-accept-banner
      const btn1 = document.getElementById('uc-btn-accept-banner');
      if (btn1) {
        btn1.click();
        return 'Clicked id uc-btn-accept-banner';
      }
      
      // Look for shadow DOM or other custom elements
      // Usercentrics banner is often inside a shadow root
      const usercentrics = document.getElementById('usercentrics-root');
      if (usercentrics && usercentrics.shadowRoot) {
        const acceptBtn = usercentrics.shadowRoot.querySelector('button[data-testid="uc-accept-all-button"]');
        if (acceptBtn) {
          acceptBtn.click();
          return 'Clicked Usercentrics Shadow DOM Accept All button';
        }
      }

      // General search for text
      const btn2 = Array.from(document.querySelectorAll('button')).find(b => {
        const t = b.innerText.toLowerCase();
        return t.includes('alle akzeptieren') || t.includes('accept all') || t.includes('alles akzeptieren');
      });
      if (btn2) {
        btn2.click();
        return 'Clicked text-based Accept All button';
      }
      
      return 'No accept button found/clicked';
    });
    console.log('Cookie action outcome:', clickedAccept);
    await page.waitForTimeout(5000);

    // Now check if inputs exist
    const inputCount = await page.locator('input').count();
    console.log(`After cookie consent, found ${inputCount} input elements.`);

    if (inputCount > 0) {
      const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(el => ({
          type: el.type,
          class: el.className,
          placeholder: el.placeholder
        }));
      });
      console.log('Input fields:', inputs);
    } else {
      // Let's capture the body text to see what is on the page
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
      console.log('Body Text Snippet:', bodyText);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

run();
