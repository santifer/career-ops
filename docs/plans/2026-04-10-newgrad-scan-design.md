# newgrad-scan — newgrad-jobs.com Portal Scanner

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a newgrad-jobs.com scanner that extracts job listings via the Chrome extension, scores them locally in the bridge, enriches high-scoring rows from detail pages, and writes survivors to `data/pipeline.md` for full Claude evaluation.

**Architecture:** Hybrid — Chrome extension content scripts scrape DOM (zero bot risk), bridge runs deterministic scoring against `profile.yml` config, enriched rows land in the existing pipeline for batch evaluation. Two entry points: extension UI button when browsing newgrad-jobs.com, and CLI `/career-ops newgrad-scan` that directs the user to the browser.

**Tech Stack:** TypeScript (extension + bridge), Fastify (bridge HTTP), Chrome MV3 APIs (content scripts, background SW, tabs), Zod (validation), Vitest (tests)

---

## Task 1: Contract types — `bridge/src/contracts/newgrad.ts`

**Files:**
- Create: `bridge/src/contracts/newgrad.ts`

**Step 1: Write the contract types file**

This file defines all shared types for the newgrad-scan feature. No runtime code.

```typescript
/**
 * newgrad.ts — types for the newgrad-jobs.com scanner feature.
 *
 * Shared between bridge endpoints and extension content scripts.
 * CONTRACTS ONLY. No runtime.
 */

/**
 * One row extracted from the newgrad-jobs.com listing table.
 * The content script parses the DOM table and produces an array of these.
 */
export interface NewGradRow {
  /** 1-based position on the page */
  position: number;
  title: string;
  /** Raw "2 hours ago" string from the page */
  postedAgo: string;
  /** href from the Apply link (may point to jobright or direct) */
  applyUrl: string;
  /** Site-internal detail page URL */
  detailUrl: string;
  workModel: "Remote" | "Hybrid" | "On Site" | string;
  location: string;
  company: string;
  /** Raw salary string, e.g. "$34.25-$48.08/hr" or "$125000-$175000/yr" */
  salary: string;
  companySize: string;
  industry: string;
  /** Truncated qualifications text from the list page */
  qualifications: string;
  h1bSponsored: "Yes" | "No" | "Not Sure";
  isNewGrad: "Yes" | "No" | "Not Sure";
}

/**
 * Enriched data from the newgrad-jobs.com detail/apply page.
 * Extracted by a second content script injection into a background tab.
 */
export interface NewGradDetail {
  /** Original row position for correlation */
  position: number;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  workModel: string;
  seniorityLevel: string;
  salaryRange: string;
  /** Jobright "GOOD MATCH" percentage, 0-100 */
  matchScore: number | null;
  /** Jobright experience level match, 0-100 */
  expLevelMatch: number | null;
  /** Jobright skill match, 0-100 */
  skillMatch: number | null;
  /** Jobright industry experience match, 0-100 */
  industryExpMatch: number | null;
  /** Full JD summary/description text */
  description: string;
  /** The "Original Job Post" link (company careers page) */
  originalPostUrl: string;
  /** The final apply button URL */
  applyNowUrl: string;
}

/**
 * A row after local scoring. Returned by POST /v1/newgrad-scan/score.
 */
export interface ScoredRow {
  row: NewGradRow;
  score: number;
  maxScore: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  roleMatch: number;
  skillHits: number;
  skillKeywordsMatched: string[];
  freshness: number;
}

/**
 * A row that was filtered out, with the reason.
 */
export interface FilteredRow {
  row: NewGradRow;
  reason: "negative_title" | "already_tracked" | "below_threshold";
  detail?: string;
}

/**
 * An enriched row ready for the pipeline threshold check.
 */
export interface EnrichedRow {
  row: NewGradRow;
  detail: NewGradDetail;
}

/**
 * Result of writing a row to pipeline.md.
 */
export interface PipelineEntry {
  url: string;
  company: string;
  role: string;
  score: number;
  source: "newgrad-scan";
}

/* -------------------------------------------------------------------------- */
/*  Scoring configuration (maps to profile.yml → newgrad_scan)                */
/* -------------------------------------------------------------------------- */

export interface NewGradScanConfig {
  role_keywords: {
    positive: string[];
    weight: number;
  };
  skill_keywords: {
    terms: string[];
    weight: number;
    max_score: number;
  };
  freshness: {
    within_24h: number;
    within_3d: number;
    older: number;
  };
  list_threshold: number;
  pipeline_threshold: number;
  detail_concurrent_tabs: number;
  detail_delay_min_ms: number;
  detail_delay_max_ms: number;
}
```

**Step 2: Commit**

```bash
git add bridge/src/contracts/newgrad.ts
git commit -m "feat(newgrad-scan): add contract types for newgrad-jobs.com scanner"
```

---

## Task 2: Profile config — add `newgrad_scan` section to `config/profile.yml`

**Files:**
- Modify: `config/profile.yml` (append at end)

**Step 1: Append the newgrad_scan config section**

Add this block at the end of `config/profile.yml`:

```yaml
newgrad_scan:
  role_keywords:
    positive:
      - "Software Engineer"
      - "Full-Stack"
      - "Full Stack"
      - "Backend"
      - "AI Engineer"
      - "Platform Engineer"
      - "Infrastructure Engineer"
      - "Product Engineer"
      - "Founding Engineer"
      - "Forward Deployed"
      - "Agent Engineer"
      - "Applied AI"
    weight: 3

  skill_keywords:
    terms:
      # Languages & Frameworks
      - "Java"
      - "Python"
      - "JavaScript"
      - "TypeScript"
      - "C/C++"
      - "RIOS/Swift"
      - "MATLAB"
      - "Spring Boot"
      - "Spring"
      - "SpringMVC"
      - "React"
      - "Node.js"
      - "ElementUI"
      # Databases & Messaging
      - "MySQL"
      - "Postgres"
      - "Redis"
      - "RabbitMQ"
      - "WebSocket"
      # Infrastructure & DevOps
      - "Docker"
      - "AWS"
      - "Kubernetes"
      - "Linux"
      - "Git"
      - "GitHub Actions"
      - "Nginx"
      - "Prometheus"
      - "Grafana"
      - "Airflow"
      - "Maven"
      # AI / ML / Data
      - "NumPy"
      - "Pandas"
      - "PySpark"
      - "GeoPandas"
      - "ETL"
      - "agent"
      - "RAG"
      - "LLM"
      - "AI"
      - "Function Calling"
      - "OpenAPI"
      - "OpenRouter API"
      # Architecture & Patterns
      - "distributed systems"
      - "microservices"
      - "event-driven"
      - "high-concurrency"
      - "batch processing"
      - "CI/CD"
      - "API"
      - "REST"
      - "HTTP"
      - "CORS"
      - "CSRF"
      - "data pipeline"
      - "ETL pipeline"
      - "cloud"
      # Testing & Quality
      - "JUnit"
      - "automated testing"
      - "performance benchmarking"
      - "stress testing"
      - "Valgrind"
      # Security
      - "OAuth2"
      - "JWT"
      - "RBAC"
      - "rate limiting"
      - "security"
      # Systems & Algorithms
      - "data structures"
      - "algorithms"
      - "database systems"
      - "computer networks"
      - "memory safety"
      - "error handling"
      # Domain-specific
      - "geospatial"
      - "ArcGIS"
      - "PostGIS"
      - "osm2pgsql"
      - "real-time tracking"
      - "mobile app"
      # Patterns
      - "transactional outbox"
      - "write-behind caching"
      - "heartbeat"
      - "back-pressure"
      - "unique ID generation"
      - "STOMP"
      - "CAS"
      - "Shell"
    weight: 1
    max_score: 4

  freshness:
    within_24h: 2
    within_3d: 1
    older: 0

  list_threshold: 3
  pipeline_threshold: 5

  detail_concurrent_tabs: 3
  detail_delay_min_ms: 2000
  detail_delay_max_ms: 5000
```

**Step 2: Commit**

```bash
git add config/profile.yml
git commit -m "feat(newgrad-scan): add scoring config to profile.yml"
```

---

## Task 3: Scoring logic — `bridge/src/adapters/newgrad-scorer.ts`

**Files:**
- Create: `bridge/src/adapters/newgrad-scorer.ts`
- Create: `bridge/src/adapters/newgrad-scorer.test.ts`

**Step 1: Write the failing tests**

```typescript
// bridge/src/adapters/newgrad-scorer.test.ts
import { describe, it, expect } from "vitest";
import { scoreRow, parsePostedAgo, parseFreshness } from "./newgrad-scorer.js";
import type { NewGradRow, NewGradScanConfig } from "../contracts/newgrad.js";

const BASE_CONFIG: NewGradScanConfig = {
  role_keywords: {
    positive: ["Software Engineer", "Full-Stack", "Backend", "AI Engineer"],
    weight: 3,
  },
  skill_keywords: {
    terms: ["Java", "Python", "Spring Boot", "React", "Docker", "AWS"],
    weight: 1,
    max_score: 4,
  },
  freshness: { within_24h: 2, within_3d: 1, older: 0 },
  list_threshold: 3,
  pipeline_threshold: 5,
  detail_concurrent_tabs: 3,
  detail_delay_min_ms: 2000,
  detail_delay_max_ms: 5000,
};

function makeRow(overrides: Partial<NewGradRow> = {}): NewGradRow {
  return {
    position: 1,
    title: "Software Engineer",
    postedAgo: "2 hours ago",
    applyUrl: "https://example.com/apply",
    detailUrl: "https://newgrad-jobs.com/job/1",
    workModel: "Remote",
    location: "United States",
    company: "Acme Corp",
    salary: "$120000-$150000/yr",
    companySize: "101-250",
    industry: "Information Technology",
    qualifications: "Experience with Java, Spring Boot, and AWS required.",
    h1bSponsored: "Not Sure",
    isNewGrad: "Yes",
    ...overrides,
  };
}

describe("parsePostedAgo", () => {
  it("parses hours", () => {
    expect(parsePostedAgo("2 hours ago")).toBeLessThan(24 * 60);
  });
  it("parses days", () => {
    expect(parsePostedAgo("3 days ago")).toBe(3 * 24 * 60);
  });
  it("parses minutes", () => {
    expect(parsePostedAgo("30 minutes ago")).toBe(30);
  });
  it("returns Infinity for unparseable", () => {
    expect(parsePostedAgo("unknown")).toBe(Infinity);
  });
});

describe("parseFreshness", () => {
  it("returns within_24h score for recent posts", () => {
    expect(parseFreshness(120, BASE_CONFIG.freshness)).toBe(2);
  });
  it("returns within_3d score for 2-day old posts", () => {
    expect(parseFreshness(48 * 60, BASE_CONFIG.freshness)).toBe(1);
  });
  it("returns older score for 5-day old posts", () => {
    expect(parseFreshness(5 * 24 * 60, BASE_CONFIG.freshness)).toBe(0);
  });
});

describe("scoreRow", () => {
  it("scores a matching SWE role with skill hits", () => {
    const result = scoreRow(makeRow(), BASE_CONFIG);
    // role match (3) + skill hits (Java, Spring Boot, AWS = 3, capped at 4) + freshness (2) = 8
    expect(result.score).toBeGreaterThanOrEqual(5);
    expect(result.breakdown.roleMatch).toBe(3);
    expect(result.breakdown.skillHits).toBeGreaterThanOrEqual(2);
    expect(result.breakdown.freshness).toBe(2);
  });

  it("scores zero for unrelated title with no skill matches", () => {
    const result = scoreRow(
      makeRow({
        title: "Marketing Manager",
        qualifications: "MBA required, 5 years brand management",
        postedAgo: "5 days ago",
      }),
      BASE_CONFIG,
    );
    expect(result.score).toBe(0);
  });

  it("caps skill score at max_score", () => {
    const result = scoreRow(
      makeRow({
        qualifications: "Java, Python, Spring Boot, React, Docker, AWS all required",
      }),
      BASE_CONFIG,
    );
    // All 6 terms match, but capped at 4
    expect(result.breakdown.skillHits).toBe(4);
  });

  it("records matched skill keywords in breakdown", () => {
    const result = scoreRow(makeRow(), BASE_CONFIG);
    expect(result.breakdown.skillKeywordsMatched).toContain("Java");
    expect(result.breakdown.skillKeywordsMatched).toContain("Spring Boot");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd bridge && npx vitest run src/adapters/newgrad-scorer.test.ts`
Expected: FAIL — module not found

**Step 3: Write the scorer implementation**

```typescript
// bridge/src/adapters/newgrad-scorer.ts
/**
 * newgrad-scorer.ts — deterministic scoring for newgrad-jobs.com rows.
 *
 * No LLM calls. Runs entirely from profile.yml config.
 * Reads portals.yml negative keywords and applications.md for dedup.
 */

import type {
  NewGradRow,
  NewGradScanConfig,
  ScoredRow,
  ScoreBreakdown,
  FilteredRow,
} from "../contracts/newgrad.js";

/**
 * Parse "2 hours ago", "3 days ago", "30 minutes ago" → minutes since posted.
 * Returns Infinity for unparseable strings.
 */
export function parsePostedAgo(text: string): number {
  const match = text.match(/(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i);
  if (!match) return Infinity;
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  switch (unit) {
    case "minute": return value;
    case "hour": return value * 60;
    case "day": return value * 24 * 60;
    case "week": return value * 7 * 24 * 60;
    case "month": return value * 30 * 24 * 60;
    default: return Infinity;
  }
}

/**
 * Convert minutes-since-posted into a freshness score.
 */
export function parseFreshness(
  minutesAgo: number,
  config: NewGradScanConfig["freshness"],
): number {
  const hoursAgo = minutesAgo / 60;
  if (hoursAgo < 24) return config.within_24h;
  if (hoursAgo < 72) return config.within_3d;
  return config.older;
}

/**
 * Score a single row against the config. Pure function.
 */
export function scoreRow(row: NewGradRow, config: NewGradScanConfig): ScoredRow {
  let score = 0;
  const breakdown: ScoreBreakdown = {
    roleMatch: 0,
    skillHits: 0,
    skillKeywordsMatched: [],
    freshness: 0,
  };

  // Dimension 1: Role direction match
  const titleLower = row.title.toLowerCase();
  const roleMatched = config.role_keywords.positive.some(
    (kw) => titleLower.includes(kw.toLowerCase()),
  );
  if (roleMatched) {
    breakdown.roleMatch = config.role_keywords.weight;
    score += breakdown.roleMatch;
  }

  // Dimension 2: Skill keyword hits
  const qualsLower = row.qualifications.toLowerCase();
  let rawHits = 0;
  for (const term of config.skill_keywords.terms) {
    if (qualsLower.includes(term.toLowerCase())) {
      rawHits++;
      breakdown.skillKeywordsMatched.push(term);
    }
  }
  breakdown.skillHits = Math.min(
    rawHits * config.skill_keywords.weight,
    config.skill_keywords.max_score,
  );
  score += breakdown.skillHits;

  // Dimension 3: Freshness
  const minutesAgo = parsePostedAgo(row.postedAgo);
  breakdown.freshness = parseFreshness(minutesAgo, config.freshness);
  score += breakdown.freshness;

  const maxScore =
    config.role_keywords.weight +
    config.skill_keywords.max_score +
    config.freshness.within_24h;

  return { row, score, maxScore, breakdown };
}

/**
 * Score and filter a batch of rows.
 * Returns promoted rows (above threshold) and filtered rows (below or hard-filtered).
 */
export function scoreAndFilter(
  rows: NewGradRow[],
  config: NewGradScanConfig,
  negativeKeywords: string[],
  trackedCompanyRoles: Set<string>,
): { promoted: ScoredRow[]; filtered: FilteredRow[] } {
  const promoted: ScoredRow[] = [];
  const filtered: FilteredRow[] = [];

  for (const row of rows) {
    // Hard filter: negative title keywords
    const titleLower = row.title.toLowerCase();
    const negativeHit = negativeKeywords.find((kw) =>
      titleLower.includes(kw.toLowerCase()),
    );
    if (negativeHit) {
      filtered.push({
        row,
        reason: "negative_title",
        detail: `title contains "${negativeHit}"`,
      });
      continue;
    }

    // Hard filter: already tracked
    const trackKey = `${row.company.toLowerCase()}|${row.title.toLowerCase()}`;
    if (trackedCompanyRoles.has(trackKey)) {
      filtered.push({ row, reason: "already_tracked" });
      continue;
    }

    // Score
    const scored = scoreRow(row, config);
    if (scored.score < config.list_threshold) {
      filtered.push({
        row,
        reason: "below_threshold",
        detail: `score ${scored.score}/${scored.maxScore} < threshold ${config.list_threshold}`,
      });
      continue;
    }

    promoted.push(scored);
  }

  // Sort promoted by score descending
  promoted.sort((a, b) => b.score - a.score);

  return { promoted, filtered };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd bridge && npx vitest run src/adapters/newgrad-scorer.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add bridge/src/adapters/newgrad-scorer.ts bridge/src/adapters/newgrad-scorer.test.ts
git commit -m "feat(newgrad-scan): deterministic scoring engine with tests"
```

---

## Task 4: Bridge endpoints — `POST /v1/newgrad-scan/score` and `POST /v1/newgrad-scan/enrich`

**Files:**
- Modify: `bridge/src/contracts/api.ts` (add endpoint descriptors)
- Modify: `bridge/src/server.ts` (mount new routes)

**Step 1: Add endpoint descriptors to `bridge/src/contracts/api.ts`**

After the existing `REPORT_READ` descriptor (line ~282), add:

```typescript
import type {
  NewGradRow,
  ScoredRow,
  FilteredRow,
  EnrichedRow,
  PipelineEntry,
} from "./newgrad.js";

/* -------------------------------------------------------------------------- */
/*  /newgrad-scan/score — score list page rows                                */
/* -------------------------------------------------------------------------- */

export interface NewGradScoreRequest {
  rows: NewGradRow[];
}

export interface NewGradScoreResult {
  promoted: ScoredRow[];
  filtered: FilteredRow[];
}

export const NEWGRAD_SCORE: EndpointDescriptor<
  RequestEnvelope<NewGradScoreRequest>,
  Response<NewGradScoreResult>
> = {
  id: "newgradScore" as EndpointId,
  method: "POST",
  path: "/v1/newgrad-scan/score",
  phase: 3,
  idempotent: true,
  errors: ["UNAUTHORIZED", "BAD_REQUEST", "RATE_LIMITED", "INTERNAL"],
};

/* -------------------------------------------------------------------------- */
/*  /newgrad-scan/enrich — re-score enriched rows and write to pipeline       */
/* -------------------------------------------------------------------------- */

export interface NewGradEnrichRequest {
  rows: EnrichedRow[];
}

export interface NewGradEnrichResult {
  added: number;
  skipped: number;
  entries: PipelineEntry[];
}

export const NEWGRAD_ENRICH: EndpointDescriptor<
  RequestEnvelope<NewGradEnrichRequest>,
  Response<NewGradEnrichResult>
> = {
  id: "newgradEnrich" as EndpointId,
  method: "POST",
  path: "/v1/newgrad-scan/enrich",
  phase: 3,
  idempotent: true,
  errors: ["UNAUTHORIZED", "BAD_REQUEST", "RATE_LIMITED", "INTERNAL"],
};
```

Also update the `EndpointId` type to include `"newgradScore" | "newgradEnrich"`, and add both to the `ENDPOINTS` registry.

**Step 2: Add Zod schemas and route handlers in `bridge/src/server.ts`**

After the existing `/v1/jobs` GET handler (around line 479), add:

```typescript
/* -- POST /v1/newgrad-scan/score ---------------------------------------- */

const newGradRowSchema = z.object({
  position: z.number().int(),
  title: z.string(),
  postedAgo: z.string(),
  applyUrl: z.string(),
  detailUrl: z.string(),
  workModel: z.string(),
  location: z.string(),
  company: z.string(),
  salary: z.string(),
  companySize: z.string(),
  industry: z.string(),
  qualifications: z.string(),
  h1bSponsored: z.enum(["Yes", "No", "Not Sure"]),
  isNewGrad: z.enum(["Yes", "No", "Not Sure"]),
});

const newGradScoreSchema = envelopeSchema(
  z.object({ rows: z.array(newGradRowSchema).max(200) })
);

fastify.post("/v1/newgrad-scan/score", async (req, reply) => {
  if (!generalRateLimit.check("general")) {
    return sendFailure(reply, requestIdFromBody(req.body),
      bridgeError("RATE_LIMITED", "too many requests"));
  }

  const parsed = newGradScoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendFailure(reply, requestIdFromBody(req.body),
      bridgeError("BAD_REQUEST", "invalid envelope", { issues: parsed.error.issues }));
  }
  const env = parsed.data as RequestEnvelope<{ rows: NewGradRow[] }>;
  try { assertProtocol(env); } catch (e) {
    return sendFailure(reply, env.requestId, toBridgeError(e));
  }

  const result = await adapter.scoreNewGradRows(env.payload.rows);
  reply.code(200).send(success(env.requestId, result));
});

/* -- POST /v1/newgrad-scan/enrich --------------------------------------- */

const newGradDetailSchema = z.object({
  position: z.number().int(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  employmentType: z.string(),
  workModel: z.string(),
  seniorityLevel: z.string(),
  salaryRange: z.string(),
  matchScore: z.number().nullable(),
  expLevelMatch: z.number().nullable(),
  skillMatch: z.number().nullable(),
  industryExpMatch: z.number().nullable(),
  description: z.string().max(50_000),
  originalPostUrl: z.string(),
  applyNowUrl: z.string(),
});

const newGradEnrichSchema = envelopeSchema(
  z.object({
    rows: z.array(z.object({
      row: newGradRowSchema,
      detail: newGradDetailSchema,
    })).max(50),
  })
);

fastify.post("/v1/newgrad-scan/enrich", async (req, reply) => {
  if (!generalRateLimit.check("general")) {
    return sendFailure(reply, requestIdFromBody(req.body),
      bridgeError("RATE_LIMITED", "too many requests"));
  }

  const parsed = newGradEnrichSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendFailure(reply, requestIdFromBody(req.body),
      bridgeError("BAD_REQUEST", "invalid envelope", { issues: parsed.error.issues }));
  }
  const env = parsed.data as RequestEnvelope<{ rows: EnrichedRow[] }>;
  try { assertProtocol(env); } catch (e) {
    return sendFailure(reply, env.requestId, toBridgeError(e));
  }

  const result = await adapter.enrichNewGradRows(env.payload.rows);
  reply.code(200).send(success(env.requestId, result));
});
```

**Step 3: Add methods to `PipelineAdapter` interface**

In `bridge/src/contracts/pipeline.ts`, add to the `PipelineAdapter` interface:

```typescript
import type {
  NewGradRow,
  NewGradScoreResult,
  EnrichedRow,
  NewGradEnrichResult,
} from "./newgrad.js";

// Inside PipelineAdapter interface:

/**
 * Score a batch of rows from newgrad-jobs.com listing page.
 * Uses profile.yml config for deterministic scoring,
 * portals.yml for negative keywords, applications.md for dedup.
 */
scoreNewGradRows(rows: NewGradRow[]): Promise<NewGradScoreResult>;

/**
 * Re-score enriched rows using detail page data and write
 * survivors to data/pipeline.md.
 */
enrichNewGradRows(rows: EnrichedRow[]): Promise<NewGradEnrichResult>;
```

**Step 4: Implement in the adapters**

Add `scoreNewGradRows` and `enrichNewGradRows` to each adapter that implements `PipelineAdapter`. The fake adapter returns canned data. The real/SDK adapters use `scoreAndFilter` from `newgrad-scorer.ts`, read `portals.yml` for negative keywords, read `data/applications.md` for dedup, and append to `data/pipeline.md`.

For the real adapter, the `enrichNewGradRows` implementation:
1. Re-score using the detail page's full description text (replace `qualifications` with `detail.description` for richer skill matching)
2. Apply `pipeline_threshold`
3. Read existing `data/pipeline.md` to dedup
4. Append surviving rows in the standard format: `- [ ] {originalPostUrl} — {company} | {title} (via newgrad-scan, score: {score}/{maxScore})`
5. Return the count and entries

**Step 5: Commit**

```bash
git add bridge/src/contracts/api.ts bridge/src/contracts/pipeline.ts bridge/src/server.ts bridge/src/adapters/
git commit -m "feat(newgrad-scan): bridge endpoints for scoring and enrichment"
```

---

## Task 5: Content script — `extension/src/content/extract-newgrad.ts`

**Files:**
- Create: `extension/src/content/extract-newgrad.ts`

**Step 1: Write the list page extractor**

This content script is injected into newgrad-jobs.com tabs. It must be **fully self-contained** (no imports — Chrome serializes only the function body). It returns an array of `NewGradRow` objects parsed from the DOM table.

```typescript
// extension/src/content/extract-newgrad.ts
/**
 * extract-newgrad.ts — DOM parser for newgrad-jobs.com
 *
 * Injected via chrome.scripting.executeScript into tabs on newgrad-jobs.com.
 * Fully self-contained — no imports, no closures over module scope.
 *
 * Two modes:
 *   1. List page: extracts table rows → NewGradRow[]
 *   2. Detail page: extracts enriched data → NewGradDetail
 *
 * The background SW determines which mode to run based on the URL pattern.
 */

// ---- List page extractor ----
// Invoked on: https://www.newgrad-jobs.com/ (main listing)

export function extractListPage(): unknown[] {
  // Must be self-contained for chrome.scripting.executeScript
  const rows: unknown[] = [];

  // The page uses a table structure. Find all data rows.
  // Adapt selectors based on actual DOM — this is a best-effort template.
  const tableRows = document.querySelectorAll("table tbody tr, [class*='job-row'], [class*='listing']");

  // Fallback: if no table, try card-based layout
  const elements = tableRows.length > 0
    ? tableRows
    : document.querySelectorAll("[class*='job'], [class*='position'], [data-job-id]");

  let position = 1;
  for (const el of elements) {
    const getText = (selector: string): string => {
      const node = el.querySelector(selector);
      return node?.textContent?.trim() ?? "";
    };
    const getLink = (selector: string): string => {
      const node = el.querySelector(selector) as HTMLAnchorElement | null;
      return node?.href ?? "";
    };

    // Extract fields — selectors will be refined after testing against live DOM
    const cells = el.querySelectorAll("td, [class*='cell'], [class*='col']");
    if (cells.length < 5) continue; // skip non-data rows

    const row = {
      position: position++,
      title: cells[0]?.textContent?.trim() ?? "",
      postedAgo: cells[1]?.textContent?.trim() ?? "",
      applyUrl: (cells[2]?.querySelector("a") as HTMLAnchorElement)?.href ?? "",
      detailUrl: (el.querySelector("a[href*='/job/']") as HTMLAnchorElement)?.href
        ?? (el as HTMLAnchorElement).href ?? "",
      workModel: cells[3]?.textContent?.trim() ?? "",
      location: cells[4]?.textContent?.trim() ?? "",
      company: cells[5]?.textContent?.trim() ?? "",
      salary: cells[6]?.textContent?.trim() ?? "",
      companySize: cells[7]?.textContent?.trim() ?? "",
      industry: cells[8]?.textContent?.trim() ?? "",
      qualifications: cells[9]?.textContent?.trim() ?? "",
      h1bSponsored: cells[10]?.textContent?.trim() ?? "Not Sure",
      isNewGrad: cells[11]?.textContent?.trim() ?? "Not Sure",
    };

    rows.push(row);
  }

  return rows;
}

// ---- Detail page extractor ----
// Invoked on: individual job detail pages on newgrad-jobs.com

export function extractDetailPage(): unknown {
  const getText = (selector: string): string => {
    const el = document.querySelector(selector);
    return el?.textContent?.trim() ?? "";
  };

  const getPercentage = (text: string): number | null => {
    const match = text.match(/(\d+)%/);
    return match ? parseInt(match[1]!, 10) : null;
  };

  // Extract from the detail/apply page structure
  // Selectors will be refined after testing against live DOM
  const body = document.body?.innerText ?? "";

  // Look for Jobright match scores
  const matchScoreText = body.match(/(\d+)%\s*(GOOD MATCH|GREAT MATCH|MATCH)/i);
  const expLevelText = body.match(/(\d+)%\s*Exp\.?\s*Level/i);
  const skillText = body.match(/(\d+)%\s*Skill/i);
  const industryText = body.match(/(\d+)%\s*Industry\s*Exp/i);

  // Look for the Original Job Post link
  const originalPostLink = document.querySelector(
    "a[href*='Original Job Post'], a:has(> *:contains('Original')), [class*='original'] a"
  ) as HTMLAnchorElement | null;

  // Look for apply button
  const applyLink = document.querySelector(
    "a[href*='apply'], button:contains('Apply'), [class*='apply'] a"
  ) as HTMLAnchorElement | null;

  // Get the main description
  const main = document.querySelector("main, article, [class*='description'], [class*='content']");
  const description = (main as HTMLElement)?.innerText?.trim().slice(0, 20_000) ?? "";

  return {
    position: 0, // will be set by background SW for correlation
    title: document.title.split(" - ")[0]?.trim() ?? "",
    company: getText("[class*='company'], [data-company]"),
    location: getText("[class*='location'], [data-location]"),
    employmentType: getText("[class*='employment'], [class*='type']"),
    workModel: getText("[class*='remote'], [class*='work-model']"),
    seniorityLevel: getText("[class*='seniority'], [class*='level']"),
    salaryRange: getText("[class*='salary'], [class*='compensation']"),
    matchScore: matchScoreText ? parseInt(matchScoreText[1]!, 10) : null,
    expLevelMatch: expLevelText ? parseInt(expLevelText[1]!, 10) : null,
    skillMatch: skillText ? parseInt(skillText[1]!, 10) : null,
    industryExpMatch: industryText ? parseInt(industryText[1]!, 10) : null,
    description,
    originalPostUrl: originalPostLink?.href ?? "",
    applyNowUrl: applyLink?.href ?? "",
  };
}
```

**Important note for the implementer:** The CSS selectors in this file are templates. After creating the file, you MUST:
1. Load the extension in Chrome
2. Navigate to newgrad-jobs.com
3. Open DevTools → Elements
4. Inspect the actual DOM structure of the table and detail page
5. Update the selectors to match the real DOM

This is manual inspection work that cannot be automated without seeing the live page.

**Step 2: Commit**

```bash
git add extension/src/content/extract-newgrad.ts
git commit -m "feat(newgrad-scan): content script DOM extractors for newgrad-jobs.com"
```

---

## Task 6: Extension wiring — messages, background, bridge-client

**Files:**
- Modify: `extension/src/contracts/messages.ts` — add newgrad-scan message types
- Modify: `extension/src/background/index.ts` — add message handlers
- Modify: `extension/src/background/bridge-client.ts` — add API methods

**Step 1: Add message types to `extension/src/contracts/messages.ts`**

Add to the `PopupRequest` union (after `mergeTracker`):

```typescript
/** Trigger list page extraction on the active newgrad-jobs.com tab. */
| { kind: "newgradExtractList" }
/** Send extracted rows to bridge for scoring. */
| { kind: "newgradScore"; rows: import("../../bridge/src/contracts/newgrad.js").NewGradRow[] }
/** Open detail pages for promoted rows in background tabs with throttling. */
| { kind: "newgradEnrichDetails"; promotedRows: import("../../bridge/src/contracts/newgrad.js").ScoredRow[] }
/** Send enriched rows to bridge for re-scoring and pipeline write. */
| { kind: "newgradEnrich"; rows: import("../../bridge/src/contracts/newgrad.js").EnrichedRow[] }
```

Add corresponding response types to `PopupResponse`.

**Step 2: Add bridge client methods**

In `extension/src/background/bridge-client.ts`, add:

```typescript
async scoreNewGradRows(rows: NewGradRow[]) {
  const env = envelope({ rows });
  return jsonRequest<NewGradScoreResult>(
    "/v1/newgrad-scan/score",
    { method: "POST", headers: headers(), body: JSON.stringify(env) },
    env.requestId,
  );
},

async enrichNewGradRows(rows: EnrichedRow[]) {
  const env = envelope({ rows });
  return jsonRequest<NewGradEnrichResult>(
    "/v1/newgrad-scan/enrich",
    { method: "POST", headers: headers(), body: JSON.stringify(env) },
    env.requestId,
  );
},
```

**Step 3: Add background handlers**

In `extension/src/background/index.ts`, add handlers for:

- `newgradExtractList`: Inject `extract-newgrad.ts` list extractor into the active tab, return extracted rows.
- `newgradScore`: Forward rows to bridge `POST /v1/newgrad-scan/score`, return `{ promoted, filtered }`.
- `newgradEnrichDetails`: For each promoted row, open its `detailUrl` in a background tab (throttled — `detail_concurrent_tabs` concurrent, `detail_delay_min_ms`-`detail_delay_max_ms` random delay between opens). Inject `extract-newgrad.ts` detail extractor into each tab, collect results, close tabs. Return array of `EnrichedRow`.
- `newgradEnrich`: Forward enriched rows to bridge `POST /v1/newgrad-scan/enrich`, return `{ added, skipped, entries }`.

The throttled tab-opening logic:

```typescript
async function enrichDetailsThrottled(
  promotedRows: ScoredRow[],
  config: { concurrent: number; delayMinMs: number; delayMaxMs: number }
): Promise<EnrichedRow[]> {
  const results: EnrichedRow[] = [];
  const queue = [...promotedRows];

  async function processOne(scored: ScoredRow): Promise<EnrichedRow | null> {
    const tab = await chrome.tabs.create({
      url: scored.row.detailUrl,
      active: false,
    });
    if (!tab.id) return null;

    // Wait for page load
    await new Promise<void>((resolve) => {
      const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
        if (tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // Inject detail extractor
    const scriptResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { /* inline extractDetailPage logic here */ },
    });

    // Close tab
    await chrome.tabs.remove(tab.id);

    const detail = scriptResults[0]?.result;
    if (!detail) return null;

    return { row: scored.row, detail: { ...detail, position: scored.row.position } };
  }

  // Process in batches of config.concurrent
  while (queue.length > 0) {
    const batch = queue.splice(0, config.concurrent);
    const batchResults = await Promise.all(batch.map(processOne));
    for (const r of batchResults) {
      if (r) results.push(r);
    }
    if (queue.length > 0) {
      const delay = config.delayMinMs + Math.random() * (config.delayMaxMs - config.delayMinMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return results;
}
```

**Step 4: Commit**

```bash
git add extension/src/contracts/messages.ts extension/src/background/index.ts extension/src/background/bridge-client.ts
git commit -m "feat(newgrad-scan): extension message wiring and throttled detail enrichment"
```

---

## Task 7: Extension UI — scan view in floating panel

**Files:**
- Modify: `extension/src/panel/inject.ts`

**Step 1: Add newgrad-jobs.com detection**

In the `initPanel` function, after `runCapture()`, add host detection:

```typescript
// Detect newgrad-jobs.com and show scan UI instead of single-JD evaluation
const currentUrl = capturedData?.url ?? "";
const isNewGradPage = new URL(currentUrl).hostname.includes("newgrad-jobs.com");
if (isNewGradPage) {
  showNewGradScan();
  return;
}
```

**Step 2: Add scan UI HTML**

Add a new section to `buildHTML()`:

```html
<div id="newgrad-scan" class="section hidden">
  <div class="section-title">newgrad-jobs.com Scanner</div>
  <div id="ng-status" style="font-size:12px;color:#8f8f94;"></div>
  <button class="cta primary" id="ng-scan-btn">Scan & Score</button>
  <div id="ng-results" class="hidden">
    <div id="ng-promoted" style="font-size:12px;color:#4ecb71;"></div>
    <div id="ng-filtered" style="font-size:12px;color:#8f8f94;"></div>
    <div id="ng-deduped" style="font-size:12px;color:#8f8f94;"></div>
    <button class="cta primary" id="ng-enrich-btn">Enrich detail pages</button>
  </div>
  <div id="ng-enrich-results" class="hidden">
    <div id="ng-enriching" style="font-size:12px;color:#8f8f94;"></div>
    <div id="ng-added" style="font-size:12px;color:#4ecb71;"></div>
    <div id="ng-skipped" style="font-size:12px;color:#8f8f94;"></div>
    <div style="font-size:11px;color:#8f8f94;margin-top:6px;">
      Run <code style="color:#7aa7ff;">/career-ops pipeline</code> to start full evaluations.
    </div>
  </div>
</div>
```

**Step 3: Wire up the scan flow**

Add event listeners for the two-step flow:

1. "Scan & Score" button → calls `newgradExtractList` → then `newgradScore` → updates UI with promoted/filtered counts
2. "Enrich detail pages" button → calls `newgradEnrichDetails` → then `newgradEnrich` → updates UI with added/skipped counts

Each step shows a spinner/progress indicator and disables the button while running.

**Step 4: Add scan-specific styles**

Add to `buildStyles()`:

```css
#ng-results, #ng-enrich-results { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
```

**Step 5: Commit**

```bash
git add extension/src/panel/inject.ts
git commit -m "feat(newgrad-scan): scan UI in floating panel for newgrad-jobs.com"
```

---

## Task 8: CLI mode — `modes/newgrad-scan.md`

**Files:**
- Create: `modes/newgrad-scan.md`

**Step 1: Write the mode file**

```markdown
# Mode: newgrad-scan — newgrad-jobs.com Scanner

Scans newgrad-jobs.com for matching job listings via the Chrome extension,
scores them locally, enriches high-scoring rows, and adds survivors to the pipeline.

## Prerequisites

- Chrome extension installed and configured with bridge token
- Bridge server running (`npm --prefix bridge run start`)

## Execution

This mode uses the Chrome extension for DOM extraction. The CLI coordinates.

### Step 1: Verify bridge is running

Check `/v1/health`. If not reachable, tell the user:

> "Start the bridge first: `npm --prefix bridge run start`"

### Step 2: Direct user to browser

> "Open https://www.newgrad-jobs.com/ in Chrome.
> The career-ops panel will detect the page and show the scanner UI.
> Click **Scan & Score** to extract and filter listings.
> Then click **Enrich detail pages** to gather full JD data.
> Results will be written to `data/pipeline.md`."

### Step 3: Process results

After the user confirms the scan is done, offer:

> "Scan complete. Want me to process the new pipeline entries?
> - `/career-ops pipeline` — evaluate one by one
> - `/career-ops batch` — parallel batch evaluation"

## Scoring Configuration

Scoring is configured in `config/profile.yml → newgrad_scan`. Three dimensions:
1. **Role match** — title keyword matching
2. **Skill keywords** — qualifications text matching
3. **Freshness** — post age

Thresholds:
- `list_threshold` — minimum score to open detail page
- `pipeline_threshold` — minimum score to add to `data/pipeline.md`

To customize: edit `config/profile.yml → newgrad_scan`.
```

**Step 2: Update the skill router**

Add `newgrad-scan` to the mode routing table in `.claude/skills/career-ops/SKILL.md`:

```
| `newgrad-scan` / `newgrad` | `newgrad-scan` |
```

**Step 3: Commit**

```bash
git add modes/newgrad-scan.md .claude/skills/career-ops/SKILL.md
git commit -m "feat(newgrad-scan): CLI mode and skill router entry"
```

---

## Task 9: Build and integration test

**Files:**
- No new files — validate everything compiles and connects

**Step 1: Type-check bridge**

Run: `cd bridge && npx tsc --noEmit`
Expected: 0 errors

**Step 2: Type-check extension**

Run: `cd extension && npx tsc --noEmit`
Expected: 0 errors

**Step 3: Run bridge tests**

Run: `cd bridge && npx vitest run`
Expected: All pass (including new newgrad-scorer tests)

**Step 4: Manual integration test**

1. Start bridge: `npm --prefix bridge run start`
2. Load extension in Chrome (`chrome://extensions` → Load unpacked → `extension/`)
3. Navigate to `https://www.newgrad-jobs.com/`
4. Verify the floating panel shows "newgrad-jobs.com Scanner" with "Scan & Score" button
5. Click "Scan & Score" → verify rows are extracted and scored
6. Click "Enrich detail pages" → verify background tabs open/close with delays
7. Verify `data/pipeline.md` has new entries
8. Run `/career-ops pipeline` → verify entries are processed

**Step 5: Refine CSS selectors**

After testing against the live DOM, update the selectors in `extract-newgrad.ts` to match the actual page structure. This is expected iteration — the initial selectors are templates.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(newgrad-scan): integration fixes and selector refinements"
```

---

## Summary

| Task | What | Depends on |
|------|------|------------|
| 1 | Contract types (`newgrad.ts`) | — |
| 2 | Profile config (`profile.yml`) | — |
| 3 | Scoring logic + tests | Task 1 |
| 4 | Bridge endpoints | Tasks 1, 3 |
| 5 | Content script extractors | Task 1 |
| 6 | Extension wiring (messages, background, client) | Tasks 1, 4, 5 |
| 7 | Extension UI (scan panel) | Task 6 |
| 8 | CLI mode file | — |
| 9 | Build + integration test | All above |

**Parallelizable:** Tasks 1+2+8 can run in parallel. Tasks 3+5 can run in parallel after Task 1. Tasks 4+6 must be sequential. Task 7 depends on Task 6. Task 9 is last.
