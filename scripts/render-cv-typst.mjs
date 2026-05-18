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
    NAME:                  '',
    TAGLINE:               '',
    PHONE:                 '',
    EMAIL:                 '',
    LINKEDIN_URL:          '',
    LINKEDIN_DISPLAY:      '',
    PORTFOLIO_URL:         '',
    PORTFOLIO_DISPLAY:     '',
    LOCATION:              '',
    SUMMARY_TEXT:          '',
    COMPETENCIES_BLOCK:    '',
    EXPERIENCE:            '',
    PROJECTS_BLOCK:        '',
    SKILLS_BLOCK:          '',
    EDUCATION_CERT_BLOCK:  '',
  };

  const lines = cvText.split('\n');
  let currentSection = '';
  const sectionBuffers = {};
  let firstH2Consumed = false;
  // Standard section names — anything else for the first H2 is treated as a
  // tagline shown under the name.
  const STANDARD_SECTIONS = /^(summary|professional summary|about|contact|header|experience|work experience|professional experience|employment|projects|personal projects|education|certifications|licenses & certifications|skills|technical skills|core competencies|competencies|skills summary)$/i;

  for (const line of lines) {
    // H1 = name
    if (/^# (.+)/.test(line)) {
      tokens.NAME = line.replace(/^# /, '').trim();
      continue;
    }

    // H2 = top-level contact / section headings
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      const heading = h2[1].trim();
      if (!firstH2Consumed && !STANDARD_SECTIONS.test(heading)) {
        // Non-standard first H2 → render as a tagline under the name.
        tokens.TAGLINE = heading;
        firstH2Consumed = true;
        continue;
      }
      firstH2Consumed = true;
      currentSection = heading.toLowerCase();
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
      // Skip markdown horizontal rules — they sit between sections and would
      // otherwise leak into the trailing section's buffer.
      if (/^-{3,}\s*$/.test(line.trim())) continue;
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
    // Accept 'https://linkedin.com/...', 'linkedin.com/...', or 'www.linkedin.com/...'
    const lm = cvText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s")|,]+/i);
    if (lm) {
      const raw = lm[0];
      tokens.LINKEDIN_URL     = /^https?:/i.test(raw) ? raw : `https://${raw}`;
      tokens.LINKEDIN_DISPLAY = tokens.LINKEDIN_URL.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    }
  }
  if (!tokens.PORTFOLIO_URL) {
    // Look for a personal portfolio URL/hostname in the header area
    // (first ~20 lines). Skip social platforms, common email providers, and
    // hostnames embedded in emails.
    const SOCIAL_OR_MAIL = /^(?:linkedin|github|gitlab|bitbucket|twitter|x|gmail|yahoo|outlook|hotmail|icloud|protonmail|proton)\./i;
    const headerLines = cvText.split('\n').slice(0, 20);
    for (const rawLine of headerLines) {
      const line = rawLine.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi, '');
      const matches = line.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s")|,]*)?/gi);
      if (!matches) continue;
      for (const raw of matches) {
        const stripped = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
        if (SOCIAL_OR_MAIL.test(stripped)) continue;
        if (!/\.[a-z]{2,}(?:\/|$)/i.test(stripped)) continue;
        tokens.PORTFOLIO_URL     = /^https?:/i.test(raw) ? raw : `https://${stripped}`;
        tokens.PORTFOLIO_DISPLAY = stripped.replace(/\/$/, '');
        break;
      }
      if (tokens.PORTFOLIO_URL) break;
    }
  }
  if (!tokens.PHONE) {
    const pm = cvText.match(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (pm) tokens.PHONE = pm[0].trim();
  }
  if (!tokens.LOCATION) {
    // Look for a "City, ST" or "City, Country" pattern on the first ~10 lines.
    // Skip the H1 line and section headings.
    const headerLines = cvText.split('\n').slice(0, 10);
    for (const rawLine of headerLines) {
      if (/^#/.test(rawLine)) continue;
      // First pipe-separated segment that looks like "City, XX" wins.
      const segments = rawLine.split('|').map(s => s.trim()).filter(Boolean);
      for (const seg of segments) {
        if (/^[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+$/.test(seg)) {
          tokens.LOCATION = seg;
          break;
        }
      }
      if (tokens.LOCATION) break;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const summaryLines = sectionBuffers['professional summary'] ||
                       sectionBuffers['summary'] ||
                       sectionBuffers['about'] || [];
  tokens.SUMMARY_TEXT = summaryLines
    .map(l => (typeof l === 'string' ? l : ''))
    .filter(l => l.trim() && !/^-{3,}$/.test(l.trim()))
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
  // Build Typst inline code: wrap each in competency-tag(). If the cv.md has
  // no competencies section, emit an empty block so the section heading is
  // skipped entirely (template uses {{COMPETENCIES_BLOCK}} which contains the
  // heading + content together).
  if (compTags.length) {
    const tagBlock = compTags.map(t => `#competency-tag("${escapeTypstStr(stripMarkdown(t))}")`).join('\n');
    tokens.COMPETENCIES_BLOCK =
      `#section-heading("Core Competencies")\n` +
      `#set text(size: 10pt, fill: ink)\n` +
      `${tagBlock}\n` +
      `#v(4pt)`;
  } else {
    tokens.COMPETENCIES_BLOCK = '';
  }

  // ── Work Experience → Typst job-entry() calls ─────────────────────────────

  const expLines = sectionBuffers['work experience'] ||
                   sectionBuffers['experience'] ||
                   sectionBuffers['employment'] || [];
  tokens.EXPERIENCE = convertSectionToTypst(expLines, 'job-entry');

  // ── Projects → wrapped section block ──────────────────────────────────────

  const projLines = sectionBuffers['personal projects'] ||
                    sectionBuffers['projects'] || [];
  const projContent = convertProjectsToTypst(projLines);
  if (projLines.length && projContent !== '(see cv.md)') {
    tokens.PROJECTS_BLOCK =
      `#section-heading("Selected Projects")\n` +
      `${projContent}\n` +
      `#v(4pt)`;
  } else {
    tokens.PROJECTS_BLOCK = '';
  }

  // ── Education + Certifications → combined section block ──────────────────

  const eduLines = sectionBuffers['education'] || [];
  const certLines = sectionBuffers['certifications'] ||
                    sectionBuffers['licenses & certifications'] || [];
  const eduContent = convertEduToTypst(eduLines);
  const certContent = convertCertToTypst(certLines);
  const hasEdu  = eduLines.length  && eduContent  !== '(see cv.md)';
  const hasCert = certLines.length && certContent !== '(see cv.md)';
  if (hasEdu || hasCert) {
    const heading = hasEdu && hasCert ? 'Education & Certifications'
                   : hasEdu           ? 'Education'
                   :                    'Certifications';
    let body = '';
    if (hasEdu)  body += eduContent + '\n';
    if (hasEdu && hasCert) body += '#v(2pt)\n';
    if (hasCert) body += certContent + '\n';
    tokens.EDUCATION_CERT_BLOCK =
      `#section-heading("${heading}")\n` +
      `${body}` +
      `#v(2pt)`;
  } else {
    tokens.EDUCATION_CERT_BLOCK = '';
  }

  // ── Skills / Tech Stack → section block with categorized inline lists ─────
  // Per dealbreaker D5: emit each `**Category:** items` line via the
  // `#skill-category()` macro (inline category label + items text). Bullet-
  // style evidence skills (e.g. cv.md's `- Skill Name — detail (week W##)`)
  // collapse into a single leading paragraph so the section stays compact.

  const skillLines = sectionBuffers['technical skills'] ||
                     sectionBuffers['skills'] || [];
  // Pass 1: drop HTML comments + merge wrapped continuation lines.
  const skillEntries = [];
  for (const entry of skillLines) {
    if (typeof entry !== 'string') continue;
    const cleaned = entry.replace(/<!--[\s\S]*?-->/g, '').trimEnd();
    const l = cleaned.trim();
    if (!l) continue;
    const isBullet   = /^[-*]\s+/.test(l);
    const isCategory = /^\*\*[^*]+:\*\*/.test(l);
    if (isBullet || isCategory || skillEntries.length === 0) {
      skillEntries.push(l);
    } else {
      skillEntries[skillEntries.length - 1] += ' ' + l;
    }
  }
  // Pass 2: split categories from bullet/free-text evidence entries.
  const categoryLines = [];
  const evidenceLines = [];
  for (const e of skillEntries) {
    if (/^\*\*[^*]+:\*\*/.test(e)) {
      categoryLines.push(e);
    } else {
      evidenceLines.push(e.replace(/^[-*]\s+/, ''));
    }
  }
  // Pass 3: emit Typst content. One `#skill-category()` per category line;
  // evidence lines (if any) become a compact leading paragraph above the
  // category grid.
  let skillsBody = '';
  if (evidenceLines.length) {
    const evidenceText = evidenceLines.map(stripMarkdown).join(' ');
    skillsBody += `#text(size: 9pt, fill: muted, "${escapeTypstStr(evidenceText)}")\n#v(2pt)\n`;
  }
  for (const c of categoryLines) {
    const m = c.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    if (!m) continue;
    const label = stripMarkdown(m[1]);
    const items = stripMarkdown(m[2]);
    skillsBody += `#skill-category(label: "${escapeTypstStr(label)}", items: "${escapeTypstStr(items)}")\n`;
  }
  if (skillsBody) {
    tokens.SKILLS_BLOCK =
      `#section-heading("Skills & Tech Stack")\n` +
      `${skillsBody}` +
      `#v(4pt)`;
  } else {
    tokens.SKILLS_BLOCK = '';
  }

  // Escape singleton text tokens before substitution.
  // - NAME and *_URL land inside Typst string literals "..." → only \ and " need escaping.
  // - Other singletons (phone, email, location, *_DISPLAY, summary) land in content mode,
  //   where @ becomes a label reference, # is a command, and ** parses as a Typst delimiter.
  tokens.NAME              = escapeTypstStr(tokens.NAME);
  tokens.TAGLINE           = escapeTypstStr(stripMarkdown(tokens.TAGLINE));
  tokens.LINKEDIN_URL      = escapeTypstStr(tokens.LINKEDIN_URL);
  tokens.PORTFOLIO_URL     = escapeTypstStr(tokens.PORTFOLIO_URL);
  tokens.PHONE             = escapeTypst(tokens.PHONE);
  tokens.EMAIL             = escapeTypst(tokens.EMAIL);
  tokens.LOCATION          = escapeTypst(tokens.LOCATION);
  tokens.LINKEDIN_DISPLAY  = escapeTypst(tokens.LINKEDIN_DISPLAY);
  tokens.PORTFOLIO_DISPLAY = escapeTypst(tokens.PORTFOLIO_DISPLAY);
  tokens.SUMMARY_TEXT      = escapeTypst(tokens.SUMMARY_TEXT);

  return tokens;
}

// ── Typst conversion helpers ──────────────────────────────────────────────────

function escapeTypst(s) {
  // Convert markdown **bold** → Typst *bold* (Typst uses single-* delimiters;
  // leaving raw ** produces unclosed-delimiter errors in inline content).
  // Then escape Typst special characters: # " \ @
  // For values that land inside a Typst string literal "...", use
  // escapeTypstStr instead — # and @ have no special meaning in strings, and
  // backslash-escaping them produces visible \# / \@ in the output.
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/#/g, '\\#')
    .replace(/@/g, '\\@');
}

function escapeTypstStr(s) {
  // For values that land inside a Typst string literal "...". Only the string
  // delimiter and backslash need escaping; #, @, and * are literal inside strings.
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Strip markdown formatting markers from text that will be rendered as a
// plain string (e.g. as the `company` arg to job-entry, which Typst displays
// verbatim). Use this for fields that go through escapeTypst-then-string
// rather than escapeTypst-then-content.
function stripMarkdown(s) {
  return String(s)
    .replace(/<!--[\s\S]*?-->/g, '')                    // HTML comments
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')          // [text](url) → text
    .replace(/\*\*(.+?)\*\*/g, '$1')                    // **bold** → bold
    .replace(/(?<![*\w])\*(?!\*)([^*\n]+?)\*(?!\*)/g, '$1') // *italic* → italic
    .replace(/`([^`]+)`/g, '$1')                        // `code` → code
    .trim();
}

/**
 * Convert a flat array of markdown lines (from a section buffer) to
 * Typst job-entry() calls.
 *
 * Recognised cv.md format:
 *   ### Role Title
 *   **Company — Description**  |  Period[  |  Location]
 *
 *   Optional context paragraph (skipped).
 *
 *   - Bullet one
 *     wrapped continuation merged into the previous bullet
 *   - Bullet two
 *
 * Falls back to the legacy format (H3 = company, next line = "Role | Period | Location")
 * when the line under the H3 doesn't carry a `**bold**` marker.
 */
function convertSectionToTypst(lines, macroName) {
  const typstBlocks = [];
  let company = '';
  let role = '';
  let period = '';
  let location = '';
  let context = '';
  let bullets = [];
  let inEntry = false;
  let metaLineSeen = false;
  let bulletsStarted = false;

  function flush() {
    if (!inEntry || (!company && !role)) return;
    // Typst tuple syntax requires a trailing comma to distinguish a 1-element
    // tuple `(x,)` from a parenthesized expression `(x)`. Always append `,` so
    // any non-empty array renders as a tuple.
    const bulletArgs = bullets.length
      ? bullets.map(b => `"${escapeTypstStr(b)}"`).join(',\n    ') + ','
      : '';
    typstBlocks.push(
      `#${macroName}(\n` +
      `  company: "${escapeTypstStr(company)}",\n` +
      `  role: "${escapeTypstStr(role)}",\n` +
      `  period: "${escapeTypstStr(period)}",\n` +
      `  location: "${escapeTypstStr(location)}",\n` +
      `  team_context: "${escapeTypstStr(context)}",\n` +
      `  bullets: (${bulletArgs})\n` +
      `)`
    );
    company = role = period = location = context = '';
    bullets = [];
    inEntry = false;
    metaLineSeen = false;
    bulletsStarted = false;
  }

  for (const entry of lines) {
    if (typeof entry === 'object' && entry.type === 'heading') {
      flush();
      role = stripMarkdown(entry.text);
      inEntry = true;
      continue;
    }
    const rawLine = typeof entry === 'string' ? entry : '';
    const l = rawLine.trim();
    if (!l) continue;

    // Meta line under the H3 — first pipe-bearing line wins.
    if (inEntry && !metaLineSeen && l.includes('|')) {
      const parts = l.split('|').map(s => s.trim());
      if (/^\*\*.+\*\*/.test(parts[0])) {
        // cv.md format: **Company**  |  Period[  |  Location]
        company  = stripMarkdown(parts[0]);
        period   = stripMarkdown(parts[1] || '');
        location = stripMarkdown(parts[2] || '');
      } else {
        // Legacy format: H3 was company, this line is Role | Period | Location
        company  = role;
        role     = stripMarkdown(parts[0] || '');
        period   = stripMarkdown(parts[1] || '');
        location = stripMarkdown(parts[2] || '');
      }
      metaLineSeen = true;
      continue;
    }

    if (l.startsWith('-') || l.startsWith('*')) {
      bullets.push(stripMarkdown(l.replace(/^[-*]\s*/, '')));
      bulletsStarted = true;
      continue;
    }

    // Wrapped continuation of the previous bullet: original line started with
    // whitespace and we're inside a bullet group.
    if (bulletsStarted && bullets.length > 0 && /^\s/.test(rawLine)) {
      bullets[bullets.length - 1] += ' ' + stripMarkdown(l);
      continue;
    }

    // Context paragraph: appears after the meta line and before any bullet.
    // Multiple paragraph lines (separated by blank lines) are joined with a space.
    if (metaLineSeen && !bulletsStarted) {
      context = context ? `${context} ${stripMarkdown(l)}` : stripMarkdown(l);
      continue;
    }

    // Otherwise: stray content after bullets — skip.
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
      `  title: "${escapeTypstStr(title)}",\n` +
      `  meta: "${escapeTypstStr(badge)}",\n` +
      `  description: "${escapeTypstStr(descLines.join(' '))}",\n` +
      `  tech: "${escapeTypstStr(tech)}"\n` +
      `)`
    );
    title = badge = tech = '';
    descLines = [];
  }

  for (const entry of lines) {
    if (typeof entry === 'object' && entry.type === 'heading') {
      flush();
      const badgeMatch = entry.text.match(/^(.+?)\s+\[([^\]]+)\]$/);
      title = stripMarkdown(badgeMatch ? badgeMatch[1] : entry.text);
      badge = stripMarkdown(badgeMatch ? badgeMatch[2] : '');
      continue;
    }
    const l = typeof entry === 'string' ? entry.trim() : '';
    if (!l) continue;
    if (/^tech:/i.test(l)) {
      tech = stripMarkdown(l.replace(/^tech:\s*/i, ''));
    } else if (l.startsWith('-') || l.startsWith('*')) {
      descLines.push(stripMarkdown(l.replace(/^[-*]\s*/, '')));
    } else {
      descLines.push(stripMarkdown(l));
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
      `  degree: "${escapeTypstStr(degree)}",\n` +
      `  institution: "${escapeTypstStr(org)}",\n` +
      `  year: "${escapeTypstStr(year)}",\n` +
      `  detail: "${escapeTypstStr(desc)}"\n` +
      `)`
    );
    degree = org = year = desc = '';
  }

  for (const entry of lines) {
    if (typeof entry === 'object' && entry.type === 'heading') {
      flush();
      degree = stripMarkdown(entry.text);
      continue;
    }
    const l = typeof entry === 'string' ? entry.trim() : '';
    if (!l) continue;
    // `**Degree**  |  Institution[  |  Year]` — no H3 above means the line
    // itself is the entry.
    if (!degree && /^\*\*.+\*\*/.test(l) && l.includes('|')) {
      flush();
      const parts = l.split('|').map(s => s.trim());
      degree = stripMarkdown(parts[0]);
      org    = stripMarkdown(parts[1] || '');
      year   = stripMarkdown(parts[2] || '');
      continue;
    }
    if (l.includes('|')) {
      const parts = l.split('|').map(s => s.trim());
      org  = stripMarkdown(parts[0] || '');
      year = stripMarkdown(parts[1] || '');
    } else {
      desc = stripMarkdown(l);
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
    const stripped = l.replace(/^[-*]\s*/, '');

    // Format A: "**Title** — Issuer, Date" (em-dash or en-dash, comma-separated issuer/date)
    const dashSplit = stripped.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    let title = '', issuer = '', date = '';
    if (dashSplit && !stripped.includes('|')) {
      title = stripMarkdown(dashSplit[1]);
      const tail = dashSplit[2];
      const commaIdx = tail.lastIndexOf(',');
      if (commaIdx >= 0) {
        issuer = stripMarkdown(tail.slice(0, commaIdx));
        date   = stripMarkdown(tail.slice(commaIdx + 1));
      } else {
        issuer = stripMarkdown(tail);
      }
    }
    // Format B: "Title | Issuer | Date"
    else if (l.includes('|')) {
      const parts = stripped.split('|').map(s => s.trim());
      title  = stripMarkdown(parts[0] || '');
      issuer = stripMarkdown(parts[1] || '');
      date   = stripMarkdown(parts[2] || '');
    }
    // Fallback: bare bullet, no issuer/date
    else if ((l.startsWith('-') || l.startsWith('*')) && l.length > 2) {
      title = stripMarkdown(stripped);
    } else {
      continue;
    }

    blocks.push(
      `#cert-entry(\n` +
      `  title: "${escapeTypstStr(title)}",\n` +
      `  issuer: "${escapeTypstStr(issuer)}",\n` +
      `  date: "${escapeTypstStr(date)}"\n` +
      `)`
    );
  }
  return blocks.join('\n') || '(see cv.md)';
}

// ── Token substitution ────────────────────────────────────────────────────────

function substituteTokens(templateSrc, tokens) {
  // Skip `//` comment lines so multi-line token values can't break out
  // of a single-line Typst comment (e.g. the {{TOKEN}} reference docs at
  // the top of cv-template.typ).
  return templateSrc.split('\n').map(line => {
    if (line.trimStart().startsWith('//')) return line;
    let out = line;
    for (const [key, value] of Object.entries(tokens)) {
      const placeholder = `{{${key}}}`;
      out = out.split(placeholder).join(value);
    }
    return out;
  }).join('\n');
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
