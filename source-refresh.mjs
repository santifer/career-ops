#!/usr/bin/env node

import { execFileSync } from 'child_process';

function parseArgs(argv) {
  const args = {
    source: 'startup-map-berlin',
    offset: 0,
    limit: null,
    pages: 4,
    region: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') args.source = argv[++i] || args.source;
    else if (arg === '--offset') args.offset = Number(argv[++i] || 0);
    else if (arg === '--limit') args.limit = Number(argv[++i] || 0);
    else if (arg === '--pages') args.pages = Number(argv[++i] || 4);
    else if (arg === '--region') args.region = argv[++i] || null;
    else if (arg === '--dry-run') args.dryRun = true;
  }

  return args;
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const fetchArgs = [
    'fetch-company-source.mjs',
    '--source', args.source,
    '--offset', String(args.offset),
    '--pages', String(args.pages),
  ];
  if (args.limit) fetchArgs.push('--limit', String(args.limit));
  if (args.region) fetchArgs.push('--region', args.region);
  if (args.dryRun) fetchArgs.push('--dry-run');

  run('node', fetchArgs);
  if (args.dryRun) return;
  run('node', ['scan-company-dumps.mjs', '--write']);
  run('node', ['build-company-review-queue.mjs']);
  run('node', ['enrich-company-review-queue.mjs', '--limit', '8']);
  run('node', ['build-tracker-candidate-queue.mjs']);
}

main();
