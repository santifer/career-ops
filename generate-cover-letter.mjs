#!/usr/bin/env node
/**
 * generate-cover-letter.mjs -- Renders a cover letter payload.
 *
 * Usage:
 *   node generate-cover-letter.mjs --payload payload.json
 *   node generate-cover-letter.mjs --payload payload.json --out output/slug-cover.pdf
 *   node generate-cover-letter.mjs --payload payload.json --format=latex --out output/slug-cover.tex
 *
 * The default format remains HTML-to-PDF through Playwright. The LaTeX format
 * writes a .tex source file only, so users can compile it with their chosen TeX
 * engine and template pack.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, resolve, basename, join, extname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";
import { resolveTemplate } from "./cv-templates.mjs";

const OUTPUT_ROOT = resolve("output");
const FORMATS = new Set(["html", "latex"]);

function safeOutputPath(raw) {
  const filename = basename(raw).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.{2,}/g, "-");
  return join(OUTPUT_ROOT, filename);
}

function withExtension(rawPath, ext) {
  const current = extname(rawPath);
  if (!current) return `${rawPath}.${ext}`;
  return rawPath.slice(0, -current.length) + `.${ext}`;
}

function _require(obj, keys, context) {
  for (const key of keys) {
    if (!obj || typeof obj !== "object" || !(key in obj)) {
      throw new Error(`Missing required field: ${context}.${key}`);
    }
  }
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeLatex(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function sanitizeLatexUrl(value) {
  return String(value || "").replace(/[{}\s]/g, "");
}

function asUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function buildContactLine(candidate) {
  const parts = [];
  if (candidate.location) parts.push(escapeHtml(candidate.location));
  if (candidate.email) {
    const email = escapeHtml(candidate.email);
    parts.push(`<a href="mailto:${email}">${email}</a>`);
  }
  if (candidate.phone) parts.push(escapeHtml(candidate.phone));
  if (candidate.linkedin) parts.push(`<a href="${escapeHtml(asUrl(candidate.linkedin))}">LinkedIn</a>`);
  if (candidate.github) {
    const display = candidate.github.replace(/^https?:\/\//, "");
    parts.push(`<a href="${escapeHtml(asUrl(candidate.github))}">${escapeHtml(display)}</a>`);
  }
  return parts.join(" &nbsp;|&nbsp; ");
}

function buildLatexContactLine(candidate) {
  const parts = [];
  if (candidate.location) parts.push(escapeLatex(candidate.location));
  if (candidate.email) {
    const email = escapeLatex(candidate.email);
    parts.push(`\\href{mailto:${sanitizeLatexUrl(candidate.email)}}{${email}}`);
  }
  if (candidate.phone) parts.push(escapeLatex(candidate.phone));
  if (candidate.linkedin) parts.push(`\\href{${sanitizeLatexUrl(asUrl(candidate.linkedin))}}{LinkedIn}`);
  if (candidate.github) {
    const display = escapeLatex(candidate.github.replace(/^https?:\/\//, ""));
    parts.push(`\\href{${sanitizeLatexUrl(asUrl(candidate.github))}}{${display}}`);
  }
  return parts.join(" $\\vert$ ");
}

function buildCredentialsBlock(candidate) {
  const credentials = candidate.credentials || [];
  if (!credentials.length) return "";
  return `<div class="credentials">${credentials.map(escapeHtml).join(" &nbsp;|&nbsp; ")}</div>`;
}

function buildDateline(letter) {
  const parts = [letter.company, letter.city, letter.date].filter(Boolean).map(escapeHtml);
  return parts.join(" &nbsp;&nbsp; ");
}

function buildAchievementsBlock(achievements) {
  if (!achievements || !achievements.length) return "";
  const items = achievements.map(ach => {
    const lead = escapeHtml(ach.lead || "");
    const impact = escapeHtml(ach.impact || "");
    return `    <li><b>${lead},</b> ${impact}</li>`;
  }).join("\n");
  return `<ul class="achievements">\n${items}\n  </ul>`;
}

function buildLatexAchievements(achievements) {
  if (!achievements || !achievements.length) return "";
  const items = achievements.map(ach => {
    const lead = escapeLatex(ach.lead || "");
    const impact = escapeLatex(ach.impact || "");
    return `\\item \\textbf{${lead},} ${impact}`;
  }).join("\n");
  return `\\begin{itemize}[leftmargin=*,topsep=4pt,itemsep=2pt]\n${items}\n\\end{itemize}`;
}

function buildFootnotesBlock(footnotes) {
  if (!footnotes || !footnotes.length) return "";
  const lines = footnotes.map(fn => {
    if (typeof fn === "object" && fn !== null) {
      const marker = escapeHtml(fn.marker || "");
      const text = escapeHtml(fn.text || "");
      const url = fn.url ? ` <a href="${escapeHtml(fn.url)}">${escapeHtml(fn.url)}</a>` : "";
      return `    <p>${marker} ${text}${url}</p>`;
    }
    return `    <p>${escapeHtml(fn)}</p>`;
  }).join("\n");
  return `<div class="footnotes">\n${lines}\n  </div>`;
}

function validatePayload(payload) {
  _require(payload, ["candidate", "letter"], "payload");
  const candidate = payload.candidate;
  const letter = payload.letter;
  _require(candidate, ["name"], "candidate");
  _require(letter, ["role_title", "opening", "profile_intro"], "letter");
  return { candidate, letter };
}

// Resolve the cover-letter template through the shared resolver so a
// `cover_letter.template` profile default, an explicit `payload.template`, and
// installed template packs are all honored. Any resolver failure (no profile,
// no templates dir, bad config) falls back to the base template, preserving the
// original hardcoded behavior.
export function resolveCoverTemplatePath(payload = {}, opts = {}) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const base = resolve(scriptDir, "templates", "cover-letter-template.html");
  try {
    return resolveTemplate("cover", payload.template, { format: "html", fallback: true, ...opts });
  } catch {
    return base;
  }
}

export function buildHtml(payload, templatePath) {
  const { candidate, letter } = validatePayload(payload);
  const resolvedPath = templatePath || resolveCoverTemplatePath(payload);
  let html = readFileSync(resolvedPath, "utf-8");

  const greetingBlock = letter.greeting ? `<p class="greeting">${escapeHtml(letter.greeting)}</p>` : "";
  const closingBlock = letter.closing ? `<p>${escapeHtml(letter.closing)}</p>` : "";
  const languageClosingBlock = letter.language_closing
    ? `<p class="language-closing">${escapeHtml(letter.language_closing)}</p>`
    : "";
  const problemsBlock = letter.problems_section ? `<p>${escapeHtml(letter.problems_section)}</p>` : "";

  const replacements = {
    "{{NAME}}": escapeHtml(candidate.name),
    "{{CONTACT_LINE}}": buildContactLine(candidate),
    "{{CREDENTIALS_BLOCK}}": buildCredentialsBlock(candidate),
    "{{ROLE_TITLE}}": escapeHtml(letter.role_title),
    "{{DATELINE}}": buildDateline(letter),
    "{{GREETING_BLOCK}}": greetingBlock,
    "{{OPENING}}": escapeHtml(letter.opening),
    "{{PROFILE_INTRO}}": escapeHtml(letter.profile_intro),
    "{{ACHIEVEMENTS_BLOCK}}": buildAchievementsBlock(letter.achievements),
    "{{PROBLEMS_BLOCK}}": problemsBlock,
    "{{CLOSING_BLOCK}}": closingBlock,
    "{{LANGUAGE_CLOSING_BLOCK}}": languageClosingBlock,
    "{{FOOTNOTES_BLOCK}}": buildFootnotesBlock(letter.footnotes),
  };

  return html.replace(/\{\{[A-Z_]+\}\}/g, (token) => replacements[token] ?? token);
}

export function buildLatex(payload) {
  const { candidate, letter } = validatePayload(payload);
  const credentials = (candidate.credentials || []).map(escapeLatex).join(" $\\vert$ ");
  const dateLine = [letter.company, letter.city, letter.date].filter(Boolean).map(escapeLatex).join(" \\quad ");
  const greeting = letter.greeting ? `${escapeLatex(letter.greeting)}\n\n` : "";
  const closing = letter.closing ? `\n\n${escapeLatex(letter.closing)}` : "";
  const languageClosing = letter.language_closing ? `\n\n\\emph{${escapeLatex(letter.language_closing)}}` : "";
  const problems = letter.problems_section ? `\n\n${escapeLatex(letter.problems_section)}` : "";
  const achievements = buildLatexAchievements(letter.achievements);

  return String.raw`\documentclass[11pt]{article}
\usepackage[margin=0.75in]{geometry}
\usepackage[hidelinks]{hyperref}
\usepackage{enumitem}
\usepackage{parskip}
\setlength{\parindent}{0pt}
\pagenumbering{gobble}

\begin{document}

{\Large \textbf{${escapeLatex(candidate.name)}}}\\
${buildLatexContactLine(candidate)}
${credentials ? `\\\\\n${credentials}` : ""}

\vspace{0.45cm}

{\large \textbf{Cover Letter: ${escapeLatex(letter.role_title)}}}\\
${dateLine}

\vspace{0.35cm}

${greeting}${escapeLatex(letter.opening)}

${escapeLatex(letter.profile_intro)}

${achievements}
${problems}${closing}${languageClosing}

\end{document}
`;
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      payload: { type: "string" },
      out:     { type: "string" },
      format:  { type: "string", default: "html" },
      help:    { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (args.help || !args.payload) {
    console.log(`
Usage:
  node generate-cover-letter.mjs --payload payload.json [--out output/path.pdf] [--format=html|latex]

  --payload   Path to the JSON payload file (required)
  --out       Override output path from payload (optional)
  --format    html (default, renders PDF) or latex (writes .tex)
`);
    process.exit(args.help ? 0 : 1);
  }

  if (!FORMATS.has(args.format)) {
    console.error(`ERROR: unsupported format "${args.format}". Use html or latex.`);
    process.exit(1);
  }

  const payloadPath = resolve(args.payload);
  if (!existsSync(payloadPath)) {
    console.error(`ERROR: payload file not found: ${payloadPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(payloadPath, "utf-8").replace(/^\uFEFF/, ""));
  const format = args.format;
  const ext = format === "latex" ? "tex" : "pdf";

  if (args.out) {
    payload.output_path = withExtension(args.out, ext);
  }

  if (!payload.output_path) {
    const company = (payload.letter?.company || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const role = (payload.letter?.role_title || "role").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
    payload.output_path = join(OUTPUT_ROOT, `${company}-${role}-cover.${ext}`);
  } else {
    payload.output_path = safeOutputPath(withExtension(payload.output_path, ext));
  }

  if (!existsSync(OUTPUT_ROOT)) mkdirSync(OUTPUT_ROOT, { recursive: true });

  try {
    const outputPath = resolve(payload.output_path);
    if (format === "latex") {
      writeFileSync(outputPath, buildLatex(payload), "utf-8");
      console.log(`\nCover letter LaTeX: ${payload.output_path}`);
      return;
    }

    const { renderHtmlToPdf } = await import("./generate-pdf.mjs");
    const html = buildHtml(payload);
    await renderHtmlToPdf(html, outputPath, { format: "a4" });
    console.log(`\nCover letter PDF: ${payload.output_path}`);
  } catch (err) {
    console.error("ERROR generating cover letter:");
    console.error(err.message);
    process.exit(1);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
