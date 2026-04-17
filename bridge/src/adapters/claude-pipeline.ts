/**
 * claude-pipeline.ts — real PipelineAdapter that shells out to a CLI agent.
 *
 * Supported real executors:
 *   • `claude -p`   (default, existing behavior)
 *   • `codex exec`  (CLI-wrapper integration for fast bring-up)
 *
 * Both paths reuse the same batch prompt contract and the same artifact
 * layout in reports/, output/, and batch/tracker-additions/.
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
  StructuredJobSignals,
  EvaluationResult,
  JobId,
  TrackerMergeSummary,
  TrackerRow,
  TrackerStatus,
} from "../contracts/jobs.js";
import type { BridgeError } from "../contracts/envelope.js";
import type {
  FilteredRow,
  NewGradRow,
  EnrichedRow,
  NewGradScoreResult,
  NewGradEnrichResult,
  PipelineEntry,
} from "../contracts/newgrad.js";

import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { bridgeError } from "../runtime/errors.js";
import { scoreAndFilter } from "./newgrad-scorer.js";
import { scoreEnrichedRowValue } from "./newgrad-value-scorer.js";
import { pickPipelineEntryUrl } from "./newgrad-links.js";
import { loadEvaluatedReportUrls } from "./evaluated-report-urls.js";
import {
  loadNegativeKeywords,
  loadNewGradScanConfig,
  loadPipelineUrls,
  persistBlockedCompanies,
  loadTrackedCompanyRoles,
} from "./newgrad-config.js";
import {
  appendNewGradScanHistory,
  isRecentNewGradRow,
  loadNewGradSeenKeys,
  newGradCompanyRoleKey,
  newGradRowUrl,
  wasNewGradRowSeen,
} from "./newgrad-scan-history.js";
import {
  backfillNewGradPendingCache as backfillPendingNewGradCache,
  readNewGradPendingEntries as readPendingNewGradEntries,
} from "./newgrad-pending.js";
import { canonicalizeJobUrl } from "../lib/canonical-job-url.js";
import { detectActiveSecurityClearanceRequirement } from "../lib/security-clearance.js";
import { JD_MIN_CHARS as JD_MIN_CHARS_VALUE } from "../contracts/jobs.js";
import { writeJdFile } from "../lib/write-jd-file.js";

const LOCK_WAIT_MS = 5_000;
const LOCK_POLL_MS = 100;
const REPORT_NUM_WIDTH = 3;
const MAX_ERROR_TAIL_CHARS = 400;
const COMMAND_HEARTBEAT_MS = 15_000;
const EVALUATION_PAGE_TEXT_MAX_CHARS = 6_000;
const QUICK_EVALUATION_PAGE_TEXT_MAX_CHARS = 2_500;
// Keep this aligned with the extension's "rich pending context" heuristic so
// hidden-tab hydration can actually avoid Codex web search on bulk replays.
const LOCAL_ONLY_JD_MIN_CHARS = 1_200;
const EXTRA_NO_SPONSORSHIP_PHRASES = [
  "not eligible for immigration sponsorship",
  "immigration sponsorship is not available",
  "visa sponsorship unavailable",
  "unable to provide visa sponsorship",
  "must be authorized to work without sponsorship",
  "work authorization without sponsorship",
];
const RESTRICTED_WORK_AUTHORIZATION_PHRASES = [
  "u.s. citizenship required",
  "us citizenship required",
  "must be a u.s. citizen",
  "must be a us citizen",
  "only us citizens",
  "u.s. persons only",
  "us persons only",
  "green card holders cannot be considered",
  "permanent work authorization required",
  "must be authorized to work in the united states without sponsorship",
];

interface ClaudeTerminalJson {
  status: "completed" | "failed";
  id: string;
  report_num: string | number;
  company?: string;
  role?: string;
  score?: number | null;
  tldr?: string;
  archetype?: string;
  legitimacy?: string | null;
  pdf?: string | null;
  report?: string | null;
  error?: string | null;
}

interface ParsedReportMarkdown {
  company: string;
  role: string;
  date: string;
  score: number;
  archetype: string;
  url?: string;
  pdf?: string;
  tldr: string;
}

interface QuickEvaluationJson {
  status: "completed" | "failed";
  id: string;
  company: string;
  role: string;
  score: number;
  tldr: string;
  legitimacy: string;
  decision: "deep_eval" | "skip";
  reasons: string[];
  blockers: string[];
  error: string | null;
}

interface QuickEvaluationCandidateProfile {
  compensationMinUsd: number;
  targetSkills: readonly string[];
  requiresVisaSponsorship: boolean;
  excludeActiveSecurityClearance: boolean;
  maxYearsExperience: number;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  completedByProbe?: boolean;
}

interface ExecutionPlan {
  command: string;
  args: string[];
  stdinText?: string;
  terminalFilePath?: string;
  cleanupPaths: string[];
}

interface TrackerMergeAttempt {
  merged: boolean;
  summary?: TrackerMergeSummary;
}

export const __internal = {
  buildJdText,
  buildCodexTerminalSchema,
  buildLocalQuickScreen,
  buildQuickEvaluationSchema,
  buildQuickEvaluationPrompt,
  buildQuickEvaluationArtifacts,
  shouldUseCodexSearch,
  extractTerminalJsonObject,
  parseReportMarkdown,
};

export function createClaudePipelineAdapter(
  config: PipelineConfig
): PipelineAdapter {
  const realExecutor = config.realExecutor ?? "claude";
  const selectedCliBin =
    realExecutor === "codex" ? config.codexBin ?? null : config.claudeBin;

  return {
    async doctor(): Promise<DoctorReport> {
      const cvOk = existsSync(join(config.repoRoot, "cv.md"));
      const profileOk = existsSync(join(config.repoRoot, "config/profile.yml"));
      const trackerOk = existsSync(
        join(config.repoRoot, "data/applications.md")
      );
      const versionPath = join(config.repoRoot, "VERSION");
      const careerOpsVersion = existsSync(versionPath)
        ? readFileSync(versionPath, "utf-8").trim()
        : "unknown";

      return {
        ok: cvOk && profileOk && trackerOk && Boolean(selectedCliBin),
        repo: {
          rootPath: config.repoRoot,
          careerOpsVersion,
          trackerOk,
          cvOk,
          profileOk,
        },
        claudeCli: {
          ok: Boolean(selectedCliBin),
          ...(selectedCliBin
            ? { version: `${realExecutor} CLI present` }
            : { error: `${realExecutor} CLI not found` }),
        },
        node: { version: process.version },
        playwrightChromium: { ok: true },
      };
    },

    async checkLiveness(url: string): Promise<LivenessCheck> {
      const scriptPath = join(config.repoRoot, "check-liveness.mjs");
      const result = await runCommand(
        config.nodeBin,
        [scriptPath, url],
        config.repoRoot,
        config.livenessTimeoutSec * 1000
      );

      const output = `${result.stdout}\n${result.stderr}`;
      const statusLine = output
        .split(/\r?\n/)
        .find((line) => line.includes(url))
        ?.trim();
      const reasonLine = output
        .split(/\r?\n/)
        .find((line) => /^\s{2,}\S/.test(line) || /^\s+\S/.test(line))
        ?.trim();

      if (result.timedOut) {
        return {
          url,
          status: "uncertain",
          reason: "liveness check timed out",
          exitCode: -1,
        };
      }

      if (statusLine?.includes("✅") || /\bactive\b/i.test(statusLine ?? "")) {
        return {
          url,
          status: "active",
          reason: reasonLine ?? "apply button detected",
          exitCode: result.exitCode ?? 0,
        };
      }

      if (statusLine?.includes("⚠️") || /\buncertain\b/i.test(statusLine ?? "")) {
        return {
          url,
          status: "uncertain",
          reason: reasonLine ?? "content present but no apply button found",
          exitCode: result.exitCode ?? 1,
        };
      }

      return {
        url,
        status: "expired",
        reason: reasonLine ?? "job appears inactive",
        exitCode: result.exitCode ?? 1,
      };
    },

    async runEvaluation(
      jobId: JobId,
      input: EvaluationInput,
      onProgress: PipelineProgressHandler
    ): Promise<EvaluationResult | BridgeError> {
      if (!selectedCliBin) {
        return bridgeError(
          "BRIDGE_NOT_READY",
          `${realExecutor} CLI not found on PATH`
        );
      }

      const reportDir = join(config.repoRoot, "reports");
      const batchDir = join(config.repoRoot, "batch");
      const logsDir = join(batchDir, "logs");
      const trackerDir = join(batchDir, "tracker-additions");
      mkdirSync(logsDir, { recursive: true });
      mkdirSync(trackerDir, { recursive: true });
      mkdirSync(reportDir, { recursive: true });

      if (shouldRunQuickEvaluation(input)) {
        const quickLogPath = join(logsDir, `quick-${jobId}.log`);
        const quickConfig = loadNewGradScanConfig(config.repoRoot);
        writeFileSync(quickLogPath, "", "utf-8");
        appendJobLog(quickLogPath, "bridge", `job=${jobId} executor=${realExecutor} quick-eval`);
        appendJobLog(quickLogPath, "bridge", `url=${input.url}`);

        const localQuickScreen = buildLocalQuickScreen({
          input,
          quickConfig,
          evaluatedReportUrls: loadEvaluatedReportUrls(config.repoRoot),
          jobId,
        });

        if (localQuickScreen) {
          appendJobLog(
            quickLogPath,
            "bridge",
            `local quick-screen skip blockers=${localQuickScreen.blockers.join(",") || "none"} score=${localQuickScreen.score.toFixed(2)}`,
          );
          onProgress({
            phase: "evaluating",
            at: nowIso(),
            note: "local structured precheck skip",
          });

          const reportNumber = reserveReportNumber(config.repoRoot, jobId);
          const today = todayDate();
          const artifacts = buildQuickEvaluationArtifacts({
            repoRoot: config.repoRoot,
            reportNumber,
            date: today,
            url: input.url,
            screen: localQuickScreen,
            signals: input.structuredSignals,
          });

          onProgress({
            phase: "writing_report",
            at: nowIso(),
            note: basename(artifacts.reportPath),
          });
          onProgress({
            phase: "generating_pdf",
            at: nowIso(),
            note: "local precheck skip; PDF not generated",
          });

          writeTrackerAddition(trackerDir, jobId, artifacts.trackerRow);
          onProgress({
            phase: "writing_tracker",
            at: nowIso(),
            note: artifacts.trackerRow.status,
          });

          return await syncTrackerAfterEvaluation(
            config,
            {
              reportNumber,
              reportPath: artifacts.reportPath,
              pdfPath: null,
              company: localQuickScreen.company,
              role: localQuickScreen.role,
              score: Number(localQuickScreen.score.toFixed(2)),
              archetype: "quick-screen",
              tldr: localQuickScreen.tldr,
              trackerRow: artifacts.trackerRow,
              trackerMerged: false,
            },
            quickLogPath,
          );
        }

        const quickEvaluation = await runQuickEvaluation({
          config,
          quickConfig,
          input,
          jobId,
          logsDir,
          logPath: quickLogPath,
          onProgress,
        });

        if ("code" in quickEvaluation) {
          appendJobLog(
            quickLogPath,
            "bridge",
            `quick-eval failed, falling back to full evaluation: ${quickEvaluation.message}`
          );
        } else if (quickEvaluation.decision !== "deep_eval") {
          const reportNumber = reserveReportNumber(config.repoRoot, jobId);
          const today = todayDate();
          const artifacts = buildQuickEvaluationArtifacts({
            repoRoot: config.repoRoot,
            reportNumber,
            date: today,
            url: input.url,
            screen: quickEvaluation,
            signals: input.structuredSignals,
          });

          onProgress({
            phase: "writing_report",
            at: nowIso(),
            note: basename(artifacts.reportPath),
          });
          onProgress({
            phase: "generating_pdf",
            at: nowIso(),
            note: "quick screen skips PDF generation",
          });

          writeTrackerAddition(trackerDir, jobId, artifacts.trackerRow);
          onProgress({
            phase: "writing_tracker",
            at: nowIso(),
            note: artifacts.trackerRow.status,
          });

          return await syncTrackerAfterEvaluation(
            config,
            {
              reportNumber,
              reportPath: artifacts.reportPath,
              pdfPath: null,
              company: quickEvaluation.company,
              role: quickEvaluation.role,
              score: Number(quickEvaluation.score.toFixed(2)),
              archetype: "quick-screen",
              tldr: quickEvaluation.tldr,
              trackerRow: artifacts.trackerRow,
              trackerMerged: false,
            },
            quickLogPath
          );
        } else {
          appendJobLog(
            quickLogPath,
            "bridge",
            `quick-eval passed score=${quickEvaluation.score.toFixed(2)} decision=deep_eval`
          );
          onProgress({
            phase: "evaluating",
            at: nowIso(),
            note: `quick-eval ${quickEvaluation.score.toFixed(1)}/5 passed; running deep eval`,
          });
        }
      }

      const reportNumber = reserveReportNumber(config.repoRoot, jobId);
      const reportNumberText = formatReportNumber(reportNumber);
      const today = todayDate();
      const jdPath = join(tmpdir(), `career-ops-bridge-jd-${jobId}.txt`);
      const promptPath = join(batchDir, `.bridge-prompt-${jobId}.md`);
      const logPath = join(logsDir, `${reportNumberText}-${jobId}.log`);
      let executionPlan: ExecutionPlan | null = null;

      try {
        onProgress({
          phase: "extracting_jd",
          at: nowIso(),
          note:
            (input.pageText?.trim().length ?? 0) >= JD_MIN_CHARS_VALUE
              ? "using captured page text"
              : "captured page text is short; Claude may fetch missing details",
        });

        writeFileSync(jdPath, buildJdText(input), "utf-8");
        writeFileSync(
          promptPath,
          buildResolvedPrompt(config.repoRoot, {
            url: input.url,
            jdPath,
            reportNumber: reportNumberText,
            date: today,
            id: jobId,
          }),
          "utf-8"
        );
        writeFileSync(logPath, "", "utf-8");
        appendJobLog(
          logPath,
          "bridge",
          `job=${jobId} executor=${realExecutor} report=${reportNumberText}`
        );
        appendJobLog(logPath, "bridge", `url=${input.url}`);
        appendJobLog(logPath, "bridge", `jdPath=${jdPath}`);
        appendJobLog(logPath, "bridge", `promptPath=${promptPath}`);

        onProgress({
          phase: "evaluating",
          at: nowIso(),
          note: `${realExecutor === "codex" ? "codex exec" : "claude -p"} report ${reportNumberText}`,
        });

        const task = [
          "Procesa esta oferta para el bridge MVP.",
          "Objetivo minimo: generar un report real en reports/ y terminar con JSON valido.",
          `URL: ${input.url}`,
          `JD file: ${jdPath}`,
          `Report number: ${reportNumberText}`,
          `Date: ${today}`,
          `Batch ID: ${jobId}`,
        ].join(" ");

        executionPlan = buildExecutionPlan(config, {
          jobId,
          promptPath,
          task,
          logsDir,
          reportNumberText,
          allowSearch: shouldUseCodexSearch(input),
        });
        appendJobLog(
          logPath,
          "bridge",
          `command=${executionPlan.command} args=${formatArgsForLog(executionPlan.args)}`
        );
        if (executionPlan.terminalFilePath) {
          appendJobLog(
            logPath,
            "bridge",
            `terminalFilePath=${executionPlan.terminalFilePath}`
          );
        }

        const command = await runCommand(
          executionPlan.command,
          executionPlan.args,
          config.repoRoot,
          config.evaluationTimeoutSec * 1000,
          executionPlan.stdinText,
          realExecutor === "codex"
            ? () => {
                const reportPath = resolveReportPath(
                  config.repoRoot,
                  reportNumber
                );
                if (!reportPath || !existsSync(reportPath)) {
                  return false;
                }
                try {
                  parseReportMarkdown(readFileSync(reportPath, "utf-8"));
                  return true;
                } catch {
                  return false;
                }
              }
            : undefined,
          (line) => {
            appendJobLog(logPath, "proc", line);
          }
        );
        appendJobLog(
          logPath,
          "bridge",
          `command finished exitCode=${command.exitCode ?? "null"} timedOut=${command.timedOut} completedByProbe=${Boolean(command.completedByProbe)} stdoutBytes=${Buffer.byteLength(command.stdout)} stderrBytes=${Buffer.byteLength(command.stderr)}`
        );
        if (command.stderr.trim()) {
          appendJobLog(
            logPath,
            "bridge",
            `stderr tail:\n${tailText(command.stderr, 4000)}`
          );
        }
        if (
          executionPlan.terminalFilePath &&
          existsSync(executionPlan.terminalFilePath)
        ) {
          appendJobLog(
            logPath,
            "bridge",
            `terminal json:\n${readFileSync(executionPlan.terminalFilePath, "utf-8")}`
          );
        } else if (executionPlan.terminalFilePath) {
          appendJobLog(
            logPath,
            "bridge",
            "terminal json file missing at command completion"
          );
        }

        if (command.timedOut) {
          appendJobLog(
            logPath,
            "bridge",
            "command timed out; attempting artifact recovery"
          );
          const recovered = finalizeEvaluationFromArtifacts({
            repoRoot: config.repoRoot,
            trackerDir,
            jobId,
            reportNumber,
            reportNumberText,
            terminal: null,
            onProgress,
            logPath,
          });
          if (recovered) {
            appendJobLog(
              logPath,
              "bridge",
              "artifact recovery succeeded after timeout"
            );
            return await syncTrackerAfterEvaluation(config, recovered, logPath);
          }
          appendJobLog(logPath, "bridge", "artifact recovery failed after timeout");
          return bridgeError("TIMEOUT", "evaluation timed out", {
            logPath,
            reportNumber,
          });
        }

        if (command.exitCode !== 0) {
          appendJobLog(
            logPath,
            "bridge",
            `command exited non-zero; attempting artifact recovery (exitCode=${command.exitCode ?? "null"})`
          );
          const recovered = finalizeEvaluationFromArtifacts({
            repoRoot: config.repoRoot,
            trackerDir,
            jobId,
            reportNumber,
            reportNumberText,
            terminal: null,
            onProgress,
            logPath,
          });
          if (recovered) {
            appendJobLog(
              logPath,
              "bridge",
              "artifact recovery succeeded after non-zero exit"
            );
            return await syncTrackerAfterEvaluation(config, recovered, logPath);
          }
          appendJobLog(
            logPath,
            "bridge",
            "artifact recovery failed after non-zero exit"
          );
          return bridgeError(
            "EVAL_FAILED",
            extractErrorMessage(command.stderr || command.stdout),
            {
              exitCode: command.exitCode ?? -1,
              logPath,
              reportNumber,
            }
          );
        }

        let terminal: ClaudeTerminalJson | null = null;
        try {
          terminal =
            realExecutor === "codex" && executionPlan.terminalFilePath
              ? readCodexTerminalJson(executionPlan.terminalFilePath)
              : extractTerminalJsonObject(command.stdout);
        } catch {
          appendJobLog(
            logPath,
            "bridge",
            "terminal JSON parse failed; continuing with artifact recovery"
          );
          terminal = null;
        }

        if (terminal && terminal.status !== "completed") {
          appendJobLog(
            logPath,
            "bridge",
            `terminal JSON reported failure status=${terminal.status} error=${terminal.error ?? ""}`
          );
          return bridgeError(
            "EVAL_FAILED",
            terminal.error ?? "cli run did not complete successfully",
            { logPath, reportNumber }
          );
        }

        const finalized = finalizeEvaluationFromArtifacts({
          repoRoot: config.repoRoot,
          trackerDir,
          jobId,
          reportNumber,
          reportNumberText,
          terminal,
          onProgress,
          logPath,
        });
        if (finalized) {
          appendJobLog(
            logPath,
            "bridge",
            `evaluation finalized reportPath=${finalized.reportPath} pdfPath=${finalized.pdfPath ?? "null"}`
          );
          return await syncTrackerAfterEvaluation(config, finalized, logPath);
        }

        appendJobLog(
          logPath,
          "bridge",
          `final artifact recovery failed; expected report ${reportNumberText}`
        );
        return bridgeError(
          "EVAL_FAILED",
          `report ${reportNumberText} was not written`,
          { logPath, reportNumber }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendJobLog(logPath, "bridge", `internal error: ${message}`);
        return bridgeError("INTERNAL", message, {
          reportNumber,
          logPath,
        });
      } finally {
        safeRemoveFile(promptPath);
        safeRemoveFile(jdPath);
        for (const path of executionPlan?.cleanupPaths ?? []) {
          safeRemoveFile(path);
        }
      }
    },

    async readReport(num: number): Promise<ReportFile | undefined> {
      const reportPath = resolveReportPath(config.repoRoot, num);
      if (!reportPath || !existsSync(reportPath)) return undefined;
      const markdown = readFileSync(reportPath, "utf-8");
      const meta = parseReportMarkdown(markdown);
      return {
        num,
        path: reportPath,
        markdown,
        meta: {
          company: meta.company,
          role: meta.role,
          date: meta.date,
          score: meta.score,
          archetype: meta.archetype,
          ...(meta.url ? { url: meta.url } : {}),
        },
      };
    },

    async readTrackerTail(
      limit: number
    ): Promise<{ rows: readonly TrackerRow[]; totalRows: number }> {
      const trackerPath = join(config.repoRoot, "data/applications.md");
      if (!existsSync(trackerPath)) {
        return { rows: [], totalRows: 0 };
      }

      const rows = parseTrackerRows(readFileSync(trackerPath, "utf-8"));
      const safeLimit = Math.max(0, limit);
      return {
        rows: rows.slice(Math.max(0, rows.length - safeLimit)),
        totalRows: rows.length,
      };
    },

    async mergeTracker(dryRun: boolean): Promise<MergeReport> {
      const args = [join(config.repoRoot, "merge-tracker.mjs")];
      if (dryRun) args.push("--dry-run");
      const result = await runCommand(
        config.nodeBin,
        args,
        config.repoRoot,
        config.evaluationTimeoutSec * 1000
      );

      if (result.timedOut) {
        throw bridgeError("TIMEOUT", "tracker merge timed out");
      }
      if (result.exitCode !== 0) {
        throw bridgeError(
          "TRACKER_MERGE_FAILED",
          extractErrorMessage(result.stderr || result.stdout)
        );
      }

      return {
        ...parseMergeSummary(result.stdout),
        dryRun,
      };
    },

    async scoreNewGradRows(rows: NewGradRow[]): Promise<NewGradScoreResult> {
      const scanConfig = loadNewGradScanConfig(config.repoRoot);
      const negativeKeywords = loadNegativeKeywords(config.repoRoot);
      const trackedSet = loadTrackedCompanyRoles(config.repoRoot);
      const seenKeys = loadNewGradSeenKeys(config.repoRoot);
      const recentUnseenRows: NewGradRow[] = [];
      const preFiltered: FilteredRow[] = [];

      for (const row of rows) {
        if (!isRecentNewGradRow(row)) {
          preFiltered.push({
            row,
            reason: "older_than_24h",
            detail: `Posted ${row.postedAgo || "outside the last 24h"}`,
          });
          continue;
        }

        const trackedKey = newGradCompanyRoleKey(row);
        if (trackedKey && trackedSet.has(trackedKey)) {
          preFiltered.push({
            row,
            reason: "already_tracked",
            detail: `Already tracked: ${row.company} | ${row.title}`,
          });
          continue;
        }

        if (wasNewGradRowSeen(row, seenKeys)) {
          preFiltered.push({
            row,
            reason: "already_scanned",
            detail: "Already seen in scan history or pipeline",
          });
          continue;
        }

        recentUnseenRows.push(row);
      }

      const { promoted, filtered } = scoreAndFilter(
        recentUnseenRows,
        scanConfig,
        negativeKeywords,
        trackedSet,
      );
      const statusByKey = new Map<string, string>();
      for (const row of recentUnseenRows) {
        statusByKey.set(newGradRowUrl(row) || newGradCompanyRoleKey(row), "scanned");
      }
      for (const row of promoted.map((p) => p.row)) {
        statusByKey.set(newGradRowUrl(row) || newGradCompanyRoleKey(row), "promoted");
      }
      for (const item of filtered) {
        statusByKey.set(
          newGradRowUrl(item.row) || newGradCompanyRoleKey(item.row),
          item.reason,
        );
      }
      appendNewGradScanHistory(
        config.repoRoot,
        recentUnseenRows,
        (row) => statusByKey.get(newGradRowUrl(row) || newGradCompanyRoleKey(row)) ?? "scanned",
      );
      persistBlockedCompanies(config.repoRoot, filtered);
      return { promoted, filtered: [...preFiltered, ...filtered] };
    },

    async enrichNewGradRows(
      rows: EnrichedRow[],
      onProgress?: (current: number, total: number, row: EnrichedRow) => void,
    ): Promise<NewGradEnrichResult> {
      const scanConfig = loadNewGradScanConfig(config.repoRoot);
      const negativeKeywords = loadNegativeKeywords(config.repoRoot);
      const trackedSet = loadTrackedCompanyRoles(config.repoRoot);
      const existingPipelineUrls = loadPipelineUrls(config.repoRoot);
      const evaluatedReportUrls = loadEvaluatedReportUrls(config.repoRoot);

      const entries: PipelineEntry[] = [];
      const candidates: PipelineEntry[] = [];
      let skipped = 0;
      let processed = 0;
      const jdFileMap = new Map<string, string>();

      for (const enrichedRow of rows) {
        processed++;

        // Re-score using the detail description as qualifications text
        const augmentedRow: NewGradRow = {
          ...enrichedRow.row.row,
          qualifications: [
            enrichedRow.row.row.qualifications ?? "",
            enrichedRow.detail.description,
            enrichedRow.detail.requiredQualifications.join(" "),
          ].join(" "),
          sponsorshipSupport:
            enrichedRow.detail.sponsorshipSupport !== "unknown"
              ? enrichedRow.detail.sponsorshipSupport
              : enrichedRow.row.row.sponsorshipSupport,
          confirmedSponsorshipSupport:
            enrichedRow.detail.confirmedSponsorshipSupport !== "unknown"
              ? enrichedRow.detail.confirmedSponsorshipSupport
              : enrichedRow.row.row.confirmedSponsorshipSupport,
          requiresActiveSecurityClearance:
            enrichedRow.detail.requiresActiveSecurityClearance ||
            enrichedRow.row.row.requiresActiveSecurityClearance,
          confirmedRequiresActiveSecurityClearance:
            enrichedRow.detail.confirmedRequiresActiveSecurityClearance ||
            enrichedRow.row.row.confirmedRequiresActiveSecurityClearance,
        };

        const { promoted, filtered } = scoreAndFilter(
          [augmentedRow],
          scanConfig,
          negativeKeywords,
          trackedSet,
        );
        persistBlockedCompanies(config.repoRoot, filtered);

        if (promoted.length === 0) {
          skipped++;
          onProgress?.(processed, rows.length, enrichedRow);
          continue;
        }

        const scored = promoted[0]!;
        if (scored.score < scanConfig.pipeline_threshold) {
          skipped++;
          onProgress?.(processed, rows.length, enrichedRow);
          continue;
        }

        const valueScore = scoreEnrichedRowValue(enrichedRow, scanConfig);
        if (!valueScore.passed) {
          skipped++;
          onProgress?.(processed, rows.length, enrichedRow);
          continue;
        }

        const entryUrl = pickPipelineEntryUrl(
          enrichedRow.detail,
          enrichedRow.row.row,
        );
        const entry: PipelineEntry = {
          url: entryUrl,
          company: enrichedRow.row.row.company,
          role: enrichedRow.row.row.title,
          score: scored.score,
          valueScore: valueScore.score,
          valueReasons: [...valueScore.reasons, ...valueScore.penalties],
          source: "newgrad-jobs.com",
        };
        const canonicalEntryUrl = canonicalizeJobUrl(entryUrl) ?? entryUrl;

        if (evaluatedReportUrls.has(canonicalEntryUrl)) {
          skipped++;
          onProgress?.(processed, rows.length, enrichedRow);
          continue;
        }

        if (existingPipelineUrls.has(canonicalEntryUrl)) {
          skipped++;
          onProgress?.(processed, rows.length, enrichedRow);
          continue;
        }

        candidates.push(entry);

        // Write pre-extracted JD to jds/ for batch consumption
        const jdsDir = join(config.repoRoot, "jds");
        mkdirSync(jdsDir, { recursive: true });

        const h1bValue =
          enrichedRow.detail.confirmedSponsorshipSupport !== "unknown"
            ? enrichedRow.detail.confirmedSponsorshipSupport
            : "unknown";

        const jdFile = writeJdFile({
          jdsDir,
          company: enrichedRow.detail.company || enrichedRow.row.row.company,
          role: enrichedRow.detail.title || enrichedRow.row.row.title,
          url: entryUrl,
          description: enrichedRow.detail.description,
          ...(enrichedRow.detail.location ? { location: enrichedRow.detail.location } : {}),
          ...(enrichedRow.detail.salaryRange ? { salary: enrichedRow.detail.salaryRange } : {}),
          h1b: h1bValue,
          ...(enrichedRow.detail.confirmedRequiresActiveSecurityClearance
            ? { clearance: "active-secret-required" }
            : {}),
          ...(enrichedRow.detail.applyNowUrl ? { applyUrl: enrichedRow.detail.applyNowUrl } : {}),
          ...(enrichedRow.detail.companyDescription
            ? { companyDescription: enrichedRow.detail.companyDescription }
            : {}),
          ...(enrichedRow.detail.requiredQualifications.length > 0
            ? { requiredQualifications: enrichedRow.detail.requiredQualifications }
            : {}),
          ...(enrichedRow.detail.responsibilities.length > 0
            ? { responsibilities: enrichedRow.detail.responsibilities }
            : {}),
          ...(enrichedRow.detail.skillTags.length > 0
            ? { skillTags: enrichedRow.detail.skillTags }
            : {}),
          ...(enrichedRow.detail.recommendationTags.length > 0
            ? { recommendationTags: enrichedRow.detail.recommendationTags }
            : {}),
          ...(enrichedRow.detail.taxonomy.length > 0
            ? { taxonomy: enrichedRow.detail.taxonomy }
            : {}),
        });

        if (jdFile) {
          jdFileMap.set(entryUrl, jdFile);
        }

        entries.push(entry);
        existingPipelineUrls.add(canonicalEntryUrl);
        onProgress?.(processed, rows.length, enrichedRow);
      }

      // Append survivors to data/pipeline.md
      if (entries.length > 0) {
        const pipelinePath = join(config.repoRoot, "data/pipeline.md");
        const maxScore =
          scanConfig.role_keywords.weight +
          scanConfig.skill_keywords.max_score +
          scanConfig.freshness.within_24h;
        const lines = entries.map((e) => {
          const tag = jdFileMap.get(e.url);
          const value = e.valueScore !== undefined ? `, value: ${e.valueScore}/10` : "";
          const base = `- [ ] ${e.url} — ${e.company} | ${e.role} (via newgrad-scan, score: ${e.score}/${maxScore}${value})`;
          return tag ? `${base} [local:jds/${tag}]` : base;
        });

        // Ensure file exists with a header
        if (!existsSync(pipelinePath)) {
          writeFileSync(pipelinePath, "# Pipeline Inbox\n\n", "utf-8");
        }
        appendFileSync(pipelinePath, "\n" + lines.join("\n") + "\n", "utf-8");
      }

      return { added: entries.length, skipped, entries, candidates };
    },

    async readNewGradPendingEntries(limit: number) {
      return readPendingNewGradEntries(config.repoRoot, limit);
    },

    async backfillNewGradPendingCache(entries) {
      return backfillPendingNewGradCache(config.repoRoot, entries);
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Newgrad-scan helpers                                                       */
/* -------------------------------------------------------------------------- */


function nowIso(): string {
  return new Date().toISOString();
}

function todayDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatReportNumber(n: number): string {
  return String(n).padStart(REPORT_NUM_WIDTH, "0");
}

function shouldRunQuickEvaluation(input: EvaluationInput): boolean {
  return input.evaluationMode === "newgrad_quick" && Boolean(input.structuredSignals);
}

function buildLocalQuickScreen(args: {
  input: EvaluationInput;
  quickConfig: ReturnType<typeof loadNewGradScanConfig>;
  evaluatedReportUrls: ReadonlySet<string>;
  jobId: string;
}): QuickEvaluationJson | null {
  const signals = args.input.structuredSignals;
  if (!signals) return null;

  const blockers: string[] = [];
  const reasons = collectLocalQuickReasons(args.input, args.quickConfig);
  const normalizedText = buildLocalQuickScreenText(args.input);
  const candidateProfile = buildQuickCandidateProfile(args.quickConfig);
  const canonicalUrl = canonicalizeJobUrl(args.input.url) ?? args.input.url.trim();
  const salaryRange = parseQuickSalaryRangeUsd(signals.salaryRange);
  const localValueScore = signals.localValueScore;

  if (canonicalUrl && args.evaluatedReportUrls.has(canonicalUrl)) {
    blockers.push("already_evaluated_report_url");
  }

  if (
    candidateProfile.requiresVisaSponsorship &&
    (
      signals.sponsorshipSupport === "no" ||
      containsAnyPhrase(
        normalizedText,
        args.quickConfig.hard_filters.no_sponsorship_keywords,
        EXTRA_NO_SPONSORSHIP_PHRASES,
      )
    )
  ) {
    blockers.push("no_sponsorship_support");
  }

  if (
    candidateProfile.requiresVisaSponsorship &&
    containsAnyPhrase(normalizedText, RESTRICTED_WORK_AUTHORIZATION_PHRASES)
  ) {
    blockers.push("restricted_work_authorization_requirement");
  }

  if (
    candidateProfile.excludeActiveSecurityClearance &&
    (
      signals.requiresActiveSecurityClearance ||
      detectActiveSecurityClearanceRequirement(
        normalizedText,
        args.quickConfig.hard_filters.clearance_keywords,
      )
    )
  ) {
    blockers.push("active_security_clearance_required");
  }

  if (
    typeof signals.yearsExperienceRequired === "number" &&
    signals.yearsExperienceRequired > candidateProfile.maxYearsExperience
  ) {
    blockers.push("experience_requirement_above_limit");
  }

  if (
    candidateProfile.compensationMinUsd > 0 &&
    salaryRange &&
    salaryRange.high < candidateProfile.compensationMinUsd
  ) {
    blockers.push("salary_below_minimum");
  }

  if (
    typeof localValueScore === "number" &&
    localValueScore < args.quickConfig.detail_value_threshold
  ) {
    blockers.push("local_value_score_below_threshold");
  }

  if (
    localValueScore === undefined &&
    looksClearlySenior(signals, args.input)
  ) {
    blockers.push("seniority_too_high");
  }

  if (blockers.length === 0) {
    return null;
  }

  const company = nonEmptyString(signals.company) || "Unknown Company";
  const role =
    nonEmptyString(signals.role) ||
    nonEmptyString(args.input.title) ||
    "Untitled role";

  return {
    status: "completed",
    id: args.jobId,
    company,
    role,
    score: scoreLocalQuickSkip(signals, blockers),
    tldr: buildLocalQuickTldr(blockers, reasons),
    legitimacy: classifyLocalQuickLegitimacy(blockers),
    decision: "skip",
    reasons,
    blockers,
    error: null,
  };
}

function buildQuickCandidateProfile(config: ReturnType<typeof loadNewGradScanConfig>): QuickEvaluationCandidateProfile {
  return {
    compensationMinUsd: config.compensation_min_usd,
    targetSkills: config.skill_keywords.terms.slice(0, 16),
    requiresVisaSponsorship: config.hard_filters.exclude_no_sponsorship,
    excludeActiveSecurityClearance: config.hard_filters.exclude_active_security_clearance,
    maxYearsExperience: config.hard_filters.max_years_experience,
  };
}

function collectLocalQuickReasons(
  input: EvaluationInput,
  quickConfig: ReturnType<typeof loadNewGradScanConfig>,
): string[] {
  const signals = input.structuredSignals;
  if (!signals) return ["structured_precheck_skip"];

  const reasons = new Set<string>();
  for (const reason of signals.localValueReasons ?? []) {
    const normalized = normalizeMachineReason(reason);
    if (normalized) reasons.add(normalized);
  }

  if (typeof signals.localValueScore === "number") {
    if (signals.localValueScore >= quickConfig.detail_value_threshold) {
      reasons.add("local_value_score_meets_threshold");
    } else {
      reasons.add("local_value_score_present");
    }
  }

  if (
    typeof signals.yearsExperienceRequired === "number" &&
    signals.yearsExperienceRequired <= quickConfig.hard_filters.max_years_experience
  ) {
    reasons.add("experience_requirement_within_limit");
  }

  const salaryRange = parseQuickSalaryRangeUsd(signals.salaryRange);
  if (
    salaryRange &&
    quickConfig.compensation_min_usd > 0 &&
    salaryRange.high >= quickConfig.compensation_min_usd
  ) {
    reasons.add("salary_meets_minimum");
  }

  if (signals.sponsorshipSupport === "yes") {
    reasons.add("sponsorship_supported");
  }

  for (const skill of (signals.skillTags ?? []).slice(0, 3)) {
    const token = slugify(skill);
    if (token) {
      reasons.add(`skill_match_${token}`);
    }
  }

  return [...reasons].slice(0, 6);
}

function buildLocalQuickScreenText(input: EvaluationInput): string {
  const signals = input.structuredSignals;
  return normalizeQuickScreenText(
    [
      input.title ?? "",
      signals?.role ?? "",
      signals?.employmentType ?? "",
      signals?.seniority ?? "",
      signals?.salaryRange ?? "",
      signals?.requiredQualifications?.join(" ") ?? "",
      signals?.responsibilities?.join(" ") ?? "",
      signals?.recommendationTags?.join(" ") ?? "",
      signals?.taxonomy?.join(" ") ?? "",
      input.pageText ?? "",
    ].join("\n"),
  );
}

function normalizeQuickScreenText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsAnyPhrase(text: string, ...phraseGroups: Array<readonly string[]>): boolean {
  for (const group of phraseGroups) {
    for (const phrase of group) {
      const normalized = normalizeQuickScreenText(phrase);
      if (normalized && text.includes(normalized)) {
        return true;
      }
    }
  }
  return false;
}

function looksClearlySenior(
  signals: StructuredJobSignals,
  input: EvaluationInput,
): boolean {
  const titleAndRole = normalizeQuickScreenText([
    input.title ?? "",
    signals.role ?? "",
  ].join(" "));
  if (
    /\b(new grad|new graduate|entry level|entry-level|associate|junior|engineer i|engineer 1)\b/.test(
      titleAndRole,
    )
  ) {
    return false;
  }

  if (/\b(senior|staff|principal|lead|manager|director|architect)\b/.test(titleAndRole)) {
    return true;
  }

  return /\b(senior|staff|principal|lead|manager|director|architect)\b/.test(
    normalizeQuickScreenText(signals.seniority ?? ""),
  );
}

function parseQuickSalaryRangeUsd(
  raw: string | null | undefined,
): { low: number; high: number } | null {
  if (!raw) return null;
  const values = [...raw.matchAll(/\$?\s*(\d{2,3}(?:,\d{3})?(?:\.\d+)?)/g)]
    .map((match) => Number.parseFloat((match[1] ?? "").replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;

  const scaled = values.map((value) => (value < 1000 ? value * 1000 : value));
  return {
    low: Math.min(...scaled),
    high: Math.max(...scaled),
  };
}

function scoreLocalQuickSkip(
  signals: StructuredJobSignals,
  blockers: readonly string[],
): number {
  let score = typeof signals.localValueScore === "number"
    ? signals.localValueScore / 2
    : 2.4;

  for (const blocker of blockers) {
    switch (blocker) {
      case "already_evaluated_report_url":
      case "no_sponsorship_support":
      case "restricted_work_authorization_requirement":
      case "active_security_clearance_required":
        score -= 2.2;
        break;
      case "salary_below_minimum":
      case "experience_requirement_above_limit":
      case "seniority_too_high":
        score -= 1.5;
        break;
      case "local_value_score_below_threshold":
        score -= 1.0;
        break;
      default:
        score -= 0.8;
        break;
    }
  }

  return roundToOneDecimal(clampNumber(score, 0.2, 4.8));
}

function classifyLocalQuickLegitimacy(blockers: readonly string[]): string {
  if (
    blockers.some((blocker) => [
      "already_evaluated_report_url",
      "no_sponsorship_support",
      "restricted_work_authorization_requirement",
      "active_security_clearance_required",
    ].includes(blocker))
  ) {
    return "High Confidence";
  }
  return "Proceed with Caution";
}

function buildLocalQuickTldr(
  blockers: readonly string[],
  reasons: readonly string[],
): string {
  const blockerSummary = blockers.slice(0, 2).map(describeQuickToken).join(" and ");
  const reasonSummary = reasons.slice(0, 2).map(describeQuickToken).join(" and ");
  if (reasonSummary) {
    return `Skip locally because ${blockerSummary}, despite ${reasonSummary}.`;
  }
  return `Skip locally because ${blockerSummary}.`;
}

function describeQuickToken(token: string): string {
  switch (token) {
    case "already_evaluated_report_url":
      return "this canonical URL was already evaluated";
    case "no_sponsorship_support":
      return "the role does not support sponsorship";
    case "restricted_work_authorization_requirement":
      return "the JD requires restricted US work authorization";
    case "active_security_clearance_required":
      return "the JD requires active security clearance";
    case "experience_requirement_above_limit":
      return "the stated experience requirement exceeds the candidate limit";
    case "salary_below_minimum":
      return "the salary band is below the candidate minimum";
    case "local_value_score_below_threshold":
      return "the local value score is below the configured threshold";
    case "seniority_too_high":
      return "the role is clearly senior-level";
    default:
      return token.replace(/_/g, " ");
  }
}

function normalizeMachineReason(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildJdText(input: EvaluationInput): string {
  const pageText = input.pageText?.trim() ?? "";
  const header = [
    `URL: ${input.url}`,
    `Title: ${input.title?.trim() || "(untitled job page)"}`,
    "",
  ].join("\n");

  if (pageText.length >= JD_MIN_CHARS_VALUE) {
    return `${header}${compactEvaluationPageText(pageText)}\n`;
  }

  const fallback = [
    "Captured page text is short.",
    "Use this text if helpful, and fetch the URL only if you need missing details.",
    "",
    pageText || "(no captured page text available)",
    "",
  ].join("\n");

  return `${header}${fallback}`;
}

function compactEvaluationPageText(pageText: string): string {
  const normalized = pageText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length <= EVALUATION_PAGE_TEXT_MAX_CHARS) {
    return normalized;
  }

  const clipped = normalized.slice(0, EVALUATION_PAGE_TEXT_MAX_CHARS).trimEnd();
  return [
    clipped,
    "",
    `[bridge truncated ${normalized.length - clipped.length} trailing chars from local JD cache]`,
  ].join("\n");
}

function buildQuickEvaluationArtifacts(args: {
  repoRoot: string;
  reportNumber: number;
  date: string;
  url: string;
  screen: QuickEvaluationJson;
  signals: StructuredJobSignals | undefined;
}): {
  reportMarkdown: string;
  reportPath: string;
  trackerRow: TrackerRow;
} {
  const slug = slugify(args.screen.company || args.screen.role || "quick-screen");
  const reportMarkdown = buildQuickScreenReportMarkdown({
    date: args.date,
    url: args.url,
    screen: args.screen,
    signals: args.signals,
  });
  const reportPath = writeReport(
    args.repoRoot,
    args.reportNumber,
    slug,
    args.date,
    reportMarkdown,
  );
  const trackerRow = buildTrackerRow({
    num: nextTrackerEntryNumber(args.repoRoot),
    date: args.date,
    company: args.screen.company,
    role: args.screen.role,
    score: args.screen.score,
    reportPath,
    pdfPath: null,
    tldr: args.screen.tldr,
    status: args.screen.decision === "skip" ? "SKIP" : "Evaluated",
  });

  return {
    reportMarkdown,
    reportPath,
    trackerRow,
  };
}

function buildQuickScreenReportMarkdown(args: {
  date: string;
  url: string;
  screen: QuickEvaluationJson;
  signals: StructuredJobSignals | undefined;
}): string {
  const signalLines = [
    args.signals?.location ? `- Location: ${args.signals.location}` : null,
    args.signals?.workModel ? `- Work model: ${args.signals.workModel}` : null,
    args.signals?.employmentType ? `- Employment type: ${args.signals.employmentType}` : null,
    args.signals?.seniority ? `- Seniority: ${args.signals.seniority}` : null,
    args.signals?.salaryRange ? `- Salary: ${args.signals.salaryRange}` : null,
    args.signals?.sponsorshipSupport ? `- Sponsorship: ${args.signals.sponsorshipSupport}` : null,
    args.signals?.requiresActiveSecurityClearance
      ? "- Active security clearance requirement detected"
      : null,
    args.signals?.yearsExperienceRequired !== undefined &&
    args.signals?.yearsExperienceRequired !== null
      ? `- Years of experience required: ${args.signals.yearsExperienceRequired}+`
      : null,
    args.signals?.localValueScore !== undefined
      ? `- Local value score: ${Number(args.signals.localValueScore.toFixed(1))}/10`
      : null,
  ].filter((line): line is string => Boolean(line));

  const skillLines = (args.signals?.skillTags ?? []).slice(0, 12).map((skill) => `- ${skill}`);
  const reasonLines = args.screen.reasons.map((reason) => `- ${reason}`);
  const blockerLines =
    args.screen.blockers.length > 0
      ? args.screen.blockers.map((blocker) => `- ${blocker}`)
      : ["- none"];

  return [
    `# Evaluación: ${args.screen.company} — ${args.screen.role}`,
    "",
    `**Fecha:** ${args.date}`,
    "**Arquetipo:** quick-screen",
    `**Score:** ${Number(args.screen.score.toFixed(1))}/5`,
    `**Legitimacy:** ${args.screen.legitimacy}`,
    `**URL:** ${args.url}`,
    "**PDF:** not generated",
    `**Decision:** ${args.screen.decision}`,
    "",
    "---",
    "",
    "## A) Quick Screen Summary",
    args.screen.tldr,
    "",
    "## B) Structured Value Signals",
    ...(signalLines.length > 0 ? signalLines : ["- no structured signals available"]),
    "",
    "## C) Why This Did Or Did Not Merit Deep Eval",
    ...reasonLines,
    "",
    "### Blockers",
    ...blockerLines,
    "",
    "## D) Key Skills",
    ...(skillLines.length > 0 ? skillLines : ["- no skill tags extracted"]),
    "",
    "## G) Posting Legitimacy",
    `Quick-screen assessment: ${args.screen.legitimacy}.`,
  ].join("\n");
}

async function runQuickEvaluation(args: {
  config: PipelineConfig;
  quickConfig: ReturnType<typeof loadNewGradScanConfig>;
  input: EvaluationInput;
  jobId: string;
  logsDir: string;
  logPath: string;
  onProgress: PipelineProgressHandler;
}): Promise<QuickEvaluationJson | BridgeError> {
  const prompt = buildQuickEvaluationPrompt({
    input: args.input,
    candidateProfile: buildQuickCandidateProfile(args.quickConfig),
  });
  const executionPlan = buildQuickExecutionPlan(args.config, {
    jobId: args.jobId,
    logsDir: args.logsDir,
    prompt,
  });

  appendJobLog(
    args.logPath,
    "bridge",
    `quick-command=${executionPlan.command} args=${formatArgsForLog(executionPlan.args)}`
  );
  if (executionPlan.terminalFilePath) {
    appendJobLog(
      args.logPath,
      "bridge",
      `quickTerminalFilePath=${executionPlan.terminalFilePath}`
    );
  }

  args.onProgress({
    phase: "evaluating",
    at: nowIso(),
    note: `${args.config.realExecutor === "codex" ? "codex exec" : "claude -p"} quick-eval`,
  });

  const command = await runCommand(
    executionPlan.command,
    executionPlan.args,
    args.config.repoRoot,
    Math.min(args.config.evaluationTimeoutSec * 1000, 120_000),
    executionPlan.stdinText,
    undefined,
    (line) => {
      appendJobLog(args.logPath, "quick", line);
    }
  );
  appendJobLog(
    args.logPath,
    "bridge",
    `quick command finished exitCode=${command.exitCode ?? "null"} timedOut=${command.timedOut} stdoutBytes=${Buffer.byteLength(command.stdout)} stderrBytes=${Buffer.byteLength(command.stderr)}`
  );

  try {
    if (command.timedOut) {
      return bridgeError("TIMEOUT", "quick evaluation timed out", { logPath: args.logPath });
    }
    if (command.exitCode !== 0) {
      return bridgeError(
        "EVAL_FAILED",
        extractErrorMessage(command.stderr || command.stdout),
        { logPath: args.logPath, exitCode: command.exitCode ?? -1 }
      );
    }

    const terminal =
      args.config.realExecutor === "codex" && executionPlan.terminalFilePath
        ? readQuickEvaluationJson(executionPlan.terminalFilePath)
        : extractQuickTerminalJsonObject(command.stdout);

    if (terminal.status !== "completed") {
      return bridgeError(
        "EVAL_FAILED",
        terminal.error ?? "quick evaluation did not complete successfully",
        { logPath: args.logPath }
      );
    }
    return terminal;
  } finally {
    for (const path of executionPlan.cleanupPaths) {
      safeRemoveFile(path);
    }
  }
}

function shouldUseCodexSearch(input: EvaluationInput): boolean {
  const pageTextLength = input.pageText?.trim().length ?? 0;
  return pageTextLength < LOCAL_ONLY_JD_MIN_CHARS;
}

function buildResolvedPrompt(
  repoRoot: string,
  args: {
    url: string;
    jdPath: string;
    reportNumber: string;
    date: string;
    id: string;
  }
): string {
  const templatePath = join(repoRoot, "batch/batch-prompt.md");
  const template = readFileSync(templatePath, "utf-8");
  const resolved = template
    .replaceAll("{{URL}}", args.url)
    .replaceAll("{{JD_FILE}}", args.jdPath)
    .replaceAll("{{REPORT_NUM}}", args.reportNumber)
    .replaceAll("{{DATE}}", args.date)
    .replaceAll("{{ID}}", args.id);

  const overrides = `

## Bridge MVP Overrides

- Este run es para el adapter real del bridge.
- Exito minimo real:
  1. Guardar el report markdown en \`reports/${args.reportNumber}-{company-slug}-${args.date}.md\`
  2. Terminar imprimiendo un JSON final valido
- El JD en \`${args.jdPath}\` es la fuente primaria. Si es corto, puedes leer la URL para completar huecos.
- PDF_CONFIRMED: no
- No generes PDF en este run salvo que el prompt diga explicitamente lo contrario. Para este bridge run, el comportamiento por defecto es \`report + tracker\` sin PDF.
- Deja \`pdf: null\` si no hubo confirmacion explicita para generar PDF.
- No edites \`data/applications.md\` directamente.
- En el JSON final incluye tambien:
  - \`tldr\`: una frase real y concreta
  - \`archetype\`: el arquetipo detectado
- El JSON final debe ser el ultimo bloque impreso por stdout.
`;

  return `${resolved}\n${overrides}`;
}

function buildExecutionPlan(
  config: PipelineConfig,
  args: {
    jobId: string;
    promptPath: string;
    task: string;
    logsDir: string;
    reportNumberText: string;
    allowSearch: boolean;
  }
): ExecutionPlan {
  const realExecutor = config.realExecutor ?? "claude";

  if (realExecutor === "codex") {
    if (!config.codexBin) {
      throw new Error("codex CLI is not configured");
    }

    const outputSchemaPath = join(
      args.logsDir,
      `${args.reportNumberText}-${args.jobId}-codex-schema.json`
    );
    const outputMessagePath = join(
      args.logsDir,
      `${args.reportNumberText}-${args.jobId}-codex-last-message.json`
    );

    writeFileSync(
      outputSchemaPath,
      JSON.stringify(buildCodexTerminalSchema(), null, 2),
      "utf-8"
    );

    const prompt = buildCodexPrompt(args.promptPath, args.task);
    const commandArgs = [
      ...(args.allowSearch ? ["--search"] : []),
      "exec",
      "--full-auto",
      "-C",
      config.repoRoot,
      "--add-dir",
      tmpdir(),
      "--output-schema",
      outputSchemaPath,
      "-o",
      outputMessagePath,
      "--color",
      "never",
      "-",
    ];
    return {
      command: config.codexBin,
      args: commandArgs,
      stdinText: prompt,
      terminalFilePath: outputMessagePath,
      cleanupPaths: [outputSchemaPath],
    };
  }

  const claudeBin = config.claudeBin;
  if (!claudeBin) {
    throw new Error("claude CLI is not configured");
  }

  const commandArgs = ["-p"];
  if (config.allowDangerousClaudeFlags) {
    commandArgs.push("--dangerously-skip-permissions");
  }
  commandArgs.push("--append-system-prompt-file", args.promptPath, args.task);

  return {
    command: claudeBin,
    args: commandArgs,
    cleanupPaths: [],
  };
}

function buildQuickExecutionPlan(
  config: PipelineConfig,
  args: {
    jobId: string;
    logsDir: string;
    prompt: string;
  }
): ExecutionPlan {
  const realExecutor = config.realExecutor ?? "claude";

  if (realExecutor === "codex") {
    if (!config.codexBin) {
      throw new Error("codex CLI is not configured");
    }

    const outputSchemaPath = join(args.logsDir, `${args.jobId}-quick-codex-schema.json`);
    const outputMessagePath = join(args.logsDir, `${args.jobId}-quick-codex-last-message.json`);

    writeFileSync(
      outputSchemaPath,
      JSON.stringify(buildQuickEvaluationSchema(), null, 2),
      "utf-8"
    );

    return {
      command: config.codexBin,
      args: [
        "exec",
        "-C",
        config.repoRoot,
        "--output-schema",
        outputSchemaPath,
        "-o",
        outputMessagePath,
        "--color",
        "never",
        "-",
      ],
      stdinText: args.prompt,
      terminalFilePath: outputMessagePath,
      cleanupPaths: [outputSchemaPath],
    };
  }

  if (!config.claudeBin) {
    throw new Error("claude CLI is not configured");
  }

  return {
    command: config.claudeBin,
    args: ["-p", args.prompt],
    cleanupPaths: [],
  };
}

function buildCodexPrompt(promptPath: string, task: string): string {
  const prompt = readFileSync(promptPath, "utf-8");
  return [
    prompt,
    "",
    "## Codex CLI Invocation",
    task,
    "",
    "Final response rules:",
    "- Return only a JSON object. No prose, no markdown fences.",
    "- The JSON must match the provided output schema exactly.",
    "- Keep file writes in the normal career-ops locations required by the prompt.",
  ].join("\n");
}

function buildQuickEvaluationPrompt(args: {
  input: EvaluationInput;
  candidateProfile: QuickEvaluationCandidateProfile;
}): string {
  const quickInput = {
    url: args.input.url,
    title: args.input.title ?? null,
    structuredSignals: args.input.structuredSignals ?? null,
    pageText:
      args.input.pageText?.trim().slice(0, QUICK_EVALUATION_PAGE_TEXT_MAX_CHARS) || null,
  };

  return [
    "You are screening a new-grad / early-career job before a full deep evaluation.",
    "Goal: decide whether this role deserves the expensive full evaluation worker.",
    "Do not browse, search, fetch, or write files.",
    "Use only the supplied candidate profile, structured job signals, and compact JD excerpt.",
    "",
    "Candidate profile (JSON):",
    JSON.stringify(args.candidateProfile, null, 2),
    "",
    "Job input (JSON):",
    JSON.stringify(quickInput, null, 2),
    "",
    "Decision rules:",
    "- Choose `deep_eval` only when the role looks genuinely strong for this candidate.",
    "- Hard blockers should heavily push toward `skip`: no sponsorship support when visa sponsorship is required, active security clearance requirement, or explicit experience beyond the candidate max years.",
    "- Treat active security clearance as a hard blocker only for active/current Secret, Top Secret, or TS/SCI requirements. Ignore preferred, public-trust-only, or ability-to-obtain language.",
    "- Unknown sponsorship support and missing compensation are uncertainty signals, not standalone hard blockers.",
    "- If title-level signals say new grad / junior / engineer I, do not let noisy employment-type or seniority metadata override that by itself.",
    "- Prefer `skip` for vague, low-signal, clearly senior, or low-value roles.",
    "- `score` is a 0-5 screening score, not the final deep-eval score.",
    "- `reasons` should be 2-6 short machine-readable bullets for why the role is promising.",
    "- `blockers` should be 0-6 short machine-readable bullets for why the role is risky or not worth deep eval.",
    "- `tldr` must be one sentence.",
    "- `legitimacy` must be one of: High Confidence, Proceed with Caution, Suspicious.",
    "",
    "Return only a JSON object matching the provided schema exactly.",
  ].join("\n");
}

function buildCodexTerminalSchema(): Record<string, unknown> {
  const nullableString = [{ type: "string" }, { type: "null" }];
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "id",
      "report_num",
      "company",
      "role",
      "score",
      "tldr",
      "archetype",
      "legitimacy",
      "pdf",
      "report",
      "error",
    ],
    properties: {
      status: { type: "string", enum: ["completed", "failed"] },
      id: { type: "string", minLength: 1 },
      report_num: {
        anyOf: [{ type: "string", minLength: 1 }, { type: "integer" }],
      },
      company: { type: "string" },
      role: { type: "string" },
      score: { anyOf: [{ type: "number" }, { type: "null" }] },
      tldr: { type: "string" },
      archetype: { type: "string" },
      legitimacy: { anyOf: nullableString },
      pdf: { anyOf: nullableString },
      report: { anyOf: nullableString },
      error: { anyOf: nullableString },
    },
  };
}

function buildQuickEvaluationSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "id",
      "company",
      "role",
      "score",
      "tldr",
      "legitimacy",
      "decision",
      "reasons",
      "blockers",
      "error",
    ],
    properties: {
      status: { enum: ["completed", "failed"] },
      id: { type: "string" },
      company: { type: "string" },
      role: { type: "string" },
      score: { type: "number" },
      tldr: { type: "string" },
      legitimacy: { type: "string" },
      decision: { enum: ["deep_eval", "skip"] },
      reasons: {
        type: "array",
        items: { type: "string" },
      },
      blockers: {
        type: "array",
        items: { type: "string" },
      },
      error: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
  };
}

function reserveReportNumber(repoRoot: string, jobId: string): number {
  const lockDir = join(repoRoot, "batch/.batch-state.lock");
  const reservationsDir = join(repoRoot, "batch/.report-number-reservations");
  const deadline = Date.now() + LOCK_WAIT_MS;

  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (err) {
      const code =
        err instanceof Error && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      if (code !== "EEXIST") {
        throw err;
      }
      if (Date.now() >= deadline) {
        throw bridgeError(
          "REPO_LOCKED",
          "timed out waiting for batch report-number lock"
        );
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_POLL_MS);
    }
  }

  try {
    const reportsDir = join(repoRoot, "reports");
    mkdirSync(reservationsDir, { recursive: true });
    const names = existsSync(reportsDir) ? readdirSync(reportsDir) : [];
    let maxNum = 0;
    for (const name of names) {
      const match = /^(\d+)-/.exec(name);
      if (!match) continue;
      const num = Number(match[1]);
      if (Number.isFinite(num)) {
        maxNum = Math.max(maxNum, num);
      }
    }
    const reservationNames = readdirSync(reservationsDir);
    for (const name of reservationNames) {
      const match = /^(\d+)-/.exec(name);
      if (!match) continue;
      const num = Number(match[1]);
      if (Number.isFinite(num)) {
        maxNum = Math.max(maxNum, num);
      }
    }
    const next = maxNum + 1;
    writeFileSync(
      join(
        reservationsDir,
        `${formatReportNumber(next)}-${jobId}.reserved`
      ),
      `${jobId}\n`,
      "utf-8"
    );
    return next;
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  stdinText?: string,
  completionProbe?: () => boolean,
  trace?: (line: string) => void
): Promise<CommandResult> {
  return await new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let completedByProbe = false;
    let completionKillTimer: NodeJS.Timeout | undefined;
    let completionPollTimer: NodeJS.Timeout | undefined;
    let heartbeatTimer: NodeJS.Timeout | undefined;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    trace?.(
      `spawn pid=${child.pid ?? "unknown"} cwd=${cwd} timeoutMs=${timeoutMs} command=${command} args=${formatArgsForLog(args)}`
    );
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (completionPollTimer) clearInterval(completionPollTimer);
      if (completionKillTimer) clearTimeout(completionKillTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      trace?.(`timeout reached; sending SIGKILL to pid=${child.pid ?? "unknown"}`);
      child.kill("SIGKILL");
      resolvePromise({
        exitCode: null,
        stdout,
        stderr,
        timedOut: true,
        completedByProbe,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBytes += Buffer.byteLength(text);
      traceChunk(trace, "stdout", text);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      stderrBytes += Buffer.byteLength(text);
      traceChunk(trace, "stderr", text);
    });
    if (stdinText !== undefined) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
    heartbeatTimer = setInterval(() => {
      if (settled) return;
      trace?.(
        `heartbeat pid=${child.pid ?? "unknown"} stdoutBytes=${stdoutBytes} stderrBytes=${stderrBytes}`
      );
    }, COMMAND_HEARTBEAT_MS);
    if (completionProbe) {
      completionPollTimer = setInterval(() => {
        if (settled || completedByProbe) return;
        try {
          if (!completionProbe()) return;
        } catch {
          return;
        }
        completedByProbe = true;
        trace?.(
          `completion probe satisfied; sending SIGTERM to pid=${child.pid ?? "unknown"}`
        );
        child.kill("SIGTERM");
        completionKillTimer = setTimeout(() => {
          if (!settled) {
            trace?.(
              `process did not exit after probe; sending SIGKILL to pid=${child.pid ?? "unknown"}`
            );
            child.kill("SIGKILL");
          }
        }, 1500);
      }, 1000);
    }
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (completionPollTimer) clearInterval(completionPollTimer);
      if (completionKillTimer) clearTimeout(completionKillTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      trace?.(`child process error: ${err.message}`);
      resolvePromise({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${err.message}`.trim(),
        timedOut: false,
        completedByProbe,
      });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (completionPollTimer) clearInterval(completionPollTimer);
      if (completionKillTimer) clearTimeout(completionKillTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      trace?.(
        `close exitCode=${exitCode ?? "null"} completedByProbe=${completedByProbe} stdoutBytes=${stdoutBytes} stderrBytes=${stderrBytes}`
      );
      resolvePromise({
        exitCode,
        stdout,
        stderr,
        timedOut: false,
        completedByProbe,
      });
    });
  });
}

function readCodexTerminalJson(path: string): ClaudeTerminalJson {
  const content = readFileSync(path, "utf-8").trim();
  if (!content) {
    throw new Error("Codex output did not include a terminal JSON block");
  }
  const parsed = JSON.parse(content) as Partial<ClaudeTerminalJson>;
  if (
    (parsed.status !== "completed" && parsed.status !== "failed") ||
    parsed.report_num === undefined ||
    typeof parsed.id !== "string" ||
    parsed.id.length === 0
  ) {
    throw new Error("Codex terminal JSON is missing required fields");
  }
  return parsed as ClaudeTerminalJson;
}

function readQuickEvaluationJson(path: string): QuickEvaluationJson {
  const content = readFileSync(path, "utf-8").trim();
  if (!content) {
    throw new Error("quick evaluation output was empty");
  }
  const parsed = JSON.parse(content) as Partial<QuickEvaluationJson>;
  if (
    (parsed.status !== "completed" && parsed.status !== "failed") ||
    typeof parsed.id !== "string" ||
    typeof parsed.company !== "string" ||
    typeof parsed.role !== "string" ||
    typeof parsed.score !== "number" ||
    typeof parsed.tldr !== "string" ||
    typeof parsed.legitimacy !== "string" ||
    (parsed.decision !== "deep_eval" && parsed.decision !== "skip") ||
    !Array.isArray(parsed.reasons) ||
    !Array.isArray(parsed.blockers)
  ) {
    throw new Error("quick evaluation JSON is missing required fields");
  }
  return {
    status: parsed.status,
    id: parsed.id,
    company: parsed.company,
    role: parsed.role,
    score: parsed.score,
    tldr: parsed.tldr,
    legitimacy: parsed.legitimacy,
    decision: parsed.decision,
    reasons: parsed.reasons.map((item) => String(item)),
    blockers: parsed.blockers.map((item) => String(item)),
    error: parsed.error ? String(parsed.error) : null,
  };
}

function extractTerminalJsonObject(stdout: string): ClaudeTerminalJson {
  const marker = stdout.lastIndexOf('"status"');
  if (marker === -1) {
    throw new Error("Claude output did not include a terminal JSON block");
  }

  for (
    let start = stdout.lastIndexOf("{", marker);
    start >= 0;
    start = stdout.lastIndexOf("{", start - 1)
  ) {
    const jsonText = sliceBalancedJson(stdout, start);
    if (!jsonText) continue;
    try {
      const parsed = JSON.parse(jsonText) as Partial<ClaudeTerminalJson>;
      if (
        parsed.status === "completed" ||
        parsed.status === "failed"
      ) {
        if (parsed.report_num === undefined) {
          throw new Error("terminal JSON missing report_num");
        }
        if (typeof parsed.id !== "string" || parsed.id.length === 0) {
          throw new Error("terminal JSON missing id");
        }
        return parsed as ClaudeTerminalJson;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Unable to parse terminal JSON from Claude output");
}

function extractQuickTerminalJsonObject(stdout: string): QuickEvaluationJson {
  const marker = stdout.lastIndexOf('"status"');
  if (marker === -1) {
    throw new Error("Claude output did not include a quick terminal JSON block");
  }

  for (
    let start = stdout.lastIndexOf("{", marker);
    start >= 0;
    start = stdout.lastIndexOf("{", start - 1)
  ) {
    const jsonText = sliceBalancedJson(stdout, start);
    if (!jsonText) continue;
    try {
      const parsed = JSON.parse(jsonText) as Partial<QuickEvaluationJson>;
      if (
        (parsed.status === "completed" || parsed.status === "failed") &&
        typeof parsed.id === "string" &&
        typeof parsed.company === "string" &&
        typeof parsed.role === "string" &&
        typeof parsed.score === "number" &&
        typeof parsed.tldr === "string" &&
        typeof parsed.legitimacy === "string" &&
        (parsed.decision === "deep_eval" || parsed.decision === "skip") &&
        Array.isArray(parsed.reasons) &&
        Array.isArray(parsed.blockers)
      ) {
        return {
          status: parsed.status,
          id: parsed.id,
          company: parsed.company,
          role: parsed.role,
          score: parsed.score,
          tldr: parsed.tldr,
          legitimacy: parsed.legitimacy,
          decision: parsed.decision,
          reasons: parsed.reasons.map((item) => String(item)),
          blockers: parsed.blockers.map((item) => String(item)),
          error: parsed.error ? String(parsed.error) : null,
        };
      }
    } catch {
      continue;
    }
  }

  throw new Error("Unable to parse quick terminal JSON from Claude output");
}

function sliceBalancedJson(text: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return undefined;
}

function parseReportMarkdown(markdown: string): ParsedReportMarkdown {
  const headingMatch = markdown.match(
    /^#\s+(?:Evaluación|Evaluacion|Evaluation):\s+(.+?)\s+[—-]\s+(.+)$/m
  );
  if (!headingMatch) {
    throw new Error("report header missing company/role heading");
  }

  const date = readHeaderAny(markdown, ["Fecha", "Date"]);
  const archetype = readHeaderAny(markdown, ["Arquetipo", "Archetype"]);
  const scoreRaw = readHeaderAny(markdown, ["Score"]);
  const url = readOptionalHeaderAny(markdown, ["URL"]);
  const pdf = readOptionalHeaderAny(markdown, ["PDF"]);
  const scoreMatch = /([\d.]+)\s*\/\s*5/.exec(scoreRaw);
  if (!scoreMatch) {
    throw new Error("report header missing numeric score");
  }

  const tldr =
    extractTldrFromSummaryTable(markdown) ??
    extractSummaryParagraph(markdown) ??
    "Evaluation completed";

  return {
    company: headingMatch[1]!.trim(),
    role: headingMatch[2]!.trim(),
    date: date.trim(),
    score: Number(scoreMatch[1]),
    archetype: archetype.trim(),
    ...(url ? { url: url.trim() } : {}),
    ...(pdf ? { pdf: pdf.trim() } : {}),
    tldr,
  };
}

function readHeaderAny(markdown: string, labels: readonly string[]): string {
  for (const label of labels) {
    const value = readOptionalHeader(markdown, label);
    if (value) return value;
  }
  throw new Error(`report header missing ${labels.join("/")}`);
}

function readOptionalHeader(markdown: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(
    new RegExp(`^\\*\\*${escaped}:\\*\\*\\s+(.+)$`, "m")
  );
  return match?.[1]?.trim();
}

function readOptionalHeaderAny(
  markdown: string,
  labels: readonly string[]
): string | undefined {
  for (const label of labels) {
    const value = readOptionalHeader(markdown, label);
    if (value) return value;
  }
  return undefined;
}

function extractTldrFromSummaryTable(markdown: string): string | undefined {
  const match = markdown.match(/^\|\s*TL;DR\s*\|\s*(.+?)\s*\|$/im);
  return match?.[1]?.trim();
}

function extractSummaryParagraph(markdown: string): string | undefined {
  const sectionMatch = markdown.match(
    /##\s+A\)\s+Resumen del Rol\s*([\s\S]*?)(?:\n##\s+[B-Z]\)|$)/
  );
  const section = sectionMatch?.[1];
  if (!section) return undefined;

  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("|"))
    .filter((line) => !/^[-:]{3,}$/.test(line));

  return lines[0];
}

function resolveReportPath(
  repoRoot: string,
  reportNumber: number,
  hint?: string | null
): string | undefined {
  const reportsDir = join(repoRoot, "reports");
  if (hint) {
    const candidate = resolveArtifactPath(repoRoot, hint);
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  const prefix = `${formatReportNumber(reportNumber)}-`;
  const names = existsSync(reportsDir) ? readdirSync(reportsDir) : [];
  const match = names
    .filter((name) => name.startsWith(prefix) && name.endsWith(".md"))
    .sort()
    .at(-1);
  return match ? join(reportsDir, match) : undefined;
}

function resolveOptionalArtifactPath(
  repoRoot: string,
  rawPath: string | null
): string | null {
  if (!rawPath) return null;
  if (/^pendiente$/i.test(rawPath.trim())) return null;
  const resolved = resolveArtifactPath(repoRoot, rawPath);
  return resolved && existsSync(resolved) ? resolved : null;
}

async function syncTrackerAfterEvaluation(
  config: PipelineConfig,
  result: EvaluationResult,
  logPath?: string
): Promise<EvaluationResult> {
  const merge = await attemptTrackerMerge(config, logPath);
  if (logPath) {
    appendJobLog(
      logPath,
      "bridge",
      merge.merged
        ? `tracker merge succeeded added=${merge.summary?.added ?? 0} updated=${merge.summary?.updated ?? 0} skipped=${merge.summary?.skipped ?? 0}`
        : "tracker merge failed; leaving TSV pending for manual recovery"
    );
  }
  return {
    ...result,
    trackerMerged: merge.merged,
    ...(merge.summary ? { trackerMergeSummary: merge.summary } : {}),
  };
}

async function attemptTrackerMerge(
  config: PipelineConfig,
  logPath?: string
): Promise<TrackerMergeAttempt> {
  const command = await runCommand(
    config.nodeBin,
    [join(config.repoRoot, "merge-tracker.mjs")],
    config.repoRoot,
    config.evaluationTimeoutSec * 1000
  );

  if (command.timedOut || command.exitCode !== 0) {
    if (logPath) {
      appendJobLog(
        logPath,
        "bridge",
        `merge-tracker failed exitCode=${command.exitCode ?? "null"} timedOut=${command.timedOut} stderr=${tailText(command.stderr || command.stdout, 2000)}`
      );
    }
    return { merged: false };
  }

  return {
    merged: true,
    summary: parseMergeSummary(command.stdout),
  };
}

function parseMergeSummary(stdout: string): TrackerMergeSummary {
  const summaryMatch =
    /\+(\d+)\s+added,\s+🔄(\d+)\s+updated,\s+⏭️(\d+)\s+skipped/u.exec(stdout);
  return {
    added: Number(summaryMatch?.[1] ?? 0),
    updated: Number(summaryMatch?.[2] ?? 0),
    skipped: Number(summaryMatch?.[3] ?? 0),
  };
}

function finalizeEvaluationFromArtifacts(args: {
  repoRoot: string;
  trackerDir: string;
  jobId: string;
  reportNumber: number;
  reportNumberText: string;
  terminal: ClaudeTerminalJson | null;
  onProgress: PipelineProgressHandler;
  logPath?: string;
}): EvaluationResult | undefined {
  const reportPath = resolveReportPath(
    args.repoRoot,
    args.reportNumber,
    args.terminal?.report
  );
  if (!reportPath || !existsSync(reportPath)) {
    if (args.logPath) {
      appendJobLog(
        args.logPath,
        "bridge",
        `report artifact not found for report ${args.reportNumberText}`
      );
    }
    return undefined;
  }

  const reportMarkdown = readFileSync(reportPath, "utf-8");
  const reportMeta = parseReportMarkdown(reportMarkdown);
  const score = coerceScore(args.terminal?.score, reportMeta.score);
  const tldr = args.terminal?.tldr?.trim() || reportMeta.tldr;
  const archetype = args.terminal?.archetype?.trim() || reportMeta.archetype;
  const company = args.terminal?.company?.trim() || reportMeta.company;
  const role = args.terminal?.role?.trim() || reportMeta.role;
  const pdfPath = resolveOptionalArtifactPath(
    args.repoRoot,
    args.terminal?.pdf ?? reportMeta.pdf ?? null
  );
  if (args.logPath) {
    appendJobLog(
      args.logPath,
      "bridge",
      `finalizing from report=${reportPath} pdf=${pdfPath ?? "null"}`
    );
  }

  args.onProgress({
    phase: "writing_report",
    at: nowIso(),
    note: basename(reportPath),
  });

  args.onProgress({
    phase: "generating_pdf",
    at: nowIso(),
    note: pdfPath ? basename(pdfPath) : "pdf skipped or unavailable",
  });

  const trackerEntryNum = nextTrackerEntryNumber(args.repoRoot);
  const trackerRow = buildTrackerRow({
    num: trackerEntryNum,
    date: reportMeta.date,
    company,
    role,
    score,
    reportPath,
    pdfPath,
    tldr,
  });
  writeTrackerAddition(args.trackerDir, args.jobId, trackerRow);
  if (args.logPath) {
    appendJobLog(
      args.logPath,
      "bridge",
      `tracker addition written for job=${args.jobId} trackerNum=${trackerEntryNum}`
    );
  }

  args.onProgress({
    phase: "writing_tracker",
    at: nowIso(),
    note: `${args.jobId}.tsv`,
  });

  return {
    reportNumber: args.reportNumber,
    reportPath,
    pdfPath,
    company,
    role,
    score,
    archetype,
    tldr,
    trackerRow,
    trackerMerged: false,
  };
}

function appendJobLog(logPath: string, source: string, message: string): void {
  const timestamp = nowIso();
  const normalized = message.replace(/\r/g, "");
  const lines = normalized.split("\n");
  const formatted = lines
    .map((line) => `[${timestamp}] [${source}] ${line}`)
    .join("\n");
  appendFileSync(logPath, `${formatted}\n`, "utf-8");
}

function formatArgsForLog(args: readonly string[]): string {
  return args.map((arg) => JSON.stringify(arg)).join(" ");
}

function traceChunk(
  trace: ((line: string) => void) | undefined,
  stream: "stdout" | "stderr",
  chunk: string
): void {
  if (!trace) return;
  const normalized = chunk.replace(/\r/g, "");
  for (const line of normalized.split("\n")) {
    if (!line) continue;
    trace(`[${stream}] ${line}`);
  }
}

function tailText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(-maxChars);
}

function resolveArtifactPath(
  repoRoot: string,
  rawPath: string
): string | undefined {
  const trimmed = rawPath.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("/")
    ? trimmed
    : resolve(repoRoot, trimmed.replace(/^career-ops\//, ""));
}

function coerceScore(
  candidate: number | null | undefined,
  fallback: number
): number {
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return Number(candidate.toFixed(2));
  }
  return Number(fallback.toFixed(2));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function writeReport(
  repoRoot: string,
  reportNumber: number,
  slug: string,
  date: string,
  markdown: string
): string {
  const reportsDir = join(repoRoot, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const path = join(
    reportsDir,
    `${formatReportNumber(reportNumber)}-${slug}-${date}.md`
  );
  writeFileSync(path, markdown, "utf-8");
  return path;
}

function nextTrackerEntryNumber(repoRoot: string): number {
  const trackerPath = join(repoRoot, "data/applications.md");
  if (!existsSync(trackerPath)) return 1;

  let maxNum = 0;
  for (const row of parseTrackerRows(readFileSync(trackerPath, "utf-8"))) {
    maxNum = Math.max(maxNum, row.num);
  }
  return maxNum + 1;
}

function buildTrackerRow(args: {
  num: number;
  date: string;
  company: string;
  role: string;
  score: number;
  reportPath: string;
  pdfPath: string | null;
  tldr: string;
  status?: TrackerStatus;
}): TrackerRow {
  const scoreText = `${Number(args.score.toFixed(2))}/5` as TrackerRow["score"];
  const reportFile = basename(args.reportPath);
  return {
    num: args.num,
    date: args.date,
    company: args.company,
    role: args.role,
    status: args.status ?? "Evaluated",
    score: scoreText,
    pdf: args.pdfPath ? "✅" : "❌",
    report: `[${formatReportNumber(extractReportNumberFromPath(reportFile))}](reports/${reportFile})`,
    notes: truncateSingleLine(args.tldr, 180),
  };
}

function extractReportNumberFromPath(name: string): number {
  const match = /^(\d+)-/.exec(name);
  return Number(match?.[1] ?? 0);
}

function writeTrackerAddition(
  trackerDir: string,
  jobId: string,
  row: TrackerRow
): void {
  const tsvPath = join(trackerDir, `${jobId}.tsv`);
  const content = [
    row.num,
    row.date,
    row.company,
    row.role,
    row.status,
    row.score,
    row.pdf,
    row.report,
    row.notes,
  ].join("\t");
  writeFileSync(tsvPath, `${content}\n`, "utf-8");
}

function truncateSingleLine(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, maxChars - 1).trim()}…`;
}

function parseTrackerRows(markdown: string): TrackerRow[] {
  const rows: TrackerRow[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    if (line.includes("---")) continue;
    if (/\|\s*#\s*\|/.test(line)) continue;

    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 10) continue;

    const num = Number(parts[1]);
    if (!Number.isFinite(num) || num <= 0) continue;

    rows.push({
      num,
      date: parts[2] ?? "",
      company: parts[3] ?? "",
      role: parts[4] ?? "",
      score: ((parts[5] ?? "0/5") as TrackerRow["score"]),
      status: normalizeTrackerStatus(parts[6] ?? ""),
      pdf: (parts[7] === "✅" ? "✅" : "❌") as TrackerRow["pdf"],
      report: parts[8] ?? "",
      notes: parts[9] ?? "",
    });
  }
  return rows;
}

function normalizeTrackerStatus(raw: string): TrackerStatus {
  const normalized = raw.trim().toLowerCase();
  switch (normalized) {
    case "applied":
      return "Applied";
    case "responded":
      return "Responded";
    case "interview":
      return "Interview";
    case "offer":
      return "Offer";
    case "rejected":
      return "Rejected";
    case "discarded":
      return "Discarded";
    case "skip":
      return "SKIP";
    default:
      return "Evaluated";
  }
}

function extractErrorMessage(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "evaluation failed";
  return normalized.slice(0, MAX_ERROR_TAIL_CHARS);
}

function safeRemoveFile(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // best-effort cleanup only
  }
}
