#!/usr/bin/env node
/**
 * scripts/migrate-plists-to-wrapper.mjs
 *
 * One-shot helper that previews (or applies) rewrites of all launchd plists
 * under scripts/launchd/ to invoke via launchd-wrapper.mjs.
 *
 * DRY-RUN BY DEFAULT — prints diffs to stdout without touching any file.
 * Apply with --write.
 *
 * Usage:
 *   node scripts/migrate-plists-to-wrapper.mjs            # dry-run: print diffs
 *   node scripts/migrate-plists-to-wrapper.mjs --write    # apply rewrites + backup originals
 *   node scripts/migrate-plists-to-wrapper.mjs --help     # show help
 *
 * What it does for each plist:
 *   1. Parses the ProgramArguments array from the plist XML.
 *   2. Skips if the plist ALREADY invokes launchd-wrapper.mjs (idempotent).
 *   3. Skips if ProgramArguments is empty or can't be parsed.
 *   4. Determines the new ProgramArguments that invoke:
 *        node /path/to/launchd-wrapper.mjs \
 *          --label=<Label from plist> \
 *          --max-retries=2 \
 *          --retry-backoff-sec=60 \
 *          -- <original ProgramArguments...>
 *   5. Prints a unified-style diff showing old vs new ProgramArguments.
 *   6. In --write mode: backs up original to scripts/launchd-archive/<plist>.<timestamp>.bak
 *      then writes the rewritten plist in place.
 *
 * Integration notes for humans applying the rewrites (--write + manual launchctl):
 *   For each rewritten plist, reload into launchd:
 *     launchctl bootout gui/$(id -u)/com.mitchell.career-ops.<name> 2>/dev/null || true
 *     launchctl bootstrap gui/$(id -u) \
 *       /Users/mitchellwilliams/Documents/career-ops/scripts/launchd/<plist>
 *
 * Plists NOT rewritten by this script (they need special handling):
 *   - cloudflared*.plist   — these are persistent daemons (KeepAlive=true), not
 *                            batch jobs. Retry logic doesn't apply; they restart via KeepAlive.
 *   - dashboard-server.plist — same reasoning (persistent server).
 *   - telegram-bot.plist   — same (persistent server).
 *   - chrome-debugging.plist — debug helper, not a scheduled job.
 *   - *-wrapper.mjs ones   — already wrapped (idempotent check handles this).
 *
 * Part of P1-8 from the adjudicated council report (2026-05-19).
 * See: data/council-input-quality-audit-2026-05-19-adjudicated.md § P1-8
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PLIST_DIR = join(ROOT, 'scripts', 'launchd');
const ARCHIVE_DIR = join(ROOT, 'scripts', 'launchd-archive');
const WRAPPER_PATH = join(ROOT, 'scripts', 'launchd-wrapper.mjs');

// ── Plists to skip — persistent daemons that should NOT be wrapped ────────────

const SKIP_LABELS = new Set([
  'com.mitchell.career-ops.cloudflared',
  'com.mitchell.career-ops.cloudflared-staging',
  'com.mitchell.career-ops.cloudflared-staging-nohup-wrapper',
  'com.mitchell.career-ops.dashboard-server',
  'com.mitchell.career-ops.telegram-bot',
  'com.mitchell.career-ops.chrome-debugging',
]);

// ── Minimal plist XML parser ──────────────────────────────────────────────────
//
// We parse just enough plist XML to extract Label + ProgramArguments, and to
// do a targeted replacement of the ProgramArguments block. We deliberately
// avoid a full plist parse library to keep this self-contained.

/**
 * Extract the string value of a top-level <key>Label</key> from plist XML.
 */
function extractLabel(xml) {
  const m = xml.match(/<key>Label<\/key>\s*<string>([^<]+)<\/string>/);
  return m ? m[1].trim() : null;
}

/**
 * Extract the <key>ProgramArguments</key><array>...</array> block's items
 * as an array of strings.
 * Returns null if the block is not found.
 */
function extractProgramArguments(xml) {
  // Match from <key>ProgramArguments</key> to the closing </array>
  const blockMatch = xml.match(
    /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/
  );
  if (!blockMatch) return null;

  const block = blockMatch[1];
  // Extract each <string>...</string> value (handles XML entities)
  const items = [];
  const re = /<string>([\s\S]*?)<\/string>/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    items.push(unescapeXmlEntities(m[1]));
  }
  // Also handle <!-- comments --> inside the array — they are ignored by the re
  return items;
}

/**
 * Replace the ProgramArguments block in the plist XML with new items.
 * Preserves indentation (4 spaces, matching the existing style).
 * Does NOT touch any other part of the XML.
 */
function replaceProgramArguments(xml, newItems) {
  const newBlock =
    '    <key>ProgramArguments</key>\n' +
    '    <array>\n' +
    newItems.map(s => `        <string>${escapeXmlEntities(s)}</string>`).join('\n') + '\n' +
    '    </array>';

  // Replace the original block (including any inline XML comments inside the array)
  return xml.replace(
    /<key>ProgramArguments<\/key>\s*<array>[\s\S]*?<\/array>/,
    newBlock
  );
}

function unescapeXmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeXmlEntities(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Diff rendering ────────────────────────────────────────────────────────────

/**
 * Render a minimal unified-style diff showing old vs new ProgramArguments lines.
 * Not a real unified diff (no line numbers) — just enough to be readable.
 */
function renderDiff(plistFile, oldItems, newItems) {
  const lines = [];
  lines.push(`--- ${plistFile} (original ProgramArguments)`);
  lines.push(`+++ ${plistFile} (with launchd-wrapper)`);
  lines.push(`@@ ProgramArguments @@`);

  const maxLen = Math.max(oldItems.length, newItems.length);
  // Find first differing line
  for (let i = 0; i < maxLen; i++) {
    const old = oldItems[i];
    const nw = newItems[i];
    if (old !== undefined && (i >= newItems.length || old !== nw)) {
      lines.push(`-   <string>${escapeXmlEntities(old)}</string>`);
    }
    if (nw !== undefined && (i >= oldItems.length || old !== nw)) {
      lines.push(`+   <string>${escapeXmlEntities(nw)}</string>`);
    }
    if (old !== undefined && nw !== undefined && old === nw) {
      lines.push(`    <string>${escapeXmlEntities(old)}</string>`);
    }
  }
  return lines.join('\n');
}

// ── Build new ProgramArguments ────────────────────────────────────────────────

/**
 * Compute the new ProgramArguments that route through launchd-wrapper.mjs.
 *
 * The wrapper is always invoked as:
 *   node <wrapper-path> --label=<label> --max-retries=2 --retry-backoff-sec=60 -- <original...>
 *
 * We use the full absolute path to the node binary that is currently running
 * this script — consistent with how most plists already reference node.
 */
function buildNewArgs(label, originalArgs) {
  const nodeBin = process.execPath; // e.g. /Users/mitchellwilliams/.nvm/versions/node/v24.14.0/bin/node
  return [
    nodeBin,
    WRAPPER_PATH,
    `--label=${label}`,
    '--max-retries=2',
    '--retry-backoff-sec=60',
    '--',
    ...originalArgs,
  ];
}

// ── Already wrapped? ──────────────────────────────────────────────────────────

function alreadyWrapped(args) {
  return args.some(a => a.includes('launchd-wrapper.mjs'));
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage:\n' +
      '  node scripts/migrate-plists-to-wrapper.mjs          # dry-run: print diffs\n' +
      '  node scripts/migrate-plists-to-wrapper.mjs --write  # apply + backup originals\n'
    );
    process.exit(0);
  }

  const writeMode = args.includes('--write');

  if (!writeMode) {
    console.log('DRY-RUN mode (add --write to apply)\n');
  } else {
    console.log('WRITE mode — plists will be rewritten in place after backup\n');
    mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  // Enumerate plists
  let plistFiles;
  try {
    plistFiles = readdirSync(PLIST_DIR).filter(f => f.endsWith('.plist')).sort();
  } catch (err) {
    console.error(`Cannot read plist directory: ${err.message}`);
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  let diffedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const plistFile of plistFiles) {
    const plistPath = join(PLIST_DIR, plistFile);
    let xml;
    try {
      xml = readFileSync(plistPath, 'utf-8');
    } catch (err) {
      console.error(`ERROR reading ${plistFile}: ${err.message}`);
      errorCount++;
      continue;
    }

    const label = extractLabel(xml);
    if (!label) {
      console.warn(`SKIP ${plistFile} — could not extract Label`);
      skippedCount++;
      continue;
    }

    // Skip persistent daemons
    if (SKIP_LABELS.has(label)) {
      console.log(`SKIP ${plistFile} — persistent daemon (${label}), not a batch job`);
      skippedCount++;
      continue;
    }

    const originalArgs = extractProgramArguments(xml);
    if (originalArgs === null) {
      console.warn(`SKIP ${plistFile} — no ProgramArguments found`);
      skippedCount++;
      continue;
    }

    if (originalArgs.length === 0) {
      console.warn(`SKIP ${plistFile} — ProgramArguments is empty`);
      skippedCount++;
      continue;
    }

    // Idempotent: already wrapped
    if (alreadyWrapped(originalArgs)) {
      console.log(`SKIP ${plistFile} — already invokes launchd-wrapper.mjs`);
      skippedCount++;
      continue;
    }

    const newArgs = buildNewArgs(label, originalArgs);
    const diff = renderDiff(plistFile, originalArgs, newArgs);

    console.log(diff);
    console.log('');
    diffedCount++;

    if (writeMode) {
      // Backup original
      const backupPath = join(ARCHIVE_DIR, `${plistFile}.${timestamp}.bak`);
      try {
        writeFileSync(backupPath, xml, 'utf-8');
        console.log(`  ✓ backed up to scripts/launchd-archive/${plistFile}.${timestamp}.bak`);
      } catch (err) {
        console.error(`  ERROR backing up ${plistFile}: ${err.message} — skipping write`);
        errorCount++;
        continue;
      }

      // Write rewritten plist
      try {
        const newXml = replaceProgramArguments(xml, newArgs);
        writeFileSync(plistPath, newXml, 'utf-8');
        console.log(`  ✓ rewrote ${plistFile}`);
        console.log(`    Reload: launchctl bootout gui/$(id -u)/${label} 2>/dev/null || true`);
        console.log(`            launchctl bootstrap gui/$(id -u) ${plistPath}`);
      } catch (err) {
        console.error(`  ERROR writing ${plistFile}: ${err.message}`);
        errorCount++;
        continue;
      }

      console.log('');
    }
  }

  // Summary
  console.log('─'.repeat(60));
  console.log(`Summary: ${diffedCount} to rewrite, ${skippedCount} skipped, ${errorCount} errors`);
  if (!writeMode && diffedCount > 0) {
    console.log(`\nRun with --write to apply all ${diffedCount} rewrites.`);
    console.log('Each plist will be backed up to scripts/launchd-archive/ before modification.');
  }
  if (writeMode && diffedCount > 0) {
    console.log(`\nAll ${diffedCount} plists rewritten. Run the launchctl commands above for each.`);
    console.log('\nOr reload all at once (bash loop):');
    console.log(
      '  for plist in /Users/mitchellwilliams/Documents/career-ops/scripts/launchd/*.plist; do\n' +
      '    label=$(plutil -extract Label raw "$plist" 2>/dev/null)\n' +
      '    [ -n "$label" ] && launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true\n' +
      '    launchctl bootstrap "gui/$(id -u)" "$plist"\n' +
      '  done'
    );
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
