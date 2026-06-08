/**
 * workday-scraper.mjs
 * Scrapes fresh job postings from Workday ATS instances defined in data/workday-sites.json.
 *
 * Mode A — With credentials (username/password set): log in, then search.
 * Mode B — Without credentials (FILL_IN): skip login, scan as guest.
 *
 * Usage:
 *   node workday-scraper.mjs [--hours 8] [--output data/workday-jobs.json]
 *
 * Defaults: hours=8, output=data/workday-jobs.json
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(flag, defaultVal) {
  const eqIdx = argv.findIndex(a => a.startsWith(flag + '='));
  if (eqIdx !== -1) return argv[eqIdx].split('=').slice(1).join('=');
  const spaceIdx = argv.indexOf(flag);
  if (spaceIdx !== -1 && argv[spaceIdx + 1]) return argv[spaceIdx + 1];
  return defaultVal;
}

const HOURS  = parseInt(getArg('--hours',  '8'),  10);
const OUTPUT = getArg('--output', 'data/workday-jobs.json');

// ── Logging ───────────────────────────────────────────────────────────────────

const LOG_PATH = path.join(__dirname, 'data', 'pipeline.log');

function log(msg) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [workday-scraper] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch { /* ignore log failures */ }
}

// ── Config loading ────────────────────────────────────────────────────────────

function loadSites() {
  const sitesPath = path.join(__dirname, 'data', 'workday-sites.json');
  if (!fs.existsSync(sitesPath)) {
    log('ERROR: data/workday-sites.json not found');
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
  } catch (e) {
    log(`ERROR: failed to parse workday-sites.json: ${e.message}`);
    process.exit(1);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when a credential field has been filled in (not the placeholder) */
function isFilledIn(val) {
  return typeof val === 'string' && val.trim() !== '' && val.trim() !== 'FILL_IN';
}

/**
 * Determine whether a Workday "posted" string falls within the hours window.
 * Workday shows: "Posted Today", "Posted X days ago", "Posted X hours ago", or a date.
 * When the text is unrecognised we include the job (don't drop uncertain ones).
 */
function isFresh(postedText, hoursLimit) {
  if (!postedText) return true;
  const t = postedText.toLowerCase();

  if (t.includes('today') || t.includes('just posted')) return true;

  const hoursMatch = t.match(/(\d+)\s*hour/);
  if (hoursMatch) return parseInt(hoursMatch[1], 10) <= hoursLimit;

  const minsMatch = t.match(/(\d+)\s*min/);
  if (minsMatch) return true; // posted minutes ago — always fresh

  const daysMatch = t.match(/(\d+)\s*day/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    // Convert hoursLimit to days ceiling for comparison
    return days === 0 || (hoursLimit >= 24 && days <= Math.floor(hoursLimit / 24));
  }

  return true; // unknown format — include
}

/**
 * Grade a job title by relevance to Agile/PM roles.
 *   A = Direct Scrum/Agile/Program Manager match
 *   B = TPM / Delivery Manager / Agile PM variant
 *   C = Broader PM / Portfolio
 *   D = Not relevant — skip
 */
function gradeTitle(title) {
  const t = title.toLowerCase();
  if (/scrum master|agile coach|release train engineer|rte|program manager/.test(t)) return 'A';
  if (/technical program|delivery manager|agile project|agile pm/.test(t))           return 'B';
  if (/project manager|product manager|portfolio manager/.test(t))                   return 'C';
  return 'D';
}

/** Build absolute URL from a potentially relative href */
function absoluteUrl(href, baseUrl) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  try {
    const base = new URL(baseUrl);
    return `${base.protocol}//${base.host}${href.startsWith('/') ? '' : '/'}${href}`;
  } catch {
    return href;
  }
}

// ── Core scraping ─────────────────────────────────────────────────────────────

async function scrapeWorkday(browser, site, hoursLimit) {
  const jobs    = [];
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    log(`Scraping ${site.company} → ${site.workday_url}`);

    // Navigate to the jobs board
    await page.goto(site.workday_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // ── Optional login ────────────────────────────────────────────────────────
    if (isFilledIn(site.username) && isFilledIn(site.password)) {
      log(`${site.company}: attempting login as ${site.username}`);

      const signInBtn = await page.$(
        'a[href*="signIn"], a[href*="login"], button:has-text("Sign In"), [data-automation-id="signIn"]'
      ).catch(() => null);

      if (signInBtn) {
        await signInBtn.click();
        await page.waitForTimeout(2500);

        const userField = await page.$(
          '[data-automation-id="email"], [data-automation-id="user-name"], input[type="email"], input[name="username"]'
        ).catch(() => null);
        const passField = await page.$(
          '[data-automation-id="password"], input[type="password"]'
        ).catch(() => null);

        if (userField) await userField.fill(site.username).catch(() => {});
        if (passField) await passField.fill(site.password).catch(() => {});

        const submitBtn = await page.$(
          '[data-automation-id="click_filter"], button[type="submit"], [data-automation-id="signInBtn"]'
        ).catch(() => null);
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
          log(`${site.company}: login submitted`);
        }
      } else {
        log(`${site.company}: sign-in button not found — continuing as guest`);
      }
    } else {
      log(`${site.company}: no credentials configured — scanning as guest`);
    }

    // ── Search each term ──────────────────────────────────────────────────────
    for (const term of site.search_terms) {
      try {
        // Return to the main jobs board for each search term
        await page.goto(site.workday_url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);

        // Locate and use the search box
        const searchBox = await page.$(
          '[data-automation-id="searchBox"] input, ' +
          'input[placeholder*="Search"], ' +
          'input[aria-label*="Search"], ' +
          'input[data-automation-id="searchBox"]'
        ).catch(() => null);

        if (searchBox) {
          await searchBox.triple_click().catch(async () => {
            await searchBox.click({ clickCount: 3 });
          });
          await searchBox.fill('').catch(() => {});
          await searchBox.type(term, { delay: 60 }).catch(() => searchBox.fill(term));
          await page.keyboard.press('Enter');
          await page.waitForTimeout(3000);
        } else {
          log(`${site.company} "${term}": search box not found — trying URL param approach`);
          const searchUrl = `${site.workday_url}?q=${encodeURIComponent(term)}`;
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(2500);
        }

        // ── Collect job cards ─────────────────────────────────────────────────
        // Workday uses multiple selectors depending on version
        const jobCards = await page.$$(
          '[data-automation-id="jobTitle"], ' +
          'li[data-automation-id="compositeContainer"], ' +
          '.job-posting-title, ' +
          'li[class*="job"], ' +
          'section[data-automation-id="jobResults"] li'
        ).catch(() => []);

        log(`${site.company} "${term}": ${jobCards.length} result(s)`);

        for (const card of jobCards.slice(0, 25)) {
          try {
            // Title
            const titleEl = await card.$(
              '[data-automation-id="jobTitle"] a, ' +
              'a[data-automation-id="jobTitle"], ' +
              '.job-posting-title a, ' +
              'a[href*="/job/"]'
            ).catch(() => null) ?? card;

            const title = ((await titleEl.textContent().catch(() => '')) || '').trim();
            if (!title || title.length < 3) continue;

            const grade = gradeTitle(title);
            if (grade === 'D') continue;

            // Posted date
            const dateEl = await card.$(
              '[data-automation-id="postedOn"], ' +
              '.job-posted-date, ' +
              '[class*="date"], ' +
              '[data-automation-id="jobPostingDate"]'
            ).catch(() => null);
            const postedText = dateEl
              ? ((await dateEl.textContent().catch(() => '')) || '').trim()
              : '';

            if (!isFresh(postedText, hoursLimit)) continue;

            // URL
            const linkEl = await card.$('a[href*="job"], a[href*="/job/"]').catch(() => null);
            const href   = linkEl ? await linkEl.getAttribute('href').catch(() => null) : null;
            if (!href) continue;
            const jobUrl = absoluteUrl(href, site.workday_url);

            // Avoid duplicates within a single company/term pass
            if (jobs.some(j => j.url === jobUrl)) continue;

            jobs.push({
              company:       site.company,
              role:          title,
              url:           jobUrl,
              platform:      'workday',
              grade,
              postedText,
              hasConnection: true,
              isWarmReferral: true,
              source:        'workday-scraper',
              searchTerm:    term,
              keywords:      [term, 'Agile', 'Scrum', 'Program Management', 'Dallas', 'Remote'].slice(0, 7),
              jobDescText:   `${title} at ${site.company}. Scraped from Workday instance.`,
              scrapedAt:     new Date().toISOString(),
            });
          } catch (cardErr) {
            log(`${site.company} "${term}" card error: ${cardErr.message}`);
          }
        }
      } catch (termErr) {
        log(`${site.company} "${term}" search error: ${termErr.message}`);
      }
    } // end term loop

  } catch (siteErr) {
    log(`${site.company} site error: ${siteErr.message}`);
  } finally {
    await context.close().catch(() => {});
  }

  return jobs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

  const sites = loadSites().filter(s => s.enabled !== false);
  log(`Starting Workday scraper | sites=${sites.length} | window=${HOURS}h | output=${OUTPUT}`);

  const browser = await chromium.launch({ headless: true });
  const allJobs = [];

  for (const site of sites) {
    const jobs = await scrapeWorkday(browser, site, HOURS);
    allJobs.push(...jobs);
    log(`${site.company}: ${jobs.length} fresh job(s) collected`);
  }

  await browser.close().catch(() => {});

  // Deduplicate by URL
  const seen   = new Set();
  const unique = allJobs.filter(j => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  const outPath = path.isAbsolute(OUTPUT)
    ? OUTPUT
    : path.join(__dirname, OUTPUT);

  fs.writeFileSync(outPath, JSON.stringify(unique, null, 2), 'utf8');

  log(`Workday scraper complete | unique=${unique.length} | file=${outPath}`);
  console.log(`WORKDAY_JOBS_FOUND:${unique.length}`);
  process.exit(0);
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
