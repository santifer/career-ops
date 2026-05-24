import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUrl } from '../../services/url-validate.mjs';

test('accepts https greenhouse URL', () => {
  const r = validateUrl('https://boards.greenhouse.io/acme/jobs/123');
  assert.equal(r.ok, true);
});

test('accepts http URL with port', () => {
  const r = validateUrl('http://jobs.example.com:8080/role');
  assert.equal(r.ok, true);
});

test('rejects non-http scheme', () => {
  for (const u of ['ftp://x', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<script>']) {
    const r = validateUrl(u);
    assert.equal(r.ok, false, `should reject ${u}`);
    assert.match(r.error, /scheme/i);
  }
});

test('rejects credential injection via @', () => {
  const r = validateUrl('https://user:pass@evil.com');
  assert.equal(r.ok, false);
  assert.match(r.error, /credential|@/i);
});

test('rejects > 2048 chars', () => {
  const r = validateUrl('https://example.com/' + 'a'.repeat(2050));
  assert.equal(r.ok, false);
  assert.match(r.error, /length/i);
});

test('rejects localhost / RFC1918 / link-local', () => {
  for (const u of [
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://10.0.0.1/x',
    'http://172.16.0.1/x',
    'http://172.31.255.254/x',
    'http://192.168.1.1/x',
    'http://169.254.169.254/x',
  ]) {
    const r = validateUrl(u);
    assert.equal(r.ok, false, `should reject ${u}`);
    assert.match(r.error, /private|loopback|link/i);
  }
});

test('rejects malformed URL', () => {
  const r = validateUrl('not a url');
  assert.equal(r.ok, false);
});
