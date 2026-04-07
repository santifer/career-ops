/**
 * Wiring — calibration logging, diff analysis, and voice profiling utilities.
 *
 * Bridges the intelligence engine to the strategy ledger and voice profile,
 * recording outcomes and learning from how the user edits drafts.
 */

import { appendFileSync } from 'node:fs';

// ─── Calibration ─────────────────────────────────────────────────────────────

/**
 * Build a calibration entry from an evaluation result.
 *
 * @param {object} params
 * @param {string} params.company
 * @param {string} params.role
 * @param {number|string} params.score
 * @param {string} [params.archetype]
 * @param {string} [params.action]
 * @param {string} [params.feedback]
 * @returns {object}
 */
export function buildCalibrationEntry({ company, role, score, archetype, action, feedback }) {
  return {
    date: new Date().toISOString().slice(0, 10),
    company,
    role,
    score: String(score),
    action: action || '',
    delta: feedback || '',
    lesson: feedback || '',
  };
}

/**
 * Record an evaluation outcome to the strategy ledger.
 * Appends a markdown table row to ledgerPath.
 *
 * @param {string} ledgerPath — absolute path to strategy-ledger.md
 * @param {object} evaluation — raw evaluation fields (company, role, score, action, feedback)
 * @returns {object} the calibration entry that was written
 */
export function recordOutcome(ledgerPath, evaluation) {
  const entry = buildCalibrationEntry(evaluation);
  const row = `| ${entry.date} | ${entry.company} | ${entry.role} | ${entry.score} | ${entry.action} | ${entry.delta} | ${entry.lesson} |\n`;
  appendFileSync(ledgerPath, row, 'utf-8');
  return entry;
}

// ─── Draft Diff ───────────────────────────────────────────────────────────────

/**
 * Compare two text drafts line by line.
 * Extra lines (when lengths differ) count as changed.
 *
 * @param {string} original
 * @param {string} edited
 * @returns {{ changed: number, unchanged: number }}
 */
export function diffDrafts(original, edited) {
  const origLines = original.split('\n');
  const editLines = edited.split('\n');
  const maxLen = Math.max(origLines.length, editLines.length);

  let changed = 0;
  let unchanged = 0;

  for (let i = 0; i < maxLen; i++) {
    if (i >= origLines.length || i >= editLines.length) {
      // Extra line — counts as changed
      changed++;
    } else if (origLines[i] === editLines[i]) {
      unchanged++;
    } else {
      changed++;
    }
  }

  return { changed, unchanged };
}

// ─── Voice Profiling ──────────────────────────────────────────────────────────

const CONTRACTION_RE = /\b(I'd|I'm|I've|can't|won't|don't|isn't|wouldn't|couldn't)\b/gi;

/**
 * Compute average words per sentence for a text.
 * Splits by sentence-ending punctuation; filters empty segments.
 *
 * @param {string} text
 * @returns {number}
 */
function avgSentenceLen(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).filter(Boolean).length, 0);
  return totalWords / sentences.length;
}

/**
 * Count contraction occurrences in a text.
 *
 * @param {string} text
 * @returns {number}
 */
function countContractions(text) {
  const matches = text.match(CONTRACTION_RE);
  return matches ? matches.length : 0;
}

/**
 * Compare original and edited texts to extract voice/style patterns.
 *
 * @param {string} original
 * @param {string} edited
 * @returns {{ prefersShorterSentences: boolean, prefersInformal: boolean, avgSentenceLength: number }}
 */
export function extractVoicePatterns(original, edited) {
  const origAvgLen = avgSentenceLen(original);
  const editAvgLen = avgSentenceLen(edited);

  const prefersShorterSentences = editAvgLen < origAvgLen * 0.85;

  const origContractions = countContractions(original);
  const editContractions = countContractions(edited);
  const prefersInformal = editContractions > origContractions;

  return {
    prefersShorterSentences,
    prefersInformal,
    avgSentenceLength: Math.round(editAvgLen),
  };
}

/**
 * Append a voice pattern observation to the voice profile markdown file.
 *
 * @param {string} profilePath — absolute path to voice-profile.md
 * @param {{ prefersShorterSentences: boolean, prefersInformal: boolean, avgSentenceLength: number }} patterns
 */
export function updateVoiceProfile(profilePath, patterns) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `\n## ${date}\n`,
    ...Object.entries(patterns).map(([k, v]) => `- **${k}**: ${v}`),
    '',
  ];
  appendFileSync(profilePath, lines.join('\n'), 'utf-8');
}
