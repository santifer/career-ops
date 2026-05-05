#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname);

const MENU = `career-ops -- Codex Command Center

Available commands:
  npm run codex -- {JD or URL}   -> AUTO-PIPELINE: evaluate + report + PDF + tracker
  npm run codex -- pipeline      -> Process pending URLs from data/pipeline.md
  npm run codex -- evaluate      -> Evaluation only (oferta mode)
  npm run codex -- compare       -> Compare and rank multiple offers
  npm run codex -- contact       -> LinkedIn outreach draft
  npm run codex -- deep          -> Deep company research
  npm run codex -- pdf           -> Generate ATS-optimized CV PDF
  npm run codex -- latex         -> Export CV as LaTeX/Overleaf .tex
  npm run codex -- training      -> Evaluate course/cert against goals
  npm run codex -- project       -> Evaluate portfolio project idea
  npm run codex -- tracker       -> Application status overview
  npm run codex -- apply         -> Live application assistant
  npm run codex -- scan          -> Scan portals and discover new offers
  npm run codex -- batch         -> Batch processing guidance
  npm run codex -- patterns      -> Analyze rejection patterns
  npm run codex -- followup      -> Follow-up cadence tracker
  npm run codex -- interview-prep -> Interview prep from prior reports

Options:
  --file <path>      Append a JD/context file to the prompt
  --print-prompt     Print the resolved Codex prompt without running Codex
  -h, --help         Show this menu
`;

const MODE_CONFIG = {
  "auto-pipeline": {
    modeFile: "auto-pipeline.md",
    shared: true,
    description: "full auto-pipeline from JD text or URL",
  },
  oferta: {
    modeFile: "oferta.md",
    shared: true,
    description: "single job evaluation",
  },
  ofertas: {
    modeFile: "ofertas.md",
    shared: true,
    description: "multi-offer comparison",
  },
  contacto: {
    modeFile: "contacto.md",
    shared: true,
    description: "LinkedIn outreach",
  },
  deep: {
    modeFile: "deep.md",
    shared: false,
    description: "deep company research",
  },
  pdf: {
    modeFile: "pdf.md",
    shared: true,
    description: "ATS PDF generation",
  },
  latex: {
    modeFile: "latex.md",
    shared: true,
    description: "LaTeX CV export",
  },
  training: {
    modeFile: "training.md",
    shared: false,
    description: "training or certification review",
  },
  project: {
    modeFile: "project.md",
    shared: false,
    description: "portfolio project evaluation",
  },
  tracker: {
    modeFile: "tracker.md",
    shared: false,
    description: "application tracker status",
  },
  pipeline: {
    modeFile: "pipeline.md",
    shared: true,
    description: "pipeline inbox processing",
  },
  apply: {
    modeFile: "apply.md",
    shared: true,
    description: "live application assistant",
  },
  scan: {
    modeFile: "scan.md",
    shared: true,
    description: "portal scanning",
  },
  batch: {
    modeFile: "batch.md",
    shared: true,
    description: "batch processing",
  },
  patterns: {
    modeFile: "patterns.md",
    shared: false,
    description: "rejection pattern analysis",
  },
  followup: {
    modeFile: "followup.md",
    shared: false,
    description: "follow-up cadence tracking",
  },
  "interview-prep": {
    modeFile: "interview-prep.md",
    shared: false,
    description: "interview prep",
  },
};

const ALIASES = {
  evaluate: "oferta",
  eval: "oferta",
  offer: "oferta",
  compare: "ofertas",
  contact: "contacto",
  outreach: "contacto",
  "follow-up": "followup",
  followups: "followup",
  "interview": "interview-prep",
};

function parseArgs(argv) {
  const options = {
    printPrompt: false,
    files: [],
    help: false,
    positionals: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--print-prompt") {
      options.printPrompt = true;
    } else if (arg === "--file") {
      const file = argv[i + 1];
      if (!file) {
        fail("--file requires a path");
      }
      options.files.push(file);
      i += 1;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else {
      options.positionals.push(arg);
    }
  }

  return options;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  console.error("");
  console.error(MENU);
  process.exit(1);
}

function readRequired(relativePath) {
  const absolutePath = resolve(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`Required file not found: ${relativePath}`);
  }
  return readFileSync(absolutePath, "utf8").trimEnd();
}

function looksLikeJobInput(text) {
  return /https?:\/\//i.test(text)
    || /\b(responsibilities|requirements|qualifications|about the role|we'?re looking for|job description|apply now)\b/i.test(text);
}

function resolveMode(positionals, files) {
  if (positionals.length === 0 && files.length === 0) {
    return { mode: "discovery", request: "" };
  }

  const first = positionals[0] || "";
  const normalizedFirst = ALIASES[first.toLowerCase()] || first.toLowerCase();
  if (MODE_CONFIG[normalizedFirst]) {
    return {
      mode: normalizedFirst,
      request: positionals.slice(1).join(" ").trim(),
    };
  }

  const request = positionals.join(" ").trim();
  if (request === "" || looksLikeJobInput(request) || files.length > 0) {
    return { mode: "auto-pipeline", request };
  }

  return { mode: "discovery", request };
}

function section(title, body) {
  return `## ${title}\n\n${body}`;
}

function buildPrompt(mode, request, files) {
  if (mode === "discovery") {
    return [
      "You are Career-Ops running under Codex CLI.",
      "",
      "Show the user this command menu and ask what they want to do next:",
      "",
      "```",
      MENU.trimEnd(),
      "```",
      "",
      request ? `User text that did not match a known mode or JD:\n${request}` : "",
    ].filter(Boolean).join("\n");
  }

  const config = MODE_CONFIG[mode];
  const contextSections = [
    section("AGENTS.md", readRequired("AGENTS.md")),
    section("CLAUDE.md", readRequired("CLAUDE.md")),
  ];

  if (config.shared) {
    contextSections.push(section("modes/_shared.md", readRequired("modes/_shared.md")));
  }
  contextSections.push(section(`modes/${config.modeFile}`, readRequired(`modes/${config.modeFile}`)));

  const optionalContext = filesToReadForMode(mode)
    .map((relativePath) => `- ${relativePath}${existsSync(resolve(ROOT, relativePath)) ? "" : " (missing; follow onboarding/setup rules if needed)"}`)
    .join("\n");

  const fileSections = files.map((filePath) => {
    const absolutePath = resolve(ROOT, filePath);
    if (!existsSync(absolutePath)) {
      fail(`Context file not found: ${filePath}`);
    }
    return section(`User context file: ${filePath}`, readFileSync(absolutePath, "utf8").trimEnd());
  });

  return [
    "You are Career-Ops running under Codex CLI.",
    "",
    `Resolved mode: ${mode} (${config.description})`,
    "",
    "Execution rules:",
    "- Reuse the existing Career-Ops modes, scripts, templates, reports, output, and tracker flow.",
    "- Do not create parallel scoring, CV, or tracker logic.",
    "- Store user-specific customization only in the user layer described by the data contract.",
    "- Never submit an application for the user.",
    "- If live job verification is needed and browser tooling is available, prefer it over generic fetch.",
    "- For tracker additions, use the TSV addition flow and merge script instead of directly adding new rows to data/applications.md.",
    "",
    "User request:",
    request || "(No extra arguments provided.)",
    "",
    ...fileSections,
    "Additional files Codex should read if needed for this mode:",
    optionalContext || "- None",
    "",
    ...contextSections,
    "",
    `Now execute ${mode} mode exactly as defined by the loaded Career-Ops context.`,
  ].join("\n");
}

function runCodex(prompt) {
  const result = spawnSync("codex", ["exec", "-C", ROOT, "-"], {
    input: prompt,
    stdio: ["pipe", "inherit", "inherit"],
    cwd: ROOT,
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      fail("'codex' CLI not found in PATH. Install and authenticate Codex CLI, then retry.");
    }
    fail(result.error.message);
  }

  process.exit(result.status ?? 1);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(MENU);
  process.exit(0);
}

const { mode, request } = resolveMode(options.positionals, options.files);
if (mode === "discovery" && !options.printPrompt) {
  console.log(MENU);
  process.exit(0);
}

const prompt = buildPrompt(mode, request, options.files);
if (options.printPrompt) {
  console.log(prompt);
  process.exit(0);
}

runCodex(prompt);

function filesToReadForMode(mode) {
  const common = ["cv.md", "config/profile.yml", "modes/_profile.md"];
  const digest = "article-digest.md";

  const byMode = {
    "auto-pipeline": [...common, digest, "portals.yml", "data/applications.md"],
    oferta: [...common, digest, "data/applications.md"],
    ofertas: [...common],
    contacto: [...common],
    deep: ["modes/_profile.md"],
    pdf: [...common, digest, "templates/cv-template.html"],
    latex: [...common, digest, "templates/cv-template.tex"],
    training: common,
    project: common,
    tracker: ["modes/tracker.md", "data/applications.md"],
    pipeline: [...common, digest, "data/pipeline.md"],
    apply: [...common, digest],
    scan: ["portals.yml", "modes/_profile.md", "data/scan-history.tsv"],
    batch: [...common, "batch/batch-input.tsv", "batch/batch-prompt.md"],
    patterns: ["modes/patterns.md", "data/applications.md"],
    followup: ["modes/followup.md", "data/applications.md", "data/follow-ups.md"],
    "interview-prep": [...common, "interview-prep/story-bank.md"],
  };

  return byMode[mode] || common;
}
