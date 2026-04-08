/**
 * Career-Ops CLI - Job Description Scraper
 * Fetches job descriptions from various job portals
 */

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

export class JobScraper {
  constructor() {
    this.timeout = 10000;
  }
  
  async fetch(url) {
    // Normalize URL
    if (!url.startsWith('http')) {
      throw new Error(`Invalid URL: ${url}. Must start with http:// or https://`);
    }
    
    // Try Playwright first (best for SPAs like Ashby, Lever, Greenhouse)
    try {
      console.log('🔍 Trying Playwright...');
      const content = await this.fetchWithPlaywright(url);
      if (content && content.length > 200) {
        return content;
      }
    } catch (e) {
      console.log(`   Playwright failed: ${e.message}`);
    }
    
    // Try simple fetch (for static sites)
    try {
      console.log('🔍 Trying direct fetch...');
      const content = await this.fetchWithFetch(url);
      if (content && content.length > 200) {
        return content;
      }
    } catch (e) {
      console.log(`   Fetch failed: ${e.message}`);
    }
    
    // Both failed
    throw new Error(
      `Cannot fetch job description from ${url}.\n` +
      `This site may block automated access.\n` +
      `\nWorkaround: Copy the job description manually and save to a file, then run:\n` +
      `  career-ops evaluate <file.txt>`
    );
  }
  
  async fetchWithPlaywright(url) {
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Set user agent to avoid detection
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      // Navigate with timeout
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: this.timeout 
      });
      
      // Wait for content to load
      await page.waitForTimeout(2000);
      
      // Try to extract job description using common selectors
      const content = await page.evaluate(() => {
        const selectors = [
          // Ashby
          '[data-testid="jobDescriptionText"]',
          // Greenhouse
          '.job-description',
          '.jobDescriptionContent',
          // Lever
          '[data-qa="job-description"]',
          '.posting-description',
          // Workday
          '[data-automation-id="jobPostingDescription"]',
          // LinkedIn
          '.description',
          '.show-more-less-html__markup',
          // Indeed
          '#jobDescriptionText',
          // Generic
          '[class*="job-description"]',
          '[class*="jobDescription"]',
          'article',
          'main',
          '.description'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.innerText?.trim();
            if (text && text.length > 200) {
              return text;
            }
          }
        }
        
        // Fallback: return visible text from body
        return document.body.innerText?.slice(0, 15000);
      });
      
      return content;
    } finally {
      await browser.close();
    }
  }
  
  async fetchWithFetch(url) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style, nav, footer, header').remove();
    
    // Try to find job description
    const selectors = [
      'meta[name="description"]',
      '[property="og:description"]',
      'article',
      'main',
      '.job-description',
      '.description',
      '#job-description',
      '.content'
    ];
    
    for (const selector of selectors) {
      const el = $(selector);
      if (el.length) {
        const text = selector.includes('meta') ? el.attr('content') : el.text();
        if (text && text.length > 200) {
          return text.trim().slice(0, 15000);
        }
      }
    }
    
    // Fallback: return body text
    return $('body').text().trim().slice(0, 15000);
  }
}
