import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileApiMiddleware } from './profile-api.mjs';

function callMiddleware(handler, { method = 'GET' } = {}) {
  const headers = {};
  let body = '';

  const req = { method };
  const res = {
    statusCode: 0,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    end(chunk = '') {
      body += chunk;
    },
  };

  handler(req, res);

  return {
    statusCode: res.statusCode,
    headers,
    json: body ? JSON.parse(body) : null,
  };
}

test('GET /api/profile returns profile JSON without caching', () => {
  const handler = createProfileApiMiddleware({
    profileBuilder: () => ({ identity: { name: 'Runtime Candidate' } }),
  });

  const response = callMiddleware(handler);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/json');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.json, { identity: { name: 'Runtime Candidate' } });
});

test('non-GET /api/profile requests return 405', () => {
  const handler = createProfileApiMiddleware({
    profileBuilder: () => ({ unreachable: true }),
  });

  const response = callMiddleware(handler, { method: 'POST' });

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.json.error, 'method_not_allowed');
});

test('profile parser failures return structured 500 JSON', () => {
  const handler = createProfileApiMiddleware({
    profileBuilder: () => {
      throw new Error('broken fixture');
    },
  });

  const response = callMiddleware(handler);

  assert.equal(response.statusCode, 500);
  assert.equal(response.headers['content-type'], 'application/json');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.json.error, 'profile_read_failed');
  assert.equal(response.json.message, 'broken fixture');
});
