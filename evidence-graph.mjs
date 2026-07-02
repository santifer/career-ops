#!/usr/bin/env node

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const METRIC_PATTERN = /(\d+[%x]|\$[\d,.]+|[\d,.]+\s*(users|stars|ms|sec|seconds|minutes|hours|days))/i;
const WORKSPACE_ROOT = process.cwd();

function normalizeSource(source = 'unknown') {
  if (source === 'unknown') return source;
  return relative(WORKSPACE_ROOT, resolve(source)).replaceAll(sep, '/') || '.';
}

function safeWorkspacePath(file) {
  if (isAbsolute(file) || file.split(/[\\/]/).includes('..')) {
    throw new Error(`Evidence input must be a relative workspace path: ${file}`);
  }
  const resolved = resolve(WORKSPACE_ROOT, file);
  const relativePath = relative(WORKSPACE_ROOT, resolved);
  if (!relativePath || relativePath.startsWith('..') || relativePath.startsWith(sep)) {
    throw new Error(`Evidence input must stay inside the workspace: ${file}`);
  }
  return resolved;
}

function evidenceId(source, claim) {
  const digest = createHash('sha256').update(`${normalizeSource(source)}\n${claim}`).digest('hex').slice(0, 12);
  return `ev_${digest}`;
}

export function extractEvidenceItems(markdown = '', source = 'unknown') {
  const normalizedSource = normalizeSource(source);
  const lines = markdown.split('\n');
  const items = [];
  for (const line of lines) {
    const metric = line.match(METRIC_PATTERN);
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (!bullet && !metric) continue;
    const claim = (bullet?.[1] || line).trim();
    if (!claim) continue;
    items.push({
      id: evidenceId(normalizedSource, claim),
      source: normalizedSource,
      claim_type: metric ? 'metric' : 'project',
      claim,
      confidence: 'medium',
    });
  }
  return items;
}

export function findUnsupportedStrongClaims(output = '', evidenceIds = []) {
  const known = new Set(evidenceIds);
  const claimBlocks = output.split('\n').filter((line) => METRIC_PATTERN.test(line));
  return claimBlocks.filter((line) => {
    const refs = Array.from(line.matchAll(/ev_[a-f0-9]{12}/g)).map((match) => match[0]);
    return refs.length === 0 || refs.some((ref) => !known.has(ref));
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  let files;
  try {
    files = process.argv.slice(2).map((file) => ({ input: file, path: safeWorkspacePath(file) }));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const evidence = files.flatMap(({ input, path }) => existsSync(path) ? extractEvidenceItems(readFileSync(path, 'utf8'), input) : []);
  console.log(JSON.stringify({ schema_version: 'career-ops.evidence-graph/v1', evidence }, null, 2));
}
