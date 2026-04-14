#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODES = {
  fake: {
    label: "fake",
    env: {
      CAREER_OPS_BRIDGE_MODE: "fake",
    },
  },
  "real-claude": {
    label: "real / claude",
    env: {
      CAREER_OPS_BRIDGE_MODE: "real",
      CAREER_OPS_REAL_EXECUTOR: "claude",
    },
  },
  "real-codex": {
    label: "real / codex",
    env: {
      CAREER_OPS_BRIDGE_MODE: "real",
      CAREER_OPS_REAL_EXECUTOR: "codex",
    },
  },
  sdk: {
    label: "sdk",
    env: {
      CAREER_OPS_BRIDGE_MODE: "sdk",
    },
  },
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.log(`Usage: node scripts/bridge-start.mjs <mode> [--dry-run]

Modes:
  fake
  real-claude
  real-codex
  sdk`);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const modeArg = args.find((arg) => !arg.startsWith("--"));

if (!modeArg || !(modeArg in MODES)) {
  usage();
  process.exit(modeArg ? 1 : 0);
}

const mode = MODES[modeArg];
const env = {
  ...process.env,
  ...mode.env,
};
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = ["--prefix", "bridge", "run", "start"];

if (dryRun) {
  console.log(`Mode: ${mode.label}`);
  console.log(`Command: ${npmBin} ${npmArgs.join(" ")}`);
  console.log("Env:");
  for (const [key, value] of Object.entries(mode.env)) {
    console.log(`  ${key}=${value}`);
  }
  process.exit(0);
}

const child = spawn(npmBin, npmArgs, {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
