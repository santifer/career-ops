#!/usr/bin/env node
/**
 * scripts/lint-built-html-js.mjs
 *
 * Extracts every <script>...</script> block from `dashboard/index.html` and
 * validates each as parseable JavaScript via `new Function(content)`.
 *
 * Catches the "outer-template-unescape" bug class: when an inner JS string
 * literal in scripts/build-dashboard.mjs contains a single-backslash escape
 * (`\n`, `\r`, `\t`, etc.), the outer backtick template literal unescapes it
 * BEFORE writing to dashboard/index.html — corrupting the JS string with a
 * literal control character, which the browser then parses as a SyntaxError.
 *
 * The safe pattern is either:
 *   - Double the escape in the source: `'\\n\\n'`  (preserves \n in the output)
 *   - Use String.fromCharCode(N): `String.fromCharCode(10)` (real newline at runtime)
 *
 * Usage:
 *   node scripts/lint-built-html-js.mjs                    # exit 0 if clean
 *   node scripts/lint-built-html-js.mjs --file <path.html> # check a specific HTML file
 *
 * Exits 0 on clean, 1 on parse errors, 2 on usage error.
 *
 * History:
 *   2026-05-19 — Mitchell sweep, created after fixing 2 instances of this bug
 *                class (NL in confirmTier5Run, CR in _updatePipelineToast).
 */

import { readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
let targetFiles = ['dashboard/index.html'];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i + 1]) {
    targetFiles = [args[i + 1]];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('usage: node scripts/lint-built-html-js.mjs [--file <path.html>]');
    process.exit(0);
  }
}

let totalBlocks = 0;
let totalFailed = 0;
const failures = [];

for (const file of targetFiles) {
  if (!existsSync(file)) {
    console.error(`✗ ${file}: file not found`);
    process.exit(2);
  }
  const html = readFileSync(file, 'utf-8');
  let pos = 0;
  let blockIdx = 0;
  while (true) {
    const openIdx = html.indexOf('<script', pos);
    if (openIdx < 0) break;
    const openEnd = html.indexOf('>', openIdx);
    if (openEnd < 0) break;
    const openTag = html.slice(openIdx, openEnd + 1);
    // Skip external scripts (no inline content to validate)
    if (/\bsrc\s*=/.test(openTag)) {
      pos = openEnd + 1;
      continue;
    }
    const closeIdx = html.indexOf('</script>', openEnd);
    if (closeIdx < 0) break;
    const content = html.slice(openEnd + 1, closeIdx);
    const startLine = html.slice(0, openIdx).split('\n').length;
    blockIdx++;
    totalBlocks++;
    try {
      // V8 parser via Function constructor — throws on SyntaxError, doesn't execute
      new Function(content);
    } catch (err) {
      totalFailed++;
      const lineMatch = /<anonymous>:(\d+):(\d+)/.exec(err.stack || '');
      const errLine = lineMatch ? parseInt(lineMatch[1], 10) : null;
      const absLine = errLine ? (startLine + errLine - 1) : startLine;
      const blockLines = content.split('\n');
      let snippet = '';
      if (errLine && errLine > 0 && errLine <= blockLines.length) {
        const from = Math.max(0, errLine - 2);
        const to = Math.min(blockLines.length, errLine + 1);
        snippet = blockLines.slice(from, to).map((l, i) => {
          const ln = from + i + 1;
          const marker = ln === errLine ? '> ' : '  ';
          return '    ' + marker + ln + ': ' + l.slice(0, 240);
        }).join('\n');
      }
      failures.push({ file, block: blockIdx, startLine, absLine, message: err.message, snippet });
    }
    pos = closeIdx + '</script>'.length;
  }
}

if (totalFailed > 0) {
  console.error(`✗ ${totalFailed} of ${totalBlocks} inline <script> blocks failed to parse:\n`);
  for (const f of failures) {
    console.error(`  ${f.file} block #${f.block} (~HTML line ${f.absLine})`);
    console.error(`    ${f.message}`);
    if (f.snippet) console.error(f.snippet);
    console.error('');
  }
  console.error('Hint: the outer-template-unescape bug class strikes when an inner JS string literal');
  console.error('      contains \\n / \\r / \\t (single backslash). Replace with String.fromCharCode(N)');
  console.error('      or use double-backslash (\\\\n) so the escape survives the outer template.');
  process.exit(1);
}

console.log(`✓ ${totalBlocks} inline <script> block(s) parsed cleanly across ${targetFiles.length} file(s).`);
process.exit(0);
