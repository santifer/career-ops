#!/usr/bin/env node

/**
 * verify-ats-pdf.mjs — verify the final, uploadable PDF was produced directly
 * by Career-Ops' Chromium renderer and retains selectable, Unicode text.
 *
 * Usage:
 *   node verify-ats-pdf.mjs <resume.pdf> [--require "Jane Smith"] [--json]
 *
 * This intentionally verifies the exact file being handed to an applicant.
 * It rejects PDFs rewritten by Ghostscript, Preview, or other post-processors:
 * those tools can preserve text for pdftotext while changing the PDF structure
 * that an ATS sees. The supported CV path is generate-pdf.mjs -> this checker
 * -> delivery, with no PDF mutation between the last two steps.
 *
 * Requires Poppler utilities: pdfinfo, pdffonts, and pdftotext.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_TOOLS = ['pdfinfo', 'pdffonts', 'pdftotext'];
const MIN_EXTRACTED_CHARACTERS = 250;

function runTool(tool, args) {
  try {
    return { ok: true, output: execFileSync(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    const details = String(error?.stderr || error?.message || '').trim();
    return { ok: false, error: `${tool}: ${details || 'command failed'}` };
  }
}

function parsePdfInfo(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function parseFontRows(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('name ') && !line.startsWith('---'))
    .map((line) => {
      const tail = /\s+(yes|no)\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/.exec(line);
      return tail ? {
        row: line,
        embedded: tail[1] === 'yes',
        subset: tail[2] === 'yes',
        unicode: tail[3] === 'yes',
      } : { row: line, embedded: false, subset: false, unicode: false };
    });
}

/**
 * Inspect an already rendered Career-Ops CV.
 *
 * @param {string} inputPath absolute or relative PDF path
 * @param {{required?: string[]}} [opts]
 * @returns {{ok: boolean, errors: string[], warnings: string[], details: object}}
 */
export function verifyAtsPdf(inputPath, opts = {}) {
  const required = (opts.required || []).filter(Boolean);
  const outputPath = resolve(inputPath || '');
  const errors = [];
  const warnings = [];
  const details = { path: outputPath, required, tools: {}, fonts: [], extractedCharacters: 0 };

  if (!inputPath || !existsSync(outputPath)) {
    return { ok: false, errors: [`PDF not found: ${outputPath}`], warnings, details };
  }
  if (!statSync(outputPath).isFile()) {
    return { ok: false, errors: [`Not a regular file: ${outputPath}`], warnings, details };
  }

  for (const tool of REQUIRED_TOOLS) {
    const check = runTool(tool, ['-v']);
    details.tools[tool] = check.ok;
    if (!check.ok) errors.push(`Required Poppler utility is unavailable: ${tool}`);
  }
  if (errors.length) return { ok: false, errors, warnings, details };

  const infoResult = runTool('pdfinfo', [outputPath]);
  if (!infoResult.ok) {
    errors.push(infoResult.error);
    return { ok: false, errors, warnings, details };
  }
  const info = parsePdfInfo(infoResult.output);
  details.producer = info.Producer || '';
  details.pages = Number(info.Pages || 0);
  details.encrypted = info.Encrypted || '';

  if (details.pages < 1) errors.push('PDF has no readable pages.');
  if (!/^no\b/i.test(details.encrypted)) errors.push(`PDF must not be encrypted (pdfinfo: ${details.encrypted || 'missing'}).`);
  if (!details.producer.startsWith('Skia/PDF')) {
    errors.push(`PDF provenance failed: expected direct Chromium output (Producer: Skia/PDF), found "${details.producer || 'missing'}".`);
  }

  const fontsResult = runTool('pdffonts', [outputPath]);
  if (!fontsResult.ok) {
    errors.push(fontsResult.error);
  } else {
    details.fonts = parseFontRows(fontsResult.output);
    if (!details.fonts.length) {
      errors.push('PDF exposes no embedded text fonts.');
    } else {
      const badFonts = details.fonts.filter((font) => !font.embedded || !font.unicode);
      if (badFonts.length) {
        errors.push(`PDF fonts must be embedded with Unicode mappings: ${badFonts.map((font) => font.row).join(' | ')}`);
      }
    }
  }

  const textResult = runTool('pdftotext', ['-enc', 'UTF-8', outputPath, '-']);
  if (!textResult.ok) {
    errors.push(textResult.error);
  } else {
    details.extractedCharacters = textResult.output.replace(/\s/g, '').length;
    if (details.extractedCharacters < MIN_EXTRACTED_CHARACTERS) {
      errors.push(`PDF text extraction is too short (${details.extractedCharacters} non-whitespace characters; need at least ${MIN_EXTRACTED_CHARACTERS}).`);
    }
    for (const marker of required) {
      if (!textResult.output.toLocaleLowerCase().includes(marker.toLocaleLowerCase())) {
        errors.push(`Required ATS marker is missing from extracted text: ${marker}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, details };
}

function usage() {
  console.error('Usage: node verify-ats-pdf.mjs <resume.pdf> [--require "text marker"] [--json]');
}

function main() {
  const args = process.argv.slice(2);
  const required = [];
  let inputPath = '';
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') json = true;
    else if (arg === '--require') required.push(args[++index] || '');
    else if (arg.startsWith('--require=')) required.push(arg.slice('--require='.length));
    else if (!inputPath) inputPath = arg;
    else {
      usage();
      process.exit(1);
    }
  }

  if (!inputPath) {
    usage();
    process.exit(1);
  }

  const result = verifyAtsPdf(inputPath, { required });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`✓ ATS PDF verified: ${result.details.path}`);
    console.log(`  ${result.details.pages} page(s), ${result.details.extractedCharacters} extracted characters, Producer: ${result.details.producer}`);
  } else {
    console.error(`✗ ATS PDF verification failed: ${result.details.path}`);
    for (const error of result.errors) console.error(`  - ${error}`);
  }
  process.exit(result.ok ? 0 : 1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
