// scratch/run-bmw-flow-fixed.mjs
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
    console.log('DOM loaded. Waiting 5s for hydration...');
    await page.waitForTimeout(5000);

    // Accept cookies if usercentrics or accept buttons are present
    console.log('Checking for cookie consent buttons...');
    try {
      const cookieBtn = page.locator('#uc-btn-accept-banner');
      if (await cookieBtn.isVisible()) {
        await cookieBtn.click();
        await page.waitForTimeout(1000);
        console.log('Cookies accepted via id.');
      } else {
        await page.evaluate(() => {
          const usercentrics = document.getElementById('usercentrics-root');
          if (usercentrics && usercentrics.shadowRoot) {
            const acceptBtn = usercentrics.shadowRoot.querySelector('button[data-testid="uc-accept-all-button"]');
            if (acceptBtn) acceptBtn.click();
          }
        });
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      console.log('No cookie banner or click failed:', e.message);
    }

    // Locate the search input
    const searchInput = page.locator('input.grp-jobfinder-search');
    if (!await searchInput.isVisible()) {
      throw new Error('Search input not visible after hydration.');
    }

    console.log('Typing search keyword "werkstudent"...');
    await searchInput.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await searchInput.fill('werkstudent');
    await page.waitForTimeout(500);

    console.log('Clicking the search icon button...');
    await page.click('button.grp-jobfinder-search-icon');
    await page.waitForTimeout(4000);

    // Load all jobs by clicking "WEITERE JOBS ANZEIGEN" repeatedly
    console.log('Clicking "WEITERE JOBS ANZEIGEN" repeatedly to load all results...');
    let showMoreCount = 0;
    while (true) {
      const showMoreBtn = page.locator('.grp-jobfinder__showmore button');
      if (await showMoreBtn.isVisible() && await showMoreBtn.isEnabled()) {
        console.log(`Clicking show more button (count: ${++showMoreCount})...`);
        await showMoreBtn.click();
        await page.waitForTimeout(2500);
      } else {
        console.log('No more "show more" button visible or enabled.');
        break;
      }
    }

    // Scrape all jobs from the page
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
      fs.writeFileSync('scratch/bmw-scraped-raw.json', JSON.stringify(jobs, null, 2), 'utf-8');
      
      const berlinJobs = jobs.filter(j => 
        j.location.toLowerCase().includes('berlin') || 
        j.location.toLowerCase().includes('remote')
      );
      console.log(`Found ${berlinJobs.length} BMW jobs in Berlin / Remote.`);
      if (berlinJobs.length > 0) {
        console.log('Berlin/Remote jobs:', berlinJobs);
      }
    } else {
      console.log('No jobs matched wrapper class.');
    }

  } catch (err) {
    console.error('Error during scraping:', err.message);
  } finally {
    await browser.close();
  }
}

run();
