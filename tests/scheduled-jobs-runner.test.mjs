import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  emptyScheduledStore,
  readScheduledStore,
  withScheduledStore,
} from "../web/src/lib/scheduled-jobs-store.mjs";
import {
  buildScanCommand,
  enqueueDueJobs,
  extractRolesFound,
  nextFutureRun,
} from "../scripts/scheduled-jobs-runner.mjs";

test("scheduled-jobs store starts empty and never seeds candidate-specific targeting", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-store-"));
  try {
    const store = readScheduledStore(path.join(temp, "scheduled-jobs.json"));
    assert.deepEqual(store, emptyScheduledStore());
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("scheduled-jobs store serializes concurrent writers without losing jobs", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-lock-"));
  const storePath = path.join(temp, "scheduled-jobs.json");
  try {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        withScheduledStore(storePath, (store) => {
          store.jobs.push({ id: String(index) });
        }),
      ),
    );
    const ids = readScheduledStore(storePath).jobs.map((job) => job.id).sort();
    assert.deepEqual(ids, Array.from({ length: 12 }, (_, index) => String(index)).sort());
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("invalid scheduled-jobs JSON is reported instead of overwritten", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-invalid-"));
  const storePath = path.join(temp, "scheduled-jobs.json");
  try {
    fs.writeFileSync(storePath, "{not-json", "utf8");
    assert.throws(() => readScheduledStore(storePath), /Invalid scheduled-jobs store/);
    assert.equal(fs.readFileSync(storePath, "utf8"), "{not-json");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("overdue schedules queue once and advance directly to the next future run", () => {
  const now = Date.parse("2026-08-08T12:00:00.000Z");
  const store = {
    jobs: [{
      id: "job-1",
      status: "active",
      startAt: "2026-08-08T08:00:00.000Z",
      every: 1,
      unit: "hours",
    }],
    runs: [],
    queue: [],
  };

  assert.equal(enqueueDueJobs(store, now), 1);
  assert.equal(store.queue.length, 1);
  assert.equal(store.jobs[0].nextRunAt, "2026-08-08T13:00:00.000Z");
  assert.equal(enqueueDueJobs(store, now), 0);
  assert.equal(store.queue.length, 1);
  assert.equal(nextFutureRun("2026-08-08T08:00:00.000Z", 1, "hours", now), "2026-08-08T13:00:00.000Z");
});

test("scan command honors the selected engine and bounded filters", () => {
  const filters = {
    sinceDays: 5,
    ats: ["lever", "ashby"],
    limitPerAts: 999,
  };
  assert.deepEqual(buildScanCommand({ engine: "portals", filters }), {
    script: "scan.mjs",
    args: ["--since", "5", "--quiet"],
  });
  assert.deepEqual(buildScanCommand({ engine: "full", filters }), {
    script: "scan-ats-full.mjs",
    args: ["--since", "5", "--ats", "lever,ashby", "--limit", "500", "--json"],
  });
});

test("roles-found parsing matches both scanner output formats", () => {
  assert.equal(extractRolesFound("full", JSON.stringify({ postingsKept: 7 })), 7);
  assert.equal(extractRolesFound("portals", "New offers added:      3\n"), 3);
  assert.equal(extractRolesFound("full", "not json"), 0);
});
