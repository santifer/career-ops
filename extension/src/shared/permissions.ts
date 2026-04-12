/**
 * permissions.ts — domain-family resolution for chrome.permissions.request.
 *
 * Multi-tenant ATS products (Workday, iCIMS, SmartRecruiters, Greenhouse)
 * give every customer a distinct subdomain. Asking the user to authorize
 * each one individually would be hostile. Instead, when a URL belongs
 * to a known ATS family we request the family wildcard once; unknown
 * hosts fall back to a single-origin grant.
 *
 * Pure, dependency-free, safe to import from background / panel /
 * permission page alike.
 */

export interface PermissionOrigin {
  /** Origin pattern to pass to chrome.permissions.request. */
  pattern: string;
  /** Human-friendly name to show in the panel UI. */
  label: string;
  /** True when we matched a known ATS family (wildcard). */
  isFamily: boolean;
}

interface FamilyRule {
  /** Case-insensitive hostname suffix match. */
  suffix: string;
  /** Pattern handed to chrome.permissions.request. */
  pattern: string;
  label: string;
}

/**
 * Known ATS families. Order matters only insofar as suffix specificity —
 * longer suffixes should appear first so `myworkdayjobs.com` matches
 * before any future catch-all. Keep this list curated; every entry
 * widens the user-facing Chrome prompt.
 */
const ATS_FAMILIES: readonly FamilyRule[] = [
  { suffix: "myworkdayjobs.com",   pattern: "https://*.myworkdayjobs.com/*",   label: "Workday" },
  { suffix: "myworkday.com",       pattern: "https://*.myworkday.com/*",       label: "Workday" },
  { suffix: "icims.com",           pattern: "https://*.icims.com/*",           label: "iCIMS" },
  { suffix: "taleo.net",           pattern: "https://*.taleo.net/*",           label: "Taleo" },
  { suffix: "successfactors.com",  pattern: "https://*.successfactors.com/*",  label: "SAP SuccessFactors" },
  { suffix: "bamboohr.com",        pattern: "https://*.bamboohr.com/*",        label: "BambooHR" },
  { suffix: "workable.com",        pattern: "https://*.workable.com/*",        label: "Workable" },
  { suffix: "lever.co",            pattern: "https://*.lever.co/*",            label: "Lever" },
  { suffix: "ashbyhq.com",         pattern: "https://*.ashbyhq.com/*",         label: "Ashby" },
  { suffix: "greenhouse.io",       pattern: "https://*.greenhouse.io/*",       label: "Greenhouse" },
  { suffix: "smartrecruiters.com", pattern: "https://*.smartrecruiters.com/*", label: "SmartRecruiters" },
  { suffix: "gem.com",             pattern: "https://*.gem.com/*",             label: "Gem" },
  { suffix: "jobvite.com",         pattern: "https://*.jobvite.com/*",         label: "Jobvite" },
  { suffix: "recruitee.com",       pattern: "https://*.recruitee.com/*",       label: "Recruitee" },
  { suffix: "breezy.hr",           pattern: "https://*.breezy.hr/*",           label: "Breezy HR" },
  { suffix: "personio.com",        pattern: "https://*.personio.com/*",        label: "Personio" },
  { suffix: "teamtailor.com",      pattern: "https://*.teamtailor.com/*",      label: "Teamtailor" },
  { suffix: "wd1.myworkdayjobs.com", pattern: "https://*.myworkdayjobs.com/*", label: "Workday" },
];

function hostnameMatches(hostname: string, suffix: string): boolean {
  const h = hostname.toLowerCase();
  const s = suffix.toLowerCase();
  return h === s || h.endsWith("." + s);
}

/**
 * Given a page URL, return the smallest permission pattern that will
 * let chrome.scripting.executeScript inject on any page the user is
 * likely to visit in this ATS. Unknown hosts → full origin grant.
 */
export function resolvePermissionOrigin(pageUrl: string): PermissionOrigin | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  for (const rule of ATS_FAMILIES) {
    if (hostnameMatches(url.hostname, rule.suffix)) {
      return { pattern: rule.pattern, label: rule.label, isFamily: true };
    }
  }

  // Unknown host: single-origin grant. Label is just the hostname so
  // the UI can show "authorize guidehouse.example.com".
  return {
    pattern: `${url.origin}/*`,
    label: url.hostname,
    isFamily: false,
  };
}
