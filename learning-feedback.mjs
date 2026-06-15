#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const DEFAULT_FILE = 'data/profile-feedback.md';
const ACTIVE_STATUSES = new Set(['pending', 'proposed']);

export function parseFeedbackRecords(markdown = '') {
  const sections = markdown.split(/^##\s+/m).slice(1);
  return sections.map((section) => {
    const [titleLine = '', ...lines] = section.trim().split('\n');
    const record = { title: titleLine.trim() };
    for (const line of lines) {
      const match = line.match(/^-\s*([a-z_]+):\s*(.*)$/i);
      if (!match) continue;
      record[match[1]] = match[2].replace(/^"|"$/g, '').trim();
    }
    return record;
  }).filter((record) => record.title);
}

export function summarizeOpenFeedback(records = []) {
  return records
    .filter((record) => ACTIVE_STATUSES.has(record.status))
    .map((record) => `- [${record.status}] ${record.type}: ${record.feedback} (${record.proposed_update || 'no target yet'})`)
    .join('\n');
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2] || DEFAULT_FILE;
  if (!existsSync(file)) {
    console.log('No profile feedback queue found.');
    process.exit(0);
  }
  const records = parseFeedbackRecords(readFileSync(file, 'utf8'));
  const summary = summarizeOpenFeedback(records);
  console.log(summary || 'No unresolved profile feedback.');
}
