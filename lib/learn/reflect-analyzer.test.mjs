import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  bucketScore,
  countsAsSignal,
  isPositiveOutcome,
  filterWindow,
  analyze,
  runAnalyzer,
} from "./reflect-analyzer.mjs";

test("bucketScore classifies high/mid/low", () => {
  assert.equal(bucketScore(4.5), "high");
  assert.equal(bucketScore(4.0), "high");
  assert.equal(bucketScore(3.9), "mid");
  assert.equal(bucketScore(3.0), "mid");
  assert.equal(bucketScore(2.9), "low");
  assert.equal(bucketScore(null), null);
  assert.equal(bucketScore(NaN), null);
});

test("countsAsSignal excludes neutral_excluded", () => {
  assert.equal(countsAsSignal("positive"), true);
  assert.equal(countsAsSignal("negative"), true);
  assert.equal(countsAsSignal("inferred_negative"), true);
  assert.equal(countsAsSignal("neutral_excluded"), false);
  assert.equal(countsAsSignal("unknown"), false);
});

test("analyze proposes negative adjustment for high bucket with low hit rate", () => {
  const events = Array.from({ length: 6 }, (_, i) => ({
    loop_type: "scoring",
    archetype: "Controller LATAM",
    predicted_score: 4.3,
    real_outcome: i === 0 ? "positive" : "negative",
    report_id: String(i).padStart(3, "0"),
    company: `C${i}`,
  }));
  const { proposals } = analyze(events);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].archetype, "Controller LATAM");
  assert.equal(proposals[0].dimension, "score_bucket.high");
  assert.ok(proposals[0].adjustment < 0);
  assert.equal(proposals[0].sample_size, 6);
});

test("analyze proposes positive adjustment for low bucket with high hit rate", () => {
  const events = Array.from({ length: 6 }, (_, i) => ({
    loop_type: "scoring",
    archetype: "Controller LATAM",
    predicted_score: 2.5,
    real_outcome: i === 0 ? "negative" : "positive",
    report_id: String(i).padStart(3, "0"),
    company: `C${i}`,
  }));
  const { proposals } = analyze(events);
  assert.equal(proposals.length, 1);
  assert.ok(proposals[0].adjustment > 0);
});

test("analyze ignores groups below quorum", () => {
  const events = [
    { loop_type: "scoring", archetype: "X", predicted_score: 4.5, real_outcome: "negative", report_id: "001", company: "A" },
    { loop_type: "scoring", archetype: "X", predicted_score: 4.5, real_outcome: "negative", report_id: "002", company: "B" },
  ];
  const { proposals } = analyze(events);
  assert.equal(proposals.length, 0);
});

test("analyze ignores neutral_excluded events", () => {
  const events = Array.from({ length: 10 }, (_, i) => ({
    loop_type: "scoring",
    archetype: "X",
    predicted_score: 4.5,
    real_outcome: "neutral_excluded",
    report_id: String(i).padStart(3, "0"),
    company: `C${i}`,
  }));
  const { groups, proposals } = analyze(events);
  assert.equal(groups.length, 0);
  assert.equal(proposals.length, 0);
});

test("filterWindow keeps only events within N days", () => {
  const events = [
    { ts: "2026-04-01T00:00:00Z" },
    { ts: "2026-04-20T00:00:00Z" },
    { ts: "2026-04-25T00:00:00Z" },
  ];
  const out = filterWindow(events, 7, "2026-04-26");
  assert.equal(out.length, 2);
});

test("runAnalyzer reports quorum_pending when fewer than 5 new events", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reflect-"));
  await mkdir(path.join(root, "data", "learn"), { recursive: true });
  const events = Array.from({ length: 3 }, (_, i) => ({
    ts: "2026-04-26T00:00:00Z",
    loop_type: "scoring",
    archetype: "X",
    predicted_score: 4.5,
    real_outcome: "negative",
    report_id: String(i).padStart(3, "0"),
    company: "C",
  }));
  const eventsPath = path.join(root, "data", "learn", "scoring-events.jsonl");
  const statePath = path.join(root, "data", "learn", ".reflect-state.json");
  await writeFile(eventsPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");

  const r = await runAnalyzer({ paths: { events: eventsPath, state: statePath } });
  assert.equal(r.quorum_met, false);
  assert.equal(r.new_events, 3);
  await rm(root, { recursive: true, force: true });
});

test("runAnalyzer with --force ignores quorum", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reflect-"));
  await mkdir(path.join(root, "data", "learn"), { recursive: true });
  const events = Array.from({ length: 6 }, (_, i) => ({
    ts: "2026-04-26T00:00:00Z",
    loop_type: "scoring",
    archetype: "Controller LATAM",
    predicted_score: 4.3,
    real_outcome: i === 0 ? "positive" : "negative",
    report_id: String(i).padStart(3, "0"),
    company: `C${i}`,
  }));
  const eventsPath = path.join(root, "data", "learn", "scoring-events.jsonl");
  const statePath = path.join(root, "data", "learn", ".reflect-state.json");
  await writeFile(eventsPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");

  const r = await runAnalyzer({ paths: { events: eventsPath, state: statePath }, force: true });
  assert.equal(r.quorum_met, true);
  assert.ok(r.proposals.length >= 1);
  await rm(root, { recursive: true, force: true });
});
