/**
 * pipeline.ts — internal adapter contract between the bridge HTTP layer
 * and the existing career-ops CLI.
 *
 * This is the seam where bridge.ts (HTTP) meets process_offer (shell).
 * The bridge layer MUST only talk to career-ops through an implementation
 * of `PipelineAdapter`. No direct `child_process.spawn` calls in the
 * HTTP handlers.
 *
 * Why this matters:
 *   • One place to mock in tests (fake adapter returns fixed snapshots).
 *   • One place to swap `claude -p` for the Agent SDK in Phase 4.
 *   • One place to enforce cwd = repo root and PATH hygiene.
 *
 * CONTRACTS ONLY. No runtime.
 */

import type {
  EvaluationInput,
  EvaluationResult,
  JobId,
  JobSnapshot,
  PhaseTransition,
} from "./jobs.js";
import type { BridgeError } from "./envelope.js";
import type {
  NewGradRow,
  EnrichedRow,
  NewGradScoreResult,
  NewGradEnrichResult,
} from "./newgrad.js";

/**
 * Configuration the adapter needs at construction time. Provided once
 * by the bridge bootstrap, immutable thereafter.
 */
export interface PipelineConfig {
  /** Absolute path to the career-ops repo root. cwd for every shell-out. */
  repoRoot: string;
  /** Absolute path to the `claude` CLI binary. Resolved via `which` at boot. */
  claudeBin: string;
  /** Absolute path to the `codex` CLI binary when available. */
  codexBin?: string | null;
  /** Absolute path to the `node` CLI binary. */
  nodeBin: string;
  /** Which CLI powers real mode. */
  realExecutor?: "claude" | "codex";
  /** Maximum seconds one evaluation is allowed to run. */
  evaluationTimeoutSec: number;
  /** Maximum seconds a Playwright liveness check is allowed to run. */
  livenessTimeoutSec: number;
  /**
   * If true, `claude -p` is invoked with `--dangerously-skip-permissions`
   * to match batch-runner.sh. If false, the caller must provide a
   * pre-approved permissions file. Default true in Phase 2; re-evaluated
   * in Phase 4.
   */
  allowDangerousClaudeFlags: boolean;
}

/**
 * Progress callback. Fired once per phase transition. The bridge uses it
 * to update the in-memory JobSnapshot and to push SSE events to subscribers.
 *
 * The callback is synchronous from the adapter's perspective but MAY
 * trigger async fan-out (SSE writes) in the bridge layer.
 */
export type PipelineProgressHandler = (transition: PhaseTransition) => void;

/**
 * The adapter interface. One method per capability the bridge exposes.
 * Each method returns the *terminal* state; the progress handler handles
 * in-flight updates.
 */
export interface PipelineAdapter {
  /**
   * Cheap health probe. Returns structured info about tool availability.
   * Never throws; all failures show up in the returned struct.
   */
  doctor(): Promise<DoctorReport>;

  /**
   * URL liveness check. Shells out to `node check-liveness.mjs <url>`.
   * Returns a tri-state so the popup can render a "this job may be closed"
   * warning before the user spends an evaluation on a dead URL.
   */
  checkLiveness(url: string): Promise<LivenessCheck>;

  /**
   * Run one full evaluation. Equivalent to `batch-runner.sh::process_offer`
   * with parallelism 1 and a single-offer input.
   *
   * Implementation outline (for reviewers — NOT binding code):
   *   1. reserveReportNumber() under batch/.batch-state.lock
   *   2. if input.pageText is absent or too short, extract JD via
   *      Playwright and write to /tmp/batch-jd-<jobId>.txt
   *   3. render batch-prompt.md with {{URL}}, {{JD_FILE}}, {{REPORT_NUM}},
   *      {{DATE}}, {{ID}} substitutions into a .resolved-prompt-<jobId>.md
   *   4. spawn `claude -p --append-system-prompt-file <resolved> "<task>"`
   *      with cwd = repoRoot
   *   5. on exit 0: locate reports/<num>-<slug>-<date>.md, parse header
   *      + score, parse generated tracker-additions/<num>-<slug>.tsv,
   *      return EvaluationResult
   *   6. on exit non-zero: return BridgeError(EVAL_FAILED, stderr tail)
   *
   * Throws ONLY on programmer errors. Every pipeline failure is a
   * returned BridgeError, never an exception.
   */
  runEvaluation(
    jobId: JobId,
    input: EvaluationInput,
    onProgress: PipelineProgressHandler,
  ): Promise<EvaluationResult | BridgeError>;

  /**
   * Read a report file by number. Pure filesystem read; no agent, no shell.
   * Returns undefined if the file does not exist.
   */
  readReport(num: number): Promise<ReportFile | undefined>;

  /**
   * Read the tail of data/applications.md, parsed into TrackerRows.
   * Pure filesystem read. Never modifies the tracker.
   */
  readTrackerTail(limit: number): Promise<{
    rows: readonly import("./jobs.js").TrackerRow[];
    totalRows: number;
  }>;

  /**
   * Kick off `node merge-tracker.mjs` to flush pending drop files.
   * Called explicitly from POST /tracker/merge and may also be used by
   * bridge-side evaluation flows that want to fully sync the tracker
   * before returning success to the extension UI.
   */
  mergeTracker(dryRun: boolean): Promise<MergeReport>;

  /**
   * Score and filter a batch of newgrad-jobs.com listing rows.
   * Reads scoring config from profile.yml, negative keywords from
   * portals.yml, hard blocker rules from profile.yml, and dedup set
   * from applications.md.
   */
  scoreNewGradRows(rows: NewGradRow[]): Promise<NewGradScoreResult>;

  /**
   * Enrich scored rows with detail-page data, re-score using description
   * text, apply pipeline_threshold + hard blockers, and append survivors
   * to pipeline.md.
   *
   * @param onProgress — optional callback invoked after each row is processed,
   *   enabling SSE streaming endpoints to emit per-row progress events.
   */
  enrichNewGradRows(
    rows: EnrichedRow[],
    onProgress?: (current: number, total: number, row: EnrichedRow) => void,
  ): Promise<NewGradEnrichResult>;
}

/* -------------------------------------------------------------------------- */
/*  Structs returned by the adapter                                           */
/* -------------------------------------------------------------------------- */

export interface DoctorReport {
  ok: boolean;
  repo: {
    rootPath: string;
    careerOpsVersion: string;
    trackerOk: boolean;
    cvOk: boolean;
    profileOk: boolean;
  };
  claudeCli: { ok: boolean; version?: string; error?: string };
  node: { version: string };
  playwrightChromium: { ok: boolean; error?: string };
}

export interface LivenessCheck {
  url: string;
  status: "active" | "expired" | "uncertain";
  reason: string;
  /** Exit code from check-liveness.mjs, for diagnostics. */
  exitCode: number;
}

export interface ReportFile {
  num: number;
  path: string;
  markdown: string;
  meta: {
    company: string;
    role: string;
    date: string;
    score: number;
    archetype: string;
    url?: string;
  };
}

export interface MergeReport {
  added: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
}

/* -------------------------------------------------------------------------- */
/*  In-memory job store contract                                              */
/* -------------------------------------------------------------------------- */

/**
 * Minimal job store. Phase 2 implementation is in-memory only.
 * Phase 4 may add a persistent store (SQLite or flat JSON) — this
 * interface is the seam.
 */
export interface JobStore {
  create(snapshot: JobSnapshot): Promise<void>;
  get(id: JobId): Promise<JobSnapshot | undefined>;
  update(id: JobId, patch: Partial<JobSnapshot>): Promise<JobSnapshot>;
  subscribe(id: JobId, listener: (snap: JobSnapshot) => void): () => void;
  /** List recent jobs, newest first. */
  list(limit: number): Promise<readonly JobSnapshot[]>;
}
