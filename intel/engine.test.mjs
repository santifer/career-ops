import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkSetup, getSetupStatus } from './engine.mjs';

describe('checkSetup', () => {
  it('detects missing intel.yml', () => {
    const status = checkSetup('/nonexistent/path');
    assert.equal(status.intelYml, false);
  });

  it('returns structured status object with all expected keys', () => {
    const status = checkSetup('/nonexistent/path');
    const expectedKeys = [
      'intelYml',
      'strategyLedger',
      'voiceProfile',
      'outreachMd',
      'prospectsMd',
      'intelligenceMd',
      'availableAPIs',
      'gemmaAvailable',
      'gogcliAvailable',
      'ready',
    ];
    for (const key of expectedKeys) {
      assert.ok(key in status, `missing key: ${key}`);
    }
  });

  it('marks not ready when core files missing', () => {
    const status = checkSetup('/nonexistent/path');
    assert.equal(status.ready, false);
  });
});

describe('getSetupStatus', () => {
  it('returns human-readable string containing config/intel.yml', () => {
    const status = checkSetup('/nonexistent/path');
    const output = getSetupStatus(status);
    assert.ok(output.includes('config/intel.yml'));
  });

  it('returns string type', () => {
    const status = checkSetup('/nonexistent/path');
    const output = getSetupStatus(status);
    assert.equal(typeof output, 'string');
  });
});
