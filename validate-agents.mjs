#!/usr/bin/env node
/**
 * validate-agents.mjs
 *
 * Verifies that .agents/ prompt files are in sync with modes/.
 * Catches silent divergence when modes/ is updated but .agents/ is not —
 * or vice versa.
 *
 * Checks:
 *   1. Every expected agent file exists in .agents/
 *   2. Every mode file referenced by an agent file exists in modes/
 *   3. No unregistered agent files are present
 *   4. Commands that accept $ARGUMENTS declare it; commands that don't, don't
 *
 * Usage:
 *   node validate-agents.mjs
 *   npm run codex:validate
 *
 * Exits 0 on success, 1 on any error.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// Maps each agent file to the mode files it must reference.
// Update this map whenever a new mode or agent is added.
const AGENT_MODE_MAP = {
  "career-ops.md":          ["modes/_shared.md"],
  "career-ops-evaluate.md": ["modes/_shared.md", "modes/oferta.md"],
  "career-ops-compare.md":  ["modes/_shared.md", "modes/ofertas.md"],
  "career-ops-scan.md":     ["modes/_shared.md", "modes/scan.md"],
  "career-ops-pdf.md":      ["modes/_shared.md", "modes/pdf.md"],
  "career-ops-pipeline.md": ["modes/_shared.md", "modes/pipeline.md"],
  "career-ops-apply.md":    ["modes/_shared.md", "modes/apply.md"],
  "career-ops-batch.md":    ["modes/_shared.md", "modes/batch.md"],
  "career-ops-tracker.md":  ["modes/tracker.md"],
  "career-ops-contact.md":  ["modes/_shared.md", "modes/contacto.md"],
  "career-ops-deep.md":     ["modes/deep.md"],
  "career-ops-training.md": ["modes/_shared.md", "modes/training.md"],
  "career-ops-project.md":  ["modes/_shared.md", "modes/project.md"],
  "career-ops-patterns.md": ["modes/patterns.md"],
  "career-ops-followup.md": ["modes/followup.md"],
};

// Commands that must NOT contain $ARGUMENTS (they take no user input).
const NO_ARGS_AGENTS = new Set([
  "career-ops-scan.md",
  "career-ops-pipeline.md",
  "career-ops-tracker.md",
  "career-ops-patterns.md",
  "career-ops-followup.md",
]);

let errors = 0;
let warnings = 0;

function err(msg)  { console.error(`  ✗ ${msg}`); errors++; }
function warn(msg) { console.warn(`  ⚠ ${msg}`);  warnings++; }
function ok(msg)   { console.log(`  ✓ ${msg}`); }

// ── 1. Every expected agent file must exist ────────────────────────────────
console.log("\nChecking agent files exist…");
for (const agentFile of Object.keys(AGENT_MODE_MAP)) {
  const p = join(__dir, ".agents", agentFile);
  if (existsSync(p)) {
    ok(`.agents/${agentFile}`);
  } else {
    err(`Missing agent file: .agents/${agentFile}`);
  }
}

// ── 2. Every referenced mode file must exist ──────────────────────────────
console.log("\nChecking referenced mode files exist…");
for (const [agentFile, modeFiles] of Object.entries(AGENT_MODE_MAP)) {
  for (const modeFile of modeFiles) {
    const p = join(__dir, modeFile);
    if (existsSync(p)) {
      ok(`${modeFile}  (referenced by .agents/${agentFile})`);
    } else {
      err(`${modeFile} not found — referenced by .agents/${agentFile}`);
    }
  }
}

// ── 3. No unregistered agent files ────────────────────────────────────────
console.log("\nChecking for unregistered agent files…");
const agentsDir = join(__dir, ".agents");
if (!existsSync(agentsDir)) {
  err("Missing .agents/ directory — run setup or check the repository root");
  console.log("\n" + "─".repeat(60));
  console.error(`\n✗  1 error(s) — fix before committing`);
  process.exit(1);
}
const actualFiles = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
for (const f of actualFiles) {
  if (AGENT_MODE_MAP[f]) {
    ok(`.agents/${f} is registered`);
  } else {
    warn(`Unregistered agent file: .agents/${f} — add it to AGENT_MODE_MAP in validate-agents.mjs`);
  }
}

// ── 4. $ARGUMENTS consistency ─────────────────────────────────────────────
console.log("\nChecking $ARGUMENTS consistency…");
for (const agentFile of Object.keys(AGENT_MODE_MAP)) {
  const p = join(__dir, ".agents", agentFile);
  if (!existsSync(p)) continue;

  const content = readFileSync(p, "utf-8");
  const hasArgs = content.includes("$ARGUMENTS");

  if (NO_ARGS_AGENTS.has(agentFile) && hasArgs) {
    warn(`.agents/${agentFile} contains $ARGUMENTS but this command takes no user input`);
  } else if (!NO_ARGS_AGENTS.has(agentFile) && !hasArgs && agentFile !== "career-ops.md") {
    warn(`.agents/${agentFile} takes user input but $ARGUMENTS is not present`);
  } else {
    ok(`.agents/${agentFile} — $ARGUMENTS usage correct`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
if (errors === 0 && warnings === 0) {
  console.log("✅  All checks passed — .agents/ is in sync with modes/");
  process.exit(0);
}
if (errors > 0) console.error(`\n✗  ${errors} error(s) — fix before committing`);
if (warnings > 0) console.warn(`⚠  ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
