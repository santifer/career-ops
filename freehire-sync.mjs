#!/usr/bin/env node

/**
 * freehire-sync.mjs — Bidirectional sync tool for freehire.dev
 *
 * Usage:
 *   node freehire-sync.mjs              # push local application status updates to freehire
 *   node freehire-sync.mjs --pull       # check for drift and print a report
 *   node freehire-sync.mjs --dry-run    # run in preview/dry-run mode
 *   node freehire-sync.mjs --notes      # push application notes to freehire note subcommand
 */

import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { loadSlugMap, mapStatusToStage } from './freehire-core.mjs';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node freehire-sync.mjs [options]

Options:
  --pull      Check for drift and print a report comparing local and remote stages
  --dry-run   Preview actions without making changes
  --notes     Sync application notes to Freehire
  --help, -h  Show this help message
  `);
  process.exit(0);
}

const pull = args.includes('--pull');
const dryRun = args.includes('--dry-run');
const syncNotes = args.includes('--notes');

// Verify freehire CLI is present on PATH unless in dry-run/mock mode
if (!dryRun && !process.env.FREEHIRE_MOCK) {
  try {
    execFileSync('freehire', ['--help'], { stdio: 'ignore' });
  } catch (err) {
    console.error("Error: 'freehire' CLI command not found on PATH. Please install freehire and run 'freehire auth login' first.");
    process.exit(1);
  }
}

const APPS_FILE = process.env.CAREER_OPS_TRACKER || (existsSync('data/applications.md') ? 'data/applications.md' : 'applications.md');
if (!existsSync(APPS_FILE)) {
  console.error(`Error: Tracker file not found at ${APPS_FILE}`);
  process.exit(1);
}

const content = readFileSync(APPS_FILE, 'utf-8');
const lines = content.split('\n');
const slugMap = loadSlugMap(process.env.FREEHIRE_SLUG_MAP);

let syncCount = 0;
let driftCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim().startsWith('|')) continue;

  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) continue;
  if (parts[1] === '#' || parts[1] === '---' || parts[1] === '') continue;

  const company = parts[3];
  const role = parts[4];
  const status = parts[6];
  const notes = parts[9] || '';

  // Extract all URLs on this row
  const urls = line.match(/https?:\/\/[^\s|)]+/g) || [];
  let slug = null;
  for (const url of urls) {
    if (slugMap[url]) {
      slug = slugMap[url];
      break;
    }
  }

  if (!slug) continue;

  const stage = mapStatusToStage(status);
  if (!stage) continue;

  if (pull) {
    // Pull / Drift detection mode
    let remoteStage = null;
    if (dryRun || process.env.FREEHIRE_MOCK) {
      remoteStage = process.env.FREEHIRE_MOCK_DRIFT === '1' ? 'saved' : stage;
    } else {
      try {
        const stdout = execFileSync('freehire', ['show', slug, '--json'], { encoding: 'utf-8' });
        const job = JSON.parse(stdout);
        remoteStage = job.stage || job.status || null;
      } catch (err) {
        console.error(`⚠️  Failed to fetch remote stage for ${company} - ${role} (${slug}): ${err.message}`);
        continue;
      }
    }

    if (remoteStage && remoteStage.toLowerCase() !== stage.toLowerCase()) {
      console.log(`[DRIFT] ${company} | ${role} (${slug}): local status '${status}' (stage '${stage}') vs Freehire stage '${remoteStage}'`);
      driftCount++;
    }
  } else {
    // Push mode
    console.log(`Syncing ${company} | ${role} (${slug}) → stage: ${stage}`);
    if (dryRun || process.env.FREEHIRE_MOCK) {
      console.log(`[dry-run] Would run: freehire stage ${slug} ${stage}`);
    } else {
      try {
        execFileSync('freehire', ['stage', slug, stage]);
      } catch (err) {
        console.error(`⚠️  Failed to sync stage for ${company} - ${role} (${slug}): ${err.message}`);
        continue;
      }
    }

    if (syncNotes && notes && notes !== '—' && notes !== '-') {
      console.log(`Syncing notes for ${company} | ${role} (${slug})`);
      if (dryRun || process.env.FREEHIRE_MOCK) {
        console.log(`[dry-run] Would run: freehire note ${slug} "${notes}"`);
      } else {
        try {
          execFileSync('freehire', ['note', slug, notes]);
        } catch (err) {
          console.error(`⚠️  Failed to sync notes for ${company} - ${role} (${slug}): ${err.message}`);
        }
      }
    }
    syncCount++;
  }
}

if (pull) {
  console.log(`\nDrift detection complete. Found ${driftCount} drifted application(s).`);
} else {
  console.log(`\nPush sync complete. Synced ${syncCount} application(s).`);
}
