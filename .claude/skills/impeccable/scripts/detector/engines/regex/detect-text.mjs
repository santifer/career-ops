import { GENERIC_FONTS } from '../../shared/constants.mjs';
import { isFullPage } from '../../shared/page.mjs';
import { finding } from '../../findings.mjs';
import { filterByProviders } from '../../registry/antipatterns.mjs';
import { profileFindings, profileStep } from '../../profile/profiler.mjs';

// ---------------------------------------------------------------------------
// Regex fallback (non-HTML files: CSS, JSX, TSX, etc.)
// ---------------------------------------------------------------------------

const hasRounded = (line) => /\brounded(?:-\w+)?\b/.test(line);
const hasBorderRadius = (line) => /border-radius/i.test(line);
const isSafeElement = (line) => /<(?:blockquote|nav[\s>]|pre[\s>]|code[\s>]|a\s|input[\s>]|span[\s>])/i.test(line);

/** Strip HTML to plain text — drops script/style/comments/tags so
 *  content-text analyzers don't false-positive on code or CSS. */
function stripHtmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

function isNeutralBorderColor(str) {
  const m = str.match(/solid\s+(#[0-9a-f]{3,8}|rgba?\([^)]+\)|\w+)/i);
  if (!m) return false;
  const c = m[1].toLowerCase();
  if (['gray', 'grey', 'silver', 'white', 'black', 'transparent', 'currentcolor'].includes(c)) return true;
  const hex = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (hex) {
    const [r, g, b] = [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
    return (Math.max(r, g, b) - Math.min(r, g, b)) < 30;
  }
  const shex = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (shex) {
    const [r, g, b] = [parseInt(shex[1] + shex[1], 16), parseInt(shex[2] + shex[2], 16), parseInt(shex[3] + shex[3], 16)];
    return (Math.max(r, g, b) - Math.min(r, g, b)) < 30;
  }
  return false;
}

const REGEX_MATCHERS = [
  // --- Side-tab ---
  { id: 'side-tab', regex: /\bborder-[lrse]-(\d+)\b/g,
    test: (m, line) => { const n = +m[1]; return hasRounded(line) ? n >= 1 : n >= 4; },
    fmt: (m) => m[0] },
  { id: 'side-tab', regex: /border-(?:left|right)\s*:\s*(\d+)px\s+solid[^;]*/gi,
    test: (m, line) => { if (isSafeElement(line)) return false; if (isNeutralBorderColor(m[0])) return false; const n = +m[1]; return hasBorderRadius(line) ? n >= 1 : n >= 3; },
    fmt: (m) => m[0].replace(/\s*;?\s*$/, '') },
  { id: 'side-tab', regex: /border-(?:left|right)-width\s*:\s*(\d+)px/gi,
    test: (m, line) => !isSafeElement(line) && +m[1] >= 3,
    fmt: (m) => m[0] },
  { id: 'side-tab', regex: /border-inline-(?:start|end)\s*:\s*(\d+)px\s+solid/gi,
    test: (m, line) => !isSafeElement(line) && +m[1] >= 3,
    fmt: (m) => m[0] },
  { id: 'side-tab', regex: /border-inline-(?:start|end)-width\s*:\s*(\d+)px/gi,
    test: (m, line) => !isSafeElement(line) && +m[1] >= 3,
    fmt: (m) => m[0] },
  { id: 'side-tab', regex: /border(?:Left|Right)\s*[:=]\s*["'`](\d+)px\s+solid/g,
    test: (m) => +m[1] >= 3,
    fmt: (m) => m[0] },
  // --- Border accent on rounded ---
  { id: 'border-accent-on-rounded', regex: /\bborder-[tb]-(\d+)\b/g,
    test: (m, line) => hasRounded(line) && +m[1] >= 1,
    fmt: (m) => m[0] },
  { id: 'border-accent-on-rounded', regex: /border-(?:top|bottom)\s*:\s*(\d+)px\s+solid/gi,
    test: (m, line) => +m[1] >= 3 && hasBorderRadius(line),
    fmt: (m) => m[0] },
  // --- Overused font ---
  { id: 'overused-font', regex: /font-family\s*:\s*['"]?(Inter|Roboto|Open Sans|Lato|Montserrat|Arial|Helvetica|Fraunces|Geist Sans|Geist Mono|Geist|Mona Sans|Plus Jakarta Sans|Space Grotesk|Recoleta|Instrument Sans|Instrument Serif)\b/gi,
    test: () => true,
    fmt: (m) => m[0] },
  { id: 'overused-font', regex: /fonts\.googleapis\.com\/css2?\?family=(Inter|Roboto|Open\+Sans|Lato|Montserrat|Fraunces|Plus\+Jakarta\+Sans|Space\+Grotesk|Instrument\+Sans|Instrument\+Serif|Mona\+Sans|Geist)\b/gi,
    test: () => true,
    fmt: (m) => `Google Fonts: ${m[1].replace(/\+/g, ' ')}` },
  // --- Gradient text ---
  { id: 'gradient-text', regex: /background-clip\s*:\s*text|-webkit-background-clip\s*:\s*text/gi,
    test: (m, line) => /gradient/i.test(line),
    fmt: () => 'background-clip: text + gradient' },
  // --- Gradient text (Tailwind) ---
  { id: 'gradient-text', regex: /\bbg-clip-text\b/g,
    test: (m, line) => /\bbg-gradient-to-/i.test(line),
    fmt: () => 'bg-clip-text + bg-gradient' },
  // --- Tailwind gray on colored bg ---
  { id: 'gray-on-color', regex: /\btext-(?:gray|slate|zinc|neutral|stone)-(\d+)\b/g,
    test: (m, line) => /\bbg-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/.test(line),
    fmt: (m, line) => { const bg = line.match(/\bbg-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/); return `${m[0]} on ${bg?.[0] || '?'}`; } },
  // --- Tailwind AI palette ---
  { id: 'ai-color-palette', regex: /\btext-(?:purple|violet|indigo)-(\d+)\b/g,
    test: (m, line) => /\btext-(?:[2-9]xl|[3-9]xl)\b|<h[1-3]/i.test(line),
    fmt: (m) => `${m[0]} on heading` },
  { id: 'ai-color-palette', regex: /\bfrom-(?:purple|violet|indigo)-(\d+)\b/g,
    test: (m, line) => /\bto-(?:purple|violet|indigo|blue|cyan|pink|fuchsia)-\d+\b/.test(line),
    fmt: (m) => `${m[0]} gradient` },
  // --- Bounce/elastic easing ---
  { id: 'bounce-easing', regex: /\banimate-bounce\b/g,
    test: () => true,
    fmt: () => 'animate-bounce (Tailwind)' },
  { id: 'bounce-easing', regex: /animation(?:-name)?\s*:\s*[^;]*\b(bounce|elastic|wobble|jiggle|spring)\b/gi,
    test: () => true,
    fmt: (m) => m[0] },
  { id: 'bounce-easing', regex: /cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/g,
    test: (m) => {
      const y1 = parseFloat(m[2]), y2 = parseFloat(m[4]);
      return y1 < -0.1 || y1 > 1.1 || y2 < -0.1 || y2 > 1.1;
    },
    fmt: (m) => `cubic-bezier(${m[1]}, ${m[2]}, ${m[3]}, ${m[4]})` },
  // --- Layout property transition ---
  { id: 'layout-transition', regex: /transition\s*:\s*([^;{}]+)/gi,
    test: (m) => {
      const val = m[1].toLowerCase();
      if (/\ball\b/.test(val)) return false;
      return /\b(?:(?:max|min)-)?(?:width|height)\b|\bpadding\b|\bmargin\b/.test(val);
    },
    fmt: (m) => {
      const found = m[1].match(/\b(?:(?:max|min)-)?(?:width|height)\b|\bpadding(?:-(?:top|right|bottom|left))?\b|\bmargin(?:-(?:top|right|bottom|left))?\b/gi);
      return `transition: ${found ? found.join(', ') : m[1].trim()}`;
    } },
  { id: 'layout-transition', regex: /transition-property\s*:\s*([^;{}]+)/gi,
    test: (m) => {
      const val = m[1].toLowerCase();
      if (/\ball\b/.test(val)) return false;
      return /\b(?:(?:max|min)-)?(?:width|height)\b|\bpadding\b|\bmargin\b/.test(val);
    },
    fmt: (m) => {
      const found = m[1].match(/\b(?:(?:max|min)-)?(?:width|height)\b|\bpadding(?:-(?:top|right|bottom|left))?\b|\bmargin(?:-(?:top|right|bottom|left))?\b/gi);
      return `transition-property: ${found ? found.join(', ') : m[1].trim()}`;
    } },
  // --- Broken image: src="" or src="#" or src=" " ---
  { id: 'broken-image', regex: /<img\b[^>]*?\bsrc\s*=\s*(?:""|''|"\s+"|'\s+'|"#"|'#')/gi,
    test: () => true,
    fmt: (m) => m[0].slice(0, 100) },
  // --- Broken image: <img> with no src attribute at all ---
  { id: 'broken-image', regex: /<img\b(?:(?!\bsrc\s*=)[^>])*>/gi,
    test: (m) => !/\bsrc\s*=/i.test(m[0]),
    fmt: (m) => m[0].slice(0, 100) },
];

const REGEX_ANALYZERS = [
  // Single font
  (content, filePath) => {
    const fontFamilyRe = /font-family\s*:\s*([^;}]+)/gi;
    const fonts = new Set();
    let m;
    while ((m = fontFamilyRe.exec(content)) !== null) {
      for (const f of m[1].split(',').map(f => f.trim().replace(/^['"]|['"]$/g, '').toLowerCase())) {
        if (f && !GENERIC_FONTS.has(f)) fonts.add(f);
      }
    }
    const gfRe = /fonts\.googleapis\.com\/css2?\?family=([^&"'\s]+)/gi;
    while ((m = gfRe.exec(content)) !== null) {
      for (const f of m[1].split('|').map(f => f.split(':')[0].replace(/\+/g, ' ').toLowerCase())) fonts.add(f);
    }
    if (fonts.size !== 1 || content.split('\n').length < 20) return [];
    const name = [...fonts][0];
    const lines = content.split('\n');
    let line = 1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].toLowerCase().includes(name)) { line = i + 1; break; } }
    return [finding('single-font', filePath, `only font used is ${name}`, line)];
  },
  // Flat type hierarchy
  (content, filePath) => {
    const sizes = new Set();
    const REM = 16;
    let m;
    const sizeRe = /font-size\s*:\s*([\d.]+)(px|rem|em)\b/gi;
    while ((m = sizeRe.exec(content)) !== null) {
      const px = m[2] === 'px' ? +m[1] : +m[1] * REM;
      if (px > 0 && px < 200) sizes.add(Math.round(px * 10) / 10);
    }
    const clampRe = /font-size\s*:\s*clamp\(\s*([\d.]+)(px|rem|em)\s*,\s*[^,]+,\s*([\d.]+)(px|rem|em)\s*\)/gi;
    while ((m = clampRe.exec(content)) !== null) {
      sizes.add(Math.round((m[2] === 'px' ? +m[1] : +m[1] * REM) * 10) / 10);
      sizes.add(Math.round((m[4] === 'px' ? +m[3] : +m[3] * REM) * 10) / 10);
    }
    const TW = { 'text-xs': 12, 'text-sm': 14, 'text-base': 16, 'text-lg': 18, 'text-xl': 20, 'text-2xl': 24, 'text-3xl': 30, 'text-4xl': 36, 'text-5xl': 48, 'text-6xl': 60, 'text-7xl': 72, 'text-8xl': 96, 'text-9xl': 128 };
    for (const [cls, px] of Object.entries(TW)) { if (new RegExp(`\\b${cls}\\b`).test(content)) sizes.add(px); }
    if (sizes.size < 3) return [];
    const sorted = [...sizes].sort((a, b) => a - b);
    const ratio = sorted[sorted.length - 1] / sorted[0];
    if (ratio >= 2.0) return [];
    const lines = content.split('\n');
    let line = 1;
    for (let i = 0; i < lines.length; i++) { if (/font-size/i.test(lines[i]) || /\btext-(?:xs|sm|base|lg|xl|\d)/i.test(lines[i])) { line = i + 1; break; } }
    return [finding('flat-type-hierarchy', filePath, `Sizes: ${sorted.map(s => s + 'px').join(', ')} (ratio ${ratio.toFixed(1)}:1)`, line)];
  },
  // Monotonous spacing (regex)
  (content, filePath) => {
    const vals = [];
    let m;
    const pxRe = /(?:padding|margin)(?:-(?:top|right|bottom|left))?\s*:\s*(\d+)px/gi;
    while ((m = pxRe.exec(content)) !== null) { const v = +m[1]; if (v > 0 && v < 200) vals.push(v); }
    const remRe = /(?:padding|margin)(?:-(?:top|right|bottom|left))?\s*:\s*([\d.]+)rem/gi;
    while ((m = remRe.exec(content)) !== null) { const v = Math.round(parseFloat(m[1]) * 16); if (v > 0 && v < 200) vals.push(v); }
    const gapRe = /gap\s*:\s*(\d+)px/gi;
    while ((m = gapRe.exec(content)) !== null) vals.push(+m[1]);
    const twRe = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap)-(\d+)\b/g;
    while ((m = twRe.exec(content)) !== null) vals.push(+m[1] * 4);
    const rounded = vals.map(v => Math.round(v / 4) * 4);
    if (rounded.length < 10) return [];
    const counts = {};
    for (const v of rounded) counts[v] = (counts[v] || 0) + 1;
    const maxCount = Math.max(...Object.values(counts));
    const pct = maxCount / rounded.length;
    const unique = [...new Set(rounded)].filter(v => v > 0);
    if (pct <= 0.6 || unique.length > 3) return [];
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return [finding('monotonous-spacing', filePath, `~${dominant}px used ${maxCount}/${rounded.length} times (${Math.round(pct * 100)}%)`)];
  },
  // Em-dash overuse: 5+ em-dashes or "--" in body text content
  // (occasional em-dash use in prose is fine; the pattern fires only
  // when count crosses into AI-cadence territory).
  (content, filePath) => {
    const text = stripHtmlToText(content);
    let count = 0;
    const re = /[—]|--(?=\S)/g;
    while (re.exec(text) !== null) count++;
    if (count < 5) return [];
    return [finding('em-dash-overuse', filePath, `${count} em-dashes in body text`)];
  },
  // Marketing buzzwords: SaaS phrase list
  (content, filePath) => {
    const text = stripHtmlToText(content);
    const lower = text.toLowerCase();
    const BUZZWORDS = [
      'streamline your', 'empower your', 'supercharge your',
      'unleash your', 'unleash the power', 'leverage the power',
      'built for the modern', 'trusted by leading', 'trusted by the world',
      'best-in-class', 'industry-leading', 'world-class', 'enterprise-grade',
      'next-generation', 'cutting-edge', 'transform your business',
      'revolutionize', 'game-changer', 'game changing',
      'mission-critical', 'best of breed', 'future-proof', 'future proof',
      'seamless experience', 'seamlessly integrate',
      'drive engagement', 'drive growth', 'drive results',
      'harness the power',
    ];
    let count = 0;
    let firstSample = '';
    for (const phrase of BUZZWORDS) {
      let from = 0;
      while (true) {
        const idx = lower.indexOf(phrase, from);
        if (idx === -1) break;
        count++;
        if (!firstSample) {
          firstSample = text.slice(Math.max(0, idx - 12), Math.min(text.length, idx + phrase.length + 12)).trim();
        }
        from = idx + phrase.length;
      }
    }
    if (count === 0) return [];
    return [finding('marketing-buzzword', filePath, `${count} buzzword phrase${count === 1 ? '' : 's'}: "${firstSample}"`)];
  },
  // Numbered section markers (01 / 02 / 03 ...)
  (content, filePath) => {
    const text = stripHtmlToText(content);
    const re = /\b(0[1-9]|1[0-2])\b/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(text)) !== null) seen.add(m[1]);
    if (seen.size < 3) return [];
    const sorted = [...seen].sort();
    let sequential = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (parseInt(sorted[i], 10) === parseInt(sorted[i - 1], 10) + 1) sequential++;
    }
    if (sequential < 2) return [];
    return [finding('numbered-section-markers', filePath, `Sequence: ${sorted.slice(0, 6).join(', ')}`)];
  },
  // Aphoristic cadence: manufactured-contrast + short-rebuttal
  (content, filePath) => {
    const text = stripHtmlToText(content);
    const NOT_A_RE = /\bNot an? [a-z][^.!?]{1,40}[.!]\s+[A-Z][^.!?]{1,60}[.!]/g;
    const SHORT_REBUTTAL_RE = /\b[A-Z][^.!?]{4,80}[.!]\s+(No|Just)\s+[a-z][^.!?]{2,60}[.!]/g;
    let count = 0;
    let firstSample = '';
    let m;
    NOT_A_RE.lastIndex = 0;
    while ((m = NOT_A_RE.exec(text)) !== null) {
      count++;
      if (!firstSample) firstSample = m[0].trim().slice(0, 80);
    }
    SHORT_REBUTTAL_RE.lastIndex = 0;
    while ((m = SHORT_REBUTTAL_RE.exec(text)) !== null) {
      count++;
      if (!firstSample) firstSample = m[0].trim().slice(0, 80);
    }
    if (count < 3) return [];
    return [finding('aphoristic-cadence', filePath, `${count} aphoristic constructions: "${firstSample}"`)];
  },
  // Dark glow (page-level: dark bg + colored box-shadow with blur)
  (content, filePath) => {
    // Check if page has a dark background
    const darkBgRe = /background(?:-color)?\s*:\s*(?:#(?:0[0-9a-f]|1[0-9a-f]|2[0-3])[0-9a-f]{4}\b|#(?:0|1)[0-9a-f]{2}\b|rgb\(\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\))/gi;
    const twDarkBg = /\bbg-(?:gray|slate|zinc|neutral|stone)-(?:9\d{2}|800)\b/;
    const hasDarkBg = darkBgRe.test(content) || twDarkBg.test(content);
    if (!hasDarkBg) return [];

    // Check for colored box-shadow with blur > 4px
    const shadowRe = /box-shadow\s*:\s*([^;{}]+)/gi;
    let m;
    while ((m = shadowRe.exec(content)) !== null) {
      const val = m[1];
      const colorMatch = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!colorMatch) continue;
      const [r, g, b] = [+colorMatch[1], +colorMatch[2], +colorMatch[3]];
      if ((Math.max(r, g, b) - Math.min(r, g, b)) < 30) continue; // skip gray
      // Check blur: look for pattern like "0 0 20px" (third number > 4)
      const pxVals = [...val.matchAll(/(\d+)px|(?<![.\d])\b(0)\b(?![.\d])/g)].map(p => +(p[1] || p[2]));
      if (pxVals.length >= 3 && pxVals[2] > 4) {
        const lines = content.substring(0, m.index).split('\n');
        return [finding('dark-glow', filePath, `Colored glow (rgb(${r},${g},${b})) on dark page`, lines.length)];
      }
    }
    return [];
  },
];

// ---------------------------------------------------------------------------
// Style block extraction (Vue/Svelte <style> blocks)
// ---------------------------------------------------------------------------

function extractStyleBlocks(content, ext) {
  ext = ext.toLowerCase();
  if (ext !== '.vue' && ext !== '.svelte') return [];
  const blocks = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    const before = content.substring(0, m.index);
    const startLine = before.split('\n').length + 1;
    blocks.push({ content: m[1], startLine });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// CSS-in-JS extraction (styled-components, emotion)
// ---------------------------------------------------------------------------

const CSS_IN_JS_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx']);

function extractCSSinJS(content, ext) {
  ext = ext.toLowerCase();
  if (!CSS_IN_JS_EXTENSIONS.has(ext)) return [];
  const blocks = [];
  const re = /(?:styled(?:\.\w+|\([^)]+\))|css)\s*`([\s\S]*?)`/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const before = content.substring(0, m.index);
    const startLine = before.split('\n').length;
    blocks.push({ content: m[1], startLine });
  }
  return blocks;
}

function runRegexMatchers(lines, filePath, lineOffset = 0, blockContext = null, options = {}) {
  const { profile, phase = 'regex-matchers' } = options || {};
  const findings = [];
  if (!profile) {
    for (const matcher of REGEX_MATCHERS) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        matcher.regex.lastIndex = 0;
        let m;
        while ((m = matcher.regex.exec(line)) !== null) {
          // For extracted blocks, use nearby lines as context for multi-line CSS patterns
          const context = blockContext
            ? lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join(' ')
            : line;
          if (matcher.test(m, context)) {
            findings.push(finding(matcher.id, filePath, matcher.fmt(m, context), i + 1 + lineOffset));
          }
        }
      }
    }
    return findings;
  }

  for (const matcher of REGEX_MATCHERS) {
    const matcherFindings = profileFindings(profile, {
      engine: 'regex',
      phase,
      ruleId: matcher.id,
      target: filePath,
    }, () => {
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        matcher.regex.lastIndex = 0;
        let m;
        while ((m = matcher.regex.exec(line)) !== null) {
          // For extracted blocks, use nearby lines as context for multi-line CSS patterns
          const context = blockContext
            ? lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join(' ')
            : line;
          if (matcher.test(m, context)) {
            matches.push(finding(matcher.id, filePath, matcher.fmt(m, context), i + 1 + lineOffset));
          }
        }
      }
      return matches;
    });
    findings.push(...matcherFindings);
  }
  return findings;
}

/** Page-level analyzers that scan rendered text content (em-dash use,
 *  buzzword phrases, numbered section markers, aphoristic cadence).
 *  These are detector-agnostic — they work on any HTML/text source
 *  and don't need a parsed DOM. Exported so detectHtml can call them
 *  for `.html` files (which otherwise skip the regex engine). */
const TEXT_CONTENT_ANALYZER_IDS = [
  'em-dash-overuse',
  'marketing-buzzword',
  'numbered-section-markers',
  'aphoristic-cadence',
];

function runTextContentAnalyzers(content, filePath, options = {}) {
  const profile = options?.profile;
  if (!isFullPage(content)) return [];
  // The 4 text-content analyzers are at indices 3-6 in REGEX_ANALYZERS.
  const findings = [];
  for (let i = 0; i < TEXT_CONTENT_ANALYZER_IDS.length; i++) {
    const analyzer = REGEX_ANALYZERS[3 + i];
    const ruleId = TEXT_CONTENT_ANALYZER_IDS[i];
    findings.push(...profileFindings(profile, {
      engine: 'regex',
      phase: 'text-content',
      ruleId,
      target: filePath,
    }, () => analyzer(content, filePath)));
  }
  return findings;
}

function detectText(content, filePath, options = {}) {
  const profile = options?.profile;
  const findings = [];
  const lines = content.split('\n');
  const ext = filePath ? (filePath.match(/\.\w+$/)?.[0] || '').toLowerCase() : '';

  // Run regex matchers on the full file content (catches Tailwind classes, inline styles)
  // Enable block context for CSS files where related properties span multiple lines
  const cssLike = new Set(['.css', '.scss', '.less']);
  findings.push(...runRegexMatchers(lines, filePath, 0, cssLike.has(ext) || null, {
    profile,
    phase: 'source',
  }));

  // Extract and scan <style> blocks from Vue/Svelte SFCs
  const styleBlocks = profile
    ? profileStep(profile, {
      engine: 'regex',
      phase: 'extract',
      ruleId: 'style-blocks',
      target: filePath,
    }, () => extractStyleBlocks(content, ext))
    : extractStyleBlocks(content, ext);
  for (const block of styleBlocks) {
    const blockLines = block.content.split('\n');
    findings.push(...runRegexMatchers(blockLines, filePath, block.startLine - 1, true, {
      profile,
      phase: 'style-block',
    }));
  }

  // Extract and scan CSS-in-JS template literals
  const cssJsBlocks = profile
    ? profileStep(profile, {
      engine: 'regex',
      phase: 'extract',
      ruleId: 'css-in-js',
      target: filePath,
    }, () => extractCSSinJS(content, ext))
    : extractCSSinJS(content, ext);
  for (const block of cssJsBlocks) {
    const blockLines = block.content.split('\n');
    findings.push(...runRegexMatchers(blockLines, filePath, block.startLine - 1, true, {
      profile,
      phase: 'css-in-js',
    }));
  }

  // Deduplicate findings (same antipattern + similar snippet, within 2 lines)
  const deduped = [];
  for (const f of findings) {
    const isDupe = deduped.some(d =>
      d.antipattern === f.antipattern &&
      d.snippet === f.snippet &&
      Math.abs(d.line - f.line) <= 2
    );
    if (!isDupe) deduped.push(f);
  }

  // Page-level analyzers only run on full pages
  if (isFullPage(content)) {
    const analyzerIds = [
      'single-font',
      'flat-type-hierarchy',
      'monotonous-spacing',
      'em-dash-overuse',
      'marketing-buzzword',
      'numbered-section-markers',
      'aphoristic-cadence',
      'dark-glow',
    ];
    for (let i = 0; i < REGEX_ANALYZERS.length; i++) {
      const analyzer = REGEX_ANALYZERS[i];
      deduped.push(...profileFindings(profile, {
        engine: 'regex',
        phase: 'page-analyzer',
        ruleId: analyzerIds[i] || `analyzer-${i + 1}`,
        target: filePath,
      }, () => analyzer(content, filePath)));
    }
  }

  return filterByProviders(deduped, options?.providers);
}

export {
  REGEX_MATCHERS,
  REGEX_ANALYZERS,
  TEXT_CONTENT_ANALYZER_IDS,
  extractStyleBlocks,
  extractCSSinJS,
  runRegexMatchers,
  runTextContentAnalyzers,
  detectText,
};
