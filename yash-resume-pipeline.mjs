#!/usr/bin/env node
/**
 * yash-resume-pipeline.mjs — deterministic orchestrator for /yash-resume-pipeline mode.
 *
 * Subcommands print one JSON object to stdout, exit 0 on ok, non-zero on fail.
 * Importable: pure functions (slugify, parsers) are exported for unit tests.
 */

import { readFile, writeFile, rename, unlink, stat, appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
// ROOT is kept for any legacy references; path helpers below use process.cwd() instead.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));

// === cwd-anchored path helpers (tests run in temp dirs) ===
function projectRoot() { return process.cwd(); }
function pipelinePath() { return resolve(projectRoot(), 'data/pipeline.md'); }
function runsLogPath() { return resolve(projectRoot(), 'data/yash-resume-runs.log'); }
function jdsDir() { return resolve(projectRoot(), 'jds'); }
function resumesDir() { return resolve(projectRoot(), 'resumes'); }
function pdfGeneratorPath() { return resolve(ROOT, 'generate-pdf-latex.mjs'); }

// === Output helpers ===
async function fileExists(p) {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

export function buildJdPath(company_slug, role_slug, date) {
  return `jds/JD_${company_slug}_${role_slug}_Yash_Anghan_${date}.md`;
}
export function buildPdfPath(company_slug, role_slug, date) {
  return `resumes/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.pdf`;
}
export function buildTexPath(company_slug, role_slug, date) {
  return `resumes/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.tex`;
}
export function buildSidecarLogPath(company_slug, role_slug, date) {
  return `resume-logs/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.log`;
}
export function buildCoverLetterTexPath(company_slug, role_slug, date) {
  return `/tmp/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.tex`;
}
export function buildCoverLetterPdfPath(company_slug, role_slug, date) {
  return `cover-letters/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.pdf`;
}
export function buildCoverLetterLogPath(company_slug, role_slug, date) {
  return `cover-letter-logs/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.log`;
}

export function ok(payload = {}) {
  process.stdout.write(JSON.stringify({ status: 'ok', ...payload }) + '\n');
  process.exit(0);
}
export function fail(error, extra = {}) {
  process.stdout.write(JSON.stringify({ status: 'fail', error, ...extra }) + '\n');
  process.exit(1);
}
export function emptyOk() {
  process.stdout.write(JSON.stringify({ status: 'empty' }) + '\n');
  process.exit(0);
}

// === Arg parsing: --flag value pairs ===
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const flagBody = a.slice(2);
    if (flagBody.includes('=')) {
      const eq = flagBody.indexOf('=');
      const key = flagBody.slice(0, eq);
      const value = flagBody.slice(eq + 1);
      out[key] = value;
      continue;
    }
    const key = flagBody;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

// === Slugify ===
export function slugify(input) {
  if (typeof input !== 'string') return '';
  // Step 0: remove parenthesized groups (e.g. "(Remote)", "(US)")
  const noParen = input.replace(/\([^)]*\)/g, '');
  // Step 1: replace runs of non-alnum with single space
  const cleaned = noParen.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  if (!cleaned) return '';
  // Step 2-5: tokenize, capitalize, concat
  return cleaned.split(/\s+/).map((token) => {
    if (token.length >= 2 && token === token.toUpperCase() && /[A-Z]/.test(token)) {
      // all-caps token of length >= 2: title-case it (AI -> Ai, ML -> Ml)
      return token[0] + token.slice(1).toLowerCase();
    }
    // single-letter or mixed-case: first char upper, rest forced lower (spec §5.3 step 4)
    if (token.length === 1) return token.toUpperCase();
    return token[0].toUpperCase() + token.slice(1).toLowerCase();
  }).join('');
}

export function dateToday() {
  return new Date().toISOString().slice(0, 10);
}

// === Sanitize helpers ===
function sanitizeReason(reason) {
  if (typeof reason !== 'string') return reason;
  return reason.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

// === Pipeline.md helpers ===
async function readPipeline() {
  try {
    return await readFile(pipelinePath(), 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') fail(`pipeline.md not found at ${pipelinePath()}`);
    else fail(`failed to read pipeline.md: ${e.message}`);
  }
}

export function findFirstPending(content) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*[-*] \[ \] (\S+)/);
    if (m) return { url: m[1], line_number: i + 1 };
  }
  return null;
}

// === Atomic pipeline.md write helpers ===
async function writePipelineAtomic(content) {
  const path = pipelinePath();
  const tmp = `${path}.tmp`;
  // Always end with trailing newline for POSIX compliance
  const final = content.endsWith('\n') ? content : content + '\n';
  await writeFile(tmp, final);
  try {
    await rename(tmp, path);
  } catch (e) {
    // Clean up orphaned .tmp on rename failure (cross-device, locked, etc.)
    await unlink(tmp).catch(() => {});
    throw e;
  }
}

// Find the section header line index; -1 if not found.
function findSectionStart(lines, sectionName) {
  return lines.findIndex((l) => l.trim() === `## ${sectionName}`);
}

// Returns { lines, pendientesIdx, procesadasIdx } or fails if structure invalid.
function parsePipelineSections(content) {
  const lines = content.split(/\r?\n/);
  const pendientesIdx = findSectionStart(lines, 'Pendientes');
  const procesadasIdx = findSectionStart(lines, 'Procesadas');
  if (pendientesIdx === -1) fail('pipeline.md missing `## Pendientes` section');
  if (procesadasIdx === -1) fail('pipeline.md missing `## Procesadas` section');
  return { lines, pendientesIdx, procesadasIdx };
}

// Remove all line(s) matching `- [<state>] <url>` (any state) for the given URL.
function removeUrlLines(lines, url) {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^- \\[.\\] ${escaped}( |$)`);
  return lines.filter((l) => !re.test(l));
}

// Insert a line at the bottom of a given section (just before the next ## or EOF).
function insertAtSectionEnd(lines, sectionIdx, newLine) {
  let insertIdx = lines.length;
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { insertIdx = i; break; }
  }
  while (insertIdx > sectionIdx + 1 && lines[insertIdx - 1].trim() === '') insertIdx--;
  return [...lines.slice(0, insertIdx), newLine, ...lines.slice(insertIdx)];
}

// === Subcommand stubs (filled in subsequent tasks) ===
const SUBCOMMANDS = {
  // populated as we go
};

SUBCOMMANDS['slugify'] = async (args) => {
  const company = args.company ?? '';
  const role = args.role ?? '';
  const company_slug = slugify(company);
  const role_slug = slugify(role);
  if (!company_slug) fail('empty company slug after normalization');
  if (!role_slug) fail('empty role slug after normalization');
  ok({ company_slug, role_slug, date: dateToday() });
};

SUBCOMMANDS['next-pending'] = async () => {
  const content = await readPipeline();
  const next = findFirstPending(content);
  if (!next) emptyOk();
  ok(next);
};

SUBCOMMANDS['check-duplicate'] = async (args) => {
  const cs = args['company-slug'];
  const rs = args['role-slug'];
  const date = args.date;
  if (!cs || !rs || !date) fail('check-duplicate requires --company-slug, --role-slug, --date');
  const jd_rel = buildJdPath(cs, rs, date);
  const pdf_rel = buildPdfPath(cs, rs, date);
  const jd_abs = resolve(projectRoot(), jd_rel);
  const pdf_abs = resolve(projectRoot(), pdf_rel);
  const which = [];
  if (await fileExists(jd_abs)) which.push('jd');
  if (await fileExists(pdf_abs)) which.push('pdf');
  ok({ exists: which.length > 0, which, jd_path: jd_rel, pdf_path: pdf_rel });
};

SUBCOMMANDS['mark-processed'] = async (args) => {
  const { url, company, role, jd, pdf, score } = args;
  if (!url || !company || !role || !jd || !pdf || score === undefined) {
    fail('mark-processed requires --url, --company, --role, --jd, --pdf, --score');
  }
  if (!/^\d+$/.test(String(score))) fail(`--score must be a non-negative integer, got: ${score}`);
  if (company.includes('|') || role.includes('|')) {
    fail('--company and --role cannot contain `|` (used as field separator in pipeline.md)');
  }
  const content = await readPipeline();
  const { lines } = parsePipelineSections(content);
  const cleaned = removeUrlLines(lines, url);
  const procesadasIdx = findSectionStart(cleaned, 'Procesadas');
  const newLine = `- [x] ${url} | ${company} | ${role} | JD ✅ | Resume ✅ | Score ${score}/100`;
  const updated = insertAtSectionEnd(cleaned, procesadasIdx, newLine);
  await writePipelineAtomic(updated.join('\n'));
  ok({});
};

SUBCOMMANDS['mark-failed'] = async (args) => {
  const { url, reason } = args;
  if (!url || !reason) fail('mark-failed requires --url and --reason');
  const content = await readPipeline();
  const { lines } = parsePipelineSections(content);
  const cleaned = removeUrlLines(lines, url);
  const pendientesIdx = findSectionStart(cleaned, 'Pendientes');
  const newLine = `- [!] ${url} — reason: ${sanitizeReason(reason)}`;
  const updated = insertAtSectionEnd(cleaned, pendientesIdx, newLine);
  await writePipelineAtomic(updated.join('\n'));
  ok({});
};

SUBCOMMANDS['mark-skipped'] = async (args) => {
  const { url, reason } = args;
  if (!url || !reason) fail('mark-skipped requires --url and --reason');
  const content = await readPipeline();
  const { lines } = parsePipelineSections(content);
  const cleaned = removeUrlLines(lines, url);
  const procesadasIdx = findSectionStart(cleaned, 'Procesadas');
  const newLine = `- [~] ${url} — skipped: ${sanitizeReason(reason)}`;
  const updated = insertAtSectionEnd(cleaned, procesadasIdx, newLine);
  await writePipelineAtomic(updated.join('\n'));
  ok({});
};

// === log subcommand ===
const ALLOWED_LOG_STATUSES = new Set(['ok', 'fail', 'skip']);

SUBCOMMANDS['log'] = async (args) => {
  const { status, url } = args;
  if (!status) fail('log requires --status');
  if (!ALLOWED_LOG_STATUSES.has(status)) fail('status must be ok|fail|skip');
  if (!url) fail('log requires --url');

  const payload = { timestamp: new Date().toISOString(), status, url };
  const optionalKeys = ['slug', 'score', 'jd', 'pdf', 'reason'];
  for (const k of optionalKeys) {
    if (k === 'reason' && args[k] !== undefined) payload[k] = sanitizeReason(args[k]);
    else if (args[k] !== undefined) payload[k] = args[k];
  }

  const logPath = runsLogPath();
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, JSON.stringify(payload) + '\n');
  ok({});
};

SUBCOMMANDS['compile-resume'] = async (args) => {
  const tex = args.tex;
  const pdf = args.pdf;
  if (!tex || !pdf) fail('compile-resume requires --tex and --pdf');
  const texAbs = resolve(projectRoot(), tex);
  const pdfAbs = resolve(projectRoot(), pdf);
  if (!(await fileExists(texAbs))) fail(`tex file not found: ${tex}`);
  await mkdir(dirname(pdfAbs), { recursive: true });
  // tectonic --keep-logs drops <texBasename>.log next to the PDF; resumes/ must hold only the PDF.
  const strayLog = resolve(dirname(pdfAbs), basename(texAbs, '.tex') + '.log');
  try {
    const { stdout, stderr } = await execFileP('node', [pdfGeneratorPath(), texAbs, pdfAbs], { timeout: 120000 });
    const combined = ((stdout || '') + (stderr || '')).split('\n').slice(-10).join('\n');
    if (!(await fileExists(pdfAbs))) {
      fail('compile produced no PDF', { tectonic_log_tail: combined });
    }
    await unlink(strayLog).catch(() => {});
    ok({ pdf_path: pdf, tectonic_log_tail: combined });
  } catch (e) {
    const combined = ((e.stdout || '') + (e.stderr || '')).split('\n').slice(-15).join('\n');
    await unlink(strayLog).catch(() => {});
    fail(`tectonic exit ${e.code ?? '?'}: ${e.message}`, { tectonic_log_tail: combined });
  }
};

// === Dispatcher (CLI mode only) ===
async function main() {
  const subcommand = process.argv[2];
  if (!subcommand) {
    fail('unknown subcommand: <none>. usage: node yash-resume-pipeline.mjs <subcommand> [--flags]');
  }
  const handler = SUBCOMMANDS[subcommand];
  if (!handler) {
    fail(`unknown subcommand: ${subcommand}`);
  }
  const args = parseArgs(process.argv.slice(3));
  await handler(args);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => fail(`unexpected: ${e.message}`));
}
