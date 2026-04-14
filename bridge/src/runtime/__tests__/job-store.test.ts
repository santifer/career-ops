import { describe, it, expect } from "vitest";
import { createInMemoryJobStore } from "../job-store.js";
import type { JobId, JobSnapshot, EvaluationResult } from "../../contracts/jobs.js";
import type { BridgeError } from "../../contracts/envelope.js";

function makeId(s: string): JobId { return s as JobId; }

function makeSnapshot(id: string, phase = "queued" as const): JobSnapshot {
  const now = new Date().toISOString();
  return {
    id: makeId(id),
    phase,
    createdAt: now,
    updatedAt: now,
    input: { url: `https://example.com/${id}` },
    progress: { phases: [{ phase, at: now }] },
  };
}

function makeResult(): EvaluationResult {
  return {
    reportNumber: 1,
    reportPath: "/tmp/report.md",
    pdfPath: null,
    company: "Acme",
    role: "Engineer",
    score: 4.2,
    archetype: "test",
    tldr: "Test evaluation",
    trackerRow: {
      num: 1,
      date: "2026-01-01",
      company: "Acme",
      role: "Engineer",
      status: "Evaluated",
      score: "4.2/5",
      pdf: "\u274C",
      report: "[1](reports/1-acme.md)",
      notes: "test",
    },
    trackerMerged: true,
    trackerMergeSummary: { added: 1, updated: 0, skipped: 0 },
  };
}

describe("InMemoryJobStore", () => {
  it("creates and retrieves a job", async () => {
    const store = createInMemoryJobStore();
    const snap = makeSnapshot("j1");
    await store.create(snap);
    const got = await store.get(makeId("j1"));
    expect(got).toBeDefined();
    expect(got!.id).toBe("j1");
  });

  it("returns undefined for unknown job", async () => {
    const store = createInMemoryJobStore();
    expect(await store.get(makeId("nope"))).toBeUndefined();
  });

  it("rejects duplicate creation", async () => {
    const store = createInMemoryJobStore();
    await store.create(makeSnapshot("j1"));
    await expect(store.create(makeSnapshot("j1"))).rejects.toThrow("already exists");
  });

  it("updates a job", async () => {
    const store = createInMemoryJobStore();
    await store.create(makeSnapshot("j1"));
    const updated = await store.update(makeId("j1"), { phase: "evaluating" });
    expect(updated.phase).toBe("evaluating");
  });

  it("lists jobs newest first", async () => {
    const store = createInMemoryJobStore();
    await store.create(makeSnapshot("a"));
    await store.create(makeSnapshot("b"));
    await store.create(makeSnapshot("c"));
    const list = await store.list(10);
    expect(list.map(j => j.id)).toEqual(["c", "b", "a"]);
  });

  it("limits list results", async () => {
    const store = createInMemoryJobStore();
    await store.create(makeSnapshot("a"));
    await store.create(makeSnapshot("b"));
    await store.create(makeSnapshot("c"));
    const list = await store.list(2);
    expect(list).toHaveLength(2);
  });

  it("pushTransition advances phase and records history", async () => {
    const store = createInMemoryJobStore();
    await store.create(makeSnapshot("j1"));
    const result = await store.pushTransition(makeId("j1"), {
      phase: "evaluating",
      at: new Date().toISOString(),
    });
    expect(result.phase).toBe("evaluating");
    expect(result.progress!.phases).toHaveLength(2); // queued + evaluating
  });

  it("markCompleted sets terminal state", async () => {
    const store = createInMemoryJobStore();
    await store.create(makeSnapshot("j1"));
    const evalResult = makeResult();
    const snap = await store.markCompleted(makeId("j1"), evalResult);
    expect(snap.phase).toBe("completed");
    expect(snap.result).toEqual(evalResult);
  });

  it("markFailed sets terminal state", async () => {
    const store = createInMemoryJobStore();
    await store.create(makeSnapshot("j1"));
    const err: BridgeError = { code: "EVAL_FAILED", message: "boom" };
    const snap = await store.markFailed(makeId("j1"), err);
    expect(snap.phase).toBe("failed");
    expect(snap.error).toEqual(err);
  });

  it("subscribe receives updates and initial replay", async () => {
    const store = createInMemoryJobStore();
    await store.create(makeSnapshot("j1"));
    const events: JobSnapshot[] = [];
    const unsub = store.subscribe(makeId("j1"), (s) => events.push(s));
    // Initial replay
    expect(events).toHaveLength(1);
    expect(events[0]!.phase).toBe("queued");
    // Push a transition
    await store.pushTransition(makeId("j1"), { phase: "evaluating", at: new Date().toISOString() });
    expect(events).toHaveLength(2);
    // Unsub
    unsub();
    await store.pushTransition(makeId("j1"), { phase: "writing_report", at: new Date().toISOString() });
    expect(events).toHaveLength(2); // no new event after unsub
  });
});
