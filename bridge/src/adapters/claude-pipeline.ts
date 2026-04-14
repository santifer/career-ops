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
  EvaluationResult,
  JobId,
  TrackerMergeSummary,
  TrackerRow,
  TrackerStatus,
} from "../contracts/jobs.js";
import type { BridgeError } from "../contracts/envelope.js";
import type {
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
import { pickPipelineEntryUrl } from "./newgrad-links.js";
import {
  loadNegativeKeywords,
  loadNewGradScanConfig,
  loadPipelineUrls,
  persistBlockedCompanies,
  loadTrackedCompanyRoles,
} from "./newgrad-config.js";
import { JD_MIN_CHARS as JD_MIN_CHARS_VALUE } from "../contracts/jobs.js";
import { writeJdFile } from "../lib/write-jd-file.js";

const LOCK_WAIT_MS = 5_000;
const LOCK_POLL_MS = 100;
const REPORT_NUM_WIDTH = 3;
const MAX_ERROR_TAIL_CHARS = 400;
const COMMAND_HEARTBEAT_MS = 15_000;

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
  buildCodexTerminalSchema,
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
      const { promoted, filtered } = scoreAndFilter(rows, scanConfig, negativeKeywords, trackedSet);
      persistBlockedCompanies(config.repoRoot, filtered);
      return { promoted, filtered };
    },

    async enrichNewGradRows(
      rows: EnrichedRow[],
      onProgress?: (current: number, total: number, row: EnrichedRow) => void,
    ): Promise<NewGradEnrichResult> {
      const scanConfig = loadNewGradScanConfig(config.repoRoot);
      const negativeKeywords = loadNegativeKeywords(config.repoRoot);
      const trackedSet = loadTrackedCompanyRoles(config.repoRoot);
      const existingPipelineUrls = loadPipelineUrls(config.repoRoot);

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

        const entryUrl = pickPipelineEntryUrl(
          enrichedRow.detail,
          enrichedRow.row.row,
        );
        const entry: PipelineEntry = {
          url: entryUrl,
          company: enrichedRow.row.row.company,
          role: enrichedRow.row.row.title,
          score: scored.score,
          source: "newgrad-jobs.com",
        };
        candidates.push(entry);

        if (existingPipelineUrls.has(entryUrl)) {
          skipped++;
          onProgress?.(processed, rows.length, enrichedRow);
          continue;
        }

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
        });

        if (jdFile) {
          jdFileMap.set(entryUrl, jdFile);
        }

        entries.push(entry);
        existingPipelineUrls.add(entryUrl);
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
          const base = `- [ ] ${e.url} — ${e.company} | ${e.role} (via newgrad-scan, score: ${e.score}/${maxScore})`;
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

function buildJdText(input: EvaluationInput): string {
  const pageText = input.pageText?.trim() ?? "";
  const header = [
    `URL: ${input.url}`,
    `Title: ${input.title?.trim() || "(untitled job page)"}`,
    "",
  ].join("\n");

  if (pageText.length >= JD_MIN_CHARS_VALUE) {
    return `${header}${pageText}\n`;
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
    return {
      command: config.codexBin,
      args: [
        "--search",
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
      ],
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
    /^#\s+(?:Evaluación|Evaluation):\s+(.+?)\s+[—-]\s+(.+)$/m
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
}): TrackerRow {
  const scoreText = `${Number(args.score.toFixed(2))}/5` as TrackerRow["score"];
  const reportFile = basename(args.reportPath);
  return {
    num: args.num,
    date: args.date,
    company: args.company,
    role: args.role,
    status: "Evaluated",
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
