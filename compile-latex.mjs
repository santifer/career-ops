#!/usr/bin/env node

/**
 * compile-latex.mjs — Compile any .tex CV to PDF (no career-ops template validation)
 *
 * Usage:
 *   node compile-latex.mjs <input.tex> [output.pdf]
 *
 * Requires: tectonic (preferred) or pdflatex on PATH.
 */

import { readFile, writeFile, stat, copyFile, rm } from 'fs/promises';
import { resolve, basename, dirname, join } from 'path';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

function detectEngine() {
  for (const candidate of ['tectonic', 'pdflatex']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'pipe' });
      return candidate;
    } catch {
      /* not installed */
    }
  }
  return null;
}

export async function compileLatex(inputPath, outputPath = null) {
  const absPath = resolve(inputPath);
  let content;
  try {
    content = await readFile(absPath, 'utf-8');
  } catch (err) {
    console.error(`Error reading ${absPath}: ${err.message}`);
    process.exit(1);
  }

  if (!content.includes('\\begin{document}') || !content.includes('\\end{document}')) {
    console.error('Invalid LaTeX: missing \\begin{document} or \\end{document}');
    process.exit(1);
  }

  const texDir = dirname(absPath);
  const texBase = basename(absPath, '.tex');
  const defaultPdf = join(texDir, `${texBase}.pdf`);
  const targetPdf = outputPath ? resolve(outputPath) : defaultPdf;
  const targetDir = dirname(targetPdf);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  const engine = detectEngine();
  const report = {
    file: basename(absPath),
    path: absPath,
    valid: true,
    issues: [],
  };

  if (!engine) {
    report.compiled = false;
    report.compileError =
      'No LaTeX engine found. Install tectonic (brew install tectonic) or pdflatex.';
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  report.engine = engine;

  let compilePath = absPath;
  if (engine === 'tectonic') {
    const patched = content
      .replace(/\\pdfgentounicode\s*=\s*\d+[^\n]*\n?/g, '')
      .replace(/\\input\{glyphtounicode\}[^\n]*\n?/g, '');
    compilePath = join(texDir, `${texBase}._tectonic.tex`);
    await writeFile(compilePath, patched, 'utf-8');
  }

  try {
    if (engine === 'tectonic') {
      execFileSync('tectonic', ['--outdir', texDir, compilePath], {
        cwd: texDir,
        stdio: 'pipe',
        timeout: 120_000,
      });
    } else {
      const args = [
        '-no-shell-escape',
        '-interaction=nonstopmode',
        '-halt-on-error',
        `-output-directory=${texDir}`,
        absPath,
      ];
      execFileSync('pdflatex', args, { cwd: texDir, stdio: 'pipe', timeout: 120_000 });
      execFileSync('pdflatex', args, { cwd: texDir, stdio: 'pipe', timeout: 120_000 });
    }
    report.compiled = true;
  } catch (err) {
    const logPath = join(texDir, `${texBase}.log`);
    let latexError = err.message;
    try {
      const log = await readFile(logPath, 'utf-8');
      const errorLines = log.split('\n').filter((l) => l.startsWith('!'));
      if (errorLines.length > 0) latexError = errorLines.join('\n');
    } catch {
      /* no log */
    }
    report.compiled = false;
    report.compileError = latexError;
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const compileBase = basename(compilePath, '.tex');
  const compiledPdf = join(texDir, `${compileBase}.pdf`);

  try {
    await copyFile(compiledPdf, targetPdf);
    if (resolve(compiledPdf) !== resolve(targetPdf)) {
      await rm(compiledPdf).catch(() => {});
    }
    const pdfStat = await stat(targetPdf);
    report.pdf = {
      path: targetPdf,
      sizeKB: parseFloat((pdfStat.size / 1024).toFixed(1)),
    };
  } catch (err) {
    report.compiled = false;
    report.compileError = `Failed to finalize PDF: ${err.message}`;
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const auxExts = ['.aux', '.log', '.out', '.fls', '.fdb_latexmk', '.synctex.gz'];
  for (const ext of auxExts) {
    await rm(join(texDir, `${compileBase}${ext}`)).catch(() => {});
  }
  if (engine === 'tectonic' && compilePath !== absPath) {
    await rm(compilePath).catch(() => {});
  }

  console.log(JSON.stringify(report, null, 2));
  return report;
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath) {
  console.error('Usage: node compile-latex.mjs <input.tex> [output.pdf]');
  process.exit(1);
}

compileLatex(inputPath, outputPath);
