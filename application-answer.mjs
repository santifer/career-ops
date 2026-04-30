#!/usr/bin/env node
/**
 * application-answer.mjs -- Build context for drafted application answers
 *
 * This script does not call an LLM and never submits applications. It packages
 * the pasted question, optional job context, matching report context, and user
 * profile into a compact brief for an AI coding assistant to turn into a final
 * answer using modes/answer.md.
 *
 * Usage:
 *   node application-answer.mjs --question "Why do you want this role?"
 *   node application-answer.mjs --company Vercel --role "Backend Engineer" --question "..."
 *   node application-answer.mjs --report reports/001-acme-2026-04-28.md --question-file q.txt
 *   node application-answer.mjs --job-file jd.txt --question-file q.txt --output output/answer-brief.md
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(CAREER_OPS, 'reports');
const DEFAULT_OUTPUT = join(CAREER_OPS, 'output/application-answer-brief.md');
const args = process.argv.slice(2);

function argValue(name, fallback = '') {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1] || fallback;
}

function hasArg(name) {
  return args.includes(name);
}

function readIfExists(path, fallback = '') {
  const fullPath = join(CAREER_OPS, path);
  return existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : fallback;
}

function readUserFile(path) {
  if (!path) return '';
  const fullPath = path.startsWith('/') ? path : join(CAREER_OPS, path);
  if (!existsSync(fullPath)) {
    console.error(`Error: file not found: ${path}`);
    process.exit(1);
  }
  return readFileSync(fullPath, 'utf-8').trim();
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreReport(file, company, role) {
  const name = normalize(file);
  const content = normalize(readFileSync(join(REPORTS_DIR, file), 'utf-8').slice(0, 8000));
  const companyTerms = normalize(company).split(' ').filter(Boolean);
  const roleTerms = normalize(role).split(' ').filter(t => t.length > 2);
  let score = 0;

  for (const term of companyTerms) {
    if (name.includes(term)) score += 8;
    if (content.includes(term)) score += 4;
  }
  for (const term of roleTerms) {
    if (name.includes(term)) score += 3;
    if (content.includes(term)) score += 2;
  }

  return score;
}

function findReport(company, role) {
  const explicit = argValue('--report');
  if (explicit) {
    const fullPath = explicit.startsWith('/') ? explicit : join(CAREER_OPS, explicit);
    if (!existsSync(fullPath)) {
      console.error(`Error: report not found: ${explicit}`);
      process.exit(1);
    }
    return fullPath;
  }

  if (!existsSync(REPORTS_DIR) || (!company && !role)) return '';

  const ranked = readdirSync(REPORTS_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => ({ file, score: scoreReport(file, company, role) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.file.localeCompare(a.file));

  return ranked.length > 0 ? join(REPORTS_DIR, ranked[0].file) : '';
}

function clip(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  return text.slice(0, maxChars).trimEnd() + '\n\n(clipped)';
}

function extractProfileHighlights(profileText) {
  const lines = profileText.split('\n');
  const keep = [];
  let currentSection = '';

  for (const line of lines) {
    if (/^(candidate|target_roles|narrative|location|experience_summary|skills|preferences):/.test(line)) {
      currentSection = line.split(':')[0];
    }
    if (['candidate', 'target_roles', 'narrative', 'location', 'experience_summary', 'skills', 'preferences'].includes(currentSection)) {
      keep.push(line);
    }
  }

  return keep.join('\n').trim();
}

async function readStdinIfAvailable() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8').trim();
}

const question = argValue('--question')
  || readUserFile(argValue('--question-file'))
  || await readStdinIfAvailable();

if (!question) {
  console.error('Error: provide --question, --question-file, or pipe question text on stdin.');
  process.exit(1);
}

const company = argValue('--company');
const role = argValue('--role');
const jobContext = argValue('--job')
  || readUserFile(argValue('--job-file'));
const desiredLength = argValue('--length', '80-140 words unless the form asks otherwise');
const outputPath = argValue('--output');
const reportPath = findReport(company, role);
const reportText = reportPath ? readFileSync(reportPath, 'utf-8') : '';

const profile = readIfExists('config/profile.yml');
const profileMode = readIfExists('modes/_profile.md');
const articleDigest = readIfExists('article-digest.md');
const cv = readIfExists('cv.md');

const brief = `# Application Answer Brief

Use this brief with \`modes/_shared.md\` and \`modes/answer.md\`. Draft candidate-facing copy only. Do not submit anything.

## Form Question

${question.trim()}

## Target

- Company: ${company || 'Unknown / infer from job context'}
- Role: ${role || 'Unknown / infer from job context'}
- Desired length: ${desiredLength}

## Job Context

${jobContext ? clip(jobContext, 5000) : 'No pasted JD/job context was provided. Use the report if available; otherwise keep company-specific claims conservative.'}

## Matching Report

${reportPath ? `Matched report: ${relative(CAREER_OPS, reportPath)}\n\n${clip(reportText, 7000)}` : 'No matching report found. Base the answer on the CV/profile and ask for JD context only if the question cannot be answered responsibly.'}

## Candidate Profile Highlights

${clip(extractProfileHighlights(profile), 5000)}

## User-Specific Framing

${clip(profileMode, 4000)}

## CV

${clip(cv, 7000)}

## Article Digest / Proof Points

${articleDigest ? clip(articleDigest, 5000) : 'No article digest available.'}

## Drafting Instructions

- Return the final answer first, ready to paste.
- Sound like a real candidate: specific, grounded, energetic, and direct.
- Prefer concrete proof points over adjectives.
- If a gap exists, bridge it honestly using adjacent experience; do not invent credentials, employers, titles, locations, visa facts, compensation facts, or projects.
- Avoid AI-sounding phrasing and empty praise. Follow the banned-phrase guidance in \`modes/_shared.md\` and \`modes/answer.md\`.
- If the question asks for logistics or legal facts, answer plainly from the profile and do not embellish.
- End with 2-3 optional variants only when they materially help.
`;

if (outputPath || hasArg('--save')) {
  const fullOutput = outputPath
    ? (outputPath.startsWith('/') ? outputPath : join(CAREER_OPS, outputPath))
    : DEFAULT_OUTPUT;
  mkdirSync(dirname(fullOutput), { recursive: true });
  writeFileSync(fullOutput, brief, 'utf-8');
  console.log(`Wrote ${relative(CAREER_OPS, fullOutput)}`);
} else {
  process.stdout.write(brief);
}
