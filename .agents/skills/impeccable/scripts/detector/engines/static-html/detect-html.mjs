import fs from 'node:fs';
import path from 'node:path';

import { GENERIC_FONTS, OVERUSED_FONTS } from '../../shared/constants.mjs';
import { isFullPage } from '../../shared/page.mjs';
import { finding } from '../../findings.mjs';
import { profileFindings, profileStep, profileStepAsync } from '../../profile/profiler.mjs';
import {
  checkElementBorders,
  checkElementClippedOverflow,
  checkElementColors,
  checkElementGlow,
  checkElementGptBorderShadow,
  checkElementHeroEyebrow,
  checkElementIconTile,
  checkElementItalicSerif,
  checkElementMotion,
  checkElementOversizedH1,
  checkElementQuality,
  checkCreamPalette,
  checkHtmlPatterns,
  checkPageLayout,
  checkPageQualityFromDoc,
  checkRepeatedSectionKickersFromDoc,
  resolveBackground,
  resolveBorderRadiusPx,
} from '../../rules/checks.mjs';
import { filterByProviders } from '../../registry/antipatterns.mjs';
import { detectText, runTextContentAnalyzers } from '../regex/detect-text.mjs';
import {
  StaticDocument,
  buildStaticStyleMap,
  buildStaticWindow,
  collectStaticCssText,
} from './css-cascade.mjs';

function checkStaticPageTypography(document, window) {
  const findings = [];
  const fonts = new Set();
  const overusedFound = new Set();
  for (const el of document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, dd, blockquote, figcaption, a, button, label, span, div')) {
    const hasText = el.childNodes.some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!hasText) continue;
    const ff = window.getComputedStyle(el).fontFamily || '';
    const stack = ff.split(',').map(f => f.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
    const primary = stack.find(f => f && !GENERIC_FONTS.has(f));
    if (!primary) continue;
    fonts.add(primary);
    if (OVERUSED_FONTS.has(primary)) overusedFound.add(primary);
  }
  for (const font of overusedFound) {
    findings.push({ id: 'overused-font', snippet: `Primary font: ${font}` });
  }
  if (fonts.size === 1 && document.querySelectorAll('*').length >= 20) {
    findings.push({ id: 'single-font', snippet: `only font used is ${[...fonts][0]}` });
  }
  const sizes = new Set();
  for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, label, button, div')) {
    const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
    if (fontSize >= 8 && fontSize < 200) sizes.add(Math.round(fontSize * 10) / 10);
  }
  if (sizes.size >= 3) {
    const sorted = [...sizes].sort((a, b) => a - b);
    const ratio = sorted[sorted.length - 1] / sorted[0];
    if (ratio < 2.0) {
      findings.push({ id: 'flat-type-hierarchy', snippet: `Sizes: ${sorted.map(s => s + 'px').join(', ')} (ratio ${ratio.toFixed(1)}:1)` });
    }
  }
  return findings;
}

function checkElementBrokenImage(el) {
  const src = (el.getAttribute && el.getAttribute('src')) ?? el.attribs?.src;
  // Missing src attribute entirely
  if (src === undefined || src === null) {
    return [{ id: 'broken-image', snippet: '<img> with no src attribute' }];
  }
  const trimmed = String(src).trim();
  // Empty or placeholder-only src values
  if (trimmed === '' || trimmed === '#') {
    return [{ id: 'broken-image', snippet: `<img src="${src}">` }];
  }
  return [];
}

const STATIC_ELEMENT_RULES = [
  { id: 'border-rules', selector: '*', run: (el, tag, style, window, customPropMap) => checkElementBorders(tag, style, null, resolveBorderRadiusPx(el, style, parseFloat(style.width) || 0, window)) },
  { id: 'color-rules', selector: '*', run: (el, tag, style, window, customPropMap) => checkElementColors(el, style, tag, window, customPropMap, false) },
  { id: 'dark-glow', selector: '*', run: (el, tag, style, window, customPropMap) => checkElementGlow(tag, style, resolveBackground(el.parentElement || el, window, customPropMap)) },
  { id: 'motion-rules', selector: '*', run: (el, tag, style) => checkElementMotion(tag, style) },
  { id: 'icon-tile-stack', selector: 'h1,h2,h3,h4,h5,h6', run: (el, tag, _style, window) => checkElementIconTile(el, tag, window) },
  { id: 'italic-serif-display', selector: 'h1,h2', run: (el, tag, style) => checkElementItalicSerif(el, style, tag) },
  { id: 'hero-eyebrow-chip', selector: 'h1', run: (el, tag, style, window, customPropMap) => checkElementHeroEyebrow(el, style, tag, window, customPropMap) },
  { id: 'broken-image', selector: 'img', run: (el) => checkElementBrokenImage(el) },
  { id: 'quality-rules', selector: '*', run: (el, tag, style, window) => checkElementQuality(el, style, tag, window) },
  { id: 'oversized-h1', selector: 'h1', run: (el, tag, style, window) => checkElementOversizedH1(el, style, tag, window) },
  { id: 'clipped-overflow-container', selector: '*', run: (el, tag, style, window) => checkElementClippedOverflow(el, style, tag, window) },
  { id: 'gpt-thin-border-wide-shadow', selector: '*', run: (el, tag, style) => checkElementGptBorderShadow(el, style) },
];

async function detectHtml(filePath, options = {}) {
  const profile = options?.profile;
  const html = profileStep(profile, {
    engine: 'static-html',
    phase: 'setup',
    ruleId: 'read-html',
    target: filePath,
  }, () => fs.readFileSync(filePath, 'utf-8'));

  let modules;
  try {
    modules = await profileStepAsync(profile, {
      engine: 'static-html',
      phase: 'setup',
      ruleId: 'import-static-parser',
      target: filePath,
    }, async () => {
      const [htmlparser2, cssSelect, csstree, domutils] = await Promise.all([
        import('htmlparser2'),
        import('css-select'),
        import('css-tree'),
        import('domutils'),
      ]);
      return {
        parseDocument: htmlparser2.parseDocument,
        selectAll: cssSelect.selectAll,
        selectOne: cssSelect.selectOne,
        is: cssSelect.is,
        csstree,
        domutils,
      };
    });
  } catch {
    return detectText(html, filePath, options);
  }

  const resolvedPath = path.resolve(filePath);
  const fileDir = path.dirname(resolvedPath);
  const root = profileStep(profile, {
    engine: 'static-html',
    phase: 'parse-html',
    ruleId: 'parse-document',
    target: filePath,
  }, () => modules.parseDocument(html, { lowerCaseAttributeNames: false, lowerCaseTags: true }));

  const cssText = collectStaticCssText(root, fileDir, profile, filePath, modules);
  const document = new StaticDocument(root, modules);
  buildStaticStyleMap(root, document, cssText, modules, profile, filePath);
  const window = buildStaticWindow(document);

  const customPropMap = null;

  const findings = [];
  const runElementCheck = (ruleId, callback) => profile
    ? profileFindings(profile, { engine: 'static-html', phase: 'element', ruleId, target: filePath }, callback)
    : callback();

  const visitedByRule = new Map();
  for (const rule of STATIC_ELEMENT_RULES) {
    const elements = document.querySelectorAll(rule.selector);
    visitedByRule.set(rule.id, elements.length);
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      const style = window.getComputedStyle(el);
      for (const f of runElementCheck(rule.id, () => rule.run(el, tag, style, window, customPropMap))) {
        findings.push(finding(f.id, filePath, f.snippet));
      }
    }
  }

  if (isFullPage(html)) {
    const runPageCheck = (ruleId, callback) => profile
      ? profileFindings(profile, { engine: 'static-html', phase: 'page', ruleId, target: filePath }, callback)
      : callback();
    for (const f of runPageCheck('typography-rules', () => checkStaticPageTypography(document, window))) {
      findings.push(finding(f.id, filePath, f.snippet));
    }
    for (const f of runPageCheck('repeated-section-kickers', () => checkRepeatedSectionKickersFromDoc(document, window))) {
      findings.push(finding(f.id, filePath, f.snippet));
    }
    for (const f of runPageCheck('layout-rules', () => checkPageLayout(document, window))) {
      findings.push(finding(f.id, filePath, f.snippet));
    }
    for (const f of runPageCheck('cream-palette', () => checkCreamPalette(document, window))) {
      findings.push(finding(f.id, filePath, f.snippet));
    }
    for (const f of runPageCheck('skipped-heading', () => checkPageQualityFromDoc(document))) {
      findings.push(finding(f.id, filePath, f.snippet));
    }
    for (const f of runPageCheck('html-patterns', () => checkHtmlPatterns(html).filter(item =>
      item.id !== 'bounce-easing' && item.id !== 'layout-transition'
    ))) {
      findings.push(finding(f.id, filePath, f.snippet));
    }
    // Text-content analyzers (em-dash overuse, marketing buzzwords,
    // numbered section markers, aphoristic cadence) live in the regex
    // engine. Call them from here so .html files get the same coverage
    // as .css/.tsx files. These are scoped to text content only and
    // don't overlap with static-html's element/page rules.
    for (const f of runPageCheck('text-content', () => runTextContentAnalyzers(html, filePath, options))) {
      findings.push(finding(f.antipattern, filePath, f.snippet));
    }
  }

  return filterByProviders(findings, options.providers);
}

export { checkStaticPageTypography, STATIC_ELEMENT_RULES, detectHtml };
