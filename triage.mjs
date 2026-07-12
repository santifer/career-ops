#!/usr/bin/env node

/**
 * triage.mjs — zero-token first-glance triage of the pending queue (#1729).
 *
 * An unattended `node scan.mjs` (see #1729) quietly piles URLs
 * into data/pipeline.md; a full evaluation of every one costs tokens. This is
 * the cheap layer in between: it judges each `## Pending` row on TITLE and
 * LOCATION alone — the two fields the scanner already wrote — against the
 * targets in config/profile.yml, and writes a grouped shortlist to
 * data/shortlist.md. Pure Node, no network, no LLM: it never opens a URL,
 * never reads a JD, and leaves data/pipeline.md untouched.
 *
 * Buckets (same contract as the triage prompt proposed in #1729):
 *   ## Worth a look — title clearly matches a primary/secondary target AND
 *                     the location fits (remote, or your city/country).
 *   ## Maybe        — partial title match, adjacent-tier match, or a strong
 *                     title whose location is missing or needs relocation.
 *   ## Skip         — title matches no target role. Location alone never
 *                     sends a row here: a wrong-city false negative is far
 *                     more expensive than an extra Maybe row.
 *
 * Widening the net is a profile edit, not a code change: every entry in
 * target_roles.primary and target_roles.archetypes[].name is a match target,
 * so add title variants there (e.g. "Backend Engineer" next to "Software
 * Engineer") to catch more spellings of the same job.
 *
 * Usage:
 *   node triage.mjs [--json]
 *   node scan.mjs --triage        # same pass, chained after a scan
 *
 * Output: data/shortlist.md (derived, rewritten on every successful run —
 * safe to delete). `--json` prints the buckets as JSON for scripting instead
 * of the human summary.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';
import { ROLE_STOPWORDS, BASELINE_TOKENS } from './role-matcher.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = join(CAREER_OPS, 'data/pipeline.md');
const PROFILE_PATH = process.env.CAREER_OPS_PROFILE || join(CAREER_OPS, 'config/profile.yml');
const SHORTLIST_PATH = join(CAREER_OPS, 'data/shortlist.md');

// Same section markers as scan.mjs, so both scripts read the same file the
// same way (legacy Spanish names kept for pipelines created before the rename).
const PENDING_MARKERS = ['## Pending', '## Pendientes'];

// ── Title tokenization ──────────────────────────────────────────────────────
//
// role-matcher.mjs's roleTokens() is tuned for DEDUP (are two rows the same
// opening?) and deliberately drops short broad tokens like "ai"/"ml". For FIT
// (does this title resemble a target the user chose?) those tokens are the
// whole signal in titles like "AI Engineer", so triage has its own tokenizer.
// It shares ROLE_STOPWORDS so seniority/mode/location words never count as
// content in either direction.

// Multi-word specialties collapse to their common short form BEFORE
// tokenization, so "Machine Learning Engineer" and "ML Engineer" (or
// "Front-End" and "Frontend") produce identical tokens.
const CANON_REPLACEMENTS = [
  [/\bmachine[\s-]*learning\b/g, 'ml'],
  [/\bartificial[\s-]*intelligence\b/g, 'ai'],
  [/\bsite[\s-]*reliability[\s-]*engineer(ing)?\b/g, 'sre engineer'],
  [/\bquality[\s-]*assurance\b/g, 'qa'],
  [/\buser[\s-]*experience\b/g, 'ux'],
  [/\buser[\s-]*interface\b/g, 'ui'],
  [/\bdev[\s-]*ops\b/g, 'devops'],
  [/\bfront[\s-]*end\b/g, 'frontend'],
  [/\bback[\s-]*end\b/g, 'backend'],
  [/\bfull[\s-]*stack\b/g, 'fullstack'],
];

// Filler that survives the shared stopword list once short tokens are kept:
// articles/prepositions and level markers (roman numerals, sr/jr).
const FIT_EXTRA_STOPWORDS = new Set([
  'a', 'an', 'and', 'at', 'de', 'for', 'i', 'ii', 'iii', 'iv', 'v',
  'in', 'jr', 'of', 'on', 'or', 'sr', 'the', 'to',
]);

/**
 * Tokenize a role title for fit matching: canonicalize known multi-word
 * specialties, lowercase, strip punctuation (keeping +/# so "c++"/"c#"
 * survive), and drop stopwords while KEEPING short content tokens.
 *
 * @param {string} title - Raw role title.
 * @returns {string[]} Ordered content tokens.
 */
export function fitTokens(title) {
  let text = String(title ?? '').toLowerCase();
  for (const [pattern, replacement] of CANON_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/[^a-z0-9+#\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !ROLE_STOPWORDS.has(w) && !FIT_EXTRA_STOPWORDS.has(w));
}

// ── Pending-queue parsing ───────────────────────────────────────────────────

/**
 * Parse one pending checkbox row. Positional columns follow the 1/3/4/5-column
 * contract of modes/pipeline.md (url | company | title | location | comp);
 * `posted:`/`note:` are labeled segments that ride on any row shape.
 *
 * @param {string} line - One line from the ## Pending section.
 * @returns {{url:string,company:string,title:string,location:string,comp:string,posted:string,note:string}|null}
 *          Parsed row, or null when the line is not an unchecked checkbox row.
 */
export function parsePendingLine(line) {
  const m = /^\s*- \[ \] (.+)$/.exec(line);
  if (!m) return null;

  const positional = [];
  let posted = '';
  let note = '';
  for (const cell of m[1].split('|').map(c => c.trim())) {
    if (/^posted:/i.test(cell)) posted = cell.replace(/^posted:\s*/i, '');
    else if (/^note:/i.test(cell)) note = cell.replace(/^note:\s*/i, '');
    else positional.push(cell);
  }

  const [url = '', company = '', title = '', location = '', comp = ''] = positional;
  return { url, company, title, location, comp, posted, note };
}

/**
 * Extract the parsed rows of the ## Pending section (bounded by the next `## `
 * heading), tolerating the legacy Spanish marker like scan.mjs does.
 *
 * @param {string} text - Full pipeline.md content.
 * @returns {ReturnType<typeof parsePendingLine>[]} Unchecked pending rows in file order.
 */
export function parsePendingRows(text) {
  const marker = PENDING_MARKERS.find(mk => text.includes(mk));
  if (!marker) return [];
  const start = text.indexOf(marker) + marker.length;
  const nextSection = text.indexOf('\n## ', start);
  const section = nextSection === -1 ? text.slice(start) : text.slice(start, nextSection);
  // Strip carriage returns before splitting — pipeline.md is hand-edited, so a
  // Windows editor can save it CRLF (same normalization as scan.mjs's blacklist parser).
  return section.replace(/\r/g, '').split('\n').map(parsePendingLine).filter(Boolean);
}

// ── Profile targets and location preferences ────────────────────────────────

const FIT_TIERS = new Set(['primary', 'secondary', 'adjacent']);

/**
 * Collect match targets from the profile: every target_roles.primary entry
 * (fit=primary) and every archetype name (its own fit tier, defaulting to
 * secondary when absent/unknown).
 *
 * @param {object} profile - Parsed config/profile.yml.
 * @returns {{title:string, fit:'primary'|'secondary'|'adjacent'}[]}
 */
export function loadTargets(profile) {
  const targets = [];
  // Array.isArray guards: a scalar `primary:` would be iterated char by char,
  // a mapping `archetypes:` would throw. Both fall through to the clear
  // no-targets error instead.
  const primary = profile?.target_roles?.primary;
  for (const title of Array.isArray(primary) ? primary : []) {
    if (typeof title === 'string' && title.trim()) targets.push({ title: title.trim(), fit: 'primary' });
  }
  const archetypes = profile?.target_roles?.archetypes;
  for (const archetype of Array.isArray(archetypes) ? archetypes : []) {
    const name = archetype?.name;
    if (typeof name !== 'string' || !name.trim()) continue;
    const fit = FIT_TIERS.has(archetype?.fit) ? archetype.fit : 'secondary';
    targets.push({ title: name.trim(), fit });
  }
  return targets;
}

/**
 * Location needles from the profile: location.city, location.country, and the
 * comma-separated parts of candidate.location. Matched with word boundaries so
 * short needles like "CA" never fire inside "Barcelona".
 *
 * @param {object} profile - Parsed config/profile.yml.
 * @returns {RegExp[]} Case-insensitive word-bounded matchers.
 */
export function loadLocationNeedles(profile) {
  const raw = [
    profile?.location?.city,
    profile?.location?.country,
    ...String(profile?.candidate?.location ?? '').split(','),
  ];
  const needles = new Set();
  for (const part of raw) {
    const s = String(part ?? '').trim();
    if (s.length >= 2) needles.add(s.toLowerCase());
  }
  return [...needles].map(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
}

// ── Scoring ─────────────────────────────────────────────────────────────────

const LEVEL_RANK = { strong: 2, partial: 1, none: 0 };
const FIT_RANK = { primary: 3, secondary: 2, adjacent: 1 };

/**
 * Judge how well a posting title fits the user's targets. Coverage is the
 * fraction of a target's content tokens present in the posting title:
 *   strong  — coverage >= 2/3 (the posting title contains the target)
 *   partial — a shared non-baseline token, or coverage > 1/2
 *   none    — overlap is absent or purely generic ("engineer", "manager"...)
 *
 * @param {string} title - Posting title from the pending row.
 * @param {{title:string, fit:string}[]} targets - From loadTargets().
 * @returns {{level:'strong'|'partial'|'none', fit?:string, matched?:string}}
 */
export function matchTitle(title, targets) {
  const postingTokens = new Set(fitTokens(title));
  if (postingTokens.size === 0) return { level: 'none' };

  let best = { level: 'none' };
  let bestScore = -1;
  for (const target of targets) {
    const targetTokens = [...new Set(fitTokens(target.title))];
    if (targetTokens.length === 0) continue;

    const overlap = targetTokens.filter(t => postingTokens.has(t));
    const coverage = overlap.length / targetTokens.length;
    const hasDiscriminating = overlap.some(t => !BASELINE_TOKENS.has(t));

    let level = 'none';
    if (coverage >= 2 / 3) level = 'strong';
    else if (hasDiscriminating || coverage > 0.5) level = 'partial';
    if (level === 'none') continue;

    const score = LEVEL_RANK[level] * 100 + FIT_RANK[target.fit] * 10 + coverage;
    if (score > bestScore) {
      bestScore = score;
      best = { level, fit: target.fit, matched: target.title };
    }
  }
  return best;
}

const REMOTE_RE = /\b(remote|anywhere|worldwide|distributed|wfh)\b|work from home/i;

/**
 * Assess a posting location against the profile needles.
 *
 * @param {string} location - Location cell from the pending row (may be '').
 * @param {RegExp[]} needles - From loadLocationNeedles().
 * @returns {{status:'fit'|'unknown'|'mismatch', label:string}}
 */
export function assessLocation(location, needles) {
  const label = String(location ?? '').trim();
  if (!label) return { status: 'unknown', label };
  if (REMOTE_RE.test(label)) return { status: 'fit', label };
  if (needles.some(re => re.test(label))) return { status: 'fit', label };
  return { status: 'mismatch', label };
}

/**
 * Assign the bucket. Only an off-target title reaches skip — a location
 * mismatch demotes to maybe, never further (relocation/remote is a judgment
 * call this pass must not make).
 *
 * @param {{level:string, fit?:string}} titleMatch - From matchTitle().
 * @param {{status:string}} loc - From assessLocation().
 * @returns {'worth'|'maybe'|'skip'}
 */
export function bucketFor(titleMatch, loc) {
  if (titleMatch.level === 'none') return 'skip';
  if (
    titleMatch.level === 'strong' &&
    (titleMatch.fit === 'primary' || titleMatch.fit === 'secondary') &&
    loc.status === 'fit'
  ) return 'worth';
  return 'maybe';
}

// ── Shortlist rendering ─────────────────────────────────────────────────────

// One column of the shortlist line. Pipeline fields are third-party data:
// strip control chars, collapse the separators this file gives meaning to,
// and cap the length so a hostile title can't flood the shortlist.
function cleanField(value, max = 120) {
  const s = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function reasonFor(row, titleMatch, loc) {
  if (!row.title) return 'no title on row (pasted URL?) — needs a look';
  if (titleMatch.level === 'none') return 'title matches no target role';
  const parts = [`title ≈ “${cleanField(titleMatch.matched, 60)}” (${titleMatch.fit})`];
  if (loc.status === 'fit') parts.push(`location fits (${cleanField(loc.label, 40)})`);
  else if (loc.status === 'unknown') parts.push('no location on row');
  else parts.push(`location ${cleanField(loc.label, 40)} — needs relocation/remote`);
  return parts.join('; ');
}

function shortlistLine(entry) {
  const company = cleanField(entry.row.company) || '—';
  const title = cleanField(entry.row.title) || '(no title)';
  const posted = entry.row.posted ? ` (posted: ${cleanField(entry.row.posted, 20)})` : '';
  return `- ${company} — ${title} — ${entry.reason}${posted}  ${cleanField(entry.row.url, 500)}`;
}

// Newest posted first; rows without a posted date keep file order at the end.
function byPostedDesc(a, b) {
  const pa = a.row.posted || '';
  const pb = b.row.posted || '';
  if (pa && pb) return pa < pb ? 1 : pa > pb ? -1 : a.index - b.index;
  if (pa) return -1;
  if (pb) return 1;
  return a.index - b.index;
}

const BUCKET_HEADINGS = { worth: 'Worth a look', maybe: 'Maybe', skip: 'Skip' };

function formatShortlist(buckets, generatedAt, total) {
  const lines = [
    '# Shortlist — first-glance triage of pending postings',
    '',
    `Generated by \`node triage.mjs\` on ${generatedAt} — ${total} pending row(s) judged`,
    'on title + location only, against `config/profile.yml`. No JD was read and no',
    'tokens were spent. Derived file: rewritten on every successful run, safe to delete.',
    '',
    'Next: evaluate the "Worth a look" rows with `/career-ops pipeline`.',
  ];
  for (const key of ['worth', 'maybe', 'skip']) {
    const entries = [...buckets[key]].sort(byPostedDesc);
    lines.push('', `## ${BUCKET_HEADINGS[key]} (${entries.length})`, '');
    if (entries.length === 0) lines.push('_none_');
    else lines.push(...entries.map(shortlistLine));
  }
  return `${lines.join('\n')}\n`;
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Run the triage pass. Prints progress unless quiet; never throws for the
 * expected missing-file cases.
 *
 * @param {object} [opts]
 * @param {string} [opts.pipelinePath] - Override for tests.
 * @param {string} [opts.profilePath] - Override for tests.
 * @param {string} [opts.outPath] - Override for tests.
 * @param {boolean} [opts.quiet] - Suppress console output.
 * @param {boolean} [opts.json] - Print the buckets as JSON instead of a summary.
 * @returns {{ok:boolean, noop?:boolean, reason?:string, counts?:{worth:number,maybe:number,skip:number}, outPath?:string}}
 */
export function runTriage({
  pipelinePath = PIPELINE_PATH,
  profilePath = PROFILE_PATH,
  outPath = SHORTLIST_PATH,
  quiet = false,
  json = false,
} = {}) {
  const say = quiet ? () => {} : (...a) => console.log(...a);
  const complain = quiet ? () => {} : (...a) => console.error(...a);

  if (!existsSync(pipelinePath)) {
    say('No pipeline file yet — nothing to triage. Run `node scan.mjs` first.');
    return { ok: true, noop: true };
  }

  if (!existsSync(profilePath)) {
    complain('Error: config/profile.yml not found. Copy config/profile.example.yml there and fill in target_roles.');
    return { ok: false, reason: 'missing-profile' };
  }

  let profile;
  try {
    profile = yaml.load(readFileSync(profilePath, 'utf-8')) || {};
  } catch (err) {
    complain(`Error: could not parse ${profilePath}: ${err.message}`);
    return { ok: false, reason: 'invalid-profile' };
  }

  const targets = loadTargets(profile);
  if (targets.length === 0) {
    complain('Error: no target roles in config/profile.yml. Fill in target_roles.primary (and optionally target_roles.archetypes) so the triage has something to match against.');
    return { ok: false, reason: 'no-targets' };
  }

  const needles = loadLocationNeedles(profile);
  const rows = parsePendingRows(readFileSync(pipelinePath, 'utf-8'));

  const buckets = { worth: [], maybe: [], skip: [] };
  rows.forEach((row, index) => {
    const titleMatch = row.title ? matchTitle(row.title, targets) : { level: 'none' };
    const loc = assessLocation(row.location, needles);
    // A bare pasted URL has no title to judge — surface it in Maybe instead
    // of silently skipping something the user added by hand.
    const bucket = row.title ? bucketFor(titleMatch, loc) : 'maybe';
    buckets[bucket].push({ row, index, reason: reasonFor(row, titleMatch, loc) });
  });

  const counts = { worth: buckets.worth.length, maybe: buckets.maybe.length, skip: buckets.skip.length };
  const generatedAt = new Date().toISOString().slice(0, 10);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatShortlist(buckets, generatedAt, rows.length), 'utf-8');

  if (json) {
    // JSON goes to stdout unconditionally — it IS the output when requested.
    console.log(JSON.stringify({ generated: generatedAt, counts, ...buckets }, null, 2));
  } else {
    say(`Triaged ${rows.length} pending row(s): ${counts.worth} worth a look, ${counts.maybe} maybe, ${counts.skip} skip.`);
    say(`→ Shortlist written to ${outPath}`);
    if (counts.worth > 0) say('→ Evaluate the "Worth a look" rows with /career-ops pipeline.');
  }
  return { ok: true, counts, outPath };
}

// Only run when invoked directly (`node triage.mjs`), not when imported.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const result = runTriage({ json: args.includes('--json') });
  process.exit(result.ok ? 0 : 1);
}
