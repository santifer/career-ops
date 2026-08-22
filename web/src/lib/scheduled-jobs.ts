import path from "node:path";
import { randomUUID } from "node:crypto";
import { careerOpsRoot } from "@/lib/career-ops";
import { DEFAULT_FILTERS, parseExplorePatch, type ExploreFilters } from "@/lib/explore";
import {
  readScheduledStore,
  withScheduledStore,
} from "./scheduled-jobs-store.mjs";

export type JobStatus = "active" | "paused" | "deleted";
export type ScanEngine = "full" | "portals";
export type ScheduleUnit = "minutes" | "hours" | "days";

export type ScheduledJob = {
  id: string;
  name: string;
  status: JobStatus;
  engine: ScanEngine;
  filters: ExploreFilters;
  timezone: string;
  startAt: string;
  nextRunAt?: string;
  every: number;
  unit: ScheduleUnit;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastError?: string;
  rolesFoundCount?: number;
};

export type JobRun = {
  id: string;
  jobId: string;
  at: string;
  durationMs?: number;
  state: "queued" | "running" | "success" | "failed" | "cancelled";
  attempt: number;
  message?: string;
  rolesFound?: number;
  engine?: ScanEngine;
};

type QueueItem = { id: string; jobId: string; queuedAt: string };
type Store = { jobs: ScheduledJob[]; runs: JobRun[]; queue: QueueItem[] };
type JobFields = Pick<ScheduledJob, "name" | "engine" | "filters" | "timezone" | "startAt" | "every" | "unit">;

const storeFile = () => path.join(careerOpsRoot(), "data", "scheduled-jobs.json");

function read(): Store {
  return readScheduledStore(storeFile()) as Store;
}

function cleanUnit(value: unknown, fallback: ScheduleUnit): ScheduleUnit {
  return value === "minutes" || value === "hours" || value === "days" ? value : fallback;
}

function cleanEvery(value: unknown, unit: ScheduleUnit, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const minimum = unit === "minutes" ? 15 : 1;
  return Math.min(10_000, Math.max(minimum, Math.round(parsed)));
}

function cleanStartAt(value: unknown, fallback: string): string {
  const parsed = new Date(typeof value === "string" || typeof value === "number" ? value : fallback);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid start time.");
  return parsed.toISOString();
}

export function parseScheduledJobInput(raw: unknown, base?: ScheduledJob): JobFields {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const fallbackName = base?.name || "Scheduled scan";
  const name = String(input.name ?? fallbackName).trim().slice(0, 80) || fallbackName;
  const engine: ScanEngine = input.engine === "portals" || input.engine === "full"
    ? input.engine
    : base?.engine || "full";
  const unit = cleanUnit(input.unit, base?.unit || "hours");
  const every = cleanEvery(input.every, unit, base?.every || 1);
  const timezone = String(input.timezone ?? base?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC")
    .trim()
    .slice(0, 80) || "UTC";
  const startAt = cleanStartAt(input.startAt, base?.startAt || new Date().toISOString());
  const filters = parseExplorePatch(
    (input.filters && typeof input.filters === "object" ? input.filters : {}) as Record<string, unknown>,
    base?.filters || DEFAULT_FILTERS,
  );

  return { name, engine, unit, every, timezone, startAt, filters };
}

export function listScheduledJobs(): Pick<Store, "jobs" | "runs"> {
  const store = read();
  return { jobs: store.jobs, runs: store.runs };
}

export function getScheduledJob(id: string): ScheduledJob | undefined {
  return read().jobs.find((job) => job.id === id);
}

export async function createScheduledJob(fields: JobFields): Promise<ScheduledJob> {
  return withScheduledStore(storeFile(), (store: Store) => {
    const now = new Date().toISOString();
    const job: ScheduledJob = {
      ...fields,
      id: randomUUID(),
      status: "active",
      nextRunAt: fields.startAt,
      createdAt: now,
      updatedAt: now,
    };
    store.jobs.push(job);
    return job;
  });
}

export async function updateScheduledJob(
  id: string,
  fields: JobFields & { status?: Exclude<JobStatus, "deleted"> },
): Promise<ScheduledJob | null> {
  return withScheduledStore(storeFile(), (store: Store) => {
    const job = store.jobs.find((item) => item.id === id && item.status !== "deleted");
    if (!job) return null;
    const startChanged = fields.startAt !== job.startAt;
    const cadenceChanged = fields.every !== job.every || fields.unit !== job.unit;
    Object.assign(job, fields, { updatedAt: new Date().toISOString() });
    if (startChanged) {
      job.nextRunAt = fields.startAt;
    } else if (cadenceChanged) {
      const multiplier = fields.unit === "days" ? 86_400_000 : fields.unit === "hours" ? 3_600_000 : 60_000;
      job.nextRunAt = new Date(Date.now() + fields.every * multiplier).toISOString();
    }
    return job;
  });
}

export async function setScheduledJobStatus(
  id: string,
  status: Exclude<JobStatus, "deleted">,
): Promise<ScheduledJob | null> {
  return withScheduledStore(storeFile(), (store: Store) => {
    const job = store.jobs.find((item) => item.id === id && item.status !== "deleted");
    if (!job) return null;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    return job;
  });
}

export async function deleteScheduledJob(id: string): Promise<ScheduledJob | null> {
  return withScheduledStore(storeFile(), (store: Store) => {
    const job = store.jobs.find((item) => item.id === id && item.status !== "deleted");
    if (!job) return null;
    job.status = "deleted";
    job.updatedAt = new Date().toISOString();
    store.queue = store.queue.filter((item) => item.jobId !== id);
    return job;
  });
}
