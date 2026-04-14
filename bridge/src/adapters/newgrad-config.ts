import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FilteredRow, NewGradScanConfig } from "../contracts/newgrad.js";

const COMPANY_MEMORY_PATH = "data/newgrad-company-memory.yml";

interface BlockedCompanyMemory {
  no_sponsorship_companies: string[];
  active_security_clearance_companies: string[];
}

const DEFAULT_SCAN_CONFIG: NewGradScanConfig = {
  role_keywords: {
    positive: ["engineer", "developer", "software"],
    weight: 3,
  },
  skill_keywords: {
    terms: ["typescript", "react", "node", "python"],
    weight: 1,
    max_score: 4,
  },
  freshness: { within_24h: 2, within_3d: 1, older: 0 },
  list_threshold: 3,
  pipeline_threshold: 5,
  hard_filters: {
    exclude_no_sponsorship: false,
    exclude_active_security_clearance: false,
    no_sponsorship_keywords: [
      "no sponsorship",
      "without sponsorship",
      "unable to sponsor",
      "cannot sponsor",
      "can't sponsor",
      "will not sponsor",
      "does not provide sponsorship",
      "sponsorship not available",
      "no visa sponsorship",
      "must be authorized to work without sponsorship",
    ],
    no_sponsorship_companies: [],
    clearance_keywords: [
      "active secret security clearance",
      "active secret clearance",
      "current secret clearance",
      "must have an active secret clearance",
      "must possess an active secret clearance",
      "requires an active secret clearance",
    ],
    active_security_clearance_companies: [],
  },
  detail_concurrent_tabs: 3,
  detail_delay_min_ms: 2000,
  detail_delay_max_ms: 5000,
};

export function loadNewGradScanConfig(repoRoot: string): NewGradScanConfig {
  const companyMemory = loadBlockedCompanyMemory(repoRoot);
  const profilePath = join(repoRoot, "config/profile.yml");
  if (!existsSync(profilePath)) {
    return {
      ...DEFAULT_SCAN_CONFIG,
      hard_filters: {
        ...DEFAULT_SCAN_CONFIG.hard_filters,
        no_sponsorship_companies: mergeUniqueStrings(
          DEFAULT_SCAN_CONFIG.hard_filters.no_sponsorship_companies,
          companyMemory.no_sponsorship_companies,
        ),
        active_security_clearance_companies: mergeUniqueStrings(
          DEFAULT_SCAN_CONFIG.hard_filters.active_security_clearance_companies,
          companyMemory.active_security_clearance_companies,
        ),
      },
    };
  }

  try {
    const lines = readFileSync(profilePath, "utf-8").split(/\r?\n/);
    const section = extractYamlBlock(lines, "newgrad_scan", 0);
    if (section.length === 0) {
      return {
        ...DEFAULT_SCAN_CONFIG,
        hard_filters: {
          ...DEFAULT_SCAN_CONFIG.hard_filters,
          no_sponsorship_companies: mergeUniqueStrings(
            DEFAULT_SCAN_CONFIG.hard_filters.no_sponsorship_companies,
            companyMemory.no_sponsorship_companies,
          ),
          active_security_clearance_companies: mergeUniqueStrings(
            DEFAULT_SCAN_CONFIG.hard_filters.active_security_clearance_companies,
            companyMemory.active_security_clearance_companies,
          ),
        },
      };
    }

    const roleBlock = extractYamlBlock(section, "role_keywords", 2);
    const skillBlock = extractYamlBlock(section, "skill_keywords", 2);
    const freshnessBlock = extractYamlBlock(section, "freshness", 2);
    const hardFiltersBlock = extractYamlBlock(section, "hard_filters", 2);

    const rolePositive = extractYamlArray(roleBlock, "positive", 4);
    const skillTerms = extractYamlArray(skillBlock, "terms", 4);
    const noSponsorshipKeywords = extractYamlArray(
      hardFiltersBlock,
      "no_sponsorship_keywords",
      4,
    );
    const noSponsorshipCompanies = extractYamlArray(
      hardFiltersBlock,
      "no_sponsorship_companies",
      4,
    );
    const clearanceKeywords = extractYamlArray(
      hardFiltersBlock,
      "clearance_keywords",
      4,
    );
    const activeSecurityClearanceCompanies = extractYamlArray(
      hardFiltersBlock,
      "active_security_clearance_companies",
      4,
    );

    return {
      role_keywords: {
        positive:
          rolePositive.length > 0
            ? rolePositive
            : DEFAULT_SCAN_CONFIG.role_keywords.positive,
        weight: extractYamlNumber(
          roleBlock,
          "weight",
          4,
          DEFAULT_SCAN_CONFIG.role_keywords.weight,
        ),
      },
      skill_keywords: {
        terms:
          skillTerms.length > 0
            ? skillTerms
            : DEFAULT_SCAN_CONFIG.skill_keywords.terms,
        weight: extractYamlNumber(
          skillBlock,
          "weight",
          4,
          DEFAULT_SCAN_CONFIG.skill_keywords.weight,
        ),
        max_score: extractYamlNumber(
          skillBlock,
          "max_score",
          4,
          DEFAULT_SCAN_CONFIG.skill_keywords.max_score,
        ),
      },
      freshness: {
        within_24h: extractYamlNumber(
          freshnessBlock,
          "within_24h",
          4,
          DEFAULT_SCAN_CONFIG.freshness.within_24h,
        ),
        within_3d: extractYamlNumber(
          freshnessBlock,
          "within_3d",
          4,
          DEFAULT_SCAN_CONFIG.freshness.within_3d,
        ),
        older: extractYamlNumber(
          freshnessBlock,
          "older",
          4,
          DEFAULT_SCAN_CONFIG.freshness.older,
        ),
      },
      list_threshold: extractYamlNumber(
        section,
        "list_threshold",
        2,
        DEFAULT_SCAN_CONFIG.list_threshold,
      ),
      pipeline_threshold: extractYamlNumber(
        section,
        "pipeline_threshold",
        2,
        DEFAULT_SCAN_CONFIG.pipeline_threshold,
      ),
      hard_filters: {
        exclude_no_sponsorship: extractYamlBoolean(
          hardFiltersBlock,
          "exclude_no_sponsorship",
          4,
          DEFAULT_SCAN_CONFIG.hard_filters.exclude_no_sponsorship,
        ),
        exclude_active_security_clearance: extractYamlBoolean(
          hardFiltersBlock,
          "exclude_active_security_clearance",
          4,
          DEFAULT_SCAN_CONFIG.hard_filters.exclude_active_security_clearance,
        ),
        no_sponsorship_keywords:
          noSponsorshipKeywords.length > 0
            ? noSponsorshipKeywords
            : DEFAULT_SCAN_CONFIG.hard_filters.no_sponsorship_keywords,
        no_sponsorship_companies: mergeUniqueStrings(
          noSponsorshipCompanies,
          companyMemory.no_sponsorship_companies,
        ),
        clearance_keywords:
          clearanceKeywords.length > 0
            ? clearanceKeywords
            : DEFAULT_SCAN_CONFIG.hard_filters.clearance_keywords,
        active_security_clearance_companies: mergeUniqueStrings(
          activeSecurityClearanceCompanies,
          companyMemory.active_security_clearance_companies,
        ),
      },
      detail_concurrent_tabs: extractYamlNumber(
        section,
        "detail_concurrent_tabs",
        2,
        DEFAULT_SCAN_CONFIG.detail_concurrent_tabs,
      ),
      detail_delay_min_ms: extractYamlNumber(
        section,
        "detail_delay_min_ms",
        2,
        DEFAULT_SCAN_CONFIG.detail_delay_min_ms,
      ),
      detail_delay_max_ms: extractYamlNumber(
        section,
        "detail_delay_max_ms",
        2,
        DEFAULT_SCAN_CONFIG.detail_delay_max_ms,
      ),
    };
  } catch {
    return {
      ...DEFAULT_SCAN_CONFIG,
      hard_filters: {
        ...DEFAULT_SCAN_CONFIG.hard_filters,
        no_sponsorship_companies: mergeUniqueStrings(
          DEFAULT_SCAN_CONFIG.hard_filters.no_sponsorship_companies,
          companyMemory.no_sponsorship_companies,
        ),
        active_security_clearance_companies: mergeUniqueStrings(
          DEFAULT_SCAN_CONFIG.hard_filters.active_security_clearance_companies,
          companyMemory.active_security_clearance_companies,
        ),
      },
    };
  }
}

export function loadNegativeKeywords(repoRoot: string): string[] {
  const portalsPath = join(repoRoot, "portals.yml");
  if (!existsSync(portalsPath)) return [];

  try {
    const content = readFileSync(portalsPath, "utf-8");
    const negMatch = /negative:\s*\n((?:\s+-\s+.+\n?)*)/m.exec(content);
    if (!negMatch) return [];
    return [...negMatch[1]!.matchAll(/^\s+-\s+(.+)$/gm)].map((match) =>
      match[1]!.trim().replace(/^["']|["']$/g, ""),
    );
  } catch {
    return [];
  }
}

export function loadTrackedCompanyRoles(repoRoot: string): Set<string> {
  const trackerPath = join(repoRoot, "data/applications.md");
  const tracked = new Set<string>();
  if (!existsSync(trackerPath)) return tracked;

  try {
    const content = readFileSync(trackerPath, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.startsWith("|") || line.includes("---") || line.includes("Company")) continue;
      const cols = line.split("|").map((segment) => segment.trim());
      if (cols.length < 5) continue;

      const company = cols[3]?.toLowerCase() ?? "";
      const role = cols[4]?.toLowerCase() ?? "";
      if (company && role) {
        tracked.add(`${company}|${role}`);
      }
    }
  } catch {
    // Ignore malformed tracker rows.
  }

  return tracked;
}

export function loadPipelineUrls(repoRoot: string): Set<string> {
  const pipelinePath = join(repoRoot, "data/pipeline.md");
  const urls = new Set<string>();
  if (!existsSync(pipelinePath)) return urls;

  try {
    const content = readFileSync(pipelinePath, "utf-8");
    for (const line of content.split("\n")) {
      const match = /^\s*-\s+\[[ xX]?\]\s+(\S+)/.exec(line);
      if (match?.[1]) {
        urls.add(match[1]);
      }
    }
  } catch {
    // Ignore malformed pipeline rows.
  }

  return urls;
}

export function persistBlockedCompanies(
  repoRoot: string,
  filteredRows: readonly FilteredRow[],
): void {
  const memory = loadBlockedCompanyMemory(repoRoot);
  let changed = false;

  for (const filteredRow of filteredRows) {
    const company = filteredRow.row.company.trim();
    if (!company) continue;

    if (
      filteredRow.reason === "no_sponsorship" &&
      filteredRow.row.confirmedSponsorshipSupport === "no"
    ) {
      changed =
        insertUniqueCompany(memory.no_sponsorship_companies, company) || changed;
      continue;
    }

    if (
      filteredRow.reason === "active_clearance_required" &&
      filteredRow.row.confirmedRequiresActiveSecurityClearance
    ) {
      changed =
        insertUniqueCompany(
          memory.active_security_clearance_companies,
          company,
        ) || changed;
    }
  }

  if (!changed) return;

  memory.no_sponsorship_companies.sort(compareCaseInsensitive);
  memory.active_security_clearance_companies.sort(compareCaseInsensitive);
  writeBlockedCompanyMemory(repoRoot, memory);
}

function loadBlockedCompanyMemory(repoRoot: string): BlockedCompanyMemory {
  const memoryPath = join(repoRoot, COMPANY_MEMORY_PATH);
  if (!existsSync(memoryPath)) {
    return {
      no_sponsorship_companies: [],
      active_security_clearance_companies: [],
    };
  }

  try {
    const lines = readFileSync(memoryPath, "utf-8").split(/\r?\n/);
    return {
      no_sponsorship_companies: extractYamlArray(
        lines,
        "no_sponsorship_companies",
        0,
      ),
      active_security_clearance_companies: extractYamlArray(
        lines,
        "active_security_clearance_companies",
        0,
      ),
    };
  } catch {
    return {
      no_sponsorship_companies: [],
      active_security_clearance_companies: [],
    };
  }
}

function writeBlockedCompanyMemory(
  repoRoot: string,
  memory: BlockedCompanyMemory,
): void {
  const memoryPath = join(repoRoot, COMPANY_MEMORY_PATH);
  mkdirSync(join(repoRoot, "data"), { recursive: true });
  const lines = [
    "# Auto-maintained by newgrad-scan.",
    "# Only companies confirmed on the original employer posting are persisted here.",
    "",
    "no_sponsorship_companies:",
    ...renderYamlArray(memory.no_sponsorship_companies),
    "",
    "active_security_clearance_companies:",
    ...renderYamlArray(memory.active_security_clearance_companies),
    "",
  ];
  writeFileSync(memoryPath, lines.join("\n"), "utf-8");
}

function renderYamlArray(values: readonly string[]): string[] {
  return values.map((value) => `  - ${JSON.stringify(value)}`);
}

function mergeUniqueStrings(...groups: ReadonlyArray<readonly string[]>): string[] {
  const merged: string[] = [];
  for (const group of groups) {
    for (const value of group) {
      insertUniqueCompany(merged, value);
    }
  }
  return merged.sort(compareCaseInsensitive);
}

function insertUniqueCompany(values: string[], company: string): boolean {
  const normalizedCompany = normalizeCompanyName(company);
  if (!normalizedCompany) return false;
  const exists = values.some(
    (value) => normalizeCompanyName(value) === normalizedCompany,
  );
  if (exists) return false;
  values.push(company.trim());
  return true;
}

function normalizeCompanyName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function compareCaseInsensitive(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function extractYamlBlock(lines: readonly string[], key: string, indent: number): string[] {
  const header = new RegExp(`^${" ".repeat(indent)}${escapeRegExp(key)}:\\s*$`);
  const start = lines.findIndex((line) => header.test(line));
  if (start === -1) return [];

  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      block.push(line);
      continue;
    }
    if (countIndent(line) <= indent) break;
    block.push(line);
  }
  return block;
}

function extractYamlArray(lines: readonly string[], key: string, indent: number): string[] {
  const block = extractYamlBlock(lines, key, indent);
  return block
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim().replace(/^["']|["']$/g, ""));
}

function extractYamlNumber(
  lines: readonly string[],
  key: string,
  indent: number,
  fallback: number,
): number {
  const pattern = new RegExp(
    `^${" ".repeat(indent)}${escapeRegExp(key)}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*$`,
  );
  const match = lines.find((line) => pattern.test(line))?.match(pattern);
  return match ? Number(match[1]) : fallback;
}

function extractYamlBoolean(
  lines: readonly string[],
  key: string,
  indent: number,
  fallback: boolean,
): boolean {
  const pattern = new RegExp(
    `^${" ".repeat(indent)}${escapeRegExp(key)}:\\s*(true|false)\\s*$`,
    "i",
  );
  const match = lines.find((line) => pattern.test(line))?.match(pattern);
  return match ? match[1]!.toLowerCase() === "true" : fallback;
}

function countIndent(line: string): number {
  return line.length - line.trimStart().length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
