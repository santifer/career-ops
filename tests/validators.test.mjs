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
  return new Promise((res, rej) => {
    const child = execFile('python3', [py], { cwd: ROOT });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => res({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on('error', rej);
    child.stdin.write(JSON.stringify(stdinJson));
    child.stdin.end();
  });
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
  const bullets = {};
  for (const id of ['M1','M2','M3','M4','M5','M6','B1','B2','B3','B4','B5','V1','V2','V3','V4']) {
    bullets[id] = 'x'.repeat(225);
  }
  bullets.M2 = 'x'.repeat(200);
  const { stdout } = await runPython('tools/validate_bullets.py', bullets);
  const obj = JSON.parse(stdout);
  assert.equal(obj.pass, false);
  assert.equal(obj.fails.length, 1);
  assert.equal(obj.fails[0].id, 'M2');
  assert.equal(obj.fails[0].len, 200);
  assert.equal(obj.fails[0].direction, 'low');
});

test('validate_bullets: long bullet returns fails with direction:high', async () => {
  const bullets = {};
  for (const id of ['M1','M2','M3','M4','M5','M6','B1','B2','B3','B4','B5','V1','V2','V3','V4']) {
    bullets[id] = 'x'.repeat(225);
  }
  bullets.M2 = 'x'.repeat(250);
  const { stdout } = await runPython('tools/validate_bullets.py', bullets);
  const obj = JSON.parse(stdout);
  assert.equal(obj.pass, false);
  assert.equal(obj.fails[0].direction, 'high');
});

test('validate_bullets: latex markup is stripped before measuring', async () => {
  const bullets = {};
  for (const id of ['M1','M2','M3','M4','M5','M6','B1','B2','B3','B4','B5','V1','V2','V3','V4']) {
    bullets[id] = 'x'.repeat(225);
  }
  // 225 plain chars wrapped in \textbf{...} should still measure 225
  bullets.M1 = '\\textbf{' + 'x'.repeat(225) + '}';
  const { stdout } = await runPython('tools/validate_bullets.py', bullets);
  const obj = JSON.parse(stdout);
  // M1 should not be in fails
  assert.equal(obj.fails.find(f => f.id === 'M1'), undefined);
});

test('validate_bullets: empty input flags all 15 as missing', async () => {
  const { stdout } = await runPython('tools/validate_bullets.py', {});
  const obj = JSON.parse(stdout);
  assert.equal(obj.pass, false);
  assert.equal(obj.fails.length, 15);
  assert.ok(obj.fails.every(f => f.direction === 'missing'));
});
