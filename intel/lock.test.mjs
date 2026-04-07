import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { acquireLock, releaseLock, withLock } from './lock.mjs';

describe('acquireLock', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'lock-test-acquire-'));
  after(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('creates lockfile when none exists', () => {
    const lockPath = join(tmpDir, 'test1.lock');
    const result = acquireLock(lockPath);
    assert.equal(result, true);
    assert.equal(existsSync(lockPath), true);
  });

  it('lockfile contains PID and timestamp', () => {
    const lockPath = join(tmpDir, 'test2.lock');
    acquireLock(lockPath);
    const content = readFileSync(lockPath, 'utf8');
    assert.ok(content.includes(String(process.pid)), 'should contain process PID');
    assert.ok(content.includes('ts:'), 'should contain ts: prefix');
  });

  it('fails to acquire when already locked', () => {
    const lockPath = join(tmpDir, 'test3.lock');
    acquireLock(lockPath);
    const result = acquireLock(lockPath);
    assert.equal(result, false);
  });

  it('auto-clears stale locks older than maxAge', () => {
    const lockPath = join(tmpDir, 'test4.lock');
    // Manually create a stale lock backdated by 2 minutes
    const staleTs = Date.now() - 120_000;
    writeFileSync(lockPath, `pid:99999\nts:${staleTs}`);
    // Acquire with maxAgeMs of 60s — lock is 120s old, so it's stale
    const result = acquireLock(lockPath, { maxAgeMs: 60_000 });
    assert.equal(result, true);
    const content = readFileSync(lockPath, 'utf8');
    assert.ok(content.includes(String(process.pid)), 'new lock should have current PID');
  });
});

describe('releaseLock', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'lock-test-release-'));
  after(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('removes the lockfile', () => {
    const lockPath = join(tmpDir, 'test1.lock');
    acquireLock(lockPath);
    releaseLock(lockPath);
    assert.equal(existsSync(lockPath), false);
  });

  it('does not throw when lockfile does not exist', () => {
    const lockPath = join(tmpDir, 'nonexistent.lock');
    assert.doesNotThrow(() => releaseLock(lockPath));
  });
});

describe('withLock', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'lock-test-with-'));
  after(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('runs fn and releases lock on success', () => {
    const lockPath = join(tmpDir, 'test1.lock');
    let called = false;
    withLock(lockPath, () => { called = true; });
    assert.equal(called, true);
    assert.equal(existsSync(lockPath), false);
  });

  it('releases lock even when fn throws', () => {
    const lockPath = join(tmpDir, 'test2.lock');
    assert.throws(() => {
      withLock(lockPath, () => { throw new Error('boom'); });
    }, { message: 'boom' });
    assert.equal(existsSync(lockPath), false);
  });

  it('returns the result of fn', () => {
    const lockPath = join(tmpDir, 'test3.lock');
    const result = withLock(lockPath, () => 42);
    assert.equal(result, 42);
  });

  it('throws when lock cannot be acquired', () => {
    const lockPath = join(tmpDir, 'test4.lock');
    acquireLock(lockPath);
    assert.throws(() => {
      withLock(lockPath, () => {});
    }, { message: 'Could not acquire lock' });
  });
});
