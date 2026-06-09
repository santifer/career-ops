#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const SHORTLIST_DIR = path.resolve('output');

function latestShortlistPath() {
  const today = new Date().toISOString().slice(0, 10);
  const candidate = path.join(SHORTLIST_DIR, `company-dump-shortlist-${today}.md`);
  if (existsSync(candidate)) return candidate;
  throw new Error('No shortlist file found for today');
}

function parseShortlist(markdown) {
  const sections = markdown.split(/^## /m).slice(1);
  return sections.map(section => {
    const lines = section.trim().split('\n');
    const name = lines[0].trim();
    const obj = { name, relevance: '', matchingRoles: '', careersHint: '', location: '', summary: '' };
    for (const line of lines.slice(1)) {
      const cleaned = line.trim();
      if (cleaned.startsWith('- Relevance:')) obj.relevance = cleaned.replace('- Relevance: ', '').replace(/`/g, '');
      else if (cleaned.startsWith('- Matching roles:')) obj.matchingRoles = cleaned.replace('- Matching roles: ', '');
      else if (cleaned.startsWith('- Careers hint:')) obj.careersHint = cleaned.replace('- Careers hint: ', '');
      else if (cleaned.startsWith('- Location:')) obj.location = cleaned.replace('- Location: ', '');
      else if (cleaned.startsWith('- Summary:')) obj.summary = cleaned.replace('- Summary: ', '');
    }
    return obj;
  });
}

function buildQueue(items) {
  const direct = items.filter(item => item.relevance === 'direct-role-match').slice(0, 10);
  const manual = items.filter(item => item.relevance === 'check-manually').slice(0, 12);

  const lines = [];
  lines.push(`# Company Review Queue — ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## First Pass');
  lines.push('');
  for (const item of direct) {
    lines.push(`- [ ] ${item.name} | ${item.matchingRoles || 'direct role match'} | ${item.careersHint || 'no public hint'} | ${item.location}`);
  }
  lines.push('');
  lines.push('## Second Pass');
  lines.push('');
  for (const item of manual) {
    lines.push(`- [ ] ${item.name} | manual check | ${item.careersHint || 'no public hint'} | ${item.location}`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- First Pass = highest-priority companies for live vacancy/contact verification');
  lines.push('- Second Pass = promising companies with openings signal but no role match yet');
  return lines.join('\n');
}

function main() {
  const shortlistPath = latestShortlistPath();
  const markdown = readFileSync(shortlistPath, 'utf-8');
  const items = parseShortlist(markdown);
  const out = buildQueue(items);
  const outPath = path.join(SHORTLIST_DIR, `company-review-queue-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(outPath, out, 'utf-8');
  console.log(`Wrote ${outPath}`);
}

main();
