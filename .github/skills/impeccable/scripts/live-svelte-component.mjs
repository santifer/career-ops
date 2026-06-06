/**
 * Svelte live-mode component injection helpers.
 *
 * Variants are real .svelte components under node_modules/.impeccable-live/<session-id>/.
 * The browser mounts them via Svelte 5 mount(); accept inlines the chosen
 * variant back into the route source with props mapped to original bindings.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

export const SVELTE_COMPONENT_ROOT = 'node_modules/.impeccable-live';
export const SVELTE_RUNTIME_FILE = `${SVELTE_COMPONENT_ROOT}/__runtime.js`;
export const DEFERRED_ACCEPTS_FILE = '.impeccable/live/deferred-svelte-component-accepts.json';

const MUSTACHE_RE = /\{([^{}]+)\}/g;

export function shouldUseSvelteComponentInjection(filePath) {
  if (/^(0|false|no)$/i.test(process.env.IMPECCABLE_LIVE_SVELTE_COMPONENT || '')) return false;
  return path.extname(filePath).toLowerCase() === '.svelte';
}

export function componentSessionDir(id, cwd = process.cwd()) {
  return path.join(cwd, SVELTE_COMPONENT_ROOT, id);
}

export function manifestPathForSession(id, cwd = process.cwd()) {
  return path.join(componentSessionDir(id, cwd), 'manifest.json');
}

export function ensureRuntimeHelper(cwd = process.cwd()) {
  const file = path.join(cwd, SVELTE_RUNTIME_FILE);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `export { mount, unmount } from 'svelte';\n`, 'utf-8');
  return file;
}

/**
 * Extract ordered unique mustache expressions from markup (not inside <!-- -->).
 */
export function extractMustacheExpressions(text) {
  const expressions = [];
  const seen = new Set();
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('<!--')) continue;
    let match;
    MUSTACHE_RE.lastIndex = 0;
    while ((match = MUSTACHE_RE.exec(line)) !== null) {
      const expr = match[1].trim();
      if (!expr || seen.has(expr)) continue;
      seen.add(expr);
      expressions.push(expr);
    }
  }
  return expressions;
}

export function buildPropContract(expressions) {
  return expressions.map((expr, index) => {
    const derived = derivePropName(expr, index);
    return {
      prop: derived,
      expr,
      placeholder: `{${expr}}`,
    };
  });
}

function derivePropName(expr, index) {
  const tail = expr.match(/(?:\.|\[)(\w+)\s*\]?$/);
  if (tail && tail[1] && /^[A-Za-z_$][\w$]*$/.test(tail[1])) {
    return tail[1];
  }
  return `prop${index}`;
}

export function substituteExprsWithProps(markup, contract) {
  let out = String(markup || '');
  for (const entry of contract) {
    out = out.split(entry.placeholder).join(`{${entry.prop}}`);
  }
  return out;
}

export function substitutePropsWithExprs(markup, contract) {
  let out = String(markup || '');
  for (const entry of contract) {
    out = out.split(`{${entry.prop}}`).join(`{${entry.expr}}`);
  }
  return out;
}

export function parseSvelteComponentFile(content) {
  const text = String(content || '');
  const scriptMatch = text.match(/^([\s\S]*?)<script\b[^>]*>[\s\S]*?<\/script>/i);
  const withoutScript = scriptMatch ? text.slice(scriptMatch[0].length) : text;
  const styleMatch = withoutScript.match(/<style\b[^>]*>[\s\S]*?<\/style\s*>/i);
  const styleBlock = styleMatch ? styleMatch[0] : '';
  const markup = styleMatch
    ? withoutScript.slice(0, styleMatch.index).trim()
    : withoutScript.trim();
  const cssLines = styleBlock
    ? styleBlock
      .replace(/^<style\b[^>]*>/i, '')
      .replace(/<\/style\s*>$/i, '')
      .split('\n')
      .map((line) => line.trimEnd())
    : [];
  while (cssLines.length > 0 && cssLines[0].trim() === '') cssLines.shift();
  while (cssLines.length > 0 && cssLines[cssLines.length - 1].trim() === '') cssLines.pop();
  return { markup, cssLines, styleBlock };
}

function buildPropsScript(contract) {
  if (contract.length === 0) {
    return '<script>\n  /** @type {Record<string, never>} */\n  let {} = $props();\n</script>\n';
  }
  const names = contract.map((c) => c.prop).join(', ');
  const typeFields = contract.map((c) => `    ${c.prop}: string;`).join('\n');
  return `<script>\n  /** @type {{\n${typeFields}\n  }} */\n  let { ${names} } = $props();\n</script>\n`;
}

function buildVariantStub(variantNum, originalWithProps, contract) {
  const propsComment = contract.length > 0
    ? `\n<!-- Props: ${contract.map((c) => `${c.prop} <- {${c.expr}}`).join(', ')} -->\n`
    : '';
  return `${buildPropsScript(contract)}${propsComment}${originalWithProps.trim()}\n\n<style>\n  /* Variant ${variantNum}: add scoped CSS here */\n</style>\n`;
}

function buildInsertVariantStub(variantNum) {
  return `${buildPropsScript([])}<div class="impeccable-insert-preview">Insert variant ${variantNum}</div>\n\n<style>\n  .impeccable-insert-preview { display: block; }\n</style>\n`;
}

export function scaffoldSvelteComponentSession({
  id,
  count,
  sourceFile,
  sourceStartLine,
  sourceEndLine,
  originalLines,
  cwd = process.cwd(),
}) {
  ensureRuntimeHelper(cwd);
  const dir = componentSessionDir(id, cwd);
  fs.mkdirSync(dir, { recursive: true });

  const originalMarkup = originalLines.join('\n');
  const contract = buildPropContract(extractMustacheExpressions(originalMarkup));
  const originalWithProps = substituteExprsWithProps(originalMarkup, contract);

  const manifest = {
    id,
    previewMode: 'svelte-component',
    sourceFile: sourceFile.split(path.sep).join('/'),
    sourceStartLine,
    sourceEndLine,
    count,
    propContract: contract,
    originalMarkup,
    componentDir: path.relative(cwd, dir).split(path.sep).join('/'),
    runtimeModule: `/${SVELTE_RUNTIME_FILE}`,
  };

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  for (let n = 1; n <= count; n++) {
    const variantFile = path.join(dir, `v${n}.svelte`);
    if (!fs.existsSync(variantFile)) {
      fs.writeFileSync(variantFile, buildVariantStub(n, originalWithProps, contract), 'utf-8');
    }
  }

  return {
    manifest,
    manifestFile: path.relative(cwd, path.join(dir, 'manifest.json')).split(path.sep).join('/'),
    componentDir: manifest.componentDir,
    propContract: contract,
  };
}

export function scaffoldSvelteComponentInsertSession({
  id,
  count,
  sourceFile,
  insertLine,
  position,
  anchorStartLine,
  anchorEndLine,
  anchorLines,
  cwd = process.cwd(),
}) {
  ensureRuntimeHelper(cwd);
  const dir = componentSessionDir(id, cwd);
  fs.mkdirSync(dir, { recursive: true });

  const anchorMarkup = (anchorLines || []).join('\n');
  const manifest = {
    id,
    mode: 'insert',
    previewMode: 'svelte-component',
    sourceFile: sourceFile.split(path.sep).join('/'),
    insertLine,
    position,
    anchorStartLine,
    anchorEndLine,
    originalMarkup: anchorMarkup,
    anchorMarkup,
    count,
    propContract: [],
    componentDir: path.relative(cwd, dir).split(path.sep).join('/'),
    runtimeModule: `/${SVELTE_RUNTIME_FILE}`,
  };

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  for (let n = 1; n <= count; n++) {
    const variantFile = path.join(dir, `v${n}.svelte`);
    if (!fs.existsSync(variantFile)) {
      fs.writeFileSync(variantFile, buildInsertVariantStub(n), 'utf-8');
    }
  }

  return {
    manifest,
    manifestFile: path.relative(cwd, path.join(dir, 'manifest.json')).split(path.sep).join('/'),
    componentDir: manifest.componentDir,
    propContract: [],
  };
}

export function findSvelteComponentManifest(id, cwd = process.cwd()) {
  const direct = manifestPathForSession(id, cwd);
  if (fs.existsSync(direct)) {
    return readManifest(direct);
  }
  const root = path.join(cwd, SVELTE_COMPONENT_ROOT);
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name, 'manifest.json');
    if (!fs.existsSync(candidate)) continue;
    try {
      const manifest = readManifest(candidate);
      if (manifest?.id === id) return { ...manifest, manifestPath: candidate };
    } catch { /* skip */ }
  }
  return null;
}

export function readManifest(manifestPath) {
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return {
    ...data,
    manifestPath,
  };
}

export function resolveSourceFile(sourceFile, cwd = process.cwd()) {
  if (!sourceFile || path.isAbsolute(sourceFile)) {
    throw new Error('Invalid svelte-component source file');
  }
  const full = path.resolve(cwd, sourceFile);
  const rel = path.relative(cwd, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Svelte-component source file escapes project root');
  }
  if (!fs.existsSync(full)) {
    throw new Error('Svelte-component source file not found: ' + sourceFile);
  }
  return full;
}

function appendCssToSvelteStyle(lines, cssLines) {
  const closeIdx = findLastStyleCloseLine(lines);
  const prepared = ['', ...cssLines.map((line) => (line.trim() === '' ? '' : '  ' + line.trimStart()))];
  if (closeIdx === -1) {
    return [...lines, '', '<style>', ...prepared.slice(1), '</style>'];
  }
  return [
    ...lines.slice(0, closeIdx),
    ...prepared,
    ...lines.slice(closeIdx),
  ];
}

function findLastStyleCloseLine(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/<\/style\s*>/.test(lines[i])) return i;
  }
  return -1;
}

function bakeParamValuesInCss(cssLines, paramValues) {
  if (!paramValues || Object.keys(paramValues).length === 0) return cssLines;
  return cssLines.map((line) => {
    let out = line;
    for (const [key, value] of Object.entries(paramValues)) {
      const varName = `--p-${key}`;
      out = out.replace(new RegExp(`var\\(${escapeRegExp(varName)}(?:,\\s*[^)]+)?\\)`, 'g'), String(value));
    }
    return out;
  });
}

function sanitizeAcceptedSvelteCss(cssLines, variantNum, paramValues = null, rootTag = 'div') {
  const css = String((cssLines || []).join('\n'));
  if (!/data-impeccable-variant|impeccable-variant-ready/.test(css)) return cssLines;

  const rules = parseCssRules(css);
  const output = [];
  for (const rule of rules) {
    appendSanitizedCssRule(output, rule, variantNum, paramValues, rootTag);
  }
  return output.join('\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
}

function appendSanitizedCssRule(output, rule, variantNum, paramValues, rootTag) {
  const prelude = rule.prelude.trim();
  const body = rule.body.trim();
  if (!prelude || !body || /--impeccable-variant-ready\s*:/.test(body)) return;

  if (/^@scope\b/i.test(prelude)) {
    if (/data-impeccable-variant/.test(prelude) && !selectorHasVariant(prelude, variantNum)) return;
    const inner = parseCssRules(body);
    for (const innerRule of inner) {
      const rewrittenPrelude = rewriteAcceptedSvelteSelector(innerRule.prelude, variantNum, paramValues, rootTag, true);
      if (!rewrittenPrelude || /--impeccable-variant-ready\s*:/.test(innerRule.body)) continue;
      output.push(formatCssRule(rewrittenPrelude, innerRule.body.trim()));
    }
    return;
  }

  const rewrittenPrelude = rewriteAcceptedSvelteSelector(prelude, variantNum, paramValues, rootTag, false);
  if (!rewrittenPrelude) return;
  output.push(formatCssRule(rewrittenPrelude, body));
}

function parseCssRules(css) {
  const rules = [];
  const text = String(css || '');
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    const preludeStart = i;
    while (i < text.length && text[i] !== '{') i++;
    if (i >= text.length) break;
    const prelude = text.slice(preludeStart, i).trim();
    i++;
    const bodyStart = i;
    let depth = 1;
    let quote = null;
    let comment = false;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      const next = text[i + 1];
      if (comment) {
        if (ch === '*' && next === '/') {
          comment = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (quote) {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        comment = true;
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    const body = text.slice(bodyStart, Math.max(bodyStart, i - 1));
    if (prelude) rules.push({ prelude, body });
  }
  return rules;
}

function rewriteAcceptedSvelteSelector(prelude, variantNum, paramValues, rootTag, fromScope) {
  const selectors = splitSelectorList(prelude);
  const rewritten = [];
  for (const selector of selectors) {
    const next = rewriteAcceptedSvelteSelectorPart(selector, variantNum, paramValues, rootTag, fromScope);
    if (next) rewritten.push(next);
  }
  return rewritten.join(', ');
}

function rewriteAcceptedSvelteSelectorPart(selector, variantNum, paramValues, rootTag, fromScope) {
  let out = selector.trim();
  const hasVariant = /data-impeccable-variant/.test(out);
  if (hasVariant && !selectorHasVariant(out, variantNum)) return '';
  if (hasVariant) {
    out = out.replace(variantSelectorRegex(variantNum), '');
    out = out.replace(/\[data-impeccable-variant=(["']).*?\1\]/g, '');
  }

  const paramResult = rewriteParamSelectors(out, paramValues);
  if (!paramResult.keep) return '';
  out = paramResult.selector;

  out = out
    .replace(/:scope(?:\[[^\]]+\])?\s*>\s*/g, '')
    .replace(/:scope(?:\[[^\]]+\])?/g, rootTag || '')
    .replace(/\s+/g, ' ')
    .trim();

  out = out.replace(/^[>+~]\s*/, '').trim();
  if (!out && (hasVariant || fromScope)) return rootTag || ':global(*)';
  return out;
}

function rewriteParamSelectors(selector, paramValues) {
  let keep = true;
  const next = selector.replace(/\[data-p-([A-Za-z0-9_-]+)(?:=(["'])(.*?)\2)?\]/g, (_match, key, _quote, expected) => {
    if (!paramValues || !Object.prototype.hasOwnProperty.call(paramValues, key)) return '';
    const actual = paramValues[key];
    if (expected != null && String(actual) !== String(expected)) {
      keep = false;
      return '';
    }
    if (expected == null && (actual === false || actual == null || actual === 'false' || actual === 'off' || actual === '0')) {
      keep = false;
      return '';
    }
    return '';
  });
  return { keep, selector: next };
}

function splitSelectorList(prelude) {
  const selectors = [];
  let start = 0;
  let bracket = 0;
  let paren = 0;
  let quote = null;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '[') bracket++;
    else if (ch === ']') bracket = Math.max(0, bracket - 1);
    else if (ch === '(') paren++;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    else if (ch === ',' && bracket === 0 && paren === 0) {
      selectors.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  selectors.push(prelude.slice(start));
  return selectors;
}

function selectorHasVariant(selector, variantNum) {
  return variantSelectorRegex(variantNum).test(selector);
}

function variantSelectorRegex(variantNum) {
  return new RegExp(`\\[data-impeccable-variant=(["'])${escapeRegExp(String(variantNum))}\\1\\]`, 'g');
}

function formatCssRule(selector, body) {
  return `${selector} { ${body.trim()} }`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function inlineSvelteComponentAccept(manifest, variantNum, paramValues = null, cwd = process.cwd()) {
  const sourceFile = resolveSourceFile(manifest.sourceFile, cwd);
  const variantPath = path.join(cwd, manifest.componentDir, `v${variantNum}.svelte`);
  const resultBase = {
    file: manifest.sourceFile,
    sourceFile: manifest.sourceFile,
    previewMode: 'svelte-component',
    componentDir: manifest.componentDir,
    carbonize: false,
  };
  if (!fs.existsSync(variantPath)) {
    return { handled: false, error: `Variant ${variantNum} not found`, ...resultBase };
  }

  const { markup, cssLines } = parseSvelteComponentFile(fs.readFileSync(variantPath, 'utf-8'));
  if (manifest.mode === 'insert') {
    return inlineSvelteComponentInsertAccept({
      manifest,
      markup,
      cssLines,
      variantNum,
      paramValues,
      sourceFile,
      resultBase,
      cwd,
    });
  }

  const rootTag = matchOpeningTag(markup)?.tag || 'div';
  const contract = manifest.propContract || [];
  const mergedMarkup = mergeOriginalTopLevelAttrs(markup, manifest.originalMarkup || '');
  const restoredMarkup = substitutePropsWithExprs(mergedMarkup, contract)
    .split('\n')
    .map((line) => line.trimEnd());

  const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
  const sourceLines = sourceContent.split('\n');
  const start = Number(manifest.sourceStartLine) - 1;
  const end = Number(manifest.sourceEndLine) - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= sourceLines.length) {
    return { handled: false, error: 'Invalid source line range for ' + manifest.sourceFile, ...resultBase };
  }

  const indent = sourceLines[start].match(/^(\s*)/)?.[1] || '';
  const indentedMarkup = restoredMarkup.map((line) => {
    if (line.trim() === '') return '';
    return indent + line.trimStart();
  });

  let newLines = [
    ...sourceLines.slice(0, start),
    ...indentedMarkup,
    ...sourceLines.slice(end + 1),
  ];

  const sanitizedCss = sanitizeAcceptedSvelteCss(cssLines, variantNum, paramValues, rootTag);
  const bakedCss = bakeParamValuesInCss(sanitizedCss, paramValues);
  if (bakedCss.length > 0) {
    newLines = appendCssToSvelteStyle(newLines, bakedCss);
  }

  try {
    fs.writeFileSync(sourceFile, newLines.join('\n'), 'utf-8');
  } catch (err) {
    return { handled: false, error: 'Failed to write Svelte source: ' + err.message, ...resultBase };
  }
  removeSvelteComponentSession(manifest.id, cwd);

  return {
    handled: true,
    ...resultBase,
  };
}

function inlineSvelteComponentInsertAccept({
  manifest,
  markup,
  cssLines,
  variantNum,
  paramValues,
  sourceFile,
  resultBase,
  cwd,
}) {
  if (!svelteMarkupHasVisibleContent(markup)) {
    return { handled: false, error: 'Accepted Svelte insert variant is empty', ...resultBase };
  }
  if (/\bdata-impeccable-[\w-]*\s*=/.test(markup)) {
    return { handled: false, error: 'Accepted Svelte insert variant contains preview-only data-impeccable attributes', ...resultBase };
  }

  const rootTag = matchOpeningTag(markup)?.tag || 'div';
  const restoredMarkup = String(markup || '')
    .split('\n')
    .map((line) => line.trimEnd());
  const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
  const sourceLines = sourceContent.split('\n');
  const insertIndex = Number(manifest.insertLine) - 1;
  if (!Number.isInteger(insertIndex) || insertIndex < 0 || insertIndex > sourceLines.length) {
    return { handled: false, error: 'Invalid insert line for ' + manifest.sourceFile, ...resultBase };
  }

  const nearbyLine = sourceLines[insertIndex] ?? sourceLines[insertIndex - 1] ?? '';
  const indent = nearbyLine.match(/^(\s*)/)?.[1] || '';
  const indentedMarkup = restoredMarkup.map((line) => {
    if (line.trim() === '') return '';
    return indent + line.trimStart();
  });

  let newLines = [
    ...sourceLines.slice(0, insertIndex),
    ...indentedMarkup,
    ...sourceLines.slice(insertIndex),
  ];

  const sanitizedCss = sanitizeAcceptedSvelteCss(cssLines, variantNum, paramValues, rootTag);
  const bakedCss = bakeParamValuesInCss(sanitizedCss, paramValues);
  if (bakedCss.length > 0) {
    newLines = appendCssToSvelteStyle(newLines, bakedCss);
  }

  try {
    fs.writeFileSync(sourceFile, newLines.join('\n'), 'utf-8');
  } catch (err) {
    return { handled: false, error: 'Failed to write Svelte source: ' + err.message, ...resultBase };
  }
  removeSvelteComponentSession(manifest.id, cwd);

  return {
    handled: true,
    ...resultBase,
  };
}

function svelteMarkupHasVisibleContent(markup) {
  const text = String(markup || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 0) return true;
  return /<(img|svg|canvas|video|audio|picture|input|button|select|textarea)\b/i.test(markup || '');
}

function mergeOriginalTopLevelAttrs(markup, originalMarkup) {
  const variantOpen = matchOpeningTag(markup);
  const originalOpen = matchOpeningTag(originalMarkup);
  if (!variantOpen || !originalOpen) return markup;
  if (variantOpen.tag.toLowerCase() !== originalOpen.tag.toLowerCase()) return markup;

  const variantAttrs = parseAttrSegments(variantOpen.attrs);
  const originalAttrs = parseAttrSegments(originalOpen.attrs);
  const additions = [];
  let attrs = variantOpen.attrs;

  const originalClass = originalAttrs.get('class');
  const variantClass = variantAttrs.get('class');
  if (originalClass && variantClass) {
    const merged = mergeStaticClassAttr(originalClass, variantClass);
    if (merged) {
      attrs = attrs.slice(0, variantClass.start) + merged + attrs.slice(variantClass.end);
      variantAttrs.set('class', { ...variantClass, raw: merged });
    }
  } else if (originalClass && !variantClass) {
    additions.push(originalClass.raw);
  }

  for (const [name, attr] of originalAttrs) {
    if (name === 'class') continue;
    if (!variantAttrs.has(name)) additions.push(attr.raw);
  }

  if (additions.length === 0 && attrs === variantOpen.attrs) return markup;
  const nextOpen = variantOpen.prefix
    + variantOpen.tag
    + attrs
    + additions.map((attr) => ' ' + attr.trim()).join('')
    + variantOpen.close;
  return markup.slice(0, variantOpen.index) + nextOpen + markup.slice(variantOpen.index + variantOpen.raw.length);
}

function matchOpeningTag(markup) {
  const match = String(markup || '').match(/^(\s*<)([A-Za-z][\w:-]*)([^>]*?)(\/?>)/);
  if (!match) return null;
  return {
    raw: match[0],
    prefix: match[1],
    tag: match[2],
    attrs: match[3] || '',
    close: match[4],
    index: match.index || 0,
  };
}

function parseAttrSegments(attrs) {
  const out = new Map();
  const re = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s"'>=]+))?/g;
  let match;
  while ((match = re.exec(attrs))) {
    const raw = match[0];
    const name = match[1];
    out.set(name, {
      name,
      raw,
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return out;
}

function mergeStaticClassAttr(originalClass, variantClass) {
  const originalValue = originalClass.raw.match(/class\s*=\s*(["'])(.*?)\1/);
  const variantValue = variantClass.raw.match(/class\s*=\s*(["'])(.*?)\1/);
  if (!originalValue || !variantValue) return null;
  const quote = variantValue[1];
  const classes = [
    ...variantValue[2].split(/\s+/),
    ...originalValue[2].split(/\s+/),
  ].filter(Boolean);
  return `class=${quote}${[...new Set(classes)].join(' ')}${quote}`;
}

export function removeSvelteComponentSession(id, cwd = process.cwd()) {
  const dir = componentSessionDir(id, cwd);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* non-fatal */ }
}

export function removeAllSvelteComponentSessions(cwd = process.cwd()) {
  const root = path.join(cwd, SVELTE_COMPONENT_ROOT);
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('__')) continue;
    try {
      fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
    } catch { /* non-fatal */ }
  }
}

export function deferredAcceptsPath(cwd = process.cwd()) {
  const key = createHash('sha1').update(path.resolve(cwd)).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), 'impeccable-live', key, 'deferred-svelte-component-accepts.json');
}

export function readDeferredAccepts(cwd = process.cwd()) {
  const file = deferredAcceptsPath(cwd);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return { accepts: [] };
  }
}

export function writeDeferredAccept(entry, cwd = process.cwd()) {
  const file = deferredAcceptsPath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = readDeferredAccepts(cwd);
  data.accepts = (data.accepts || []).filter((item) => item.id !== entry.id);
  data.accepts.push({ ...entry, createdAt: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function applyDeferredSvelteComponentAccepts(cwd = process.cwd()) {
  const file = deferredAcceptsPath(cwd);
  const data = readDeferredAccepts(cwd);
  const pending = Array.isArray(data.accepts) ? data.accepts : [];
  const results = [];
  const remaining = [];
  for (const entry of pending) {
    try {
      const manifest = findSvelteComponentManifest(entry.id, cwd);
      if (!manifest) {
        results.push({ id: entry.id, ok: false, error: 'manifest not found' });
        remaining.push(entry);
        continue;
      }
      const result = inlineSvelteComponentAccept(
        manifest,
        entry.variantNum,
        entry.paramValues || null,
        cwd,
      );
      results.push({ id: entry.id, ok: result.handled !== false, result });
      if (result.handled === false) remaining.push(entry);
    } catch (err) {
      results.push({ id: entry.id, ok: false, error: err.message });
      remaining.push(entry);
    }
  }
  if (remaining.length > 0) {
    fs.writeFileSync(file, JSON.stringify({ accepts: remaining }, null, 2) + '\n', 'utf-8');
  } else {
    try { fs.rmSync(file, { force: true }); } catch {}
  }
  return { applied: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

export function buildSvelteComponentCssAuthoring(count) {
  const variantNumbers = Array.from({ length: count }, (_, i) => i + 1);
  return {
    mode: 'svelte-component',
    styleTag: null,
    strategy: 'component-style-block',
    rulePattern: '.semantic-class { ... }',
    selectorExamples: variantNumbers.map(() => '.expense-row { padding: 22px; }'),
    requirements: [
      'Write each variant as a real Svelte component file (v1.svelte, v2.svelte, ...).',
      'Keep the prop names from propContract; bind dynamic text with {propName}, not literal snapshot text.',
      'Put variant CSS in the component <style> block using semantic class selectors.',
      'Author param-driven CSS against var(--p-<id>, default) and [data-p-<id>] using :global(...) so the runtime knob values reach the mounted root.',
      'Declare params in componentDir/params.json keyed by variant number (e.g. {"1": [...], "2": [...]}), NOT as a data-impeccable-params attribute.',
      'Do not use @scope or data-impeccable-variant selectors in component files.',
      'Do not edit the route source file during generation; only edit files under componentDir.',
    ],
    forbidden: [
      'Do not use @scope blocks in Svelte component variants.',
      'Do not copy live DOM snapshot text into markup when propContract provides bindings.',
      'Do not add data-impeccable-* attributes inside component files. Svelte parses { in attribute values as an expression, so data-impeccable-params with JSON breaks the build; use componentDir/params.json instead.',
    ],
    paramsFile: 'params.json',
  };
}
