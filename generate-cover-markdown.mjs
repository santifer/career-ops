#!/usr/bin/env node
/**
 * generate-cover-markdown.mjs — Renders a cover-letter payload to clean Markdown.
 *
 * The payload is the single source of truth (same shape as generate-cover-letter.mjs).
 * Markdown is a first-class output: a recruiter/ATS-friendly plain version, the
 * input to the DOCX renderer (via pandoc), and a paste-ready copy for rich-text
 * boxes (CKEditor, Seek). It is NOT round-tripped back into a payload — edit the
 * payload (or re-run /career-ops cover) and re-render rather than parsing the .md.
 *
 * `buildMarkdown` is exported as a pure function so it can be tested without I/O.
 *
 * Usage:
 *   node generate-cover-markdown.mjs --payload payload.json [--out output/slug-cover.md]
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, basename, join } from "path";
import { pathToFileURL } from "url";
import { parseArgs } from "util";

const OUTPUT_ROOT = resolve("output");

function safeOutputPath(raw) {
  const filename = basename(raw).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.{2,}/g, "-");
  return join(OUTPUT_ROOT, filename);
}

function _require(obj, keys, context) {
  for (const key of keys) {
    if (!obj || typeof obj !== "object" || !(key in obj)) {
      throw new Error(`Missing required field: ${context}.${key}`);
    }
  }
}

function clean(text) {
  // Plain, human prose: collapse whitespace, drop em/en dashes (Lesson 18).
  return String(text ?? "")
    .replace(/[\u2013\u2014]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function contactLine(candidate) {
  const parts = [];
  if (candidate.location) parts.push(clean(candidate.location));
  if (candidate.email) parts.push(clean(candidate.email));
  if (candidate.phone) parts.push(clean(candidate.phone));
  if (candidate.linkedin) parts.push(clean(candidate.linkedin));
  if (candidate.github) parts.push(clean(candidate.github));
  return parts.join(" | ");
}

function datelineParts(letter) {
  return [letter.company, letter.city, letter.date].filter(Boolean).map(clean).join("  ");
}

/**
 * Render a cover-letter payload to Markdown.
 * @param {object} payload — { candidate, letter }
 * @returns {string}
 */
export function buildMarkdown(payload) {
  _require(payload, ["candidate", "letter"], "payload");
  const candidate = payload.candidate;
  const letter = payload.letter;
  _require(candidate, ["name"], "candidate");
  _require(letter, ["role_title", "opening", "profile_intro"], "letter");

  const lines = [];

  lines.push(`# ${clean(candidate.name)}`);
  const contact = contactLine(candidate);
  if (contact) lines.push("", contact);
  const credentials = (candidate.credentials || []).map(clean).filter(Boolean);
  if (credentials.length) lines.push("", credentials.join(" | "));

  lines.push("", "---", "");

  lines.push(`**Cover Letter: ${clean(letter.role_title)}**`);
  const dateline = datelineParts(letter);
  if (dateline) lines.push("", dateline);

  lines.push("");

  if (letter.greeting) lines.push(clean(letter.greeting), "");

  lines.push(clean(letter.opening), "");
  lines.push(clean(letter.profile_intro), "");

  const achievements = letter.achievements || [];
  if (achievements.length) {
    for (const ach of achievements) {
      const lead = clean(ach.lead || "");
      const impact = clean(ach.impact || "");
      lines.push(`- **${lead},** ${impact}`);
    }
    lines.push("");
  }

  if (letter.problems_section) lines.push(clean(letter.problems_section), "");
  if (letter.closing) lines.push(clean(letter.closing), "");
  if (letter.language_closing) lines.push(`*${clean(letter.language_closing)}*`, "");

  const footnotes = letter.footnotes || [];
  if (footnotes.length) {
    lines.push("---", "");
    for (const fn of footnotes) {
      if (typeof fn === "object" && fn !== null) {
        const marker = clean(fn.marker || "");
        const text = clean(fn.text || "");
        const url = fn.url ? ` ${clean(fn.url)}` : "";
        lines.push(`${marker} ${text}${url}`.trim());
      } else {
        lines.push(clean(fn));
      }
    }
    lines.push("");
  }

  // Collapse 3+ blank lines to a single blank line, ensure trailing newline.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      payload: { type: "string" },
      out:     { type: "string" },
      help:    { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (args.help || !args.payload) {
    console.log(`
Usage:
  node generate-cover-markdown.mjs --payload payload.json [--out output/path.md]

  --payload   Path to the JSON payload file (required)
  --out       Override output path (optional)
`);
    process.exit(args.help ? 0 : 1);
  }

  const payloadPath = resolve(args.payload);
  if (!existsSync(payloadPath)) {
    console.error(`ERROR: payload file not found: ${payloadPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(payloadPath, "utf-8"));

  let outPath;
  if (args.out) {
    outPath = safeOutputPath(args.out);
  } else if (payload.output_path) {
    outPath = safeOutputPath(payload.output_path.replace(/\.pdf$/i, ".md"));
  } else {
    const company = (payload.letter?.company || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const role    = (payload.letter?.role_title || "role").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
    outPath = join(OUTPUT_ROOT, `${company}-${role}-cover.md`);
  }

  if (!existsSync(OUTPUT_ROOT)) mkdirSync(OUTPUT_ROOT, { recursive: true });

  try {
    const md = buildMarkdown(payload);
    writeFileSync(outPath, md, "utf-8");
    console.log(`\nCover letter Markdown: ${outPath}`);
  } catch (err) {
    console.error("ERROR generating cover letter Markdown:");
    console.error(err.message);
    process.exit(1);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
