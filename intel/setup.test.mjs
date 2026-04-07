import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateIntelYml, generateEmptyTracker, generateEmptyProspects, generateEmptyIntelligence } from './setup.mjs';

describe('generateIntelYml', () => {
  it('generates valid YAML with API config', () => {
    const profile = {
      candidate: { full_name: 'Jane Smith', location: 'San Francisco, CA' },
      target_roles: { primary: ['Senior AI Engineer'] },
    };
    const yml = generateIntelYml(profile);
    assert.ok(yml.includes('apis:'));
    assert.ok(yml.includes('EXA_API_KEY'));
    assert.ok(yml.includes('schedules:'));
  });
});

describe('generateEmptyTracker', () => {
  it('generates outreach tracker with correct headers', () => {
    const md = generateEmptyTracker();
    assert.ok(md.includes('# Outreach Tracker'));
    assert.ok(md.includes('| # | Date'));
    assert.ok(md.includes('## Queue'));
  });
});

describe('generateEmptyProspects', () => {
  it('generates prospects tracker', () => {
    const md = generateEmptyProspects();
    assert.ok(md.includes('# Prospects'));
    assert.ok(md.includes('## New (unreviewed)'));
  });
});

describe('generateEmptyIntelligence', () => {
  it('generates intelligence briefing', () => {
    const md = generateEmptyIntelligence();
    assert.ok(md.includes('# Intelligence Briefing'));
  });
});
