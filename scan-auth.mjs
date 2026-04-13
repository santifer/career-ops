#!/usr/bin/env node

/**
 * scan-auth.mjs — Authenticated portal scanner via agent-browser
 *
 * Scans job portals that require login (LinkedIn, Naukri, Indeed, etc.)
 * using persistent browser sessions. First run: manual login. Subsequent
 * runs: reuse session.
 *
 * Usage:
 *   node scan-auth.mjs --login <portal>       Login (visible browser)
 *   node scan-auth.mjs --scan [portal]         Run scan
 *   node scan-auth.mjs --status [portal]        Check session validity
 *   node scan-auth.mjs --logout <portal>       Clear session
 *   node scan-auth.mjs --list                   Show all sessions
 *   node scan-auth.mjs --dry-run                Preview without writing
 *
 * Portals: linkedin, naukri, indeed, instahyre
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const SESSION_DIR = '.sessions';

// ── Portal Definitions ─────────────────────────────────────────────

const PORTALS = {
  linkedin: {
    name: 'LinkedIn',
    loginUrl: 'https://www.linkedin.com/',
    searchBase: 'https://www.linkedin.com/jobs/search/?',
    sessionName: 'linkedin',
    config: {
      maxResultsPerSearch: 25,
      delayBetweenPagesMs: [3000, 8000],
      delayBetweenSearchesMs: [5000, 15000],
    },
    // XPath selectors for job cards and details
    selectors: {
      jobCard: '//li[contains(@class, "jobs-search-results__list-item")]',
      jobTitle: './/*[contains(@class, "job-card-container__link")] | .//a[contains(@href, "/jobs/")]//span',
      jobCompany: './/*[contains(@class, "job-card-container__company-name")]',
      jobLocation: './/*[contains(@class, "job-card-container__metadata-item")]',
      jobLink: './/a[contains(@href, "/jobs/view")]/@href',
      moreButton: '//button[contains(@class, "job-details-unfold-setter")]',
      detailTitle: '//h1[contains(@class, "job-details-jobs-unified-top-card__job-title")]',
      detailCompany: '//*[contains(@class, "job-details-jobs-unified-top-card__company-name")]',
      detailLocation: '//*[contains(@class, "jobs-unified-top-card__bullet")]/span',
      detailDescription: '//div[contains(@class, "job-details-html")]',
      nextPage: '//button[contains(@aria-label, "Next")]',
    },
    buildSearchUrl(keywords, datePosted, experienceLevel) {
      const params = new URLSearchParams();
      params.set('keywords', keywords);
      if (datePosted) params.set('f_TPR', datePosted);
      if (experienceLevel?.length) {
        const levels = experienceLevel.map(l => encodeURIComponent(l));
        params.set('f_E', levels.join(','));
      }
      params.set('location', 'Worldwide');
      params.set('f_LF', 'AL'); // remote
      return this.searchBase + params.toString();
    },
    isLoggedIn(url, text) {
      if (url.includes('/login') || url.includes('/checkpoint/') || url.includes('/uas/')) return false;
      if (text?.includes('Sign in to LinkedIn') || text?.includes('Email or Phone')) return false;
      return text?.includes('My Network') || text?.includes('Sign out') ||
             text?.includes('Messaging') || url.includes('/jobs/');
    },
  },
  naukri: {
    name: 'Naukri.com',
    loginUrl: 'https://www.naukri.com/nlogin/login',
    searchBase: 'https://www.naukri.com/nlogin/login',
    sessionName: 'naukri',
    config: {
      maxResultsPerSearch: 25,
      delayBetweenPagesMs: [2000, 5000],
      delayBetweenSearchesMs: [3000, 10000],
    },
    selectors: {
      jobCard: '//div[contains(@class, "jobTuple")]',
      jobTitle: './/a[contains(@class, "title")]',
      jobCompany: './/a[contains(@class, "companyInfo")]//span',
      jobLocation: './/span[contains(@class, "location")]',
      jobLink: './/a[contains(@class, "title")]/@href',
      nextPage: '//*[contains(@class, \"pagination\")]//a[contains(text(), \"Next\")]',
    },
    buildSearchUrl(keywords, datePosted, experienceLevel) {
      const encoded = encodeURIComponent(keywords);
      return `https://www.naukri.com/job-search/${encoded}`;
    },
    isLoggedIn(url, text) {
      if (url.includes('login') || url.includes('nlogin')) return false;
      return !text?.includes('Login') && !text?.includes('Password');
    },
  },
  indeed: {
    name: 'Indeed',
    loginUrl: 'https://www.indeed.com/',
    searchBase: 'https://www.indeed.com/jobs',
    sessionName: 'indeed',
    config: {
      maxResultsPerSearch: 25,
      delayBetweenPagesMs: [2000, 6000],
      delayBetweenSearchesMs: [4000, 12000],
    },
    selectors: {
      jobCard: '//div[contains(@class, \"jobsearch-ResultList\")]//div[contains(@class, \"job_card\")]',
      jobTitle: './/a[contains(@class, \"jobTitle\")]',
      jobCompany: './/span[contains(@class, \"companyName\")]',
      jobLocation: './/div[contains(@class, \"companyLocation\")]',
      jobLink: './/a[contains(@class, \"jobTitle\")]/@href',
      nextPage: '//a[contains(@aria-label, \"Next\")]',
    },
    buildSearchUrl(keywords, datePosted, experienceLevel) {
      const params = new URLSearchParams();
      params.set('q', keywords);
      if (datePosted === 'r24') params.set('fromage', '1');
      return this.searchBase + '?' + params.toString();
    },
    isLoggedIn(url, text) {
      if (url.includes('/login') || url.includes('/auth')) return false;
      return text && !text?.includes('Sign in to access your account');
    },
  },
  instahyre: {
    name: 'Instahyre',
    loginUrl: 'https://www.instahyre.com/accounts/login/',
    searchBase: 'https://www.instahyre.com/#search',
    sessionName: 'instahyre',
    config: {
      maxResultsPerSearch: 25,
      delayBetweenPagesMs: [2000, 5000],
      delayBetweenSearchesMs: [3000, 10000],
    },
    selectors: {
      jobCard: '//div[contains(@class, \"candidate-search-results\")]//div[contains(@class, \"card\")]',
      jobTitle: './/h3[contains(@class, \"title\")]',
      jobCompany: './/div[contains(@class, \"company\")]',
      jobLocation: './/div[contains(@class, \"location\")]',
      jobLink: './@onclick',
      nextPage: '//button[contains(text(), \"Load more\")]',
    },
    buildSearchUrl(keywords) {
      return `https://www.instahyre.com/#search?q=${encodeURIComponent(keywords)}`;
    },
    isLoggedIn(url, text) {
      if (url.includes('/login') || url.includes('/signin')) return false;
      return !text?.includes('Sign in') && !text?.includes('Login');
    },
  },
};

// ── agent-browser CLI helper ────────────────────────────────────────

function ab(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('agent-browser', args, { timeout, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0 || (code === null)) {
        try { resolve(JSON.parse(stdout)); }
        catch { resolve({ success: true, data: stdout.trim() }); }
      } else {
        reject(new Error(stderr || `agent-browser exited ${code}`));
      }
    });
    proc.on('error', err => {
      if (err.message.includes('ENOENT')) {
        reject(new Error('agent-browser not found. Run: npm install -g agent-browser && agent-browser install'));
      }
      reject(err);
    });
  });
}

function randDelay([min, max]) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise(r => setTimeout(r, ms));
}

function statePath(portal) {
  return join(SESSION_DIR, portal, 'state.json');
}

function sessionFile(portal) {
  const p = PORTALS[portal];
  return join(process.env.HOME || '', '.agent-browser', 'sessions', `${p?.sessionName || portal}-default.json`);
}

function saveState(portal, data) {
  const dir = join(SESSION_DIR, portal);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify(data, null, 2));
}

function loadState(portal) {
  const path = statePath(portal);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function sessionExists(portal) {
  return existsSync(sessionFile(portal));
}

async function pageState() {
  try {
    const [urlRes, textRes] = await Promise.all([
      ab(['get', 'url', '--json']),
      ab(['eval', "document.body ? document.body.innerText : ''", '--json']),
    ]);
    return {
      url: urlRes.success ? (urlRes.data?.url || urlRes.data || '') : '',
      text: textRes.success ? (textRes.data?.result || '') : '',
    };
  } catch {
    return { url: '', text: '' };
  }
}

// ── Login ───────────────────────────────────────────────────────────

async function doLogin(portal, config) {
  const p = PORTALS[portal];
  const dir = join(SESSION_DIR, portal);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  console.log(`\n🌐 Login to ${p.name}`);
  console.log(`   Session: --session-name ${p.sessionName}`);
  console.log(`   URL: ${p.loginUrl}`);
  console.log(`\n⏳ Browser opening... log in manually, then press Enter here.`);

  const browser = spawn('agent-browser', [
    'open', p.loginUrl,
    '--session-name', p.sessionName,
    '--headed',
  ], { stdio: 'inherit' });

  await new Promise(resolve => {
    browser.on('exit', resolve);
  });

  // Verify
  const check = spawn('agent-browser', [
    'open', p.loginUrl,
    '--session-name', p.sessionName,
    '--timeout', '15000',
    '--json',
  ], { timeout: 20000 });

  await new Promise(r => setTimeout(r, 3000));
  const { url, text } = await pageState();
  await ab(['close', '--json']);

  if (p.isLoggedIn(url, text)) {
    console.log(`✅ Login confirmed: ${url}`);
    saveState(portal, {
      version: 1,
      created_at: new Date().toISOString(),
      session_name: p.sessionName,
      portal,
    });
  } else {
    console.log(`❌ Login failed. URL: ${url}`);
  }
}

// ── Session Validation ───────────────────────────────────────────────

async function validateSession(portal) {
  const p = PORTALS[portal];
  if (!sessionExists(portal)) {
    console.log(`❌ No agent-browser session for ${p.name}`);
    return false;
  }

  try {
    await ab(['open', p.loginUrl, '--session-name', p.sessionName, '--timeout', '15000', '--json']);
    await new Promise(r => setTimeout(r, 2000));
    const { url, text } = await pageState();
    await ab(['close', '--json']);

    if (p.isLoggedIn(url, text)) {
      console.log(`✅ ${p.name}: session active (${url})`);
      return true;
    } else {
      console.log(`❌ ${p.name}: session expired or invalid (${url})`);
      return false;
    }
  } catch (err) {
    console.log(`❌ ${p.name}: error — ${err.message}`);
    return false;
  }
}

// ── JD Extraction ────────────────────────────────────────────────────

async function extractDetailFromPanel(job) {
  try {
    // Click "Show more" to expand truncated descriptions
    const moreBtn = await ab(['eval',
      `(() => {
        const btns = document.querySelectorAll('button, [class*="more"], [class*="expand"], [class*="unfold"]');
        for (const btn of btns) {
          const txt = btn.textContent?.trim() || '';
          if (txt.includes('more') || txt.includes('Show') || txt.includes('expand') || txt.includes('full description')) {
            btn.scrollIntoView({ block: 'center' });
            btn.click();
            return true;
          }
        }
        return false;
      })()`,
      '--json'
    ]);

    if (moreBtn.success && moreBtn.data?.result) {
      await new Promise(r => setTimeout(r, 800));
    }

    // Extract full job description
    const description = await ab(['eval',
      `(() => {
        const selectors = [
          'div.job-details-jobs-unified-top-card__job-insight',
          '[class*="description"]',
          '[class*="html"]',
          '[data-test-id*="description"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent?.trim().length > 200) {
            return el.textContent.trim();
          }
        }
        return '';
      })()`,
      '--json'
    ]);

    return description.success ? (description.data?.result || '') : '';
  } catch {
    return '';
  }
}

// ── Title + JD Keyword Filter ──────────────────────────────────────

function matchesFilter(title, description, config) {
  const { positive = [], negative = [] } = config;

  // Negative keywords: title only
  if (negative.some(k => title.toLowerCase().includes(k.toLowerCase()))) {
    return false;
  }

  // Positive keywords: title OR full description
  if (positive.length === 0) return true;
  const searchIn = `${title.toLowerCase()} ${(description || '').toLowerCase()}`;
  return positive.some(k => searchIn.includes(k.toLowerCase()));
}

// ── LinkedIn Scan (main implementation) ─────────────────────────────

const DATE_POSTED_MAP = {
  '24': 'r86400',    // past 24 hours
  'r86400': 'r86400',
  'week': 'r604800', // past week
  'r604800': 'r604800',
  'month': 'r2592000', // past month
  'r2592000': 'r2592000',
};

function resolveDatePosted(val) {
  return DATE_POSTED_MAP[String(val)] || 'r86400';
}

async function scanLinkedIn(keywords, options = {}) {
  const { maxResultsPerSearch = 25, delayBetweenPagesMs = [3000, 8000],
          delayBetweenSearchesMs = [5000, 15000],
          datePosted = 'r86400',
          experienceLevel = [], employerBlocklist = [],
          titleFilter = {} } = options;

  const resolvedDate = resolveDatePosted(datePosted);
  const results = [];
  const seenUrls = loadSeenUrls();
  let skippedEmployerBlock = 0;
  let skippedTitleFilter = 0;
  let skippedDupe = 0;

  for (const kw of keywords) {
    const params = new URLSearchParams();
    params.set('keywords', kw);
    params.set('f_TPR', resolvedDate);
    if (experienceLevel.length) {
      const levelMap = { 'Entry-level': '1', 'Senior': '3', 'Manager': '4', 'Director': '5', 'Executive': '6' };
      params.set('f_E', experienceLevel.map(l => levelMap[l] || '3').join(','));
    }
    params.set('location', 'Worldwide');
    params.set('f_LF', 'AL'); // remote
    // Sort by relevance (most recent by date if date filter is set)
    params.set('sortBy', 'R');

    const searchUrl = 'https://www.linkedin.com/jobs/search/?' + params.toString();
    console.log(`\n🔍 [LinkedIn] "${kw}" → ${searchUrl}`);

    try {
      await ab(['open', searchUrl, '--session-name', 'linkedin', '--timeout', '30000', '--json']);
      await new Promise(r => setTimeout(r, 2000));

      let pageCount = 0;
      while (results.length < maxResultsPerSearch) {
        pageCount++;

        // Scroll to load all visible cards
        await ab(['scroll', 'down', '800', '--json']);
        await new Promise(r => setTimeout(r, 500));
        await ab(['scroll', 'up', '400', '--json']);
        await new Promise(r => setTimeout(r, 500));

        // Get job listings from current page
        const html = await ab(['eval',
          `(function() {
            const items = document.querySelectorAll('li.jobs-search-results__list-item');
            return JSON.stringify(Array.from(items).map(item => {
              const link = item.querySelector('a.job-card-list__title') || item.querySelector('a[href*="/jobs/view"]');
              const company = item.querySelector('.job-card-container__company-name') || item.querySelector('[class*="companyName"]');
              const location = item.querySelector('.job-card-container__metadata-item');
              const subtitle = item.querySelector('[class*="subtitle"]');
              return {
                title: link?.textContent?.trim() || '',
                url: link?.href || '',
                company: company?.textContent?.trim() || '',
                location: location?.textContent?.trim() || subtitle?.textContent?.trim() || '',
              };
            }));
          })()`,
          '--json'
        ]);

        let jobs = [];
        try { jobs = JSON.parse(html.data?.result || html.data || '[]'); } catch { jobs = []; }

        let newThisPage = 0;
        for (const job of jobs) {
          if (results.length >= maxResultsPerSearch) break;

          // Extract full URL (LinkedIn truncates them)
          if (job.url && !job.url.includes('?source')) {
            job.url = (job.url.split('?')[0]) + '?source=career-ops-scan';
          }

          if (!job.url || !job.title) continue;
          if (seenUrls.has(job.url)) { skippedDupe++; continue; }
          if (employerBlocklist.some(b => job.company?.toLowerCase().includes(b.toLowerCase()))) {
            skippedEmployerBlock++; continue;
          }

          // Click to extract JD for filtering
          let description = '';
          try {
            await ab(['click', `a[href="${job.url}"]`, '--json']);
            await new Promise(r => setTimeout(r, 1500));
            description = await extractDetailFromPanel(job);
            await ab(['back', '--json']);
            await new Promise(r => setTimeout(r, 800));
          } catch {
            // Can't extract JD — use title only
          }

          if (!matchesFilter(job.title, description, titleFilter)) {
            skippedTitleFilter++; continue;
          }

          results.push({ ...job, description, source: 'linkedin' });
          seenUrls.add(job.url);
          newThisPage++;
        }

        console.log(`   Page ${pageCount}: +${newThisPage} new (${results.length}/${maxResultsPerSearch})`);

        if (results.length >= maxResultsPerSearch) break;

        // Navigate to next page
        const hasNext = await ab(['eval',
          `document.querySelector('button[aria-label="Next"]') !== null`,
          '--json'
        ]);
        if (!hasNext.success) break;

        await ab(['click', 'button[aria-label="Next"]', '--json']);
        await randDelay(delayBetweenPagesMs);
      }

      await randDelay(delayBetweenSearchesMs);
    } catch (err) {
      console.log(`   ⚠️  Error: ${err.message}`);
    }
  }

  console.log(`   Skipped: ${skippedDupe} dupes, ${skippedEmployerBlock} blocked, ${skippedTitleFilter} filtered`);
  return results;
}

// ── Generic Scan ─────────────────────────────────────────────────────

async function genericScan(portal, keywords, options = {}) {
  const p = PORTALS[portal];
  const { maxResultsPerSearch = 25, delayBetweenPagesMs = [3000, 8000],
          delayBetweenSearchesMs = [5000, 15000], employerBlocklist = [] } = options;

  const results = [];
  const seenUrls = loadSeenUrls();

  for (const kw of keywords) {
    const searchUrl = p.buildSearchUrl(kw);
    console.log(`\n🔍 [${p.name}] "${kw}"`);

    try {
      await ab(['open', searchUrl, `--session-name`, p.sessionName, '--timeout', '30000', '--json']);
      await new Promise(r => setTimeout(r, 3000));

      const html = await ab(['eval',
        `(function() {
          const items = document.querySelectorAll('${p.selectors.jobCard}');
          return JSON.stringify(Array.from(items).map(item => {
            const link = item.querySelector('a');
            return {
              title: item.textContent.match(/(title|position|role)[:\\s]*(.+)/i)?.[2]?.trim() ||
                     item.querySelector('h[1-6], .title, h3')?.textContent?.trim() || '',
              url: link?.href || '',
              company: item.querySelector('.company, .employer, [class*="company"]')?.textContent?.trim() || '',
              location: item.querySelector('.location, [class*="location"]')?.textContent?.trim() || '',
            };
          }));
        })()`,
        '--json'
      ]);

      let jobs = [];
      try { jobs = JSON.parse(html.data?.result || html.data || '[]'); } catch { jobs = []; }

      for (const job of jobs) {
        if (results.length >= maxResultsPerSearch) break;
        if (!job.url || seenUrls.has(job.url)) continue;
        if (employerBlocklist.some(b => job.company?.toLowerCase().includes(b.toLowerCase()))) continue;

        results.push({ ...job, source: portal });
        seenUrls.add(job.url);
      }

      console.log(`   +${jobs.length} found`);
      await randDelay(delayBetweenSearchesMs);
    } catch (err) {
      console.log(`   ⚠️  Error: ${err.message}`);
    }
  }

  return results;
}

// ── Dedup ────────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  return seen;
}

// ── Title Filter ─────────────────────────────────────────────────────

function buildTitleFilter(config) {
  const positive = (config?.positive || []).map(k => k.toLowerCase());
  const negative = (config?.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Pipeline Writer ──────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  // Find "## Pending" section
  const marker = '## Pending';
  const idx = text.indexOf(marker);
  const markerLower = '## pending';

  let insertAt;
  if (idx !== -1) {
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    insertAt = nextSection === -1 ? text.length : nextSection;
  } else {
    // Try lowercase
    const idxLower = text.indexOf(markerLower);
    if (idxLower !== -1) {
      const afterMarker = idxLower + markerLower.length;
      const nextSection = text.indexOf('\n## ', afterMarker);
      insertAt = nextSection === -1 ? text.length : nextSection;
    } else {
      // No section — append before "## Processed" or at end
      const procIdx = text.indexOf('## Processed');
      insertAt = procIdx === -1 ? text.length : procIdx;
    }
  }

  const block = '\n' + offers.map(o =>
    `- [ ] ${o.url} | ${o.company} | ${o.title}`
  ).join('\n') + '\n';
  text = text.slice(0, insertAt) + block + text.slice(insertAt);
  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const loginIdx = args.indexOf('--login');
  const scanIdx = args.indexOf('--scan');
  const statusIdx = args.indexOf('--status');
  const logoutIdx = args.indexOf('--logout');
  const listIdx = args.indexOf('--list');

  // Load portals.yml config
  let portalsConfig = { title_filter: { positive: ['engineer'], negative: [] } };
  let linkedinSearchConfig = { keywords: [], datePosted: 'r86400', experienceLevel: [], maxResultsPerSearch: 25, employerBlocklist: [] };

  if (existsSync(PORTALS_PATH)) {
    try {
      const { readFileSync: rfSync } = await import('fs');
      const yaml = require('js-yaml');
      const raw = rfSync(PORTALS_PATH, 'utf-8');
      const config = yaml.load(raw);
      portalsConfig = config;

      // Extract linkedin_searches config
      // Supports both raw values (24, week, month) and f_TPR format (r86400, etc.)
      linkedinSearchConfig = {
        keywords: config.linkedin_searches?.keywords || [],
        datePosted: config.linkedin_searches?.date_posted || 'r86400',
        experienceLevel: config.linkedin_searches?.experience_level || [],
        maxResultsPerSearch: config.linkedin_searches?.max_results_per_search || 25,
        delayBetweenPagesMs: config.linkedin_searches?.delay_between_pages_ms || [3000, 8000],
        delayBetweenSearchesMs: config.linkedin_searches?.delay_between_searches_ms || [5000, 15000],
        employerBlocklist: config.linkedin_searches?.employer_blocklist || [],
      };
    } catch (err) {
      console.warn(`Warning: could not parse ${PORTALS_PATH}: ${err.message}`);
    }
  }

  // --login <portal>
  if (loginIdx !== -1) {
    const portal = args[loginIdx + 1];
    if (!portal || !PORTALS[portal]) {
      console.log(`Usage: node scan-auth.mjs --login <portal>`);
      console.log(`Portals: ${Object.keys(PORTALS).join(', ')}`);
      process.exit(1);
    }
    await doLogin(portal, linkedinSearchConfig);
    return;
  }

  // --status [portal]
  if (statusIdx !== -1) {
    const portal = args[statusIdx + 1];
    if (portal && PORTALS[portal]) {
      await validateSession(portal);
    } else {
      for (const p of Object.keys(PORTALS)) {
        await validateSession(p);
        console.log('');
      }
    }
    return;
  }

  // --logout <portal>
  if (logoutIdx !== -1) {
    const portal = args[logoutIdx + 1];
    if (!portal || !PORTALS[portal]) {
      console.log(`Usage: node scan-auth.mjs --logout <portal>`);
      console.log(`Portals: ${Object.keys(PORTALS).join(', ')}`);
      process.exit(1);
    }
    const dir = join(SESSION_DIR, portal);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    const sf = sessionFile(portal);
    if (existsSync(sf)) try { unlinkSync(sf); } catch {}
    console.log(`✅ ${PORTALS[portal].name}: session cleared`);
    return;
  }

  // --list
  if (listIdx !== -1) {
    const all = Object.keys(PORTALS).map(p => ({
      name: PORTALS[p].name,
      key: p,
      exists: sessionExists(p),
      state: loadState(p),
    }));
    console.log('\nSessions\n========');
    for (const s of all) {
      console.log(`${s.name} (${s.key}) — ${s.exists ? '✅ active' : '❌ none'}`);
      if (s.state) console.log(`  Last login: ${s.state.created_at}`);
    }
    return;
  }

  // --scan [portal]
  if (scanIdx !== -1 || args.length === 0) {
    const portal = args[scanIdx + 1] || 'linkedin';

    if (!PORTALS[portal]) {
      console.log(`Unknown portal: ${portal}`);
      console.log(`Portals: ${Object.keys(PORTALS).join(', ')}`);
      process.exit(1);
    }

    if (!sessionExists(portal)) {
      console.log(`❌ No session for ${PORTALS[portal].name}. Run: node scan-auth.mjs --login ${portal}`);
      process.exit(1);
    }

    const valid = await validateSession(portal);
    if (!valid) {
      console.log(`❌ Session invalid. Run: node scan-auth.mjs --login ${portal}`);
      process.exit(1);
    }

    // Get keywords from config
    let keywords = linkedinSearchConfig.keywords;
    if (!keywords || keywords.length === 0) {
      keywords = portalsConfig.title_filter?.positive || ['Software Engineer'];
      console.log(`⚠️  No keywords configured in portals.yml. Using: ${keywords.join(', ')}`);
    }

    console.log(`\n${'━'.repeat(45)}`);
    console.log(`Auth Scan — ${PORTALS[portal].name} — ${new Date().toISOString().slice(0, 10)}`);
    console.log(`${'━'.repeat(45)}`);
    console.log(`Keywords: ${keywords.join(', ')}`);
    console.log(`Date posted: ${linkedinSearchConfig.datePosted}`);
    console.log(`Experience: ${linkedinSearchConfig.experienceLevel.join(', ') || 'all'}\n`);

    let offers;
    if (portal === 'linkedin') {
      offers = await scanLinkedIn(keywords, {
        ...linkedinSearchConfig,
        titleFilter: portalsConfig.title_filter,
      });
    } else {
      offers = await genericScan(portal, keywords, {
        ...linkedinSearchConfig,
        titleFilter: portalsConfig.title_filter,
      });
    }

    // Apply title filter
    const titleFilter = buildTitleFilter(portalsConfig.title_filter);
    const filtered = offers.filter(o => titleFilter(o.title));
    const titleFiltered = offers.length - filtered.length;

    console.log(`\n${'━'.repeat(45)}`);
    console.log(`Results:`);
    console.log(`  Total scraped:    ${offers.length}`);
    console.log(`  Title-filtered:   ${titleFiltered} removed`);
    console.log(`  New to add:       ${filtered.length}`);

    if (!dryRun && filtered.length > 0) {
      appendToPipeline(filtered);
      appendToScanHistory(filtered, new Date().toISOString().slice(0, 10));
      console.log(`\n✅ Saved ${filtered.length} offers to ${PIPELINE_PATH}`);
    } else if (dryRun) {
      console.log(`\n(dry run — no files written)`);
    }

    console.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
    await ab(['close', '--json']);
    return;
  }

  console.log(`
scan-auth.mjs — Authenticated portal scanner (agent-browser)

Usage:
  node scan-auth.mjs --login <portal>     Login (visible browser, first time)
  node scan-auth.mjs --scan [portal]       Run scan (default: linkedin)
  node scan-auth.mjs --scan linkedin       Scan LinkedIn
  node scan-auth.mjs --scan naukri         Scan Naukri
  node scan-auth.mjs --status [portal]     Check session validity
  node scan-auth.mjs --logout <portal>      Clear session
  node scan-auth.mjs --list                Show all sessions
  node scan-auth.mjs --scan --dry-run       Preview without writing

Configure in portals.yml:
  linkedin_searches.keywords          — search terms
  linkedin_searches.date_posted       — 'r86400' (24h), 'r604800' (week), 'r2592000' (month)
  linkedin_searches.experience_level  — ['Entry-level', 'Senior', 'Manager', 'Director', 'Executive']
  linkedin_searches.employer_blocklist — company names to skip
  title_filter.positive/negative      — same filter as regular scan

Portals: ${Object.keys(PORTALS).join(', ')}
Sessions: ~/.agent-browser/sessions/{portal}-default.json
`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});