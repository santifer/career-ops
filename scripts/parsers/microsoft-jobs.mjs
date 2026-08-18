// Microsoft careers local parser — the apply.careers.microsoft.com board is a
// client-rendered SPA with no public JSON API reachable from our network, so we
// scrape job links with Playwright (same approach as _ms-hrefs.tmp.mjs).
// Prints jobs-json-v1: [{ title, url, location }].
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const CAREER_OPS = 'E:/Opencode/career-lens/career-lens';
const { LIVENESS_CONTEXT_OPTIONS } = await import(pathToFileURL(join(CAREER_OPS, 'liveness-browser.mjs')).href);

const START = process.env.MS_SCAN_START || '0';
const MAX_PAGES = parseInt(process.env.MS_SCAN_MAX_PAGES || '10', 10); // 20 results/page

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext(LIVENESS_CONTEXT_OPTIONS);
const page = await ctx.newPage();
const jobs = [];
const seen = new Set();

try {
  for (let p = 0; p < MAX_PAGES; p++) {
    const start = parseInt(START, 10) + p * 20;
    const url = `https://apply.careers.microsoft.com/careers?location=India%2C%20Telangana%2C%20Hyderabad&start=${start}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);

    const pageJobs = await page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href || '';
        const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (/\/careers\/job\//.test(href) || /\/careers\/detail\//.test(href) || /apply\.careers\.microsoft\.com\/careers\/[0-9]/.test(href)) {
          out.push({ title: label, url: href });
        }
      }
      return out;
    });

    if (!pageJobs.length) break;
    let fresh = 0;
    for (const j of pageJobs) {
      if (seen.has(j.url)) continue;
      seen.add(j.url);
      fresh++;
      // title format: "<Role><location line>Posted <n> ago" — split role from location
      const m = j.title.match(/^(.*?)((?:India|Karnataka|Telangana)[\s\S]*)$/);
      const role = m ? m[1].trim() : j.title;
      const locPart = m ? m[2] : '';
      const locMatch = locPart.match(/^(India[^P]*?)(Posted.*)?$/);
      jobs.push({ title: role, url: j.url, location: locMatch ? locMatch[1].trim() : locPart.trim() });
    }
    if (fresh === 0) break;
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(jobs));
