import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { NewGradRow, NewGradScanConfig } from "../contracts/newgrad.js";
import { findSkillKeywordMatches } from "./newgrad-skill-match.js";

const SKILL_STATS_PATH = "data/newgrad-skill-stats.json";
const PROFILE_SOURCES = [
  "cv.md",
  "article-digest.md",
  "modes/_profile.md",
] as const;

interface SkillCount {
  term: string;
  count: number;
}

export interface NewGradSkillStatsArtifact {
  generatedAt: string;
  stage: "score";
  rowsScored: number;
  matchedSkills: SkillCount[];
  unmatchedSkills: string[];
  profileMatchedSkills: string[];
  profileUnmatchedSkills: string[];
  profileSources: readonly string[];
}

const uniqueTerms = (terms: readonly string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const term of terms) {
    const key = term.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(term);
  }
  return unique;
};

const readProfileText = (repoRoot: string): string =>
  PROFILE_SOURCES.map((source) => {
    const path = join(repoRoot, source);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  }).join("\n");

export const buildNewGradSkillStats = (
  repoRoot: string,
  config: NewGradScanConfig,
  rows: readonly NewGradRow[],
): NewGradSkillStatsArtifact => {
  const terms = uniqueTerms(config.skill_keywords.terms);
  const counts = new Map(terms.map((term) => [term, 0]));

  for (const row of rows) {
    const text = row.qualifications ?? "";
    for (const term of findSkillKeywordMatches(text, terms)) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  const matchedSkills = terms
    .map((term) => ({ term, count: counts.get(term) ?? 0 }))
    .filter((item) => item.count > 0);
  const unmatchedSkills =
    rows.length === 0
      ? []
      : terms.filter((term) => (counts.get(term) ?? 0) === 0);
  const profileMatches = new Set(findSkillKeywordMatches(readProfileText(repoRoot), terms));

  return {
    generatedAt: new Date().toISOString(),
    stage: "score",
    rowsScored: rows.length,
    matchedSkills,
    unmatchedSkills,
    profileMatchedSkills: terms.filter((term) => profileMatches.has(term)),
    profileUnmatchedSkills: terms.filter((term) => !profileMatches.has(term)),
    profileSources: PROFILE_SOURCES,
  };
};

export const recordNewGradSkillStats = (
  repoRoot: string,
  config: NewGradScanConfig,
  rows: readonly NewGradRow[],
): void => {
  try {
    const artifact = buildNewGradSkillStats(repoRoot, config, rows);
    const path = join(repoRoot, SKILL_STATS_PATH);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  } catch (error) {
    console.error("[newgrad-skill-stats] failed to write stats", error);
  }
};
