#!/usr/bin/env node

/**
 * Resolve and initialize one application-scoped artifact directory.
 *
 * Generated CVs are intentionally kept under output/ because they are user
 * artifacts. The directory key is stable for a report/company/role tuple so
 * the JD, source CV, tailored CV, PDF, and reuse decision stay together.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseArgs } from 'util';
import { fileURLToPath } from 'url';

const DEFAULT_OUTPUT_ROOT = resolve('output');
const DECISIONS = new Set(['reuse', 'reuse-with-edits', 'regenerate']);

/** Convert a user-facing label into a safe, readable path segment. */
export function slugifySegment(value, fallback = 'application') {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/** Return all stable paths belonging to one application artifact bundle. */
export function applicationArtifactPaths({ reportNum, company, role, root = DEFAULT_OUTPUT_ROOT }) {
  if (!/^\d+$/.test(String(reportNum ?? ''))) {
    throw new Error('reportNum must be a numeric report number');
  }
  const key = `${String(reportNum).padStart(3, '0')}-${slugifySegment(company)}-${slugifySegment(role, 'role')}`;
  const applicationRoot = join(resolve(root), key);
  return {
    key,
    root: applicationRoot,
    jd: {
      current: join(applicationRoot, 'jd', 'current.md'),
      previous: join(applicationRoot, 'jd', 'previous.md'),
    },
    cv: {
      source: join(applicationRoot, 'cv', 'source.html'),
      tailored: join(applicationRoot, 'cv', 'tailored.html'),
      pdf: join(applicationRoot, 'cv', 'tailored.pdf'),
    },
    reuseDecision: join(applicationRoot, 'reuse-decision.json'),
  };
}

/** Create the JD and CV subdirectories for an application bundle. */
export function ensureApplicationArtifactDirs(paths) {
  mkdirSync(paths.jd.current.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  mkdirSync(paths.cv.source.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  return paths;
}

/** Write an auditable CV reuse decision beside the application artifacts. */
export function writeReuseDecision(paths, {
  decision,
  score = null,
  sourceCv = null,
  currentJd = null,
  previousSource = null,
  changedSections = [],
  userOverride = false,
}) {
  if (!DECISIONS.has(decision)) throw new Error(`decision must be one of: ${[...DECISIONS].join(', ')}`);
  if (!Array.isArray(changedSections)) throw new Error('changedSections must be an array');
  ensureApplicationArtifactDirs(paths);
  const record = {
    schema_version: 1,
    decision,
    score,
    source_cv: sourceCv,
    current_jd: currentJd,
    previous_source: previousSource,
    changed_sections: changedSections,
    user_override: Boolean(userOverride),
    recorded_at: new Date().toISOString(),
  };
  writeFileSync(paths.reuseDecision, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function usage() {
  return 'Usage: node application-artifacts.mjs --report N --company NAME --role ROLE [--root output] [--init]';
}

async function main() {
  const { values } = parseArgs({
    options: {
      report: { type: 'string' },
      company: { type: 'string' },
      role: { type: 'string' },
      root: { type: 'string' },
      init: { type: 'boolean' },
    },
    strict: true,
  });
  if (!values.report || !values.company || !values.role) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  const paths = applicationArtifactPaths({ reportNum: values.report, company: values.company, role: values.role, root: values.root });
  if (values.init) ensureApplicationArtifactDirs(paths);
  console.log(JSON.stringify(paths, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

