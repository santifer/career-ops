/**
 * Adapter Welcome to the Jungle — Playwright tier 2
 *
 * Portail tech/startup très populaire en France.
 */
import { fetchWithPlaywright } from './_shared.mjs';

// TODO: vérifier les sélecteurs avec une URL réelle fournie par Bertrand
const SELECTORS = {
  title: 'h2[class*="sc-"], h1[class*="title"], [data-testid="job-title"], h1',
  company: '[class*="company-name"], [data-testid="company-name"], a[href*="/companies/"]',
  location: '[class*="location"], [class*="city"], [data-testid="job-location"]',
  contractType: '[class*="contract"], [class*="type"], [data-testid="contract-type"]',
  salary: '[class*="salary"], [class*="remuneration"]',
  description: '[class*="description"], [data-testid="job-description"], [class*="content"]',
};

async function extractFromPage(page) {
  // WTTJ utilise du lazy loading — attendre que le contenu soit chargé
  await page.waitForSelector(SELECTORS.title, { timeout: 10000 }).catch(() => {});

  return page.evaluate((sel) => {
    const getText = (selector) => {
      const el = document.querySelector(selector);
      return el ? el.textContent.trim() : null;
    };

    return {
      title: getText(sel.title),
      company: getText(sel.company),
      location: getText(sel.location),
      contractType: getText(sel.contractType),
      salary: getText(sel.salary),
      description: getText(sel.description),
    };
  }, SELECTORS);
}

export async function fetch(url) {
  return fetchWithPlaywright(url, extractFromPage, 'Welcome to the Jungle');
}
