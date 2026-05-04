#!/usr/bin/env node

/**
 * generate-html.mjs -- JSON payload + HTML template -> rendered CV HTML
 *
 * Usage:
 *   node generate-html.mjs --payload payload.json --out output/cv.html
 *   cat payload.json | node generate-html.mjs --from-stdin --out output/cv.html
 *
 * Options:
 *   --template <path>    HTML template (default: templates/cv-template.html)
 *   --payload <path>     JSON payload file
 *   --from-stdin         Read payload from stdin instead of --payload
 *   --out <path>         Output HTML path (required)
 *   --format=letter|a4   Page format; payload.format overrides this
 *   --lang=en|es|...     Language for section labels; payload.lang overrides this
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Section labels by language
// ---------------------------------------------------------------------------

const LABELS = {
  en: { summary: 'Professional Summary', competencies: 'Core Competencies', experience: 'Work Experience', projects: 'Projects', education: 'Education', certifications: 'Certifications', skills: 'Skills' },
  es: { summary: 'Resumen Profesional', competencies: 'Competencias Core', experience: 'Experiencia Laboral', projects: 'Proyectos', education: 'Formación', certifications: 'Certificaciones', skills: 'Competencias' },
  de: { summary: 'Berufsprofil', competencies: 'Kernkompetenzen', experience: 'Berufserfahrung', projects: 'Projekte', education: 'Ausbildung', certifications: 'Zertifizierungen', skills: 'Fähigkeiten' },
  fr: { summary: 'Résumé Professionnel', competencies: 'Compétences Clés', experience: 'Expérience Professionnelle', projects: 'Projets', education: 'Formation', certifications: 'Certifications', skills: 'Compétences' },
  ja: { summary: '職務要約', competencies: 'コアコンピテンシー', experience: '職務経歴', projects: 'プロジェクト', education: '学歴', certifications: '資格', skills: 'スキル' },
};

const PAGE_WIDTHS = { letter: '8.5in', a4: '210mm' };

const SECTION_COMMENTS = {
  summary: 'PROFESSIONAL SUMMARY',
  competencies: 'CORE COMPETENCIES',
  experience: 'WORK EXPERIENCE',
  projects: 'PROJECTS',
  education: 'EDUCATION',
  certifications: 'CERTIFICATIONS',
  skills: 'SKILLS',
};

// ---------------------------------------------------------------------------
// HTML escaping (for candidate fields, section labels, etc.)
// Bullets, summaries, and project descriptions pass through raw -- they may
// contain inline HTML (<strong>, <a>) placed by the agent.
// ---------------------------------------------------------------------------

function esc(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Section renderers -- produce inner HTML matching the template's structure
// ---------------------------------------------------------------------------

function renderCompetencies(items) {
  return items
    .map(c => `      <span class="competency-tag">${esc(c)}</span>`)
    .join('\n');
}

function renderExperience(jobs) {
  return jobs.map(job => {
    const company = job.location
      ? `${esc(job.company)} &mdash; ${esc(job.location)}`
      : esc(job.company);
    const bullets = job.bullets
      .map(b => `        <li>${b}</li>`)
      .join('\n');
    return `    <div class="job">
      <div class="job-header">
        <span class="job-company">${company}</span>
        <span class="job-period">${esc(job.period)}</span>
      </div>
      <div class="job-role">${esc(job.role)}</div>
      <ul>
${bullets}
      </ul>
    </div>`;
  }).join('\n\n');
}

function renderProjects(projects) {
  return projects.map(p => {
    let h = `    <div class="project">
      <div class="project-title">${p.url ? `<a href="${esc(p.url)}">${esc(p.title)}</a>` : esc(p.title)}</div>
      <div class="project-desc">${p.description}</div>`;
    if (p.tech) h += `\n      <div class="project-tech">${esc(p.tech)}</div>`;
    return h + '\n    </div>';
  }).join('\n\n');
}

function renderEducation(items) {
  return items.map(e =>
    `    <div class="edu-item">
      <div class="edu-header">
        <div><span class="edu-title">${esc(e.degree)}</span> &mdash; <span class="edu-org">${esc(e.institution)}</span></div>
        <span class="edu-year">${esc(e.year)}</span>
      </div>
    </div>`
  ).join('\n');
}

function renderCertifications(items) {
  return items.map(c =>
    `    <div class="cert-item">
      <span class="cert-title">${esc(c.title)}</span>
      <span class="cert-org">${esc(c.issuer)}</span>
    </div>`
  ).join('\n');
}

function renderSkills(items) {
  const rows = items.map(s =>
    `      <div class="skill-item"><span class="skill-category">${esc(s.category)}:</span> ${esc(s.items)}</div>`
  ).join('\n');
  return `    <div class="skills-grid">\n${rows}\n    </div>`;
}

// ---------------------------------------------------------------------------
// Section removal -- hides entire template sections via comment markers.
// Tracks <div> nesting so nested inner divs don't cause an early match.
// ---------------------------------------------------------------------------

function removeSection(html, key) {
  const comment = SECTION_COMMENTS[key];
  if (!comment) return html;

  const marker = `<!-- ${comment} -->`;
  const mIdx = html.indexOf(marker);
  if (mIdx === -1) return html;

  const divStart = html.indexOf('<div', mIdx + marker.length);
  if (divStart === -1) return html;

  let depth = 0;
  let i = divStart;
  let end = -1;

  while (i < html.length) {
    if (html[i] !== '<') { i++; continue; }
    if (html.startsWith('<div', i) && /[\s>]/.test(html[i + 4] || '')) {
      depth++;
      i = html.indexOf('>', i) + 1;
    } else if (html.startsWith('</div>', i)) {
      depth--;
      if (depth === 0) { end = i + 6; break; }
      i += 6;
    } else {
      i++;
    }
  }

  if (end === -1) return html;

  let start = mIdx;
  while (start > 0 && (html[start - 1] === ' ' || html[start - 1] === '\n')) start--;

  return html.slice(0, start) + html.slice(end);
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    template: resolve(__dirname, 'templates/cv-template.html'),
    payload: null,
    out: null,
    format: null,
    lang: null,
    fromStdin: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from-stdin') opts.fromStdin = true;
    else if (a === '--template' && args[i + 1]) opts.template = resolve(args[++i]);
    else if (a === '--payload' && args[i + 1]) opts.payload = resolve(args[++i]);
    else if (a === '--out' && args[i + 1]) opts.out = resolve(args[++i]);
    else if (a.startsWith('--format=')) opts.format = a.split('=')[1].toLowerCase();
    else if (a.startsWith('--lang=')) opts.lang = a.split('=')[1].toLowerCase();
  }

  if (!opts.payload && !opts.fromStdin) {
    console.error('Usage: node generate-html.mjs --payload <json> --out <html>');
    console.error('       cat payload.json | node generate-html.mjs --from-stdin --out <html>');
    process.exit(1);
  }
  if (!opts.out) {
    console.error('Error: --out <path> is required');
    process.exit(1);
  }
  return opts;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const template = await readFile(opts.template, 'utf-8');
  const raw = opts.fromStdin
    ? await readStdin()
    : await readFile(opts.payload, 'utf-8');

  let payload;
  try { payload = JSON.parse(raw); }
  catch (e) { console.error(`Invalid JSON: ${e.message}`); process.exit(1); }

  const format = payload.format || opts.format || 'letter';
  const lang   = payload.lang   || opts.lang   || 'en';
  const labels = LABELS[lang]   || LABELS.en;
  const { candidate } = payload;

  if (!candidate?.full_name || !candidate?.email) {
    console.error('Error: candidate.full_name and candidate.email are required');
    process.exit(1);
  }

  const vis = {
    summary: true, competencies: true, experience: true,
    projects: true, education: true, certifications: true, skills: true,
    ...payload.sections,
  };

  let html = template;

  // 1. Remove hidden sections before placeholder replacement
  for (const [key, visible] of Object.entries(vis)) {
    if (!visible) html = removeSection(html, key);
  }

  // 2. Conditional contact fields -- strip element + trailing separator
  if (!candidate.phone) {
    html = html.replace(
      /\s*<span>\{\{PHONE\}\}<\/span>\s*<span class="separator">\|<\/span>/,
      '',
    );
  }
  if (!candidate.portfolio_url) {
    html = html.replace(
      /\s*<a href="\{\{PORTFOLIO_URL\}\}">\{\{PORTFOLIO_DISPLAY\}\}<\/a>\s*<span class="separator">\|<\/span>/,
      '',
    );
  }

  // 3. Build replacement map
  const map = {
    '{{LANG}}':       esc(lang),
    '{{PAGE_WIDTH}}': PAGE_WIDTHS[format] || PAGE_WIDTHS.letter,
    '{{NAME}}':       esc(candidate.full_name),
    '{{PHONE}}':      esc(candidate.phone || ''),
    '{{EMAIL}}':      esc(candidate.email),
    '{{LINKEDIN_URL}}':      esc(candidate.linkedin_url || ''),
    '{{LINKEDIN_DISPLAY}}':  esc(candidate.linkedin_display || ''),
    '{{PORTFOLIO_URL}}':     esc(candidate.portfolio_url || ''),
    '{{PORTFOLIO_DISPLAY}}': esc(candidate.portfolio_display || ''),
    '{{LOCATION}}':  esc(candidate.location || ''),

    '{{SECTION_SUMMARY}}':        labels.summary,
    '{{SECTION_COMPETENCIES}}':   labels.competencies,
    '{{SECTION_EXPERIENCE}}':     labels.experience,
    '{{SECTION_PROJECTS}}':       labels.projects,
    '{{SECTION_EDUCATION}}':      labels.education,
    '{{SECTION_CERTIFICATIONS}}': labels.certifications,
    '{{SECTION_SKILLS}}':         labels.skills,

    '{{SUMMARY_TEXT}}':   payload.professional_summary || '',
    '{{COMPETENCIES}}':   payload.competencies   ? renderCompetencies(payload.competencies) : '',
    '{{EXPERIENCE}}':     payload.experience     ? renderExperience(payload.experience)     : '',
    '{{PROJECTS}}':       payload.projects       ? renderProjects(payload.projects)         : '',
    '{{EDUCATION}}':      payload.education      ? renderEducation(payload.education)       : '',
    '{{CERTIFICATIONS}}': payload.certifications ? renderCertifications(payload.certifications) : '',
    '{{SKILLS}}':         payload.skills         ? renderSkills(payload.skills)             : '',
  };

  // 4. Apply replacements
  for (const [ph, val] of Object.entries(map)) {
    html = html.split(ph).join(val);
  }

  // 5. Write output
  await mkdir(dirname(opts.out), { recursive: true });
  await writeFile(opts.out, html, 'utf-8');

  const visCount = Object.values(vis).filter(Boolean).length;
  console.log(`📄 Template: ${opts.template}`);
  console.log(`📋 Payload:  ${opts.fromStdin ? '(stdin)' : opts.payload}`);
  console.log(`📁 Output:   ${opts.out}`);
  console.log(`🌐 Language: ${lang}`);
  console.log(`📏 Format:   ${format.toUpperCase()}`);
  console.log(`✅ HTML generated: ${opts.out}`);
  console.log(`📊 Sections: ${visCount}/${Object.keys(vis).length} visible`);
}

main().catch(err => {
  console.error(`❌ HTML generation failed: ${err.message}`);
  process.exit(1);
});
