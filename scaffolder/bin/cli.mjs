#!/usr/bin/env node
// career-ops scaffolder — one-command install.
// Clones the repo at the latest release tag, installs deps, and scaffolds
// user config without ever touching files that already exist.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, copyFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const REPO = "https://github.com/santifer/career-ops.git";
const LATEST_RELEASE = "https://api.github.com/repos/santifer/career-ops/releases/latest";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const USAGE = `career-ops — set up an AI job search workspace.

Usage:
  npx career-ops init [folder]    Create a new workspace (default: ./career-ops)

After setup, open Claude Code inside the folder and paste a job offer.
Docs: https://github.com/santifer/career-ops`;

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function has(cmd, arg = "--version") {
  try {
    execFileSync(cmd, [arg], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function latestTag() {
  try {
    const res = await fetch(LATEST_RELEASE, {
      headers: { "User-Agent": "career-ops-cli", Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.tag_name || null;
  } catch {
    return null;
  }
}

// Copy `from` -> `to` only if `to` doesn't already exist. Returns true if created.
function copyIfMissing(dir, from, to) {
  const dest = join(dir, to);
  const src = join(dir, from);
  if (existsSync(dest) || !existsSync(src)) return false;
  copyFileSync(src, dest);
  return true;
}

async function main() {
  const [cmd, dirArg] = process.argv.slice(2);

  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }
  if (cmd !== "init") die(`Unknown command "${cmd}".\n${USAGE}`);

  const target = dirArg || "career-ops";
  if (existsSync(target) && readdirSync(target).length > 0) {
    die(`Target folder "${target}" already exists and is not empty. Pick another name.`);
  }
  if (!has("git")) die("git is required but was not found on PATH. Install git and try again.");

  // Pretty path for messages: "./career-ops" for relative, as-is for absolute.
  const isAbsolute = target.startsWith("/") || /^[A-Za-z]:/.test(target);
  const display = isAbsolute ? target : `./${target}`;

  // 1. Clone at the latest stable release (fall back to the default branch).
  const tag = await latestTag();
  console.log(`\n→ Cloning career-ops${tag ? ` @ ${tag}` : ""} into ${display} ...`);
  const cloneArgs = ["clone", "--depth=1"];
  if (tag) cloneArgs.push("--branch", tag);
  cloneArgs.push(REPO, target);
  try {
    execFileSync("git", cloneArgs, { stdio: "inherit" });
  } catch {
    die("git clone failed. Check your network connection and try again.");
  }

  // 2. Install dependencies.
  console.log("\n→ Installing dependencies (npm install) ...");
  try {
    execFileSync(NPM, ["install"], { cwd: target, stdio: "inherit" });
  } catch {
    console.warn('\n! npm install failed — you can re-run it manually later with "npm install".');
  }

  // 3. Scaffold user config — idempotent, never overwrites the user layer.
  if (!existsSync(join(target, "config"))) mkdirSync(join(target, "config"), { recursive: true });
  const created = [];
  if (copyIfMissing(target, "config/profile.example.yml", "config/profile.yml")) created.push("config/profile.yml");
  if (copyIfMissing(target, "templates/portals.example.yml", "portals.yml")) created.push("portals.yml");
  const cv = join(target, "cv.md");
  if (!existsSync(cv)) {
    writeFileSync(
      cv,
      "# Your Name\n\n> Replace this file with your full CV in markdown.\n> It's the source of truth for all evaluations and generated PDFs.\n> See docs/SETUP.md for details.\n"
    );
    created.push("cv.md");
  }

  // 4. Next steps.
  console.log(`\n✓ career-ops is ready in ${display}\n`);
  if (created.length) console.log(`  Created: ${created.join(", ")}\n`);
  console.log("Next steps:");
  console.log(`  1. cd ${target}`);
  console.log("  2. Edit config/profile.yml (your details) and cv.md (your CV)");
  console.log("  3. Edit portals.yml with your target roles and companies");
  console.log("  4. Open Claude Code here:  claude");
  console.log("\nOptional (for PDF generation):");
  console.log("  npx playwright install chromium\n");
}

main().catch((err) => die(err?.message || String(err)));
