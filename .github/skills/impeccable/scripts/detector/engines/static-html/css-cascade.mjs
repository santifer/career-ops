import fs from 'node:fs';
import path from 'node:path';

import { profileStep, recordProfileEvent } from '../../profile/profiler.mjs';
import { parseAnyColor, resolveLengthPx, resolveVarRefs } from '../../rules/checks.mjs';

// ---------------------------------------------------------------------------
// jsdom CSS-variable border override map
// ---------------------------------------------------------------------------
//
// jsdom's CSSOM silently drops any border shorthand that contains a var()
// reference — the computed style for the element then shows empty width,
// empty style, and a default black color. That's enough to hide the most
// common real-world side-tab pattern in AI-generated pages:
//
//   :root { --brand: #87a8ff; }
//   .card { border-left: 5px solid var(--brand); border-radius: 4px; }
//
// Real browsers (and therefore the browser detector path) resolve var()
// natively, so this only affects the Node jsdom path.
//
// This pre-pass walks the stylesheets, finds any rule whose per-side or
// all-sides border property contains var(), resolves the var() against
// :root-level custom properties (read from the documentElement's computed
// style, which jsdom DOES handle correctly), and attaches the resolved
// width+color to every element that matches the rule's selector. The
// Node-side `checkElementBorders` adapter consumes that map as a fallback
// whenever jsdom's computed style came back empty.
//
// Limitations (intentional, to keep the pass simple):
//   * Only :root-level custom properties are resolved. Scoped overrides on
//     descendants are not tracked — uncommon in practice and would require
//     a per-element cascade walk.
//   * @media / @supports wrapped rules are ignored (jsdom often mishandles
//     these anyway).
//   * The fallback only fills sides that jsdom left empty, so any rule
//     whose border parses normally still wins via the computed style.

const BORDER_SHORTHAND_RE = /^(\d+(?:\.\d+)?)px\s+(solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(.+)$/i;

// isNeutralColor only understands rgba()/oklch()/lch()/lab()/hsl()/hwb().
// CSS variables typically hold hex or named colors, so normalize those to
// rgb() before handing the value off to the shared check. Anything we don't
// recognise is passed through unchanged — isNeutralColor then treats it as
// non-neutral, which is the safer default (matches the oklch-era bugfix).
const NAMED_COLORS = {
  white: [255, 255, 255], black: [0, 0, 0], gray: [128, 128, 128],
  grey: [128, 128, 128], silver: [192, 192, 192], red: [255, 0, 0],
  green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
};

function normalizeColorForCheck(value) {
  if (!value) return value;
  const v = value.trim();
  const hex6 = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex6) {
    const [r, g, b] = [parseInt(hex6[1], 16), parseInt(hex6[2], 16), parseInt(hex6[3], 16)];
    return `rgb(${r}, ${g}, ${b})`;
  }
  const hex3 = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (hex3) {
    const [r, g, b] = [
      parseInt(hex3[1] + hex3[1], 16),
      parseInt(hex3[2] + hex3[2], 16),
      parseInt(hex3[3] + hex3[3], 16),
    ];
    return `rgb(${r}, ${g}, ${b})`;
  }
  const named = NAMED_COLORS[v.toLowerCase()];
  if (named) return `rgb(${named[0]}, ${named[1]}, ${named[2]})`;
  return v;
}

function buildBorderOverrideMap(document, window) {
  const map = new Map();
  const rootStyle = window.getComputedStyle(document.documentElement);

  function resolveVar(value, depth = 0) {
    if (!value || depth > 10 || !value.includes('var(')) return value;
    return value.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\s*\)/g,
      (_, name, fallback) => {
        const v = rootStyle.getPropertyValue(name).trim();
        if (v) return resolveVar(v, depth + 1);
        if (fallback) return resolveVar(fallback.trim(), depth + 1);
        return '';
      }
    );
  }

  function parseShorthand(text) {
    const m = text.trim().match(BORDER_SHORTHAND_RE);
    if (!m) return null;
    return { width: parseFloat(m[1]), color: normalizeColorForCheck(m[3]) };
  }

  // Read from the per-property accessors on rule.style. jsdom preserves
  // each border-* shorthand it parsed, even when the overall cssText has
  // been truncated (e.g. a `border: 1px solid var(...)` followed by a
  // `border-left: ...` loses the first declaration but keeps the second).
  const SIDE_PROPS = [
    ['borderLeft', 'Left'],
    ['borderRight', 'Right'],
    ['borderTop', 'Top'],
    ['borderBottom', 'Bottom'],
    ['borderInlineStart', 'Left'],
    ['borderInlineEnd', 'Right'],
  ];

  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules || []; } catch { continue; }
    for (const rule of rules) {
      // CSSStyleRule only; skip @media / @keyframes / @supports wrappers.
      if (rule.type !== 1 || !rule.style || !rule.selectorText) continue;

      const perSide = {};

      for (const [prop, side] of SIDE_PROPS) {
        const val = rule.style[prop];
        if (!val || !val.includes('var(')) continue;
        const parsed = parseShorthand(resolveVar(val));
        if (parsed && parsed.color) perSide[side] = parsed;
      }

      // Uniform `border: <w> <style> var(...)` applies to every side the
      // per-side map didn't already claim.
      const borderAll = rule.style.border;
      if (borderAll && borderAll.includes('var(')) {
        const parsed = parseShorthand(resolveVar(borderAll));
        if (parsed && parsed.color) {
          for (const s of ['Top', 'Right', 'Bottom', 'Left']) {
            if (!perSide[s]) perSide[s] = parsed;
          }
        }
      }

      // Longhand `border-*-color: var(...)` with width/style in separate
      // declarations. Rare in AI-generated pages, but cheap to cover.
      for (const [prop, side] of [
        ['borderLeftColor', 'Left'],
        ['borderRightColor', 'Right'],
        ['borderTopColor', 'Top'],
        ['borderBottomColor', 'Bottom'],
      ]) {
        const val = rule.style[prop];
        if (!val || !val.includes('var(')) continue;
        const resolved = resolveVar(val).trim();
        if (!resolved) continue;
        // Width may or may not come from this rule — that's fine; the
        // adapter only substitutes the color when jsdom left it as a
        // literal var() string.
        if (!perSide[side]) perSide[side] = { width: 0, color: normalizeColorForCheck(resolved) };
      }

      if (Object.keys(perSide).length === 0) continue;

      let matched;
      try { matched = document.querySelectorAll(rule.selectorText); }
      catch { continue; }

      for (const el of matched) {
        const existing = map.get(el);
        if (existing) {
          // Later rules overwrite earlier ones — approximates source-order
          // cascade for equal-specificity rules and is good enough for the
          // uncontested var()-dropped sides we're trying to recover.
          Object.assign(existing, perSide);
        } else {
          map.set(el, { ...perSide });
        }
      }
    }
  }

  return map;
}

// Strip `@layer NAME { … }` wrappers from a CSS / HTML source, leaving
// the inner rules as flat CSS. jsdom doesn't implement CSS @layer, so
// any rule inside a layer block becomes invisible to getComputedStyle.
// Tailwind v4 makes this ubiquitous: every utility class lives in
// `@layer utilities`, and Preflight lives in `@layer base`. Without
// unwrapping, every Tailwind-styled element returns empty computed
// styles. We walk the source character-by-character, balancing braces
// so we correctly handle nested style rules inside the layer block.
function unwrapCssAtLayer(source) {
  if (!source || !source.includes('@layer')) return source;
  // Find `@layer <name>? {` openers. The match starts at the @, and
  // we then balance braces from the opening { onward.
  const re = /@layer\b[^{;]*\{/g;
  let out = '';
  let lastIdx = 0;
  let m;
  while ((m = re.exec(source)) !== null) {
    const openStart = m.index;
    const openEnd = m.index + m[0].length; // position right after `{`
    let depth = 1;
    let i = openEnd;
    while (i < source.length && depth > 0) {
      const c = source.charCodeAt(i);
      if (c === 0x7b /* { */) depth++;
      else if (c === 0x7d /* } */) depth--;
      i++;
    }
    if (depth !== 0) {
      // Unbalanced — bail and return source unchanged.
      return source;
    }
    // Emit everything before the @layer, then the inner contents
    // (between the opening { and the matched closing }), then advance.
    out += source.slice(lastIdx, openStart);
    out += source.slice(openEnd, i - 1); // i-1 = position of the closing }
    lastIdx = i;
    re.lastIndex = i;
  }
  out += source.slice(lastIdx);
  return out;
}

// ---------------------------------------------------------------------------
// Static HTML/CSS detection (default for local HTML files)
// ---------------------------------------------------------------------------

const STATIC_INHERITED_PROPS = new Set([
  'color', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight',
  'lineHeight', 'letterSpacing', 'textTransform', 'textAlign', 'hyphens',
  'webkitHyphens',
]);

const STATIC_DEFAULT_STYLE = {
  color: 'rgb(0, 0, 0)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  backgroundImage: 'none',
  borderTopWidth: '0px',
  borderRightWidth: '0px',
  borderBottomWidth: '0px',
  borderLeftWidth: '0px',
  borderTopColor: 'rgb(0, 0, 0)',
  borderRightColor: 'rgb(0, 0, 0)',
  borderBottomColor: 'rgb(0, 0, 0)',
  borderLeftColor: 'rgb(0, 0, 0)',
  borderRadius: '0px',
  outlineWidth: '0px',
  outlineColor: 'rgb(0, 0, 0)',
  outlineStyle: 'none',
  boxShadow: 'none',
  fontFamily: '',
  fontSize: '16px',
  fontStyle: 'normal',
  fontWeight: '400',
  lineHeight: 'normal',
  letterSpacing: 'normal',
  textTransform: 'none',
  textAlign: 'start',
  hyphens: 'manual',
  webkitHyphens: 'manual',
  transitionProperty: '',
  transitionTimingFunction: '',
  animationName: '',
  animationTimingFunction: '',
  webkitBackgroundClip: '',
  backgroundClip: '',
  width: '',
  height: '',
  paddingTop: '0px',
  paddingRight: '0px',
  paddingBottom: '0px',
  paddingLeft: '0px',
  position: 'static',
  display: '',
  overflow: 'visible',
  overflowX: 'visible',
  overflowY: 'visible',
};

const STATIC_PROP_MAP = {
  'background-color': 'backgroundColor',
  'background-image': 'backgroundImage',
  'background-clip': 'backgroundClip',
  '-webkit-background-clip': 'webkitBackgroundClip',
  'border-radius': 'borderRadius',
  'border-top-width': 'borderTopWidth',
  'border-right-width': 'borderRightWidth',
  'border-bottom-width': 'borderBottomWidth',
  'border-left-width': 'borderLeftWidth',
  'border-top-color': 'borderTopColor',
  'border-right-color': 'borderRightColor',
  'border-bottom-color': 'borderBottomColor',
  'border-left-color': 'borderLeftColor',
  'outline-width': 'outlineWidth',
  'outline-color': 'outlineColor',
  'outline-style': 'outlineStyle',
  'box-shadow': 'boxShadow',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-style': 'fontStyle',
  'font-weight': 'fontWeight',
  'line-height': 'lineHeight',
  'letter-spacing': 'letterSpacing',
  'text-transform': 'textTransform',
  'text-align': 'textAlign',
  'hyphens': 'hyphens',
  '-webkit-hyphens': 'webkitHyphens',
  'transition-property': 'transitionProperty',
  'transition-timing-function': 'transitionTimingFunction',
  'animation-name': 'animationName',
  'animation-timing-function': 'animationTimingFunction',
  'width': 'width',
  'height': 'height',
  'padding-top': 'paddingTop',
  'padding-right': 'paddingRight',
  'padding-bottom': 'paddingBottom',
  'padding-left': 'paddingLeft',
  'position': 'position',
  'display': 'display',
  'overflow': 'overflow',
  'overflow-x': 'overflowX',
  'overflow-y': 'overflowY',
};

const STATIC_NAMED_COLORS = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  silver: { r: 192, g: 192, b: 192, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
};

function splitCssList(value) {
  const parts = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote && value[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function splitCssTokens(value) {
  const tokens = [];
  let depth = 0, quote = '', current = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      current += ch;
      if (ch === quote && value[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '(') { depth++; current += ch; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); current += ch; continue; }
    if (/\s/.test(ch) && depth === 0) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function cssPropToCamel(prop) {
  if (!prop) return prop;
  const mapped = STATIC_PROP_MAP[prop];
  if (mapped) return mapped;
  return prop.replace(/-([a-z])/g, (_m, ch) => ch.toUpperCase());
}

function staticColorToCss(c) {
  if (!c) return '';
  if (c.a != null && c.a < 1) return `rgba(${c.r}, ${c.g}, ${c.b}, ${Number(c.a.toFixed(3))})`;
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

function parseStaticColor(value) {
  const parsed = parseAnyColor(value);
  if (parsed) return parsed;
  const named = STATIC_NAMED_COLORS[String(value || '').trim().toLowerCase()];
  return named ? { ...named } : null;
}

function extractStaticColor(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^var\(/i.test(raw)) return raw;
  const colorLike = raw.match(/(?:rgba?\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)|lch\([^)]+\)|lab\([^)]+\)|hsla?\([^)]+\)|hwb\([^)]+\)|#[0-9a-f]{3,8}\b|\b(?:black|white|gray|grey|silver|red|green|blue|transparent)\b)/i);
  if (!colorLike) return '';
  return colorLike[0];
}

function normalizeStaticCssValue(prop, value, customProps, parentStyle, currentStyle = null) {
  let resolved = resolveVarRefs(String(value || '').trim(), customProps);
  if (resolved === 'inherit') return parentStyle?.[prop] || STATIC_DEFAULT_STYLE[prop] || '';
  const isModernBorderColor = /^border[A-Z][a-z]+Color$/.test(prop) && /^(?:oklch|oklab|lch|lab|hsl|hwb)\(/i.test(resolved);
  if (!isModernBorderColor && (/color$/i.test(prop) || prop === 'color' || prop === 'backgroundColor')) {
    const parsed = parseStaticColor(resolved);
    if (parsed) resolved = staticColorToCss(parsed);
  }
  if (prop === 'fontSize') {
    const base = parseFloat(parentStyle?.fontSize) || 16;
    const px = resolveLengthPx(resolved, base);
    if (px != null) resolved = `${px}px`;
  }
  if (prop === 'letterSpacing') {
    const base = parseFloat(currentStyle?.fontSize || parentStyle?.fontSize) || 16;
    const px = resolveLengthPx(resolved, base);
    if (px != null) resolved = `${px}px`;
  }
  if (prop === 'lineHeight' && resolved !== 'normal') {
    const base = parseFloat(currentStyle?.fontSize || parentStyle?.fontSize) || 16;
    const px = resolveLengthPx(resolved, base);
    if (px != null) resolved = `${px}px`;
  }
  return resolved;
}

function expandStaticBoxValues(tokens) {
  if (tokens.length === 0) return ['0px', '0px', '0px', '0px'];
  if (tokens.length === 1) return [tokens[0], tokens[0], tokens[0], tokens[0]];
  if (tokens.length === 2) return [tokens[0], tokens[1], tokens[0], tokens[1]];
  if (tokens.length === 3) return [tokens[0], tokens[1], tokens[2], tokens[1]];
  return [tokens[0], tokens[1], tokens[2], tokens[3]];
}

function parseStaticBorder(value) {
  const tokens = splitCssTokens(value);
  let width = '', color = '';
  for (const token of tokens) {
    if (!width && /^-?[\d.]+(?:px|rem|em|%)$/.test(token)) width = token;
    if (!color) color = extractStaticColor(token);
  }
  return { width, color };
}

function parseStaticFont(value) {
  const out = [];
  const slashParts = value.match(/(?:^|\s)([\d.]+(?:px|rem|em|%))(?:\/([^\s]+))?/);
  if (/\bitalic\b/i.test(value)) out.push(['fontStyle', 'italic']);
  const weight = value.match(/\b([1-9]00|bold|normal|lighter|bolder)\b/i);
  if (weight) out.push(['fontWeight', weight[1]]);
  if (slashParts) {
    out.push(['fontSize', slashParts[1]]);
    if (slashParts[2]) out.push(['lineHeight', slashParts[2]]);
    const familyStart = value.indexOf(slashParts[0]) + slashParts[0].length;
    const family = value.slice(familyStart).trim();
    if (family) out.push(['fontFamily', family]);
  }
  return out;
}

function parseStaticTransition(value) {
  const props = [];
  const timings = [];
  for (const item of splitCssList(value)) {
    const tokens = splitCssTokens(item);
    const timing = tokens.find(token => /^(?:ease|linear|step-|cubic-bezier\()/i.test(token));
    if (timing) timings.push(timing);
    const prop = tokens.find(token => /^[a-z-]+$/i.test(token) && !/^(?:ease|linear|infinite|alternate|forwards|backwards|both|normal|none)$/.test(token) && !/s$/.test(token));
    if (prop) props.push(prop);
  }
  return {
    property: props.join(', '),
    timing: timings.join(', '),
  };
}

function parseStaticAnimation(value) {
  const names = [];
  const timings = [];
  for (const item of splitCssList(value)) {
    const tokens = splitCssTokens(item);
    const timing = tokens.find(token => /^(?:ease|linear|step-|cubic-bezier\()/i.test(token));
    if (timing) timings.push(timing);
    const name = tokens.find(token =>
      /^[a-z_-][\w-]*$/i.test(token) &&
      !/^(?:ease|linear|infinite|alternate|forwards|backwards|both|normal|none|running|paused)$/.test(token)
    );
    if (name) names.push(name);
  }
  return {
    name: names.join(', '),
    timing: timings.join(', '),
  };
}

function expandStaticDeclaration(prop, value) {
  const p = prop.toLowerCase();
  const v = String(value || '').trim();
  if (!v) return [];
  if (p.startsWith('--')) return [[p, v]];
  if (p === 'background') {
    const out = [];
    const hasImage = /gradient|url\(/i.test(v);
    if (hasImage) out.push(['backgroundImage', v]);
    const beforeImage = hasImage ? v.split(/(?:repeating-)?(?:linear|radial|conic)-gradient\(|url\(/i)[0] : v;
    const color = extractStaticColor(hasImage ? beforeImage : v);
    if (color) out.push(['backgroundColor', color]);
    return out;
  }
  if (p === 'border') {
    const parsed = parseStaticBorder(v);
    const out = [];
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parsed.width) out.push([`border${side}Width`, parsed.width]);
      if (parsed.color) out.push([`border${side}Color`, parsed.color]);
    }
    return out;
  }
  if (p === 'outline') {
    // `outline` shorthand: width | style | color, in any order. Reuse the
    // border parser for width + color, then sniff a style keyword from the
    // tokens (solid|dashed|...). `outline: 0` (single-token zero) zeros
    // the width and effectively hides the outline.
    const tokens = splitCssTokens(v);
    const parsed = parseStaticBorder(v);
    const styleToken = tokens.find(t =>
      /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/i.test(t)
    );
    const out = [];
    if (parsed.width) out.push(['outlineWidth', parsed.width]);
    if (parsed.color) out.push(['outlineColor', parsed.color]);
    if (styleToken) out.push(['outlineStyle', styleToken.toLowerCase()]);
    // `outline: 0` with no other tokens: explicit zero width.
    if (!parsed.width && /^0(?:px|rem|em|%)?$/.test(v.trim())) {
      out.push(['outlineWidth', '0px']);
    }
    return out;
  }
  const sideMatch = p.match(/^border-(top|right|bottom|left)$/);
  if (sideMatch) {
    const parsed = parseStaticBorder(v);
    const side = sideMatch[1][0].toUpperCase() + sideMatch[1].slice(1);
    return [
      ...(parsed.width ? [[`border${side}Width`, parsed.width]] : []),
      ...(parsed.color ? [[`border${side}Color`, parsed.color]] : []),
    ];
  }
  if (p === 'border-width') {
    const vals = expandStaticBoxValues(splitCssTokens(v));
    return [
      ['borderTopWidth', vals[0]],
      ['borderRightWidth', vals[1]],
      ['borderBottomWidth', vals[2]],
      ['borderLeftWidth', vals[3]],
    ];
  }
  if (p === 'border-color') {
    const vals = expandStaticBoxValues(splitCssTokens(v));
    return [
      ['borderTopColor', vals[0]],
      ['borderRightColor', vals[1]],
      ['borderBottomColor', vals[2]],
      ['borderLeftColor', vals[3]],
    ];
  }
  if (p === 'padding') {
    const vals = expandStaticBoxValues(splitCssTokens(v));
    return [
      ['paddingTop', vals[0]],
      ['paddingRight', vals[1]],
      ['paddingBottom', vals[2]],
      ['paddingLeft', vals[3]],
    ];
  }
  if (p === 'font') return parseStaticFont(v);
  if (p === 'transition') {
    const parsed = parseStaticTransition(v);
    return [
      ...(parsed.property ? [['transitionProperty', parsed.property]] : []),
      ...(parsed.timing ? [['transitionTimingFunction', parsed.timing]] : []),
    ];
  }
  if (p === 'animation') {
    const parsed = parseStaticAnimation(v);
    return [
      ...(parsed.name ? [['animationName', parsed.name]] : []),
      ...(parsed.timing ? [['animationTimingFunction', parsed.timing]] : []),
    ];
  }
  const mapped = cssPropToCamel(p);
  if (STATIC_DEFAULT_STYLE[mapped] != null || STATIC_INHERITED_PROPS.has(mapped)) {
    return [[mapped, v]];
  }
  return [];
}

function compareStaticPriority(a, b) {
  if (!a) return true;
  if (!!b.important !== !!a.important) return !!b.important;
  if (!!b.inline !== !!a.inline) return !!b.inline;
  for (let i = 0; i < 3; i++) {
    if ((b.specificity[i] || 0) !== (a.specificity[i] || 0)) {
      return (b.specificity[i] || 0) > (a.specificity[i] || 0);
    }
  }
  return b.order >= a.order;
}

function staticSpecificity(selector) {
  const noWhere = selector.replace(/:where\([^)]*\)/g, '');
  const ids = (noWhere.match(/#[\w-]+/g) || []).length;
  const classes = (noWhere.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length;
  const stripped = noWhere
    .replace(/#[\w-]+/g, ' ')
    .replace(/\.[\w-]+|\[[^\]]+\]|:{1,2}[\w-]+(?:\([^)]*\))?/g, ' ')
    .replace(/[*>+~(),]/g, ' ');
  const types = (stripped.match(/\b[a-zA-Z][\w-]*\b/g) || []).length;
  return [ids, classes, types];
}

function applyStaticDeclaration(specified, node, prop, value, meta) {
  let map = specified.get(node);
  if (!map) { map = new Map(); specified.set(node, map); }
  for (const [expandedProp, expandedValue] of expandStaticDeclaration(prop, value)) {
    const existing = map.get(expandedProp);
    const next = { ...meta, prop: expandedProp, value: expandedValue };
    if (compareStaticPriority(existing, next)) map.set(expandedProp, next);
  }
}

function parseStaticStyleAttribute(styleText, orderBase = 0) {
  const decls = [];
  for (const part of String(styleText || '').split(';')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const prop = part.slice(0, idx).trim();
    let value = part.slice(idx + 1).trim();
    const important = /!important\s*$/i.test(value);
    value = value.replace(/\s*!important\s*$/i, '').trim();
    decls.push({ prop, value, important, order: orderBase + decls.length });
  }
  return decls;
}

function collectStaticCssRules(cssText, csstree) {
  const rules = [];
  let ast;
  try {
    ast = csstree.parse(cssText, { positions: false, parseValue: true, parseCustomProperty: false });
  } catch {
    return rules;
  }
  let order = 0;
  const walkList = (list, atRuleStack = []) => {
    list?.forEach?.(node => {
      if (node.type === 'Rule' && node.block) {
        if (atRuleStack.some(name => /keyframes$/i.test(name))) return;
        const selectorText = csstree.generate(node.prelude).trim();
        const declarations = [];
        node.block.children?.forEach?.(child => {
          if (child.type !== 'Declaration') return;
          declarations.push({
            prop: child.property,
            value: csstree.generate(child.value).trim(),
            important: !!child.important,
          });
        });
        for (const selector of splitCssList(selectorText)) {
          if (selector) rules.push({ selector, declarations, specificity: staticSpecificity(selector), order: order++ });
        }
        return;
      }
      if (node.type === 'Atrule' && node.block) {
        const name = String(node.name || '').toLowerCase();
        if (name === 'media' || name === 'supports' || name === 'layer') {
          walkList(node.block.children, [...atRuleStack, name]);
        }
      }
    });
  };
  walkList(ast.children);
  return rules;
}

class StaticElement {
  constructor(node, doc) {
    this.node = node;
    this._doc = doc;
    this.nodeType = 1;
    this.tagName = String(node.name || '').toUpperCase();
    this.nodeName = this.tagName;
  }
  get parentElement() {
    let cur = this.node.parent;
    while (cur && cur.type !== 'tag') cur = cur.parent;
    return cur ? this._doc.wrap(cur) : null;
  }
  get previousElementSibling() {
    let cur = this.node.prev;
    while (cur && cur.type !== 'tag') cur = cur.prev;
    return cur ? this._doc.wrap(cur) : null;
  }
  get children() {
    return (this.node.children || []).filter(child => child.type === 'tag').map(child => this._doc.wrap(child));
  }
  get childNodes() {
    return (this.node.children || []).map(child => {
      if (child.type === 'text') return { nodeType: 3, textContent: child.data || '' };
      if (child.type === 'tag') return this._doc.wrap(child);
      return { nodeType: 8, textContent: child.data || '' };
    });
  }
  get textContent() {
    return this._doc.domutils.textContent(this.node);
  }
  get className() {
    return this.getAttribute('class') || '';
  }
  get id() {
    return this.getAttribute('id') || '';
  }
  getAttribute(name) {
    return this.node.attribs?.[name] ?? null;
  }
  querySelector(selector) {
    try {
      const found = this._doc.selectOne(selector, this.node.children || []);
      return found ? this._doc.wrap(found) : null;
    } catch {
      return null;
    }
  }
  querySelectorAll(selector) {
    try {
      return this._doc.selectAll(selector, this.node.children || []).map(node => this._doc.wrap(node));
    } catch {
      return [];
    }
  }
  closest(selector) {
    let cur = this.node;
    while (cur && cur.type === 'tag') {
      try {
        if (this._doc.is(cur, selector)) return this._doc.wrap(cur);
      } catch {
        return null;
      }
      cur = cur.parent;
      while (cur && cur.type !== 'tag') cur = cur.parent;
    }
    return null;
  }
  contains(other) {
    let cur = other?.node || null;
    while (cur) {
      if (cur === this.node) return true;
      cur = cur.parent;
    }
    return false;
  }
}

class StaticDocument {
  constructor(root, modules) {
    this.root = root;
    this.selectAll = modules.selectAll;
    this.selectOne = modules.selectOne;
    this.is = modules.is;
    this.domutils = modules.domutils;
    this._wrappers = new WeakMap();
    this._styleMap = new WeakMap();
  }
  wrap(node) {
    let wrapped = this._wrappers.get(node);
    if (!wrapped) {
      wrapped = new StaticElement(node, this);
      this._wrappers.set(node, wrapped);
    }
    return wrapped;
  }
  querySelectorAll(selector) {
    try {
      return this.selectAll(selector, this.root.children || []).map(node => this.wrap(node));
    } catch {
      return [];
    }
  }
  querySelector(selector) {
    try {
      const found = this.selectOne(selector, this.root.children || []);
      return found ? this.wrap(found) : null;
    } catch {
      return null;
    }
  }
  get documentElement() {
    return this.querySelector('html');
  }
  get body() {
    return this.querySelector('body');
  }
  setStyle(node, style) {
    this._styleMap.set(node, style);
  }
  getStyle(el) {
    return this._styleMap.get(el.node) || makeStaticStyle();
  }
}

function makeStaticStyle(values = {}) {
  const style = { ...STATIC_DEFAULT_STYLE, ...values };
  style.getPropertyValue = (prop) => {
    const key = cssPropToCamel(prop);
    return style[key] || style[prop] || '';
  };
  return style;
}

function buildStaticWindow(staticDoc) {
  return {
    document: staticDoc,
    getComputedStyle: (el) => staticDoc.getStyle(el),
  };
}

function collectStaticCssText(root, fileDir, profile, filePath, modules) {
  const styleTexts = [];
  for (const styleEl of modules.selectAll('style', root.children || [])) {
    styleTexts.push(modules.domutils.textContent(styleEl));
  }
  const links = modules.selectAll('link', root.children || []);
  for (const link of links) {
    const rel = link.attribs?.rel || '';
    const href = link.attribs?.href || '';
    if (!/\bstylesheet\b/i.test(rel) || !href || /^(https?:)?\/\//i.test(href)) continue;
    const cssPath = path.resolve(fileDir, href);
    try {
      const css = profileStep(profile, {
        engine: 'static-html',
        phase: 'preprocess',
        ruleId: 'inline-linked-stylesheet',
        target: filePath,
        detail: href,
      }, () => fs.readFileSync(cssPath, 'utf-8'));
      styleTexts.push(css);
    } catch { /* skip unreadable */ }
  }
  return styleTexts.join('\n');
}

function buildStaticStyleMap(root, staticDoc, cssText, modules, profile, filePath) {
  const specified = new Map();
  const allNodes = modules.selectAll('*', root.children || []);
  const rules = profileStep(profile, {
    engine: 'static-html',
    phase: 'parse-css',
    ruleId: 'css-rules',
    target: filePath,
  }, () => collectStaticCssRules(cssText, modules.csstree));

  profileStep(profile, {
    engine: 'static-html',
    phase: 'selector-match',
    ruleId: 'css-selectors',
    target: filePath,
  }, () => {
    for (const rule of rules) {
      let matched;
      try {
        matched = modules.selectAll(rule.selector, root.children || []);
      } catch {
        recordProfileEvent(profile, {
          engine: 'static-html',
          phase: 'selector-match',
          ruleId: 'unsupported-selector',
          target: filePath,
          ms: 0,
          findings: 0,
          detail: rule.selector,
        });
        continue;
      }
      for (const node of matched) {
        for (const decl of rule.declarations) {
          applyStaticDeclaration(specified, node, decl.prop, decl.value, {
            important: decl.important,
            specificity: rule.specificity,
            order: rule.order,
            inline: false,
          });
        }
      }
    }

    let inlineOrder = rules.length + 1;
    for (const node of allNodes) {
      const styleText = node.attribs?.style;
      if (!styleText) continue;
      for (const decl of parseStaticStyleAttribute(styleText, inlineOrder)) {
        applyStaticDeclaration(specified, node, decl.prop, decl.value, {
          important: decl.important,
          specificity: [1, 0, 0],
          order: decl.order,
          inline: true,
        });
      }
      inlineOrder += 1000;
    }
  });

  const computeNode = (node, parentStyle = null, parentCustom = new Map()) => {
    const specifiedMap = specified.get(node) || new Map();
    const customProps = new Map(parentCustom);
    for (const [prop, decl] of specifiedMap) {
      if (prop.startsWith('--')) customProps.set(prop, resolveVarRefs(decl.value, customProps));
    }
    const values = {};
    for (const prop of Object.keys(STATIC_DEFAULT_STYLE)) {
      if (STATIC_INHERITED_PROPS.has(prop) && parentStyle?.[prop] != null) values[prop] = parentStyle[prop];
      else values[prop] = STATIC_DEFAULT_STYLE[prop];
    }
    for (const [prop, decl] of specifiedMap) {
      if (prop.startsWith('--')) continue;
      values[prop] = normalizeStaticCssValue(prop, decl.value, customProps, parentStyle, values);
    }
    const style = makeStaticStyle(values);
    staticDoc.setStyle(node, style);
    for (const child of node.children || []) {
      if (child.type === 'tag') computeNode(child, style, customProps);
    }
  };

  profileStep(profile, {
    engine: 'static-html',
    phase: 'cascade',
    ruleId: 'compute-styles',
    target: filePath,
  }, () => {
    for (const child of root.children || []) {
      if (child.type === 'tag') computeNode(child);
    }
  });
}

export {
  BORDER_SHORTHAND_RE,
  NAMED_COLORS,
  normalizeColorForCheck,
  buildBorderOverrideMap,
  unwrapCssAtLayer,
  STATIC_INHERITED_PROPS,
  STATIC_DEFAULT_STYLE,
  STATIC_PROP_MAP,
  STATIC_NAMED_COLORS,
  splitCssList,
  splitCssTokens,
  cssPropToCamel,
  staticColorToCss,
  parseStaticColor,
  extractStaticColor,
  normalizeStaticCssValue,
  expandStaticBoxValues,
  parseStaticBorder,
  parseStaticFont,
  parseStaticTransition,
  parseStaticAnimation,
  expandStaticDeclaration,
  compareStaticPriority,
  staticSpecificity,
  applyStaticDeclaration,
  parseStaticStyleAttribute,
  collectStaticCssRules,
  StaticElement,
  StaticDocument,
  makeStaticStyle,
  buildStaticWindow,
  collectStaticCssText,
  buildStaticStyleMap,
};
