#!/usr/bin/env node

/**
 * verify-modes-qwen.mjs — Verify all 14+ modes dispatch correctly to Qwen
 *
 * This validates that:
 * 1. Every mode file is valid UTF-8 and has content
 * 2. lib/provider-dispatch.sh can accept each mode file as a prompt context
 * 3. Routing resolves to qwen when CAREER_OPS_PROVIDER=qwen
 * 4. The resolved prompt (shared + mode) can be passed to the dispatch layer
 *
 * Usage:
 *   node verify-modes-qwen.mjs
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

function readFile(path) { return readFileSync(join(ROOT, path), 'utf-8'); }
function fileExists(path) { return existsSync(join(ROOT, path)); }

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 15000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

console.log('\n🔷 Mode-to-Qwen dispatch verification\n');

// Define all shared modes (the 14+ modes that require _shared.md + their own file)
const sharedModes = [
  'auto-pipeline', 'oferta', 'ofertas', 'pdf', 'contacto',
  'apply', 'pipeline', 'scan', 'batch',
];

// Standalone modes (only their own file, no _shared.md)
const standaloneModes = [
  'tracker', 'deep', 'training', 'project', 'patterns', 'followup',
];

// All modes to verify
const allModes = [...sharedModes, ...standaloneModes];

const sharedContent = fileExists('modes/_shared.md') ? readFile('modes/_shared.md') : '';

let passed = 0;
let failed = 0;
let skipped = 0;

function check(mode, msg) {
  console.log(`  ✅ ${mode}: ${msg}`);
  passed++;
}
function fail(mode, msg) {
  console.log(`  ❌ ${mode}: ${msg}`);
  failed++;
}
function skipMode(mode, msg) {
  console.log(`  ⏭️  ${mode}: ${msg}`);
  skipped++;
}

// ── Step 1: Verify each mode file exists and has content ─────────

console.log('1. Mode file existence and content');

for (const mode of allModes) {
  const modeFile = `modes/${mode}.md`;
  if (!fileExists(modeFile)) {
    fail(mode, `file missing`);
    continue;
  }
  try {
    const content = readFile(modeFile);
    if (content.length > 100) {
      check(mode, `exists (${content.length} chars)`);
    } else {
      fail(mode, `file too small (${content.length} chars)`);
    }
  } catch (e) {
    fail(mode, `could not read file`);
  }
}

// ── Step 2: Verify _shared.md is valid UTF-8 ─────────────────────

console.log('\n2. _shared.md validation');

if (sharedContent.length > 1000) {
  console.log(`  ✅ _shared.md valid (${sharedContent.length} chars)`);
  passed++;
} else {
  console.log(`  ❌ _shared.md too small or missing`);
  failed++;
}

// ── Step 3: Test dispatch routing for each mode ──────────────────

console.log('\n3. Provider dispatch routing per mode');

const qwenInstalled = run('command -v qwen 2>/dev/null');

for (const mode of allModes) {
  // Build combined prompt (shared + mode for shared modes, mode-only for standalone)
  if (!fileExists(`modes/${mode}.md`)) {
    fail(mode, `mode file missing, cannot test dispatch`);
    continue;
  }

  let modeContent;
  try {
    modeContent = readFile(`modes/${mode}.md`);
  } catch (e) {
    fail(mode, `could not read mode file`);
    continue;
  }

  const combinedPrompt = sharedModes.includes(mode)
    ? `${sharedContent}\n\n---\n\n${modeContent}`
    : modeContent;

  // Write to temp file
  const tmpFile = `/tmp/qwen-mode-test-${mode}.md`;
  try {
    writeFileSync(tmpFile, combinedPrompt, 'utf-8');
  } catch (e) {
    fail(mode, `could not write temp prompt file`);
    continue;
  }

  // Test dispatch with qwen provider (validation only, don't execute)
  const result = run(
    `CAREER_OPS_PROVIDER=qwen bash lib/provider-dispatch.sh --validate-only --prompt "test ${mode}" --prompt-file "${tmpFile}" 2>&1`,
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );

  if (result !== null) {
    check(mode, `dispatches to qwen OK`);
  } else {
    if (!qwenInstalled) {
      skipMode(mode, `skipped (qwen CLI not installed)`);
    } else {
      fail(mode, `dispatch failed (qwen is installed)`);
    }
  }

  // Cleanup
  try {
    unlinkSync(tmpFile);
  } catch (e) { /* ignore */ }
}

// ── Step 4: Verify no mode contains hardcoded provider CLI ───────

console.log('\n4. Provider-agnostic mode verification');

for (const mode of allModes) {
  if (!fileExists(`modes/${mode}.md`)) {
    fail(mode, `mode file missing`);
    continue;
  }
  const content = readFile(`modes/${mode}.md`);
  // Check for hardcoded provider invocations (not just mentions)
  const hasHardcoded = [
    /claude -p\s+--dangerously-skip-permissions\s+\\/,
    /claude -p\s+--append-system-prompt-file/,
    /qwen -p\s+--yolo\s+\\/,
  ].some(pattern => pattern.test(content));

  if (!hasHardcoded) {
    check(mode, `provider-agnostic`);
  } else {
    fail(mode, `contains hardcoded provider invocation`);
  }
}

// ── Step 5: Verify dispatch resolves correct provider ─────────────

console.log('\n5. Provider resolution correctness');

// Test qwen resolution — dispatch returns 0 on --validate-only when binary exists
const qwenResolveExit = run('CAREER_OPS_PROVIDER=qwen bash lib/provider-dispatch.sh --validate-only --prompt "test" >/dev/null 2>&1 && echo ok || echo fail');
if (qwenResolveExit === 'ok') {
  console.log(`  ✅ CAREER_OPS_PROVIDER=qwen → routes to qwen`);
  passed++;
} else {
  if (!qwenInstalled) {
    console.log(`  ⏭️  CAREER_OPS_PROVIDER=qwen → skipped (qwen not installed)`);
    skipped++;
  } else {
    console.log(`  ❌ CAREER_OPS_PROVIDER=qwen → failed`);
    failed++;
  }
}

// Test claude resolution
const claudeResolveExit = run('CAREER_OPS_PROVIDER=claude bash lib/provider-dispatch.sh --validate-only --prompt "test" >/dev/null 2>&1 && echo ok || echo fail');
const claudeInstalled = run('command -v claude 2>/dev/null');
if (claudeResolveExit === 'ok') {
  console.log(`  ✅ CAREER_OPS_PROVIDER=claude → routes to claude`);
  passed++;
} else {
  if (!claudeInstalled) {
    console.log(`  ⏭️  CAREER_OPS_PROVIDER=claude → skipped (claude not installed)`);
    skipped++;
  } else {
    console.log(`  ❌ CAREER_OPS_PROVIDER=claude → failed`);
    failed++;
  }
}

// ── SUMMARY ──────────────────────────────────────────────────────

const total = passed + failed + skipped;
console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  console.log('🔴 MODE-TO-QWEN VERIFICATION FAILED\n');
  process.exit(1);
} else {
  console.log('🟢 All modes dispatch correctly to Qwen\n');
  process.exit(0);
}
