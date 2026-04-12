/**
 * newgrad.ts — shared types for the newgrad-jobs.com scanner feature.
 *
 * Defines the data shapes flowing through the newgrad-scan pipeline:
 *   1. Content script extracts listing rows    -> NewGradRow[]
 *   2. Bridge scores + filters locally         -> ScoredRow[] + FilteredRow[]
 *   3. Bridge enriches from detail pages        -> EnrichedRow[]
 *   4. Promoted rows are written to pipeline.md -> PipelineEntry[]
 *
 * CONTRACTS ONLY. No runtime.
 */

/* -------------------------------------------------------------------------- */
/*  Raw listing data                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One row from the newgrad-jobs.com listing table, as extracted by the
 * content script. Field names mirror the site's column headers.
 */
export interface NewGradRow {
  /** Row position in the listing table (1-based). */
  position: number;
  /** Job title as displayed in the listing. */
  title: string;
  /** Relative time string, e.g. "2d ago", "1w ago". */
  postedAgo: string;
  /** Direct link to the external application page. */
  applyUrl: string;
  /** Link to the newgrad-jobs.com detail page for this listing. */
  detailUrl: string;
  /** Remote, hybrid, on-site, or as displayed on the site. */
  workModel: string;
  /** Location string, e.g. "San Francisco, CA" or "Remote". */
  location: string;
  /** Company name. */
  company: string;
  /** Salary or compensation range as displayed, if available. */
  salary: string | null;
  /** Company size bucket, e.g. "51-200", "1001-5000". */
  companySize: string | null;
  /** Industry label, e.g. "Software Development". */
  industry: string | null;
  /** Qualification summary text, if listed. */
  qualifications: string | null;
  /** Whether the listing indicates H-1B visa sponsorship. */
  h1bSponsored: boolean;
  /** Whether the listing is tagged as new-grad eligible. */
  isNewGrad: boolean;
}

/**
 * Enriched data from the detail or apply page. Contains structured
 * fields that are only available after navigating to the listing's
 * detail URL.
 */
export interface NewGradDetail {
  /** Row position from the original listing, for correlation. */
  position: number;
  /** Job title from the detail page (may differ from listing). */
  title: string;
  /** Company name from the detail page. */
  company: string;
  /** Full location string from the detail page. */
  location: string;
  /** Employment type, e.g. "Full-time", "Contract", "Internship". */
  employmentType: string | null;
  /** Work model from the detail page, e.g. "Remote", "Hybrid". */
  workModel: string | null;
  /** Seniority level, e.g. "Entry level", "Associate". */
  seniorityLevel: string | null;
  /** Salary range as displayed on the detail page. */
  salaryRange: string | null;
  /** Site-computed match score, if displayed (0-100). */
  matchScore: number | null;
  /** Experience level match indicator from the detail page. */
  expLevelMatch: number | null;
  /** Skill match indicator from the detail page. */
  skillMatch: number | null;
  /** Industry experience match indicator. */
  industryExpMatch: number | null;
  /** Full job description text. */
  description: string;
  /** Industry or category tags associated with the role/company. */
  industries: readonly string[];
  /** Visible recommendation or fit tags shown by Jobright. */
  recommendationTags: readonly string[];
  /** Responsibilities extracted from the page or embedded data. */
  responsibilities: readonly string[];
  /** Requirements or qualifications extracted from the page or embedded data. */
  requiredQualifications: readonly string[];
  /** Skill tags visible in the ATS / qualification sections. */
  skillTags: readonly string[];
  /** Job taxonomy labels from Jobright metadata. */
  taxonomy: readonly string[];
  /** Company website when available. */
  companyWebsite: string | null;
  /** Company summary/description from the page. */
  companyDescription: string | null;
  /** Company size string from detail metadata. */
  companySize: string | null;
  /** Company headquarters/location string. */
  companyLocation: string | null;
  /** Company founding year if displayed. */
  companyFoundedYear: string | null;
  /** Company category labels. */
  companyCategories: readonly string[];
  /** Whether the detail page signals likely H1B sponsorship. */
  h1bSponsorLikely: boolean | null;
  /** Historical H1B sponsorship counts by year. */
  h1bSponsorshipHistory: readonly { year: string; count: number }[];
  /** Count of visible insider connections on the page. */
  insiderConnections: number | null;
  /** URL of the original listing on the source site. */
  originalPostUrl: string;
  /** Direct "Apply Now" URL from the detail page. */
  applyNowUrl: string;
  /** URLs observed while probing the apply flow in a logged-in session. */
  applyFlowUrls: readonly string[];
}

/* -------------------------------------------------------------------------- */
/*  Scoring                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Breakdown of how a row's score was computed. Each field corresponds
 * to one scoring dimension.
 */
export interface ScoreBreakdown {
  /** Points earned from role/title keyword matches. */
  roleMatch: number;
  /** Weighted skill score contributed by keyword matches. */
  skillHits: number;
  /** The actual skill keywords that were found. */
  skillKeywordsMatched: readonly string[];
  /** Points earned from posting recency (newer = higher). */
  freshness: number;
}

/**
 * A listing row after local scoring. Wraps the original row with
 * its computed score and detailed breakdown.
 */
export interface ScoredRow {
  /** The original listing row. */
  row: NewGradRow;
  /** Total computed score. */
  score: number;
  /** Maximum possible score given the current config. */
  maxScore: number;
  /** Per-dimension score breakdown. */
  breakdown: ScoreBreakdown;
}

/**
 * A row that was filtered out during scoring. Captures the reason
 * so the user can understand why a listing was excluded.
 */
export interface FilteredRow {
  /** The original listing row that was filtered. */
  row: NewGradRow;
  /** Machine-readable reason for filtering (e.g. "below_threshold", "title_mismatch"). */
  reason: string;
  /** Optional human-readable detail explaining the filter decision. */
  detail?: string;
}

/* -------------------------------------------------------------------------- */
/*  Scoring results                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Result of the scoring phase: rows that passed the threshold are
 * promoted, rows that didn't are filtered with a reason.
 */
export interface NewGradScoreResult {
  /** Rows that passed the score threshold, sorted by score descending. */
  promoted: readonly ScoredRow[];
  /** Rows that were excluded, with reasons. */
  filtered: readonly FilteredRow[];
}

/* -------------------------------------------------------------------------- */
/*  Enrichment                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A listing row combined with its detail-page data after enrichment.
 */
export interface EnrichedRow {
  /** The scored listing row. */
  row: ScoredRow;
  /** Detail data fetched from the listing's detail page. */
  detail: NewGradDetail;
}

/**
 * One entry written to `data/pipeline.md` as a result of the scan.
 */
export interface PipelineEntry {
  /** The job URL added to the pipeline. */
  url: string;
  /** Company name. */
  company: string;
  /** Job title / role. */
  role: string;
  /** Score from the local scorer, for reference. */
  score: number;
  /** Source identifier, e.g. "newgrad-jobs.com". */
  source: string;
}

/**
 * Result of the enrichment + pipeline-write phase.
 */
export interface NewGradEnrichResult {
  /** Number of entries successfully added to the pipeline. */
  added: number;
  /** Number of entries skipped (e.g. duplicates already in pipeline). */
  skipped: number;
  /** The pipeline entries that were written. */
  entries: readonly PipelineEntry[];
}

/* -------------------------------------------------------------------------- */
/*  Configuration                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Scoring configuration for the newgrad scanner. Mirrors the structure
 * expected in `config/profile.yml` under `newgrad_scan`.
 */
export interface NewGradScanConfig {
  /** Title-match scoring configuration. */
  role_keywords: {
    positive: readonly string[];
    weight: number;
  };
  /** Skill-match scoring configuration. */
  skill_keywords: {
    terms: readonly string[];
    weight: number;
    max_score: number;
  };
  /** Freshness buckets. */
  freshness: {
    within_24h: number;
    within_3d: number;
    older: number;
  };
  /** Minimum score to promote a list row to detail enrichment. */
  list_threshold: number;
  /** Minimum score required to append an enriched row to pipeline.md. */
  pipeline_threshold: number;
  /** Max number of background tabs to open concurrently. */
  detail_concurrent_tabs: number;
  /** Minimum randomized delay between enrichment batches. */
  detail_delay_min_ms: number;
  /** Maximum randomized delay between enrichment batches. */
  detail_delay_max_ms: number;
}
