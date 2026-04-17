import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { JD_MIN_CHARS } from "../contracts/jobs.js";
import { jdFilename } from "./jd-filename.js";

export interface WriteJdFileInput {
  /** Absolute path to the jds/ directory. */
  jdsDir: string;
  company: string;
  role: string;
  /** The canonical URL (output of pickPipelineEntryUrl). Used for filename hash. */
  url: string;
  /** Full JD description text. */
  description: string;
  location?: string;
  salary?: string;
  /** "yes" | "no" | "unknown" */
  h1b?: string;
  /** Optional clearance marker for prompt-side hard blockers. */
  clearance?: string;
  applyUrl?: string;
  companyDescription?: string;
  requiredQualifications?: readonly string[];
  responsibilities?: readonly string[];
  skillTags?: readonly string[];
  recommendationTags?: readonly string[];
  taxonomy?: readonly string[];
}

/**
 * Write a JD file with YAML frontmatter + description body.
 * Returns the filename on success, or null if the combined cached JD body is too short.
 */
export function writeJdFile(input: WriteJdFileInput): string | null {
  const body = buildJdBody(input);
  if (body.length < JD_MIN_CHARS) return null;

  const filename = jdFilename(input.company, input.url);

  // Build frontmatter object — omit undefined fields
  const meta: Record<string, string> = {
    company: input.company,
    role: input.role,
  };
  if (input.location) meta.location = input.location;
  if (input.salary) meta.salary = input.salary;
  if (input.h1b) meta.h1b = input.h1b;
  if (input.clearance) meta.clearance = input.clearance;
  if (input.applyUrl) meta.applyUrl = input.applyUrl;
  meta.source = "newgrad-scan";
  meta.extractedAt = new Date().toISOString();

  // yaml.stringify with defaultStringType QUOTE_DOUBLE ensures all values are double-quoted
  const frontmatter = stringify(meta, { defaultStringType: "QUOTE_DOUBLE" });
  const content = `---\n${frontmatter}---\n\n${body}\n`;

  writeFileSync(join(input.jdsDir, filename), content, "utf-8");
  return filename;
}

function buildJdBody(input: WriteJdFileInput): string {
  const sections = [
    input.description.trim(),
    input.companyDescription?.trim()
      ? `Company summary:\n${input.companyDescription.trim()}`
      : null,
    renderBulletSection("Requirements", input.requiredQualifications),
    renderBulletSection("Responsibilities", input.responsibilities),
    renderInlineSection("Skill tags", input.skillTags),
    renderInlineSection("Recommendation tags", input.recommendationTags),
    renderInlineSection("Taxonomy", input.taxonomy),
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n\n").trim();
}

function renderBulletSection(
  title: string,
  items: readonly string[] | undefined,
): string | null {
  const normalized = normalizeItems(items);
  if (normalized.length === 0) return null;
  return [title, ...normalized.map((item) => `- ${item}`)].join("\n");
}

function renderInlineSection(
  title: string,
  items: readonly string[] | undefined,
): string | null {
  const normalized = normalizeItems(items);
  if (normalized.length === 0) return null;
  return `${title}: ${normalized.join(", ")}`;
}

function normalizeItems(items: readonly string[] | undefined): string[] {
  if (!items) return [];
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
