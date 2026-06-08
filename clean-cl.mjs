#!/usr/bin/env node
/**
 * clean-cl.mjs — Local equivalent of cleanpaste.site
 * Strips invisible Unicode characters and AI watermark glyphs from cover letters.
 *
 * Usage:
 *   node clean-cl.mjs                        # clean all output/cl_*.txt files in-place
 *   node clean-cl.mjs path/to/file.txt       # clean a specific file
 *   node clean-cl.mjs --dry-run              # show what would change, don't write
 *   echo "text" | node clean-cl.mjs --stdin  # clean from stdin, print to stdout
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Strip invisible/zero-width/watermark Unicode characters.
 * ALL ranges use explicit hex escapes — NO literal Unicode chars in this file.
 *
 * Strips:
 *   U+00AD         Soft hyphen
 *   U+034F         Combining grapheme joiner
 *   U+180E         Mongolian vowel separator
 *   U+200B–U+200F  Zero-width space/non-joiner/joiner/LRM/RLM
 *   U+202A–U+202E  Bidi embedding controls (LRE, RLE, PDF, LRO, RLO)
 *   U+2060         Word joiner
 *   U+2064–U+2069  Invisible math operators + bidi isolates
 *   U+FEFF         BOM / zero-width no-break space
 *   U+E0000–U+E007F  Tags block (primary AI watermark vector)
 */
const STRIP_RE = new RegExp(
  [
    '­',                      // Soft hyphen
    '͏',                      // Combining grapheme joiner
    '᠎',                      // Mongolian vowel separator
    '[​-‏]',             // ZWSP, ZWNJ, ZWJ, LRM, RLM
    '[‪-‮]',             // Bidi embedding controls
    '⁠',                      // Word joiner
    '[⁤-⁩]',             // Invisible math + bidi isolates
    '﻿',                      // BOM
    '[\u{E0000}-\u{E007F}]',       // Tags block
  ].join('|'),
  'gu'  // 'u' flag required for \u{XXXXX} notation
);

/**
 * Normalize common Unicode homoglyphs back to their ASCII equivalents.
 * Only Cyrillic/Greek lookalikes known to be used in watermarking.
 * Using codepoint replacements — no literal non-ASCII in source.
 */
const HOMOGLYPH_MAP = {
  'а': 'a',  // Cyrillic small а → a
  'е': 'e',  // Cyrillic small е → e
  'о': 'o',  // Cyrillic small о → o
  'р': 'r',  // Cyrillic small р → r
  'с': 'c',  // Cyrillic small с → c
  'х': 'x',  // Cyrillic small х → x
  'ο': 'o',  // Greek small omicron ο → o
  'α': 'a',  // Greek small alpha α → a
  'ρ': 'p',  // Greek small rho ρ → p
  'ν': 'v',  // Greek small nu ν → v
  'А': 'A',  // Cyrillic capital А → A
  'В': 'B',  // Cyrillic capital В → B
  'Е': 'E',  // Cyrillic capital Е → E
  'К': 'K',  // Cyrillic capital К → K
  'М': 'M',  // Cyrillic capital М → M
  'Н': 'H',  // Cyrillic capital Н → H
  'О': 'O',  // Cyrillic capital О → O
  'Р': 'P',  // Cyrillic capital Р → P
  'С': 'C',  // Cyrillic capital С → C
  'Т': 'T',  // Cyrillic capital Т → T
  'Х': 'X',  // Cyrillic capital Х → X
};
const HOMOGLYPH_RE = new RegExp(Object.keys(HOMOGLYPH_MAP).join('|'), 'g');

/**
 * Normalize Mathematical Alphanumeric Symbols (U+1D400–U+1D7FF) back to ASCII.
 * Bold, italic, script, double-struck, fraktur, monospace variants.
 */
function normalizeMathAlpha(str) {
  return str.replace(/[\u{1D400}-\u{1D7FF}]/gu, ch => {
    const cp = ch.codePointAt(0);
    const ranges = [
      [0x1D400, 0x1D419, 65],  // Bold caps A-Z
      [0x1D41A, 0x1D433, 97],  // Bold small a-z
      [0x1D434, 0x1D44D, 65],  // Italic caps A-Z
      [0x1D44E, 0x1D467, 97],  // Italic small a-z
      [0x1D468, 0x1D481, 65],  // Bold italic caps
      [0x1D482, 0x1D49B, 97],  // Bold italic small
      [0x1D49C, 0x1D4B5, 65],  // Script caps
      [0x1D4B6, 0x1D4CF, 97],  // Script small
      [0x1D538, 0x1D551, 65],  // Double-struck caps
      [0x1D552, 0x1D56B, 97],  // Double-struck small
      [0x1D5A0, 0x1D5B9, 65],  // Sans-serif caps
      [0x1D5BA, 0x1D5D3, 97],  // Sans-serif small
      [0x1D5D4, 0x1D5ED, 65],  // Sans-serif bold caps
      [0x1D5EE, 0x1D607, 97],  // Sans-serif bold small
      [0x1D670, 0x1D689, 65],  // Monospace caps
      [0x1D68A, 0x1D6A3, 97],  // Monospace small
    ];
    for (const [start, end, base] of ranges) {
      if (cp >= start && cp <= end) return String.fromCharCode(base + (cp - start));
    }
    return ch;
  });
}

function cleanText(text) {
  let out = text;
  out = out.replace(STRIP_RE, '');
  out = out.replace(HOMOGLYPH_RE, ch => HOMOGLYPH_MAP[ch] ?? ch);
  out = normalizeMathAlpha(out);
  // Collapse double-spaces that may result from char removal
  out = out.replace(/  +/g, ' ');
  return out;
}

function processFile(filePath, dryRun) {
  const original = readFileSync(filePath, 'utf8');
  const cleaned = cleanText(original);
  const changed = original !== cleaned;
  const removedCount = [...original].length - [...cleaned].length;

  if (dryRun) {
    console.log(changed
      ? `[DRY-RUN] ${filePath}: would remove ${removedCount} char(s)`
      : `[DRY-RUN] ${filePath}: clean`);
    return { changed, removedCount };
  }

  if (changed) {
    writeFileSync(filePath, cleaned, 'utf8');
    console.log(`[CLEANED] ${filePath}: removed ${removedCount} invisible/watermark char(s)`);
  } else {
    console.log(`[CLEAN]   ${filePath}: no changes needed`);
  }
  return { changed, removedCount };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const stdin = args.includes('--stdin');

if (stdin) {
  const input = readFileSync('/dev/stdin', 'utf8');
  process.stdout.write(cleanText(input));
  process.exit(0);
}

const files = args.filter(a => !a.startsWith('--'));
let targets;

if (files.length > 0) {
  targets = files.map(f => resolve(f));
} else {
  const outputDir = new URL('./output', import.meta.url).pathname;
  targets = readdirSync(outputDir)
    .filter(f => f.startsWith('cl_') && f.endsWith('.txt'))
    .map(f => join(outputDir, f));
}

if (targets.length === 0) {
  console.log('No CL files found.');
  process.exit(0);
}

let totalRemoved = 0, totalChanged = 0;
for (const t of targets) {
  try {
    const { changed, removedCount } = processFile(t, dryRun);
    if (changed) { totalChanged++; totalRemoved += removedCount; }
  } catch (err) {
    console.error(`[ERROR] ${t}: ${err.message}`);
  }
}

console.log(`\nDone. ${targets.length} file(s) scanned, ${totalChanged} cleaned, ${totalRemoved} invisible char(s) removed.`);
