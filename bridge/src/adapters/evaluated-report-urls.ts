import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalizeJobUrl } from "../lib/canonical-job-url.js";

export function loadEvaluatedReportUrls(repoRoot: string): Set<string> {
  const reportsDir = join(repoRoot, "reports");
  const urls = new Set<string>();
  if (!existsSync(reportsDir)) return urls;

  for (const file of readdirSync(reportsDir)) {
    if (!file.endsWith(".md")) continue;
    const markdown = readFileSync(join(reportsDir, file), "utf-8");
    const match = markdown.match(/^\*\*URL:\*\*\s+(.+)$/m);
    const canonical = canonicalizeJobUrl(match?.[1]);
    if (canonical) {
      urls.add(canonical);
    }
  }

  return urls;
}
