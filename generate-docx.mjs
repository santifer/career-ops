#!/usr/bin/env node
/**
 * generate-docx.mjs — editable Word (.docx) export via pandoc.
 *
 * Companion to generate-pdf.mjs: the PDF is the submission/ATS artifact, the
 * .docx is a hand-editable copy so you can tweak wording before sending.
 * Converts a generated CV (HTML) or a cover letter (txt/md) into .docx.
 *
 * Requires: pandoc (https://pandoc.org)  ->  brew install pandoc  /  apt install pandoc
 *
 * Usage:
 *   node generate-docx.mjs <input.html|.txt|.md> <output.docx> [--reference-doc=ref.docx]
 */
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { extname } from "path";

const PANDOC = ["pandoc", "/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc", "/usr/bin/pandoc"]
  .find((p) => { try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true; } catch { return false; } });
if (!PANDOC) { console.error("pandoc not found. Install: brew install pandoc (macOS) / apt install pandoc (Linux)"); process.exit(1); }

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const [input, output] = positional;
const refDoc = (argv.find((a) => a.startsWith("--reference-doc=")) || "").split("=")[1];
if (!input || !output) { console.error("Usage: node generate-docx.mjs <input.html|.txt|.md> <output.docx> [--reference-doc=ref.docx]"); process.exit(1); }
if (!existsSync(input)) { console.error("input not found: " + input); process.exit(1); }

const ext = extname(input).toLowerCase();
const from = ext === ".html" || ext === ".htm" ? "html" : "markdown";
const pandocArgs = [input, "-f", from, "-t", "docx", "-o", output];
if (refDoc && existsSync(refDoc)) pandocArgs.push("--reference-doc=" + refDoc);

try {
  execFileSync(PANDOC, pandocArgs, { stdio: ["ignore", "ignore", "inherit"] });
  console.log("DOCX generated: " + output);
} catch (e) { console.error("pandoc failed: " + (e.message || e)); process.exit(1); }
