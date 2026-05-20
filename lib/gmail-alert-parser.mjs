/**
 * lib/gmail-alert-parser.mjs
 *
 * Pure-function URL / title / curator-mention extraction for Gmail
 * job-alert emails. Shared by:
 *
 *   - scan-email.mjs            (IMAP, daily 02:00 PT, full inbox sweep)
 *   - scripts/scan-email-poll.mjs (Gmail API, every 15 min via launchd)
 *
 * No I/O happens here — callers fetch the message bodies and pass them
 * in. The only side effect of the parser is the in-memory cache of the
 * portals.yml tracked-company list (used by isCompanyTracked).
 *
 * Persistence helpers (appendToPipeline, appendToScanHistory,
 * appendCuratorMentions, loadSeenUrls) also live here so both
 * ingestion paths share the same dedup + writer logic.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

const parseYaml = yaml.load;

export const PORTALS_PATH = 'portals.yml';
export const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
export const PIPELINE_PATH = 'data/pipeline.md';
export const APPLICATIONS_PATH = 'data/applications.md';
export const CURATOR_LOG_PATH = 'data/curator-mentions.md';

// ── URL patterns ───────────────────────────────────────────────────

// LinkedIn post URLs and link shorteners. When these appear in an alert
// email (e.g., when you follow Noah G with bell notifications and he
// shares a job posting), we follow them to discover the underlying ATS
// URL. Posts hide their JD links behind LinkedIn's tracking redirects.
export const LINKEDIN_REDIRECT_PATTERNS = [
  /https?:\/\/(?:www\.)?lnkd\.in\/[\w-]+/i,
  /https?:\/\/(?:www\.)?linkedin\.com\/redir\/redirect\?url=[^"'\s<>]+/i,
];

export const LINKEDIN_POST_PATTERNS = [
  /https?:\/\/(?:www\.)?linkedin\.com\/posts\/[\w_-]+/i,
  /https?:\/\/(?:www\.)?linkedin\.com\/feed\/update\/urn:li:activity:\d+/i,
];

// Recognized job-board URL patterns. Generic — catches most platforms
// without requiring per-platform parsers. Add new patterns here as
// platforms surface. Each pattern is matched case-insensitively.
//
// Coverage map (kept in sync with scripts/gmail-filters.xml):
//   Tier 1 mainstream: LinkedIn, Indeed, Glassdoor, ZipRecruiter
//   Tier 2 AI/startup: BuiltIn, Wellfound, Otta, Welcome to the Jungle
//   Niche comms/editorial: Mediabistro, WorkingInContent, PRSA, Ragan,
//                           IABC, JournalismJobs, MarketingHire,
//                           Communications Network, Idealist
//   Gig/freelance: Upwork, Fiverr, Contra, Freelancer
//   ATS direct (when alerts embed ATS URLs): Greenhouse, Ashby, Lever,
//                                              Workable, Amazon Jobs
export const JOB_URL_PATTERNS = [
  // ── Mainstream ─────────────────────────────────────────────────
  /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i,
  /indeed\.com\/(?:viewjob|cmp\/[\w.-]+\/jobs\/[\w-]+|rc\/clk\?jk=[\w]+)/i,
  /indeed\.com\/q-[\w-]+-l-[\w%,-]+\/jobs/i,
  // Glassdoor removed: 403 bot-detection blocks all automated fetches — URLs enter
  // the pipeline but fail liveness every time, wasting triage slots. See 2026-05-09.
  // /glassdoor\.com\/(?:job-listing|partner\/jobListing\.htm|Job\/)/i,
  /ziprecruiter\.com\/(?:jobs|c\/[\w-]+\/Job)\/[\w-]+/i,

  // ── AI / startup ──────────────────────────────────────────────
  /builtin(?:la|nyc|sf|seattle|chicago|austin|boston)?\.com\/job\/[\w-]+/i,
  /wellfound\.com\/jobs\/[\w-]+/i,
  /angel\.co\/company\/[\w-]+\/jobs\/[\w-]+/i,
  /otta\.com\/jobs\/[\w-]+/i,
  /welcometothejungle\.com\/[\w-/]+\/jobs\/[\w-]+/i,
  /hired\.com\/jobs\/[\w-]+/i,

  // ── Niche comms / editorial / journalism / content ────────────
  /mediabistro\.com\/jobs\/(?:job-detail|description|view)\/[\w-]+/i,
  /workingincontent\.com\/jobs\/[\w-]+/i,
  /jobs\.prsa\.org\/(?:jobseeker|jobs)\/[\w-]+/i,
  /careers\.ragan\.com\/jobseeker\/job\/[\w-]+/i,
  /talenthub\.ragan\.com\/[\w-]+/i,
  /jobs\.iabc\.com\/(?:jobseeker|jobs)\/[\w-]+/i,
  /journalismjobs\.com\/[\w-]+\/[\w-]+/i,
  /marketinghire\.com\/(?:jobs|job)\/[\w-]+/i,
  /jobs\.comnetwork\.org\/[\w-]+/i,
  /idealist\.org\/(?:en\/)?(?:nonprofit-job|job|jobs)\/[\w-]+/i,

  // ── Gig / freelance ───────────────────────────────────────────
  /upwork\.com\/(?:jobs|freelance-jobs|job)\/[\w~-]+/i,
  /fiverr\.com\/(?:[\w-]+\/[\w-]+|gig\/[\w-]+)/i,
  /contra\.com\/projects?\/[\w-]+/i,
  /freelancer\.com\/(?:projects|jobs)\/[\w-]+/i,

  // ── ATS direct (alerts often embed; dedup handles overlap) ────
  /(?:job-boards|boards)\.greenhouse\.io\/[\w-]+\/jobs\/\d+/i,
  /jobs\.ashbyhq\.com\/[\w-]+\/[\w-]+/i,
  /jobs\.lever\.co\/[\w-]+\/[\w-]+/i,
  /(?:apply|jobs)\.workable\.com\/[\w-]+\/[\w-]+/i,
  /amazon\.jobs\/(?:en\/)?jobs\/\d+/i,
  /[\w-]+\.wd\d+\.myworkdayjobs\.com\/[\w-/]+/i,
];

// Senders worth scanning for curator-style "Role @ Company" lists. Add
// more as you start following more curators with bell notifications.
export const CURATOR_SENDERS = [
  /noahg/i,                   // Noah Greenberg posts (Stacker / cited2026.com)
  /commsjobs/i,               // Leah Rosenfeld's #commsjobs digest
  /content-?strategy/i,
];

// Glassdoor: body URLs are 403-blocked by glassdoor.com bot-detection
// (the matching pattern is intentionally disabled in JOB_URL_PATTERNS,
// see comment at the disabled glassdoor regex above). But every Glassdoor
// digest email encodes the same signal in its subject line:
//   "{Company} is hiring for {Role}. Apply Now."   (with role)
//   "{Company} is hiring. Apply Now."              (no role)
// Mining the subject lets us surface the company+role pair into
// data/curator-mentions.md (the same log used for LinkedIn-style
// curator posts), so untracked companies still surface as "consider
// adding to portals.yml" candidates. Same audit-trail format, just a
// different curator value.
export const GLASSDOOR_SENDER_RE = /noreply@glassdoor\.com/i;
export const GLASSDOOR_SUBJECT_RE = /^\s*(.+?)\s+is hiring(?:\s+for\s+([^.]+?))?\.\s*Apply Now\.?\s*$/i;

export function extractGlassdoorSubjectSignal(subject) {
  if (!subject) return null;
  const m = subject.match(GLASSDOOR_SUBJECT_RE);
  if (!m) return null;
  const company = m[1].trim();
  if (!company || company.length < 2) return null;
  const role = (m[2] || '').trim();
  return { company, role };
}

// ── Decode / canonicalize ──────────────────────────────────────────

export function decodeUrl(url) {
  // Many email clients HTML-encode ampersands. Decode them so URLs match.
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/');
}

// URL canonicalization — strip tracking params so the same job seen via
// multiple emails dedupes correctly. Platform-specific normalization for
// IDs that should fully specify the posting.
export function canonicalize(url) {
  // LinkedIn: keep /jobs/view/{id}
  const liMatch = url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i);
  if (liMatch) return `https://www.linkedin.com/jobs/view/${liMatch[1]}`;

  // Indeed: keep ?jk={id} which is the canonical job key, drop other params
  const indeedJk = url.match(/indeed\.com\/[^?]*\?[^#]*\bjk=([\w]+)/i);
  if (indeedJk) return `https://www.indeed.com/viewjob?jk=${indeedJk[1]}`;

  // Glassdoor: disabled — 403 bot-detection, see JOB_URL_PATTERNS comment above

  // Greenhouse: keep board + numeric id; strip everything else
  const ghMatch = url.match(/(?:job-boards|boards)\.greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/i);
  if (ghMatch) return `https://job-boards.greenhouse.io/${ghMatch[1]}/jobs/${ghMatch[2]}`;

  // Default: drop query string + fragment (most tracking lives there)
  return url.split('?')[0].split('#')[0];
}

// ── Extractors ─────────────────────────────────────────────────────

export function extractJobUrls(body) {
  // Pull every href and every bare URL, filter to job-like patterns.
  const urls = new Set();

  // <a href="..."> from HTML bodies
  for (const m of body.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const url = decodeUrl(m[1]);
    if (JOB_URL_PATTERNS.some(p => p.test(url))) urls.add(canonicalize(url));
  }

  // Bare URLs in plaintext bodies
  for (const m of body.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const url = decodeUrl(m[0]);
    if (JOB_URL_PATTERNS.some(p => p.test(url))) urls.add(canonicalize(url));
  }

  return [...urls];
}

// Extract LinkedIn-redirect URLs (lnkd.in shorteners + linkedin.com/redir
// + linkedin.com/posts pages). These need follow-through to surface the
// real ATS URL. Returns array of unique URLs.
export function extractLinkedInRedirectUrls(body) {
  const urls = new Set();
  const allPatterns = [...LINKEDIN_REDIRECT_PATTERNS, ...LINKEDIN_POST_PATTERNS];
  for (const m of body.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const url = decodeUrl(m[1]);
    if (allPatterns.some(p => p.test(url))) urls.add(url.split('?utm_')[0]);
  }
  for (const m of body.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const url = decodeUrl(m[0]);
    if (allPatterns.some(p => p.test(url))) urls.add(url.split('?utm_')[0]);
  }
  return [...urls];
}

// Parse "Role @ Company" pairs from a LinkedIn-post style body. The
// pattern matches lines like:
//   "Managing Editor @ Coinbase"                                    (bare)
//   "Editorial Manager @ NVIDIA ($136k - $218k / year)"             (with comp)
//   "Editorial Manager @ NVIDIA ($136k - $218k / year) - https://…" (with comp + URL)
//   "Executive Editorial Lead @ Plaid ($193k - $268k / year)"
//     "- https://lnkd.in/ezZzPrD8"                                  (URL on next line)
// Tolerant of HTML tags, decorative emoji, and bullet markers.
// Returns: [{ role, company, comp?, url? }, ...]
export function extractCuratorMentions(textOrHtml) {
  if (!textOrHtml) return [];
  // Strip HTML tags, decode entities, drop zero-width chars
  const text = textOrHtml
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[​-‍﻿]/g, '');
  const lines = text.split('\n');
  const out = [];
  // Capture: role @ company, optional (salary), optional - URL.
  //   group 1: role
  //   group 2: company (terminates at first '(' or ' -' or EOL)
  //   group 3: comp inside parens (optional)
  //   group 4: URL (optional, same-line)
  const re = /^[\s•*\-–—]*([A-Z][A-Za-z0-9 ,&/.'’\-]{5,}?)\s+@\s+([A-Z][A-Za-z0-9 &./'’\-]+?)(?:\s*\(([^)]+)\))?(?:\s*[-–—]\s*(https?:\/\/\S+))?\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const role = m[1].trim();
    const company = m[2].trim();
    const comp = m[3] ? m[3].trim() : '';
    let url = m[4] ? m[4].trim().replace(/[.,]$/, '') : '';
    // Sanity guards
    if (role.length < 6 || company.length < 2) continue;
    if (/^https?:/.test(role) || /^https?:/.test(company)) continue;
    if (/[@,]$/.test(company)) continue;
    // If URL not on same line, look one or two lines down for a leading-dash
    // URL line ("- https://lnkd.in/...") — Noah Greenberg's format.
    if (!url) {
      for (let look = 1; look <= 2; look++) {
        const next = (lines[i + look] || '').trim();
        const nextMatch = next.match(/^[-–—]\s*(https?:\/\/\S+)/);
        if (nextMatch) { url = nextMatch[1].replace(/[.,]$/, ''); break; }
        if (next.length > 0 && !next.startsWith('-')) break;
      }
    }
    out.push({ role, company, comp, url });
  }
  return out;
}

// Extract the title that's nearest to a given URL match in HTML, by
// scanning the surrounding anchor + sibling text. Best-effort — when
// it fails, the title falls back to the URL slug or "(unknown)".
export function extractTitleNear(body, url) {
  // Search for <a href="<url>">...</a> and capture the inner text
  const safeUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<a\\b[^>]*\\bhref=["'][^"']*${safeUrl.split('://')[1].slice(0, 40)}[^"']*["'][^>]*>([\\s\\S]{0,300}?)<\\/a>`, 'i');
  const m = body.match(re);
  if (m) {
    // Strip nested HTML, collapse whitespace
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text && text.length > 3 && !/^https?:/.test(text)) return text;
  }
  // Fallback: slug-based guess from URL
  const slugMatch = url.match(/\/(?:jobs?|view)\/([\w-]+)/i);
  if (slugMatch) return slugMatch[1].replace(/[-_]/g, ' ');
  return '(unknown)';
}

// Identify the platform (used for source attribution) from a URL.
export function platformOf(url) {
  if (/linkedin\.com/i.test(url)) return 'LinkedIn';
  if (/indeed\.com/i.test(url)) return 'Indeed';
  if (/glassdoor\.com/i.test(url)) return 'Glassdoor';
  if (/ziprecruiter\.com/i.test(url)) return 'ZipRecruiter';
  if (/builtin/i.test(url)) return 'BuiltIn';
  if (/wellfound|angel\.co/i.test(url)) return 'Wellfound';
  if (/otta\.com/i.test(url)) return 'Otta';
  if (/welcometothejungle/i.test(url)) return 'WelcomeToTheJungle';
  if (/mediabistro/i.test(url)) return 'Mediabistro';
  if (/workingincontent/i.test(url)) return 'WorkingInContent';
  if (/prsa\.org/i.test(url)) return 'PRSA';
  if (/ragan/i.test(url)) return 'Ragan';
  if (/iabc\.com/i.test(url)) return 'IABC';
  if (/journalismjobs\.com/i.test(url)) return 'JournalismJobs';
  if (/marketinghire/i.test(url)) return 'MarketingHire';
  if (/comnetwork\.org/i.test(url)) return 'ComNetwork';
  if (/idealist\.org/i.test(url)) return 'Idealist';
  if (/upwork\.com/i.test(url)) return 'Upwork';
  if (/fiverr\.com/i.test(url)) return 'Fiverr';
  if (/contra\.com/i.test(url)) return 'Contra';
  if (/freelancer\.com/i.test(url)) return 'Freelancer';
  if (/greenhouse|ashbyhq|lever|workable|amazon\.jobs|workdayjobs/i.test(url)) return 'ATS';
  return 'email';
}

// ── Title filter (email variant — softer than scan.mjs/scan-rss.mjs) ──
//
// Email alerts make the title unreliable: anchor text is often generic
// ("View job", "Apply now"), tracking redirects mask the real title, and
// HTML-table layouts split the role title across multiple cells. The
// downstream batch evaluator fetches the real JD via WebFetch + Playwright,
// so we trust the URL+sender combo here and only apply NEGATIVE matches
// (junior/intern/etc.) as a fast reject. Positive title-pattern filtering
// happens at evaluation time, not ingestion time.
export function buildTitleFilter(titleFilter) {
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());
  return (title) => {
    const lower = (title || '').toLowerCase();
    const hasNegative = negative.some(k => lower.includes(k));
    return !hasNegative;
  };
}

// ── LinkedIn redirect resolver (network I/O) ───────────────────────

// Follow a LinkedIn shortener / post URL and return any ATS-style URLs
// found at the destination. For lnkd.in shorteners this is just an HTTP
// redirect chain — we GET and check res.url. For post URLs we attempt to
// fetch the public-rendered HTML (works for some posts; LinkedIn auth-walls
// many) and pattern-match against ATS hosts in the body. Failures return
// an empty array silently — the post URL stays in the email and the user
// can inspect manually if needed.
export async function expandLinkedInUrl(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);

    const finalUrl = res.url || url;
    const found = new Set();
    let html = '';

    // Case 1: redirect resolved directly to an ATS URL (most common for lnkd.in)
    if (JOB_URL_PATTERNS.some(p => p.test(finalUrl))) {
      found.add(canonicalize(finalUrl));
    }

    // Case 2: page body contains ATS URLs (LinkedIn post that embeds links)
    if (res.ok) {
      html = await res.text();
      for (const pattern of JOB_URL_PATTERNS) {
        const re = new RegExp(pattern.source, 'gi');
        for (const m of html.matchAll(re)) {
          found.add(canonicalize(m[0]));
        }
      }
    }
    // Return richer shape so callers can also run curator-mention
    // extraction on the page body HTML (e.g., parsing "Role @ Company"
    // lists out of a public LinkedIn post that we successfully fetched).
    return { urls: [...found], html };
  } catch {
    return { urls: [], html: '' };
  }
}

// ── portals.yml tracked-company lookup (cached) ────────────────────

let _portalsCompanyCache = null;
export function isCompanyTracked(companyName) {
  if (_portalsCompanyCache === null) {
    try {
      const raw = readFileSync(PORTALS_PATH, 'utf-8');
      const cfg = parseYaml(raw);
      _portalsCompanyCache = (cfg.tracked_companies || [])
        .filter(c => c.enabled !== false)
        .map(c => (c.name || '').toLowerCase());
    } catch { _portalsCompanyCache = []; }
  }
  const target = companyName.toLowerCase().trim();
  return _portalsCompanyCache.some(name =>
    name === target || name.includes(target) || target.includes(name)
  );
}

// ── Persistence — dedup + writers ──────────────────────────────────

export function loadSeenUrls() {
  const seen = new Set();
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const m of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(m[1]);
    }
  }
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const m of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(m[0]);
    }
  }
  return seen;
}

export function appendToPipeline(offers) {
  if (offers.length === 0) return;
  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title} | ${new Date().toISOString().slice(0, 10)}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;
    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title} | ${new Date().toISOString().slice(0, 10)}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }
  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

export function appendToScanHistory(offers, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

function escapeMd(s) {
  return (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// Append curator mentions to data/curator-mentions.md. Idempotent —
// existing rows with same (date, curator, company, role) are deduped.
export function appendCuratorMentions(curator, mentions, date, postUrl) {
  if (mentions.length === 0) return;

  // Read existing log to dedup
  let existing = '';
  if (existsSync(CURATOR_LOG_PATH)) {
    existing = readFileSync(CURATOR_LOG_PATH, 'utf-8');
  } else {
    existing = `# Curator Mentions Log\n\nAppend-only record of "Role @ Company" pairs surfaced from LinkedIn-style alert emails (Noah Greenberg, Leah Rosenfeld's #commsjobs, etc.). Companies marked NOT-TRACKED need to be added to portals.yml for full scanning coverage. Comp and URL columns populated when the curator's post format includes them inline.\n\n| Date | Curator | Company | Role | Comp | Tracked? | Direct URL | Source post |\n|------|---------|---------|------|------|----------|------------|-------------|\n`;
  }

  const lines = [];
  for (const m of mentions) {
    const tracked = isCompanyTracked(m.company);
    const key = `| ${date} | ${escapeMd(curator)} | ${escapeMd(m.company)} | ${escapeMd(m.role)} |`;
    if (existing.includes(key)) continue;  // dedupe
    const trackedCell = tracked ? '✅ tracked' : '⚠️ **not tracked — add to portals.yml**';
    const compCell = m.comp ? escapeMd(m.comp) : '—';
    const directUrlCell = m.url ? `[apply](${m.url})` : '—';
    const sourceCell = postUrl ? `[link](${postUrl})` : '—';
    lines.push(`${key} ${compCell} | ${trackedCell} | ${directUrlCell} | ${sourceCell} |`);
  }
  if (lines.length === 0) return;
  appendFileSync(CURATOR_LOG_PATH, lines.join('\n') + '\n');
}

// ── Process one alert end-to-end ───────────────────────────────────

// Take one parsed message ({ uid, subject, from, body }), apply the
// full ingestion pipeline (extract direct URLs, follow LinkedIn
// redirects, parse curator mentions, apply title filter, dedup), and
// return:
//   { offers: [...], curatorMentions, curatorUntracked, urls, filtered,
//     dupes, expanded }
//
// Side effects: appends curator mentions to data/curator-mentions.md
// (when present). Caller is responsible for appendToPipeline +
// appendToScanHistory + URL resolution.
//
// `seenUrls` is mutated — newly-added URLs are added to the set so
// subsequent calls in the same batch dedupe against them.
export async function processAlert(alert, { seenUrls, titleFilter, date }) {
  const result = {
    offers: [],
    curatorMentions: 0,
    curatorUntracked: 0,
    urls: 0,
    filtered: 0,
    dupes: 0,
    expanded: 0,
  };

  // 1) directly-extractable job URLs from the email
  const directUrls = extractJobUrls(alert.body);

  // 2) LinkedIn redirect / post URLs that hide the real ATS URL — follow
  //    them and pull out the underlying job links.
  const linkedinUrls = extractLinkedInRedirectUrls(alert.body);
  const expandedUrls = [];
  let postBodyHtml = '';
  for (const li of linkedinUrls) {
    const r = await expandLinkedInUrl(li);
    if (r && Array.isArray(r.urls)) {
      if (r.urls.length > 0) result.expanded += 1;
      expandedUrls.push(...r.urls);
      if (r.html) postBodyHtml += r.html;
    }
  }

  // 3a) Glassdoor: subject-line signal extraction. Body URLs are 403-blocked
  //     (see JOB_URL_PATTERNS Glassdoor comment), so we mine the subject and
  //     route the {company, role} pair through the same curator-mentions log.
  if (GLASSDOOR_SENDER_RE.test(alert.from || '')) {
    const signal = extractGlassdoorSubjectSignal(alert.subject || '');
    if (signal) {
      const mention = {
        role: signal.role || '(role not specified)',
        company: signal.company,
        comp: '',
        url: '',
      };
      appendCuratorMentions('Glassdoor', [mention], date, '');
      result.curatorMentions += 1;
      if (!isCompanyTracked(signal.company)) result.curatorUntracked += 1;
    }
  }

  // 3) curator-style "Role @ Company" mention lists
  const isCuratorEmail = CURATOR_SENDERS.some(re => re.test(alert.from || ''))
    || CURATOR_SENDERS.some(re => re.test(alert.subject || ''))
    || linkedinUrls.length > 0;
  if (isCuratorEmail) {
    const mentions = [
      ...extractCuratorMentions(alert.body),
      ...extractCuratorMentions(postBodyHtml),
    ];
    const seenMention = new Set();
    const unique = mentions.filter(m => {
      const k = `${m.company.toLowerCase()}::${m.role.toLowerCase()}`;
      if (seenMention.has(k)) return false;
      seenMention.add(k);
      return true;
    });
    if (unique.length > 0) {
      const curatorName = (alert.from || '').replace(/.*<|>.*/g, '').split('@')[0] || 'unknown';
      const postUrl = linkedinUrls[0] || '';
      appendCuratorMentions(curatorName, unique, date, postUrl);
      result.curatorMentions += unique.length;
      for (const m of unique) {
        if (!isCompanyTracked(m.company)) result.curatorUntracked += 1;
      }
    }
  }

  const allUrls = [...new Set([...directUrls, ...expandedUrls])];
  result.urls += allUrls.length;

  for (const url of allUrls) {
    const title = extractTitleNear(alert.body, url);
    if (!titleFilter(title)) {
      result.filtered += 1;
      continue;
    }
    if (seenUrls.has(url)) {
      result.dupes += 1;
      continue;
    }
    seenUrls.add(url);
    result.offers.push({
      title,
      url,
      company: '(from email)',
      location: '',
      source: platformOf(url),
    });
  }

  return result;
}
