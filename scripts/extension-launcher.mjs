#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(repoRoot, "extension/dist");
const docsPath = resolve(repoRoot, "docs/BROWSER_EXTENSION.md");

/**
 * A launcher action may:
 * - start a long-lived command in Terminal
 * - open Finder / Chrome destinations as part of a fuller desktop setup
 */
const PRIMARY_ACTIONS = [
  {
    label: "Desktop launchpad (Codex)",
    description: "Build, start the Codex bridge, reveal dist, and open chrome://extensions.",
    terminalCommand: "npm run ext:start",
    afterOpen: [
      { type: "path", target: distDir },
      { type: "chrome-extensions" },
    ],
  },
  {
    label: "Desktop launchpad (Claude)",
    description: "Build, start the Claude bridge, reveal dist, and open chrome://extensions.",
    terminalCommand: "npm run ext:start:claude",
    afterOpen: [
      { type: "path", target: distDir },
      { type: "chrome-extensions" },
    ],
  },
  {
    label: "Advanced tools…",
    description: "Build-only, bridge-only, and helper actions.",
    kind: "submenu",
  },
];

const ADVANCED_ACTIONS = [
  {
    label: "Build extension",
    terminalCommand: "npm run ext:build",
  },
  {
    label: "Start bridge (Codex)",
    terminalCommand: "npm run ext:bridge",
  },
  {
    label: "Start bridge (Claude)",
    terminalCommand: "npm run ext:bridge:claude",
  },
  {
    label: "Start bridge (Fake)",
    terminalCommand: "npm run ext:bridge:fake",
  },
  {
    label: "Build + start (Codex)",
    terminalCommand: "npm run ext:start",
  },
  {
    label: "Build + start (Claude)",
    terminalCommand: "npm run ext:start:claude",
  },
  {
    label: "Reveal extension/dist",
    afterOpen: [{ type: "path", target: distDir }],
  },
  {
    label: "Open Chrome extensions page",
    afterOpen: [{ type: "chrome-extensions" }],
  },
  {
    label: "Open browser extension guide",
    afterOpen: [{ type: "path", target: docsPath }],
  },
];

const ACTIONS = [...PRIMARY_ACTIONS, ...ADVANCED_ACTIONS];

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function usage() {
  console.log(`Usage: node scripts/extension-launcher.mjs [--list] [--advanced] [--action "<label>"]

macOS:
  Opens a native chooser dialog, then launches the selected workflow in Terminal.
  The default picker only shows the common daily actions.

Other platforms:
  Prints the available actions. Run the matching npm script directly.`);
}

function listActions(actions = PRIMARY_ACTIONS) {
  for (const action of actions) {
    if (action.description) {
      console.log(`- ${action.label}: ${action.description}`);
      continue;
    }
    console.log(`- ${action.label}`);
  }
}

function openTerminal(command) {
  const escapedRepo = shellQuote(repoRoot);
  const escapedCommand = command
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"");
  const script = [
    'tell application "Terminal"',
    "  activate",
    `  do script "cd ${escapedRepo}; ${escapedCommand}"`,
    "end tell",
  ].join("\n");

  execFileSync("osascript", ["-e", script], { stdio: "inherit" });
}

function runOpen(target) {
  execFileSync("open", [target], { stdio: "ignore" });
}

function openChromeExtensions() {
  const chromeCandidates = [
    "Google Chrome",
    "Google Chrome Canary",
    "Chromium",
  ];

  for (const appName of chromeCandidates) {
    try {
      execFileSync("open", ["-a", appName, "chrome://extensions"], {
        stdio: "ignore",
      });
      return;
    } catch {
      // Try next candidate.
    }
  }

  runOpen("chrome://extensions");
}

function runAfterOpen(entry) {
  switch (entry.type) {
    case "path":
      runOpen(entry.target);
      return;
    case "chrome-extensions":
      openChromeExtensions();
      return;
  }
}

function runAction(action) {
  if (action.terminalCommand) {
    openTerminal(action.terminalCommand);
  }

  for (const entry of action.afterOpen ?? []) {
    runAfterOpen(entry);
  }
}

function chooseFromList(actions, prompt, defaultLabel) {
  const actionList = actions.map((action) => `"${action.label.replaceAll("\"", "\\\"")}"`).join(", ");
  const script = [
    `set actionList to {${actionList}}`,
    `set choice to choose from list actionList with prompt "${prompt.replaceAll("\"", "\\\"")}" default items {"${defaultLabel.replaceAll("\"", "\\\"")}"} OK button name "Launch"`,
    "if choice is false then return \"\"",
    "return item 1 of choice",
  ].join("\n");

  return execFileSync("osascript", ["-e", script], {
    encoding: "utf-8",
  }).trim();
}

function choosePrimaryAction() {
  return chooseFromList(
    PRIMARY_ACTIONS,
    "Choose a career-ops extension workflow:",
    "Desktop launchpad (Codex)",
  );
}

function chooseAdvancedAction() {
  return chooseFromList(
    ADVANCED_ACTIONS,
    "Advanced extension tools:",
    "Build extension",
  );
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  usage();
  process.exit(0);
}
if (args.includes("--list")) {
  listActions(args.includes("--advanced") ? ACTIONS : PRIMARY_ACTIONS);
  process.exit(0);
}

const actionIndex = args.indexOf("--action");
let selection = null;
if (actionIndex !== -1) {
  selection = args[actionIndex + 1] ?? null;
}

if (process.platform !== "darwin") {
  console.log("Graphical launcher is currently macOS-only.");
  console.log("Available actions:");
  listActions(args.includes("--advanced") ? ACTIONS : PRIMARY_ACTIONS);
  process.exit(selection ? 1 : 0);
}

if (!selection) {
  selection = choosePrimaryAction();
}

if (selection === "Advanced tools…") {
  selection = chooseAdvancedAction();
}

if (!selection) {
  process.exit(0);
}

const action = ACTIONS.find((item) => item.label === selection);
if (!action) {
  console.error(`Unknown action: ${selection}`);
  process.exit(1);
}

runAction(action);
