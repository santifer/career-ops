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
import { readFileSync, existsSync, readdirSync } from 'fs';
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
