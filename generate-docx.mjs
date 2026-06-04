#!/usr/bin/env node
/**
 * generate-docx.mjs — Pandoc-based Markdown → .docx generator.
 *
 * Converts a Markdown file (or string) to a Word .docx document using pandoc.
 * If templates/reference.docx exists it is used as the style reference; otherwise
 * pandoc's default Word styles are applied (clean, ATS-readable).
 *
 * Pandoc is an optional system dependency — the script exits with a clear error
 * message if it is not installed. Install via: brew install pandoc (macOS) or
 * https://pandoc.org/installing.html.
 *
 * Usage (CLI):
 *   node generate-docx.mjs <input.md> <output.docx>
 *
 * Usage (module):
 *   import { generateDocx, generateDocxFromString } from './generate-docx.mjs';
 *   await generateDocx('path/to/input.md', 'path/to/output.docx');
 *   await generateDocxFromString(markdownString, 'path/to/output.docx');
 */

import { execFile } from 'child_process';
import { writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const ROOT          = dirname(fileURLToPath(import.meta.url));
const REFERENCE_DOC = join(ROOT, 'templates', 'reference.docx');

// ── Pandoc wrapper ────────────────────────────────────────────────────────────

/**
 * Convert a Markdown file to .docx using pandoc.
 *
 * @param {string} inputPath   — absolute path to input .md file
 * @param {string} outputPath  — absolute path for output .docx
 * @param {object} [opts]
 * @param {string} [opts.title]   — document title (written to docx metadata)
 * @returns {Promise<void>}
 */
export async function generateDocx(inputPath, outputPath, opts = {}) {
  if (!existsSync(inputPath)) {
    throw new Error(`generateDocx: input file not found: ${inputPath}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });

  const args = buildArgs(inputPath, outputPath, opts);

  try {
    await execFileAsync('pandoc', args, { timeout: 30_000 });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'pandoc is not installed. Install with: brew install pandoc\n' +
        'Or visit: https://pandoc.org/installing.html'
      );
    }
    throw new Error(`pandoc failed: ${err.stderr || err.message}`);
  }
}

/**
 * Convert a Markdown string to .docx (writes a temp file for pandoc input).
 *
 * @param {string} markdown    — Markdown content
 * @param {string} outputPath  — absolute path for output .docx
 * @param {object} [opts]
 * @returns {Promise<void>}
 */
export async function generateDocxFromString(markdown, outputPath, opts = {}) {
  const tmpPath = join(ROOT, 'output', `.docx-tmp-${randomUUID()}.md`);
  mkdirSync(dirname(tmpPath), { recursive: true });
  writeFileSync(tmpPath, markdown, 'utf-8');
  try {
    await generateDocx(tmpPath, outputPath, opts);
  } finally {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  }
}

// ── Argument builder ──────────────────────────────────────────────────────────

function buildArgs(inputPath, outputPath, opts = {}) {
  const args = [
    inputPath,
    '--output', outputPath,
    '--from', 'markdown+smart',
    '--to', 'docx',
  ];

  // Style reference: use templates/reference.docx if available
  if (existsSync(REFERENCE_DOC)) {
    args.push('--reference-doc', REFERENCE_DOC);
  }

  // Document metadata
  if (opts.title) {
    args.push('--metadata', `title=${opts.title}`);
  }

  return args;
}

// ── Reference doc generator ───────────────────────────────────────────────────

/**
 * Generate a default templates/reference.docx using pandoc's built-in styles.
 * Run once to bootstrap the style template that generateDocx will use.
 * Call: node generate-docx.mjs --init-reference
 */
export async function initReferenceDoc() {
  const args = ['--print-default-data-file', 'reference.docx'];
  try {
    const { stdout } = await execFileAsync('pandoc', args, {
      encoding: 'buffer',
      timeout: 15_000,
    });
    mkdirSync(join(ROOT, 'templates'), { recursive: true });
    writeFileSync(REFERENCE_DOC, stdout);
    console.log(`✅ Created templates/reference.docx (${(stdout.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('pandoc is not installed. Install via https://pandoc.org/installing.html');
    }
    throw new Error(`Failed to create reference doc: ${err.stderr || err.message}`);
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);

  if (args[0] === '--init-reference') {
    initReferenceDoc().catch(err => { console.error(err.message); process.exit(1); });
  } else if (args.length >= 2) {
    const [input, output] = args;
    generateDocx(
      input.startsWith('/') ? input : join(process.cwd(), input),
      output.startsWith('/') ? output : join(process.cwd(), output),
    ).then(() => {
      console.log(`✅ Generated: ${basename(output)}`);
    }).catch(err => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  node generate-docx.mjs <input.md> <output.docx>');
    console.log('  node generate-docx.mjs --init-reference   # creates templates/reference.docx');
    process.exit(1);
  }
}
