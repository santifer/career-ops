#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

export const APPLICATION_ANSWERS_HEADING = '## Application Answers';

const VALID_STATES = new Set(['filled', 'submitted']);

function inline(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function valueText(value) {
  if (Array.isArray(value)) return value.map(inline).filter(Boolean).join(', ');
  return String(value ?? '').trim();
}

function pick(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (Array.isArray(value)) {
      if (value.length > 0) return value;
      continue;
    }
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return '';
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeState(state) {
  const normalized = inline(state || 'filled').toLowerCase();
  if (!VALID_STATES.has(normalized)) {
    throw new Error(`Application answer state must be one of: ${[...VALID_STATES].join(', ')}`);
  }
  return normalized;
}

function normalizeDate(date) {
  return inline(date || new Date().toISOString().slice(0, 10));
}

function quoteBlock(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '> Not recorded.';
  return text.split('\n').map((line) => `> ${line}`).join('\n');
}

function qaLines(entries, { labelKeys, valueKeys, fallback }) {
  if (entries.length === 0) return ['- None captured.'];

  return entries.flatMap((entry, index) => {
    const label = inline(pick(entry, labelKeys)) || `${fallback} ${index + 1}`;
    const answer = pick(entry, valueKeys);
    return [
      `${index + 1}. **${label}**`,
      '',
      quoteBlock(answer),
      '',
    ];
  }).slice(0, -1);
}

function compactLines(entries, { labelKeys, valueKeys, fallback }) {
  if (entries.length === 0) return ['- None captured.'];

  return entries.map((entry, index) => {
    const label = inline(pick(entry, labelKeys)) || `${fallback} ${index + 1}`;
    const value = valueText(pick(entry, valueKeys)) || 'Not recorded';
    return `${index + 1}. **${label}:** ${value}`;
  });
}

function fileLines(entries) {
  if (entries.length === 0) return ['- None captured.'];

  return entries.map((entry, index) => {
    const label = inline(pick(entry, ['field', 'name', 'label', 'type'])) || `File ${index + 1}`;
    const file = inline(pick(entry, ['path', 'file', 'filename', 'url'])) || 'Not recorded';
    const version = inline(pick(entry, ['version', 'variant']));
    return `${index + 1}. **${label}:** ${version ? `${file} (${version})` : file}`;
  });
}

export function normalizeApplicationAnswersSnapshot(snapshot = {}) {
  return {
    date: normalizeDate(snapshot.date),
    state: normalizeState(snapshot.state),
    freeText: list(snapshot.freeText ?? snapshot.freeTextAnswers ?? snapshot.answers),
    selections: list(snapshot.selections ?? snapshot.selectedOptions),
    fieldValues: list(snapshot.fieldValues ?? snapshot.otherFields ?? snapshot.fields),
    files: list(snapshot.files ?? snapshot.uploads ?? snapshot.filesUsed),
  };
}

export function formatApplicationAnswersSection(snapshot = {}) {
  const normalized = normalizeApplicationAnswersSnapshot(snapshot);
  const lines = [
    APPLICATION_ANSWERS_HEADING,
    '',
    `**Date:** ${normalized.date}`,
    `**State:** ${normalized.state}`,
    '',
    '### Free-text answers',
    '',
    ...qaLines(normalized.freeText, {
      labelKeys: ['question', 'field', 'label', 'prompt'],
      valueKeys: ['answer', 'response', 'value', 'text'],
      fallback: 'Answer',
    }),
    '',
    '### Selections made',
    '',
    ...compactLines(normalized.selections, {
      labelKeys: ['question', 'field', 'label', 'prompt'],
      valueKeys: ['selection', 'selected', 'answer', 'value', 'options'],
      fallback: 'Selection',
    }),
    '',
    '### Other field values',
    '',
    ...compactLines(normalized.fieldValues, {
      labelKeys: ['question', 'field', 'label', 'prompt'],
      valueKeys: ['answer', 'response', 'value', 'text'],
      fallback: 'Field',
    }),
    '',
    '### Files used',
    '',
    ...fileLines(normalized.files),
  ];

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ---------------------------------------------------------------------------
// Reader. The formatter above has been write-only since it shipped: nothing in
// the tree could read a rendered section back, so `modes/apply.md` recovers
// previous answers by grepping reports for a company name. This closes that
// asymmetry so answers become addressable data, the way `contacts.mjs` and
// `assessment-log.mjs` already own both directions of their own formats.
//
// One property is deliberately NOT claimed: byte-equality with the input
// snapshot. The formatter is lossy by design -- `inline()` collapses
// whitespace in labels, `valueText()` joins arrays with ', ', `pick()` discards
// which of the four accepted key spellings was used, and empty values become
// the sentinels 'Not recorded' / '> Not recorded.'. What IS guaranteed, and
// what the tests pin, is that rendering is a fixed point after one pass:
//   parse(format(x)) === parse(format(parse(format(x))))
// ---------------------------------------------------------------------------

const FREE_TEXT_HEADING = '### Free-text answers';
const SELECTIONS_HEADING = '### Selections made';
const FIELD_VALUES_HEADING = '### Other field values';
const FILES_HEADING = '### Files used';

const NONE_CAPTURED = '- None captured.';
const NOT_RECORDED_BLOCK = 'Not recorded.';
const NOT_RECORDED_INLINE = 'Not recorded';

/** Split a rendered section body into its four `###` groups. */
function sliceGroups(body) {
  const order = [
    ['freeText', FREE_TEXT_HEADING],
    ['selections', SELECTIONS_HEADING],
    ['fieldValues', FIELD_VALUES_HEADING],
    ['files', FILES_HEADING],
  ];
  const groups = { freeText: '', selections: '', fieldValues: '', files: '' };

  const marks = order
    .map(([key, heading]) => {
      const re = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
      const hit = re.exec(body);
      return hit ? { key, start: hit.index, end: hit.index + hit[0].length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  marks.forEach((mark, i) => {
    const stop = i + 1 < marks.length ? marks[i + 1].start : body.length;
    groups[mark.key] = body.slice(mark.end, stop).trim();
  });

  return groups;
}

/** `1. **Label**` followed by a `>` quote block. */
function parseQaEntries(block, labelKey, valueKey, onSkip) {
  if (!block || block === NONE_CAPTURED) return [];
  const lines = block.split('\n');
  const entries = [];
  let current = null;
  let quoted = [];

  const flush = () => {
    if (!current) return;
    const text = quoted.join('\n').trim();
    entries.push({
      [labelKey]: current,
      [valueKey]: text === NOT_RECORDED_BLOCK ? '' : text,
    });
    current = null;
    quoted = [];
  };

  for (const line of lines) {
    const head = /^\d+\.\s+\*\*(.*)\*\*\s*$/.exec(line);
    if (head) {
      flush();
      current = head[1].trim();
      continue;
    }
    if (current !== null && /^>/.test(line)) {
      quoted.push(line.replace(/^>\s?/, ''));
      continue;
    }
    // Anything else is unreadable: a heading that lost its numbering, or a
    // quote line with no heading to own it. The second case is the dangerous
    // one — those lines are either dropped (no current entry) or absorbed into
    // the PREVIOUS answer, which corrupts an answer the user really did give.
    if (line.trim()) onSkip?.(line);
  }
  flush();
  return entries;
}

/** `1. **Label:** value` on one line. */
function parseCompactEntries(block, labelKey, valueKey, onSkip) {
  if (!block || block === NONE_CAPTURED) return [];
  const entries = [];
  for (const line of block.split('\n')) {
    const hit = /^\d+\.\s+\*\*(.+):\*\*\s*(.*)$/.exec(line);
    if (!hit) { if (line.trim()) onSkip?.(line); continue; }
    const value = hit[2].trim();
    entries.push({
      [labelKey]: hit[1].trim(),
      [valueKey]: value === NOT_RECORDED_INLINE ? '' : value,
    });
  }
  return entries;
}

/** `1. **Label:** path` or `1. **Label:** path (version)`. */
function parseFileEntries(block, onSkip) {
  if (!block || block === NONE_CAPTURED) return [];
  const entries = [];
  for (const line of block.split('\n')) {
    const hit = /^\d+\.\s+\*\*(.+):\*\*\s*(.*)$/.exec(line);
    if (!hit) { if (line.trim()) onSkip?.(line); continue; }
    const raw = hit[2].trim();
    const versioned = /^(.*\S)\s+\(([^()]*)\)$/.exec(raw);
    const file = versioned ? versioned[1].trim() : raw;
    const entry = {
      field: hit[1].trim(),
      path: file === NOT_RECORDED_INLINE ? '' : file,
    };
    if (versioned && versioned[2].trim()) entry.version = versioned[2].trim();
    entries.push(entry);
  }
  return entries;
}

/**
 * Read a rendered `## Application Answers` section back into a snapshot.
 *
 * Returns the same shape `normalizeApplicationAnswersSnapshot` produces, so the
 * result can be handed straight back to `formatApplicationAnswersSection` or
 * merged with a fresh snapshot. Entry keys are the primary spelling accepted by
 * the formatter (`question`/`answer`, `question`/`selection`, `field`/`path`),
 * which is what makes re-rendering a fixed point.
 *
 * @param {string} reportText Full report markdown.
 * @returns {{date: string, state: string, freeText: object[], selections: object[],
 *            fieldValues: object[], files: object[]} | null}
 *          `null` when the report has no Application Answers section.
 */
export function parseApplicationAnswersSection(reportText, { strict = false } = {}) {
  const skipped = [];
  const onSkip = strict ? (line) => skipped.push(line.trim()) : undefined;
  const report = String(reportText ?? '').replace(/\r\n/g, '\n');
  const heading = /^## Application Answers\s*$/m.exec(report);
  if (!heading) return null;

  const afterHeading = heading.index + heading[0].length;
  const nextHeading = /^## .+$/m.exec(report.slice(afterHeading));
  const body = report.slice(
    afterHeading,
    nextHeading ? afterHeading + nextHeading.index : report.length,
  );

  const dateHit = /^\*\*Date:\*\*\s*(.*)$/m.exec(body);
  const stateHit = /^\*\*State:\*\*\s*(.*)$/m.exec(body);
  const groups = sliceGroups(body);

  const snapshot = {
    date: dateHit ? dateHit[1].trim() : '',
    state: stateHit ? stateHit[1].trim().toLowerCase() : '',
    freeText: parseQaEntries(groups.freeText, 'question', 'answer', onSkip),
    selections: parseCompactEntries(groups.selections, 'question', 'selection', onSkip),
    fieldValues: parseCompactEntries(groups.fieldValues, 'question', 'answer', onSkip),
    files: parseFileEntries(groups.files, onSkip),
  };

  if (strict && skipped.length) {
    throw new Error(
      `Application Answers section has ${skipped.length} unreadable ` +
      `${skipped.length === 1 ? 'entry' : 'entries'}: ${skipped.join(' | ')}`,
    );
  }
  return snapshot;
}

export function upsertApplicationAnswersSection(reportText, snapshot = {}) {
  const report = String(reportText ?? '').replace(/\r\n/g, '\n');
  const section = formatApplicationAnswersSection(snapshot).trimEnd();
  const heading = /^## Application Answers\s*$/m.exec(report);

  if (!heading) {
    return `${report.trimEnd()}\n\n${section}\n`;
  }

  const start = heading.index;
  const afterHeading = start + heading[0].length;
  const nextHeading = /^## .+$/m.exec(report.slice(afterHeading));
  const end = nextHeading ? afterHeading + nextHeading.index : report.length;
  const before = report.slice(0, start).trimEnd();
  const after = report.slice(end).trimStart();

  return [before, section, after].filter(Boolean).join('\n\n') + '\n';
}

/**
 * Read a report's `## Application Answers` back into structured form.
 *
 * The writer above is one half of a round trip that previously had no other half:
 * the CLI `apply` mode re-reads this section as prose and lets a model adapt it,
 * which is fine for a model and useless for a UI that has to render each question
 * in its own editable box. This parses the shape `formatApplicationAnswersSection`
 * emits, so both directions live with the format they describe.
 *
 * Deliberately narrow. It reads the `### Free-text answers` subsection (the
 * question-and-answer pairs) plus the Date/State header, and ignores the compact
 * subsections, which are one-liners a UI can show as prose. Anything it cannot
 * recognize yields an empty list rather than a guess: a wrong question/answer
 * pairing here would be silently re-submitted to an employer later.
 *
 * @param {string} reportText
 * @returns {{present: boolean, date: string, state: string, freeText: Array<{question: string, answer: string}>}}
 */
export function parseApplicationAnswersSection(reportText) {
  const report = String(reportText ?? '').replace(/\r\n/g, '\n');
  const empty = { present: false, date: '', state: '', freeText: [] };
  const heading = /^## Application Answers\s*$/m.exec(report);
  if (!heading) return empty;

  const afterHeading = heading.index + heading[0].length;
  const next = /^## .+$/m.exec(report.slice(afterHeading));
  const body = report.slice(afterHeading, next ? afterHeading + next.index : report.length);

  const date = (body.match(/^\*\*Date:\*\*\s*(.+)$/m) || [])[1]?.trim() ?? '';
  const state = (body.match(/^\*\*State:\*\*\s*(.+)$/m) || [])[1]?.trim() ?? '';

  // Only the free-text block. Bounded by the next `### ` subsection so a question
  // can never absorb the selections that follow it.
  const start = body.search(/^### Free-text answers\s*$/m);
  let freeText = [];
  if (start !== -1) {
    const rest = body.slice(start).replace(/^### Free-text answers\s*$/m, '');
    const nextSub = rest.search(/^### /m);
    const block = nextSub === -1 ? rest : rest.slice(0, nextSub);

    // "1. **Question**" then a blockquote answer. The numbered label and the
    // quote markers are exactly what the writer emits.
    const re = /^\d+\.\s+\*\*(.+?)\*\*\s*$/gm;
    const marks = [...block.matchAll(re)];
    freeText = marks.map((m, i) => {
      const from = m.index + m[0].length;
      const to = i + 1 < marks.length ? marks[i + 1].index : block.length;
      const answer = block
        .slice(from, to)
        .split('\n')
        .filter((l) => /^\s*>/.test(l))
        .map((l) => l.replace(/^\s*>\s?/, ''))
        .join('\n')
        .trim();
      return { question: m[1].trim(), answer: answer === 'Not recorded.' ? '' : answer };
    });
  }

  return { present: true, date, state, freeText };
}

/**
 * Read the evaluation mode's `## H) Draft Application Answers` block.
 *
 * A DIFFERENT format from the section above, written by a different producer:
 * Block H is drafted during evaluation (before any form is seen) and uses a bold
 * question followed by a plain paragraph, where `## Application Answers` is the
 * post-apply snapshot and uses numbered questions with blockquoted answers.
 *
 * Worth reading because `modes/apply.md` already treats Block H as a legitimate
 * base for a real application ("If there is a Section H or `## Application
 * Answers` → load previous answers as a base"). Surfacing it means a job page
 * that has been evaluated is not blank on first visit.
 *
 * The italic parenthetical the mode emits under the heading is skipped: it is a
 * note to the reader, not a question.
 *
 * @param {string} reportText
 * @returns {{present: boolean, freeText: Array<{question: string, answer: string}>}}
 */
export function parseDraftAnswersBlockH(reportText) {
  const report = String(reportText ?? '').replace(/\r\n/g, '\n');
  const heading = /^##\s+H\)\s*Draft Application Answers\s*$/m.exec(report);
  if (!heading) return { present: false, freeText: [] };

  const afterHeading = heading.index + heading[0].length;
  const next = /^## .+$/m.exec(report.slice(afterHeading));
  const body = report.slice(afterHeading, next ? afterHeading + next.index : report.length);

  // A question is a line that is ENTIRELY bold. Bold used mid-sentence inside an
  // answer therefore cannot be mistaken for the next question.
  const re = /^\*\*(.+?)\*\*\s*$/gm;
  const marks = [...body.matchAll(re)];
  const freeText = marks.map((m, i) => {
    const from = m.index + m[0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index : body.length;
    const answer = body
      .slice(from, to)
      // A trailing horizontal rule belongs to the report, not to the answer.
      .replace(/^\s*-{3,}\s*$/gm, '')
      .trim();
    return { question: m[1].trim(), answer };
  });
  return { present: true, freeText: freeText.filter((q) => q.question) };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--')) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[arg.slice(2)] = value;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: node application-answers.mjs --report <report.md> --input <answers.json> [--state filled|submitted] [--date YYYY-MM-DD]',
    '',
    'The input JSON may contain: freeText, selections, fieldValues, files, date, state.',
  ].join('\n');
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.report || !args.input) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const inputText = args.input === '-' ? readFileSync(0, 'utf-8') : readFileSync(resolve(args.input), 'utf-8');
  const input = JSON.parse(inputText);
  const snapshot = {
    ...input,
    date: args.date || input.date,
    state: args.state || input.state,
  };
  const reportPath = resolve(args.report);
  const updated = upsertApplicationAnswersSection(readFileSync(reportPath, 'utf-8'), snapshot);
  writeFileSync(reportPath, updated, 'utf-8');

  const normalized = normalizeApplicationAnswersSnapshot(snapshot);
  console.log(JSON.stringify({ report: reportPath, date: normalized.date, state: normalized.state }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
