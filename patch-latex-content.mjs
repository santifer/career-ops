#!/usr/bin/env node

/**
 * patch-latex-content.mjs — Apply prose patches to a user-owned LaTeX CV in place.
 *
 * Usage:
 *   node patch-latex-content.mjs <source.tex> <patches.json> <output.tex> [--allow-length-drift]
 *
 * patches.json:
 *   { "patches": [ { "id": "bullet-0", "text": "Tailored bullet text" } ] }
 *
 * Optional manifest fields in patches.json (from extract-latex-content.mjs):
 *   { "slots": [...], "patches": [...] }
 *
 * Graphics-safety gate: the source template's layout (fixed-width columns/boxes)
 * is known to render correctly today. Each patch is checked against its slot's
 * original character count with a tolerance of LENGTH_TOLERANCE_CHARS; a patch
 * outside that budget is rejected before anything is written, because a longer
 * or shorter block is the single most common way a hand-tuned LaTeX CV silently
 * overflows a column or shifts a page break. --allow-length-drift downgrades
 * this to a warning for cases where the user has confirmed the drift is safe
 * (e.g. a short slot where the absolute character delta cannot visually matter).
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { pathToFileURL } from 'url';
import { applyPatches } from './lib/latex-content.mjs';

const LENGTH_TOLERANCE_CHARS = 5;

async function main() {
  const rawArgs = process.argv.slice(2).filter(a => a !== '--help');
  const allowLengthDrift = rawArgs.includes('--allow-length-drift');
  const args = rawArgs.filter(a => a !== '--allow-length-drift');
  const [sourcePath, patchesPath, outputPath] = args;

  if (!sourcePath || !patchesPath || !outputPath) {
    console.error('Usage: node patch-latex-content.mjs <source.tex> <patches.json> <output.tex>');
    process.exit(1);
  }

  const absSource = resolve(sourcePath);
  const absPatches = resolve(patchesPath);
  const absOutput = resolve(outputPath);

  if (!existsSync(absSource)) {
    console.error(`Source not found: ${absSource}`);
    process.exit(1);
  }
  if (!existsSync(absPatches)) {
    console.error(`Patches file not found: ${absPatches}`);
    process.exit(1);
  }

  let tex;
  let payload;
  try {
    tex = await readFile(absSource, 'utf-8');
    payload = JSON.parse(await readFile(absPatches, 'utf-8'));
  } catch (err) {
    console.error(`Failed to read input: ${err.message}`);
    process.exit(1);
  }

  const patches = Array.isArray(payload.patches) ? payload.patches : [];
  const slots = Array.isArray(payload.slots) ? payload.slots : [];

  if (slots.length === 0) {
    console.error('patches.json must include a slots array from extract-latex-content.mjs');
    process.exit(1);
  }

  const missing = patches.filter(p => !slots.some(s => s.id === p.id));
  if (missing.length > 0) {
    console.error(`Unknown patch ids: ${missing.map(p => p.id).join(', ')}`);
    process.exit(1);
  }

  const slotById = new Map(slots.map(s => [s.id, s]));
  const overBudget = patches
    .map(p => {
      const slot = slotById.get(p.id);
      const delta = p.text.length - slot.text.length;
      return { id: p.id, kind: slot.kind, originalLength: slot.text.length, newLength: p.text.length, delta };
    })
    .filter(r => Math.abs(r.delta) > LENGTH_TOLERANCE_CHARS);

  if (overBudget.length > 0) {
    const lines = overBudget.map(r =>
      `  ${r.id} (${r.kind}): ${r.originalLength} -> ${r.newLength} chars (${r.delta > 0 ? '+' : ''}${r.delta}, tolerance ±${LENGTH_TOLERANCE_CHARS})`
    );
    if (allowLengthDrift) {
      console.warn(`⚠️  Patches exceed the ±${LENGTH_TOLERANCE_CHARS}-character graphics-safety budget (proceeding — --allow-length-drift set):`);
      console.warn(lines.join('\n'));
    } else {
      console.error(`Patches exceed the ±${LENGTH_TOLERANCE_CHARS}-character graphics-safety budget:`);
      console.error(lines.join('\n'));
      console.error('This template\'s layout is fixed-width; a patch this much longer/shorter risks overflowing a column or shifting a page break. Shorten/lengthen the text to fit, or re-run with --allow-length-drift once you\'ve confirmed the change is safe.');
      process.exit(1);
    }
  }

  const patched = applyPatches(tex, patches, slots);
  const outDir = dirname(absOutput);
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }
  await writeFile(absOutput, patched, 'utf-8');

  const report = {
    source: absSource,
    output: absOutput,
    patched: patches.length,
    lengthToleranceChars: LENGTH_TOLERANCE_CHARS,
    lengthDriftOverridden: overBudget.length > 0 ? overBudget.length : 0,
    valid: true,
  };
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
