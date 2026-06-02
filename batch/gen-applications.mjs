#!/usr/bin/env node
// Data-driven application generator.
// Reads candidate content from data/applications-content/<id>.json and renders
// CV (1 or 2 pages) and/or cover-letter PDFs, applying format options.
//
// Usage:
//   node batch/gen-applications.mjs --id watershed --pages 2 --cover
//   node batch/gen-applications.mjs --id cohere --pages 1
//   node batch/gen-applications.mjs --all --pages 2 --cover    # every candidate
//   node batch/gen-applications.mjs --list                     # list candidate ids
//
// Options:
//   --id <id>        candidate id (filename without .json). Repeatable.
//   --all            all candidates in data/applications-content/
//   --pages 1|2      CV length (default 2). Use 0 to skip the CV.
//   --cover          also generate the cover letter
//   --cover-only     generate ONLY the cover letter (no CV)
//   --html-only      write HTML but skip PDF rendering
//   --list           print available candidate ids and exit
//
// Paper format (letter/a4) and language come from each JSON; not overridable
// (each application keeps the language of its job description).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = join(ROOT, 'data', 'applications-content');
const OUT_DIR = join(ROOT, 'output');
const out = (f) => join(OUT_DIR, f);

// ---- shared font-face + base CSS --------------------------------------------
const FONTS = `
  @font-face { font-family: 'Space Grotesk'; src: url('./fonts/space-grotesk-latin.woff2') format('woff2'); font-weight: 300 700; font-style: normal; font-display: swap; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
  @font-face { font-family: 'Space Grotesk'; src: url('./fonts/space-grotesk-latin-ext.woff2') format('woff2'); font-weight: 300 700; font-style: normal; font-display: swap; unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
  @font-face { font-family: 'DM Sans'; src: url('./fonts/dm-sans-latin.woff2') format('woff2'); font-weight: 100 1000; font-style: normal; font-display: swap; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
  @font-face { font-family: 'DM Sans'; src: url('./fonts/dm-sans-latin-ext.woff2') format('woff2'); font-weight: 100 1000; font-style: normal; font-display: swap; unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }`;

const cvCss = (pageWidth) => `${FONTS}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'DM Sans', sans-serif; font-size: 11px; line-height: 1.5; color: #1a1a2e; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; padding: 2px 0; }
  .header { margin-bottom: 20px; }
  .header h1 { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; color: #1a1a2e; letter-spacing: -0.02em; margin-bottom: 6px; line-height: 1.1; }
  .header-gradient { height: 2px; background: linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%)); border-radius: 1px; margin-bottom: 10px; }
  .contact-row { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 10.5px; line-height: 1.4; color: #555; }
  .contact-row a { color: #555; text-decoration: none; }
  .contact-row .separator { color: #ccc; }
  .section { margin-bottom: 18px; }
  .section-title { font-family: 'Space Grotesk', sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: hsl(187,74%,32%); border-bottom: 1.5px solid #e2e2e2; padding-bottom: 4px; margin-bottom: 10px; line-height: 1.2; }
  .summary-text { font-size: 11px; line-height: 1.7; color: #2f2f2f; }
  a { white-space: nowrap; }
  .competencies-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .competency-tag { font-size: 10px; font-weight: 500; color: hsl(187,74%,28%); background: hsl(187,40%,95%); padding: 4px 10px; border-radius: 3px; border: 1px solid hsl(187,40%,88%); }
  .job { margin-bottom: 14px; }
  .job-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 4px; }
  .job-company { font-family: 'Space Grotesk', sans-serif; font-size: 12.5px; font-weight: 600; color: hsl(270,70%,45%); }
  .job-period { font-size: 10.5px; color: #777; white-space: nowrap; }
  .job-role { font-size: 11px; font-weight: 600; color: #333; margin-bottom: 6px; }
  .job-location { font-size: 10px; color: #888; }
  .job ul { padding-left: 18px; margin-top: 6px; }
  .job li { font-size: 10.5px; line-height: 1.6; color: #333; margin-bottom: 4px; }
  .project { margin-bottom: 12px; }
  .project-title { font-family: 'Space Grotesk', sans-serif; font-size: 11.5px; font-weight: 600; color: hsl(270,70%,45%); }
  .project-desc { font-size: 10.5px; color: #444; margin-top: 3px; line-height: 1.55; }
  .edu-item { margin-bottom: 8px; }
  .edu-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .edu-title { font-weight: 600; font-size: 11px; color: #333; }
  .edu-org { color: hsl(270,70%,45%); font-weight: 500; }
  .edu-year { font-size: 10px; color: #777; white-space: nowrap; }
  .edu-desc { font-size: 10px; color: #666; margin-top: 2px; line-height: 1.5; }
  .skills-grid { display: flex; flex-direction: column; gap: 6px; }
  .skill-item { font-size: 10.5px; color: #444; }
  .skill-category { font-weight: 600; color: #333; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { padding: 0; } }
  .avoid-break, .job, .project, .edu-item { break-inside: avoid; page-break-inside: avoid; }`;

const cvCss1 = (pageWidth) => `${FONTS}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'DM Sans', sans-serif; font-size: 10px; line-height: 1.4; color: #1a1a2e; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; padding: 2px 0; }
  .header { margin-bottom: 10px; }
  .header h1 { font-family: 'Space Grotesk', sans-serif; font-size: 23px; font-weight: 700; color: #1a1a2e; letter-spacing: -0.02em; margin-bottom: 4px; line-height: 1.1; }
  .header-gradient { height: 2px; background: linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%)); border-radius: 1px; margin-bottom: 7px; }
  .contact-row { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 9.5px; line-height: 1.3; color: #555; }
  .contact-row a { color: #555; text-decoration: none; }
  .contact-row .separator { color: #ccc; }
  .section { margin-bottom: 9px; }
  .section-title { font-family: 'Space Grotesk', sans-serif; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: hsl(187,74%,32%); border-bottom: 1.5px solid #e2e2e2; padding-bottom: 2px; margin-bottom: 6px; line-height: 1.2; }
  .summary-text { font-size: 9.5px; line-height: 1.45; color: #2f2f2f; }
  a { white-space: nowrap; }
  .competencies-grid { display: flex; flex-wrap: wrap; gap: 5px; }
  .competency-tag { font-size: 9px; font-weight: 500; color: hsl(187,74%,28%); background: hsl(187,40%,95%); padding: 2.5px 8px; border-radius: 3px; border: 1px solid hsl(187,40%,88%); }
  .job { margin-bottom: 7px; }
  .job-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 1px; }
  .job-company { font-family: 'Space Grotesk', sans-serif; font-size: 10.5px; font-weight: 600; color: hsl(270,70%,45%); }
  .job-period { font-size: 9px; color: #777; white-space: nowrap; }
  .job-role { font-size: 9.5px; font-weight: 600; color: #333; margin-bottom: 1px; }
  .job-location { font-size: 8.5px; color: #888; }
  .job ul { padding-left: 15px; margin-top: 2px; }
  .job li { font-size: 9px; line-height: 1.4; color: #333; margin-bottom: 1.5px; }
  .job.compact { margin-bottom: 6px; }
  .job.compact .job-sub { font-size: 9.5px; color: #444; margin-top: 1px; }
  .job.compact .job-sub strong { font-weight: 600; }
  .project { margin-bottom: 6px; }
  .project-title { font-family: 'Space Grotesk', sans-serif; font-size: 10px; font-weight: 600; color: hsl(270,70%,45%); }
  .project-desc { font-size: 9.5px; color: #444; margin-top: 1px; line-height: 1.4; }
  .edu-item { margin-bottom: 4px; }
  .edu-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .edu-title { font-weight: 600; font-size: 10px; color: #333; }
  .edu-org { color: hsl(270,70%,45%); font-weight: 500; }
  .edu-year { font-size: 9.5px; color: #777; white-space: nowrap; }
  .skills-grid { display: flex; flex-direction: column; gap: 3px; }
  .skill-item { font-size: 9.5px; color: #444; line-height: 1.4; }
  .skill-category { font-weight: 600; color: #333; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { padding: 0; } }
  .avoid-break, .job, .project, .edu-item { break-inside: avoid; page-break-inside: avoid; }`;

const coverCss = (pageWidth) => `${FONTS}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'DM Sans', sans-serif; font-size: 11px; line-height: 1.65; color: #1a1a2e; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; padding: 2px 0; }
  .header { margin-bottom: 22px; }
  .header h1 { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; color: #1a1a2e; letter-spacing: -0.02em; margin-bottom: 6px; line-height: 1.1; }
  .header-gradient { height: 2px; background: linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%)); border-radius: 1px; margin-bottom: 10px; }
  .contact-row { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 10.5px; line-height: 1.4; color: #555; }
  .contact-row a { color: #555; text-decoration: none; }
  .contact-row .separator { color: #ccc; }
  .meta { font-size: 10.5px; color: #777; margin-bottom: 18px; }
  .meta strong { color: #333; font-weight: 600; }
  .salutation { font-size: 11px; margin-bottom: 12px; }
  p.body-para { font-size: 11px; line-height: 1.7; color: #2f2f2f; margin-bottom: 12px; }
  p.body-para strong { font-weight: 600; color: #1a1a2e; }
  .signoff { font-size: 11px; margin-top: 18px; line-height: 1.5; }
  .signoff .name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; color: hsl(270,70%,45%); margin-top: 4px; }`;

// ---- identity (read from config/profile.yml, fallback to placeholders) -------
function readIdentity() {
  // Minimal YAML read to avoid a dependency: pull candidate.{full_name,email,linkedin,location}.
  const p = join(ROOT, 'config', 'profile.yml');
  const id = { name: 'Fabe', email: 'Fabe@gmail.com', linkedin: 'linkedin.com/in/fabe', location: 'Paris, France' };
  if (!existsSync(p)) return id;
  const raw = readFileSync(p, 'utf8');
  const grab = (key) => {
    const m = raw.match(new RegExp(`^\\s*${key}:\\s*["']?([^"'\\n#]+?)["']?\\s*(#.*)?$`, 'm'));
    return m ? m[1].trim() : null;
  };
  id.name = grab('full_name') || id.name;
  id.email = grab('email') || id.email;
  id.linkedin = grab('linkedin') || id.linkedin;
  id.location = grab('location') || id.location;
  return id;
}

const esc = (s) => String(s ?? '');
const header = (id) => `
  <div class="header avoid-break">
    <h1>${esc(id.name)}</h1>
    <div class="header-gradient"></div>
    <div class="contact-row">
      <span>${esc(id.email)}</span>
      <span class="separator">|</span>
      <a href="https://${esc(id.linkedin)}">${esc(id.linkedin)}</a>
      <span class="separator">|</span>
      <span>${esc(id.location)}</span>
    </div>
  </div>`;

const L = {
  en: { summary: 'Professional Summary', comp: 'Core Competencies', exp: 'Work Experience', proj: 'Selected Projects', edu: 'Education & Certifications', skills: 'Skills' },
  fr: { summary: 'Résumé Professionnel', comp: 'Compétences Clés', exp: 'Expérience Professionnelle', proj: 'Projets Sélectionnés', edu: 'Formation & Certifications', skills: 'Compétences' },
};

const sec = (title, inner) => `<div class="section avoid-break"><div class="section-title">${title}</div>${inner}</div>`;
const secExp = (title, inner) => `<div class="section"><div class="section-title">${title}</div>${inner}</div>`;
const comps = (arr) => `<div class="competencies-grid">${arr.map(c => `<span class="competency-tag">${esc(c)}</span>`).join('')}</div>`;
const jobFull = (j) => `
    <div class="job">
      <div class="job-header"><span class="job-company">${esc(j.company)}</span><span class="job-period">${esc(j.period)}</span></div>
      <div class="job-role">${esc(j.role)}</div>
      <div class="job-location">${esc(j.location)}</div>
      <ul>${j.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    </div>`;
const jobCompact = (j) => `
    <div class="job compact">
      <div class="job-header"><span class="job-company">${esc(j.company)}</span><span class="job-period">${esc(j.period)}</span></div>
      <div class="job-sub">${j.compact || `<strong>${esc(j.role)}</strong>, ${esc(j.location)}`}</div>
    </div>`;
const project = ([t, d]) => `<div class="project"><div class="project-title">${esc(t)}</div><div class="project-desc">${esc(d)}</div></div>`;
const edu = ([t, org, year, desc]) => `<div class="edu-item"><div class="edu-header"><span class="edu-title">${esc(t)} <span class="edu-org">— ${esc(org)}</span></span><span class="edu-year">${esc(year)}</span></div>${desc ? `<div class="edu-desc">${esc(desc)}</div>` : ''}</div>`;
const skill = ([cat, txt]) => `<div class="skill-item"><span class="skill-category">${esc(cat)}:</span> ${esc(txt)}</div>`;

const doc = (lang, css, inner) => `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="UTF-8"><title>CV</title><style>${css}</style></head>
<body><div class="page">${inner}</div></body></html>`;

function renderCV(c, id, pages) {
  const l = L[c.lang] || L.en;
  const css = pages === 1 ? cvCss1 : cvCss;
  let expHtml;
  if (pages === 1) {
    // Chronological order preserved. To fit one page: first 3 jobs full but
    // bullet-capped (4 on the most recent, 3 on the next two), the rest compact.
    const caps = [4, 3, 3];
    const capped = (j, i) => jobFull({ ...j, bullets: j.bullets.slice(0, caps[i]) });
    expHtml = c.jobs.slice(0, 3).map(capped).join('') + c.jobs.slice(3).map(jobCompact).join('');
  } else {
    expHtml = c.jobs.map(jobFull).join('');
  }
  const projects = pages === 1 ? c.projects.slice(0, 2) : c.projects;
  const education = pages === 1 ? c.education.slice(0, 2) : c.education;
  const inner = [
    header(id),
    sec(l.summary, `<div class="summary-text">${esc(c.summary)}</div>`),
    sec(l.comp, comps(c.competencies)),
    secExp(l.exp, expHtml),
    sec(l.proj, projects.map(project).join('')),
    sec(l.edu, education.map(edu).join('')),
    sec(l.skills, `<div class="skills-grid">${c.skills.map(skill).join('')}</div>`),
  ].join('\n');
  return doc(c.lang, css(c.paper === 'a4' ? '210mm' : '8.5in'), inner);
}

function renderCover(c, id) {
  const pw = c.paper === 'a4' ? '210mm' : '8.5in';
  const inner = [
    `<div class="header"><h1>${esc(id.name)}</h1><div class="header-gradient"></div>` +
      `<div class="contact-row"><span>${esc(id.email)}</span><span class="separator">|</span>` +
      `<a href="https://${esc(id.linkedin)}">${esc(id.linkedin)}</a><span class="separator">|</span><span>${esc(id.location)}</span></div></div>`,
    `<div class="meta">${c.cover.meta}</div>`,
    `<div class="salutation">${esc(c.cover.salutation)}</div>`,
    c.cover.paras.map(p => `<p class="body-para">${esc(p)}</p>`).join('\n  '),
    `<div class="signoff">${esc(c.cover.signoff)}<div class="name">${esc(id.name)}</div></div>`,
  ].join('\n  ');
  return doc(c.lang, coverCss(pw), inner);
}

// ---- PDF rendering -----------------------------------------------------------
function renderPdf(htmlPath, pdfPath, paper) {
  const fmt = paper === 'a4' ? 'a4' : 'letter';
  const r = spawnSync(process.execPath, ['generate-pdf.mjs', htmlPath, pdfPath, `--format=${fmt}`], {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--use-system-ca' },
    encoding: 'utf8',
  });
  const ok = r.status === 0;
  const log = (r.stdout || '') + (r.stderr || '');
  const pages = (r.stdout || '').match(/Pages:\s*(\d+)/)?.[1];
  // Windows locks a PDF that is open in a viewer → EBUSY. Surface a clear reason.
  const locked = /EBUSY|EPERM|resource busy or locked/i.test(log);
  return { ok, pages, locked, log };
}

// ---- CLI ---------------------------------------------------------------------
function parseArgs(argv) {
  const a = { ids: [], all: false, pages: 2, cover: false, coverOnly: false, htmlOnly: false, list: false, date: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--id') a.ids.push(argv[++i]);
    else if (t === '--all') a.all = true;
    else if (t === '--pages') a.pages = Number(argv[++i]);
    else if (t === '--cover') a.cover = true;
    else if (t === '--cover-only') a.coverOnly = true;
    else if (t === '--html-only') a.htmlOnly = true;
    else if (t === '--list') a.list = true;
    else if (t === '--date') a.date = argv[++i];
    else if (t === '--time') a.time = argv[++i];
  }
  return a;
}

// Report number is the leading 3 digits of the report filename (068-watershed-...md).
function reportNum(c) {
  const m = (c.report || '').match(/^(\d{3})/);
  return m ? m[1] : '000';
}

function listIds() {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
}

function loadCandidate(id) {
  const p = join(CONTENT_DIR, `${id}.json`);
  if (!existsSync(p)) throw new Error(`unknown candidate: ${id}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) { console.log(listIds().join('\n')); return; }

  const ids = args.all ? listIds() : args.ids;
  if (!ids.length) { console.error('No candidate. Use --id <id>, --all, or --list.'); process.exit(1); }

  // Generation timestamp: server passes --date YYYY-MM-DD and --time HHMM so the
  // filename reflects when "Generate" was clicked. CLI may omit; new Date() is fine
  // here (standalone tool). Both feed the output name: CV-<num>-<id>-<date>-<time>.pdf
  const now = new Date();
  const date = args.date || now.toISOString().slice(0, 10);
  const time = args.time || `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const stamp = `${date}-${time}`;
  const id = readIdentity();
  const results = [];

  for (const cid of ids) {
    const c = loadCandidate(cid);
    const num = reportNum(c);
    const tasks = [];
    if (!args.coverOnly && args.pages >= 1) {
      const suffix = args.pages === 1 ? '-1page' : '';
      // HTML is a transient render artifact: keep a stable name (overwritten each run).
      // PDF gets the final, timestamped, document-typed name.
      tasks.push({ kind: 'cv', html: `cv-fabe-${cid}${suffix}.html`, pdf: `CV-${num}-${cid}${suffix}-${stamp}.pdf`, build: () => renderCV(c, id, args.pages) });
    }
    if (args.cover || args.coverOnly) {
      tasks.push({ kind: 'cover', html: `cover-fabe-${cid}.html`, pdf: `CL-${num}-${cid}-${stamp}.pdf`, build: () => renderCover(c, id) });
    }
    for (const t of tasks) {
      writeFileSync(out(t.html), t.build());
      let pdfInfo = null;
      if (!args.htmlOnly) pdfInfo = renderPdf(out(t.html), out(t.pdf), c.paper);
      results.push({ cid, kind: t.kind, html: t.html, pdf: args.htmlOnly ? null : t.pdf, ...(pdfInfo || {}) });
    }
  }

  // machine-readable summary on the last line for the server to parse
  for (const r of results) {
    const tag = r.pdf ? `output/${r.pdf}${r.pages ? ` (${r.pages}p)` : ''}` : `output/${r.html}`;
    const fail = r.ok === false ? (r.locked ? ' [PDF LOCKED — close it in your viewer and retry]' : ' [PDF FAILED]') : '';
    console.log(`${r.cid} ${r.kind}: ${tag}${fail}`);
  }
  console.log('__RESULT__ ' + JSON.stringify(results.map(r => ({ id: r.cid, kind: r.kind, pdf: r.pdf, pages: r.pages, ok: r.ok !== false, locked: !!r.locked }))));
}

main();
