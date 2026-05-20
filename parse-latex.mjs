#!/usr/bin/env node

/**
 * parse-latex.mjs — Universal LaTeX CV Parser
 *
 * Parses any LaTeX CV file and extracts:
 *   1. content JSON  — structured sections (experience, projects, skills, education)
 *   2. template JSON — template metadata (packages, layout, colors, structure)
 *
 * Supports format families:
 *   1. tabularx-itemize   (tabularx rows + itemize bullets — your format)
 *   2. resumeSubheading  (career-ops template: \resumeSubheading commands)
 *   3. section-itemize    (generic: \section{} + itemize bullets)
 *
 * Usage:
 *   node parse-latex.mjs <path-to-resume.tex> [output-dir]
 *
 * Output (written to output-dir or ./output/):
 *   cv-parse-{name}-{timestamp}.json
 *   cv-template-{name}-{timestamp}.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';

function detectFormat(content) {
  if (/\\resumeSubheading/.test(content) || /\\resumeItem\b/.test(content)) return 'resumeSubheading';
  if (/\\begin\{tabularx\}/.test(content) && /\\begin\{itemize\}/.test(content)) return 'tabularx-itemize';
  if (/\\begin\{itemize\}/.test(content) && /\\section\{/.test(content)) return 'section-itemize';
  return 'generic';
}

function extractName(headerText) {
  const patterns = [
    /\\Large\s+\*?\\textbf\{([^}]+)\}/,
    /\\Huge\s+[\\]?scshape\s*\{([^}]+)\}/,
    /\\name\{([^}]+)\}/,
    /\\textbf\{\s*([A-Z][A-Za-z]+ [A-Z][A-Za-z]+)\s*\}/,
  ];
  for (const p of patterns) {
    const m = headerText.match(p);
    if (m) return m[1].trim();
  }
  return 'Unknown';
}

function extractContact(centerBlock) {
  if (!centerBlock) return { email: '', phone: '', linkedin: '', github: '', location: '' };
  const email = (centerBlock.match(/href\{mailto:([^}]+)\}/)?.[1]) ||
                (centerBlock.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/))?.[1] || '';
  const phone = (centerBlock.match(/\+?[\d][\d\-\s().]{8,}/))?.[0]?.trim() || '';
  const linkedin = (centerBlock.match(/linkedin\.com\/in\/([^\s\\}>&]+)/)?.[1]) ? `linkedin.com/in/${centerBlock.match(/linkedin\.com\/in\/([^\s\\}>&]+)/)[1]}` : '';
  const github = (centerBlock.match(/github\.com\/([^\s\\}>&]+)/)?.[1]) ? `github.com/${centerBlock.match(/github\.com\/([^\s\\}>&]+)/)[1]}` : '';
  return { email, phone, linkedin, github, location: '' };
}

function extractPackages(content) {
  const pkgs = [];
  const re = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(content)) !== null) pkgs.push(m[1]);
  return pkgs;
}

function extractDocumentClass(content) {
  const m = content.match(/\\documentclass\[[^\]]*\]\{[^}]+\}/);
  return m ? m[0] : '';
}

function extractColors(content) {
  const colors = {};
  const re = /\\definecolor\{(\w+)\}\{([^}]+)\}\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(content)) !== null) colors[m[1]] = `${m[2]}{${m[3]}}`;
  return colors;
}

function extractLayout(content) {
  const margins = {};
  const m = content.match(/\\usepackage\[([^\]]+)\]\{geometry\}/);
  if (m) {
    for (const p of m[1].split(',')) {
      const [k, v] = p.trim().split('=').map(s => s.trim());
      if (k && v) margins[k] = v;
    }
  }
  return { margins, page: '' };
}

function detectSectionOrder(content) {
  const order = [];
  const patterns = [
    { key: 'experience', regex: /\\section\*?\{(?:Professional\s+)?[Ee]xperience\}/ },
    { key: 'projects', regex: /\\section\*?\{[Pp]rojects?\}/ },
    { key: 'skills', regex: /\\section\*?\{(?:Technical\s+)?[Ss]kills?\}/ },
    { key: 'education', regex: /\\section\*?\{[Ee]ducation\}/ },
    { key: 'summary', regex: /\\section\*?\{(?:Professional\s+)?[Ss]ummary\}/ },
    { key: 'certifications', regex: /\\section\*?\{[Cc]ertifications?\}/ },
  ];
  for (const { key, regex } of patterns) {
    if (regex.test(content)) order.push(key);
  }
  return order;
}

function parseItemizeBullets(itemizeBlock) {
  const bullets = [];
  const lines = itemizeBlock.split('\n');
  for (const line of lines) {
    if (/\\item\b/.test(line)) {
      let text = line
        .replace(/\\item\b/, '')
        .replace(/\[[^\]]*\]/, '')
        .replace(/\\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) bullets.push(text);
    }
  }
  return bullets;
}

function getSectionContent(content, sectionName) {
  const re = new RegExp(`\\\\section\\*?\\{[^}]*${sectionName}[^}]*\\}[\\s\\S]*?(?=\\\\section\\*?\\{|\\\\end\\{document\\})`, 'i');
  return content.match(re)?.[0] || '';
}

function parseExperienceTabularx(content) {
  const items = [];
  const expIdx = content.indexOf('Experience');
  if (expIdx < 0) return items;

  const afterSection = content.substring(expIdx);
  const nextSection = afterSection.indexOf('\\section', 20);
  const section = nextSection > 0 ? afterSection.substring(0, nextSection) : afterSection;

  const tabularxBlocks = [...section.matchAll(/\\begin\{tabularx\}[\s\S]*?\\end\{tabularx\}/g)];
  const itemizeBlocks = [...section.matchAll(/\\begin\{itemize\}[\s\S]*?\\end\{itemize\}/g)];

  for (let i = 0; i < tabularxBlocks.length; i++) {
    const txBlock = tabularxBlocks[i][0];
    const lines = txBlock.split('\n');
    let company = '';
    let dateRange = '';
    let role = '';

    for (const line of lines) {
      const bt = line.match(/\\textbf\{([^}]+)\}/);
      if (bt && !company) company = bt[1];

      const dates = [...line.matchAll(/\\textit\{([^}]+)\}/g)];
      for (const d of dates) {
        if (/[\d]{4}|Present/.test(d[1]) && !dateRange) dateRange = d[1];
      }

      const rm = line.match(/\\textit\{([^}]+(?:Developer|Engineer|Manager|Analyst|Scientist|Lead|Architect|Designer|Intern)[^}]*)\}/);
      if (rm && !role) role = rm[1].trim();
    }

    const bullets = (itemizeBlocks[i]) ? parseItemizeBullets(itemizeBlocks[i][0]) : [];

    if (company && bullets.length > 0) {
      const parts = dateRange ? dateRange.split(/\s*[-–]\s*/) : ['', ''];
      items.push({ company, role, start: parts[0] || '', end: parts[1] || '', bullets });
    }
  }

  if (items.length === 0) {
    for (const match of itemizeBlocks) {
      const bullets = parseItemizeBullets(match[0]);
      if (bullets.length > 0) items.push({ company: 'Experience', role: '', start: '', end: '', bullets });
    }
  }

  return items;
}

function parseProjectsTabularx(content) {
  const items = [];
  const projIdx = content.indexOf('Projects');
  if (projIdx < 0) return items;

  const afterSection = content.substring(projIdx);
  const nextSection = afterSection.indexOf('\\section', 20);
  const section = nextSection > 0 ? afterSection.substring(0, nextSection) : afterSection;

  const tabularxBlocks = [...section.matchAll(/\\begin\{tabularx\}[\s\S]*?\\end\{tabularx\}/g)];
  const itemizeBlocks = [...section.matchAll(/\\begin\{itemize\}[\s\S]*?\\end\{itemize\}/g)];

  for (let i = 0; i < tabularxBlocks.length; i++) {
    const txBlock = tabularxBlocks[i][0];
    const lines = txBlock.split('\n');
    let name = '';
    let tech = '';
    let date = '';

    for (const line of lines) {
      const nm = line.match(/\\textbf\{([^}]+)\}/);
      if (nm && !name) {
        name = nm[1].replace(/\\emph\{[^}]*\|\s*/g, '').replace(/\|[^}]*\}/g, '').trim();
      }

      const ts = [...line.matchAll(/\\textit\{([^}]+)\}/g)];
      for (const t of ts) {
        if (!/[\d]{4}|Live|GitHub|Demo|Links/.test(t[1]) && !tech) tech = t[1];
        if (/[\d]{4}/.test(t[1]) && !date) date = t[1];
      }
    }

    const bullets = (itemizeBlocks[i]) ? parseItemizeBullets(itemizeBlocks[i][0]) : [];

    if (name) items.push({ name, tech, date, bullets });
  }

  return items;
}

function splitSkillValues(vals) {
  const result = [];
  let cur = '';
  let depth = 0;
  for (const c of vals) {
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      const s = cur.trim();
      if (s) result.push(s);
      cur = '';
      continue;
    }
    cur += c;
  }
  const s = cur.trim();
  if (s) result.push(s);
  return result;
}

function extractSkillsTabularx(section) {
  const lrboxM = section.match(
    /\\begin\{lrbox\}[\s\S]*?\\begin\{tabularx\}([\s\S]*?)\\end\{tabularx\}[\s\S]*?\\end\{lrbox\}/
  );
  if (lrboxM) return lrboxM[1];

  const txM = section.match(/\\begin\{tabularx\}[\s\S]*?\\end\{tabularx\}/);
  if (!txM) return '';
  return txM[0]
    .replace(/\\begin\{tabularx\}[^\n]*\n?/, '')
    .replace(/\\end\{tabularx\}/, '');
}

function parseSkillCategory(cell) {
  const lines = cell.split('\n').map(l => l.trim()).filter(Boolean);
  const raw = lines.length > 1 ? lines[lines.length - 1] : cell;
  return raw
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{[^}]*\}/g, '')
    .replace(/[{}>@]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSkills(content) {
  const skills = {};

  const sectionM = content.match(
    /\\section\*?\{(?:Technical\s+)?[Ss]kills?\}([\s\S]*?)(?=\\section\*?\{|\\end\{document\})/i
  );
  if (!sectionM) return skills;

  const section = sectionM[1];
  const tabularBody = extractSkillsTabularx(section);
  if (!tabularBody) return skills;

  const rows = tabularBody.split('\\\\');
  for (const row of rows) {
    if (!row.includes('&')) continue;
    const parts = row.split('&');
    const cat = parseSkillCategory(parts[0]);
    const vals = parts.slice(1).join('&').replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (cat && vals) skills[cat] = splitSkillValues(vals);
  }

  if (Object.keys(skills).length === 0) {
    const itemizes = section.matchAll(/\\begin\{itemize\}[\s\S]*?\\end\{itemize\}/g);
    for (const match of itemizes) {
      const bullets = parseItemizeBullets(match[0]);
      for (const b of bullets) {
        const colon = b.indexOf(':');
        if (colon > 0) {
          const cat = b.substring(0, colon).trim();
          const vals = b.substring(colon + 1).split(/,\s*/).map(s => s.trim()).filter(s => s);
          if (cat && vals.length > 0) skills[cat] = vals;
        }
      }
    }
  }

return skills;
}

function parseEducation(content) {
  const items = [];

  const idx = content.indexOf('Education');
  if (idx < 0) return items;

  const afterSection = content.substring(idx);
  const nextSection = afterSection.indexOf('\\section', 20);
  const section = nextSection > 0 ? afterSection.substring(0, nextSection) : afterSection;

  const eduTxMatches = section.match(/\\begin\{tabularx\}[\s\S]*?\\end\{tabularx\}/g);
  if (eduTxMatches) {
    for (const eduBlock of eduTxMatches) {
      const boldItems = [...eduBlock.matchAll(/\\textbf\{([^}]+)\}/g)];
      const italicItems = [...eduBlock.matchAll(/\\textit\{([^}]+)\}/g)];

      let degree = '';
      let institution = '';
      let date = '';

      if (boldItems.length >= 1) degree = boldItems[0][1];
      if (boldItems.length >= 2) {
        institution = boldItems[1][1].replace(/^CGPA:\s*/i, '');
      }

      for (const im of italicItems) {
        if (/[\d]{4}/.test(im[1])) date = im[1];
      }

      if (degree) items.push({ degree, institution, date, details: '' });
    }
  }

  if (items.length === 0) {
    const bullets = parseItemizeBullets(section);
    for (const b of bullets) items.push({ degree: b, institution: '', date: '', details: '' });
  }

  return items;
}

function parseResumeSubheading(content) {
  const items = { experience: [], projects: [], skills: {}, education: [] };

  const expBlockM = content.match(/\\resumeSubHeadingListStart\s*\n([\s\S]*?)\\resumeSubHeadingListEnd/);
  if (expBlockM) {
    const subheadings = expBlockM[1].split(/(?=\n\s*\\resumeSubheading\s*\{)/);
    for (const sub of subheadings) {
      const params = sub.match(/\\resumeSubheading\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}/);
      if (params) {
        const bullets = [...sub.matchAll(/\\resumeItem\{([^}]+)\}/g)].map(m => m[1]);
        items.experience.push({ company: params[1], date: params[2], role: params[3], location: params[4], bullets });
      }
    }
  }

  const projMatches = content.matchAll(/\\resumeProjectHeading\{([^}]+)\}\{([^}]+)\}/g);
  for (const pm of projMatches) {
    const idx = content.indexOf(pm[0]);
    const nextIdx = content.indexOf('\\resumeProjectHeading', idx + 1);
    const projBlock = content.substring(idx, nextIdx > 0 ? nextIdx : content.length);
    const bullets = [...projBlock.matchAll(/\\resumeItem\{([^}]+)\}/g)].map(m => m[1]);
    items.projects.push({ name: pm[1], date: pm[2], bullets });
  }

  const skillMatches = content.matchAll(/\\textbf\{([^}]+)\}\{:\s*([^}]+)\}/g);
  for (const sm of skillMatches) {
    items.skills[sm[1]] = sm[2].split(/,\s*/).map(s => s.trim()).filter(s => s);
  }

  return items;
}

async function parseLatex(inputPath, outputDir = null) {
  const absPath = resolve(inputPath);
  let content;
  try {
    content = await readFile(absPath, 'utf-8');
  } catch (err) {
    console.error(`Error reading ${absPath}: ${err.message}`);
    process.exit(1);
  }

  const outDir = outputDir ? resolve(outputDir) : resolve(dirname(absPath), 'output');
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const format = detectFormat(content);
  const centerBlock = content.match(/\\begin\{center\}\s*([\s\S]*?)\\end\{center\}/)?.[1] || '';
  const name = extractName(centerBlock);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const result = {
    meta: {
      source_file: basename(absPath),
      format_detected: format,
      parsed_at: new Date().toISOString(),
    },
  };

  if (format === 'resumeSubheading') {
    result.contact = extractContact(centerBlock);
    const parsed = parseResumeSubheading(content);
    result.experience = parsed.experience;
    result.projects = parsed.projects;
    result.skills = parsed.skills;
    result.education = parsed.education;
  } else {
    result.contact = extractContact(centerBlock);
    result.experience = parseExperienceTabularx(content);
    result.projects = parseProjectsTabularx(content);
    result.skills = parseSkills(content);
    result.education = parseEducation(content);
  }

  result.meta.sections_found = Object.keys(result).filter(k => !['meta'].includes(k));

  const templateResult = {
    source_file: basename(absPath),
    format,
    document_class: extractDocumentClass(content),
    packages: extractPackages(content),
    colors: extractColors(content),
    section_order: detectSectionOrder(content),
    layout: extractLayout(content),
  };

  const parseOut = `${outDir}/cv-parse-${safeName}-${timestamp}.json`;
  const templateOut = `${outDir}/cv-template-${safeName}-${timestamp}.json`;

  await writeFile(parseOut, JSON.stringify(result, null, 2), 'utf-8');
  await writeFile(templateOut, JSON.stringify(templateResult, null, 2), 'utf-8');

  console.log(JSON.stringify({
    status: 'ok',
    parse_file: parseOut,
    template_file: templateOut,
    format,
    name,
    sections: result.meta.sections_found,
    experience_count: result.experience.length,
    projects_count: result.projects.length,
    skills_categories: Object.keys(result.skills).length,
  }));
  return result;
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node parse-latex.mjs <path-to-resume.tex> [output-dir]');
  process.exit(1);
}

parseLatex(inputPath, process.argv[3]);