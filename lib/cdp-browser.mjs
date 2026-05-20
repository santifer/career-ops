/**
 * lib/cdp-browser.mjs
 *
 * Connect Playwright to a long-running Chrome instance over CDP.
 *
 * The career-ops daemon profile lives at ~/Library/Application
 * Support/career-ops-chrome-debug/ and is launched via the
 * com.mitchell.career-ops.chrome-debugging plist with
 * --remote-debugging-port=9222. Mitchell logs into LinkedIn once in
 * that profile; from then on every scrape inherits the auth.
 *
 * Why CDP over storage-state:
 *   - storage-state goes stale (LinkedIn rotates session cookies)
 *   - storage-state files break when Mitchell logs in from another device
 *   - CDP uses the live session, so auth never drifts
 *   - No login wall during overnight runs
 *
 * Usage:
 *   import { connectToChromeCDP, isCdpAvailable } from '../lib/cdp-browser.mjs';
 *   const cdp = await connectToChromeCDP();          // throws if unreachable
 *   if (cdp) { ... use cdp.browser, cdp.contextFor(...) ... await cdp.disconnect(); }
 *
 *   // or detect-first
 *   if (await isCdpAvailable()) { ... }
 */

const DEFAULT_PORT = 9222;
const DEFAULT_HOST = '127.0.0.1';
const PROBE_TIMEOUT_MS = 1500;

/**
 * Health probe — hits the JSON version endpoint that DevTools exposes.
 * Returns true if a CDP target is listening at host:port.
 */
export async function isCdpAvailable({ host = DEFAULT_HOST, port = DEFAULT_PORT, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const url = `http://${host}:${port}/json/version`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && j.webSocketDebuggerUrl);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Connect Playwright to the running Chrome instance. Returns:
 *   {
 *     browser,           // Playwright Browser instance (connected over CDP)
 *     defaultContext,    // browser.contexts()[0] (existing tabs are here)
 *     contextFor(opts),  // creates a fresh context inheriting auth from default
 *     disconnect(),      // closes the CDP connection (does NOT close Chrome)
 *   }
 *
 * On the first call we ask Playwright to connect. The returned browser
 * is the live Chrome instance — DO NOT call browser.close() unless you
 * want to kill the whole Chrome process. Use disconnect() instead.
 *
 * Throws if CDP is unreachable. Callers should isCdpAvailable() first
 * or wrap this in a try/catch to fall back to storage-state.
 */
export async function connectToChromeCDP({ host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  const playwright = await import('playwright');
  const wsEndpoint = `http://${host}:${port}`;
  const browser = await playwright.chromium.connectOverCDP(wsEndpoint);

  const contexts = browser.contexts();
  const defaultContext = contexts.length ? contexts[0] : null;

  if (!defaultContext) {
    await browser.close().catch(() => {});
    throw new Error(`CDP connected at ${wsEndpoint} but no contexts were exposed — is Chrome actually running?`);
  }

  return {
    browser,
    defaultContext,
    /**
     * Pull cookies + storageState from defaultContext and spin up a
     * fresh context with them. Use this for scraping so we don't
     * pollute Mitchell's existing tabs.
     *
     * NOTE: connectOverCDP exposes the existing default context but
     * Playwright won't let you create a *new* context on the live
     * browser (no newContext on CDP-connected browser). The standard
     * pattern is to reuse defaultContext and open a fresh page inside
     * it, then close the page when done. We expose a small helper.
     */
    async newPageInDefaultContext({ viewport = { width: 1280, height: 900 } } = {}) {
      const page = await defaultContext.newPage();
      if (viewport) await page.setViewportSize(viewport);
      return page;
    },
    async disconnect() {
      try { await browser.close(); } catch { /* close == disconnect for CDP-connected browsers */ }
    },
  };
}

/**
 * Try CDP first, throw a typed error so callers can fall back.
 */
export class CdpUnavailableError extends Error {
  constructor(msg) { super(msg); this.name = 'CdpUnavailableError'; }
}

export async function connectOrThrow({ host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  if (!(await isCdpAvailable({ host, port }))) {
    throw new CdpUnavailableError(`No CDP listener at http://${host}:${port}/json/version`);
  }
  return connectToChromeCDP({ host, port });
}
