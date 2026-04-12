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
  TrackerRow,
  TrackerStatus,
} from "../contracts/jobs.js";
import type { BridgeError } from "../contracts/envelope.js";
import type {
  NewGradRow,
  EnrichedRow,
  NewGradScoreResult,
  NewGradEnrichResult,
  NewGradScanConfig,
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
import { pickPipelineEntryUrl } from "./newgrad-links.js";

/* -------------------------------------------------------------------------- */
/*  Zod schema for structured evaluation output                                */
/* -------------------------------------------------------------------------- */

const evaluationOutputSchema = z.object({
  company: z.string().describe("Company name"),
  role: z.string().describe("Job title / role name"),
  archetype: z.string().describe("Detected archetype"),
  score: z.number().min(0).max(5).describe("Overall match score 0-5"),
  tldr: z.string().describe("One-sentence TL;DR of the evaluation"),
  blockA: z.string().describe("Block A: Role summary in markdown"),
  blockB: z.string().describe("Block B: CV match analysis in markdown"),
  blockC: z.string().describe("Block C: Level strategy in markdown"),
  blockD: z.string().describe("Block D: Comp and demand research in markdown"),
  blockE: z.string().describe("Block E: CV personalization plan in markdown"),
  blockF: z.string().describe("Block F: Interview preparation in markdown"),
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
      _jobId: JobId,
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

        const reportNumber = reserveReportNumber(config.repoRoot);
        const reportNumberText = String(reportNumber).padStart(3, "0");
        const today = todayDate();

        onProgress({ phase: "evaluating", at: nowIso(), note: `sdk eval (${model})` });

        const userContent = [
          `## Candidate CV\n\n${cvContent}`,
          `## Job Description\n\nURL: ${input.url}\nTitle: ${input.title ?? "(untitled)"}\n\n${jdText}`,
          `## Instructions`,
          `Evaluate this job offer using the A-F block system from your instructions.`,
          `Return your evaluation as a structured JSON object with fields: company, role, archetype, score (number 0-5), tldr, blockA through blockF (each a markdown string), and keywords (array of 15-20 strings).`,
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
        const m = /\+(\d+)\s+added,\s+🔄(\d+)\s+updated,\s+⏭️(\d+)\s+skipped/u.exec(out);
        return {
          added: Number(m?.[1] ?? 0),
          updated: Number(m?.[2] ?? 0),
          skipped: Number(m?.[3] ?? 0),
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
      const { promoted, filtered } = scoreAndFilter(rows, scanConfig, negativeKeywords, trackedSet);
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
      let skipped = 0;
      let processed = 0;

      for (const enrichedRow of rows) {
        processed++;

        const augmentedRow: NewGradRow = {
          ...enrichedRow.row.row,
          qualifications: [
            enrichedRow.row.row.qualifications ?? "",
            enrichedRow.detail.description,
          ].join(" "),
        };

        const { promoted } = scoreAndFilter(
          [augmentedRow],
          scanConfig,
          negativeKeywords,
          trackedSet,
        );

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
        if (existingPipelineUrls.has(entryUrl)) {
          skipped++;
          onProgress?.(processed, rows.length, enrichedRow);
          continue;
        }

        const entry: PipelineEntry = {
          url: entryUrl,
          company: enrichedRow.row.row.company,
          role: enrichedRow.row.row.title,
          score: scored.score,
          source: "newgrad-jobs.com",
        };
        entries.push(entry);
        existingPipelineUrls.add(entryUrl);
        onProgress?.(processed, rows.length, enrichedRow);
      }

      if (entries.length > 0) {
        const pipelinePath = join(config.repoRoot, "data/pipeline.md");
        const maxScore =
          scanConfig.role_keywords.weight +
          scanConfig.skill_keywords.max_score +
          scanConfig.freshness.within_24h;
        const lines = entries.map(
          (e) =>
            `- [ ] ${e.url} — ${e.company} | ${e.role} (via newgrad-scan, score: ${e.score}/${maxScore})`,
        );

        if (!existsSync(pipelinePath)) {
          writeFileSync(pipelinePath, "# Pipeline Inbox\n\n", "utf-8");
        }
        appendFileSync(pipelinePath, "\n" + lines.join("\n") + "\n", "utf-8");
      }

      return { added: entries.length, skipped, entries };
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
  return [
    `# Evaluación: ${output.company} — ${output.role}`,
    "",
    `**Fecha:** ${date}`,
    `**Arquetipo:** ${output.archetype}`,
    `**Score:** ${output.score.toFixed(1)}/5`,
    `**URL:** ${input.url}`,
    `**PDF:** pendiente`,
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
    "---", "",
    "## Keywords extraídas",
    output.keywords.map(k => `- ${k}`).join("\n"),
  ].join("\n");
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

function reserveReportNumber(repoRoot: string): number {
  const lockDir = join(repoRoot, "batch/.batch-state.lock");
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
    const names = existsSync(dir) ? readdirSync(dir) : [];
    let max = 0;
    for (const n of names) { const m = /^(\d+)-/.exec(n); if (m) max = Math.max(max, Number(m[1])); }
    return max + 1;
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

/* -------------------------------------------------------------------------- */
/*  Newgrad-scan helpers                                                       */
/* -------------------------------------------------------------------------- */

function loadNewGradScanConfig(repoRoot: string): NewGradScanConfig {
  const profilePath = join(repoRoot, "config/profile.yml");
  const defaults: NewGradScanConfig = {
    role_keywords: {
      positive: ["engineer", "developer", "software"],
      weight: 3,
    },
    skill_keywords: {
      terms: ["typescript", "react", "node", "python"],
      weight: 1,
      max_score: 4,
    },
    freshness: { within_24h: 2, within_3d: 1, older: 0 },
    list_threshold: 3,
    pipeline_threshold: 5,
    detail_concurrent_tabs: 3,
    detail_delay_min_ms: 2000,
    detail_delay_max_ms: 5000,
  };

  if (!existsSync(profilePath)) return defaults;

  try {
    const lines = readFileSync(profilePath, "utf-8").split(/\r?\n/);
    const section = extractYamlBlock(lines, "newgrad_scan", 0);
    if (section.length === 0) return defaults;

    const roleBlock = extractYamlBlock(section, "role_keywords", 2);
    const skillBlock = extractYamlBlock(section, "skill_keywords", 2);
    const freshnessBlock = extractYamlBlock(section, "freshness", 2);

    const rolePositive = extractYamlArray(roleBlock, "positive", 4);
    const skillTerms = extractYamlArray(skillBlock, "terms", 4);

    return {
      role_keywords: {
        positive: rolePositive.length > 0 ? rolePositive : defaults.role_keywords.positive,
        weight: extractYamlNumber(roleBlock, "weight", 4, defaults.role_keywords.weight),
      },
      skill_keywords: {
        terms: skillTerms.length > 0 ? skillTerms : defaults.skill_keywords.terms,
        weight: extractYamlNumber(skillBlock, "weight", 4, defaults.skill_keywords.weight),
        max_score: extractYamlNumber(skillBlock, "max_score", 4, defaults.skill_keywords.max_score),
      },
      freshness: {
        within_24h: extractYamlNumber(
          freshnessBlock,
          "within_24h",
          4,
          defaults.freshness.within_24h,
        ),
        within_3d: extractYamlNumber(
          freshnessBlock,
          "within_3d",
          4,
          defaults.freshness.within_3d,
        ),
        older: extractYamlNumber(freshnessBlock, "older", 4, defaults.freshness.older),
      },
      list_threshold: extractYamlNumber(section, "list_threshold", 2, defaults.list_threshold),
      pipeline_threshold: extractYamlNumber(
        section,
        "pipeline_threshold",
        2,
        defaults.pipeline_threshold,
      ),
      detail_concurrent_tabs: extractYamlNumber(
        section,
        "detail_concurrent_tabs",
        2,
        defaults.detail_concurrent_tabs,
      ),
      detail_delay_min_ms: extractYamlNumber(
        section,
        "detail_delay_min_ms",
        2,
        defaults.detail_delay_min_ms,
      ),
      detail_delay_max_ms: extractYamlNumber(
        section,
        "detail_delay_max_ms",
        2,
        defaults.detail_delay_max_ms,
      ),
    };
  } catch {
    return defaults;
  }
}

function extractYamlBlock(lines: readonly string[], key: string, indent: number): string[] {
  const header = new RegExp(`^${" ".repeat(indent)}${escapeRegExp(key)}:\\s*$`);
  const start = lines.findIndex((line) => header.test(line));
  if (start === -1) return [];

  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      block.push(line);
      continue;
    }
    if (countIndent(line) <= indent) break;
    block.push(line);
  }
  return block;
}

function extractYamlArray(lines: readonly string[], key: string, indent: number): string[] {
  const block = extractYamlBlock(lines, key, indent);
  return block
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim().replace(/^["']|["']$/g, ""));
}

function extractYamlNumber(
  lines: readonly string[],
  key: string,
  indent: number,
  fallback: number,
): number {
  const pattern = new RegExp(
    `^${" ".repeat(indent)}${escapeRegExp(key)}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*$`,
  );
  const match = lines.find((line) => pattern.test(line))?.match(pattern);
  return match ? Number(match[1]) : fallback;
}

function countIndent(line: string): number {
  return line.length - line.trimStart().length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadNegativeKeywords(repoRoot: string): string[] {
  const portalsPath = join(repoRoot, "portals.yml");
  if (!existsSync(portalsPath)) return [];

  try {
    const content = readFileSync(portalsPath, "utf-8");
    const negMatch = /negative:\s*\n((?:\s+-\s+.+\n?)*)/m.exec(content);
    if (!negMatch) return [];
    return [...negMatch[1]!.matchAll(/^\s+-\s+(.+)$/gm)].map(m => m[1]!.trim().replace(/^["']|["']$/g, ""));
  } catch {
    return [];
  }
}

function loadTrackedCompanyRoles(repoRoot: string): Set<string> {
  const trackerPath = join(repoRoot, "data/applications.md");
  const tracked = new Set<string>();
  if (!existsSync(trackerPath)) return tracked;

  try {
    const content = readFileSync(trackerPath, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.startsWith("|") || line.includes("---") || line.includes("Company")) continue;
      const cols = line.split("|").map(s => s.trim());
      if (cols.length >= 5) {
        const company = cols[3]?.toLowerCase() ?? "";
        const role = cols[4]?.toLowerCase() ?? "";
        if (company && role) {
          tracked.add(`${company}|${role}`);
        }
      }
    }
  } catch { /* ignore */ }
  return tracked;
}

function loadPipelineUrls(repoRoot: string): Set<string> {
  const pipelinePath = join(repoRoot, "data/pipeline.md");
  const urls = new Set<string>();
  if (!existsSync(pipelinePath)) return urls;

  try {
    const content = readFileSync(pipelinePath, "utf-8");
    for (const line of content.split("\n")) {
      const match = /^\s*-\s+\[[ xX]?\]\s+(\S+)/.exec(line);
      if (match?.[1]) {
        urls.add(match[1]);
      }
    }
  } catch {
    return urls;
  }

  return urls;
}
