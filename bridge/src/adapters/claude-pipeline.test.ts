import { expect, test } from "vitest";

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClaudePipelineAdapter } from "./claude-pipeline.js";
import { __internal } from "./claude-pipeline.js";
import type { NewGradRow } from "../contracts/newgrad.js";

test("extractTerminalJsonObject returns the final Claude JSON payload", () => {
  const stdout = [
    "starting evaluation",
    "",
    "{",
    '  "status": "completed",',
    '  "id": "job-123",',
    '  "report_num": "017",',
    '  "company": "Marble",',
    '  "role": "Founding AI Engineer",',
    '  "score": 4.6,',
    '  "tldr": "Strong fit for agentic product work.",',
    '  "pdf": null,',
    '  "report": "/tmp/reports/017-marble-2026-04-10.md",',
    '  "error": null',
    "}",
  ].join("\n");

  const parsed = __internal.extractTerminalJsonObject(stdout);

  expect(parsed.status).toBe("completed");
  expect(parsed.report_num).toBe("017");
  expect(parsed.score).toBe(4.6);
  expect(parsed.tldr).toBe("Strong fit for agentic product work.");
});

test("buildCodexTerminalSchema keeps legitimacy in the required schema", () => {
  const schema = __internal.buildCodexTerminalSchema() as {
    required?: string[];
    properties?: Record<string, unknown>;
  };

  expect(schema.required).toContain("legitimacy");
  expect(schema.properties?.legitimacy).toEqual({
    anyOf: [{ type: "string" }, { type: "null" }],
  });
});

test("scoreNewGradRows does not mark promoted rows as already scanned before enrich", async () => {
  const repoRoot = makeRepoRoot();
  try {
    const adapter = createClaudePipelineAdapter({
      repoRoot,
      claudeBin: "claude",
      codexBin: "codex",
      nodeBin: process.execPath,
      realExecutor: "codex",
      evaluationTimeoutSec: 60,
      livenessTimeoutSec: 20,
      allowDangerousClaudeFlags: true,
    });

    const result = await adapter.scoreNewGradRows([
      makeNewGradRow({
        title: "Software Engineer",
        company: "Promoted Co",
        detailUrl: "https://jobright.ai/jobs/info/promoted",
        qualifications: "TypeScript Python React Node AWS",
      }),
      makeNewGradRow({
        title: "Office Coordinator",
        company: "Filtered Co",
        detailUrl: "https://jobright.ai/jobs/info/filtered",
        qualifications: "Scheduling and office supplies",
      }),
    ]);

    expect(result.promoted.map((row) => row.row.company)).toContain("Promoted Co");
    const history = readFileSync(join(repoRoot, "data/scan-history.tsv"), "utf-8");
    expect(history).not.toContain("Promoted Co");
    expect(history).toContain("Filtered Co");
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("buildJdText truncates oversized local JD text before evaluation", () => {
  const pageText = `Header\n\n${"A".repeat(7000)}`;

  const rendered = __internal.buildJdText({
    url: "https://example.com/job",
    title: "Software Engineer",
    pageText,
  });

  expect(rendered).toContain("URL: https://example.com/job");
  expect(rendered).toContain("[bridge truncated");
  expect(rendered.length).toBeLessThan(pageText.length + 200);
});

test("shouldUseCodexSearch skips web search when local JD cache is rich enough", () => {
  expect(
    __internal.shouldUseCodexSearch({
      url: "https://example.com/job",
      pageText: "A".repeat(1200),
    }),
  ).toBe(false);
  expect(
    __internal.shouldUseCodexSearch({
      url: "https://example.com/job",
      pageText: "A".repeat(1199),
    }),
  ).toBe(true);
  expect(
    __internal.shouldUseCodexSearch({
      url: "https://example.com/job",
      pageText: "short context",
    }),
  ).toBe(true);
});

test("buildQuickEvaluationSchema requires screening decision fields", () => {
  const schema = __internal.buildQuickEvaluationSchema() as {
    required?: string[];
    properties?: Record<string, unknown>;
  };

  expect(schema.required).toEqual(
    expect.arrayContaining([
      "status",
      "id",
      "company",
      "role",
      "score",
      "tldr",
      "legitimacy",
      "decision",
      "reasons",
      "blockers",
      "error",
    ]),
  );
  expect(schema.properties?.decision).toEqual({
    enum: ["deep_eval", "skip"],
  });
});

test("buildQuickEvaluationPrompt stays compact and embeds structured signals", () => {
  const prompt = __internal.buildQuickEvaluationPrompt({
    input: {
      url: "https://example.com/job",
      title: "Software Engineer I",
      pageText: "Responsibilities:\n- Build AI products.\nRequirements:\n- TypeScript\n- Python",
      evaluationMode: "newgrad_quick",
      structuredSignals: {
        source: "newgrad-scan",
        company: "Example",
        role: "Software Engineer I",
        salaryRange: "$140,000 - $180,000",
        sponsorshipSupport: "yes",
        skillTags: ["TypeScript", "Python"],
        localValueScore: 8.6,
        localValueReasons: ["strong_match_score", "salary_meets_minimum"],
      },
    },
    candidateProfile: {
      compensationMinUsd: 120000,
      targetSkills: ["typescript", "python", "aws"],
      requiresVisaSponsorship: true,
      excludeActiveSecurityClearance: true,
      maxYearsExperience: 2,
    },
  });

  expect(prompt).toContain('"salaryRange": "$140,000 - $180,000"');
  expect(prompt).toContain('"localValueScore": 8.6');
  expect(prompt).toContain('"targetSkills": [');
  expect(prompt).not.toContain("Evaluación Completa A-G");
});

test("buildLocalQuickScreen skips obvious hard blockers without invoking codex", () => {
  const screen = __internal.buildLocalQuickScreen({
    jobId: "job-local-skip-1",
    evaluatedReportUrls: new Set<string>(),
    quickConfig: {
      role_keywords: { positive: ["software engineer"], weight: 3 },
      skill_keywords: {
        terms: ["typescript", "python", "aws"],
        weight: 1,
        max_score: 4,
      },
      freshness: { within_24h: 2, within_3d: 1, older: 0 },
      list_threshold: 3,
      pipeline_threshold: 7,
      detail_value_threshold: 7,
      compensation_min_usd: 120000,
      hard_filters: {
        blocked_companies: [],
        exclude_no_sponsorship: true,
        exclude_active_security_clearance: true,
        max_years_experience: 2,
        no_sponsorship_keywords: ["no sponsorship", "not eligible for immigration sponsorship"],
        no_sponsorship_companies: [],
        clearance_keywords: ["active secret clearance"],
        active_security_clearance_companies: [],
      },
      detail_concurrent_tabs: 3,
      detail_delay_min_ms: 1000,
      detail_delay_max_ms: 2000,
    },
    input: {
      url: "https://careers.example.com/job/12345",
      title: "Software Engineer I",
      evaluationMode: "newgrad_quick",
      pageText: [
        "This role is not eligible for immigration sponsorship.",
        "U.S. citizenship required.",
        "Compensation: $90k - $100k.",
      ].join("\n"),
      structuredSignals: {
        company: "Example",
        role: "Software Engineer I",
        sponsorshipSupport: "unknown",
        salaryRange: "$90k - $100k",
        localValueScore: 6.2,
        skillTags: ["TypeScript", "Python"],
      },
    },
  });

  expect(screen).not.toBeNull();
  expect(screen?.decision).toBe("skip");
  expect(screen?.blockers).toEqual(
    expect.arrayContaining([
      "no_sponsorship_support",
      "restricted_work_authorization_requirement",
      "salary_below_minimum",
      "local_value_score_below_threshold",
    ]),
  );
});

test("buildLocalQuickScreen ignores penalty tokens when collecting positive reasons", () => {
  const screen = __internal.buildLocalQuickScreen({
    jobId: "job-local-skip-penalties",
    evaluatedReportUrls: new Set<string>(),
    quickConfig: {
      role_keywords: { positive: ["software engineer"], weight: 3 },
      skill_keywords: {
        terms: ["typescript", "python", "aws"],
        weight: 1,
        max_score: 4,
      },
      freshness: { within_24h: 2, within_3d: 1, older: 0 },
      list_threshold: 3,
      pipeline_threshold: 7,
      detail_value_threshold: 7,
      compensation_min_usd: 120000,
      hard_filters: {
        blocked_companies: [],
        exclude_no_sponsorship: true,
        exclude_active_security_clearance: true,
        max_years_experience: 2,
        no_sponsorship_keywords: ["no sponsorship", "not eligible for immigration sponsorship"],
        no_sponsorship_companies: [],
        clearance_keywords: ["active secret clearance"],
        active_security_clearance_companies: [],
      },
      detail_concurrent_tabs: 3,
      detail_delay_min_ms: 1000,
      detail_delay_max_ms: 2000,
    },
    input: {
      url: "https://careers.example.com/job/22222",
      title: "Software Engineer I",
      evaluationMode: "newgrad_quick",
      pageText: [
        "This role is not eligible for immigration sponsorship.",
        "Compensation: $90k - $100k.",
      ].join("\n"),
      structuredSignals: {
        company: "Example",
        role: "Software Engineer I",
        sponsorshipSupport: "no",
        salaryRange: "$90k - $100k",
        localValueScore: 6.2,
        localValueReasons: [
          "strong_match_score",
          "salary_below_minimum",
          "no_sponsorship",
        ],
      },
    },
  });

  expect(screen).not.toBeNull();
  expect(screen?.reasons).toContain("strong_match_score");
  expect(screen?.reasons).not.toContain("salary_below_minimum");
  expect(screen?.reasons).not.toContain("no_sponsorship");
});

test("buildLocalQuickScreen skips canonical duplicates before model screening", () => {
  const screen = __internal.buildLocalQuickScreen({
    jobId: "job-local-skip-2",
    evaluatedReportUrls: new Set([
      "https://ebqb.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/job/12218",
    ]),
    quickConfig: {
      role_keywords: { positive: ["software engineer"], weight: 3 },
      skill_keywords: {
        terms: ["typescript", "python", "aws"],
        weight: 1,
        max_score: 4,
      },
      freshness: { within_24h: 2, within_3d: 1, older: 0 },
      list_threshold: 3,
      pipeline_threshold: 7,
      detail_value_threshold: 7,
      compensation_min_usd: 120000,
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
      detail_delay_min_ms: 1000,
      detail_delay_max_ms: 2000,
    },
    input: {
      url: "https://ebqb.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/12218?utm_medium=jobshare",
      title: "Software Engineer I",
      evaluationMode: "newgrad_quick",
      structuredSignals: {
        company: "BDO",
        role: "Software Engineer I",
        localValueScore: 8.1,
      },
    },
  });

  expect(screen?.decision).toBe("skip");
  expect(screen?.blockers).toContain("already_evaluated_report_url");
});

test("buildLocalQuickScreen does not treat obtain-or-preferred clearance language as a hard blocker", () => {
  const screen = __internal.buildLocalQuickScreen({
    jobId: "job-local-clearance-soft",
    evaluatedReportUrls: new Set<string>(),
    quickConfig: {
      role_keywords: { positive: ["software engineer"], weight: 3 },
      skill_keywords: {
        terms: ["typescript", "python", "aws"],
        weight: 1,
        max_score: 4,
      },
      freshness: { within_24h: 2, within_3d: 1, older: 0 },
      list_threshold: 3,
      pipeline_threshold: 7,
      detail_value_threshold: 7,
      compensation_min_usd: 120000,
      hard_filters: {
        blocked_companies: [],
        exclude_no_sponsorship: true,
        exclude_active_security_clearance: true,
        max_years_experience: 2,
        no_sponsorship_keywords: ["no sponsorship"],
        no_sponsorship_companies: [],
        clearance_keywords: ["top secret", "security clearance"],
        active_security_clearance_companies: [],
      },
      detail_concurrent_tabs: 3,
      detail_delay_min_ms: 1000,
      detail_delay_max_ms: 2000,
    },
    input: {
      url: "https://example.com/job/clearance-soft",
      title: "Software Engineer I",
      evaluationMode: "newgrad_quick",
      pageText: "Ability to obtain a security clearance is preferred for this role.",
      structuredSignals: {
        company: "Example",
        role: "Software Engineer I",
        localValueScore: 8.4,
        sponsorshipSupport: "yes",
      },
    },
  });

  expect(screen).toBeNull();
});

test("buildLocalQuickScreen skips explicit TS/SCI clearance requirements", () => {
  const screen = __internal.buildLocalQuickScreen({
    jobId: "job-local-clearance-hard",
    evaluatedReportUrls: new Set<string>(),
    quickConfig: {
      role_keywords: { positive: ["software engineer"], weight: 3 },
      skill_keywords: {
        terms: ["typescript", "python", "aws"],
        weight: 1,
        max_score: 4,
      },
      freshness: { within_24h: 2, within_3d: 1, older: 0 },
      list_threshold: 3,
      pipeline_threshold: 7,
      detail_value_threshold: 7,
      compensation_min_usd: 120000,
      hard_filters: {
        blocked_companies: [],
        exclude_no_sponsorship: true,
        exclude_active_security_clearance: true,
        max_years_experience: 2,
        no_sponsorship_keywords: ["no sponsorship"],
        no_sponsorship_companies: [],
        clearance_keywords: ["top secret", "security clearance"],
        active_security_clearance_companies: [],
      },
      detail_concurrent_tabs: 3,
      detail_delay_min_ms: 1000,
      detail_delay_max_ms: 2000,
    },
    input: {
      url: "https://example.com/job/clearance-hard",
      title: "Software Engineer I",
      evaluationMode: "newgrad_quick",
      pageText: "Current TS/SCI clearance required before start date.",
      structuredSignals: {
        company: "Example",
        role: "Software Engineer I",
        localValueScore: 8.4,
        sponsorshipSupport: "yes",
      },
    },
  });

  expect(screen?.decision).toBe("skip");
  expect(screen?.blockers).toContain("active_security_clearance_required");
});

test("buildQuickEvaluationArtifacts marks low-value screens as SKIP", () => {
  const artifacts = __internal.buildQuickEvaluationArtifacts({
    repoRoot: "/tmp/career-ops",
    reportNumber: 17,
    date: "2026-04-16",
    url: "https://example.com/job",
    signals: undefined,
    screen: {
      status: "completed",
      id: "job-quick-1",
      company: "Example",
      role: "Software Engineer I",
      score: 2.8,
      tldr: "Strong enough to read, but not worth a deep evaluation.",
      legitimacy: "Proceed with Caution",
      decision: "skip",
      reasons: ["mid match", "salary unknown"],
      blockers: ["seniority unclear"],
      error: null,
    },
  });

  expect(artifacts.reportPath).toContain("/tmp/career-ops/reports/017-example-2026-04-16.md");
  expect(artifacts.reportMarkdown).toContain("## A) Quick Screen Summary");
  expect(artifacts.reportMarkdown).toContain("## B) Structured Value Signals");
  expect(artifacts.trackerRow.status).toBe("SKIP");
  expect(artifacts.trackerRow.score).toBe("2.8/5");
});

test("parseReportMarkdown extracts report header metadata and summary", () => {
  const markdown = [
    "# Evaluación: Marble AI — Founding AI Engineer",
    "",
    "**Fecha:** 2026-04-10",
    "**Arquetipo:** Agentic / Automation",
    "**Score:** 4.6/5",
    "**URL:** https://jobs.ashbyhq.com/marble.ai/abc",
    "**PDF:** pendiente",
    "",
    "---",
    "",
    "## A) Resumen del Rol",
    "Strong fit for agentic product work in a small team.",
    "",
    "## B) Match con CV",
    "Detalles",
  ].join("\n");

  const parsed = __internal.parseReportMarkdown(markdown);

  expect(parsed.company).toBe("Marble AI");
  expect(parsed.role).toBe("Founding AI Engineer");
  expect(parsed.date).toBe("2026-04-10");
  expect(parsed.archetype).toBe("Agentic / Automation");
  expect(parsed.score).toBe(4.6);
  expect(parsed.url).toBe("https://jobs.ashbyhq.com/marble.ai/abc");
  expect(parsed.tldr).toBe("Strong fit for agentic product work in a small team.");
});

test("parseReportMarkdown accepts unaccented Spanish report heading", () => {
  const markdown = [
    "# Evaluacion: PayPal - Software Engineer, Backend Java",
    "",
    "**Fecha:** 2026-04-16",
    "**Arquetipo:** Backend Engineer",
    "**Score:** 3.7/5",
    "**URL:** https://example.com/paypal",
    "**PDF:** pendiente",
    "",
    "---",
    "",
    "## A) Resumen del Rol",
    "Strong Java/backend overlap.",
  ].join("\n");

  const parsed = __internal.parseReportMarkdown(markdown);

  expect(parsed.company).toBe("PayPal");
  expect(parsed.role).toBe("Software Engineer, Backend Java");
  expect(parsed.score).toBe(3.7);
});

function makeRepoRoot(): string {
  const repoRoot = `${tmpdir()}/career-ops-claude-pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mkdirSync(join(repoRoot, "config"), { recursive: true });
  mkdirSync(join(repoRoot, "data"), { recursive: true });
  writeFileSync(
    join(repoRoot, "config/profile.yml"),
    [
      "newgrad_scan:",
      "  role_keywords:",
      "    positive:",
      "      - Software Engineer",
      "    weight: 3",
      "  skill_keywords:",
      "    terms:",
      "      - TypeScript",
      "      - Python",
      "      - React",
      "      - Node",
      "      - AWS",
      "    weight: 1",
      "    max_score: 4",
      "  freshness:",
      "    within_24h: 2",
      "    within_3d: 1",
      "    older: 0",
      "  list_threshold: 3",
      "  pipeline_threshold: 7",
      "  detail_value_threshold: 7",
      "  hard_filters:",
      "    blocked_companies: []",
      "    exclude_no_sponsorship: false",
      "    exclude_active_security_clearance: false",
      "    max_years_experience: 99",
      "    no_sponsorship_keywords: []",
      "    no_sponsorship_companies: []",
      "    clearance_keywords: []",
      "    active_security_clearance_companies: []",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(join(repoRoot, "data/applications.md"), "# Applications Tracker\n", "utf-8");
  writeFileSync(join(repoRoot, "data/pipeline.md"), "# Pipeline Inbox\n", "utf-8");
  return repoRoot;
}

function makeNewGradRow(overrides: Partial<NewGradRow>): NewGradRow {
  return {
    position: 1,
    title: "Software Engineer",
    postedAgo: "2 hours ago",
    applyUrl: "https://example.com/apply",
    detailUrl: "https://jobright.ai/jobs/info/default",
    workModel: "Remote",
    location: "Remote, USA",
    company: "Example Co",
    salary: "",
    companySize: "",
    industry: "",
    qualifications: "",
    h1bSponsored: false,
    sponsorshipSupport: "unknown",
    confirmedSponsorshipSupport: "unknown",
    requiresActiveSecurityClearance: false,
    confirmedRequiresActiveSecurityClearance: false,
    isNewGrad: true,
    ...overrides,
  };
}
