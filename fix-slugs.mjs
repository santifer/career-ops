#!/usr/bin/env node

/**
 * fix-slugs.mjs — write verify-portals.mjs's suggested ATS slug fixes back
 * into portals.yml.
 *
 * verify-portals.mjs already probes every tracked company's ATS slug and, for
 * a failing Greenhouse/Ashby/Lever entry, cross-probes slug variants across
 * all three ATSes and attaches `suggested: { ats, slug }` when one resolves
 * (see discoverAlternates() in verify-portals.mjs). That tool is read-only —
 * this script is the write side: it reuses the SAME probe/suggestion logic
 * (no re-implementation, no HTML scraping, no hardcoded company list) and
 * patches the matching `tracked_companies` entry in portals.yml.
 *
 * Only entries verify-portals classifies as `missing` AND carries a
 * `suggested` alternate for are touched. Live/empty entries and genuinely
 * unresolved entries (no suggestion found) are left completely alone.
 *
 * The file is edited as text (line-level surgery inside the matching
 * company's block), not via full YAML parse+dump — portals.yml is full of
 * hand-written comments and documentation blocks that a `yaml.dump()`
 * round-trip would silently discard.
 *
 * Usage:
 *   node fix-slugs.mjs               # dry run (default, safe) — prints the diff, writes nothing
 *   node fix-slugs.mjs --dry-run     # same as above, explicit
 *   node fix-slugs.mjs --fix         # write the resolved slugs back to portals.yml
 *   node fix-slugs.mjs --apply       # alias for --fix
 *   node fix-slugs.mjs --file <path> # use a specific portals file
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

import { verifyPortalsFile } from './verify-portals.mjs';

const DEFAULT_PORTALS_PATH = process.env.CAREER_OPS_PORTALS || 'portals.yml';

/** Matches a `tracked_companies` list-item start line: `  - name: Foo`. */
const NAME_LINE_RE = /^([ \t]*)-\s*name:\s*(.+?)\s*$/;

/**
 * Split a portals.yml's raw text into per-company blocks, keyed by the exact
 * `name:` value, so a fix can be applied with plain line edits instead of a
 * full YAML re-serialization (which would drop every comment in the file).
 * Commented-out example entries (`# - name: ...`) never match — the regex
 * requires the line to start with `-` after only whitespace.
 *
 * @param {string} text - Raw portals.yml contents.
 * @returns {{lines: string[], blocks: Array<{name: string, indent: string, startLine: number, endLine: number}>}}
 */
export function splitCompanyBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(NAME_LINE_RE);
    if (m) {
      if (current) {
        current.endLine = i;
        blocks.push(current);
      }
      current = { name: m[2].trim(), indent: m[1], startLine: i, endLine: null };
    }
  }
  if (current) {
    current.endLine = lines.length;
    blocks.push(current);
  }
  return { lines, blocks };
}

/** Build the replacement careers_url/api pair for a resolved {ats, slug}. */
function resolvedUrls({ ats, slug, eu }) {
  if (ats === 'greenhouse') {
    return {
      careersUrl: `https://job-boards.greenhouse.io/${slug}`,
      api: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    };
  }
  if (ats === 'ashby') {
    return { careersUrl: `https://jobs.ashbyhq.com/${slug}`, api: null };
  }
  // lever
  return {
    careersUrl: `https://jobs.${eu ? 'eu.' : ''}lever.co/${slug}`,
    api: null,
  };
}

/**
 * Find an existing `field: value` line within a block's line range.
 *
 * @returns {number} Line index, or -1 if the field isn't present in the block.
 */
function findFieldLine(lines, startLine, endLine, fieldIndent, field) {
  const re = new RegExp(`^${fieldIndent}${field}:\\s*(.*)$`);
  for (let i = startLine; i < endLine; i++) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

/**
 * Apply one resolved suggestion to a company's block in-place (mutates `lines`).
 *
 * @param {string[]} lines - Full file, split by line (mutated).
 * @param {{name: string, indent: string, startLine: number, endLine: number}} block
 * @param {{ats: string, slug: string, eu?: boolean}} suggested - The new ATS/slug.
 * @param {string} oldAts - The ATS the entry used to resolve to (for the note).
 * @param {string} dateStr - YYYY-MM-DD, embedded in the migration note.
 * @returns {{careersUrlOld: string, careersUrlNew: string}} Summary for the diff printout.
 */
function applyFix(lines, block, suggested, oldAts, dateStr) {
  const fieldIndent = `${block.indent}  `;
  const { careersUrl, api } = resolvedUrls(suggested);

  const careersLine = findFieldLine(lines, block.startLine, block.endLine, fieldIndent, 'careers_url');
  const careersUrlOld = careersLine !== -1 ? lines[careersLine].split(':').slice(1).join(':').trim() : '';
  let insertAfter = careersLine;
  if (careersLine !== -1) {
    lines[careersLine] = `${fieldIndent}careers_url: ${careersUrl}`;
  } else {
    lines.splice(block.startLine + 1, 0, `${fieldIndent}careers_url: ${careersUrl}`);
    insertAfter = block.startLine + 1;
    block.endLine += 1;
  }

  const apiLine = findFieldLine(lines, block.startLine, block.endLine, fieldIndent, 'api');
  if (api) {
    if (apiLine !== -1) {
      lines[apiLine] = `${fieldIndent}api: ${api}`;
    } else {
      lines.splice(insertAfter + 1, 0, `${fieldIndent}api: ${api}`);
      block.endLine += 1;
      insertAfter += 1;
    }
  } else if (apiLine !== -1) {
    // Migrating away from Greenhouse — a stale `api:` field would point at a
    // dead boards-api.greenhouse.io endpoint the scanner would still try.
    lines.splice(apiLine, 1);
    block.endLine -= 1;
  }

  const note = `(slug migrated ${oldAts}->${suggested.ats} ${dateStr}, verify-portals)`;
  const notesLine = findFieldLine(lines, block.startLine, block.endLine, fieldIndent, 'notes');
  if (notesLine !== -1) {
    const raw = lines[notesLine].slice(lines[notesLine].indexOf('notes:') + 'notes:'.length).trim();
    const quoted = raw.startsWith('"') && raw.endsWith('"');
    const inner = quoted ? raw.slice(1, -1) : raw;
    lines[notesLine] = `${fieldIndent}notes: "${inner} ${note}"`;
  } else {
    lines.splice(insertAfter + 1, 0, `${fieldIndent}notes: "${note}"`);
    block.endLine += 1;
  }

  return { careersUrlOld, careersUrlNew: careersUrl };
}

/**
 * Compute the set of fixes to apply from a verify-portals run, and (unless
 * dryRun) write them into the raw text.
 *
 * @param {string} rawText - Current portals.yml contents.
 * @param {Array<object>} results - verifyCompanies()/verifyPortalsFile() rows.
 * @param {{dryRun?: boolean, dateStr?: string}} [opts]
 * @returns {{text: string, fixes: Array<{name: string, oldAts: string, newAts: string, careersUrlOld: string, careersUrlNew: string}>}}
 */
export function computeFixes(rawText, results, { dateStr = new Date().toISOString().slice(0, 10) } = {}) {
  const { lines, blocks } = splitCompanyBlocks(rawText);
  const blocksByName = new Map(blocks.map((b) => [b.name, b]));
  const fixes = [];

  for (const r of results) {
    if (r.status !== 'missing' || !r.suggested) continue;
    const block = blocksByName.get(r.name);
    if (!block) continue; // name mismatch — leave untouched rather than guess
    const { careersUrlOld, careersUrlNew } = applyFix(lines, block, r.suggested, r.ats || 'unknown', dateStr);
    fixes.push({
      name: r.name,
      oldAts: r.ats || 'unknown',
      newAts: r.suggested.ats,
      careersUrlOld,
      careersUrlNew,
    });
  }

  return { text: lines.join('\n'), fixes };
}

function printDiff(fixes, { dryRun }) {
  if (fixes.length === 0) {
    console.log('No resolvable slug fixes found — nothing to do.');
    return;
  }
  console.log(`${dryRun ? '[dry run] Would fix' : 'Fixed'} ${fixes.length} entr${fixes.length === 1 ? 'y' : 'ies'}:\n`);
  for (const f of fixes) {
    console.log(`  ${f.name}: ${f.oldAts} -> ${f.newAts}`);
    console.log(`    - ${f.careersUrlOld}`);
    console.log(`    + ${f.careersUrlNew}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix') || args.includes('--apply');
  const dryRun = !fix; // default is always safe — writing requires an explicit flag

  const fileFlag = args.indexOf('--file');
  const filePath = resolve(fileFlag === -1 ? DEFAULT_PORTALS_PATH : args[fileFlag + 1] || '');

  if (!existsSync(filePath)) {
    console.log(`fix-slugs: no portals file at ${filePath} — nothing to fix.`);
    return;
  }

  const { results } = await verifyPortalsFile(filePath);
  const rawText = readFileSync(filePath, 'utf-8');
  const { text, fixes } = computeFixes(rawText, results);

  printDiff(fixes, { dryRun });

  if (!dryRun && fixes.length > 0) {
    writeFileSync(filePath, text, 'utf-8');
    console.log(`\nportals.yml updated (${fixes.length} fixed).`);
  } else if (dryRun && fixes.length > 0) {
    console.log('\nRun with --fix to write these changes to portals.yml.');
  }
}

// Only run main() when invoked directly, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(`fix-slugs failed: ${err.message}`);
    process.exit(1);
  });
}
