import path from "node:path";
import { chromium } from "playwright";
import {
  MARKET_DIR,
  PORTALS_FILE,
  ROOT_DIR,
  buildJobKey,
  canonicalizeUrl,
  ensureDir,
  escapeRegex,
  extractJsonAssignment,
  inferPlatform,
  inferRemoteMode,
  loadYaml,
  mapInBatches,
  normalizeWhitespace,
  parseSalary,
  readJsonl,
  readTsv,
  slugify,
  stripHtml,
  summarizeText,
  toAbsoluteUrl,
  unique,
  writeJsonl,
  writeText,
} from "./market-lib.mjs";

const JOBS_FILE = path.join(MARKET_DIR, "jobs.jsonl");
const IMPORT_SUMMARY_FILE = path.join(MARKET_DIR, "import-summary.json");
const INCOMING_TSV_FILE = path.join(MARKET_DIR, "incoming.tsv");
const SCAN_HISTORY_FILE = path.join(ROOT_DIR, "data", "scan-history.tsv");
const BATCH_INPUT_FILE = path.join(ROOT_DIR, "batch", "batch-input.tsv");

const IMPORT_USER_AGENT =
  "career-ops/market-import (+https://github.com/chippleh1392/career-ops)";
const STRUCTURED_DETAIL_MIN_TEXT = 280;
const MAX_DETAIL_FETCHES_PER_COMPANY = 12;
const BROWSER_COMPANY_CONCURRENCY = 2;
const STRUCTURED_COMPANY_CONCURRENCY = 4;
const DETAIL_FETCH_CONCURRENCY = 4;
const SKIP_URL_PATTERN =
  /(?:mailto:|tel:|javascript:|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|glassdoor\.|privacy|cookie|terms|blog|news)/i;

// Link text on careers pages rarely includes stack tokens (e.g. "React"); allow engineering-ish titles when positives miss.
const BROWSER_ANCHOR_FALLBACK =
  /\b(?:engineer|developer|designer|frontend|front[-\s]?end|full[\s-]?stack|fullstack|software|product|web|ui\/ux|ux\s|ui\s|commerce|shopify)\b/i;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": IMPORT_USER_AGENT,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": IMPORT_USER_AGENT,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return await response.text();
}

function metadataToObject(metadata = []) {
  return Object.fromEntries(
    (metadata ?? [])
      .map((entry) => [entry.name, entry.value])
      .filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function toIsoDate(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const normalized =
    typeof value === "number" || /^\d+$/.test(String(value)) ? Number(value) : String(value);
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString();
}

function getPathSlug(rawUrl, position = 0) {
  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments[position] ?? "";
  } catch {
    return "";
  }
}

function buildGreenhouseApiUrl(companyConfig) {
  if (typeof companyConfig.api === "string" && companyConfig.api.includes("greenhouse")) {
    return companyConfig.api.replace(/\/$/, "");
  }

  const slug = getPathSlug(companyConfig.careers_url, 0);
  return slug ? `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs` : "";
}

function buildLeverApiUrl(companyConfig) {
  if (typeof companyConfig.api === "string" && companyConfig.api.includes("lever")) {
    return companyConfig.api.replace(/\/$/, "");
  }

  const slug = getPathSlug(companyConfig.careers_url, 0);
  return slug ? `https://api.lever.co/v0/postings/${slug}?mode=json` : "";
}

function getAshbySlug(companyConfig) {
  return getPathSlug(companyConfig.careers_url, 0);
}

function buildWorkableWidgetUrl(companyConfig) {
  const apiField = String(companyConfig.api ?? "");
  if (apiField.includes("/api/v1/widget/accounts/")) {
    try {
      const parsed = new URL(apiField);
      const match = parsed.pathname.match(/\/widget\/accounts\/([^/]+)/);
      if (match) {
        return `https://apply.workable.com/api/v1/widget/accounts/${match[1]}`;
      }
    } catch {
      // fall through to careers_url
    }
  }

  const careersUrl = String(companyConfig.careers_url ?? "");
  if (!careersUrl.includes("apply.workable.com")) {
    return "";
  }

  try {
    const parsed = new URL(careersUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return "";
    }
    if (segments[0] === "j") {
      return "";
    }
    const slug = segments[1] === "j" ? segments[0] : segments[0];
    if (!slug || slug === "j") {
      return "";
    }
    return `https://apply.workable.com/api/v1/widget/accounts/${slug}`;
  } catch {
    return "";
  }
}

function detectAdapter(companyConfig) {
  const careersUrl = String(companyConfig.careers_url ?? "");
  const apiUrl = String(companyConfig.api ?? "");

  const workableWidgetUrl = buildWorkableWidgetUrl(companyConfig);
  if (workableWidgetUrl) {
    return {
      type: "workable",
      widgetUrl: workableWidgetUrl,
    };
  }

  if (apiUrl.includes("greenhouse") || careersUrl.includes("greenhouse.io")) {
    return {
      type: "greenhouse",
      apiUrl: buildGreenhouseApiUrl(companyConfig),
    };
  }

  if (apiUrl.includes("api.lever.co") || careersUrl.includes("jobs.lever.co")) {
    return {
      type: "lever",
      apiUrl: buildLeverApiUrl(companyConfig),
    };
  }

  if (careersUrl.includes("jobs.ashbyhq.com")) {
    return {
      type: "ashby",
      slug: getAshbySlug(companyConfig),
    };
  }

  return {
    type: "browser",
    url: careersUrl,
  };
}

function matchesTitleFilters(title, titleFilter) {
  const normalized = String(title ?? "").toLowerCase();
  if (!normalized) {
    return false;
  }

  const positives = (titleFilter?.positive ?? []).map((value) => String(value).toLowerCase());
  const negatives = (titleFilter?.negative ?? []).map((value) => String(value).toLowerCase());

  const hasPositive = positives.length === 0 || positives.some((value) => normalized.includes(value));
  const hasNegative = negatives.some((value) => normalized.includes(value));
  return hasPositive && !hasNegative;
}

function titleHasNegativeKeyword(title, titleFilter) {
  const normalized = String(title ?? "").toLowerCase();
  if (!normalized) {
    return false;
  }

  const negatives = (titleFilter?.negative ?? []).map((value) => String(value).trim()).filter(Boolean);
  for (const needle of negatives) {
    const n = needle.toLowerCase();
    if (/\s/.test(n)) {
      if (normalized.includes(n)) {
        return true;
      }
      continue;
    }
    if (n === "java") {
      if (/\bjava\b/i.test(normalized) && !/javascript/i.test(normalized)) {
        return true;
      }
      continue;
    }
    if (new RegExp(`\\b${escapeRegex(n)}\\b`, "i").test(normalized)) {
      return true;
    }
  }

  return false;
}

function matchesBrowserAnchorTitle(title, titleFilter) {
  const normalized = String(title ?? "").trim();
  if (!normalized || titleHasNegativeKeyword(normalized, titleFilter)) {
    return false;
  }

  if (matchesTitleFilters(normalized, titleFilter)) {
    return true;
  }

  return normalized.length >= 8 && BROWSER_ANCHOR_FALLBACK.test(normalized);
}

function formatLocationParts(...values) {
  return unique(
    values
      .flat()
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean),
  ).join(" | ");
}

function buildJobRecord({
  company,
  title,
  url,
  location,
  sourceType,
  sourceName,
  externalId,
  requisitionId = "",
  department = "",
  team = "",
  employmentType = "",
  contentText = "",
  firstPublishedAt = "",
  updatedAt = "",
  tags = [],
  salary = null,
  extraRemoteSignals = [],
}) {
  const canonicalUrl = canonicalizeUrl(url);
  const normalizedCompany = normalizeWhitespace(company);
  const normalizedTitle = normalizeWhitespace(title);
  const normalizedLocation = normalizeWhitespace(location);
  const normalizedContent = stripHtml(contentText);

  return {
    key: buildJobKey({
      company: normalizedCompany,
      title: normalizedTitle,
      url: canonicalUrl,
      location: normalizedLocation,
    }),
    company: normalizedCompany,
    title: normalizedTitle,
    url: canonicalUrl,
    canonical_url: canonicalUrl,
    platform: inferPlatform(canonicalUrl),
    source_type: sourceType,
    source_name: sourceName,
    external_id: String(externalId ?? slugify(`${normalizedCompany}-${normalizedTitle}-${canonicalUrl}`)),
    requisition_id: requisitionId,
    location: normalizedLocation,
    remote_mode: inferRemoteMode(normalizedTitle, normalizedLocation, normalizedContent, ...extraRemoteSignals),
    department,
    team,
    employment_type: employmentType,
    content_text: normalizedContent,
    summary_text: summarizeText(normalizedContent, 500),
    salary_min: salary?.min ?? null,
    salary_max: salary?.max ?? null,
    salary_currency: salary?.currency ?? null,
    salary_raw: salary?.raw ?? "",
    first_published_at: toIsoDate(firstPublishedAt),
    updated_at: toIsoDate(updatedAt),
    tags: unique(tags.map((tag) => normalizeWhitespace(tag))),
    sources: [
      {
        type: sourceType,
        name: sourceName,
        url: canonicalUrl,
      },
    ],
  };
}

function mapGreenhouseJob(companyConfig, job) {
  const metadata = metadataToObject(job.metadata);
  const contentText = stripHtml(job.content ?? "");
  const salary = parseSalary(contentText);
  const company = job.company_name || companyConfig.name;
  const location = job.location?.name ?? "";

  return buildJobRecord({
    company,
    title: job.title ?? "",
    url: job.absolute_url,
    location,
    sourceType: "greenhouse_api",
    sourceName: companyConfig.name,
    externalId: job.id,
    requisitionId: job.requisition_id ?? "",
    department: metadata.Function ?? metadata.Department ?? "",
    team: metadata.Team ?? metadata.Group ?? "",
    employmentType: metadata["Employment Type"] ?? metadata.Type ?? "",
    contentText,
    firstPublishedAt: job.first_published,
    updatedAt: job.updated_at,
    tags: Object.values(metadata).map((value) => String(value)),
    salary,
  });
}

function mapLeverJob(companyConfig, job) {
  const location = formatLocationParts(
    job.categories?.location,
    job.categories?.allLocations,
    job.categories?.team,
  );
  const contentText = [job.descriptionPlain, job.additionalPlain, job.openingPlain].filter(Boolean).join("\n\n");
  const salary = parseSalary(contentText);

  return buildJobRecord({
    company: companyConfig.name,
    title: job.text ?? "",
    url: job.hostedUrl ?? `https://jobs.lever.co/${getPathSlug(companyConfig.careers_url, 0)}/${job.id}`,
    location,
    sourceType: "lever_api",
    sourceName: companyConfig.name,
    externalId: job.id,
    department: job.categories?.department ?? "",
    team: job.categories?.team ?? "",
    employmentType: job.categories?.commitment ?? "",
    contentText,
    firstPublishedAt: job.createdAt,
    updatedAt: job.updatedAt ?? job.createdAt,
    tags: [
      job.categories?.department,
      job.categories?.team,
      job.categories?.commitment,
      job.categories?.location,
      ...(job.categories?.allLocations ?? []),
    ],
    salary,
    extraRemoteSignals: [job.workplaceType],
  });
}

function mapWorkableJob(companyConfig, job) {
  const secondaryLocations = (job.locations ?? []).map((loc) =>
    [loc.city, loc.region, loc.country].filter(Boolean).join(", "),
  );
  const location = formatLocationParts(job.city, job.state, job.country, secondaryLocations);
  const contentText = [
    job.title,
    job.department,
    job.function,
    job.employment_type,
    job.industry,
    job.experience,
    job.education,
    location,
    ...(job.locations ?? []).map((loc) =>
      [loc.country, loc.city, loc.region].filter(Boolean).join(" "),
    ),
    job.telecommuting ? "Remote / telecommuting" : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const salary = parseSalary(contentText);
  const url = canonicalizeUrl(job.url || job.shortlink || "");
  const extraRemote = [];
  if (job.telecommuting) {
    extraRemote.push("remote", "telecommuting");
  }

  return buildJobRecord({
    company: companyConfig.name,
    title: job.title ?? "",
    url,
    location,
    sourceType: "workable_widget",
    sourceName: companyConfig.name,
    externalId: job.shortcode ?? job.code ?? url,
    department: job.department ?? "",
    team: job.function ?? "",
    employmentType: job.employment_type ?? "",
    contentText,
    firstPublishedAt: job.published_on || job.created_at,
    updatedAt: job.created_at ?? job.published_on,
    tags: [
      job.department,
      job.function,
      job.employment_type,
      job.country,
      job.city,
      ...secondaryLocations,
    ],
    salary,
    extraRemoteSignals: extraRemote,
  });
}

function mapAshbyPosting(companyConfig, posting) {
  const secondaryLocations = (posting.secondaryLocations ?? []).map(
    (location) => location.locationName ?? location.locationExternalName ?? "",
  );
  const location = formatLocationParts(posting.locationName, secondaryLocations);
  const contentText = [
    posting.title,
    posting.departmentName,
    posting.teamName,
    posting.employmentType,
    posting.workplaceType,
    posting.compensationTierSummary,
    location,
  ]
    .filter(Boolean)
    .join("\n");
  const salary = parseSalary(contentText);
  const slug = getAshbySlug(companyConfig);

  return buildJobRecord({
    company: companyConfig.name,
    title: posting.title ?? "",
    url: `https://jobs.ashbyhq.com/${slug}/${posting.id}`,
    location,
    sourceType: "ashby_board",
    sourceName: companyConfig.name,
    externalId: posting.id,
    requisitionId: posting.jobRequisitionId ?? "",
    department: posting.departmentName ?? "",
    team: posting.teamName ?? "",
    employmentType: posting.employmentType ?? "",
    contentText,
    firstPublishedAt: posting.publishedDate,
    updatedAt: posting.updatedAt,
    tags: [
      posting.departmentName,
      posting.teamName,
      posting.employmentType,
      posting.workplaceType,
      ...secondaryLocations,
    ],
    salary,
    extraRemoteSignals: [posting.workplaceType],
  });
}

function mapJsonLdJob(companyConfig, jobPosting, careersUrl) {
  const company =
    jobPosting.hiringOrganization?.name ??
    jobPosting.organization?.name ??
    jobPosting.employer?.name ??
    companyConfig.name;
  const location = formatLocationParts(
    jobPosting.jobLocation?.address?.addressLocality,
    jobPosting.jobLocation?.address?.addressRegion,
    jobPosting.jobLocation?.address?.addressCountry,
    ...(jobPosting.jobLocation ?? [])
      .map((entry) =>
        [entry?.address?.addressLocality, entry?.address?.addressRegion, entry?.address?.addressCountry]
          .filter(Boolean)
          .join(", "),
      )
      .filter(Boolean),
  );
  const contentText = jobPosting.description ?? jobPosting.responsibilities ?? "";
  const salary = parseSalary(contentText);

  return buildJobRecord({
    company,
    title: jobPosting.title ?? jobPosting.name ?? "",
    url: toAbsoluteUrl(jobPosting.url ?? jobPosting["@id"] ?? careersUrl, careersUrl),
    location,
    sourceType: "browser_jsonld",
    sourceName: companyConfig.name,
    externalId: jobPosting.identifier?.value ?? jobPosting.identifier ?? jobPosting["@id"] ?? jobPosting.url,
    employmentType: Array.isArray(jobPosting.employmentType)
      ? jobPosting.employmentType.join(", ")
      : jobPosting.employmentType ?? "",
    contentText,
    firstPublishedAt: jobPosting.datePosted,
    updatedAt: jobPosting.validThrough ?? jobPosting.dateModified ?? jobPosting.datePosted,
    tags: [jobPosting.applicantLocationRequirements?.name, jobPosting.employmentType],
    salary,
  });
}

function mapBrowserAnchorJob(companyConfig, anchor) {
  return buildJobRecord({
    company: companyConfig.name,
    title: anchor.title,
    url: anchor.url,
    location: "",
    sourceType: "browser_careers_page",
    sourceName: companyConfig.name,
    externalId: anchor.url,
    contentText: anchor.title,
  });
}

function collectJsonLdJobPostings(jsonLdScripts) {
  const results = [];

  function visit(value) {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const typeValue = value["@type"];
    const types = Array.isArray(typeValue) ? typeValue : [typeValue];
    if (types.some((type) => String(type).toLowerCase() === "jobposting")) {
      results.push(value);
    }

    if (value["@graph"]) {
      visit(value["@graph"]);
    }
  }

  for (const rawScript of jsonLdScripts) {
    try {
      visit(JSON.parse(rawScript));
    } catch {
      continue;
    }
  }

  return results;
}

function extractDetailText(html, platform) {
  if (!html) {
    return "";
  }

  if (platform === "ashby") {
    const appData = extractJsonAssignment(html, "window.__appData = ");
    if (appData?.posting) {
      const detailText = stripHtml(
        [
          appData.posting.title,
          appData.posting.descriptionHtml,
          appData.posting.descriptionPlain,
          appData.posting.openingHtml,
          appData.posting.openingPlain,
          appData.posting.closingHtml,
          appData.posting.closingPlain,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      if (detailText) {
        return detailText;
      }
    }
  }

  return summarizeText(stripHtml(html), 4000);
}

async function enrichJobsWithDetailPages(jobs, titleFilter) {
  const candidates = jobs
    .filter(
      (job) =>
        job.url &&
        matchesTitleFilters(job.title, titleFilter) &&
        String(job.content_text ?? "").length < STRUCTURED_DETAIL_MIN_TEXT,
    )
    .slice(0, MAX_DETAIL_FETCHES_PER_COMPANY);

  if (candidates.length === 0) {
    return jobs;
  }

  const detailsByKey = new Map();
  const enrichedJobs = await mapInBatches(candidates, DETAIL_FETCH_CONCURRENCY, async (job) => {
    try {
      const html = await fetchText(job.url);
      const detailText = extractDetailText(html, job.platform);
      if (!detailText) {
        return null;
      }

      const salary = parseSalary(detailText);
      return {
        key: job.key,
        content_text: detailText,
        summary_text: summarizeText(detailText, 500),
        salary_min: salary?.min ?? job.salary_min ?? null,
        salary_max: salary?.max ?? job.salary_max ?? null,
        salary_currency: salary?.currency ?? job.salary_currency ?? null,
        salary_raw: salary?.raw ?? job.salary_raw ?? "",
        remote_mode: inferRemoteMode(job.title, job.location, detailText),
      };
    } catch {
      return null;
    }
  });

  for (const detail of enrichedJobs.filter(Boolean)) {
    detailsByKey.set(detail.key, detail);
  }

  return jobs.map((job) => {
    const detail = detailsByKey.get(job.key);
    return detail ? { ...job, ...detail } : job;
  });
}

async function importGreenhouseCompany(companyConfig, titleFilter) {
  const apiUrl = buildGreenhouseApiUrl(companyConfig);
  const listPayload = await fetchJson(apiUrl);
  const listJobs = listPayload.jobs ?? [];
  const detailJobs = await mapInBatches(listJobs, 10, async (listJob) => {
    try {
      return await fetchJson(`${apiUrl}/${listJob.id}`);
    } catch {
      return listJob;
    }
  });

  const jobs = detailJobs.map((job) => mapGreenhouseJob(companyConfig, job));
  return await enrichJobsWithDetailPages(jobs, titleFilter);
}

async function importLeverCompany(companyConfig, titleFilter) {
  const apiUrl = buildLeverApiUrl(companyConfig);
  const jobs = (await fetchJson(apiUrl)).map((job) => mapLeverJob(companyConfig, job));
  return await enrichJobsWithDetailPages(jobs, titleFilter);
}

async function importAshbyCompany(companyConfig, titleFilter) {
  const html = await fetchText(companyConfig.careers_url);
  const appData = extractJsonAssignment(html, "window.__appData = ");
  const postings = appData?.jobBoard?.jobPostings ?? appData?.jobBoard?.postings ?? [];
  const jobs = postings
    .filter((posting) => posting.isListed !== false)
    .map((posting) => mapAshbyPosting(companyConfig, posting));

  return await enrichJobsWithDetailPages(jobs, titleFilter);
}

async function importWorkableCompany(companyConfig, titleFilter) {
  const widgetUrl = buildWorkableWidgetUrl(companyConfig);
  if (!widgetUrl) {
    return [];
  }

  const payload = await fetchJson(widgetUrl);
  const jobs = (payload.jobs ?? []).map((job) => mapWorkableJob(companyConfig, job));
  return await enrichJobsWithDetailPages(jobs, titleFilter);
}

function chooseAnchorTitle(anchor) {
  return normalizeWhitespace(anchor.text || anchor.ariaLabel || anchor.title || anchor.cardText || "");
}

function isLikelyJobAnchor(anchor, companyConfig, titleFilter) {
  const title = chooseAnchorTitle(anchor);
  const url = canonicalizeUrl(anchor.url);

  if (!title || !url || SKIP_URL_PATTERN.test(url) || SKIP_URL_PATTERN.test(title)) {
    return false;
  }

  if (url === canonicalizeUrl(companyConfig.careers_url)) {
    return false;
  }

  return matchesBrowserAnchorTitle(title, titleFilter);
}

async function importBrowserCompany(companyConfig, titleFilter, browserContext) {
  const page = await browserContext.newPage();

  try {
    await page.goto(companyConfig.careers_url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    const payload = await page.evaluate(() => ({
      anchors: [...document.querySelectorAll("a[href]")].map((anchor) => ({
        url: anchor.href,
        text: (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim(),
        title: anchor.title || "",
        ariaLabel: anchor.getAttribute("aria-label") || "",
        cardText:
          (
            anchor.closest('[data-ui="job"], [role="listitem"], article, li, [data-job-id]')?.innerText ||
            anchor.parentElement?.innerText ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim(),
      })),
      jsonLdScripts: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((script) => script.textContent || "")
        .filter(Boolean),
    }));

    const jsonLdJobs = collectJsonLdJobPostings(payload.jsonLdScripts).map((jobPosting) =>
      mapJsonLdJob(companyConfig, jobPosting, companyConfig.careers_url),
    );

    const anchorJobs = payload.anchors
      .filter((anchor) => isLikelyJobAnchor(anchor, companyConfig, titleFilter))
      .map((anchor) =>
        mapBrowserAnchorJob(companyConfig, {
          title: chooseAnchorTitle(anchor),
          url: toAbsoluteUrl(anchor.url, companyConfig.careers_url),
        }),
      );

    const jobs = [...jsonLdJobs, ...anchorJobs].filter((job) => job.key);
    return await enrichJobsWithDetailPages(jobs, titleFilter);
  } finally {
    await page.close().catch(() => {});
  }
}

async function importTrackedCompanies(portals) {
  const titleFilter = portals.title_filter ?? {};
  const companies = (portals.tracked_companies ?? []).filter(
    (company) => company.enabled !== false && company.careers_url,
  );

  const structuredCompanies = [];
  const browserCompanies = [];

  for (const company of companies) {
    const adapter = detectAdapter(company);
    if (adapter.type === "browser") {
      browserCompanies.push(company);
    } else {
      structuredCompanies.push({ company, adapter });
    }
  }

  const importedJobs = [];
  const sourceSummary = [];

  const structuredResults = await mapInBatches(
    structuredCompanies,
    STRUCTURED_COMPANY_CONCURRENCY,
    async ({ company, adapter }) => {
      try {
        let jobs = [];
        switch (adapter.type) {
          case "greenhouse":
            jobs = await importGreenhouseCompany(company, titleFilter);
            break;
          case "lever":
            jobs = await importLeverCompany(company, titleFilter);
            break;
          case "ashby":
            jobs = await importAshbyCompany(company, titleFilter);
            break;
          case "workable":
            jobs = await importWorkableCompany(company, titleFilter);
            break;
          default:
            jobs = [];
        }

        return {
          company,
          adapter,
          jobs,
        };
      } catch (error) {
        return {
          company,
          adapter,
          jobs: [],
          error: error.message,
        };
      }
    },
  );

  for (const result of structuredResults) {
    importedJobs.push(...result.jobs);
    sourceSummary.push({
      source: result.company.name,
      type: `${result.adapter.type}_direct`,
      imported: result.jobs.length,
      error: result.error,
    });
  }

  if (browserCompanies.length > 0) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: IMPORT_USER_AGENT,
    });

    await context.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (resourceType === "image" || resourceType === "media" || resourceType === "font") {
        return route.abort();
      }

      return route.continue();
    });

    try {
      const browserResults = await mapInBatches(
        browserCompanies,
        BROWSER_COMPANY_CONCURRENCY,
        async (company) => {
          try {
            const jobs = await importBrowserCompany(company, titleFilter, context);
            return {
              company,
              jobs,
            };
          } catch (error) {
            return {
              company,
              jobs: [],
              error: error.message,
            };
          }
        },
      );

      for (const result of browserResults) {
        importedJobs.push(...result.jobs);
        sourceSummary.push({
          source: result.company.name,
          type: "browser_careers_page",
          imported: result.jobs.length,
          error: result.error,
        });
      }
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  return { importedJobs, sourceSummary };
}

function mapGenericRow(row, sourceType, sourceName) {
  const company = row.company || row.Company || "";
  const title = row.title || row.Title || row.notes || row.Notes || "";
  const url = canonicalizeUrl(row.url || row.URL || "");
  const location = row.location || row.Location || "";
  const content = row.content || row.Content || row.notes || row.Notes || "";
  const salary = parseSalary(content);

  return buildJobRecord({
    company,
    title,
    url,
    location,
    sourceType,
    sourceName,
    externalId: row.id || row.ID || slugify(`${company}-${title}-${url}`),
    contentText: content,
    firstPublishedAt: row.first_seen || row.date || "",
    updatedAt: row.last_seen || "",
    salary,
  });
}

async function importLocalSources() {
  const importedJobs = [];
  const sourceSummary = [];

  for (const [filePath, sourceType, sourceName] of [
    [SCAN_HISTORY_FILE, "scan_history", "scan-history.tsv"],
    [BATCH_INPUT_FILE, "batch_input", "batch-input.tsv"],
    [INCOMING_TSV_FILE, "incoming", "incoming.tsv"],
  ]) {
    const rows = await readTsv(filePath);
    const mappedJobs = rows.map((row) => mapGenericRow(row, sourceType, sourceName)).filter((job) => job.key);
    importedJobs.push(...mappedJobs);
    sourceSummary.push({
      source: sourceName,
      type: sourceType,
      imported: mappedJobs.length,
    });
  }

  return { importedJobs, sourceSummary };
}

function mergeJobs(existingJob, nextJob, importedAt) {
  const mergedSources = unique(
    [...(existingJob.sources ?? []), ...(nextJob.sources ?? [])].map((source) =>
      JSON.stringify({
        type: source.type,
        name: source.name,
        url: source.url,
      }),
    ),
  ).map((source) => JSON.parse(source));

  return {
    ...existingJob,
    ...nextJob,
    content_text: nextJob.content_text || existingJob.content_text || "",
    summary_text: nextJob.summary_text || existingJob.summary_text || "",
    company: nextJob.company || existingJob.company || "",
    title: nextJob.title || existingJob.title || "",
    location: nextJob.location || existingJob.location || "",
    remote_mode: nextJob.remote_mode !== "unknown" ? nextJob.remote_mode : existingJob.remote_mode || "unknown",
    salary_min: nextJob.salary_min ?? existingJob.salary_min ?? null,
    salary_max: nextJob.salary_max ?? existingJob.salary_max ?? null,
    salary_currency: nextJob.salary_currency ?? existingJob.salary_currency ?? null,
    salary_raw: nextJob.salary_raw || existingJob.salary_raw || "",
    first_published_at: nextJob.first_published_at || existingJob.first_published_at || "",
    updated_at: nextJob.updated_at || existingJob.updated_at || "",
    first_seen_at: existingJob.first_seen_at || importedAt,
    last_seen_at: importedAt,
    imported_at: importedAt,
    sources: mergedSources,
    tags: unique([...(existingJob.tags ?? []), ...(nextJob.tags ?? [])]),
  };
}

async function main() {
  await ensureDir(MARKET_DIR);

  const portals = await loadYaml(PORTALS_FILE);
  const existingJobs = await readJsonl(JOBS_FILE);
  const existingByKey = new Map(existingJobs.map((job) => [job.key, job]));

  const importedAt = new Date().toISOString();
  const trackedCompaniesImport = await importTrackedCompanies(portals);
  const localImport = await importLocalSources();
  const structuredSources = new Set(["greenhouse_api", "lever_api", "ashby_board", "workable_widget"]);
  let importedJobs = [...trackedCompaniesImport.importedJobs, ...localImport.importedJobs].filter((job) => job.key);

  if (portals.market_import?.drop_without_title_match === true) {
    const titleFilter = portals.title_filter ?? {};
    importedJobs = importedJobs.filter((job) => {
      if (!structuredSources.has(job.source_type)) {
        return true;
      }
      return matchesTitleFilters(job.title, titleFilter);
    });
  }

  for (const job of importedJobs) {
    const existingJob = existingByKey.get(job.key);
    const mergedJob = existingJob
      ? mergeJobs(existingJob, job, importedAt)
      : {
          ...job,
          first_seen_at: importedAt,
          last_seen_at: importedAt,
          imported_at: importedAt,
        };

    existingByKey.set(job.key, mergedJob);
  }

  const mergedJobs = [...existingByKey.values()].sort((left, right) => {
    const companyCompare = left.company.localeCompare(right.company);
    if (companyCompare !== 0) {
      return companyCompare;
    }
    return left.title.localeCompare(right.title);
  });

  await writeJsonl(JOBS_FILE, mergedJobs);

  const summary = {
    imported_at: importedAt,
    total_jobs: mergedJobs.length,
    sources: [...trackedCompaniesImport.sourceSummary, ...localImport.sourceSummary],
  };

  await writeText(IMPORT_SUMMARY_FILE, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
