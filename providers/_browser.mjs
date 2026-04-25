// Playwright transport — lazy-initialized, pooled single browser instance.
// Shared across all providers that opt into transport: browser.
//
// Usage from a provider:
//   import { makeBrowserCtx } from './_browser.mjs';
//   const ctx = makeBrowserCtx();
//   const html = await ctx.fetchText(url);
//
// The browser is launched on first fetch and closed at process exit.

import { fetchJson as httpFetchJson } from './_http.mjs';

const DEFAULT_NAVIGATE_TIMEOUT_MS = 30_000;
let browserPromise = null;

async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    const { chromium } = await import('playwright');
    return await chromium.launch({ headless: true });
  })();
  // Clear the cache if the launch fails so a transient error doesn't poison
  // every later browser-transport entry sharing this module-level promise.
  browserPromise.catch(() => { browserPromise = null; });
  return browserPromise;
}

// Callers must invoke this once they're done — Playwright's IPC handle keeps
// the Node event loop alive, so the process won't exit on its own.
export async function closeBrowser() {
  if (!browserPromise) return;
  const p = browserPromise;
  browserPromise = null;
  try { await (await p).close(); } catch {}
}

async function withPage(fn) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; career-ops/1.3)',
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}

export async function fetchText(url, { timeoutMs = DEFAULT_NAVIGATE_TIMEOUT_MS } = {}) {
  return await withPage(async page => {
    await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
    return await page.content();
  });
}

export async function fetchJson(url, opts = {}) {
  // JSON endpoints rarely need browser transport. Fall back to plain fetch.
  return await httpFetchJson(url, opts);
}

export function makeBrowserCtx() {
  return {
    transport: 'browser',
    fetchText,
    fetchJson,
    withPage,
  };
}
