import { createHash } from "node:crypto";
import { canonicalizeJobUrl } from "./canonical-job-url.js";

/** Strip tracking query params and hash fragments from a URL. */
export function stripTrackingParams(raw: string): string {
  return canonicalizeJobUrl(raw) ?? raw;
}

/**
 * Deterministic JD filename from company name + URL.
 * Format: `{company-slug}-{url-hash-8}.txt`
 */
export function jdFilename(company: string, url: string): string {
  const slug =
    company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
  const normalized = stripTrackingParams(url);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 8);
  return `${slug}-${hash}.txt`;
}
