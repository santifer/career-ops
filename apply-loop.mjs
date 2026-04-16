#!/usr/bin/env node

/**
 * apply-loop.mjs — Monitor pipeline and auto-apply every N minutes
 * 
 * Usage:
 *   node apply-loop.mjs            # Auto-apply every 5 minutes
 *   node apply-loop.mjs --interval 10  # Auto-apply every 10 minutes
 *   node apply-loop.mjs --once     # Apply once and exit
 */

import { spawn } from 'child_process';

const args = process.argv.slice(2);
const intervalArg = args.includes('--interval') ? parseInt(args[args.indexOf('--interval') + 1]) || 5 : 5;
const isOnce = args.includes('--once');

console.log(`🚀 Starting auto-apply worker`);
console.log(`   Interval: ${intervalArg} minutes`);
console.log(`   Mode: ${isOnce ? 'run once' : 'continuous'}`);
console.log(`\n📝 Log file: data/applications-log.md`);
console.log(`   Pipeline: data/pipeline.md`);
console.log(`   Config: config/profile.yml, config/credentials.yml\n`);

let runCount = 0;

function runApply() {
  runCount++;
  const timestamp = new Date().toLocaleString();
  const hrs = Math.floor(runCount / 60);
  
  console.log(`\n[${'█'.repeat(hrs % 10)}] Run #${runCount} (${timestamp})`);
  
  const proc = spawn('node', ['apply-auto.mjs'], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error(`Error: apply-auto.mjs exited with code ${code}`);
    }
    
    if (isOnce) {
      process.exit(code);
    }
  });
}

// Run once immediately
runApply();

// If running in loop mode, schedule recurring runs
if (!isOnce) {
  setInterval(runApply, intervalArg * 60 * 1000);
  console.log(`⏰ Next run in ${intervalArg} minutes...\n`);
}
