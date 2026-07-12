import { spawnSync, execFileSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { delimiter, join } from 'path';
import { tmpdir } from 'os';
import { pass, fail, ROOT, getBash, toBashPath } from '../helpers.mjs';

console.log('\nBatch runner — Codex worker');

const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8').replace(/\r\n/g, '\n');
const batchPrompt = readFileSync(join(ROOT, 'batch/batch-prompt.md'), 'utf-8').replace(/\r\n/g, '\n');
const batchMode = readFileSync(join(ROOT, 'modes/batch.md'), 'utf-8').replace(/\r\n/g, '\n');
const architectureDoc = readFileSync(join(ROOT, 'docs/ARCHITECTURE.md'), 'utf-8').replace(/\r\n/g, '\n');
if (
  gitignore.includes('batch/batch-runner.pid\n') &&
  gitignore.includes('batch/batch-runner.paused\n') &&
  gitignore.includes('batch/.batch-state.lock/\n') &&
  gitignore.includes('batch/batch-state.tsv\n') &&
  gitignore.includes('batch/batch-state.tsv.tmp\n') &&
  gitignore.includes('batch/logs/*\n') &&
  gitignore.includes('.resolved-prompt-*\n')
) {
  pass('batch prompts, logs, locks, pause markers, and state remain local and ignored');
} else {
  fail('batch runtime ignore rules do not cover prompts, logs, locks, pause markers, and state');
}
if (
  batchPrompt.includes('batch/tracker-additions/{{REPORT_NUM}}-{company-slug}.tsv') &&
  batchMode.includes('batch/tracker-additions/{report_num}-{company-slug}.tsv') &&
  architectureDoc.includes('batch/tracker-additions/{report_num}-{company-slug}.tsv')
) {
  pass('batch workers write tracker additions with the canonical report-number prefix');
} else {
  fail('batch worker prompt does not use the canonical report-number tracker filename');
}

const tmp = mkdtempSync(join(tmpdir(), 'co-batch-codex-'));
const batchDir = join(tmp, 'batch');
const fakeBin = join(tmp, 'bin');
const configDir = join(tmp, 'config');
const modesDir = join(tmp, 'modes');
const reportsDir = join(tmp, 'reports');
const trackerDir = join(batchDir, 'tracker-additions');

try {
  for (const dir of [batchDir, fakeBin, configDir, modesDir, reportsDir, trackerDir, join(tmp, 'data')]) {
    mkdirSync(dir, { recursive: true });
  }

  const runner = join(batchDir, 'batch-runner.sh');
  writeFileSync(runner, readFileSync(join(ROOT, 'batch/batch-runner.sh'), 'utf-8').replace(/\r\n/g, '\n'));
  execFileSync(getBash(), ['-c', `chmod +x "${toBashPath(runner)}"`], { cwd: tmp });

  writeFileSync(join(batchDir, 'batch-prompt.md'), [
    '# Fixture batch mode context',
    'URL={{URL}}',
    'REPORT={{REPORT_NUM}}',
    'ID={{ID}}',
  ].join('\n') + '\n');
  writeFileSync(join(batchDir, 'batch-input.tsv'), [
    'id\turl\tsource\tnotes',
    '1\thttps://example.com/jobs/fixture\tfixture\t-',
    '2\thttps://example.com/jobs/fixture-two\tfixture\t-',
  ].join('\n') + '\n');
  writeFileSync(join(configDir, 'profile.yml'), 'candidate_marker: fixture-profile-context\n');
  writeFileSync(join(modesDir, '_profile.md'), 'fixture-profile-mode-context\n');
  writeFileSync(join(modesDir, '_custom.md'), 'fixture-custom-mode-context\n');
  writeFileSync(join(reportsDir, '041-existing.md'), '# Existing report\n');

  writeFileSync(join(tmp, 'reserve-report-num.mjs'), [
    "import { appendFileSync, existsSync, readdirSync, unlinkSync, writeFileSync } from 'fs';",
    "import { join } from 'path';",
    "const reports = join(process.cwd(), 'reports');",
    "const marker = join(process.cwd(), 'batch-events.txt');",
    "if (process.argv[2] === '--release') {",
    "  appendFileSync(marker, `release ${process.argv[3]}\\n`);",
    "  const sentinel = join(reports, `${process.argv[3]}-RESERVED.md`);",
    "  if (existsSync(sentinel)) unlinkSync(sentinel);",
    "  process.exit(0);",
    "}",
    "const count = process.argv[2] === '--count' ? Number(process.argv[3]) : 1;",
    "appendFileSync(marker, `reserve ${count}\\n`);",
    "const max = Math.max(0, ...readdirSync(reports).map(name => Number(name.match(/^(\\d+)-/)?.[1] || 0)));",
    "const nums = Array.from({ length: count }, (_, i) => String(max + i + 1).padStart(3, '0'));",
    "for (const num of nums) writeFileSync(join(reports, `${num}-RESERVED.md`), '');",
    "process.stdout.write(count === 1 ? `${nums[0]}\\n` : `${nums[0]}-${nums.at(-1)}\\n`);",
  ].join('\n') + '\n');

  writeFileSync(join(tmp, 'merge-tracker.mjs'), [
    "import { readdirSync, writeFileSync } from 'fs';",
    "if (!readdirSync('reports').some(name => /^\\d{3}-fixture-\\d+\\.md$/.test(name))) process.exit(2);",
    "if (!readdirSync('batch/tracker-additions').some(name => /^\\d{3}-fixture-\\d+\\.tsv$/.test(name))) process.exit(3);",
    "writeFileSync('merge-completed.txt', 'ok\\n');",
  ].join('\n') + '\n');
  writeFileSync(join(tmp, 'reconcile-pipeline.mjs'), 'process.exit(0);\n');
  writeFileSync(join(tmp, 'verify-pipeline.mjs'), 'process.exit(0);\n');

  const fakeCodex = join(fakeBin, 'codex');
  writeFileSync(fakeCodex, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'prompt_file=$(mktemp "$FIXTURE_ROOT/codex-prompt.XXXXXX")',
    'cat > "$prompt_file"',
    'grep -q "Fixture batch mode context" "$prompt_file"',
    'grep -q "fixture-profile-context" "$prompt_file"',
    'grep -q "fixture-profile-mode-context" "$prompt_file"',
    'grep -q "fixture-custom-mode-context" "$prompt_file"',
    'grep -q "Process this job offer" "$prompt_file"',
    'report_num=$(sed -n "s/^REPORT=//p" "$prompt_file" | head -1)',
    'batch_id=$(sed -n "s/^ID=//p" "$prompt_file" | head -1)',
    'printf "%s\\n" "$@" > "$FIXTURE_ROOT/codex-args-${batch_id}.txt"',
    'mv "$prompt_file" "$FIXTURE_ROOT/codex-prompt-${batch_id}.md"',
    'printf "worker %s\\n" "$batch_id" >> "$FIXTURE_ROOT/batch-events.txt"',
    'if [[ "${CODEX_SKIP_ARTIFACTS:-0}" != "1" ]]; then',
    '  printf "# Fixture report\\n" > "$FIXTURE_ROOT/reports/${report_num}-fixture-${batch_id}.md"',
    '  printf "%s\\t2026-07-11\\tFixture\\tEngineer\\tEvaluated\\t4.4/5\\t❌\\t[%s](reports/%s-fixture-%s.md)\\tFixture\\n" "$report_num" "$report_num" "$report_num" "$batch_id" > "$FIXTURE_ROOT/batch/tracker-additions/${report_num}-fixture-${batch_id}.tsv"',
    'fi',
    'printf "{\\"score\\":4.4,\\"report\\":\\"reports/%s-fixture.md\\"}\\n" "$report_num"',
  ].join('\n') + '\n');
  execFileSync(getBash(), ['-c', `chmod +x "${toBashPath(fakeCodex)}"`], { cwd: tmp });

  const env = {
    ...process.env,
    PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
    FIXTURE_ROOT: tmp,
  };
  const expectRunnerFailure = (args, pattern, successMessage) => {
    const failedRun = spawnSync(getBash(), [toBashPath(runner), ...args], {
      cwd: tmp,
      env,
      encoding: 'utf-8',
    });
    if (failedRun.status !== 0 && pattern.test(`${failedRun.stdout}${failedRun.stderr}`)) {
      pass(successMessage);
    } else {
      fail(`${successMessage}: expected validation failure, got status ${failedRun.status}`);
    }
  };

  const result = spawnSync(getBash(), [
    toBashPath(runner),
    '--cli', 'codex',
    '--model', 'gpt-5.5',
    '--reasoning-effort', 'high',
    '--parallel', '2',
    '--skip-pdf',
  ], { cwd: tmp, env, encoding: 'utf-8' });

  if (result.status === 0) pass('Codex fixture evaluation completes successfully');
  else fail(`Codex fixture failed (${result.status}): ${result.stderr || result.stdout}`);

  const argsFile = join(tmp, 'codex-args-1.txt');
  const promptFile = join(tmp, 'codex-prompt-1.md');
  const argv = existsSync(argsFile) ? readFileSync(argsFile, 'utf-8') : '';
  if (
    argv.includes('exec\n') &&
    argv.includes('--model\ngpt-5.5\n') &&
    argv.includes('model_reasoning_effort="high"') &&
    argv.includes('--ephemeral\n') &&
    argv.includes('--ignore-user-config\n') &&
    argv.includes('--sandbox\nworkspace-write\n') &&
    argv.includes('approval_policy="never"') &&
    argv.includes('sandbox_workspace_write.network_access=true') &&
    argv.includes(`--cd\n${tmp}\n`) &&
    argv.endsWith('-\n')
  ) {
    pass('Codex worker CLI, model, reasoning, sandbox, cwd, and ephemeral settings are explicit');
  } else {
    fail(`Codex worker arguments are incomplete: ${JSON.stringify(argv)}`);
  }

  const prompt = existsSync(promptFile) ? readFileSync(promptFile, 'utf-8') : '';
  if (
    prompt.includes('Fixture batch mode context') &&
    prompt.includes('fixture-profile-context') &&
    prompt.includes('fixture-profile-mode-context') &&
    prompt.includes('fixture-custom-mode-context') &&
    prompt.includes('Process this job offer')
  ) {
    pass('Codex receives the batch mode, profile, custom mode, and offer context through stdin');
  } else {
    fail(`Codex prompt context is incomplete: ${JSON.stringify(prompt.slice(0, 500))}`);
  }

  const state = readFileSync(join(batchDir, 'batch-state.tsv'), 'utf-8');
  const batchEvents = readFileSync(join(tmp, 'batch-events.txt'), 'utf-8').trim().split('\n');
  if (
    /\tcompleted\t.*\t042\t4\.4\t/.test(state) &&
    /\tcompleted\t.*\t043\t4\.4\t/.test(state) &&
    existsSync(join(reportsDir, '042-fixture-1.md')) &&
    existsSync(join(reportsDir, '043-fixture-2.md')) &&
    existsSync(join(trackerDir, '042-fixture-1.tsv')) &&
    existsSync(join(trackerDir, '043-fixture-2.tsv')) &&
    !existsSync(join(reportsDir, '042-RESERVED.md')) &&
    !existsSync(join(reportsDir, '043-RESERVED.md')) &&
    batchEvents[0] === 'reserve 2' &&
    batchEvents.filter(event => event.startsWith('worker ')).length === 2 &&
    existsSync(join(tmp, 'merge-completed.txt'))
  ) {
    pass('Codex output uses the canonical report reservation, state, tracker addition, and merge path');
  } else {
    fail(`Codex artifacts did not complete the canonical path: ${JSON.stringify(state)}`);
  }

  writeFileSync(join(batchDir, 'batch-input.tsv'), [
    'id\turl\tsource\tnotes',
    '3\thttps://example.com/jobs/no-artifacts\tfixture\t-',
  ].join('\n') + '\n');
  const noArtifacts = spawnSync(getBash(), [
    toBashPath(runner),
    '--cli', 'codex',
    '--model', 'gpt-5.5',
    '--reasoning-effort', 'high',
    '--parallel', '1',
    '--skip-pdf',
  ], { cwd: tmp, env: { ...env, CODEX_SKIP_ARTIFACTS: '1' }, encoding: 'utf-8' });
  const stateAfterMissing = readFileSync(join(batchDir, 'batch-state.tsv'), 'utf-8');
  if (
    noArtifacts.status === 0 &&
    /3\thttps:\/\/example\.com\/jobs\/no-artifacts\tfailed\t.*\t044\t-\t/.test(stateAfterMissing) &&
    existsSync(join(reportsDir, '044-RESERVED.md')) &&
    !existsSync(join(reportsDir, '044-fixture-3.md')) &&
    !existsSync(join(trackerDir, '044-fixture-3.tsv'))
  ) {
    pass('a zero-exit Codex worker is failed when canonical report and tracker artifacts are missing');
  } else {
    fail(`missing Codex artifacts were accepted: status=${noArtifacts.status}, state=${JSON.stringify(stateAfterMissing)}`);
  }

  expectRunnerFailure(
    ['--cli', 'codex', '--model', 'gpt-5.5', '--reasoning-effort', 'turbo', '--dry-run'],
    /reasoning-effort/,
    'Codex reasoning effort is validated before workers launch',
  );
  expectRunnerFailure(
    ['--cli', 'unknown-worker', '--dry-run'],
    /Unsupported --cli/,
    'unsupported worker CLIs are rejected before executable lookup',
  );
  expectRunnerFailure(
    ['--cli', 'codex', '--reasoning-effort', 'high', '--dry-run'],
    /--model/,
    'Codex model must be selected explicitly',
  );
  expectRunnerFailure(
    ['--rate-limit-sleep', '--parallel', '2', '--dry-run'],
    /--rate-limit-sleep requires an argument/,
    'rate-limit sleep cannot consume the next option as its value',
  );
} catch (error) {
  fail(`Codex batch fixture crashed: ${error.message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
