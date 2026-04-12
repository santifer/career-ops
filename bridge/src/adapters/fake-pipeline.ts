/**
 * fake-pipeline.ts — deterministic PipelineAdapter for the vertical slice.
 *
 * Emits scripted phase transitions with small delays, returns a canned
 * EvaluationResult derived from the input URL. Used when
 * CAREER_OPS_BRIDGE_MODE=fake (the default).
 *
 * Purpose:
 *   • Let us verify the full popup ↔ background ↔ HTTP ↔ SSE ↔ job-store
 *     chain without spawning claude -p or touching the repo's reports/.
 *   • Enable future integration tests to run without Claude tokens.
 *   • Give the popup something visible to render so the UI can be built
 *     in parallel with the real adapter.
 *
 * This adapter NEVER writes files. Every result it returns points to
 * synthetic paths that do not exist — the popup's "Open report" action
 * will fail gracefully against the fake adapter, which is correct.
 */

import type {
  DoctorReport,
  LivenessCheck,
  MergeReport,
  PipelineAdapter,
  PipelineConfig,
  PipelineProgressHandler,
  ReportFile,
} from "../contracts/pipeline.js";
import type {
  EvaluationInput,
  EvaluationResult,
  JobId,
  JobPhase,
  TrackerRow,
} from "../contracts/jobs.js";
import type { BridgeError } from "../contracts/envelope.js";
import type {
  NewGradRow,
  EnrichedRow,
  NewGradScoreResult,
  NewGradEnrichResult,
  PipelineEntry,
} from "../contracts/newgrad.js";

const DEFAULT_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function nowIso(): string {
  return new Date().toISOString();
}

function deriveCompanyFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, "");
    const segments = host.split(".");
    if (segments.length >= 2) {
      return segments[segments.length - 2]!
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return host;
  } catch {
    return "Fake Co.";
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function todayDate(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface FakePipelineOptions {
  /**
   * Override per-phase delay. Set to 0 for tests.
   * Default: 400ms so the popup gets visible progress.
   */
  phaseDelayMs?: number;
  /** If true, the next runEvaluation call returns EVAL_FAILED. */
  forceFailure?: boolean;
}

export function createFakePipelineAdapter(
  config: PipelineConfig,
  options: FakePipelineOptions = {}
): PipelineAdapter {
  const delay = options.phaseDelayMs ?? DEFAULT_DELAY_MS;
  let nextReportNum = 900; // clearly fake numbers so they don't collide

  return {
    async doctor(): Promise<DoctorReport> {
      return {
        ok: true,
        repo: {
          rootPath: config.repoRoot,
          careerOpsVersion: "fake",
          trackerOk: true,
          cvOk: true,
          profileOk: true,
        },
        claudeCli: { ok: true, version: "fake-claude 0.0.0" },
        node: { version: process.version },
        playwrightChromium: { ok: true },
      };
    },

    async checkLiveness(url: string): Promise<LivenessCheck> {
      await sleep(delay);
      return {
        url,
        status: "active",
        reason: "fake adapter: always active",
        exitCode: 0,
      };
    },

    async runEvaluation(
      jobId: JobId,
      input: EvaluationInput,
      onProgress: PipelineProgressHandler
    ): Promise<EvaluationResult | BridgeError> {
      const phases: readonly JobPhase[] = [
        "extracting_jd",
        "evaluating",
        "writing_report",
        "generating_pdf",
        "writing_tracker",
      ];

      for (const phase of phases) {
        await sleep(delay);
        onProgress({
          phase,
          at: nowIso(),
          note: `fake: ${phase}`,
        });

        // Simulate a mid-run failure when requested.
        if (options.forceFailure && phase === "evaluating") {
          await sleep(delay);
          return {
            code: "EVAL_FAILED",
            message: "fake adapter: forced failure at phase=evaluating",
            detail: { jobId, input: input.url },
          };
        }
      }

      const reportNumber = nextReportNum++;
      const company = deriveCompanyFromUrl(input.url);
      const role = input.title?.trim() || "Software Engineer";
      const date = todayDate();
      const slug = slugify(company);
      const reportPath = `${config.repoRoot}/reports/FAKE-${reportNumber}-${slug}-${date}.md`;
      const pdfPath = `${config.repoRoot}/output/FAKE-cv-${slug}-${date}.pdf`;

      const score = 4.2;
      const trackerRow: TrackerRow = {
        num: reportNumber,
        date,
        company,
        role,
        status: "Evaluated",
        score: "4.2/5",
        pdf: "❌",
        report: `[${reportNumber}](reports/FAKE-${reportNumber}-${slug}-${date}.md)`,
        notes: "Fake evaluation — not written to disk",
      };

      const result: EvaluationResult = {
        reportNumber,
        reportPath,
        pdfPath,
        company,
        role,
        score,
        archetype: "fake-archetype",
        tldr: `Fake evaluation of ${company} — ${role}. No files written.`,
        trackerRow,
      };

      return result;
    },

    async readReport(num: number): Promise<ReportFile | undefined> {
      // Fake adapter does not read from disk.
      if (num < 900 || num >= nextReportNum) return undefined;
      return {
        num,
        path: `${config.repoRoot}/reports/FAKE-${num}.md`,
        markdown: `# Fake report ${num}\n\nGenerated by the fake pipeline adapter.`,
        meta: {
          company: "Fake Co.",
          role: "Software Engineer",
          date: todayDate(),
          score: 4.2,
          archetype: "fake-archetype",
        },
      };
    },

    async readTrackerTail(limit: number) {
      void limit;
      return { rows: [], totalRows: 0 };
    },

    async mergeTracker(dryRun: boolean): Promise<MergeReport> {
      return { added: 0, updated: 0, skipped: 0, dryRun };
    },

    async scoreNewGradRows(rows: NewGradRow[]): Promise<NewGradScoreResult> {
      return {
        promoted: rows.map((row) => ({
          row,
          score: 5,
          maxScore: 5,
          breakdown: {
            roleMatch: 1,
            skillHits: 2,
            skillKeywordsMatched: ["typescript", "react"],
            freshness: 2,
          },
        })),
        filtered: [],
      };
    },

    async enrichNewGradRows(
      rows: EnrichedRow[],
      onProgress?: (current: number, total: number, row: EnrichedRow) => void,
    ): Promise<NewGradEnrichResult> {
      const entries: PipelineEntry[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        entries.push({
          url: r.row.row.applyUrl,
          company: r.row.row.company,
          role: r.row.row.title,
          score: r.row.score,
          source: "newgrad-jobs.com",
        });
        onProgress?.(i + 1, rows.length, r);
        // Simulate processing delay in fake mode
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return {
        added: rows.length,
        skipped: 0,
        entries,
      };
    },
  };
}
