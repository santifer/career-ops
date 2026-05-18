/**
 * tests/unit/readonly-fs.test.mjs
 *
 * Unit tests for lib/readonly-fs.mjs (O5 read-only filesystem barrier).
 *
 * Run:
 *   node --test tests/unit/readonly-fs.test.mjs
 *
 * Test coverage (≥6 assertions required):
 *   1. Reading an allowed path succeeds
 *   2. Reading outside allowed throws
 *   3. `..` escape attempts are blocked
 *   4. Write attempts on rfs (WRITE_DENIED_STUB) throw
 *   5. Wrapper works for sync form (readFileSync)
 *   6. Wrapper works for async form (readFile)
 *   7. Empty allowedPaths array = blanket deny
 *   8. createWriteableFS allows write to permitted dir
 *   9. createWriteableFS blocks write outside permitted
 *  10. exists() returns true for an existing allowed file
 *  11. exists() returns false for a nonexistent file (no throw)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync as fsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { createReadonlyFS, createWriteableFS, WRITE_DENIED_STUB } from '../../lib/readonly-fs.mjs';

// ── Test fixture setup ────────────────────────────────────────────────────────

// Create a temp dir with a known file structure for tests
const fixtureDir = join(tmpdir(), `readonly-fs-test-${randomUUID()}`);
const allowedDir = join(fixtureDir, 'allowed');
const outsideDir = join(fixtureDir, 'outside');
const writableDir = join(fixtureDir, 'writable');

mkdirSync(allowedDir, { recursive: true });
mkdirSync(outsideDir, { recursive: true });
mkdirSync(writableDir, { recursive: true });

const allowedFile    = join(allowedDir, 'cv.md');
const allowedSubFile = join(allowedDir, 'sub', 'voice-reference.md');
const outsideFile    = join(outsideDir, '.env');

mkdirSync(join(allowedDir, 'sub'), { recursive: true });
writeFileSync(allowedFile,    '# Mitchell Williams\n- Bullet one\n', 'utf-8');
writeFileSync(allowedSubFile, '# Voice reference\n', 'utf-8');
writeFileSync(outsideFile,    'ANTHROPIC_API_KEY=sk-secret\n', 'utf-8');

// Cleanup after all tests
process.on('exit', () => {
  try { rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createReadonlyFS', () => {

  test('1. Reading an allowed file succeeds (sync)', () => {
    const rfs = createReadonlyFS([allowedFile]);
    const content = rfs.readFileSync(allowedFile, 'utf-8');
    assert.ok(content.includes('Mitchell Williams'), 'Expected file content present');
  });

  test('2. Reading outside allowed paths throws', () => {
    const rfs = createReadonlyFS([allowedFile]);
    assert.throws(
      () => rfs.readFileSync(outsideFile, 'utf-8'),
      /read denied/,
      'Expected read denial for outside path'
    );
  });

  test('3. ../ path traversal escape is blocked', () => {
    const rfs = createReadonlyFS([allowedFile]);
    // Attempt to escape from allowed file's directory upward
    const escapePath = join(allowedDir, '..', 'outside', '.env');
    assert.throws(
      () => rfs.readFileSync(escapePath, 'utf-8'),
      /read denied/,
      'Expected read denial for ../ traversal'
    );
  });

  test('4. Write attempt via WRITE_DENIED_STUB throws synchronously', () => {
    assert.throws(
      () => WRITE_DENIED_STUB.writeFileSync('/any/path', 'data'),
      /write denied/,
      'Expected write denial from stub'
    );
  });

  test('5. Sync form (readFileSync) returns correct content', () => {
    const rfs = createReadonlyFS([allowedDir]);
    const content = rfs.readFileSync(allowedFile, 'utf-8');
    assert.ok(content.startsWith('# Mitchell Williams'), 'Sync readFileSync content mismatch');
  });

  test('6. Async form (readFile) resolves with correct content', async () => {
    const rfs = createReadonlyFS([allowedDir]);
    const content = await rfs.readFile(allowedFile, 'utf-8');
    assert.ok(content.includes('Bullet one'), 'Async readFile content mismatch');
  });

  test('7. Empty allowedPaths array = blanket deny', () => {
    const rfs = createReadonlyFS([]);
    assert.throws(
      () => rfs.readFileSync(allowedFile, 'utf-8'),
      /blanket deny/,
      'Expected blanket deny for empty allowedPaths'
    );
  });

  test('8. Async readFile on denied path throws or rejects', async () => {
    const rfs = createReadonlyFS([allowedFile]);
    // guard() runs synchronously before the fs call, so readFile throws
    // immediately (before returning a Promise). Wrap in a try/catch to handle
    // both throw and reject uniformly.
    let threw = false;
    try {
      await rfs.readFile(outsideFile, 'utf-8');
    } catch (err) {
      threw = true;
      assert.match(err.message, /read denied/, 'Error message should indicate read denial');
    }
    assert.ok(threw, 'Expected an error (throw or reject) for denied path');
  });

  test('10. exists() returns true for existing allowed file', async () => {
    const rfs = createReadonlyFS([allowedFile]);
    const result = await rfs.exists(allowedFile);
    assert.equal(result, true, 'exists() should return true for an existing allowed file');
  });

  test('11. exists() returns false for nonexistent file (no throw)', async () => {
    const rfs = createReadonlyFS([allowedDir]);
    const nonexistent = join(allowedDir, 'does-not-exist.md');
    const result = await rfs.exists(nonexistent);
    assert.equal(result, false, 'exists() should return false for nonexistent file without throwing');
  });

  test('12. Directory prefix allows reading files inside it', () => {
    // allowedDir is the directory; allowedSubFile is inside it
    const rfs = createReadonlyFS([allowedDir]);
    const content = rfs.readFileSync(allowedSubFile, 'utf-8');
    assert.ok(content.includes('Voice reference'), 'Should read file inside allowed directory');
  });

  test('13. WRITE_DENIED_STUB.writeFile rejects with write denied', async () => {
    await assert.rejects(
      () => WRITE_DENIED_STUB.writeFile('/any/path', 'data'),
      /write denied/,
      'Expected async write denial from stub'
    );
  });

});

describe('createWriteableFS', () => {

  test('8W. writeFileSync to permitted dir succeeds', () => {
    const wfs = createWriteableFS([writableDir]);
    const dest = join(writableDir, 'test-output.txt');
    wfs.writeFileSync(dest, 'hello world', 'utf-8');
    // Verify the file was actually written using Node fs directly
    assert.ok(existsSync(dest), 'File should exist after writeFileSync');
    const content = readFileSyncDirect(dest);
    assert.equal(content, 'hello world', 'Written content should match');
  });

  test('9W. writeFileSync outside permitted dir throws', () => {
    const wfs = createWriteableFS([writableDir]);
    assert.throws(
      () => wfs.writeFileSync(join(outsideDir, 'hack.txt'), 'data'),
      /write denied/,
      'Expected write denial for path outside writableDir'
    );
  });

  test('9Wm. mkdirSync outside permitted dir throws', () => {
    const wfs = createWriteableFS([writableDir]);
    assert.throws(
      () => wfs.mkdirSync(join(outsideDir, 'new-dir'), { recursive: true }),
      /write denied/,
      'Expected mkdirSync denial for path outside writableDir'
    );
  });

});

// Helper to sync-read without the wrapper (for verification in test 8W)
function readFileSyncDirect(p) {
  return fsSync(p, 'utf-8');
}
