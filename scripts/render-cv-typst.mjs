#!/usr/bin/env node
/**
 * render-cv-typst.mjs — Typst PDF render path for career-ops CVs.
 *
 * Mirrors the API shape of generate-pdf.mjs (HTML→PDF via Playwright).
 * Takes a cv.md input + templates/cv-template.typ, substitutes placeholder
 * tokens, compiles via `typst compile`, and writes a PDF to the output path.
 *
 * Usage:
 *   node scripts/render-cv-typst.mjs [options]
 *
 * Options:
 *   --input <file>    Source cv.md (default: cv.md in repo root)
 *   --output <file>   Output PDF path (default: output/cv-typst.pdf)
 *   --template <file> Typst template (default: templates/cv-template.typ)
 *   --open            Open the PDF after generation (macOS: `open`)
 *   --dry-run         Print the substituted .typ source; do not compile
 *
 * Requirements:
 *   typst 0.14+ must be in PATH. Install: brew install typst
 *
 * This is an ADDITIONAL render path. The existing LaTeX (generate-latex.mjs)
 * and HTML/Playwright (generate-pdf.mjs) paths are unchanged.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

// ── Setup ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load .env so API keys are available if this script ever needs them
try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env'), override: true });
} catch { /* dotenv optional */ }

// ── Argument parsing ─────────────────────────────────────────────────────────

const args = (() => {
  const a = {
    input: null,
    output: null,
    template: null,
    open: false,
    dryRun: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--open')     { a.open = true; continue; }
    if (argv[i] === '--dry-run')  { a.dryRun = true; continue; }
    if (argv[i] === '--input'    && argv[i+1]) { a.input    = argv[++i]; continue; }
    if (argv[i] === '--output'   && argv[i+1]) { a.output   = argv[++i]; continue; }
    if (argv[i] === '--template' && argv[i+1]) { a.template = argv[++i]; continue; }
  }
  return a;
})();

// ── Resolve paths ────────────────────────────────────────────────────────────

const cvPath       = resolve(args.input    || join(ROOT, 'cv.md'));
const templatePath = resolve(args.template || join(ROOT, 'templates', 'cv-template.typ'));
const outputPdf    = resolve(args.output   || join(ROOT, 'output', 'cv-typst.pdf'));

// Ensure output directory exists
mkdirSync(dirname(outputPdf), { recursive: true });

// ── Verify typst is installed ─────────────────────────────────────────────────

function checkTypst() {
  const r = spawnSync('typst', ['--version'], { encoding: 'utf-8' });
  if (r.error || r.status !== 0) {
    console.error('typst not found in PATH. Install with: brew install typst');
    process.exit(1);
  }
  return (r.stdout || '').trim();
}

// ── CV markdown → token map ──────────────────────────────────────────────────

/**
 * Parse cv.md into the token map expected by cv-template.typ.
 * cv.md uses standard markdown — we extract sections by heading.
 *
 * Returns a Record<string, string> with keys matching {{TOKEN}} placeholders.
 */
function parseCvMarkdown(cvText) {
  const tokens = {
    NAME:               '',
    PHONE:              '',
    EMAIL:              '',
    LINKEDIN_URL:       '',
    LINKEDIN_DISPLAY:   '',
    PORTFOLIO_URL:      '',
    PORTFOLIO_DISPLAY:  '',
    LOCATION:           '',
    SUMMARY_TEXT:       '',
    COMPETENCIES:       '',
    EXPERIENCE:         '',
    PROJECTS:           '',
    EDUCATION:          '',
    CERTIFICATIONS:     '',
    SKILLS:             '',
  };

  const lines = cvText.split('\n');
  let currentSection = '';
  const sectionBuffers = {};

  for (const line of lines) {
    // H1 = name
    if (/^# (.+)/.test(line)) {
      tokens.NAME = line.replace(/^# /, '').trim();
      continue;
    }

    // H2 = top-level contact / section headings
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      currentSection = h2[1].trim().toLowerCase();
      sectionBuffers[currentSection] = sectionBuffers[currentSection] || [];
      continue;
    }

    // H3 = sub-section headings (company / project / degree)
    const h3 = line.match(/^### (.+)/);
    if (h3) {
      if (!sectionBuffers[currentSection]) sectionBuffers[currentSection] = [];
      sectionBuffers[currentSection].push({ type: 'heading', text: h3[1].trim() });
      continue;
    }

    if (currentSection) {
      if (!sectionBuffers[currentSection]) sectionBuffers[currentSection] = [];
      sectionBuffers[currentSection].push(line);
    }
  }

  // ── Extract contact info ──────────────────────────────────────────────────

  const contactSection = sectionBuffers['contact'] || sectionBuffers['header'] || [];
  for (const entry of contactSection) {
    const l = typeof entry === 'string' ? entry.trim() : '';
    if (/^\*\*phone\*\*|phone:/i.test(l)) {
      tokens.PHONE = l.replace(/^\*\*phone\*\*:?\s*/i, '').replace(/\*\*/g, '').trim();
    }
    if (/^\*\*email\*\*|email:/i.test(l) || /mailto:/i.test(l)) {
      const emailMatch = l.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/);
      if (emailMatch) tokens.EMAIL = emailMatch[0];
    }
    if (/linkedin/i.test(l)) {
      const urlMatch = l.match(/https?:\/\/[^\s)]+/);
      if (urlMatch) {
        tokens.LINKEDIN_URL     = urlMatch[0];
        tokens.LINKEDIN_DISPLAY = urlMatch[0].replace('https://', '').replace(/\/$/, '');
      }
    }
    if (/portfolio|website|site/i.test(l)) {
      const urlMatch = l.match(/https?:\/\/[^\s)]+/);
      if (urlMatch) {
        tokens.PORTFOLIO_URL     = urlMatch[0];
        tokens.PORTFOLIO_DISPLAY = urlMatch[0].replace('https://', '').replace(/\/$/, '');
      }
    }
    if (/location|city/i.test(l) || /remote/i.test(l)) {
      tokens.LOCATION = l.replace(/^\*\*[^*]+\*\*:?\s*/i, '').trim() || l.trim();
    }
  }

  // Fallback: scan entire cv.md for inline contact patterns
  if (!tokens.EMAIL) {
    const em = cvText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/);
    if (em) tokens.EMAIL = em[0];
  }
  if (!tokens.LINKEDIN_URL) {
    const lm = cvText.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s")]+/);
    if (lm) {
      tokens.LINKEDIN_URL     = lm[0];
      tokens.LINKEDIN_DISPLAY = lm[0].replace('https://', '').replace(/\/$/, '');
    }
  }
  if (!tokens.PHONE) {
    const pm = cvText.match(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (pm) tokens.PHONE = pm[0].trim();
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const summaryLines = sectionBuffers['professional summary'] ||
                       sectionBuffers['summary'] ||
                       sectionBuffers['about'] || [];
  tokens.SUMMARY_TEXT = summaryLines
    .map(l => (typeof l === 'string' ? l : ''))
    .filter(l => l.trim())
    .join(' ')
    .trim();

  // ── Core Competencies → Typst competency tags ─────────────────────────────

  const compLines = sectionBuffers['core competencies'] ||
                    sectionBuffers['competencies'] ||
                    sectionBuffers['skills summary'] || [];

  const compTags = [];
  for (const entry of compLines) {
    const l = typeof entry === 'string' ? entry.trim() : '';
    // bullet or tag-like line: `- Foo` or `Foo, Bar, Baz`
    if (l.startsWith('-') || l.startsWith('*')) {
      compTags.push(l.replace(/^[-*]\s*/, '').trim());
    } else if (l.includes(',')) {
      compTags.push(...l.split(',').map(s => s.trim()).filter(Boolean));
    } else if (l) {
      compTags.push(l);
    }
  }
  // Build Typst inline code: wrap each in competency-tag()
  tokens.COMPETENCIES = compTags.length
    ? compTags.map(t => `#competency-tag("${escapeTypst(t)}")`).join('\n')
    : '(see cv.md)';

  // ── Work Experience → Typst job-entry() calls ─────────────────────────────

  const expLines = sectionBuffers['work experience'] ||
                   sectionBuffers['experience'] ||
                   sectionBuffers['employment'] || [];
  tokens.EXPERIENCE = convertSectionToTypst(expLines, 'job-entry');

  // ── Projects ──────────────────────────────────────────────────────────────

  const projLines = sectionBuffers['personal projects'] ||
                    sectionBuffers['projects'] || [];
  tokens.PROJECTS = convertProjectsToTypst(projLines);

  // ── Education ─────────────────────────────────────────────────────────────

  const eduLines = sectionBuffers['education'] || [];
  tokens.EDUCATION = convertEduToTypst(eduLines);

  // ── Certifications ────────────────────────────────────────────────────────

  const certLines = sectionBuffers['certifications'] ||
                    sectionBuffers['licenses & certifications'] || [];
  tokens.CERTIFICATIONS = convertCertToTypst(certLines);

  // ── Technical Skills ──────────────────────────────────────────────────────

  const skillLines = sectionBuffers['technical skills'] ||
                     sectionBuffers['skills'] || [];
  const skillText = skillLines
    .map(l => (typeof l === 'string' ? l : ''))
    .filter(l => l.trim())
    .map(l => `- ${escapeTypst(l.replace(/^[-*]\s+/, ''))}`)
    .join('\n');
  tokens.SKILLS = skillText || '(see cv.md)';

  return tokens;
}

// ── Typst conversion helpers ──────────────────────────────────────────────────

function escapeTypst(s) {
  // Convert markdown **bold** → Typst *bold* (Typst uses single-* delimiters;
  // leaving raw ** produces unclosed-delimiter errors in inline content).
  // Then escape Typst special characters: # " \ @
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/#/g, '\\#')
    .replace(/@/g, '\\@');
}

/**
 * Convert a flat array of markdown lines (from a section buffer) to
 * Typst job-entry() calls. Expects H3 headings as company/role delimiters,
 * pipe-separated metadata on the line after the heading,
 * and bullet lines for the job content.
 *
 * Pattern (in cv.md):
 *   ### Company Name
 *   Role Title | Period | Location
 *   - Bullet one
 *   - Bullet two
 */
function convertSectionToTypst(lines, macroName) {
  const typstBlocks = [];
  let company = '';
  let role = '';
  let period = '';
  let location = '';
  let bullets = [];
  let inEntry = false;

  function flush() {
    if (!inEntry || !company) return;
    const bulletArgs = bullets.map(b => `"${escapeTypst(b)}"`).join(',\n    ');
    typstBlocks.push(
      `#${macroName}(\n` +
      `  company: "${escapeTypst(company)}",\n` +
      `  role: "${escapeTypst(role)}",\n` +
      `  period: "${escapeTypst(period)}",\n` +
      `  location: "${escapeTypst(location)}",\n` +
      `  bullets: (${bulletArgs})\n` +
      `)`
    );
    company = role = period = location = '';
    bullets = [];
    inEntry = false;
  }

  for (const entry of lines) {
    if (typeof entry === 'object' && entry.type === 'heading') {
      flush();
      company = entry.text;
      inEntry = true;
      continue;
    }
    const l = typeof entry === 'string' ? entry.trim() : '';
    if (!l) continue;

    if (inEntry && !role && l.includes('|')) {
      // "Role Title | Period | Location"
      const parts = l.split('|').map(s => s.trim());
      role     = parts[0] || '';
      period   = parts[1] || '';
      location = parts[2] || '';
      continue;
    }

    if ((l.startsWith('-') || l.startsWith('*')) && inEntry) {
      bullets.push(l.replace(/^[-*]\s*/, ''));
    }
  }
  flush();

  return typstBlocks.join('\n\n') || '(see cv.md)';
}

function convertProjectsToTypst(lines) {
  const blocks = [];
  let title = '';
  let badge = '';
  let descLines = [];
  let tech = '';

  function flush() {
    if (!title) return;
    blocks.push(
      `#project-entry(\n` +
      `  title: "${escapeTypst(title)}",\n` +
      `  badge: "${escapeTypst(badge)}",\n` +
      `  description: "${escapeTypst(descLines.join(' '))}",\n` +
      `  tech: "${escapeTypst(tech)}"\n` +
      `)`
    );
    title = badge = tech = '';
    descLines = [];
  }

  for (const entry of lines) {
    if (typeof entry === 'object' && entry.type === 'heading') {
      flush();
      // Allow "Title [badge]" syntax
      const badgeMatch = entry.text.match(/^(.+?)\s+\[([^\]]+)\]$/);
      title = badgeMatch ? badgeMatch[1].trim() : entry.text;
      badge = badgeMatch ? badgeMatch[2].trim() : '';
      continue;
    }
    const l = typeof entry === 'string' ? entry.trim() : '';
    if (!l) continue;
    if (/^tech:/i.test(l)) {
      tech = l.replace(/^tech:\s*/i, '');
    } else if (l.startsWith('-') || l.startsWith('*')) {
      descLines.push(l.replace(/^[-*]\s*/, ''));
    } else {
      descLines.push(l);
    }
  }
  flush();
  return blocks.join('\n\n') || '(see cv.md)';
}

function convertEduToTypst(lines) {
  const blocks = [];
  let degree = '';
  let org = '';
  let year = '';
  let desc = '';

  function flush() {
    if (!degree) return;
    blocks.push(
      `#edu-entry(\n` +
      `  degree: "${escapeTypst(degree)}",\n` +
      `  org: "${escapeTypst(org)}",\n` +
      `  year: "${escapeTypst(year)}",\n` +
      `  description: "${escapeTypst(desc)}"\n` +
      `)`
    );
    degree = org = year = desc = '';
  }

  for (const entry of lines) {
    if (typeof entry === 'object' && entry.type === 'heading') {
      flush();
      degree = entry.text;
      continue;
    }
    const l = typeof entry === 'string' ? entry.trim() : '';
    if (!l) continue;
    if (l.includes('|')) {
      const parts = l.split('|').map(s => s.trim());
      org  = parts[0] || '';
      year = parts[1] || '';
    } else {
      desc = l;
    }
  }
  flush();
  return blocks.join('\n') || '(see cv.md)';
}

function convertCertToTypst(lines) {
  const blocks = [];
  for (const entry of lines) {
    const l = typeof entry === 'string' ? entry.trim() : '';
    if (!l) continue;
    if (l.includes('|')) {
      const parts = l.replace(/^[-*]\s*/, '').split('|').map(s => s.trim());
      const title = parts[0] || '';
      const org   = parts[1] || '';
      const year  = parts[2] || '';
      blocks.push(
        `#cert-entry(\n` +
        `  title: "${escapeTypst(title)}",\n` +
        `  org: "${escapeTypst(org)}",\n` +
        `  year: "${escapeTypst(year)}"\n` +
        `)`
      );
    } else if ((l.startsWith('-') || l.startsWith('*')) && l.length > 2) {
      const cleaned = l.replace(/^[-*]\s*/, '');
      blocks.push(`#cert-entry(title: "${escapeTypst(cleaned)}", org: "", year: "")`);
    }
  }
  return blocks.join('\n') || '(see cv.md)';
}

// ── Token substitution ────────────────────────────────────────────────────────

function substituteTokens(templateSrc, tokens) {
  let out = templateSrc;
  for (const [key, value] of Object.entries(tokens)) {
    const placeholder = `{{${key}}}`;
    // Use split+join to replace all occurrences (no regex needed)
    out = out.split(placeholder).join(value);
  }
  return out;
}

// ── Main render function ──────────────────────────────────────────────────────

/**
 * Render a CV markdown file to PDF via Typst.
 *
 * @param {object} opts
 * @param {string} opts.cvPath       Absolute path to cv.md
 * @param {string} opts.templatePath Absolute path to cv-template.typ
 * @param {string} opts.outputPdf    Absolute path for output PDF
 * @param {boolean} [opts.dryRun]    If true, print .typ source and return without compiling
 * @returns {{ outputPath: string, typstVersion: string, dryRun: boolean, tmpTypPath?: string }}
 */
export async function renderCvTypst({ cvPath, templatePath, outputPdf, dryRun = false } = {}) {
  const _cvPath       = cvPath       || join(ROOT, 'cv.md');
  const _templatePath = templatePath || join(ROOT, 'templates', 'cv-template.typ');
  const _outputPdf    = outputPdf    || join(ROOT, 'output', 'cv-typst.pdf');

  // 1. Verify typst
  const typstVersion = checkTypst();

  // 2. Read inputs
  if (!existsSync(_cvPath)) {
    throw new Error(`cv.md not found at ${_cvPath}`);
  }
  const cvText       = readFileSync(_cvPath, 'utf-8');
  const templateSrc  = readFileSync(_templatePath, 'utf-8');

  // 3. Parse cv.md → token map
  const tokens       = parseCvMarkdown(cvText);

  // 4. Substitute tokens into template
  const typstSource  = substituteTokens(templateSrc, tokens);

  // 5. Dry-run: just print source
  if (dryRun) {
    console.log('=== Typst source (dry-run) ===\n');
    console.log(typstSource.slice(0, 2000));
    if (typstSource.length > 2000) {
      console.log(`\n... (${typstSource.length} chars total, truncated at 2000)`);
    }
    return { outputPath: _outputPdf, typstVersion, dryRun: true };
  }

  // 6. Write .typ to temp file alongside the template (so relative imports work)
  const tmpTypPath   = join(dirname(_templatePath), '_cv-compiled.typ');
  writeFileSync(tmpTypPath, typstSource, 'utf-8');

  // 7. Compile via typst CLI
  mkdirSync(dirname(_outputPdf), { recursive: true });

  const result = spawnSync(
    'typst',
    ['compile', tmpTypPath, _outputPdf],
    {
      encoding: 'utf-8',
      cwd: ROOT,
      timeout: 60_000,
    }
  );

  // Clean up temp .typ (always, even on error)
  try { execSync(`rm -f "${tmpTypPath}"`); } catch { /* ignore */ }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`typst compile failed (exit ${result.status}):\n${stderr}`);
  }

  const { statSync } = await import('node:fs');
  const { size } = statSync(_outputPdf);

  return {
    outputPath: _outputPdf,
    typstVersion,
    dryRun: false,
    sizeBytes: size,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  const typstVersion = checkTypst();
  console.log(`Typst ${typstVersion}`);
  console.log(`Input:    ${cvPath}`);
  console.log(`Template: ${templatePath}`);
  console.log(`Output:   ${outputPdf}`);

  try {
    const result = await renderCvTypst({
      cvPath,
      templatePath,
      outputPdf,
      dryRun: args.dryRun,
    });

    if (!result.dryRun) {
      const kb = ((result.sizeBytes || 0) / 1024).toFixed(1);
      console.log(`PDF generated: ${result.outputPath} (${kb} KB)`);
      if (args.open) {
        execSync(`open "${result.outputPath}"`);
      }
    }
  } catch (err) {
    console.error('Render failed:', err.message);
    process.exit(1);
  }
}
