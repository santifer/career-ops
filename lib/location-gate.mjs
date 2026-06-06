/**
 * lib/location-gate.mjs — JD-body-aware location gate for Patrick's HARD location policy.
 *
 * WHY THIS EXISTS: the old auto-pipeline locationGate() only looked at the job TITLE,
 * and naive ATS checks trust the Ashby `isRemote` flag. Both miss in-office mandates
 * buried in the JD body. On 2026-06-04 two Replit roles returned isRemote:true but the
 * JD said "in-office requirement of Monday, Wednesday, and Friday" (Foster City) — hard
 * SKIPs that a flag-only gate waves through. See memory: reference_ashby_isremote_unreliable.
 *
 * POLICY (modes/_profile.md "Your Location Policy"):
 *   - Remote (US-friendly) ......................... PASS  (score 5.0)
 *   - On-site/hybrid within ~30min of Denver ....... PASS  (score 4.5-5.0)
 *   - On-site/hybrid outside Denver metro .......... SKIP  (score 2.0, hard-blocker)
 *   - Requires relocation (non-CO) or non-US ....... SKIP  (score 1.0, HARD SKIP)
 *   - Multi-location: viable if >=1 option is remote OR Denver-metro.
 *
 * assessLocation() returns { verdict, score, reason }:
 *   verdict 'pass-remote'  -> genuinely remote, US-eligible
 *   verdict 'pass-denver'  -> Denver / CO / Denver-metro on-site OK
 *   verdict 'skip'         -> hard location blocker (non-Denver onsite/hybrid, or non-US)
 *   verdict 'confirm'      -> contradictory/ambiguous metadata; needs human/recruiter confirm
 *                            (do NOT auto-apply; do NOT auto-skip)
 *   verdict 'unknown'      -> no location signal at all; let the LLM eval verify
 *
 * Trust order: JD-body in-office mandate > explicit non-US/city > Denver > remote-in-text
 * > sole non-Denver US city > Hybrid+city. The `isRemote` flag is used ONLY as a weak
 * tiebreaker to soften a city-SKIP to 'confirm' when no in-office mandate is present.
 */

// Denver / Colorado / Denver-metro (≤30min per _profile.md) — explicit YES for on-site.
const DENVER_METRO = [
  'denver', 'colorado', 'dtc', 'denver tech center', 'aurora', 'centennial',
  'englewood', 'greenwood village', 'highlands ranch', 'lakewood', 'cherry creek',
  'westminster', 'arvada', 'littleton', 'broomfield',
];
const DENVER_RE = new RegExp(`\\b(?:${DENVER_METRO.join('|')})\\b`, 'i');
// ", CO" / "CO 80202" — Colorado as a state abbreviation in a LOCATION string. Deliberately
// NOT bare "\bco\b": JD pay-transparency sections list "Colorado"/"CO" rates and would false-positive.
const CO_RE = /,\s*co\b|\bco\s+\d{5}\b/i;

// Non-US signals (countries / regions / well-known non-US hubs). If these appear in the
// LOCATION field, it's relocation/non-US -> HARD SKIP.
const NON_US = [
  'canada', 'toronto', 'ottawa', 'vancouver', 'montreal', 'united kingdom', '\\buk\\b',
  'london', 'ireland', 'dublin', 'cork', 'germany', 'munich', 'berlin', 'france', 'paris',
  'netherlands', 'amsterdam', 'spain', 'madrid', 'barcelona', 'portugal', 'lisbon',
  'india', 'hyderabad', 'bangalore', 'bengaluru', 'singapore', 'australia', 'sydney',
  'melbourne', 'japan', 'tokyo', 'korea', 'seoul', 'china', 'beijing', 'shanghai',
  'brazil', 'sao paulo', 'mexico', 'mexico city', 'israel', 'tel aviv', 'emea', 'apac',
  'apj', 'latam', 'benelux', 'thailand', 'malaysia', 'hong kong', 'switzerland', 'zurich',
];
const NON_US_RE = new RegExp(`\\b(?:${NON_US.join('|')})\\b`, 'i');

// Non-Denver US cities/states that imply on-site/relocation when they're the sole location.
const NON_DENVER_US = [
  'san francisco', 'sf office', 'bay area', 'foster city', 'palo alto', 'menlo park',
  'mountain view', 'sunnyvale', 'san jose', 'south san francisco', 'new york', 'nyc',
  'brooklyn', 'manhattan', 'seattle', 'bellevue', 'redmond', 'boston', 'cambridge',
  'austin', 'dallas', 'houston', 'chicago', 'atlanta', 'miami', 'los angeles',
  'san diego', 'washington', '\\bd\\.?c\\.?\\b', 'arlington', 'reston', 'pittsburgh',
  'cincinnati', 'indianapolis', 'raleigh', 'charlotte', 'phoenix', 'salt lake city',
  '\\bnj\\b', 'new jersey', 'virginia', 'florida',
];
const NON_DENVER_US_RE = new RegExp(`(?:${NON_DENVER_US.join('|')})`, 'i');
// US-XX- structured location (e.g. "US-CA-Menlo Park"); capture the state.
const US_STATE_RE = /\bUS[-\s]([A-Z]{2})\b/;

// Genuine remote signals — must appear in the JD TEXT or an unambiguous location string,
// NOT merely an isRemote boolean.
const REMOTE_TEXT_RE = new RegExp([
  'fully remote', 'remote[- ]first', 'work from anywhere', 'remote \\(us', 'us[- ]remote',
  'remote, us', 'remote[- ]friendly', 'remote[- ]flexible', 'this role is (?:fully )?remote',
  'can be (?:done|performed|held) (?:fully )?remotely', 'open to remote',
  'remote within the (?:us|united states)', '#li-remote', 'distributed team',
  'does not require (?:regular )?travel',
].join('|'), 'i');

// Explicit in-office MANDATE in the JD body — the strongest signal, overrides isRemote.
const IN_OFFICE_RE = new RegExp([
  'in[- ]office requirement', 'in the office \\d+', 'on-?site \\d+ days?',
  '\\d+ days? (?:a|per) week (?:in|on-?site|in-office|in the office)',
  '(?:one|two|three|four|five) days? (?:a|per) week (?:in|on-?site|in-office)',
  'required to be (?:in[- ]?office|on-?site)', 'must be (?:located|based) in',
  'relocat', 'mondays?,? wednesdays?,? (?:and )?fridays?',
  'hybrid (?:role|position).{0,40}\\d+ days?',
].join('|'), 'i');

/**
 * @param {object} j
 * @param {string} [j.title]
 * @param {string} [j.location]          ATS location string
 * @param {string} [j.workplaceType]     Ashby: 'Remote' | 'Hybrid' | 'Onsite'
 * @param {boolean}[j.isRemote]          Ashby flag (UNRELIABLE — weak signal only)
 * @param {string[]}[j.secondaryLocations]
 * @param {string} [j.text]              JD body (plain text)
 * @returns {{verdict:string, score:number, reason:string}}
 */
export function assessLocation(j = {}) {
  const loc = `${j.location || ''} ${(j.secondaryLocations || []).join(' ')}`.trim();
  const text = j.text || '';
  // Denver signal must come from the LOCATION field, not the JD body — pay-transparency
  // sections list many states (incl. Colorado), which would false-positive against prose.
  const hasDenver = DENVER_RE.test(loc) || CO_RE.test(loc);

  // 1. Explicit in-office mandate in the JD body, not Denver -> HARD SKIP. (Catches Replit.)
  if (IN_OFFICE_RE.test(text) && !hasDenver) {
    const m = text.match(IN_OFFICE_RE);
    return { verdict: 'skip', score: 1.0,
      reason: `JD body mandates on-site/relocation ("${(m && m[0] || '').slice(0, 40)}") at a non-Denver location` };
  }

  // 2. Non-US location -> HARD SKIP (relocation, no remote-US escape in the location).
  if (NON_US_RE.test(loc) && !DENVER_RE.test(loc) && !/\b(?:us|united states)\b/i.test(loc)) {
    // unless the body clearly offers a remote-US option
    if (!/remote.{0,20}(?:us|united states)|us.{0,10}remote/i.test(text)) {
      return { verdict: 'skip', score: 1.0,
        reason: `Location is non-US (${loc}) — relocation off the table` };
    }
  }

  // 3. Denver / CO / Denver-metro in the location -> PASS (on-site OK; multi-loc w/ Denver is viable).
  if (hasDenver) {
    return { verdict: 'pass-denver', score: 4.8, reason: `Denver/CO-metro location (${loc})` };
  }

  // 4. Genuine remote signal in the TEXT (or unambiguous "Remote" location).
  const locIsRemote = /^remote\b/i.test(loc) || /\bremote\b/i.test(loc) && !NON_DENVER_US_RE.test(loc) && !NON_US_RE.test(loc);
  if (REMOTE_TEXT_RE.test(text) || (locIsRemote && /remote/i.test(loc))) {
    if (NON_US_RE.test(loc) && !/\b(?:us|united states)\b/i.test(loc)) {
      return { verdict: 'confirm', score: 3.0, reason: `Remote signal but location is non-US (${loc}) — confirm US-remote eligibility` };
    }
    return { verdict: 'pass-remote', score: 5.0, reason: `Genuine remote (US) signal in JD${loc ? ` (loc: ${loc})` : ''}` };
  }

  // 5. Sole non-Denver US city / US-XX state, no remote signal.
  const stateM = loc.match(US_STATE_RE);
  const isNonDenverUsCity = NON_DENVER_US_RE.test(loc) || (stateM && stateM[1] !== 'CO');
  if (isNonDenverUsCity) {
    // isRemote flag with NO in-office mandate -> soften to 'confirm' (e.g. Abridge: SF Office
    // + isRemote:true + no in-office text + prior remote applications to the same company).
    if (j.isRemote === true && !IN_OFFICE_RE.test(text)) {
      return { verdict: 'confirm', score: 3.5,
        reason: `Non-Denver US city (${loc}) but isRemote=true and no in-office mandate in JD — CONFIRM remote (flag is unreliable)` };
    }
    return { verdict: 'skip', score: 2.0, reason: `On-site/hybrid at a non-Denver US location (${loc}), no remote option` };
  }

  // 6. workplaceType Hybrid with no parseable Denver/remote -> needs confirmation.
  if (/hybrid/i.test(j.workplaceType || '') || /hybrid/i.test(loc)) {
    return { verdict: 'confirm', score: 3.0,
      reason: `Hybrid with no Denver/remote signal (loc: ${loc || '?'}) — confirm there's a Denver or remote option` };
  }

  // 7. No location signal at all — let the LLM eval verify.
  return { verdict: 'unknown', score: 0, reason: 'No location signal in metadata or JD body' };
}

export const PASS_VERDICTS = new Set(['pass-remote', 'pass-denver']);
export const isLocationViable = (r) => PASS_VERDICTS.has(r.verdict) || r.verdict === 'confirm' || r.verdict === 'unknown';

// ── Self-test: real cases from the 2026-06-04 backlog eval ───────────────────
const CASES = [
  { name: 'Replit Vuln Mgmt', in: { location: 'Foster City, CA | Remote', workplaceType: 'Hybrid', isRemote: true, text: 'This is a full-time role that can be held from our Foster City, CA office. The role has an in-office requirement of Monday, Wednesday, and Friday.' }, want: 'skip' },
  { name: 'Replit Staff Infra', in: { location: 'Foster City, CA', workplaceType: 'Hybrid', isRemote: true, text: 'in-office requirement of Monday, Wednesday, and Friday' }, want: 'skip' },
  { name: 'Abridge Enterprise (ambiguous)', in: { location: 'SF Office', workplaceType: 'Hybrid', isRemote: true, secondaryLocations: [], text: 'About Abridge ... founding security team ...' }, want: 'confirm' },
  { name: 'Komodo FDE', in: { location: 'United States', isRemote: undefined, text: 'This role is remote. #LI-Remote. This role does not require regular travel.' }, want: 'pass-remote' },
  { name: 'Supabase ProdSec', in: { location: 'Remote', isRemote: true, text: 'We are a fully remote company with no offices.' }, want: 'pass-remote' },
  { name: 'Cohere Mgr (US|Canada remote)', in: { location: 'United States | Canada', isRemote: false, text: 'Remote-flexible, offices in Toronto, NY, SF, London, Paris.' }, want: 'pass-remote' },
  { name: 'MongoDB ProdSec (Cork)', in: { location: 'Cork', workplaceType: 'Onsite', text: 'Join our Server security team in Cork.' }, want: 'skip' },
  { name: 'Truveta M365 (Hyderabad)', in: { location: 'Hyderabad, India', text: 'Security administration role based in Hyderabad.' }, want: 'skip' },
  { name: 'Anthropic EM (SF|NYC)', in: { location: 'San Francisco, CA | New York City, NY', workplaceType: 'Hybrid', text: 'We expect staff in-office 25% of the time.' }, want: 'skip' },
  { name: 'Snowflake (Menlo Park)', in: { location: 'US-CA-Menlo Park', text: 'Database engineering at our Menlo Park HQ.' }, want: 'skip' },
  { name: 'Databricks FDE (Sydney)', in: { location: 'Sydney, Australia', text: 'Forward Deployed Engineer for ANZ customers.' }, want: 'skip' },
  { name: 'Denver on-site', in: { location: 'Denver, CO', text: 'Hybrid, 2 days a week in our Denver office.' }, want: 'pass-denver' },
  { name: 'Cloudflare bare Hybrid', in: { location: 'Hybrid', workplaceType: 'Hybrid', text: 'Systems Engineer, Data.' }, want: 'confirm' },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  let pass = 0;
  for (const c of CASES) {
    const r = assessLocation(c.in);
    const ok = r.verdict === c.want;
    if (ok) pass++;
    console.log(`${ok ? '✅' : '❌'} ${c.name.padEnd(32)} got=${r.verdict.padEnd(12)} want=${c.want.padEnd(12)} ${ok ? '' : '← MISMATCH'}\n     ${r.reason}`);
  }
  console.log(`\n${pass}/${CASES.length} cases pass`);
  process.exit(pass === CASES.length ? 0 : 1);
}
