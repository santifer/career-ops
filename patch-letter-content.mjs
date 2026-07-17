#!/usr/bin/env node

/**
 * patch-letter-content.mjs — Apply per-application patches to a user-owned
 * LaTeX cover letter (info.tex + body.tex), writing the result to an output
 * directory. main.tex and sig.png (or any other sibling asset) are copied
 * unchanged so the output directory compiles standalone.
 *
 * Usage:
 *   node patch-letter-content.mjs <source-dir> <patches.json> <output-dir>
 *
 * patches.json (from extract-letter-content.mjs's manifest, plus your patches):
 *   {
 *     "slots": [...],
 *     "patches": [
 *       { "id": "recipient", "text": "Team HR Acme Inc." },
 *       { "id": "company", "text": "Acme Inc." },
 *       { "id": "body", "text": "Full LaTeX prose for the letter body..." }
 *     ]
 *   }
 *
 * No character-budget gate here (unlike patch-latex-content.mjs): info.tex
 * fields are meant to change length freely (a company name isn't the same
 * length every time), and body.tex is a full rewrite. The safety net for this
 * template is a post-compile page-count check — run generate-latex.mjs next
 * and confirm report.pdf.pageCount === 1.
 */

import { readFile, writeFile, mkdir, readdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, join, basename } from 'path';
import { pathToFileURL } from 'url';
import { applyLetterPatches } from './lib/letter-content.mjs';

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--help');
  const [sourceDir, patchesPath, outputDir] = args;

  if (!sourceDir || !patchesPath || !outputDir) {
    console.error('Usage: node patch-letter-content.mjs <source-dir> <patches.json> <output-dir>');
    process.exit(1);
  }

  const absSourceDir = resolve(sourceDir);
  const absPatches = resolve(patchesPath);
  const absOutputDir = resolve(outputDir);

  const infoPath = join(absSourceDir, 'info.tex');
  const bodyPath = join(absSourceDir, 'body.tex');
  if (!existsSync(infoPath) || !existsSync(bodyPath)) {
    console.error(`Expected both info.tex and body.tex in ${absSourceDir}`);
    process.exit(1);
  }
  if (!existsSync(absPatches)) {
    console.error(`Patches file not found: ${absPatches}`);
    process.exit(1);
  }

  const infoTex = await readFile(infoPath, 'utf-8');
  const bodyTex = await readFile(bodyPath, 'utf-8');
  const payload = JSON.parse(await readFile(absPatches, 'utf-8'));

  const patches = Array.isArray(payload.patches) ? payload.patches : [];
  const slots = Array.isArray(payload.slots) ? payload.slots : [];

  if (slots.length === 0) {
    console.error('patches.json must include a slots array from extract-letter-content.mjs');
    process.exit(1);
  }

  const missing = patches.filter(p => !slots.some(s => s.id === p.id));
  if (missing.length > 0) {
    console.error(`Unknown patch ids: ${missing.map(p => p.id).join(', ')}`);
    process.exit(1);
  }

  const candidateConstantPatches = patches.filter(p => {
    const slot = slots.find(s => s.id === p.id);
    return slot && slot.kind === 'candidate-constant';
  });
  if (candidateConstantPatches.length > 0) {
    console.warn(`⚠️  Patching candidate-constant field(s) (${candidateConstantPatches.map(p => p.id).join(', ')}) — these normally stay fixed across applications. Proceeding since they were explicitly included.`);
  }

  const { infoTex: newInfo, bodyTex: newBody } = applyLetterPatches(infoTex, bodyTex, patches, slots);

  await mkdir(absOutputDir, { recursive: true });
  await writeFile(join(absOutputDir, 'info.tex'), newInfo, 'utf-8');
  await writeFile(join(absOutputDir, 'body.tex'), newBody, 'utf-8');

  // Copy every other sibling file (main.tex, sig.png, any other asset) unchanged
  // so the output directory is a standalone, compilable copy.
  const entries = await readdir(absSourceDir);
  for (const entry of entries) {
    if (entry === 'info.tex' || entry === 'body.tex') continue;
    await copyFile(join(absSourceDir, entry), join(absOutputDir, entry));
  }

  const report = {
    sourceDir: absSourceDir,
    outputDir: absOutputDir,
    infoPatched: patches.filter(p => p.id !== 'body').length,
    bodyPatched: patches.some(p => p.id === 'body'),
    candidateConstantOverridden: candidateConstantPatches.map(p => p.id),
    copiedAssets: entries.filter(e => e !== 'info.tex' && e !== 'body.tex'),
    valid: true,
  };
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
