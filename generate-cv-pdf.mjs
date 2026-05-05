#!/usr/bin/env node
/**
 * generate-cv-pdf.mjs — Render cv.md + config/profile.yml to a PDF.
 *
 * Usage: node generate-cv-pdf.mjs
 * Inputs:
 *   - cv.md                (CV body, markdown)
 *   - config/profile.yml   (header: name, contact line)
 * Output:
 *   - output/{kebab(full_name)}-cv.pdf  (e.g. output/tony-walteur-cv.pdf)
 *
 * Falls back to output/tony-walteur-cv.pdf if profile.yml is missing or
 * incomplete, so existing consumers (auto-apply.mjs RESUME_PDF_LEGACY) still
 * find the file.
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = __dirname;
const OUTPUT_DIR = join(ROOT, 'output');
const CV_FILE    = join(ROOT, 'cv.md');
const PROFILE    = join(ROOT, 'config', 'profile.yml');

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Profile loader (same regex pattern used in auto-apply.mjs) ──────────────

function loadProfile() {
  const fallback = { full_name: '', email: '', phone: '', location: '', linkedin: '' };
  if (!existsSync(PROFILE)) return fallback;
  const yml = readFileSync(PROFILE, 'utf8');
  const candidateBlock = yml.match(/^candidate:\s*\n([\s\S]*?)(?=^\S|\Z)/m);
  const scope = candidateBlock ? candidateBlock[1] : yml;
  const get = (key) => {
    const m = scope.match(new RegExp(`^\\s+${key}:\\s*"?([^"\\n]+?)"?\\s*$`, 'm'));
    return m ? m[1].trim() : '';
  };
  const linkedinRaw = get('linkedin');
  const linkedin = linkedinRaw && !/^https?:\/\//i.test(linkedinRaw)
    ? linkedinRaw.replace(/^\/+/, '')
    : linkedinRaw;
  return {
    full_name: get('full_name'),
    email:     get('email'),
    phone:     get('phone'),
    location:  get('location'),
    linkedin,
    headline:  get('headline'),
  };
}

function kebabCase(s) {
  return String(s).toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Minimal markdown → HTML for our CV format ───────────────────────────────
// Supports: H1/H2/H3, bullet lists (-), paragraphs, **bold**, *italic*,
// inline `code`, [text](url). Discards the leading H1 (name) and the contact
// line right under it; both come from profile.yml so the header is consistent.

function inline(s) {
  // Order matters: links before emphasis
  return escHtml(s)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function mdToHtml(md) {
  // Drop the leading H1 (name) — header comes from profile.yml.
  // Also drop the immediately-following contact line if present (single line
  // of plain text under the H1, often "City | phone | email | linkedin").
  md = md.replace(/^#\s+.+\n+/, '');
  md = md.replace(/^(?!#)([^\n]+)\n+/, ''); // strip first non-heading line

  const out = [];
  let inList = false;
  let inPara = false;
  let paraBuf = [];

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  const closePara = () => {
    if (inPara) { out.push(`<p>${inline(paraBuf.join(' '))}</p>`); paraBuf = []; inPara = false; }
  };

  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '');

    if (!line.trim()) { closeList(); closePara(); continue; }

    let m;
    if ((m = line.match(/^###\s+(.+)$/))) {
      closeList(); closePara();
      out.push(`<h3>${inline(m[1])}</h3>`);
    } else if ((m = line.match(/^##\s+(.+)$/))) {
      closeList(); closePara();
      out.push(`<h2>${inline(m[1])}</h2>`);
    } else if ((m = line.match(/^#\s+(.+)$/))) {
      // Treat any further H1 as an H2-equivalent
      closeList(); closePara();
      out.push(`<h2>${inline(m[1])}</h2>`);
    } else if ((m = line.match(/^[-*]\s+(.+)$/))) {
      closePara();
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      closeList();
      inPara = true;
      paraBuf.push(line.trim());
    }
  }
  closeList();
  closePara();
  return out.join('\n');
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderHtml(profile, body) {
  const name = profile.full_name || 'Resume';
  const headline = profile.headline || '';
  const contactBits = [profile.email, profile.phone, profile.location, profile.linkedin].filter(Boolean);
  const contactHtml = contactBits.map(escHtml).join(' &nbsp;·&nbsp; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(name)} — CV</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt;
    color: #1a1a1a;
    line-height: 1.45;
    padding: 36px 44px;
  }
  h1 { font-size: 20pt; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 2px; }
  .tagline { font-size: 10.5pt; color: #444; margin-bottom: 4px; font-style: italic; }
  .contact { font-size: 9.5pt; color: #555; margin-bottom: 18px; }
  .contact a { color: #555; text-decoration: none; }
  h2 {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #222;
    border-bottom: 1.5px solid #d0d0d0;
    padding-bottom: 3px;
    margin: 16px 0 8px;
  }
  h3 { font-size: 10.5pt; font-weight: 700; margin-top: 12px; margin-bottom: 2px; }
  p { margin: 4px 0 6px; }
  ul { padding-left: 16px; margin: 4px 0 6px; }
  li { margin-bottom: 3px; font-size: 10pt; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  code { font-family: 'SF Mono', ui-monospace, monospace; font-size: 9.5pt; background: #f4f4f4; padding: 0 3px; border-radius: 2px; }
  a { color: inherit; text-decoration: none; }
</style>
</head>
<body>

<h1>${escHtml(name)}</h1>
${headline ? `<div class="tagline">${escHtml(headline)}</div>\n` : ''}<div class="contact">${contactHtml}</div>

${body}

</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(CV_FILE)) {
    console.error(`✖ ${CV_FILE} not found. Create cv.md before running this script.`);
    process.exit(1);
  }

  const profile = loadProfile();
  const md = readFileSync(CV_FILE, 'utf8');
  const body = mdToHtml(md);
  const html = renderHtml(profile, body);

  const htmlPath = join(OUTPUT_DIR, 'cv.html');
  writeFileSync(htmlPath, html, 'utf8');
  console.log(`HTML written: ${htmlPath}`);

  // Filename: kebab(full_name)-cv.pdf, with the legacy filename as fallback.
  const slug = profile.full_name ? kebabCase(profile.full_name) : '';
  const pdfName = slug ? `${slug}-cv.pdf` : 'tony-walteur-cv.pdf';
  const pdfPath = join(OUTPUT_DIR, pdfName);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`);
    await page.waitForLoadState('networkidle');
    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  console.log(`PDF generated: ${pdfPath}`);
  console.log(JSON.stringify({ ok: true, htmlPath, pdfPath, name: profile.full_name }));
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
