#!/usr/bin/env node
/**
 * reflect-analyzer.mjs — Career-Ops scoring loop, analisador heurístico.
 *
 * Lê data/learn/scoring-events.jsonl, faz duas análises e propõe ajustes
 * em data/scoring-calibration.yml:
 *
 *   1. Score-bucket (archetype × score bucket high/mid/low):
 *      - hit_rate = positive / (positive + negative + inferred_negative)
 *      - bucket=high e hit_rate < 0.30 → ajuste sugerido -0.3 a -0.5
 *      - bucket=low e hit_rate > 0.60 → ajuste sugerido +0.3 a +0.5
 *
 *   2. Signal-based (archetype × signal_key=value vs baseline do archetype):
 *      - compara hit rate de eventos COM o signal vs baseline do archetype
 *      - se delta ≥30pp e sample ≥5, propõe ajuste -0.3 a -0.5 (ou +0.3 a +0.5)
 *      - dimension fica `signals.{key}={value}` (rastreável no calibration.yml)
 *
 * Heurística simples e auditável; não tenta ser ML.
 *
 *   - sample_size mínimo: 5 eventos no grupo (QUORUM_MIN)
 *   - confidence: high se ≥10, medium se ≥5
 *   - quórum global: pelo menos 5 NEW events desde último reflect (state file)
 *   - signals em SIGNAL_DENYLIST (metadata interno) são ignorados
 *
 * O modo /career-ops reflect (modes/reflect.md) consome o JSON deste
 * analisador e dispara AskUserQuestion por proposta.
 *
 * CLI:
 *   node lib/learn/reflect-analyzer.mjs              # imprime JSON
 *   node lib/learn/reflect-analyzer.mjs --window 7   # janela de 7 dias
 *   node lib/learn/reflect-analyzer.mjs --force      # ignora quórum
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const PATHS = {
  events: path.join(PROJECT_ROOT, "data", "learn", "scoring-events.jsonl"),
  state: path.join(PROJECT_ROOT, "data", "learn", ".reflect-state.json"),
};

const QUORUM_MIN = 5;
const SIGNAL_DELTA_MIN = 0.30; // 30pp absolute delta from baseline to propose
const SIGNAL_BASELINE_MIN = QUORUM_MIN * 2; // baseline precisa ≥10 para comparar

// Metadados internos do parser que NÃO devem virar dimensão de calibração.
const SIGNAL_DENYLIST = new Set([
  "tracker_status",
  "tracker_date",
  "days_since_status",
  "inference_reason",
  "confidence",
  "override_reason",
]);

export function isCalibratableSignal(key, value) {
  if (SIGNAL_DENYLIST.has(key)) return false;
  if (value == null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "string" && value.length > 0) return true;
  if (typeof value === "number" && Number.isFinite(value)) return true;
  return false;
}

export function bucketScore(score) {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 4.0) return "high";
  if (score >= 3.0) return "mid";
  return "low";
}

export function isPositiveOutcome(outcome) {
  return outcome === "positive";
}

export function countsAsSignal(outcome) {
  return outcome === "positive" || outcome === "negative" || outcome === "inferred_negative";
}

export function readEventsRaw(content) {
  return content
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function filterWindow(events, windowDays, today) {
  if (!windowDays || windowDays <= 0) return events;
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  const cutoff = todayMs - windowDays * 86400000;
  return events.filter((e) => {
    const ts = new Date(e.ts).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

export function analyze(events) {
  const groups = new Map();
  for (const ev of events) {
    if (ev.loop_type !== "scoring") continue;
    if (!countsAsSignal(ev.real_outcome)) continue;
    const archetype = ev.archetype || "(unknown)";
    const bucket = bucketScore(ev.predicted_score);
    if (!bucket) continue;
    const key = `${archetype}::${bucket}`;
    if (!groups.has(key)) {
      groups.set(key, { archetype, bucket, sample_size: 0, positive: 0, negative: 0, examples: [] });
    }
    const g = groups.get(key);
    g.sample_size += 1;
    if (isPositiveOutcome(ev.real_outcome)) g.positive += 1;
    else g.negative += 1;
    if (g.examples.length < 3) {
      g.examples.push({ report_id: ev.report_id, company: ev.company, predicted_score: ev.predicted_score, outcome: ev.real_outcome });
    }
  }

  const proposals = [];
  for (const g of groups.values()) {
    if (g.sample_size < QUORUM_MIN) continue;
    const hitRate = g.positive / g.sample_size;
    let proposal = null;
    if (g.bucket === "high" && hitRate < 0.30) {
      const magnitude = hitRate < 0.10 ? 0.5 : 0.3;
      proposal = {
        archetype: g.archetype,
        dimension: `score_bucket.${g.bucket}`,
        adjustment: -magnitude,
        reason: `${g.sample_size} ofertas em "${g.archetype}" com score ${g.bucket} (≥4) tiveram hit rate ${(hitRate * 100).toFixed(0)}% (positivos=${g.positive})`,
        sample_size: g.sample_size,
        confidence: g.sample_size >= 10 ? "high" : "medium",
        examples: g.examples,
      };
    } else if (g.bucket === "low" && hitRate > 0.60) {
      const magnitude = hitRate > 0.80 ? 0.5 : 0.3;
      proposal = {
        archetype: g.archetype,
        dimension: `score_bucket.${g.bucket}`,
        adjustment: +magnitude,
        reason: `${g.sample_size} ofertas em "${g.archetype}" com score ${g.bucket} (<3) tiveram hit rate ${(hitRate * 100).toFixed(0)}% (positivos=${g.positive})`,
        sample_size: g.sample_size,
        confidence: g.sample_size >= 10 ? "high" : "medium",
        examples: g.examples,
      };
    }
    if (proposal) proposals.push(proposal);
  }

  // M1: extensão por signals — analisa cada (archetype × signal=value) vs baseline do archetype
  const signalAnalysis = analyzeSignals(events);
  const allProposals = [...proposals, ...signalAnalysis.signal_proposals];

  return {
    groups: Array.from(groups.values()),
    signal_groups: signalAnalysis.signal_groups,
    proposals: allProposals,
  };
}

export function analyzeSignals(events) {
  // Calcula baseline hit rate por archetype.
  const baselineByArchetype = new Map();
  for (const ev of events) {
    if (ev.loop_type !== "scoring") continue;
    if (!countsAsSignal(ev.real_outcome)) continue;
    const a = ev.archetype || "(unknown)";
    if (!baselineByArchetype.has(a)) baselineByArchetype.set(a, { sample_size: 0, positive: 0 });
    const b = baselineByArchetype.get(a);
    b.sample_size += 1;
    if (isPositiveOutcome(ev.real_outcome)) b.positive += 1;
  }

  // Agrupa por (archetype × signal_key=signal_value).
  const byKey = new Map();
  for (const ev of events) {
    if (ev.loop_type !== "scoring") continue;
    if (!countsAsSignal(ev.real_outcome)) continue;
    const archetype = ev.archetype || "(unknown)";
    const sigs = ev.signals || {};
    for (const [k, v] of Object.entries(sigs)) {
      if (!isCalibratableSignal(k, v)) continue;
      const valStr = String(v);
      const key = `${archetype}::${k}=${valStr}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          archetype,
          signal: k,
          value: valStr,
          sample_size: 0,
          positive: 0,
          negative: 0,
          examples: [],
        });
      }
      const g = byKey.get(key);
      g.sample_size += 1;
      if (isPositiveOutcome(ev.real_outcome)) g.positive += 1;
      else g.negative += 1;
      if (g.examples.length < 3) {
        g.examples.push({
          report_id: ev.report_id,
          company: ev.company,
          predicted_score: ev.predicted_score,
          outcome: ev.real_outcome,
        });
      }
    }
  }

  const proposals = [];
  for (const g of byKey.values()) {
    if (g.sample_size < QUORUM_MIN) continue;
    const baseline = baselineByArchetype.get(g.archetype);
    if (!baseline || baseline.sample_size < SIGNAL_BASELINE_MIN) continue;
    const hitRate = g.positive / g.sample_size;
    const baselineRate = baseline.positive / baseline.sample_size;
    const delta = hitRate - baselineRate;
    if (Math.abs(delta) < SIGNAL_DELTA_MIN) continue;
    const magnitude = Math.abs(delta) >= 0.50 ? 0.5 : 0.3;
    const sign = delta < 0 ? -1 : 1;
    proposals.push({
      archetype: g.archetype,
      dimension: `signals.${g.signal}=${g.value}`,
      adjustment: sign * magnitude,
      reason: `Em "${g.archetype}", quando ${g.signal}=${g.value}, hit rate é ${(hitRate * 100).toFixed(0)}% vs baseline ${(baselineRate * 100).toFixed(0)}% (delta ${(delta * 100).toFixed(0)}pp em ${g.sample_size} eventos)`,
      sample_size: g.sample_size,
      confidence: g.sample_size >= 10 ? "high" : "medium",
      examples: g.examples,
    });
  }

  return { signal_groups: Array.from(byKey.values()), signal_proposals: proposals };
}

export async function loadReflectState(statePath) {
  if (!existsSync(statePath)) return { last_reflect: null, last_event_count: 0 };
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return { last_reflect: null, last_event_count: 0 };
  }
}

export async function saveReflectState(statePath, state) {
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

export async function runAnalyzer(opts = {}) {
  const force = opts.force === true;
  const windowDays = opts.windowDays || 0;
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const paths = { ...PATHS, ...(opts.paths || {}) };

  if (!existsSync(paths.events)) {
    return { quorum_met: false, total_events: 0, new_events: 0, proposals: [], note: "no_events_file" };
  }
  const raw = await readFile(paths.events, "utf8");
  const allEvents = readEventsRaw(raw);
  const totalEvents = allEvents.length;
  const state = await loadReflectState(paths.state);
  const newEvents = totalEvents - (state.last_event_count || 0);

  if (!force && newEvents < QUORUM_MIN) {
    return {
      quorum_met: false,
      total_events: totalEvents,
      new_events: newEvents,
      quorum_required: QUORUM_MIN,
      proposals: [],
      note: `quorum_pending (${newEvents}/${QUORUM_MIN})`,
    };
  }

  const events = filterWindow(allEvents, windowDays, today);
  const { groups, proposals } = analyze(events);
  return {
    quorum_met: true,
    total_events: totalEvents,
    new_events: newEvents,
    window_days: windowDays || null,
    events_in_window: events.length,
    groups,
    proposals,
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  const args = process.argv.slice(2);
  const opts = {
    force: args.includes("--force"),
    windowDays: (() => {
      const idx = args.indexOf("--window");
      if (idx === -1) return 0;
      const n = Number(args[idx + 1]);
      return Number.isFinite(n) ? n : 0;
    })(),
  };
  runAnalyzer(opts).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }).catch((err) => {
    console.error(`reflect-analyzer error: ${err.message}`);
    process.exit(1);
  });
}
