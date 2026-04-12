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
  applyUrl?: string;
}

/**
 * Write a JD file with YAML frontmatter + description body.
 * Returns the filename on success, or null if description is too short.
 */
export function writeJdFile(input: WriteJdFileInput): string | null {
  if (input.description.length < JD_MIN_CHARS) return null;

  const filename = jdFilename(input.company, input.url);

  // Build frontmatter object — omit undefined fields
  const meta: Record<string, string> = {
    company: input.company,
    role: input.role,
  };
  if (input.location) meta.location = input.location;
  if (input.salary) meta.salary = input.salary;
  if (input.h1b) meta.h1b = input.h1b;
  if (input.applyUrl) meta.applyUrl = input.applyUrl;
  meta.source = "newgrad-scan";
  meta.extractedAt = new Date().toISOString();

  // yaml.stringify with defaultStringType QUOTE_DOUBLE ensures all values are double-quoted
  const frontmatter = stringify(meta, { defaultStringType: "QUOTE_DOUBLE" });
  const content = `---\n${frontmatter}---\n\n${input.description}\n`;

  writeFileSync(join(input.jdsDir, filename), content, "utf-8");
  return filename;
}
