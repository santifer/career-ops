import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function scrapeGoogle(page) {
  const companies = [];
  const url = 'https://www.google.com/search?q=site:linkedin.com/company/+%22Berlin%22&num=100';
  console.log(`Navigating to Google Search: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Handle Google Consent Page if it shows up
    const consentButton = await page.$('button:has-text("Accept all"), button:has-text("Alles akzeptieren"), button:has-text("I agree")');
    if (consentButton) {
      console.log('Google consent screen detected. Clicking "Accept all"...');
      await consentButton.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    }
    
    // Extract results
    const results = await page.evaluate(() => {
      const items = [];
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (href && href.includes('linkedin.com/company/')) {
          // Find the heading or text inside or nearby
          let title = '';
          const h3 = link.querySelector('h3');
          if (h3) {
            title = h3.innerText;
          } else {
            title = link.innerText;
          }
          
          if (title) {
            items.push({ href, title });
          }
        }
      }
      return items;
    });
    
    console.log(`Google Search found ${results.length} LinkedIn company links.`);
    
    for (const item of results) {
      // Clean company name from title
      // Google titles look like: "Company Name - Berlin - LinkedIn" or "Company Name | LinkedIn"
      let name = item.title
        .replace(/ - Berlin.*$/i, '')
        .replace(/ \| LinkedIn/i, '')
        .replace(/ - LinkedIn/i, '')
        .replace(/: Overview \| LinkedIn/i, '')
        .replace(/: Company Profile \| LinkedIn/i, '')
        .trim();
        
      // Clean URL (remove Google search params if any)
      let companyUrl = item.href;
      if (companyUrl.includes('google.com/url?q=')) {
        const match = companyUrl.match(/url\?q=([^&]+)/);
        if (match) {
          companyUrl = decodeURIComponent(match[1]);
        }
      }
      companyUrl = companyUrl.split('?')[0];
      
      // Extract the slug from URL to deduplicate
      const slugMatch = companyUrl.match(/linkedin\.com\/company\/([^/]+)/);
      const slug = slugMatch ? slugMatch[1] : null;
      
      if (name && slug && !name.includes('google.com') && name.length > 1) {
        companies.push({ name, url: companyUrl, slug });
      }
    }
  } catch (err) {
    console.error('Error scraping Google:', err.message);
  }
  
  return companies;
}

async function scrapeLinkedInJobs(page) {
  const companies = [];
  // Use a broad search on LinkedIn Jobs for Berlin
  const url = 'https://www.linkedin.com/jobs/search/?location=Berlin%2C%20Germany';
  console.log(`Navigating to LinkedIn Jobs: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Scroll down multiple times to load more cards
    console.log('Scrolling to load more jobs...');
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(1000);
    }
    
    // Extract company cards
    const jobCompanies = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('.jobs-search__results-list li');
      for (const card of cards) {
        const companyEl = card.querySelector('.base-search-card__subtitle');
        const linkEl = card.querySelector('.base-search-card__subtitle a');
        if (companyEl) {
          const name = companyEl.innerText.trim();
          const href = linkEl ? linkEl.getAttribute('href') : null;
          items.push({ name, href });
        }
      }
      return items;
    });
    
    console.log(`LinkedIn Jobs found ${jobCompanies.length} company references.`);
    
    for (const item of jobCompanies) {
      if (item.name) {
        let companyUrl = item.href || '';
        if (companyUrl) {
          companyUrl = companyUrl.split('?')[0];
        }
        const slugMatch = companyUrl.match(/linkedin\.com\/company\/([^/]+)/);
        const slug = slugMatch ? slugMatch[1] : item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        companies.push({ name: item.name, url: companyUrl, slug });
      }
    }
  } catch (err) {
    console.error('Error scraping LinkedIn Jobs:', err.message);
  }
  
  return companies;
}

// Read existing local companies
function getLocalCompanies() {
  const localList = [];
  const pipelinePath = 'data/pipeline.md';
  const scanHistoryPath = 'data/scan-history.tsv';
  const jsonPath = 'scratch/linkedin-search-results.json';
  
  const seen = new Set();
  
  const addCompany = (name) => {
    const clean = name.trim();
    if (!clean || clean === '---' || clean.startsWith('http') || clean.includes('[')) return;
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      const slug = lower.replace(/[^a-z0-9]+/g, '-');
      localList.push({ name: clean, url: `https://www.linkedin.com/company/${slug}`, slug });
    }
  };

  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      for (const item of data) {
        if (item.company) addCompany(item.company);
      }
    } catch (e) {}
  }
  
  if (fs.existsSync(scanHistoryPath)) {
    try {
      const lines = fs.readFileSync(scanHistoryPath, 'utf-8').split('\n');
      for (const line of lines.slice(1)) {
        const parts = line.split('\t');
        if (parts.length >= 5 && parts[4]) {
          addCompany(parts[4]);
        }
      }
    } catch (e) {}
  }
  
  if (fs.existsSync(pipelinePath)) {
    try {
      const text = fs.readFileSync(pipelinePath, 'utf-8');
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('|')) {
          const parts = line.split('|');
          if (parts.length >= 2) {
            addCompany(parts[1]);
          }
        }
      }
    } catch (e) {}
  }
  
  return localList;
}

async function run() {
  console.log('Initializing browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await context.newPage();
  
  let allCompanies = [];
  
  // 1. Get existing companies
  const localList = getLocalCompanies();
  console.log(`Loaded ${localList.length} companies from local tracker histories.`);
  allCompanies.push(...localList);
  
  // 2. Scrape Google for LinkedIn companies
  const googleList = await scrapeGoogle(page);
  allCompanies.push(...googleList);
  
  // 3. Scrape LinkedIn jobs page
  const linkedInList = await scrapeLinkedInJobs(page);
  allCompanies.push(...linkedInList);
  
  await browser.close();
  
  // Deduplicate by slug
  const uniqueCompanies = [];
  const seenSlugs = new Set();
  
  // Sort or prioritize entries that have a valid URL
  allCompanies.sort((a, b) => {
    if (a.url && !b.url) return -1;
    if (!a.url && b.url) return 1;
    return a.name.localeCompare(b.name);
  });
  
  for (const item of allCompanies) {
    if (item.slug && !seenSlugs.has(item.slug)) {
      seenSlugs.add(item.slug);
      uniqueCompanies.push({
        name: item.name,
        url: item.url || `https://www.linkedin.com/company/${item.slug}`
      });
    }
  }
  
  // Sort alphabetically by name
  uniqueCompanies.sort((a, b) => a.name.localeCompare(b.name));
  
  console.log(`Total unique Berlin companies found: ${uniqueCompanies.length}`);
  
  // Save to JSON
  const outputJson = 'scratch/berlin-companies-scraped.json';
  fs.writeFileSync(outputJson, JSON.stringify(uniqueCompanies, null, 2), 'utf-8');
  console.log(`Saved JSON list to ${outputJson}`);
  
  // Save to Markdown table
  const outputMd = 'scratch/berlin-companies-scraped.md';
  let mdContent = `# 🏢 Berlin Companies on LinkedIn\n\n`;
  mdContent += `Total Companies Scraped: **${uniqueCompanies.length}**\n\n`;
  mdContent += `| # | Company Name | LinkedIn Profile Link |\n`;
  mdContent += `| :--- | :--- | :--- |\n`;
  
  uniqueCompanies.forEach((c, index) => {
    mdContent += `| ${index + 1} | **${c.name}** | [Profile Link](${c.url}) |\n`;
  });
  
  fs.writeFileSync(outputMd, mdContent, 'utf-8');
  console.log(`Saved Markdown list to ${outputMd}`);
}

run();
