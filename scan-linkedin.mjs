#!/usr/bin/env node
/**
 * scan-linkedin.mjs — THE single LinkedIn scanner. One file, one command.
 *
 * Replaces the old multi-script LinkedIn setup (scan-linkedin-jobspy + -guest +
 * -rescue + -all + resolve-linkedin-guest), which raced on shared files and lost
 * jobs to jobspy 429 throttling. This is account-free, cookie-free, no-login, and
 * does the WHOLE LinkedIn pipeline in a single pass:
 *
 *   1. DISCOVER — wide title × location matrix via the public guest API
 *                 (/jobs-guest/.../seeMoreJobPostings/search) — no throttle fragility
 *   2. TITLE-FILTER — cheap entry-level SWE/MLE + visa/defense/blocklist gates
 *   3. JD GATE — fetch each survivor's FULL JD (guest jobPosting endpoint) and apply
 *                exp/visa hard filters + drop already-closed postings
 *   4. WRITE — pipeline.md (LinkedIn URL), scan-history.tsv (dedup)
 *
 * Apply-URL recovery (reverse-resolving the real ATS front door) was MOVED OUT to
 * resolve-apply-url.mjs (2026-06-14) — it's an apply-time concern. Running it for every
 * kept job cost ~30 ATS probes + a DuckDuckGo search each, ~95% of them never applied to.
 * Call resolve-apply-url.mjs lazily only for the roles actually pursued.
 *
 * NEVER touches the user's LinkedIn account (no li_at, no ban risk).
 *
 * Usage:
 *   node scan-linkedin.mjs            # past 24h, full matrix
 *   node scan-linkedin.mjs --week     # past 7 days
 *   node scan-linkedin.mjs --dry-run  # discover + gate + classify, write nothing
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve data paths against the script dir, not cwd — a bare 'data/...' path reads
// an empty blocklist/history (→ dup writes, ignored blocklist) when run from elsewhere.
const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOCKFILE = join(__dirname, 'data', 'blocked-companies.txt');
const HISTORY   = join(__dirname, 'data', 'scan-history.tsv');
const PIPELINE  = join(__dirname, 'data', 'pipeline.md');
mkdirSync(join(__dirname, 'data'), { recursive: true });  // ensure data/ exists on a fresh clone before any append
const clean = (s) => String(s ?? '').replace(/[|\t\r\n]+/g, ' ').trim();

const WEEK = process.argv.includes('--week');
const DRY = process.argv.includes('--dry-run');
const FRESH_HOURS = WEEK ? 168 : 24;            // 24h HARD gate (user pref, 2026-06-14)
const f_TPR = WEEK ? 'r604800' : 'r86400';      // r86400 = 24h
// LinkedIn structured experience-level facet: 2 = Entry level (1=Internship, 3=Associate).
// This is the real lever for guest-API recall: a NARROW keyword string ("software engineer
// entry level") only matches ~118 jobs/7d, but a BROAD root ("software engineer") + f_E=2
// surfaces ~394/7d (3.3x) — verified 2026-06-14. Account-free, no li_at, no ban risk.
const f_E = '2,3';
// Three discovery passes per title×location. Verified 2026-06-15:
//  1. base entry/associate (f_E=2,3).
//  2. Easy-Apply-only (f_E=2,3 + f_AL=true) — ~90% of its page-0 is DISTINCT from base;
//     feed includes Easy-Apply by default, this surfaces the tail below the base cut. Tagged.
//  3. NO f_E ([all-exp]) — catches roles LinkedIn left experience-untagged (esp. startups),
//     which the f_E facet EXCLUDES entirely (verified: f_E page-0 disjoint from no-f_E page-0).
//     Title NEG + the full-JD exp gate screen out seniors that this pass pulls in.
// Dropped the old f_WT/f_JT slices (only help at the ~1000 cap, never reached in 24h).
// byId dedups across passes + locations, so overlap is free.
// Dedicated f_AL=true (easy-apply) pass DROPPED 2026-06-15 — benchmark-verified it's
// redundant for RECALL: the feed includes Easy-Apply by default, so those jobs already
// arrive via the two passes below; the dedicated pass only added the [easy-apply] tag at
// the cost of ~1/3 of all discovery requests. Net: same jobs, ~1/3 faster, tag dropped.
const PASSES = [
  { q: `f_E=${f_E}`, tag: '' },     // entry + associate (keeps the ~370 cap focused on entry)
  { q: '', tag: ' [all-exp]' },     // no f_E: catches experience-untagged roles (startups)
];
// Page size is 10 (verified 2026-06-15: start=0 and start=10 share ZERO ids). The loop
// MUST step by PAGE — the old `start += 25` skipped offsets 10-24, 35-49, … i.e. ~60% of
// every query (start=0,25 union=20 distinct vs start=0,10,20 union=29). The guest API
// paginates cleanly to start=975 (~370 distinct for a broad query); the loop breaks on the
// first empty page (verified: no transient mid-result empties), so sparse 24h queries stop
// fast. Depth capped at 300 (was 1000): the broad national no-f_E queries paged ~90s EACH at
// depth-1000 and that was the main time-bomb; ~370 is the realistic ceiling so 300 catches the
// bulk, and the thin tail is re-caught by the next scan (user scans 3-4x/day). LI_MAX_RESULTS overrides.
const PAGE = 10;
const PER_QUERY_MAX = Number(process.env.LI_MAX_RESULTS) || 300;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DISCOVER_MS = 900;   // pacing between guest search pages (429-avoidance)
const JD_MS = 350;         // pacing between full-JD fetches

// ── target matrix: BROAD role roots × major US tech hubs (user is US-wide relocation-OK) ──
// Seniority narrowing is done by LinkedIn's f_E=2 facet (above), NOT the keyword string.
// The old narrow phrases ("software engineer new grad", "...entry level", "junior...",
// "associate...", "graduate...", "...i") all collapse into these broad roots + f_E=2,
// which 3.3x's the distinct entry-level pool. NEG + the JD exp-gate stay as backstops.
const TITLES = ['software engineer', 'software developer', 'software development engineer',
  'machine learning engineer', 'ai engineer', 'backend engineer', 'full stack engineer',
  'frontend engineer', 'data engineer', 'platform engineer', 'data scientist',
  'research engineer', 'applied scientist', 'member of technical staff',
  // added 2026-06-15 (item 3) — adjacent roles the matrix was missing; ROLE below extended to match
  'devops engineer', 'site reliability engineer', 'infrastructure engineer',
  'solutions engineer', 'forward deployed engineer'];
const LOCATIONS = ['United States', 'New York, United States', 'New Jersey, United States',
  'San Francisco Bay Area', 'Seattle, Washington, United States', 'Austin, Texas, United States',
  'Boston, Massachusetts, United States', 'Los Angeles, California, United States',
  'Chicago, Illinois, United States', 'Denver, Colorado, United States',
  // added 2026-06-15 (item 4) — remote-US is already covered by the national "United States" query
  'Washington, District of Columbia, United States', 'Atlanta, Georgia, United States',
  'San Diego, California, United States', 'Raleigh-Durham, North Carolina, United States'];

// ── cheap title filters ──
const ROLE = /\b(software engineer|software developer|software development engineer|swe|sde|machine learning engineer|ml engineer|ai engineer|applied ai|applied scientist|research engineer|research scientist|data scientist|member of technical staff|backend|front end|frontend|full stack|fullstack|full-stack|platform engineer|data engineer|llm|devops|dev ops|sre|site reliability|infrastructure engineer|solutions engineer|forward deployed|forward-deployed)\b/i;
const ENTRY = /\b(new grad|new-grad|university grad|early career|entry[- ]level|junior|jr|associate|graduate|2026|level 1|engineer i\b|engineer 1\b)\b/i;
const NEG = /(\bsenior\b|\bsr\b|\bstaff\b|\bprincipal\b|\blead\b|\bmanager\b|\bdirector\b|\bvp\b|\bii\b|\biii\b|\bfounding\b|engineer ii|engineer iii|5\+|3\+ years|clearance|secret|citizen)/i;
const NONSWE = /(nurse|physician|practitioner|recruit|consultant|mechanical|electrical|civil|sales|designer|hardware|firmware)/i;
const INTERN = /\b(intern|internship|co-op|coop)\b/i;
// Internships are dropped UNLESS they target the current or next summer. Year is derived at
// runtime so the gate never goes stale (was hardcoded "summer 2026").
const _NOW_YEAR = new Date().getFullYear();
const SUMMER_OK = new RegExp(`summer (${_NOW_YEAR}|${_NOW_YEAR + 1})`, 'i');
const BLOCKED = /\b(fiserv|sigma|veeva|dropbox|synergisticit|vaco|spacex|tiktok|bytedance|gitlab|booz|raytheon|boeing|lockheed|leidos|saic|anduril|honeywell|aerospace|defense|northrop|general dynamics|hackajob|mygwork|jobright|dice|chaos industries|fusion technology|rividium|technomile|prescient edge|amentum|two six|captivation|devtechnology)\b|\b(radar|effector|munition|missile|itar)\b/i;
const _BLOCK = existsSync(BLOCKFILE) ? readFileSync(BLOCKFILE, 'utf8').split('\n').map(s => s.trim().toLowerCase()).filter(s => s && !s.startsWith('#')) : [];
const inBlockfile = s => { const x = (s || '').toLowerCase(); return _BLOCK.some(t => x.includes(t)); };

// ── JD-gate hard filters (full description) ──
const EXP_DISQUALIFY = [
  /\b([3-9]|\d{2,})\+?\s*years?\s+(of\s+)?(professional\s+)?(software|industry|relevant|work|engineering)/i,
  /minimum\s+([3-9]|\d{2,})\s*years?/i,
  /at\s+least\s+([3-9]|\d{2,})\s*years?/i,
  /([3-9]|\d{2,})\+\s*yrs?\b/i,
  // General "N years … experience" in either order — catches "5+ years experience
  // required", "10+ years of experience", "requires 8 years experience" that the
  // narrow keyword clause above misses. The ≤30-char experience-context guard
  // avoids matching benign phrases like "over the next 3 years you'll grow".
  /\b([3-9]|\d{2,})\s*\+?\s*years?\b[^.]{0,30}\b(experience|exp|required|minimum|background)\b/i,
  /\b(experience|background)\b[^.]{0,30}\b([3-9]|\d{2,})\s*\+?\s*years?/i,
];
// Bounded so a negation must sit in the SAME sentence as "sponsor" ([^.] never crosses a
// period). The old /no.*visa.*sponsorship/ was greedy across the whole JD — any earlier
// "No" ("No prior experience") + "visa sponsorship" later wrongly filtered roles that
// OFFER sponsorship (the exact ones an F-1 candidate wants). Verified 2026-06-14.
const VISA_DISQUALIFY = [
  /\bauthorized to work\b[^.]{0,40}\bwithout\b[^.]{0,20}\bsponsor/i,
  /\b(no|not|never|cannot|can'?t|unable to|do(?:es)? not|will not|won'?t|not able to)\b[^.]{0,30}\bsponsor/i,
  /\bsponsorship\b[^.]{0,25}\b(not available|not offered|not provided|is not|unavailable)/i,
  /\bmust be\b[^.]{0,20}\bus citizen/i, /\bus citizenship required/i,
  /\bsecret clearance\b/i, /\bts\/sci\b/i, /\bsecurity clearance required\b/i,
];
const CLOSED_RE = /no longer accepting applications/i;

// Neutralize entry-eligible year-ranges and company self-tenure BEFORE the EXP test, so
// "0-3 years", "1-3 years", "up to 3 years", and "our founders have 8 years" don't trip the
// 3+yr knockout. The old gate matched the TOP of a range ("3 years…experience") and silently
// dropped genuine new-grad roles. Real minimums ("5+ years", "minimum 4 years") survive.
const prepExp = (jd) => (jd || '')
  .replace(/\b[0-2]\s*(?:-|–|—|to)\s*\d+\s*\+?\s*(?:years?|yrs?)/gi, ' ENTRYRANGE ')
  .replace(/\bup\s*to\s*\d+\s*\+?\s*(?:years?|yrs?)/gi, ' ENTRYRANGE ')
  .replace(/\b(found(?:ed|ers?|ing)|in business|operating|we'?ve been|team has|company (?:has|with|of)|history of|track record of|over the (?:past|last))\b[^.]{0,30}?\d+\s*\+?\s*(?:years?|yrs?)/gi, ' TEAMTENURE ');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();

// 12s per-request timeout via AbortController — without it a single dead connection hangs
// the whole scan forever (observed 2026-06-15: a stalled JD fetch froze a run for 46 min).
async function fetchText(url, opts = {}) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) }, method: opts.method || 'GET', body: opts.body, signal: ac.signal });
    if (r.status === 429) return { code: 429 };
    if (!r.ok) return { code: r.status };
    return { code: 200, body: await r.text() };
  } catch (e) { return { err: e.message }; }
  finally { clearTimeout(to); }
}

// (apply-URL recovery helpers moved to resolve-apply-url.mjs — run lazily at apply-time)

// ── dedup sources (LinkedIn job id) ──
const seen = new Set();
for (const p of [HISTORY, PIPELINE]) {
  if (!existsSync(p)) continue;
  for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/jobs\/view\/(\d+)/); if (m) seen.add(m[1]); }
}

function parseCards(html) {
  const out = [];
  for (const b of html.split(/<li>/i).slice(1)) {
    const url = (b.match(/href="(https:\/\/www\.linkedin\.com\/jobs\/view\/[^"?]+)/) || [])[1]; if (!url) continue;
    const id = (url.match(/-(\d+)$/) || [])[1]; if (!id) continue;
    const title = strip((b.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/i) || [])[1]);
    const company = strip((b.match(/hidden-nested-link[^>]*>([\s\S]*?)<\/a>/i) || [])[1]);
    const loc = strip((b.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
    const date = (b.match(/datetime="([^"]+)"/) || [])[1] || '';
    out.push({ id, title, company, loc, date, url: 'https://www.linkedin.com/jobs/view/' + id });
  }
  return out;
}

// ── 1+2: DISCOVER + cheap title filter ──
const cutoff = Date.now() - FRESH_HOURS * 3600 * 1000;
const candidates = [], byId = new Set();
let fetched = 0, throttles = 0;
console.log(`LinkedIn Scan (one-pass, account-free) — past ${FRESH_HOURS}h — ${TITLES.length} titles × ${LOCATIONS.length} locations × ${PASSES.length} passes (entry + all-exp), 10/page step, depth ${PER_QUERY_MAX}\n`);
for (const title of TITLES) {
  process.stdout.write(`  · ${title} …`);
  const before = candidates.length;
  for (const location of LOCATIONS) {
    for (const pass of PASSES) {
    for (let start = 0; start < PER_QUERY_MAX; start += PAGE) {
      const u = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(title)}&location=${encodeURIComponent(location)}&f_TPR=${f_TPR}${pass.q ? '&' + pass.q : ''}&start=${start}`;
      // Retry a throttled page with exponential backoff + jitter instead of dropping
      // it — a 429 used to silently lose a whole page of jobs (13 in one run).
      let r, attempt = 0;
      do {
        r = await fetchText(u, { headers: { Accept: 'text/html' } });
        if (r.code !== 429) break;
        throttles++;
        await sleep(2000 * 2 ** attempt + Math.floor(Math.random() * 1000)); // 2s,4s,8s +jitter
      } while (++attempt <= 3);
      if (r.code === 429) break;          // still throttled after retries — move to next query
      if (r.code !== 200 || !r.body) break;
      fetched++;
      const cards = parseCards(r.body);
      if (!cards.length) break;
      for (const c of cards) {
        if (byId.has(c.id)) continue; byId.add(c.id);
        if (seen.has(c.id)) continue;
        if (!ROLE.test(c.title) || NONSWE.test(c.title)) continue;
        // f_E=2 already constrains LinkedIn to entry-level, so DON'T also require an
        // entry keyword in the title (that re-creates the narrow-match bottleneck and
        // drops plain "Software Engineer" new-grad roles). Keep NEG to catch the
        // senior/staff/II/III roles LinkedIn occasionally mis-tags; the full JD
        // exp-gate (EXP_DISQUALIFY) below is the real backstop for "3+ years".
        if (NEG.test(c.title)) continue;
        if (INTERN.test(c.title) && !SUMMER_OK.test(c.title)) continue;
        if (BLOCKED.test(c.company) || BLOCKED.test(c.title) || inBlockfile(c.company) || inBlockfile(c.title)) continue;
        if (c.date && Date.parse(c.date) && Date.parse(c.date) < cutoff) continue;
        c.tag = pass.tag;
        candidates.push(c);
      }
      await sleep(DISCOVER_MS);
    }
    }
  }
  console.log(` +${candidates.length - before} new`);
}

// ── 3: JD gate (apply-URL recovery moved to apply-time → resolve-apply-url.mjs) ──
const kept = [];
let jdClosed = 0, jdFiltered = 0, jdUnread = 0;
console.log(`\nJD gate — ${candidates.length} title-survivors (full JD via guest, no login)…`);
for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  if (i > 0) await sleep(JD_MS);
  // Retry the JD fetch on 429 with backoff (same as the discover loop). Without this, a
  // throttled JD fetch passed the job through UNGATED — leaking 3+yr / no-sponsor roles
  // whenever LinkedIn rate-limited the JD endpoint.
  let r, attempt = 0;
  do {
    r = await fetchText(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${c.id}`);
    if (r.code !== 429) break;
    throttles++;
    await sleep(2000 * 2 ** attempt + Math.floor(Math.random() * 1000));
  } while (++attempt <= 3);
  if (r.code !== 200 || !r.body) { jdUnread++; c.applyUrl = c.url; kept.push(c); continue; }
  if (CLOSED_RE.test(r.body)) { jdClosed++; continue; }
  // Fall back to the full page body if the markup container didn't parse — otherwise
  // a JD whose container class differs silently bypasses BOTH exp and visa filters
  // (the gate's whole purpose), leaking 3+yr / no-sponsorship roles to the user.
  const jd = strip((r.body.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '') || strip(r.body);
  if (jd && (EXP_DISQUALIFY.some(re => re.test(prepExp(jd))) || VISA_DISQUALIFY.some(re => re.test(jd)))) {
    jdFiltered++; console.log(`  - JD-filtered: ${c.company} | ${c.title}`); continue;
  }
  // Keep the LinkedIn URL as-is. The real front-door apply URL is recovered LAZILY at
  // apply-time (resolve-apply-url.mjs) only for the few roles actually pursued — doing it
  // here cost ~30 ATS probes + a DuckDuckGo search PER job, ~95% of which never get applied to.
  c.applyUrl = c.url;
  kept.push(c);
}
console.log(`JD gate: ${jdClosed} closed-dropped, ${jdFiltered} visa/exp-filtered, ${jdUnread} unreadable(passed)`);

// ── 5: WRITE ──
const today = new Date().toISOString().slice(0, 10);
let added = 0;
if (!DRY) {
  for (const c of kept) {
    appendFileSync(PIPELINE, `\n- [ ] ${c.applyUrl} | ${clean(c.company)} | ${clean(c.title)} | ${clean(c.loc)} [linkedin]${c.tag || ''}`);
    appendFileSync(HISTORY, `${c.url}\t${today}\tlinkedin\t${clean(c.title)}\t${clean(c.company)}\tadded\t${clean(c.loc)}\n`);
    added++;
  }
}

console.log(`\nPages fetched: ${fetched} | 429 throttles: ${throttles}`);
console.log(`${DRY ? 'Would add' : 'Net-new added'}: ${DRY ? kept.length : added}\n`);
for (const c of kept.slice(0, 60)) console.log(`  + ${c.company} | ${c.title} | ${c.loc} [linkedin]${c.tag || ''}`);
console.log(added || DRY ? '\n→ run check-applied.mjs then /career-ops pipeline to evaluate' : '\n→ nothing net-new this pass');

// Force a clean exit: global fetch (undici) keeps connections pooled with
// keep-alive, which holds Node's event loop open for ~seconds after work is done.
// Without this the process lingers and any parent `wait` never returns (no
// completion signal). All writes above are synchronous, so exiting here is safe.
process.exit(0);
