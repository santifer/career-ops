#!/usr/bin/env node

/**
 * test-all.mjs — Comprehensive test suite for career-ops
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, dashboard, data contract, personal data, paths.
 *
 * Usage:
 *   node test-all.mjs           # Run all tests
 *   node test-all.mjs --quick   # Skip dashboard build (faster)
 */

import { execSync, execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');
const NODE = process.execPath;

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

function run(cmd, args = [], opts = {}) {
  try {
    if (Array.isArray(args) && args.length > 0) {
      return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
    }
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function fileExists(path) { return existsSync(join(ROOT, path)); }
function readFile(path) { return readFileSync(join(ROOT, path), 'utf-8'); }

console.log('\n🧪 career-ops test suite\n');

// ── 1. SYNTAX CHECKS ────────────────────────────────────────────

console.log('1. Syntax checks');

const mjsFiles = readdirSync(ROOT).filter(f => f.endsWith('.mjs'));
for (const f of mjsFiles) {
  const result = run(NODE, ['--check', f]);
  if (result !== null) {
    pass(`${f} syntax OK`);
  } else {
    fail(`${f} has syntax errors`);
  }
}

// ── 2. SCRIPT EXECUTION ─────────────────────────────────────────

console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { name: 'cv-sync-check.mjs', expectExit: 1, allowFail: true }, // fails without cv.md (normal in repo)
  { name: 'verify-pipeline.mjs', expectExit: 0 },
  { name: 'normalize-statuses.mjs', expectExit: 0 },
  { name: 'dedup-tracker.mjs', expectExit: 0 },
  { name: 'merge-tracker.mjs', expectExit: 0 },
  { name: 'analyze-patterns.mjs --self-test', expectExit: 0 },
  { name: 'update-system.mjs check', expectExit: 0 },
];

for (const { name, allowFail } of scripts) {
  const result = run(NODE, name.split(' '), { stdio: ['pipe', 'pipe', 'pipe'] });
  if (result !== null) {
    pass(`${name} runs OK`);
  } else if (allowFail) {
    warn(`${name} exited with error (expected without user data)`);
  } else {
    fail(`${name} crashed`);
  }
}

// ── 3. LIVENESS CLASSIFICATION ──────────────────────────────────

console.log('\n3. Liveness classification');

try {
  const { classifyLiveness } = await import(pathToFileURL(join(ROOT, 'liveness-core.mjs')).href);

  const expiredChromeApply = classifyLiveness({
    finalUrl: 'https://example.com/jobs/closed-role',
    bodyText: 'Company Careers\nApply\nThe job you are looking for is no longer open.',
    applyControls: [],
  });
  if (expiredChromeApply.result === 'expired') {
    pass('Expired pages are not revived by nav/footer "Apply" text');
  } else {
    fail(`Expired page misclassified as ${expiredChromeApply.result}`);
  }

  const activeWorkdayPage = classifyLiveness({
    finalUrl: 'https://example.workday.com/job/123',
    bodyText: [
      '663 JOBS FOUND',
      'Senior AI Engineer',
      'Join our applied AI team to ship production systems, partner with customers, and own delivery across evaluation, deployment, and reliability.',
    ].join('\n'),
    applyControls: ['Apply for this Job'],
  });
  if (activeWorkdayPage.result === 'active') {
    pass('Visible apply controls still keep real job pages active');
  } else {
    fail(`Active job page misclassified as ${activeWorkdayPage.result}`);
  }

  const closedMycareersfuture = classifyLiveness({
    finalUrl: 'https://www.mycareersfuture.gov.sg/job/engineering/senior-staff-embedded-software-engineer',
    bodyText: [
      'Senior Staff Embedded Software Engineer',
      'MaxLinear Asia Singapore Private Limited',
      '9 applications    Posted 27 Oct 2025    Closed on 26 Nov 2025',
      'Applications have closed for this job',
      'Log in to Apply',
      "You'll need to log in with Singpass to verify your identity.",
      'Roles & Responsibilities: design, develop and maintain embedded firmware for broadband communications ICs.',
    ].join('\n'),
    applyControls: ['Log in to Apply'],
  });
  if (closedMycareersfuture.result === 'expired') {
    pass('Closed postings with "Applications have closed" banner are detected');
  } else {
    fail(`Closed mycareersfuture posting misclassified as ${closedMycareersfuture.result}`);
  }
} catch (e) {
  fail(`Liveness classification tests crashed: ${e.message}`);
}

// ── 4. DASHBOARD BUILD ──────────────────────────────────────────

if (!QUICK) {
  console.log('\n4. Dashboard build');
  const goBuild = run('cd dashboard && go build -o /tmp/career-dashboard-test . 2>&1');
  if (goBuild !== null) {
    pass('Dashboard compiles');
  } else {
    fail('Dashboard build failed');
  }
} else {
  console.log('\n4. Dashboard build (skipped --quick)');
}

// ── 5. DATA CONTRACT ────────────────────────────────────────────

console.log('\n5. Data contract validation');

// Check system files exist
const systemFiles = [
  'CLAUDE.md', 'VERSION', 'DATA_CONTRACT.md',
  'modes/_shared.md', 'modes/_profile.template.md',
  'modes/oferta.md', 'modes/pdf.md', 'modes/scan.md',
  'templates/states.yml', 'templates/cv-template.html',
  '.claude/skills/career-ops/SKILL.md',
];

for (const f of systemFiles) {
  if (fileExists(f)) {
    pass(`System file exists: ${f}`);
  } else {
    fail(`Missing system file: ${f}`);
  }
}

// Check user files are NOT tracked (gitignored)
const userFiles = [
  'config/profile.yml', 'modes/_profile.md', 'portals.yml',
];
for (const f of userFiles) {
  const tracked = run('git', ['ls-files', f]);
  if (tracked === '') {
    pass(`User file gitignored: ${f}`);
  } else if (tracked === null) {
    pass(`User file gitignored: ${f}`);
  } else {
    fail(`User file IS tracked (should be gitignored): ${f}`);
  }
}

// ── 6. PERSONAL DATA LEAK CHECK ─────────────────────────────────

console.log('\n6. Personal data leak check');

const leakPatterns = [
  'Santiago', 'santifer.io', 'Santifer iRepair', 'Zinkee', 'ALMAS',
  'hi@santifer.io', '688921377', '/Users/santifer/',
];

const scanExtensions = ['md', 'yml', 'html', 'mjs', 'sh', 'go', 'json'];
const allowedFiles = [
  // English README + localized translations (all legitimately credit Santiago)
  'README.md', 'README.es.md', 'README.ja.md', 'README.ko-KR.md',
  'README.pt-BR.md', 'README.ru.md', 'README.cn.md', 'README.ua.md',
  'README.zh-TW.md',
  // Standard project files
  'LICENSE', 'CITATION.cff', 'CONTRIBUTING.md',
  'package.json', '.github/FUNDING.yml', 'CLAUDE.md', 'AGENTS.md', 'go.mod', 'test-all.mjs',
  'CHANGELOG.md', 'TRADEMARK.md', '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  // Community / governance files (added in v1.3.0, all legitimately reference the maintainer)
  'CODE_OF_CONDUCT.md', 'GOVERNANCE.md', 'SECURITY.md', 'SUPPORT.md',
  '.github/SECURITY.md',
  // Dashboard credit string
  'dashboard/internal/ui/screens/pipeline.go',
  'dashboard/internal/ui/screens/progress.go',
];

// Build pathspec for git grep — only scan tracked files matching these
// extensions. This is what `grep -rn` was trying to do, but git-aware:
// untracked files (debate artifacts, AI tool scratch, local plans/) and
// gitignored files can't trigger false positives because they were never
// going to reach a commit anyway.
const grepPathspec = scanExtensions.map(e => `'*.${e}'`).join(' ');

let leakFound = false;
for (const pattern of leakPatterns) {
  const result = run(
    `git grep -n "${pattern}" -- ${grepPathspec} 2>/dev/null`
  );
  if (result) {
    for (const line of result.split('\n')) {
      const file = line.split(':')[0];
      if (allowedFiles.some(a => file.includes(a))) continue;
      if (file.includes('dashboard/go.mod')) continue;
      warn(`Possible personal data in ${file}: "${pattern}"`);
      leakFound = true;
    }
  }
}
if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

// ── 7. ABSOLUTE PATH CHECK ──────────────────────────────────────

console.log('\n7. Absolute path check');

// Same git grep approach: only scans tracked files. Untracked AI tool
// outputs, local debate artifacts, etc. can't false-positive here.
const absPathResult = run(
  `git grep -n "/Users/" -- '*.mjs' '*.sh' '*.md' '*.go' '*.yml' 2>/dev/null | grep -v README.md | grep -v LICENSE | grep -v CLAUDE.md | grep -v test-all.mjs`
);
if (!absPathResult) {
  pass('No absolute paths in code files');
} else {
  for (const line of absPathResult.split('\n').filter(Boolean)) {
    fail(`Absolute path: ${line.slice(0, 100)}`);
  }
}

// ── 8. MODE FILE INTEGRITY ──────────────────────────────────────

console.log('\n8. Mode file integrity');

const expectedModes = [
  '_shared.md', '_profile.template.md', 'oferta.md', 'pdf.md', 'scan.md',
  'batch.md', 'apply.md', 'auto-pipeline.md', 'contacto.md', 'deep.md',
  'ofertas.md', 'pipeline.md', 'project.md', 'tracker.md', 'training.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`Mode exists: ${mode}`);
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

// Check _shared.md references _profile.md
const shared = readFile('modes/_shared.md');
if (shared.includes('_profile.md')) {
  pass('_shared.md references _profile.md');
} else {
  fail('_shared.md does NOT reference _profile.md');
}

// ── 9. LOCAL PARSER CONTRACT ────────────────────────────────────

console.log('\n9. Local parser contract');

const scanScript = readFile('scan.mjs');
if (
  scanScript.includes('typeof company.name !== \'string\'') &&
  scanScript.includes('company.name.trim()') &&
  scanScript.includes('company.name.toLowerCase()')
) {
  pass('scan.mjs guards company names before filtering');
} else {
  fail('scan.mjs does not guard company names before filtering');
}

if (
  scanScript.includes("skipIds: ['local-parser']") &&
  scanScript.includes('local parser failed, used API fallback') &&
  scanScript.includes('resolveProvider(company, providers')
) {
  pass('scan.mjs falls back to ATS API when local parser fails');
} else {
  fail('scan.mjs does not fall back to ATS API when local parser fails');
}

if (fileExists('providers/local-parser.mjs')) {
  pass('local-parser provider module exists');
} else {
  fail('local-parser provider module is missing');
}

const scanMode = fileExists('modes/scan.md') ? readFile('modes/scan.md') : '';
if (
  scanMode.includes('local_parser_ok') &&
  scanMode.includes('no repetir scraping caro') &&
  scanMode.includes('nombre no listado en `local_parser_ok`')
) {
  pass('scan.md skips expensive levels after successful local parser');
} else {
  fail('scan.md missing local_parser_ok skip rules for agent scan');
}

if (!fileExists('scripts/parsers/cohere_jobs.py')) {
  pass('Cohere parser example is not bundled as a runtime script');
} else {
  fail('Cohere parser example is still bundled as a runtime script');
}

const portalExample = readFile('templates/portals.example.yml');
if (
  !portalExample.includes('cohere_jobs.py') &&
  portalExample.includes('scripts/parsers/example-js-company-jobs.js') &&
  portalExample.includes('scripts/parsers/example_python_company_jobs.py') &&
  portalExample.includes('already know their target careers URL')
) {
  pass('portals example documents a generic local parser contract');
} else {
  fail('portals example still points at a bundled Cohere parser');
}

// ── 10. AGENTS.md INTEGRITY ─────────────────────────────────────

console.log('\n10. AGENTS.md integrity');

const agents = readFile('AGENTS.md');
const requiredSections = [
  'Data Contract', 'Update Check', 'Ethical Use',
  'Offer Verification', 'Canonical States', 'TSV Format',
  'First Run', 'Onboarding',
];

for (const section of requiredSections) {
  if (agents.includes(section)) {
    pass(`AGENTS.md has section: ${section}`);
  } else {
    fail(`AGENTS.md missing section: ${section}`);
  }
}

// ── 11. APPLY PREFILL CONTRACT ───────────────────────────────────

console.log('\n11. Apply prefill contract');

try {
  const { ACTIVE_STATUSES, LANE_STATUSES } = await import(pathToFileURL(join(ROOT, 'queue-store.mjs')).href);
  const states = readFile('templates/states.yml');
  const formFill = readFile('form-fill.mjs');
  const dashboardServer = readFile('dashboard-server.mjs');
  const dashboardApp = readFile('dashboard/web/app.js');

  if (ACTIVE_STATUSES.has('prefilled') && LANE_STATUSES.has('prefilled')) {
    pass('prefilled remains an active visible queue status');
  } else {
    fail('prefilled missing from active or lane queue statuses');
  }

  if (/id:\s+prefilled/.test(states)) {
    pass('states.yml declares prefilled');
  } else {
    fail('states.yml missing prefilled');
  }

  if (/const fillStatus = HEADLESS \? 'prefilled' : 'filled'/.test(formFill)) {
    pass('headless form-fill records prefilled, not filled');
  } else {
    fail('headless form-fill no longer records prefilled');
  }

  if (/if \(HEADLESS\)[\s\S]{0,400}process\.exit\(1\)/.test(formFill)) {
    pass('headless login timeout exits so parallel runs do not hang');
  } else {
    fail('headless login timeout exit guard missing');
  }

  if (/decision === 'submitted' && role\.status === 'prefilled'/.test(dashboardServer)) {
    pass('dashboard API blocks submitted decisions for prefilled roles');
  } else {
    fail('dashboard API prefilled submit gate missing');
  }

  if (/submitBtn\.disabled = isPrefilled/.test(dashboardApp)) {
    pass('dashboard UI disables submit for prefilled roles');
  } else {
    fail('dashboard UI prefilled submit disable missing');
  }

  if (
    formFill.includes('^(yes|true|1|checked|check|on)\\b') &&
    formFill.includes('^(no|false|0|unchecked|uncheck|off)\\b')
  ) {
    pass('checkbox mapper accepts leading yes/no consent phrases');
  } else {
    fail('checkbox mapper no longer accepts leading yes/no consent phrases');
  }
} catch (e) {
  fail(`Apply prefill contract checks crashed: ${e.message}`);
}

// ── 12. VERSION FILE ─────────────────────────────────────────────

console.log('\n12. Version file');

if (fileExists('VERSION')) {
  const version = readFile('VERSION').trim();
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    pass(`VERSION is valid semver: ${version}`);
  } else {
    fail(`VERSION is not valid semver: "${version}"`);
  }
} else {
  fail('VERSION file missing');
}

// ── 13. LOCATION FILTER — always_allow tier ───────────────────────

console.log('\n13. Location filter — always_allow tier');

try {
  const { buildLocationFilter } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);

  const filter = buildLocationFilter({
    always_allow: ['belgium', 'brussels'],
    allow: ['europe', 'emea', 'remote'],
    block: ['france', 'germany', 'united states'],
  });

  // Case 1: home-region passes regardless of other text
  if (filter('Brussels, Belgium') === true) pass('Brussels, Belgium passes (always_allow hit)');
  else fail('Brussels, Belgium should pass');

  // Case 2: always_allow wins over block (THE motivating case for this tier)
  if (filter('Remote, Belgium or France') === true) pass('Remote, Belgium or France passes (always_allow beats block)');
  else fail('Remote, Belgium or France should pass — always_allow must win over block');

  // Case 3: no always_allow hit, block still rejects
  if (filter('Paris, France') === false) pass('Paris, France is rejected (block still applies)');
  else fail('Paris, France should be rejected');

  // Case 4: empty location → pass (existing semantics, unchanged)
  if (filter('') === true) pass('empty location passes (unchanged semantics)');
  else fail('empty location should pass');

  // Case 5: case-insensitivity
  if (filter('BRUSSELS, BELGIUM') === true) pass('case-insensitive match works');
  else fail('case-insensitive match failed');

  // Case 6: backward compatibility — no always_allow key behaves like stock allow/block
  const stockFilter = buildLocationFilter({
    allow: ['europe', 'remote'],
    block: ['france'],
  });
  if (stockFilter('Remote, Belgium or France') === false) pass('without always_allow, block still wins (backward compatible)');
  else fail('without always_allow, behaviour must match stock allow/block (block wins)');

  // Case 7: null/missing locationFilter → pass-all filter (early-return path)
  const nullFilter = buildLocationFilter(null);
  if (nullFilter('Anywhere on Earth') === true && nullFilter('') === true) {
    pass('null locationFilter returns a pass-all filter (early-return path)');
  } else {
    fail('null locationFilter should return a pass-all filter');
  }

  // Case 8: string-instead-of-array → wrapped to a 1-item list
  const stringFilter = buildLocationFilter({ always_allow: 'belgium', block: ['france'] });
  if (stringFilter('Remote, Belgium or France') === true) {
    pass('always_allow as a bare string is wrapped to a single-item list');
  } else {
    fail('always_allow as a bare string should still work');
  }

  // Case 9: null/non-string items are filtered out (no crash, no false matches)
  const messyFilter = buildLocationFilter({
    always_allow: [null, 'belgium', 42, undefined],
    block: ['france', null, 7],
  });
  if (messyFilter('Brussels, Belgium') === true && messyFilter('Paris, France') === false) {
    pass('non-string entries (null, numbers, undefined) are filtered out without crashing');
  } else {
    fail('mixed-type keyword lists should not crash and should still match string entries');
  }

  // Case 10: all-null/non-string list → empty after normalization (no false rejects)
  const allBadFilter = buildLocationFilter({ block: [null, 42, undefined], allow: ['remote'] });
  if (allBadFilter('Remote') === true) {
    pass('a block list with only non-string entries normalizes to [] (no false rejects)');
  } else {
    fail('non-string-only block list should not cause rejection');
  }

  // Case 11: empty / whitespace-only entries are dropped (would otherwise pass-all via includes(''))
  const emptyKeywordFilter = buildLocationFilter({
    always_allow: ['', '  '],
    allow: ['remote'],
    block: ['france'],
  });
  if (emptyKeywordFilter('Paris, France') === false) {
    pass('empty/whitespace always_allow entries are dropped (no pass-all via includes(""))');
  } else {
    fail('empty always_allow entries should NOT bypass block — would have made the filter pass-all');
  }

  // Case 12: surrounding whitespace is trimmed so the keyword still matches
  const whitespaceFilter = buildLocationFilter({
    always_allow: ['  Belgium  ', '\tBrussels\n'],
    block: ['france'],
  });
  if (whitespaceFilter('Remote, Belgium or France') === true) {
    pass('whitespace-padded keywords still match after trim');
  } else {
    fail('"  Belgium  " should be trimmed and still match "Remote, Belgium or France"');
  }

  // Case 13: whitespace-only location is treated as missing (pass-all-tiers)
  if (filter('   \t  ') === true) pass('whitespace-only location passes (treated as missing)');
  else fail('whitespace-only location should pass');

  // Case 14: non-string location (number/object/null) → pass without throwing
  let crashed = false;
  try {
    const r1 = filter(42);
    const r2 = filter({ city: 'Brussels' });
    const r3 = filter(null);
    const r4 = filter(undefined);
    if (r1 === true && r2 === true && r3 === true && r4 === true) {
      pass('non-string location values (number, object, null, undefined) pass without throwing');
    } else {
      fail(`non-string location results: number=${r1}, object=${r2}, null=${r3}, undefined=${r4}`);
    }
  } catch (e) {
    crashed = true;
    fail(`non-string location crashed: ${e.message}`);
  }

  // Case 15: a malformed location (e.g. legacy object) does NOT bypass block when interpreted naively —
  // the guard returns true (pass) BEFORE block/allow even run, which is correct: scoring/eval happens
  // downstream from the scan filter, so malformed locations should fall through to the manual evaluation
  // step rather than being silently dropped here.
  if (filter(42) === true) pass('non-string locations are passed through to downstream evaluation, not silently dropped');
  else fail('non-string locations should pass through');

} catch (e) {
  fail(`always_allow tests crashed: ${e.message}`);
}

// ── 14. SUPABASE QUEUE STORE CONTRACT ───────────────────────────

console.log('\n14. Supabase queue store contract');

try {
  const sqlPath = 'supabase/migrations/202606060001_queue_store.sql';
  const sql = readFile(sqlPath);
  const queueStore = readFile('queue-store.mjs');
  const supabaseClient = readFile('supabase-client.mjs');
  const migrationScript = readFile('migrate-queue-to-supabase.mjs');

  if (
    sql.includes('create table if not exists public.active_roles') &&
    sql.includes('create table if not exists public.seen_urls') &&
    sql.includes("check (status in ('new','scored','prepare-queued','prepared','prefilled','filled'))")
  ) {
    pass('Supabase SQL creates active_roles/seen_urls with active status CHECK');
  } else {
    fail('Supabase SQL missing queue tables or active status CHECK');
  }

  if (
    sql.includes('source text not null default') &&
    sql.includes('idx_active_roles_source')
  ) {
    pass('active_roles has source column for discovery-source agnostic inserts');
  } else {
    fail('active_roles missing source column/index');
  }

  if (
    sql.includes('career_ops_cron') &&
    sql.includes('career_ops_dashboard') &&
    sql.includes("with check (status = 'new')") &&
    sql.includes("using (status = 'new')")
  ) {
    pass('Supabase SQL declares split cron/dashboard RLS roles and new-row cron limits');
  } else {
    fail('Supabase SQL missing split RLS role policies');
  }

  if (
    sql.includes('active_roles_set_updated_at') &&
    sql.includes('public.save_queue') &&
    sql.includes('security invoker')
  ) {
    pass('Supabase SQL has updated_at trigger and transactional queue RPC');
  } else {
    fail('Supabase SQL missing updated_at trigger or save_queue RPC');
  }

  if (!/\breason\s+(text|varchar|jsonb)\b/i.test(sql) && !/\bdrafts\s+(text|varchar|jsonb)\b/i.test(sql)) {
    pass('PII fields reason/drafts are not cloud columns');
  } else {
    fail('PII fields leaked into Supabase schema');
  }

  const { CLOUD_ROLE_FIELDS, LOCAL_ONLY_ROLE_FIELDS } = await import(pathToFileURL(join(ROOT, 'queue-store.mjs')).href);
  if (
    queueStore.includes('Default-local guard') &&
    CLOUD_ROLE_FIELDS.has('source') &&
    !CLOUD_ROLE_FIELDS.has('reason') &&
    !CLOUD_ROLE_FIELDS.has('drafts') &&
    LOCAL_ONLY_ROLE_FIELDS.has('reason') &&
    LOCAL_ONLY_ROLE_FIELDS.has('drafts')
  ) {
    pass('queue-store has allowlist guard and keeps reason local-only');
  } else {
    fail('queue-store PII allowlist/default-local guard missing or reason cloud-allowed');
  }

  if (
    supabaseClient.includes('SUPABASE_DASHBOARD_KEY') &&
    supabaseClient.includes('SUPABASE_CRON_PUBLISHABLE_KEY') &&
    supabaseClient.includes('SUPABASE_CRON_JWT') &&
    !supabaseClient.includes('SUPABASE_SERVICE_KEY')
  ) {
    pass('supabase-client uses split dashboard/cron env keys, not service-role fallback');
  } else {
    fail('supabase-client env contract should use split keys without service-role fallback');
  }

  if (
    migrationScript.includes('DRY RUN ONLY') &&
    migrationScript.includes('--apply') &&
    migrationScript.includes('active_roles') &&
    migrationScript.includes('local_enrichments')
  ) {
    pass('migration script is dry-run-first and prints cloud/sidecar plan');
  } else {
    fail('migration script missing dry-run-first insert plan behavior');
  }

  const integration = run(NODE, ['test-supabase-store.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (integration !== null) {
    pass('Supabase round-trip integration test script exits cleanly (skips without test env)');
  } else {
    fail('Supabase round-trip integration test script failed');
  }

  // ── Cron credential unit tests (no network) ──
  // Temporarily set env vars, call getSupabaseEnv, then restore.
  const { getSupabaseEnv } = await import(pathToFileURL(join(ROOT, 'supabase-client.mjs')).href);
  const savedEnv = { ...process.env };
  const restoreEnv = () => {
    for (const k of ['SUPABASE_URL', 'SUPABASE_CRON_PUBLISHABLE_KEY', 'SUPABASE_CRON_JWT']) {
      if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k];
      else delete process.env[k];
    }
  };

  try {
    // Test: cron returns distinct apikey and authToken
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_CRON_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon';
    process.env.SUPABASE_CRON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.cron_role';
    const cronEnv = getSupabaseEnv('cron');
    if (
      cronEnv.apikey === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon' &&
      cronEnv.authToken === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.cron_role' &&
      cronEnv.apikey !== cronEnv.authToken
    ) {
      pass('getSupabaseEnv(cron) returns distinct apikey and authToken');
    } else {
      fail('getSupabaseEnv(cron) should return distinct apikey vs authToken');
    }

    // Test: sb_secret_ on publishable key throws
    process.env.SUPABASE_CRON_PUBLISHABLE_KEY = 'sb_secret_bad_value';
    process.env.SUPABASE_CRON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.cron_role';
    let threw = false;
    try { getSupabaseEnv('cron'); } catch (e) {
      if (e.message.includes('sb_secret_')) threw = true;
    }
    if (threw) pass('getSupabaseEnv(cron) rejects sb_secret_ on publishable key');
    else fail('getSupabaseEnv(cron) should reject sb_secret_ on publishable key');

    // Test: sb_secret_ on JWT throws
    process.env.SUPABASE_CRON_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon';
    process.env.SUPABASE_CRON_JWT = 'sb_secret_bad_jwt';
    threw = false;
    try { getSupabaseEnv('cron'); } catch (e) {
      if (e.message.includes('sb_secret_')) threw = true;
    }
    if (threw) pass('getSupabaseEnv(cron) rejects sb_secret_ on JWT');
    else fail('getSupabaseEnv(cron) should reject sb_secret_ on JWT');

    // Test: missing SUPABASE_CRON_JWT throws
    process.env.SUPABASE_CRON_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon';
    delete process.env.SUPABASE_CRON_JWT;
    threw = false;
    try { getSupabaseEnv('cron'); } catch (e) {
      if (e.message.includes('SUPABASE_CRON_JWT')) threw = true;
    }
    if (threw) pass('getSupabaseEnv(cron) fails loud when SUPABASE_CRON_JWT is missing');
    else fail('getSupabaseEnv(cron) should fail loud when SUPABASE_CRON_JWT is missing');

    // Test: service_role JWT on SUPABASE_CRON_JWT throws
    const srPayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    const srJwt = `eyJhbGciOiJFUzI1NiJ9.${srPayload}.fakesig`;
    process.env.SUPABASE_CRON_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon';
    process.env.SUPABASE_CRON_JWT = srJwt;
    threw = false;
    try { getSupabaseEnv('cron'); } catch (e) {
      if (e.message.includes('service_role')) threw = true;
    }
    if (threw) pass('getSupabaseEnv(cron) rejects service_role JWT on SUPABASE_CRON_JWT');
    else fail('getSupabaseEnv(cron) should reject service_role JWT on SUPABASE_CRON_JWT');

    // Test: service_role JWT on SUPABASE_CRON_PUBLISHABLE_KEY throws
    process.env.SUPABASE_CRON_PUBLISHABLE_KEY = srJwt;
    process.env.SUPABASE_CRON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.cron_role';
    threw = false;
    try { getSupabaseEnv('cron'); } catch (e) {
      if (e.message.includes('service_role')) threw = true;
    }
    if (threw) pass('getSupabaseEnv(cron) rejects service_role JWT on SUPABASE_CRON_PUBLISHABLE_KEY');
    else fail('getSupabaseEnv(cron) should reject service_role JWT on SUPABASE_CRON_PUBLISHABLE_KEY');
  } finally {
    restoreEnv();
  }
} catch (e) {
  fail(`Supabase queue store contract checks crashed: ${e.message}`);
}

// ── 15. API-CRON CONTRACT ────────────────────────────────────────

console.log('\n15. API-cron contract');

// 15a. mint-cron-jwt.mjs: importable export + CLI guard
try {
  const mintMod = await import(pathToFileURL(join(ROOT, 'mint-cron-jwt.mjs')).href);
  if (typeof mintMod.mintCronJwt === 'function') {
    pass('mint-cron-jwt.mjs exports mintCronJwt function');
  } else {
    fail('mint-cron-jwt.mjs does not export mintCronJwt');
  }

  // Verify the CLI guard is present (import.meta.url check)
  const mintSrc = readFile('mint-cron-jwt.mjs');
  if (mintSrc.includes('import.meta.url') && mintSrc.includes('process.argv[1]')) {
    pass('mint-cron-jwt.mjs has import.meta.url CLI guard');
  } else {
    fail('mint-cron-jwt.mjs missing import.meta.url CLI guard — importing it will run the CLI');
  }

  // Verify env-key source is present
  if (mintSrc.includes('CAREER_OPS_SIGNING_KEY')) {
    pass('mint-cron-jwt.mjs supports CAREER_OPS_SIGNING_KEY env-key source');
  } else {
    fail('mint-cron-jwt.mjs missing CAREER_OPS_SIGNING_KEY env-key source');
  }

  // Verify --exp-seconds flag is present
  if (mintSrc.includes('--exp-seconds')) {
    pass('mint-cron-jwt.mjs supports --exp-seconds flag');
  } else {
    fail('mint-cron-jwt.mjs missing --exp-seconds flag');
  }
} catch (e) {
  fail(`mint-cron-jwt.mjs import or source checks crashed: ${e.message}`);
}

// 15b. queue-store.mjs: insertNewStubsCron export + loadQueueSeenSets role param
try {
  const qsMod = await import(pathToFileURL(join(ROOT, 'queue-store.mjs')).href);
  if (typeof qsMod.insertNewStubsCron === 'function') {
    pass('queue-store.mjs exports insertNewStubsCron');
  } else {
    fail('queue-store.mjs missing insertNewStubsCron export');
  }

  // Check loadQueueSeenSets signature accepts a role option
  const qsSrc = readFile('queue-store.mjs');
  if (qsSrc.includes("role = 'dashboard'") && qsSrc.includes('loadQueueSeenSets')) {
    pass('loadQueueSeenSets accepts { role } option with dashboard default');
  } else {
    fail('loadQueueSeenSets does not accept { role } option');
  }

  // Check insertNewStubsCron has the status guard
  if (qsSrc.includes("cloud.status !== 'new'")) {
    pass('insertNewStubsCron has hard status guard (only inserts status=new)');
  } else {
    fail('insertNewStubsCron missing status guard');
  }

  // Check it uses resolution=ignore-duplicates (ON CONFLICT DO NOTHING)
  if (qsSrc.includes('resolution=ignore-duplicates')) {
    pass('insertNewStubsCron uses resolution=ignore-duplicates (idempotent insert)');
  } else {
    fail('insertNewStubsCron missing resolution=ignore-duplicates header');
  }

  // Check it uses return=representation (true inserted count, not overstating)
  if (qsSrc.includes('return=representation')) {
    pass('insertNewStubsCron uses return=representation (accurate inserted count)');
  } else {
    fail('insertNewStubsCron missing return=representation — inserted count will overstate duplicates');
  }

  // Check it returns attempted (not just inserted)
  if (qsSrc.includes("attempted: rows.length")) {
    pass('insertNewStubsCron returns attempted count (distinct from inserted)');
  } else {
    fail('insertNewStubsCron missing attempted field — caller cannot tell dedup rate');
  }

  // Check it does NOT call save_queue
  const insertFnMatch = qsSrc.match(/export async function insertNewStubsCron[\s\S]+?^}/m);
  if (insertFnMatch && !insertFnMatch[0].includes('save_queue')) {
    pass('insertNewStubsCron does not call save_queue');
  } else {
    fail('insertNewStubsCron must not call save_queue (cron has no execute grant on it)');
  }
} catch (e) {
  fail(`queue-store.mjs cron checks crashed: ${e.message}`);
}

// 15c. queue-ingest.mjs: --cron and --api-only flags present
try {
  const qiSrc = readFile('queue-ingest.mjs');
  if (qiSrc.includes('--cron') && qiSrc.includes('CRON_MODE')) {
    pass('queue-ingest.mjs has --cron flag');
  } else {
    fail('queue-ingest.mjs missing --cron flag');
  }
  if (qiSrc.includes('--api-only') && qiSrc.includes('API_ONLY')) {
    pass('queue-ingest.mjs has --api-only flag');
  } else {
    fail('queue-ingest.mjs missing --api-only flag');
  }
  if (qiSrc.includes("atsInfo.ats === 'custom'") && qiSrc.includes('API_ONLY')) {
    pass('queue-ingest.mjs skips custom ATS when --api-only is set');
  } else {
    fail('queue-ingest.mjs missing custom-ATS skip for --api-only');
  }
  if (qiSrc.includes('insertNewStubsCron')) {
    pass('queue-ingest.mjs calls insertNewStubsCron in cron mode');
  } else {
    fail('queue-ingest.mjs missing insertNewStubsCron call');
  }

  // Cron stub must carry jd_text (durable) and null jd_path (ephemeral runner)
  if (qiSrc.includes('jd_text: jdData.description') && qiSrc.includes('jd_path: null')) {
    pass('queue-ingest.mjs cron stub sets jd_text and nulls jd_path');
  } else {
    fail('queue-ingest.mjs cron stub missing jd_text or still sets jd_path — scoring will fail after load from Supabase');
  }

  // Local write must be guarded (CRON_MODE skips the ephemeral jds/ write)
  if (qiSrc.includes('!CRON_MODE') && qiSrc.includes('writeFileSync')) {
    pass('queue-ingest.mjs guards local jds/ write with !CRON_MODE');
  } else {
    fail('queue-ingest.mjs missing CRON_MODE guard on writeFileSync — cron wastes I/O writing ephemeral files');
  }
} catch (e) {
  fail(`queue-ingest.mjs cron checks crashed: ${e.message}`);
}

// 15e. modes/queue.md: jd_text fallback for scoring and prepare phases
try {
  const queueModeSrc = readFile('modes/queue.md');
  if (queueModeSrc.includes('jd_text') && queueModeSrc.includes('jd_path')) {
    pass('modes/queue.md references jd_text as fallback alongside jd_path');
  } else {
    fail('modes/queue.md missing jd_text fallback — cron-discovered roles will score with low-confidence (no local JD file)');
  }
} catch (e) {
  fail(`modes/queue.md jd_text check crashed: ${e.message}`);
}

// 15d. api-cron.yml: workflow file exists and has required structure
try {
  const wfPath = '.github/workflows/api-cron.yml';
  if (fileExists(wfPath)) {
    const wf = readFile(wfPath);
    if (wf.includes("cron: '0 19 * * *'")) pass('api-cron.yml has once-daily schedule');
    else fail('api-cron.yml missing or wrong schedule');

    if (wf.includes('environment: cron')) pass('api-cron.yml uses cron environment (secret scoping)');
    else fail('api-cron.yml missing environment: cron');

    if (wf.includes('SUPABASE_CRON_SIGNING_KEY') && wf.includes('CAREER_OPS_SIGNING_KEY')) {
      pass('api-cron.yml mints JWT from signing key env var');
    } else {
      fail('api-cron.yml missing signing key → mint step');
    }

    if (wf.includes('::add-mask::')) pass('api-cron.yml masks the minted JWT');
    else fail('api-cron.yml missing ::add-mask:: for minted JWT');

    if (wf.includes('--cron') && wf.includes('--api-only')) {
      pass('api-cron.yml runs queue-ingest with --cron --api-only');
    } else {
      fail('api-cron.yml missing --cron --api-only flags on queue-ingest');
    }

    if (!wf.includes("echo '${{") && !wf.includes('echo "${{')) {
      pass('api-cron.yml does not echo secrets inline (no injection risk)');
    } else {
      fail('api-cron.yml echoes secrets inline — injection risk');
    }

    // Hardening: least-privilege permissions block
    if (wf.includes('permissions:') && wf.includes('contents: read')) {
      pass('api-cron.yml has least-privilege permissions: contents: read');
    } else {
      fail('api-cron.yml missing permissions block — defaults to write-all on public repo');
    }

    // Hardening: persist-credentials: false (workflow never pushes)
    if (wf.includes('persist-credentials: false')) {
      pass('api-cron.yml sets persist-credentials: false on checkout');
    } else {
      fail('api-cron.yml missing persist-credentials: false — token unnecessarily persisted');
    }

    // Hardening: actions are SHA-pinned (not mutable tags)
    if (wf.includes('actions/checkout@') && /checkout@[0-9a-f]{40}/.test(wf)) {
      pass('api-cron.yml SHA-pins actions/checkout');
    } else {
      fail('api-cron.yml actions/checkout uses mutable tag — SHA-pin required on signing-key workflow');
    }

    // Hardening: --ignore-scripts on npm install
    if (wf.includes('--ignore-scripts')) {
      pass('api-cron.yml uses npm install --ignore-scripts');
    } else {
      fail('api-cron.yml missing --ignore-scripts on npm install — postinstall scripts can run during dep install');
    }
  } else {
    fail('api-cron.yml workflow file missing');
  }
} catch (e) {
  fail(`api-cron.yml checks crashed: ${e.message}`);
}

// ── 16. FORM-FILL SUBMIT SAFETY ─────────────────────────────────

console.log('\n16. Form-fill submit safety — FINAL_SUBMIT_DENYLIST and NAV_ALLOWLIST');

try {
  const { FINAL_SUBMIT_DENYLIST, NAV_ALLOWLIST } = await import(pathToFileURL(join(ROOT, 'form-fill.mjs')).href);

  // Every final-submit label must match FINAL_SUBMIT_DENYLIST
  const denyLabels = [
    'Submit', 'Submit application', 'Send application',
    'Confirm and submit', 'Submit my application', 'Apply now', 'Submit now',
  ];
  for (const label of denyLabels) {
    if (FINAL_SUBMIT_DENYLIST.test(label)) pass(`FINAL_SUBMIT_DENYLIST blocks "${label}"`);
    else fail(`FINAL_SUBMIT_DENYLIST does NOT block "${label}"`);
  }

  // Every nav label must match NAV_ALLOWLIST AND must NOT match FINAL_SUBMIT_DENYLIST
  const navLabels = [
    'Continue', 'Next', 'Save and continue', 'Save & continue',
    'Review', 'Proceed', 'Next step', 'Next page',
  ];
  for (const label of navLabels) {
    if (NAV_ALLOWLIST.test(label) && !FINAL_SUBMIT_DENYLIST.test(label)) {
      pass(`"${label}" is in NAV_ALLOWLIST and not in denylist`);
    } else if (!NAV_ALLOWLIST.test(label)) {
      fail(`"${label}" is NOT in NAV_ALLOWLIST — navigation will stall`);
    } else {
      fail(`"${label}" is in BOTH lists — denylist would block navigation`);
    }
  }

  // No overlap between the two lists (deny wins on any overlap — catch accidental collision)
  const overlap = navLabels.filter(l => FINAL_SUBMIT_DENYLIST.test(l));
  if (overlap.length === 0) pass('No NAV_ALLOWLIST label appears in FINAL_SUBMIT_DENYLIST (lists are disjoint)');
  else fail(`Overlap between nav and deny lists: ${overlap.join(', ')}`);

  // The click-path guard is still in place (source check — ensures the regex is actually used)
  const formFillSrc = readFile('form-fill.mjs');
  if (formFillSrc.includes('if (FINAL_SUBMIT_DENYLIST.test(text)) continue;')) {
    pass('findNavButton still contains FINAL_SUBMIT_DENYLIST short-circuit guard');
  } else {
    fail('findNavButton FINAL_SUBMIT_DENYLIST guard missing — click path could reach deny labels');
  }
} catch (e) {
  fail(`Form-fill submit safety checks crashed: ${e.message}`);
}

// ── 17. APPLY.MD DENYLIST PRESENCE + CODE/PROSE PARITY ──────────

console.log('\n17. apply.md denylist/allowlist presence and code-prose parity');

try {
  const applyMd = readFile('modes/apply.md');

  // apply.md must still contain all 4 canonical deny phrases from the procedure
  const proseDenyPhrases = ['Submit', 'Submit application', 'Send application', 'Confirm and submit'];
  for (const phrase of proseDenyPhrases) {
    if (applyMd.includes(phrase)) pass(`apply.md contains denylist phrase: "${phrase}"`);
    else fail(`apply.md MISSING denylist phrase: "${phrase}"`);
  }

  // apply.md must still contain the 4 allow phrases (multi-page navigation)
  const proseAllowPhrases = ['Continue', 'Next', 'Save and continue', 'Review'];
  for (const phrase of proseAllowPhrases) {
    if (applyMd.includes(phrase)) pass(`apply.md contains allowlist phrase: "${phrase}"`);
    else fail(`apply.md MISSING allowlist phrase: "${phrase}"`);
  }

  // Parity: every prose deny phrase must be matched by the code FINAL_SUBMIT_DENYLIST.
  // Code may be stricter (more phrases) — that is fine.
  // Code being LESS strict than prose is a regression gap.
  const { FINAL_SUBMIT_DENYLIST } = await import(pathToFileURL(join(ROOT, 'form-fill.mjs')).href);
  let parityOk = true;
  for (const phrase of proseDenyPhrases) {
    if (FINAL_SUBMIT_DENYLIST.test(phrase)) {
      pass(`Code FINAL_SUBMIT_DENYLIST covers prose phrase: "${phrase}"`);
    } else {
      fail(`CODE/PROSE PARITY GAP: FINAL_SUBMIT_DENYLIST does not match apply.md phrase "${phrase}"`);
      parityOk = false;
    }
  }
  if (parityOk) pass('Code FINAL_SUBMIT_DENYLIST is at least as strict as apply.md prose (no drift)');
} catch (e) {
  fail(`apply.md denylist checks crashed: ${e.message}`);
}

// ── 18. RESOLVER LAYER PRECEDENCE ───────────────────────────────

console.log('\n18. Resolver layer precedence (L1 rule → L2 cache → L3 model)');

try {
  const resolveSrc = readFile('queue-resolve.mjs');

  // Layer 1 (matchProfileRule) must appear before Layer 2 (l2candidates accumulator)
  const l1Idx     = resolveSrc.indexOf('matchProfileRule');
  const l2Idx     = resolveSrc.indexOf('l2candidates');
  const novelIdx  = resolveSrc.indexOf('novel.push');

  if (l1Idx !== -1 && l2Idx !== -1 && l1Idx < l2Idx) {
    pass('L1 matchProfileRule precedes L2 candidate accumulation in queue-resolve');
  } else {
    fail('L1 matchProfileRule does NOT precede L2 — resolver layer order broken');
  }

  if (l2Idx !== -1 && novelIdx !== -1 && l2Idx < novelIdx) {
    pass('L2 cache candidates precede L3 novel (model) path');
  } else {
    fail('L2 cache candidates do NOT precede L3 novel — resolver layer order broken');
  }

  // Distinct provenance labels for all 3 layers
  if (resolveSrc.includes("source: 'deterministic'") && resolveSrc.includes("source: 'cache'")) {
    pass('Resolver emits distinct provenance: deterministic (L1) and cache (L2)');
  } else {
    fail('Resolver missing provenance labels for deterministic or cache — traceability broken');
  }

  // form-fill provenanceLabel handles all 3 sources
  const formFillSrc = readFile('form-fill.mjs');
  if (
    formFillSrc.includes("if (source === 'cache')") &&
    formFillSrc.includes("if (source === 'model')") &&
    formFillSrc.includes('return `deterministic')
  ) {
    pass('form-fill provenanceLabel handles all 3 sources: cache, model, deterministic');
  } else {
    fail('form-fill provenanceLabel missing a source branch — provenance labels will be wrong');
  }
} catch (e) {
  fail(`Resolver layer precedence checks crashed: ${e.message}`);
}

// ── 19. CRON JWT MINT + VERIFY + RLS SUITE ──────────────────────

console.log('\n19. Cron JWT mint + verify and RLS suite');

try {
  const { mintCronJwt } = await import(pathToFileURL(join(ROOT, 'mint-cron-jwt.mjs')).href);
  const { generateKeyPair, exportJWK, jwtVerify, importJWK: importJwkJose } = await import('jose');

  // extractable: true is required so exportJWK can read the key material
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const privateJwk = { ...(await exportJWK(privateKey)), kid: 'test-key-gate' };
  const publicJwk  = { ...(await exportJWK(publicKey)),  kid: 'test-key-gate' };

  const EXP = 600; // 10 minutes — short-lived, different from 30-day default
  const before = Math.floor(Date.now() / 1000);
  const token  = await mintCronJwt({ jwk: privateJwk, kid: 'test-key-gate', expSeconds: EXP });
  const after  = Math.floor(Date.now() / 1000);

  const pubKey = await importJwkJose(publicJwk, 'ES256');
  const { payload } = await jwtVerify(token, pubKey);

  if (payload.role === 'career_ops_cron') {
    pass('mintCronJwt emits role: career_ops_cron claim');
  } else {
    fail(`mintCronJwt role claim wrong: ${payload.role}`);
  }

  const ttl = payload.exp - payload.iat;
  if (ttl === EXP) {
    pass(`mintCronJwt TTL matches requested expSeconds (${EXP}s)`);
  } else {
    fail(`mintCronJwt TTL mismatch: got ${ttl}s, expected ${EXP}s`);
  }

  if (payload.iat >= before && payload.iat <= after + 1) {
    pass('mintCronJwt iat is in the expected range (clock skew ≤1s)');
  } else {
    fail(`mintCronJwt iat out of range: ${payload.iat} vs window [${before}, ${after}]`);
  }

  // Token must be rejected by a different key pair
  const { privateKey: otherPriv } = await generateKeyPair('ES256', { extractable: true });
  const otherPub = await importJwkJose({ ...(await exportJWK(otherPriv)), kid: 'other' }, 'ES256');
  let verifyFailed = false;
  try { await jwtVerify(token, otherPub); } catch { verifyFailed = true; }
  if (verifyFailed) pass('mintCronJwt token is rejected by a different public key (signature verified)');
  else fail('mintCronJwt token accepted by wrong key — ES256 signature not enforced');
} catch (e) {
  fail(`Cron JWT mint+verify crashed: ${e.message}`);
}

// Wire test-cron-rls-negative.mjs into the gate (skip-clean if Supabase env absent)
try {
  const envPath = join(ROOT, '.env');
  const envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  const hasSupabaseCreds = [
    'SUPABASE_URL', 'SUPABASE_DASHBOARD_KEY',
    'SUPABASE_CRON_PUBLISHABLE_KEY', 'SUPABASE_CRON_JWT',
  ].every(k => envContent.includes(k + '='));

  if (!hasSupabaseCreds) {
    warn('test-cron-rls-negative.mjs skipped — Supabase env vars not in .env (expected on fresh clone)');
  } else {
    const result = run(NODE, ['test-cron-rls-negative.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
    if (result !== null) {
      pass('test-cron-rls-negative.mjs (RLS boundary suite) exits cleanly');
    } else {
      fail('test-cron-rls-negative.mjs exited with error — RLS boundary broken');
    }
  }
} catch (e) {
  fail(`test-cron-rls-negative.mjs wiring crashed: ${e.message}`);
}

// ── 20. QUEUE STATUS VOCABULARY ─────────────────────────────────

console.log('\n20. Queue status vocabulary');

try {
  const states = readFile('templates/states.yml');
  const sql    = readFile('supabase/migrations/202606060001_queue_store.sql');

  // states.yml must declare prefilled and filled as first-class ids
  for (const id of ['prefilled', 'filled', 'prepared']) {
    if (states.includes(`id: ${id}`)) pass(`states.yml declares queue status id: ${id}`);
    else fail(`states.yml missing queue status id: ${id}`);
  }

  // states.yml must register 'new' as an alias (via the 'saved' entry)
  if (states.includes('aliases: [new,') || states.includes('aliases: [new,') || /aliases:\s*\[new/.test(states)) {
    pass("states.yml maps 'new' as an alias (under saved)");
  } else {
    fail("states.yml does not map 'new' as an alias — Supabase 'new' rows have no canonical mapping");
  }

  // SQL CHECK constraint must still list all 6 active_roles statuses unchanged
  const sqlCheck = "check (status in ('new','scored','prepare-queued','prepared','prefilled','filled'))";
  if (sql.includes(sqlCheck)) {
    pass('SQL active_roles CHECK constraint enforces all 6 queue statuses (unchanged)');
  } else {
    fail('SQL CHECK constraint for active_roles statuses changed or missing');
  }

  // ACTIVE_STATUSES in queue-store.mjs must include the key fill-flow statuses
  const { ACTIVE_STATUSES, LANE_STATUSES } = await import(pathToFileURL(join(ROOT, 'queue-store.mjs')).href);
  for (const s of ['prepared', 'prefilled', 'filled']) {
    if (ACTIVE_STATUSES.has(s)) pass(`ACTIVE_STATUSES.has('${s}')`);
    else fail(`ACTIVE_STATUSES missing '${s}'`);
    if (LANE_STATUSES.has(s)) pass(`LANE_STATUSES.has('${s}')`);
    else fail(`LANE_STATUSES missing '${s}'`);
  }
} catch (e) {
  fail(`Queue status vocabulary checks crashed: ${e.message}`);
}

// ── 21. TRACKER WRITE-BACK ROUND-TRIP ───────────────────────────

console.log('\n21. Tracker write-back round-trip (column swap, dedup, non-canonical status)');

// Locate the applications.md path (mirrors merge-tracker.mjs logic)
const APPS_FILE_PATH = existsSync(join(ROOT, 'data/applications.md'))
  ? join(ROOT, 'data/applications.md')
  : join(ROOT, 'applications.md');
const ADDITIONS_DIR_PATH = join(ROOT, 'batch', 'tracker-additions');
const MERGED_DIR_PATH    = join(ROOT, 'batch', 'tracker-additions', 'merged');

// Back up real data before touching anything
const appsBackup = existsSync(APPS_FILE_PATH) ? readFileSync(APPS_FILE_PATH, 'utf-8') : null;

// Slugs for our test TSVs (large numbers unlikely to collide with real reports)
const TSV_LOW    = '990-merge-write-test-low.tsv';    // added first (lower sort key)
const TSV_HIGH   = '991-merge-write-test-high.tsv';   // duplicate with higher score (tests in-place update + column swap)
const TSV_NONCAN = '992-merge-write-test-noncan.tsv'; // non-canonical status

try {
  // 1. Replace applications.md with a clean header
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(APPS_FILE_PATH, [
    '# Applications Tracker',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '',
  ].join('\n'));

  mkdirSync(ADDITIONS_DIR_PATH, { recursive: true });

  // 2a. Write low-score TSV (standard format: num date company role STATUS SCORE pdf report notes)
  writeFileSync(join(ADDITIONS_DIR_PATH, TSV_LOW),
    '200\t2026-06-22\tMergeTestCo\tSoftware Engineer\tEvaluated\t3.5/5\t❌\t[200](reports/200-mergetestco-2026-06-22.md)\tBaseline row'
  );

  // 2b. Write high-score TSV with SWAPPED columns (SCORE then STATUS — tests column-swap heuristic)
  writeFileSync(join(ADDITIONS_DIR_PATH, TSV_HIGH),
    '201\t2026-06-22\tMergeTestCo\tSoftware Engineer\t4.8/5\tEvaluated\t✅\t[201](reports/201-mergetestco-2026-06-22.md)\tHigher score swapped-col row'
  );

  // 3. Run merge-tracker (processes low first → adds row; processes high → dup with higher score, updates in-place)
  const r1 = run(NODE, ['merge-tracker.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (r1 === null) {
    fail('merge-tracker.mjs crashed on write-back test (first run)');
  } else {
    const content = readFileSync(APPS_FILE_PATH, 'utf-8');

    if (content.includes('MergeTestCo')) {
      pass('merge-tracker.mjs wrote MergeTestCo row to applications.md');
    } else {
      fail('merge-tracker.mjs did not write MergeTestCo row');
    }

    if (content.includes('4.8/5')) {
      pass('merge-tracker.mjs higher-score in-place update won (4.8/5 > 3.5/5)');
    } else if (content.includes('3.5/5')) {
      fail('merge-tracker.mjs kept lower score — higher-score in-place update failed');
    } else {
      fail('merge-tracker.mjs did not write any score value');
    }

    if (content.includes('Evaluated')) {
      pass('merge-tracker.mjs preserved canonical Evaluated status after column-swap processing');
    } else {
      fail('merge-tracker.mjs lost canonical status — column-swap may be broken');
    }

    // TSVs should have been moved to merged/
    if (!existsSync(join(ADDITIONS_DIR_PATH, TSV_LOW)) && !existsSync(join(ADDITIONS_DIR_PATH, TSV_HIGH))) {
      pass('merge-tracker.mjs moved processed TSVs to merged/ (not left in tracker-additions/)');
    } else {
      fail('merge-tracker.mjs left processed TSVs in tracker-additions/ — cleanup failed');
    }
  }

  // 4. Non-canonical status test (separate run on fresh header)
  writeFileSync(APPS_FILE_PATH, [
    '# Applications Tracker',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '',
  ].join('\n'));

  writeFileSync(join(ADDITIONS_DIR_PATH, TSV_NONCAN),
    '203\t2026-06-22\tNonCanonCo\tBackend Dev\tApplying\t2.0/5\t❌\t[203](reports/203-noncanon-2026-06-22.md)\tNon-canonical status test'
  );

  const r2 = run(NODE, ['merge-tracker.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (r2 === null) {
    fail('merge-tracker.mjs crashed on non-canonical status test');
  } else {
    const c2 = readFileSync(APPS_FILE_PATH, 'utf-8');
    if (c2.includes('NonCanonCo') && !c2.includes('Applying') && c2.includes('Evaluated')) {
      pass("merge-tracker.mjs defaults non-canonical status 'Applying' to 'Evaluated'");
    } else if (!c2.includes('NonCanonCo')) {
      fail('merge-tracker.mjs did not write NonCanonCo row');
    } else {
      fail("merge-tracker.mjs wrote non-canonical status 'Applying' unchanged");
    }
  }
} finally {
  // Always restore applications.md to its pre-test state
  if (appsBackup !== null) {
    writeFileSync(APPS_FILE_PATH, appsBackup);
  }
  // Remove any surviving test TSVs from additions/ and merged/
  for (const slug of [TSV_LOW, TSV_HIGH, TSV_NONCAN]) {
    const inAdd    = join(ADDITIONS_DIR_PATH, slug);
    const inMerged = join(MERGED_DIR_PATH, slug);
    if (existsSync(inAdd))    rmSync(inAdd);
    if (existsSync(inMerged)) rmSync(inMerged);
  }
}

// ── 22. DOCX GENERATION + KSC ROUTING ───────────────────────────

console.log('\n22. Docx generation and KSC/cover-letter routing');

try {
  const { generateDocxFromString } = await import(pathToFileURL(join(ROOT, 'generate-docx.mjs')).href);

  // Check if pandoc is available
  const pandocPath = run('which pandoc 2>/dev/null || command -v pandoc 2>/dev/null');
  if (!pandocPath) {
    warn('docx generation test skipped — pandoc not installed (brew install pandoc)');
  } else {
    // Generate a minimal docx and verify it starts with PK (ZIP magic — all docx are ZIP files)
    const outPath = join(ROOT, 'output', '.test-docx-gate.docx');
    mkdirSync(join(ROOT, 'output'), { recursive: true });
    try {
      await generateDocxFromString('# Gate test\n\nThis file is generated by test-all.mjs and can be deleted.', outPath);
      if (existsSync(outPath)) {
        const magic = readFileSync(outPath).slice(0, 2);
        if (magic[0] === 0x50 && magic[1] === 0x4b) {
          pass('generateDocxFromString emits a valid .docx (ZIP PK magic bytes present)');
        } else {
          fail('generateDocxFromString output is not a valid ZIP/docx');
        }
      } else {
        fail('generateDocxFromString did not produce output file');
      }
    } finally {
      if (existsSync(outPath)) rmSync(outPath);
    }
  }

  // KSC and cover-letter regexes exported from form-fill
  const { KSC_RE, COVER_RE } = await import(pathToFileURL(join(ROOT, 'form-fill.mjs')).href);

  const kscLabels  = ['Key Selection Criteria', 'KSC', 'Address the selection criteria', 'Selection criteria'];
  const noKscLabel = 'Upload your resume';
  for (const label of kscLabels) {
    if (KSC_RE.test(label)) pass(`KSC_RE matches upload label: "${label}"`);
    else fail(`KSC_RE does not match label: "${label}"`);
  }
  if (!KSC_RE.test(noKscLabel)) pass('KSC_RE does not false-positive on resume label');
  else fail('KSC_RE false-positives on resume label');

  const coverLabels  = ['Cover letter', 'Cover Letter', 'cover-letter'];
  const noCoverLabel = 'Resume';
  for (const label of coverLabels) {
    if (COVER_RE.test(label)) pass(`COVER_RE matches upload label: "${label}"`);
    else fail(`COVER_RE does not match label: "${label}"`);
  }
  if (!COVER_RE.test(noCoverLabel)) pass('COVER_RE does not false-positive on resume label');
  else fail('COVER_RE false-positives on resume label');

  // KSC detection logic exists in queue-ingest (source structure check)
  const ingestSrc = readFile('queue-ingest.mjs');
  if (ingestSrc.includes('KSC_PATTERNS') && ingestSrc.includes('detectDocRequirements')) {
    pass('queue-ingest.mjs has KSC_PATTERNS and detectDocRequirements function');
  } else {
    fail('queue-ingest.mjs missing KSC_PATTERNS or detectDocRequirements');
  }
  if (ingestSrc.includes("? 'ksc'") && ingestSrc.includes('KSC_PATTERNS.some')) {
    pass("queue-ingest.mjs routes KSC upload fields to kind: 'ksc'");
  } else {
    fail("queue-ingest.mjs missing KSC_PATTERNS routing to 'ksc' kind");
  }
} catch (e) {
  fail(`Docx + KSC routing checks crashed: ${e.message}`);
}

// ── 23. DASHBOARD SERVER LOCALHOST BINDING + LANES ───────────────

console.log('\n23. Dashboard server localhost binding and lane definitions');

try {
  const serverSrc = readFile('dashboard-server.mjs');
  const appJs     = readFile('dashboard/web/app.js');

  // HOST must be hardcoded to 127.0.0.1 — must never be 0.0.0.0
  if (serverSrc.includes("'127.0.0.1'") && !serverSrc.includes("'0.0.0.0'")) {
    pass("dashboard-server.mjs HOST is hardcoded to '127.0.0.1' (localhost only)");
  } else {
    fail("dashboard-server.mjs HOST is NOT '127.0.0.1' — server may be externally accessible");
  }

  // server.listen must use the HOST constant
  if (serverSrc.includes('server.listen(PORT, HOST')) {
    pass('dashboard-server.mjs passes HOST to server.listen (localhost binding enforced)');
  } else {
    fail('dashboard-server.mjs server.listen does not reference HOST — binding may be wrong');
  }

  // All 3 lane keys must be rendered
  for (const lane of ['ready', 'needs', 'review']) {
    if (appJs.includes(`renderLane('${lane}'`)) {
      pass(`dashboard/web/app.js calls renderLane('${lane}')`);
    } else {
      fail(`dashboard/web/app.js missing renderLane('${lane}') call`);
    }
  }

  // Lane map initialised with all 3 keys
  if (appJs.includes('ready: []') && appJs.includes('needs: []') && appJs.includes('review: []')) {
    pass('dashboard/web/app.js initialises laneMap with ready, needs, review arrays');
  } else {
    fail('dashboard/web/app.js laneMap missing one or more lanes');
  }

  // Static web files exist
  for (const f of ['dashboard/web/index.html', 'dashboard/web/app.js', 'dashboard/web/style.css']) {
    if (fileExists(f)) pass(`${f} exists`);
    else fail(`${f} missing — dashboard SPA is incomplete`);
  }
} catch (e) {
  fail(`Dashboard server checks crashed: ${e.message}`);
}

// ── 24. PERSONAL SCORING GUARD (skip-clean on fresh clone) ──────

console.log('\n24. Personal scoring guard (test-personal.mjs)');

try {
  const personalTestPath = join(ROOT, 'test-personal.mjs');
  if (!existsSync(personalTestPath)) {
    warn('test-personal.mjs not found — personal scoring guard skipped (expected on fresh clone)');
  } else {
    const result = run(NODE, ['test-personal.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
    if (result !== null) {
      pass('test-personal.mjs (personal scoring guard) exits cleanly');
    } else {
      fail('test-personal.mjs exited with error — personal scoring structure broken');
    }
  }
} catch (e) {
  fail(`Personal scoring guard check crashed: ${e.message}`);
}

// ── SUMMARY ─────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('🔴 TESTS FAILED — do NOT push/merge until fixed\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('🟡 Tests passed with warnings — review before pushing\n');
  process.exit(0);
} else {
  console.log('🟢 All tests passed — safe to push/merge\n');
  process.exit(0);
}
