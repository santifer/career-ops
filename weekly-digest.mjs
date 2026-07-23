#!/usr/bin/env node
/**
 * weekly-digest.mjs — Weekly Interview Digest for career-ops
 *
 * `interview/debrief` and `interview/practice` already write structured
 * session transcripts to `interview-prep/sessions/{company-slug}-{role-slug}-
 * {round}-{YYYY-MM-DD}.md` (schema documented in
 * `interview-prep/sessions/README.md`). Nothing aggregated them until now —
 * a candidate running multiple concurrent interview processes had to
 * manually cross-reference each file to see "which companies did I talk to
 * this week, and what's recurring across rounds." This is the first real
 * consumer of that schema.
 *
 * Zero-LLM by design: front-matter parsing, date-range filtering, and tag
 * counting only. No judgment calls — just mechanical rollup.
 *
 * Reads:
 *   - interview-prep/sessions/*.md — front matter (company/role/round/date/
 *     source) + `<!-- competency: tag[, tag...] -->` annotations
 *   - interview-prep/question-bank.md (optional, best-effort) — counts
 *     🔴-tagged lines whose nearest heading matches a company that has a
 *     session in range, as a mechanical (not schema-guaranteed) proxy for
 *     "recurring gap." question-bank.md has no fixed markdown schema (it's
 *     candidate-edited free text), so this is intentionally a loose textual
 *     match, not a strict parser — absent or unmatched entries degrade
 *     silently rather than erroring.
 *
 * Run: node weekly-digest.mjs                       (JSON to stdout)
 *      node weekly-digest.mjs --summary              (human-readable digest)
 *      node weekly-digest.mjs --from 2026-07-13 --to 2026-07-19
 *      node weekly-digest.mjs --dir path/to/sessions  (override sessions dir; test isolation)
 *      node weekly-digest.mjs --self-test
 *
 * Default range: the current ISO week (Monday–Sunday), matching the
 * `isoWeek` convention already used by `stats.mjs`'s scan-run trends.
 *
 * Issue #2129 — github.com/santifer/career-ops
 */

import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SESSIONS_DIR = join(CAREER_OPS, 'interview-prep', 'sessions');
const DEFAULT_QUESTION_BANK_PATH = join(CAREER_OPS, 'interview-prep', 'question-bank.md');

const ROUND_ENUM = ['screen', 'hiring-manager', 'technical', 'system-design', 'behavioral', 'onsite', 'final'];

// ── Date helpers ────────────────────────────────────────────────────

function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Current ISO week (Monday–Sunday) containing `now`, as {from, to} strings.
 * `now` is injectable so callers (and tests) never depend on wall-clock time
 * implicitly.
 */
export function computeDefaultRange(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayIdx = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayIdx); // roll back to Monday
  const from = d.toISOString().slice(0, 10);
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() + 6);
  const to = end.toISOString().slice(0, 10);
  return { from, to };
}

function inRange(dateStr, from, to) {
  return isValidDateStr(dateStr) && dateStr >= from && dateStr <= to;
}

// ── Session file parsing ────────────────────────────────────────────

/**
 * Parse one session file's content: YAML front matter + competency tags
 * pulled from `<!-- competency: tag[, tag...] -->` comments in the body.
 * Returns null for a file with no parseable front matter (never throws —
 * a malformed or hand-edited session file must not crash the digest).
 *
 * @param {string} content - Raw session file text.
 */
export function parseSessionFile(content) {
  const text = String(content ?? '').replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  let front;
  try {
    front = yaml.load(match[1]) || {};
  } catch {
    return null;
  }
  if (typeof front !== 'object' || front === null) return null;
  const company = String(front.company ?? '').trim();
  const role = String(front.role ?? '').trim();
  // js-yaml auto-parses an unquoted YYYY-MM-DD scalar into a JS Date (YAML
  // 1.1 timestamp type) rather than leaving it a string — normalize back to
  // YYYY-MM-DD before validating, or a well-formed date front-matter value
  // would be silently rejected as invalid.
  const rawDate = front.date instanceof Date ? front.date.toISOString().slice(0, 10) : String(front.date ?? '').trim();
  if (!company || !role || !isValidDateStr(rawDate)) return null;
  const date = rawDate;

  const round = String(front.round ?? '').trim();
  const source = String(front.source ?? '').trim();
  const interviewerRole = String(front.interviewer_role ?? '').trim();

  const body = match[2] || '';
  const competencyTags = [];
  for (const m of body.matchAll(/<!--\s*competency:\s*(.*?)\s*-->/g)) {
    for (const tag of m[1].split(',')) {
      const t = tag.trim().toLowerCase();
      if (t) competencyTags.push(t);
    }
  }

  return { company, role, date, round, source, interviewerRole, competencyTags };
}

/**
 * Load and parse every session file in `dir`. Non-.md files (README.md,
 * .gitkeep) and files that fail to parse are silently skipped — this
 * mirrors the "torn/malformed row never poisons the aggregate" convention
 * used throughout this codebase (e.g. detect-reposts.mjs, stats.mjs).
 *
 * @param {string} dir - Sessions directory path.
 */
export function loadSessions(dir = DEFAULT_SESSIONS_DIR) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'readme.md');
  const sessions = [];
  for (const f of files) {
    let content;
    try {
      content = readFileSync(join(dir, f), 'utf-8');
    } catch {
      continue;
    }
    const parsed = parseSessionFile(content);
    if (parsed) sessions.push({ ...parsed, file: f });
  }
  return sessions;
}

// ── Question bank (best-effort, optional) ──────────────────────────

/**
 * Best-effort scan of question-bank.md for 🔴-tagged lines, associated with
 * a company by nearest preceding markdown heading. question-bank.md has no
 * fixed schema (candidate-edited free text seeded by `interview/debrief`),
 * so this is intentionally loose: any line containing 🔴 is treated as a
 * gap entry, labelled with the line's own text (bullet/status markers
 * stripped), and attributed to whichever heading above it last matched one
 * of `companyNames` (case-insensitive substring match). Returns a Map of
 * lowercased company name -> array of gap-entry strings.
 *
 * @param {string} content - Raw question-bank.md text.
 * @param {string[]} companyNames - Company names to attribute gaps to (from
 *   in-range sessions only — gaps for companies outside the digest window
 *   are irrelevant to this report).
 */
export function extractGapsByCompany(content, companyNames) {
  const byCompany = new Map();
  if (!content || !Array.isArray(companyNames) || companyNames.length === 0) return byCompany;
  const lookup = companyNames.map((n) => ({ raw: n, lower: n.toLowerCase() }));
  let currentCompany = null;
  for (const rawLine of String(content).replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) {
      const headingText = line.replace(/^#{1,6}\s*/, '').toLowerCase();
      const found = lookup.find((c) => headingText.includes(c.lower));
      if (found) currentCompany = found.raw;
      // A heading that doesn't match a known in-range company just means
      // we're now inside an unrelated section — leave currentCompany as-is
      // only if it's genuinely a sub-heading; safer to clear so an old
      // company's gaps don't leak into a differently-headed section.
      else currentCompany = null;
      continue;
    }
    if (line.includes('🔴') && currentCompany) {
      const label = line.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').trim();
      if (!byCompany.has(currentCompany)) byCompany.set(currentCompany, []);
      byCompany.get(currentCompany).push(label);
    }
  }
  return byCompany;
}

// ── Core rollup ─────────────────────────────────────────────────────

/**
 * Build the digest for sessions already filtered to a date range.
 *
 * @param {Array} sessionsInRange - Result of loadSessions(), pre-filtered.
 * @param {Map<string,string[]>} gapsByCompany - Result of extractGapsByCompany().
 */
export function buildDigest(sessionsInRange, gapsByCompany = new Map()) {
  const byCompany = new Map();
  const tagCounts = new Map();

  for (const s of sessionsInRange) {
    const key = `${s.company.toLowerCase()}::${s.role.toLowerCase()}`;
    if (!byCompany.has(key)) {
      byCompany.set(key, { company: s.company, role: s.role, rounds: [] });
    }
    byCompany.get(key).rounds.push({ round: s.round, date: s.date, source: s.source, competencyTags: s.competencyTags });
    for (const tag of s.competencyTags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }

  const companies = [...byCompany.values()]
    .map((c) => ({ ...c, rounds: c.rounds.sort((a, b) => (a.date < b.date ? -1 : 1)) }))
    .sort((a, b) => a.company.localeCompare(b.company) || a.role.localeCompare(b.role));

  const recurringCompetencies = [...tagCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const recurringGaps = [...gapsByCompany.entries()]
    .map(([company, gaps]) => ({ company, gaps }))
    .filter((g) => g.gaps.length > 0)
    .sort((a, b) => b.gaps.length - a.gaps.length || a.company.localeCompare(b.company));

  return {
    companies,
    competencyTagCounts: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    recurringCompetencies,
    recurringGaps,
  };
}

// ── Assembler ────────────────────────────────────────────────────────

/**
 * Full digest for a date range, reading from disk.
 *
 * @param {{from?: string, to?: string, sessionsDir?: string, questionBankPath?: string}} opts
 */
export function computeWeeklyDigest({
  from,
  to,
  sessionsDir = DEFAULT_SESSIONS_DIR,
  questionBankPath = DEFAULT_QUESTION_BANK_PATH,
} = {}) {
  const range = (from && to) ? { from, to } : computeDefaultRange();
  const allSessions = loadSessions(sessionsDir);
  const sessionsInRange = allSessions.filter((s) => inRange(s.date, range.from, range.to));

  const companyNames = [...new Set(sessionsInRange.map((s) => s.company))];
  const qbContent = existsSync(questionBankPath) ? readFileSync(questionBankPath, 'utf-8') : null;
  const gapsByCompany = qbContent ? extractGapsByCompany(qbContent, companyNames) : new Map();

  const digest = buildDigest(sessionsInRange, gapsByCompany);

  return {
    metadata: {
      range,
      sessionsDirFound: existsSync(sessionsDir),
      questionBankFound: !!qbContent,
      totalSessionsFound: allSessions.length,
      sessionsInRange: sessionsInRange.length,
      companiesInRange: digest.companies.length,
    },
    ...digest,
  };
}

// ── Summary mode ─────────────────────────────────────────────────────

function printSummary(result) {
  const line = '━'.repeat(45);
  console.log(`\n${line}`);
  console.log(`Weekly Interview Digest — ${result.metadata.range.from} to ${result.metadata.range.to}`);
  console.log(line);

  if (result.metadata.sessionsInRange === 0) {
    const reason = !result.metadata.sessionsDirFound
      ? '(interview-prep/sessions/ not found)'
      : '(no session files fall inside this range)';
    console.log(`No interviews recorded in this range ${reason}.`);
    console.log('');
    return;
  }

  console.log(`Sessions:    ${result.metadata.sessionsInRange} in range across ${result.metadata.companiesInRange} companies (${result.metadata.totalSessionsFound} total on file)`);
  console.log('');
  for (const c of result.companies) {
    const rounds = c.rounds.map((r) => `${r.round || 'round'} (${r.date})`).join(' → ');
    console.log(`• ${c.company} — ${c.role}`);
    console.log(`    Rounds: ${rounds}`);
  }

  if (result.recurringCompetencies.length > 0) {
    console.log('');
    console.log('Recurring competencies this week:');
    for (const t of result.recurringCompetencies) {
      console.log(`  - ${t.tag} (${t.count}x)`);
    }
  }

  if (result.recurringGaps.length > 0) {
    console.log('');
    console.log('Open gaps by company (from question-bank.md, best-effort):');
    for (const g of result.recurringGaps) {
      console.log(`  - ${g.company}: ${g.gaps.length} 🔴 item(s)`);
      for (const gap of g.gaps) console.log(`      ↳ ${gap}`);
    }
  } else if (result.metadata.questionBankFound) {
    console.log('');
    console.log('Open gaps by company: none matched (question-bank.md present but no 🔴 items tied to this week\'s companies)');
  }
  console.log('');
}

// ── Self-test ────────────────────────────────────────────────────────

async function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const check = (cond, label) => {
    if (cond) { pass += 1; } else { fail += 1; console.error(`  FAIL: ${label}`); }
  };

  // computeDefaultRange: a known Wednesday (2026-07-22) should yield Mon
  // 2026-07-20 .. Sun 2026-07-26.
  const wed = computeDefaultRange(new Date('2026-07-22T12:00:00Z'));
  check(wed.from === '2026-07-20' && wed.to === '2026-07-26', 'computeDefaultRange resolves the containing Mon-Sun week');
  const mon = computeDefaultRange(new Date('2026-07-20T00:00:00Z'));
  check(mon.from === '2026-07-20' && mon.to === '2026-07-26', 'computeDefaultRange handles Monday itself as the range start');
  const sun = computeDefaultRange(new Date('2026-07-26T23:00:00Z'));
  check(sun.from === '2026-07-20' && sun.to === '2026-07-26', 'computeDefaultRange handles Sunday itself as the range end');

  // parseSessionFile: well-formed session with two competency tags.
  const goodSession = [
    '---',
    'company: Acme Corp',
    'role: Instructional Designer',
    'round: behavioral',
    'date: 2026-07-21',
    'interviewer_role: Senior HR Partner',
    'source: debrief',
    '---',
    '',
    '## Q1',
    '**Interviewer:** Tell me about a time you led a project.',
    '<!-- competency: stakeholder-management -->',
    '**Candidate:** ...answer...',
    '',
    '## Q2',
    '**Interviewer:** How do you handle ambiguous scope?',
    '<!-- competency: stakeholder-management, scope-management -->',
    '**Candidate:** ...answer...',
  ].join('\n');
  const parsed = parseSessionFile(goodSession);
  check(!!parsed, 'well-formed session file parses');
  if (parsed) {
    check(parsed.company === 'Acme Corp', 'company extracted');
    check(parsed.role === 'Instructional Designer', 'role extracted');
    check(parsed.round === 'behavioral' && ROUND_ENUM.includes(parsed.round), 'round extracted and in enum');
    check(parsed.date === '2026-07-21', 'date extracted');
    check(parsed.competencyTags.length === 3, 'all competency tags collected across Q&A pairs');
    check(parsed.competencyTags.filter((t) => t === 'stakeholder-management').length === 2, 'repeated tag counted once per occurrence');
  }

  // Malformed / missing front matter must not crash.
  check(parseSessionFile('no front matter here') === null, 'missing front matter returns null, not a crash');
  check(parseSessionFile('---\ncompany: Acme\n---\nbody') === null, 'front matter missing required fields (role/date) returns null');
  check(parseSessionFile(null) === null, 'null input returns null, not a crash');

  // loadSessions: missing directory -> empty array, no throw.
  check(loadSessions('/definitely/does/not/exist/anywhere') .length === 0, 'missing sessions directory returns empty array');

  // buildDigest: two companies, one shared competency tag appearing twice.
  const sessionsInRange = [
    { company: 'Acme Corp', role: 'Instructional Designer', date: '2026-07-21', round: 'behavioral', source: 'debrief', competencyTags: ['stakeholder-management'] },
    { company: 'Acme Corp', role: 'Instructional Designer', date: '2026-07-23', round: 'technical', source: 'debrief', competencyTags: ['curriculum-design'] },
    { company: 'Beta Learning', role: 'LXD', date: '2026-07-22', round: 'screen', source: 'practice', competencyTags: ['stakeholder-management'] },
  ];
  const digest = buildDigest(sessionsInRange);
  check(digest.companies.length === 2, 'two distinct companies grouped');
  const acme = digest.companies.find((c) => c.company === 'Acme Corp');
  check(!!acme && acme.rounds.length === 2, 'Acme Corp rolls up both of its rounds');
  check(acme.rounds[0].date === '2026-07-21' && acme.rounds[1].date === '2026-07-23', 'rounds sorted chronologically');
  check(digest.recurringCompetencies.some((t) => t.tag === 'stakeholder-management' && t.count === 2), 'competency tag recurring across two different companies is surfaced');
  check(!digest.recurringCompetencies.some((t) => t.tag === 'curriculum-design'), 'a tag seen only once is not flagged as recurring');

  // Empty input -> empty digest, no crash.
  const emptyDigest = buildDigest([]);
  check(emptyDigest.companies.length === 0 && emptyDigest.recurringCompetencies.length === 0, 'empty session list returns an empty, non-crashing digest');

  // extractGapsByCompany: heading-based attribution, unrelated headings excluded.
  const qb = [
    '# Question Bank',
    '',
    '## Acme Corp — Instructional Designer',
    '- **Q:** Explain backward design. Status: 🔴 Gap',
    '- **Q:** What is a rubric? Status: ✅ Strong',
    '',
    '## Some Unrelated Company',
    '- **Q:** Off-topic question. Status: 🔴 Gap',
    '',
    '## Beta Learning — LXD',
    '- **Q:** Describe your LMS migration experience. Status: 🔴 Gap',
  ].join('\n');
  const gaps = extractGapsByCompany(qb, ['Acme Corp', 'Beta Learning']);
  check(gaps.get('Acme Corp')?.length === 1, 'gap attributed to Acme Corp under its own heading');
  check(!gaps.has('Some Unrelated Company'), 'gap under an unrelated heading is not attributed to any in-range company');
  check(gaps.get('Beta Learning')?.length === 1, 'gap attributed to Beta Learning under its own heading');
  check(extractGapsByCompany('', ['Acme Corp']).size === 0, 'empty question-bank content returns an empty map');
  check(extractGapsByCompany(qb, []).size === 0, 'no company names to match against returns an empty map');

  // computeWeeklyDigest end-to-end against a synthetic fixture directory —
  // never real personal session data, which is gitignored and typically
  // absent/empty on a fresh checkout.
  const tmpBase = process.env.TEMP || process.env.TMPDIR || '/tmp';
  const tmpDir = mkdtempSync(join(tmpBase, 'weekly-digest-selftest-'));
  try {
    writeFileSync(join(tmpDir, 'acme-corp-instructional-designer-behavioral-2026-07-21.md'), goodSession);
    writeFileSync(join(tmpDir, 'README.md'), 'not a session');
    const result = computeWeeklyDigest({ from: '2026-07-20', to: '2026-07-26', sessionsDir: tmpDir, questionBankPath: '/definitely/does/not/exist/question-bank.md' });
    check(result.metadata.sessionsInRange === 1, 'end-to-end: one in-range session found in the fixture dir, README.md ignored');
    check(result.metadata.questionBankFound === false, 'end-to-end: missing question-bank.md is reported, not an error');
    check(result.companies.length === 1 && result.companies[0].company === 'Acme Corp', 'end-to-end: company rollup present');

    const outOfRange = computeWeeklyDigest({ from: '2020-01-01', to: '2020-01-07', sessionsDir: tmpDir, questionBankPath: '/definitely/does/not/exist/question-bank.md' });
    check(outOfRange.metadata.sessionsInRange === 0, 'end-to-end: a range with no matching sessions reports zero, not an error');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  // Missing sessions directory entirely -> graceful zero-result contract.
  const missingDirResult = computeWeeklyDigest({ from: '2026-07-20', to: '2026-07-26', sessionsDir: '/definitely/does/not/exist/sessions', questionBankPath: '/definitely/does/not/exist/question-bank.md' });
  check(missingDirResult.metadata.sessionsDirFound === false, 'missing sessions directory is reported, not an error');
  check(missingDirResult.metadata.sessionsInRange === 0, 'missing sessions directory yields zero sessions, exit 0 contract');

  console.log(`\n  weekly-digest self-test: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

// ── CLI ──────────────────────────────────────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    await runSelfTest();
  }

  const summaryMode = args.includes('--summary');
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const dirIdx = args.indexOf('--dir');
  const from = fromIdx !== -1 ? args[fromIdx + 1] : undefined;
  const to = toIdx !== -1 ? args[toIdx + 1] : undefined;
  const sessionsDir = dirIdx !== -1 && args[dirIdx + 1] !== undefined ? args[dirIdx + 1] : DEFAULT_SESSIONS_DIR;

  if ((from && !isValidDateStr(from)) || (to && !isValidDateStr(to))) {
    console.error('  Invalid --from/--to date — expected YYYY-MM-DD');
    process.exit(1);
  }

  const result = computeWeeklyDigest({ from, to, sessionsDir });

  if (summaryMode) {
    printSummary(result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
