# Cover Letter Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/yash-resume-pipeline` so each per-URL run produces a tailored cover-letter PDF in `cover-letters/` alongside the existing resume PDF, with the same anti-hallucination discipline, scoring gate, and sidecar-log layout.

**Architecture:** Sibling prompt file `cover-letter-system-based-on-jd-and-resume.md` (mirrors the V2.0 resume prompt structure). New `compile-cover-letter` orchestrator subcommand (parallel to `compile-resume`, includes the stray-`.log` cleanup we shipped today). Per-URL loop (`modes/yash-resume-pipeline.md`) gains steps 9b–12b. `mark-processed`/`log`/`check-duplicate` extended with optional cover-letter args (additive; backward compatible).

**Tech Stack:** Node.js (`yash-resume-pipeline.mjs`), tectonic (LaTeX → PDF via existing `generate-pdf-latex.mjs`, **never modified**), node:test framework, Markdown/XML for the prompt.

**Spec:** `docs/superpowers/specs/2026-05-08-cover-letter-pipeline-design.md`

**Hard rules (do not cross):**
- Never modify `resume-optimization-system-based-on-job-description.md`.
- Never modify `generate-pdf-latex.mjs`.
- Never modify `modes/pipeline.md` or `modes/auto-pipeline.md`.
- Never write `.tex` files into the repo. They live in `/tmp/` only.
- After every PDF compile, the cleanup must remove tectonic's stray `<basename>.log` from the PDF directory (parity with the resume side fix shipped earlier today).

---

## Task 1: Scaffold output directories and gitignore

**Files:**
- Create: `cover-letters/.gitkeep`
- Create: `cover-letter-logs/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Create the two `.gitkeep` placeholder files**

```bash
touch /yash-superClaudeHuman/projects/yash-ai-automation-career/cover-letters/.gitkeep
touch /yash-superClaudeHuman/projects/yash-ai-automation-career/cover-letter-logs/.gitkeep
```

- [ ] **Step 2: Read current `.gitignore` to find where the `resumes/` and `resume-logs/` rules live**

```bash
grep -n "resumes\|resume-logs" /yash-superClaudeHuman/projects/yash-ai-automation-career/.gitignore
```

Expected: lines like `resumes/*` `!resumes/.gitkeep` `resume-logs/*` `!resume-logs/.gitkeep` somewhere in the file.

- [ ] **Step 3: Append the cover-letter rules right below the resume-logs rules**

Use `Edit` tool. Locate the `resume-logs/*` block in `.gitignore` and add immediately after it:

```
cover-letters/*
!cover-letters/.gitkeep
cover-letter-logs/*
!cover-letter-logs/.gitkeep
```

- [ ] **Step 4: Verify gitignore behavior**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git check-ignore -v cover-letters/foo.pdf cover-letters/.gitkeep cover-letter-logs/bar.log cover-letter-logs/.gitkeep
```

Expected:
- `cover-letters/foo.pdf` → ignored
- `cover-letters/.gitkeep` → NOT ignored
- `cover-letter-logs/bar.log` → ignored
- `cover-letter-logs/.gitkeep` → NOT ignored

- [ ] **Step 5: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add cover-letters/.gitkeep cover-letter-logs/.gitkeep .gitignore
git commit -m "$(cat <<'EOF'
chore: scaffold cover-letters/ and cover-letter-logs/ output dirs

Mirrors the resumes/ and resume-logs/ pattern. .gitkeep placeholders
keep the dirs in git; PDFs and logs land here at runtime and are
gitignored.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add cover-letter path helpers (TDD)

**Files:**
- Modify: `yash-resume-pipeline.mjs:38-49` (add three exports next to existing `buildJdPath`/`buildPdfPath`/`buildSidecarLogPath`)
- Test: `tests/yash-resume-pipeline.test.mjs` (append to end)

- [ ] **Step 1: Add the failing tests**

Open `tests/yash-resume-pipeline.test.mjs` and find the `slugify` import line at the top:

```javascript
import { parseArgs, slugify } from '../yash-resume-pipeline.mjs';
```

Replace with:

```javascript
import {
  parseArgs,
  slugify,
  buildCoverLetterTexPath,
  buildCoverLetterPdfPath,
  buildCoverLetterLogPath,
} from '../yash-resume-pipeline.mjs';
```

Then append these tests at the end of the file:

```javascript
test('buildCoverLetterTexPath: returns /tmp/<slug>_Cover_Letter_<date>.tex', () => {
  const result = buildCoverLetterTexPath('LeagueInc', 'SeniorAiEngineer', '2026-05-08');
  assert.equal(result, '/tmp/LeagueInc_SeniorAiEngineer_Yash_Anghan_Cover_Letter_2026-05-08.tex');
});

test('buildCoverLetterPdfPath: returns cover-letters/<slug>_Cover_Letter_<date>.pdf', () => {
  const result = buildCoverLetterPdfPath('LeagueInc', 'SeniorAiEngineer', '2026-05-08');
  assert.equal(result, 'cover-letters/LeagueInc_SeniorAiEngineer_Yash_Anghan_Cover_Letter_2026-05-08.pdf');
});

test('buildCoverLetterLogPath: returns cover-letter-logs/<slug>_Cover_Letter_<date>.log', () => {
  const result = buildCoverLetterLogPath('LeagueInc', 'SeniorAiEngineer', '2026-05-08');
  assert.equal(result, 'cover-letter-logs/LeagueInc_SeniorAiEngineer_Yash_Anghan_Cover_Letter_2026-05-08.log');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "buildCoverLetter|fail|pass" | head -20
```

Expected: three tests fail with `SyntaxError: The requested module '../yash-resume-pipeline.mjs' does not provide an export named 'buildCoverLetterTexPath'` (or similar).

- [ ] **Step 3: Add the helper implementations**

Open `yash-resume-pipeline.mjs`. Find the existing `buildSidecarLogPath` block (around line 47-49):

```javascript
export function buildSidecarLogPath(company_slug, role_slug, date) {
  return `resume-logs/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.log`;
}
```

Add immediately below it:

```javascript
export function buildCoverLetterTexPath(company_slug, role_slug, date) {
  return `/tmp/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.tex`;
}
export function buildCoverLetterPdfPath(company_slug, role_slug, date) {
  return `cover-letters/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.pdf`;
}
export function buildCoverLetterLogPath(company_slug, role_slug, date) {
  return `cover-letter-logs/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.log`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "buildCoverLetter|tests passed|tests failed" | head -10
```

Expected: three `buildCoverLetter*` tests pass; total test count is 41+3 = 44 passing.

- [ ] **Step 5: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add yash-resume-pipeline.mjs tests/yash-resume-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(yash-resume-pipeline): add cover-letter path helpers

Adds buildCoverLetterTexPath/Pdf/Log functions sibling to the
existing resume helpers. .tex lives in /tmp (no-tex-on-disk),
.pdf in cover-letters/, .log in cover-letter-logs/ — matching
the resume side discipline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add cover-letter fixture files

**Files:**
- Create: `tests/fixtures/cover-letter-good.tex`
- Create: `tests/fixtures/cover-letter-bad.tex`

- [ ] **Step 1: Create `tests/fixtures/cover-letter-good.tex`**

```latex
\documentclass[letterpaper,11pt]{article}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage[hidelinks]{hyperref}
\usepackage[english]{babel}
\addtolength{\oddsidemargin}{-0.7in}
\addtolength{\evensidemargin}{-0.7in}
\addtolength{\textwidth}{1.4in}
\addtolength{\topmargin}{-0.8in}
\addtolength{\textheight}{1.6in}
\begin{document}
\begin{center}
{\Huge \scshape Yash Anghan}
\end{center}
\hfill 2026-05-08

Dear Hiring Manager,\par\vspace{6pt}
This is a fixture cover letter used by the cover-letter-pipeline tests. It exists only to prove that \texttt{compile-cover-letter} produces a real PDF from a valid \texttt{.tex} input.\par\vspace{6pt}
The body is intentionally short. It does not represent the actual cover-letter prompt output.\par\vspace{6pt}
Sincerely,\\ Yash Anghan
\end{document}
```

- [ ] **Step 2: Create `tests/fixtures/cover-letter-bad.tex`**

```latex
\documentclass[letterpaper,11pt]{article}
\begin{document}
This .tex deliberately omits \texttt{\textbackslash end\{document\}} so tectonic crashes.
This fixture asserts the failure-path stray-.log cleanup runs.
```

- [ ] **Step 3: Verify the fixtures exist and are syntactically what we expect**

```bash
ls -la /yash-superClaudeHuman/projects/yash-ai-automation-career/tests/fixtures/cover-letter-*.tex
tail -5 /yash-superClaudeHuman/projects/yash-ai-automation-career/tests/fixtures/cover-letter-good.tex
tail -3 /yash-superClaudeHuman/projects/yash-ai-automation-career/tests/fixtures/cover-letter-bad.tex
```

Expected: good fixture ends with `\end{document}`. Bad fixture does NOT end with `\end{document}`.

- [ ] **Step 4: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add tests/fixtures/cover-letter-good.tex tests/fixtures/cover-letter-bad.tex
git commit -m "$(cat <<'EOF'
test(yash-resume-pipeline): add cover-letter compile fixtures

cover-letter-good.tex compiles cleanly to a one-page PDF.
cover-letter-bad.tex deliberately omits \\end{document} so
tectonic crashes — used for the failure-path stray-.log
cleanup test in Task 4.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `compile-cover-letter` subcommand (TDD)

**Files:**
- Modify: `yash-resume-pipeline.mjs:291-310` (add `compile-cover-letter` immediately after `compile-resume`)
- Test: `tests/yash-resume-pipeline.test.mjs` (append three tests)

- [ ] **Step 1: Add the failing tests**

Append to `tests/yash-resume-pipeline.test.mjs` (after the existing `compile-resume: missing tex file returns fail` test):

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "compile-cover-letter" | head -10
```

Expected: three tests fail. The fail message will say `unknown subcommand: compile-cover-letter` for the dispatcher.

- [ ] **Step 3: Add the `compile-cover-letter` subcommand implementation**

Open `yash-resume-pipeline.mjs`. Find the `compile-resume` block (around line 291–311). Add the new block immediately after it:

```javascript
SUBCOMMANDS['compile-cover-letter'] = async (args) => {
  const tex = args.tex;
  const pdf = args.pdf;
  if (!tex || !pdf) fail('compile-cover-letter requires --tex and --pdf');
  const texAbs = resolve(projectRoot(), tex);
  const pdfAbs = resolve(projectRoot(), pdf);
  if (!(await fileExists(texAbs))) fail(`tex file not found: ${tex}`);
  await mkdir(dirname(pdfAbs), { recursive: true });
  // tectonic --keep-logs drops <texBasename>.log next to the PDF; cover-letters/ must hold only the PDF.
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "compile-cover-letter|tests passed|tests failed" | head -10
```

Expected: three `compile-cover-letter` tests pass. Total count is 44+3 = 47 passing.

- [ ] **Step 5: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add yash-resume-pipeline.mjs tests/yash-resume-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(yash-resume-pipeline): add compile-cover-letter subcommand

Direct sibling of compile-resume. Compiles /tmp .tex to PDF in
cover-letters/ via the existing generate-pdf-latex.mjs (untouched).
Includes the same tectonic --keep-logs stray-.log cleanup on both
success and failure paths so cover-letters/ stays PDF-only.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extend `mark-processed` with cover-letter args (TDD)

**Files:**
- Modify: `yash-resume-pipeline.mjs:224-240` (mark-processed handler)
- Test: `tests/yash-resume-pipeline.test.mjs` (append two tests)

- [ ] **Step 1: Add the failing tests**

Append to `tests/yash-resume-pipeline.test.mjs`:

```javascript
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
      '--jd', 'jds/JD_Acme_AiEngineer_Yash_Anghan_2026-05-08.md',
      '--pdf', 'resumes/Acme_AiEngineer_Yash_Anghan_Resume_2026-05-08.pdf',
      '--score', '95',
      '--cover-letter', 'cover-letters/Acme_AiEngineer_Yash_Anghan_Cover_Letter_2026-05-08.pdf',
      '--cover-letter-status', 'ok',
    ], { cwd: dir });
    const content = await readFileTest(join(dir, 'data/pipeline.md'), 'utf-8');
    assert.match(content, /- \[x\] https:\/\/example\.com\/job/);
    assert.match(content, /CL ✅/);
    assert.match(content, /cover-letters\/Acme_AiEngineer_Yash_Anghan_Cover_Letter_2026-05-08\.pdf/);
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
    const content = await readFileTest(join(dir, 'data/pipeline.md'), 'utf-8');
    assert.match(content, /- \[x\] https:\/\/example\.com\/job/);
    assert.doesNotMatch(content, /CL ✅|CL ❌|cl-status/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "mark-processed.*cover-letter" | head -5
```

Expected: the first test fails (no `CL ✅` in output line). The second test should already pass since it's the existing behavior.

- [ ] **Step 3: Extend the `mark-processed` handler**

In `yash-resume-pipeline.mjs`, find the `mark-processed` handler (around line 224). Replace the existing handler with:

```javascript
SUBCOMMANDS['mark-processed'] = async (args) => {
  const { url, company, role, jd, pdf, score } = args;
  if (!url || !company || !role || !jd || !pdf || score === undefined) {
    fail('mark-processed requires --url, --company, --role, --jd, --pdf, --score');
  }
  if (!/^\d+$/.test(String(score))) fail(`--score must be a non-negative integer, got: ${score}`);
  if (company.includes('|') || role.includes('|')) {
    fail('--company and --role cannot contain `|` (used as field separator in pipeline.md)');
  }
  const coverLetter = args['cover-letter'];
  const coverLetterStatus = args['cover-letter-status'];
  if (coverLetter && coverLetterStatus && !['ok', 'fail'].includes(coverLetterStatus)) {
    fail('--cover-letter-status must be ok or fail');
  }
  const content = await readPipeline();
  const { lines } = parsePipelineSections(content);
  const cleaned = removeUrlLines(lines, url);
  const procesadasIdx = findSectionStart(cleaned, 'Procesadas');
  let newLine = `- [x] ${url} | ${company} | ${role} | JD ✅ | Resume ✅ | Score ${score}/100`;
  if (coverLetter) {
    const clMark = coverLetterStatus === 'fail' ? 'CL ❌' : 'CL ✅';
    newLine += ` | ${clMark} | ${coverLetter}`;
  }
  const updated = insertAtSectionEnd(cleaned, procesadasIdx, newLine);
  await writePipelineAtomic(updated.join('\n'));
  ok({});
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "mark-processed|tests passed|tests failed" | head -10
```

Expected: both new tests pass. All earlier `mark-processed` tests still pass (additive change).

- [ ] **Step 5: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add yash-resume-pipeline.mjs tests/yash-resume-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(yash-resume-pipeline): mark-processed accepts cover-letter args

Optional --cover-letter <path> and --cover-letter-status <ok|fail>.
When provided, the Procesadas line gets CL ✅/❌ and the cover-letter
PDF path appended. When omitted, line shape is unchanged (backward
compatible with existing entries).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Extend `log` with cover-letter args (TDD)

**Files:**
- Modify: `yash-resume-pipeline.mjs:272-289` (log handler)
- Test: `tests/yash-resume-pipeline.test.mjs` (append two tests)

- [ ] **Step 1: Add the failing tests**

Append to `tests/yash-resume-pipeline.test.mjs`:

```javascript
test('log: with --cover-letter and --cover-letter-score and --cover-letter-status records all three fields', async () => {
  const dir = await makeTempPipelineFile('## Pendientes\n## Procesadas\n');
  try {
    await execFileP('node', [SCRIPT,
      'log',
      '--status', 'ok',
      '--url', 'https://example.com/job',
      '--cover-letter', 'cover-letters/x_y_Yash_Anghan_Cover_Letter_2026-05-08.pdf',
      '--cover-letter-score', '95',
      '--cover-letter-status', 'ok',
    ], { cwd: dir });
    const content = await readFileTest(join(dir, 'data/yash-resume-runs.log'), 'utf-8');
    const obj = JSON.parse(content.trim().split('\n').pop());
    assert.equal(obj.status, 'ok');
    assert.equal(obj.cover_letter_pdf, 'cover-letters/x_y_Yash_Anghan_Cover_Letter_2026-05-08.pdf');
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "log:.*cover-letter" | head -5
```

Expected: the first new test fails (cover_letter fields not in JSON output).

- [ ] **Step 3: Extend the `log` handler**

In `yash-resume-pipeline.mjs`, find the `log` handler (around line 272). Replace it with:

```javascript
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
  // Cover-letter additive fields (CLI args use kebab-case; payload keys use snake_case for parity with V2.0 patterns)
  if (args['cover-letter'] !== undefined) payload.cover_letter_pdf = args['cover-letter'];
  if (args['cover-letter-score'] !== undefined) payload.cover_letter_score = args['cover-letter-score'];
  if (args['cover-letter-status'] !== undefined) {
    if (!['ok', 'fail'].includes(args['cover-letter-status'])) {
      fail('--cover-letter-status must be ok or fail');
    }
    payload.cover_letter_status = args['cover-letter-status'];
  }

  const logPath = runsLogPath();
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, JSON.stringify(payload) + '\n');
  ok({});
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "log:.*cover-letter|tests passed|tests failed" | head -10
```

Expected: both new tests pass. All earlier `log:` tests still pass.

- [ ] **Step 5: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add yash-resume-pipeline.mjs tests/yash-resume-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(yash-resume-pipeline): log accepts cover-letter args

Optional --cover-letter, --cover-letter-score, --cover-letter-status
add cover_letter_pdf, cover_letter_score, cover_letter_status fields
to the JSONL run log. When omitted, the three keys are absent
(backward compatible with existing log lines).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Extend `check-duplicate` with `cover_letter_exists` (TDD)

**Files:**
- Modify: `yash-resume-pipeline.mjs:209-222` (check-duplicate handler)
- Test: `tests/yash-resume-pipeline.test.mjs` (append one test)

- [ ] **Step 1: Add the failing test**

Append to `tests/yash-resume-pipeline.test.mjs`:

```javascript
test('check-duplicate: reports cover_letter_exists field', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yrp-test-'));
  await mkdirTest(join(dir, 'cover-letters'), { recursive: true });
  await writeFileTest(join(dir, 'cover-letters/X_Y_Yash_Anghan_Cover_Letter_2026-05-08.pdf'), '%PDF-1.4 fake');
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
    assert.equal(obj.cover_letter_path, 'cover-letters/X_Y_Yash_Anghan_Cover_Letter_2026-05-08.pdf');
    // The dedup gate (exists/which) is unaffected by cover-letter alone:
    assert.equal(obj.exists, false, 'JD/resume duplicate gate not triggered by cover-letter alone');
    assert.deepEqual(obj.which, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "check-duplicate.*cover_letter_exists" | head -5
```

Expected: fails on `assert.equal(obj.cover_letter_exists, true)` because the field doesn't exist yet.

- [ ] **Step 3: Extend the `check-duplicate` handler**

In `yash-resume-pipeline.mjs`, find the `check-duplicate` handler (around line 209). Replace it with:

```javascript
SUBCOMMANDS['check-duplicate'] = async (args) => {
  const cs = args['company-slug'];
  const rs = args['role-slug'];
  const date = args.date;
  if (!cs || !rs || !date) fail('check-duplicate requires --company-slug, --role-slug, --date');
  const jd_rel = buildJdPath(cs, rs, date);
  const pdf_rel = buildPdfPath(cs, rs, date);
  const cl_rel = buildCoverLetterPdfPath(cs, rs, date);
  const jd_abs = resolve(projectRoot(), jd_rel);
  const pdf_abs = resolve(projectRoot(), pdf_rel);
  const cl_abs = resolve(projectRoot(), cl_rel);
  const which = [];
  if (await fileExists(jd_abs)) which.push('jd');
  if (await fileExists(pdf_abs)) which.push('pdf');
  // Cover letter is reported but does NOT trigger the dedup gate
  // (dedup gate is JD+PDF; cover-letter alone shouldn't block reruns).
  const cover_letter_exists = await fileExists(cl_abs);
  ok({
    exists: which.length > 0,
    which,
    jd_path: jd_rel,
    pdf_path: pdf_rel,
    cover_letter_exists,
    cover_letter_path: cl_rel,
  });
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "check-duplicate|tests passed|tests failed" | head -15
```

Expected: new test passes. All earlier `check-duplicate` tests still pass (the additive fields don't break the existing assertions).

- [ ] **Step 5: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add yash-resume-pipeline.mjs tests/yash-resume-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(yash-resume-pipeline): check-duplicate reports cover_letter_exists

Adds cover_letter_exists and cover_letter_path to the response.
The dedup gate (exists / which) is unchanged — JD+PDF still trigger
it, cover-letter alone does NOT, so a missing-cover-letter rerun
isn't blocked by an existing PDF.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Write the cover-letter prompt file

**Files:**
- Create: `cover-letter-system-based-on-jd-and-resume.md`

This is the largest single artifact. Mirrors the V2.0 resume prompt structure exactly. The full content is provided below — write it verbatim.

- [ ] **Step 1: Write the prompt file**

Use the `Write` tool to create `cover-letter-system-based-on-jd-and-resume.md` with this exact content:

````markdown
# Cover Letter Optimization System - XML Markdown Format (V1.0)

```xml
<cover_letter_optimization_system>
  <metadata>
    <title>Cover Letter Optimization System for Yash Anghan (AI Automation Engineer)</title>
    <version>1.0</version>
    <sibling_of>resume-optimization-system-based-on-job-description.md</sibling_of>
    <revision_notes>
      <note>Locked 4-paragraph skeleton with 12-16 sentence count band</note>
      <note>Locked proof-point list to prevent metric hallucination</note>
      <note>Resume keyword echo set requires 5+ shared bolded terms</note>
      <note>Same scoring rubric shape as V2.0 (>=90/100 to ship LaTeX-only)</note>
      <note>LaTeX template matches resume preamble for visual continuity</note>
    </revision_notes>
  </metadata>

  <primary_directive>
    <instruction>
When provided with a job description AND a tailored resume LaTeX:
1. Execute all phases internally (do not output intermediate analysis)
2. Build the cover letter from the locked 4-paragraph skeleton, injecting JD keywords from the resume's bolded set
3. Calculate optimization score using the explicit formula in Phase 6
4. Apply output rules based on the prioritized condition hierarchy

If score >=90 AND all constraints pass -> Output ONLY the complete LaTeX code
If any hard-fail constraint trips -> Output the appropriate error format with no LaTeX
If score <90 (no hard-fail) -> Output deficiency log + corrected LaTeX
    </instruction>
    <processing_mode>Internal analysis required but not output unless errors occur</processing_mode>
    <critical_constraint>USE locked proof points only. Do NOT invent metrics or accomplishments.</critical_constraint>
    <inputs_expected>
      <input name="jd_body">The cleaned JD markdown from jds/JD_<...>_<date>.md</input>
      <input name="resume_latex">The tailored resume .tex from /tmp/<...>_Resume_<date>.tex</input>
    </inputs_expected>
  </primary_directive>

  <phase_1>
    <n>JD ANALYSIS &amp; RESUME ECHO SET</n>
    <analysis_steps>
      <step number="1">Extract company name, role title, and the single hiring problem the JD describes (what pain or capability gap is the team buying?).</step>
      <step number="2">Extract high-priority JD keywords (appearing 2+ times OR in a "required" section).</step>
      <step number="3">Build the resume_keyword_echo_set: scan the supplied resume LaTeX for every term inside \textbf{...} and collect them.</step>
      <step number="4">Identify the JD archetype using these signals:
        <archetype name="AI/LLM/GenAI Engineer">RAG, LLM, agents, prompt, embeddings, vector DB</archetype>
        <archetype name="AI Automation Engineer">n8n, Make.com, Zapier, workflow automation, low-code</archetype>
        <archetype name="ML Engineer">model training, fine-tuning, MLOps, inference, model lifecycle</archetype>
        <archetype name="AI Software Engineer">full-stack + AI, API + LLM, microservices + AI integration</archetype>
        <archetype name="Other / fallback">none of the above signals dominate</archetype>
      </step>
    </analysis_steps>
  </phase_1>

  <phase_2>
    <n>LOCKED 4-PARAGRAPH SKELETON</n>
    <skeleton>
      <paragraph number="1" purpose="Hook" sentences="3-4">
        <required>Names role and company explicitly in the first sentence.</required>
        <required>Leads with the exit-story: 6+ years enterprise engineering at Bell + Morningstar (10M+ daily transactions) now applied to AI automation.</required>
        <required>Includes one quantified hero metric chosen from the locked proof points.</required>
        <prohibited>Generic openers like "I am writing to apply for..." -- start with a value claim, not boilerplate.</prohibited>
      </paragraph>
      <paragraph number="2" purpose="Why I match" sentences="4-5">
        <required>Direct keyword/responsibility echo from the JD.</required>
        <required>2-3 proof points from the locked &lt;approved_proof_points&gt; list, each mapped to a specific JD requirement.</required>
        <required>Wrap 2-4 high-priority JD keywords in \textbf{}, prioritizing terms already in the resume_keyword_echo_set.</required>
        <prohibited>Listing every skill -- this is not the resume.</prohibited>
      </paragraph>
      <paragraph number="3" purpose="Why this company" sentences="3-4">
        <required>Reference one specific company detail from the JD (mission, product surface, regulatory domain, scale, customer mix).</required>
        <required>State why that detail matters to the candidate's trajectory.</required>
        <prohibited>Generic culture fluff like "I admire your culture" or "I love what you stand for."</prohibited>
      </paragraph>
      <paragraph number="4" purpose="Close" sentences="2-3">
        <required>Forward-looking action line ("looking forward to discussing...", "would welcome the chance to...").</required>
        <required>Sign-off line: Sincerely,\\ Yash Anghan</required>
        <prohibited>Repeating qualifications already covered in paragraphs 1-2.</prohibited>
      </paragraph>
    </skeleton>
    <total_sentence_band>12 to 16 sentences inclusive. Outside this band triggers PARAGRAPH_COUNT_ERROR.</total_sentence_band>
    <resume_echo_requirement>At least 5 keywords from resume_keyword_echo_set must appear (bolded or unbolded) in the cover letter. Echoing fewer triggers a -10 score deduction.</resume_echo_requirement>
  </phase_2>

  <phase_3>
    <n>LOCKED PROOF POINTS (ANTI-HALLUCINATION)</n>
    <approved_proof_points>
      <proof_point id="P1">
        <name>AI Document Processing Pipeline</name>
        <context>Morningstar</context>
        <hero_metric>Reduced manual review time by 65% across 12K monthly fund documents</hero_metric>
        <archetypes>AI/LLM/GenAI, AI Software, fallback</archetypes>
      </proof_point>
      <proof_point id="P2">
        <name>GenAI Classification System</name>
        <context>Morningstar</context>
        <hero_metric>94% accuracy using embeddings and vector similarity</hero_metric>
        <archetypes>AI/LLM/GenAI, ML Engineer</archetypes>
      </proof_point>
      <proof_point id="P3">
        <name>RAG Pipeline for Document Processing</name>
        <context>Morningstar</context>
        <hero_metric>Processed 15K+ documents, reduced extraction time by 75%</hero_metric>
        <archetypes>AI/LLM/GenAI, ML Engineer</archetypes>
      </proof_point>
      <proof_point id="P4">
        <name>Client Onboarding Automation</name>
        <context>Freelance (Make.com)</context>
        <hero_metric>Saved 520+ hours annually</hero_metric>
        <archetypes>AI Automation</archetypes>
      </proof_point>
      <proof_point id="P5">
        <name>E-commerce Automation</name>
        <context>Freelance (N8N)</context>
        <hero_metric>Cut operational costs by $43K/year</hero_metric>
        <archetypes>AI Automation</archetypes>
      </proof_point>
      <proof_point id="P6">
        <name>AI Lead Qualification System</name>
        <context>Freelance (GPT-4)</context>
        <hero_metric>Increased sales productivity by 65%</hero_metric>
        <archetypes>AI Automation</archetypes>
      </proof_point>
    </approved_proof_points>

    <archetype_allocation>
      <rule archetype="AI/LLM/GenAI Engineer">Paragraph 2 must use 2-3 of: P1, P2, P3.</rule>
      <rule archetype="AI Automation Engineer">Paragraph 2 must use 2-3 of: P4, P5, P6.</rule>
      <rule archetype="ML Engineer">Paragraph 2 must use 2-3 of: P2, P3 + an enterprise-engineering detail from cv.md (Morningstar AWS inference, 25K+ daily requests, sub-200ms).</rule>
      <rule archetype="AI Software Engineer">Paragraph 2 must use P1 + a Bell/Virtusa enterprise detail (microservices at 45K daily transactions, 99.9% uptime, REST APIs serving 850K subscribers).</rule>
      <rule archetype="Other / fallback">Paragraph 2 uses P1 + the exit-story narrative; do not cherry-pick metrics from outside the locked list.</rule>
    </archetype_allocation>

    <invention_check>
      Any metric or accomplishment NOT listed in &lt;approved_proof_points&gt; or NOT verbatim from cv.md is a violation. Triggers PROOF_POINT_VIOLATION (no LaTeX output).
    </invention_check>
  </phase_3>

  <phase_4>
    <n>KEYWORD INJECTION &amp; ATS OPTIMIZATION</n>
    <keyword_rules>
      <rule>Wrap 4-7 high-priority JD keywords in \textbf{} across the 4 paragraphs.</rule>
      <rule>Prioritize keywords already bolded in the resume (resume_keyword_echo_set).</rule>
      <rule>Do not bold the same keyword twice -- ATS doesn't reward repetition.</rule>
      <rule>Never bold a keyword that doesn't actually appear in the JD.</rule>
    </keyword_rules>
    <latex_escape_rules>
      <rule>Hash: # -> \#</rule>
      <rule>Ampersand: &amp; -> \&amp;</rule>
      <rule>Percent: % -> \%</rule>
      <rule>Dollar: $ -> \$</rule>
      <rule>Underscore: _ -> \_</rule>
    </latex_escape_rules>
    <unicode_rule>No Unicode special characters (curly quotes, em dashes, arrows). Use ASCII equivalents.</unicode_rule>
  </phase_4>

  <phase_5>
    <n>CONSTRAINT VERIFICATION</n>
    <pre_output_validation>
      <step>Count sentences across all 4 paragraphs. Must be 12-16 inclusive.</step>
      <step>Verify exactly 4 paragraphs separated by \par\vspace{6pt}.</step>
      <step>Verify every metric and accomplishment traces to the locked proof point list or cv.md verbatim.</step>
      <step>Verify resume_keyword_echo_set overlap >= 5.</step>
      <step>Verify high-priority JD keywords wrapped with \textbf{} count is 4-7.</step>
      <step>Verify all special characters escaped, all \textbf{} commands closed.</step>
      <step>Verify salutation is exactly "Dear Hiring Manager," (no named individuals).</step>
      <step>Verify closing line is "Sincerely,\\ Yash Anghan" (with the exact \\ command).</step>
    </pre_output_validation>
  </phase_5>

  <phase_6>
    <n>QUALITY SCORING &amp; OUTPUT RULES</n>
    <scoring_rubric>
      <minimum_required_score>90 of 100</minimum_required_score>
      <criteria>
        <criterion name="Constraint Adherence" max="30">
          <component points="12">Exactly 4 paragraphs present</component>
          <component points="10">Total sentence count is 12-16</component>
          <component points="8">All proof points from approved list (no inventions)</component>
        </criterion>
        <criterion name="Content Relevance" max="25">
          <formula>5 points per high-priority JD keyword wrapped in \textbf{} or echoed in body, max 25 (cap at 5 keywords)</formula>
        </criterion>
        <criterion name="ATS Compatibility" max="20">
          <component points="5">Header + contact row present</component>
          <component points="5">Salutation present and correct</component>
          <component points="5">4-paragraph body present</component>
          <component points="5">Closing + signature line present</component>
        </criterion>
        <criterion name="Contextual Authenticity" max="15">
          <component points="5">Hook ties to exit-story (Bell + Morningstar -> AI automation)</component>
          <component points="5">Paragraph 3 references a specific JD-supplied company detail (not generic)</component>
          <component points="5">No generic culture fluff</component>
        </criterion>
        <criterion name="Technical Accuracy" max="10">
          <component points="5">All LaTeX special characters escaped</component>
          <component points="5">All \textbf{} commands properly opened and closed</component>
        </criterion>
      </criteria>
      <deduction>-10 points (Content Relevance) if resume_keyword_echo_set overlap is &lt; 5</deduction>
    </scoring_rubric>
  </phase_6>

  <output_rules>
    <output_condition_priority>
      <priority rank="1">PARAGRAPH_COUNT_ERROR -- STOP, no LaTeX output</priority>
      <priority rank="2">PROOF_POINT_VIOLATION -- STOP, no LaTeX output</priority>
      <priority rank="3">CONTEXTUALIZATION_DEFICIENCY -- correct then output</priority>
      <priority rank="4">Score &lt; 90 (no STOP) -- correct then output with deficiency log</priority>
      <priority rank="5">Score >= 90 -- output LaTeX only</priority>
    </output_condition_priority>

    <condition number="1">
      <criteria>Score >= 90 AND all constraints pass</criteria>
      <output_format>Output ONLY the complete LaTeX from \documentclass to \end{document}. No commentary.</output_format>
    </condition>

    <condition number="2">
      <criteria>Score &lt; 90 (no STOP conditions)</criteria>
      <output_format>
OPTIMIZATION INCOMPLETE - Score: [X]/100
Deficiencies:
- [Specific issue 1 with point deduction]
- [Specific issue 2 with point deduction]
Applying corrections...

[Complete corrected LaTeX from \documentclass to \end{document}]
      </output_format>
    </condition>

    <condition number="3">
      <criteria>Contextual Authenticity score &lt; 10 of 15</criteria>
      <output_format>
CONTEXTUALIZATION DEFICIENCY DETECTED
Issue: [Specific contextualization problem]
Problematic Sentence: [the sentence lacking domain/company specificity]
Correction Applied: [how it was fixed]

[Complete corrected LaTeX]
      </output_format>
    </condition>

    <condition number="4" priority="STOP">
      <criteria>Sentence count outside 12-16 OR paragraph count != 4</criteria>
      <output_format>
PARAGRAPH_COUNT_ERROR - CANNOT PROCEED
Required: 4 paragraphs, 12-16 sentences total
Actual paragraphs: [N]
Actual sentences: [N]
Resolution Required: Adjust counts to match the locked skeleton before proceeding.
      </output_format>
    </condition>

    <condition number="5" priority="STOP">
      <criteria>Any metric or accomplishment not present in approved_proof_points or cv.md</criteria>
      <output_format>
PROOF_POINT_VIOLATION - CANNOT PROCEED
Invented detail: [the specific metric or claim that is not in the approved list]
Resolution Required: Replace with an approved proof point from the locked list.
      </output_format>
    </condition>
  </output_rules>

  <base_latex_template>
    <latex_code>
\documentclass[letterpaper,11pt]{article}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{fontawesome5}
\usepackage{multicol}
\setlength{\multicolsep}{-3.0pt}
\setlength{\columnsep}{-1pt}
\ifdefined\pdfgentounicode
\input{glyphtounicode}
\pdfgentounicode=1
\fi
\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}
\addtolength{\oddsidemargin}{-0.7in}
\addtolength{\evensidemargin}{-0.7in}
\addtolength{\textwidth}{1.4in}
\addtolength{\topmargin}{-0.8in}
\addtolength{\textheight}{1.6in}
\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}
\begin{document}
\begin{center}
{\Huge \scshape Yash Anghan} \\ \vspace{2pt}
\small \raisebox{-0.1\height}\faEnvelope\ \href{mailto:yashanghan97@gmail.com}{yashanghan97@gmail.com} ~
\raisebox{-0.1\height}\faPhone\ +1 (437) 290-2005 ~
\href{https://www.linkedin.com/in/yash-aiautomation/}{\raisebox{-0.2\height}\faLinkedin\ \underline{Linkedin}} ~
\href{https://github.com/yash-ai-automation}{\raisebox{-0.2\height}\faGithub\ \underline{GitHub}} ~
\href{https://yash-anghan-ai-automatio-15hmplk.gamma.site/}{\raisebox{-0.2\height}\faGlobe\ \underline{Portfolio}}
\vspace{8pt}
\end{center}
\hfill [INSERT_DATE_YYYY-MM-DD]
\vspace{12pt}

Dear Hiring Manager,\par\vspace{6pt}

[PARAGRAPH 1: Hook -- 3-4 sentences. Names role + company. Leads with exit-story. One hero metric.]
\par\vspace{6pt}

[PARAGRAPH 2: Why I match -- 4-5 sentences. JD keyword echo. 2-3 approved proof points. \textbf{} on 2-4 high-priority JD keywords echoing the resume.]
\par\vspace{6pt}

[PARAGRAPH 3: Why this company -- 3-4 sentences. Specific JD-supplied company detail. Why it matters to candidate.]
\par\vspace{6pt}

[PARAGRAPH 4: Close -- 2-3 sentences. Forward-looking action line.]
\par\vspace{12pt}

Sincerely,\\
Yash Anghan
\end{document}
    </latex_code>
  </base_latex_template>

  <execution_command>
    <step number="1">Phase 1 -> JD analysis + resume_keyword_echo_set + archetype detection</step>
    <step number="2">Phase 2 -> Compose 4 paragraphs from locked skeleton (12-16 sentences total)</step>
    <step number="3">Phase 3 -> Allocate 2-3 approved proof points by archetype</step>
    <step number="4">Phase 4 -> Inject \textbf{} keywords + LaTeX escapes</step>
    <step number="5">Phase 5 -> Run verification checks</step>
    <step number="6">Phase 6 -> Score, then apply output rules priority hierarchy</step>
  </execution_command>
</cover_letter_optimization_system>
```
````

- [ ] **Step 2: Verify the prompt file exists and has the expected anchors**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
test -f cover-letter-system-based-on-jd-and-resume.md && echo "exists"
grep -c "<phase_" cover-letter-system-based-on-jd-and-resume.md
grep -c "<proof_point id=" cover-letter-system-based-on-jd-and-resume.md
grep -c "PARAGRAPH_COUNT_ERROR\|PROOF_POINT_VIOLATION" cover-letter-system-based-on-jd-and-resume.md
```

Expected: file exists; phase count is 6; proof_point count is 6; the two hard-fail tokens appear at least 2 times each (definition + output rules).

- [ ] **Step 3: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add cover-letter-system-based-on-jd-and-resume.md
git commit -m "$(cat <<'EOF'
feat: add cover-letter optimization prompt (V1.0)

Sibling of resume-optimization-system-based-on-job-description.md.
Locked 4-paragraph skeleton (Hook / Why I match / Why this company /
Close), 12-16 sentence band, 6 approved proof points pulled from
config/profile.yml, archetype-driven allocation, >=90/100 score gate,
PARAGRAPH_COUNT_ERROR and PROOF_POINT_VIOLATION hard-fails. LaTeX
template matches the resume preamble for visual continuity.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Update `modes/yash-resume-pipeline.md` with steps 9b–12b

**Files:**
- Modify: `modes/yash-resume-pipeline.md` (insert new steps after step 10, extend step 11, extend step 12)

- [ ] **Step 1: Read the current mode file to find anchor lines**

```bash
grep -n "^[0-9]\+\. \*\*\|^11\. \|^12\. \|^13\. " /yash-superClaudeHuman/projects/yash-ai-automation-career/modes/yash-resume-pipeline.md
```

Expected: lines for steps 1-13 of the per-URL loop. Note the line range for steps 11–13 — that's where step 11 (mark-processed) and step 12 (report) live.

- [ ] **Step 2: Insert steps 9b, 10b, 11b, 12b between step 10 and step 11**

Use the `Edit` tool. Locate the block beginning with the heading line for step 11 — it looks like:

```markdown
11. **Mark processed and log:**

    ```bash
    node yash-resume-pipeline.mjs mark-processed \
        --url <url> --company "<c>" --role "<r>" \
        --jd <jd-path> --pdf <pdf-path> --score <X>

    node yash-resume-pipeline.mjs log \
        --status ok --url <url> \
        --slug <c>_<r> --score <X> \
        --jd <jd-path> --pdf <pdf-path>
    ```
```

Replace that whole block with this expanded version (which adds the 9b–12b steps before, and extends step 11):

```markdown
9b. **Apply the cover-letter prompt:**

    Read `cover-letter-system-based-on-jd-and-resume.md` and apply it
    in-context to:
    - the JD body from `jds/JD_<c>_<r>_Yash_Anghan_<d>.md` (written in step 6)
    - the tailored resume LaTeX from `/tmp/<c>_<r>_Yash_Anghan_Resume_<d>.tex` (written in step 8)

    The prompt's output rules govern the response. Possible outputs:

    a) Just LaTeX (score >= 90)
    b) `OPTIMIZATION INCOMPLETE — Score: X/100` + deficiencies + LaTeX
    c) `CONTEXTUALIZATION DEFICIENCY DETECTED` + reason + LaTeX
    d) `PARAGRAPH_COUNT_ERROR — CANNOT PROCEED` (no LaTeX, hard fail)
    e) `PROOF_POINT_VIOLATION — CANNOT PROCEED` (no LaTeX, hard fail)

    **Parse the output:**
    - Find the first occurrence of `\documentclass`.
    - If present: everything before it = deficiency log; everything from
      `\documentclass` to end = LaTeX block.
    - If absent: cover-letter step fails. Skip 10b–11b. Write the
      sidecar `.log` (step 12b) with `status: failed` and the full output.
      Print warning to user. Do NOT mark URL failed — the resume PDF is
      already on disk; the URL still gets marked processed at step 11.

10b. **Write cover-letter `.tex`:** save the LaTeX block (from
     `\documentclass` onward) to
     `/tmp/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.tex`. Never write to
     `cover-letters/` (PDFs only).

11b. **Compile cover letter to PDF:**

     ```bash
     node yash-resume-pipeline.mjs compile-cover-letter \
         --tex /tmp/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.tex \
         --pdf cover-letters/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.pdf
     ```

     If `status: fail`:
     - Skip the cover-letter PDF — but the stray-`.log` cleanup runs
       inside the subcommand on both success and failure paths, so
       `cover-letters/` stays clean.
     - Write the sidecar `.log` (step 12b) with `status: failed` and
       `tectonic_log_tail` from the response.
     - Print warning. URL still marked processed at step 11.

12b. **Write cover-letter sidecar `.log`** to
     `cover-letter-logs/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.log`:

     ```
     score: <X>/100
     deficiencies: <text captured before \documentclass; or "none">
     status: compiled | compiled-review-recommended | failed
     resume_keywords_echoed: <count>
     ```

11. **Mark processed and log:**

    ```bash
    node yash-resume-pipeline.mjs mark-processed \
        --url <url> --company "<c>" --role "<r>" \
        --jd <jd-path> --pdf <pdf-path> --score <X> \
        --cover-letter <cover-letter-pdf-path-or-omitted-on-fail> \
        --cover-letter-status <ok|fail>

    node yash-resume-pipeline.mjs log \
        --status ok --url <url> \
        --slug <c>_<r> --score <X> \
        --jd <jd-path> --pdf <pdf-path> \
        --cover-letter <cover-letter-pdf-path-or-omitted> \
        --cover-letter-score <X-or-omitted> \
        --cover-letter-status <ok|fail>
    ```

    Omit cover-letter args when the cover-letter step failed at 9b
    (no LaTeX) or 11b (compile crashed).

12. **Report to user:** print the JD path, resume PDF path,
    cover-letter PDF path (or `<absent — see warning>`), resume score,
    cover-letter score, and any review/warning flags.
```

- [ ] **Step 3: Add a hard-rule update at the bottom of the mode file**

In the `## Hard rules` section, after the existing bullet list, append:

```markdown
- **Cover letter is best-effort.** A cover-letter failure (V2.0 hard-fail or
  tectonic crash) does NOT mark the URL failed when the resume PDF already
  succeeded. The URL is marked processed with a warning, and the cover-letter
  sidecar `.log` records the reason. Cover-letter failures do NOT count toward
  the 3-consecutive-failures backoff.
- **Never modify** `cover-letter-system-based-on-jd-and-resume.md` during a run
  (same discipline as the resume prompt).
```

- [ ] **Step 4: Verify the mode file is internally consistent**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
grep -n "^[0-9]" modes/yash-resume-pipeline.md | head -20
grep -c "compile-cover-letter\|cover-letter-logs\|cover-letters/" modes/yash-resume-pipeline.md
```

Expected: step numbering 1, 2, 3, ..., 9, 9b, 10, 10b, 11, 11b, 12, 12b ... 13. The grep count is at least 4 (`compile-cover-letter` invocation + 3 file-path references).

- [ ] **Step 5: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add modes/yash-resume-pipeline.md
git commit -m "$(cat <<'EOF'
feat(modes): per-URL loop generates cover letter alongside resume

Adds steps 9b-12b to /yash-resume-pipeline: apply the cover-letter
prompt, write .tex to /tmp, compile to cover-letters/, write sidecar
.log to cover-letter-logs/. Step 11 (mark-processed) and the JSONL
log call extended with optional cover-letter args. Step 12 (final
report) prints the cover-letter path or a warning.

Best-effort semantics: a cover-letter failure does NOT mark the URL
failed when the resume PDF already succeeded.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Run all unit tests as a regression gate

**Files:** none modified; pure verification.

- [ ] **Step 1: Run the full test suite**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | tail -10
```

Expected output (numbers approximate):

```
# tests 50
# pass 50
# fail 0
```

- [ ] **Step 2: If any test fails, stop and diagnose**

```bash
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "fail|Error" | head -20
```

Diagnose each failure individually before proceeding to Task 11.

---

## Task 11: End-to-end smoke test on a fresh URL

**Files:** none. Manual smoke test using a JD URL.

- [ ] **Step 1: Pick a JD URL not yet processed**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
grep -n "^- \[ \]" data/pipeline.md | head -5
```

If a pending URL exists, use the first one. If `## Pendientes` is empty, append a fresh URL to test with — for example, prepare a one-line addition:

```bash
# Manually edit data/pipeline.md. Add under "## Pendientes":
#   - [ ] https://example.com/some-job-url
# Save the file.
```

- [ ] **Step 2: Run the pipeline through one URL**

Invoke `/yash-resume-pipeline` (or follow `modes/yash-resume-pipeline.md` step by step). Confirm the loop processes one URL and stops.

- [ ] **Step 3: Verify all five artifacts exist**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
ls -la jds/JD_*.md          | tail -3
ls -la resumes/*.pdf        | tail -3
ls -la resume-logs/*.log    | tail -3
ls -la cover-letters/*.pdf  | tail -3
ls -la cover-letter-logs/*.log | tail -3
```

Expected: the run's `<Company>_<Position>_Yash_Anghan_<…>_2026-05-08.<ext>` artifacts in all five places.

- [ ] **Step 4: Verify directory hygiene**

```bash
ls /yash-superClaudeHuman/projects/yash-ai-automation-career/cover-letters/ | grep -v '^\.gitkeep$' | grep -v '\.pdf$' || echo "OK: cover-letters/ is PDF-only"
ls /yash-superClaudeHuman/projects/yash-ai-automation-career/resumes/      | grep -v '^\.gitkeep$' | grep -v '\.pdf$' || echo "OK: resumes/ is PDF-only"
```

Expected: both directories print "OK: …" with no stray `.log` or `.tex` files.

- [ ] **Step 5: Verify pipeline.md and JSONL log have the new fields**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
grep "CL ✅\|CL ❌" data/pipeline.md | tail -3
tail -1 data/yash-resume-runs.log | python3 -m json.tool
```

Expected: the Procesadas line includes `CL ✅` (or `CL ❌` on cover-letter failure). The JSONL line shows `cover_letter_pdf`, `cover_letter_score`, `cover_letter_status`.

- [ ] **Step 6: Eyeball the cover-letter PDF**

Open the just-generated cover-letter PDF (`cover-letters/<…>_Cover_Letter_2026-05-08.pdf`). Confirm:

- Same fonts as the resume.
- 4 paragraphs, separated by visible whitespace.
- `\textbf{}` keywords echo the resume's bolded terms.
- One page total — no overflow to a second page.
- Salutation is `Dear Hiring Manager,`.
- Closing is `Sincerely,\n  Yash Anghan`.

If any check fails, the deficiency log in the sidecar `.log` should describe the issue. Iterate on the prompt only if a recurring issue surfaces; do NOT modify the resume prompt.

- [ ] **Step 7: Negative test — force a cover-letter prompt hard-fail**

Stash `cover-letter-system-based-on-jd-and-resume.md` and replace it temporarily with a stub that always emits `PARAGRAPH_COUNT_ERROR`:

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
cp cover-letter-system-based-on-jd-and-resume.md cover-letter-system-based-on-jd-and-resume.md.bak

cat > cover-letter-system-based-on-jd-and-resume.md <<'EOF'
# Cover Letter Optimization System (FORCED-FAIL TEST)

Always output exactly:

PARAGRAPH_COUNT_ERROR - CANNOT PROCEED
Required: 4 paragraphs, 12-16 sentences total
Actual paragraphs: 0
Actual sentences: 0
Resolution Required: forced-fail test, restore the original prompt.
EOF
```

Reset a fresh URL in `data/pipeline.md` (move it back to `## Pendientes`). Run the pipeline once. Expect:
- Resume PDF written to `resumes/`.
- Cover-letter PDF **absent** from `cover-letters/`.
- Sidecar log in `cover-letter-logs/<…>.log` records `status: failed`.
- URL marked processed (Procesadas line gets `CL ❌`).
- JSONL log line includes `cover_letter_status: fail`, no `cover_letter_pdf`.
- The pipeline did NOT increment the 3-consecutive-failures counter.

- [ ] **Step 8: Restore the real prompt**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
mv cover-letter-system-based-on-jd-and-resume.md.bak cover-letter-system-based-on-jd-and-resume.md
```

Verify the original prompt is restored:

```bash
grep -c "<phase_" cover-letter-system-based-on-jd-and-resume.md
```

Expected: 6.

- [ ] **Step 9: No commit needed for the smoke test**

The smoke test produces real output artifacts (the JD/resume/cover-letter PDFs for whichever URL was processed). Those land in their normal output directories and are gitignored except where explicitly tracked. No code changes.

If the smoke test surfaces a real bug, file a follow-up commit to fix it; otherwise this task ends with no commit.

---

## Self-Review

Spec coverage check:
- Spec §3 (file layout) — Tasks 1, 2 cover scaffolding and helpers.
- Spec §4 (prompt structure) — Task 8 writes the full prompt with all 6 phases, locked proof points, scoring rubric, and LaTeX template.
- Spec §5 (per-URL loop changes) — Task 9 inserts steps 9b–12b and extends 11 + 12.
- Spec §6 (orchestrator changes) — Tasks 4 (compile-cover-letter), 5 (mark-processed extension), 6 (log extension), 7 (check-duplicate extension).
- Spec §7 (error handling matrix) — Task 4 tests the failure-path stray-`.log` cleanup; Task 9 documents the failure semantics in the mode file; Task 11 step 7 negative-tests it end-to-end.
- Spec §8 (idempotency) — Task 7's `check-duplicate` extension reports cover-letter existence without triggering the dedup gate, preserving idempotency semantics.
- Spec §9 (testing strategy) — Tasks 2, 4, 5, 6, 7 implement the unit tests; Task 11 runs the manual smoke test plus the negative test.

Type/path consistency check:
- All path helpers use `<slug>_<role-slug>_Yash_Anghan_Cover_Letter_<date>.<ext>` consistently.
- `compile-cover-letter` accepts the same `--tex`/`--pdf` flag shape as `compile-resume`.
- `mark-processed` and `log` use kebab-case CLI flags (`--cover-letter`, `--cover-letter-status`, `--cover-letter-score`) and snake_case payload keys (`cover_letter_pdf`, `cover_letter_status`, `cover_letter_score`) — same convention as the existing arg/payload mismatch (CLI `--score` → payload `score`).
- The sidecar `.log` field name `resume_keywords_echoed` appears in both Task 9 (mode file) and Task 8 (prompt) — consistent.

No placeholders found. No inter-task references that omit code.
