#!/usr/bin/env node
/**
 * invite-match.mjs — Interview-Invite / Rejection → Tracker Matcher for career-ops
 *
 * Recruiter calendar/ATS invite emails frequently name only the company
 * (generic subject lines like "Schedule Your Phone Screen") with no job
 * title or req number. Finding which `data/applications.md` row an invite
 * belongs to otherwise means a manual grep every time. Rejection emails —
 * the single most common ATS-generated email — have the exact same problem,
 * and are the more frequent case in practice (#2098).
 *
 * This script extracts a company name (and, if present, a date and a
 * req/job-ID-looking token) from pasted email text, fuzzy-matches it against
 * the tracker's Company column, and ranks candidates when the same company
 * has multiple applications — which is common. A silent wrong guess is worse
 * than showing a short ranked list, so ambiguous input always returns all
 * plausible candidates rather than picking one. The text is also classified
 * as `invite` / `rejection` / `unknown` (see classifyEmail) — informational
 * only, never a gate on matching.
 *
 * Despite the filename, this now recognizes more than interview invites
 * (#2098). Kept as-is rather than renamed: a rename would break any doc or
 * script that already references `invite-match.mjs` (e.g. #1495's own
 * history) — left as a maintainer call, not blocking.
 *
 * Run: node invite-match.mjs < invite.txt          (JSON to stdout)
 *      node invite-match.mjs --file invite.txt
 *      echo "..." | node invite-match.mjs --summary
 *      node invite-match.mjs --apply [--id N]      (rejection-classified matches only; advances status to Rejected)
 *      node invite-match.mjs --self-test
 *
 * Issue #1495, #2098 — github.com/santifer/career-ops
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import { resolveColumns, parseTrackerRow } from './tracker-parse.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');

// --- CLI args ---
const args = process.argv.slice(2);
const summaryMode = args.includes('--summary');
const selfTestMode = args.includes('--self-test');
const fileIdx = args.indexOf('--file');
// Treat a following recognized flag (e.g. `--file --summary`) the same as a
// missing value — otherwise it's silently accepted as the path and produces
// a confusing "file not found: --summary" instead of the clearer error below.
if (fileIdx !== -1 && (args[fileIdx + 1] === undefined || args[fileIdx + 1].startsWith('--'))) {
  console.error('invite-match: --file requires a path argument');
  process.exit(1);
}
const filePathArg = fileIdx !== -1 ? args[fileIdx + 1] : null;

// --apply advances a matched tracker row's status to Rejected — scoped to
// that transition only (see issue #2098). It is deliberately NOT the general
// #1960 "advance to Interview" flag: that issue is unclaimed and unimplemented
// here, so an invite-classified match is never auto-applied by this flag.
const applyMode = args.includes('--apply');
const idIdx = args.indexOf('--id');
if (idIdx !== -1 && (args[idIdx + 1] === undefined || args[idIdx + 1].startsWith('--'))) {
  console.error('invite-match: --id requires a tracker # argument');
  process.exit(1);
}
const idArgRaw = idIdx !== -1 ? args[idIdx + 1] : null;
if (idArgRaw !== null && !/^\d+$/.test(idArgRaw)) {
  console.error('invite-match: --id must be a tracker # (integer)');
  process.exit(1);
}
const idArg = idArgRaw !== null ? parseInt(idArgRaw, 10) : null;

// Statuses ranked above others when disambiguating same-company candidates —
// an active application is a far more likely invite match than one already
// rejected or discarded, even if the rejected row is textually a closer date.
const STATUS_PRIORITY = {
  interview: 0,
  responded: 1,
  applied: 2,
  evaluated: 3,
  offer: 4,
  rejected: 5,
  discarded: 6,
  skip: 7,
};

function normalizeStatusKey(status) {
  return String(status ?? '')
    .replace(/\*\*/g, '')
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '')
    .trim()
    .toLowerCase();
}

// True legal-entity suffixes, stripped repeatedly (chained) since a name can
// legitimately carry more than one ("Acme Holdings Inc." → "acme holdings").
// These are unambiguous enough that removing several in a row is safe.
const LEGAL_SUFFIXES = [
  'incorporated', 'inc', 'corporation', 'corp', 'company', 'co',
  'limited', 'ltd', 'llc', 'llp', 'lp', 'plc',
];

// Generic business-descriptor words that vary between how a recruiter signs
// an email and how the tracker recorded the company, but are common enough
// as substantive parts of a name (e.g. "Data Solutions" vs "Data Corp") that
// chaining their removal risks collapsing two different companies to the
// same key. Stripped at most once, and only after legal suffixes are gone —
// never chained with each other or with LEGAL_SUFFIXES.
const GENERIC_DESCRIPTORS = [
  'group', 'holdings', 'technologies', 'technology', 'solutions',
  'canada', 'international',
];

/**
 * Normalize a company name for matching: lowercase, strip punctuation and
 * parentheticals, collapse whitespace, chain-strip trailing legal-entity
 * suffixes (so "Acme Technologies Inc." reduces to "acme technologies"),
 * then strip at most one trailing generic descriptor word. Deliberately
 * stricter than dedup-tracker.mjs's normalizeCompany (which only lowercases
 * and strips punctuation): invite emails quote company names more loosely
 * than tracker rows quote each other, so matching across the two sources
 * needs the extra suffix-stripping that same-source dedup does not.
 *
 * Generic descriptors are deliberately stripped only once (not chained) and
 * only after legal suffixes, so two distinct companies that happen to both
 * end in a generic word (e.g. "Data Solutions" vs "Data Corp") don't
 * collapse to the same "data" key — see issue discussion on PR #1497.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeCompanyName(name) {
  let key = String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      const re = new RegExp(`\\s${suffix}$`);
      if (re.test(key)) {
        key = key.replace(re, '').trim();
        changed = true;
      }
    }
  }

  for (const word of GENERIC_DESCRIPTORS) {
    const re = new RegExp(`\\s${word}$`);
    if (re.test(key)) {
      key = key.replace(re, '').trim();
      break;
    }
  }

  return key;
}

/**
 * Token-overlap similarity between two normalized company-name strings.
 * Returns 1 for an exact match, otherwise the fraction of the shorter name's
 * tokens found in the longer name (order-independent), and 0 when there is
 * no overlap at all. Deliberately simple — this is a "does this look like
 * the same company" check, not a general string-distance metric.
 *
 * @param {string} a - Already-normalized name.
 * @param {string} b - Already-normalized name.
 * @returns {number} 0..1
 */
export function companySimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const tokensA = a.split(' ').filter(Boolean);
  const tokensB = b.split(' ').filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const longerSet = new Set(longer);
  const overlap = shorter.filter(t => longerSet.has(t)).length;
  if (overlap === 0) return 0;

  // Dice coefficient (2 * overlap / total tokens), not overlap/shorter-length:
  // a full-containment match ("acme" inside "acme corp") still scores below
  // an exact match, so when the tracker has both an exact-name row and a
  // longer-name row for the same company, the exact match ranks first.
  return (2 * overlap) / (tokensA.length + tokensB.length);
}

// --- Extract signals from invite text ---

// Matches the first "Company: X" / "at X" / "with X" style line, and falls
// back to the invite subject-style first line otherwise. Invite emails vary
// too much for one regex to be authoritative, so this is a best-effort
// extraction — the fuzzy match against the tracker is what actually decides
// the result, not this heuristic alone.
const COMPANY_LINE_PATTERNS = [
  /(?:^|\n)\s*company\s*[:\-]\s*(.+)/i,
  /interview(?:ing)?\s+(?:with|at)\s+([A-Z][\w.,&' -]{1,60}?)(?:[.,\n]|\s+for\s|\s+regarding\s|$)/i,
  /(?:phone screen|screening|interview)\s*[-–—:]\s*([A-Z][\w.,&' -]{1,60}?)(?:\s+opportunity)?(?:[.,\n]|$)/i,
  /schedule your (?:phone screen|interview)\s*(?:[-–—:]\s*)?([A-Z][\w.,&' -]{1,60}?)\s*opportunity/i,
];

/**
 * Best-effort extraction of the company name from raw invite email text.
 * Tries a handful of common invite phrasings; returns null if nothing
 * plausible is found (caller should surface that to the user rather than
 * guessing further).
 *
 * @param {string} text - Raw pasted invite email text.
 * @returns {string|null}
 */
export function extractCompany(text) {
  if (!text) return null;
  for (const pattern of COMPANY_LINE_PATTERNS) {
    const m = text.match(pattern);
    if (m && m[1]) {
      const candidate = m[1].trim().replace(/[.,;:]+$/, '');
      if (candidate.length >= 2 && candidate.length <= 60) return candidate;
    }
  }
  return null;
}

/**
 * Best-effort extraction of a date mentioned in the invite (interview date,
 * not necessarily the email send date). Only matches unambiguous ISO or
 * "Month D, YYYY" forms — anything else is left for the human to read.
 *
 * @param {string} text
 * @returns {string|null} YYYY-MM-DD or null.
 */
export function extractDate(text) {
  if (!text) return null;
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  const months = 'January|February|March|April|May|June|July|August|September|October|November|December';
  const named = text.match(new RegExp(`\\b(${months})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i'));
  if (named) {
    const monthIdx = new Date(`${named[1]} 1, 2000`).getMonth() + 1;
    const day = String(named[2]).padStart(2, '0');
    const month = String(monthIdx).padStart(2, '0');
    return `${named[3]}-${month}-${day}`;
  }
  return null;
}

/**
 * Best-effort extraction of a req/job-ID-looking token (e.g. "R260013984",
 * "Req 32807", "Job ID: 43683", "JR12352") — present in a minority of
 * invites but a strong disambiguator when it is, since it can be cross-
 * checked against the tracker's notes column.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function extractReqId(text) {
  if (!text) return null;
  const m = text.match(/\b(?:req(?:uisition)?\.?\s*(?:id)?[:\s#]*|job\s*id[:\s#]*)([A-Z]{0,3}\d{3,10})\b/i)
    || text.match(/\b([A-Z]{1,3}\d{5,10})\b/);
  return m ? m[1] : null;
}

// --- Email-type classification (#2098) ---

// Phrasings that suggest a rejection email. Case-insensitive substring match
// against the raw text — small, documented, and extensible, same discipline
// as COMPANY_LINE_PATTERNS above: this is "does this look like a rejection",
// not an exhaustive NLP classifier. Ordered roughly by how common each
// phrasing is in real ATS-generated rejection templates.
const REJECTION_PHRASES = [
  'unfortunately',
  'not been selected to advance',
  'not been selected',
  'not selected for this position',
  'not selected for this role',
  'will not be moving forward',
  'not be moving forward',
  'not moving forward with your application',
  'not successful',
  'regret to inform',
  'decided not to move forward',
  'decided to move forward with other candidates',
  'pursue other candidates',
  'pursuing other candidates',
  'other candidates whose qualifications',
  'will not be proceeding',
  'unable to offer you',
  'not able to offer you a position',
];

// Phrasings that suggest an interview invite. Mirrors REJECTION_PHRASES for
// the opposite case; extractCompany's own patterns already do the real work
// of the invite path, so this list exists purely for classification.
const INVITE_PHRASES = [
  'schedule your phone screen',
  'schedule your interview',
  'phone screen',
  'interviewing with',
  'interview with',
  'would like to invite you',
  'invite you to interview',
  'next steps in the interview process',
  'move you forward to the next round',
  'like to set up a time',
  'like to set up a call',
  'book a time',
];

/**
 * Classify pasted email text as `invite`, `rejection`, or `unknown`.
 *
 * Informational only — never a gate on matching. An email that mentions both
 * (e.g. a rejection that references an earlier phone screen: "Thank you for
 * interviewing with us. Unfortunately...") is classified `rejection`: that
 * language is the more decisive signal of the two, and it is also the only
 * classification the --apply path acts on (#2098).
 *
 * @param {string} text - Raw pasted email text.
 * @returns {'invite'|'rejection'|'unknown'}
 */
export function classifyEmail(text) {
  if (!text) return 'unknown';
  const lower = text.toLowerCase();
  const isRejection = REJECTION_PHRASES.some(p => lower.includes(p));
  const isInvite = INVITE_PHRASES.some(p => lower.includes(p));
  if (isRejection) return 'rejection';
  if (isInvite) return 'invite';
  return 'unknown';
}

// --- Tracker loading ---
function loadTracker(appsFile = APPS_FILE) {
  if (!existsSync(appsFile)) return [];
  const content = readFileSync(appsFile, 'utf-8');
  const lines = content.split('\n');
  const colmap = resolveColumns(lines);
  const entries = [];
  for (const line of lines) {
    const row = parseTrackerRow(line, colmap);
    if (row) entries.push(row);
  }
  return entries;
}

/**
 * Core matcher: given extracted invite signals and a list of tracker rows,
 * return ranked candidates. Exported so tests can drive it directly against
 * fixture rows without touching the real tracker file.
 *
 * @param {{company: string|null, date: string|null, reqId: string|null}} signals
 * @param {Array<object>} trackerRows - Rows from parseTrackerRow().
 * @returns {Array<object>} Ranked candidates, highest confidence first.
 */
export function matchInvite(signals, trackerRows) {
  if (!signals || !signals.company || !Array.isArray(trackerRows)) return [];

  const targetKey = normalizeCompanyName(signals.company);
  if (!targetKey) return [];

  const scored = [];
  for (const row of trackerRows) {
    const rowKey = normalizeCompanyName(row.company);
    const nameScore = companySimilarity(targetKey, rowKey);
    if (nameScore <= 0) continue;

    let confidence = nameScore;

    // A req/job ID appearing in the row's notes is a near-certain match —
    // boost it above any name-only match (including another exact name
    // match without the req ID). Compared case-insensitively: the invite
    // and the notes may case the same ID differently ("jr12352" vs
    // "JR12352"). matchConfidence is a ranking score, not a probability,
    // so it's intentionally allowed to exceed 1 here.
    if (signals.reqId && row.notes
      && row.notes.toLowerCase().includes(signals.reqId.toLowerCase())) {
      confidence += 0.5;
    }

    // Prefer rows in an active/actionable status over closed-out ones when
    // the same company has multiple tracker entries.
    const statusRank = STATUS_PRIORITY[normalizeStatusKey(row.status)] ?? 8;
    confidence += (7 - Math.min(statusRank, 7)) * 0.01; // tiny tiebreaker, never dominates nameScore

    scored.push({
      appNumber: row.num,
      company: row.company,
      role: row.role,
      status: row.status,
      date: row.date,
      matchConfidence: Math.round(confidence * 1000) / 1000,
    });
  }

  scored.sort((a, b) => b.matchConfidence - a.matchConfidence);
  return scored;
}

/**
 * End-to-end: parse invite text, load the tracker, return ranked candidates
 * plus the signals that were extracted (so the caller/CLI can show what was
 * understood from the email, not just the result).
 *
 * @param {string} text - Raw invite/rejection email text.
 * @param {Array<object>} [trackerRows] - Injectable for tests; defaults to loadTracker().
 * @returns {{signals: object, classification: 'invite'|'rejection'|'unknown', candidates: Array<object>}}
 */
export function analyzeInvite(text, trackerRows = null) {
  const signals = {
    company: extractCompany(text),
    date: extractDate(text),
    reqId: extractReqId(text),
  };
  const rows = trackerRows ?? loadTracker();
  const candidates = matchInvite(signals, rows);
  const classification = classifyEmail(text);
  return { signals, classification, candidates };
}

/**
 * Advance a single tracker row's status to Rejected, reusing set-status.mjs
 * as a subprocess — the canonical, locked, atomic write path (#2098) — rather
 * than duplicating its row-rewrite/locking logic here. set-status.mjs already
 * imports its atomic-write and locking primitives from tracker-utils.mjs.
 *
 * Never call this on an ambiguous match — the CLI layer below is responsible
 * for confirming a single confident candidate (or an explicit --id) before
 * reaching this function.
 *
 * @param {number} appNumber - Tracker # to update (must be unambiguous).
 * @param {{appsFile?: string}} [options] - appsFile overrides CAREER_OPS_TRACKER for the child process (tests only).
 * @returns {object} set-status.mjs's own --json result (or its structured error).
 */
export function applyRejectionStatus(appNumber, options = {}) {
  const scriptPath = join(CAREER_OPS, 'set-status.mjs');
  const env = options.appsFile ? { ...process.env, CAREER_OPS_TRACKER: options.appsFile } : process.env;
  try {
    const out = execFileSync(process.execPath, [scriptPath, String(appNumber), 'Rejected', '--json'], {
      encoding: 'utf-8', env,
    });
    return JSON.parse(out);
  } catch (err) {
    // set-status.mjs writes JSON to stdout even on failure when --json is
    // passed (its failWith/failUsage contract) — prefer that structured
    // payload over a raw exception when it is present and parseable.
    if (err.stdout) {
      try { return JSON.parse(err.stdout); } catch { /* fall through */ }
    }
    return { error: err.message, code: 'apply-failed' };
  }
}

// --- Summary mode ---
function printSummary(result) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  Interview Invite / Rejection Matcher — career-ops');
  console.log(`${'='.repeat(70)}\n`);

  console.log(`  Classification:    ${result.classification}`);
  console.log(`  Extracted company: ${result.signals.company || '(not found)'}`);
  console.log(`  Extracted date:    ${result.signals.date || '(not found)'}`);
  console.log(`  Extracted req ID:  ${result.signals.reqId || '(not found)'}\n`);

  if (!result.signals.company) {
    console.log('  Could not find a company name in the invite text — paste more context or check manually.\n');
    return;
  }

  if (result.candidates.length === 0) {
    console.log('  No matching tracker entries found for this company.\n');
    return;
  }

  console.log('  ' + '#'.padEnd(6) + 'Company'.padEnd(20) + 'Role'.padEnd(34) + 'Status'.padEnd(12) + 'Confidence');
  console.log('  ' + '-'.repeat(88));
  for (const c of result.candidates.slice(0, 5)) {
    console.log(
      '  ' +
      String(c.appNumber).padEnd(6) +
      c.company.substring(0, 18).padEnd(20) +
      c.role.substring(0, 32).padEnd(34) +
      c.status.padEnd(12) +
      String(c.matchConfidence)
    );
  }
  console.log('');
}

// --- Self-test ---
function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const check = (cond, label) => {
    if (cond) { pass += 1; } else { fail += 1; console.error(`  FAIL: ${label}`); }
  };

  // --- normalizeCompanyName ---
  check(normalizeCompanyName('Acme Corp.') === 'acme', 'strips "Corp." suffix');
  check(normalizeCompanyName('Acme Technologies Inc.') === 'acme', 'strips chained suffixes');
  check(normalizeCompanyName('Acme (Example Group)') === 'acme', 'drops parenthetical branding');
  check(normalizeCompanyName('Acme & Co') === normalizeCompanyName('Acme and Co'), '"&" normalizes the same as "and"');
  check(normalizeCompanyName('  ACME   ') === 'acme', 'trims and lowercases whitespace-padded input');

  // --- companySimilarity ---
  check(companySimilarity('acme', 'acme') === 1, 'identical strings score 1');
  check(companySimilarity('acme example', 'acme') > 0.5, 'substring containment scores high');
  check(companySimilarity('acme', 'globex') === 0, 'unrelated names score 0');
  check(companySimilarity('', 'acme') === 0, 'empty string never matches');

  // --- extractCompany ---
  check(extractCompany('Company: Example Industries\nRole: Analyst') === 'Example Industries', 'extracts from "Company:" line');
  check(extractCompany('Schedule Your Phone Screen – Acme Opportunity') === 'Acme', 'extracts from generic "Schedule Your Phone Screen" subject');
  check(extractCompany('Looking forward to interviewing with Example Corp for the role.') === 'Example Corp', 'extracts from "interviewing with X" phrasing');
  check(extractCompany('no company signal here at all') === null, 'returns null when nothing plausible is found');

  // --- extractDate ---
  check(extractDate('Interview scheduled for 2026-07-09 at 4pm') === '2026-07-09', 'extracts ISO date');
  check(extractDate('See you on July 9, 2026') === '2026-07-09', 'extracts named-month date');
  check(extractDate('no date mentioned') === null, 'returns null when no date is present');

  // --- extractReqId ---
  check(extractReqId('Req ID: R260013984') === 'R260013984', 'extracts "Req ID:" token');
  check(extractReqId('Job ID: 43683') === '43683', 'extracts "Job ID:" token');
  check(extractReqId('no id here') === null, 'returns null when no req-like token is present');

  // --- matchInvite (fixture rows, no real tracker data) ---
  const fixtureRows = [
    { num: 101, company: 'Example Industries', role: 'Training Coordinator', status: 'Applied', date: '2026-06-01', notes: 'Req EX9001' },
    { num: 102, company: 'Example Industries', role: 'HR Generalist', status: 'Rejected', date: '2026-05-10', notes: 'Rejected 2026-05-20' },
    { num: 103, company: 'Acme Corp', role: 'Program Coordinator', status: 'Interview', date: '2026-06-15', notes: '' },
    { num: 104, company: 'Globex LLC', role: 'Analyst', status: 'Applied', date: '2026-06-20', notes: '' },
  ];

  const noSignal = matchInvite({ company: null, date: null, reqId: null }, fixtureRows);
  check(noSignal.length === 0, 'no company signal → no candidates');

  const acmeMatch = matchInvite({ company: 'Acme Corp.', date: null, reqId: null }, fixtureRows);
  check(acmeMatch.length === 1 && acmeMatch[0].appNumber === 103, 'matches "Acme Corp." to the Acme Corp tracker row despite suffix punctuation');

  const exampleMatch = matchInvite({ company: 'Example Industries', date: null, reqId: null }, fixtureRows);
  check(exampleMatch.length === 2, 'same company with multiple tracker rows returns all candidates, not just one');
  check(exampleMatch[0].appNumber === 101, 'active (Applied) row ranks above the Rejected row for the same company when name-match is tied');

  const reqBoosted = matchInvite({ company: 'Example Industries', date: null, reqId: 'EX9001' }, fixtureRows);
  check(reqBoosted[0].appNumber === 101 && reqBoosted[0].matchConfidence > exampleMatch[0].matchConfidence, 'a req ID found in notes boosts that candidate\'s confidence');

  const noMatch = matchInvite({ company: 'Totally Unrelated Co', date: null, reqId: null }, fixtureRows);
  check(noMatch.length === 0, 'unrelated company name returns no candidates');

  // --- analyzeInvite (end-to-end with injected rows, no file I/O) ---
  const fullText = 'Schedule Your Phone Screen – Acme Opportunity\nInterview scheduled for 2026-07-09.';
  const result = analyzeInvite(fullText, fixtureRows);
  check(result.signals.company === 'Acme', 'analyzeInvite extracts company end-to-end');
  check(result.signals.date === '2026-07-09', 'analyzeInvite extracts date end-to-end');
  check(result.candidates.length === 1 && result.candidates[0].appNumber === 103, 'analyzeInvite returns the matched candidate end-to-end');
  check(result.classification === 'invite', 'analyzeInvite classifies an invite-phrased email as "invite" (no regression from #2098)');

  // --- classifyEmail (#2098) ---
  check(classifyEmail('Unfortunately, we have decided not to move forward with your application.') === 'rejection', 'detects "decided not to move forward" as rejection');
  check(classifyEmail('Thank you for your interest. We regret to inform you that you have not been selected to advance.') === 'rejection', 'detects "regret to inform" / "not been selected to advance" as rejection');
  check(classifyEmail('After careful consideration, we have decided to move forward with other candidates whose qualifications more closely align with this role.') === 'rejection', 'detects "move forward with other candidates" as rejection');
  check(classifyEmail('We are sorry to inform you that you were not successful in this process.') === 'rejection', 'detects "not successful" as rejection');
  check(classifyEmail('We would like to invite you to schedule your phone screen for next week.') === 'invite', 'detects invite phrasing as "invite"');
  check(classifyEmail('Looking forward to interviewing with you next Tuesday.') === 'invite', 'detects "interviewing with" as "invite"');
  check(classifyEmail('Thanks for your recent purchase, here is your receipt.') === 'unknown', 'unrelated text classifies as "unknown"');
  check(classifyEmail('') === 'unknown', 'empty text classifies as "unknown"');
  check(classifyEmail('Thank you for interviewing with us last week. Unfortunately, we will not be moving forward with your application.') === 'rejection', 'rejection language wins when both invite and rejection phrasing appear (references a past interview)');

  // --- analyzeInvite classification for a rejection email (fixture rows, no file I/O) ---
  const rejectionText = 'Dear Candidate,\n\nCompany: Example Industries\nThank you for applying. Unfortunately, we have decided not to move forward with your application at this time.';
  const rejectionResult = analyzeInvite(rejectionText, fixtureRows);
  check(rejectionResult.classification === 'rejection', 'analyzeInvite classifies a rejection email as "rejection"');
  check(rejectionResult.candidates.length === 2 && rejectionResult.candidates[0].appNumber === 101, 'a rejection email still returns ranked candidates (matching is unaffected by classification), active row ranked first');

  console.log(`\n  invite-match self-test: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

// --- Run (CLI only; guarded so the module is safely importable for tests) ---
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (selfTestMode) {
    runSelfTest();
  } else {
    let text;
    if (filePathArg) {
      if (!existsSync(filePathArg)) {
        console.error(`invite-match: file not found: ${filePathArg}`);
        process.exit(1);
      }
      text = readFileSync(filePathArg, 'utf-8');
    } else {
      text = readFileSync(0, 'utf-8'); // stdin
    }

    const result = analyzeInvite(text);

    if (applyMode) {
      // Scoped strictly to the Rejected transition (#2098) — never applies
      // for an invite/unknown classification, and never for an ambiguous
      // match unless the caller disambiguates with --id.
      if (result.classification !== 'rejection') {
        console.error(`invite-match: --apply only applies the Rejected transition, but this text classified as "${result.classification}" — not applying.`);
        if (summaryMode) printSummary(result); else console.log(JSON.stringify(result, null, 2));
        process.exit(1);
      }

      let target = null;
      if (idArg !== null) {
        target = result.candidates.find(c => c.appNumber === idArg);
        if (!target) {
          console.error(`invite-match: --id ${idArg} is not among the matched candidates — not applying.`);
          if (summaryMode) printSummary(result); else console.log(JSON.stringify(result, null, 2));
          process.exit(2);
        }
      } else if (result.candidates.length === 1) {
        target = result.candidates[0];
      } else if (result.candidates.length === 0) {
        console.error('invite-match: no matching tracker entries found — not applying.');
        if (summaryMode) printSummary(result); else console.log(JSON.stringify(result, null, 2));
        process.exit(2);
      } else {
        console.error(`invite-match: ${result.candidates.length} candidates matched — ambiguous, refusing to auto-apply. Re-run with --id <#> to disambiguate:`);
        for (const c of result.candidates) {
          console.error(`  #${c.appNumber}\t${c.company}\t${c.role}\t${c.status}\t${c.matchConfidence}`);
        }
        process.exit(3);
      }

      const applyResult = applyRejectionStatus(target.appNumber);
      const output = { ...result, applied: applyResult };
      if (summaryMode) {
        printSummary(result);
        console.log(applyResult.error
          ? `  Apply FAILED: ${applyResult.error}\n`
          : `  Applied: #${applyResult.num} ${applyResult.company} — ${applyResult.role}: ${applyResult.oldStatus} → ${applyResult.newStatus}\n`);
      } else {
        console.log(JSON.stringify(output, null, 2));
      }
      process.exit(applyResult.error ? 1 : 0);
    }

    if (summaryMode) {
      printSummary(result);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  }
}
