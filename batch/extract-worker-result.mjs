#!/usr/bin/env node
import fs from 'node:fs';

const [, , logPath] = process.argv;
if (!logPath) {
  console.error('Usage: node batch/extract-worker-result.mjs <log-file>');
  process.exit(1);
}

const text = fs.readFileSync(logPath, 'utf8');
const candidates = [];
const seen = new Set();

function addCandidate(raw) {
  const value = raw?.trim();
  if (!value || seen.has(value)) return;
  seen.add(value);

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      candidates.push(parsed);
      for (const nested of Object.values(parsed)) {
        if (typeof nested === 'string' && nested.includes('{')) addCandidate(nested);
      }
    }
  } catch {}
}

addCandidate(text);

for (const match of text.matchAll(/```json\s*([\s\S]*?)```/gi)) addCandidate(match[1]);
for (const match of text.matchAll(/```\s*([\s\S]*?)```/g)) addCandidate(match[1]);

for (let i = 0; i < text.length; i += 1) {
  if (text[i] !== '{') continue;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let j = i; j < text.length; j += 1) {
    const ch = text[j];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        addCandidate(text.slice(i, j + 1));
        break;
      }
    }
  }
}

function normalizeScore(value) {
  if (value == null || value === '' || value === 'N/A') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/(\d+(?:\.\d+)?)/);
    if (match) return Number.parseFloat(match[1]);
  }
  return null;
}

function normalizeText(value) {
  if (value == null) return null;
  const textValue = String(value).trim();
  return textValue ? textValue : null;
}

function normalize(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const status = normalizeText(candidate.status)?.toLowerCase();
  if (status !== 'completed' && status !== 'failed') return null;

  return {
    status,
    id: normalizeText(candidate.id),
    report_num: normalizeText(candidate.report_num),
    company: normalizeText(candidate.company),
    role: normalizeText(candidate.role),
    score: normalizeScore(candidate.score),
    pdf: normalizeText(candidate.pdf),
    report: normalizeText(candidate.report),
    error: normalizeText(candidate.error),
  };
}

const normalized = candidates.map(normalize).filter(Boolean).at(-1);
if (!normalized) {
  console.error('No worker result JSON found in log.');
  process.exit(1);
}

process.stdout.write(`${JSON.stringify(normalized, null, 2)}\n`);
