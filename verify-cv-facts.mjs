#!/usr/bin/env node

/**
 * Verify generated candidate-facing documents against the user's source facts.
 *
 * The CLI remains useful for CVs, while the exported verifyFacts function is
 * shared by PDF generators so every generated document gets the same gate.
 */

import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join, dirname, basename } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCES = ['cv.md', 'article-digest.md'];
const DEFAULT_CONFIG = join(ROOT, 'config', 'cv-facts.json');

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

export function stripMarkup(text) {
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^}]*)\})?/g, ' $1 ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeClaim(claim) {
  return claim.toLowerCase().replace(/[,\s]+/g, ' ').trim();
}

export function metricClaims(text) {
  const clean = stripMarkup(text);
  const patterns = [
    /\b\d+(?:\.\d+)?\s?%/g,
    /\b[$€£]\s?\d[\d,.]*(?:\s?[kKmMbB])?/g,
    /\b\d+(?:\.\d+)?\s?x\b/gi,
    /\b\d[\d,.]*\+?\s?(?:users|customers|clients|employees|engineers|teams|companies|hours|days|weeks|months|years|minutes|seconds|requests|tokens|documents|workflows|pipelines|agents|interviews|applications|offers|reports|cvs|resumes)\b/gi,
  ];
  const claims = new Set();
  for (const pattern of patterns) {
    for (const match of clean.matchAll(pattern)) claims.add(normalizeClaim(match[0]));
  }
  return claims;
}

function loadConfig(path) {
  if (!existsSync(path)) return { allow_metrics: [], forbidden_phrases: [], warn_phrases: [] };
  const config = JSON.parse(readFileSync(path, 'utf-8'));
  for (const key of ['allow_metrics', 'forbidden_phrases', 'warn_phrases']) {
    if (config[key] == null) config[key] = [];
    else if (!Array.isArray(config[key])) throw new Error(`${key} must be an array in ${path}`);
  }
  return config;
}

function resolveInputPath(path, cwd = process.cwd()) {
  return isAbsolute(path) ? path : join(cwd, path);
}

/**
 * @param {string} targetText generated candidate-facing HTML/Markdown/text
 * @param {{ sourcePaths?: string[], configPath?: string, cwd?: string }} options
 * @returns {{ verdict: 'pass'|'block', invented: string[], forbidden: string[], warnings: string[] }}
 * @throws when the config is invalid
 */
export function verifyFacts(targetText, {
  sourcePaths = DEFAULT_SOURCES,
  configPath = DEFAULT_CONFIG,
  cwd = process.cwd(),
} = {}) {
  const sourceText = sourcePaths.map(path => readIfExists(resolveInputPath(path, cwd))).join('\n');
  const config = loadConfig(resolveInputPath(configPath, cwd));
  const allowed = new Set([
    ...metricClaims(sourceText),
    ...config.allow_metrics.map(normalizeClaim),
  ]);
  const targetClaims = metricClaims(targetText);
  const invented = [...targetClaims].filter(claim => !allowed.has(claim));
  const forbidden = config.forbidden_phrases
      .filter(Boolean)
      .filter(phrase => stripMarkup(targetText).toLowerCase().includes(String(phrase).toLowerCase()));
  const warnings = config.warn_phrases
      .filter(Boolean)
      .filter(phrase => stripMarkup(targetText).toLowerCase().includes(String(phrase).toLowerCase()));
  return {
    verdict: invented.length || forbidden.length ? 'block' : warnings.length ? 'warn' : 'pass',
    invented,
    forbidden,
    warnings,
  };
}

export function assertFacts(targetText, options = {}) {
  const result = verifyFacts(targetText, options);
  if (result.verdict === 'block') {
    const details = [];
    if (result.invented.length) details.push(`metric-like claims absent from sources: ${result.invented.join(', ')}`);
    if (result.forbidden.length) details.push(`forbidden phrases found: ${result.forbidden.join(', ')}`);
    throw new Error(`Fact check failed${options.label ? ` for ${options.label}` : ''}: ${details.join('; ')}`);
  }
  return result;
}

function parseCliArgs(args) {
  const sourcePaths = [];
  let targetArg = '';
  let configPath = DEFAULT_CONFIG;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--source' || arg === '--config') {
      if (!args[i + 1]) throw new Error(`${arg} requires a path`);
      if (arg === '--source') sourcePaths.push(args[++i]);
      else configPath = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      return { help: true };
    } else if (arg === '--json') {
      json = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown option: ${arg}`);
    } else if (!targetArg) {
      targetArg = arg;
    } else {
      throw new Error(`unexpected extra positional argument: ${arg}`);
    }
  }
  return { targetArg, sourcePaths, configPath, json, help: false };
}

function usage() {
  return `Usage: node verify-cv-facts.mjs <generated-document> [--source path] [--config path] [--json]

Checks generated candidate-facing text for metric-like claims absent from source files.
Default sources: cv.md, article-digest.md
Default config:  config/cv-facts.json (optional)`;
}

export function runCli(args = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseCliArgs(args);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    return 1;
  }
  if (parsed.help || !parsed.targetArg) {
    console.log(usage());
    return parsed.help ? 0 : 1;
  }
  const targetPath = resolveInputPath(parsed.targetArg);
  if (!existsSync(targetPath)) {
    console.error(`ERROR: target file not found: ${parsed.targetArg}`);
    return 1;
  }
  try {
    const result = verifyFacts(readFileSync(targetPath, 'utf-8'), {
      sourcePaths: parsed.sourcePaths.length ? parsed.sourcePaths : DEFAULT_SOURCES,
      configPath: parsed.configPath,
    });
    if (parsed.json) {
      console.log(JSON.stringify(result));
      return result.verdict === 'block' ? 1 : 0;
    }
    if (result.verdict === 'pass') {
      console.log(`CV fact check passed: ${basename(targetPath)}`);
      return 0;
    }
    if (result.verdict === 'warn') {
      console.error(`CV fact check warning: ${basename(targetPath)}`);
      for (const phrase of result.warnings) console.error(`  - advisory phrase: ${phrase}`);
      return 0;
    }
    console.error(`CV fact check failed: ${basename(targetPath)}`);
    if (result.invented.length) {
      console.error('\nMetric-like claims absent from sources:');
      for (const claim of result.invented) console.error(`  - ${claim}`);
    }
    if (result.forbidden.length) {
      console.error('\nForbidden phrases found:');
      for (const phrase of result.forbidden) console.error(`  - ${phrase}`);
    }
    console.error('\nAdd real evidence to cv.md/article-digest.md, or allow a verified exception in config/cv-facts.json.');
    return 1;
  } catch (err) {
    if (parsed.json) {
      console.log(JSON.stringify({ verdict: 'block', invented: [], forbidden: [], warnings: [], errors: [err.message] }));
      return 1;
    }
    console.error(`ERROR: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli();
}
