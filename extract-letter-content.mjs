#!/usr/bin/env node

/**
 * extract-letter-content.mjs — List editable fields/body of a user-owned LaTeX
 * cover letter split into info.tex + body.tex (see modes/cover-letter-tex.md).
 *
 * Usage:
 *   node extract-letter-content.mjs <dir-containing-info-and-body> [--out manifest.json]
 *   node extract-letter-content.mjs <path/to/info.tex> [--out manifest.json]
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { buildLetterManifest } from './lib/letter-content.mjs';

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--help');
  const outIdx = args.indexOf('--out');
  let outPath = null;
  if (outIdx !== -1) {
    outPath = args[outIdx + 1];
    args.splice(outIdx, 2);
  }

  const inputPath = args[0];
  if (!inputPath) {
    console.error('Usage: node extract-letter-content.mjs <dir-or-info.tex> [--out manifest.json]');
    process.exit(1);
  }

  const absInput = resolve(inputPath);
  const dir = absInput.endsWith('.tex') ? dirname(absInput) : absInput;
  const infoPath = join(dir, 'info.tex');
  const bodyPath = join(dir, 'body.tex');

  if (!existsSync(infoPath) || !existsSync(bodyPath)) {
    console.error(`Expected both info.tex and body.tex in ${dir}`);
    console.error(`  info.tex found: ${existsSync(infoPath)}`);
    console.error(`  body.tex found: ${existsSync(bodyPath)}`);
    process.exit(1);
  }

  const infoTex = await readFile(infoPath, 'utf-8');
  const bodyTex = await readFile(bodyPath, 'utf-8');
  const manifest = buildLetterManifest('info.tex', 'body.tex', infoTex, bodyTex);
  const json = JSON.stringify(manifest, null, 2);

  if (outPath) {
    await writeFile(resolve(outPath), json, 'utf-8');
  }
  console.log(json);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
