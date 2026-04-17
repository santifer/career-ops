// IMPORTANT: CSS selectors are templates — refine after testing against live DOM
/**
 * extract-newgrad.ts — DOM parsers for newgrad-jobs.com pages.
 *
 * Two exported functions, each fully self-contained (no imports, no module
 * closures). They are designed to be passed directly to
 * chrome.scripting.executeScript({ func: ... }) from the background worker.
 *
 * Mode 1: extractNewGradList  — scrapes the job listing table
 * Mode 2: extractNewGradDetail — scrapes an individual job detail page
 */

/* ========================================================================== */
/*  Shared interfaces (compile-time only — stripped at runtime)               */
/* ========================================================================== */

export interface NewGradRow {
  position: number;
  title: string;
  postedAgo: string;
  applyUrl: string;
  detailUrl: string;
  workModel: string;
  location: string;
  company: string;
  salary: string;
  companySize: string;
  industry: string;
  qualifications: string;
  h1bSponsored: boolean;
  sponsorshipSupport: "yes" | "no" | "unknown";
  confirmedSponsorshipSupport: "yes" | "no" | "unknown";
  requiresActiveSecurityClearance: boolean;
  confirmedRequiresActiveSecurityClearance: boolean;
  isNewGrad: boolean;
}

export interface NewGradDetail {
  position: number;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  workModel: string;
  seniorityLevel: string;
  salaryRange: string;
  matchScore: number | null;
  expLevelMatch: number | null;
  skillMatch: number | null;
  industryExpMatch: number | null;
  description: string;
  industries: string[];
  recommendationTags: string[];
  responsibilities: string[];
  requiredQualifications: string[];
  skillTags: string[];
  taxonomy: string[];
  companyWebsite: string | null;
  companyDescription: string | null;
  companySize: string | null;
  companyLocation: string | null;
  companyFoundedYear: string | null;
  companyCategories: string[];
  h1bSponsorLikely: boolean | null;
  sponsorshipSupport: "yes" | "no" | "unknown";
  confirmedSponsorshipSupport: "yes" | "no" | "unknown";
  h1bSponsorshipHistory: { year: string; count: number }[];
  requiresActiveSecurityClearance: boolean;
  confirmedRequiresActiveSecurityClearance: boolean;
  insiderConnections: number | null;
  originalPostUrl: string;
  applyNowUrl: string;
  applyFlowUrls: string[];
}

/* ========================================================================== */
/*  Mode 1 — List page extractor                                             */
/* ========================================================================== */

/**
 * Extracts all job rows from the newgrad-jobs.com listing table.
 * Must be completely self-contained for chrome.scripting.executeScript.
 */
export async function extractNewGradList(): Promise<NewGradRow[]> {
  const MAX_AGE_MINUTES = 24 * 60;
  const INITIAL_RENDER_SETTLE_MS = 400;
  const SCROLL_POLL_MS = 250;
  const MAX_SCROLL_SETTLE_MS = 2500;
  const MAX_SCROLL_STEPS = 80;
  const STABLE_SCROLL_LIMIT = 6;
  type ScrollTarget = {
    root: ParentNode;
    getTop: () => number;
    getMaxTop: () => number;
    getClientHeight: () => number;
    scrollTo: (top: number) => void;
    reset: () => void;
  };

  /* ---- helpers (inlined — no closures) ---- */
  function txt(el: Element | null | undefined): string {
    if (!el) return "";
    return (
      (el as HTMLElement).innerText ?? el.textContent ?? ""
    ).trim();
  }

  function href(el: Element | null | undefined): string {
    if (!el) return "";
    return (el as HTMLAnchorElement).href ?? el.getAttribute("href") ?? "";
  }

  function first(parent: Element, ...selectors: string[]): Element | null {
    for (const sel of selectors) {
      const found = parent.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  function allCells(row: Element): Element[] {
    let cells = Array.from(row.querySelectorAll("td"));
    if (cells.length === 0)
      cells = Array.from(
        row.querySelectorAll("[class*='cell'], [class*='col'], [class*='field']")
      );
    return cells;
  }

  function parseBooleanText(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;
    if (/\b(no|false|not sure|unknown|n\/a)\b/.test(normalized)) return false;
    if (/\b(yes|true)\b/.test(normalized)) return true;
    return /\b(new[\s-]?grad|entry[\s-]?level)\b/.test(normalized);
  }

  function parseSponsorshipStatus(text: string): "yes" | "no" | "unknown" {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return "unknown";
    if (/\b(not sure|unknown|n\/a|unclear)\b/.test(normalized)) return "unknown";
    if (
      /\b(no|false)\b/.test(normalized) ||
      normalized.includes("no sponsorship") ||
      normalized.includes("without sponsorship") ||
      normalized.includes("unable to sponsor") ||
      normalized.includes("cannot sponsor") ||
      normalized.includes("can't sponsor")
    ) {
      return "no";
    }
    if (
      /\b(yes|true)\b/.test(normalized) ||
      normalized.includes("sponsor") ||
      normalized.includes("visa support") ||
      normalized.includes("work authorization support")
    ) {
      return "yes";
    }
    return "unknown";
  }

  function requiresActiveSecurityClearance(text: string): boolean {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return false;
    const segments = normalized
      .split(/[\n\r.;!?]+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      if (
        /\b(preferred|preference|nice to have|plus|public trust)\b/.test(segment) ||
        /\b(ability|eligible|eligibility|able)\s+to\s+obtain\b/.test(segment) ||
        /\bobtain(?:ed|ing)?\b/.test(segment)
      ) {
        continue;
      }
      if (
        /\b(active|current)\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(active|current)\s+security\s+clearance\b/.test(segment) ||
        /\btop\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(?:current\s+)?ts\/sci(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\b(?:secret|top\s+secret|ts\/sci)(?:\s+security)?\s+clearance\b/.test(
          segment,
        ) ||
        (
          segment.length <= 120 &&
          /\b(top secret|ts\/sci)\b/.test(segment)
        )
      ) {
        return true;
      }
    }

    return false;
  }

  function parsePostedAgoMinutes(text: string): number {
    const normalized = text.trim().toLowerCase();
    if (
      normalized === "just now" ||
      normalized === "today" ||
      normalized === "moments ago" ||
      normalized === "a moment ago"
    ) {
      return 0;
    }

    const longMatch = /^(\d+)\s+([a-z]+)\s+ago$/.exec(normalized);
    if (longMatch) {
      const value = Number(longMatch[1]);
      const unit = longMatch[2];
      if (unit?.startsWith("minute") || unit?.startsWith("min")) return value;
      if (unit?.startsWith("hour") || unit === "hr" || unit === "hrs") return value * 60;
      if (unit?.startsWith("day")) return value * 1440;
      if (unit?.startsWith("week")) return value * 10080;
    }

    const shortMatch = /^(\d+)([mhdw])\s+ago$/.exec(normalized);
    if (shortMatch) {
      const value = Number(shortMatch[1]);
      const unit = shortMatch[2];
      if (unit === "m") return value;
      if (unit === "h") return value * 60;
      if (unit === "d") return value * 1440;
      if (unit === "w") return value * 10080;
    }

    return Number.POSITIVE_INFINITY;
  }

  function extractPostedAgoText(rowText: string): string {
    const normalized = rowText.replace(/\s+/g, " ").trim();
    const match = normalized.match(
      /\b(just now|today|moments ago|a moment ago|\d+\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s+ago|\d+\s*[mhdw]\s+ago)\b/i,
    );
    return match?.[1]?.trim() ?? "";
  }

  function rowKey(row: NewGradRow): string {
    return [
      row.detailUrl || row.applyUrl || "",
      row.title,
      row.company,
      row.location,
      row.postedAgo,
    ]
      .join("|")
      .trim()
      .toLowerCase();
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function rowDomSnapshot(root: ParentNode = document): string {
    return locateRows(root)
      .slice(0, 12)
      .map((row) => {
        const text = txt(row).replace(/\s+/g, " ").trim().slice(0, 160);
        const links = Array.from(row.querySelectorAll("a[href]"))
          .slice(0, 2)
          .map((link) => href(link))
          .join("|");
        return `${links}::${text}`;
      })
      .join("\n");
  }

  async function waitForRowsToChange(
    root: ParentNode,
    previousSnapshot: string,
  ): Promise<string> {
    let elapsed = 0;
    while (elapsed < MAX_SCROLL_SETTLE_MS) {
      await sleep(SCROLL_POLL_MS);
      elapsed += SCROLL_POLL_MS;
      const nextSnapshot = rowDomSnapshot(root);
      if (nextSnapshot && nextSnapshot !== previousSnapshot) {
        return nextSnapshot;
      }
    }
    return rowDomSnapshot(root);
  }

  function locateRows(root: ParentNode = document): Element[] {
    let rows = Array.from(root.querySelectorAll("table tbody tr"));
    if (rows.length === 0) {
      rows = Array.from(
        root.querySelectorAll(
          "[class*='job-row'], [class*='listing-row'], [class*='job'] tr, [class*='listing'] tr"
        )
      );
    }
    if (rows.length === 0) {
      // Fallback: any repeated card-like structure with links
      rows = Array.from(
        root.querySelectorAll(
          "[class*='job-card'], [class*='job-item'], [class*='listing-item']"
        )
      );
    }
    return rows;
  }

  function elementScrollTarget(element: HTMLElement): ScrollTarget {
    return {
      root: element,
      getTop: () => element.scrollTop,
      getMaxTop: () => Math.max(0, element.scrollHeight - element.clientHeight),
      getClientHeight: () => element.clientHeight,
      scrollTo: (top) => {
        element.scrollTop = top;
      },
      reset: () => {
        element.scrollTop = 0;
      },
    };
  }

  function documentScrollTarget(): ScrollTarget | null {
    const scrollElement = document.scrollingElement ?? document.documentElement;
    const maxTop = Math.max(
      scrollElement.scrollHeight,
      document.body?.scrollHeight ?? 0,
      document.documentElement.scrollHeight,
    ) - window.innerHeight;
    if (maxTop <= 120) return null;

    return {
      root: document,
      getTop: () => window.scrollY || scrollElement.scrollTop,
      getMaxTop: () => Math.max(
        0,
        Math.max(
          scrollElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
          document.documentElement.scrollHeight,
        ) - window.innerHeight,
      ),
      getClientHeight: () => window.innerHeight,
      scrollTo: (top) => {
        window.scrollTo(0, top);
        scrollElement.scrollTop = top;
      },
      reset: () => {
        window.scrollTo(0, 0);
        scrollElement.scrollTop = 0;
      },
    };
  }

  function findScrollableTarget(): ScrollTarget | null {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        "div, main, section, aside, ul, article, table, [role='list'], [role='grid'], [role='table'], [class*='scroll'], [class*='table']"
      )
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY.toLowerCase();
      const isScrollable =
        overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay" ||
        el.scrollHeight > el.clientHeight + 120;
      if (!isScrollable) return false;
      if (el.scrollHeight <= el.clientHeight + 120) return false;

      const visibleRows = locateRows(el).length;
      const jobLinks = el.querySelectorAll("a[href]").length;
      return visibleRows >= 3 || jobLinks >= 10;
    });

    candidates.sort((a, b) => {
      const aRows = locateRows(a).length;
      const bRows = locateRows(b).length;
      if (aRows !== bRows) return bRows - aRows;
      return b.clientHeight - a.clientHeight;
    });

    if (candidates[0]) return elementScrollTarget(candidates[0]);
    return documentScrollTarget();
  }

  function extractVisibleRows(root: ParentNode = document): NewGradRow[] {
    const rows = locateRows(root);
    const results: NewGradRow[] = [];

    for (const [i, row] of rows.entries()) {
      const cells = allCells(row);

      // Try to find an apply link anywhere in the row
      const applyLink = first(
        row,
        "a[href*='jobs/info/']",
        "a[href*='apply']",
        "a[href*='Apply']",
        "a[class*='apply']",
        "a[data-action*='apply']"
      );

      // Try to find the detail/title link (first internal link that is NOT the apply link)
      const allLinks = Array.from(row.querySelectorAll("a[href]"));
      const detailLink = allLinks.find(
        (a) =>
          a !== applyLink &&
          !href(a).toLowerCase().includes("apply") &&
          href(a).startsWith("/")
      ) ?? allLinks.find(
        (a) =>
          a !== applyLink &&
          !href(a).toLowerCase().includes("apply") &&
          href(a).includes("newgrad-jobs.com")
      ) ?? allLinks[0] ?? null;

      // Heuristic extraction: try cell-based first, fall back to row-level text
      const titleEl = first(
        row,
        "[class*='title']",
        "[class*='position']",
        "[data-field='title']",
        "a[href]:not([href*='apply'])"
      );

      const companyEl = first(
        row,
        "[class*='company']",
        "[data-field='company']"
      );

      const locationEl = first(
        row,
        "[class*='location']",
        "[data-field='location']"
      );

      const salaryEl = first(
        row,
        "[class*='salary']",
        "[class*='compensation']",
        "[data-field='salary']"
      );

      const postedEl = first(
        row,
        "[class*='posted']",
        "[class*='date']",
        "[class*='time']",
        "[data-field='posted']",
        "time"
      );

      const workModelEl = first(
        row,
        "[class*='work-model']",
        "[class*='remote']",
        "[class*='onsite']",
        "[class*='hybrid']",
        "[data-field='workModel']"
      );

      const companySizeEl = first(
        row,
        "[class*='size']",
        "[class*='company-size']",
        "[data-field='companySize']"
      );

      const industryEl = first(
        row,
        "[class*='industry']",
        "[data-field='industry']"
      );

      const qualsEl = first(
        row,
        "[class*='qual']",
        "[class*='requirement']",
        "[data-field='qualifications']"
      );

      const h1bEl = first(
        row,
        "[class*='h1b']",
        "[class*='sponsor']",
        "[class*='visa']",
        "[data-field='h1b']"
      );

      const newGradEl = first(
        row,
        "[class*='new-grad']",
        "[class*='newgrad']",
        "[class*='entry-level']",
        "[data-field='isNewGrad']"
      );

      // The live Jobright table currently includes a sticky index column at 0.
      const titleText = txt(titleEl) || (cells[1] ? txt(cells[1]) : "");
      const rowText = txt(row);
      const postedText =
        extractPostedAgoText(rowText) ||
        extractPostedAgoText(txt(postedEl)) ||
        (cells[2] ? extractPostedAgoText(txt(cells[2])) || txt(cells[2]) : "");
      const workModelText = txt(workModelEl) || (cells[4] ? txt(cells[4]) : "");
      const locationText = txt(locationEl) || (cells[5] ? txt(cells[5]) : "");
      const companyText = txt(companyEl) || (cells[6] ? txt(cells[6]) : "");
      const salaryText = txt(salaryEl) || (cells[7] ? txt(cells[7]) : "");
      const companySizeText =
        txt(companySizeEl) || (cells[8] ? txt(cells[8]) : "");
      const industryText = txt(industryEl) || (cells[9] ? txt(cells[9]) : "");
      const qualsText = txt(qualsEl) || (cells[10] ? txt(cells[10]) : "");
      const h1bText = txt(h1bEl) || (cells[11] ? txt(cells[11]) : "");
      const newGradText = txt(newGradEl) || (cells[12] ? txt(cells[12]) : "");
      const sponsorshipSupport = parseSponsorshipStatus(h1bText);

      // Skip completely empty rows (header, separator, etc.)
      if (!titleText && !companyText) continue;
      if (parsePostedAgoMinutes(postedText) > MAX_AGE_MINUTES) continue;

      results.push({
        position: i + 1,
        title: titleText,
        postedAgo: postedText,
        applyUrl: href(applyLink),
        detailUrl: href(detailLink),
        workModel: workModelText,
        location: locationText,
        company: companyText,
        salary: salaryText,
        companySize: companySizeText,
        industry: industryText,
        qualifications: qualsText.slice(0, 500),
        h1bSponsored: sponsorshipSupport === "yes",
        sponsorshipSupport,
        confirmedSponsorshipSupport: "unknown",
        requiresActiveSecurityClearance: requiresActiveSecurityClearance(
          `${titleText} ${qualsText} ${rowText}`,
        ),
        confirmedRequiresActiveSecurityClearance: false,
        isNewGrad: parseBooleanText(newGradText),
      });
    }

    return results;
  }

  const collected = new Map<string, NewGradRow>();

  function mergeRows(rows: NewGradRow[]): void {
    for (const row of rows) {
      const key = rowKey(row);
      if (!key || collected.has(key)) continue;
      collected.set(key, {
        ...row,
        position: collected.size + 1,
      });
    }
  }

  function visibleRowsAreOlderThan24h(root: ParentNode): boolean {
    const rows = locateRows(root);
    if (rows.length === 0) return false;

    let parsed = 0;
    let recent = 0;
    let old = 0;

    for (const row of rows) {
      const postedText = extractPostedAgoText(txt(row));
      const minutesAgo = parsePostedAgoMinutes(postedText);
      if (!isFinite(minutesAgo)) continue;
      parsed += 1;
      if (minutesAgo < MAX_AGE_MINUTES) recent += 1;
      else old += 1;
    }

    return parsed > 0 && old > 0 && recent === 0;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    mergeRows(extractVisibleRows());
    if (collected.size > 0) break;
    await sleep(INITIAL_RENDER_SETTLE_MS);
  }

  const scrollTarget = findScrollableTarget();
  if (!scrollTarget) {
    return Array.from(collected.values());
  }

  let stableIterations = 0;
  let oldOnlyIterations = 0;
  let lastDomSnapshot = rowDomSnapshot(scrollTarget.root);
  let lastIterationSnapshot = "";

  for (let step = 0; step < MAX_SCROLL_STEPS; step += 1) {
    const previousTop = scrollTarget.getTop();
    const nextTop = Math.min(
      previousTop + Math.max(Math.floor(scrollTarget.getClientHeight() * 0.85), 320),
      scrollTarget.getMaxTop(),
    );

    if (nextTop === previousTop) {
      stableIterations += 1;
      if (stableIterations >= STABLE_SCROLL_LIMIT) break;
    } else {
      const previousSnapshot = lastDomSnapshot || rowDomSnapshot(scrollTarget.root);
      scrollTarget.scrollTo(nextTop);
      lastDomSnapshot = await waitForRowsToChange(scrollTarget.root, previousSnapshot);
      mergeRows(extractVisibleRows(scrollTarget.root));
    }

    if (visibleRowsAreOlderThan24h(scrollTarget.root)) {
      oldOnlyIterations += 1;
      if (oldOnlyIterations >= 2) break;
    } else {
      oldOnlyIterations = 0;
    }

    const snapshot = [
      collected.size,
      scrollTarget.getTop(),
      scrollTarget.getMaxTop(),
      locateRows(scrollTarget.root).length,
      lastDomSnapshot,
    ].join(":");

    if (snapshot === lastIterationSnapshot) {
      stableIterations += 1;
      if (stableIterations >= STABLE_SCROLL_LIMIT) break;
    } else {
      stableIterations = 0;
      lastIterationSnapshot = snapshot;
    }
  }

  scrollTarget.reset();
  return Array.from(collected.values());
}

/* ========================================================================== */
/*  Mode 2 — Detail page extractor                                           */
/* ========================================================================== */

/**
 * Extracts enriched job data from a newgrad-jobs.com detail page.
 * The `position` field is set to 0 here; the caller should override it
 * for correlation with the listing table.
 *
 * Must be completely self-contained for chrome.scripting.executeScript.
 */
export function extractNewGradDetail(): NewGradDetail {
  const MAX_DESC_CHARS = 20000;

  /* ---- helpers (inlined — no closures) ---- */
  function txt(el: Element | null | undefined): string {
    if (!el) return "";
    return (
      (el as HTMLElement).innerText ?? el.textContent ?? ""
    ).trim();
  }

  function href(el: Element | null | undefined): string {
    if (!el) return "";
    return (el as HTMLAnchorElement).href ?? el.getAttribute("href") ?? "";
  }

  function first(root: Document | Element, ...selectors: string[]): Element | null {
    for (const sel of selectors) {
      try {
        const found = root.querySelector(sel);
        if (found) return found;
      } catch {
        // Invalid selector — skip
      }
    }
    return null;
  }

  /**
   * Find a labelled value: given a label like "Location", search for a
   * DOM element whose text matches, then return the text of its next
   * sibling, parent's next sibling, or adjacent element.
   */
  function labelledValue(label: string): string {
    const allEls = Array.from(
      document.querySelectorAll(
        "dt, th, label, strong, b, [class*='label'], [class*='key'], [class*='field-name']"
      )
    );
    const lower = label.toLowerCase();
    for (const el of allEls) {
      const elText = txt(el).toLowerCase();
      if (elText.includes(lower)) {
        // Try next sibling element
        const next = el.nextElementSibling;
        if (next) {
          const val = txt(next);
          if (val) return val;
        }
        // Try parent's next sibling
        const parentNext = el.parentElement?.nextElementSibling;
        if (parentNext) {
          const val = txt(parentNext);
          if (val) return val;
        }
        // Try the text after the label within the same parent
        const parentText = txt(el.parentElement);
        const idx = parentText.toLowerCase().indexOf(lower);
        if (idx >= 0) {
          const afterLabel = parentText.slice(idx + label.length).replace(/^[:\s]+/, "").trim();
          if (afterLabel) return afterLabel;
        }
      }
    }
    return "";
  }

  function parseSponsorshipStatus(text: string): "yes" | "no" | "unknown" {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return "unknown";
    if (/\b(not sure|unknown|n\/a|unclear)\b/.test(normalized)) return "unknown";
    if (
      /\b(no|false)\b/.test(normalized) ||
      normalized.includes("no sponsorship") ||
      normalized.includes("without sponsorship") ||
      normalized.includes("unable to sponsor") ||
      normalized.includes("cannot sponsor") ||
      normalized.includes("can't sponsor")
    ) {
      return "no";
    }
    if (
      /\b(yes|true)\b/.test(normalized) ||
      normalized.includes("sponsor") ||
      normalized.includes("visa support") ||
      normalized.includes("work authorization support")
    ) {
      return "yes";
    }
    return "unknown";
  }

  function requiresActiveSecurityClearance(text: string): boolean {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return false;
    const segments = normalized
      .split(/[\n\r.;!?]+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      if (
        /\b(preferred|preference|nice to have|plus|public trust)\b/.test(segment) ||
        /\b(ability|eligible|eligibility|able)\s+to\s+obtain\b/.test(segment) ||
        /\bobtain(?:ed|ing)?\b/.test(segment)
      ) {
        continue;
      }
      if (
        /\b(active|current)\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(active|current)\s+security\s+clearance\b/.test(segment) ||
        /\btop\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(?:current\s+)?ts\/sci(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\b(?:secret|top\s+secret|ts\/sci)(?:\s+security)?\s+clearance\b/.test(
          segment,
        ) ||
        (
          segment.length <= 120 &&
          /\b(top secret|ts\/sci)\b/.test(segment)
        )
      ) {
        return true;
      }
    }

    return false;
  }

  function normalizeEmploymentTypeValue(...candidates: string[]): string {
    for (const candidate of candidates) {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) continue;
      if (/\bfull[-\s]?time\b/.test(normalized)) return "Full-time";
      if (/\bpart[-\s]?time\b/.test(normalized)) return "Part-time";
      if (/\bcontract(or)?\b/.test(normalized)) return "Contract";
      if (/\bintern(ship)?\b/.test(normalized)) return "Internship";
    }
    return "";
  }

  function normalizeSeniorityValue(titleText: string, ...candidates: string[]): string {
    const titleNormalized = titleText.trim().toLowerCase();
    if (
      /\b(new grad|new graduate|graduate|entry level|entry-level|associate|junior|engineer i|engineer 1)\b/.test(
        titleNormalized,
      )
    ) {
      return "Early career";
    }
    if (/\b(senior|staff|principal|lead|manager|director|architect)\b/.test(titleNormalized)) {
      return "Senior";
    }

    for (const candidate of candidates) {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) continue;
      if (
        /\b(entry|entry level|associate|junior|new grad|new graduate|graduate|early career|engineer i|engineer 1)\b/.test(
          normalized,
        )
      ) {
        return "Early career";
      }
      if (/\b(senior|staff|principal|lead|manager|director|architect)\b/.test(normalized)) {
        return "Senior";
      }
    }

    return "";
  }

  function addCandidate(set: Set<string>, value: string | null | undefined): void {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      const parsed = new URL(trimmed, window.location.href);
      if (!/^https?:$/.test(parsed.protocol)) return;
      parsed.hash = "";
      set.add(parsed.toString());
    } catch {
      // Ignore malformed URLs
    }
  }

  function scoreCandidate(candidate: string): number {
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      const full = `${host}${path}${parsed.search.toLowerCase()}`;
      const atsHosts = [
        "greenhouse",
        "ashbyhq.com",
        "lever.co",
        "workdayjobs.com",
        "myworkdayjobs.com",
        "smartrecruiters.com",
        "jobvite.com",
        "icims.com",
      ];
      const noiseHosts = [
        "linkedin.com",
        "crunchbase.com",
        "glassdoor.com",
        "facebook.com",
        "instagram.com",
        "x.com",
        "twitter.com",
        "youtube.com",
        "marketbeat.com",
        "media.licdn.com",
      ];
      const applyHints = [
        "/apply",
        "/job",
        "/jobs",
        "/career",
        "/careers",
        "/position",
        "/positions",
        "gh_jid",
        "jobid",
        "job_id",
        "requisition",
        "req_id",
        "token=",
        "lever-source",
        "ashby_jid",
      ];

      if (noiseHosts.some((pattern) => host.includes(pattern))) return -100;

      let score = 0;
      if (atsHosts.some((pattern) => host.includes(pattern))) score += 100;
      if (applyHints.some((pattern) => full.includes(pattern))) score += 24;
      if (/\b(apply|job|jobs|career|careers|position|opening|opportunit)\b/.test(full)) {
        score += 12;
      }
      if (host === "jobright.ai" || host.endsWith(".jobright.ai")) {
        score -= 80;
        if (path.startsWith("/jobs/info/")) score -= 30;
      } else {
        score += 40;
      }

      return score;
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
  }

  function pickBestUrl(candidates: Iterable<string>): string {
    let best = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const score = scoreCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  function collectScriptUrls(): string[] {
    const urls = new Set<string>();
    const inlineUrlPattern = /https?:\/\/[^\s"'<>]+/g;

    function visit(value: unknown): void {
      if (typeof value === "string") {
        addCandidate(urls, value);
        for (const match of value.match(inlineUrlPattern) ?? []) {
          addCandidate(urls, match);
        }
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (value && typeof value === "object") {
        for (const entry of Object.values(value as Record<string, unknown>)) {
          visit(entry);
        }
      }
    }

    const scripts = Array.from(
      document.querySelectorAll(
        "script#jobright-helper-job-detail-info, script#__NEXT_DATA__, script#job-posting, script[type='application/json'], script[type='application/ld+json']"
      )
    );
    for (const script of scripts) {
      const raw = script.textContent?.trim();
      if (!raw) continue;
      try {
        visit(JSON.parse(raw));
      } catch {
        for (const match of raw.match(inlineUrlPattern) ?? []) {
          addCandidate(urls, match);
        }
      }
    }

    return Array.from(urls);
  }

  function collectDomUrls(): string[] {
    const urls = new Set<string>();
    const elements = Array.from(
      document.querySelectorAll(
        "a[href], form[action], [data-url], [data-href], [data-apply-url], [data-link], button, [role='button']"
      )
    );

    for (const element of elements) {
      addCandidate(urls, href(element));

      if (element instanceof HTMLFormElement) addCandidate(urls, element.action);
      if (element instanceof HTMLElement) {
        addCandidate(urls, element.dataset.url);
        addCandidate(urls, element.dataset.href);
        addCandidate(urls, element.dataset.applyUrl);
        addCandidate(urls, element.dataset.link);
      }

      const text = txt(element).toLowerCase();
      if (
        element instanceof HTMLAnchorElement &&
        (
          text.includes("original") ||
          text.includes("apply on employer site") ||
          text.includes("apply now") ||
          text.includes("join now") ||
          text.includes("apply for")
        )
      ) {
        addCandidate(urls, element.href);
      }
    }

    return Array.from(urls);
  }

  function uniqueStrings(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    for (const value of values) {
      if (!value) continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      seen.add(trimmed);
    }
    return Array.from(seen);
  }

  function splitValues(value: string | null | undefined): string[] {
    if (!value) return [];
    return value
      .split(/[,|\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function parseJobrightData(): {
    jobResult?: Record<string, unknown>;
    companyResult?: Record<string, unknown>;
    jobPosting?: Record<string, unknown>;
  } {
    const result: {
      jobResult?: Record<string, unknown>;
      companyResult?: Record<string, unknown>;
      jobPosting?: Record<string, unknown>;
    } = {};

    const helperRaw = document.querySelector("script#jobright-helper-job-detail-info")?.textContent?.trim();
    if (helperRaw) {
      try {
        const parsed = JSON.parse(helperRaw) as {
          jobResult?: Record<string, unknown>;
          companyResult?: Record<string, unknown>;
        };
        if (parsed.jobResult) result.jobResult = parsed.jobResult;
        if (parsed.companyResult) result.companyResult = parsed.companyResult;
      } catch {
        // Ignore malformed embedded JSON
      }
    }

    const nextRaw = document.querySelector("script#__NEXT_DATA__")?.textContent?.trim();
    if (nextRaw) {
      try {
        const parsed = JSON.parse(nextRaw) as {
          props?: {
            pageProps?: {
              dataSource?: {
                jobResult?: Record<string, unknown>;
                companyResult?: Record<string, unknown>;
              };
            };
          };
        };
        const dataSource = parsed.props?.pageProps?.dataSource;
        if (!result.jobResult && dataSource?.jobResult) result.jobResult = dataSource.jobResult;
        if (!result.companyResult && dataSource?.companyResult) result.companyResult = dataSource.companyResult;
      } catch {
        // Ignore malformed __NEXT_DATA__
      }
    }

    const jobPostingRaw = document.querySelector("script#job-posting")?.textContent?.trim();
    if (jobPostingRaw) {
      try {
        result.jobPosting = JSON.parse(jobPostingRaw) as Record<string, unknown>;
      } catch {
        // Ignore malformed ld+json
      }
    }

    return result;
  }

  /* ---- title ---- */
  const titleEl = first(
    document,
    "h1[class*='title']",
    "h1[class*='job']",
    "[class*='job-title']",
    "[class*='position-title']",
    "h1"
  );
  const title = txt(titleEl);

  /* ---- company ---- */
  const companyEl = first(
    document,
    "[class*='company-name']",
    "[class*='company'] h2",
    "[class*='company'] a",
    "[class*='employer']"
  );
  const company = txt(companyEl) || labelledValue("company");

  /* ---- location ---- */
  const locationEl = first(
    document,
    "[class*='location']",
    "[class*='job-location']"
  );
  const location = txt(locationEl) || labelledValue("location");

  /* ---- employment type ---- */
  const employmentType = normalizeEmploymentTypeValue(
    labelledValue("employment type"),
    labelledValue("job type"),
    labelledValue("time type"),
  );

  /* ---- work model ---- */
  const workModelEl = first(
    document,
    "[class*='work-model']",
    "[class*='remote']",
    "[class*='workplace']"
  );
  const workModel =
    txt(workModelEl) ||
    labelledValue("work model") ||
    labelledValue("workplace type") ||
    labelledValue("remote");

  /* ---- seniority level ---- */
  const seniorityLevel = normalizeSeniorityValue(
    title,
    labelledValue("seniority"),
    labelledValue("experience level"),
    labelledValue("career level"),
  );

  /* ---- salary range ---- */
  const salaryEl = first(
    document,
    "[class*='salary']",
    "[class*='compensation']",
    "[class*='pay']"
  );
  const salaryRange =
    txt(salaryEl) ||
    labelledValue("salary") ||
    labelledValue("compensation") ||
    labelledValue("pay range");

  /* ---- Jobright match scores ---- */
  const bodyText = document.body?.innerText ?? "";

  function extractPercentage(pattern: RegExp): number | null {
    const m = bodyText.match(pattern);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }

  // Overall match: "85% GOOD MATCH" or "92% GREAT MATCH"
  const matchScore = extractPercentage(
    /(\d+)\s*%\s*(?:GOOD\s+MATCH|GREAT\s+MATCH|MATCH)/i
  );

  // Sub-scores: "Experience Level Match 80%" or "Experience Level: 80%"
  const expLevelMatch = extractPercentage(
    /experience\s+level\s*(?:match)?\s*[:\s]*(\d+)\s*%/i
  );

  // "Skill Match 75%" or "Skills: 75%"
  const skillMatch = extractPercentage(
    /skills?\s*(?:match)?\s*[:\s]*(\d+)\s*%/i
  );

  // "Industry Experience Match 60%"
  const industryExpMatch = extractPercentage(
    /industry\s*(?:experience)?\s*(?:match)?\s*[:\s]*(\d+)\s*%/i
  );

  /* ---- description ---- */
  const descEl = first(
    document,
    "[class*='description']",
    "[class*='job-details']",
    "[class*='job-body']",
    "[class*='jd-content']",
    "article",
    "main [class*='content']",
    "main"
  );
  const rawDesc = txt(descEl) || txt(document.querySelector("main")) || "";
  const description = rawDesc
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, MAX_DESC_CHARS);

  const embedded = parseJobrightData();
  const jobResult = embedded.jobResult ?? {};
  const companyResult = embedded.companyResult ?? {};
  const jobPosting = embedded.jobPosting ?? {};

  const domSkillTags = Array.from(
    document.querySelectorAll(".ant-tag, [class*='qualification-tag'], [class*='skill-tag'], [class*='tag']")
  ).map((el) => txt(el));

  const industries = uniqueStrings([
    ...splitValues(String(companyResult.companyCategories ?? "")),
    ...splitValues(String(jobPosting.industry ?? "")),
    ...(Array.isArray(jobResult.jobTags) ? jobResult.jobTags.map((value) => String(value)) : []),
  ]);
  const recommendationTags = uniqueStrings(
    Array.isArray(jobResult.recommendationTags)
      ? jobResult.recommendationTags.map((value) => String(value))
      : []
  );
  const responsibilities = uniqueStrings(
    Array.isArray(jobResult.coreResponsibilities)
      ? jobResult.coreResponsibilities.map((value) => String(value))
      : []
  );
  const requiredQualifications = uniqueStrings([
    ...(Array.isArray(jobResult.skillSummaries)
      ? jobResult.skillSummaries.map((value) => String(value))
      : []),
    ...(
      jobResult.qualifications &&
      typeof jobResult.qualifications === "object" &&
      Array.isArray((jobResult.qualifications as { mustHave?: unknown[] }).mustHave)
        ? ((jobResult.qualifications as { mustHave?: unknown[] }).mustHave ?? []).map((value) => String(value))
        : []
    ),
    ...(
      jobResult.qualifications &&
      typeof jobResult.qualifications === "object" &&
      Array.isArray((jobResult.qualifications as { preferredHave?: unknown[] }).preferredHave)
        ? ((jobResult.qualifications as { preferredHave?: unknown[] }).preferredHave ?? []).map((value) => String(value))
        : []
    ),
  ]);
  const skillTags = uniqueStrings([
    ...(Array.isArray(jobResult.jdCoreSkills)
      ? jobResult.jdCoreSkills
          .map((value) =>
            value && typeof value === "object" && "skill" in value
              ? String((value as { skill?: unknown }).skill ?? "")
              : ""
          )
      : []),
    ...(Array.isArray(jobResult.skillMatchingScores)
      ? jobResult.skillMatchingScores
          .map((value) =>
            value && typeof value === "object" && "displayName" in value
              ? String((value as { displayName?: unknown }).displayName ?? "")
              : ""
          )
      : []),
    ...domSkillTags,
  ]);
  const taxonomy = uniqueStrings(
    Array.isArray(jobResult.jobTaxonomyV3)
      ? jobResult.jobTaxonomyV3.map((value) => String(value))
      : []
  );
  const companyWebsite =
    (typeof companyResult.companyURL === "string" ? companyResult.companyURL : null) ||
    (
      jobPosting.hiringOrganization &&
      typeof jobPosting.hiringOrganization === "object" &&
      typeof (jobPosting.hiringOrganization as { sameAs?: unknown }).sameAs === "string"
        ? String((jobPosting.hiringOrganization as { sameAs?: unknown }).sameAs)
        : null
    );
  const companyDescription =
    typeof companyResult.companyDesc === "string" ? companyResult.companyDesc : null;
  const companySize =
    typeof companyResult.companySize === "string" ? companyResult.companySize : null;
  const companyLocation =
    typeof companyResult.companyLocation === "string" ? companyResult.companyLocation : null;
  const companyFoundedYear =
    typeof companyResult.companyFoundYear === "string" ? companyResult.companyFoundYear : null;
  const companyCategories = uniqueStrings(
    splitValues(typeof companyResult.companyCategories === "string" ? companyResult.companyCategories : "")
  );
  const h1bSponsorLikely =
    typeof jobResult.isH1bSponsor === "boolean"
      ? jobResult.isH1bSponsor
      : bodyText.toLowerCase().includes("h1b sponsor likely")
        ? true
        : null;
  const sponsorshipSupport =
    typeof jobResult.isH1bSponsor === "boolean"
      ? jobResult.isH1bSponsor
        ? "yes"
        : "no"
      : parseSponsorshipStatus(bodyText);
  const h1bSponsorshipHistory = Array.isArray(companyResult.h1bAnnualJobCount)
    ? companyResult.h1bAnnualJobCount
        .map((value) => {
          if (!value || typeof value !== "object") return null;
          const year = String((value as { year?: unknown }).year ?? "").trim();
          const count = Number((value as { count?: unknown }).count ?? NaN);
          if (!year || Number.isNaN(count)) return null;
          return { year, count };
        })
        .filter((value): value is { year: string; count: number } => value !== null)
    : [];
  const insiderConnections = Array.isArray(jobResult.socialConnections)
    ? jobResult.socialConnections.length
    : null;
  const activeSecurityClearanceRequired = requiresActiveSecurityClearance(
    [
      bodyText,
      description,
      requiredQualifications.join(" "),
      recommendationTags.join(" "),
    ].join(" "),
  );

  /* ---- original/apply URLs ---- */
  const origLink = first(
    document,
    "a[href*='original']",
    "a[class*='original']"
  );
  const originalCandidates = new Set<string>();
  addCandidate(originalCandidates, href(origLink));
  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    const linkText = txt(a).toLowerCase();
    if (
      linkText.includes("original") &&
      (linkText.includes("post") || linkText.includes("job"))
    ) {
      addCandidate(originalCandidates, href(a));
    }
  }

  const applyLink = first(
    document,
    "a[href*='greenhouse']",
    "a[href*='ashby']",
    "a[href*='lever.co']",
    "a[href*='workdayjobs']",
    "a[href*='myworkdayjobs']",
    "a[href*='smartrecruiters']",
    "a[href*='jobvite']",
    "a[href*='icims']",
    "a[href*='apply'][class*='btn']",
    "a[href*='apply'][class*='button']",
    "a[href*='apply']",
    "button[class*='apply']",
    "[class*='apply'] a",
    "a[class*='apply']"
  );
  const applyCandidates = new Set<string>();
  addCandidate(applyCandidates, href(applyLink));
  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    const linkText = txt(a).toLowerCase();
    if (
      linkText.includes("apply on employer site") ||
      linkText.includes("apply now") ||
      linkText.includes("join now") ||
      linkText.includes("apply for")
    ) {
      addCandidate(applyCandidates, href(a));
    }
  }

  const domCandidates = collectDomUrls();
  const scriptCandidates = collectScriptUrls();
  for (const candidate of domCandidates) {
    addCandidate(originalCandidates, candidate);
    addCandidate(applyCandidates, candidate);
  }
  for (const candidate of scriptCandidates) {
    addCandidate(originalCandidates, candidate);
    addCandidate(applyCandidates, candidate);
  }

  const originalPostUrl = pickBestUrl(originalCandidates);
  const applyNowUrl = pickBestUrl(applyCandidates);

  return {
    position: 0,
    title,
    company,
    location,
    employmentType,
    workModel,
    seniorityLevel,
    salaryRange,
    matchScore,
    expLevelMatch,
    skillMatch,
    industryExpMatch,
    description,
    industries,
    recommendationTags,
    responsibilities,
    requiredQualifications,
    skillTags,
    taxonomy,
    companyWebsite,
    companyDescription,
    companySize,
    companyLocation,
    companyFoundedYear,
    companyCategories,
    h1bSponsorLikely,
    sponsorshipSupport,
    confirmedSponsorshipSupport: "unknown",
    h1bSponsorshipHistory,
    requiresActiveSecurityClearance: activeSecurityClearanceRequired,
    confirmedRequiresActiveSecurityClearance: false,
    insiderConnections,
    originalPostUrl,
    applyNowUrl,
    applyFlowUrls: [],
  };
}
