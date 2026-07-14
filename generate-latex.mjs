#!/usr/bin/env node

/**
 * generate-latex.mjs -- Validate and compile a generated .tex CV file to PDF.
 *
 * Usage:
 *   node generate-latex.mjs <input.tex> [output.pdf]
 *   node generate-latex.mjs <input.tex> [output.pdf] --compile-only
 *   node generate-latex.mjs --engine=xelatex --expect-pages=1 --ats-text-check <input.tex> [output.pdf]
 *
 * Default: validate the career-ops template structure before compiling.
 * --compile-only: compile any user-owned .tex after basic document checks.
 */

import { readFile, writeFile, stat, copyFile, rm } from 'fs/promises';
import { resolve, basename, dirname, join } from 'path';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';

const MIN_SECTIONS = 4;
const REQUIRED_COMMANDS = [
  '\\\\resumeSubheading',
  '\\\\resumeItem',
  '\\\\resumeProjectHeading',
];
const ALLOWED_ENGINES = new Set(['auto', 'tectonic', 'pdflatex', 'lualatex', 'xelatex']);
const AUTO_ENGINE_ORDER = ['tectonic', 'pdflatex', 'lualatex', 'xelatex'];
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/u;

function usage() {
  return `Usage:
  node generate-latex.mjs [--compile-only] [--engine=auto|tectonic|pdflatex|lualatex|xelatex] [--expect-pages=N] [--ats-text-check] <input.tex> [output.pdf]`;
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {
    engine: 'auto',
    expectPages: null,
    atsTextCheck: false,
    compileOnly: false,
    help: false,
    inputPath: null,
    outputPath: null,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--compile-only') {
      options.compileOnly = true;
    } else if (arg === '--ats-text-check') {
      options.atsTextCheck = true;
    } else if (arg.startsWith('--engine=')) {
      options.engine = arg.slice('--engine='.length);
    } else if (arg === '--engine') {
      options.engine = argv[++i];
    } else if (arg.startsWith('--expect-pages=')) {
      options.expectPages = Number.parseInt(arg.slice('--expect-pages='.length), 10);
    } else if (arg === '--expect-pages') {
      options.expectPages = Number.parseInt(argv[++i], 10);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (!ALLOWED_ENGINES.has(options.engine)) {
    throw new Error(`Invalid --engine value "${options.engine}". Expected one of: ${[...ALLOWED_ENGINES].join(', ')}`);
  }
  if (options.expectPages !== null && (!Number.isInteger(options.expectPages) || options.expectPages < 1)) {
    throw new Error('--expect-pages must be a positive integer');
  }
  if (positional.length > 2) {
    throw new Error(`Too many positional arguments: ${positional.slice(2).join(' ')}`);
  }

  options.inputPath = positional[0] || null;
  options.outputPath = positional[1] || null;
  return options;
}

export function resolveEngineCandidates(requested = 'auto') {
  if (requested === 'auto') return [...AUTO_ENGINE_ORDER];
  if (!ALLOWED_ENGINES.has(requested)) return [...AUTO_ENGINE_ORDER];
  return [requested];
}

function executableExists(candidate) {
  try {
    execFileSync(candidate, ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function selectEngine(requested) {
  for (const candidate of resolveEngineCandidates(requested)) {
    if (executableExists(candidate)) return candidate;
  }
  return null;
}

export function validateLatexContent(content, compileOnly = false) {
  const issues = [];
  let resumeItemCount = 0;
  let subheadingCount = 0;
  let projectHeadingCount = 0;

  if (!content.includes('\\begin{document}')) issues.push('Missing \\begin{document}');
  if (!content.includes('\\end{document}')) issues.push('Missing \\end{document}');

  if (compileOnly) {
    return {
      issues,
      counts: { resumeItems: 0, subheadings: 0, projectHeadings: 0 },
    };
  }

  const sectionCount = (content.match(/\\section\{/g) || []).length;
  if (sectionCount < MIN_SECTIONS) {
    issues.push(`Expected at least ${MIN_SECTIONS} \\section{} blocks (Education, Work Experience, Projects, Skills or localized equivalents), found ${sectionCount}`);
  }

  if (CJK_RE.test(content)) {
    issues.push('CJK characters detected. The career-ops LaTeX template does not support Japanese/Chinese/Korean yet. Use pdf mode, or use latex-tex with a CJK-capable template and engine.');
  }

  for (const cmd of REQUIRED_COMMANDS) {
    if (!new RegExp(cmd).test(content)) issues.push(`Missing command: ${cmd}`);
  }

  const unresolvedMatch = content.match(/\{\{[A-Z_]+\}\}/g);
  if (unresolvedMatch) {
    issues.push(`Unresolved placeholders: ${[...new Set(unresolvedMatch)].join(', ')}`);
  }

  for (const line of content.split('\n')) {
    if (/\\resumeItem\{/.test(line)) resumeItemCount += 1;
    if (/\\resumeSubheading(?!Continue)/.test(line)) subheadingCount += 1;
    if (/\\resumeProjectHeading/.test(line)) projectHeadingCount += 1;
  }

  if (!content.includes('\\pdfgentounicode=1')) {
    issues.push('Missing \\pdfgentounicode=1 (ATS compatibility)');
  }

  return {
    issues,
    counts: {
      resumeItems: resumeItemCount,
      subheadings: subheadingCount,
      projectHeadings: projectHeadingCount,
    },
  };
}

export function parsePdfInfoPages(output) {
  const match = String(output || '').match(/^\s*Pages:\s*(\d+)\s*$/mi);
  return match ? Number.parseInt(match[1], 10) : null;
}

function countPdfPagesHeuristic(pdfBuffer) {
  const matches = pdfBuffer.toString('latin1').match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : null;
}

async function readPdfPageCount(pdfPath) {
  try {
    const output = execFileSync('pdfinfo', [pdfPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const pages = parsePdfInfoPages(output);
    if (pages) return { pages, method: 'pdfinfo' };
  } catch {
    // Poppler is optional; use a conservative PDF object count next.
  }

  try {
    const pages = countPdfPagesHeuristic(await readFile(pdfPath));
    if (pages) return { pages, method: 'pdf-heuristic' };
  } catch {
    // The caller reports an unavailable page count.
  }

  return { pages: null, method: null };
}

export function findAtsTextLayerIssues(text) {
  const value = String(text || '');
  const issues = [];
  if (!value.trim()) issues.push('pdftotext extracted no text');
  if (/\(cid:\d+\)/i.test(value)) issues.push('pdftotext found CID glyph fallbacks');
  if (value.includes('\uFFFD')) issues.push('pdftotext found replacement characters');
  return issues;
}

function runPdfToText(pdfPath) {
  try {
    const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    return { checked: true, skipped: false, issues: findAtsTextLayerIssues(text) };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        checked: false,
        skipped: true,
        warning: 'pdftotext not found; ATS text-layer check skipped',
        issues: [],
      };
    }
    return {
      checked: false,
      skipped: false,
      warning: `pdftotext failed: ${err.message}`,
      issues: [`pdftotext failed: ${err.message}`],
    };
  }
}

function latexArgs(engine, texDir, texPath) {
  if (engine === 'tectonic') return ['--outdir', texDir, texPath];
  return [
    '-no-shell-escape',
    '-interaction=nonstopmode',
    '-halt-on-error',
    `-output-directory=${texDir}`,
    texPath,
  ];
}

/**
 * Compile a LaTeX file while preserving the historical four-argument API.
 * @param {string} absPath
 * @param {string} content
 * @param {string|null} outputPath
 * @param {boolean} compileOnly
 * @param {{engine?: string, expectPages?: number|null, atsTextCheck?: boolean}} options
 * @returns {Promise<object>}
 */
export async function compileLatexFile(absPath, content, outputPath = null, compileOnly = false, options = {}) {
  const engineRequest = options.engine || 'auto';
  const expectPages = options.expectPages ?? null;
  const atsTextCheck = options.atsTextCheck === true;
  if (!ALLOWED_ENGINES.has(engineRequest)) {
    throw new Error(`Invalid engine "${engineRequest}"`);
  }
  if (expectPages !== null && (!Number.isInteger(expectPages) || expectPages < 1)) {
    throw new Error('expectPages must be a positive integer or null');
  }

  const { issues, counts } = validateLatexContent(content, compileOnly);
  const fileInfo = await stat(absPath);
  const report = {
    file: basename(absPath),
    path: absPath,
    sizeKB: parseFloat((fileInfo.size / 1024).toFixed(1)),
    counts,
    issues,
    valid: issues.length === 0,
    compileOnly,
    options: { engine: engineRequest, expectPages, atsTextCheck },
  };

  if (issues.length > 0) return report;

  const texDir = dirname(absPath);
  const texBase = basename(absPath, '.tex');
  const defaultPdf = join(texDir, `${texBase}.pdf`);
  const targetPdf = outputPath ? resolve(outputPath) : defaultPdf;
  const targetDir = dirname(targetPdf);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  const engine = selectEngine(engineRequest);
  if (!engine) {
    report.compiled = false;
    report.compileError = `No LaTeX engine found for --engine=${engineRequest}. Install tectonic, pdflatex, lualatex, or xelatex.`;
    return report;
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
  const compileBase = basename(compilePath, '.tex');

  try {
    const args = latexArgs(engine, texDir, compilePath);
    execFileSync(engine, args, { cwd: texDir, stdio: 'pipe', timeout: 120_000 });
    if (engine !== 'tectonic') {
      execFileSync(engine, args, { cwd: texDir, stdio: 'pipe', timeout: 120_000 });
    }
    report.compiled = true;
  } catch (err) {
    let latexError = err.message;
    for (const logBase of [compileBase, texBase]) {
      try {
        const log = await readFile(join(texDir, `${logBase}.log`), 'utf-8');
        const errorLines = log.split('\n').filter(line => line.startsWith('!'));
        if (errorLines.length > 0) {
          latexError = errorLines.join('\n');
          break;
        }
      } catch {
        // Try the next possible log path.
      }
    }
    report.compiled = false;
    report.compileError = latexError;
  }

  if (report.compiled) {
    const compiledPdf = join(texDir, `${compileBase}.pdf`);
    try {
      if (resolve(compiledPdf) !== resolve(targetPdf)) {
        await copyFile(compiledPdf, targetPdf);
        await rm(compiledPdf).catch(() => {});
      }
      const pdfStat = await stat(targetPdf);
      report.pdf = {
        path: targetPdf,
        sizeKB: parseFloat((pdfStat.size / 1024).toFixed(1)),
      };
    } catch (err) {
      report.postCompileError = `Failed to finalize PDF: ${err.message}`;
    }

    if (!report.postCompileError && expectPages !== null) {
      const pageInfo = await readPdfPageCount(targetPdf);
      report.pageCheck = {
        expected: expectPages,
        actual: pageInfo.pages,
        method: pageInfo.method,
        passed: pageInfo.pages === expectPages,
      };
      if (!report.pageCheck.passed) {
        report.pageCheck.error = pageInfo.pages === null
          ? 'Could not determine PDF page count'
          : `Expected ${expectPages} page(s), found ${pageInfo.pages}`;
      }
    }

    if (!report.postCompileError && atsTextCheck) {
      report.atsText = runPdfToText(targetPdf);
    }
  }

  const auxExts = ['.aux', '.log', '.out', '.fls', '.fdb_latexmk', '.synctex.gz'];
  for (const ext of auxExts) {
    await rm(join(texDir, `${compileBase}${ext}`)).catch(() => {});
    if (compileBase !== texBase) await rm(join(texDir, `${texBase}${ext}`)).catch(() => {});
  }
  if (engine === 'tectonic') await rm(compilePath).catch(() => {});

  return report;
}

async function main() {
  let options;
  try {
    options = parseCliArgs();
  } catch (err) {
    console.error(err.message);
    console.error(usage());
    process.exit(1);
  }

  if (options.help || !options.inputPath) {
    console.error(usage());
    process.exit(options.help ? 0 : 1);
  }

  const absPath = resolve(options.inputPath);
  let content;
  try {
    content = await readFile(absPath, 'utf-8');
  } catch (err) {
    console.error(`Error reading ${absPath}: ${err.message}`);
    process.exit(1);
  }

  const report = await compileLatexFile(
    absPath,
    content,
    options.outputPath,
    options.compileOnly,
    {
      engine: options.engine,
      expectPages: options.expectPages,
      atsTextCheck: options.atsTextCheck,
    },
  );

  const pageCheckOk = !report.pageCheck || report.pageCheck.passed;
  const atsOk = !report.atsText || report.atsText.skipped || report.atsText.issues.length === 0;
  const ok = report.compiled && !report.postCompileError && pageCheckOk && atsOk;
  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
