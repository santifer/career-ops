#!/usr/bin/env node

/**
 * check-liveness.mjs — Playwright job link liveness checker
 *
 * Tests whether job posting URLs are still active or have expired.
 * Uses the same detection logic as scan.md step 7.5.
 * Zero Claude API tokens — pure Playwright.
 *
 * Usage:
 *   node check-liveness.mjs <url1> [url2] ...
 *   node check-liveness.mjs --file urls.txt
 *
 * Exit code: 0 if all active, 1 if any expired or uncertain
 */

import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';

const EXPIRED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,           // Greenhouse: "The job you are looking for is no longer open."
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i, // Workday /job/ 404
  /\d+\s+jobs?\s+found/i,           // Workday: landed on listing page ("663 JOBS FOUND") instead of a specific job
  /search for jobs page is loaded/i, // Workday SPA indicator for listing page
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
  /该职位已关闭/i,                  // BOSS Zhipin / Liepin
  /职位已失效/i,                    // BOSS Zhipin
  /停止招聘/i,                      // BOSS Zhipin
  /该职位已下架/i,                  // Liepin
  /职位已关闭/i,                    // General CN
];

// URL patterns that indicate an ATS has redirected away from the job (closed/expired)
const EXPIRED_URL_PATTERNS = [
  /[?&]error=true/i,   // Greenhouse redirect on closed jobs
  /zhipin\.com\/web\/geek\/job/i, // Redirected back to search usually means job inaccessible
];

const APPLY_PATTERNS = [
  /\bapply\b/i,          // catches "Apply", "Apply Now", "Apply for this Job"
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,  // Ashby
  /ich bewerbe mich/i,   // German Greenhouse
  /立即沟通/i,           // BOSS Zhipin
  /立即申请/i,           // Liepin / 51job
];

// Below this length the page is probably just nav/footer (closed ATS page)
const MIN_CONTENT_CHARS = 300;

/**
 * Load cookies for a given URL if available
 */
async function loadCookiesForUrl(context, url) {
  let siteName = '';
  if (url.includes('zhipin.com')) siteName = 'boss';
  else if (url.includes('liepin.com')) siteName = 'liepin';
  else if (url.includes('51job.com')) siteName = '51job';
  
  if (!siteName) return;

  const cookiePath = path.join(process.cwd(), 'data', 'cookies', `${siteName}.json`);
  if (fs.existsSync(cookiePath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    const validCookies = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite === 'None' ? 'None' : (c.sameSite === 'Lax' ? 'Lax' : 'Strict')
    }));
    await context.addCookies(validCookies);
  }
}

async function checkUrl(browser, url) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  });
  
  try {
    await loadCookiesForUrl(context, url);
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const status = response?.status() ?? 0;
    if (status === 404 || status === 410) {
      return { result: 'expired', reason: `HTTP ${status}` };
    }

    // Give SPAs time to hydrate
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    // Special case for BOSS: if we are redirected to the search page, the job is likely gone
    if (url.includes('job_detail') && finalUrl.includes('/web/geek/job')) {
       return { result: 'expired', reason: `redirected to search list` };
    }

    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');

    if (APPLY_PATTERNS.some(p => p.test(bodyText))) {
      return { result: 'active', reason: 'apply button detected' };
    }

    for (const pattern of EXPIRED_PATTERNS) {
      if (pattern.test(bodyText)) {
        return { result: 'expired', reason: `pattern matched: ${pattern.source}` };
      }
    }

    if (bodyText.trim().length < MIN_CONTENT_CHARS) {
      return { result: 'expired', reason: 'insufficient content — likely nav/footer only' };
    }

    return { result: 'uncertain', reason: 'content present but no apply button found' };

  } catch (err) {
    return { result: 'expired', reason: `navigation error: ${err.message.split('\n')[0]}` };
  } finally {
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node check-liveness.mjs <url1> [url2] ...');
    console.error('       node check-liveness.mjs --file urls.txt');
    process.exit(1);
  }

  let urls;
  if (args[0] === '--file') {
    const text = await readFile(args[1], 'utf-8');
    urls = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } else {
    urls = args;
  }

  console.log(`Checking ${urls.length} URL(s)...\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let active = 0, expired = 0, uncertain = 0;

  // Sequential — project rule: never Playwright in parallel
  for (const url of urls) {
    const { result, reason } = await checkUrl(page, url);
    const icon = { active: '✅', expired: '❌', uncertain: '⚠️' }[result];
    console.log(`${icon} ${result.padEnd(10)} ${url}`);
    if (result !== 'active') console.log(`           ${reason}`);
    if (result === 'active') active++;
    else if (result === 'expired') expired++;
    else uncertain++;
  }

  await browser.close();

  console.log(`\nResults: ${active} active  ${expired} expired  ${uncertain} uncertain`);
  if (expired > 0 || uncertain > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
