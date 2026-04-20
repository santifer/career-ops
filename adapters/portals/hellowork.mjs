/**
 * Adapter HelloWork — Playwright tier 2
 *
 * Groupe HelloWork (ex-RegionsJob). Portail généraliste.
 */
import { fetchWithPlaywright } from './_shared.mjs';

// TODO: vérifier les sélecteurs avec une URL réelle fournie par Bertrand
const SELECTORS = {
  title: 'h1[class*="offer"], h1[class*="title"], h1',
  company: '[class*="company"], [class*="entreprise"], [class*="recruteur"]',
  location: '[class*="location"], [class*="lieu"], [class*="localisation"]',
  contractType: '[class*="contract"], [class*="contrat"]',
  salary: '[class*="salary"], [class*="salaire"]',
  description: '[class*="description"], [class*="detail"], [class*="annonce"]',
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

export async function fetch(url) {
  return fetchWithPlaywright(url, extractFromPage, 'HelloWork');
}
