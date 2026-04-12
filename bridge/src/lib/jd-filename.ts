import { createHash } from "node:crypto";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ref",
  "source",
  "gh_src",
  "lever-source",
]);

/** Strip tracking query params and hash fragments from a URL. */
export function stripTrackingParams(raw: string): string {
  const u = new URL(raw);
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
  }
  u.hash = "";
  return u.toString();
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
