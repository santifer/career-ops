#!/usr/bin/env node

/**
 * write-latex.mjs — Reconstruct tailored .tex from original template + JSON content
 *
 * Replaces ONLY bullet text and skill values — preserves layout, colors, tabularx, lrbox.
 *
 * Usage:
 *   node write-latex.mjs <original.tex> <tailored.json> [output.tex]
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';

function detectFormat(content) {
  if (/\\resumeSubheading/.test(content) || /\\resumeItem\b/.test(content)) return 'resumeSubheading';
  if (/\\begin\{tabularx\}/.test(content) && /\\begin\{itemize\}/.test(content)) return 'tabularx-itemize';
  return 'generic';
}

/** Escape user text for LaTeX body; preserve existing backslash escapes (e.g. \\&). */
export function escapeLatexText(text) {
  if (!text) return '';
  const map = {
    '&': '\\&',
    '%': '\\%',
    '$': '\\$',
    '#': '\\#',
    '_': '\\_',
    '{': '\\{',
    '}': '\\}',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
  };
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      out += text[i] + text[i + 1];
      i++;
      continue;
    }
    out += map[text[i]] ?? text[i];
  }
  return out;
}

function replaceItemizeBullets(itemizeBlock, bullets) {
  if (!bullets?.length) return itemizeBlock;
  let i = 0;
  return itemizeBlock.replace(/^(\s*\\item(?:\[[^\]]*\])?)\s*(.*)$/gm, (match, itemCmd) => {
    if (i >= bullets.length) return match;
    return `${itemCmd} ${escapeLatexText(bullets[i++])}`;
  });
}

/** Match itemize blocks to JSON entries via \\textbf{Name} in the preceding tabularx row. */
function replaceSectionEntriesByName(fullContent, sectionRe, entries, getKey) {
  const m = fullContent.match(sectionRe);
  if (!m || !entries?.length) return fullContent;

  const header = m[0].match(/^\\section\*?\{[^}]+\}/)?.[0] || '';
  const bodyStart = m.index + header.length;
  const bodyEnd = m.index + m[0].length;
  let body = fullContent.slice(bodyStart, bodyEnd);

  const entryMap = new Map();
  for (const e of entries) {
    const k = getKey(e);
    if (k) entryMap.set(k, e);
  }

  body = body.replace(
    /\\begin\{tabularx\}[\s\S]*?\\end\{tabularx\}[\s\S]*?\\begin\{itemize\}[\s\S]*?\\end\{itemize\}/g,
    (chunk) => {
      const nameM = chunk.match(/\\textbf\{([^}]+)\}/);
      if (!nameM) return chunk;
      const entry = entryMap.get(nameM[1].trim());
      if (!entry?.bullets?.length) return chunk;
      return chunk.replace(/\\begin\{itemize\}[\s\S]*?\\end\{itemize\}/, (iz) =>
        replaceItemizeBullets(iz, entry.bullets)
      );
    }
  );

  return fullContent.slice(0, bodyStart) + body + fullContent.slice(bodyEnd);
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

function replaceSkillsTabularx(tex, skills) {
  if (!skills || Object.keys(skills).length === 0) return tex;

  const sectionRe =
    /\\section\*?\{(?:Technical\s+)?[Ss]kills?\}[\s\S]*?(?=\\section\*?\{|\\end\{document\})/i;
  const m = tex.match(sectionRe);
  if (!m) return tex;

  const section = m[0];
  const newSection = section.replace(
    /(\\begin\{tabularx\}[^\n]*\n)([\s\S]*?)(\n\\end\{tabularx\})/,
    (_, begin, body, end) => {
      const rows = body.split('\\\\');
      const newRows = rows.map((row) => {
        if (!row.includes('&')) return row;
        const parts = row.split('&');
        const cat = parseSkillCategory(parts[0]);
        if (!cat || !skills[cat]) return row;
        const vals = skills[cat].join(', ');
        const pad = parts[0].match(/\n(\s*)/)?.[1] || '  ';
        return `${parts[0].trimEnd()} & ${vals} `;
      });
      return begin + newRows.join(' \\\\\n') + end;
    }
  );

  return tex.slice(0, m.index) + newSection + tex.slice(m.index + section.length);
}

function replaceResumeItemBlock(block, bullets) {
  if (!bullets?.length) return block;
  let i = 0;
  return block.replace(/\\resumeItem\{([^}]*)\}/g, (match, old) => {
    if (i >= bullets.length) return match;
    return `\\resumeItem{${escapeLatexText(bullets[i++])}}`;
  });
}

function writeResumeSubheading(tex, data) {
  let result = tex;

  if (data.experience?.length) {
    const re =
      /\\resumeSubheading\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}([\s\S]*?)(?=\\resumeSubheading|\\resumeProjectHeading|\\resumeSubHeadingListEnd)/g;
    let idx = 0;
    result = result.replace(re, (full, _c, _d, _r, _l, tail) => {
      const job = data.experience[idx++];
      if (!job?.bullets?.length) return full;
      const head = full.slice(0, full.length - tail.length);
      return head + replaceResumeItemBlock(tail, job.bullets);
    });
  }

  if (data.projects?.length) {
    const re =
      /\\resumeProjectHeading\{([^}]+)\}\{([^}]+)\}([\s\S]*?)(?=\\resumeProjectHeading|\\section|\\resumeSubHeadingListEnd)/g;
    let idx = 0;
    result = result.replace(re, (full, _n, _d, tail) => {
      const proj = data.projects[idx++];
      if (!proj?.bullets?.length) return full;
      const head = full.slice(0, full.length - tail.length);
      return head + replaceResumeItemBlock(tail, proj.bullets);
    });
  }

  if (data.skills && Object.keys(data.skills).length > 0) {
    const skillLines = Object.entries(data.skills)
      .map(([cat, vals]) => `    \\textbf{${cat}}{: ${vals.join(', ')}} \\\\`)
      .join('\n');
    result = result.replace(
      /\\section\{Technical Skills\}[\s\S]*?(?=\\section\{)/,
      (block) => {
        const header = block.match(/^\\section\{Technical Skills\}/)?.[0] || '\\section{Technical Skills}';
        return `${header}\n\n${skillLines}\n\n`;
      }
    );
  }

  return result;
}

function writeTabularxItemize(tex, data) {
  let result = tex;

  result = replaceSectionEntriesByName(
    result,
    /\\section\*?\{(?:Professional\s+)?[Ee]xperience\}[\s\S]*?(?=\\section\*?\{)/i,
    data.experience,
    (e) => e.company
  );

  result = replaceSectionEntriesByName(
    result,
    /\\section\*?\{[Pp]rojects?\}[\s\S]*?(?=\\section\*?\{)/i,
    data.projects,
    (e) => e.name
  );

  result = replaceSkillsTabularx(result, data.skills);

  return result;
}

export async function writeLatex(originalPath, jsonPath, outputPath = null) {
  const absOrig = resolve(originalPath);
  const absJson = resolve(jsonPath);

  const [tex, jsonRaw] = await Promise.all([
    readFile(absOrig, 'utf-8'),
    readFile(absJson, 'utf-8'),
  ]);

  let data;
  try {
    data = JSON.parse(jsonRaw);
  } catch (err) {
    console.error(`Invalid JSON in ${absJson}: ${err.message}`);
    process.exit(1);
  }

  const format = data.meta?.format_detected || detectFormat(tex);
  let out =
    format === 'resumeSubheading' ? writeResumeSubheading(tex, data) : writeTabularxItemize(tex, data);

  const outDir = outputPath
    ? resolve(dirname(outputPath))
    : resolve(dirname(absOrig), 'output');
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const outFile = outputPath
    ? resolve(outputPath)
    : resolve(outDir, `cv-tailored-${basename(absOrig, '.tex')}.tex`);

  await writeFile(outFile, out, 'utf-8');

  const summary = {
    status: 'ok',
    source_tex: basename(absOrig),
    json_file: basename(absJson),
    output_tex: outFile,
    format,
    experience_jobs: data.experience?.length ?? 0,
    projects: data.projects?.length ?? 0,
    skills_categories: Object.keys(data.skills || {}).length,
  };

  console.log(JSON.stringify(summary));
  return { outFile, data };
}

const originalPath = process.argv[2];
const jsonPath = process.argv[3];
const outputPath = process.argv[4];

if (!originalPath || !jsonPath) {
  console.error('Usage: node write-latex.mjs <original.tex> <tailored.json> [output.tex]');
  process.exit(1);
}

writeLatex(originalPath, jsonPath, outputPath);
