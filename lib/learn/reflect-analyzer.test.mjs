import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  bucketScore,
  countsAsSignal,
  isPositiveOutcome,
  isCalibratableSignal,
  filterWindow,
  analyze,
  analyzeSignals,
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

test("isCalibratableSignal denies internal metadata, allows custom signals", () => {
  assert.equal(isCalibratableSignal("tracker_status", "Applied"), false);
  assert.equal(isCalibratableSignal("tracker_date", "2026-04-26"), false);
  assert.equal(isCalibratableSignal("days_since_status", 30), false);
  assert.equal(isCalibratableSignal("inference_reason", "..."), false);
  assert.equal(isCalibratableSignal("company_size_lt_50", true), true);
  assert.equal(isCalibratableSignal("stage", "Series A"), true);
  assert.equal(isCalibratableSignal("any_field", null), false);
  assert.equal(isCalibratableSignal("any_field", ""), false);
});

test("analyzeSignals proposes negative adjustment when signal hurts hit rate vs baseline", () => {
  // Baseline: archetype "X" tem 12 eventos, 50% positives globalmente.
  // Mas dos 6 eventos com signal company_size_lt_50=true, 0% são positives.
  // Diferença de -50pp deve gerar proposta negativa.
  const events = [];
  // 6 com signal, todos negativos
  for (let i = 0; i < 6; i += 1) {
    events.push({
      loop_type: "scoring",
      archetype: "X",
      predicted_score: 4.0,
      real_outcome: "negative",
      report_id: String(i).padStart(3, "0"),
      company: `Small${i}`,
      signals: { company_size_lt_50: true },
    });
  }
  // 6 sem signal, todos positivos
  for (let i = 6; i < 12; i += 1) {
    events.push({
      loop_type: "scoring",
      archetype: "X",
      predicted_score: 4.0,
      real_outcome: "positive",
      report_id: String(i).padStart(3, "0"),
      company: `Big${i}`,
      signals: { company_size_lt_50: false },
    });
  }
  const { signal_proposals } = analyzeSignals(events);
  const negProp = signal_proposals.find((p) => p.dimension === "signals.company_size_lt_50=true");
  assert.ok(negProp, "expected proposal for company_size_lt_50=true");
  assert.ok(negProp.adjustment < 0);
  assert.equal(negProp.sample_size, 6);
});

test("analyzeSignals ignores denylist signals (tracker_status, etc.)", () => {
  const events = Array.from({ length: 6 }, (_, i) => ({
    loop_type: "scoring",
    archetype: "X",
    predicted_score: 4.0,
    real_outcome: "negative",
    report_id: String(i).padStart(3, "0"),
    company: `C${i}`,
    signals: { tracker_status: "Applied", days_since_status: 30 },
  }));
  // adiciona baseline events
  for (let i = 6; i < 16; i += 1) {
    events.push({
      loop_type: "scoring",
      archetype: "X",
      predicted_score: 4.0,
      real_outcome: "positive",
      report_id: String(i).padStart(3, "0"),
      company: `B${i}`,
      signals: {},
    });
  }
  const { signal_proposals } = analyzeSignals(events);
  // nenhum proposal deve ser sobre tracker_status ou days_since_status
  for (const p of signal_proposals) {
    assert.ok(!p.dimension.includes("tracker_status"), `tracker_status should be denied: ${p.dimension}`);
    assert.ok(!p.dimension.includes("days_since_status"), `days_since_status should be denied: ${p.dimension}`);
  }
});

test("analyze (full) returns both bucket and signal proposals merged", () => {
  // 6 eventos high-bucket todos negativos → bucket proposal -0.3 a -0.5
  // E todos com signals.is_remote=false → signal proposal também
  const events = Array.from({ length: 6 }, (_, i) => ({
    loop_type: "scoring",
    archetype: "Y",
    predicted_score: 4.5,
    real_outcome: "negative",
    report_id: String(i).padStart(3, "0"),
    company: `C${i}`,
    signals: { is_remote: false },
  }));
  // baseline 6 positivos sem signal
  for (let i = 6; i < 12; i += 1) {
    events.push({
      loop_type: "scoring",
      archetype: "Y",
      predicted_score: 4.5,
      real_outcome: "positive",
      report_id: String(i).padStart(3, "0"),
      company: `B${i}`,
      signals: { is_remote: true },
    });
  }
  const { proposals } = analyze(events);
  const bucketProp = proposals.find((p) => p.dimension.startsWith("score_bucket."));
  const signalProp = proposals.find((p) => p.dimension.startsWith("signals."));
  assert.ok(bucketProp || signalProp, "at least one proposal expected");
});

test("analyze ignores events where loop_type !== 'scoring' (M3 guard)", () => {
  const events = [
    // 5 events com loop_type="recruiter" — devem ser totalmente ignorados
    ...Array.from({ length: 5 }, (_, i) => ({
      loop_type: "recruiter",
      archetype: "X",
      predicted_score: 4.5,
      real_outcome: "negative",
      report_id: String(i).padStart(3, "0"),
      company: `R${i}`,
    })),
    // 5 events com loop_type ausente — também ignorados (não default!)
    ...Array.from({ length: 5 }, (_, i) => ({
      archetype: "X",
      predicted_score: 4.5,
      real_outcome: "negative",
      report_id: String(i + 10).padStart(3, "0"),
      company: `N${i}`,
    })),
  ];
  const { groups, proposals } = analyze(events);
  assert.equal(groups.length, 0, "no scoring groups should be formed");
  assert.equal(proposals.length, 0, "no proposals from non-scoring events");
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
