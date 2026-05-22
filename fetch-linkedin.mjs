import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

async function run() {
  const url = 'https://www.linkedin.com/jobs/view/4414006162/';
  console.log(`Navigating to ${url}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await context.newPage();

  try {
    // Go to the job URL
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for the description to load
    await page.waitForTimeout(5000);

    // Let's get title, company, and JD
    // Title is usually in h1 or specific selectors
    const title = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (h1) return h1.innerText.trim();
      return 'Unknown Title';
    });

    const company = await page.evaluate(() => {
      // Linkedin job view page structures:
      // - .topcard__org-name-link
      // - [data-tracking-control-name="public_jobs_topcard-org-name"]
      // - .jobs-unified-top-card__company-name
      for (const selector of ['.topcard__org-name-link', '[data-tracking-control-name="public_jobs_topcard-org-name"]', '.jobs-unified-top-card__company-name', '.top-card-layout__card a']) {
        const el = document.querySelector(selector);
        if (el) return el.innerText.trim();
      }
      return 'Unknown Company';
    });

    const description = await page.evaluate(() => {
      // selectors for description:
      // - .description__text
      // - .jobs-description__content
      // - .jobs-description
      // - #job-details
      for (const selector of ['.description__text', '.jobs-description__content', '.jobs-description', '#job-details', '.show-more-less-html__markup']) {
        const el = document.querySelector(selector);
        if (el) return el.innerText.trim();
      }
      // Fallback: entire page text
      return document.body.innerText;
    });

    console.log(`Title: ${title}`);
    console.log(`Company: ${company}`);
    console.log(`Description length: ${description.length}`);

    if (!existsSync('jds')) {
      mkdirSync('jds');
    }

    const jdFilePath = join('jds', '4414006162.txt');
    const fullContent = `Company: ${company}\nRole: ${title}\nURL: ${url}\n\n--- Job Description ---\n\n${description}`;
    writeFileSync(jdFilePath, fullContent, 'utf-8');
    console.log(`Saved job description to ${jdFilePath}`);

  } catch (err) {
    console.error('Error fetching job:', err);
    // Write screenshot to see what's happening
    await page.screenshot({ path: 'linkedin-error.png' });
    console.log('Saved error screenshot to linkedin-error.png');
  } finally {
    await browser.close();
  }
}

run();
