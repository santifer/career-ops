"import { chromium } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

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
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);

    // 1. Open the filter panel
    console.log('Attempting to open the filter panel...');
    const openedFilters = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a')).find(el => {
        const text = el.innerText.trim().toLowerCase();
        return text.includes('filter einblenden') || (text.includes('filter') && el.classList.contains('collapsed'));
      });
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    console.log('Filter panel opened:', openedFilters);
    await page.waitForTimeout(2000);

    // 2. Type search keyword "werkstudent"
    console.log('Typing search keyword "werkstudent"...');
    const searchInput = page.locator('input.grp-jobfinder-search');
    await searchInput.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await searchInput.fill('werkstudent');
    await page.waitForTimeout(500);

    // Click the search button/icon to trigger search
    console.log('Clicking the search icon button...');
    await page.click('button.grp-jobfinder-search-icon');
    await page.waitForTimeout(3000);

    // 3. Select location Munich
    console.log('Checking location "DE/Munich"...');
    const checked = await page.evaluate(() => {
     
<truncated 3811 bytes>