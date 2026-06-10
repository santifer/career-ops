#!/usr/bin/env node

/**
 * generate-resume.mjs - Tailored resume + cover letter generator
 *
 * Reads a JSON spec (resume or cover letter), expands the matching template
 * (HTML + Markdown), writes outputs to output/{company-slug}-{role-slug}/,
 * and optionally produces a PDF via generate-pdf.mjs.
 *
 * Usage:
 *   node generate-resume.mjs <spec.json> [--no-pdf] [--out <dir>]
 *
 * Spec schema: see templates/README-resume-spec.md
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, 'templates');
const OUTPUT_ROOT = join(__dirname, 'output');
const FONT_DIR = join(__dirname, 'fonts');
const TEMPLATE_FONT_FILES = [
  'dm-sans-latin.woff2',
  'dm-sans-latin-ext.woff2',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const html = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Slugify for folder names. */
const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** Snake_Case for filenames like Danielle_Evans_Resume.pdf. */
const fileSafeName = (s) =>
  String(s ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_\-.]/g, '');

/** Replace {{TOKEN}} occurrences. Missing tokens become empty string. */
function expand(template, tokens) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) =>
    tokens[key] !== undefined && tokens[key] !== null ? String(tokens[key]) : ''
  );
}

async function copyTemplateFonts(outDir) {
  const outFontDir = join(outDir, 'fonts');
  await mkdir(outFontDir, { recursive: true });
  await Promise.all(TEMPLATE_FONT_FILES.map(async (fontFile) => {
    const font = await readFile(join(FONT_DIR, fontFile));
    await writeFile(join(outFontDir, fontFile), font);
  }));
}

/** Linkify a LinkedIn slug or URL. Returns absolute URL or empty. */
function linkedInUrl(raw) {
  if (!raw) return '';
  const r = String(raw).trim();
  if (/^https?:\/\//i.test(r)) return r;
  if (r.startsWith('linkedin.com')) return `https://${r}`;
  if (r.startsWith('/in/') || r.startsWith('in/')) return `https://www.linkedin.com${r.startsWith('/') ? '' : '/'}${r}`;
  return `https://www.linkedin.com/in/${r.replace(/^\/+|\/+$/g, '')}`;
}

// ---------------------------------------------------------------------------
// HTML chunk builders (resume)
// ---------------------------------------------------------------------------

function buildContactLinkedInHtml(linkedinRaw) {
  if (!linkedinRaw) return '';
  const url = linkedInUrl(linkedinRaw);
  const display = String(linkedinRaw).replace(/^https?:\/\/(www\.)?/i, '');
  return `<span class="item"><a href="${html(url)}">${html(display)}</a></span>`;
}

function buildStatusChipsHtml(chips) {
  if (!chips || !chips.length) return '';
  const inner = chips.map((c) => `<span class="chip">${html(c)}</span>`).join('');
  return `<div class="status-chips">${inner}</div>`;
}

function buildCapabilitiesSectionHtml(groups) {
  if (!groups || !groups.length) return '';
  const blocks = groups
    .map((g) => {
      const items = (g.items || []).map((i) => `<li>${html(i)}</li>`).join('');
      return `<div class="cap-group"><div class="cap-head">${html(g.group)}</div><ul>${items}</ul></div>`;
    })
    .join('');
  return `
  <section class="section">
    <div class="section-head">
      <span class="title">Skills</span>
      <span class="meta"></span>
    </div>
    <div class="capabilities">${blocks}</div>
  </section>`;
}

function buildExperienceHtml(experience) {
  if (!experience || !experience.length) return '';
  return experience
    .map((r) => {
      const contractPill = r.contract ? `<span class="contract-pill">Contract</span>` : '';
      const bullets = (r.bullets || []).map((b) => `<li>${html(b)}</li>`).join('');
      const keyBlock = r.key
        ? `<div class="key-callout"><span class="key-tag">Key</span><span class="key-body">${html(r.key)}</span></div>`
        : '';
      const context = r.context ? `<p class="role-context">${html(r.context)}</p>` : '';
      const company = [r.company, r.location].filter(Boolean).map(html).join(' <span class="sep">|</span> ');
      return `
      <div class="role">
        <div class="role-head">
          <span class="role-title">${html(r.title)}${contractPill}</span>
          <span class="role-dates">${html(r.dates || '')}</span>
        </div>
        <div class="role-company">${company}</div>
        ${context}
        ${keyBlock}
        ${bullets ? `<ul class="bullets">${bullets}</ul>` : ''}
      </div>`;
    })
    .join('');
}

function buildEducationSectionHtml(items) {
  if (!items || !items.length) return '';
  const lis = items.map((i) => `<li>${html(i)}</li>`).join('');
  return `
  <section class="section">
    <div class="section-head">
      <span class="title">Education</span>
      <span class="meta"></span>
    </div>
    <ul class="ed-list">${lis}</ul>
  </section>`;
}

function buildCertificationsSectionHtml(items) {
  if (!items || !items.length) return '';
  const lis = items.map((i) => `<li>${html(i)}</li>`).join('');
  return `
  <section class="section">
    <div class="section-head">
      <span class="title">Certifications</span>
      <span class="meta"></span>
    </div>
    <ul class="ed-list">${lis}</ul>
  </section>`;
}

function buildCommunitySectionHtml(community) {
  if (!community) return '';
  return `
  <section class="section">
    <div class="community">
      <div class="panel-title">Community Involvement</div>
      <div>${html(community)}</div>
    </div>
  </section>`;
}

function buildRefereesSectionHtml(referees) {
  if (!referees) return '';
  return `
  <section class="section">
    <div class="section-head">
      <span class="title">Referees</span>
      <span class="meta"></span>
    </div>
    <p class="referees">${html(referees)}</p>
  </section>`;
}

// ---------------------------------------------------------------------------
// Markdown chunk builders (resume) - ATS-safe linear flow
// ---------------------------------------------------------------------------

const PLAIN_DASH = '-';

function buildLinkedInMdInline(linkedinRaw) {
  if (!linkedinRaw) return '';
  const url = linkedInUrl(linkedinRaw);
  const display = String(linkedinRaw).replace(/^https?:\/\/(www\.)?/i, '');
  return ` | LinkedIn: ${display} (${url})`;
}

function buildStatusLine(chips) {
  if (!chips || !chips.length) return '';
  return chips.join(' | ');
}

function buildCapabilitiesMd(groups) {
  if (!groups || !groups.length) return '';
  return groups
    .map((g) => {
      const items = (g.items || []).map((i) => `${PLAIN_DASH} ${i}`).join('\n');
      return `**${g.group}**\n\n${items}`;
    })
    .join('\n\n');
}

function buildExperienceMd(experience) {
  if (!experience || !experience.length) return '';
  return experience
    .map((r) => {
      const titleLine = `### ${r.title}${r.contract ? ' (Contract)' : ''} | ${r.company}${r.location ? `, ${r.location}` : ''}`;
      const dateLine = `**${r.dates || ''}**`;
      const context = r.context ? `\n${r.context}\n` : '';
      const keyLine = r.key ? `\n> KEY: ${r.key}\n` : '';
      const bullets = (r.bullets || []).map((b) => `${PLAIN_DASH} ${b}`).join('\n');
      return `${titleLine}\n\n${dateLine}${context}${keyLine}\n${bullets}`.trim();
    })
    .join('\n\n');
}

function buildEducationMd(items) {
  if (!items || !items.length) return '';
  return items.map((i) => `${PLAIN_DASH} ${i}`).join('\n');
}

function buildCertificationsMd(items) {
  if (!items || !items.length) return '';
  return items.map((i) => `${PLAIN_DASH} ${i}`).join('\n');
}

function buildCertificationsMdSection(items) {
  const body = buildCertificationsMd(items);
  if (!body) return '';
  return `\n## Certifications\n\n${body}\n`;
}

function buildCommunityMdSection(community) {
  if (!community) return '';
  return `\n## Community Involvement\n\n${community}\n`;
}

function buildToolsMd(tools) {
  if (!tools || !tools.length) return '';
  return tools.map((t) => `${PLAIN_DASH} ${t}`).join('\n');
}

// ---------------------------------------------------------------------------
// Cover letter chunk builders
// ---------------------------------------------------------------------------

function buildAddresseeHtml(addressee) {
  if (!addressee) return '';
  const r = addressee.recipient ? `<div class="recipient">${html(addressee.recipient)}</div>` : '';
  const o = addressee.org ? `<div class="org">${html(addressee.org)}</div>` : '';
  const extra = (addressee.lines || []).map((l) => `<div>${html(l)}</div>`).join('');
  return `${r}${o}${extra}`;
}

function buildAddresseeMd(addressee) {
  if (!addressee) return '';
  const parts = [];
  if (addressee.recipient) parts.push(addressee.recipient);
  if (addressee.org) parts.push(addressee.org);
  if (addressee.lines) parts.push(...addressee.lines);
  return parts.join('  \n');
}

function buildLetterBodyHtml(paragraphs) {
  if (!paragraphs || !paragraphs.length) return '';
  return paragraphs.map((p) => `<p>${html(p)}</p>`).join('');
}

function buildLetterBodyMd(paragraphs) {
  if (!paragraphs || !paragraphs.length) return '';
  return paragraphs.join('\n\n');
}

function normalizeProof(proof) {
  if (!proof) return null;
  if (typeof proof === 'string') return { label: 'Relevant Fit', text: proof };
  if (!proof.text && !proof.body) return null;
  return {
    label: proof.label || 'Relevant Fit',
    text: proof.text || proof.body,
  };
}

function buildLetterProofHtml(proof) {
  const normalized = normalizeProof(proof);
  if (!normalized) return '';
  return `
    <div class="proof">
      <div class="proof-label">${html(normalized.label)}</div>
      <p>${html(normalized.text)}</p>
    </div>`;
}

function buildLetterProofMd(proof) {
  const normalized = normalizeProof(proof);
  if (!normalized) return '';
  return `\n**${normalized.label}:** ${normalized.text}\n`;
}

// ---------------------------------------------------------------------------
// Common token bag
// ---------------------------------------------------------------------------

function commonContactTokens(applicant) {
  return {
    NAME: (applicant?.name || '').toUpperCase(),
    NAME_TITLE_CASE: applicant?.name || '',
    HEADLINE: applicant?.headline || '',
    LOCATION: applicant?.location || '',
    PHONE: applicant?.phone || '',
    EMAIL: applicant?.email || '',
    LANG: applicant?.lang || 'en-AU',
  };
}

// ---------------------------------------------------------------------------
// Render: Resume
// ---------------------------------------------------------------------------

async function renderResume(spec, outDir) {
  const tplHtml = await readFile(join(TEMPLATE_DIR, 'resume-template.html'), 'utf-8');
  const tplMd   = await readFile(join(TEMPLATE_DIR, 'resume-template.md'),   'utf-8');

  const a = spec.applicant || {};
  const linkedinItem = buildContactLinkedInHtml(a.linkedin);

  // ---- HTML tokens ----
  const htmlTokens = {
    ...commonContactTokens(a),
    LINKEDIN_ITEM: linkedinItem,
    STATUS_CHIPS_HTML: buildStatusChipsHtml(a.status_chips),
    SUMMARY_META: html(spec.summary?.meta || ''),
    SUMMARY: html(spec.summary?.text || ''),
    CAPABILITIES_SECTION: buildCapabilitiesSectionHtml(spec.capabilities),
    EXPERIENCE_HTML: buildExperienceHtml(spec.experience),
    EDUCATION_SECTION: buildEducationSectionHtml(spec.education),
    CERTIFICATIONS_SECTION: buildCertificationsSectionHtml(spec.certifications),
    COMMUNITY_SECTION: buildCommunitySectionHtml(spec.community),
    REFEREES_SECTION: buildRefereesSectionHtml(spec.referees),
  };

  // ---- Markdown tokens ----
  const mdTokens = {
    NAME: a.name || '',
    HEADLINE: a.headline || '',
    LOCATION: a.location || '',
    PHONE: a.phone || '',
    EMAIL: a.email || '',
    LINKEDIN_MD_INLINE: buildLinkedInMdInline(a.linkedin),
    STATUS_LINE: buildStatusLine(a.status_chips),
    SUMMARY: spec.summary?.text || '',
    CAPABILITIES_MD: buildCapabilitiesMd(spec.capabilities),
    EXPERIENCE_MD: buildExperienceMd(spec.experience),
    EDUCATION_MD: buildEducationMd(spec.education),
    CERTIFICATIONS_MD_SECTION: buildCertificationsMdSection(spec.certifications),
    COMMUNITY_MD_SECTION: buildCommunityMdSection(spec.community),
    TOOLS_MD: buildToolsMd(spec.tools),
  };

  const outHtml = expand(tplHtml, htmlTokens);
  const outMd   = expand(tplMd, mdTokens);

  const baseName = `${fileSafeName(a.name) || 'Resume'}_Resume`;
  const htmlPath = join(outDir, `${baseName}.html`);
  const mdPath   = join(outDir, `${baseName}.md`);

  await writeFile(htmlPath, outHtml, 'utf-8');
  await writeFile(mdPath,   outMd,   'utf-8');

  return { kind: 'resume', htmlPath, mdPath, baseName };
}

// ---------------------------------------------------------------------------
// Render: Cover Letter
// ---------------------------------------------------------------------------

async function renderCoverLetter(spec, outDir) {
  const tplHtml = await readFile(join(TEMPLATE_DIR, 'cover-letter-template.html'), 'utf-8');
  const tplMd   = await readFile(join(TEMPLATE_DIR, 'cover-letter-template.md'),   'utf-8');

  const a = spec.applicant || {};
  const j = spec.job || {};
  const linkedinItem = buildContactLinkedInHtml(a.linkedin);
  const refSuffix = j.ref_number ? ` | Ref ${j.ref_number}` : '';

  // ---- HTML tokens ----
  const htmlTokens = {
    ...commonContactTokens(a),
    LINKEDIN_ITEM: linkedinItem,
    LETTER_DATE: html(spec.letter_date || ''),
    ROLE: html(j.role || ''),
    ROLE_SHORT: html(j.role_short || j.role || ''),
    REF_NUMBER_SUFFIX: html(refSuffix),
    ADDRESSEE_HTML: buildAddresseeHtml(spec.addressee),
    SALUTATION: html(spec.salutation || `Dear hiring panel,`),
    BODY_HTML: buildLetterBodyHtml(spec.body_paragraphs),
    PROOF_HTML: buildLetterProofHtml(spec.proof),
    CLOSING: html(spec.closing || 'Sincerely'),
  };

  // ---- Markdown tokens ----
  const mdTokens = {
    NAME: a.name || '',
    NAME_TITLE_CASE: a.name || '',
    HEADLINE: a.headline || '',
    LOCATION: a.location || '',
    PHONE: a.phone || '',
    EMAIL: a.email || '',
    LINKEDIN_MD_INLINE: buildLinkedInMdInline(a.linkedin),
    LETTER_DATE: spec.letter_date || '',
    ROLE: j.role || '',
    REF_NUMBER_SUFFIX: refSuffix,
    ADDRESSEE_MD: buildAddresseeMd(spec.addressee),
    SALUTATION: spec.salutation || `Dear hiring panel,`,
    BODY_MD: buildLetterBodyMd(spec.body_paragraphs),
    PROOF_MD: buildLetterProofMd(spec.proof),
    CLOSING: spec.closing || 'Sincerely',
  };

  const outHtml = expand(tplHtml, htmlTokens);
  const outMd   = expand(tplMd, mdTokens);

  const baseName = `${fileSafeName(a.name) || 'Applicant'}_Cover_Letter`;
  const htmlPath = join(outDir, `${baseName}.html`);
  const mdPath   = join(outDir, `${baseName}.md`);

  await writeFile(htmlPath, outHtml, 'utf-8');
  await writeFile(mdPath,   outMd,   'utf-8');

  return { kind: 'cover-letter', htmlPath, mdPath, baseName };
}

// ---------------------------------------------------------------------------
// PDF generation - delegates to generate-pdf.mjs
// ---------------------------------------------------------------------------

function runPdf(htmlPath, pdfPath) {
  return new Promise((resolveP, rejectP) => {
    const script = join(__dirname, 'generate-pdf.mjs');
    const child = spawn('node', [script, htmlPath, pdfPath, '--format=a4'], {
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`generate-pdf.mjs exited with code ${code}`));
    });
    child.on('error', rejectP);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node generate-resume.mjs <spec.json> [--no-pdf] [--out <dir>]');
    process.exit(1);
  }

  let specPath = null;
  let noPdf = false;
  let outOverride = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-pdf') noPdf = true;
    else if (arg === '--out') { outOverride = args[++i]; }
    else if (!specPath) specPath = arg;
    else { console.error(`Unknown argument: ${arg}`); process.exit(1); }
  }

  specPath = resolve(specPath);
  if (!existsSync(specPath)) {
    console.error(`Spec not found: ${specPath}`);
    process.exit(1);
  }

  const spec = JSON.parse(await readFile(specPath, 'utf-8'));

  // Determine output folder: output/{company-slug}-{role-slug}/
  let outDir;
  if (outOverride) {
    outDir = resolve(outOverride);
  } else {
    const companySlug = slug(spec.job?.company || 'unknown');
    const roleSlug    = slug(spec.job?.role    || 'role');
    outDir = join(OUTPUT_ROOT, `${companySlug}-${roleSlug}`);
  }
  await mkdir(outDir, { recursive: true });
  await copyTemplateFonts(outDir);

  // Copy spec into output folder for traceability
  const specCopy = join(outDir, `${spec.kind || 'spec'}-spec.json`);
  await writeFile(specCopy, JSON.stringify(spec, null, 2), 'utf-8');

  // Render
  let result;
  if (spec.kind === 'resume')            result = await renderResume(spec, outDir);
  else if (spec.kind === 'cover-letter') result = await renderCoverLetter(spec, outDir);
  else {
    console.error(`Unknown spec.kind: "${spec.kind}". Expected "resume" or "cover-letter".`);
    process.exit(1);
  }

  console.log(`📄 HTML  : ${result.htmlPath}`);
  console.log(`📝 Markdown: ${result.mdPath}`);

  if (!noPdf) {
    const pdfPath = join(outDir, `${result.baseName}.pdf`);
    console.log(`🖨️  Generating PDF → ${pdfPath}`);
    await runPdf(result.htmlPath, pdfPath);
  } else {
    console.log('⏭️  Skipping PDF (--no-pdf)');
  }

  console.log(`✅ Done. Output folder: ${outDir}`);
}

main().catch((err) => {
  console.error('❌ generate-resume failed:', err.message);
  process.exit(1);
});
