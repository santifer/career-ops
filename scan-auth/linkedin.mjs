/**
 * LinkedIn Scanner
 *
 * All LinkedIn-specific logic: selectors, config parsing, session checks,
 * pagination, card extraction, search URL construction, and the scan loop.
 *
 * scan() handles the full extraction pipeline including filtering, dedup,
 * and employer blocklist. Returns only accepted listings ready to be saved.
 */


// ---------------------------------------------------------------------------
// Selectors — grouped for easy maintenance when LinkedIn changes DOM
// ---------------------------------------------------------------------------

const SELECTORS = {
  xpathListingCard: "//button[starts-with(@aria-label, 'Dismiss') and contains(@aria-label, 'job')]/ancestor::div[@role='button']",
  xpathApplyUrl: "//a[@aria-label='Apply on company website']",
  xpathTitle: "//div[@data-display-contents='true']//a[contains(@href,'trackingId')]",
  xpathCompany: "//a[contains(@href,'/company/')]",
  xpathMoreButton: "//span[normalize-space(text())='more']",
  jdContent: 'span[data-testid="expandable-text-box"]',
  loggedIn: 'a[aria-label*="My Network"]',
  xpathCurrentPage: "//button[@aria-current='true'][starts-with(@aria-label, 'Page')]",
  xpathPageButton: "//button[starts-with(@aria-label, 'Page')]",
};

const NOISE_LABELS = new Set([
  'more', 'show more', 'see more',
  'less', 'show less', 'see less',
  'retry premium',
]);
const MIN_POSITION_LENGTH = 4;

function randomDelay(range) {
  const [min, max] = range;
  return Math.floor(Math.random() * (max - min) + min);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) { console.log(`[linkedin] ${msg}`); }
function warn(msg) { console.warn(`[linkedin] ⚠ ${msg}`); }

export default class LinkedInScanner {
  name = 'LinkedIn';
  portalId = 'linkedin';
  loginUrl = 'https://www.linkedin.com/login';
  feedUrl = 'https://www.linkedin.com/feed/';

  // -------------------------------------------------------------------------
  // Config parsing — extracts linkedin_searches section from portals.yml
  // -------------------------------------------------------------------------

  parseConfig(raw) {
    const lines = raw.split('\n');
    const config = {
      title_filter: { positive: [], negative: [] },
      keywords: [],
      employer_blocklist: [],
    };

    let section = null;
    let subsection = null;

    for (const line of lines) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('#') || trimmed === '') continue;

      const indent = line.length - line.trimStart().length;

      if (indent === 0) {
        if (trimmed.startsWith('title_filter:')) { section = 'title_filter'; subsection = null; continue; }
        if (trimmed.startsWith('linkedin_searches:')) { section = 'linkedin_searches'; subsection = null; continue; }
        if (trimmed.match(/^\w/)) { section = null; subsection = null; continue; }
      }

      if (section === 'title_filter') {
        if (trimmed.startsWith('positive:')) { subsection = 'positive'; continue; }
        if (trimmed.startsWith('negative:')) { subsection = 'negative'; continue; }
        if (trimmed.startsWith('seniority_boost:')) { subsection = 'seniority_boost'; continue; }
        if (subsection && trimmed.startsWith('- ')) {
          const val = trimmed.slice(2).replace(/^["']|["']$/g, '');
          if (subsection === 'positive' || subsection === 'negative') {
            config.title_filter[subsection].push(val);
          }
        }
      }

      if (section === 'linkedin_searches') {
        if (indent === 2 && trimmed.match(/^\w+:\s*$/)) {
          if (trimmed.startsWith('keywords:')) subsection = 'keywords';
          else if (trimmed.startsWith('employer_blocklist:')) subsection = 'employer_blocklist';
          continue;
        }
        if (indent === 2 && !trimmed.startsWith('-')) {
          const m = trimmed.match(/^([\w_]+):\s*(.+)/);
          if (m) {
            let val = m[2].replace(/^["']|["']$/g, '');
            if (m[1] === 'date_posted') config.date_posted = val;
            if (m[1] === 'max_results_per_search') config.max_results = parseInt(val, 10);
            if (m[1] === 'delay_between_pages_ms') {
              config.delay_pages = val.replace(/[\[\]]/g, '').split(',').map(s => parseInt(s.trim(), 10));
            }
            if (m[1] === 'delay_between_searches_ms') {
              config.delay_searches = val.replace(/[\[\]]/g, '').split(',').map(s => parseInt(s.trim(), 10));
            }
            if (m[1] === 'experience_level') {
              config.experience_level = val.startsWith('[')
                ? val.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean)
                : [val.trim()];
            }
            if (m[1] === 'employer_blocklist' && val.startsWith('[')) {
              config.employer_blocklist = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
            }
            if (m[1] === 'keywords' && val.startsWith('[')) {
              config.keywords = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
            }
          }
          subsection = null;
          continue;
        }
        if (indent >= 4 && trimmed.startsWith('- ')) {
          const val = trimmed.slice(2).replace(/^["']|["']$/g, '');
          if (!val) continue;
          if (subsection === 'keywords') config.keywords.push(val);
          if (subsection === 'employer_blocklist') config.employer_blocklist.push(val);
        }
      }
    }

    return config;
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  async isLoggedIn(page) {
    const url = page.url();
    if (url.includes('/login') || url.includes('/uas/') || url.includes('/checkpoint/')) {
      return false;
    }
    if (await page.$(SELECTORS.loggedIn)) return true;
    return false;
  }

  async checkSession(page) {
    await page.goto(this.feedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    return this.isLoggedIn(page);
  }

  // -------------------------------------------------------------------------
  // Scan — the main extraction loop
  //
  // Handles extraction, filtering, dedup, and employer blocklist.
  // Returns only accepted listings ready to be saved.
  //
  // Options: { maxResults, searchFilter, scanHistory }
  // -------------------------------------------------------------------------

  async scan(context, config, options = {}) {
    const page = await context.newPage();
    const maxPerSearch = options.maxResults || config.max_results || 25;
    const delayPages = config.delay_pages || [3000, 8000];
    const delaySearches = config.delay_searches || [5000, 15000];
    const titleFilter = config.title_filter;
    const employerBlocklist = config.employer_blocklist || [];
    const scanHistory = options.scanHistory || new Set();

    const keywords = config.keywords || [];
    if (keywords.length === 0) {
      log('No keywords found in portals.yml');
      await page.close();
      return null;
    }

    const searches = this.#buildSearches(config);

    const toRun = options.searchFilter
      ? searches.filter(s => s.name === options.searchFilter)
      : searches;

    if (toRun.length === 0) {
      log(`No keyword matching "${options.searchFilter}"`);
      log(`Available: ${searches.map(s => s.name).join(', ')}`);
      await page.close();
      return null;
    }

    const listings = [];
    const errors = [];
    const stats = {
      searched: 0, found: 0, extracted: 0,
      skipped_filter: 0, skipped_dedup: 0, errors: 0,
    };

    for (const search of toRun) {
      log(`\n── Search: ${search.name} ──`);
      stats.searched++;

      try {
        await page.goto(search.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(randomDelay(delayPages));
        await this.#scrollToLoadResults(page);

        let accepted = 0;
        let hasNextPage = true;

        while (hasNextPage && accepted < maxPerSearch) {
          const currentPage = await this.#getCurrentPage(page);
          log(`Page ${currentPage || 1}`);

          await this.#scrollToLoadResults(page);

          const cardCount = await this.#getCardCount(page);
          log(`Found ${cardCount} job cards`);
          stats.found += cardCount;

          for (let i = 0; i < cardCount; i++) {
            if (accepted >= maxPerSearch) {
              log(`Reached max results (${maxPerSearch}) for this search`);
              break;
            }

            const clicked = await this.#clickCard(page, i);
            if (!clicked) {
              warn(`  ✗ Could not click card ${i}`);
              continue;
            }
            await sleep(randomDelay(delayPages));

            const detail = await this.#extractDetailFromPanel(page);
            if (!detail.title) {
              warn(`  ✗ No title extracted from card ${i}`);
              stats.errors++;
              continue;
            }

            detail.applicationUrl = this.#unwrapRedirect(detail.applicationUrl);
            stats.extracted++;

            // Dedup
            if (scanHistory.has(detail.url)) {
              log(`  ✗ Already seen: ${detail.title} (${detail.company})`);
              stats.skipped_dedup++;
              continue;
            }

            // Employer blocklist
            if (employerBlocklist.length && detail.company) {
              const companyLower = detail.company.toLowerCase();
              if (employerBlocklist.some(b => companyLower.includes(b.toLowerCase()))) {
                log(`  ✗ Blocked employer: ${detail.company}`);
                stats.skipped_filter++;
                continue;
              }
            }

            // Title / keyword filter
            if (!this.#matchesFilter(detail.title, detail.jdText, titleFilter)) {
              log(`  ✗ Filtered: ${detail.title} (${detail.company})`);
              stats.skipped_filter++;
              continue;
            }

            // No JD content
            if (!detail.jdText) {
              warn(`  ✗ No JD content: ${detail.title}`);
              stats.errors++;
              continue;
            }

            scanHistory.add(detail.url);
            listings.push(detail);
            accepted++;
            log(`  ✓ Accepted: ${detail.title} at ${detail.company}`);
          }

          if (accepted < maxPerSearch) {
            hasNextPage = await this.#goToNextPage(page);
            if (hasNextPage) {
              log(`Navigating to next page...`);
              await sleep(randomDelay(delayPages));
            }
          } else {
            hasNextPage = false;
          }
        }
      } catch (e) {
        log(`Search "${search.name}" failed: ${e.message}`);
        errors.push({ search: search.name, error: e.message });
        stats.errors++;
      }

      if (toRun.indexOf(search) < toRun.length - 1) {
        const d = randomDelay(delaySearches);
        log(`Waiting ${(d / 1000).toFixed(1)}s before next search...`);
        await sleep(d);
      }
    }

    await page.close();
    return { listings, errors, stats };
  }

  // -------------------------------------------------------------------------
  // Private — scan history & filtering
  // -------------------------------------------------------------------------

  #matchesFilter(title, jdText, filter) {
    if (!filter) return true;
    const combined = `${title} ${jdText}`.toLowerCase();
    const titleLower = title.toLowerCase();
    const hasPositive = !filter.positive?.length ||
      filter.positive.some(kw => combined.includes(kw.toLowerCase()));
    const hasNegative = filter.negative?.length &&
      filter.negative.some(kw => titleLower.includes(kw.toLowerCase()));
    return hasPositive && !hasNegative;
  }

  // -------------------------------------------------------------------------
  // Private — search URL construction
  // -------------------------------------------------------------------------

  #buildSearches(config) {
    const datePostedMap = { '24': 'past 24 hours', 'Week': 'past week', 'Month': 'past month' };
    const dateSuffix = datePostedMap[config.date_posted] || '';
    const levels = config.experience_level || [];
    const levelPrefix = levels.length ? levels.join(' or ') : '';

    return config.keywords.map(kw => {
      let query = levelPrefix ? `${levelPrefix} ${kw}` : kw;
      if (dateSuffix) query += ` posted in the ${dateSuffix}`;
      const params = new URLSearchParams({ keywords: query });
      return { name: kw, url: `https://www.linkedin.com/jobs/search-results/?${params}` };
    });
  }

  // -------------------------------------------------------------------------
  // Private — URL helpers
  // -------------------------------------------------------------------------

  #unwrapRedirect(href) {
    const trimmed = (href || '').trim();
    if (!trimmed) return '';
    try {
      const u = new URL(trimmed);
      if (!u.hostname.includes('linkedin.com')) return trimmed;
      if (!u.pathname.includes('/safety/go')) return trimmed;
      const nested = u.searchParams.get('url');
      if (!nested) return trimmed;
      const decoded = decodeURIComponent(nested);
      new URL(decoded);
      return decoded;
    } catch {
      return trimmed;
    }
  }

  // -------------------------------------------------------------------------
  // Private — pagination
  // -------------------------------------------------------------------------

  async #getCurrentPage(page) {
    return page.evaluate(({ xpath }) => {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const btn = result.singleNodeValue;
      if (!btn) return 0;
      const label = btn.getAttribute('aria-label') || '';
      const match = label.match(/Page (\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }, { xpath: SELECTORS.xpathCurrentPage });
  }

  async #goToNextPage(page) {
    return page.evaluate(({ xpathCurrent, xpathAll }) => {
      const curResult = document.evaluate(xpathCurrent, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const curBtn = curResult.singleNodeValue;
      if (!curBtn) return false;
      const curLabel = curBtn.getAttribute('aria-label') || '';
      const curMatch = curLabel.match(/Page (\d+)/);
      if (!curMatch) return false;
      const currentNum = parseInt(curMatch[1], 10);

      const allResult = document.evaluate(xpathAll, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < allResult.snapshotLength; i++) {
        const btn = allResult.snapshotItem(i);
        const label = btn.getAttribute('aria-label') || '';
        const match = label.match(/Page (\d+)/);
        if (match && parseInt(match[1], 10) === currentNum + 1) {
          btn.click();
          return true;
        }
      }
      return false;
    }, { xpathCurrent: SELECTORS.xpathCurrentPage, xpathAll: SELECTORS.xpathPageButton });
  }

  // -------------------------------------------------------------------------
  // Private — extraction helpers
  // -------------------------------------------------------------------------

  async #scrollToLoadResults(page) {
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, randomDelay([300, 600]));
      await sleep(randomDelay([500, 1200]));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1000);
  }

  async #getCardCount(page) {
    return page.evaluate((xpath) => {
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return result.snapshotLength;
    }, SELECTORS.xpathListingCard);
  }

  async #clickCard(page, index) {
    return page.evaluate(({ xpath, idx }) => {
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const card = result.snapshotItem(idx);
      if (card) { card.click(); return true; }
      return false;
    }, { xpath: SELECTORS.xpathListingCard, idx: index });
  }

  async #extractDetailFromPanel(page) {
    // Try to expand the description — some jobs are short or already expanded
    const hasMore = await page.evaluate(({ xpath }) => {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const moreSpan = result.singleNodeValue;
      if (moreSpan) { moreSpan.click(); return true; }
      return false;
    }, { xpath: SELECTORS.xpathMoreButton });

    if (hasMore) await sleep(500);

    return page.evaluate(({ sel, noiseLabels, minLen }) => {
      function xpathAll(expression) {
        const result = document.evaluate(
          expression, document, null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
        );
        const items = [];
        for (let i = 0; i < result.snapshotLength; i++) {
          const item = result.snapshotItem(i);
          if (item) items.push(item);
        }
        return items;
      }

      const applyEl = xpathAll(sel.xpathApplyUrl)[0];
      const applicationUrl = applyEl?.href?.trim() ?? '';

      const titleAnchors = xpathAll(sel.xpathTitle);
      let title = '';
      for (const a of titleAnchors) {
        const text = a.textContent?.trim() ?? '';
        if (text.length >= minLen && !noiseLabels.includes(text.toLowerCase())) {
          title = text;
          break;
        }
      }

      const companyAnchors = xpathAll(sel.xpathCompany);
      const company = companyAnchors[1]?.textContent?.trim() ?? '';

      const jdEl = document.querySelector(sel.jdContent);
      const jdText = jdEl?.innerText?.trim() ?? '';

      const url = window.location.href;

      return { title, company, applicationUrl, jdText, url };
    }, { sel: SELECTORS, noiseLabels: [...NOISE_LABELS], minLen: MIN_POSITION_LENGTH });
  }
}
