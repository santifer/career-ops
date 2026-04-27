import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { findTrackerRow, findLastEventForReport, runCorrect } from "./correct.mjs";
import { parseTracker } from "./scoring-parser.mjs";

test("findTrackerRow matches by num column", () => {
  const md = `# Tracker
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 32 | 2026-04-26 | Devos | Head | 4.2/5 | Applied | ✅ | [032](reports/032-devos.md) | x |
`;
  const rows = parseTracker(md);
  const r = findTrackerRow(rows, "032");
  assert.ok(r);
  assert.equal(r.company, "Devos");
});

test("findLastEventForReport returns null when file missing", async () => {
  const r = await findLastEventForReport("/nonexistent/path", "001");
  assert.equal(r, null);
});

test("findLastEventForReport returns latest event for report_id", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "correct-"));
  const eventsPath = path.join(root, "events.jsonl");
  await writeFile(
    eventsPath,
    [
      { report_id: "001", loop_type: "scoring", real_outcome: "neutral_excluded", outcome_source: "inferred", ts: "2026-04-25T00:00:00Z" },
      { report_id: "002", loop_type: "scoring", real_outcome: "positive", outcome_source: "inferred", ts: "2026-04-26T00:00:00Z" },
      { report_id: "001", loop_type: "scoring", real_outcome: "inferred_negative", outcome_source: "inferred", ts: "2026-04-27T00:00:00Z" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n"
  );
  const r = await findLastEventForReport(eventsPath, "001");
  assert.equal(r.real_outcome, "inferred_negative");
  assert.equal(r.ts, "2026-04-27T00:00:00Z");
  await rm(root, { recursive: true, force: true });
});

test("findLastEventForReport ignores events from other loops (M3 guard)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "correct-"));
  const eventsPath = path.join(root, "events.jsonl");
  await writeFile(
    eventsPath,
    [
      { report_id: "001", loop_type: "scoring", real_outcome: "negative", ts: "2026-04-25T00:00:00Z" },
      { report_id: "001", loop_type: "recruiter", real_outcome: "positive", ts: "2026-04-27T00:00:00Z" }, // ignorar
      { report_id: "001", loop_type: "scoring", real_outcome: "inferred_negative", ts: "2026-04-26T00:00:00Z" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n"
  );
  const r = await findLastEventForReport(eventsPath, "001");
  assert.ok(r);
  assert.equal(r.loop_type, "scoring");
  assert.equal(r.real_outcome, "inferred_negative");
  assert.equal(r.ts, "2026-04-26T00:00:00Z", "should skip recruiter event even though it is the latest");
  await rm(root, { recursive: true, force: true });
});

test("findLastEventForReport treats missing loop_type as scoring (backward-compat)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "correct-"));
  const eventsPath = path.join(root, "events.jsonl");
  await writeFile(
    eventsPath,
    [
      // Evento legado sem loop_type — deve ser tratado como scoring
      { report_id: "001", real_outcome: "neutral_excluded", ts: "2026-04-25T00:00:00Z" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n"
  );
  const r = await findLastEventForReport(eventsPath, "001");
  assert.ok(r);
  assert.equal(r.real_outcome, "neutral_excluded");
  await rm(root, { recursive: true, force: true });
});

async function buildFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "correct-"));
  await mkdir(path.join(root, "reports"));
  await mkdir(path.join(root, "data", "learn"), { recursive: true });
  const tracker = `# Tracker
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 32 | 2026-04-26 | Devos | Head | 4.2/5 | Applied | ✅ | [032](reports/032-devos-2026-04-26.md) | x |
`;
  await writeFile(path.join(root, "data", "applications.md"), tracker);
  await writeFile(
    path.join(root, "reports", "032-devos-2026-04-26.md"),
    `# Avaliacao\n**Score:** 4.2/5\n**Arquetipo:** Head Accounting\n`
  );
  return {
    root,
    paths: {
      tracker: path.join(root, "data", "applications.md"),
      reportsDir: path.join(root, "reports"),
      events: path.join(root, "data", "learn", "scoring-events.jsonl"),
    },
  };
}

test("runCorrect rejects invalid outcome", async () => {
  const fx = await buildFixture();
  await assert.rejects(
    () => runCorrect({ reportId: "032", outcome: "garbage", paths: fx.paths }),
    /invalid outcome/
  );
  await rm(fx.root, { recursive: true, force: true });
});

test("runCorrect rejects unknown report_id", async () => {
  const fx = await buildFixture();
  await assert.rejects(
    () => runCorrect({ reportId: "999", outcome: "positive", paths: fx.paths }),
    /not found in tracker/
  );
  await rm(fx.root, { recursive: true, force: true });
});

test("runCorrect appends manual event with outcome_correction.previous=null when no prior event", async () => {
  const fx = await buildFixture();
  const ev = await runCorrect({ reportId: "032", outcome: "positive", reason: "Got interview", paths: fx.paths });
  assert.equal(ev.real_outcome, "positive");
  assert.equal(ev.outcome_source, "manual");
  assert.equal(ev.outcome_correction.previous_outcome, null);
  assert.equal(ev.outcome_correction.reason, "Got interview");

  const file = await readFile(fx.paths.events, "utf8");
  assert.match(file, /"real_outcome":"positive"/);
  await rm(fx.root, { recursive: true, force: true });
});

test("runCorrect chains with previous event", async () => {
  const fx = await buildFixture();
  // First event (manual to set baseline)
  await runCorrect({ reportId: "032", outcome: "inferred_negative", reason: "stale", paths: fx.paths });
  // Second event overrides
  const ev2 = await runCorrect({ reportId: "032", outcome: "positive", reason: "recovered", paths: fx.paths });
  assert.equal(ev2.outcome_correction.previous_outcome, "inferred_negative");
  assert.equal(ev2.outcome_correction.previous_source, "manual");
  await rm(fx.root, { recursive: true, force: true });
});
