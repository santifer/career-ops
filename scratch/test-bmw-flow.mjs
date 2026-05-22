// scratch/test-bmw-flow.mjs
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
    await page.waitForTimeout(5000);

    // Accept cookies if present
    console.log('Accepting cookies if panel is visible...');
    try {
      const cookieBtn = page.locator('#uc-btn-accept-banner');
      if (await cookieBtn.isVisible()) {
        await cookieBtn.click();
        await page.waitForTimeout(1000);
        console.log('Cookies accepted.');
      }
    } catch (e) {
      console.log('No cookie banner or click failed:', e.message);
    }

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

    // 3. Load all jobs by clicking "WEITERE JOBS ANZEIGEN" repeatedly
    console.log('Clicking "WEITERE JOBS ANZEIGEN" repeatedly to load all results...');
    let showMoreCount = 0;
    while (true) {
      const showMoreBtn = page.locator('.grp-jobfinder__showmore button');
      if (await showMoreBtn.isVisible() && await showMoreBtn.isEnabled()) {
        console.log(`Clicking show more button (count: ${++showMoreCount})...`);
        await showMoreBtn.click();
        await page.waitForTimeout(2000);
      } else {
        console.log('No more "show more" button visible or enabled.');
        break;
      }
    }

    // 4. Scrape all jobs from the page
    console.log('Extracting jobs from DOM...');
    const jobs = await page.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.grp-jobfinder__wrapper'));
      return wrappers.map(w => {
        const refNoEl = w.querySelector('.grp-jobfinder-cell-refno');
        if (!refNoEl) return null;
        
        const title = refNoEl.getAttribute('data-job-title') || '';
        const location = refNoEl.getAttribute('data-job-location') || '';
        const entity = refNoEl.getAttribute('data-job-legal-entity') || '';
        const type = refNoEl.getAttribute('data-job-type') || '';
        const dateStr = refNoEl.getAttribute('data-posting-date') || ''; // format YYYYMMDD
        
        // Form link
        const linkEl = w.querySelector('a.grp-jobfinder__link-jobdescription');
        const href = linkEl ? linkEl.getAttribute('href') : '';
        const url = href ? new URL(href, window.location.origin).href : '';
        
        return { title, location, entity, type, dateStr, url };
      }).filter(Boolean);
    });

    console.log(`Scraped ${jobs.length} total BMW jobs.`);
    if (jobs.length > 0) {
      console.log('Sample scraped jobs:', jobs.slice(0, 5));
      // Save all scraped jobs to a json for debugging
      fs.writeFileSync('scratch/bmw-scraped-raw.json', JSON.stringify(jobs, null, 2), 'utf-8');
      
      // Let's filter for Berlin or Remote
      const berlinJobs = jobs.filter(j => 
        j.location.toLowerCase().includes('berlin') || 
        j.location.toLowerCase().includes('remote')
      );
      console.log(`Found ${berlinJobs.length} BMW jobs in Berlin / Remote.`);
      if (berlinJobs.length > 0) {
        console.log('Berlin/Remote jobs:', berlinJobs);
      }
    }

  } catch (err) {
    console.error('Error during scraping:', err.message);
  } finally {
    await browser.close();
  }
}

run();
