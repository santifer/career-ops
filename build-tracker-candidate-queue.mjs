#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('output');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function enrichedPath() {
  const file = path.join(OUTPUT_DIR, `company-review-enriched-${today()}.md`);
  if (!existsSync(file)) throw new Error(`Enriched review file not found: ${file}`);
  return file;
}

function parseEnriched(md) {
  const chunks = md.split(/^## /m).slice(1);
  return chunks.map(chunk => {
    const lines = chunk.trim().split('\n');
    const name = lines[0].trim();
    const item = {
      name,
      queueSection: '',
      roleHint: '',
      location: '',
      originalHint: '',
      candidates: [],
    };
    for (const raw of lines.slice(1)) {
      const line = raw.trim();
      if (line.startsWith('- Queue section: ')) item.queueSection = line.replace('- Queue section: ', '');
      else if (line.startsWith('- Role hint: ')) item.roleHint = line.replace('- Role hint: ', '');
      else if (line.startsWith('- Location: ')) item.location = line.replace('- Location: ', '');
      else if (line.startsWith('- Original hint: ')) item.originalHint = line.replace('- Original hint: ', '');
      else if (line.startsWith('- Candidate: ')) {
        const rest = line.replace('- Candidate: ', '');
        const [urlPart, scorePart, verifyPart] = rest.split(' | ');
        const candidate = {
          url: urlPart || '',
          score: Number((scorePart || '').replace('score: ', '')) || 0,
          verifyStatus: '',
          verifyNote: '',
        };
        if (verifyPart && verifyPart.startsWith('verify: ')) {
          const text = verifyPart.replace('verify: ', '');
          const m = text.match(/^([^(]+)\((.*)\)$/);
          if (m) {
            candidate.verifyStatus = m[1].trim();
            candidate.verifyNote = m[2].trim();
          } else {
            candidate.verifyStatus = text.trim();
          }
        }
        item.candidates.push(candidate);
      }
    }
    return item;
  });
}

function rankItem(item) {
  let score = 0;
  if (item.queueSection === 'first pass') score += 5;
  if (/backend|data|integration|api|software engineer/i.test(item.roleHint)) score += 4;
  if (/frontend/i.test(item.roleHint)) score -= 2;

  const statuses = new Set(item.candidates.map(c => c.verifyStatus));
  if (statuses.has('careers-page')) score += 5;
  if (statuses.has('company-page')) score += 3;
  if (statuses.has('linkedin-company')) score += 1;
  if (statuses.has('search-results')) score -= 1;
  if (statuses.has('dead')) score -= 2;

  return score;
}

function nextAction(item) {
  const statuses = new Set(item.candidates.map(c => c.verifyStatus));
  if (statuses.has('careers-page')) return 'Open official careers page and check live roles first';
  if (statuses.has('company-page')) return 'Open company page and look for careers/contact links';
  if (statuses.has('linkedin-company')) return 'Use company LinkedIn as fallback and search for official site';
  return 'Manual web check needed';
}

function render(items) {
  const lines = [];
  lines.push(`# Tracker Candidate Queue — ${today()}`);
  lines.push('');
  for (const item of items) {
    lines.push(`## ${item.name}`);
    lines.push('');
    lines.push(`- Priority score: ${item.priority}`);
    if (item.roleHint) lines.push(`- Role hint: ${item.roleHint}`);
    if (item.location) lines.push(`- Location: ${item.location}`);
    lines.push(`- Next action: ${item.action}`);
    const best = item.candidates[0];
    if (best) {
      lines.push(`- Best link: ${best.url}`);
      if (best.verifyStatus) lines.push(`- Best link status: ${best.verifyStatus}${best.verifyNote ? ` (${best.verifyNote})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const items = parseEnriched(readFileSync(enrichedPath(), 'utf-8'))
    .map(item => ({
      ...item,
      priority: rankItem(item),
      action: nextAction(item),
    }))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    .slice(0, 20);

  const outPath = path.join(OUTPUT_DIR, `tracker-candidate-queue-${today()}.md`);
  writeFileSync(outPath, render(items), 'utf-8');
  console.log(`Wrote ${outPath}`);
}

main();
