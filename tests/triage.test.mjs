/**
 * triage.test.mjs — tests for the zero-token pending-queue triage (#1729).
 *
 * Covers the pending-row parser (positional 1/3/4/5-column contract plus
 * labeled `posted:`/`note:` segments), title-fit scoring against
 * config/profile.yml targets, location assessment, bucket assignment, and the
 * end-to-end runTriage() flow against a temp pipeline/profile pair.
 *
 * Run: node tests/triage.test.mjs
 */

import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  fitTokens,
  parsePendingLine,
  parsePendingRows,
  loadTargets,
  loadLocationNeedles,
  matchTitle,
  assessLocation,
  bucketFor,
  runTriage,
} from '../triage.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
    console.log(`    expected: ${e}`);
    console.log(`    actual:   ${a}`);
  }
}

function ok(label, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
  }
}

// ── fitTokens ───────────────────────────────────────────────────────────────

// Seniority, work mode, and filler drop out; content tokens survive.
eq('fitTokens drops seniority and mode words',
  fitTokens('Senior Remote Software Engineer'),
  ['software', 'engineer']);

// Short discriminating tokens like "ai"/"ml" must survive — they are the
// whole signal in titles like "AI Engineer" (role-matcher's dedup tokenizer
// deliberately drops them, which is why triage has its own).
eq('fitTokens keeps ai/ml', fitTokens('Senior AI Engineer'), ['ai', 'engineer']);

// Multi-word specialties canonicalize to their short forms so
// "Machine Learning Engineer" and "ML Engineer" produce identical tokens.
eq('fitTokens canonicalizes machine learning -> ml',
  fitTokens('Machine Learning Engineer'),
  fitTokens('ML Engineer'));
eq('fitTokens canonicalizes front-end -> frontend',
  fitTokens('Front-End Developer'),
  ['frontend', 'developer']);
// Multi-character separators (space-hyphen-space, double space) must still
// canonicalize — [\s-]* collapses any run of whitespace/hyphens.
eq('fitTokens canonicalizes across multi-char separators',
  fitTokens('Front - End Developer'),
  ['frontend', 'developer']);

// Roman-numeral levels and stray articles are noise, not content.
eq('fitTokens drops level numerals', fitTokens('Software Engineer II'), ['software', 'engineer']);

// ── parsePendingLine ────────────────────────────────────────────────────────

eq('parse bare URL row',
  parsePendingLine('- [ ] https://x.com/j/1'),
  { url: 'https://x.com/j/1', company: '', title: '', location: '', comp: '', posted: '', note: '' });

eq('parse 3-column row',
  parsePendingLine('- [ ] https://x.com/j/2 | Acme | Backend Engineer'),
  { url: 'https://x.com/j/2', company: 'Acme', title: 'Backend Engineer', location: '', comp: '', posted: '', note: '' });

eq('parse 4-column row (location)',
  parsePendingLine('- [ ] https://x.com/j/3 | Acme | Backend Engineer | Berlin, Germany'),
  { url: 'https://x.com/j/3', company: 'Acme', title: 'Backend Engineer', location: 'Berlin, Germany', comp: '', posted: '', note: '' });

eq('parse 5-column row (comp) with labeled posted and note',
  parsePendingLine('- [ ] https://x.com/j/4 | Acme | Backend Engineer | Remote | $100K-120K | posted: 2026-07-01 | note: curated'),
  { url: 'https://x.com/j/4', company: 'Acme', title: 'Backend Engineer', location: 'Remote', comp: '$100K-120K', posted: '2026-07-01', note: 'curated' });

// Labeled segments are labeled, not positional — they parse on short rows too.
eq('labeled posted rides on a 3-column row',
  parsePendingLine('- [ ] https://x.com/j/5 | Acme | Backend Engineer | posted: 2026-06-30').posted,
  '2026-06-30');

eq('non-checkbox line is rejected', parsePendingLine('some prose'), null);
eq('checked row is rejected', parsePendingLine('- [x] https://x.com/j/6 | Acme | Done'), null);

// ── parsePendingRows ────────────────────────────────────────────────────────

const PIPELINE_FIXTURE = `# Pipeline — Pending URLs

Paste job URLs below as \`- [ ] {url}\` then run \`/career-ops pipeline\`.

## Pending

- [ ] https://x.com/j/1 | Acme | AI Engineer | Remote | posted: 2026-07-10
- [ ] https://x.com/j/2 | Beta | Accountant | Paris
- [x] https://x.com/j/9 | Done | Old Role

## Processed

- [ ] https://x.com/j/8 | NotPending | Should Not Appear
`;

const rows = parsePendingRows(PIPELINE_FIXTURE);
eq('parsePendingRows only reads unchecked rows inside ## Pending',
  rows.map(r => r.url),
  ['https://x.com/j/1', 'https://x.com/j/2']);

// Legacy Spanish marker still works (mirrors scan.mjs PENDING_MARKERS).
const legacyRows = parsePendingRows('## Pendientes\n\n- [ ] https://x.com/j/7 | Gamma | QA Engineer\n\n## Procesadas\n');
eq('legacy ## Pendientes marker is honored', legacyRows.map(r => r.url), ['https://x.com/j/7']);

eq('missing Pending section yields no rows', parsePendingRows('# Pipeline\n\n## Processed\n'), []);

// pipeline.md is hand-edited — a Windows editor can save it with CRLF line
// endings. Rows must parse identically (regression: CR used to defeat the
// checkbox regex and every row was silently dropped).
const crlfRows = parsePendingRows(PIPELINE_FIXTURE.replace(/\n/g, '\r\n'));
eq('CRLF pipeline parses identically to LF',
  crlfRows.map(r => ({ url: r.url, title: r.title })),
  rows.map(r => ({ url: r.url, title: r.title })));

// ── loadTargets ─────────────────────────────────────────────────────────────

const PROFILE_FIXTURE = {
  candidate: { location: 'San Francisco, CA' },
  target_roles: {
    primary: ['Senior AI Engineer', 'Staff ML Engineer'],
    archetypes: [
      { name: 'AI Product Manager', level: 'Senior', fit: 'secondary' },
      { name: 'Solutions Architect', level: 'Mid-Senior', fit: 'adjacent' },
      { name: 'No Fit Given', level: 'Mid' },
    ],
  },
  location: { country: 'United States', city: 'San Francisco' },
};

const targets = loadTargets(PROFILE_FIXTURE);
eq('primary list maps to fit=primary',
  targets.filter(t => t.fit === 'primary').map(t => t.title),
  ['Senior AI Engineer', 'Staff ML Engineer']);
eq('archetype fit tiers are honored',
  targets.find(t => t.title === 'Solutions Architect').fit,
  'adjacent');
eq('archetype without fit defaults to secondary',
  targets.find(t => t.title === 'No Fit Given').fit,
  'secondary');
eq('empty profile yields no targets', loadTargets({}), []);
// YAML shape mistakes must degrade to "no targets", not misbehave: a scalar
// `primary:` would otherwise be iterated char by char, a mapping `archetypes:`
// would throw.
eq('scalar primary yields no targets instead of per-character junk',
  loadTargets({ target_roles: { primary: 'Senior AI Engineer' } }), []);
eq('mapping archetypes yields no targets instead of throwing',
  loadTargets({ target_roles: { archetypes: { name: 'AI Engineer', fit: 'primary' } } }), []);

// ── matchTitle ──────────────────────────────────────────────────────────────

eq('exact primary title is a strong match',
  matchTitle('Senior AI Engineer', targets).level, 'strong');
eq('strong match reports the tier of the matched target',
  matchTitle('AI Engineer (Remote)', targets).fit, 'primary');
// "Machine Learning Engineer" reaches "Staff ML Engineer" via canonicalization.
eq('ml canonicalization powers a strong match',
  matchTitle('Machine Learning Engineer', targets).level, 'strong');
// Shares only the baseline token "engineer" with any target — not a match.
eq('off-target title is none',
  matchTitle('Civil Engineer', targets).level, 'none');
eq('unrelated title is none',
  matchTitle('Head Chef', targets).level, 'none');
// Shares the non-baseline token "ai" — partial, not strong.
eq('shared specialty token is a partial match',
  matchTitle('AI Researcher', targets).level, 'partial');
eq('empty title is none', matchTitle('', targets).level, 'none');

// A deliberately generic user target still matches its own family.
const genericTargets = loadTargets({ target_roles: { primary: ['Software Engineer'] } });
eq('generic target matches its titled variants',
  matchTitle('Software Engineer II', genericTargets).level, 'strong');

// ── assessLocation ──────────────────────────────────────────────────────────

const needles = loadLocationNeedles(PROFILE_FIXTURE);

eq('remote location fits', assessLocation('Remote (EMEA)', needles).status, 'fit');
eq('home city fits', assessLocation('San Francisco, CA', needles).status, 'fit');
eq('home country fits', assessLocation('Austin, United States', needles).status, 'fit');
eq('missing location is unknown', assessLocation('', needles).status, 'unknown');
eq('other city is a mismatch', assessLocation('Berlin, Germany', needles).status, 'mismatch');
// Word-boundary matching: "CA" must not fire inside "Barcelona".
eq('short needles do not fire mid-word', assessLocation('Barcelona, Spain', needles).status, 'mismatch');

// ── bucketFor ───────────────────────────────────────────────────────────────

const FIT = { status: 'fit', label: 'Remote' };
const MISMATCH = { status: 'mismatch', label: 'Berlin, Germany' };
const UNKNOWN = { status: 'unknown', label: '' };

eq('strong primary + location fit -> worth',
  bucketFor({ level: 'strong', fit: 'primary' }, FIT), 'worth');
eq('strong secondary + location fit -> worth',
  bucketFor({ level: 'strong', fit: 'secondary' }, FIT), 'worth');
eq('strong adjacent stays in maybe',
  bucketFor({ level: 'strong', fit: 'adjacent' }, FIT), 'maybe');
eq('strong primary + location mismatch -> maybe',
  bucketFor({ level: 'strong', fit: 'primary' }, MISMATCH), 'maybe');
eq('strong primary + unknown location -> maybe',
  bucketFor({ level: 'strong', fit: 'primary' }, UNKNOWN), 'maybe');
eq('partial match -> maybe',
  bucketFor({ level: 'partial', fit: 'primary' }, FIT), 'maybe');
eq('no title match -> skip',
  bucketFor({ level: 'none' }, FIT), 'skip');

// ── runTriage end-to-end ────────────────────────────────────────────────────

import yaml from 'js-yaml';

const tmp = mkdtempSync(join(tmpdir(), 'triage-test-'));
const pipelinePath = join(tmp, 'pipeline.md');
const profilePath = join(tmp, 'profile.yml');
const outPath = join(tmp, 'shortlist.md');

writeFileSync(profilePath, yaml.dump(PROFILE_FIXTURE), 'utf-8');
writeFileSync(pipelinePath, `## Pending

- [ ] https://x.com/j/1 | Acme | AI Engineer | Remote | posted: 2026-07-01
- [ ] https://x.com/j/2 | Beta | Staff ML Engineer | San Francisco, CA | posted: 2026-07-08
- [ ] https://x.com/j/3 | Gamma | Solutions Architect | Remote
- [ ] https://x.com/j/4 | Delta | Head Chef | Paris
- [ ] https://x.com/j/5
- [ ] https://x.com/j/6 | Epsilon | AI Engineer | Berlin, Germany

## Processed
`, 'utf-8');

const result = runTriage({ pipelinePath, profilePath, outPath, quiet: true });

eq('runTriage succeeds', result.ok, true);
eq('runTriage counts', result.counts, { worth: 2, maybe: 3, skip: 1 });
ok('shortlist file is written', existsSync(outPath));

// Pull the trailing URL of every row in one shortlist section, in order.
// Exact-equality assertions on these lists pin both membership and sort.
function sectionUrls(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start === -1) return null;
  const next = text.indexOf('\n## ', start);
  const section = next === -1 ? text.slice(start) : text.slice(start, next);
  return [...section.matchAll(/ {2}(\S+)$/gm)].map(m => m[1]);
}

const shortlist = readFileSync(outPath, 'utf-8');
// Newest posted first inside a bucket: j/2 (07-08) before j/1 (07-01).
eq('worth bucket sorts newest posted first',
  sectionUrls(shortlist, 'Worth a look'),
  ['https://x.com/j/2', 'https://x.com/j/1']);
// The adjacent-tier match, the bare pasted URL, and the strong-title location
// mismatch all land in Maybe (never dropped, never demoted to Skip), in file order.
eq('maybe holds adjacent match, bare URL and location mismatch',
  sectionUrls(shortlist, 'Maybe'),
  ['https://x.com/j/3', 'https://x.com/j/5', 'https://x.com/j/6']);
eq('skip holds only the off-target title',
  sectionUrls(shortlist, 'Skip'),
  ['https://x.com/j/4']);

// The triage must never touch the pipeline itself.
eq('pipeline.md is left byte-identical',
  readFileSync(pipelinePath, 'utf-8').includes('- [ ] https://x.com/j/1 | Acme | AI Engineer | Remote | posted: 2026-07-01'),
  true);

// Re-run with an emptied queue overwrites the stale shortlist.
writeFileSync(pipelinePath, '## Pending\n\n## Processed\n', 'utf-8');
const emptyResult = runTriage({ pipelinePath, profilePath, outPath, quiet: true });
eq('empty queue still succeeds', emptyResult.ok, true);
eq('empty queue counts', emptyResult.counts, { worth: 0, maybe: 0, skip: 0 });
const rewritten = readFileSync(outPath, 'utf-8');
eq('stale shortlist is overwritten on empty queue',
  ['Worth a look', 'Maybe', 'Skip'].map(h => sectionUrls(rewritten, h)),
  [[], [], []]);

// Graceful degradation: missing pipeline is a no-op, missing profile is an error.
const noPipeline = runTriage({ pipelinePath: join(tmp, 'nope.md'), profilePath, outPath, quiet: true });
eq('missing pipeline is a graceful no-op', { ok: noPipeline.ok, noop: noPipeline.noop }, { ok: true, noop: true });

const noProfile = runTriage({ pipelinePath, profilePath: join(tmp, 'nope.yml'), outPath, quiet: true });
eq('missing profile fails with guidance', noProfile.ok, false);

const noTargets = (() => {
  const p = join(tmp, 'no-targets.yml');
  writeFileSync(p, yaml.dump({ candidate: { location: 'X' } }), 'utf-8');
  return runTriage({ pipelinePath, profilePath: p, outPath, quiet: true });
})();
eq('profile without target_roles fails with guidance', noTargets.ok, false);

const badProfile = (() => {
  const p = join(tmp, 'bad.yml');
  writeFileSync(p, 'target_roles:\n  primary: [unclosed', 'utf-8');
  return runTriage({ pipelinePath, profilePath: p, outPath, quiet: true });
})();
eq('unparsable profile fails with invalid-profile reason',
  { ok: badProfile.ok, reason: badProfile.reason },
  { ok: false, reason: 'invalid-profile' });

rmSync(tmp, { recursive: true, force: true });

// ── summary ─────────────────────────────────────────────────────────────────

console.log(`\ntriage tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
