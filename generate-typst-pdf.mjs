#!/usr/bin/env node

/**
 * generate-typst-pdf.mjs — cv.md → Typst (.typ) → PDF
 *
 * Usage:
 *   node generate-typst-pdf.mjs [output.pdf] [--format=letter|a4]
 *
 * Reads cv.md, generates a Typst source file using templates/template.typ,
 * compiles with `typst compile`. Requires: typst in PATH (brew install typst).
 */

import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Convert markdown bold (**text**) to Typst bold (*text*)
// Escape Typst special chars in plain content strings
// ---------------------------------------------------------------------------
function mdToTypst(str) {
  if (!str) return '';
  return str
    .replace(/\*\*(.+?)\*\*/g, '*$1*')   // **bold** → *bold*
    .replace(/@/g, '\\@')                 // email @
    .replace(/~/g, '\\~')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>');
  // Note: # is NOT escaped here — it's inside content blocks [] where
  // it only triggers if followed by a function name. Safe in prose.
}

// Escape for use inside Typst string literals ""
function escStr(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------
// Parse cv.md into structured data
// ---------------------------------------------------------------------------
function parseCV(md) {
  const lines = md.split('\n');
  const data = {
    firstname: '', lastname: '', title: '',
    contact: {},
    summary_bullets: [],
    jobs: [],
    certifications: [],
    skills: [],
    education: [],
  };

  let section = null;
  let currentJob = null;

  const flushJob = () => {
    if (currentJob) { data.jobs.push(currentJob); currentJob = null; }
  };

  for (const line of lines) {
    const t = line.trim();

    // H1 = full name
    if (t.startsWith('# ') && !data.firstname) {
      const parts = t.slice(2).trim().split(' ');
      data.firstname = parts[0] || '';
      data.lastname  = parts.slice(1).join(' ');
      continue;
    }

    // Bold title line
    if (!data.title && !section && t.match(/^\*\*(.+)\*\*$/) && !t.includes(':')) {
      data.title = t.replace(/\*\*/g, '').trim();
      continue;
    }

    // Contact list items
    if (!section && t.startsWith('- ') && t.includes(': ')) {
      const [key, ...rest] = t.slice(2).split(': ');
      data.contact[key.trim().toLowerCase()] = rest.join(': ').trim();
      continue;
    }

    // H2 = section
    if (t.startsWith('## ')) {
      flushJob();
      section = t.slice(3).trim().toLowerCase();
      continue;
    }

    // H3 = job entry
    if (t.startsWith('### ') && section === 'experience') {
      flushJob();
      const raw = t.slice(4).trim();
      const dashIdx = raw.indexOf(' — ');
      const jobTitle = dashIdx > -1 ? raw.slice(0, dashIdx).trim() : raw;
      const rest     = dashIdx > -1 ? raw.slice(dashIdx + 3) : '';
      const pipeIdx  = rest.indexOf(' | ');
      currentJob = {
        title:    jobTitle,
        company:  pipeIdx > -1 ? rest.slice(0, pipeIdx).trim() : rest.trim(),
        location: pipeIdx > -1 ? rest.slice(pipeIdx + 3).trim() : '',
        duration: '',
        bullets:  [],
      };
      continue;
    }

    // Dates line for current job
    if (currentJob && t.match(/^\*\*.+\*\*$/) && t.match(/\d{4}/)) {
      currentJob.duration = t.replace(/\*\*/g, '').trim();
      continue;
    }

    // Bullet in job
    if (currentJob && t.startsWith('- ')) {
      currentJob.bullets.push(t.slice(2).trim());
      continue;
    }

    // Summary bullets
    if (section === 'summary' && t.startsWith('- ')) {
      data.summary_bullets.push(t.slice(2).trim());
      continue;
    }
    // Summary as a paragraph (non-bullet)
    if (section === 'summary' && t && t !== '---') {
      data.summary_bullets.push(t);
      continue;
    }

    // Certifications
    if (section === 'certifications' && t.startsWith('- ')) {
      data.certifications.push(t.slice(2).trim());
      continue;
    }

    // Skills
    if (section === 'skills' && t.match(/^\*\*(.+?):\*\*/)) {
      const m = t.match(/^\*\*(.+?):\*\*\s*(.*)/);
      if (m) data.skills.push({ category: m[1].trim(), items: m[2].trim() });
      continue;
    }

    // Education
    if (section === 'education') {
      if (t.startsWith('**') && t.includes('**')) {
        const text    = t.replace(/\*\*/g, '');
        const dashIdx = text.indexOf(' — ');
        data.education.push({
          degree:      dashIdx > -1 ? text.slice(0, dashIdx).trim() : text.trim(),
          institution: dashIdx > -1 ? text.slice(dashIdx + 3).trim() : '',
          dates:       '',
        });
      } else if (data.education.length && t.match(/\d{4}/)) {
        data.education[data.education.length - 1].dates = t;
      }
    }
  }

  flushJob();
  return data;
}

// Build contact dict — only include non-empty fields, strip URL prefixes
function buildContact(raw) {
  const fields = {
    phone:     raw.phone || '',
    email:     raw.email || '',
    github:    (raw.github || '').replace('github.com/', ''),
    linkedin:  (raw.linkedin || '').replace('linkedin.com/in/', ''),
    portfolio: raw.portfolio || '',
    medium:    (raw.medium || '').replace('medium.com/@', ''),
  };
  return Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `      ${k}: "${escStr(v)}",\n`)
    .join('');
}

// ---------------------------------------------------------------------------
// Generate Typst source in template format
// ---------------------------------------------------------------------------
function generateTypst(data) {
  // Summary block: bullet list if multiple items, paragraph if single
  let summaryBlock;
  if (data.summary_bullets.length > 1) {
    const items = data.summary_bullets
      .map(b => `      - ${mdToTypst(b)}`)
      .join('\n');
    summaryBlock = `[\n${items}\n    ]`;
  } else if (data.summary_bullets.length === 1) {
    summaryBlock = `[${mdToTypst(data.summary_bullets[0])}]`;
  } else {
    summaryBlock = '[]';
  }

  // Experience entries
  const jobEntries = data.jobs.map((job, i) => {
    const bullets = job.bullets
      .map(b => `          - ${mdToTypst(b)}`)
      .join('\n');
    return `      job${i + 1}: (
        company: "${escStr(job.company)}",
        location: "${escStr(job.location)}",
        title: "${escStr(job.title)}",
        duration: "${escStr(job.duration)}",
        work_summary: [
${bullets}
        ]
      )`;
  }).join(',\n');

  // Certifications block
  const certLines = data.certifications
    .map(c => `      - ${mdToTypst(c)}`)
    .join('\n');

  // Skills block
  const skillLines = data.skills
    .map(s => `      *${escStr(s.category)}:* ${mdToTypst(s.items)}`)
    .join(' \\\n      ');

  // Education block
  const eduLines = data.education.map(e => {
    const deg  = mdToTypst(e.degree);
    const inst = mdToTypst(e.institution);
    const dt   = mdToTypst(e.dates);
    return `      *_${deg}_*, _${inst}_ #h(1fr) _${dt}_`;
  }).join('\n      #v(0.3em)\n');

  // Positions from title (split on | or ,)
  const positions = data.title
    ? data.title.split(/[|,]/).map(p => `"${escStr(p.trim())}"`)
    : ['"DevOps"', '"Platform"', '"Cloud Engineer"'];

  return `#import "templates/template.typ": *

#show: resume.with(
  author: (
    firstname: "${escStr(data.firstname)}",
    lastname: "${escStr(data.lastname)}",
    positions: (${positions.join(', ')}),
    contact: (
${buildContact(data.contact)}    ),
    professional_summary: ${summaryBlock},
    experience_details: (
${jobEntries},
    ),
    certifications: [
${certLines}
    ],
    skills: [
      ${skillLines} \\
    ],
    education: [
      ${eduLines}
    ]
  )
)
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  let outputPath = null;
  let format = 'letter';

  const formatMap = { letter: 'us-letter', a4: 'a4', a3: 'a3' };
  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      const raw = arg.split('=')[1].toLowerCase();
      format = formatMap[raw] || raw;
    } else if (!outputPath) {
      outputPath = arg;
    }
  }

  const cvPath = resolve(__dirname, 'cv.md');
  if (!existsSync(cvPath)) {
    console.error('❌ cv.md not found at', cvPath);
    process.exit(1);
  }

  const outDir = resolve(__dirname, 'output');
  await mkdir(outDir, { recursive: true });

  // Resolve relative custom paths early; defer auto-naming until after parse
  if (outputPath && !outputPath.startsWith('/')) {
    outputPath = resolve(__dirname, outputPath);
  }

  console.log('📖 Reading cv.md...');
  const md   = await readFile(cvPath, 'utf-8');
  const data = parseCV(md);
  console.log(`👤 ${data.firstname} ${data.lastname} | ${data.jobs.length} roles | ${data.certifications.length} certs | ${data.skills.length} skill categories`);

  if (!outputPath) {
    const slug = [data.firstname, data.lastname]
      .filter(Boolean).join('-').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    outputPath = resolve(outDir, `cv-${slug || 'output'}.pdf`);
  }

  const typSource = generateTypst(data);
  const tmpTyp    = resolve(__dirname, '_cv-tmp.typ');

  await writeFile(tmpTyp, typSource, 'utf-8');

  console.log(`⚙️  Compiling with typst (format: ${format})...`);
  const fontsDir = resolve(__dirname, 'assets/fonts');
  const result = spawnSync(
    'typst',
    ['compile', '--root', __dirname, '--font-path', fontsDir,
     '--input', `format=${format}`, tmpTyp, outputPath],
    { stdio: 'inherit', encoding: 'utf-8' }
  );

  await unlink(tmpTyp).catch(() => {});

  if (result.status !== 0) {
    console.error('❌ typst compile failed');
    process.exit(1);
  }

  const size = statSync(outputPath).size;
  console.log(`✅ PDF: ${outputPath}`);
  console.log(`📦 ${(size / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
