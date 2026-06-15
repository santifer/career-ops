#!/usr/bin/env node

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

function evidenceId(source, claim) {
  const digest = createHash('sha256').update(`${source}\n${claim}`).digest('hex').slice(0, 12);
  return `ev_${digest}`;
}

export function extractEvidenceItems(markdown = '', source = 'unknown') {
  const lines = markdown.split('\n');
  const items = [];
  for (const line of lines) {
    const metric = line.match(/(\d+[%x]|\$[\d,.]+|[\d,.]+\s*(users|stars|ms|sec|seconds|minutes|hours|days))/i);
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (!bullet && !metric) continue;
    const claim = (bullet?.[1] || line).trim();
    if (!claim) continue;
    items.push({
      id: evidenceId(source, claim),
      source,
      claim_type: metric ? 'metric' : 'project',
      claim,
      confidence: 'medium',
    });
  }
  return items;
}

export function findUnsupportedStrongClaims(output = '', evidenceIds = []) {
  const known = new Set(evidenceIds);
  const claimBlocks = output.split('\n').filter((line) => /\d+[%x]|\$[\d,.]+/.test(line));
  return claimBlocks.filter((line) => {
    const refs = Array.from(line.matchAll(/ev_[a-f0-9]{12}/g)).map((match) => match[0]);
    return refs.length === 0 || refs.some((ref) => !known.has(ref));
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = process.argv.slice(2);
  const evidence = files.flatMap((file) => existsSync(file) ? extractEvidenceItems(readFileSync(file, 'utf8'), file) : []);
  console.log(JSON.stringify({ schema_version: 'career-ops.evidence-graph/v1', evidence }, null, 2));
}
