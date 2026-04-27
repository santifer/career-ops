#!/usr/bin/env node
/**
 * save-reflect-state.mjs — Marca o reflect como concluído.
 *
 * Lê o número total de eventos em data/learn/scoring-events.jsonl e
 * grava em data/learn/.reflect-state.json:
 *   { last_reflect: <ISO>, last_event_count: <int> }
 *
 * Esse arquivo é consultado pelo reflect-analyzer.mjs para calcular
 * `new_events = total - last_event_count` e decidir se o quórum bateu
 * (≥5 novos eventos).
 *
 * CLI: node lib/learn/save-reflect-state.mjs
 *
 * Substituiu o snippet bash multi-line de modes/reflect.md (Passo 6)
 * que era frágil em PowerShell/cmd. Esse script é portável.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { saveReflectState } from "./reflect-analyzer.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const PATHS = {
  events: path.join(PROJECT_ROOT, "data", "learn", "scoring-events.jsonl"),
  state: path.join(PROJECT_ROOT, "data", "learn", ".reflect-state.json"),
};

export async function run(opts = {}) {
  const paths = { ...PATHS, ...(opts.paths || {}) };
  let total = 0;
  if (existsSync(paths.events)) {
    const raw = await readFile(paths.events, "utf8");
    total = raw.split(/\r?\n/).filter((l) => l.trim()).length;
  }
  const state = {
    last_reflect: new Date().toISOString(),
    last_event_count: total,
  };
  await saveReflectState(paths.state, state);
  return state;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  run()
    .then((s) => {
      console.log(`reflect-state saved: last_event_count=${s.last_event_count} last_reflect=${s.last_reflect}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`save-reflect-state error: ${err.message}`);
      process.exit(1);
    });
}
