#!/usr/bin/env node
/**
 * generate-cover-formats.mjs — One approved cover letter, many renderings.
 *
 * Takes the canonical payload JSON (the single source of truth) and emits any
 * subset of:
 *   • md   — clean Markdown (paste boxes, DOCX source, editable copy)
 *   • pdf  — polished HTML template (the human format: direct email, hiring managers)
 *   • docx — Word document (the machine format: most reliable ATS parsing)
 *
 * All renderings derive from the same payload, so there is exactly one place the
 * letter's content lives — no duplicated writing logic. It also writes a copy of
 * the canonical payload next to the outputs ({base}.payload.json) so the approved
 * letter can always be re-rendered.
 *
 * Usage:
 *   node generate-cover-formats.mjs --payload payload.json
 *   node generate-cover-formats.mjs --payload payload.json --formats md,pdf,docx
 *   node generate-cover-formats.mjs --payload payload.json --base output/acme-analyst-cover
 *
 * Default formats: md,pdf,docx (DOCX is skipped with a warning if pandoc is absent).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, basename, join } from "path";
import { pathToFileURL } from "url";
import { parseArgs } from "util";

import { buildMarkdown } from "./generate-cover-markdown.mjs";
import { buildHtml } from "./generate-cover-letter.mjs";
import { generateDocxFromString } from "./generate-docx.mjs";

const OUTPUT_ROOT = resolve("output");
const ALL_FORMATS = ["md", "pdf", "docx"];

function safeBase(raw) {
  const name = basename(raw).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.{2,}/g, "-");
  return join(OUTPUT_ROOT, name);
}

function deriveBase(payload, explicitBase) {
  if (explicitBase) return safeBase(explicitBase);
  if (payload.output_path) return safeBase(payload.output_path);
  const company = (payload.letter?.company || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const role    = (payload.letter?.role_title || "role").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
  return join(OUTPUT_ROOT, `${company}-${role}-cover`);
}

/**
 * Render the requested formats from a payload.
 *
 * @param {object} payload
 * @param {object} [opts]
 * @param {string[]} [opts.formats] — subset of ['md','pdf','docx']
 * @param {string}  [opts.base]     — output base path (no extension)
 * @returns {Promise<{ base: string, written: object, skipped: object }>}
 */
export async function generateCoverFormats(payload, opts = {}) {
  const formats = (opts.formats && opts.formats.length ? opts.formats : ALL_FORMATS)
    .map((f) => f.toLowerCase())
    .filter((f) => ALL_FORMATS.includes(f));

  const base = deriveBase(payload, opts.base);
  if (!existsSync(OUTPUT_ROOT)) mkdirSync(OUTPUT_ROOT, { recursive: true });

  const written = {};
  const skipped = {};

  // Always persist the canonical payload alongside the outputs.
  const payloadPath = `${base}.payload.json`;
  writeFileSync(payloadPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  written.payload = payloadPath;

  // Markdown is the source for DOCX, so build it once if either is requested.
  let markdown = null;
  if (formats.includes("md") || formats.includes("docx")) {
    markdown = buildMarkdown(payload);
  }

  if (formats.includes("md")) {
    const mdPath = `${base}.md`;
    writeFileSync(mdPath, markdown, "utf-8");
    written.md = mdPath;
  }

  // DOCX (the ATS upload format) renders before the browser-dependent PDF so a
  // Playwright/browser hiccup can never block the critical machine format.
  if (formats.includes("docx")) {
    const docxPath = `${base}.docx`;
    try {
      await generateDocxFromString(markdown, resolve(docxPath), {
        title: `Cover Letter — ${payload.candidate?.name || ""}`.trim(),
      });
      written.docx = docxPath;
    } catch (err) {
      // pandoc may be absent — degrade gracefully, the PDF still covers uploads.
      skipped.docx = err.message;
    }
  }

  if (formats.includes("pdf")) {
    const { renderHtmlToPdf } = await import("./generate-pdf.mjs");
    const pdfPath = `${base}.pdf`;
    const html = buildHtml(payload);
    await renderHtmlToPdf(html, resolve(pdfPath), { format: "a4" });
    written.pdf = pdfPath;
  }

  return { base, written, skipped };
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      payload: { type: "string" },
      formats: { type: "string" },
      base:    { type: "string" },
      help:    { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (args.help || !args.payload) {
    console.log(`
Usage:
  node generate-cover-formats.mjs --payload payload.json [--formats md,pdf,docx] [--base output/slug-cover]

  --payload   Path to the canonical JSON payload (required)
  --formats   Comma-separated subset of: md,pdf,docx (default: all)
  --base      Output base path without extension (default: derived from payload)
`);
    process.exit(args.help ? 0 : 1);
  }

  const payloadPath = resolve(args.payload);
  if (!existsSync(payloadPath)) {
    console.error(`ERROR: payload file not found: ${payloadPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(payloadPath, "utf-8"));
  const formats = args.formats ? args.formats.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  try {
    const { written, skipped } = await generateCoverFormats(payload, { formats, base: args.base });
    console.log("\nCover letter rendered:");
    for (const [fmt, path] of Object.entries(written)) {
      console.log(`  ${fmt.padEnd(8)} ${path}`);
    }
    for (const [fmt, reason] of Object.entries(skipped)) {
      console.log(`  ${fmt.padEnd(8)} SKIPPED — ${reason}`);
    }
  } catch (err) {
    console.error("ERROR generating cover letter formats:");
    console.error(err.message);
    process.exit(1);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
