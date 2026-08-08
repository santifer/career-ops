/**
 * updater-local-system-edits.test.mjs — BEHAVIORAL coverage for the #2337
 * detector.
 *
 * apply() is ROOT-bound with heavy side effects, so the detection is exported
 * and ctx-injectable and driven here against a throwaway repo — the same shape
 * as updater-rollback-behavior.test.mjs. What is verified is the property that
 * protects the user's work: a local fix upstream has NOT adopted is reported
 * before it is overwritten, and nothing else is.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pass, fail } from './helpers.mjs';
import { gitIn, locallyModifiedSystemFiles } from '../update-system.mjs';

// A repo with an `upstream` branch standing in for FETCH_HEAD, and `main` as
// the install. Both start from a shared base commit, which is what gives
// merge-base a meaningful baseline.
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'co-local-edits-'));
  const g = (...args) => gitIn(dir, ...args);
  g('init', '-q', '-b', 'main', '.');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'Test');
  // A developer or CI image with commit.gpgsign or a global core.hooksPath
  // would make every commit below fail, and all cases would go red for a
  // reason that has nothing to do with the detector (CodeRabbit review).
  g('config', 'commit.gpgsign', 'false');
  g('config', 'core.hooksPath', join(dir, 'no-such-hooks'));
  mkdirSync(join(dir, 'modes'), { recursive: true });
  writeFileSync(join(dir, 'modes', 'pdf.md'), 'shipped pdf\n');
  writeFileSync(join(dir, 'modes', 'cover.md'), 'shipped cover\n');
  writeFileSync(join(dir, 'generate-cover-letter.mjs'), 'shipped script\n');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('branch', 'upstream');
  return { dir, g, ctx: { git: g } };
}

/** Commit a change on the upstream branch and return to main. */
function upstreamChange(repo, file, content) {
  repo.g('checkout', '-q', 'upstream');
  writeFileSync(join(repo.dir, ...file.split('/')), content);
  repo.g('commit', '-qam', `upstream: ${file}`);
  repo.g('checkout', '-q', 'main');
}

const PATHS = ['modes/', 'generate-cover-letter.mjs'];

// ── 1. The reported case: a committed local fix upstream has not adopted ──
{
  const repo = makeRepo();
  upstreamChange(repo, 'modes/pdf.md', 'shipped pdf v2\n');
  writeFileSync(join(repo.dir, 'generate-cover-letter.mjs'), 'local linkedin fix\n');
  repo.g('commit', '-qam', 'local fix');

  const atRisk = locallyModifiedSystemFiles(PATHS, 'upstream', repo.ctx);
  if (atRisk.length === 1 && atRisk[0] === 'generate-cover-letter.mjs') {
    pass('a committed local fix upstream has not adopted is reported (#2337)');
  } else {
    fail(`#1 expected ['generate-cover-letter.mjs'], got ${JSON.stringify(atRisk)}`);
  }
}

// ── 2. An uncommitted local edit counts too — it is just as overwritable ──
{
  const repo = makeRepo();
  upstreamChange(repo, 'modes/pdf.md', 'shipped pdf v2\n');
  writeFileSync(join(repo.dir, 'generate-cover-letter.mjs'), 'uncommitted fix\n');

  const atRisk = locallyModifiedSystemFiles(PATHS, 'upstream', repo.ctx);
  if (atRisk.length === 1 && atRisk[0] === 'generate-cover-letter.mjs') {
    pass('an uncommitted local edit is reported too');
  } else {
    fail(`#2 expected ['generate-cover-letter.mjs'], got ${JSON.stringify(atRisk)}`);
  }
}

// ── 3. A file only UPSTREAM changed is not a local edit — no false alarm ──
{
  const repo = makeRepo();
  upstreamChange(repo, 'modes/pdf.md', 'shipped pdf v2\n');

  const atRisk = locallyModifiedSystemFiles(PATHS, 'upstream', repo.ctx);
  if (atRisk.length === 0) {
    pass('a file changed only upstream raises no warning');
  } else {
    fail(`#3 expected [], got ${JSON.stringify(atRisk)}`);
  }
}

// ── 4. A local fix upstream adopted independently is NOT reported ──
//    The #2337 reporter isolated exactly this: one of their two fixes survived
//    an update because upstream had picked it up. Byte-identical content means
//    the checkout costs nothing, so warning about it would be noise.
{
  const repo = makeRepo();
  upstreamChange(repo, 'generate-cover-letter.mjs', 'the same fix\n');
  writeFileSync(join(repo.dir, 'generate-cover-letter.mjs'), 'the same fix\n');
  repo.g('commit', '-qam', 'local fix, same content');

  const atRisk = locallyModifiedSystemFiles(PATHS, 'upstream', repo.ctx);
  if (atRisk.length === 0) {
    pass('a local fix upstream adopted independently is not reported');
  } else {
    fail(`#4 expected [], got ${JSON.stringify(atRisk)}`);
  }
}

// ── 5. Only manifest paths are inspected — user-layer files never appear ──
{
  const repo = makeRepo();
  writeFileSync(join(repo.dir, 'cv.md'), 'my cv\n');
  repo.g('add', '-A');
  repo.g('commit', '-qm', 'user file');
  upstreamChange(repo, 'modes/pdf.md', 'shipped pdf v2\n');
  writeFileSync(join(repo.dir, 'cv.md'), 'my edited cv\n');

  const atRisk = locallyModifiedSystemFiles(PATHS, 'upstream', repo.ctx);
  if (!atRisk.includes('cv.md')) {
    pass('a user-layer file outside the manifest is never listed');
  } else {
    fail(`#5 cv.md leaked into the system-file warning: ${JSON.stringify(atRisk)}`);
  }
}

// ── 6. Several local edits are all reported, sorted ──
{
  const repo = makeRepo();
  upstreamChange(repo, 'modes/pdf.md', 'shipped pdf v2\n');
  upstreamChange(repo, 'modes/cover.md', 'shipped cover v2\n');
  writeFileSync(join(repo.dir, 'modes', 'pdf.md'), 'local pdf fix\n');
  writeFileSync(join(repo.dir, 'modes', 'cover.md'), 'local cover fix\n');

  const atRisk = locallyModifiedSystemFiles(PATHS, 'upstream', repo.ctx);
  if (JSON.stringify(atRisk) === JSON.stringify(['modes/cover.md', 'modes/pdf.md'])) {
    pass('every locally edited system file is reported, in a stable order');
  } else {
    fail(`#6 expected both modes files sorted, got ${JSON.stringify(atRisk)}`);
  }
}

// ── 7. An unreadable ref degrades the warning, never the update ──
{
  const repo = makeRepo();
  writeFileSync(join(repo.dir, 'modes', 'pdf.md'), 'local edit\n');

  let threw = false;
  let atRisk = null;
  try {
    atRisk = locallyModifiedSystemFiles(PATHS, 'no-such-ref', repo.ctx);
  } catch {
    threw = true;
  }
  if (!threw && Array.isArray(atRisk)) {
    pass('an unreadable upstream ref returns a list instead of throwing');
  } else {
    fail('#7 a bad ref must not throw — it would abort the whole update');
  }
}

// ── 7b. An untracked local file the upstream ref ships is at risk too ──
//    `git diff` never lists untracked files, so this one escaped the two diff
//    sets entirely and would have been overwritten with no warning and no .bak.
{
  const repo = makeRepo();
  // Ships upstream, absent from the install's baseline.
  repo.g('checkout', '-q', 'upstream');
  writeFileSync(join(repo.dir, 'modes', 'new-mode.md'), 'upstream new mode\n');
  repo.g('add', '-A');
  repo.g('commit', '-qm', 'upstream: new mode');
  repo.g('checkout', '-q', 'main');
  // The user wrote their own file at that exact path before updating.
  writeFileSync(join(repo.dir, 'modes', 'new-mode.md'), 'my own notes\n');

  const atRisk = locallyModifiedSystemFiles(PATHS, 'upstream', repo.ctx);
  if (atRisk.includes('modes/new-mode.md')) {
    pass('an untracked local file the upstream ref ships is reported');
  } else {
    fail(`#7b expected modes/new-mode.md, got ${JSON.stringify(atRisk)}`);
  }
}

// ── 7c. An untracked file absent upstream is NOT reported ──
//    The checkout cannot touch it, so listing it would be pure noise.
{
  const repo = makeRepo();
  upstreamChange(repo, 'modes/pdf.md', 'shipped pdf v2\n');
  writeFileSync(join(repo.dir, 'modes', 'my-scratch.md'), 'purely local\n');

  const atRisk = locallyModifiedSystemFiles(PATHS, 'upstream', repo.ctx);
  if (!atRisk.includes('modes/my-scratch.md')) {
    pass('a purely local untracked file is left out of the warning');
  } else {
    fail(`#7c my-scratch.md should not be listed: ${JSON.stringify(atRisk)}`);
  }
}

// ── 8. The exclude pathspec keeps the local content, index included ──
//    This is the mechanism apply() uses instead of checking out and restoring:
//    a restore would leave the INDEX holding the upstream blob, so the scoped
//    commit would record exactly the content the user asked to keep out.
{
  const repo = makeRepo();
  upstreamChange(repo, 'modes/pdf.md', 'shipped pdf v2\n');
  upstreamChange(repo, 'modes/cover.md', 'shipped cover v2\n');
  writeFileSync(join(repo.dir, 'modes', 'cover.md'), 'local cover fix\n');
  repo.g('commit', '-qam', 'local fix');

  const atRisk = locallyModifiedSystemFiles(PATHS, 'upstream', repo.ctx);
  repo.g('checkout', 'upstream', '--', 'modes/', ...atRisk.map((f) => `:(exclude)${f}`));

  const cover = readFileSync(join(repo.dir, 'modes', 'cover.md'), 'utf-8');
  const pdf = readFileSync(join(repo.dir, 'modes', 'pdf.md'), 'utf-8');
  const staged = repo.g('diff', '--cached', '--name-only', 'HEAD').split('\n').filter(Boolean);
  if (cover === 'local cover fix\n' && pdf === 'shipped pdf v2\n' && !staged.includes('modes/cover.md')) {
    pass('the excluded file keeps its local content in the worktree AND the index');
  } else {
    fail(`#8 cover=${JSON.stringify(cover)} pdf=${JSON.stringify(pdf)} staged=${JSON.stringify(staged)}`);
  }
}

// ── 9. Exclusions that cancel the WHOLE pathspec make git fail ──
//    Why apply() skips such an entry outright instead of passing the excludes:
//    the resulting error is indistinguishable from a real checkout failure at
//    the call site, so it would abort the entire update over a file the user
//    asked to keep. Pinning git's behaviour here means a future git that stops
//    erroring — or a refactor that drops the skip — is caught.
{
  const repo = makeRepo();
  upstreamChange(repo, 'generate-cover-letter.mjs', 'upstream script v2\n');
  writeFileSync(join(repo.dir, 'generate-cover-letter.mjs'), 'local fix\n');
  repo.g('commit', '-qam', 'local fix');

  let errored = false;
  try {
    repo.g('checkout', 'upstream', '--', 'generate-cover-letter.mjs', ':(exclude)generate-cover-letter.mjs');
  } catch {
    errored = true;
  }
  const content = readFileSync(join(repo.dir, 'generate-cover-letter.mjs'), 'utf-8');
  if (errored && content === 'local fix\n') {
    pass('a fully-excluded pathspec errors — hence the skip in apply() (#2337)');
  } else {
    fail(`#9 errored=${errored} content=${JSON.stringify(content)}`);
  }
}
