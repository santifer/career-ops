/**
 * newgrad-scorer.ts — Deterministic scoring engine for newgrad-jobs.com rows.
 *
 * Pure functions, no I/O. Scores rows along three dimensions:
 *   1. Role match     — does the title contain a target role keyword?
 *   2. Skill keywords — how many configured skill terms appear in qualifications?
 *   3. Freshness      — bucketed score based on posting recency.
 *
 * All scoring is config-driven via NewGradScanConfig from the contracts.
 */

import type {
  FilteredRow,
  NewGradRow,
  NewGradScanConfig,
  ScoreBreakdown,
  ScoredRow,
} from "../contracts/newgrad.js";

/* -------------------------------------------------------------------------- */
/*  Parsing helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Unit-to-minutes multipliers for time-ago parsing.
 * Supports both long-form ("hours") and short-form ("h") units.
 */
const UNIT_TO_MINUTES: Record<string, number> = {
  minute: 1,
  minutes: 1,
  m: 1,
  hour: 60,
  hours: 60,
  h: 60,
  day: 1440,
  days: 1440,
  d: 1440,
  week: 10080,
  weeks: 10080,
  w: 10080,
  month: 43200,
  months: 43200,
};

/**
 * Parse relative time strings like "2 hours ago", "3d ago", "30 minutes ago"
 * into the number of minutes since posted.
 *
 * Supports long-form ("2 hours ago") and short-form ("2h ago") variants
 * for minute, hour, day, week, and month units.
 *
 * @returns Minutes since posted, or `Infinity` if the string is unparseable.
 */
export function parsePostedAgo(text: string): number {
  // Long form: "2 hours ago", "30 minutes ago"
  const longMatch = /^(\d+)\s+([a-z]+)\s+ago$/i.exec(text.trim());
  if (longMatch) {
    const value = Number(longMatch[1]);
    const unit = longMatch[2]!.toLowerCase();
    const multiplier = UNIT_TO_MINUTES[unit];
    if (multiplier !== undefined) {
      return value * multiplier;
    }
  }

  // Short form: "2h ago", "3d ago"
  const shortMatch = /^(\d+)([a-z])\s+ago$/i.exec(text.trim());
  if (shortMatch) {
    const value = Number(shortMatch[1]);
    const unit = shortMatch[2]!.toLowerCase();
    const multiplier = UNIT_TO_MINUTES[unit];
    if (multiplier !== undefined) {
      return value * multiplier;
    }
  }

  return Infinity;
}

/* -------------------------------------------------------------------------- */
/*  Freshness scoring                                                          */
/* -------------------------------------------------------------------------- */

/** Convert minutes-since-posted into a bucketed freshness score. */
export function parseFreshness(
  minutesAgo: number,
  config: NewGradScanConfig["freshness"],
): number {
  if (!isFinite(minutesAgo) || minutesAgo < 0) return config.older;

  const hoursAgo = minutesAgo / 60;
  if (hoursAgo < 24) return config.within_24h;
  if (hoursAgo < 72) return config.within_3d;
  return config.older;
}

/* -------------------------------------------------------------------------- */
/*  Row scoring                                                                */
/* -------------------------------------------------------------------------- */

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function equalsAny(value: string, candidates: readonly string[]): string | null {
  const normalizedValue = normalizeText(value);
  for (const candidate of candidates) {
    if (normalizedValue && normalizeText(candidate) === normalizedValue) {
      return candidate;
    }
  }
  return null;
}

/**
 * Score a single listing row across three dimensions.
 *
 * **Role match (0 or config.role_keywords.weight):**
 *   If the title contains any configured positive role keyword
 *   (case-insensitive), the row earns that configured weight.
 *
 * **Skill keywords (0 to config.skill_keywords.max_score):**
 *   Count of matching configured terms found in the qualifications text,
 *   multiplied by the configured skill weight and capped at `max_score`.
 *
 * **Freshness:**
 *   Bucketed score from the configured freshness bands.
 *
 * @returns ScoredRow with total score, maxScore, and breakdown.
 */
export function scoreRow(row: NewGradRow, config: NewGradScanConfig): ScoredRow {
  const titleLower = row.title.toLowerCase();
  const qualsLower = (row.qualifications ?? "").toLowerCase();

  // --- Role match ---
  const roleMatched = config.role_keywords.positive.some((kw) =>
    titleLower.includes(kw.toLowerCase()),
  );
  const roleScore = roleMatched ? config.role_keywords.weight : 0;

  // --- Skill keywords ---
  const matchedSkills: string[] = [];
  for (const term of config.skill_keywords.terms) {
    if (qualsLower.includes(term.toLowerCase())) {
      matchedSkills.push(term);
    }
  }
  const skillScore = Math.min(
    matchedSkills.length * config.skill_keywords.weight,
    config.skill_keywords.max_score,
  );

  // --- Freshness ---
  const minutesAgo = parsePostedAgo(row.postedAgo);
  const freshnessScore = parseFreshness(minutesAgo, config.freshness);

  // --- Totals ---
  const score = roleScore + skillScore + freshnessScore;
  const maxScore =
    config.role_keywords.weight +
    config.skill_keywords.max_score +
    config.freshness.within_24h;

  const breakdown: ScoreBreakdown = {
    roleMatch: roleScore,
    skillHits: skillScore,
    skillKeywordsMatched: matchedSkills,
    freshness: freshnessScore,
  };

  return { row, score, maxScore, breakdown };
}

/* -------------------------------------------------------------------------- */
/*  Batch scoring + filtering                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Score a batch of rows and separate them into promoted and filtered lists.
 *
 * **Hard filters** (checked in order, first match wins):
 *   1. `negative_title` — title contains any negative keyword (case-insensitive)
 *   2. `no_sponsorship` — company is on the no-sponsorship blocklist
 *   3. `active_clearance_required` — company is on the clearance blocklist
 *   4. `no_sponsorship` — original employer posting confirms no sponsorship
 *   5. `active_clearance_required` — original employer posting confirms active secret clearance
 *   6. `already_tracked` — `company|title` (lowercased) exists in trackedCompanyRoles
 *
 * **Soft filter:**
 *   3. `below_threshold` — score < list_threshold
 *
 * Promoted rows are sorted by score descending (highest first).
 *
 * @param rows                — Raw listing rows to score.
 * @param config              — Scoring configuration.
 * @param negativeKeywords    — Title keywords that trigger hard exclusion.
 * @param trackedCompanyRoles — Set of "company|role" strings already tracked.
 * @returns `{ promoted, filtered }` with promoted sorted by score desc.
 */
export function scoreAndFilter(
  rows: readonly NewGradRow[],
  config: NewGradScanConfig,
  negativeKeywords: readonly string[],
  trackedCompanyRoles: ReadonlySet<string>,
): { promoted: ScoredRow[]; filtered: FilteredRow[] } {
  const promoted: ScoredRow[] = [];
  const filtered: FilteredRow[] = [];

  const negativeLower = negativeKeywords.map((kw) => kw.toLowerCase());

  for (const row of rows) {
    const titleLower = row.title.toLowerCase();
    // Hard filter 1: negative title keywords
    const matchedNegative = negativeLower.find((kw) => titleLower.includes(kw));
    if (matchedNegative !== undefined) {
      filtered.push({
        row,
        reason: "negative_title",
        detail: `Title contains negative keyword: "${matchedNegative}"`,
      });
      continue;
    }

    // Hard filter 2: company-level no sponsorship blocklist
    const blockedNoSponsorshipCompany = config.hard_filters.exclude_no_sponsorship
      ? equalsAny(row.company, config.hard_filters.no_sponsorship_companies)
      : null;
    if (blockedNoSponsorshipCompany !== null) {
      filtered.push({
        row,
        reason: "no_sponsorship",
        detail: `Company is on the no-sponsorship blocklist: "${blockedNoSponsorshipCompany}"`,
      });
      continue;
    }

    // Hard filter 3: company-level active clearance blocklist
    const blockedActiveClearanceCompany = config.hard_filters.exclude_active_security_clearance
      ? equalsAny(
          row.company,
          config.hard_filters.active_security_clearance_companies,
        )
      : null;
    if (blockedActiveClearanceCompany !== null) {
      filtered.push({
        row,
        reason: "active_clearance_required",
        detail: `Company is on the active-clearance blocklist: "${blockedActiveClearanceCompany}"`,
      });
      continue;
    }

    // Hard filter 4: original employer posting confirms no sponsorship support
    const matchedNoSponsorship = config.hard_filters.exclude_no_sponsorship
      ? row.confirmedSponsorshipSupport === "no"
        ? "confirmed on original employer posting"
        : null
      : null;
    if (matchedNoSponsorship !== null) {
      filtered.push({
        row,
        reason: "no_sponsorship",
        detail: `Role does not provide sponsorship support: "${matchedNoSponsorship}"`,
      });
      continue;
    }

    // Hard filter 5: original employer posting confirms active secret clearance requirement
    const matchedClearance = config.hard_filters.exclude_active_security_clearance
      ? row.confirmedRequiresActiveSecurityClearance
        ? "confirmed on original employer posting"
        : null
      : null;
    if (matchedClearance !== null) {
      filtered.push({
        row,
        reason: "active_clearance_required",
        detail: `Role requires active secret clearance: "${matchedClearance}"`,
      });
      continue;
    }

    // Hard filter 6: already tracked
    const trackingKey = `${row.company.toLowerCase()}|${titleLower}`;
    if (trackedCompanyRoles.has(trackingKey)) {
      filtered.push({
        row,
        reason: "already_tracked",
        detail: `Already tracked: ${row.company} | ${row.title}`,
      });
      continue;
    }

    // Score the row
    const scored = scoreRow(row, config);

    // Soft filter: below list threshold
    if (scored.score < config.list_threshold) {
      filtered.push({
        row,
        reason: "below_threshold",
        detail: `Score ${scored.score}/${scored.maxScore} below threshold ${config.list_threshold}`,
      });
      continue;
    }

    promoted.push(scored);
  }

  // Sort promoted by score descending
  promoted.sort((a, b) => b.score - a.score);

  return { promoted, filtered };
}
