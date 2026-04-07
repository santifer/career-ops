import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  loadExemplars,
  addExemplar,
  getBestExemplars,
  saveExemplars,
} from './exemplar-manager.mjs';

describe('loadExemplars', () => {
  it('starts with empty exemplar library from nonexistent dir', async () => {
    const exemplars = await loadExemplars('/tmp/nonexistent-exemplar-dir-xyz');
    assert.deepStrictEqual(exemplars, {
      highFit: [],
      lowFit: [],
      calibrationMiss: [],
    });
  });
});

describe('addExemplar', () => {
  it('adds a high-fit exemplar', () => {
    const exemplars = { highFit: [], lowFit: [], calibrationMiss: [] };
    addExemplar(exemplars, 'highFit', {
      company: 'Acme',
      role: 'CTO',
      score: 4.5,
    });
    assert.equal(exemplars.highFit.length, 1);
    assert.equal(exemplars.highFit[0].company, 'Acme');
  });

  it('limits exemplars to maxPerCategory (keeps top 5 scores for highFit)', () => {
    const exemplars = { highFit: [], lowFit: [], calibrationMiss: [] };
    for (let i = 0; i < 10; i++) {
      addExemplar(
        exemplars,
        'highFit',
        { company: `Co${i}`, role: 'Eng', score: 4.0 + i * 0.1 },
        { maxPerCategory: 5 },
      );
    }
    assert.equal(exemplars.highFit.length, 5);
    // Should have kept top 5 scores: 4.9, 4.8, 4.7, 4.6, 4.5
    assert.equal(exemplars.highFit[0].score, 4.9);
    assert.equal(exemplars.highFit[4].score, 4.5);
  });
});

describe('getBestExemplars', () => {
  it('gets best exemplars by keyword relevance', () => {
    const exemplars = {
      highFit: [
        { company: 'AI Co', role: 'CTO', score: 4.8, jdSummary: 'Lead AI team' },
        { company: 'Bank', role: 'Analyst', score: 4.2, jdSummary: 'Finance reports' },
      ],
      lowFit: [],
      calibrationMiss: [],
    };
    const results = getBestExemplars(exemplars, 'AI', 2);
    assert.equal(results[0].company, 'AI Co');
  });
});

describe('saveExemplars / loadExemplars round-trip', () => {
  it('saves and loads exemplars', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'exemplar-test-'));
    try {
      const original = {
        highFit: [{ company: 'X', role: 'Y', score: 4.5 }],
        lowFit: [{ company: 'A', role: 'B', score: 2.0 }],
        calibrationMiss: [],
      };
      await saveExemplars(original, dir);
      const loaded = await loadExemplars(dir);
      assert.deepStrictEqual(loaded, original);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
