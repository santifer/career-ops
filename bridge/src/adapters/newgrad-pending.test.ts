import { afterEach, describe, expect, test } from "vitest";

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  backfillNewGradPendingCache,
  readNewGradPendingEntries,
} from "./newgrad-pending.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("readNewGradPendingEntries", () => {
  test("reads unchecked newgrad pipeline entries and excludes tracker rows", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(join(repoRoot, "jds/ut-austin.md"), "Cached JD text", "utf-8");
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "# Pipeline Inbox",
        "",
        "- [ ] https://example.com/ut — The University of Texas at Austin | Software Engineer (via newgrad-scan, score: 5/9) [local:jds/ut-austin.md]",
        "- [x] https://example.com/done — Done Co | Done Role (via newgrad-scan, score: 7/9)",
        "- [ ] https://example.com/tracked — Tracker Co | Backend Engineer (via newgrad-scan, score: 8/9)",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/scan-history.tsv"),
      [
        "url\tfirst_seen\tportal\ttitle\tcompany\tstatus",
        "https://example.com/history\t2026-04-14\tnewgrad-scan\tML Engineer\tHistory Co\tpromoted",
        "https://example.com/filtered\t2026-04-14\tnewgrad-scan\tData Migration Specialist\tFiltered Co\tbelow_threshold",
        "https://example.com/ut\t2026-04-14\tnewgrad-scan\tSoftware Engineer\tThe University of Texas at Austin\tpromoted",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/applications.md"),
      [
        "# Career-Ops Applications Tracker",
        "",
        "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
        "|---|------|---------|------|-------|--------|-----|--------|-------|",
        "| 1 | 2026-04-14 | Tracker Co | Backend Engineer | 4.0/5 | Evaluated | ❌ | [001](reports/001.md) | done |",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      url: "https://example.com/ut",
      company: "The University of Texas at Austin",
      role: "Software Engineer",
      score: 5,
      source: "newgrad-jobs.com",
      lineNumber: 3,
      localJdPath: "jds/ut-austin.md",
      pageText: "Cached JD text",
    });
  });

  test("does not evaluate scan-history rows without a pipeline entry", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/scan-history.tsv"),
      [
        "url\tfirst_seen\tportal\ttitle\tcompany\tstatus",
        "https://example.com/history\t2026-04-14\tnewgrad-scan\tML Engineer\tHistory Co\tpromoted",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  test("honors display limit while preserving total", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://example.com/one — One Co | Software Engineer (via newgrad-scan, score: 5/9)",
        "- [ ] https://example.com/two — Two Co | Software Engineer (via newgrad-scan, score: 6/9)",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 1);

    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.company).toBe("One Co");
  });

  test("reads value score metadata and value reasons, and skips URLs already evaluated in reports", () => {
    const repoRoot = makeRepoRoot();
    mkdirSync(join(repoRoot, "reports"), { recursive: true });
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://jobs.example.com/evaluated?utm_source=scan — Done Co | Software Engineer (via newgrad-scan, score: 9/9, value: 8.4/10)",
        "- [ ] https://jobs.example.com/fresh?utm_campaign=scan — Fresh Co | Software Engineer (via newgrad-scan, score: 8/9, value: 7.5/10) [value-reasons:strong_match_score|salary_meets_minimum]",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "reports/001-done-2026-04-16.md"),
      [
        "# Evaluacion: Done Co - Software Engineer",
        "",
        "**Fecha:** 2026-04-16",
        "**Arquetipo:** Backend Engineer",
        "**Score:** 3.7/5",
        "**URL:** https://jobs.example.com/evaluated",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      url: "https://jobs.example.com/fresh?utm_campaign=scan",
      company: "Fresh Co",
      role: "Software Engineer",
      score: 8,
      valueScore: 7.5,
      valueReasons: ["strong_match_score", "salary_meets_minimum"],
    });
  });

  test("skips pending entries whose role matches configured negative keywords", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "portals.yml"),
      [
        "title_filter:",
        "  negative:",
        '    - "PhD"',
        '    - "Senior"',
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://example.com/phd — Google | Software Engineer, PhD, Early Career (via newgrad-scan, score: 9/9)",
        "- [ ] https://example.com/senior — Example Co | Senior Software Engineer (via newgrad-scan, score: 9/9)",
        "- [ ] https://example.com/junior — Good Co | Software Engineer I (via newgrad-scan, score: 8/9)",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.company).toBe("Good Co");
  });

  test("skips pending entries from remembered blocker companies", () => {
    const repoRoot = makeRepoRoot();
    mkdirSync(join(repoRoot, "config"), { recursive: true });
    writeFileSync(
      join(repoRoot, "config/profile.yml"),
      [
        "newgrad_scan:",
        "  hard_filters:",
        "    exclude_no_sponsorship: true",
        "    exclude_active_security_clearance: true",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/newgrad-company-memory.yml"),
      [
        "no_sponsorship_companies:",
        '  - "No Sponsor Co"',
        "",
        "active_security_clearance_companies:",
        '  - "Booz Allen Hamilton"',
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://example.com/no-sponsor — No Sponsor Co | Software Engineer (via newgrad-scan, score: 9/9)",
        "- [ ] https://example.com/clearance — Booz Allen Hamilton | Software Engineer (via newgrad-scan, score: 9/9)",
        "- [ ] https://example.com/good — Good Co | Software Engineer (via newgrad-scan, score: 8/9)",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.company).toBe("Good Co");
  });

  test("skips pending entries from user-blocked companies", () => {
    const repoRoot = makeRepoRoot();
    mkdirSync(join(repoRoot, "config"), { recursive: true });
    writeFileSync(
      join(repoRoot, "config/profile.yml"),
      [
        "newgrad_scan:",
        "  hard_filters:",
        "    blocked_companies:",
        '      - "TikTok"',
        '      - "ByteDance"',
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://example.com/tiktok — TikTok | Software Engineer (via newgrad-scan, score: 9/9)",
        "- [ ] https://example.com/bytedance — ByteDance | Software Engineer (via newgrad-scan, score: 9/9)",
        "- [ ] https://example.com/good — Good Co | Software Engineer (via newgrad-scan, score: 8/9)",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.company).toBe("Good Co");
  });

  test("skips pending entries matching hard filter phrases", () => {
    const repoRoot = makeRepoRoot();
    mkdirSync(join(repoRoot, "config"), { recursive: true });
    writeFileSync(
      join(repoRoot, "config/profile.yml"),
      [
        "newgrad_scan:",
        "  hard_filters:",
        "    exclude_no_sponsorship: true",
        "    exclude_active_security_clearance: true",
        "    no_sponsorship_keywords:",
        '      - "only us citizens"',
        "    clearance_keywords:",
        '      - "top secret"',
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://example.com/citizen — Recruiter Co | Junior Software Engineer - Only US Citizens (via newgrad-scan, score: 9/9)",
        "- [ ] https://example.com/secret — Defense Co | Junior Full Stack Developer / Top Secret (via newgrad-scan, score: 9/9)",
        "- [ ] https://example.com/good — Good Co | Software Engineer I (via newgrad-scan, score: 8/9)",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.company).toBe("Good Co");
  });

  test("does not skip pending entries for obtain-or-preferred clearance language", () => {
    const repoRoot = makeRepoRoot();
    mkdirSync(join(repoRoot, "config"), { recursive: true });
    writeFileSync(
      join(repoRoot, "config/profile.yml"),
      [
        "newgrad_scan:",
        "  hard_filters:",
        "    exclude_active_security_clearance: true",
        "    clearance_keywords:",
        '      - "top secret"',
        '      - "security clearance"',
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://example.com/good — Good Co | Software Engineer I (via newgrad-scan, score: 8/9)",
        "- [ ] https://example.com/soft-clearance — Example Co | Software Engineer I - Ability to obtain security clearance preferred (via newgrad-scan, score: 8/9)",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
  });

  test("dedupes pending entries by company and role", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://example.com/google-one — Google | Software Engineer II (via newgrad-scan, score: 8/9)",
        "- [ ] https://example.com/google-two — Google | Software Engineer II (via newgrad-scan, score: 8/9)",
        "- [ ] https://example.com/google-ml — Google | ML Engineer (via newgrad-scan, score: 8/9)",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((entry) => entry.role)).toEqual([
      "Software Engineer II",
      "ML Engineer",
    ]);
  });

  test("skips legacy pipeline entries below the current pipeline threshold", () => {
    const repoRoot = makeRepoRoot();
    mkdirSync(join(repoRoot, "config"), { recursive: true });
    writeFileSync(
      join(repoRoot, "config/profile.yml"),
      [
        "newgrad_scan:",
        "  pipeline_threshold: 7",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://example.com/weak — Weak Co | Data Engineer (via newgrad-scan, score: 6/9)",
        "- [ ] https://example.com/strong — Strong Co | Software Engineer (via newgrad-scan, score: 7/9)",
      ].join("\n"),
      "utf-8",
    );

    const result = readNewGradPendingEntries(repoRoot, 10);

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.company).toBe("Strong Co");
  });

  test("backfills legacy pending rows with a deterministic local JD cache", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "# Pipeline Inbox",
        "",
        "- [ ] https://jobs.example.com/legacy?utm_source=scan — Legacy Co | Software Engineer I (via newgrad-scan, score: 8/9)",
      ].join("\n"),
      "utf-8",
    );

    const pageText = [
      "Legacy Co is hiring an early-career software engineer to work on internal platform tooling.",
      "You will build TypeScript services, improve CI/CD reliability, and collaborate with product and infra teams.",
      "Candidates should have strong CS fundamentals, internship or project experience, and comfort debugging distributed systems.",
      "This role supports backend APIs, frontend integrations, observability, cloud deployment workflows, and developer productivity initiatives.",
      "The team values ownership, practical communication, and the ability to ship maintainable code in production.",
    ].join(" ");

    const backfill = backfillNewGradPendingCache(repoRoot, [{
      url: "https://jobs.example.com/legacy?utm_source=scan",
      company: "Legacy Co",
      role: "Software Engineer I",
      lineNumber: 3,
      pageText,
    }]);

    expect(backfill).toMatchObject({
      updated: 1,
      skipped: 0,
    });
    expect(backfill.outcomes[0]?.status).toBe("updated");
    expect(backfill.outcomes[0]?.localJdPath).toMatch(/^jds\/legacy-co-[a-z0-9]+\.txt$/);

    const pipeline = readFileSync(join(repoRoot, "data/pipeline.md"), "utf-8");
    expect(pipeline).toContain("[local:jds/");

    const localPath = backfill.outcomes[0]?.localJdPath;
    expect(localPath).toBeTruthy();
    const cachedJd = readFileSync(join(repoRoot, localPath!), "utf-8");
    expect(cachedJd).toContain("Legacy Co");
    expect(cachedJd).toContain("TypeScript services");

    const pending = readNewGradPendingEntries(repoRoot, 10);
    expect(pending.entries).toHaveLength(1);
    expect(pending.entries[0]).toMatchObject({
      url: "https://jobs.example.com/legacy?utm_source=scan",
      company: "Legacy Co",
      role: "Software Engineer I",
      lineNumber: 3,
      localJdPath: localPath,
    });
    expect(pending.entries[0]?.pageText).toContain("TypeScript services");
  });

  test("replaces stale local JD tags when backfilling a legacy pending row", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://jobs.example.com/stale?gh_src=scan — Stale Co | Platform Engineer (via newgrad-scan, score: 8/9) [local:jds/missing.txt]",
      ].join("\n"),
      "utf-8",
    );

    const pageText = [
      "Stale Co needs a platform engineer who can own CI/CD, service reliability, and developer tooling.",
      "The role spans TypeScript, Kubernetes, observability, incident response, and cloud deployment improvements.",
      "Ideal candidates have internship or project experience working across backend systems and automation pipelines.",
      "This posting emphasizes maintainable services, strong debugging ability, and clear communication with partner teams.",
    ].join(" ");

    const backfill = backfillNewGradPendingCache(repoRoot, [{
      url: "https://jobs.example.com/stale?gh_src=scan",
      company: "Stale Co",
      role: "Platform Engineer",
      lineNumber: 1,
      pageText,
    }]);

    expect(backfill.updated).toBe(1);
    const pipeline = readFileSync(join(repoRoot, "data/pipeline.md"), "utf-8");
    expect(pipeline).not.toContain("[local:jds/missing.txt]");
    expect(pipeline).toContain("[local:jds/");
  });

  test("skips backfill when captured page text is still too short", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      [
        "- [ ] https://jobs.example.com/short — Short Co | Software Engineer (via newgrad-scan, score: 8/9)",
      ].join("\n"),
      "utf-8",
    );

    const backfill = backfillNewGradPendingCache(repoRoot, [{
      url: "https://jobs.example.com/short",
      company: "Short Co",
      role: "Software Engineer",
      lineNumber: 1,
      pageText: "too short",
    }]);

    expect(backfill).toMatchObject({
      updated: 0,
      skipped: 1,
    });
    expect(backfill.outcomes[0]).toMatchObject({
      status: "skipped",
      reason: "page_text_too_short",
    });
    const pipeline = readFileSync(join(repoRoot, "data/pipeline.md"), "utf-8");
    expect(pipeline).not.toContain("[local:jds/");
  });
});

function makeRepoRoot(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "career-ops-newgrad-pending-"));
  tempDirs.push(repoRoot);
  mkdirSync(join(repoRoot, "data"), { recursive: true });
  mkdirSync(join(repoRoot, "jds"), { recursive: true });
  return repoRoot;
}
