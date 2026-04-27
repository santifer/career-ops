import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  parseScore,
  extractReportIdFromCell,
  parseTracker,
  parseReportHeader,
  inferOutcome,
  daysBetween,
  runParser,
  sha256,
} from "./scoring-parser.mjs";

test("parseScore handles X/5, X/10, plain, and N/A", () => {
  assert.equal(parseScore("4.3/5"), 4.3);
  assert.equal(parseScore("7/10"), 3.5);
  assert.equal(parseScore("3.2"), 3.2);
  assert.equal(parseScore("N/A"), null);
  assert.equal(parseScore(""), null);
  assert.equal(parseScore(null), null);
});

test("extractReportIdFromCell only matches bracket or reports/ path, never dates", () => {
  assert.equal(extractReportIdFromCell("[032](reports/032-foo.md)"), "032");
  assert.equal(extractReportIdFromCell("[#028](reports/028-bar.md)"), "028");
  assert.equal(extractReportIdFromCell("reports/021-baz-2026-04-21.md"), "021");
  assert.equal(extractReportIdFromCell("output/cv-fernando-educbank-2026-04-26.pdf"), null);
  assert.equal(extractReportIdFromCell(""), null);
});

test("parseTracker reads canonical 9-column rows", () => {
  const md = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-04-16 | Amazon | Manager | 3.5/5 | Evaluated | ✅ | [001](reports/001-amazon-2026-04-16.md) | foo |
| 2 | 2026-04-17 | Acme | Controller | N/A | SKIP | ❌ | [002](reports/002-acme-2026-04-17.md) | bar |
`;
  const rows = parseTracker(md);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].num, "001");
  assert.equal(rows[0].status, "Evaluated");
  assert.equal(rows[1].score_raw, "N/A");
});

test("parseReportHeader handles multiple score formats", () => {
  const v1 = `# Avaliacao\n\n**Data:** 2026-04-26\n**Score:** 4.3/5\n**Arquetipo:** Controller\n**Legitimidade:** Alta Confianca\n\n---\n\n## A`;
  const v2 = `# Avaliacao\n\n**Score: 2.5/5 — SKIP**\n**Arquetipo:** Treasury\n\n---\n## A`;
  const v3 = `# Avaliacao\n\n**Score: 1.5/5** — texto extra\n**Arquetipo:** FP&A\n`;
  assert.equal(parseReportHeader(v1).predicted_score, 4.3);
  assert.equal(parseReportHeader(v2).predicted_score, 2.5);
  assert.equal(parseReportHeader(v3).predicted_score, 1.5);
  assert.equal(parseReportHeader(v1).archetype, "Controller");
});

test("inferOutcome respects stale_after_days", () => {
  const rules = [
    { status: "Applied", outcome: "inferred_negative", confidence: "low", stale_after_days: 30 },
    { status: "Interview", outcome: "positive", confidence: "high" },
  ];
  // Applied 5 dias atrás → não emite (wait_for_stale)
  const fresh = inferOutcome(rules, "Applied", "2026-04-21", "2026-04-26");
  assert.equal(fresh.outcome, null);
  assert.equal(fresh.reason, "wait_for_stale");
  // Applied 35 dias atrás → emite inferred_negative
  const stale = inferOutcome(rules, "Applied", "2026-04-21", "2026-05-26");
  assert.equal(stale.outcome, "inferred_negative");
  // Interview imediato → emite positive
  const interview = inferOutcome(rules, "Interview", "2026-04-26", "2026-04-26");
  assert.equal(interview.outcome, "positive");
});

test("inferOutcome returns null with reason for unknown status", () => {
  const r = inferOutcome([], "Pending", "2026-04-26", "2026-04-26");
  assert.equal(r.outcome, null);
  assert.match(r.reason, /^unknown_status:/);
});

test("daysBetween returns rounded integer days", () => {
  assert.equal(daysBetween("2026-04-01", "2026-04-11"), 10);
  assert.equal(daysBetween("2026-04-26", "2026-04-26"), 0);
  assert.equal(daysBetween("invalid", "2026-04-01"), null);
});

async function setupFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "scoring-parser-"));
  await mkdir(path.join(root, "reports"));
  await mkdir(path.join(root, "data", "learn"), { recursive: true });
  await mkdir(path.join(root, "lib", "learn"), { recursive: true });
  const tracker = `# Tracker
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-04-26 | Acme | Controller | 4.2/5 | Interview | ✅ | [001](reports/001-acme-2026-04-26.md) | won |
| 2 | 2026-04-26 | Foo | Manager | 2.8/5 | SKIP | ❌ | [002](reports/002-foo-2026-04-26.md) | mismatch |
`;
  const reportA = `# Avaliacao\n**Score:** 4.2/5\n**Arquetipo:** Controller LATAM\n\n---\n## A`;
  const reportB = `# Avaliacao\n**Score: 2.8/5 — SKIP**\n**Arquetipo:** FP&A\n\n---\n## A`;
  const rules = `version: 1
rules:
  - status: Interview
    outcome: positive
    confidence: high
  - status: SKIP
    outcome: neutral_excluded
    confidence: high
`;
  await writeFile(path.join(root, "data", "applications.md"), tracker);
  await writeFile(path.join(root, "reports", "001-acme-2026-04-26.md"), reportA);
  await writeFile(path.join(root, "reports", "002-foo-2026-04-26.md"), reportB);
  await writeFile(path.join(root, "lib", "learn", "inference-rules.yml"), rules);

  return {
    root,
    paths: {
      tracker: path.join(root, "data", "applications.md"),
      reportsDir: path.join(root, "reports"),
      rules: path.join(root, "lib", "learn", "inference-rules.yml"),
      events: path.join(root, "data", "learn", "scoring-events.jsonl"),
      state: path.join(root, "data", "learn", ".parser-state.json"),
      warnings: path.join(root, "data", "learn", "parser-warnings.log"),
    },
  };
}

test("runParser emits events and is idempotent on re-run", async () => {
  const fx = await setupFixture();
  try {
    const r1 = await runParser({ paths: fx.paths, today: "2026-04-26" });
    assert.equal(r1.skipped, false);
    assert.equal(r1.new_events, 2);
    assert.equal(r1.warnings, 0);

    const r2 = await runParser({ paths: fx.paths, today: "2026-04-26" });
    assert.equal(r2.skipped, true);
    assert.equal(r2.reason, "tracker_unchanged");

    const eventsRaw = await readFile(fx.paths.events, "utf8");
    const eventLines = eventsRaw.split("\n").filter(Boolean);
    assert.equal(eventLines.length, 2, "no duplicates on re-run");
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("runParser respects schema with loop_type=scoring", async () => {
  const fx = await setupFixture();
  try {
    const r = await runParser({ paths: fx.paths, today: "2026-04-26" });
    for (const ev of r.events) {
      assert.equal(ev.loop_type, "scoring");
      assert.ok(ev.report_id);
      assert.ok(ev.real_outcome);
      assert.equal(ev.outcome_source, "inferred");
      assert.equal(ev.outcome_correction, null);
    }
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("sha256 produces stable hash for same input", () => {
  assert.equal(sha256("hello"), sha256("hello"));
  assert.notEqual(sha256("hello"), sha256("world"));
});
