#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(ROOT, 'templates', 'cv-template.html');
const PLACEHOLDER_RE = /\{\{[^{}]+\}\}/g;
const PAGE_WIDTHS = new Set(['210mm', '8.5in']);

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function safeUrl(value, protocols = ['https:', 'http:']) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    return protocols.includes(parsed.protocol) ? escapeHtml(raw) : '';
  } catch {
    return '';
  }
}

function renderContact(candidate = {}) {
  const items = [];
  const phone = String(candidate.phone ?? '').trim();
  const email = String(candidate.email ?? '').trim();
  const linkedinUrl = safeUrl(candidate.linkedin?.url);
  const portfolioUrl = safeUrl(candidate.portfolio?.url);
  const location = String(candidate.location ?? '').trim();

  if (phone) items.push(`<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>`);
  if (email) items.push(`<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`);
  if (linkedinUrl) {
    items.push(`<a href="${linkedinUrl}">${escapeHtml(candidate.linkedin?.display || candidate.linkedin.url)}</a>`);
  }
  if (portfolioUrl) {
    items.push(`<a href="${portfolioUrl}">${escapeHtml(candidate.portfolio?.display || candidate.portfolio.url)}</a>`);
  }
  if (location) items.push(`<span>${escapeHtml(location)}</span>`);

  return items.join('\n      <span class="separator">|</span>\n      ');
}

function renderCompetencies(entries) {
  return Array.isArray(entries)
    ? entries.map(entry => `<span class="competency-tag">${escapeHtml(entry)}</span>`).join('\n      ')
    : '';
}

function renderExperience(entries) {
  if (!Array.isArray(entries)) return '';
  return entries.filter(Boolean).map(entry => {
    const bullets = Array.isArray(entry.bullets)
      ? entry.bullets.map(bullet => `      <li>${escapeHtml(bullet)}</li>`).join('\n')
      : '';
    return `<div class="job">
    <div class="job-header">
      <div class="job-company">${escapeHtml(entry.company)}</div>
      <div class="job-period">${escapeHtml(entry.dates)}</div>
    </div>
    <div class="job-role">${escapeHtml(entry.role)}</div>
    <div class="job-location">${escapeHtml(entry.location)}</div>
    <ul>
${bullets}
    </ul>
  </div>`;
  }).join('\n  ');
}

function renderProjects(entries) {
  if (!Array.isArray(entries)) return '';
  return entries.filter(Boolean).map(entry => {
    const badge = entry.badge ? `<span class="project-badge">${escapeHtml(entry.badge)}</span>` : '';
    const description = entry.description ? `<div class="project-desc">${escapeHtml(entry.description)}</div>` : '';
    const tech = entry.tech ? `<div class="project-tech">${escapeHtml(entry.tech)}</div>` : '';
    return `<div class="project">
    <div><span class="project-title">${escapeHtml(entry.name)}</span>${badge}</div>
    ${description}
    ${tech}
  </div>`;
  }).join('\n  ');
}

function renderEducation(entries) {
  if (!Array.isArray(entries)) return '';
  return entries.filter(Boolean).map(entry => `<div class="edu-item">
    <div><strong>${escapeHtml(entry.degree)}</strong>${entry.year ? ` <span class="edu-year">${escapeHtml(entry.year)}</span>` : ''}</div>
    <div>${escapeHtml(entry.institution)}${entry.location ? ` — ${escapeHtml(entry.location)}` : ''}</div>
  </div>`).join('\n  ');
}

function renderCertifications(entries) {
  if (!Array.isArray(entries)) return '';
  return entries.filter(Boolean).map(entry => `<div class="cert-item">
    <span class="cert-title">${escapeHtml(entry.title)}</span>
    <span class="cert-org">${escapeHtml(entry.organization)}</span>
    <span class="cert-year">${escapeHtml(entry.year)}</span>
  </div>`).join('\n  ');
}

function renderSkills(entries) {
  if (!Array.isArray(entries)) return '';
  const items = entries.filter(Boolean).map(entry => {
    const values = Array.isArray(entry.items) ? entry.items.join(', ') : entry.items;
    return `<div class="skill-item"><span class="skill-category">${escapeHtml(entry.category)}:</span> ${escapeHtml(values)}</div>`;
  }).join('\n    ');
  return `<div class="skills-grid">\n    ${items}\n  </div>`;
}

function renderPhoto(candidate = {}) {
  const raw = String(candidate.photo ?? '').trim();
  if (!raw) return '';
  const isDataImage = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(raw);
  const isLocalPath = !/^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (!isDataImage && !isLocalPath) {
    throw new Error('candidate.photo must be a local path or base64 image data URL');
  }
  return `<img class="cv-photo" src="${escapeHtml(raw)}" alt="${escapeHtml(candidate.name)}">`;
}

export function buildCvHtml(template, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('input JSON must be an object');
  }
  const pageWidth = payload.page_width || '210mm';
  if (!PAGE_WIDTHS.has(pageWidth)) {
    throw new Error('page_width must be 210mm or 8.5in');
  }

  const candidate = payload.candidate || {};
  const labels = {
    summary: 'Professional Summary',
    competencies: 'Core Competencies',
    experience: 'Work Experience',
    projects: 'Projects',
    education: 'Education',
    certifications: 'Certifications',
    skills: 'Skills',
    ...(payload.section_labels || {}),
  };
  const substitutions = {
    LANG: escapeHtml(payload.lang || 'en'),
    PAGE_WIDTH: pageWidth,
    PHOTO: renderPhoto(candidate),
    NAME: escapeHtml(candidate.name),
    PHONE: '',
    EMAIL: '',
    LINKEDIN_URL: '',
    LINKEDIN_DISPLAY: '',
    PORTFOLIO_URL: '',
    PORTFOLIO_DISPLAY: '',
    LOCATION: '',
    SECTION_SUMMARY: escapeHtml(labels.summary),
    SUMMARY_TEXT: escapeHtml(payload.summary),
    SECTION_COMPETENCIES: escapeHtml(labels.competencies),
    COMPETENCIES: renderCompetencies(payload.competencies),
    SECTION_EXPERIENCE: escapeHtml(labels.experience),
    EXPERIENCE: renderExperience(payload.experience),
    SECTION_PROJECTS: escapeHtml(labels.projects),
    PROJECTS: renderProjects(payload.projects),
    SECTION_EDUCATION: escapeHtml(labels.education),
    EDUCATION: renderEducation(payload.education),
    SECTION_CERTIFICATIONS: escapeHtml(labels.certifications),
    CERTIFICATIONS: renderCertifications(payload.certifications),
    SECTION_SKILLS: escapeHtml(labels.skills),
    SKILLS: renderSkills(payload.skills),
  };

  let output = template.replace(
    /<div class="contact-row">[\s\S]*?<\/div>/,
    `<div class="contact-row">\n      ${renderContact(candidate)}\n    </div>`,
  );
  output = output.replace(PLACEHOLDER_RE, token => {
    const key = token.slice(2, -2);
    return Object.hasOwn(substitutions, key) ? substitutions[key] : token;
  });

  const unresolved = [...new Set(output.match(PLACEHOLDER_RE) || [])];
  if (unresolved.length) throw new Error(`Unresolved placeholders: ${unresolved.join(', ')}`);
  return output;
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath || inputPath === '--help') {
    console.error('Usage: node build-cv-html.mjs <input.json> <output.html>');
    process.exitCode = inputPath === '--help' ? 0 : 1;
    return;
  }

  try {
    if (!existsSync(inputPath)) throw new Error(`Input file not found: ${resolve(inputPath)}`);
    const payload = JSON.parse(await readFile(inputPath, 'utf8'));
    const template = await readFile(TEMPLATE_PATH, 'utf8');
    const html = buildCvHtml(template, payload);
    const absoluteOutput = resolve(outputPath);
    await mkdir(dirname(absoluteOutput), { recursive: true });
    await writeFile(absoluteOutput, html, 'utf8');
    const info = await stat(absoluteOutput);
    console.log(JSON.stringify({
      file: basename(absoluteOutput),
      path: absoluteOutput,
      sizeKB: Number((info.size / 1024).toFixed(1)),
      valid: true,
    }, null, 2));
  } catch (error) {
    console.error(`Failed to build CV HTML: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
