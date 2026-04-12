/**
 * job-store.ts — in-memory implementation of the JobStore contract.
 *
 * Phase 2 scope: single-process, in-memory, bounded by MAX_JOBS. Enough
 * for the vertical slice and for Phase 3 recent-jobs feature. Phase 4
 * can swap in a SQLite-backed store without changing the interface.
 *
 * Concurrency model: JavaScript single-threaded, so mutations are
 * atomic from the event loop's perspective. No locks needed.
 */

import type {
  EvaluationResult,
  JobId,
  JobSnapshot,
  PhaseTransition,
} from "../contracts/jobs.js";
import type { BridgeError } from "../contracts/envelope.js";
import type { JobStore } from "../contracts/pipeline.js";

type Listener = (snap: JobSnapshot) => void;

const MAX_JOBS = 200;

export function createInMemoryJobStore(): JobStore & {
  /** Test helper: push a phase transition and notify listeners. */
  pushTransition(id: JobId, transition: PhaseTransition): Promise<JobSnapshot>;
  /** Test helper: mark a job terminal with a result. */
  markCompleted(id: JobId, result: EvaluationResult): Promise<JobSnapshot>;
  /** Test helper: mark a job terminal with an error. */
  markFailed(id: JobId, error: BridgeError): Promise<JobSnapshot>;
} {
  const jobs = new Map<JobId, JobSnapshot>();
  const listeners = new Map<JobId, Set<Listener>>();
  /** Insertion order — JobId[] sorted by createdAt, enforced by Map iteration. */
  const orderedIds: JobId[] = [];

  function fanout(snap: JobSnapshot): void {
    const subs = listeners.get(snap.id);
    if (!subs) return;
    for (const listener of subs) {
      // Isolate listener failures; one bad subscriber must not poison others.
      try {
        listener(snap);
      } catch {
        /* swallow — listeners are responsible for their own errors */
      }
    }
  }

  function touch(id: JobId): JobSnapshot {
    const snap = jobs.get(id);
    if (!snap) throw new Error(`job ${id} not found`);
    return snap;
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  return {
    async create(snapshot: JobSnapshot): Promise<void> {
      if (jobs.has(snapshot.id)) {
        throw new Error(`job ${snapshot.id} already exists`);
      }
      jobs.set(snapshot.id, snapshot);
      orderedIds.push(snapshot.id);

      // Bound memory usage. Drop the oldest terminal job.
      while (jobs.size > MAX_JOBS) {
        for (let i = 0; i < orderedIds.length; i++) {
          const id = orderedIds[i]!;
          const s = jobs.get(id);
          if (s && (s.phase === "completed" || s.phase === "failed")) {
            jobs.delete(id);
            listeners.delete(id);
            orderedIds.splice(i, 1);
            break;
          }
        }
        // If everything is in flight, stop evicting — we'll accept
        // temporary bloat over losing in-progress state.
        if (jobs.size > MAX_JOBS && !orderedIds.some((id) => {
          const s = jobs.get(id);
          return s && (s.phase === "completed" || s.phase === "failed");
        })) {
          break;
        }
      }
    },

    async get(id: JobId): Promise<JobSnapshot | undefined> {
      return jobs.get(id);
    },

    async update(id: JobId, patch: Partial<JobSnapshot>): Promise<JobSnapshot> {
      const prev = touch(id);
      const next: JobSnapshot = {
        ...prev,
        ...patch,
        updatedAt: nowIso(),
      };
      jobs.set(id, next);
      fanout(next);
      return next;
    },

    subscribe(id: JobId, listener: Listener): () => void {
      let subs = listeners.get(id);
      if (!subs) {
        subs = new Set();
        listeners.set(id, subs);
      }
      subs.add(listener);

      // Immediately replay current snapshot so late subscribers get state.
      const current = jobs.get(id);
      if (current) {
        try {
          listener(current);
        } catch {
          /* swallow */
        }
      }

      return () => {
        const set = listeners.get(id);
        if (!set) return;
        set.delete(listener);
        if (set.size === 0) listeners.delete(id);
      };
    },

    async list(limit: number): Promise<readonly JobSnapshot[]> {
      const out: JobSnapshot[] = [];
      // Newest first.
      for (let i = orderedIds.length - 1; i >= 0 && out.length < limit; i--) {
        const id = orderedIds[i]!;
        const s = jobs.get(id);
        if (s) out.push(s);
      }
      return out;
    },

    async pushTransition(
      id: JobId,
      transition: PhaseTransition
    ): Promise<JobSnapshot> {
      const prev = touch(id);
      const phases = [...(prev.progress?.phases ?? []), transition];
      const next: JobSnapshot = {
        ...prev,
        phase: transition.phase,
        updatedAt: nowIso(),
        progress: {
          ...(prev.progress ?? { phases: [] }),
          phases,
        },
      };
      jobs.set(id, next);
      fanout(next);
      return next;
    },

    async markCompleted(
      id: JobId,
      result: EvaluationResult
    ): Promise<JobSnapshot> {
      const prev = touch(id);
      const terminalTransition: PhaseTransition = {
        phase: "completed",
        at: nowIso(),
      };
      const phases = [...(prev.progress?.phases ?? []), terminalTransition];
      const next: JobSnapshot = {
        ...prev,
        phase: "completed",
        updatedAt: nowIso(),
        result,
        progress: {
          ...(prev.progress ?? { phases: [] }),
          phases,
        },
      };
      jobs.set(id, next);
      fanout(next);
      return next;
    },

    async markFailed(
      id: JobId,
      error: BridgeError
    ): Promise<JobSnapshot> {
      const prev = touch(id);
      const terminalTransition: PhaseTransition = {
        phase: "failed",
        at: nowIso(),
      };
      const phases = [...(prev.progress?.phases ?? []), terminalTransition];
      const next: JobSnapshot = {
        ...prev,
        phase: "failed",
        updatedAt: nowIso(),
        error,
        progress: {
          ...(prev.progress ?? { phases: [] }),
          phases,
        },
      };
      jobs.set(id, next);
      fanout(next);
      return next;
    },
  };
}
