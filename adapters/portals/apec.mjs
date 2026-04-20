/**
 * Adapter APEC — Playwright tier 2
 *
 * Association Pour l'Emploi des Cadres.
 * Offres cadres et jeunes diplômés, accès public.
 */
import { fetchWithPlaywright } from './_shared.mjs';

// TODO: vérifier les sélecteurs avec une URL réelle fournie par Bertrand
const SELECTORS = {
  title: 'h1[class*="offer-title"], h1[class*="detailOffre"], h1',
  company: '[class*="company-name"], [class*="entreprise"], [data-testid="company"]',
  location: '[class*="location"], [class*="lieu"], [class*="localisation"]',
  contractType: '[class*="contract"], [class*="contrat"], [class*="type-contrat"]',
  salary: '[class*="salary"], [class*="salaire"], [class*="remuneration"]',
  description: '[class*="description"], [class*="detail-offre"], article',
};

async function extractFromPage(page) {
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

/**
 * Extraire une offre APEC depuis une URL publique.
 *
 * @param {string} url - URL publique de l'offre APEC
 * @returns {Promise<{jd: string|null, source: string, fallback?: string, reason?: string}>}
 */
export async function fetch(url) {
  return fetchWithPlaywright(url, extractFromPage, 'APEC');
}
