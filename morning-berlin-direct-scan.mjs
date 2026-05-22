// morning-berlin-direct-scan.mjs
import fs from 'fs';
import path from 'path';

import dotenv from 'dotenv';
import { chromium } from 'playwright';

// Import providers and shared context
import { makeHttpCtx } from './providers/_http.mjs';
import greenhouseProvider from './providers/greenhouse.mjs';
import ashbyProvider from './providers/ashby.mjs';
import leverProvider from './providers/lever.mjs';

// Load environment variables
dotenv.config();

// Config
const COMPANIES_PATH = 'config/berlin-direct-companies.json';
const OUTPUT_MD = 'scratch/morning-berlin-jobs.md';
const PIPELINE_PATH = 'data/pipeline.md';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const TARGET_COMPANIES = ['BMW', 'Tesla', 'Cariad', 'Delivery Hero', 'Zalando', 'N26'];

const providers = {
  greenhouse: greenhouseProvider,
  ashby: ashbyProvider,
  lever: leverProvider,
};

// Validate if a job title represents a student tech position
function isStudentTechJob(title) {
  const lowerTitle = title.toLowerCase();
  
  // Student keywords
  const studentKeywords = [
    'werkstudent', 'working student', 'intern', 'praktikant', 'praktikum', 
    'student', 'internship', 'thesis', 'masterarbeit', 'bachelorarbeit'
  ];
  
  return studentKeywords.some(kw => lowerTitle.includes(kw));
}

// Validate if a job is ML, Data Science, or Full Stack
function isTargetTechRole(title) {
  const lowerTitle = title.toLowerCase();
  
  const targetRoles = [
    'machine learning', 'ml engineer', 'mlops', 'ai engineer', 'ai/ml',
    'data science', 'data scientist',
    'full stack', 'fullstack', 'full-stack'
  ];
  
  return targetRoles.some(role => lowerTitle.includes(role));
}

// Filter locations to match Berlin or Remote/Germany, excluding other specific German cities.
function isBerlinOrRemote(location) {
  if (!location) return false;
  const lowerLoc = location.toLowerCase();
  
  // Explicitly check for other German cities we want to exclude.
  // If the location specifies one of these other cities, but does NOT mention Berlin or remote, exclude it.
  const otherGermanCities = [
    'munich', 'münchen', 'frankfurt', 'hamburg', 'stuttgart', 'cologne', 'köln',
    'düsseldorf', 'dusseldorf', 'leipzig', 'dresden', 'hanover', 'hannover',
    'nuremberg', 'nürnberg', 'bremen', 'essen', 'duisburg', 'bochum', 'wuppertal',
    'bielefeld', 'bonn', 'karlsruhe', 'mannheim', 'wiesbaden', 'munster', 'münster',
    'garching', 'regensburg', 'dingolfing', 'landshut', 'wackersdorf', 'steinenbronn'
  ];
  
  const hasBerlin = lowerLoc.includes('berlin');
  const hasRemote = lowerLoc.includes('remote') || lowerLoc.includes('home office') || lowerLoc.includes('home-office') || lowerLoc.includes('work from home') || lowerLoc.includes('anywhere') || lowerLoc.includes('worldwide');
  
  // If it explicitly mentions Berlin or Remote, it is allowed
  if (hasBerlin || hasRemote) {
    return true;
  }
  
  // Check if it's generally in Germany (without specifying another city)
  const isGermany = lowerLoc.includes('germany') || lowerLoc.includes('deutschland') || lowerLoc.trim() === 'de';
  
  if (isGermany) {
    // If it mentions Germany/Deutschland but also specifies another excluded city, exclude it.
    const hasOtherCity = otherGermanCities.some(city => lowerLoc.includes(city));
    if (hasOtherCity) {
      return false;
    }
    return true;
  }
  
  return false;
}



// Load previously seen URLs from history and pipeline files
async function loadSeenUrls() {
  const seen = new Set();
  if (fs.existsSync(SCAN_HISTORY_PATH)) {
    const lines = fs.readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }
  if (fs.existsSync(PIPELINE_PATH)) {
    const text = fs.readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }
  return seen;
}

// Concurrency helper
async function runConcurrent(tasks, concurrency) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// BMW Group Career Portal Playwright Scraper
async function scrapeBmwJobs() {
  const url = 'https://www.bmwgroup.jobs/de/de/jobs.html';
  console.log(`[BMW Group] Starting sequential Playwright scan: ${url}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'de-DE',
  });
  const page = await context.newPage();
  const bmwJobs = [];

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('[BMW Group] DOM loaded. Waiting 5s for hydration...');
    await page.waitForTimeout(5000);

    // Accept cookies via shadow DOM or standard selector
    console.log('[BMW Group] Checking for cookie consent banner...');
    try {
      const cookieBtn = page.locator('#uc-btn-accept-banner');
      if (await cookieBtn.isVisible()) {
        await cookieBtn.click();
        await page.waitForTimeout(1000);
        console.log('[BMW Group] Cookies accepted.');
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
    } catch (cookieErr) {
      console.log('[BMW Group] Cookie handling skipped:', cookieErr.message);
    }

    // Locate the search input
    const searchInput = page.locator('input.grp-jobfinder-search');
    if (!await searchInput.isVisible()) {
      throw new Error('Search input not visible after page hydration.');
    }

    console.log('[BMW Group] Typing search keyword "werkstudent"...');
    await searchInput.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await searchInput.fill('werkstudent');
    await page.waitForTimeout(500);

    console.log('[BMW Group] Clicking search icon button...');
    await page.click('button.grp-jobfinder-search-icon');
    await page.waitForTimeout(4000);

    // Click "WEITERE JOBS ANZEIGEN" repeatedly
    console.log('[BMW Group] Expanding all results...');
    let showMoreCount = 0;
    while (true) {
      const showMoreBtn = page.locator('.grp-jobfinder__showmore button');
      if (await showMoreBtn.isVisible() && await showMoreBtn.isEnabled()) {
        console.log(`[BMW Group] Click "Show more" button #${++showMoreCount}...`);
        await showMoreBtn.click();
        await page.waitForTimeout(2500);
      } else {
        break;
      }
    }

    // Extract all postings
    console.log('[BMW Group] Extracting jobs from DOM...');
    const rawJobs = await page.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.grp-jobfinder__wrapper'));
      return wrappers.map(w => {
        const refNoEl = w.querySelector('.grp-jobfinder-cell-refno');
        if (!refNoEl) return null;
        
        const title = refNoEl.getAttribute('data-job-title') || '';
        const location = refNoEl.getAttribute('data-job-location') || '';
        const dateStr = refNoEl.getAttribute('data-posting-date') || '';
        
        const linkEl = w.querySelector('a.grp-jobfinder__link-jobdescription');
        const href = linkEl ? linkEl.getAttribute('href') : '';
        const url = href ? new URL(href, window.location.origin).href : '';
        
        return { title, location, url, dateStr };
      }).filter(Boolean);
    });

    console.log(`[BMW Group] Scraped ${rawJobs.length} total BMW Group job listings.`);

    // Apply filtering
    for (const rj of rawJobs) {
      if (isStudentTechJob(rj.title) && isBerlinOrRemote(rj.location) && isTargetTechRole(rj.title)) {
        bmwJobs.push({
          title: rj.title,
          company: 'BMW Group',
          location: rj.location,
          url: rj.url,
          date: new Date().toISOString().slice(0, 10),
          source: 'bmw-direct'
        });
      }
    }
    console.log(`[BMW Group] Found ${bmwJobs.length} student tech jobs in Berlin/Remote.`);

  } catch (err) {
    console.error(`[BMW Group] Scraper error: ${err.message}`);
  } finally {
    await browser.close();
  }
  return bmwJobs;
}

async function run() {
  console.log(`[${new Date().toISOString()}] Starting Morning Berlin Direct Scan...`);
  
  if (!fs.existsSync(COMPANIES_PATH)) {
    console.error(`Error: Companies configuration file not found at ${COMPANIES_PATH}`);
    process.exit(1);
  }
  
  const companies = JSON.parse(fs.readFileSync(COMPANIES_PATH, 'utf-8'));
  const seenUrls = await loadSeenUrls();
  const httpCtx = makeHttpCtx();

  // Create tasks for Greenhouse, Ashby, and Lever API scraping
  const tasks = companies.map(company => async () => {
    const providerObj = providers[company.provider];
    if (!providerObj) {
      console.warn(`[WARN] Unknown provider "${company.provider}" for ${company.name}`);
      return [];
    }
    
    try {
      // Normalize entry structure so it works with provider expectations
      const normalized = { ...company, careers_url: company.url };
      const rawJobs = await providerObj.fetch(normalized, httpCtx);
      
      const filtered = [];
      for (const rj of rawJobs) {
        if (rj.url && isStudentTechJob(rj.title) && isBerlinOrRemote(rj.location) && isTargetTechRole(rj.title)) {
          filtered.push({
            title: rj.title,
            company: rj.company,
            location: rj.location,
            url: rj.url,
            date: new Date().toISOString().slice(0, 10),
            source: `${company.provider}-api`
          });
        }
      }
      return filtered;
    } catch (err) {
      console.warn(`[WARN] Failed to scan ${company.name} (${company.provider}): ${err.message}`);
      return [];
    }
  });

  // Run ATS API scans concurrently
  console.log(`Scanning ${companies.length} direct ATS portals with concurrency of 10...`);
  const atsResults = await runConcurrent(tasks, 10);
  const atsJobs = atsResults.flat();
  console.log(`Finished ATS scans. Extracted ${atsJobs.length} potential matching jobs.`);

  // Run BMW Group careers site Playwright scan sequentially
  const bmwJobs = await scrapeBmwJobs();

  // Compile and deduplicate
  const allJobs = [...atsJobs, ...bmwJobs];
  const newJobs = [];

  for (const job of allJobs) {
    if (job.url && !seenUrls.has(job.url)) {
      newJobs.push(job);
      seenUrls.add(job.url);
    }
  }

  console.log(`Extracted ${newJobs.length} new, unique direct/BMW software/tech jobs.`);

  if (newJobs.length > 0) {
    // Ensure scratch directory exists
    const scratchDir = path.dirname(OUTPUT_MD);
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    // 1. Save local markdown report
    let markdown = `# 🌅 Morning Berlin Direct & BMW Jobs - ${new Date().toLocaleDateString()}\n\n`;
    markdown += `Generated at: **${new Date().toLocaleTimeString()}**\n`;
    markdown += `Found **${newJobs.length}** new Werkstudent positions in Berlin/Remote via direct job boards and BMW Group:\n\n`;
    markdown += `| Company | Role | Location | Source | Link |\n`;
    markdown += `| :--- | :--- | :--- | :--- | :--- |\n`;
    
    newJobs.forEach(job => {
      const isTarget = TARGET_COMPANIES.some(tc => job.company.toLowerCase().includes(tc.toLowerCase()));
      const companyDisplay = isTarget ? `🚨 **${job.company} (TARGET)**` : `**${job.company}**`;
      const cleanCompanyMD = companyDisplay.replace(/\|/g, '-');
      const cleanTitleMD = job.title.replace(/\|/g, '-');
      const cleanLocationMD = job.location.replace(/\|/g, '-');
      markdown += `| ${cleanCompanyMD} | ${cleanTitleMD} | ${cleanLocationMD} | \`${job.source}\` | [View Job](${job.url}) |\n`;
    });
    
    fs.writeFileSync(OUTPUT_MD, markdown, 'utf8');
    console.log(`Saved report to ${OUTPUT_MD}`);

    // 2. Append to career-ops pipeline.md under '## Pendientes'
    let pipelineText = fs.readFileSync(PIPELINE_PATH, 'utf-8');
    const marker = '## Pendientes';
    const insertIdx = pipelineText.indexOf(marker);

    if (insertIdx !== -1) {
      const afterMarker = insertIdx + marker.length;
      const newLines = '\n' + newJobs.map(j => {
        const cleanCompanyPipe = j.company.replace(/\|/g, '-');
        const cleanTitlePipe = j.title.replace(/\|/g, '-');
        return `- [ ] ${j.url} | ${cleanCompanyPipe} | ${cleanTitlePipe}`;
      }).join('\n') + '\n';
      pipelineText = pipelineText.slice(0, afterMarker) + newLines + pipelineText.slice(afterMarker);
      fs.writeFileSync(PIPELINE_PATH, pipelineText, 'utf-8');
      console.log(`Appended roles to ${PIPELINE_PATH}`);
    }

    // 3. Append to scan-history.tsv to prevent future duplicates
    if (!fs.existsSync(SCAN_HISTORY_PATH)) {
      fs.writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n', 'utf-8');
    }
    const tsvLines = newJobs.map(j => {
      const cleanUrl = j.url.replace(/\t|\r|\n/g, ' ');
      const cleanDate = j.date.replace(/\t|\r|\n/g, ' ');
      const cleanSource = j.source.replace(/\t|\r|\n/g, ' ');
      const cleanTitle = j.title.replace(/\t|\r|\n/g, ' ');
      const cleanCompany = j.company.replace(/\t|\r|\n/g, ' ');
      const cleanLocation = j.location.replace(/\t|\r|\n/g, ' ');
      return `${cleanUrl}\t${cleanDate}\t${cleanSource}\t${cleanTitle}\t${cleanCompany}\tadded\t${cleanLocation}`;
    }).join('\n') + '\n';
    fs.appendFileSync(SCAN_HISTORY_PATH, tsvLines, 'utf-8');
    console.log('Appended to scan history.');

    // 4. Save Excel-compatible CSV reports (latest + historical daily)
    if (!fs.existsSync('output')) {
      fs.mkdirSync('output', { recursive: true });
    }
    
    const csvHeader = 'Company,Title,Location,URL,Date,Source\n';
    const csvRows = newJobs.map(j => {
      const cleanCompany = `"${j.company.replace(/"/g, '""')}"`;
      const cleanTitle = `"${j.title.replace(/"/g, '""')}"`;
      const cleanLocation = `"${j.location.replace(/"/g, '""')}"`;
      const cleanUrl = `"${j.url.replace(/"/g, '""')}"`;
      const cleanDate = `"${j.date}"`;
      const cleanSource = `"${j.source}"`;
      return `${cleanCompany},${cleanTitle},${cleanLocation},${cleanUrl},${cleanDate},${cleanSource}`;
    }).join('\n');
    
    const csvContent = csvHeader + csvRows + '\n';
    
    // Save primary "latest" file
    fs.writeFileSync('output/morning-berlin-jobs.csv', csvContent, 'utf8');
    console.log('Saved latest CSV report to output/morning-berlin-jobs.csv');

    // Save historical backup file
    const dailyDir = 'output/berlin-jobs-daily';
    if (!fs.existsSync(dailyDir)) {
      fs.mkdirSync(dailyDir, { recursive: true });
    }
    const todayDate = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(dailyDir, `morning-berlin-jobs-${todayDate}.csv`), csvContent, 'utf8');
    console.log(`Saved daily backup CSV report to output/berlin-jobs-daily/morning-berlin-jobs-${todayDate}.csv`);


  } else {
    console.log('No new jobs found this morning.');
  }

  console.log(`[${new Date().toISOString()}] Scan completed successfully.`);
}

run();
