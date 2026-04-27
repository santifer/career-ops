#!/usr/bin/env node
/**
 * correct.mjs — Career-Ops scoring loop, override manual.
 *
 * Permite ao usuário corrigir o real_outcome de uma aplicação quando
 * o status no tracker não reflete a realidade (ex.: empresa rejeitou
 * por email mas o usuário ainda não atualizou o tracker, ou Applied
 * inferred_negative depois de 30d mas na verdade está em processo).
 *
 * CLI:
 *   node lib/learn/correct.mjs <report_id> <outcome> [reason]
 *
 * Outcomes válidos:
 *   positive | negative | neutral_excluded | inferred_negative
 *
 * Efeitos:
 *   1. Append em data/learn/scoring-events.jsonl com outcome_source="manual"
 *      e outcome_correction={ previous: <último evento>, reason }.
 *   2. NÃO altera o tracker (data/applications.md). Se quiser também
 *      mudar o status, faça via /career-ops tracker.
 *
 * O parser passivo respeita override manual: na próxima passada,
 * eventos manuais com mesmo report_id têm precedência sobre os
 * inferidos do mesmo período.
 */

import { readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const PATHS = {
  events: path.join(PROJECT_ROOT, "data", "learn", "scoring-events.jsonl"),
  tracker: path.join(PROJECT_ROOT, "data", "applications.md"),
  reportsDir: path.join(PROJECT_ROOT, "reports"),
};

const VALID_OUTCOMES = new Set(["positive", "negative", "neutral_excluded", "inferred_negative"]);

import { parseTracker, parseReportHeader, findReportFile, parseScore } from "./scoring-parser.mjs";

export function findTrackerRow(rows, reportId) {
  const target = String(reportId).padStart(3, "0");
  // Match by num column or by [NNN] in report cell
  return rows.find((r) => {
    if (r.num === target) return true;
    const bracket = (r.report_cell || "").match(/\[#?(\d{3})\]/);
    return bracket && bracket[1] === target;
  });
}

export async function findLastEventForReport(eventsPath, reportId) {
  if (!existsSync(eventsPath)) return null;
  const raw = await readFile(eventsPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const ev = JSON.parse(lines[i]);
      if (ev.report_id === reportId) return ev;
    } catch {
      continue;
    }
  }
  return null;
}

export async function runCorrect(opts) {
  const { reportId, outcome, reason } = opts;
  const paths = { ...PATHS, ...(opts.paths || {}) };

  if (!reportId) throw new Error("missing report_id");
  if (!VALID_OUTCOMES.has(outcome)) {
    throw new Error(`invalid outcome "${outcome}". Valid: ${[...VALID_OUTCOMES].join(", ")}`);
  }

  const trackerRaw = await readFile(paths.tracker, "utf8");
  const rows = parseTracker(trackerRaw);
  const padded = String(reportId).padStart(3, "0");
  const row = findTrackerRow(rows, padded);
  if (!row) throw new Error(`report_id ${padded} not found in tracker`);

  const reportFile = await findReportFile(padded, paths.reportsDir);
  let predictedScore = null;
  let archetype = null;
  if (reportFile) {
    const reportRaw = await readFile(path.join(paths.reportsDir, reportFile), "utf8");
    const header = parseReportHeader(reportRaw);
    predictedScore = header.predicted_score;
    archetype = header.archetype;
  }
  if (predictedScore == null) predictedScore = parseScore(row.score_raw);

  const previous = await findLastEventForReport(paths.events, padded);

  const event = {
    ts: new Date().toISOString(),
    loop_type: "scoring",
    report_id: padded,
    company: row.company,
    role: row.role,
    predicted_score: predictedScore,
    archetype: archetype,
    real_outcome: outcome,
    outcome_source: "manual",
    outcome_correction: previous
      ? {
          previous_outcome: previous.real_outcome,
          previous_source: previous.outcome_source,
          previous_ts: previous.ts,
          reason: reason || null,
        }
      : { previous_outcome: null, previous_source: null, previous_ts: null, reason: reason || null },
    signals: {
      tracker_status: row.status,
      tracker_date: row.date,
      override_reason: reason || null,
    },
    status_at_inference: row.status,
  };

  const line = JSON.stringify(event) + "\n";
  await appendFile(paths.events, line, "utf8");
  return event;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
    console.error("Usage: node lib/learn/correct.mjs <report_id> <outcome> [reason]");
    console.error(`  outcome ∈ {${[...VALID_OUTCOMES].join(", ")}}`);
    process.exit(2);
  }
  const [reportId, outcome, ...reasonParts] = args;
  const reason = reasonParts.join(" ") || null;
  runCorrect({ reportId, outcome, reason })
    .then((ev) => {
      console.log(`✓ Manual override registered for report ${ev.report_id}: ${ev.real_outcome}`);
      if (ev.outcome_correction.previous_outcome) {
        console.log(`  (previous: ${ev.outcome_correction.previous_outcome} from ${ev.outcome_correction.previous_source})`);
      }
      if (reason) console.log(`  reason: ${reason}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`correct error: ${err.message}`);
      process.exit(1);
    });
}
