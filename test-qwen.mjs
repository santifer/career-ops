#!/usr/bin/env node

/**
 * test-qwen.mjs — Qwen provider integration test suite
 *
 * Tests the Qwen CLI (v0.14.x) provider abstraction layer:
 * - lib/provider-dispatch.sh routing and validation
 * - lib/providers/qwen.sh flag mapping
 * - lib/providers/claude.sh backward compatibility
 * - config/profile.yml provider section
 * - All 14 modes remain provider-agnostic
 * - batch-runner.sh uses dispatch layer (no hardcoded claude)
 *
 * Usage:
 *   node test-qwen.mjs
 *   node test-qwen.mjs --strict   # Fail if qwen CLI not installed
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const STRICT = process.argv.includes('--strict');

let passed = 0;
let failed = 0;
let skipped = 0;

/** Record a passing test and increment counter. */
function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
/** Record a failing test and increment counter. */
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
/** Record a skipped test and increment counter. */
function skip(msg) { console.log(`  ⏭️  ${msg}`); skipped++; }

/**
 * Run a shell command synchronously, returning trimmed stdout or null on error.
 * @param {string} cmd - Shell command to execute.
 * @param {object} [opts={}] - Options forwarded to execSync.
 * @returns {string|null} Trimmed stdout, or null on failure.
 */
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

/**
 * Check whether a path relative to the project root exists.
 * @param {string} path - Relative path from project root.
 * @returns {boolean} True if the path exists.
 */
function fileExists(path) { return existsSync(join(ROOT, path)); }

/**
 * Read a file relative to the project root as UTF-8 text.
 * @param {string} path - Relative path from project root.
 * @returns {string} File contents.
 */
function readFile(path) { return readFileSync(join(ROOT, path), 'utf-8'); }

console.log('\n🔷 Qwen provider test suite\n');

// ── 1. PROVIDER ABSTRACTION LAYER FILES ──────────────────────────

console.log('1. Provider abstraction layer files');

const providerFiles = [
  'lib/provider-dispatch.sh',
  'lib/providers/claude.sh',
  'lib/providers/qwen.sh',
];

for (const f of providerFiles) {
  if (fileExists(f)) {
    pass(`${f} exists`);
    // Check executable
    const stat = statSync(join(ROOT, f));
    if (stat.mode & 0o111) {
      pass(`${f} is executable`);
    } else {
      fail(`${f} is NOT executable`);
    }
  } else {
    fail(`Missing provider file: ${f}`);
  }
}

// ── 2. PROVIDER DISPATCH SHELL SYNTAX ────────────────────────────

console.log('\n2. Provider dispatch shell syntax');

for (const f of providerFiles) {
  const result = run(`bash -n ${f}`);
  if (result !== null) {
    pass(`${f} bash syntax OK`);
  } else {
    fail(`${f} has bash syntax errors`);
  }
}

// ── 3. PROVIDER DISPATCH ROUTING LOGIC ───────────────────────────

console.log('\n3. Provider dispatch routing');

// Test: --provider flag override
const result = run('CAREER_OPS_PROVIDER=claude bash lib/provider-dispatch.sh --provider qwen --validate-only --prompt "test" 2>&1', { stdio: ['pipe', 'pipe', 'pipe'] });
if (result === null) {
  fail('--provider qwen flag failed validation (qwen not installed)');
} else {
  pass('--provider qwen flag routes correctly');
}

// Test: env var override
const envResult = run('CAREER_OPS_PROVIDER=qwen bash lib/provider-dispatch.sh --validate-only --prompt "test" 2>&1', { stdio: ['pipe', 'pipe', 'pipe'] });
if (envResult === null) {
  fail('CAREER_OPS_PROVIDER=qwen env var failed validation');
} else {
  pass('CAREER_OPS_PROVIDER env var routes correctly');
}

// Test: fallback to claude when no override
const fallbackResult = run('CAREER_OPS_PROVIDER="" bash lib/provider-dispatch.sh --validate-only --prompt "test" 2>&1', { stdio: ['pipe', 'pipe', 'pipe'] });
const claudeAvailable = run('command -v claude 2>/dev/null');
if (fallbackResult === null) {
  if (claudeAvailable) {
    fail('Fallback to claude failed validation (claude IS installed)');
  } else {
    skip('Fallback to claude skipped (claude CLI not installed)');
  }
} else {
  pass('Fallback to claude works');
}

// Test: unknown provider is rejected
const unknownResult = run('bash lib/provider-dispatch.sh --provider unknown --validate-only --prompt "test" 2>&1', { stdio: ['pipe', 'pipe', 'pipe'] });
if (unknownResult !== null && unknownResult.includes('ERROR')) {
  pass('Unknown provider "unknown" is rejected');
} else if (unknownResult === null) {
  pass('Unknown provider "unknown" causes error exit');
} else {
  fail('Unknown provider "unknown" was NOT rejected');
}

// ── 4. CLAUDE PROVIDER BACKWARD COMPATIBILITY ────────────────────

console.log('\n4. Claude provider backward compatibility');

const claudeSh = readFile('lib/providers/claude.sh');
const claudeChecks = [
  ['claude -p mode', '-p'],
  ['dangerously-skip-permissions', '--dangerously-skip-permissions'],
  ['append-system-prompt-file', '--append-system-prompt-file'],
];

for (const [desc, pattern] of claudeChecks) {
  if (claudeSh.includes(pattern)) {
    pass(`claude.sh has ${desc}`);
  } else {
    fail(`claude.sh missing ${desc}`);
  }
}

// ── 5. QWEN PROVIDER FLAG MAPPING ────────────────────────────────

console.log('\n5. Qwen provider flag mapping');

const qwenSh = readFile('lib/providers/qwen.sh');
const qwenChecks = [
  ['qwen -p headless', '-p'],
  ['qwen yolo mode', '--yolo'],
  ['append-system-prompt', '--append-system-prompt'],
  ['file reading for prompt', 'cat '],
  ['binary validation', 'command -v "$QWEN_BIN"'],
];

for (const [desc, pattern] of qwenChecks) {
  if (qwenSh.includes(pattern)) {
    pass(`qwen.sh has ${desc}`);
  } else {
    fail(`qwen.sh missing ${desc}`);
  }
}

// Verify Qwen does NOT use Claude-specific flags (check non-comment lines only)
const claudeOnlyPatterns = ['--dangerously-skip-permissions', '--append-system-prompt-file'];
const qwenCodeLines = qwenSh.split('\n').filter(line => !line.trim().startsWith('#'));
for (const pattern of claudeOnlyPatterns) {
  if (qwenCodeLines.some(line => line.includes(pattern))) {
    fail(`qwen.sh incorrectly uses Claude-only flag in code: ${pattern}`);
  } else {
    pass(`qwen.sh does NOT use Claude flag ${pattern} in code`);
  }
}

// ── 6. QWEN CLI AVAILABILITY ─────────────────────────────────────

console.log('\n6. Qwen CLI availability');

const qwenAvailable = run('command -v qwen 2>/dev/null');
if (qwenAvailable) {
  pass('qwen CLI found in PATH');

  // Check version if possible
  const versionOut = run('qwen --version 2>&1');
  if (versionOut) {
    if (/0\.14\./.test(versionOut)) {
      pass(`qwen version matches v0.14.x: ${versionOut}`);
    } else {
      skip(`qwen version found but not v0.14.x: ${versionOut}`);
    }
  } else {
    skip('qwen --version not supported');
  }
} else if (STRICT) {
  fail('qwen CLI not found (strict mode)');
} else {
  skip('qwen CLI not installed (non-strict mode, tests skipped)');
}

// ── 7. CONFIG PROFILE PROVIDER SECTION ───────────────────────────

console.log('\n7. Config profile provider section');

const profileExample = readFile('config/profile.example.yml');
const profileChecks = [
  ['provider key', /^provider:/m],
  ['default provider', /default:\s*claude/],
  ['claude subsection', /claude:/],
  ['qwen subsection', /qwen:/],
  ['qwen model field', /qwen:[\s\S]*?model:/],
  ['qwen cli_bin field', /cli_bin:\s*qwen/],
];

for (const [desc, pattern] of profileChecks) {
  if (pattern.test(profileExample)) {
    pass(`profile.example.yml has ${desc}`);
  } else {
    fail(`profile.example.yml missing ${desc}`);
  }
}

// ── 8. BATCH-RUNNER USES DISPATCH LAYER ──────────────────────────

console.log('\n8. batch-runner.sh uses dispatch layer');

const batchRunner = readFile('batch/batch-runner.sh');
const batchChecks = [
  ['references LIB_DIR and dispatch', (r) => r.includes('LIB_DIR') && r.includes('provider-dispatch.sh')],
  ['references LIB_DIR', (r) => r.includes('LIB_DIR')],
  ['has --provider flag', (r) => r.includes('--provider')],
  ['no hardcoded claude -p call', (r) => !r.includes('claude -p \\\n') && !r.includes('claude -p --')],
];

for (const [desc, check] of batchChecks) {
  if (check(batchRunner)) {
    pass(`batch-runner.sh: ${desc}`);
  } else {
    fail(`batch-runner.sh: ${desc}`);
  }
}

// ── 9. MODE PROVIDER-AGNOSTIC VERIFICATION ───────────────────────

console.log('\n9. Mode provider-agnostic verification');

const modesDir = join(ROOT, 'modes');
const modeFiles = readdirSync(modesDir).filter(f => f.endsWith('.md'));

// Modes should NOT contain hardcoded provider CLI invocations.
// Broad patterns that catch different spacing/line-continuation variants.
const providerInvocationPatterns = [
  /\bclaude\s+-p\s+(--dangerously-skip-permissions|--append-system-prompt-file)/i,
  /\bclaude\s+--chrome\s+--dangerously-skip-permissions/i,
  /\bqwen\s+-p\s+(--yolo|--append-system-prompt)/i,
];

let modeIssues = 0;
for (const mode of modeFiles) {
  const content = readFile(`modes/${mode}`);
  // Normalize: collapse all runs of whitespace (incl. newlines) into single space
  const flat = content.replace(/[\s]+/g, ' ');
  for (const pattern of providerInvocationPatterns) {
    if (pattern.test(flat)) {
      // batch.md is allowed to reference provider-dispatch.sh
      if (mode === 'batch.md' && content.includes('lib/provider-dispatch.sh')) {
        // batch.md references the dispatch script, not direct CLI — OK
        continue;
      }
      fail(`modes/${mode} contains hardcoded provider invocation: ${pattern}`);
      modeIssues++;
    }
  }
}
if (modeIssues === 0) {
  pass(`All ${modeFiles.length} mode files are provider-agnostic`);
}

// ── 10. ALL 14 MODES EXIST AND ARE VALID ─────────────────────────

console.log('\n10. All 14+ modes exist and are valid');

const expectedModes = [
  '_shared.md', '_profile.template.md', 'oferta.md', 'pdf.md', 'scan.md',
  'batch.md', 'apply.md', 'auto-pipeline.md', 'contacto.md', 'deep.md',
  'ofertas.md', 'pipeline.md', 'project.md', 'tracker.md', 'training.md',
  'patterns.md', 'followup.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    const content = readFile(`modes/${mode}`);
    if (content.length > 0) {
      pass(`Mode ${mode} exists and has content (${content.length} chars)`);
    } else {
      fail(`Mode ${mode} is empty`);
    }
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

// ── 11. BATCH.MD REFERENCES DISPATCH ─────────────────────────────

console.log('\n11. batch.md references dispatch layer');

const batchMd = readFile('modes/batch.md');
const batchMdChecks = [
  ['references lib/provider-dispatch.sh', (c) => c.includes('lib/provider-dispatch.sh')],
  ['no hardcoded claude invocation', (c) => !c.includes('claude -p --dangerously-skip-permissions')],
  ['no hardcoded claude chrome', (c) => !c.includes('claude --chrome')],
];

for (const [desc, check] of batchMdChecks) {
  if (check(batchMd)) {
    pass(`batch.md: ${desc}`);
  } else {
    fail(`batch.md: ${desc}`);
  }
}

// ── 12. BATCH README PROVIDER DOCS ───────────────────────────────

console.log('\n12. Batch README provider documentation');

const batchReadme = readFile('batch/README.md');
const readmeChecks = [
  ['Provider Selection section', 'Provider Selection'],
  ['--provider flag documented', '--provider NAME'],
  ['CAREER_OPS_PROVIDER documented', 'CAREER_OPS_PROVIDER'],
  ['qwen mentioned', 'qwen'],
  ['prerequisites updated', 'At least one provider CLI'],
];

for (const [desc, pattern] of readmeChecks) {
  if (batchReadme.includes(pattern)) {
    pass(`batch/README.md: ${desc}`);
  } else {
    fail(`batch/README.md missing: ${desc}`);
  }
}

// ── 13. PROVIDER SHELL ARGUMENT PARSING ──────────────────────────

console.log('\n13. Provider shell argument parsing');

// Test dispatch.sh accepts --provider flag correctly
const dispatchContent = readFile('lib/provider-dispatch.sh');
const dispatchChecks = [
  ['--provider flag parsing', '--provider'],
  ['PROVIDER_OVERRIDE variable', 'PROVIDER_OVERRIDE'],
  ['CAREER_OPS_PROVIDER env', 'CAREER_OPS_PROVIDER'],
  ['config/profile.yml fallback', 'profile.yml'],
  ['claude fallback default', '"claude"'],
  ['exec delegates to provider', 'exec "$PROVIDERS_DIR'],
];

for (const [desc, pattern] of dispatchChecks) {
  if (dispatchContent.includes(pattern)) {
    pass(`provider-dispatch.sh: ${desc}`);
  } else {
    fail(`provider-dispatch.sh missing: ${desc}`);
  }
}

// ── 14. NO PROVIDER-SPECIFIC LOGIC IN MODES ──────────────────────

console.log('\n14. No provider-specific logic in modes');

// Scan all mode files for any hardcoded provider CLI commands
// (excluding descriptive text like "claude -p | qwen -p")
const hardInvocationPatterns = [
  /claude -p\s+--dangerously-skip-permissions\s+\\/,
  /claude -p\s+--append-system-prompt-file/,
  /qwen -p\s+--yolo\s+\\/,
  /qwen -p\s+--append-system-prompt/,
];

let invocationIssues = 0;
for (const mode of modeFiles) {
  const content = readFile(`modes/${mode}`);
  for (const pattern of hardInvocationPatterns) {
    if (pattern.test(content)) {
      fail(`modes/${mode} has hardcoded provider invocation`);
      invocationIssues++;
    }
  }
}
if (invocationIssues === 0) {
  pass('No hardcoded provider invocations in any mode file');
}

// ── 15. QWEN WRAPPER OUTPUT FORMAT COMPATIBILITY ─────────────────

console.log('\n15. Output format compatibility');

// Verify that qwen.sh doesn't add --output-format flags that would
// break the log parsing in batch-runner.sh (score extraction via
// sed -nE 's/.*"score":[[:space:]]*([0-9.]+).*/\1/p')
// Check non-comment code lines only
const qwenOutputCheck = !qwenCodeLines.some(line => line.includes('--output-format'));
if (qwenOutputCheck) {
  pass('qwen.sh does NOT force --output-format json (log parsing compatible)');
} else {
  fail('qwen.sh forces --output-format json which may break log parsing');
}

// ── 16. CROSS-PROVIDER CONSISTENCY ───────────────────────────────

console.log('\n16. Cross-provider consistency');

// Both providers should accept the same interface:
// --prompt, --prompt-file, --output-file, --validate-only
const claudeArgs = ['--prompt', '--prompt-file', '--output-file', '--validate-only'];
const qwenArgs = ['--prompt', '--prompt-file', '--output-file', '--validate-only'];

for (const arg of claudeArgs) {
  if (claudeSh.includes(arg)) {
    pass(`claude.sh accepts ${arg}`);
  } else {
    fail(`claude.sh missing ${arg}`);
  }
}

for (const arg of qwenArgs) {
  if (qwenSh.includes(arg)) {
    pass(`qwen.sh accepts ${arg}`);
  } else {
    fail(`qwen.sh missing ${arg}`);
  }
}

// ── SUMMARY ──────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  console.log('🔴 QWEN TESTS FAILED — do NOT push/merge until fixed\n');
  process.exit(1);
} else if (skipped > 0) {
  console.log('🟡 Qwen tests passed with skips (some features require qwen CLI installed)\n');
  process.exit(0);
} else {
  console.log('🟢 All Qwen tests passed — provider integration is solid\n');
  process.exit(0);
}
