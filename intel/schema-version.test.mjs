import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractSchemaVersion, checkCompatibility } from './schema-version.mjs';

describe('extractSchemaVersion', () => {
  it('extracts version number from schema comment', () => {
    const md = '# Prospects\n<!-- SCHEMA_VERSION: 2 -->\n\nSome content.';
    assert.equal(extractSchemaVersion(md), 2);
  });

  it('extracts version 1', () => {
    const md = '<!-- SCHEMA_VERSION: 1 -->\n# Data';
    assert.equal(extractSchemaVersion(md), 1);
  });

  it('handles large version numbers', () => {
    const md = '<!-- SCHEMA_VERSION: 42 -->';
    assert.equal(extractSchemaVersion(md), 42);
  });

  it('returns null if no schema comment', () => {
    assert.equal(extractSchemaVersion('# Just a heading\nNo version here.'), null);
  });

  it('returns null for empty/null input', () => {
    assert.equal(extractSchemaVersion(''), null);
    assert.equal(extractSchemaVersion(null), null);
  });
});

describe('checkCompatibility', () => {
  it('returns compatible when versions match', () => {
    const result = checkCompatibility(2, 2);
    assert.deepEqual(result, { compatible: true });
  });

  it('returns incompatible with message when versions differ', () => {
    const result = checkCompatibility(1, 2);
    assert.equal(result.compatible, false);
    assert.ok(result.message.includes('v1'));
    assert.ok(result.message.includes('v2'));
  });

  it('treats null as version 1 for file version', () => {
    const result = checkCompatibility(null, 1);
    assert.deepEqual(result, { compatible: true });
  });

  it('treats null as version 1 for expected version', () => {
    const result = checkCompatibility(1, null);
    assert.deepEqual(result, { compatible: true });
  });

  it('treats both null as compatible (both v1)', () => {
    const result = checkCompatibility(null, null);
    assert.deepEqual(result, { compatible: true });
  });

  it('null file version is incompatible with v2 expected', () => {
    const result = checkCompatibility(null, 2);
    assert.equal(result.compatible, false);
    assert.ok(result.message.includes('v1'));
    assert.ok(result.message.includes('v2'));
  });
});
