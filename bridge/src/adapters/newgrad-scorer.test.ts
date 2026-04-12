import { describe, expect, test } from "vitest";

import {
  parsePostedAgo,
  parseFreshness,
  scoreRow,
  scoreAndFilter,
} from "./newgrad-scorer.js";

import type { NewGradRow, NewGradScanConfig } from "../contracts/newgrad.js";

type ConfigOverrides = Omit<
  Partial<NewGradScanConfig>,
  "role_keywords" | "skill_keywords" | "freshness"
> & {
  role_keywords?: Partial<NewGradScanConfig["role_keywords"]>;
  skill_keywords?: Partial<NewGradScanConfig["skill_keywords"]>;
  freshness?: Partial<NewGradScanConfig["freshness"]>;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function makeConfig(overrides?: ConfigOverrides): NewGradScanConfig {
  const base: NewGradScanConfig = {
    role_keywords: {
      positive: ["software engineer", "swe", "backend"],
      weight: 3,
    },
    skill_keywords: {
      terms: ["typescript", "python", "react", "node", "aws"],
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
  return {
    ...base,
    ...overrides,
    role_keywords: { ...base.role_keywords, ...overrides?.role_keywords },
    skill_keywords: { ...base.skill_keywords, ...overrides?.skill_keywords },
    freshness: { ...base.freshness, ...overrides?.freshness },
  };
}

function makeRow(overrides?: Partial<NewGradRow>): NewGradRow {
  const base: NewGradRow = {
    position: 1,
    title: "Software Engineer",
    postedAgo: "2 hours ago",
    applyUrl: "https://example.com/apply",
    detailUrl: "https://newgrad-jobs.com/detail/1",
    workModel: "Remote",
    location: "San Francisco, CA",
    company: "Acme Corp",
    salary: "$120k - $150k",
    companySize: "51-200",
    industry: "Software Development",
    qualifications: "Experience with TypeScript, React, and Node.js",
    h1bSponsored: false,
    isNewGrad: true,
  };
  if (!overrides) return base;
  // Explicit property-by-property assignment to handle null overrides correctly
  for (const key of Object.keys(overrides) as Array<keyof NewGradRow>) {
    if (key in overrides) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      (base as any)[key] = (overrides as any)[key];
    }
  }
  return base;
}

/* -------------------------------------------------------------------------- */
/*  parsePostedAgo                                                             */
/* -------------------------------------------------------------------------- */

describe("parsePostedAgo", () => {
  test("parses '2 hours ago' to 120 minutes", () => {
    expect(parsePostedAgo("2 hours ago")).toBe(120);
  });

  test("parses '1 hour ago' to 60 minutes", () => {
    expect(parsePostedAgo("1 hour ago")).toBe(60);
  });

  test("parses '3 days ago' to 4320 minutes", () => {
    expect(parsePostedAgo("3 days ago")).toBe(3 * 24 * 60);
  });

  test("parses '1 day ago' to 1440 minutes", () => {
    expect(parsePostedAgo("1 day ago")).toBe(24 * 60);
  });

  test("parses '30 minutes ago' to 30 minutes", () => {
    expect(parsePostedAgo("30 minutes ago")).toBe(30);
  });

  test("parses '1 minute ago' to 1 minute", () => {
    expect(parsePostedAgo("1 minute ago")).toBe(1);
  });

  test("parses '1 week ago' to 10080 minutes", () => {
    expect(parsePostedAgo("1 week ago")).toBe(7 * 24 * 60);
  });

  test("parses '2 weeks ago' to 20160 minutes", () => {
    expect(parsePostedAgo("2 weeks ago")).toBe(2 * 7 * 24 * 60);
  });

  test("parses '1 month ago' to 43200 minutes", () => {
    expect(parsePostedAgo("1 month ago")).toBe(30 * 24 * 60);
  });

  test("parses short-form '2d ago'", () => {
    expect(parsePostedAgo("2d ago")).toBe(2 * 24 * 60);
  });

  test("parses short-form '1w ago'", () => {
    expect(parsePostedAgo("1w ago")).toBe(7 * 24 * 60);
  });

  test("parses short-form '5h ago'", () => {
    expect(parsePostedAgo("5h ago")).toBe(5 * 60);
  });

  test("parses short-form '45m ago'", () => {
    expect(parsePostedAgo("45m ago")).toBe(45);
  });

  test("returns Infinity for unparseable strings", () => {
    expect(parsePostedAgo("just now")).toBe(Infinity);
    expect(parsePostedAgo("")).toBe(Infinity);
    expect(parsePostedAgo("unknown")).toBe(Infinity);
  });
});

/* -------------------------------------------------------------------------- */
/*  parseFreshness                                                             */
/* -------------------------------------------------------------------------- */

describe("parseFreshness", () => {
  const freshConfig = { within_24h: 2, within_3d: 1, older: 0 };

  test("very recent post gets within_24h freshness points", () => {
    expect(parseFreshness(30, freshConfig)).toBe(2);
  });

  test("zero minutes gets within_24h freshness points", () => {
    expect(parseFreshness(0, freshConfig)).toBe(2);
  });

  test("post from 12 hours ago stays in the within_24h bucket", () => {
    expect(parseFreshness(12 * 60, freshConfig)).toBe(2);
  });

  test("post from 2 days ago gets within_3d freshness", () => {
    expect(parseFreshness(2 * 24 * 60, freshConfig)).toBe(1);
  });

  test("post older than 3 days gets older freshness", () => {
    expect(parseFreshness(5 * 24 * 60, freshConfig)).toBe(0);
  });

  test("post exactly at 24 hours moves to the within_3d bucket", () => {
    expect(parseFreshness(24 * 60, freshConfig)).toBe(1);
  });

  test("Infinity minutes returns older freshness", () => {
    expect(parseFreshness(Infinity, freshConfig)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  scoreRow                                                                   */
/* -------------------------------------------------------------------------- */

describe("scoreRow", () => {
  test("matching SWE title with skill hits scores high", () => {
    const config = makeConfig();
    const row = makeRow();
    const scored = scoreRow(row, config);

    // Should get role match + skill hits + freshness
    expect(scored.score).toBeGreaterThan(0);
    expect(scored.breakdown.roleMatch).toBeGreaterThan(0);
    expect(scored.breakdown.skillHits).toBeGreaterThan(0);
    expect(scored.breakdown.freshness).toBeGreaterThan(0);
  });

  test("unrelated title with no skill matches scores 0 for role + skills", () => {
    const config = makeConfig();
    const row = makeRow({
      title: "Marketing Manager",
      qualifications: "Experience in brand marketing and social media",
    });
    const scored = scoreRow(row, config);

    expect(scored.breakdown.roleMatch).toBe(0);
    expect(scored.breakdown.skillHits).toBe(0);
    // Only freshness could contribute points
    expect(scored.score).toBe(scored.breakdown.freshness);
  });

  test("skill score is capped at skill_keywords.max_score", () => {
    const config = makeConfig({
      skill_keywords: { terms: ["typescript", "python"], weight: 2, max_score: 3 },
    });
    const row = makeRow({
      qualifications: "TypeScript, Python, TypeScript again, Python again",
    });
    const scored = scoreRow(row, config);

    // Skill hits should be capped at number of unique skill keywords
    expect(scored.breakdown.skillHits).toBeLessThanOrEqual(config.skill_keywords.max_score);
  });

  test("matched keywords are recorded in breakdown", () => {
    const config = makeConfig();
    const row = makeRow({
      qualifications: "Experience with TypeScript and React",
    });
    const scored = scoreRow(row, config);

    expect(scored.breakdown.skillKeywordsMatched).toContain("typescript");
    expect(scored.breakdown.skillKeywordsMatched).toContain("react");
    expect(scored.breakdown.skillKeywordsMatched).not.toContain("python");
  });

  test("role match is case-insensitive", () => {
    const config = makeConfig({ role_keywords: { positive: ["backend"] } });
    const row = makeRow({ title: "BACKEND Engineer" });
    const scored = scoreRow(row, config);

    expect(scored.breakdown.roleMatch).toBeGreaterThan(0);
  });

  test("skill match is case-insensitive", () => {
    const config = makeConfig({ skill_keywords: { terms: ["typescript"] } });
    const row = makeRow({ qualifications: "TYPESCRIPT experience required" });
    const scored = scoreRow(row, config);

    expect(scored.breakdown.skillHits).toBe(1);
    expect(scored.breakdown.skillKeywordsMatched).toContain("typescript");
  });

  test("null qualifications yields 0 skill score", () => {
    const config = makeConfig();
    const row = makeRow({ qualifications: null });
    const scored = scoreRow(row, config);

    expect(scored.breakdown.skillHits).toBe(0);
    expect(scored.breakdown.skillKeywordsMatched).toEqual([]);
  });

  test("maxScore equals role weight + skill max + top freshness bucket", () => {
    const config = makeConfig();
    const scored = scoreRow(makeRow(), config);

    const expectedMax =
      config.role_keywords.weight +
      config.skill_keywords.max_score +
      config.freshness.within_24h;
    expect(scored.maxScore).toBe(expectedMax);
  });
});

/* -------------------------------------------------------------------------- */
/*  scoreAndFilter                                                             */
/* -------------------------------------------------------------------------- */

describe("scoreAndFilter", () => {
  test("negative keyword in title filters row with reason 'negative_title'", () => {
    const config = makeConfig();
    const rows = [makeRow({ title: "Intern - Software Engineering" })];
    const negativeKeywords = ["intern"];
    const tracked = new Set<string>();

    const result = scoreAndFilter(rows, config, negativeKeywords, tracked);

    expect(result.promoted).toHaveLength(0);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]!.reason).toBe("negative_title");
  });

  test("negative keyword match is case-insensitive", () => {
    const config = makeConfig();
    const rows = [makeRow({ title: "INTERN Software Engineer" })];
    const negativeKeywords = ["intern"];
    const tracked = new Set<string>();

    const result = scoreAndFilter(rows, config, negativeKeywords, tracked);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]!.reason).toBe("negative_title");
  });

  test("already tracked company|role is filtered with reason 'already_tracked'", () => {
    const config = makeConfig();
    const rows = [makeRow({ company: "Acme Corp", title: "Software Engineer" })];
    const negativeKeywords: string[] = [];
    const tracked = new Set(["acme corp|software engineer"]);

    const result = scoreAndFilter(rows, config, negativeKeywords, tracked);

    expect(result.promoted).toHaveLength(0);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]!.reason).toBe("already_tracked");
  });

  test("score below threshold is filtered with reason 'below_threshold'", () => {
    const config = makeConfig({ list_threshold: 100 });
    const rows = [makeRow()];
    const negativeKeywords: string[] = [];
    const tracked = new Set<string>();

    const result = scoreAndFilter(rows, config, negativeKeywords, tracked);

    expect(result.promoted).toHaveLength(0);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]!.reason).toBe("below_threshold");
  });

  test("score below configured list threshold is filtered with reason 'below_threshold'", () => {
    const config = makeConfig({ list_threshold: 3 });
    const rows = [
      makeRow({
        title: "Marketing Manager",
        qualifications: null,
        postedAgo: "2 weeks ago",
      }),
    ];
    const negativeKeywords: string[] = [];
    const tracked = new Set<string>();

    const result = scoreAndFilter(rows, config, negativeKeywords, tracked);

    expect(result.promoted).toHaveLength(0);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]!.reason).toBe("below_threshold");
  });

  test("promoted rows are sorted by score descending", () => {
    const config = makeConfig({ list_threshold: 0 });
    const rows = [
      makeRow({
        position: 1,
        title: "Marketing Manager",
        qualifications: null,
        postedAgo: "5 days ago",
      }),
      makeRow({
        position: 2,
        title: "Software Engineer",
        qualifications: "TypeScript, React, Node, Python, AWS",
        postedAgo: "1 hour ago",
      }),
      makeRow({
        position: 3,
        title: "Backend Engineer",
        qualifications: "Python",
        postedAgo: "2 days ago",
      }),
    ];
    const negativeKeywords: string[] = [];
    const tracked = new Set<string>();

    const result = scoreAndFilter(rows, config, negativeKeywords, tracked);

    expect(result.promoted.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < result.promoted.length; i++) {
      expect(result.promoted[i - 1]!.score).toBeGreaterThanOrEqual(
        result.promoted[i]!.score,
      );
    }
  });

  test("hard filters take priority over soft filters", () => {
    // A row that matches a negative keyword AND would be below threshold
    // should be filtered as "negative_title", not "below_threshold"
    const config = makeConfig({ list_threshold: 100 });
    const rows = [makeRow({ title: "Intern Designer" })];
    const negativeKeywords = ["intern"];
    const tracked = new Set<string>();

    const result = scoreAndFilter(rows, config, negativeKeywords, tracked);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]!.reason).toBe("negative_title");
  });

  test("negative_title checked before already_tracked", () => {
    const config = makeConfig();
    const rows = [makeRow({ title: "Intern", company: "Acme Corp" })];
    const negativeKeywords = ["intern"];
    const tracked = new Set(["acme corp|intern"]);

    const result = scoreAndFilter(rows, config, negativeKeywords, tracked);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]!.reason).toBe("negative_title");
  });

  test("good rows pass through to promoted", () => {
    const config = makeConfig();
    const rows = [
      makeRow({
        title: "Software Engineer",
        qualifications: "TypeScript, React, Node.js",
        postedAgo: "2 hours ago",
      }),
    ];
    const negativeKeywords: string[] = [];
    const tracked = new Set<string>();

    const result = scoreAndFilter(rows, config, negativeKeywords, tracked);

    expect(result.promoted).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
    expect(result.promoted[0]!.score).toBeGreaterThan(0);
  });

  test("empty input returns empty results", () => {
    const config = makeConfig();
    const result = scoreAndFilter([], config, [], new Set());

    expect(result.promoted).toHaveLength(0);
    expect(result.filtered).toHaveLength(0);
  });
});
