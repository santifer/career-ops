import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { findCareerOpsRoot } from "./find-root";
import type { CareerOpsModeDefinition } from "./modes";

export class CareerOpsRepoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CareerOpsRepoError";
  }
}

function subagentBlock(mode: CareerOpsModeDefinition): string {
  if (!mode.prefersSubagent) {
    return [
      "## Subagent (optional)",
      "",
      "You can run this as a focused subagent in your IDE if it helps isolate context.",
      "",
    ].join("\n");
  }

  return [
    "## Subagent (recommended)",
    "",
    "From the career-ops skill, heavy modes are usually run as a general-purpose agent with",
    "`modes/_shared.md` + this mode file injected. Example shape:",
    "",
    "```",
    "Agent(",
    '  subagent_type="general-purpose",',
    `  prompt="[modes/_shared.md]\\\\n\\\\n[modes/${mode.id}.md]\\\\n\\\\n[your extra context below]",`,
    `  description="career-ops ${mode.id}"`,
    ")",
    "```",
    "",
  ].join("\n");
}

function invocationFooter(mode: CareerOpsModeDefinition, cliLine: string): string {
  return [
    "---",
    "",
    "## Terminal (Claude Code / same as local CLI)",
    "",
    "Run:",
    "",
    "```",
    cliLine,
    "```",
    "",
    subagentBlock(mode),
    "---",
    "",
  ].join("\n");
}

async function readUtf8(file: string): Promise<string> {
  return readFile(file, "utf8");
}

export interface ComposePromptResult {
  cliLine: string;
  promptBundle: string;
  subagentInstruction: string;
  root: string;
}

export async function composeCareerOpsPrompt(
  mode: CareerOpsModeDefinition,
  userNotes?: string | null,
): Promise<ComposePromptResult> {
  const root = findCareerOpsRoot();
  if (!root) {
    throw new CareerOpsRepoError(
      "Could not find career-ops repo (modes/_shared.md). Set CAREER_OPS_ROOT to the repo root, or run the app from within the career-ops tree.",
    );
  }

  const modeFile = path.join(root, "modes", `${mode.id}.md`);
  try {
    await stat(modeFile);
  } catch {
    throw new CareerOpsRepoError(`Missing mode file: modes/${mode.id}.md`);
  }

  const modeBody = await readUtf8(modeFile);
  let core: string;

  if (mode.usesSharedContext) {
    const sharedPath = path.join(root, "modes", "_shared.md");
    const shared = await readUtf8(sharedPath);
    core = [
      "# Shared context (modes/_shared.md)",
      "",
      shared,
      "",
      "---",
      "",
      `# Mode: ${mode.id}`,
      "",
      modeBody,
    ].join("\n");
  } else {
    core = [`# Mode: ${mode.id}`, "", modeBody].join("\n");
  }

  const cliLine =
    mode.id === "auto-pipeline"
      ? "/career-ops  # paste JD URL or text after the command, or put it under User context below"
      : mode.cli;

  const notes = userNotes?.trim()
    ? ["## User context (from web)", "", userNotes.trim(), "", "---", ""].join(
        "\n",
      )
    : "";

  const promptBundle =
    [core, "", notes, invocationFooter(mode, cliLine)].join("\n").trim() + "\n";

  const subagentInstruction = [
    `description: career-ops ${mode.id}`,
    "",
    "Inject the following as the agent system / task prompt:",
    "",
    "(Use modes/_shared.md + modes/{mode}.md from the career-ops repo when available.)",
  ].join("\n");

  return { cliLine, promptBundle, subagentInstruction, root };
}
