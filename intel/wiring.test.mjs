/**
 * Tests for wiring.mjs — calibration logging, diff analysis, and voice profiling.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildCalibrationEntry,
  recordOutcome,
  diffDrafts,
  extractVoicePatterns,
  updateVoiceProfile,
} from './wiring.mjs';

// ─── buildCalibrationEntry ────────────────────────────────────────────────────

describe('buildCalibrationEntry', () => {
  it('returns an object with all required fields', () => {
    const entry = buildCalibrationEntry({
      company: 'Acme',
      role: 'VP AI',
      score: 4.2,
      archetype: 'operator',
      action: 'Applied',
      feedback: 'Strong culture fit',
    });
    assert.ok(entry.date);
    assert.equal(entry.company, 'Acme');
    assert.equal(entry.role, 'VP AI');
    assert.equal(entry.score, '4.2');
    assert.equal(entry.action, 'Applied');
    assert.equal(entry.delta, 'Strong culture fit');
    assert.equal(entry.lesson, 'Strong culture fit');
  });

  it('date is in YYYY-MM-DD format', () => {
    const entry = buildCalibrationEntry({ company: 'X', role: 'Y', score: 3 });
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('score is coerced to string', () => {
    const entry = buildCalibrationEntry({ company: 'X', role: 'Y', score: 3.5 });
    assert.equal(typeof entry.score, 'string');
    assert.equal(entry.score, '3.5');
  });

  it('action defaults to empty string when omitted', () => {
    const entry = buildCalibrationEntry({ company: 'X', role: 'Y', score: 4 });
    assert.equal(entry.action, '');
  });

  it('delta and lesson default to empty string when feedback is omitted', () => {
    const entry = buildCalibrationEntry({ company: 'X', role: 'Y', score: 4 });
    assert.equal(entry.delta, '');
    assert.equal(entry.lesson, '');
  });
});

// ─── recordOutcome ────────────────────────────────────────────────────────────

describe('recordOutcome', () => {
  let dir;
  let ledgerPath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wiring-test-'));
    ledgerPath = join(dir, 'strategy-ledger.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends a markdown table row to the ledger', () => {
    const evaluation = { company: 'Acme', role: 'CTO', score: 4.5, action: 'Applied', feedback: 'Great fit' };
    recordOutcome(ledgerPath, evaluation);
    const content = readFileSync(ledgerPath, 'utf-8');
    assert.ok(content.includes('| '));
    assert.ok(content.includes('Acme'));
    assert.ok(content.includes('CTO'));
    assert.ok(content.includes('4.5'));
  });

  it('returns the calibration entry', () => {
    const evaluation = { company: 'Beta', role: 'VP AI', score: 3.8 };
    const entry = recordOutcome(ledgerPath, evaluation);
    assert.equal(entry.company, 'Beta');
    assert.equal(entry.score, '3.8');
  });

  it('appends multiple rows on successive calls', () => {
    recordOutcome(ledgerPath, { company: 'A', role: 'CTO', score: 4 });
    recordOutcome(ledgerPath, { company: 'B', role: 'CPO', score: 3 });
    const content = readFileSync(ledgerPath, 'utf-8');
    assert.ok(content.includes('| A |') || content.includes('A'));
    assert.ok(content.includes('| B |') || content.includes('B'));
  });
});

// ─── diffDrafts ──────────────────────────────────────────────────────────────

describe('diffDrafts', () => {
  it('returns 0 changed and N unchanged for identical texts', () => {
    const text = 'Line one\nLine two\nLine three';
    const result = diffDrafts(text, text);
    assert.equal(result.changed, 0);
    assert.equal(result.unchanged, 3);
  });

  it('counts changed lines when lines differ', () => {
    const original = 'Hello world\nThis is unchanged\nOld line';
    const edited =   'Hello world\nThis is unchanged\nNew line';
    const result = diffDrafts(original, edited);
    assert.equal(result.changed, 1);
    assert.equal(result.unchanged, 2);
  });

  it('counts extra lines in edited as changed', () => {
    const original = 'Line one\nLine two';
    const edited =   'Line one\nLine two\nLine three';
    const result = diffDrafts(original, edited);
    assert.equal(result.changed, 1);
    assert.equal(result.unchanged, 2);
  });

  it('counts extra lines in original as changed', () => {
    const original = 'Line one\nLine two\nLine three';
    const edited =   'Line one\nLine two';
    const result = diffDrafts(original, edited);
    assert.equal(result.changed, 1);
    assert.equal(result.unchanged, 2);
  });

  it('handles empty strings gracefully', () => {
    const result = diffDrafts('', '');
    assert.equal(result.changed, 0);
    assert.equal(result.unchanged, 1); // split('') yields ['']
  });
});

// ─── extractVoicePatterns ─────────────────────────────────────────────────────

describe('extractVoicePatterns', () => {
  it('detects preference for shorter sentences', () => {
    const original = 'This is a very long sentence that goes on and on and on with many words in it. Another long sentence here with lots of words added.';
    const edited =   'Short sentence. Brief. Another short one.';
    const result = extractVoicePatterns(original, edited);
    assert.equal(result.prefersShorterSentences, true);
  });

  it('does not flag shorter preference when lengths are similar', () => {
    const original = 'Hello there. How are you doing today.';
    const edited =   'Hello there. How are you doing today.';
    const result = extractVoicePatterns(original, edited);
    assert.equal(result.prefersShorterSentences, false);
  });

  it('detects preference for informal contractions', () => {
    const original = 'I am excited about this role. I would love to learn more.';
    const edited =   "I'm excited about this role. I'd love to learn more.";
    const result = extractVoicePatterns(original, edited);
    assert.equal(result.prefersInformal, true);
  });

  it('does not flag informal when contractions are equal or fewer', () => {
    const original = "I'm here and I'd like to apply. I've done this before.";
    const edited =   'I am here and I would like to apply. I have done this before.';
    const result = extractVoicePatterns(original, edited);
    assert.equal(result.prefersInformal, false);
  });

  it('returns avgSentenceLength as a rounded number', () => {
    const original = 'One. Two. Three.';
    const edited =   'Four. Five. Six.';
    const result = extractVoicePatterns(original, edited);
    assert.equal(typeof result.avgSentenceLength, 'number');
    assert.ok(Number.isFinite(result.avgSentenceLength));
  });
});

// ─── updateVoiceProfile ───────────────────────────────────────────────────────

describe('updateVoiceProfile', () => {
  let dir;
  let profilePath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'voice-test-'));
    profilePath = join(dir, 'voice-profile.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends a markdown section with date header', () => {
    const patterns = { prefersShorterSentences: true, prefersInformal: false, avgSentenceLength: 12 };
    updateVoiceProfile(profilePath, patterns);
    const content = readFileSync(profilePath, 'utf-8');
    assert.ok(content.includes('##'));
    assert.ok(content.includes('prefersShorterSentences'));
  });

  it('appends multiple times without overwriting', () => {
    const patterns1 = { prefersShorterSentences: true, prefersInformal: false, avgSentenceLength: 10 };
    const patterns2 = { prefersShorterSentences: false, prefersInformal: true, avgSentenceLength: 15 };
    updateVoiceProfile(profilePath, patterns1);
    updateVoiceProfile(profilePath, patterns2);
    const content = readFileSync(profilePath, 'utf-8');
    // Both calls should have written something
    const sectionCount = (content.match(/## /g) || []).length;
    assert.ok(sectionCount >= 2);
  });
});
