#!/usr/bin/env node
/**
 * codex-runner.mjs
 *
 * Bridge between career-ops .agents/ prompt files and the Codex CLI.
 * Reads the matching .agents/career-ops-{command}.md file, substitutes
 * any arguments, then invokes `codex` with the assembled prompt.
 *
 * On fallback (Codex CLI not installed):
 *   - Caches the constructed prompt to .agents/cache/ for later use
 *   - Tells the user exactly which file to open and what to paste
 *
 * Each run is appended to runs/codex-runs.jsonl for audit and resume.
 *
 * TODO: Add auto-routing and batch execution when Codex supports skill loading.
 *
 * Usage:
 *   node codex-runner.mjs                           # show menu
 *   node codex-runner.mjs scan
 *   node codex-runner.mjs evaluate "URL or JD text"
 *   node codex-runner.mjs pdf
 *
 * npm shortcuts:
 *   npm run codex:scan
 *   npm run codex:evaluate -- "https://example.com/job/123"
 *
 * Requires the Codex CLI: https://github.com/openai/codex
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

const MODES = [
  "evaluate",
  "compare",
  "scan",
  "pdf",
  "pipeline",
  "apply",
  "tracker",
  "contact",
  "deep",
  "batch",
  "training",
  "project",
  "patterns",
  "followup",
];

// Commands that take no user arguments — warn if args are passed.
const NO_ARGS_MODES = new Set(["scan", "pipeline", "tracker", "patterns", "followup"]);

// ── Helpers ───────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`career-ops Codex runner

Usage:
  node codex-runner.mjs [command] [args]

Commands:
  (no args)    Show command menu
  evaluate     Evaluate job offer (A-F scoring, no auto PDF)
  compare      Compare and rank multiple offers
  scan         Scan portals for new offers
  pdf          Generate ATS-optimized CV PDF
  pipeline     Process pending URLs from data/pipeline.md
  apply        Live application assistant
  tracker      Application status overview
  contact      LinkedIn outreach: find contacts + draft message
  deep         Deep company research
  batch        Batch processing with parallel workers
  training     Evaluate course/cert against goals
  project      Evaluate portfolio project idea
  patterns     Analyze rejection patterns and improve targeting
  followup     Follow-up cadence tracker

Examples:
  node codex-runner.mjs
  node codex-runner.mjs scan
  node codex-runner.mjs evaluate "https://example.com/job/123"
  node codex-runner.mjs evaluate "$(cat jds/my-role.md)"

Requires the Codex CLI: https://github.com/openai/codex
`);
}

/**
 * Append a run record to runs/codex-runs.jsonl.
 * Creates the file and directory on first use.
 */
function logRun(entry) {
  try {
    const runsDir = join(__dir, "runs");
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
    appendFileSync(
      join(runsDir, "codex-runs.jsonl"),
      JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n",
      "utf-8",
    );
  } catch (err) {
    console.error(`Warning: could not write run log — ${err.message}`);
  }
}

/**
 * Cache a constructed prompt to .agents/cache/{command}-{ts}.md.
 * Returns the path so it can be shown to the user.
 */
function cachePrompt(command, prompt) {
  const cacheDir = join(__dir, ".agents", "cache");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const cachePath = join(cacheDir, `${command}-${ts}.md`);
  writeFileSync(cachePath, prompt, "utf-8");
  return cachePath;
}

/**
 * Read and prepare a prompt from an agent file.
 * Strips YAML frontmatter, substitutes $ARGUMENTS safely.
 */
function buildPrompt(agentFile, rawArgs) {
  const raw = readFileSync(agentFile, "utf-8").replace(/^---[\s\S]*?---\n?/, "").trim();

  if (!rawArgs) {
    // Remove $ARGUMENTS and any trailing whitespace left behind
    return raw.replace(/\$ARGUMENTS/g, "").replace(/[ \t]+\n/g, "\n").trim();
  }

  // Block characters that would corrupt the markdown prompt structure.
  // Backticks can close code fences; "---" can be mis-parsed as YAML front-matter.
  if (rawArgs.includes("`") || rawArgs.includes("---")) {
    process.stderr.write(
      `Error: argument contains characters that may corrupt the prompt (\` or ---). ` +
      `Save your input to a file and pass the path instead.\n`,
    );
    process.exit(1);
  }

  return raw.replace(/\$ARGUMENTS/g, rawArgs);
}

// ── Main ─────────────────────────────────────────────────────────────────

const [, , mode, ...rest] = process.argv;
// Join with a space but preserve multi-word quoted args passed by the shell
const extraArgs = rest.join(" ").trim();

if (mode === "--help" || mode === "-h") {
  printUsage();
  process.exit(0);
}

// Warn if args are passed to a no-argument command
if (mode && NO_ARGS_MODES.has(mode) && extraArgs) {
  process.stderr.write(
    `Warning: "${mode}" takes no arguments — ignoring "${extraArgs}"\n`,
  );
}

// No command → show the interactive career-ops menu via the main router agent
if (!mode) {
  const routerFile = join(__dir, ".agents", "career-ops.md");
  const routerPrompt = buildPrompt(routerFile, "");

  console.log("career-ops -- Command Center\n");

  const result = spawnSync("codex", [routerPrompt], { stdio: "inherit", encoding: "utf-8" });
  logRun({ command: "(menu)", args: "", status: result.error ? "fallback" : "launched" });

  if (result.error?.code === "ENOENT") {
    console.log(`Available commands:
  node codex-runner.mjs scan
  node codex-runner.mjs evaluate "URL or JD text"
  node codex-runner.mjs pdf
  node codex-runner.mjs pipeline
  node codex-runner.mjs tracker
  node codex-runner.mjs patterns
  node codex-runner.mjs followup
  node codex-runner.mjs --help   (full list)

Install the Codex CLI to run these automatically: https://github.com/openai/codex`);
  }
  process.exit(result.status ?? 0);
}

// Resolve the agent file: known mode → specific file, else main router
const agentFile = MODES.includes(mode)
  ? join(__dir, ".agents", `career-ops-${mode}.md`)
  : join(__dir, ".agents", "career-ops.md");

if (!existsSync(agentFile)) {
  console.error(`Error: agent file not found — ${agentFile}`);
  console.error(`Run "node codex-runner.mjs --help" to see available commands.`);
  logRun({ command: mode, args: extraArgs, status: "error", reason: "agent file not found" });
  process.exit(1);
}

const prompt = buildPrompt(agentFile, NO_ARGS_MODES.has(mode) ? "" : extraArgs);

// Attempt to invoke the Codex CLI
const result = spawnSync("codex", [prompt], {
  stdio: "inherit",
  encoding: "utf-8",
});

if (result.error?.code === "ENOENT") {
  // Codex CLI not found — cache the prompt and tell the user exactly where it is
  const cachePath = cachePrompt(mode, prompt);
  const relCache = cachePath.replace(__dir + "/", "");

  logRun({ command: mode, args: extraArgs, status: "fallback", cache: relCache });

  console.error("Codex CLI not found in PATH.\n");
  console.log(`Prompt cached to: ${relCache}\n`);
  console.log("Open that file and paste its contents into your Codex session, or:\n");
  console.log("─".repeat(72));
  console.log(prompt);
  console.log("─".repeat(72));
  console.log("\nInstall the Codex CLI: https://github.com/openai/codex");
  process.exit(0);
}

logRun({ command: mode, args: extraArgs, status: result.status === 0 ? "ok" : "error", exitCode: result.status });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
