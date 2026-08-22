#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as yaml from "js-yaml";
import {
  readScheduledStore,
  withResourceLock,
  withScheduledStore,
  writeScheduledStoreAtomic,
} from "../web/src/lib/scheduled-jobs-store.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_RUNS = 100;
const MAX_NOTICES = 100;
const MAX_ATTEMPTS = 3;
const SCAN_TIMEOUT_MS = 25 * 60 * 1_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

const nowIso = () => new Date().toISOString();

function intervalMs(every, unit) {
  const amount = Number(every);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === "days") return amount * 86_400_000;
  if (unit === "hours") return amount * 3_600_000;
  if (unit === "minutes") return amount * 60_000;
  return null;
}

export function nextFutureRun(startAt, every, unit, nowMs = Date.now()) {
  const first = Date.parse(startAt);
  const interval = intervalMs(every, unit);
  if (!Number.isFinite(first) || !interval) return null;
  if (first > nowMs) return new Date(first).toISOString();
  const steps = Math.floor((nowMs - first) / interval) + 1;
  return new Date(first + steps * interval).toISOString();
}

export function enqueueDueJobs(store, nowMs = Date.now()) {
  let queued = 0;
  for (const job of store.jobs) {
    if (job.status !== "active") continue;
    const dueAt = job.nextRunAt || job.startAt;
    const dueMs = Date.parse(dueAt);
    if (!Number.isFinite(dueMs) || dueMs > nowMs) continue;

    if (!store.queue.some((item) => item.jobId === job.id)) {
      store.queue.push({ id: randomUUID(), jobId: job.id, queuedAt: new Date(nowMs).toISOString() });
      queued += 1;
    }

    const nextRunAt = nextFutureRun(dueAt, job.every, job.unit, nowMs);
    if (nextRunAt) job.nextRunAt = nextRunAt;
    job.updatedAt = new Date(nowMs).toISOString();
  }
  return queued;
}

export function buildScanCommand(job) {
  const filters = job.filters || {};
  const sinceDays = Number.isFinite(Number(filters.sinceDays)) ? Math.max(1, Math.round(Number(filters.sinceDays))) : 7;
  if (job.engine === "portals") {
    return {
      script: "scan.mjs",
      args: ["--since", String(sinceDays), "--quiet"],
    };
  }

  const ats = Array.isArray(filters.ats) && filters.ats.length
    ? filters.ats.join(",")
    : "greenhouse,lever,ashby,workday";
  const limit = Number.isFinite(Number(filters.limitPerAts))
    ? Math.min(500, Math.max(50, Math.round(Number(filters.limitPerAts))))
    : 150;
  return {
    script: "scan-ats-full.mjs",
    args: ["--since", String(sinceDays), "--ats", ats, "--limit", String(limit), "--json"],
  };
}

export function extractRolesFound(engine, stdout) {
  if (engine === "full") {
    try {
      const result = JSON.parse(stdout);
      return Number.isFinite(Number(result.postingsKept)) ? Number(result.postingsKept) : 0;
    } catch {
      return 0;
    }
  }
  const match = stdout.match(/New offers added:\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function writeJobPortals(root, job) {
  const portalsPath = path.join(root, "portals.yml");
  const base = yaml.load(fs.readFileSync(portalsPath, "utf8"));
  if (!base || typeof base !== "object") throw new Error("portals.yml must contain a mapping");

  const filters = job.filters || {};
  base.title_filter = {
    ...(base.title_filter || {}),
    positive: Array.isArray(filters.positive) ? filters.positive : [],
    negative: Array.isArray(filters.negative) ? filters.negative : [],
  };
  base.location_filter = {
    ...(base.location_filter || {}),
    allow: Array.isArray(filters.allow) ? filters.allow : [],
    block: Array.isArray(filters.block) ? filters.block : [],
    always_allow: Array.isArray(filters.alwaysAllow) ? filters.alwaysAllow : [],
  };

  const tempDir = path.join(root, "data", "tmp");
  fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `scheduled-${job.id}-${randomUUID()}.yml`);
  fs.writeFileSync(tempPath, yaml.dump(base, { lineWidth: 120, noRefs: true }), "utf8");
  return tempPath;
}

function firstErrorLine(result) {
  const raw = result.stderr || result.error?.message || `scanner exit ${result.status ?? "unknown"}`;
  return String(raw).split(/\r?\n/).find(Boolean)?.slice(0, 300) || "Scan failed";
}

function executeJob(root, job) {
  const startedAt = Date.now();
  let lastError = "Scan failed";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let tempPortals = null;
    try {
      tempPortals = writeJobPortals(root, job);
      const command = buildScanCommand(job);
      const result = spawnSync(
        process.execPath,
        [command.script, ...command.args],
        {
          cwd: root,
          env: { ...process.env, CAREER_OPS_PORTALS: tempPortals },
          encoding: "utf8",
          timeout: SCAN_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
        },
      );

      if (result.status === 0) {
        const rolesFound = extractRolesFound(job.engine || "full", result.stdout || "");
        return {
          state: "success",
          attempt,
          rolesFound,
          durationMs: Date.now() - startedAt,
          message: `Scan finished with ${rolesFound} matching role${rolesFound === 1 ? "" : "s"}.`,
        };
      }
      lastError = firstErrorLine(result);
    } finally {
      if (tempPortals) {
        try {
          fs.rmSync(tempPortals, { force: true });
        } catch {
          // Temporary filter cleanup is best effort.
        }
      }
    }
  }

  return {
    state: "failed",
    attempt: MAX_ATTEMPTS,
    rolesFound: 0,
    durationMs: Date.now() - startedAt,
    message: lastError,
  };
}

async function recordCompletion(storePath, job, result) {
  const at = nowIso();
  await withScheduledStore(storePath, (store) => {
    const current = store.jobs.find((item) => item.id === job.id);
    if (current) {
      current.lastRunAt = at;
      current.rolesFoundCount = result.rolesFound;
      current.updatedAt = at;
      if (result.state === "failed") current.lastError = result.message;
      else delete current.lastError;
    }

    store.runs.unshift({
      id: randomUUID(),
      jobId: job.id,
      at,
      durationMs: result.durationMs,
      state: result.state,
      attempt: result.attempt,
      message: result.message,
      rolesFound: result.rolesFound,
      engine: job.engine || "full",
    });
    if (store.runs.length > MAX_RUNS) store.runs = store.runs.slice(0, MAX_RUNS);
  });
}

function appendFailureNotice(noticePath, job, message) {
  let notices = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(noticePath, "utf8"));
    if (Array.isArray(parsed)) notices = parsed;
  } catch {
    // A missing or malformed notification file starts a fresh bounded list.
  }
  notices.push({
    id: randomUUID(),
    jobId: job.id,
    at: nowIso(),
    kind: "scheduled-job-failed",
    message,
    read: false,
  });
  writeScheduledStoreAtomic(noticePath, notices.slice(-MAX_NOTICES));
}

async function takeDueJob(storePath) {
  return withScheduledStore(storePath, (store) => {
    enqueueDueJobs(store);
    while (store.queue.length) {
      const queued = store.queue.shift();
      const job = store.jobs.find((item) => item.id === queued.jobId && item.status === "active");
      if (job) return structuredClone(job);
    }
    return null;
  });
}

function requestedJobId(args) {
  const index = args.indexOf("--job");
  return index >= 0 ? args[index + 1] || null : null;
}

async function main() {
  const root = process.env.CAREER_OPS_ROOT
    ? path.resolve(process.env.CAREER_OPS_ROOT)
    : DEFAULT_ROOT;
  const storePath = process.env.CAREER_OPS_SCHEDULED_JOBS_PATH
    ? path.resolve(process.env.CAREER_OPS_SCHEDULED_JOBS_PATH)
    : path.join(root, "data", "scheduled-jobs.json");
  const noticePath = path.join(root, "data", "scheduled-job-notifications.json");
  const runnerResource = path.join(root, "data", "scheduled-jobs-runner");
  const manualJobId = requestedJobId(process.argv.slice(2));

  return withResourceLock(
    runnerResource,
    async () => {
      let job;
      if (manualJobId) {
        const store = readScheduledStore(storePath);
        job = store.jobs.find((item) => item.id === manualJobId && item.status !== "deleted");
        if (!job) throw new Error("Scheduled job not found.");
        job = structuredClone(job);
      } else {
        job = await takeDueJob(storePath);
      }

      if (!job) return { status: "idle" };

      const result = executeJob(root, job);
      await recordCompletion(storePath, job, result);
      if (result.state === "failed") appendFailureNotice(noticePath, job, result.message);
      if (result.state === "failed") throw new Error(result.message);
      return { status: "success", jobId: job.id, ...result };
    },
    { timeoutMs: 1_000, staleMs: SCAN_TIMEOUT_MS * MAX_ATTEMPTS + 60_000 },
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
