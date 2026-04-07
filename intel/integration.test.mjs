import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkSetup, getSetupStatus } from './engine.mjs';
import { generateIntelYml, generateEmptyTracker, generateEmptyProspects, generateEmptyIntelligence } from './setup.mjs';
import { classifyQuery, getRoutingChain, formatRoutingInstructions, QUERY_TYPES } from './router.mjs';

describe('Integration: Full Setup Flow', () => {
  let tmpDir;
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'intel-test-'));
    mkdirSync(join(tmpDir, 'config'), { recursive: true });
    mkdirSync(join(tmpDir, 'data'), { recursive: true });
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('reports not ready before setup', () => {
    const status = checkSetup(tmpDir);
    assert.equal(status.ready, false);
  });

  it('generates and writes all files', () => {
    const profile = { candidate: { full_name: 'Test' }, target_roles: { primary: ['AI Eng'] } };
    writeFileSync(join(tmpDir, 'config', 'intel.yml'), generateIntelYml(profile));
    writeFileSync(join(tmpDir, 'data', 'outreach.md'), generateEmptyTracker());
    writeFileSync(join(tmpDir, 'data', 'prospects.md'), generateEmptyProspects());
    writeFileSync(join(tmpDir, 'data', 'intelligence.md'), generateEmptyIntelligence());
    const status = checkSetup(tmpDir);
    assert.equal(status.ready, true);
  });

  it('getSetupStatus shows Ready: YES after setup', () => {
    const status = checkSetup(tmpDir);
    const text = getSetupStatus(status);
    assert.ok(text.includes('Ready: YES'));
  });
});

describe('Integration: Router end-to-end', () => {
  it('routes HM query with correct classification', () => {
    const query = 'Who is the VP of Engineering at Stripe?';
    const type = classifyQuery(query);
    assert.equal(type, QUERY_TYPES.FIND_PERSON);
    const chain = getRoutingChain(type);
    assert.ok(chain.length > 0);
    // builtin is always present as fallback
    assert.ok(chain.some((entry) => entry.source === 'builtin'));
    const instructions = formatRoutingInstructions(query);
    assert.ok(instructions.includes('PRIMARY'));
    assert.ok(instructions.includes('FIND_PERSON'));
  });

  it('falls back gracefully with no external APIs', () => {
    const query = 'Find ML engineer roles in SF';
    const type = classifyQuery(query);
    const chain = getRoutingChain(type);
    // builtin is always included as fallback
    assert.ok(chain.some((entry) => entry.source === 'builtin'));
  });

  it('formatRoutingInstructions returns complete plan', () => {
    const query = 'https://example.com/job-posting';
    const instructions = formatRoutingInstructions(query);
    assert.ok(instructions.includes('SCRAPE_URL'));
    assert.ok(instructions.includes('Routing chain'));
  });
});
