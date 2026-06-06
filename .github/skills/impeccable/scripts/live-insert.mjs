/**
 * CLI helper: find an anchor element in source and splice an insert-variant
 * wrapper before or after it (no original variant — net-new content).
 *
 * Usage:
 *   node live-insert.mjs --id SESSION_ID --count N --position after \
 *     --classes "hero" --tag section [--file path]
 */

import fs from 'node:fs';
import path from 'node:path';
import { isGeneratedFile } from './is-generated.mjs';
import {
  buildSearchQueries,
  findElement,
  findAllElements,
  filterByText,
  findFileWithQuery,
  detectCommentSyntax,
  detectStyleMode,
  buildCssAuthoring,
  buildCssSelectorPrefixExamples,
} from './live-wrap.mjs';
import {
  buildSvelteComponentCssAuthoring,
  scaffoldSvelteComponentInsertSession,
  shouldUseSvelteComponentInjection,
} from './live-svelte-component.mjs';

const INSERT_POSITIONS = new Set(['before', 'after']);

export function isInsertPosition(value) {
  return INSERT_POSITIONS.has(value);
}

export function computeInsertLine(startLine, endLine, position) {
  return position === 'before' ? startLine : endLine + 1;
}

export function buildInsertWrapperLines({ id, count, indent, commentSyntax, isJsx }) {
  const styleContents = isJsx ? 'style={{ display: "contents" }}' : 'style="display: contents"';
  const attrs =
    'data-impeccable-variants="' + id + '" ' +
    'data-impeccable-mode="insert" ' +
    'data-impeccable-variant-count="' + count + '" ' +
    styleContents;

  if (isJsx) {
    return [
      indent + '<div ' + attrs + '>',
      indent + '  ' + commentSyntax.open + ' impeccable-variants-start ' + id + ' ' + commentSyntax.close,
      indent + '  ' + commentSyntax.open + ' Variants: insert below this line ' + commentSyntax.close,
      indent + '  ' + commentSyntax.open + ' impeccable-variants-end ' + id + ' ' + commentSyntax.close,
      indent + '</div>',
    ];
  }

  return [
    indent + commentSyntax.open + ' impeccable-variants-start ' + id + ' ' + commentSyntax.close,
    indent + '<div ' + attrs + '>',
    indent + '  ' + commentSyntax.open + ' Variants: insert below this line ' + commentSyntax.close,
    indent + '</div>',
    indent + commentSyntax.open + ' impeccable-variants-end ' + id + ' ' + commentSyntax.close,
  ];
}

function argVal(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function resolveElementMatch({ lines, queries, tag, text }) {
  if (text) {
    const candidates = [];
    for (const q of queries) {
      const all = findAllElements(lines, q, tag);
      for (const c of all) {
        if (!candidates.some((x) => x.startLine === c.startLine)) candidates.push(c);
      }
      if (candidates.length === 1) break;
    }
    if (candidates.length === 0) return { error: 'element_not_found' };
    if (candidates.length === 1) return { match: candidates[0] };
    const filtered = filterByText(candidates, lines, text);
    if (filtered.length === 1) return { match: filtered[0] };
    if (filtered.length === 0) return { match: candidates[0] };
    return { error: 'element_ambiguous', candidates: filtered };
  }

  for (const q of queries) {
    const match = findElement(lines, q, tag);
    if (match) return { match };
  }
  return { error: 'element_not_found' };
}

export async function insertCli() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node live-insert.mjs [options]

Find an anchor element in source and splice an insert-variant wrapper.

Required:
  --id ID            Session ID for the variant wrapper
  --count N          Number of expected variants (1-8)
  --position POS     before | after (relative to the anchor element)

Element identification (at least one required):
  --element-id ID    HTML id attribute of the anchor element
  --classes A,B,C    Comma-separated CSS class names
  --tag TAG          Tag name (div, section, etc.)
  --query TEXT       Fallback: raw text to search for

Optional:
  --file PATH        Source file to search in (skips auto-detection)
  --text TEXT        Anchor textContent for disambiguation (~80 chars)

Output (JSON):
  { mode: "insert", file, position, insertLine, commentSyntax, styleMode, styleTag, cssAuthoring }`);
    process.exit(0);
  }

  const id = argVal(args, '--id');
  const count = parseInt(argVal(args, '--count') || '3', 10);
  const position = argVal(args, '--position');
  const elementId = argVal(args, '--element-id');
  const classes = argVal(args, '--classes');
  const tag = argVal(args, '--tag');
  const query = argVal(args, '--query');
  const filePath = argVal(args, '--file');
  const text = argVal(args, '--text');

  if (!id) { console.error('Missing --id'); process.exit(1); }
  if (!position) { console.error('Missing --position (before | after)'); process.exit(1); }
  if (!isInsertPosition(position)) { console.error('Invalid --position: ' + position); process.exit(1); }
  if (!elementId && !classes && !query) {
    console.error('Need at least one of: --element-id, --classes, --query');
    process.exit(1);
  }

  const queries = buildSearchQueries(elementId, classes, tag, query);
  const genOpts = { cwd: process.cwd() };

  let targetFile = filePath;
  if (!targetFile) {
    for (const q of queries) {
      targetFile = findFileWithQuery(q, process.cwd(), genOpts);
      if (targetFile) break;
    }
    if (!targetFile) {
      let generatedHit = null;
      for (const q of queries) {
        generatedHit = findFileWithQuery(q, process.cwd(), { ...genOpts, includeGenerated: true });
        if (generatedHit) break;
      }
      console.error(JSON.stringify({
        error: generatedHit ? 'element_not_in_source' : 'element_not_found',
        fallback: 'agent-driven',
        hint: 'See "Handle fallback" in live.md.',
      }));
      process.exit(1);
    }
  } else if (isGeneratedFile(targetFile, genOpts)) {
    console.error(JSON.stringify({
      error: 'file_is_generated',
      fallback: 'agent-driven',
      file: path.relative(process.cwd(), path.resolve(process.cwd(), targetFile)),
    }));
    process.exit(1);
  }

  const content = fs.readFileSync(targetFile, 'utf-8');
  const lines = content.split('\n');
  const resolved = resolveElementMatch({ lines, queries, tag, text });

  if (resolved.error === 'element_ambiguous') {
    console.error(JSON.stringify({
      error: 'element_ambiguous',
      fallback: 'agent-driven',
      file: path.relative(process.cwd(), targetFile),
      candidates: resolved.candidates.map((c) => ({
        startLine: c.startLine + 1,
        endLine: c.endLine + 1,
      })),
    }));
    process.exit(1);
  }
  if (!resolved.match) {
    console.error(JSON.stringify({ error: 'element_not_found', fallback: 'agent-driven' }));
    process.exit(1);
  }

  const { startLine, endLine } = resolved.match;
  const commentSyntax = detectCommentSyntax(targetFile);
  const styleMode = detectStyleMode(targetFile);
  const isJsx = commentSyntax.open === '{/*';
  const spliceIndex = computeInsertLine(startLine, endLine, position);
  const relTargetFile = path.relative(process.cwd(), targetFile).split(path.sep).join('/');

  if (shouldUseSvelteComponentInjection(targetFile)) {
    const session = scaffoldSvelteComponentInsertSession({
      id,
      count,
      sourceFile: relTargetFile,
      insertLine: spliceIndex + 1,
      position,
      anchorStartLine: startLine + 1,
      anchorEndLine: endLine + 1,
      anchorLines: lines.slice(startLine, endLine + 1),
      cwd: process.cwd(),
    });
    console.log(JSON.stringify({
      mode: 'insert',
      position,
      file: session.manifestFile,
      sourceFile: relTargetFile,
      previewMode: 'svelte-component',
      componentDir: session.componentDir,
      propContract: session.propContract,
      insertLine: 1,
      sourceInsertLine: spliceIndex + 1,
      anchorStartLine: startLine + 1,
      anchorEndLine: endLine + 1,
      commentSyntax,
      styleMode: 'svelte-component',
      styleTag: null,
      cssSelectorPrefixExamples: [],
      cssAuthoring: buildSvelteComponentCssAuthoring(count),
    }));
    return;
  }

  const indent = lines[spliceIndex]?.match(/^(\s*)/)?.[1]
    ?? lines[startLine]?.match(/^(\s*)/)?.[1]
    ?? '';

  const wrapperLines = buildInsertWrapperLines({
    id,
    count,
    indent,
    commentSyntax,
    isJsx,
  });

  const newLines = [
    ...lines.slice(0, spliceIndex),
    ...wrapperLines,
    ...lines.slice(spliceIndex),
  ];
  fs.writeFileSync(targetFile, newLines.join('\n'), 'utf-8');

  const insertLine = spliceIndex + 3;

  console.log(JSON.stringify({
    mode: 'insert',
    position,
    file: relTargetFile,
    insertLine: insertLine + 1,
    commentSyntax,
    styleMode: styleMode.mode,
    styleTag: styleMode.styleTag,
    cssSelectorPrefixExamples: buildCssSelectorPrefixExamples(styleMode.mode, count),
    cssAuthoring: buildCssAuthoring(styleMode, count),
  }));
}

const _running = process.argv[1];
if (_running?.endsWith('live-insert.mjs') || _running?.endsWith('live-insert.mjs/')) {
  insertCli();
}
