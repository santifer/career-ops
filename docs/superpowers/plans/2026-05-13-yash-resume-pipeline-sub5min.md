# yash-resume-pipeline sub-5-minute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut per-URL `/yash-resume-pipeline` wall-clock from a typical 7-10 min down to under 5 min by adding plan-bullets validation, parallel resume-compile, and bundled timestamps — without touching the locked V2.0 resume prompt, the locked cover-letter prompt, or `cv.md`.

**Architecture:** Stay 100% inside Claude Code CLI. Three additive Node subcommands (`init-timer`, `mark-phase`, `read-timer`) plus a `--from-timer` flag on the existing `log` subcommand replace 6 inline `date +%s.%N` Bash calls. Two new Python validator scripts (`tools/validate_bullets.py`, `tools/validate_skills.py`) make Claude's plan-bullets retry loop deterministic. A fixture-based Node smoke test (`tests/e2e-smoke.mjs`) proves the Node side without invoking the LLM.

**Tech Stack:** Node.js 20+ ESM (`yash-resume-pipeline.mjs`), Python 3.10+ (`tools/*.py`, `scrapling_fetch.py`), `node:test` + `node:assert/strict` (test runner), tectonic (LaTeX compile, unchanged), pypdf (page-count assertion via `.venv/bin/python3`).

**Spec reference:** `docs/superpowers/specs/2026-05-13-yash-resume-pipeline-sub5min-design.md` (commit `f2280af`).

---

## File Structure

### Modified

| Path | What changes | Why |
|---|---|---|
| `yash-resume-pipeline.mjs` | Add 3 new `SUBCOMMANDS` (`init-timer`, `mark-phase`, `read-timer`). Extend `SUBCOMMANDS['log']` with a `--from-timer` flag that reads phase times from the timer state file. | Replaces 6 inline `date +%s.%N` calls; enables one-call logging. |
| `modes/yash-resume-pipeline.md` | Insert step 7a (plan-bullets), reorder steps 9 and 9b so `compile-resume` runs in background, replace inline `date` calls with `init-timer` / `mark-phase`, change step 11 `log` to use `--from-timer`. | Wall-clock savings + retry-budget enforcement. |
| `AGENTS.md` | Update the "Yash Resume Pipeline" section: mention plan-bullets phase and `tests/e2e-smoke.mjs` entry. | Discoverability. |
| `package.json` | Add `"smoke": "node tests/e2e-smoke.mjs"` to `scripts`. | One-command CI hook. |
| `tests/yash-resume-pipeline.test.mjs` | Add unit tests for the three new subcommands + `log --from-timer`. | TDD coverage. |

### Created

| Path | Purpose | LOC |
|---|---|---|
| `tools/validate_bullets.py` | Reads JSON `{M1,M2,...,V4: "plain text bullet"}` from stdin. Strips LaTeX. Validates each bullet's visible length is in `[220, 230]` inclusive. Returns `{"pass": bool, "fails": [{"id","len","direction":"low"\|"high"}]}`. | ~55 |
| `tools/validate_skills.py` | Reads JSON `{"AI & Automation": {"text":"...","cap":97}, ...}` from stdin. Validates each category's text length ≤ cap. Returns `{"pass": bool, "fails": [{"category","len","cap"}]}`. | ~35 |
| `tests/validators.test.mjs` | Node tests that spawn `python3 tools/validate_*.py` with stdin JSON. Asserts the pass/fail shape. | ~80 |
| `tests/e2e-smoke.mjs` | Sequential smoke runner: init-timer → slugify → check-duplicate → JD write → validators → compile-resume → mark-phase → compile-cover-letter → sidecar logs → read-timer → cleanup. No LLM, no network. | ~180 |
| `tests/fixtures/scribd-jd.json` | Cached scrapling-shaped response from today's real Scribd run. | ~12 KB |
| `tests/fixtures/scribd-bullets.json` | 15 plain-text bullets (no LaTeX markup) — copies of today's in-band content. | ~5 KB |
| `tests/fixtures/scribd-skills.json` | 6 skill categories `{text, cap}`. | ~1 KB |
| `tests/fixtures/scribd-resume.tex` | Verbatim copy of today's `/tmp/Scribd_..._Resume_2026-05-13.tex`. | ~5 KB |
| `tests/fixtures/scribd-cover-letter.tex` | Verbatim copy of today's `/tmp/Scribd_..._Cover_Letter_2026-05-13.tex`. | ~3 KB |

### Not touched (locked)

- `resume-optimization-system-based-on-job-description.md`
- `cover-letter-system-based-on-jd-and-resume.md`
- `cv.md`
- `scrapling_fetch.py`, `.venv/`
- `generate-pdf-latex.mjs`
- `shivani-resume-pipeline.mjs`, `modes/shivani-resume-pipeline.md`
- `auto-pipeline.md`, `pipeline.md`

### Timer state file format

`/tmp/yash-pipeline-timer-${process.pid}.json`:

```json
{
  "url": "https://...",
  "pid": 12345,
  "t_url_start": 1778678027.583,
  "t_jd_fetch_start": 1778678029.901,
  "t_jd_fetch_end": 1778678047.569,
  "t_resume_gen_start": 1778678244.442,
  "t_resume_gen_end": 1778678287.798,
  "t_resume_compile_start": 1778678290.215,
  "t_resume_compile_end": 1778678300.494,
  "t_cl_gen_start": 1778678291.001,
  "t_cl_gen_end": 1778678308.245,
  "t_cl_compile_start": 1778678310.118,
  "t_cl_compile_end": 1778678319.827,
  "t_url_end": 1778678426.644
}
```

All timestamps are epoch seconds with nanosecond fraction (matching `date -u +%s.%N` output, which the orchestrator currently uses).

Phase ms derivations:
- `jd_fetch_ms = (t_jd_fetch_end - t_jd_fetch_start) * 1000`
- `resume_gen_ms = (t_resume_gen_end - t_resume_gen_start) * 1000`
- `resume_compile_ms = (t_resume_compile_end - t_resume_compile_start) * 1000`
- `cover_letter_gen_ms = (t_cl_gen_end - t_cl_gen_start) * 1000`
- `cover_letter_compile_ms = (t_cl_compile_end - t_cl_compile_start) * 1000`
- `total_ms = (t_url_end - t_url_start) * 1000`

All values rounded to integer with `Math.round`.

---

## Task 1: Add `init-timer` subcommand

**Files:**
- Modify: `yash-resume-pipeline.mjs` (add `SUBCOMMANDS['init-timer']`)
- Test: `tests/yash-resume-pipeline.test.mjs` (append a test block)

- [ ] **Step 1: Write the failing test**

Append this to `tests/yash-resume-pipeline.test.mjs` (place it after the last existing `test()` block — find the end of file):

```javascript
test('init-timer: writes timer state file with url and t_url_start', async () => {
  const { code, stdout } = await runScript(['init-timer', '--url', 'https://example.com/job/123']);
  assert.equal(code, 0);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'ok');
  assert.match(obj.timer_path, /\/tmp\/yash-pipeline-timer-\d+\.json/);
  const state = JSON.parse(await readFileTest(obj.timer_path, 'utf-8'));
  assert.equal(state.url, 'https://example.com/job/123');
  assert.ok(typeof state.t_url_start === 'number');
  assert.ok(state.t_url_start > 1.7e9); // sanity: post-2023 epoch
  assert.equal(state.pid, process.pid > 0 ? state.pid : null); // pid must be a positive int
  assert.ok(state.pid > 0);
  // cleanup
  await rm(obj.timer_path).catch(() => {});
});

test('init-timer: requires --url flag', async () => {
  const { code, stdout } = await runScript(['init-timer']);
  assert.equal(code, 1);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'fail');
  assert.match(obj.error, /init-timer requires --url/);
});
```

If `rm` is not imported in the test file, add it to the existing `mkdtemp, rm, writeFile...` import line at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "init-timer|not ok|fail|pass"`

Expected: both new tests fail with `unknown subcommand: init-timer` in the JSON.

- [ ] **Step 3: Add the `init-timer` subcommand**

In `yash-resume-pipeline.mjs`, add right after the `ALLOWED_LOG_STATUSES` constant (around line 300):

```javascript
// === Timer state helpers ===
function timerStatePath(pid = process.pid) {
  return `/tmp/yash-pipeline-timer-${pid}.json`;
}

async function readTimerState(pid = process.pid) {
  const p = timerStatePath(pid);
  try {
    return JSON.parse(await readFile(p, 'utf-8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function writeTimerState(state, pid = process.pid) {
  await writeFile(timerStatePath(pid), JSON.stringify(state, null, 2));
}

function nowEpochFloat() {
  return Date.now() / 1000 + (process.hrtime.bigint() % 1_000_000_000n).valueOf() / 1e12;
  // ^ adds sub-ms precision; Date.now() alone is fine but matches `date -u +%s.%N` shape
}
```

Then add this subcommand below `SUBCOMMANDS['log']` (around line 340):

```javascript
SUBCOMMANDS['init-timer'] = async (args) => {
  const url = args.url;
  if (!url) fail('init-timer requires --url');
  const state = {
    url,
    pid: process.pid,
    t_url_start: nowEpochFloat(),
  };
  await writeTimerState(state);
  ok({ timer_path: timerStatePath() });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "init-timer|not ok|^ok"`

Expected: both `init-timer` tests pass.

- [ ] **Step 5: Commit**

```bash
git add yash-resume-pipeline.mjs tests/yash-resume-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(yash-resume-pipeline): init-timer subcommand + timer state helpers

Writes /tmp/yash-pipeline-timer-<pid>.json with url + t_url_start.
Replaces inline `date -u +%s.%N` for the URL start marker.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `mark-phase` subcommand

**Files:**
- Modify: `yash-resume-pipeline.mjs` (add `SUBCOMMANDS['mark-phase']`)
- Test: `tests/yash-resume-pipeline.test.mjs` (append test block)

**Allowed phase names** (enum):
`jd_fetch_start`, `jd_fetch_end`, `resume_gen_start`, `resume_gen_end`, `resume_compile_start`, `resume_compile_end`, `cl_gen_start`, `cl_gen_end`, `cl_compile_start`, `cl_compile_end`, `url_end`.

- [ ] **Step 1: Write the failing test**

Append to `tests/yash-resume-pipeline.test.mjs`:

```javascript
test('mark-phase: stamps t_<phase> on existing timer state', async () => {
  // First init
  const init = await runScript(['init-timer', '--url', 'https://example.com/x']);
  const initObj = JSON.parse(init.stdout);
  // Now mark a phase
  const { code, stdout } = await runScript(['mark-phase', '--phase', 'jd_fetch_start']);
  assert.equal(code, 0);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'ok');
  const state = JSON.parse(await readFileTest(initObj.timer_path, 'utf-8'));
  assert.ok(typeof state.t_jd_fetch_start === 'number');
  assert.ok(state.t_jd_fetch_start >= state.t_url_start);
  await rm(initObj.timer_path).catch(() => {});
});

test('mark-phase: rejects unknown phase names', async () => {
  await runScript(['init-timer', '--url', 'https://example.com/x']);
  const { code, stdout } = await runScript(['mark-phase', '--phase', 'bogus_phase']);
  assert.equal(code, 1);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'fail');
  assert.match(obj.error, /unknown phase: bogus_phase/);
  await rm(`/tmp/yash-pipeline-timer-${process.pid}.json`).catch(() => {});
});

test('mark-phase: fails when timer state file missing', async () => {
  await rm(`/tmp/yash-pipeline-timer-${process.pid}.json`).catch(() => {});
  const { code, stdout } = await runScript(['mark-phase', '--phase', 'jd_fetch_start']);
  assert.equal(code, 1);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'fail');
  assert.match(obj.error, /timer state not found.*init-timer/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "mark-phase|not ok"`

Expected: three `mark-phase` tests fail with `unknown subcommand`.

- [ ] **Step 3: Add the `mark-phase` subcommand**

In `yash-resume-pipeline.mjs`, add below `SUBCOMMANDS['init-timer']`:

```javascript
const ALLOWED_PHASES = new Set([
  'jd_fetch_start', 'jd_fetch_end',
  'resume_gen_start', 'resume_gen_end',
  'resume_compile_start', 'resume_compile_end',
  'cl_gen_start', 'cl_gen_end',
  'cl_compile_start', 'cl_compile_end',
  'url_end',
]);

SUBCOMMANDS['mark-phase'] = async (args) => {
  const phase = args.phase;
  if (!phase) fail('mark-phase requires --phase');
  if (!ALLOWED_PHASES.has(phase)) fail(`unknown phase: ${phase}`);
  const state = await readTimerState();
  if (!state) fail('timer state not found; call init-timer first');
  state[`t_${phase}`] = nowEpochFloat();
  await writeTimerState(state);
  ok({});
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "mark-phase|not ok"`

Expected: all three `mark-phase` tests pass; no `not ok` lines.

- [ ] **Step 5: Commit**

```bash
git add yash-resume-pipeline.mjs tests/yash-resume-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(yash-resume-pipeline): mark-phase subcommand

Stamps t_<phase> on the timer state file. Validates phase name against
an explicit allow-list (jd_fetch_start, jd_fetch_end, resume_gen_*,
resume_compile_*, cl_gen_*, cl_compile_*, url_end).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `read-timer` subcommand

**Files:**
- Modify: `yash-resume-pipeline.mjs` (add `SUBCOMMANDS['read-timer']`)
- Test: `tests/yash-resume-pipeline.test.mjs` (append test block)

- [ ] **Step 1: Write the failing test**

Append to `tests/yash-resume-pipeline.test.mjs`:

```javascript
test('read-timer: returns phase ms deltas for all stamped phases', async () => {
  // Setup: init + several marks
  await runScript(['init-timer', '--url', 'https://example.com/x']);
  await runScript(['mark-phase', '--phase', 'jd_fetch_start']);
  await new Promise(r => setTimeout(r, 50)); // 50ms gap
  await runScript(['mark-phase', '--phase', 'jd_fetch_end']);
  const { code, stdout } = await runScript(['read-timer']);
  assert.equal(code, 0);
  const obj = JSON.parse(stdout);
  assert.equal(obj.status, 'ok');
  assert.ok(obj.jd_fetch_ms >= 40 && obj.jd_fetch_ms < 5000, `jd_fetch_ms=${obj.jd_fetch_ms} out of range`);
  await rm(`/tmp/yash-pipeline-timer-${process.pid}.json`).catch(() => {});
});

test('read-timer: returns null for unstamped phases', async () => {
  await runScript(['init-timer', '--url', 'https://example.com/x']);
  const { code, stdout } = await runScript(['read-timer']);
  assert.equal(code, 0);
  const obj = JSON.parse(stdout);
  assert.equal(obj.jd_fetch_ms, null);
  assert.equal(obj.resume_gen_ms, null);
  assert.equal(obj.total_ms, null);
  await rm(`/tmp/yash-pipeline-timer-${process.pid}.json`).catch(() => {});
});

test('read-timer: fails when timer state missing', async () => {
  await rm(`/tmp/yash-pipeline-timer-${process.pid}.json`).catch(() => {});
  const { code, stdout } = await runScript(['read-timer']);
  assert.equal(code, 1);
  const obj = JSON.parse(stdout);
  assert.match(obj.error, /timer state not found.*init-timer/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "read-timer|not ok"`

Expected: three `read-timer` tests fail with `unknown subcommand`.

- [ ] **Step 3: Add the `read-timer` subcommand**

In `yash-resume-pipeline.mjs`, add below `SUBCOMMANDS['mark-phase']`:

```javascript
function phaseMs(state, startKey, endKey) {
  const s = state[startKey];
  const e = state[endKey];
  if (typeof s !== 'number' || typeof e !== 'number') return null;
  return Math.round((e - s) * 1000);
}

SUBCOMMANDS['read-timer'] = async (_args) => {
  const state = await readTimerState();
  if (!state) fail('timer state not found; call init-timer first');
  ok({
    url: state.url,
    pid: state.pid,
    jd_fetch_ms: phaseMs(state, 't_jd_fetch_start', 't_jd_fetch_end'),
    resume_gen_ms: phaseMs(state, 't_resume_gen_start', 't_resume_gen_end'),
    resume_compile_ms: phaseMs(state, 't_resume_compile_start', 't_resume_compile_end'),
    cover_letter_gen_ms: phaseMs(state, 't_cl_gen_start', 't_cl_gen_end'),
    cover_letter_compile_ms: phaseMs(state, 't_cl_compile_start', 't_cl_compile_end'),
    total_ms: phaseMs(state, 't_url_start', 't_url_end'),
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "read-timer|not ok"`

Expected: all three `read-timer` tests pass.

- [ ] **Step 5: Commit**

```bash
git add yash-resume-pipeline.mjs tests/yash-resume-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(yash-resume-pipeline): read-timer subcommand

Reads timer state, computes phase ms deltas, returns JSON with
{jd_fetch_ms, resume_gen_ms, resume_compile_ms, cover_letter_gen_ms,
cover_letter_compile_ms, total_ms}. Unstamped phases return null.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extend `log` with `--from-timer` flag

**Files:**
- Modify: `yash-resume-pipeline.mjs` (extend `SUBCOMMANDS['log']`)
- Test: `tests/yash-resume-pipeline.test.mjs` (append test block)

- [ ] **Step 1: Write the failing test**

Append to `tests/yash-resume-pipeline.test.mjs`:

```javascript
test('log --from-timer: pulls phase ms from timer state', async () => {
  // Set up a temp project root for the runs log
  const dir = await mkdtemp(join(tmpdir(), 'yrp-logtimer-'));
  await mkdirTest(join(dir, 'data'), { recursive: true });
  // Init + populate timer
  await execFileP('node', [SCRIPT, 'init-timer', '--url', 'https://example.com/x'], { cwd: dir });
  await execFileP('node', [SCRIPT, 'mark-phase', '--phase', 'jd_fetch_start'], { cwd: dir });
  await new Promise(r => setTimeout(r, 30));
  await execFileP('node', [SCRIPT, 'mark-phase', '--phase', 'jd_fetch_end'], { cwd: dir });
  await execFileP('node', [SCRIPT, 'mark-phase', '--phase', 'url_end'], { cwd: dir });
  // Now log --from-timer
  const { stdout } = await execFileP('node', [SCRIPT, 'log',
    '--status', 'ok',
    '--url', 'https://example.com/x',
    '--from-timer',
  ], { cwd: dir });
  assert.equal(JSON.parse(stdout).status, 'ok');
  const logContent = await readFileTest(join(dir, 'data/yash-resume-runs.log'), 'utf-8');
  const line = JSON.parse(logContent.trim().split('\n').pop());
  assert.ok(line.jd_fetch_ms >= 20 && line.jd_fetch_ms < 5000);
  assert.ok(line.total_ms >= line.jd_fetch_ms);
  await rm(`/tmp/yash-pipeline-timer-${process.pid}.json`).catch(() => {});
  await rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "from-timer|not ok"`

Expected: test fails because `--from-timer` is silently ignored (no `jd_fetch_ms` in the JSONL line).

- [ ] **Step 3: Extend `SUBCOMMANDS['log']`**

In `yash-resume-pipeline.mjs`, find this block inside `SUBCOMMANDS['log']` (around line 326):

```javascript
  // Phase timing fields (integer milliseconds; additive — existing fields are never removed)
  const timingFields = ['jd-fetch-ms', 'resume-gen-ms', 'resume-compile-ms', 'cover-letter-gen-ms', 'cover-letter-compile-ms', 'total-ms'];
  for (const f of timingFields) {
    if (args[f] !== undefined) {
      const v = parseInt(args[f], 10);
      if (!Number.isNaN(v)) payload[f.replace(/-/g, '_')] = v;
    }
  }
```

Replace it with:

```javascript
  // Phase timing fields (integer milliseconds; additive — existing fields are never removed)
  const timingFields = ['jd-fetch-ms', 'resume-gen-ms', 'resume-compile-ms', 'cover-letter-gen-ms', 'cover-letter-compile-ms', 'total-ms'];

  if (args['from-timer']) {
    // Pull phase ms from timer state file (written by mark-phase calls).
    const state = await readTimerState();
    if (!state) fail('log --from-timer requires init-timer to have run first');
    const fromTimer = {
      jd_fetch_ms: phaseMs(state, 't_jd_fetch_start', 't_jd_fetch_end'),
      resume_gen_ms: phaseMs(state, 't_resume_gen_start', 't_resume_gen_end'),
      resume_compile_ms: phaseMs(state, 't_resume_compile_start', 't_resume_compile_end'),
      cover_letter_gen_ms: phaseMs(state, 't_cl_gen_start', 't_cl_gen_end'),
      cover_letter_compile_ms: phaseMs(state, 't_cl_compile_start', 't_cl_compile_end'),
      total_ms: phaseMs(state, 't_url_start', 't_url_end'),
    };
    for (const [k, v] of Object.entries(fromTimer)) {
      if (v !== null) payload[k] = v;
    }
  }

  // Explicit --*-ms flags still work (and override --from-timer values).
  for (const f of timingFields) {
    if (args[f] !== undefined) {
      const v = parseInt(args[f], 10);
      if (!Number.isNaN(v)) payload[f.replace(/-/g, '_')] = v;
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/yash-resume-pipeline.test.mjs 2>&1 | grep -E "from-timer|not ok"`

Expected: the `log --from-timer` test passes.

- [ ] **Step 5: Commit**

```bash
git add yash-resume-pipeline.mjs tests/yash-resume-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(yash-resume-pipeline): log --from-timer reads phase ms from timer state

Replaces 6 per-phase --*-ms args with a single --from-timer flag that
auto-fills phase ms from /tmp/yash-pipeline-timer-<pid>.json. Backwards
compatible: explicit --jd-fetch-ms etc still work and override.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create `tools/validate_bullets.py`

**Files:**
- Create: `tools/validate_bullets.py`
- Create: `tests/validators.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/validators.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function runPython(scriptRel, stdinJson) {
  const py = resolve(ROOT, scriptRel);
  const child = execFileP('python3', [py], { cwd: ROOT });
  child.child.stdin.write(JSON.stringify(stdinJson));
  child.child.stdin.end();
  try {
    const { stdout, stderr } = await child;
    return { code: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return { code: e.code ?? 1, stdout: (e.stdout ?? '').trim(), stderr: (e.stderr ?? '').trim() };
  }
}

test('validate_bullets: all 15 in-band returns pass:true', async () => {
  const bullets = {};
  for (const id of ['M1','M2','M3','M4','M5','M6','B1','B2','B3','B4','B5','V1','V2','V3','V4']) {
    bullets[id] = 'x'.repeat(225); // 225 chars, in [220,230]
  }
  const { code, stdout } = await runPython('tools/validate_bullets.py', bullets);
  assert.equal(code, 0);
  const obj = JSON.parse(stdout);
  assert.equal(obj.pass, true);
  assert.deepEqual(obj.fails, []);
});

test('validate_bullets: short bullet returns fails with direction:low', async () => {
  const bullets = { M1: 'x'.repeat(225), M2: 'x'.repeat(200) };
  const { stdout } = await runPython('tools/validate_bullets.py', bullets);
  const obj = JSON.parse(stdout);
  assert.equal(obj.pass, false);
  assert.equal(obj.fails.length, 1);
  assert.equal(obj.fails[0].id, 'M2');
  assert.equal(obj.fails[0].len, 200);
  assert.equal(obj.fails[0].direction, 'low');
});

test('validate_bullets: long bullet returns fails with direction:high', async () => {
  const bullets = { M1: 'x'.repeat(225), M2: 'x'.repeat(250) };
  const { stdout } = await runPython('tools/validate_bullets.py', bullets);
  const obj = JSON.parse(stdout);
  assert.equal(obj.pass, false);
  assert.equal(obj.fails[0].direction, 'high');
});

test('validate_bullets: latex markup is stripped before measuring', async () => {
  // 225 plain chars wrapped in \textbf{...} should still measure 225
  const text = '\\textbf{' + 'x'.repeat(225) + '}';
  const { stdout } = await runPython('tools/validate_bullets.py', { M1: text });
  const obj = JSON.parse(stdout);
  assert.equal(obj.fails.find(f => f.id === 'M1'), undefined);
});

test('validate_bullets: empty input returns pass:true and 15 missing ids', async () => {
  const { stdout } = await runPython('tools/validate_bullets.py', {});
  const obj = JSON.parse(stdout);
  assert.equal(obj.pass, false);
  // 15 missing bullets, each flagged
  assert.equal(obj.fails.length, 15);
  assert.ok(obj.fails.every(f => f.direction === 'missing'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validators.test.mjs 2>&1 | grep -E "validate_bullets|not ok"`

Expected: all 5 tests fail with `ENOENT` because `tools/validate_bullets.py` doesn't exist.

- [ ] **Step 3: Create `tools/validate_bullets.py`**

```bash
mkdir -p tools
```

Create `tools/validate_bullets.py`:

```python
#!/usr/bin/env python3
"""validate_bullets.py — stdin JSON validator for the 15 resume bullets.

Input (stdin JSON):
    {"M1": "<text>", "M2": "<text>", ..., "V4": "<text>"}
    Text may contain LaTeX markup; the validator strips it before measuring.

Output (stdout JSON):
    {"pass": bool, "fails": [{"id", "len", "direction": "low"|"high"|"missing"}, ...]}

Band: visible-text length must be in [220, 230] inclusive.
"""
import json
import re
import sys

BAND_LOW = 220
BAND_HIGH = 230
EXPECTED_IDS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6',
                'B1', 'B2', 'B3', 'B4', 'B5',
                'V1', 'V2', 'V3', 'V4']

def strip_latex(s: str) -> str:
    """Strip LaTeX markup that does not count toward visible length."""
    s = re.sub(r'\\textbf\{([^}]*)\}', r'\1', s)
    s = re.sub(r'\\href\{[^}]*\}\{([^}]*)\}', r'\1', s)
    s = re.sub(r'\\resumeItem\{([^}]*)\}', r'\1', s)
    s = s.replace(r'\%', '%').replace(r'\&', '&').replace(r'\$', '$') \
         .replace(r'\#', '#').replace(r'\_', '_')
    return s

def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        json.dump({'pass': False, 'error': f'invalid JSON: {e}'}, sys.stdout)
        sys.exit(1)

    fails = []
    for bid in EXPECTED_IDS:
        if bid not in data:
            fails.append({'id': bid, 'len': 0, 'direction': 'missing'})
            continue
        visible = strip_latex(data[bid])
        n = len(visible)
        if n < BAND_LOW:
            fails.append({'id': bid, 'len': n, 'direction': 'low'})
        elif n > BAND_HIGH:
            fails.append({'id': bid, 'len': n, 'direction': 'high'})

    out = {'pass': len(fails) == 0, 'fails': fails}
    json.dump(out, sys.stdout)
    sys.stdout.write('\n')

if __name__ == '__main__':
    main()
```

Make it executable:

```bash
chmod +x tools/validate_bullets.py
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validators.test.mjs 2>&1 | grep -E "validate_bullets|not ok"`

Expected: all 5 `validate_bullets` tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/validate_bullets.py tests/validators.test.mjs
git commit -m "$(cat <<'EOF'
feat(tools): validate_bullets.py — stdin JSON bullet band validator

Strips LaTeX markup (\textbf, \href, \resumeItem, escapes), measures
visible length, validates 220-230 inclusive for all 15 IDs (M1-M6,
B1-B5, V1-V4). Used by the plan-bullets step in the pipeline mode.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Create `tools/validate_skills.py`

**Files:**
- Create: `tools/validate_skills.py`
- Modify: `tests/validators.test.mjs` (append test block)

- [ ] **Step 1: Write the failing test**

Append to `tests/validators.test.mjs`:

```javascript
test('validate_skills: all categories within cap returns pass:true', async () => {
  const skills = {
    'AI & Automation': { text: 'x'.repeat(80), cap: 97 },
    'Languages': { text: 'x'.repeat(50), cap: 88 },
    'Frameworks & Web': { text: 'x'.repeat(60), cap: 88 },
    'Data & Databases': { text: 'x'.repeat(65), cap: 91 },
    'Cloud & DevOps': { text: 'x'.repeat(70), cap: 87 },
    'Tools & Platforms': { text: 'x'.repeat(75), cap: 86 },
  };
  const { code, stdout } = await runPython('tools/validate_skills.py', skills);
  assert.equal(code, 0);
  const obj = JSON.parse(stdout);
  assert.equal(obj.pass, true);
  assert.deepEqual(obj.fails, []);
});

test('validate_skills: over-cap category returns fails', async () => {
  const skills = {
    'AI & Automation': { text: 'x'.repeat(100), cap: 97 },
  };
  const { stdout } = await runPython('tools/validate_skills.py', skills);
  const obj = JSON.parse(stdout);
  assert.equal(obj.pass, false);
  assert.equal(obj.fails[0].category, 'AI & Automation');
  assert.equal(obj.fails[0].len, 100);
  assert.equal(obj.fails[0].cap, 97);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validators.test.mjs 2>&1 | grep -E "validate_skills|not ok"`

Expected: 2 `validate_skills` tests fail with `ENOENT`.

- [ ] **Step 3: Create `tools/validate_skills.py`**

```python
#!/usr/bin/env python3
"""validate_skills.py — stdin JSON validator for the 6 skill categories.

Input (stdin JSON):
    {"AI & Automation": {"text": "...", "cap": 97}, ...}

Output (stdout JSON):
    {"pass": bool, "fails": [{"category", "len", "cap"}, ...]}

A category fails if len(text) > cap.
"""
import json
import sys

def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        json.dump({'pass': False, 'error': f'invalid JSON: {e}'}, sys.stdout)
        sys.exit(1)

    fails = []
    for category, spec in data.items():
        text = spec.get('text', '')
        cap = spec.get('cap', 0)
        n = len(text)
        if n > cap:
            fails.append({'category': category, 'len': n, 'cap': cap})

    out = {'pass': len(fails) == 0, 'fails': fails}
    json.dump(out, sys.stdout)
    sys.stdout.write('\n')

if __name__ == '__main__':
    main()
```

```bash
chmod +x tools/validate_skills.py
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validators.test.mjs 2>&1 | grep -E "validate_skills|not ok"`

Expected: 2 `validate_skills` tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/validate_skills.py tests/validators.test.mjs
git commit -m "$(cat <<'EOF'
feat(tools): validate_skills.py — stdin JSON skill cap validator

Validates each of the 6 V2.0 skill categories against its char cap.
Returns fails list with {category, len, cap} for over-cap entries.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Build fixtures from today's Scribd run

**Files:**
- Create: `tests/fixtures/scribd-jd.json`
- Create: `tests/fixtures/scribd-bullets.json`
- Create: `tests/fixtures/scribd-skills.json`
- Create: `tests/fixtures/scribd-resume.tex`
- Create: `tests/fixtures/scribd-cover-letter.tex`

- [ ] **Step 1: Copy today's `.tex` files into fixtures**

```bash
mkdir -p tests/fixtures
cp /tmp/Scribd_SoftwareEngineerIiBackendDataPipelines_Yash_Anghan_Resume_2026-05-13.tex \
   tests/fixtures/scribd-resume.tex
cp /tmp/Scribd_SoftwareEngineerIiBackendDataPipelines_Yash_Anghan_Cover_Letter_2026-05-13.tex \
   tests/fixtures/scribd-cover-letter.tex
ls -la tests/fixtures/scribd-*.tex
```

Expected: both files copied, ~5 KB and ~3 KB.

If the `/tmp/` files no longer exist (next session), copy from the canonical run output:

```bash
# Fallback: regenerate scribd-resume.tex from the committed PDF.
# Skip this step — it requires re-running the pipeline. Stop and ask the user.
```

- [ ] **Step 2: Create `tests/fixtures/scribd-jd.json`**

This is the scrapling-shaped JSON from today's fetch. Write it via heredoc so the structure is exact:

```bash
node -e '
const data = {
  status: "ok",
  url: "https://jobs.ashbyhq.com/scribdinc/68bf4ab2-192f-4420-91ac-72b072339293?source=linkedin",
  title: "Software Engineer II (Backend + Data pipelines) @ Scribd, Inc.",
  body: require("fs").readFileSync("jds/yash/JD_Scribd_SoftwareEngineerIiBackendDataPipelines_Yash_Anghan_2026-05-13.md", "utf-8")
    .split("\n").slice(13).join("\n").trim(),
  source_hint: "ashby"
};
require("fs").writeFileSync("tests/fixtures/scribd-jd.json", JSON.stringify(data, null, 2));
'
ls -la tests/fixtures/scribd-jd.json
```

Expected: file ~12 KB.

- [ ] **Step 3: Create `tests/fixtures/scribd-bullets.json`**

Write the 15 plain-text bullets (no LaTeX markup, taken from today's `.tex` with markup already stripped):

```bash
cat > tests/fixtures/scribd-bullets.json <<'EOF'
{
  "M1": "Engineered Python data pipelines for AI-powered metadata extraction and enrichment from investment research reports, reducing manual analyst review time by 65% across global enterprise research and content discovery teams",
  "M2": "Developed machine learning models on Databricks for financial data classification with embeddings, improving categorization accuracy to 94% across 12K monthly fund documents and accelerating downstream research analyst workflows",
  "M3": "Built LLM-based generative AI retrieval-augmented generation systems enabling natural language queries against proprietary financial databases, accelerating equity research workflows by 50% for senior investment analyst teams",
  "M4": "Implemented automated validation and monitoring workflows for SEC filing data with anomaly detection, surfacing 340+ discrepancies each month and ensuring regulatory compliance across global fund reporting and audit operations",
  "M5": "Created LLM-driven summarization and classification tooling for quarterly earnings reports leveraging Airflow orchestration, delivering analyst-ready research briefs in under 30 seconds per document for global equity desks",
  "M6": "Deployed scalable inference infrastructure on AWS Sagemaker provisioned with Terraform as code, supporting 25K+ daily prediction requests at sub-200ms latency across analyst-facing financial product and reporting surfaces",
  "B1": "Developed microservices architecture for real-time billing calculations and distributed systems, handling 45K daily transactions with 99.9% uptime for subscriber account management across enterprise-grade telecom operations",
  "B2": "Implemented REST APIs and HTTP APIs powering customer self-service portals with backend service integrations, serving 850K active subscribers with sub-100ms response times across mobile and web telecom self-service platforms",
  "B3": "Architected event-driven order management system using message queues for asynchronous data pipelines, reducing service provisioning time by 55% across enterprise telecom operations and field activation engineering workflows",
  "B4": "Built automated CI/CD pipelines and automated monitoring for microservice deployments using Docker and Jenkins, increasing release frequency from monthly to weekly cycles and accelerating subscriber-facing telecom feature rollouts",
  "B5": "Optimized SQL queries and indexes for subscriber usage analytics dashboards, achieving 60% improvement in report generation performance and accelerating downstream telecom operations analytics across all regional markets",
  "V1": "Built transaction processing modules for core banking platform with high-throughput backend services, handling 120K daily payment transactions with 99.7% accuracy for enterprise banking and consumer settlement operations",
  "V2": "Engineered REST APIs for payment gateway integrations with secure backend communication, reducing transaction settlement time by 40% for enterprise banking clients and accelerating cross-border payment reconciliation workflows",
  "V3": "Developed batch processing systems for end-of-day settlements and reconciliation, processing 85K records nightly with automated error reconciliation and validation checkpoints across compliance and audit-ready banking ledgers",
  "V4": "Optimized SQL queries for high-volume transaction tables with indexing strategies, achieving 52% reduction in report generation time for compliance audits and end-of-quarter regulatory filings across banking client portfolios"
}
EOF
```

Verify all 15 are in-band:

```bash
python3 tools/validate_bullets.py < tests/fixtures/scribd-bullets.json
```

Expected: `{"pass": true, "fails": []}`

- [ ] **Step 4: Create `tests/fixtures/scribd-skills.json`**

```bash
cat > tests/fixtures/scribd-skills.json <<'EOF'
{
  "AI & Automation": {
    "text": "LLMs, Generative AI, Machine Learning, RAG, Sagemaker, Vector Databases, n8n, Make.com",
    "cap": 97
  },
  "Languages": {
    "text": "Python, Scala, Ruby, Java, JavaScript, TypeScript, SQL",
    "cap": 88
  },
  "Frameworks & Web": {
    "text": "Ruby on Rails, Spring Boot, React, Node.js, Express, Angular",
    "cap": 88
  },
  "Data & Databases": {
    "text": "Spark, Databricks, Airflow, PostgreSQL, MongoDB, Redis, Elasticsearch",
    "cap": 91
  },
  "Cloud & DevOps": {
    "text": "AWS (Lambda, ECS, EKS, SQS, ElastiCache, Sagemaker), Terraform, Docker",
    "cap": 87
  },
  "Tools & Platforms": {
    "text": "Datadog, Cloudwatch, Playwright, PyTest, JUnit, Git, GitHub Actions",
    "cap": 86
  }
}
EOF
```

Verify:

```bash
python3 tools/validate_skills.py < tests/fixtures/scribd-skills.json
```

Expected: `{"pass": true, "fails": []}`

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/scribd-jd.json tests/fixtures/scribd-bullets.json tests/fixtures/scribd-skills.json tests/fixtures/scribd-resume.tex tests/fixtures/scribd-cover-letter.tex
git commit -m "$(cat <<'EOF'
test(fixtures): scribd smoke fixtures from 2026-05-13 successful run

Captures scrapling JSON, 15 in-band bullets, 6 within-cap skills, and
verbatim resume/CL .tex files for the e2e smoke test runner.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Write the E2E smoke test runner

**Files:**
- Create: `tests/e2e-smoke.mjs`

- [ ] **Step 1: Create the smoke test runner**

```javascript
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
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = resolve(ROOT, 'tests/fixtures');
const SCRIPT = resolve(ROOT, 'yash-resume-pipeline.mjs');

const SLUG = 'Scribd-Test';
const ROLE_SLUG = 'SmokeTest';
const DATE = new Date().toISOString().slice(0, 10);

// Paths the smoke test produces and cleans up.
const ARTIFACTS = {
  jd: resolve(ROOT, `jds/yash/JD_${SLUG}_${ROLE_SLUG}_Yash_Anghan_${DATE}.md`),
  texResume: resolve('/tmp', `${SLUG}_${ROLE_SLUG}_Yash_Anghan_Resume_${DATE}.tex`),
  pdfResume: resolve(ROOT, `resumes/yash/${SLUG}_${ROLE_SLUG}_Yash_Anghan_Resume_${DATE}.pdf`),
  texCL: resolve('/tmp', `${SLUG}_${ROLE_SLUG}_Yash_Anghan_Cover_Letter_${DATE}.tex`),
  pdfCL: resolve(ROOT, `cover-letters/yash/${SLUG}_${ROLE_SLUG}_Yash_Anghan_Cover_Letter_${DATE}.pdf`),
  logResume: resolve(ROOT, `resume-logs/yash/${SLUG}_${ROLE_SLUG}_Yash_Anghan_Resume_${DATE}.log`),
  logCL: resolve(ROOT, `cover-letter-logs/yash/${SLUG}_${ROLE_SLUG}_Yash_Anghan_Cover_Letter_${DATE}.log`),
  timer: `/tmp/yash-pipeline-timer-${process.pid}.json`,
};

let pass = 0, fail = 0;
function ok(msg) { console.log('  ✅', msg); pass++; }
function ng(msg) { console.log('  ❌', msg); fail++; }

async function runNode(args) {
  const { stdout } = await execFileP('node', [SCRIPT, ...args], { cwd: ROOT });
  return JSON.parse(stdout.trim());
}

async function runPython(scriptRel, stdinObj) {
  const py = resolve(ROOT, scriptRel);
  const child = execFile('python3', [py], { cwd: ROOT });
  child.stdin.write(JSON.stringify(stdinObj));
  child.stdin.end();
  return new Promise((res, rej) => {
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => res({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on('error', rej);
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
  const init = await runNode(['init-timer', '--url', 'https://example.com/smoke/scribd-test']);
  if (init.status !== 'ok') return ng(`init-timer: ${init.error}`);
  ok('init-timer');

  // 2. slugify
  const slug = await runNode(['slugify', '--company', 'Scribd', '--role', 'Software Engineer II Backend Data pipelines']);
  if (slug.company_slug !== 'Scribd' || slug.role_slug !== 'SoftwareEngineerIiBackendDataPipelines') {
    return ng(`slugify returned unexpected values: ${JSON.stringify(slug)}`);
  }
  ok('slugify');

  // 3. check-duplicate (using -Test slugs to avoid colliding with real runs)
  const dup = await runNode(['check-duplicate', '--company-slug', SLUG, '--role-slug', ROLE_SLUG, '--date', DATE]);
  if (dup.exists !== false) return ng(`check-duplicate.exists should be false, got: ${dup.exists}`);
  ok('check-duplicate (no collision)');

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
  ok('JD .md written');

  // 5. validate_bullets
  const bullets = JSON.parse(await readFile(resolve(FIXTURES, 'scribd-bullets.json'), 'utf-8'));
  const bv = await runPython('tools/validate_bullets.py', bullets);
  if (bv.code !== 0) return ng(`validate_bullets exit ${bv.code}: ${bv.stderr}`);
  const bvObj = JSON.parse(bv.stdout);
  if (!bvObj.pass) return ng(`validate_bullets fails: ${JSON.stringify(bvObj.fails)}`);
  ok('validate_bullets pass');

  // 6. validate_skills
  const skills = JSON.parse(await readFile(resolve(FIXTURES, 'scribd-skills.json'), 'utf-8'));
  const sv = await runPython('tools/validate_skills.py', skills);
  if (sv.code !== 0) return ng(`validate_skills exit ${sv.code}: ${sv.stderr}`);
  const svObj = JSON.parse(sv.stdout);
  if (!svObj.pass) return ng(`validate_skills fails: ${JSON.stringify(svObj.fails)}`);
  ok('validate_skills pass');

  // 7. Copy + compile resume fixture
  await copyFile(resolve(FIXTURES, 'scribd-resume.tex'), ARTIFACTS.texResume);
  await runNode(['mark-phase', '--phase', 'resume_compile_start']);
  const rc = await runNode(['compile-resume', '--tex', ARTIFACTS.texResume.replace(ROOT + '/', ''), '--pdf', ARTIFACTS.pdfResume.replace(ROOT + '/', '')]);
  if (rc.status !== 'ok') return ng(`compile-resume failed: ${rc.error}`);
  await runNode(['mark-phase', '--phase', 'resume_compile_end']);
  if ((await pageCount(ARTIFACTS.pdfResume)) !== 1) return ng('resume PDF is not 1 page');
  if ((await fileSize(ARTIFACTS.pdfResume)) < 20000) return ng('resume PDF size < 20 KB');
  ok('compile-resume → 1 page, > 20 KB');

  // 8. Copy + compile CL fixture
  await copyFile(resolve(FIXTURES, 'scribd-cover-letter.tex'), ARTIFACTS.texCL);
  await runNode(['mark-phase', '--phase', 'cl_compile_start']);
  const cc = await runNode(['compile-cover-letter', '--tex', ARTIFACTS.texCL.replace(ROOT + '/', ''), '--pdf', ARTIFACTS.pdfCL.replace(ROOT + '/', '')]);
  if (cc.status !== 'ok') return ng(`compile-cover-letter failed: ${cc.error}`);
  await runNode(['mark-phase', '--phase', 'cl_compile_end']);
  if ((await pageCount(ARTIFACTS.pdfCL)) !== 1) return ng('CL PDF is not 1 page');
  if ((await fileSize(ARTIFACTS.pdfCL)) < 15000) return ng('CL PDF size < 15 KB');
  ok('compile-cover-letter → 1 page, > 15 KB');

  // 9. Write sidecar logs
  await mkdir(dirname(ARTIFACTS.logResume), { recursive: true });
  await writeFile(ARTIFACTS.logResume, 'score: 100/100\ndeficiencies: none\nstatus: compiled\n');
  await mkdir(dirname(ARTIFACTS.logCL), { recursive: true });
  await writeFile(ARTIFACTS.logCL, 'score: 100/100\ndeficiencies: none\nstatus: compiled\nresume_keywords_echoed: 15\n');
  ok('sidecar logs written');

  // 10. mark-phase url_end + read-timer
  await runNode(['mark-phase', '--phase', 'url_end']);
  const timer = await runNode(['read-timer']);
  if (timer.total_ms == null || timer.total_ms < 100) return ng(`read-timer total_ms invalid: ${timer.total_ms}`);
  if (timer.resume_compile_ms == null) return ng('read-timer resume_compile_ms is null');
  if (timer.cover_letter_compile_ms == null) return ng('read-timer cover_letter_compile_ms is null');
  ok(`read-timer total_ms=${timer.total_ms}ms`);

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
```

- [ ] **Step 2: Run the smoke test**

```bash
node tests/e2e-smoke.mjs
```

Expected output (truncated):

```
e2e-smoke: starting
  ✅ init-timer
  ✅ slugify
  ✅ check-duplicate (no collision)
  ✅ JD .md written
  ✅ validate_bullets pass
  ✅ validate_skills pass
  ✅ compile-resume → 1 page, > 20 KB
  ✅ compile-cover-letter → 1 page, > 15 KB
  ✅ sidecar logs written
  ✅ read-timer total_ms=XXXXms

e2e-smoke: 10 pass, 0 fail (NN.Ns)
```

Total runtime should be **under 90s**. Exit code 0.

- [ ] **Step 3: Verify no test artifacts remain**

```bash
ls jds/yash/ resumes/yash/ cover-letters/yash/ resume-logs/yash/ cover-letter-logs/yash/ 2>/dev/null | grep -E "Scribd-Test|SmokeTest" || echo "CLEAN"
```

Expected output: `CLEAN`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e-smoke.mjs
git commit -m "$(cat <<'EOF'
test(e2e): smoke runner for yash-resume-pipeline deterministic surface

Sequential fixture-based test of init-timer, slugify, check-duplicate,
validate_bullets, validate_skills, compile-resume, compile-cover-letter,
mark-phase, read-timer. ~30s runtime, no LLM, no network. Cleanup runs
in finally block so artifacts never leak.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Add `npm run smoke` script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script**

Open `package.json` and find the `"scripts"` block. Add a new line in the scripts block:

```json
    "smoke": "node tests/e2e-smoke.mjs",
```

Place it right before `"gemini:eval"` so the diff is minimal.

After: the `scripts` block should look like:

```json
  "scripts": {
    "doctor": "node doctor.mjs",
    "verify": "node verify-pipeline.mjs",
    "normalize": "node normalize-statuses.mjs",
    "dedup": "node dedup-tracker.mjs",
    "merge": "node merge-tracker.mjs",
    "pdf": "node generate-pdf.mjs",
    "sync-check": "node cv-sync-check.mjs",
    "update:check": "node update-system.mjs check",
    "update": "node update-system.mjs apply",
    "rollback": "node update-system.mjs rollback",
    "liveness": "node check-liveness.mjs",
    "scan": "node scan.mjs",
    "smoke": "node tests/e2e-smoke.mjs",
    "gemini:eval": "node gemini-eval.mjs"
  },
```

- [ ] **Step 2: Run `npm run smoke`**

```bash
npm run smoke
```

Expected: same green output as `node tests/e2e-smoke.mjs`. Exit 0.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore(package): add `npm run smoke` for yash-resume-pipeline e2e test

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update `modes/yash-resume-pipeline.md` — bundle timestamps + parallel compile

**Files:**
- Modify: `modes/yash-resume-pipeline.md`

This is the largest single edit. The new flow has three changes from the current mode file:
1. Replace 6 `date -u +%s.%N` Bash calls with `init-timer` / `mark-phase`.
2. Insert step 7a (plan-bullets validation) between current step 7 (apply V2.0) and step 8 (write .tex).
3. Reorder step 9 to launch `compile-resume` in the background so step 9b runs in parallel; add a wait barrier before step 10.
4. Replace the multi-flag `log` call at step 11 with `log --from-timer`.

- [ ] **Step 1: Read current mode file to confirm line numbers**

```bash
grep -n "Record.*now\|t_url_start\|t_jd_fetch\|t_resume\|t_cl\|--jd-fetch-ms\|--resume-gen-ms" modes/yash-resume-pipeline.md
```

Capture the line numbers — they'll change as you edit, but knowing the section anchors helps.

- [ ] **Step 2: Replace step 2.5 timestamp init**

Find the block in `modes/yash-resume-pipeline.md`:

```
   ⏱️ **Record `t_url_start = now`** (used to compute `total_ms` at step 11).
```

Replace with:

```
   ⏱️ **Initialize phase timer:** Run

   ```bash
   node yash-resume-pipeline.mjs init-timer --url <url>
   ```

   The orchestrator writes `/tmp/yash-pipeline-timer-${PID}.json` with `t_url_start`. All subsequent phase-end stamps go through `mark-phase` (see below).
```

- [ ] **Step 3: Replace step 3 timestamp**

Find:

```
   ⏱️ **Record `t_jd_fetch_start = now`**
```

Replace with:

```
   ⏱️ **Mark phase start:**

   ```bash
   node yash-resume-pipeline.mjs mark-phase --phase jd_fetch_start
   ```
```

- [ ] **Step 4: Replace step 4 timestamp end**

Find:

```
   ⏱️ **Record `jd_fetch_ms = now − t_jd_fetch_start`** (covers steps 3–4: scrapling + field parse)
```

Replace with:

```
   ⏱️ **Mark phase end:**

   ```bash
   node yash-resume-pipeline.mjs mark-phase --phase jd_fetch_end
   ```
```

- [ ] **Step 5: Insert step 7a (plan-bullets)**

Find this block in step 7:

```
   ⏱️ **Record `resume_gen_ms = now − t_resume_gen_start`**
```

Just BEFORE that line (i.e., still inside step 7, before the phase-end stamp), insert:

```

   **Step 7a — Plan-bullets table (NEW):**

   Before writing any `.tex`, draft the 15 bullets as plain text in an in-context
   markdown table:

   ```
   | ID | Plain text (no LaTeX markup) |
   |----|-------------------------------|
   | M1 | <visible bullet text> |
   | M2 | ... |
   ...
   | V4 | ... |
   ```

   Run the validator:

   ```bash
   echo '<JSON of bullets keyed by id>' | python3 tools/validate_bullets.py
   ```

   - If `pass: true` → proceed to step 8 (write .tex).
   - If `pass: false` (any bullet outside 220-230):
     - Pass 1 fail: trim/expand the named bullets in-context, run the validator
       a second time.
     - Pass 2 fail: write the `.tex` anyway. In step 10, set the sidecar log to
       `status: compiled-review-recommended` and list the out-of-band bullet
       IDs + lengths in the `deficiencies:` field.
   - **Maximum 2 validator calls per URL.** Never enter a third validation
     cycle — it caused the 200-300s `resume_gen_ms` thrash in past runs.

   Also run the skills validator:

   ```bash
   echo '<JSON of skill categories>' | python3 tools/validate_skills.py
   ```

   - If `pass: false` → emit `SKILLS OVERFLOW ERROR — CANNOT PROCEED` per V2.0
     rules. Hard fail. Run `mark-failed --reason "skills overflow"`.

   ⏱️ **Mark phase end:**

   ```bash
   node yash-resume-pipeline.mjs mark-phase --phase resume_gen_end
   ```
```

Also find the existing step 7 phase-start stamp:

```
   ⏱️ **Record `t_resume_gen_start = now`**
```

Replace with:

```
   ⏱️ **Mark phase start:**

   ```bash
   node yash-resume-pipeline.mjs mark-phase --phase resume_gen_start
   ```
```

- [ ] **Step 6: Reorder step 9 to background mode**

Find step 9 (current text starts with "**Compile to PDF:**" and includes `⏱️ Record t_resume_compile_start`):

Replace the entire step 9 block:

```
9. **Compile to PDF:**

   ⏱️ **Record `t_resume_compile_start = now`**

   ```bash
   node yash-resume-pipeline.mjs compile-resume \
       --tex /tmp/<c>_<r>_Yash_Anghan_Resume_<d>.tex \
       --pdf resumes/yash/<c>_<r>_Yash_Anghan_Resume_<d>.pdf
   ```

   ⏱️ **Record `resume_compile_ms = now − t_resume_compile_start`**

   If `status: fail`:
   - run `mark-failed --url <url> --reason "tectonic: <tectonic_log_tail>"`
   - run `log --status fail --url <url> --reason "tectonic: ..."`
   - keep the .tex on disk for inspection
   - continue automatically to next URL.
```

With:

```
9. **Compile to PDF (background):**

   ⏱️ **Mark phase start:**

   ```bash
   node yash-resume-pipeline.mjs mark-phase --phase resume_compile_start
   ```

   Launch the compile in the background and capture the PID + a stdout file
   for the wait-barrier in step 10:

   ```bash
   node yash-resume-pipeline.mjs compile-resume \
       --tex /tmp/<c>_<r>_Yash_Anghan_Resume_<d>.tex \
       --pdf resumes/yash/<c>_<r>_Yash_Anghan_Resume_<d>.pdf \
       > /tmp/yash-pipeline-compile-resume-<PID>.json 2>&1 &
   echo $! > /tmp/yash-pipeline-compile-resume-<PID>.pid
   ```

   Continue immediately to step 9b — DO NOT wait here. The wait barrier
   lives at step 10 (after CL compile completes).
```

- [ ] **Step 7: Add wait barrier at step 10**

Find the start of step 10:

```
10. **Write sidecar `.log`** to `resume-logs/yash/<c>_<r>_Yash_Anghan_Resume_<d>.log`:
```

Replace with:

```
10. **Wait for background `compile-resume`, then write sidecar `.log`:**

    ```bash
    wait $(cat /tmp/yash-pipeline-compile-resume-<PID>.pid)
    BG_EXIT=$?
    node yash-resume-pipeline.mjs mark-phase --phase resume_compile_end
    ```

    Read `/tmp/yash-pipeline-compile-resume-<PID>.json` to get the JSON status.

    **If `BG_EXIT != 0` or status is `fail`:**
    - Orphan-cleanup: `rm -f cover-letters/yash/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.pdf cover-letter-logs/yash/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.log` (in case the parallel CL compile already wrote one).
    - Run `mark-failed --url <url> --reason "tectonic: <tail of compile-resume json>"`.
    - Run `log --status fail --url <url> --from-timer --reason "tectonic: ..."`.
    - Continue automatically to next URL.

    **If `BG_EXIT == 0`:** write the resume sidecar log to `resume-logs/yash/<c>_<r>_Yash_Anghan_Resume_<d>.log`:

    ```
    score: <X>/100
    deficiencies: <text captured before \documentclass; or "none"; or out-of-band bullet IDs from step 7a pass 2>
    status: compiled | compiled-review-recommended  (review-recommended if score < 90 OR step 7a pass 2 had fails)
    ```
```

- [ ] **Step 8: Update step 9b (CL gen) phase markers**

Find:

```
    ⏱️ **Record `t_cl_gen_start = now`**
```

Replace with:

```
    ⏱️ **Mark phase start:**

    ```bash
    node yash-resume-pipeline.mjs mark-phase --phase cl_gen_start
    ```
```

And the matching end-stamp:

```
    ⏱️ **Record `cover_letter_gen_ms = now − t_cl_gen_start`**
```

Replace with:

```
    ⏱️ **Mark phase end:**

    ```bash
    node yash-resume-pipeline.mjs mark-phase --phase cl_gen_end
    ```
```

- [ ] **Step 9: Update step 11b (CL compile) phase markers**

Find:

```
     ⏱️ **Record `t_cl_compile_start = now`**
```

Replace with:

```
     ⏱️ **Mark phase start:**

     ```bash
     node yash-resume-pipeline.mjs mark-phase --phase cl_compile_start
     ```
```

And:

```
     ⏱️ **Record `cover_letter_compile_ms = now − t_cl_compile_start`**
```

Replace with:

```
     ⏱️ **Mark phase end:**

     ```bash
     node yash-resume-pipeline.mjs mark-phase --phase cl_compile_end
     ```
```

- [ ] **Step 10: Simplify step 11 (`log` call) to use `--from-timer`**

Find this large block in step 11:

```
11. **Mark processed and log:**

    ⏱️ **Record `total_ms = now − t_url_start`**

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
        --cover-letter-status <ok|fail> \
        --jd-fetch-ms <jd_fetch_ms> \
        --resume-gen-ms <resume_gen_ms> \
        --resume-compile-ms <resume_compile_ms> \
        --cover-letter-gen-ms <cover_letter_gen_ms-or-omit-if-cl-failed> \
        --cover-letter-compile-ms <cover_letter_compile_ms-or-omit-if-cl-failed> \
        --total-ms <total_ms>
    ```
```

Replace with:

```
11. **Mark processed and log:**

    ⏱️ **Mark URL end:**

    ```bash
    node yash-resume-pipeline.mjs mark-phase --phase url_end
    ```

    Then:

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
        --cover-letter-status <ok|fail> \
        --from-timer
    ```

    `--from-timer` pulls all 6 phase ms fields (jd_fetch_ms, resume_gen_ms, resume_compile_ms, cover_letter_gen_ms, cover_letter_compile_ms, total_ms) from `/tmp/yash-pipeline-timer-${PID}.json`. Omitted phases (e.g. CL failed) are skipped automatically.
```

- [ ] **Step 11: Verify smoke test still passes**

```bash
node tests/e2e-smoke.mjs
```

Expected: still green, still under 90s.

- [ ] **Step 12: Commit**

```bash
git add modes/yash-resume-pipeline.md
git commit -m "$(cat <<'EOF'
feat(mode): yash-resume-pipeline sub-5min refactor

- Step 7a (NEW): plan-bullets validation with 2-pass max + skills validator,
  caps resume_gen_ms at ~80-120s instead of 200-300s.
- Step 9: compile-resume runs in BG, freeing the orchestrator to run step
  9b (CL gen) in parallel. Wait barrier at step 10 collects both.
- Step 10: orphan-cleanup of CL PDF if compile-resume failed during parallel
  window.
- Phase timestamps now go through init-timer/mark-phase/log --from-timer
  instead of inline `date -u +%s.%N` (saves ~6 bash round-trips per URL).

Locked V2.0 / CL / cv.md prompts untouched. Smoke test green.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update `AGENTS.md`

**Files:**
- Modify: `AGENTS.md` (the "Yash Resume Pipeline" section)

- [ ] **Step 1: Find the existing Yash Resume Pipeline section**

```bash
grep -n "Yash Resume Pipeline\|yash-resume-pipeline" AGENTS.md | head -10
```

- [ ] **Step 2: Append the new entry-point note**

In the `### Yash Resume Pipeline (yash-resume-pipeline)` section, find the "See `modes/yash-resume-pipeline.md`..." line near the bottom. Just BEFORE that line, add:

```markdown
**Performance:** Per-URL cycle targets under 5 min. Step 7a (plan-bullets) runs `tools/validate_bullets.py` and `tools/validate_skills.py` against the 15 bullets and 6 skill categories before any `.tex` is written; the retry budget is hard-capped at 2 passes. Step 9 (resume compile) runs in the background in parallel with step 9b (cover-letter generation). All phase timings flow through `node yash-resume-pipeline.mjs init-timer / mark-phase / log --from-timer`. Run `npm run smoke` (or `node tests/e2e-smoke.mjs`) for a 30-90s end-to-end sanity check that exercises the deterministic Node + Python subcommands against committed Scribd fixtures — no LLM, no network.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "$(cat <<'EOF'
docs(agents): document yash-resume-pipeline sub-5min levers + smoke test

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Manual validation against a real URL

This task has no automated assertion — it's the final acceptance check from the spec.

- [ ] **Step 1: Pick a fresh URL**

Either reuse a recently-added pending URL from `data/yash-pipeline.md`, or pick a fresh listing from LinkedIn / Greenhouse / Ashby / Lever.

```bash
grep "^- \[ \]" data/yash-pipeline.md | head -3
```

If none are pending, add one:

```bash
# Manually edit data/yash-pipeline.md to append a fresh URL under the ## Pendientes section.
```

- [ ] **Step 2: Run the full pipeline**

```bash
/yash-resume-pipeline
```

(Inside Claude Code CLI.)

- [ ] **Step 3: Capture wall clock and JSONL line**

After the run completes:

```bash
# The session prints "Brewed for X" at the bottom — capture that wall-clock figure.

# Then inspect the latest JSONL line:
tail -1 data/yash-resume-runs.log | python3 -m json.tool
```

Expected JSON fields populated:
- `jd_fetch_ms` — integer (non-zero, < 60000 typical)
- `resume_gen_ms` — integer; **target < 120000 (2 min)**
- `resume_compile_ms` — integer; typically 5000-15000
- `cover_letter_gen_ms` — integer; typically 15000-60000
- `cover_letter_compile_ms` — integer; typically 5000-15000
- `total_ms` — integer; **target < 300000 (5 min)** on typical JD, < 360000 (6 min) on hard JD

- [ ] **Step 4: Inspect outputs**

```bash
LATEST_RUN=$(tail -1 data/yash-resume-runs.log | python3 -c "import json,sys;print(json.load(sys.stdin)['slug'])")
DATE=$(date -u +%Y-%m-%d)
.venv/bin/python3 -c "from pypdf import PdfReader; print('resume pages:', len(PdfReader(f'resumes/yash/${LATEST_RUN}_Yash_Anghan_Resume_${DATE}.pdf').pages))"
.venv/bin/python3 -c "from pypdf import PdfReader; print('CL pages:', len(PdfReader(f'cover-letters/yash/${LATEST_RUN}_Yash_Anghan_Cover_Letter_${DATE}.pdf').pages))"
cat resume-logs/yash/${LATEST_RUN}_Yash_Anghan_Resume_${DATE}.log
cat cover-letter-logs/yash/${LATEST_RUN}_Yash_Anghan_Cover_Letter_${DATE}.log
```

Expected:
- `resume pages: 1`
- `CL pages: 1`
- Resume sidecar log: `status: compiled` (or `compiled-review-recommended` on a hard JD)
- CL sidecar log: `resume_keywords_echoed:` ≥ 5

- [ ] **Step 5: If `total_ms` ≥ 300000 (5 min), inspect the slow phase**

If the run came in over 5 min, the JSONL line tells you which phase ran long:

| Phase ms over budget | Likely cause | Mitigation |
|---|---|---|
| `jd_fetch_ms` > 60000 | Workday or other heavy portal | Out of scope — bound by scrapling/Cloudflare. Acceptable. |
| `resume_gen_ms` > 120000 | Plan-bullets retry hit pass-2 fail OR Claude is taking longer than expected per call. | Open the resume sidecar log — if `compiled-review-recommended`, the retry budget kicked in correctly. If `compiled`, untracked LLM latency is the issue (no remediation in this design). |
| `resume_compile_ms` > 20000 | Tectonic stalled | Inspect `/tmp/yash-pipeline-compile-resume-*.json` for the stderr tail. |
| `cover_letter_gen_ms` > 60000 | Cover-letter prompt is heavier than expected | Out of scope — locked prompt. |
| `total_ms` > 360000 (6 min) | Multiple phases combined over budget | If repeatable across 3+ runs, file a follow-up ticket. |

- [ ] **Step 6: Update the `MEMORY.md` with the validated baseline**

```bash
# Write a new memory entry recording the actual wall-clock from this run.
# Example file path: /home/yash/.claude/projects/-yash-superClaudeHuman-projects-yash-ai-automation-career/memory/project_yash_resume_pipeline_sub5min_baseline.md
```

Create the memory file:

```markdown
---
name: project-yash-resume-pipeline-sub5min-baseline
description: Wall-clock baseline after the sub-5min refactor (validated 2026-05-13 plan rollout)
metadata:
  type: project
---

After the sub-5min refactor (commit <commit-sha>): typical /yash-resume-pipeline URL cycle runs in <X>s wall clock. Phase split: jd_fetch=<a>s, resume_gen=<b>s, resume_compile=<c>s, cl_gen=<d>s, cl_compile=<e>s.

**Why:** Past runs averaged 7-10 min and frequently exceeded the user's tolerance threshold; the refactor caps resume_gen retry budget at 2 passes (plan-bullets phase), runs resume-compile + CL-gen in parallel, and bundles phase timestamps into Node subcommands.

**How to apply:** Use this number as the regression baseline. If a fresh run exceeds <Y>s wall clock by more than 20%, inspect `data/yash-resume-runs.log` for the slow phase (most often resume_gen_ms; see the troubleshooting table in `docs/superpowers/specs/2026-05-13-yash-resume-pipeline-sub5min-design.md`).

Linked: [[feedback-yash-resume-one-page-ceiling]], [[feedback-v20-canonical-one-page]]
```

Then add to `MEMORY.md`:

```markdown
- [Yash pipeline sub-5min baseline](project_yash_resume_pipeline_sub5min_baseline.md) — wall-clock baseline + per-phase split after the 2026-05-13 refactor
```

- [ ] **Step 7: Commit nothing** (memory lives outside the repo)

Done. The plan is complete.

---

## Self-Review

**Spec coverage check** — every section in `docs/superpowers/specs/2026-05-13-yash-resume-pipeline-sub5min-design.md`:

| Spec section | Task(s) | ✓ |
|---|---|---|
| Background / Out-of-scope | (informational) | ✓ |
| Approach | Tasks 1-10 | ✓ |
| Architecture (`init-timer` / `mark-phase` / `read-timer`) | Tasks 1, 2, 3 | ✓ |
| Architecture (parallel compile + plan-bullets) | Tasks 5, 6, 10 | ✓ |
| Components → modified `yash-resume-pipeline.mjs` | Tasks 1, 2, 3, 4 | ✓ |
| Components → modified `modes/yash-resume-pipeline.md` | Task 10 | ✓ |
| Components → modified `AGENTS.md` | Task 11 | ✓ |
| Components → modified `package.json` | Task 9 | ✓ |
| Components → new `tools/validate_bullets.py` | Task 5 | ✓ |
| Components → new `tools/validate_skills.py` | Task 6 | ✓ |
| Components → new `tests/e2e-smoke.mjs` | Task 8 | ✓ |
| Components → new fixtures | Task 7 | ✓ |
| Public CLI surface (init-timer, mark-phase, read-timer, validators, smoke) | Tasks 1-9 | ✓ |
| Timing budget | Task 12 (validation) | ✓ |
| Failure handling (cases 1-5) | Task 10 (step 7 + step 10 in mode) | ✓ |
| Edge A (orphan cleanup) | Task 10 step 7 | ✓ |
| Edge B (timer state PID-scoping) | Task 1 step 3 (timerStatePath uses pid) | ✓ |
| E2E test plan (12 numbered steps) | Task 8 | ✓ |
| Risk mitigations | All tasks; validation in Task 12 | ✓ |
| Success criteria (1-6) | Task 12 step 3 (assert total_ms < 300000) | ✓ |

No gaps.

**Placeholder scan** — searched the plan for "TBD", "TODO", "implement later", "appropriate", "similar to". Two `<...>` template placeholders remain on purpose:
- In task 10's mode-file diff, `<c>`, `<r>`, `<d>`, `<PID>`, `<X>` are the existing template tokens already used elsewhere in the mode file — these are values Claude substitutes at runtime, not unwritten plan content.
- In task 12, the `<commit-sha>` and `<X>`, `<Y>` in the memory template are runtime values populated when the real run happens.

No actionable placeholders.

**Type consistency check:**
- Subcommand names: `init-timer`, `mark-phase`, `read-timer` — consistent across tasks 1-4, 8, 10.
- Timer state JSON keys: `t_url_start`, `t_jd_fetch_start`, `t_jd_fetch_end`, `t_resume_gen_*`, `t_resume_compile_*`, `t_cl_gen_*`, `t_cl_compile_*`, `t_url_end` — used identically in `init-timer` impl, `mark-phase` impl (ALLOWED_PHASES set), `read-timer` impl (phaseMs calls), and the mode file.
- Phase names in `ALLOWED_PHASES`: 11 values; cross-referenced against mode-file uses in Task 10. All present.
- Validator output shapes: `{pass, fails:[{id, len, direction}]}` for bullets, `{pass, fails:[{category, len, cap}]}` for skills — used identically in test, impl, and smoke test.
- Run-log JSONL field names: `jd_fetch_ms`, `resume_gen_ms`, `resume_compile_ms`, `cover_letter_gen_ms`, `cover_letter_compile_ms`, `total_ms` — matches existing `log` subcommand's snake_case payload keys.

No inconsistencies found.
