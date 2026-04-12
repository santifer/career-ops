/**
 * shared/utils.ts — pure utility functions used by both popup and panel.
 *
 * No DOM access, no chrome APIs, no side effects. These are compile-time
 * bundled into each entry point by esbuild — no runtime module sharing.
 */

import type { JobPhase } from "../contracts/bridge-wire.js";

export type BridgePreset = "fake" | "real-claude" | "real-codex" | "sdk";

export function scoreColor(score: number): string {
  if (score >= 4.0) return "#4ecb71";
  if (score >= 2.5) return "#e5b93c";
  return "#ef5f5f";
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export const PHASE_ORDER: readonly JobPhase[] = [
  "queued",
  "extracting_jd",
  "evaluating",
  "writing_report",
  "generating_pdf",
  "writing_tracker",
  "completed",
];

export const PHASE_LABEL: Record<JobPhase, string> = {
  queued: "Queued",
  extracting_jd: "Extracting job description",
  evaluating: "Evaluating (A\u2013F blocks)",
  writing_report: "Writing report",
  generating_pdf: "PDF step",
  writing_tracker: "Writing tracker row",
  completed: "Completed",
  failed: "Failed",
};

export function presetDisplayName(preset: BridgePreset): string {
  switch (preset) {
    case "fake": return "fake";
    case "real-claude": return "real / claude";
    case "real-codex": return "real / codex";
    case "sdk": return "sdk";
  }
}

export function presetDescription(preset: BridgePreset): string {
  switch (preset) {
    case "fake":
      return "Fast UI smoke mode. No real report or PDF files are written.";
    case "real-claude":
      return "Full checked-in career-ops flow using claude -p as the executor.";
    case "real-codex":
      return "Full checked-in career-ops flow using codex exec as the executor.";
    case "sdk":
      return "Direct Anthropic SDK mode. Report and tracker write, but PDF is currently skipped.";
  }
}

export function presetCommand(preset: BridgePreset): string {
  switch (preset) {
    case "fake":
      return "npm --prefix bridge run start";
    case "real-claude":
      return "CAREER_OPS_BRIDGE_MODE=real npm --prefix bridge run start";
    case "real-codex":
      return "CAREER_OPS_BRIDGE_MODE=real CAREER_OPS_REAL_EXECUTOR=codex npm --prefix bridge run start";
    case "sdk":
      return "CAREER_OPS_BRIDGE_MODE=sdk ANTHROPIC_API_KEY=... npm --prefix bridge run start";
  }
}

export interface HealthResultLike {
  execution?: { mode?: string; realExecutor?: string | null };
}

export function presetFromHealth(health: HealthResultLike): BridgePreset | null {
  if (health?.execution?.mode === "fake") return "fake";
  if (health?.execution?.mode === "sdk") return "sdk";
  if (health?.execution?.mode === "real") {
    return health?.execution?.realExecutor === "codex" ? "real-codex" : "real-claude";
  }
  return null;
}
