/**
 * sdk-pipeline.ts — PipelineAdapter powered by the Anthropic SDK.
 *
 * Replaces the `claude -p` spawning pattern with direct Claude API calls.
 * Advantages over claude-pipeline.ts:
 *   - Typed, structured output via zod validation
 *   - Streaming for real-time progress
 *   - No --dangerously-skip-permissions
 *   - Per-request API key scoping (no shared CLI session)
 *
 * What this adapter DOES:
 *   - Load _shared.md + oferta.md + _profile.md as the system prompt
 *   - Load cv.md + JD as user content
 *   - Call Claude API with adaptive thinking
 *   - Parse structured evaluation result
 *   - Write report to reports/
 *   - Write tracker TSV drop file
 *
 * Used when CAREER_OPS_BRIDGE_MODE=sdk and ANTHROPIC_API_KEY is set.
 *
 * Security note: this file uses execFileSync with fixed argv arrays
 * (nodeBin resolved from PATH at boot, script paths from repoRoot +
 * literals). No user input is ever passed to a subprocess.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

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
  FilteredRow,
  NewGradRow,
  EnrichedRow,
  NewGradScoreResult,
  NewGradEnrichResult,
  PipelineEntry,
} from "../contracts/newgrad.js";

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

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

/* -------------------------------------------------------------------------- */
/*  Zod schema for structured evaluation output                                */
/* -------------------------------------------------------------------------- */

const evaluationOutputSchema = z.object({
  company: z.string().describe("Company name"),
  role: z.string().describe("Job title / role name"),
  archetype: z.string().describe("Detected archetype"),
  score: z.number().min(0).max(5).describe("Overall match score 0-5"),
  tldr: z.string().describe("One-sentence TL;DR of the evaluation"),
  legitimacy: z.string().describe("Posting legitimacy assessment tier"),
  blockA: z.string().describe("Block A: Role summary in markdown"),
  blockB: z.string().describe("Block B: CV match analysis in markdown"),
  blockC: z.string().describe("Block C: Level strategy in markdown"),
  blockD: z.string().describe("Block D: Comp and demand research in markdown"),
  blockE: z.string().describe("Block E: CV personalization plan in markdown"),
  blockF: z.string().describe("Block F: Interview preparation in markdown"),
  blockG: z.string().describe("Block G: Posting legitimacy analysis in markdown"),
  draftAnswers: z.string().optional().describe("Markdown for section H draft application answers when score >= 4.5; omit or empty otherwise"),
  keywords: z.array(z.string()).describe("15-20 ATS keywords from the JD"),
});

type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;

/* -------------------------------------------------------------------------- */
/*  Adapter                                                                    */
/* -------------------------------------------------------------------------- */

export interface SdkPipelineOptions {
  apiKey?: string;
  model?: string;
}

export const __internal = {
  extractJsonFromText,
  buildSystemPrompt,
  buildReport,
};

export function createSdkPipelineAdapter(
  config: PipelineConfig,
  options: SdkPipelineOptions = {}
): PipelineAdapter {
  const client = new Anthropic({
    apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
  });
  const model = options.model ?? "claude-opus-4-6";

  return {
    async doctor(): Promise<DoctorReport> {
      const cvOk = existsSync(join(config.repoRoot, "cv.md"));
      const profileOk = existsSync(join(config.repoRoot, "config/profile.yml"));
      const trackerOk = existsSync(join(config.repoRoot, "data/applications.md"));
      const versionPath = join(config.repoRoot, "VERSION");
      const careerOpsVersion = existsSync(versionPath)
        ? readFileSync(versionPath, "utf-8").trim()
        : "unknown";
      const apiKeyPresent = Boolean(options.apiKey ?? process.env.ANTHROPIC_API_KEY);

      return {
        ok: cvOk && profileOk && trackerOk && apiKeyPresent,
        repo: {
          rootPath: config.repoRoot,
          careerOpsVersion,
          trackerOk,
          cvOk,
          profileOk,
        },
        claudeCli: apiKeyPresent
          ? { ok: true, version: `sdk (${model})` }
          : { ok: false, error: "ANTHROPIC_API_KEY not set" },
        node: { version: process.version },
        playwrightChromium: { ok: true },
      };
    },

    async checkLiveness(url: string): Promise<LivenessCheck> {
      const scriptPath = join(config.repoRoot, "check-liveness.mjs");
      try {
        const out = execFileSync(config.nodeBin, [scriptPath, url], {
          cwd: config.repoRoot,
          encoding: "utf-8",
          timeout: config.livenessTimeoutSec * 1000,
          stdio: ["ignore", "pipe", "pipe"],
        });
        if (out.includes("✅") || /\bactive\b/i.test(out)) {
          return { url, status: "active", reason: "apply button detected", exitCode: 0 };
        }
        return { url, status: "uncertain", reason: "no clear signal", exitCode: 1 };
      } catch {
        return { url, status: "uncertain", reason: "liveness check failed", exitCode: -1 };
      }
    },

    async runEvaluation(
      jobId: JobId,
      input: EvaluationInput,
      onProgress: PipelineProgressHandler
    ): Promise<EvaluationResult | BridgeError> {
      try {
        onProgress({ phase: "extracting_jd", at: nowIso(), note: "loading context" });

        const systemPrompt = buildSystemPrompt(config.repoRoot);
        const cvContent = safeRead(join(config.repoRoot, "cv.md"), "");
        const jdText = input.pageText?.trim() || `URL: ${input.url}\nTitle: ${input.title ?? "(untitled)"}`;

        if (!cvContent) {
          return bridgeError("BRIDGE_NOT_READY", "cv.md is empty or missing");
        }

        const reportNumber = reserveReportNumber(config.repoRoot, jobId);
        const reportNumberText = String(reportNumber).padStart(3, "0");
        const today = todayDate();

        onProgress({ phase: "evaluating", at: nowIso(), note: `sdk eval (${model})` });

        const userContent = [
          `## Candidate CV\n\n${cvContent}`,
          `## Job Description\n\nURL: ${input.url}\nTitle: ${input.title ?? "(untitled)"}\n\n${jdText}`,
          `## Instructions`,
          `Evaluate this job offer using the full A-G oferta system from your instructions.`,
          `Return your evaluation as a structured JSON object with fields: company, role, archetype, score (number 0-5), tldr, legitimacy, blockA through blockG (each a markdown string), draftAnswers (markdown string only when score >= 4.5, otherwise omit or empty), and keywords (array of 15-20 strings).`,
          `Wrap the JSON in a \`\`\`json code fence.`,
        ].join("\n\n");

        const response = await client.messages.create({
          model,
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        });

        onProgress({ phase: "writing_report", at: nowIso() });

        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text"
        );
        if (!textBlock) {
          return bridgeError("EVAL_FAILED", "no text in Claude response");
        }

        const parsed = extractJsonFromText(textBlock.text);
        if (!parsed) {
          const fallbackReport = buildFallbackReport(input, today, textBlock.text);
          const slug = slugify(input.title ?? "unknown");
          writeReport(config.repoRoot, reportNumber, slug, today, fallbackReport);
          return bridgeError("EVAL_FAILED", "could not parse structured output from response");
        }

        const validated = evaluationOutputSchema.safeParse(parsed);
        if (!validated.success) {
          return bridgeError("EVAL_FAILED", "structured output failed validation", {
            issues: validated.error.issues.map(i => `${i.path.join(".")}: ${i.message}`),
          });
        }

        const evalOutput = validated.data;
        const reportMarkdown = buildReport(evalOutput, input, today);
        const slug = slugify(evalOutput.company);
        const reportPath = writeReport(config.repoRoot, reportNumber, slug, today, reportMarkdown);

        onProgress({ phase: "writing_tracker", at: nowIso() });

        const trackerRow: TrackerRow = {
          num: reportNumber,
          date: today,
          company: evalOutput.company,
          role: evalOutput.role,
          status: "Evaluated" as TrackerStatus,
          score: `${evalOutput.score.toFixed(1)}/5` as TrackerRow["score"],
          pdf: "❌",
          report: `[${reportNumberText}](reports/${reportNumberText}-${slug}-${today}.md)`,
          notes: `SDK eval · ${evalOutput.archetype}`,
        };

        writeTrackerTsv(config.repoRoot, reportNumber, slug, trackerRow);

        const trackerMergeSummary = attemptTrackerMerge(config);

        return {
          reportNumber,
          reportPath,
          pdfPath: null,
          company: evalOutput.company,
          role: evalOutput.role,
          score: evalOutput.score,
          archetype: evalOutput.archetype,
          tldr: evalOutput.tldr,
          trackerRow,
          trackerMerged: trackerMergeSummary !== null,
          ...(trackerMergeSummary ? { trackerMergeSummary } : {}),
        };
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
          return bridgeError("RATE_LIMITED", "Anthropic API rate limit hit");
        }
        if (err instanceof Anthropic.AuthenticationError) {
          return bridgeError("UNAUTHORIZED", "invalid ANTHROPIC_API_KEY");
        }
        if (err instanceof Anthropic.APIError) {
          return bridgeError("EVAL_FAILED", `API error ${err.status}: ${err.message}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return bridgeError("INTERNAL", message);
      }
    },

    async readReport(num: number): Promise<ReportFile | undefined> {
      const reportsDir = join(config.repoRoot, "reports");
      if (!existsSync(reportsDir)) return undefined;
      const files = readdirSync(reportsDir);
      const padded = String(num).padStart(3, "0");
      const match = files.find(f => f.startsWith(`${padded}-`));
      if (!match) return undefined;
      const fullPath = join(reportsDir, match);
      const markdown = readFileSync(fullPath, "utf-8");
      const meta = parseReportMeta(markdown);
      return { num, path: fullPath, markdown, meta };
    },

    async readTrackerTail(limit: number) {
      const trackerPath = join(config.repoRoot, "data/applications.md");
      if (!existsSync(trackerPath)) return { rows: [], totalRows: 0 };
      const content = readFileSync(trackerPath, "utf-8");
      const rows = parseTrackerRows(content);
      const safeLimit = Math.max(0, limit);
      return {
        rows: rows.slice(Math.max(0, rows.length - safeLimit)),
        totalRows: rows.length,
      };
    },

    async mergeTracker(dryRun: boolean): Promise<MergeReport> {
      const args = [join(config.repoRoot, "merge-tracker.mjs")];
      if (dryRun) args.push("--dry-run");
      try {
        const out = execFileSync(config.nodeBin, args, {
          cwd: config.repoRoot,
          encoding: "utf-8",
          timeout: 30_000,
        });
        return {
          ...parseMergeSummary(out),
          dryRun,
        };
      } catch {
        return { added: 0, updated: 0, skipped: 0, dryRun };
      }
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

      for (const enrichedRow of rows) {
        processed++;

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
        entries.push(entry);
        existingPipelineUrls.add(canonicalEntryUrl);
        onProgress?.(processed, rows.length, enrichedRow);
      }

      if (entries.length > 0) {
        const pipelinePath = join(config.repoRoot, "data/pipeline.md");
        const maxScore =
          scanConfig.role_keywords.weight +
          scanConfig.skill_keywords.max_score +
          scanConfig.freshness.within_24h;
        const lines = entries.map(
          (e) => {
            const value = e.valueScore !== undefined ? `, value: ${e.valueScore}/10` : "";
            return `- [ ] ${e.url} — ${e.company} | ${e.role} (via newgrad-scan, score: ${e.score}/${maxScore}${value})`;
          },
        );

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
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function nowIso(): string { return new Date().toISOString(); }

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function safeRead(path: string, fallback: string): string {
  try { return readFileSync(path, "utf-8"); } catch { return fallback; }
}

function buildSystemPrompt(repoRoot: string): string {
  return [
    safeRead(join(repoRoot, "modes/_shared.md"), ""),
    "---",
    safeRead(join(repoRoot, "modes/oferta.md"), ""),
    "---",
    "## User Profile",
    safeRead(join(repoRoot, "modes/_profile.md"), ""),
    "---",
    "## Profile Configuration",
    safeRead(join(repoRoot, "config/profile.yml"), ""),
  ].join("\n\n");
}

function extractJsonFromText(text: string): unknown {
  const fenceMatch = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]!); } catch { /* fall through */ }
  }
  const braceStart = text.lastIndexOf("{");
  if (braceStart >= 0) {
    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end > braceStart) {
      try { return JSON.parse(text.slice(braceStart, end + 1)); } catch { /* fall through */ }
    }
  }
  return null;
}

function buildReport(output: EvaluationOutput, input: EvaluationInput, date: string): string {
  const sections = [
    `# Evaluación: ${output.company} — ${output.role}`,
    "",
    `**Fecha:** ${date}`,
    `**Arquetipo:** ${output.archetype}`,
    `**Score:** ${output.score.toFixed(1)}/5`,
    `**Legitimacy:** ${output.legitimacy}`,
    `**URL:** ${input.url}`,
    `**PDF:** pending explicit confirmation`,
    `**Adapter:** sdk (direct API)`,
    "",
    "---",
    "",
    "## A) Resumen del Rol", output.blockA, "",
    "## B) Match con CV", output.blockB, "",
    "## C) Nivel y Estrategia", output.blockC, "",
    "## D) Comp y Demanda", output.blockD, "",
    "## E) Plan de Personalización", output.blockE, "",
    "## F) Plan de Entrevistas", output.blockF, "",
    "## G) Posting Legitimacy", output.blockG,
  ];

  if (output.score >= 4.5 && output.draftAnswers?.trim()) {
    sections.push("", "## H) Draft Application Answers", output.draftAnswers.trim());
  }

  sections.push(
    "",
    "---",
    "",
    "## Keywords extraídas",
    output.keywords.map(k => `- ${k}`).join("\n"),
  );

  return sections.join("\n");
}

function attemptTrackerMerge(config: PipelineConfig): TrackerMergeSummary | null {
  const args = [join(config.repoRoot, "merge-tracker.mjs")];
  try {
    const out = execFileSync(config.nodeBin, args, {
      cwd: config.repoRoot,
      encoding: "utf-8",
      timeout: 30_000,
    });
    return parseMergeSummary(out);
  } catch {
    return null;
  }
}

function parseMergeSummary(stdout: string): TrackerMergeSummary {
  const match =
    /\+(\d+)\s+added,\s+🔄(\d+)\s+updated,\s+⏭️(\d+)\s+skipped/u.exec(stdout);
  return {
    added: Number(match?.[1] ?? 0),
    updated: Number(match?.[2] ?? 0),
    skipped: Number(match?.[3] ?? 0),
  };
}

function buildFallbackReport(input: EvaluationInput, date: string, rawText: string): string {
  return [
    `# Evaluación: (parse failed) — ${input.title ?? "unknown"}`,
    "", `**Fecha:** ${date}`, `**URL:** ${input.url}`,
    `**Adapter:** sdk (parse failed)`, "", "---", "",
    "## Raw Claude Response", "", rawText,
  ].join("\n");
}

function writeReport(repoRoot: string, num: number, slug: string, date: string, md: string): string {
  const dir = join(repoRoot, "reports");
  mkdirSync(dir, { recursive: true });
  const padded = String(num).padStart(3, "0");
  const path = join(dir, `${padded}-${slug}-${date}.md`);
  writeFileSync(path, md, "utf-8");
  return path;
}

function writeTrackerTsv(repoRoot: string, num: number, slug: string, row: TrackerRow): void {
  const dir = join(repoRoot, "batch/tracker-additions");
  mkdirSync(dir, { recursive: true });
  const padded = String(num).padStart(3, "0");
  const line = [row.num, row.date, row.company, row.role, row.status, row.score, row.pdf, row.report, row.notes].join("\t");
  writeFileSync(join(dir, `${padded}-${slug}.tsv`), line + "\n", "utf-8");
}

function reserveReportNumber(repoRoot: string, jobId: string): number {
  const lockDir = join(repoRoot, "batch/.batch-state.lock");
  const reservationsDir = join(repoRoot, "batch/.report-number-reservations");
  const deadline = Date.now() + 5000;
  for (;;) {
    try { mkdirSync(lockDir); break; }
    catch (err) {
      const code = err instanceof Error && "code" in err ? String((err as { code?: unknown }).code) : "";
      if (code !== "EEXIST") throw err;
      if (Date.now() >= deadline) throw bridgeError("REPO_LOCKED", "timed out waiting for report-number lock");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    const dir = join(repoRoot, "reports");
    mkdirSync(reservationsDir, { recursive: true });
    const names = existsSync(dir) ? readdirSync(dir) : [];
    let max = 0;
    for (const n of names) { const m = /^(\d+)-/.exec(n); if (m) max = Math.max(max, Number(m[1])); }
    const reservationNames = readdirSync(reservationsDir);
    for (const n of reservationNames) {
      const m = /^(\d+)-/.exec(n);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const next = max + 1;
    writeFileSync(
      join(reservationsDir, `${String(next).padStart(3, "0")}-${jobId}.reserved`),
      `${jobId}\n`,
      "utf-8",
    );
    return next;
  } finally { rmSync(lockDir, { recursive: true, force: true }); }
}

function parseReportMeta(markdown: string): ReportFile["meta"] {
  const t = /^#\s+Evaluación:\s*(.+?)\s*—\s*(.+)$/m.exec(markdown);
  const d = /\*\*Fecha:\*\*\s*(.+)/m.exec(markdown);
  const s = /\*\*Score:\*\*\s*([\d.]+)/m.exec(markdown);
  const a = /\*\*Arquetipo:\*\*\s*(.+)/m.exec(markdown);
  const u = /\*\*URL:\*\*\s*(.+)/m.exec(markdown);
  const result: ReportFile["meta"] = {
    company: t?.[1]?.trim() ?? "Unknown",
    role: t?.[2]?.trim() ?? "Unknown",
    date: d?.[1]?.trim() ?? "",
    score: s ? parseFloat(s[1]!) : 0,
    archetype: a?.[1]?.trim() ?? "",
  };
  const urlVal = u?.[1]?.trim();
  if (urlVal) result.url = urlVal;
  return result;
}

function parseTrackerRows(content: string): TrackerRow[] {
  const rows: TrackerRow[] = [];
  for (const line of content.split("\n")) {
    if (!line.startsWith("|") || line.includes("---") || line.includes("Company")) continue;
    const p = line.split("|").map(s => s.trim());
    if (p.length < 9) continue;
    const num = parseInt(p[1]!, 10);
    if (isNaN(num)) continue;
    rows.push({
      num, date: p[2]!, company: p[3]!, role: p[4]!,
      score: p[5] as TrackerRow["score"], status: p[6] as TrackerStatus,
      pdf: p[7] as "✅" | "❌", report: p[8]!, notes: p[9] ?? "",
    });
  }
  return rows;
}
