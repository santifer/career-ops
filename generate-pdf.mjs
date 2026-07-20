#!/usr/bin/env node

/**
 * generate-pdf.mjs — HTML → PDF via Playwright
 *
 * Usage:
 *   node career-ops/generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4] [--report=NNN] [--allow-reorder] [--meta=metadata.json]
 *
 * --report links the generated PDF to its tracker/report number and records
 * the linkage in data/pdf-index.tsv so downstream tools (e.g. the TUI
 * dashboard's `d`/`D` hotkeys) can locate the exact PDF for an application.
 * Without --report a manifest row is still written, just unkeyed.
 *
 * --allow-reorder downgrades the CV section-order guard from a thrown error
 * to a console warning, for JDs where the section order was deliberately
 * tailored (e.g. Projects moved ahead of Education for a technical-heavy
 * role) rather than accidentally scrambled by an agent. Without this flag,
 * any divergence from cv.md's section order still fails generation.
 *
 * --meta points to a JSON file of PDF metadata to inject via pdf-lib (see
 * modes/pdf.md "PDF Metadata"). Every field is optional; standard fields
 * include title/author/subject/keywords/creator/producer. Custom PDF metadata
 * must be provided under the `custom` object (e.g., "custom": { "Role": "Eng" }).
 * Unknown top-level fields are ignored. Custom fields are written as Info
 * dictionary entries, visible in Adobe Acrobat under File > Properties >
 * Custom, or via `exiftool file.pdf`. Standard fields fall back to sane
 * defaults (HTML <title>, config/profile.yml full_name) when --meta is
 * omitted or a field is missing, so every generated CV always carries at
 * least Title/Author/Producer — never a blank Info dict.
 *
 * Requires: @playwright/test (or playwright), pdf-lib installed.
 * Uses Chromium headless to render the HTML and produce a clean, ATS-parseable PDF.
 */

import { chromium } from 'playwright';
import { PDFDocument, PDFName, PDFString, PDFHexString, PDFRawStream, PDFDict } from 'pdf-lib';
import { resolve, dirname, relative, sep, isAbsolute } from 'path';
import { readFile } from 'fs/promises';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { randomUUID } from 'node:crypto';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PAGE_MARGIN = '0.6in';

// Ensure output directory exists (fresh setup)
mkdirSync(resolve(__dirname, 'output'), { recursive: true });

/**
 * Normalize text for ATS compatibility by converting problematic Unicode.
 *
 * ATS parsers and legacy systems often fail on em-dashes, smart quotes,
 * zero-width characters, and non-breaking spaces. These cause mojibake,
 * parsing errors, or display issues. See issue #1.
 *
 * Only touches body text — preserves CSS, JS, tag attributes, and URLs.
 * Returns { html, replacements } so the caller can log what was changed.
 */
function normalizeTextForATS(html) {
  const replacements = {};
  const bump = (key, n) => { replacements[key] = (replacements[key] || 0) + n; };

  const masks = [];
  const masked = html.replace(
    /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (match) => {
      const token = `\u0000MASK${masks.length}\u0000`;
      masks.push(match);
      return token;
    }
  );

  let out = '';
  let i = 0;
  while (i < masked.length) {
    const lt = masked.indexOf('<', i);
    if (lt === -1) { out += sanitizeText(masked.slice(i)); break; }
    out += sanitizeText(masked.slice(i, lt));
    const gt = masked.indexOf('>', lt);
    if (gt === -1) { out += masked.slice(lt); break; }
    out += masked.slice(lt, gt + 1);
    i = gt + 1;
  }

  const restored = out.replace(/\u0000MASK(\d+)\u0000/g, (_, n) => masks[Number(n)]);
  return { html: restored, replacements };

  function sanitizeText(text) {
    if (!text) return text;
    let t = text;
    t = t.replace(/\u2014/g, () => { bump('em-dash', 1); return '-'; });
    t = t.replace(/\u2013/g, () => { bump('en-dash', 1); return '-'; });
    t = t.replace(/[\u201C\u201D\u201E\u201F]/g, () => { bump('smart-double-quote', 1); return '"'; });
    t = t.replace(/[\u2018\u2019\u201A\u201B]/g, () => { bump('smart-single-quote', 1); return "'"; });
    t = t.replace(/\u2026/g, () => { bump('ellipsis', 1); return '...'; });
    t = t.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, () => { bump('zero-width', 1); return ''; });
    t = t.replace(/\u00A0/g, () => { bump('nbsp', 1); return ' '; });
    // Arrows often stripped by PDF text extractors \u2014 replace with ASCII for ATS safety.
    // Consume surrounding whitespace to avoid double-spacing in output.
    t = t.replace(/\s*\u2192\s*/g, () => { bump('right-arrow', 1); return ' to '; });
    t = t.replace(/\s*\u2190\s*/g, () => { bump('left-arrow', 1); return ' from '; });
    t = t.replace(/\s*[\u2191\u2193]\s*/g, () => { bump('vert-arrow', 1); return ' '; });
    // Middle dot and bullet glyphs garble in some extractors \u2014 replace with pipe.
    t = t.replace(/\s*\u00B7\s*/g, () => { bump('middot', 1); return ' | '; });
    t = t.replace(/\s*\u2022\s*/g, () => { bump('bullet', 1); return ' | '; });
    // Currency symbols sometimes stripped by font-subsetted PDFs \u2014 spell out
    // the unambiguous ones. \u00A5 is intentionally NOT converted: it maps to both
    // Japanese Yen (JPY) and Chinese Yuan (CNY), so any spelled-out code would be
    // wrong for half of users \u2014 better to leave the glyph than emit bad data.
    t = t.replace(/\u20AC/g, () => { bump('euro', 1); return 'EUR '; });
    t = t.replace(/\u00A3/g, () => { bump('pound', 1); return 'GBP '; });
    // Markdown bold from tailored CV builders (SUMMARY_TEXT uses **…**).
    t = t.replace(/\*\*([^*]+?)\*\*/g, (_, inner) => {
      bump('markdown-bold', 1);
      return `<strong>${inner}</strong>`;
    });
    return t;
  }
}

const SECTION_ALIASES = new Map([
  ['summary', 'summary'],
  ['professional summary', 'summary'],
  ['competencies', 'competencies'],
  ['core competencies', 'competencies'],
  ['experience', 'experience'],
  ['work experience', 'experience'],
  ['professional experience', 'experience'],
  ['projects', 'projects'],
  ['selected projects', 'projects'],
  ['personal projects', 'projects'],
  ['education', 'education'],
  ['education & certifications', 'education'],
  ['certifications', 'certifications'],
  ['skills', 'skills'],
  ['technical skills', 'skills'],
]);

function normalizeSectionTitle(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[^}]+\}\}/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sectionKey(text) {
  const normalized = normalizeSectionTitle(text);
  return SECTION_ALIASES.get(normalized) ?? normalized;
}

function extractRenderedSectionOrder(html) {
  const titleMatches = [...html.matchAll(/class=["'][^"']*\bsection-title\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)];
  const sections = [];

  for (const match of titleMatches) {
    const text = normalizeSectionTitle(match[1]);
    if (!text) continue;
    sections.push({ key: sectionKey(text), title: text });
  }

  return sections;
}

function extractSourceSectionOrder(markdown) {
  const sections = [];

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;
    const text = normalizeSectionTitle(heading[2]);
    if (!text) continue;
    sections.push({ key: sectionKey(text), title: text });
  }

  return sections;
}

/**
 * @param {string} html
 * @param {string} cvMarkdown
 * @param {{ allowReorder?: boolean }} [options] - `allowReorder` downgrades a
 *   detected divergence from a thrown error to a console warning, for JDs
 *   where the section order was deliberately tailored (e.g. Projects moved
 *   ahead of Education for a technical-heavy role) rather than accidentally
 *   scrambled by an agent. See #1646.
 */
export function validateCvSectionOrder(html, cvMarkdown, { allowReorder = false } = {}) {
  const rendered = extractRenderedSectionOrder(html);
  const source = extractSourceSectionOrder(cvMarkdown);
  if (rendered.length < 2 || source.length < 2) return;

  const sourcePositions = new Map(source.map((section, index) => [section.key, index]));
  const renderedComparable = rendered.filter(section => sourcePositions.has(section.key));
  if (renderedComparable.length < 2) return;

  for (let i = 1; i < renderedComparable.length; i++) {
    const previous = renderedComparable[i - 1];
    const current = renderedComparable[i];
    if (sourcePositions.get(current.key) < sourcePositions.get(previous.key)) {
      const renderedOrder = renderedComparable.map(section => section.title).join(' -> ');
      const sourceOrder = source
        .filter(section => renderedComparable.some(renderedSection => renderedSection.key === section.key))
        .map(section => section.title)
        .join(' -> ');
      const message = `CV section order diverges from cv.md: rendered ${renderedOrder}; cv.md ${sourceOrder}`;
      if (allowReorder) {
        console.warn(`⚠️  ${message} (proceeding — --allow-reorder set)`);
        return;
      }
      throw new Error(message);
    }
  }
}

/**
 * Convert a path to a repo-relative manifest entry, or blank if it is unknown
 * or outside the career-ops repository.
 *
 * @param {string} pathValue - Absolute or cwd-relative filesystem path.
 * @returns {string} Repo-relative path using forward slashes, or an empty string.
 */
export function repoRelativeManifestPath(pathValue) {
  if (!pathValue) return '';
  const rel = relative(__dirname, resolve(pathValue));
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return '';
  return rel.split(sep).join('/');
}

export function injectPrintPageCss(html, format = 'a4') {
  const normalizedFormat = String(format || 'a4').toLowerCase();
  const pageSize = normalizedFormat === 'letter' ? 'Letter' : 'A4';
  const pageStyle = `<style id="career-ops-page-setup">\n@page { size: ${pageSize}; margin: ${PDF_PAGE_MARGIN}; }\n</style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${pageStyle}\n</head>`);
  }

  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, match => `${match}\n<head>\n${pageStyle}\n</head>`);
  }

  return `${pageStyle}\n${html}`;
}

/**
 * Record a generated PDF in data/pdf-index.tsv so tools can map a tracker
 * report number to the exact PDF (and its source HTML for regeneration).
 *
 * Columns: report \t pdf \t html \t format \t date — paths relative to the
 * career-ops root with forward slashes. One row per PDF path; when a report
 * number is given, older rows for that report are dropped too (regenerated
 * CVs supersede stale entries). The file is gitignored: it references
 * gitignored output/ artifacts and is meaningless on another machine.
 */
function updatePDFManifest(reportNum, pdfPath, htmlPath, format) {
  const manifestPath = resolve(__dirname, 'data', 'pdf-index.tsv');
  const toRel = (p) => relative(__dirname, p).split(sep).join('/');
  const relPDF = toRel(pdfPath);
  const relHTML = repoRelativeManifestPath(htmlPath);
  const date = new Date().toISOString().slice(0, 10);
  // "008" and "8" are the same report — zero-padded report-link form vs
  // unpadded tracker-# form. Normalize so replacement rows match.
  const normKey = (s) => (s || '').trim().replace(/^0+(?=\d)/, '');

  let lines = [];
  if (existsSync(manifestPath)) {
    lines = readFileSync(manifestPath, 'utf-8').split('\n').filter((line) => {
      if (!line.trim() || line.startsWith('#')) return false;
      const fields = line.split('\t');
      if (fields[1] === relPDF) return false;
      if (reportNum && normKey(fields[0]) === normKey(reportNum)) return false;
      return true;
    });
  }

  lines.push([reportNum || '', relPDF, relHTML, format, date].join('\t'));

  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(
    manifestPath,
    '# report\tpdf\thtml\tformat\tdate — written by generate-pdf.mjs, do not edit\n' +
      lines.join('\n') + '\n'
  );
  return relPDF;
}

/**
 * CLI entrypoint that reads an HTML file, applies ATS-safe normalization, and
 * renders the PDF while preserving report/source metadata for the manifest.
 *
 * @returns {Promise<{outputPath: string, pageCount: number, size: number}>}
 */
async function generatePDF() {
  const args = process.argv.slice(2);

  // Parse arguments
  let inputPath, outputPath, format = 'a4', reportNum = '', allowReorder = false, metaPath = '';

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      format = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--report=')) {
      reportNum = arg.split('=')[1].trim();
    } else if (arg === '--allow-reorder') {
      allowReorder = true;
    } else if (arg.startsWith('--meta=')) {
      metaPath = arg.substring(7).trim();
    } else if (!inputPath) {
      inputPath = arg;
    } else if (!outputPath) {
      outputPath = arg;
    }
  }

  if (!inputPath || !outputPath) {
    console.error('Usage: node generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4] [--report=NNN] [--allow-reorder] [--meta=metadata.json]');
    console.error('');
    console.error('This script only converts an already-built HTML file to PDF.');
    console.error('The input HTML is produced by the pdf mode: the agent fills cv-template.html');
    console.error('with content tailored to the specific job (see modes/pdf.md) — there is no');
    console.error('mechanical markdown-to-HTML step by design. Run `/career-ops pdf` in your AI');
    console.error('CLI to drive the full flow end to end.');
    process.exit(1);
  }

  let meta = {};
  if (metaPath) {
    try {
      meta = JSON.parse(readFileSync(resolve(metaPath), 'utf-8'));
    } catch (err) {
      console.error(`❌ Failed to read --meta file "${metaPath}": ${err.message}`);
      process.exit(1);
    }
  }

  if (reportNum && !/^\d+$/.test(reportNum)) {
    console.error(`Invalid --report "${reportNum}". Use the numeric tracker/report number, e.g. --report=018`);
    process.exit(1);
  }

  inputPath = resolve(inputPath);
  outputPath = resolve(outputPath);

  // Path-traversal guard: keep the PDF write inside the project directory so a
  // crafted output argument (e.g. "../../etc/cron.d/x") can't escape the repo.
  // Anchored to the repo root (__dirname), not process.cwd(): running the script
  // from outside the repo used to falsely refuse in-repo outputs — and, worse,
  // would have allowed writes anywhere under an arbitrary cwd.
  const relOut = relative(__dirname, outputPath);
  if (relOut === '' || relOut.startsWith('..') || isAbsolute(relOut)) {
    console.error(`Refusing to write the PDF outside the project directory: ${outputPath}`);
    process.exit(1);
  }

  // Validate format
  const validFormats = ['a4', 'letter'];
  if (!validFormats.includes(format)) {
    console.error(`Invalid format "${format}". Use: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  console.log(`📄 Input:  ${inputPath}`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`📏 Format: ${format.toUpperCase()}`);

  let html = await readFile(inputPath, 'utf-8');
  let cvMarkdown = '';
  try {
    cvMarkdown = await readFile(resolve(__dirname, 'cv.md'), 'utf-8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  validateCvSectionOrder(html, cvMarkdown, { allowReorder });

  // Normalize text for ATS compatibility (issue #1)
  const normalized = normalizeTextForATS(html);
  html = normalized.html;
  const totalReplacements = Object.values(normalized.replacements).reduce((a, b) => a + b, 0);
  if (totalReplacements > 0) {
    const breakdown = Object.entries(normalized.replacements).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`🧹 ATS normalization: ${totalReplacements} replacements (${breakdown})`);
  }

  return renderHtmlToPdf(html, outputPath, { format, baseDir: dirname(inputPath), reportNum, inputPath, meta });
}

/**
 * Inline url('./fonts/...') references as base64 data: URLs.
 *
 * Chromium refuses to load file:// subresources from a setContent() page
 * (the document stays at about:blank), so fonts referenced by path are
 * silently dropped and PDFs fall back to system fonts. data: URLs carry
 * no origin restriction, so they load from any page. See #951.
 *
 * Missing font files keep their original reference and log a warning.
 *
 * @param {string} html - HTML that may reference url('./fonts/<file>').
 * @returns {Promise<string>} HTML with local font references inlined.
 */
export async function inlineLocalFonts(html) {
  const FONT_REF = /url\(\s*(['"]?)\.\/fonts\/([^'")\s]+)\1\s*\)/g;
  const MIME = { woff2: 'font/woff2', woff: 'font/woff', otf: 'font/otf', ttf: 'font/ttf' };
  const fontsDir = resolve(__dirname, 'fonts');
  const names = [...new Set([...html.matchAll(FONT_REF)].map((m) => m[2]))];
  const dataUrls = new Map();
  for (const name of names) {
    // Containment check: ".." segments and absolute names (./fonts//etc/passwd)
    // would otherwise resolve outside fonts/.
    const fontPath = resolve(fontsDir, name);
    const rel = relative(fontsDir, fontPath);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      console.warn(`⚠️  Font reference escapes fonts/, keeping original reference: ${name}`);
      continue;
    }
    try {
      const buf = await readFile(fontPath);
      const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
      dataUrls.set(name, `url('data:${MIME[ext] || 'application/octet-stream'};base64,${buf.toString('base64')}')`);
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
      console.warn(`⚠️  Font file not found, keeping original reference: fonts/${name}`);
    }
  }
  return html.replace(FONT_REF, (match, _quote, name) => dataUrls.get(name) || match);
}

/**
 * Fill in standard metadata fields (title/author/producer) from the HTML
 * <title> tag and config/profile.yml when the caller's --meta JSON omits
 * them, so every PDF gets at least these even without a job-specific
 * metadata file. Job-specific fields (subject, keywords, custom) pass
 * through untouched — there's no honest way to auto-derive "Target Company"
 * from the HTML alone.
 *
 * @param {object} meta - Parsed --meta JSON (may be empty).
 * @param {string} html - Rendered HTML, used to read <title> as a fallback.
 * @returns {object} meta with title/author/producer/creator defaults filled in.
 */
export function resolveMetaDefaults(meta, html) {
  const resolved = { ...meta };

  if (!resolved.title) {
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) resolved.title = titleMatch[1].trim();
  }

  if (!resolved.author) {
    try {
      const profile = yaml.load(readFileSync(resolve(__dirname, 'config/profile.yml'), 'utf-8'));
      if (profile?.candidate?.full_name) resolved.author = profile.candidate.full_name;
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  resolved.creator = resolved.creator || resolved.author || 'career-ops';
  resolved.producer = resolved.producer || 'pdf-lib (https://github.com/Hopding/pdf-lib)';

  return resolved;
}

function xmlEscape(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

/**
 * Build a minimal XMP metadata packet and attach it to the document catalog
 * as a /Metadata stream.
 *
 * pdf-lib only ever writes the legacy PDF Info dictionary — it has no XMP
 * support. Adobe Acrobat's Document Properties dialog prefers XMP when
 * present, and for dc:subject (keywords) specifically expects an
 * rdf:Bag of separate <rdf:li> entries, not one comma-joined string. Without
 * a matching XMP packet, Acrobat falls back to displaying the raw Info-dict
 * Keywords string wrapped in quotation marks as a single legacy value —
 * that's the artifact this fixes. keywords are written as individual Bag
 * items here so Acrobat renders them as a clean, unquoted list.
 *
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {object} meta - Resolved metadata (title/author/subject/keywords).
 * @param {string[]} keywords - Already-split keyword phrases.
 */
function attachXmpMetadata(pdfDoc, meta, keywords) {
  const subjectItems = keywords.map((k) => `<rdf:li>${xmlEscape(k)}</rdf:li>`).join('');
  const packet = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      ${meta.title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(meta.title)}</rdf:li></rdf:Alt></dc:title>` : ''}
      ${meta.author ? `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(meta.author)}</rdf:li></rdf:Seq></dc:creator>` : ''}
      ${meta.subject ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(meta.subject)}</rdf:li></rdf:Alt></dc:description>` : ''}
      ${keywords.length ? `<dc:subject><rdf:Bag>${subjectItems}</rdf:Bag></dc:subject>` : ''}
      ${keywords.length ? `<pdf:Keywords>${xmlEscape(keywords.join(', '))}</pdf:Keywords>` : ''}
      <xmp:CreatorTool>${xmlEscape(meta.creator || 'career-ops')}</xmp:CreatorTool> 
    </rdf:Description> 
  </rdf:RDF> 
</x:xmpmeta> 
<?xpacket end="w"?>`;

  const bytes = Buffer.from(packet, 'utf-8');
  const stream = PDFRawStream.of(
    pdfDoc.context.obj({
      Type: PDFName.of('Metadata'),
      Subtype: PDFName.of('XML'),
      Length: bytes.length,
    }),
    bytes,
  ); // Construct raw metadata stream
  const ref = pdfDoc.context.register(stream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), ref);
}

/**
 * Inject standard + custom PDF Info dictionary metadata via pdf-lib.
 *
 * Standard fields (title/author/subject/keywords/creator/producer) use
 * pdf-lib's typed setters. Everything under meta.custom is written as a
 * free-form Info dict string entry — these are the fields visible in Adobe
 * Acrobat under File > Document Properties > Custom, or via
 * `exiftool file.pdf` (Role, Target Company, Target Location,
 * Specialisation, Industry Background, Tools, Languages, Work Permit,
 * Availability, etc. — see modes/pdf.md "PDF Metadata" for the convention).
 *
 * @param {Buffer} pdfBuffer - PDF bytes from page.pdf().
 * @param {object} meta - Resolved metadata (see resolveMetaDefaults).
 * @returns {Promise<Buffer>} PDF bytes with metadata written.
 */
export async function injectPdfMetadata(pdfBuffer, meta) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  if (meta.title) pdfDoc.setTitle(meta.title);
  if (meta.author) pdfDoc.setAuthor(meta.author);
  if (meta.subject) pdfDoc.setSubject(meta.subject);
  pdfDoc.setCreator(meta.creator || 'career-ops');
  pdfDoc.setProducer(meta.producer || 'pdf-lib (https://github.com/Hopding/pdf-lib)');

  const infoDict = pdfDoc.getInfoDict();

  // Bypass pdfDoc.setKeywords() — it hard-codes keywords.join(' ') with no
  // delimiter override, which collapses multi-word phrases ("Master Data
  // Governance", "SAP S/4HANA") into one indistinguishable space-joined
  // blob. Writing the Info dict entry directly preserves comma-separated
  // phrase boundaries, matching every prior career-ops CV's Keywords field.
  const keywords = (meta.keywords)
    ? (Array.isArray(meta.keywords) ? meta.keywords : String(meta.keywords).split(','))
        .map((k) => String(k || '').trim())
        .filter(Boolean)
    : []; // Fallback to empty array
  if (keywords.length) {
    infoDict.set(PDFName.of('Keywords'), PDFHexString.fromText(keywords.join(', ')));
  }

  for (const [key, value] of Object.entries(meta.custom || {})) {
    if (value === undefined || value === null || value === '') continue;
    infoDict.set(PDFName.of(key), PDFHexString.fromText(String(value)));
  }

  // Info-dict Keywords alone renders wrapped in quotes in Acrobat's
  // Document Properties dialog without a matching XMP dc:subject array —
  // attach XMP so keywords display as a clean, unquoted list.
  attachXmpMetadata(pdfDoc, meta, keywords);

  // useObjectStreams: false keeps objects as plain, uncompressed PDF
  // structure (matching Playwright's original output) instead of pdf-lib's
  // default compressed object streams — renderHtmlToPdf's page-count regex
  // scans the raw PDF text for literal "/Type /Page" markers, which object
  // streams would hide.
  const bytes = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

/**
 * Render an HTML string to a PDF file via headless Chromium.
 *
 * Writes the HTML to a temporary file in the baseDir and loads it via
 * page.goto() to give the page a file:// origin. This allows relative
 * resources (images, fonts) to load — setContent() runs from about:blank
 * and Chromium blocks file:// subresource loads from non-file origins.
 *
 * Local url('./fonts/...') references are inlined as data: URLs first so
 * fonts also survive the ATS normalization pass (which may strip font refs).
 *
 * @param {string} html - Full HTML document to render.
 * @param {string} outputPath - Absolute path to write the PDF to.
 * @param {{
 *   format?: 'a4'|'letter',
 *   baseDir?: string,
 *   reportNum?: string,
 *   inputPath?: string,
 *   launchBrowser?: (options: {headless: boolean}) => Promise<import('playwright').Browser>
 * }} [opts]
 * @returns {Promise<{outputPath: string, pageCount: number, size: number}>}
 */
export async function renderHtmlToPdf(html, outputPath, opts = {}) {
  const format = opts.format || 'a4';
  const baseDir = opts.baseDir || process.cwd();
  const reportNum = opts.reportNum || '';
  const inputPath = opts.inputPath || '';

  mkdirSync(dirname(outputPath), { recursive: true });

  html = injectPrintPageCss(html, format);
  html = await inlineLocalFonts(html);

  // Write HTML to a temp file in baseDir so page.goto() gives a file://
  // origin that can load local images, fonts, and other resources.
  const tmpHtmlPath = resolve(baseDir, `.career-ops-render-${randomUUID()}.html`);
  const { writeFile, unlink } = await import('fs/promises');
  await writeFile(tmpHtmlPath, html, 'utf-8');

  const launchBrowser = opts.launchBrowser || ((options) => chromium.launch(options));
  let browser = null;
  try {
    browser = await launchBrowser({ headless: true });
    const page = await browser.newPage();

    // Load from file:// so the page origin allows local subresources
    await page.goto(pathToFileURL(tmpHtmlPath).href, {
      waitUntil: 'load',
    });

    // Wait for fonts and images to settle
    await page.evaluate(() => document.fonts.ready);

    // Generate PDF
    let pdfBuffer = await page.pdf({
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
      preferCSSPageSize: true,
    });

    // Inject document metadata (Title/Author/Subject/Keywords + custom Info
    // dict fields like Target Company, Role, Tools). Always runs — with
    // sensible defaults even when the caller passes no --meta — so no PDF
    // this pipeline produces ever leaves the Info dict blank. See
    // modes/pdf.md "PDF Metadata".
    try {
      pdfBuffer = await injectPdfMetadata(pdfBuffer, resolveMetaDefaults(opts.meta || {}, html));
      console.log(`🏷️  Metadata: Title/Author set${opts.meta && Object.keys(opts.meta).length ? ` + ${Object.keys(opts.meta.custom || {}).length} custom field(s)` : ' (defaults only — pass --meta for job-specific fields)'}`);
    } catch (err) {
      // Metadata is enrichment, not a hard requirement — never fail the render over it.
      console.error(`⚠️  Metadata injection failed: ${err.message}`);
    }

    // Write PDF
    await writeFile(outputPath, pdfBuffer);

    // Count pages (approximate from PDF structure)
    const pdfString = pdfBuffer.toString('latin1');
    const pageCount = (pdfString.match(/\/Type\s*\/Page[^s]/g) || []).length;

    console.log(`✅ PDF generated: ${outputPath}`);
    console.log(`📊 Pages: ${pageCount}`);
    console.log(`📦 Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    try {
      updatePDFManifest(reportNum, outputPath, inputPath, format);
      console.log(`🔗 Manifest: data/pdf-index.tsv updated${reportNum ? ` (report ${reportNum})` : ' (no --report given)'}`);
    } catch (err) {
      // The PDF itself succeeded — never fail the run over manifest bookkeeping.
      console.error(`⚠️  Manifest update failed: ${err.message}`);
    }

    return { outputPath, pageCount, size: pdfBuffer.length };
  } finally {
    if (browser) {
      await browser.close().catch((err) => {
        console.warn(`⚠️  Browser cleanup failed: ${err.message}`);
      });
    }
    // Clean up temp file
    await unlink(tmpHtmlPath).catch((err) => {
      if (err?.code !== 'ENOENT') {
        console.warn(`⚠️  Temporary HTML cleanup failed: ${err.message}`);
      }
    });
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  generatePDF().catch((err) => {
    console.error('❌ PDF generation failed:', err.message);
    process.exit(1);
  });
}

export { normalizeTextForATS };
