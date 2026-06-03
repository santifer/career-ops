import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { hostname } from 'os';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRY_DELAY_MS = 75;
const DEFAULT_STALE_MS = 10 * 60_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJsonIfPresent(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function lockAgeMs(lockDir, metadata) {
  if (metadata?.created_at) {
    const createdAt = Date.parse(metadata.created_at);
    if (!Number.isNaN(createdAt)) return Date.now() - createdAt;
  }

  try {
    return Date.now() - statSync(lockDir).mtimeMs;
  } catch {
    return 0;
  }
}

function staleLockReason(lockDir, staleMs) {
  const metadata = readJsonIfPresent(join(lockDir, 'owner.json'));
  const ageMs = lockAgeMs(lockDir, metadata);

  if (metadata?.pid && !processIsAlive(metadata.pid)) {
    return `owner pid ${metadata.pid} is not running`;
  }

  if (ageMs > staleMs) {
    return `lock age ${Math.round(ageMs)}ms exceeded stale limit ${staleMs}ms`;
  }

  return null;
}

/**
 * Acquire an exclusive filesystem lock by atomically creating a directory.
 *
 * Directory creation is the critical primitive here: only one process can
 * create the same directory path successfully, so all other processes must
 * wait and retry until the owner removes it. The owner metadata is diagnostic
 * only; the directory itself is the lock.
 */
export async function acquireFileLock(lockDir, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const owner = options.owner ?? 'unknown';
  const startedAt = Date.now();
  let attempts = 0;
  let staleRecovered = false;

  mkdirSync(dirname(lockDir), { recursive: true });

  while (true) {
    attempts += 1;

    try {
      mkdirSync(lockDir);
      const waitMs = Date.now() - startedAt;
      let released = false;

      writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({
        owner,
        pid: process.pid,
        hostname: hostname(),
        created_at: new Date().toISOString(),
      }, null, 2));

      return {
        lockDir,
        attempts,
        waitMs,
        staleRecovered,
        release() {
          if (released) return;
          released = true;
          rmSync(lockDir, { recursive: true, force: true });
        },
      };
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;

      const reason = existsSync(lockDir) ? staleLockReason(lockDir, staleMs) : null;
      if (reason) {
        try {
          rmSync(lockDir, { recursive: true, force: true });
          staleRecovered = true;
          continue;
        } catch {
          // Another process may have removed or recreated the lock first.
        }
      }

      if (Date.now() - startedAt >= timeoutMs) {
        const metadata = readJsonIfPresent(join(lockDir, 'owner.json'));
        const ownerText = metadata
          ? `owner=${metadata.owner ?? 'unknown'} pid=${metadata.pid ?? 'unknown'} created_at=${metadata.created_at ?? 'unknown'}`
          : 'owner=unknown';
        throw new Error(`Timed out waiting for lock ${lockDir} (${ownerText})`);
      }

      await sleep(retryDelayMs);
    }
  }
}

export async function withFileLock(lockDir, options, callback) {
  const lock = await acquireFileLock(lockDir, options);
  try {
    return await callback(lock);
  } finally {
    lock.release();
  }
}
