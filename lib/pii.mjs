import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_LATEX_RAW_TOKENS = [
  'CONTACT_LINE',
  'EMAIL_URL',
  'LINKEDIN_URL',
  'PORTFOLIO_URL',
  'GITHUB_URL',
];

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    throw new Error(`Unable to read ${label} at ${path}: ${err.message}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeLatex(value) {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function escapePIIValue(key, value, target, latexRawTokens) {
  if (target === 'html') return escapeHtml(value);
  if (target === 'latex' && !latexRawTokens.has(key)) return escapeLatex(value);
  return value;
}

export function substitutePII(content, { projectRoot, target }) {
  const examplePath = resolve(projectRoot, 'config/pii.example.json');
  const example = readJson(examplePath, 'config/pii.example.json');
  const allowed = new Set(Object.keys(example).filter(key => !key.startsWith('_')));
  const latexRawTokens = new Set(
    Array.isArray(example._latex_raw_tokens)
      ? example._latex_raw_tokens
      : DEFAULT_LATEX_RAW_TOKENS
  );

  const piiPath = resolve(projectRoot, 'config/pii.local.json');
  const pii = existsSync(piiPath) ? readJson(piiPath, 'config/pii.local.json') : {};

  let substituted = 0;
  for (const [key, value] of Object.entries(pii)) {
    if (!allowed.has(key) || typeof value !== 'string' || value === '') continue;

    const pattern = new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, 'g');
    const escaped = escapePIIValue(key, value, target, latexRawTokens);
    content = content.replace(pattern, () => {
      substituted++;
      return escaped;
    });
  }

  const missing = [...new Set(content.match(/\{\{[A-Z_]+\}\}/g) || [])]
    .filter(token => allowed.has(token.slice(2, -2)));

  return { content, substituted, missing };
}
