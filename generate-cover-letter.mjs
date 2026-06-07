#!/usr/bin/env node
/**
 * generate-cover-letter.mjs — Node wrapper for cover-letter.py
 *
 * Usage:
 *   node generate-cover-letter.mjs --payload payload.json
 *   node generate-cover-letter.mjs --payload payload.json --out output/slug-cover.pdf
 *
 * The payload JSON must match the schema expected by cover-letter.py.
 * If --out is provided it overrides payload.output_path.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { parseArgs } from "util";

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
  node generate-cover-letter.mjs --payload payload.json [--out output/path.pdf]

  --payload   Path to the JSON payload file (required)
  --out       Override output path from payload (optional)
`);
  process.exit(args.help ? 0 : 1);
}

const payloadPath = resolve(args.payload);
if (!existsSync(payloadPath)) {
  console.error(`ERROR: payload file not found: ${payloadPath}`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(payloadPath, "utf-8"));

if (args.out) {
  payload.output_path = args.out;
}

if (!payload.output_path) {
  const company = (payload.letter?.company || "company").toLowerCase().replace(/\s+/g, "-");
  const role    = (payload.letter?.role_title || "role").toLowerCase().replace(/\s+/g, "-").slice(0, 30);
  payload.output_path = `output/${company}-${role}-cover.pdf`;
}

// Write back any override so cover-letter.py sees the correct path
writeFileSync(payloadPath, JSON.stringify(payload, null, 2));

const outDir = dirname(resolve(payload.output_path));
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const scriptDir = dirname(new URL(import.meta.url).pathname);
const pyScript  = resolve(scriptDir, "cover-letter.py");

if (!existsSync(pyScript)) {
  console.error(`ERROR: cover-letter.py not found at ${pyScript}`);
  process.exit(1);
}

try {
  const result = execSync(`python3 "${pyScript}" "${payloadPath}"`, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log(result.trim());
  console.log(`\nCover letter PDF: ${payload.output_path}`);
} catch (err) {
  console.error("ERROR generating cover letter PDF:");
  console.error(err.stderr || err.message);
  process.exit(1);
}
