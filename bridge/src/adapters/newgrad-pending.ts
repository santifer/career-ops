import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, normalize } from "node:path";

import type {
  NewGradPendingCacheBackfillInput,
  NewGradPendingCacheBackfillOutcome,
  NewGradPendingCacheBackfillResult,
  NewGradPendingEntry,
  NewGradPendingResult,
  NewGradScanConfig,
} from "../contracts/newgrad.js";
import { canonicalizeJobUrl } from "../lib/canonical-job-url.js";
import { detectActiveSecurityClearanceRequirement } from "../lib/security-clearance.js";
import { writeJdFile } from "../lib/write-jd-file.js";
import { loadEvaluatedReportUrls } from "./evaluated-report-urls.js";
import {
  loadNegativeKeywords,
  loadNewGradScanConfig,
  loadTrackedCompanyRoles,
} from "./newgrad-config.js";

const PENDING_LINE_RE =
  /^-\s+\[\s\]\s+(https?:\/\/\S+)\s+—\s+(.+?)\s+\|\s+(.+?)\s+\(via newgrad-scan, score:\s*([0-9.]+)\/[0-9.]+(?:,\s+value:\s*([0-9.]+)\/10)?\)(?:\s+\[local:([^\]]+)\])?/;
const LOCAL_JD_CACHE_MAX_CHARS = 8_000;
const LOCK_WAIT_MS = 5_000;
const LOCK_POLL_MS = 100;

export function readNewGradPendingEntries(
  repoRoot: string,
  limit: number,
): NewGradPendingResult {
  const tracked = loadTrackedCompanyRoles(repoRoot);
  const negativeKeywords = loadNegativeKeywords(repoRoot);
  const scanConfig = loadNewGradScanConfig(repoRoot);
  const evaluatedReportUrls = loadEvaluatedReportUrls(repoRoot);
  const entries: NewGradPendingEntry[] = [];
  const seenUrls = new Set<string>();
  const seenCompanyRoles = new Set<string>();

  readPipelineEntries(
    repoRoot,
    tracked,
    negativeKeywords,
    scanConfig,
    evaluatedReportUrls,
    seenUrls,
    seenCompanyRoles,
    entries,
  );

  return {
    entries: entries.slice(0, Math.max(0, limit)),
    total: entries.length,
  };
}

export function backfillNewGradPendingCache(
  repoRoot: string,
  inputs: readonly NewGradPendingCacheBackfillInput[],
): NewGradPendingCacheBackfillResult {
  if (inputs.length === 0) {
    return { updated: 0, skipped: 0, outcomes: [] };
  }

  return withPendingStateLock(repoRoot, () => {
    const pipelinePath = join(repoRoot, "data/pipeline.md");
    if (!existsSync(pipelinePath)) {
      const outcomes = inputs.map((input) => ({
        url: input.url,
        company: input.company,
        role: input.role,
        lineNumber: input.lineNumber,
        status: "skipped" as const,
        reason: "pipeline_missing",
      }));
      return { updated: 0, skipped: outcomes.length, outcomes };
    }

    const lines = readFileSync(pipelinePath, "utf-8").split(/\r?\n/);
    const claimedLineIndexes = new Set<number>();
    const outcomes: NewGradPendingCacheBackfillOutcome[] = [];
    let mutated = false;

    mkdirSync(join(repoRoot, "jds"), { recursive: true });

    for (const input of inputs) {
      const lineIndex = findPipelineLineIndex(lines, input, claimedLineIndexes);
      if (lineIndex === -1) {
        outcomes.push({
          url: input.url,
          company: input.company,
          role: input.role,
          lineNumber: input.lineNumber,
          status: "skipped",
          reason: "pipeline_line_not_found",
        });
        continue;
      }

      const currentLine = lines[lineIndex] ?? "";
      const match = PENDING_LINE_RE.exec(currentLine);
      if (!match) {
        outcomes.push({
          url: input.url,
          company: input.company,
          role: input.role,
          lineNumber: input.lineNumber,
          status: "skipped",
          reason: "pipeline_line_not_pending",
        });
        continue;
      }

      const jdFile = writeJdFile({
        jdsDir: join(repoRoot, "jds"),
        company: input.company,
        role: input.role,
        url: input.url,
        description: input.pageText.trim(),
      });
      if (!jdFile) {
        outcomes.push({
          url: input.url,
          company: input.company,
          role: input.role,
          lineNumber: input.lineNumber,
          status: "skipped",
          reason: "page_text_too_short",
        });
        continue;
      }

      const localJdPath = `jds/${jdFile}`;
      const nextLine = upsertLocalJdTag(currentLine, localJdPath);
      if (nextLine !== currentLine) {
        lines[lineIndex] = nextLine;
        mutated = true;
      }
      claimedLineIndexes.add(lineIndex);
      outcomes.push({
        url: input.url,
        company: input.company,
        role: input.role,
        lineNumber: lineIndex + 1,
        status: "updated",
        localJdPath,
      });
    }

    if (mutated) {
      writeFileSync(pipelinePath, lines.join("\n"), "utf-8");
    }

    const updated = outcomes.filter((outcome) => outcome.status === "updated").length;
    return {
      updated,
      skipped: outcomes.length - updated,
      outcomes,
    };
  });
}

function readPipelineEntries(
  repoRoot: string,
  tracked: ReadonlySet<string>,
  negativeKeywords: readonly string[],
  scanConfig: NewGradScanConfig,
  evaluatedReportUrls: ReadonlySet<string>,
  seenUrls: Set<string>,
  seenCompanyRoles: Set<string>,
  entries: NewGradPendingEntry[],
): void {
  const pipelinePath = join(repoRoot, "data/pipeline.md");
  if (!existsSync(pipelinePath)) return;

  const lines = readFileSync(pipelinePath, "utf-8").split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const match = PENDING_LINE_RE.exec(line);
    if (!match) continue;

    const company = (match[2] ?? "").trim();
    const role = (match[3] ?? "").trim();
    const score = Number(match[4] ?? 0);
    if (score < scanConfig.pipeline_threshold) continue;
    if (tracked.has(`${company.toLowerCase()}|${role.toLowerCase()}`)) {
      continue;
    }
    if (matchesNegativeKeyword(role, negativeKeywords)) continue;
    if (isBlockedCompany(company, scanConfig)) continue;
    if (matchesHardFilterPhrase(role, scanConfig)) continue;
    const companyRoleKey = pendingCompanyRoleKey(company, role);
    if (seenCompanyRoles.has(companyRoleKey)) continue;

    const localJdPath = normalizeLocalPath(match[6]);
    const pageText = localJdPath ? readLocalJd(repoRoot, localJdPath) : undefined;
    const url = match[1] ?? "";
    const canonicalUrl = canonicalizeJobUrl(url) ?? url;
    if (seenUrls.has(canonicalUrl) || evaluatedReportUrls.has(canonicalUrl)) continue;
    seenUrls.add(canonicalUrl);
    seenCompanyRoles.add(companyRoleKey);

    entries.push({
      url,
      company,
      role,
      score,
      ...(match[5] ? { valueScore: Number(match[5]) } : {}),
      source: "newgrad-jobs.com",
      lineNumber: index + 1,
      ...(localJdPath ? { localJdPath } : {}),
      ...(pageText ? { pageText } : {}),
    });
  }
}

function pendingCompanyRoleKey(company: string, role: string): string {
  return `${normalizeSearchText(company)}|${normalizeSearchText(role)}`;
}

function isBlockedCompany(company: string, config: NewGradScanConfig): boolean {
  const normalizedCompany = normalizeCompany(company);
  if (!normalizedCompany) return false;

  if (companyListHas(config.hard_filters.blocked_companies, normalizedCompany)) {
    return true;
  }

  if (
    config.hard_filters.exclude_no_sponsorship &&
    companyListHas(config.hard_filters.no_sponsorship_companies, normalizedCompany)
  ) {
    return true;
  }

  return (
    config.hard_filters.exclude_active_security_clearance &&
    companyListHas(
      config.hard_filters.active_security_clearance_companies,
      normalizedCompany,
    )
  );
}

function matchesHardFilterPhrase(role: string, config: NewGradScanConfig): boolean {
  if (
    config.hard_filters.exclude_no_sponsorship &&
    textContainsPhrase(role, config.hard_filters.no_sponsorship_keywords)
  ) {
    return true;
  }

  return (
    config.hard_filters.exclude_active_security_clearance &&
    detectActiveSecurityClearanceRequirement(
      role,
      config.hard_filters.clearance_keywords,
    )
  );
}

function textContainsPhrase(text: string, phrases: readonly string[]): boolean {
  const normalizedText = normalizeSearchText(text);
  return phrases.some((phrase) => {
    const normalizedPhrase = normalizeSearchText(phrase);
    return normalizedPhrase.length > 0 && normalizedText.includes(normalizedPhrase);
  });
}

function companyListHas(companies: readonly string[], normalizedCompany: string): boolean {
  return companies.some((company) => normalizeCompany(company) === normalizedCompany);
}

function normalizeCompany(company: string): string {
  return normalizeSearchText(company);
}

function matchesNegativeKeyword(role: string, negativeKeywords: readonly string[]): boolean {
  const normalizedRole = normalizeSearchText(role);
  return negativeKeywords.some((keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    return normalizedKeyword.length > 0 && normalizedRole.includes(normalizedKeyword);
  });
}

function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeLocalPath(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = normalize(value.trim());
  if (normalized.startsWith("..") || normalized.startsWith("/")) return null;
  if (!normalized.startsWith("jds/")) return null;
  return normalized;
}

function readLocalJd(repoRoot: string, localJdPath: string): string | undefined {
  const path = join(repoRoot, localJdPath);
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8").slice(0, LOCAL_JD_CACHE_MAX_CHARS);
}

function upsertLocalJdTag(line: string, localJdPath: string): string {
  const nextTag = `[local:${localJdPath}]`;
  if (/\s+\[local:[^\]]+\]\s*$/.test(line)) {
    return line.replace(/\s+\[local:[^\]]+\]\s*$/, ` ${nextTag}`);
  }
  return `${line} ${nextTag}`;
}

function findPipelineLineIndex(
  lines: readonly string[],
  input: NewGradPendingCacheBackfillInput,
  claimedLineIndexes: ReadonlySet<number>,
): number {
  const preferredIndex = input.lineNumber - 1;
  if (
    preferredIndex >= 0 &&
    preferredIndex < lines.length &&
    !claimedLineIndexes.has(preferredIndex) &&
    pendingLineMatches(lines[preferredIndex] ?? "", input)
  ) {
    return preferredIndex;
  }

  for (let index = 0; index < lines.length; index++) {
    if (claimedLineIndexes.has(index)) continue;
    if (pendingLineMatches(lines[index] ?? "", input)) return index;
  }
  return -1;
}

function pendingLineMatches(
  line: string,
  input: Pick<NewGradPendingCacheBackfillInput, "url" | "company" | "role">,
): boolean {
  const match = PENDING_LINE_RE.exec(line);
  if (!match) return false;

  const lineUrl = canonicalizeJobUrl(match[1] ?? "") ?? (match[1] ?? "");
  const inputUrl = canonicalizeJobUrl(input.url) ?? input.url;
  if (lineUrl !== inputUrl) return false;

  return (
    normalizeSearchText(match[2] ?? "") === normalizeSearchText(input.company) &&
    normalizeSearchText(match[3] ?? "") === normalizeSearchText(input.role)
  );
}

function withPendingStateLock<T>(repoRoot: string, fn: () => T): T {
  mkdirSync(join(repoRoot, "batch"), { recursive: true });
  const lockDir = join(repoRoot, "batch/.batch-state.lock");
  const deadline = Date.now() + LOCK_WAIT_MS;

  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (err) {
      const code =
        err instanceof Error && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      if (code !== "EEXIST") {
        throw err;
      }
      if (Date.now() >= deadline) {
        throw new Error("timed out waiting for pending cache backfill lock");
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_POLL_MS);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}
