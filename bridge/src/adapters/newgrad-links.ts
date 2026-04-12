import type { NewGradDetail, NewGradRow } from "../contracts/newgrad.js";

const JOBRIGHT_HOST = "jobright.ai";
const ATS_HOST_PATTERNS = [
  "greenhouse.io",
  "greenhouse",
  "ashbyhq.com",
  "lever.co",
  "workdayjobs.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "jobvite.com",
  "icims.com",
];
const NOISE_HOST_PATTERNS = [
  "linkedin.com",
  "crunchbase.com",
  "glassdoor.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "tiktok.com",
  "marketbeat.com",
  "media.licdn.com",
];
const JOB_PATH_HINTS = [
  "/apply",
  "/job",
  "/jobs",
  "/career",
  "/careers",
  "/position",
  "/positions",
  "/opportunit",
];
const APPLY_QUERY_HINTS = [
  "gh_jid",
  "gh_src",
  "jobid",
  "job_id",
  "jobreq",
  "job_req",
  "req_id",
  "requisition",
  "lever-source",
  "ashby_jid",
  "token=",
];

function normalizeUrlCandidate(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function hasPattern(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

export function isJobrightUrl(url: string | null | undefined): boolean {
  const normalized = normalizeUrlCandidate(url);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    return parsed.hostname === JOBRIGHT_HOST || parsed.hostname.endsWith(`.${JOBRIGHT_HOST}`);
  } catch {
    return false;
  }
}

function scoreUrlCandidate(url: string | null | undefined): number {
  const normalized = normalizeUrlCandidate(url);
  if (!normalized) return Number.NEGATIVE_INFINITY;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const full = `${host}${path}${parsed.search.toLowerCase()}`;

    if (hasPattern(host, NOISE_HOST_PATTERNS)) return -100;

    let score = 0;

    if (hasPattern(host, ATS_HOST_PATTERNS)) score += 100;
    if (hasPattern(full, APPLY_QUERY_HINTS)) score += 24;
    if (hasPattern(path, JOB_PATH_HINTS)) score += 18;
    if (/\b(apply|job|jobs|career|careers|position|opening|opportunit)\b/.test(full)) {
      score += 12;
    }

    if (isJobrightUrl(normalized)) {
      score -= 80;
      if (path.startsWith("/jobs/info/")) score -= 30;
    } else {
      score += 40;
    }

    const lastSegment = path.split("/").filter(Boolean).at(-1) ?? "";
    if (!lastSegment || ["", "home", "about", "company"].includes(lastSegment)) {
      score -= 10;
    }

    return score;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}

export function pickBestNewGradUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  let bestUrl: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const normalized = normalizeUrlCandidate(candidate);
    if (!normalized) continue;

    const score = scoreUrlCandidate(normalized);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = normalized;
    }
  }

  return bestUrl;
}

export function hasExternalNewGradUrl(
  ...candidates: Array<string | null | undefined>
): boolean {
  const best = pickBestNewGradUrl(...candidates);
  return Boolean(best && !isJobrightUrl(best));
}

export function pickPipelineEntryUrl(
  detail: Pick<NewGradDetail, "originalPostUrl" | "applyNowUrl" | "applyFlowUrls">,
  row: Pick<NewGradRow, "applyUrl" | "detailUrl">
): string {
  return (
    pickBestNewGradUrl(
      detail.originalPostUrl,
      detail.applyNowUrl,
      ...(detail.applyFlowUrls ?? []),
      row.applyUrl,
      row.detailUrl,
    ) ??
    normalizeUrlCandidate(row.detailUrl) ??
    row.detailUrl
  );
}
