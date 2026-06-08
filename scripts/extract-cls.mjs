#!/usr/bin/env node
/**
 * extract-cls.mjs — Parse cover-letters/bulk-export-*.md into individual files + index.yml
 *
 * Usage: node scripts/extract-cls.mjs [--bulk <path>] [--out <dir>] [--dry-run]
 *
 * Each `## N. Company — Role` section becomes cover-letters/{slug}.md
 * Generates cover-letters/index.yml with role/tier heuristics.
 *
 * Idempotent: re-running overwrites existing extracted files but never touches
 * hand-crafted entries (any file NOT sourced from bulk-export is left alone).
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? (process.argv[i + 1] ?? null) : null;
}

const CL_DIR    = argVal('--out')  || path.join(ROOT, 'cover-letters');
const BULK_PATH = argVal('--bulk') || path.join(CL_DIR, 'bulk-export-2026-04-29.md');
const DRY_RUN   = process.argv.includes('--dry-run');

// ── Slugify ────────────────────────────────────────────────────────────────────

export function slugify(name) {
  return (name || '').toLowerCase()
    .replace(/[()°™®]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Role family heuristics ─────────────────────────────────────────────────────

const ROLE_FAMILIES = {
  'scrum master': ['scrum master', 'senior scrum master', 'agile coach'],
  'agile delivery|delivery manager|agile delivery manager': ['agile coach', 'delivery manager', 'scrum master'],
  'technical program manager|staff tpm|sr. technical program|senior technical program': ['technical program manager', 'tpm', 'program manager'],
  'program manager|senior program manager|sr. program': ['program manager', 'technical pm', 'senior pm'],
  'product manager': ['product manager', 'technical pm', 'program manager'],
  'agile coach': ['agile coach', 'delivery manager', 'scrum master'],
  'director.*agile|director.*delivery': ['agile coach', 'delivery manager', 'director agile'],
  'senior manager.*agile|manager.*agile': ['agile coach', 'program manager', 'scrum master'],
};

export function inferRoles(roleTitle, bodySnippet) {
  const text = (roleTitle + ' ' + bodySnippet).toLowerCase();
  for (const [pattern, roles] of Object.entries(ROLE_FAMILIES)) {
    if (new RegExp(pattern).test(text)) return roles;
  }
  return ['program manager'];
}

// ── Tier heuristics ────────────────────────────────────────────────────────────

const F500_SLUGS = new Set([
  'stripe', 'figma', 'twilio', 'pinterest', 'samsara', 'opentable', 'smartsheet',
  'anthropic', 'databricks', 'notion', 'linear', 'netflix', 'google', 'amazon',
  'meta', 'apple', 'microsoft', 'salesforce', 'hubspot', 'atlassian', 'zendesk',
  'servicenow', 'workday', 'datadog', 'elastic', 'splunk', 'snowflake', 'confluent',
]);

export function inferTier(companySlug) {
  return F500_SLUGS.has(companySlug) ? 'f500' : 'unknown';
}

// ── Parse bulk-export ─────────────────────────────────────────────────────────

export function parseBulkExport(content) {
  // Split on ## N. headings (level-2 numbered sections)
  const sections = content.split(/\n(?=## \d+\. )/);
  const entries  = [];

  for (const section of sections) {
    const trimmed = section.trimStart();
    if (!/^## \d+\./.test(trimmed)) continue; // skip preamble

    const lines   = trimmed.split('\n');
    const heading = lines[0];

    // Match: ## N. Company Name — Role Title
    // Also handles "Company — Role / Variant" and "(Company)"
    const match = heading.match(/^## \d+\.\s+(.+?)\s+[—–-]{1,2}\s+(.+)$/);
    if (!match) {
      console.error(`  WARN: could not parse heading: ${heading}`);
      continue;
    }

    const companyName = match[1].trim();
    const roleTitle   = match[2].trim();
    const slug        = slugify(companyName);

    // Body = lines after the heading, trim trailing `---` separators
    const body = lines.slice(1)
      .join('\n')
      .replace(/\n---\s*$/, '')
      .trim();

    entries.push({ companyName, roleTitle, slug, body });
  }

  return entries;
}

// ── Generate index.yml ────────────────────────────────────────────────────────

export function buildIndexYml(entries) {
  const lines = [
    '# Auto-generated CL index — edit by hand to refine roles/tier/notes',
    '# Each entry maps a CL file to one or more match keys',
    '# Matching priority: exact company → role family → tier fallback → null',
    'templates:',
  ];

  for (const e of entries) {
    const roles  = inferRoles(e.roleTitle, e.body.slice(0, 500));
    const tier   = inferTier(e.slug);
    const notes  = e.source === 'handcrafted'
      ? 'Hand-crafted template (gold standard)'
      : 'Extracted from April bulk export';
    const priority = e.priority ? `\n    priority: ${e.priority}` : '';

    lines.push(`  - file: ${e.file}`);
    lines.push(`    company: ${e.slug}`);
    lines.push(`    roles: [${roles.map(r => `"${r}"`).join(', ')}]`);
    lines.push(`    tier: ${tier}`);
    lines.push(`    source: ${e.source || 'bulk-export-2026-04-29'}${priority}`);
    lines.push(`    notes: ${notes}`);
  }

  return lines.join('\n') + '\n';
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(BULK_PATH)) {
    console.error(`[extract-cls] FATAL: bulk-export not found at ${BULK_PATH}`);
    process.exit(1);
  }

  fs.mkdirSync(CL_DIR, { recursive: true });

  const content = fs.readFileSync(BULK_PATH, 'utf8');
  const parsed  = parseBulkExport(content);

  if (parsed.length === 0) {
    console.error('[extract-cls] FATAL: no sections parsed from bulk-export — check heading format');
    process.exit(1);
  }

  const indexEntries = [];
  const seenSlugs    = new Map();

  for (const { companyName, roleTitle, slug, body } of parsed) {
    // Dedup: if slug exists, append -2, -3, ...
    const count = seenSlugs.get(slug) || 0;
    seenSlugs.set(slug, count + 1);
    const filename = count === 0 ? `${slug}.md` : `${slug}-${count + 1}.md`;

    if (!DRY_RUN) {
      fs.writeFileSync(path.join(CL_DIR, filename), body + '\n', 'utf8');
    }
    console.log(`  ${DRY_RUN ? '[dry]' : 'wrote'} ${filename}  (${companyName} — ${roleTitle})`);

    indexEntries.push({
      file:        filename,
      slug,
      roleTitle,
      body,
      source:      'bulk-export-2026-04-29',
    });
  }

  // Add .docx template entries if present (hand-crafted gold standard)
  const DOCX_TEMPLATES = [
    { file: 'accela.docx',      slug: 'accela',       roleTitle: 'Senior Scrum Master', priority: 'high', source: 'handcrafted' },
    { file: 'launchdarkly.docx', slug: 'launchdarkly', roleTitle: 'Senior Scrum Master', priority: 'high', source: 'handcrafted' },
    { file: 'twilio.docx',      slug: 'twilio',       roleTitle: 'Senior Manager Agile Program Management', priority: 'high', source: 'handcrafted' },
  ];
  for (const tmpl of DOCX_TEMPLATES) {
    if (fs.existsSync(path.join(CL_DIR, tmpl.file))) {
      indexEntries.push({ ...tmpl, body: tmpl.roleTitle });
      console.log(`  indexed  ${tmpl.file}  (hand-crafted template)`);
    }
  }

  const indexYml = buildIndexYml(indexEntries);
  const indexPath = path.join(CL_DIR, 'index.yml');

  if (!DRY_RUN) {
    fs.writeFileSync(indexPath, indexYml, 'utf8');
    console.log(`\n[extract-cls] index.yml written with ${indexEntries.length} entries`);
  }

  console.log(`\n[extract-cls] Extracted ${parsed.length} individual CLs from bulk-export`);
  if (DRY_RUN) console.log('[extract-cls] DRY-RUN: no files written');
}

const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (IS_CLI) main();
