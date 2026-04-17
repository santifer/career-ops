import { afterEach, describe, expect, test } from "vitest";

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendNewGradScanHistory,
  isRecentNewGradRow,
  loadNewGradSeenKeys,
  newGradCompanyRoleKey,
  newGradRowUrl,
  wasNewGradRowSeen,
} from "./newgrad-scan-history.js";

import type { NewGradRow } from "../contracts/newgrad.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("newgrad-scan-history", () => {
  test("isRecentNewGradRow only accepts rows posted within the last 24h", () => {
    expect(isRecentNewGradRow(makeRow({ postedAgo: "23h ago" }))).toBe(true);
    expect(isRecentNewGradRow(makeRow({ postedAgo: "1 day ago" }))).toBe(false);
    expect(isRecentNewGradRow(makeRow({ postedAgo: "unknown" }))).toBe(false);
  });

  test("loadNewGradSeenKeys reads scan history and pipeline state", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/scan-history.tsv"),
      [
        "url\tfirst_seen\tportal\ttitle\tcompany\tstatus",
        "https://newgrad-jobs.com/detail/seen\t2026-04-14\tnewgrad-scan\tSoftware Engineer\tSeen Co\tpromoted",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      "- [ ] https://example.com/pipeline-job — Pipeline Co | SWE\n",
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/applications.md"),
      [
        "# Applications Tracker",
        "",
        "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
        "|---|------|---------|------|-------|--------|-----|--------|-------|",
        "| 1 | 2026-04-14 | Tracker Co | Backend Engineer | 4.0 | evaluating | - | - | https://example.com/tracked |",
      ].join("\n"),
      "utf-8",
    );

    const seen = loadNewGradSeenKeys(repoRoot);

    expect(seen.urls.has("https://newgrad-jobs.com/detail/seen")).toBe(true);
    expect(seen.urls.has("https://example.com/pipeline-job")).toBe(true);
    expect(seen.urls.has("https://example.com/tracked")).toBe(false);
    expect(seen.companyRoles.has("seen co|software engineer")).toBe(true);
    expect(seen.companyRoles.has("tracker co|backend engineer")).toBe(false);
  });

  test("loadNewGradSeenKeys canonicalizes tracking params in scan history and pipeline", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/scan-history.tsv"),
      [
        "url\tfirst_seen\tportal\ttitle\tcompany\tstatus",
        "https://jobs.example.com/role/123?utm_source=linkedin\t2026-04-14\tnewgrad-scan\tSoftware Engineer\tSeen Co\tpromoted",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/pipeline.md"),
      "- [ ] https://jobs.example.com/role/456?gh_src=feed — Pipeline Co | SWE\n",
      "utf-8",
    );

    const seen = loadNewGradSeenKeys(repoRoot);

    expect(seen.urls.has("https://jobs.example.com/role/123")).toBe(true);
    expect(seen.urls.has("https://jobs.example.com/role/456")).toBe(true);
  });

  test("appendNewGradScanHistory persists rows and skips duplicate rows in one batch", () => {
    const repoRoot = makeRepoRoot();
    const row = makeRow();

    appendNewGradScanHistory(repoRoot, [row, row], () => "promoted");

    const content = readFileSync(join(repoRoot, "data/scan-history.tsv"), "utf-8");
    expect(content).toContain("url\tfirst_seen\tportal\ttitle\tcompany\tstatus");
    expect(content).toContain("newgrad-scan\tSoftware Engineer\tAcme Corp\tpromoted");
    expect(content.match(/Acme Corp/g)).toHaveLength(1);
  });

  test("wasNewGradRowSeen matches both URL and company-role fallbacks", () => {
    const row = makeRow();
    const seenByUrl = {
      urls: new Set([newGradRowUrl(row)]),
      companyRoles: new Set<string>(),
    };
    const seenByCompanyRole = {
      urls: new Set<string>(),
      companyRoles: new Set([newGradCompanyRoleKey(row)]),
    };

    expect(wasNewGradRowSeen(row, seenByUrl)).toBe(true);
    expect(wasNewGradRowSeen(row, seenByCompanyRole)).toBe(true);
  });
});

function makeRepoRoot(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "career-ops-newgrad-history-"));
  tempDirs.push(repoRoot);
  mkdirSync(join(repoRoot, "data"), { recursive: true });
  return repoRoot;
}

function makeRow(overrides?: Partial<NewGradRow>): NewGradRow {
  return {
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
    sponsorshipSupport: "unknown",
    confirmedSponsorshipSupport: "unknown",
    requiresActiveSecurityClearance: false,
    confirmedRequiresActiveSecurityClearance: false,
    isNewGrad: true,
    ...overrides,
  };
}
