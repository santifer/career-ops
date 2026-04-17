const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_name",
  "ref",
  "source",
  "gh_src",
  "lever-source",
]);

export function canonicalizeJobUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = normalizeCanonicalPath(url);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeCanonicalPath(url: URL): string {
  const pathname = collapseSlashes(url.pathname);

  const oracleJobId = pathname.match(
    /\/CandidateExperience\/(?:[^/]+\/)?(?:sites\/[^/]+\/)?job\/([^/?#]+)/i,
  )?.[1];
  if (oracleJobId) {
    return `/hcmUI/CandidateExperience/job/${oracleJobId}`;
  }

  const genericJobIdMatch = pathname.match(
    /^(.*?\/job\/)(?=[A-Za-z0-9_-]*\d)([A-Za-z0-9_-]{5,})(?:\/.*)?$/i,
  );
  if (genericJobIdMatch) {
    return trimTrailingSlash(`${genericJobIdMatch[1]}${genericJobIdMatch[2]}`);
  }

  return trimTrailingSlash(pathname);
}

function collapseSlashes(value: string): string {
  return value.replace(/\/{2,}/g, "/");
}

function trimTrailingSlash(value: string): string {
  if (value === "/") return value;
  return value.replace(/\/+$/, "");
}
