import { describe, expect, test } from "vitest";

import { scoreEnrichedRowValue } from "./newgrad-value-scorer.js";

import type {
  EnrichedRow,
  NewGradDetail,
  NewGradRow,
  NewGradScanConfig,
  ScoredRow,
} from "../contracts/newgrad.js";

describe("newgrad value scorer", () => {
  test("scores a high-value detail page from structured webpage elements", () => {
    const value = scoreEnrichedRowValue(
      makeEnrichedRow({
        detail: {
          seniorityLevel: "Entry level",
          salaryRange: "$145,000 - $180,000",
          matchScore: 91,
          expLevelMatch: 96,
          skillMatch: 88,
          industryExpMatch: 75,
          recommendationTags: ["Great Match", "New Grad"],
          skillTags: ["TypeScript", "React", "Python", "AWS"],
          confirmedSponsorshipSupport: "yes",
          h1bSponsorshipHistory: [{ year: "2025", count: 8 }],
        },
      }),
      makeConfig(),
    );

    expect(value.passed).toBe(true);
    expect(value.score).toBeGreaterThanOrEqual(8);
    expect(value.reasons).toContain("strong_match_score");
    expect(value.reasons).toContain("early_career_level");
    expect(value.reasons).toContain("salary_meets_minimum");
  });

  test("penalizes senior detail pages with below-minimum compensation", () => {
    const value = scoreEnrichedRowValue(
      makeEnrichedRow({
        row: {
          title: "Senior Software Engineer",
        },
        detail: {
          seniorityLevel: "Senior level",
          salaryRange: "$80,000 - $100,000",
          matchScore: 82,
          expLevelMatch: 35,
          skillMatch: 80,
          recommendationTags: ["Skills Match"],
          skillTags: ["TypeScript", "React"],
        },
      }),
      makeConfig(),
    );

    expect(value.passed).toBe(false);
    expect(value.score).toBeLessThan(7);
    expect(value.penalties).toContain("seniority_too_high");
    expect(value.penalties).toContain("salary_below_minimum");
  });

  test("can pass without site match percentages when element tags are strong", () => {
    const value = scoreEnrichedRowValue(
      makeEnrichedRow({
        detail: {
          seniorityLevel: "Associate",
          salaryRange: null,
          matchScore: null,
          expLevelMatch: null,
          skillMatch: null,
          industryExpMatch: null,
          recommendationTags: ["Early Career", "Backend"],
          skillTags: ["Java", "Spring Boot", "Redis", "RabbitMQ", "AWS"],
          requiredQualifications: [
            "Build event-driven microservices with Java and Spring Boot.",
            "Experience with Redis, RabbitMQ, and AWS.",
          ],
        },
      }),
      makeConfig(),
    );

    expect(value.passed).toBe(true);
    expect(value.score).toBeGreaterThanOrEqual(7);
    expect(value.reasons).toContain("strong_structured_skill_match");
  });
});

function makeConfig(): NewGradScanConfig {
  return {
    role_keywords: {
      positive: ["software engineer", "backend", "ai engineer"],
      weight: 3,
    },
    skill_keywords: {
      terms: [
        "typescript",
        "react",
        "python",
        "aws",
        "java",
        "spring boot",
        "redis",
        "rabbitmq",
      ],
      weight: 1,
      max_score: 4,
    },
    freshness: { within_24h: 2, within_3d: 1, older: 0 },
    list_threshold: 3,
    pipeline_threshold: 7,
    detail_value_threshold: 7,
    compensation_min_usd: 120_000,
    hard_filters: {
      blocked_companies: [],
      exclude_no_sponsorship: true,
      exclude_active_security_clearance: true,
      max_years_experience: 2,
      no_sponsorship_keywords: ["no sponsorship"],
      no_sponsorship_companies: [],
      clearance_keywords: ["active secret clearance"],
      active_security_clearance_companies: [],
    },
    detail_concurrent_tabs: 3,
    detail_delay_min_ms: 2000,
    detail_delay_max_ms: 5000,
  };
}

function makeEnrichedRow(overrides?: {
  row?: Partial<NewGradRow>;
  detail?: Partial<NewGradDetail>;
}): EnrichedRow {
  const row: NewGradRow = {
    position: 1,
    title: "Software Engineer",
    postedAgo: "2 hours ago",
    applyUrl: "https://jobs.example.com/apply",
    detailUrl: "https://newgrad-jobs.com/detail/1",
    workModel: "Remote",
    location: "San Francisco, CA",
    company: "Acme",
    salary: "$140,000 - $180,000",
    companySize: "51-200",
    industry: "Software",
    qualifications: "TypeScript React Python AWS",
    h1bSponsored: false,
    sponsorshipSupport: "unknown",
    confirmedSponsorshipSupport: "unknown",
    requiresActiveSecurityClearance: false,
    confirmedRequiresActiveSecurityClearance: false,
    isNewGrad: true,
    ...overrides?.row,
  };

  const scored: ScoredRow = {
    row,
    score: 7,
    maxScore: 9,
    breakdown: {
      roleMatch: 3,
      skillHits: 2,
      skillKeywordsMatched: ["typescript", "react"],
      freshness: 2,
    },
  };

  const detail: NewGradDetail = {
    position: 1,
    title: row.title,
    company: row.company,
    location: row.location,
    employmentType: "Full-time",
    workModel: "Remote",
    seniorityLevel: "Entry level",
    salaryRange: "$140,000 - $180,000",
    matchScore: 80,
    expLevelMatch: 85,
    skillMatch: 80,
    industryExpMatch: 70,
    description: "Build production software with TypeScript, React, Python, and AWS.",
    industries: ["Software"],
    recommendationTags: ["Great Match"],
    responsibilities: ["Build customer-facing product features."],
    requiredQualifications: ["TypeScript, React, Python, AWS"],
    skillTags: ["TypeScript", "React", "Python", "AWS"],
    taxonomy: ["Software Engineering"],
    companyWebsite: null,
    companyDescription: null,
    companySize: "51-200",
    companyLocation: "San Francisco, CA",
    companyFoundedYear: null,
    companyCategories: ["Software"],
    h1bSponsorLikely: null,
    sponsorshipSupport: "unknown",
    h1bSponsorshipHistory: [],
    requiresActiveSecurityClearance: false,
    confirmedSponsorshipSupport: "unknown",
    confirmedRequiresActiveSecurityClearance: false,
    insiderConnections: null,
    originalPostUrl: row.applyUrl,
    applyNowUrl: row.applyUrl,
    applyFlowUrls: [],
    ...overrides?.detail,
  };

  return { row: scored, detail };
}
