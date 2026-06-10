#!/usr/bin/env node
/**
 * learning-queue.mjs — reviewable user-feedback learning queue.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_QUEUE = join(ROOT, 'data/learning-queue.md');
const QUEUE_PATH = process.env.CAREER_OPS_LEARNING_QUEUE || DEFAULT_QUEUE;
const VALID_STATUSES = new Set(['pending', 'applied', 'rejected']);
const VALID_TARGETS = new Set(['modes/_profile.md', 'config/profile.yml', 'article-digest.md']);

function today() {
  return new Date().toISOString().split('T')[0];
}

function argValue(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function queueHeader() {
  return [
    '# Learning Queue',
    '',
    'Reviewable profile-learning items proposed from evaluation feedback.',
    '',
    'Statuses: pending, applied, rejected.',
    '',
  ].join('\n');
}

function ensureQueue(path = QUEUE_PATH) {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, queueHeader());
  }
}

function nextId(entries, date = today()) {
  const prefix = `LQ-${date.replaceAll('-', '')}-`;
  const max = entries
    .map((entry) => entry.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter(Number.isFinite)
    .reduce((acc, n) => Math.max(acc, n), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function parseQueue(markdown) {
  const entries = [];
  const blocks = markdown.split(/\n(?=## LQ-\d{8}-\d{3}\b)/);
  for (const block of blocks) {
    const id = block.match(/^## (LQ-\d{8}-\d{3})/m)?.[1];
    if (!id) continue;
    const field = (name) => block.match(new RegExp(`^- \\*\\*${name}:\\*\\*\\s*(.*)$`, 'm'))?.[1]?.trim() || '';
    const proposal = block.match(/### Proposed change\n\n```text\n([\s\S]*?)\n```/)?.[1] || '';
    entries.push({
      id,
      date: field('Date'),
      source: field('Source'),
      target: field('Target'),
      status: field('Status'),
      feedback: field('Feedback'),
      proposal,
    });
  }
  return entries;
}

function renderEntry(entry) {
  return [
    `## ${entry.id}`,
    '',
    `- **Date:** ${entry.date}`,
    `- **Source:** ${entry.source}`,
    `- **Target:** ${entry.target}`,
    `- **Status:** ${entry.status}`,
    `- **Feedback:** ${entry.feedback}`,
    '',
    '### Proposed change',
    '',
    '```text',
    entry.proposal,
    '```',
    '',
  ].join('\n');
}

export function addEntry({ source, target, feedback, proposal, queuePath = QUEUE_PATH, date = today() }) {
  if (!source || !target || !feedback || !proposal) {
    throw new Error('add requires --source, --target, --feedback, and --proposal');
  }
  if (!VALID_TARGETS.has(target)) {
    throw new Error(`target must be one of: ${Array.from(VALID_TARGETS).join(', ')}`);
  }
  ensureQueue(queuePath);
  const content = readFileSync(queuePath, 'utf-8');
  const entry = {
    id: nextId(parseQueue(content), date),
    date,
    source,
    target,
    status: 'pending',
    feedback,
    proposal,
  };
  writeFileSync(queuePath, `${content.trimEnd()}\n\n${renderEntry(entry)}`);
  return entry;
}

export function setStatus({ id, status, queuePath = QUEUE_PATH }) {
  if (!id || !VALID_STATUSES.has(status)) {
    throw new Error('set-status requires --id and --status pending|applied|rejected');
  }
  const content = readFileSync(queuePath, 'utf-8');
  const next = content.replace(
    new RegExp(`(## ${id}[\\s\\S]*?- \\*\\*Status:\\*\\* )(${Array.from(VALID_STATUSES).join('|')})`),
    `$1${status}`,
  );
  if (next === content) throw new Error(`entry not found: ${id}`);
  writeFileSync(queuePath, next);
}

function listEntries({ status, queuePath = QUEUE_PATH } = {}) {
  if (!existsSync(queuePath)) return [];
  const entries = parseQueue(readFileSync(queuePath, 'utf-8'));
  return status ? entries.filter((entry) => entry.status === status) : entries;
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'co-learning-'));
  try {
    const path = join(dir, 'queue.md');
    const entry = addEntry({
      source: 'self-test',
      target: 'modes/_profile.md',
      feedback: 'score too high for Java-only roles',
      proposal: 'Lower Java-only backend fit unless AI automation is present.',
      queuePath: path,
      date: '2026-06-10',
    });
    setStatus({ id: entry.id, status: 'applied', queuePath: path });
    const parsed = listEntries({ queuePath: path });
    if (parsed.length !== 1 || parsed[0].status !== 'applied' || parsed[0].id !== entry.id) {
      throw new Error('self-test failed');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log('learning-queue self-test passed');
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  if (command === '--self-test') return selfTest();
  if (command === 'add') {
    const entry = addEntry({
      source: argValue(args, '--source'),
      target: argValue(args, '--target'),
      feedback: argValue(args, '--feedback'),
      proposal: argValue(args, '--proposal'),
    });
    console.log(JSON.stringify(entry, null, 2));
    return;
  }
  if (command === 'set-status') {
    setStatus({ id: argValue(args, '--id'), status: argValue(args, '--status') });
    console.log(JSON.stringify({ ok: true }, null, 2));
    return;
  }
  if (command === 'list') {
    const entries = listEntries({ status: argValue(args, '--status') });
    console.log(JSON.stringify({ entries }, null, 2));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
