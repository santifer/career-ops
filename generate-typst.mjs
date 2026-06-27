#!/usr/bin/env node

/**
 * generate-typst.mjs — Validate and compile a filled .typ CV to PDF
 *
 * Usage:
 *   node generate-typst.mjs <input.typ> [output.pdf] [--paper=a4|us-letter]
 *
 * The .typ file is produced by the AI agent from templates/cv-template.typ
 * (style frozen, content swapped per job). This script validates that the
 * frozen structure is intact and that no {{PLACEHOLDER}} slots are left
 * unresolved, then compiles to PDF via the `typst` binary.
 *
 * Requires: typst on PATH (brew install typst).
 */

import { readFile, stat } from 'fs/promises';
import { resolve, basename, dirname, join } from 'path';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

// The frozen template emits these four sections. Count #section[...] blocks
// rather than match titles so a localized CV still validates.
const MIN_SECTIONS = 4;

// Helpers/structure the frozen preamble must keep. If the agent drops one,
// the house style is broken — fail loudly instead of emitting an off-style PDF.
const REQUIRED_TOKENS = [
  '#set page(',
  '#let section(',
  '#let dated-row(',
  '#let bullet(',
  '#let linked-label(',
];

async function main() {
  const positional = [];
  let paper = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--paper=')) paper = arg.split('=')[1].toLowerCase();
    else positional.push(arg);
  }
  const [inputPath, outputPath] = positional;

  if (!inputPath) {
    console.error('Usage: node generate-typst.mjs <input.typ> [output.pdf] [--paper=a4|us-letter]');
    process.exit(1);
  }

  const absPath = resolve(inputPath);
  let content;
  try {
    content = await readFile(absPath, 'utf-8');
  } catch (err) {
    console.error(`Error reading ${absPath}: ${err.message}`);
    process.exit(1);
  }

  const issues = [];

  const sectionCount = (content.match(/#section\[/g) || []).length;
  if (sectionCount < MIN_SECTIONS) {
    issues.push(`Expected at least ${MIN_SECTIONS} #section[...] blocks, found ${sectionCount}`);
  }

  for (const token of REQUIRED_TOKENS) {
    if (!content.includes(token)) {
      issues.push(`Missing frozen-style token: ${token}`);
    }
  }

  const unresolved = content.match(/\{\{[A-Z_]+\}\}/g);
  if (unresolved) {
    issues.push(`Unresolved placeholders: ${[...new Set(unresolved)].join(', ')}`);
  }

  const fileInfo = await stat(absPath);
  const report = {
    file: basename(absPath),
    path: absPath,
    sizeKB: parseFloat((fileInfo.size / 1024).toFixed(1)),
    counts: {
      sections: sectionCount,
      bullets: (content.match(/#bullet\[/g) || []).length,
      achievements: (content.match(/#achievement\(/g) || []).length,
    },
    issues,
    valid: issues.length === 0,
  };

  if (issues.length > 0) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // Detect typst binary
  try {
    execFileSync('typst', ['--version'], { stdio: 'pipe' });
  } catch {
    report.compiled = false;
    report.compileError = 'typst not found on PATH. Install it: brew install typst';
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const texDir = dirname(absPath);
  const base = basename(absPath, '.typ');
  const targetPdf = outputPath ? resolve(outputPath) : join(texDir, `${base}.pdf`);
  const targetDir = dirname(targetPdf);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  // typst's default root is the input file's directory, which is what we want
  // (the filled .typ is self-contained and uses system fonts). `paper` is
  // accepted for CLI symmetry with the other generators but the frozen
  // template hardcodes a4; pass-through left as a no-op for now.
  void paper;
  const compileArgs = ['compile', absPath, targetPdf];

  try {
    execFileSync('typst', compileArgs, { cwd: texDir, stdio: 'pipe', timeout: 120_000 });
    report.compiled = true;
    const pdfStat = await stat(targetPdf);
    report.pdf = { path: targetPdf, sizeKB: parseFloat((pdfStat.size / 1024).toFixed(1)) };
  } catch (err) {
    report.compiled = false;
    report.compileError = (err.stderr?.toString() || err.message).trim();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.compiled ? 0 : 1);
}

main();
