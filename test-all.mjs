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
  const result = run('node', ['--check', f]);
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
  { name: 'update-system.mjs check', expectExit: 0 },
];

for (const { name, allowFail } of scripts) {
  const result = run('node', name.split(' '), { stdio: ['pipe', 'pipe', 'pipe'] });
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
  'README.pt-BR.md', 'README.ru.md',
  // Standard project files
  'LICENSE', 'CITATION.cff', 'CONTRIBUTING.md',
  'package.json', '.github/FUNDING.yml', 'CLAUDE.md', 'AGENTS.md', 'go.mod', 'test-all.mjs',
  // Community / governance files (added in v1.3.0, all legitimately reference the maintainer)
  'CODE_OF_CONDUCT.md', 'GOVERNANCE.md', 'SECURITY.md', 'SUPPORT.md',
  '.github/SECURITY.md',
  // Dashboard credit string
  'dashboard/internal/ui/screens/pipeline.go',
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
  'add.md',
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

// ── 9. AGENTS.md INTEGRITY ──────────────────────────────────────

console.log('\n9. AGENTS.md integrity');

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

// ── 10. VERSION FILE ─────────────────────────────────────────────

console.log('\n10. Version file');

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

// ── 11. /add COMMAND INTEGRITY ──────────────────────────────────

console.log('\n11. /add command integrity');

// Mode file exists and has required structure
if (fileExists('modes/add.md')) {
  const addMode = readFile('modes/add.md');

  // Required structural sections
  const addSections = ['Pipeline', 'Input Formats', 'Rules', 'Step 5', 'Step 6', 'Step 7'];
  for (const section of addSections) {
    if (addMode.includes(section)) {
      pass(`add.md has section: ${section}`);
    } else {
      fail(`add.md missing section: ${section}`);
    }
  }

  // Must write to cv.md (the canonical CV source)
  if (addMode.includes('cv.md')) {
    pass('add.md writes to cv.md');
  } else {
    fail('add.md does not reference cv.md');
  }

  // Must write to article-digest.md (proof points store)
  if (addMode.includes('article-digest.md')) {
    pass('add.md writes to article-digest.md');
  } else {
    fail('add.md does not reference article-digest.md');
  }

  // Must ask for confirmation before writing (ethical guard)
  if (addMode.includes('confirm') || addMode.includes('Proceed') || addMode.includes('preview')) {
    pass('add.md requires confirmation before writing');
  } else {
    fail('add.md must require user confirmation before writing to cv.md');
  }

  // Must NOT invent data
  if (addMode.toLowerCase().includes('never invent') || addMode.includes('NEVER invent')) {
    pass('add.md enforces no-invention rule');
  } else {
    fail('add.md must explicitly state NEVER invent data');
  }

  // Must handle GitHub URLs
  if (addMode.includes('github.com')) {
    pass('add.md handles GitHub URLs');
  } else {
    fail('add.md missing GitHub URL support');
  }

  // Must support duplicate detection
  if (addMode.includes('duplicate') || addMode.includes('NEVER duplicate') || addMode.includes('already appears')) {
    pass('add.md detects duplicates before inserting');
  } else {
    fail('add.md must check for duplicate entries');
  }
} else {
  fail('modes/add.md does not exist');
}

// SKILL.md router has the `add` command registered
if (fileExists('.claude/skills/career-ops/SKILL.md')) {
  const skill = readFile('.claude/skills/career-ops/SKILL.md');
  if (skill.includes('`add`') || skill.includes("'add'") || skill.includes('"add"') || skill.includes('| `add` |')) {
    pass('SKILL.md router includes add command');
  } else {
    fail('SKILL.md router is missing the add command entry');
  }
  if (skill.includes('/career-ops add')) {
    pass('SKILL.md discovery menu shows /career-ops add');
  } else {
    fail('SKILL.md discovery menu missing /career-ops add');
  }
} else {
  fail('.claude/skills/career-ops/SKILL.md does not exist');
}

// AGENTS.md skill modes table includes add
{
  const agentsMd = readFile('AGENTS.md');
  if (agentsMd.includes('`add`') && (agentsMd.includes('project') || agentsMd.includes('GitHub'))) {
    pass('AGENTS.md skill modes table includes add');
  } else {
    fail('AGENTS.md skill modes table missing add command');
  }
}

// ── 12. JAKE'S RESUME TEMPLATE INTEGRITY ────────────────────────

console.log('\n12. Jake\'s Resume template integrity');

if (fileExists('templates/cv-template.tex')) {
  const tex = readFile('templates/cv-template.tex');

  // Jake's template uses Experience / Projects (not Work Experience / Personal Projects)
  if (tex.includes('\\section{Experience}')) {
    pass('cv-template.tex uses \\section{Experience} (Jake\'s template)');
  } else {
    fail('cv-template.tex must use \\section{Experience} not \\section{Work Experience}');
  }

  if (tex.includes('\\section{Projects}')) {
    pass('cv-template.tex uses \\section{Projects} (Jake\'s template)');
  } else {
    fail('cv-template.tex must use \\section{Projects} not \\section{Personal Projects}');
  }

  // Required ATS placeholder — must be present for validator
  if (tex.includes('\\pdfgentounicode=1')) {
    pass('cv-template.tex has \\pdfgentounicode=1 (ATS compatibility)');
  } else {
    fail('cv-template.tex missing \\pdfgentounicode=1');
  }

  // Required content placeholders
  const requiredPlaceholders = ['{{NAME}}', '{{EMAIL_URL}}', '{{LINKEDIN_URL}}', '{{GITHUB_URL}}',
    '{{EDUCATION}}', '{{EXPERIENCE}}', '{{PROJECTS}}', '{{SKILLS}}'];
  for (const ph of requiredPlaceholders) {
    if (tex.includes(ph)) {
      pass(`cv-template.tex has placeholder: ${ph}`);
    } else {
      fail(`cv-template.tex missing placeholder: ${ph}`);
    }
  }

  // Must NOT use fontawesome or multicol (Jake's template doesn't need them)
  if (!tex.includes('\\usepackage{fontawesome}')) {
    pass('cv-template.tex does not require fontawesome');
  } else {
    fail('cv-template.tex must not include fontawesome — unavailable in many LaTeX environments');
  }
  if (!tex.includes('\\usepackage{fontawesome5}')) {
    pass('cv-template.tex does not require fontawesome5');
  } else {
    fail('cv-template.tex must not include fontawesome5 — unavailable in many LaTeX environments');
  }
  if (!tex.includes('\\usepackage{multicol}')) {
    pass('cv-template.tex does not require multicol');
  } else {
    fail('cv-template.tex must not include multicol — not used in Jake\'s single-column template');
  }
} else {
  fail('templates/cv-template.tex does not exist');
}

// generate-latex.mjs section names match Jake's template
if (fileExists('generate-latex.mjs')) {
  const genLatex = readFile('generate-latex.mjs');
  if (genLatex.includes("'\\\\\\\\section{Experience}'") || genLatex.includes('"\\\\\\\\section{Experience}"')
    || genLatex.includes("section{Experience}")) {
    pass('generate-latex.mjs validates \\section{Experience}');
  } else {
    fail('generate-latex.mjs REQUIRED_SECTIONS must use Experience not Work Experience');
  }
  if (genLatex.includes("section{Projects}")) {
    pass('generate-latex.mjs validates \\section{Projects}');
  } else {
    fail('generate-latex.mjs REQUIRED_SECTIONS must use Projects not Personal Projects');
  }
  // Must support tectonic
  if (genLatex.includes('tectonic')) {
    pass('generate-latex.mjs supports tectonic compiler');
  } else {
    fail('generate-latex.mjs must support tectonic as a LaTeX engine');
  }
} else {
  fail('generate-latex.mjs does not exist');
}

// auto-pipeline.md uses latex as default
if (fileExists('modes/auto-pipeline.md')) {
  const ap = readFile('modes/auto-pipeline.md');
  if (ap.includes('latex') && ap.includes('default')) {
    pass('auto-pipeline.md uses latex as default output format');
  } else {
    fail('auto-pipeline.md must default to latex output format');
  }
} else {
  fail('modes/auto-pipeline.md does not exist');
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
