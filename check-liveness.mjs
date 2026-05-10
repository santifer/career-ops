#!/usr/bin/env node

import { chromium } from 'playwright';
import sql from './db/client.mjs';

// things that mean the job is probably closed
const EXPIRED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i,
  /\d+\s+jobs?\s+found/i,
  /search for jobs page is loaded/i,
];

const APPLY_PATTERNS = [
  /\bapply\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,
];

async function checkUrl(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const status = response?.status() ?? 0;
    if (status === 404 || status === 410) return { result: 'expired', reason: `HTTP ${status}` };

    // Wait for the page to actually load properly
    // Give SPAs (Ashby, Lever, Workday) time to hydrate
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    const applyControls = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')
      );

      // If we see an apply button, it's definitely alive
      return candidates
        .filter((element) => {
          if (element.closest('nav, header, footer')) return false;
          if (element.closest('[aria-hidden="true"]')) return false;

          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (!element.getClientRects().length) return false;

          return Array.from(element.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
        })
        .map((element) => {
          const label = [
            element.innerText,
            element.value,
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
          ]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          return label;
        })
        .filter(Boolean);
    });

    for (const pattern of EXPIRED_PATTERNS) {
      if (pattern.test(bodyText)) return { result: 'expired', reason: `pattern matched: ${pattern.source}` };
    }

    if (bodyText.trim().length < 300) return { result: 'expired', reason: 'insufficient content' };

    const hasApply = APPLY_PATTERNS.some(p => p.test(applyControls.join(' ')));
    if (hasApply) return { result: 'active', reason: 'apply button found' };

    return { result: 'uncertain', reason: 'content present but no apply button' };
  } catch (err) {
    return { result: 'expired', reason: `navigation error: ${err.message.split('\n')[0]}` };
  }
}

async function main() {
  console.log('🔍 Checking top pending jobs to see if they still exist...');

  const jobs = await sql`
    SELECT id, url, company 
    FROM jobs 
    WHERE id NOT IN (SELECT job_id FROM applications)
    ORDER BY score DESC 
    LIMIT 20
  `;

  if (jobs.length === 0) {
    console.log('  No pending jobs found to check.');
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const job of jobs) {
    const { result, reason } = await checkUrl(page, job.url);
    const icon = { active: '✅', expired: '❌', uncertain: '⚠️' }[result];
    console.log(`${icon} ${result.padEnd(10)} ${job.company.padEnd(15)} | ${job.url}`);
    
    if (result === 'expired') {
      console.log(`           ↳ Deleting ${job.id} from DB: ${reason}`);
      await sql`DELETE FROM jobs WHERE id = ${job.id}`;
    }
  }

  await browser.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
