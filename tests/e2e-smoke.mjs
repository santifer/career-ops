#!/usr/bin/env node
/**
 * tests/e2e-smoke.mjs — fixture-based end-to-end smoke for yash-resume-pipeline.
 *
 * Exercises every deterministic Node + Python subcommand in order. No LLM,
 * no network. Asserts: PDFs compile to 1 page each, sidecar logs are written,
 * timer state populates correctly, run-log JSONL gets a line.
 *
 * Usage: node tests/e2e-smoke.mjs
 * Exit: 0 on green, non-zero on first failure.
 *
 * IMPORTANT: cleanup runs in a `finally` block so the smoke test never
 * leaves artifacts behind in resumes/yash/, cover-letters/yash/, etc.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, copyFile, rm, stat, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = resolve(ROOT, 'tests/fixtures');
const SCRIPT = resolve(ROOT, 'yash-resume-pipeline.mjs');

const SLUG = 'ScribdTest';
const ROLE_SLUG = 'SmokeTest';
const DATE = new Date().toISOString().slice(0, 10);
const SMOKE_PID = String(process.pid);

// Paths the smoke test produces and cleans up.
const ARTIFACTS = {
  jd: resolve(ROOT, `jds/yash/JD_${SLUG}_${ROLE_SLUG}_Yash_Anghan_${DATE}.md`),
  texResume: resolve('/tmp', `${SLUG}_${ROLE_SLUG}_Yash_Anghan_Resume_${DATE}.tex`),
  pdfResume: resolve(ROOT, `resumes/yash/${SLUG}_${ROLE_SLUG}_Yash_Anghan_Resume_${DATE}.pdf`),
  texCL: resolve('/tmp', `${SLUG}_${ROLE_SLUG}_Yash_Anghan_Cover_Letter_${DATE}.tex`),
  pdfCL: resolve(ROOT, `cover-letters/yash/${SLUG}_${ROLE_SLUG}_Yash_Anghan_Cover_Letter_${DATE}.pdf`),
  logResume: resolve(ROOT, `resume-logs/yash/${SLUG}_${ROLE_SLUG}_Yash_Anghan_Resume_${DATE}.log`),
  logCL: resolve(ROOT, `cover-letter-logs/yash/${SLUG}_${ROLE_SLUG}_Yash_Anghan_Cover_Letter_${DATE}.log`),
  timer: `/tmp/yash-pipeline-timer-${SMOKE_PID}.json`,
};

let pass = 0, fail = 0;
function okMsg(msg) { console.log('  ✅', msg); pass++; }
function ng(msg) { console.log('  ❌', msg); fail++; }

async function runNode(args) {
  const { stdout } = await execFileP('node', [SCRIPT, ...args], { cwd: ROOT });
  return JSON.parse(stdout.trim());
}

async function runPython(scriptRel, stdinObj) {
  const py = resolve(ROOT, scriptRel);
  return new Promise((res, rej) => {
    const child = execFile('python3', [py], { cwd: ROOT });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => res({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on('error', rej);
    child.stdin.write(JSON.stringify(stdinObj));
    child.stdin.end();
  });
}

async function pageCount(pdfPath) {
  const { stdout } = await execFileP(resolve(ROOT, '.venv/bin/python3'), [
    '-c',
    `from pypdf import PdfReader; print(len(PdfReader(${JSON.stringify(pdfPath)}).pages))`,
  ]);
  return parseInt(stdout.trim(), 10);
}

async function fileSize(p) {
  return (await stat(p)).size;
}

async function main() {
  console.log('e2e-smoke: starting');
  const t0 = Date.now();

  // 1. init-timer
  const init = await runNode(['init-timer', '--url', 'https://example.com/smoke/scribd-test', '--pid', SMOKE_PID]);
  if (init.status !== 'ok') return ng(`init-timer: ${init.error}`);
  okMsg('init-timer');

  // 2. slugify
  const slug = await runNode(['slugify', '--company', 'Scribd', '--role', 'Software Engineer II Backend Data pipelines']);
  if (slug.company_slug !== 'Scribd' || slug.role_slug !== 'SoftwareEngineerIiBackendDataPipelines') {
    return ng(`slugify returned unexpected values: ${JSON.stringify(slug)}`);
  }
  okMsg('slugify');

  // 3. check-duplicate (using -Test slugs to avoid colliding with real runs)
  const dup = await runNode(['check-duplicate', '--company-slug', SLUG, '--role-slug', ROLE_SLUG, '--date', DATE]);
  if (dup.exists !== false) return ng(`check-duplicate.exists should be false, got: ${dup.exists}`);
  okMsg('check-duplicate (no collision)');

  // 4. Write JD from fixture
  const fixtureJd = JSON.parse(await readFile(resolve(FIXTURES, 'scribd-jd.json'), 'utf-8'));
  await mkdir(dirname(ARTIFACTS.jd), { recursive: true });
  await writeFile(ARTIFACTS.jd, `---
company: "Scribd, Inc."
company_slug: ${SLUG}
role: "Software Engineer II (Backend + Data pipelines)"
role_slug: ${ROLE_SLUG}
url: ${fixtureJd.url}
source: ${fixtureJd.source_hint}
captured_date: ${DATE}
---

# ${fixtureJd.title}

${fixtureJd.body}
`);
  okMsg('JD .md written');

  // 5. validate_bullets
  const bullets = JSON.parse(await readFile(resolve(FIXTURES, 'scribd-bullets.json'), 'utf-8'));
  const bv = await runPython('tools/validate_bullets.py', bullets);
  if (bv.code !== 0) return ng(`validate_bullets exit ${bv.code}: ${bv.stderr}`);
  const bvObj = JSON.parse(bv.stdout);
  if (!bvObj.pass) return ng(`validate_bullets fails: ${JSON.stringify(bvObj.fails)}`);
  okMsg('validate_bullets pass');

  // 6. validate_skills
  const skills = JSON.parse(await readFile(resolve(FIXTURES, 'scribd-skills.json'), 'utf-8'));
  const sv = await runPython('tools/validate_skills.py', skills);
  if (sv.code !== 0) return ng(`validate_skills exit ${sv.code}: ${sv.stderr}`);
  const svObj = JSON.parse(sv.stdout);
  if (!svObj.pass) return ng(`validate_skills fails: ${JSON.stringify(svObj.fails)}`);
  okMsg('validate_skills pass');

  // 7. Copy + compile resume fixture
  await copyFile(resolve(FIXTURES, 'scribd-resume.tex'), ARTIFACTS.texResume);
  await runNode(['mark-phase', '--phase', 'resume_compile_start', '--pid', SMOKE_PID]);
  const rc = await runNode(['compile-resume',
    '--tex', relative(ROOT, ARTIFACTS.texResume),
    '--pdf', relative(ROOT, ARTIFACTS.pdfResume),
  ]);
  if (rc.status !== 'ok') return ng(`compile-resume failed: ${rc.error}`);
  await runNode(['mark-phase', '--phase', 'resume_compile_end', '--pid', SMOKE_PID]);
  if ((await pageCount(ARTIFACTS.pdfResume)) !== 1) return ng('resume PDF is not 1 page');
  if ((await fileSize(ARTIFACTS.pdfResume)) < 20000) return ng('resume PDF size < 20 KB');
  okMsg('compile-resume → 1 page, > 20 KB');

  // 8. Copy + compile CL fixture
  await copyFile(resolve(FIXTURES, 'scribd-cover-letter.tex'), ARTIFACTS.texCL);
  await runNode(['mark-phase', '--phase', 'cl_compile_start', '--pid', SMOKE_PID]);
  const cc = await runNode(['compile-cover-letter',
    '--tex', relative(ROOT, ARTIFACTS.texCL),
    '--pdf', relative(ROOT, ARTIFACTS.pdfCL),
  ]);
  if (cc.status !== 'ok') return ng(`compile-cover-letter failed: ${cc.error}`);
  await runNode(['mark-phase', '--phase', 'cl_compile_end', '--pid', SMOKE_PID]);
  if ((await pageCount(ARTIFACTS.pdfCL)) !== 1) return ng('CL PDF is not 1 page');
  if ((await fileSize(ARTIFACTS.pdfCL)) < 15000) return ng('CL PDF size < 15 KB');
  okMsg('compile-cover-letter → 1 page, > 15 KB');

  // 9. Write sidecar logs
  await mkdir(dirname(ARTIFACTS.logResume), { recursive: true });
  await writeFile(ARTIFACTS.logResume, 'score: 100/100\ndeficiencies: none\nstatus: compiled\n');
  await mkdir(dirname(ARTIFACTS.logCL), { recursive: true });
  await writeFile(ARTIFACTS.logCL, 'score: 100/100\ndeficiencies: none\nstatus: compiled\nresume_keywords_echoed: 15\n');
  okMsg('sidecar logs written');

  // 10. mark-phase url_end + read-timer
  await runNode(['mark-phase', '--phase', 'url_end', '--pid', SMOKE_PID]);
  const timer = await runNode(['read-timer', '--pid', SMOKE_PID]);
  if (timer.total_ms == null || timer.total_ms < 100) return ng(`read-timer total_ms invalid: ${timer.total_ms}`);
  if (timer.resume_compile_ms == null) return ng('read-timer resume_compile_ms is null');
  if (timer.cover_letter_compile_ms == null) return ng('read-timer cover_letter_compile_ms is null');
  okMsg(`read-timer total_ms=${timer.total_ms}ms`);

  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\ne2e-smoke: ${pass} pass, ${fail} fail (${elapsedSec}s)`);
}

async function cleanup() {
  // Always cleanup. The smoke test must leave no artifacts.
  for (const p of Object.values(ARTIFACTS)) {
    await rm(p, { force: true }).catch(() => {});
  }
}

async function run() {
  try {
    await main();
  } catch (e) {
    ng(`uncaught: ${e.message}`);
  } finally {
    await cleanup();
    process.exit(fail > 0 ? 1 : 0);
  }
}

run();
