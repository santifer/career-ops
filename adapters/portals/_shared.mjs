/**
 * Utilitaires partagés pour les adapters Playwright tier 2.
 *
 * Fournit : robots.txt check, rate limiting, cache local, browser singleton.
 * Utilisé par : apec.mjs, welcometothejungle.mjs, hellowork.mjs, jobijoba.mjs, regionsjob.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const USER_AGENT = 'career-ops-fr/1.0 (+https://github.com/atoox-git/career-ops-fr)';
const RATE_LIMIT_MS = 3000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_DIR = join(process.cwd(), 'cache');

// Timestamps du dernier appel par domaine
const lastRequestByDomain = new Map();

// Cache robots.txt par domaine
const robotsCache = new Map();

/**
 * Extraire le domaine d'une URL.
 */
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Vérifier le fichier robots.txt d'un domaine.
 * Retourne true si l'accès est autorisé, false si Disallow.
 *
 * @param {string} url - URL à vérifier
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function checkRobotsTxt(url) {
  const domain = getDomain(url);
  const parsedUrl = new URL(url);

  if (robotsCache.has(domain)) {
    return robotsCache.get(domain);
  }

  try {
    const robotsUrl = `${parsedUrl.protocol}//${domain}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Pas de robots.txt = tout est autorisé
      const result = { allowed: true };
      robotsCache.set(domain, result);
      return result;
    }

    const text = await res.text();
    const path = parsedUrl.pathname;

    // Parsing simplifié : chercher Disallow pour User-agent: *
    const lines = text.split('\n');
    let inWildcard = false;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.startsWith('user-agent:')) {
        inWildcard = trimmed.includes('*');
      }
      if (inWildcard && trimmed.startsWith('disallow:')) {
        const disallowed = trimmed.replace('disallow:', '').trim();
        if (disallowed && path.startsWith(disallowed)) {
          const result = { allowed: false, reason: `robots.txt Disallow: ${disallowed}` };
          robotsCache.set(domain, result);
          return result;
        }
      }
    }

    const result = { allowed: true };
    robotsCache.set(domain, result);
    return result;
  } catch {
    // Timeout ou erreur réseau = autoriser (fail-open)
    const result = { allowed: true };
    robotsCache.set(domain, result);
    return result;
  }
}

/**
 * Appliquer le rate limit pour un domaine.
 * Attend le temps nécessaire avant de continuer.
 *
 * @param {string} domain - Nom de domaine
 */
export async function enforceRateLimit(domain) {
  const last = lastRequestByDomain.get(domain) || 0;
  const elapsed = Date.now() - last;

  if (elapsed < RATE_LIMIT_MS) {
    const waitMs = RATE_LIMIT_MS - elapsed;
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  lastRequestByDomain.set(domain, Date.now());
}

/**
 * Récupérer une JD depuis le cache local.
 *
 * @param {string} url - URL de l'offre
 * @returns {string|null} JD en markdown ou null si absent/expiré
 */
export function getCachedJD(url) {
  const domain = getDomain(url);
  const hash = createHash('md5').update(url).digest('hex');
  const cacheFile = join(CACHE_DIR, domain, `${hash}.json`);

  if (!existsSync(cacheFile)) return null;

  try {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf-8'));
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached.jd;
  } catch {
    return null;
  }
}

/**
 * Stocker une JD dans le cache local.
 *
 * @param {string} url - URL de l'offre
 * @param {string} jd - JD en markdown
 */
export function setCachedJD(url, jd) {
  const domain = getDomain(url);
  const hash = createHash('md5').update(url).digest('hex');
  const domainDir = join(CACHE_DIR, domain);

  if (!existsSync(domainDir)) {
    mkdirSync(domainDir, { recursive: true });
  }

  const cacheFile = join(domainDir, `${hash}.json`);
  writeFileSync(cacheFile, JSON.stringify({ url, jd, timestamp: Date.now() }), 'utf-8');
}

/**
 * Obtenir une instance Playwright (singleton).
 * Lance Chromium une seule fois, réutilise ensuite.
 */
let browserInstance = null;

export async function getBrowser() {
  if (browserInstance) return browserInstance;

  const { chromium } = await import('playwright');
  browserInstance = await chromium.launch({ headless: true });
  return browserInstance;
}

/**
 * Créer une nouvelle page avec le User-Agent career-ops-fr.
 *
 * @returns {Promise<import('playwright').Page>}
 */
export async function newPage() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'fr-FR',
  });
  return context.newPage();
}

/**
 * Fermer le browser Playwright proprement.
 */
export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Pattern commun pour extraire une JD depuis un portail tier 2.
 *
 * @param {string} url - URL de l'offre
 * @param {Function} extractFn - Fonction d'extraction (reçoit la page Playwright, retourne un objet)
 * @param {string} portalName - Nom du portail (pour les logs)
 * @returns {Promise<{jd: string, source: string}>}
 */
export async function fetchWithPlaywright(url, extractFn, portalName) {
  // 1. Vérifier le cache
  const cached = getCachedJD(url);
  if (cached) {
    return { jd: cached, source: `${portalName} (cache)` };
  }

  // 2. Vérifier robots.txt
  const robotsCheck = await checkRobotsTxt(url);
  if (!robotsCheck.allowed) {
    return {
      jd: null,
      source: portalName,
      fallback: 'paste-manually',
      reason: robotsCheck.reason,
    };
  }

  // 3. Rate limiting
  const domain = getDomain(url);
  await enforceRateLimit(domain);

  // 4. Naviguer et extraire
  const page = await newPage();
  try {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    const data = await extractFn(page);

    if (!data || !data.title) {
      return {
        jd: null,
        source: portalName,
        fallback: 'paste-manually',
        reason: 'Extraction échouée — sélecteurs obsolètes ?',
      };
    }

    // 5. Normaliser en JD markdown
    const jd = formatExtractedJD(data, portalName, url);

    // 6. Mettre en cache
    setCachedJD(url, jd);

    return { jd, source: portalName };
  } finally {
    await page.close();
  }
}

/**
 * Formater les données extraites en JD markdown.
 */
function formatExtractedJD(data, portalName, url) {
  const lines = [];

  lines.push(`# ${data.title}`);
  lines.push('');
  if (data.company) lines.push(`**Entreprise :** ${data.company}`);
  if (data.location) lines.push(`**Localisation :** ${data.location}`);
  if (data.contractType) lines.push(`**Contrat :** ${data.contractType}`);
  if (data.salary) lines.push(`**Salaire :** ${data.salary}`);
  lines.push('');

  if (data.description) {
    lines.push('## Description');
    lines.push('');
    lines.push(data.description);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Source : ${portalName} — ${url}*`);

  return lines.join('\n');
}

export { USER_AGENT, RATE_LIMIT_MS, getDomain };
