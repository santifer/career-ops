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
import { classifyLiveness } from './liveness-core.mjs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

async function checkUrl(page, url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { result: 'expired', reason: 'Invalid URL protocol' };
  }

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const status = response?.status() ?? 0;

    // Give SPAs (Ashby, Lever, Workday) time to hydrate
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    const applyControls = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')
      );

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

    const postingDate = await page.evaluate(() => {
      // Strategy 1: ld+json schema
      try {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          const data = JSON.parse(script.textContent);
          const findDate = (obj) => {
            if (!obj) return null;
            if (obj['@type'] === 'JobPosting' && obj.datePosted) return obj.datePosted;
            if (Array.isArray(obj)) {
              for (const item of obj) {
                const res = findDate(item);
                if (res) return res;
              }
            }
            if (typeof obj === 'object') {
              if (obj['@graph']) return findDate(obj['@graph']);
            }
            return null;
          };
          const date = findDate(data);
          if (date) return date;
        }
      } catch (e) {}

      // Strategy 2: meta itemProp
      const meta = document.querySelector('meta[itemprop="datePosted"]');
      if (meta && meta.content) return meta.content;

      // Strategy 3: time element with datetime
      const time = document.querySelector('time[datetime]');
      if (time) return time.getAttribute('datetime');

      return null;
    });

    return classifyLiveness({
      status,
      finalUrl,
      bodyText,
      applyControls,
      postingDate,
      staleThresholdDays: 45
    });

  } catch (err) {
    return { result: 'expired', reason: `navigation error: ${err.message.split('\n')[0]}` };
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
    const filePath = resolve(args[1]);
    const rootDir = dirname(fileURLToPath(import.meta.url));
    if (!filePath.startsWith(rootDir)) {
      console.error('Security Error: Path traversal attempt blocked for --file');
      process.exit(1);
    }
    const text = await readFile(filePath, 'utf-8');
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
