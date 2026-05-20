#!/usr/bin/env node

/**
 * latex-pipeline.mjs — Parse → write → compile (script steps; AI tailors JSON separately)
 *
 * Usage:
 *   node latex-pipeline.mjs <source.tex> [options]
 *
 * Options:
 *   --json <path>       Tailored content JSON (default: parse source, round-trip for testing)
 *   --company <slug>    Output filename slug (default: "tailored")
 *   --outdir <dir>      Output directory (default: ./output)
 *   --skip-compile      Only produce .tex, skip PDF
 *   --skip-parse        Require --json (do not parse source)
 */

import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, basename, join } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    source: null,
    json: null,
    company: 'tailored',
    outdir: 'output',
    skipCompile: false,
    skipParse: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = argv[++i];
    else if (a === '--company') opts.company = argv[++i];
    else if (a === '--outdir') opts.outdir = argv[++i];
    else if (a === '--skip-compile') opts.skipCompile = true;
    else if (a === '--skip-parse') opts.skipParse = true;
    else if (!a.startsWith('--')) positional.push(a);
  }
  opts.source = positional[0];
  return opts;
}

function runNode(script, args) {
  const out = execFileSync('node', [join(ROOT, script), ...args], {
    encoding: 'utf-8',
    cwd: ROOT,
  });
  return JSON.parse(out.trim().split('\n').pop());
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.source) {
    console.error(`Usage: node latex-pipeline.mjs <source.tex> [options]

Options:
  --json <path>       Tailored JSON (default: parse + round-trip)
  --company <slug>    Output name slug
  --outdir <dir>      Output directory
  --skip-compile      Stop after .tex
  --skip-parse        Require --json`);
    process.exit(1);
  }

  const absSource = resolve(opts.source);
  const outDir = resolve(opts.outdir);
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  let jsonPath = opts.json ? resolve(opts.json) : null;

  if (!jsonPath) {
    if (opts.skipParse) {
      console.error('--skip-parse requires --json');
      process.exit(1);
    }
    const parsed = runNode('parse-latex.mjs', [absSource, outDir]);
    jsonPath = parsed.parse_file;
  }

  const outTex = join(outDir, `cv-${opts.company}-${date}.tex`);
  const outPdf = join(outDir, `cv-${opts.company}-${date}.pdf`);

  const written = runNode('write-latex.mjs', [absSource, jsonPath, outTex]);

  const result = {
    status: 'ok',
    source_tex: basename(absSource),
    json_file: jsonPath,
    output_tex: written.output_tex,
    company: opts.company,
  };

  if (!opts.skipCompile) {
    try {
      const compiled = runNode('compile-latex.mjs', [outTex, outPdf]);
      result.output_pdf = compiled.pdf?.path || outPdf;
      result.pdf_size_kb = compiled.pdf?.sizeKB;
      result.engine = compiled.engine;
    } catch (e) {
      result.status = 'partial';
      result.compile_error = e.message;
      result.output_tex = outTex;
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
