/**
 * LinkedIn Scanner
 *
 * All LinkedIn-specific logic: selectors, config parsing, session checks,
 * pagination, card extraction, search URL construction, and the scan loop.
 *
 * Per-card flow (scan loop, wrapped in try/finally for handle disposal):
 *   1. Resolve card element once via #getCard (evaluateHandle)
 *   2. #extractCardPreview() reads title/company/location from the card
 *      DOM without clicking
 *   3. isJobCardViewed() checks for LinkedIn's "Viewed" label — skips
 *      before clicking so viewed cards are never opened
 *   4. Blocklist, dedup (company::title), and title filter run against
 *      the preview — dedup catches cross-portal matches
 *      (Greenhouse/Ashby/Lever via scan-history.tsv)
 *   5. extractJob() clicks the card, gets the job ID from the URL,
 *      scrapes the apply link and JD text from the detail panel
 *   6. Post-click dedup (by job ID), JD filter, apply URL validation
 *   7. Accepted listings and skipped entries are returned to the harness
 *
 * Apply URL resolution:
 *   - External apply link (via xpathApplyUrl) → unwrapped from LinkedIn's
 *     /safety/go redirect
 *   - Easy Apply / no external link → falls back to the listing URL
 *     (https://www.linkedin.com/jobs/view/{JOB_ID}/)
 *
 * Listing URL:
 *   Always stored as https://www.linkedin.com/jobs/view/{JOB_ID}/, extracted
 *   from the currentJobId URL param after clicking the card.
 */


import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Selectors — grouped for easy maintenance when LinkedIn changes DOM
// ---------------------------------------------------------------------------

const SELECTORS = {
  xpathListingCard: "//button[starts-with(@aria-label, 'Dismiss') and contains(@aria-label, 'job')]/ancestor::div[@role='button']",
  /** Dismiss control on each left-rail card; aria-label is `Dismiss {job title} job` (EN UI). */
  cardDismissButtonCss: 'button[aria-label^="Dismiss"][aria-label*=" job"]',
  /** Company name often appears on this anchor when present. */
  cardCompanyLinkQuery: 'a[href*="/company/"]',
  xpathApplyUrl: "//a[@aria-label='Apply on company website']",
  xpathMoreButton: "//span[normalize-space(text())='more']",
  jdContent: 'span[data-testid="expandable-text-box"]',
  loggedIn: 'a[aria-label*="My Network"]',
  xpathCurrentPage: "//button[@aria-current='true'][starts-with(@aria-label, 'Page')]",
  xpathPageButton: "//button[starts-with(@aria-label, 'Page')]",

  viewedStatusTagQuery: 'p, span, li',
  viewedStatusLabels: ['Viewed'],
  /** Characters allowed between the label and the next status token in `innerText` (middle dot, bullet, pipe) */
  viewedStatusLineSeparatorCharClass: '·•|',
};

const NOISE_LABELS = new Set([
  'more', 'show more', 'see more',
  'less', 'show less', 'see less',
  'retry premium',
]);
const CARD_CLICK_DELAY_MS = 1000;
const SESSION_CHECK_DELAY_MS = 3000;
const NAV_TIMEOUT_MS = 30000;
const DEFAULT_DELAY_PAGES_MS = [3000, 8000];
const DEFAULT_DELAY_SEARCHES_MS = [5000, 15000];

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
    const doc = yaml.load(raw);
    const ls = doc.linkedin_searches || {};
    return {
      title_filter: doc.title_filter || { positive: [], negative: [] },
      keywords: ls.keywords || [],
      employer_blocklist: ls.employer_blocklist || [],
      date_posted: ls.date_posted,
      max_results: ls.max_results_per_search,
      delay_pages: ls.delay_between_pages_ms,
      delay_searches: ls.delay_between_searches_ms,
      experience_level: ls.experience_level,
      skip_viewed: ls.skip_viewed,
    };
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
    await page.goto(this.feedUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await sleep(SESSION_CHECK_DELAY_MS);
    return this.isLoggedIn(page);
  }

  // -------------------------------------------------------------------------
  // Scan — the main extraction loop
  //
  // Handles extraction, filtering, dedup, and employer blocklist.
  // Returns only accepted listings ready to be saved.
  //
  // Options: { scanHistory, skipViewed }
  // -------------------------------------------------------------------------

  async scan(context, config, options = {}) {
    const maxPerSearch = options.maxResults || config.max_results || 25;
    const delayPages = config.delay_pages || DEFAULT_DELAY_PAGES_MS;
    const delaySearches = config.delay_searches || DEFAULT_DELAY_SEARCHES_MS;
    const titleFilter = config.title_filter;
    const employerBlocklist = config.employer_blocklist || [];
    const scanHistory = options.scanHistory || new Set();
    /** Omit cards LinkedIn marks as already opened. Default true when `skip_viewed` is absent in portals.yml. */
    const skipViewed = options.skipViewed !== undefined
      ? Boolean(options.skipViewed)
      : config.skip_viewed !== false;

    const keywords = config.keywords || [];
    if (keywords.length === 0) {
      log('No keywords found in portals.yml');
      return null;
    }

    const searches = this.#buildSearches(config);

    const toRun = options.searchFilter
      ? searches.filter(s => s.name === options.searchFilter)
      : searches;

    if (toRun.length === 0) {
      log(`No keyword matching "${options.searchFilter}"`);
      log(`Available: ${searches.map(s => s.name).join(', ')}`);
      return null;
    }

    const listings = [];
    const skipped = [];
    const errors = [];
    const stats = {
      searched: 0, found: 0, extracted: 0,
      skipped_filter: 0, skipped_dedup: 0, skipped_viewed: 0, errors: 0,
    };

    // Circuit breaker: bail out after too many consecutive extraction failures
    const MAX_CONSECUTIVE_FAILURES = 15;
    let consecutiveFailures = 0;

    // Single page for all searches — avoids Playwright stealing window focus
    const page = await context.newPage();

    for (const search of toRun) {
      log(`\n── Search: ${search.name} ──`);
      stats.searched++;
      consecutiveFailures = 0; // reset circuit breaker per search

      try {
        await page.goto(search.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await sleep(randomDelay(delayPages));

        let accepted = 0;
        let hasNextPage = true;

        while (hasNextPage && accepted < maxPerSearch) {
          const currentPage = await this.#getCurrentPage(page);
          log(`Page ${currentPage || 1}`);

          const cardCount = await this.#getCardCount(page);
          log(`Found ${cardCount} job cards`);
          stats.found += cardCount;

          for (let i = 0; i < cardCount; i++) {
            if (accepted >= maxPerSearch) {
              log(`Reached max results (${maxPerSearch}) for this search`);
              break;
            }

            // Circuit breaker: stop if extraction is consistently failing
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              warn(`${MAX_CONSECUTIVE_FAILURES} consecutive extraction failures — stopping this search (likely throttled or DOM changed)`);
              break;
            }

            const card = await this.#getCard(page, i);
            try {
            const cardExists = await page.evaluate(c => c != null, card);
            if (!cardExists) {
              warn(`  ✗ Card ${i} not found`);
              stats.errors++;
              consecutiveFailures++;
              continue;
            }

            // 1. Read title, company, location from card DOM (no click)
            const preview = await this.#extractCardPreview(page, card);

            // 2. Check viewed label (no click)
            if (skipViewed && await this.isJobCardViewed(page, card)) {
              log(`  ✗ Viewed: skipped card ${i}`);
              stats.skipped_viewed++;
              skipped.push({
                url: '',
                title: preview.title || '',
                company: preview.company || '',
                status: 'skipped_viewed_linkedin',
              });
              continue;
            }

            if (!preview.title) {
              warn(`  ✗ No title on card ${i} (preview); skipping`);
              stats.errors++;
              consecutiveFailures++;
              continue;
            }

            // 3. Blocklist, dedup, and title filter (no click)
            if (employerBlocklist.length && preview.company) {
              const companyLower = preview.company.toLowerCase();
              if (employerBlocklist.some(b => companyLower === b.toLowerCase())) {
                log(`  ✗ Blocked employer: ${preview.company}`);
                stats.skipped_filter++;
                continue;
              }
            }

            const companyTitleKey = (preview.company && preview.title)
              ? `${preview.company}::${preview.title}`.toLowerCase() : null;
            if (companyTitleKey && scanHistory.has(companyTitleKey)) {
              log(`  ✗ Already seen: ${preview.title} (${preview.company})`);
              stats.skipped_dedup++;
              skipped.push({
                url: '',
                title: preview.title || '',
                company: preview.company || '',
                status: 'skipped_dup',
              });
              continue;
            }

            if (!this.#matchesFilter(preview.title, '', titleFilter)) {
              log(`  ✗ Filtered: ${preview.title} (${preview.company})`);
              stats.skipped_filter++;
              continue;
            }

            // 4. All pre-click checks passed — click card and extract detail
            const data = await this.extractJob(page, card, preview);
            stats.extracted++;

            // 5. Post-click dedup (by job ID, now available after click)
            const dedupKey = data.jobId || companyTitleKey;
            if (data.jobId && scanHistory.has(data.jobId)) {
              log(`  ✗ Already seen: ${data.title} (${data.company})`);
              stats.skipped_dedup++;
              skipped.push({
                url: data.listingUrl || '',
                title: data.title || '',
                company: data.company || '',
                status: 'skipped_dup',
              });
              continue;
            }

            if (!data.applicationUrl) {
              log(`  ✗ No apply URL: ${data.title} (${data.company})`);
              stats.skipped_filter++;
              continue;
            }

            if (!this.#matchesFilter(data.title, data.jdText || '', titleFilter)) {
              log(`  ✗ Filtered after JD: ${data.title} (${data.company})`);
              stats.skipped_filter++;
              continue;
            }

            if (!data.jdText) {
              warn(`  ✗ No JD content: ${data.title}`);
              stats.errors++;
              consecutiveFailures++;
              continue;
            }

            consecutiveFailures = 0;
            if (dedupKey) scanHistory.add(dedupKey);
            if (companyTitleKey) scanHistory.add(companyTitleKey);
            listings.push({
              title: data.title,
              company: data.company,
              applicationUrl: data.applicationUrl,
              jdText: data.jdText,
              url: data.listingUrl,
            });
            accepted++;
            log(`  ✓ Accepted: ${data.title} at ${data.company}`);
            } finally {
              await card.dispose();
            }
          }

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            hasNextPage = false;
          } else if (accepted < maxPerSearch) {
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
    return { listings, skipped, errors, stats };
  }

  // -------------------------------------------------------------------------
  // Private — filtering
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
    const before = await this.#getCurrentPage(page);
    if (!before) return false;

    const clicked = await page.evaluate(({ xpathAll, targetNum }) => {
      const allResult = document.evaluate(xpathAll, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < allResult.snapshotLength; i++) {
        const btn = allResult.snapshotItem(i);
        const label = btn.getAttribute('aria-label') || '';
        const match = label.match(/Page (\d+)/);
        if (match && parseInt(match[1], 10) === targetNum) {
          btn.click();
          return true;
        }
      }
      return false;
    }, { xpathAll: SELECTORS.xpathPageButton, targetNum: before + 1 });

    if (!clicked) return false;

    // Wait for the page number to actually change
    await page.waitForFunction(({ xpath, expected }) => {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const btn = result.singleNodeValue;
      if (!btn) return false;
      const label = btn.getAttribute('aria-label') || '';
      const match = label.match(/Page (\d+)/);
      return match && parseInt(match[1], 10) === expected;
    }, { xpath: SELECTORS.xpathCurrentPage, expected: before + 1 }, { timeout: NAV_TIMEOUT_MS }).catch(() => {});

    const after = await this.#getCurrentPage(page);
    return after === before + 1;
  }

  // -------------------------------------------------------------------------
  // Private — extraction helpers
  // -------------------------------------------------------------------------

  async #getCardCount(page) {
    return page.evaluate((xpath) => {
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return result.snapshotLength;
    }, SELECTORS.xpathListingCard);
  }

  async #getCard(page, index) {
    return page.evaluateHandle(({ xpath, idx }) => {
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return result.snapshotItem(idx) || null;
    }, { xpath: SELECTORS.xpathListingCard, idx: index });
  }

  /**
   * Click a card and extract the job ID from the resulting URL.
   * LinkedIn updates the URL's currentJobId query param when a card is selected.
   * Returns { clicked, jobId, listingUrl }.
   */
  async #clickAndExtractJobId(page, card) {
    const clicked = await page.evaluate((c) => {
      if (c) { c.click(); return true; }
      return false;
    }, card);
    if (!clicked) return { clicked: false, jobId: '', listingUrl: '' };

    await sleep(CARD_CLICK_DELAY_MS);
    const url = page.url();
    try {
      const jobId = new URL(url).searchParams.get('currentJobId') || '';
      const listingUrl = jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : '';
      return { clicked: true, jobId, listingUrl };
    } catch {
      return { clicked: true, jobId: '', listingUrl: '' };
    }
  }

  /**
   * Read title, company, and location from the card DOM without clicking.
   * Returns { title, company, location }.
   */
  async #extractCardPreview(page, card) {
    return page.evaluate(({ card, sel, noise }) => {
      const noiseSet = new Set((noise || []).map((s) => String(s).toLowerCase()));

      let title = '';
      const dismiss = card.querySelector(sel.cardDismissButtonCss || 'button[aria-label^="Dismiss"]');
      if (dismiss) {
        const al = dismiss.getAttribute('aria-label') || '';
        const m = al.match(/^Dismiss\s+(.+?)\s+job\s*$/i);
        if (m) title = m[1].trim();
      }

      let company = '';
      for (const a of card.querySelectorAll(sel.cardCompanyLinkQuery || 'a[href*="/company/"]')) {
        const t = (a.textContent ?? '').trim();
        if (t.length >= 1 && t.length < 120 && !noiseSet.has(t.toLowerCase())) {
          company = t;
          break;
        }
      }

      function looksLikeLocation(s) {
        return /\((On-?site|Hybrid|Remote)\)/i.test(s)
          || /,\s*[A-Z]{2}\b/.test(s)
          || /\bRemote\b/i.test(s);
      }

      function looksLikeMetaLine(s) {
        const lower = s.toLowerCase();
        return lower === 'viewed'
          || lower === '·'
          || /school alumni work(s)? here/i.test(s)
          || /early applicant/i.test(lower)
          || /^\d+ benefits?$/i.test(s)
          || /^posted on\b/i.test(s)
          || /\b(hour|day|week|month)s?\s+ago$/i.test(s)
          || /^[\d·|•\s]+$/.test(s);
      }

      if (!company) {
        const paragraphs = [...card.querySelectorAll('p')]
          .map((p) => (p.textContent ?? '').trim())
          .filter((t) => t.length > 0 && t.length < 200);
        for (const t of paragraphs) {
          if (noiseSet.has(t.toLowerCase())) continue;
          if (title && (t === title || t.includes(title))) continue;
          if (looksLikeMetaLine(t)) continue;
          if (looksLikeLocation(t)) continue;
          if (t.length < 2) continue;
          company = t;
          break;
        }
      }

      let location = '';
      for (const t of [...card.querySelectorAll('p')].map((p) => (p.textContent ?? '').trim())) {
        if (looksLikeLocation(t) && t !== title && t !== company) {
          location = t;
          break;
        }
      }

      return {
        title: title || '',
        company: company || '',
        location: location || '',
      };
    }, { card, sel: SELECTORS, noise: [...NOISE_LABELS] });
  }

  /**
   * Click a card and extract full detail (job ID, apply URL, JD text).
   * Call only after pre-click checks (viewed, blocklist, dedup, filter) pass.
   * Returns the preview data augmented with jobId, listingUrl, applicationUrl, jdText.
   */
  async extractJob(page, card, preview) {
    const { clicked, jobId, listingUrl } = await this.#clickAndExtractJobId(page, card);
    preview.jobId = jobId;
    preview.listingUrl = listingUrl;
    preview.clicked = clicked;

    if (clicked) {
      const detail = await this.#extractDetailFromPanel(page, jobId);
      preview.applicationUrl = this.#unwrapRedirect(detail.applicationUrl);
      preview.jdText = detail.jdText;
    }

    return preview;
  }

  /**
   * Whether LinkedIn marks the listing card as already opened (see SELECTORS.viewedStatusLabels).
   */
  async isJobCardViewed(page, card) {
    return page.evaluate(({ card, sel }) => {
      const labels = sel.viewedStatusLabels || [];
      const labelSet = new Set(labels.map((s) => String(s).toLowerCase()));
      const tagQuery = sel.viewedStatusTagQuery || 'p, span, li';
      for (const el of card.querySelectorAll(tagQuery)) {
        const t = (el.textContent ?? '').trim();
        if (t && labelSet.has(t.toLowerCase())) return true;
      }

      const sepClass = sel.viewedStatusLineSeparatorCharClass || '·•|';
      const line = (card.innerText ?? '').replace(/\s+/g, ' ').trim();
      for (const raw of labels) {
        const esc = String(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${esc}\\b\\s*[${sepClass}]`, 'i');
        if (re.test(line)) return true;
      }

      return false;
    }, { card, sel: SELECTORS });
  }

  /**
   * Scrape the detail panel (right side) after a card has been clicked.
   * Clicks "more" to expand truncated JDs, then extracts the apply URL
   * and full JD text. Falls back to the listing URL if no external apply
   * link is found (Easy Apply jobs).
   */
  async #extractDetailFromPanel(page, jobId) {
    // Try to expand the description
    await page.evaluate(({ xpath }) => {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const moreSpan = result.singleNodeValue;
      if (moreSpan) moreSpan.click();
    }, { xpath: SELECTORS.xpathMoreButton });
    await sleep(250);

    const detail = await page.evaluate(({ sel, jobId }) => {
      function xpathFirst(expression) {
        const result = document.evaluate(
          expression, document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null
        );
        return result.singleNodeValue;
      }

      const applyEl = xpathFirst(sel.xpathApplyUrl);

      // if no apply url or easy apply button is present, use the listing url
      let applicationUrl = applyEl?.href?.trim() ?? `https://www.linkedin.com/jobs/view/${jobId}/`;


      const jdEl = document.querySelector(sel.jdContent);
      const jdText = jdEl?.innerText?.trim() ?? '';

      return { applicationUrl, jdText };
    }, { sel: SELECTORS, jobId });

    return detail;
  }
}
