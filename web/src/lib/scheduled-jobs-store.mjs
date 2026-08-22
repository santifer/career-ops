import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const OWNERLESS_GRACE_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_MS = 80;
const DEFAULT_STALE_MS = 30_000;

export function emptyScheduledStore() {
  return { jobs: [], runs: [], queue: [] };
}

export function readScheduledStore(storePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("store root must be an object");
    for (const key of ["jobs", "runs", "queue"]) {
      if (parsed[key] !== undefined && !Array.isArray(parsed[key])) {
        throw new Error(key + " must be an array");
      }
    }
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
    };
  } catch (error) {
    if (error?.code === "ENOENT") return emptyScheduledStore();
    throw new Error(`Invalid scheduled-jobs store at ${storePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function writeScheduledStoreAtomic(storePath, store) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, storePath);
  } finally {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // The atomic rename already succeeded, or best-effort cleanup failed.
    }
  }
}

function readOwner(lockDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function lockCanRecover(lockDir, staleMs) {
  const owner = readOwner(lockDir);
  if (owner?.pid) return !processIsAlive(owner.pid);
  try {
    return Date.now() - fs.statSync(lockDir).mtimeMs > Math.max(staleMs, OWNERLESS_GRACE_MS);
  } catch {
    return true;
  }
}

async function acquireResourceLock(resourcePath, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const lockDir = `${resourcePath}.lock`;
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;

  fs.mkdirSync(path.dirname(lockDir), { recursive: true });

  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(
        path.join(lockDir, "owner.json"),
        JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }, null, 2),
        "utf8",
      );
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        try {
          fs.rmSync(lockDir, { recursive: true, force: true });
        } catch {
          // Best effort after an owner-stamp failure.
        }
        throw error;
      }
      if (lockCanRecover(lockDir, staleMs)) {
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`scheduled-jobs lock timeout: ${resourcePath}`);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (readOwner(lockDir)?.token !== token) return;
    try {
      fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {
      // A future stale-lock recovery can remove it.
    }
  };
}

export async function withResourceLock(resourcePath, fn, options = {}) {
  const release = await acquireResourceLock(resourcePath, options);
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function withScheduledStore(storePath, mutate, options = {}) {
  return withResourceLock(
    storePath,
    async () => {
      const store = readScheduledStore(storePath);
      const result = await mutate(store);
      writeScheduledStoreAtomic(storePath, store);
      return result;
    },
    options,
  );
}
