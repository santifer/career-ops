#!/usr/bin/env node

/**
 * generate-cover-letter.mjs — Cover letter content JSON → HTML → PDF
 *
 * Thin composition layer over generate-pdf.mjs. Reads a JSON content file
 * (produced by the agent following modes/cover-letter.md), substitutes it
 * into templates/cover-letter-template.html, then shells out to the existing
 * generate-pdf.mjs renderer for ATS normalization and Playwright PDF output.
 *
 * Usage:
 *   node generate-cover-letter.mjs <content.json> <output.pdf> [--format=letter|a4]
 *
 * The JSON shape is documented in examples/sample-cover-letter.json.
 *
 * Why this script exists:
 *   - The cover letter mode (modes/cover-letter.md) tells the agent WHAT to write.
 *   - This script handles the deterministic plumbing (template fill + invoke renderer)
 *     so the agent does not have to deal with file I/O or HTML escaping.
 *   - generate-pdf.mjs is reused unchanged — open/closed principle.
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * HTML-escape a string so it is safe to inject into the template body.
 * We only escape the four characters that matter inside <p> elements;
 * generate-pdf.mjs handles Unicode normalization separately.
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the 4 paragraphs as <p> elements.
 * Each paragraph becomes one <p>...</p>; nothing else is wrapped.
 */
function paragraphsToHtml(paragraphs) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    throw new Error('content.letter.paragraphs must be a non-empty array');
  }
  if (paragraphs.length > 5) {
    throw new Error(`Cover letter has ${paragraphs.length} paragraphs; max is 5 for single-page constraint`);
  }
  return paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n    ');
}

/**
 * ★ USER CONTRIBUTION POINT — Learning Mode TODO
 *
 * Select 1-3 quotes from the JD text and pair each with the strongest
 * matching proof point from profile.yml. This function defines the
 * "personality" of the cover letter — what the agent emphasizes.
 *
 * The function is OPTIONAL — the script works without it. The agent in
 * modes/cover-letter.md does the actual prose generation. This function
 * is here as a deterministic helper if you (the user) want to encode
 * a specific selection strategy that overrides agent improvisation.
 *
 * Decisions you must make if you implement it:
 *   1. Which JD sentences are worth quoting?
 *      - longest responsibility bullet?
 *      - sentences containing archetype keywords?
 *      - sentences marked "required" or "must have"?
 *   2. How to score proof point match?
 *      - keyword overlap count?
 *      - hardcoded preference order?
 *      - delegated to LLM?
 *   3. How many quotes is right?
 *      - 1 strong vs 3 medium?
 *      - adaptive based on JD length?
 *
 * @function selectJdQuotesAndProofs
 * @param {string} jdText - Full job description text
 * @param {Array<{name: string, url: string, hero_metric: string}>} proofPoints - From profile.yml
 * @returns {Array<{quote: string, proof: object, why: string}>}
 *
 * Default implementation: returns empty array (script falls back to using
 * paragraphs as-is from the JSON). The agent calling this script should
 * have already incorporated quote selection during prose generation.
 */
// eslint-disable-next-line no-unused-vars
function selectJdQuotesAndProofs(jdText, proofPoints) {
  // TODO (user): implement your quote-selection strategy here.
  // See JSDoc above for the design questions to answer.
  return [];
}

/**
 * Substitute {{PLACEHOLDER}} tokens in the template with values from content.
 * Mirrors the convention in modes/pdf.md (placeholder table).
 */
function fillTemplate(template, content) {
  const c = content.candidate;
  const l = content.letter;

  const replacements = {
    LANG: content.lang || 'en',
    PAGE_WIDTH: content.page_width || '8.5in',
    NAME: escapeHtml(c.name),
    EMAIL: escapeHtml(c.email),
    LINKEDIN_URL: escapeHtml(c.linkedin_url),
    LINKEDIN_DISPLAY: escapeHtml(c.linkedin_display),
    LOCATION: escapeHtml(c.location),
    COMPANY: escapeHtml(l.company),
    ROLE: escapeHtml(l.role),
    DATE: escapeHtml(l.date),
    SALUTATION: escapeHtml(l.salutation),
    CLOSING: escapeHtml(l.closing),
    PARAGRAPHS_HTML: paragraphsToHtml(l.paragraphs),
  };

  let out = template;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(`{{${key}}}`).join(value);
  }

  // Sanity check: any unreplaced placeholders are a bug
  const leftover = out.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(`Unreplaced placeholders in template: ${leftover.join(', ')}`);
  }

  return out;
}

async function main() {
  const args = process.argv.slice(2);
  let inputJson, outputPdf, format = 'letter';

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      format = arg.split('=')[1].toLowerCase();
    } else if (!inputJson) {
      inputJson = arg;
    } else if (!outputPdf) {
      outputPdf = arg;
    }
  }

  if (!inputJson || !outputPdf) {
    console.error('Usage: node generate-cover-letter.mjs <content.json> <output.pdf> [--format=letter|a4]');
    process.exit(1);
  }

  inputJson = resolve(inputJson);
  outputPdf = resolve(outputPdf);

  console.log(`📄 Content: ${inputJson}`);
  console.log(`📁 Output:  ${outputPdf}`);
  console.log(`📏 Format:  ${format.toUpperCase()}`);

  // Read content + template
  const content = JSON.parse(await readFile(inputJson, 'utf-8'));
  const templatePath = resolve(__dirname, 'templates/cover-letter-template.html');
  const template = await readFile(templatePath, 'utf-8');

  // Override page_width based on format flag if not set in JSON
  if (!content.page_width) {
    content.page_width = format === 'a4' ? '210mm' : '8.5in';
  }

  // Fill template
  const filled = fillTemplate(template, content);

  // Write filled HTML to /tmp
  const slug = (content.letter.company || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tmpHtml = `/tmp/cover-letter-${slug}.html`;
  await writeFile(tmpHtml, filled);
  console.log(`📝 Filled HTML: ${tmpHtml}`);

  // Shell out to generate-pdf.mjs (reuse, do not reinvent)
  const renderer = resolve(__dirname, 'generate-pdf.mjs');
  const result = spawnSync('node', [renderer, tmpHtml, outputPdf, `--format=${format}`], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(`❌ generate-pdf.mjs exited with status ${result.status}`);
    process.exit(result.status || 1);
  }

  console.log(`✅ Cover letter ready: ${outputPdf}`);
}

main().catch((err) => {
  console.error('❌ Cover letter generation failed:', err.message);
  process.exit(1);
});
