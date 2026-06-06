import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finding } from '../../findings.mjs';
import { filterByProviders } from '../../registry/antipatterns.mjs';
import { profileFindingsAsync, profileStep, profileStepAsync } from '../../profile/profiler.mjs';
import { captureVisualContrastCandidate } from '../visual/screenshot-contrast.mjs';

async function runVisualContrastFallback(page, serializedGroups, options, profile, target) {
  if (options?.visualContrast === false) return [];
  const maxCandidates = Number.isFinite(options?.visualContrastMaxCandidates)
    ? options.visualContrastMaxCandidates
    : 12;
  const scrollOffscreen = options?.visualContrastScrollOffscreen !== false;
  const existingLowContrastSelectors = new Set(
    serializedGroups
      .filter(group => group.findings?.some(f => f.type === 'low-contrast'))
      .map(group => group.selector)
      .filter(Boolean)
  );

  let browserAnalyses = [];
  const findings = [];
  if (options?.visualContrastBrowser !== false) {
    const browserFindings = await profileFindingsAsync(profile, {
      engine: 'browser',
      phase: 'visual-contrast',
      ruleId: 'browser-fallback',
      target,
    }, async () => {
      browserAnalyses = await page.evaluate(async ({ maxCandidates, scrollOffscreen }) => {
        if (typeof window.impeccableAnalyzeVisualContrast !== 'function') return [];
        return window.impeccableAnalyzeVisualContrast({ maxCandidates, scrollOffscreen });
      }, { maxCandidates, scrollOffscreen });
      return browserAnalyses
        .filter(result => result.finding && !existingLowContrastSelectors.has(result.selector))
        .map(result => result.finding);
    });
    findings.push(...browserFindings);
  }

  let candidates = browserAnalyses.length > 0 ? browserAnalyses : [];
  if (candidates.length === 0) {
    candidates = await profileStepAsync(profile, {
      engine: 'browser',
      phase: 'visual-contrast',
      ruleId: 'collect-candidates',
      target,
    }, () => page.evaluate(({ maxCandidates }) => {
      if (typeof window.impeccableCollectVisualContrastCandidates !== 'function') return [];
      return window.impeccableCollectVisualContrastCandidates({ maxCandidates });
    }, { maxCandidates }));
  }

  const viewport = options?.viewport || { width: 1280, height: 800 };
  const browserResolvedSelectors = new Set(
    browserAnalyses
      .filter(result => result.status === 'fail' || result.status === 'pass')
      .map(result => result.selector)
      .filter(Boolean)
  );
  const filtered = candidates.filter(candidate =>
    !existingLowContrastSelectors.has(candidate.selector) &&
    !browserResolvedSelectors.has(candidate.selector)
  );
  if (options?.visualContrastPixel === false) return findings;
  for (const candidate of filtered) {
    const result = await profileFindingsAsync(profile, {
      engine: 'browser',
      phase: 'visual-contrast',
      ruleId: 'pixel-diff',
      target,
    }, async () => {
      const finding = await captureVisualContrastCandidate(page, candidate, viewport);
      return finding ? [finding] : [];
    });
    findings.push(...result);
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Puppeteer detection (for URLs)
// ---------------------------------------------------------------------------

async function detectUrl(url, options = {}) {
  const profile = options?.profile;
  const waitUntil = options?.waitUntil || 'networkidle0';
  const settleMs = Number.isFinite(options?.settleMs) ? options.settleMs : 0;
  const viewport = options?.viewport || { width: 1280, height: 800 };
  const externalBrowser = options?.browser || null;
  let puppeteer;
  if (!externalBrowser) {
    try {
      puppeteer = await profileStepAsync(profile, {
        engine: 'browser',
        phase: 'setup',
        ruleId: 'import-puppeteer',
        target: url,
      }, () => import('puppeteer'));
    } catch {
      throw new Error('puppeteer is required for URL scanning. Install: npm install puppeteer');
    }
  }

  // Read the browser detection script — reuse it instead of reimplementing
  const browserScriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'detect-antipatterns-browser.js'
  );
  let browserScript;
  try {
    browserScript = profileStep(profile, {
      engine: 'browser',
      phase: 'setup',
      ruleId: 'read-browser-script',
      target: url,
    }, () => fs.readFileSync(browserScriptPath, 'utf-8'));
  } catch {
    throw new Error(`Browser script not found at ${browserScriptPath}`);
  }

  // CI runners (GitHub Actions Ubuntu) block unprivileged user namespaces, so
  // Chrome can't initialize its sandbox there. Disable the sandbox only when
  // running in CI; local users keep the default hardened launch.
  const launchArgs = process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
  const browser = externalBrowser || await profileStepAsync(profile, {
    engine: 'browser',
    phase: 'load',
    ruleId: 'launch-browser',
    target: url,
  }, () => puppeteer.default.launch({ headless: true, args: launchArgs }));
  const page = await profileStepAsync(profile, {
    engine: 'browser',
    phase: 'load',
    ruleId: 'new-page',
    target: url,
  }, () => browser.newPage());
  let results = [];
  try {
    await profileStepAsync(profile, {
      engine: 'browser',
      phase: 'load',
      ruleId: 'set-viewport',
      target: url,
    }, () => page.setViewport(viewport));
    await profileStepAsync(profile, {
      engine: 'browser',
      phase: 'load',
      ruleId: `goto:${waitUntil}`,
      target: url,
    }, () => page.goto(url, { waitUntil, timeout: 30000 }));
    if (settleMs > 0) {
      await profileStepAsync(profile, {
        engine: 'browser',
        phase: 'load',
        ruleId: 'settle',
        target: url,
      }, () => new Promise(resolve => setTimeout(resolve, settleMs)));
    }

    // Inject the browser detection script and collect results
    await profileStepAsync(profile, {
      engine: 'browser',
      phase: 'scan',
      ruleId: 'configure-pure-detect',
      target: url,
    }, () => page.evaluate(() => {
      window.__IMPECCABLE_CONFIG__ = {
        ...(window.__IMPECCABLE_CONFIG__ || {}),
        autoScan: false,
      };
    }));
    await profileStepAsync(profile, {
      engine: 'browser',
      phase: 'scan',
      ruleId: 'inject-browser-script',
      target: url,
    }, () => page.evaluate(browserScript));
    let serializedGroups = [];
    results = await profileFindingsAsync(profile, {
      engine: 'browser',
      phase: 'scan',
      ruleId: 'browser-scan',
      target: url,
    }, async () => {
      serializedGroups = await page.evaluate(() => {
        if (!window.impeccableDetect) return [];
        return window.impeccableDetect({ decorate: false, serialize: true });
      });
      return serializedGroups.flatMap(({ findings }) =>
        findings.map(f => ({ id: f.type, snippet: f.detail }))
      );
    });
    const visualFindings = await runVisualContrastFallback(page, serializedGroups, options, profile, url);
    results.push(...visualFindings);
  } finally {
    await profileStepAsync(profile, {
      engine: 'browser',
      phase: 'load',
      ruleId: 'close-page',
      target: url,
    }, () => page.close().catch(() => {}));
    if (!externalBrowser) {
      await profileStepAsync(profile, {
        engine: 'browser',
        phase: 'load',
        ruleId: 'close-browser',
        target: url,
      }, () => browser.close());
    }
  }
  return filterByProviders(results.map(f => finding(f.id, url, f.snippet)), options.providers);
}

async function createBrowserDetector(options = {}) {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error('puppeteer is required for URL scanning. Install: npm install puppeteer');
  }
  const launchArgs = options.launchArgs || (process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []);
  const browser = options.browser || await puppeteer.default.launch({
    headless: options.headless ?? true,
    args: launchArgs,
  });
  const ownsBrowser = !options.browser;
  const defaults = {
    waitUntil: options.waitUntil || 'load',
    settleMs: Number.isFinite(options.settleMs) ? options.settleMs : 100,
    viewport: options.viewport || { width: 1280, height: 800 },
  };
  return {
    browser,
    async detectUrl(url, scanOptions = {}) {
      return detectUrl(url, {
        ...defaults,
        ...scanOptions,
        browser,
      });
    },
    async close() {
      if (ownsBrowser) await browser.close().catch(() => {});
    },
  };
}

export { runVisualContrastFallback, detectUrl, createBrowserDetector };
