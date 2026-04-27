#!/usr/bin/env node
/**
 * scoring-parser.mjs — Career-Ops scoring loop, parser passivo.
 *
 * Lê data/applications.md (tracker) + reports/*.md, cruza por report_id,
 * aplica lib/learn/inference-rules.yml e emite eventos JSONL append-only
 * em data/learn/scoring-events.jsonl.
 *
 * Idempotente: usa um state file (data/learn/.parser-state.json) com:
 *   - tracker_hash: SHA-256 do conteúdo do tracker. Se igual ao último
 *     run, sai sem trabalho.
 *   - processed_keys: set de "report_id|status|date" já emitidos.
 *
 * Warnings de pares órfãos (tracker sem report ou report sem tracker)
 * vão para data/learn/parser-warnings.log.
 *
 * CLI:
 *   node lib/learn/scoring-parser.mjs           # roda silencioso, retorna 0
 *   node lib/learn/scoring-parser.mjs --verbose # imprime resumo
 *   node lib/learn/scoring-parser.mjs --dry-run # não escreve eventos
 *
 * Schema do evento (genérico, multi-loop):
 *   {
 *     ts: ISO-8601,
 *     loop_type: "scoring",
 *     report_id: "034",
 *     company: "Getnet",
 *     role: "Controller Manager",
 *     predicted_score: 4.3,
 *     archetype: "Head de Accounting / Controllership",
 *     real_outcome: "positive" | "negative" | "neutral_excluded" | "inferred_negative",
 *     outcome_source: "inferred" | "manual",
 *     outcome_correction: null | { previous: "...", reason: "..." },
 *     signals: { tracker_status: "Applied", days_since_status: 30, ... },
 *     status_at_inference: "Applied"
 *   }
 */

import { readFile, writeFile, appendFile, mkdir, stat } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const PATHS = {
  tracker: path.join(PROJECT_ROOT, "data", "applications.md"),
  reportsDir: path.join(PROJECT_ROOT, "reports"),
  rules: path.join(PROJECT_ROOT, "lib", "learn", "inference-rules.yml"),
  events: path.join(PROJECT_ROOT, "data", "learn", "scoring-events.jsonl"),
  state: path.join(PROJECT_ROOT, "data", "learn", ".parser-state.json"),
  warnings: path.join(PROJECT_ROOT, "data", "learn", "parser-warnings.log"),
};

// ---------- Utilities ----------

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function parseScore(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  if (cleaned === "N/A" || cleaned === "-" || cleaned === "") return null;
  const slashFive = cleaned.match(/^([\d.]+)\s*\/\s*5$/);
  if (slashFive) return Number(slashFive[1]);
  const slashTen = cleaned.match(/^([\d.]+)\s*\/\s*10$/);
  if (slashTen) return Number(slashTen[1]) / 2;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function extractReportIdFromCell(cell) {
  if (!cell) return null;
  // Captura "[023]", "[#023]" ou "reports/023-..." mas NÃO datas tipo "2026"
  const bracket = cell.match(/\[#?(\d{3})\]/);
  if (bracket) return bracket[1];
  const reportPath = cell.match(/reports\/(\d{3})-/);
  if (reportPath) return reportPath[1];
  return null;
}

export function daysBetween(isoA, isoB) {
  const a = new Date(`${isoA}T00:00:00Z`).getTime();
  const b = new Date(`${isoB}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

// ---------- Tracker parsing ----------

export function parseTracker(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (line.startsWith("| #")) continue;
    if (/^\|\s*-+/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 8) continue;
    const num = cells[0];
    if (!/^\d+$/.test(num)) continue;
    rows.push({
      num: num.padStart(3, "0"),
      date: cells[1],
      company: cells[2],
      role: cells[3],
      score_raw: cells[4],
      status: cells[5],
      pdf: cells[6],
      report_cell: cells[7],
      notes: cells[8] || "",
    });
  }
  return rows;
}

// ---------- Reports parsing ----------

export async function findReportFile(reportId, reportsDir) {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(reportsDir).catch(() => []);
  const prefix = `${reportId}-`;
  return files.find((f) => f.startsWith(prefix) && f.endsWith(".md")) || null;
}

export function parseReportHeader(markdown) {
  // Aceita variantes: "**Score:** 4.3/5", "**Score: 4.3/5**",
  // "**Score: 2.5/5 — SKIP**". Captura o primeiro X/Y do header.
  const head = markdown.split(/^---/m)[0] || markdown;
  const scoreMatch = head.match(/\*\*Score:?\s*\*?\*?\s*([\d.]+\s*\/\s*\d+)/i);
  const arche = head.match(/\*\*Arqu[eé]tipo:\*\*\s*([^\n]+)/i);
  const legit = head.match(/\*\*Legitim[ai][cd][ai][dt][ae]?:\*\*\s*([^\n]+)/i);
  return {
    predicted_score: scoreMatch ? parseScore(scoreMatch[1]) : null,
    archetype: arche ? arche[1].trim() : null,
    legitimacy: legit ? legit[1].trim() : null,
  };
}

// ---------- Inference ----------

export function inferOutcome(rules, status, statusDate, today) {
  const norm = String(status || "").trim();
  const rule = rules.find((r) => r.status.toLowerCase() === norm.toLowerCase());
  if (!rule) {
    return { outcome: null, confidence: null, reason: `unknown_status:${norm}` };
  }
  if (rule.stale_after_days != null) {
    const days = daysBetween(statusDate, today);
    if (days == null || days < rule.stale_after_days) {
      return { outcome: null, confidence: null, reason: "wait_for_stale" };
    }
  }
  return {
    outcome: rule.outcome,
    confidence: rule.confidence,
    reason: rule.note || "rule_match",
  };
}

// ---------- State ----------

async function loadState(statePath) {
  if (!existsSync(statePath)) return { tracker_hash: null, processed_keys: [], event_count: 0, last_run: null };
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { tracker_hash: null, processed_keys: [], event_count: 0, last_run: null };
  }
}

async function saveState(statePath, state) {
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

// ---------- Warnings ----------

async function appendWarning(warningsPath, message) {
  const ts = new Date().toISOString();
  await appendFile(warningsPath, `${ts}  ${message}\n`, "utf8");
}

// ---------- Main run ----------

export async function runParser(opts = {}) {
  const verbose = opts.verbose === true;
  const dryRun = opts.dryRun === true;
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const paths = { ...PATHS, ...(opts.paths || {}) };

  await mkdir(path.dirname(paths.events), { recursive: true });

  const trackerRaw = await readFile(paths.tracker, "utf8");
  const trackerHash = sha256(trackerRaw);
  const state = await loadState(paths.state);

  if (state.tracker_hash === trackerHash && !opts.force) {
    if (verbose) {
      console.log(`scoring-parser: tracker unchanged (hash=${trackerHash.slice(0, 8)}). Skipping.`);
    }
    return { skipped: true, reason: "tracker_unchanged", new_events: 0, warnings: 0 };
  }

  const rulesRaw = await readFile(paths.rules, "utf8");
  const rulesDoc = yaml.load(rulesRaw);
  const rules = rulesDoc?.rules || [];

  const rows = parseTracker(trackerRaw);
  const processed = new Set(state.processed_keys || []);
  const newEvents = [];
  let warnings = 0;

  for (const row of rows) {
    const reportId = extractReportIdFromCell(row.report_cell) || row.num;
    const key = `${reportId}|${row.status}|${row.date}`;
    if (processed.has(key)) continue;

    const inference = inferOutcome(rules, row.status, row.date, today);
    if (!inference.outcome) {
      // wait_for_stale or unknown — não emite evento, mas marca como visto
      // só quando for unknown (reporta uma vez); stale fica fora do processed
      if (inference.reason && inference.reason.startsWith("unknown_status")) {
        await appendWarning(paths.warnings, `unknown_status report_id=${reportId} status="${row.status}"`);
        warnings += 1;
      }
      continue;
    }

    const reportFile = await findReportFile(reportId, paths.reportsDir);
    let predictedScore = null;
    let archetype = null;
    let legitimacy = null;
    if (reportFile) {
      const reportPath = path.join(paths.reportsDir, reportFile);
      try {
        const reportRaw = await readFile(reportPath, "utf8");
        const header = parseReportHeader(reportRaw);
        predictedScore = header.predicted_score;
        archetype = header.archetype;
        legitimacy = header.legitimacy;
      } catch (err) {
        await appendWarning(paths.warnings, `unreadable_report report_id=${reportId} file=${reportFile} err=${err.message}`);
        warnings += 1;
      }
    } else {
      await appendWarning(paths.warnings, `orphan_tracker_row report_id=${reportId} company="${row.company}" status="${row.status}"`);
      warnings += 1;
    }

    if (predictedScore == null) {
      // Fallback: usa score do tracker (canônico) se header do report
      // não casou nenhuma variante de formato.
      predictedScore = parseScore(row.score_raw);
    }
    if (predictedScore == null) {
      await appendWarning(paths.warnings, `missing_predicted_score report_id=${reportId}`);
      warnings += 1;
      processed.add(key);
      continue;
    }

    const event = {
      ts: new Date().toISOString(),
      loop_type: "scoring",
      report_id: reportId,
      company: row.company,
      role: row.role,
      predicted_score: predictedScore,
      archetype: archetype,
      real_outcome: inference.outcome,
      outcome_source: "inferred",
      outcome_correction: null,
      signals: {
        tracker_status: row.status,
        tracker_date: row.date,
        days_since_status: daysBetween(row.date, today),
        legitimacy: legitimacy,
        confidence: inference.confidence,
        inference_reason: inference.reason,
      },
      status_at_inference: row.status,
    };

    newEvents.push(event);
    processed.add(key);
  }

  if (!dryRun && newEvents.length > 0) {
    const payload = newEvents.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await appendFile(paths.events, payload, "utf8");
  }

  if (!dryRun) {
    await saveState(paths.state, {
      tracker_hash: trackerHash,
      processed_keys: Array.from(processed),
      event_count: (state.event_count || 0) + newEvents.length,
      last_run: new Date().toISOString(),
    });
  }

  if (verbose) {
    console.log(`scoring-parser: ${newEvents.length} new events, ${warnings} warnings (dry_run=${dryRun})`);
    for (const e of newEvents) {
      console.log(`  + ${e.report_id} ${e.company} ${e.real_outcome} (predicted=${e.predicted_score}, status=${e.status_at_inference})`);
    }
  }

  return { skipped: false, new_events: newEvents.length, warnings, events: newEvents };
}

// ---------- CLI entry ----------

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  const args = process.argv.slice(2);
  const opts = {
    verbose: args.includes("--verbose") || args.includes("-v"),
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
  };
  runParser(opts).then((res) => {
    if (!opts.verbose && !res.skipped) {
      console.log(JSON.stringify(res, null, 2));
    }
    process.exit(0);
  }).catch((err) => {
    console.error(`scoring-parser error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}
