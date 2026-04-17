import { afterEach, describe, expect, test } from "vitest";

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadEvaluatedReportUrls } from "./evaluated-report-urls.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("evaluated-report-urls", () => {
  test("loads canonicalized report URLs and drops tracking params", () => {
    const repoRoot = makeRepoRoot();

    writeFileSync(
      join(repoRoot, "reports", "001-acme-2026-04-16.md"),
      [
        "# Evaluación: Acme — Software Engineer",
        "",
        "**Fecha:** 2026-04-16",
        "**Arquetipo:** Software Engineer",
        "**Score:** 4.0/5",
        "**URL:** https://jobs.example.com/role/123?utm_source=linkedin&gh_src=abc",
      ].join("\n"),
      "utf-8",
    );

    writeFileSync(
      join(repoRoot, "reports", "002-duplicate-2026-04-16.md"),
      [
        "# Evaluación: Acme — Software Engineer",
        "",
        "**Fecha:** 2026-04-16",
        "**Arquetipo:** Software Engineer",
        "**Score:** 4.0/5",
        "**URL:** https://jobs.example.com/role/123?ref=feed",
      ].join("\n"),
      "utf-8",
    );

    writeFileSync(
      join(repoRoot, "reports", "003-no-url-2026-04-16.md"),
      [
        "# Evaluación: Missing URL — Engineer",
        "",
        "**Fecha:** 2026-04-16",
        "**Arquetipo:** Software Engineer",
        "**Score:** 4.0/5",
      ].join("\n"),
      "utf-8",
    );

    const urls = loadEvaluatedReportUrls(repoRoot);

    expect([...urls]).toEqual(["https://jobs.example.com/role/123"]);
  });
});

function makeRepoRoot(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "career-ops-report-urls-"));
  tempDirs.push(repoRoot);
  mkdirSync(join(repoRoot, "reports"), { recursive: true });
  return repoRoot;
}
