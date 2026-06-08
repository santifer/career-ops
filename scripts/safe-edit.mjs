#!/usr/bin/env node
/**
 * safe-edit.mjs — guardrail wrapper for file edits
 *
 * Guards against the r7 failure mode: file corruption (trailing null bytes,
 * mid-token truncation) that silently breaks .mjs files.
 *
 * Usage:
 *   node scripts/safe-edit.mjs <file> --content <new-content>
 *   node scripts/safe-edit.mjs <file> --stdin          (reads content from stdin)
 *   node scripts/safe-edit.mjs --selftest
 *
 * What it does:
 *   1. Snapshot the current file to <file>.safe-edit.bak
 *   2. Strip trailing null bytes from new content
 *   3. Check for mid-token truncation heuristics
 *   4. For .mjs/.js: validate new content with `node --check`
 *   5. Atomic write: write to <file>.tmp then rename into place
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const args = process.argv.slice(2);

// ── helpers ──────────────────────────────────────────────────────────────────

function stripTrailingNulls(str) {
  return str.replace(/\0+$/, '');
}

/** Heuristic: file ends in the middle of a token (likely truncation) */
function looksLikeTruncation(content) {
  const trimmed = content.trimEnd();
  if (!trimmed) return false;
  const last = trimmed.slice(-1);
  // Dangling open constructs
  if (/[({[,\\]/.test(last)) return true;
  // Ends mid-string
  const singleOpen = (trimmed.match(/'/g) || []).length % 2 !== 0;
  const doubleOpen = (trimmed.match(/"/g) || []).length % 2 !== 0;
  const btOpen = (trimmed.match(/`/g) || []).length % 2 !== 0;
  if (singleOpen || doubleOpen || btOpen) return true;
  return false;
}

function syntaxCheck(filePath) {
  try {
    execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
    return null;
  } catch (err) {
    return err.stderr?.toString().trim() || err.message;
  }
}

function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.safe-edit.tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// ── selftest ─────────────────────────────────────────────────────────────────

function selftest() {
  console.log('safe-edit selftest…');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-edit-'));
  const testFile = path.join(tmpDir, 'test.mjs');
  let pass = 0;
  let fail = 0;

  function check(label, ok) {
    if (ok) { console.log(`  ✓ ${label}`); pass++; }
    else     { console.error(`  ✗ ${label}`); fail++; }
  }

  // 1. Null-byte stripping
  const stripped = stripTrailingNulls('hello\0\0\0');
  check('strips trailing null bytes', stripped === 'hello');

  // 2. Truncation detection — open brace
  check('detects open-brace truncation', looksLikeTruncation('function foo() {'));
  check('detects open-paren truncation', looksLikeTruncation('const x = foo('));
  check('detects trailing comma',        looksLikeTruncation('const a = [\n  1,'));
  check('clean file not flagged',        !looksLikeTruncation('export default {};\n'));

  // 3. Atomic write
  atomicWrite(testFile, 'export const x = 1;\n');
  check('atomic write creates file', fs.existsSync(testFile));
  check('tmp file cleaned up', !fs.existsSync(testFile + '.safe-edit.tmp'));

  // 4. Syntax check — valid
  const errValid = syntaxCheck(testFile);
  check('syntax check passes on valid JS', errValid === null);

  // 5. Syntax check — invalid
  const badFile = path.join(tmpDir, 'bad.mjs');
  fs.writeFileSync(badFile, 'const x = {\n', 'utf8');
  const errBad = syntaxCheck(badFile);
  check('syntax check catches broken JS', errBad !== null);

  // 6. Snapshot
  fs.writeFileSync(testFile, 'original\n', 'utf8');
  const bak = testFile + '.safe-edit.bak';
  fs.copyFileSync(testFile, bak);
  check('snapshot created', fs.existsSync(bak));

  // cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

// ── main ─────────────────────────────────────────────────────────────────────

if (args.includes('--selftest')) {
  selftest();
  process.exit(0);
}

const filePath = args[0];
if (!filePath) {
  console.error('Usage: node scripts/safe-edit.mjs <file> --content <content> | --stdin');
  process.exit(1);
}

const absPath = path.resolve(filePath);
let newContent;

if (args.includes('--stdin')) {
  const chunks = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) chunks.push(chunk);
  newContent = chunks.join('');
} else {
  const ci = args.indexOf('--content');
  if (ci === -1 || !args[ci + 1]) {
    console.error('Provide --content <string> or --stdin');
    process.exit(1);
  }
  newContent = args[ci + 1];
}

// Step 1 — snapshot existing file
if (fs.existsSync(absPath)) {
  fs.copyFileSync(absPath, absPath + '.safe-edit.bak');
}

// Step 2 — strip nulls
newContent = stripTrailingNulls(newContent);

// Step 3 — truncation heuristic (warn, don't block — caller may know better)
if (looksLikeTruncation(newContent)) {
  console.warn(`[safe-edit] WARNING: content of ${filePath} looks possibly truncated (ends mid-token). Proceeding.`);
}

// Step 4 — syntax check for JS/MJS
const ext = path.extname(absPath).toLowerCase();
if (ext === '.mjs' || ext === '.js') {
  const tmpCheck = absPath + '.safe-edit.syntaxcheck.tmp';
  fs.writeFileSync(tmpCheck, newContent, 'utf8');
  const err = syntaxCheck(tmpCheck);
  fs.unlinkSync(tmpCheck);
  if (err) {
    console.error(`[safe-edit] SYNTAX ERROR — aborting write to ${filePath}:\n${err}`);
    console.error(`[safe-edit] Original file preserved. Backup at ${absPath}.safe-edit.bak`);
    process.exit(1);
  }
}

// Step 5 — atomic write
atomicWrite(absPath, newContent);
console.log(`[safe-edit] ${filePath} written (${newContent.length} chars)`);
