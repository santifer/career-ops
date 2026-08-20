/**
 * job-url.mjs — normalize a pasted job posting URL into the pair the pipeline needs.
 *
 * Two URLs, usually identical:
 *   url      the canonical link we RECORD (report header **URL:**, tracker row).
 *   fetchUrl the link the agent READS.
 *
 * They differ for LinkedIn only. https://www.linkedin.com/jobs/view/<id> served to a
 * headless agent is an authwall or a JS shell, so an evaluation run against it scores
 * a login page and still writes a confident-looking report. LinkedIn's public guest
 * endpoint returns the real posting body with no auth, so we fetch that and keep the
 * clickable link for the tracker.
 *
 * Plain .mjs, dependency-free (same pattern as pdf-paths.mjs / cv-envelope.mjs) so
 * test-all.mjs can import it under bare Node and its sibling suite is auto-gated.
 */

/**
 * @typedef {Object} NormalizedJobUrl
 * @property {true} ok
 * @property {string} url       Canonical link, recorded in the report and tracker.
 * @property {string} fetchUrl  What the agent actually fetches.
 * @property {"linkedin"|"generic"} kind
 */

/**
 * @typedef {Object} JobUrlError
 * @property {false} ok
 * @property {string} error  User-facing, no em dashes (AGENTS.md house rule).
 */

/** @typedef {"greenhouse"|"lever"|"ashby"|"workday"} AtsSource */

// Share-sheet and campaign noise. Dropped so the same posting pasted from an email
// and from the address bar dedupes to one entry, and so the recorded URL stays clean.
const TRACKING_PARAMS = [/^utm_/i, /^trk$/i, /^trkInfo$/i, /^refId$/i, /^trackingId$/i, /^originalSubdomain$/i, /^lipi$/i, /^eBP$/i];

/**
 * Host equality anchored at a dot boundary, so "greenhouse.io.evil.example" never
 * matches "greenhouse.io". The one host-matching rule shared by every caller that
 * needs to know what ATS (or what registrable domain) a URL belongs to.
 *
 * @param {string} host
 * @param {string} base
 * @returns {boolean}
 */
export function domainIs(host, base) {
  return host === base || host.endsWith(`.${base}`);
}

/**
 * Host -> ATS source, for every ATS host any caller in this app recognizes.
 * Single list (#F6): `sourceFromUrl` in inbox.ts and `companyFromJobUrl` below both
 * used to keep their own copy of this list, which meant they could silently drift
 * on which hosts count as an ATS. Workday ships two live hostnames: the tenant
 * subdomain (`{tenant}.myworkdayjobs.com`) and the bare `workday.com` some postings
 * use directly; both resolve to the same source.
 *
 * @type {ReadonlyArray<[string, AtsSource]>}
 */
export const ATS_HOSTS = [
  ["greenhouse.io", "greenhouse"],
  ["lever.co", "lever"],
  ["ashbyhq.com", "ashby"],
  ["myworkdayjobs.com", "workday"],
  ["workday.com", "workday"],
];

/**
 * Which ATS a host belongs to, matched with the same dot-boundary rule as
 * `domainIs`. Returns null for a host that isn't one of ATS_HOSTS (including
 * linkedin.com, which is handled separately since it isn't an ATS).
 *
 * @param {string} host
 * @returns {AtsSource|null}
 */
export function atsSourceFromHost(host) {
  for (const [base, source] of ATS_HOSTS) {
    if (domainIs(host, base)) return source;
  }
  return null;
}

/**
 * Strip artifacts a job URL picks up when copied out of a sentence (email, Slack
 * message, chat) rather than off an address bar: a single layer of wrapping
 * <angle brackets> or (parentheses) around the whole string, then trailing
 * sentence punctuation. A trailing "/" is left alone, since it is meaningful in a
 * URL path rather than incidental to the prose around it. Runs on the already-
 * trimmed input, before the scheme check, so both a bare host and a full URL
 * benefit.
 *
 * The two strips don't commute on their own: "<url>." needs the trailing "." gone
 * before the ">" is the last character, so the wrapper check can see it. Composed
 * pastes ("<url>.", "(url),") are the common case, since a Markdown or email link
 * is usually both wrapped AND sitting at the end of a sentence. So this runs both
 * strips to a fixed point rather than once each.
 *
 * @param {string} s
 * @returns {string}
 */
function stripPasteNoise(s) {
  const WRAPPERS = [
    ["<", ">"],
    ["(", ")"],
  ];
  // Guard against an unbounded loop: a pass that changes anything removes at
  // least one character (a wrapper strips two, a punctuation run strips one or
  // more), so the string's own length is a hard ceiling on how many passes a
  // fixed point can take. The caller already bounds `s` at MAX_URL_LENGTH before
  // this runs, so this is a small, fixed amount of work either way, not a
  // reintroduction of the quadratic behavior the backwards scan below replaced.
  const maxPasses = s.length + 1;
  for (let pass = 0; pass < maxPasses; pass++) {
    const before = s;
    for (const [open, close] of WRAPPERS) {
      if (s.startsWith(open) && s.endsWith(close) && s.length > open.length + close.length) {
        s = s.slice(1, -1).trim();
      }
    }
    // Only sentence-ending punctuation a URL never legitimately ends with. Not "/",
    // "]", ")", "%", or "=", any of which can be a real trailing path/query byte.
    //
    // Scanned backwards rather than matched with /[.,;!?]+$/. That regex is
    // polynomial on this input: for a paste like "!!!!!!…x" the engine consumes the
    // whole run, fails on $, restarts one character right and does it again, which is
    // O(n^2) on a string the user controls the length of (CodeQL js/polynomial-redos).
    // A backwards walk is linear and states the intent more plainly anyway.
    let end = s.length;
    while (end > 0 && TRAILING_PUNCTUATION.includes(s[end - 1])) end--;
    s = s.slice(0, end);
    if (s === before) break;
  }
  return s;
}

const TRAILING_PUNCTUATION = ".,;!?";

/** Generous next to any real posting URL, small enough to bound the work below. */
const MAX_URL_LENGTH = 2048;

/**
 * The numeric LinkedIn job id, or null when this URL is not one posting.
 * Matched as digits only, so nothing user-supplied is ever spliced into a hostname.
 * @param {URL} u
 * @returns {string|null}
 */
function linkedInJobId(u) {
  const seg = u.pathname.match(/\/jobs\/view\/([^/]+)/i);
  if (seg) {
    if (/^\d+$/.test(seg[1])) return seg[1];
    // "senior-ai-engineer-at-acme-4434693435" — the id is the trailing number.
    // 6+ digits so a title ending in "-2" cannot be read as a job id.
    const tail = seg[1].match(/-(\d{6,})$/);
    if (tail) return tail[1];
  }
  // Collections and search views carry the id only in the query string.
  const cur = u.searchParams.get("currentJobId");
  if (cur && /^\d+$/.test(cur)) return cur;
  return null;
}

/**
 * @param {string} raw
 * @returns {NormalizedJobUrl|JobUrlError}
 */
export function normalizeJobUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "Paste a job posting URL." };
  // Bound the input before any per-character work touches it. A posting URL is
  // never anywhere near this long, and the whole prompt is passed to the CLI as a
  // single argv element, so an unbounded paste is wasted tokens at best.
  if (raw.length > MAX_URL_LENGTH) return { ok: false, error: "That is too long to be a job posting URL." };
  const trimmed = stripPasteNoise(raw.trim());
  // A paste with no scheme is the common case; anything that already declares one
  // keeps it, so javascript: and file: reach the protocol check below and are refused.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let u;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, error: `That does not look like a URL: ${trimmed.slice(0, 60)}` };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: `Only http and https links work here, not ${u.protocol.replace(":", "")}.` };
  }
  if (!u.hostname.includes(".")) return { ok: false, error: `That does not look like a job posting URL: ${trimmed.slice(0, 60)}` };

  // Collect first: deleting while iterating searchParams skips entries.
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((re) => re.test(key))) u.searchParams.delete(key);
  }

  if (domainIs(u.hostname.toLowerCase(), "linkedin.com")) {
    const id = linkedInJobId(u);
    if (!id) {
      return {
        ok: false,
        error: "That LinkedIn link does not point at a single job posting. Open the job, then copy the URL from the address bar.",
      };
    }
    return {
      ok: true,
      kind: "linkedin",
      url: `https://www.linkedin.com/jobs/view/${id}/`,
      fetchUrl: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`,
    };
  }

  const clean = u.toString();
  return { ok: true, kind: "generic", url: clean, fetchUrl: clean };
}

/**
 * Split a paste into normalized entries plus per-line errors. Whitespace separated,
 * so one URL per line and several on one line both work. Deduped on the canonical
 * url, which collapses the two LinkedIn spellings of the same job.
 *
 * @param {string} text
 * @returns {{entries: NormalizedJobUrl[], errors: Array<{raw: string, error: string}>}}
 */
export function parsePastedUrls(text) {
  const entries = [];
  const errors = [];
  const seen = new Set();
  for (const token of String(text ?? "").split(/\s+/)) {
    if (!token) continue;
    const r = normalizeJobUrl(token);
    if (!r.ok) {
      errors.push({ raw: token, error: r.error });
      continue;
    }
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    entries.push(r);
  }
  return { entries, errors };
}

/**
 * Best-effort company name from the URL alone, for the free "add to inbox" path
 * (pipeline.md rows read badly with an empty company). Zero network, zero tokens.
 * Returns "" when the URL genuinely does not carry it, rather than guessing.
 *
 * @param {string} url
 * @returns {string}
 */
export function companyFromJobUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "";
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split("/").filter(Boolean);
  const source = atsSourceFromHost(host);
  // Of ATS_HOSTS, only these three ATS layouts put the company first in the path.
  // Workday's tenant subdomain carries the company instead (acme.myworkdayjobs.com),
  // so it falls through to the registrable-name branch below like any other host.
  if (source === "greenhouse" || source === "lever" || source === "ashby") {
    return seg[0] ?? "";
  }
  // LinkedIn's URL carries the job id and nothing about the employer.
  if (domainIs(host, "linkedin.com")) return "";
  // Otherwise the registrable name: careers.example.com -> example.
  const parts = host.replace(/^www\./, "").split(".");
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? "";
}

/**
 * Canonical identity key for a pasted URL: the thing several UI surfaces (inbox,
 * tracker, dedup) can compare to decide whether two pasted strings point at the
 * same posting. Must never throw and never return undefined so a caller can
 * always use the result as a Map/Set key or React list key with no null check.
 *
 * @param {string} url
 * @returns {string} normalizeJobUrl's canonical `url` on success, or the input
 *   unchanged when it does not parse as a job posting URL.
 */
export function postingKey(url) {
  const r = normalizeJobUrl(url);
  return r.ok ? r.url : String(url ?? "");
}
