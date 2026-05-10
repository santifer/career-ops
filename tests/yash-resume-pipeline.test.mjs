import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdtemp, rm, writeFile as writeFileTest, mkdir as mkdirTest, readFile as readFileTest, copyFile, stat as statTest } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseArgs,
  slugify,
  buildCoverLetterTexPath,
  buildCoverLetterPdfPath,
  buildCoverLetterLogPath,
} from '../yash-resume-pipeline.mjs';

async function makeTempPipelineFile(content) {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  await writeFileTest(join(dir, 'data/yash-pipeline.md'), content);
  return dir;
}

const execFileP = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = resolve(ROOT, 'yash-resume-pipeline.mjs');

async function runScript(args) {
  try {
    const { stdout, stderr } = await execFileP('node', [SCRIPT, ...args], { cwd: ROOT });
    return { code: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return { code: e.code ?? 1, stdout: (e.stdout ?? '').trim(), stderr: (e.stderr ?? '').trim() };
  }
}

test('dispatcher: no subcommand returns fail JSON with usage', async () => {
  const { code, stdout } = await runScript([]);
  assert.equal(code, 1);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'fail');
  assert.match(obj.error, /unknown subcommand|usage/i);
});

test('dispatcher: unknown subcommand returns fail JSON', async () => {
  const { code, stdout } = await runScript(['bogus-command']);
  assert.equal(code, 1);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'fail');
  assert.match(obj.error, /unknown subcommand: bogus-command/);
});

test('parseArgs: --key=value style returns { key: "value" }', () => {
  const result = parseArgs(['--key=value']);
  assert.deepEqual(result, { key: 'value' });
});

test('parseArgs: mixed = and space styles', () => {
  const result = parseArgs(['--name=John Doe', '--count', '5']);
  assert.deepEqual(result, { name: 'John Doe', count: '5' });
});

test('parseArgs: bare flag preceding = flag', () => {
  const result = parseArgs(['--flag', '--key=value']);
  assert.deepEqual(result, { flag: true, key: 'value' });
});

test('slugify: simple two-word company', () => {
  assert.equal(slugify('Anthropic, PBC'), 'AnthropicPbc');
});

test('slugify: complex role with slashes and parens', () => {
  assert.equal(slugify('Senior AI/ML Engineer (Remote)'), 'SeniorAiMlEngineer');
});

test('slugify: hyphenated lowercase', () => {
  assert.equal(slugify('Open-AI'), 'OpenAi');
});

test('slugify: single-letter all-caps tokens stay capitalized', () => {
  assert.equal(slugify('M&A Research Lead'), 'MAResearchLead');
});

test('slugify: collapses runs of whitespace', () => {
  assert.equal(slugify('   spaces   here   '), 'SpacesHere');
});

test('slugify: leading number preserved', () => {
  assert.equal(slugify('42 Watt Studios'), '42WattStudios');
});

test('slugify: emoji and unicode stripped as non-alnum', () => {
  assert.equal(slugify('🦾 Robotics Inc'), 'RoboticsInc');
});

test('slugify: empty string returns empty', () => {
  assert.equal(slugify(''), '');
});

test('slugify CLI: returns ok JSON with company_slug, role_slug, date', async () => {
  const { code, stdout } = await runScript([
    'slugify',
    '--company', 'Anthropic, PBC',
    '--role', 'Senior AI/ML Engineer (Remote)',
  ]);
  assert.equal(code, 0);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'ok');
  assert.equal(obj.company_slug, 'AnthropicPbc');
  assert.equal(obj.role_slug, 'SeniorAiMlEngineer');
  assert.match(obj.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('slugify CLI: empty company returns fail', async () => {
  const { code, stdout } = await runScript([
    'slugify', '--company', '   ', '--role', 'Engineer',
  ]);
  assert.equal(code, 1);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'fail');
  assert.match(obj.error, /empty.*company.*slug/i);
});

test('slugify CLI: missing --company flag returns fail', async () => {
  const { code, stdout } = await runScript(['slugify', '--role', 'Engineer']);
  assert.equal(code, 1);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'fail');
  assert.match(obj.error, /empty.*company.*slug/i);
});

test('next-pending: returns first `- [ ] <url>` line', async () => {
  const dir = await makeTempPipelineFile(`# Job Pipeline

## Pendientes

- [ ] https://jobs.lever.co/openai/abc-123
- [ ] https://boards.greenhouse.io/anthropic/jobs/4567

## Procesadas

- [x] https://done.example.com | Acme | PM | JD ✅ | Resume ✅ | Score 91/100
`);
  try {
    const { stdout } = await execFileP('node', [SCRIPT, 'next-pending'], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.status, 'ok');
    assert.equal(obj.url, 'https://jobs.lever.co/openai/abc-123');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('next-pending: skips `- [!]` and `- [x]` lines', async () => {
  const dir = await makeTempPipelineFile(`## Pendientes

- [!] https://failed.example.com — reason: 404
- [x] https://done.example.com
- [ ] https://still-pending.example.com
`);
  try {
    const { stdout } = await execFileP('node', [SCRIPT, 'next-pending'], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.url, 'https://still-pending.example.com');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('next-pending: empty queue returns status=empty', async () => {
  const dir = await makeTempPipelineFile(`## Pendientes

- [!] https://stuck.example.com — reason: auth required

## Procesadas

- [x] https://done.example.com
`);
  try {
    const { stdout } = await execFileP('node', [SCRIPT, 'next-pending'], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.status, 'empty');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('next-pending: missing pipeline.md returns fail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  try {
    let code = 0, stdout = '';
    try {
      const r = await execFileP('node', [SCRIPT, 'next-pending'], { cwd: dir });
      stdout = r.stdout.trim();
    } catch (e) {
      code = e.code ?? 1;
      stdout = (e.stdout ?? '').trim();
    }
    assert.equal(code, 1);
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /yash-pipeline\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('next-pending: handles Windows \\r\\n line endings', async () => {
  const content = `## Pendientes\r\n\r\n- [ ] https://crlf.example.com\r\n`;
  const dir = await makeTempPipelineFile(content);
  try {
    const { stdout } = await execFileP('node', [SCRIPT, 'next-pending'], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.status, 'ok');
    assert.equal(obj.url, 'https://crlf.example.com');  // no trailing \r
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('check-duplicate: neither file exists → exists=false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'jds/yash'), { recursive: true });
  await mkdirTest(join(dir, 'resumes/yash'), { recursive: true });
  try {
    const { stdout } = await execFileP('node', [SCRIPT,
      'check-duplicate',
      '--company-slug', 'AcmeInc',
      '--role-slug', 'Engineer',
      '--date', '2026-05-07',
    ], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.status, 'ok');
    assert.equal(obj.exists, false);
    assert.equal(obj.jd_path, 'jds/yash/JD_AcmeInc_Engineer_Yash_Anghan_2026-05-07.md');
    assert.equal(obj.pdf_path, 'resumes/yash/AcmeInc_Engineer_Yash_Anghan_Resume_2026-05-07.pdf');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('check-duplicate: only JD exists → exists=true, which=[jd]', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'jds/yash'), { recursive: true });
  await mkdirTest(join(dir, 'resumes/yash'), { recursive: true });
  await writeFileTest(join(dir, 'jds/yash/JD_AcmeInc_Engineer_Yash_Anghan_2026-05-07.md'), 'x');
  try {
    const { stdout } = await execFileP('node', [SCRIPT,
      'check-duplicate',
      '--company-slug', 'AcmeInc',
      '--role-slug', 'Engineer',
      '--date', '2026-05-07',
    ], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.exists, true);
    assert.deepEqual(obj.which, ['jd']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('check-duplicate: both exist → exists=true, which=[jd,pdf]', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'jds/yash'), { recursive: true });
  await mkdirTest(join(dir, 'resumes/yash'), { recursive: true });
  await writeFileTest(join(dir, 'jds/yash/JD_AcmeInc_Engineer_Yash_Anghan_2026-05-07.md'), 'x');
  await writeFileTest(join(dir, 'resumes/yash/AcmeInc_Engineer_Yash_Anghan_Resume_2026-05-07.pdf'), 'x');
  try {
    const { stdout } = await execFileP('node', [SCRIPT,
      'check-duplicate',
      '--company-slug', 'AcmeInc',
      '--role-slug', 'Engineer',
      '--date', '2026-05-07',
    ], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.exists, true);
    assert.deepEqual(obj.which.sort(), ['jd', 'pdf']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('check-duplicate: PDF-only exists → exists=true, which=[pdf]', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'jds/yash'), { recursive: true });
  await mkdirTest(join(dir, 'resumes/yash'), { recursive: true });
  await writeFileTest(join(dir, 'resumes/yash/AcmeInc_Engineer_Yash_Anghan_Resume_2026-05-07.pdf'), 'x');
  try {
    const { stdout } = await execFileP('node', [SCRIPT,
      'check-duplicate',
      '--company-slug', 'AcmeInc',
      '--role-slug', 'Engineer',
      '--date', '2026-05-07',
    ], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.exists, true);
    assert.deepEqual(obj.which, ['pdf']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('check-duplicate: directory at JD path is NOT treated as JD existing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'jds/yash'), { recursive: true });
  await mkdirTest(join(dir, 'resumes/yash'), { recursive: true });
  // Create a directory (not a file) at the expected JD path
  await mkdirTest(join(dir, 'jds/yash/JD_AcmeInc_Engineer_Yash_Anghan_2026-05-07.md'), { recursive: true });
  try {
    const { stdout } = await execFileP('node', [SCRIPT,
      'check-duplicate',
      '--company-slug', 'AcmeInc',
      '--role-slug', 'Engineer',
      '--date', '2026-05-07',
    ], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.exists, false);
    assert.deepEqual(obj.which, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mark-processed: moves URL from Pendientes to Procesadas with metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  await writeFileTest(join(dir, 'data/yash-pipeline.md'), `# Job Pipeline

## Pendientes

- [ ] https://jobs.lever.co/openai/abc-123

## Procesadas

`);
  try {
    await execFileP('node', [SCRIPT,
      'mark-processed',
      '--url', 'https://jobs.lever.co/openai/abc-123',
      '--company', 'OpenAI',
      '--role', 'AI Engineer',
      '--jd', 'jds/yash/JD_Openai_AiEngineer_Yash_Anghan_2026-05-07.md',
      '--pdf', 'resumes/yash/Openai_AiEngineer_Yash_Anghan_Resume_2026-05-07.pdf',
      '--score', '92',
    ], { cwd: dir });
    const result = await readFileTest(join(dir, 'data/yash-pipeline.md'), 'utf-8');
    assert.doesNotMatch(result, /- \[ \] https:\/\/jobs\.lever\.co\/openai\/abc-123/);
    assert.match(result, /- \[x\] https:\/\/jobs\.lever\.co\/openai\/abc-123 \| OpenAI \| AI Engineer \| JD ✅ \| Resume ✅ \| Score 92\/100/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mark-processed: idempotent — running twice does not duplicate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  await writeFileTest(join(dir, 'data/yash-pipeline.md'), `## Pendientes

- [ ] https://x.com/job

## Procesadas

`);
  const args = ['mark-processed', '--url', 'https://x.com/job', '--company', 'X', '--role', 'Eng', '--jd', 'a', '--pdf', 'b', '--score', '90'];
  try {
    await execFileP('node', [SCRIPT, ...args], { cwd: dir });
    await execFileP('node', [SCRIPT, ...args], { cwd: dir });
    const result = await readFileTest(join(dir, 'data/yash-pipeline.md'), 'utf-8');
    const occurrences = (result.match(/https:\/\/x\.com\/job/g) || []).length;
    assert.equal(occurrences, 1, 'URL should appear exactly once after two mark-processed calls');
    const sections = result.split(/^## /m);
    const procesadas = sections.find((s) => s.startsWith('Procesadas')) ?? '';
    const pendientes = sections.find((s) => s.startsWith('Pendientes')) ?? '';
    assert.match(procesadas, /https:\/\/x\.com\/job/, 'URL must be in Procesadas');
    assert.doesNotMatch(pendientes, /https:\/\/x\.com\/job/, 'URL must not still be in Pendientes');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mark-processed: rejects non-integer score', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  await writeFileTest(join(dir, 'data/yash-pipeline.md'), `## Pendientes\n\n- [ ] https://x.com/job\n\n## Procesadas\n\n`);
  try {
    let code = 0, stdout = '';
    try {
      const r = await execFileP('node', [SCRIPT, 'mark-processed',
        '--url', 'https://x.com/job', '--company', 'X', '--role', 'Eng',
        '--jd', 'a', '--pdf', 'b', '--score', 'abc'], { cwd: dir });
      stdout = r.stdout.trim();
    } catch (e) {
      code = e.code ?? 1;
      stdout = (e.stdout ?? '').trim();
    }
    assert.equal(code, 1);
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /score must be a non-negative integer/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mark-failed: changes [ ] to [!] with reason in Pendientes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  await writeFileTest(join(dir, 'data/yash-pipeline.md'), `## Pendientes\n\n- [ ] https://dead.example.com\n\n## Procesadas\n\n`);
  try {
    await execFileP('node', [SCRIPT,
      'mark-failed',
      '--url', 'https://dead.example.com',
      '--reason', '404 Not Found',
    ], { cwd: dir });
    const result = await readFileTest(join(dir, 'data/yash-pipeline.md'), 'utf-8');
    assert.match(result, /- \[!\] https:\/\/dead\.example\.com — reason: 404 Not Found/);
    assert.doesNotMatch(result, /- \[ \] https:\/\/dead\.example\.com/);
    // verify it's in Pendientes, not Procesadas
    const sections = result.split(/^## /m);
    const pendientes = sections.find((s) => s.startsWith('Pendientes')) ?? '';
    const procesadas = sections.find((s) => s.startsWith('Procesadas')) ?? '';
    assert.match(pendientes, /dead\.example\.com/);
    assert.doesNotMatch(procesadas, /dead\.example\.com/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mark-skipped: moves URL to Procesadas with [~] and skipped reason', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  await writeFileTest(join(dir, 'data/yash-pipeline.md'), `## Pendientes\n\n- [ ] https://dup.example.com\n\n## Procesadas\n\n`);
  try {
    await execFileP('node', [SCRIPT,
      'mark-skipped',
      '--url', 'https://dup.example.com',
      '--reason', 'duplicate (jd+pdf already exist)',
    ], { cwd: dir });
    const result = await readFileTest(join(dir, 'data/yash-pipeline.md'), 'utf-8');
    assert.match(result, /- \[~\] https:\/\/dup\.example\.com — skipped: duplicate \(jd\+pdf already exist\)/);
    assert.doesNotMatch(result, /- \[ \] https:\/\/dup\.example\.com/);
    // verify it's in Procesadas, not Pendientes
    const sections = result.split(/^## /m);
    const pendientes = sections.find((s) => s.startsWith('Pendientes')) ?? '';
    const procesadas = sections.find((s) => s.startsWith('Procesadas')) ?? '';
    assert.match(procesadas, /dup\.example\.com/);
    assert.doesNotMatch(pendientes, /dup\.example\.com/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mark-failed: replaces existing [!] reason in place (idempotent on URL)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  await writeFileTest(join(dir, 'data/yash-pipeline.md'), `## Pendientes\n\n- [!] https://x.com/job — reason: old reason\n\n## Procesadas\n\n`);
  try {
    await execFileP('node', [SCRIPT,
      'mark-failed', '--url', 'https://x.com/job', '--reason', 'new reason',
    ], { cwd: dir });
    const result = await readFileTest(join(dir, 'data/yash-pipeline.md'), 'utf-8');
    const occurrences = (result.match(/https:\/\/x\.com\/job/g) || []).length;
    assert.equal(occurrences, 1);
    assert.match(result, /reason: new reason/);
    assert.doesNotMatch(result, /old reason/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('log: appends one JSON line per call, creates file if missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  try {
    await execFileP('node', [SCRIPT,
      'log', '--status', 'ok', '--url', 'https://x.com/1',
      '--slug', 'X_E', '--score', '92', '--jd', 'a', '--pdf', 'b',
    ], { cwd: dir });
    await execFileP('node', [SCRIPT,
      'log', '--status', 'fail', '--url', 'https://x.com/2', '--reason', 'oops',
    ], { cwd: dir });
    const result = await readFileTest(join(dir, 'data/yash-resume-runs.log'), 'utf-8');
    const lines = result.trim().split('\n');
    assert.equal(lines.length, 2);
    const e1 = JSON.parse(lines[0]);
    const e2 = JSON.parse(lines[1]);
    assert.equal(e1.status, 'ok');
    assert.equal(e1.url, 'https://x.com/1');
    assert.equal(e1.score, '92');
    assert.match(e1.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(e2.status, 'fail');
    assert.equal(e2.reason, 'oops');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('log: rejects unknown status', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  try {
    let code = 0, stdout = '';
    try {
      const r = await execFileP('node', [SCRIPT,
        'log', '--status', 'wat', '--url', 'https://x.com',
      ], { cwd: dir });
      stdout = r.stdout.trim();
    } catch (e) {
      code = e.code ?? 1;
      stdout = (e.stdout ?? '').trim();
    }
    assert.equal(code, 1);
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /status must be ok\|fail\|skip/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('log: creates data directory if missing', async () => {
  // Test that mkdir -p the data/ dir if it doesn't already exist
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  // intentionally NOT creating data/
  try {
    await execFileP('node', [SCRIPT,
      'log', '--status', 'skip', '--url', 'https://x.com/3', '--reason', 'dup',
    ], { cwd: dir });
    const result = await readFileTest(join(dir, 'data/yash-resume-runs.log'), 'utf-8');
    const entry = JSON.parse(result.trim());
    assert.equal(entry.status, 'skip');
    assert.equal(entry.url, 'https://x.com/3');
    assert.equal(entry.reason, 'dup');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('compile-resume: good .tex produces a real PDF', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'resumes'), { recursive: true });
  await copyFile(resolve(ROOT, 'tests/fixtures/sample-good.tex'), join(dir, 'resumes/test.tex'));
  await copyFile(resolve(ROOT, 'generate-pdf-latex.mjs'), join(dir, 'generate-pdf-latex.mjs'));
  try {
    const { stdout } = await execFileP('node', [SCRIPT,
      'compile-resume', '--tex', 'resumes/test.tex', '--pdf', 'resumes/test.pdf',
    ], { cwd: dir, timeout: 60000 });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.status, 'ok');
    assert.equal(obj.pdf_path, 'resumes/test.pdf');
    const st = await statTest(join(dir, 'resumes/test.pdf'));
    assert.ok(st.size > 100, 'PDF should be non-trivial size');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('compile-resume: bad .tex returns fail with tectonic_log_tail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'resumes'), { recursive: true });
  await copyFile(resolve(ROOT, 'tests/fixtures/sample-bad.tex'), join(dir, 'resumes/bad.tex'));
  await copyFile(resolve(ROOT, 'generate-pdf-latex.mjs'), join(dir, 'generate-pdf-latex.mjs'));
  try {
    let code = 0, stdout = '';
    try {
      const r = await execFileP('node', [SCRIPT,
        'compile-resume', '--tex', 'resumes/bad.tex', '--pdf', 'resumes/bad.pdf',
      ], { cwd: dir, timeout: 60000 });
      stdout = r.stdout.trim();
    } catch (e) {
      code = e.code ?? 1;
      stdout = (e.stdout ?? '').trim();
    }
    assert.equal(code, 1);
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /tectonic|exit/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('compile-resume: missing tex file returns fail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'resumes'), { recursive: true });
  await copyFile(resolve(ROOT, 'generate-pdf-latex.mjs'), join(dir, 'generate-pdf-latex.mjs'));
  try {
    let code = 0, stdout = '';
    try {
      const r = await execFileP('node', [SCRIPT,
        'compile-resume', '--tex', 'resumes/nonexistent.tex', '--pdf', 'resumes/x.pdf',
      ], { cwd: dir, timeout: 30000 });
      stdout = r.stdout.trim();
    } catch (e) {
      code = e.code ?? 1;
      stdout = (e.stdout ?? '').trim();
    }
    assert.equal(code, 1);
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /tex file not found/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mark-failed: sanitizes multiline reason to single line', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  await writeFileTest(join(dir, 'data/yash-pipeline.md'), `## Pendientes\n\n- [ ] https://x.com/job\n\n## Procesadas\n\n`);
  try {
    await execFileP('node', [SCRIPT,
      'mark-failed', '--url', 'https://x.com/job', '--reason', 'line one\nline two\r\nline three',
    ], { cwd: dir });
    const result = await readFileTest(join(dir, 'data/yash-pipeline.md'), 'utf-8');
    assert.match(result, /- \[!\] https:\/\/x\.com\/job — reason: line one line two line three/);
    assert.doesNotMatch(result, /- \[!\] https:\/\/x\.com\/job — reason: line one\n/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mark-processed: rejects pipe character in company name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  await writeFileTest(join(dir, 'data/yash-pipeline.md'), `## Pendientes\n\n- [ ] https://x.com/job\n\n## Procesadas\n\n`);
  try {
    let code = 0, stdout = '';
    try {
      const r = await execFileP('node', [SCRIPT,
        'mark-processed', '--url', 'https://x.com/job', '--company', 'Acme | Co', '--role', 'Eng',
        '--jd', 'a', '--pdf', 'b', '--score', '90'], { cwd: dir });
      stdout = r.stdout.trim();
    } catch (e) {
      code = e.code ?? 1;
      stdout = (e.stdout ?? '').trim();
    }
    assert.equal(code, 1);
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /cannot contain `\|`/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('compile-resume: works when invoked from non-project-root cwd', async () => {
  // The pdfGeneratorPath should anchor to ROOT (script location), not cwd.
  // This test invokes the script from /tmp and confirms it can find generate-pdf-latex.mjs.
  const dir = await mkdtemp(join(tmpdir(), 'yrp-cwd-test-'));
  await mkdirTest(join(dir, 'resumes'), { recursive: true });
  // Note: NO copy of generate-pdf-latex.mjs into dir — it should resolve via the script's ROOT.
  await copyFile(resolve(ROOT, 'tests/fixtures/sample-good.tex'), join(dir, 'resumes/test.tex'));
  try {
    const { stdout } = await execFileP('node', [SCRIPT,
      'compile-resume', '--tex', 'resumes/test.tex', '--pdf', 'resumes/test.pdf',
    ], { cwd: dir, timeout: 60000 });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.status, 'ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('compile-cover-letter: good .tex produces a real PDF', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'cover-letters'), { recursive: true });
  await copyFile(resolve(ROOT, 'tests/fixtures/cover-letter-good.tex'), join(dir, 'cover-letters/test.tex'));
  await copyFile(resolve(ROOT, 'generate-pdf-latex.mjs'), join(dir, 'generate-pdf-latex.mjs'));
  try {
    const { stdout } = await execFileP('node', [SCRIPT,
      'compile-cover-letter', '--tex', 'cover-letters/test.tex', '--pdf', 'cover-letters/test.pdf',
    ], { cwd: dir, timeout: 60000 });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.status, 'ok');
    assert.equal(obj.pdf_path, 'cover-letters/test.pdf');
    const st = await statTest(join(dir, 'cover-letters/test.pdf'));
    assert.ok(st.size > 100, 'PDF should be non-trivial size');
    // Stray-.log cleanup parity with compile-resume:
    let strayLogStillExists = false;
    try {
      await statTest(join(dir, 'cover-letters/test.log'));
      strayLogStillExists = true;
    } catch {}
    assert.equal(strayLogStillExists, false, 'Tectonic .log must be cleaned from cover-letters/');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('compile-cover-letter: bad .tex returns fail and still cleans up stray .log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'cover-letters'), { recursive: true });
  await copyFile(resolve(ROOT, 'tests/fixtures/cover-letter-bad.tex'), join(dir, 'cover-letters/bad.tex'));
  await copyFile(resolve(ROOT, 'generate-pdf-latex.mjs'), join(dir, 'generate-pdf-latex.mjs'));
  try {
    let code = 0, stdout = '';
    try {
      const r = await execFileP('node', [SCRIPT,
        'compile-cover-letter', '--tex', 'cover-letters/bad.tex', '--pdf', 'cover-letters/bad.pdf',
      ], { cwd: dir, timeout: 60000 });
      stdout = r.stdout.trim();
    } catch (e) {
      code = e.code ?? 1;
      stdout = (e.stdout ?? '').trim();
    }
    assert.equal(code, 1);
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /tectonic|exit/i);
    // Failure-path cleanup:
    let strayLogStillExists = false;
    try {
      await statTest(join(dir, 'cover-letters/bad.log'));
      strayLogStillExists = true;
    } catch {}
    assert.equal(strayLogStillExists, false, 'Stray .log must be cleaned even on tectonic failure');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('compile-cover-letter: missing tex file returns fail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'cover-letters'), { recursive: true });
  await copyFile(resolve(ROOT, 'generate-pdf-latex.mjs'), join(dir, 'generate-pdf-latex.mjs'));
  try {
    let code = 0, stdout = '';
    try {
      const r = await execFileP('node', [SCRIPT,
        'compile-cover-letter', '--tex', 'cover-letters/nonexistent.tex', '--pdf', 'cover-letters/x.pdf',
      ], { cwd: dir, timeout: 30000 });
      stdout = r.stdout.trim();
    } catch (e) {
      code = e.code ?? 1;
      stdout = (e.stdout ?? '').trim();
    }
    assert.equal(code, 1);
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /tex file not found/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildCoverLetterTexPath: returns /tmp/<slug>_Cover_Letter_<date>.tex', () => {
  const result = buildCoverLetterTexPath('LeagueInc', 'SeniorAiEngineer', '2026-05-08');
  assert.equal(result, '/tmp/LeagueInc_SeniorAiEngineer_Yash_Anghan_Cover_Letter_2026-05-08.tex');
});

test('buildCoverLetterPdfPath: returns cover-letters/yash/<slug>_Cover_Letter_<date>.pdf', () => {
  const result = buildCoverLetterPdfPath('LeagueInc', 'SeniorAiEngineer', '2026-05-08');
  assert.equal(result, 'cover-letters/yash/LeagueInc_SeniorAiEngineer_Yash_Anghan_Cover_Letter_2026-05-08.pdf');
});

test('buildCoverLetterLogPath: returns cover-letter-logs/yash/<slug>_Cover_Letter_<date>.log', () => {
  const result = buildCoverLetterLogPath('LeagueInc', 'SeniorAiEngineer', '2026-05-08');
  assert.equal(result, 'cover-letter-logs/yash/LeagueInc_SeniorAiEngineer_Yash_Anghan_Cover_Letter_2026-05-08.log');
});

test('mark-processed: with --cover-letter and --cover-letter-status appends cl: and cl-status: fields', async () => {
  const dir = await makeTempPipelineFile([
    '## Pendientes',
    '- [ ] https://example.com/job',
    '## Procesadas',
  ].join('\n'));
  try {
    await execFileP('node', [SCRIPT,
      'mark-processed',
      '--url', 'https://example.com/job',
      '--company', 'Acme',
      '--role', 'AI Engineer',
      '--jd', 'jds/yash/JD_Acme_AiEngineer_Yash_Anghan_2026-05-08.md',
      '--pdf', 'resumes/yash/Acme_AiEngineer_Yash_Anghan_Resume_2026-05-08.pdf',
      '--score', '95',
      '--cover-letter', 'cover-letters/yash/Acme_AiEngineer_Yash_Anghan_Cover_Letter_2026-05-08.pdf',
      '--cover-letter-status', 'ok',
    ], { cwd: dir });
    const content = await readFileTest(join(dir, 'data/yash-pipeline.md'), 'utf-8');
    assert.match(content, /- \[x\] https:\/\/example\.com\/job/);
    assert.match(content, /CL ✅/);
    assert.match(content, /cover-letters\/yash\/Acme_AiEngineer_Yash_Anghan_Cover_Letter_2026-05-08\.pdf/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mark-processed: without --cover-letter omits cl: fields (backward compat)', async () => {
  const dir = await makeTempPipelineFile([
    '## Pendientes',
    '- [ ] https://example.com/job',
    '## Procesadas',
  ].join('\n'));
  try {
    await execFileP('node', [SCRIPT,
      'mark-processed',
      '--url', 'https://example.com/job',
      '--company', 'Acme',
      '--role', 'Engineer',
      '--jd', 'a',
      '--pdf', 'b',
      '--score', '90',
    ], { cwd: dir });
    const content = await readFileTest(join(dir, 'data/yash-pipeline.md'), 'utf-8');
    assert.match(content, /- \[x\] https:\/\/example\.com\/job/);
    assert.doesNotMatch(content, /CL ✅|CL ❌|cl-status/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('log: with --cover-letter and --cover-letter-score and --cover-letter-status records all three fields', async () => {
  const dir = await makeTempPipelineFile('## Pendientes\n## Procesadas\n');
  try {
    await execFileP('node', [SCRIPT,
      'log',
      '--status', 'ok',
      '--url', 'https://example.com/job',
      '--cover-letter', 'cover-letters/yash/x_y_Yash_Anghan_Cover_Letter_2026-05-08.pdf',
      '--cover-letter-score', '95',
      '--cover-letter-status', 'ok',
    ], { cwd: dir });
    const content = await readFileTest(join(dir, 'data/yash-resume-runs.log'), 'utf-8');
    const obj = JSON.parse(content.trim().split('\n').pop());
    assert.equal(obj.status, 'ok');
    assert.equal(obj.cover_letter_pdf, 'cover-letters/yash/x_y_Yash_Anghan_Cover_Letter_2026-05-08.pdf');
    assert.equal(obj.cover_letter_score, '95');
    assert.equal(obj.cover_letter_status, 'ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('log: without cover-letter args omits the three new fields (backward compat)', async () => {
  const dir = await makeTempPipelineFile('## Pendientes\n## Procesadas\n');
  try {
    await execFileP('node', [SCRIPT,
      'log',
      '--status', 'ok',
      '--url', 'https://example.com/job',
    ], { cwd: dir });
    const content = await readFileTest(join(dir, 'data/yash-resume-runs.log'), 'utf-8');
    const obj = JSON.parse(content.trim().split('\n').pop());
    assert.ok(!('cover_letter_pdf' in obj), 'cover_letter_pdf should be absent');
    assert.ok(!('cover_letter_score' in obj), 'cover_letter_score should be absent');
    assert.ok(!('cover_letter_status' in obj), 'cover_letter_status should be absent');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('check-duplicate: reports cover_letter_exists field', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'cover-letters/yash'), { recursive: true });
  await writeFileTest(join(dir, 'cover-letters/yash/X_Y_Yash_Anghan_Cover_Letter_2026-05-08.pdf'), '%PDF-1.4 fake');
  try {
    const { stdout } = await execFileP('node', [SCRIPT,
      'check-duplicate',
      '--company-slug', 'X',
      '--role-slug', 'Y',
      '--date', '2026-05-08',
    ], { cwd: dir });
    const obj = JSON.parse(stdout.trim());
    assert.equal(obj.status, 'ok');
    assert.equal(obj.cover_letter_exists, true);
    assert.equal(obj.cover_letter_path, 'cover-letters/yash/X_Y_Yash_Anghan_Cover_Letter_2026-05-08.pdf');
    // The dedup gate (exists/which) is unaffected by cover-letter alone:
    assert.equal(obj.exists, false, 'JD/resume duplicate gate not triggered by cover-letter alone');
    assert.deepEqual(obj.which, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
