#!/usr/bin/env node

// Auto-scan script: Runs /career-ops scan every X minutes
// Usage: node auto-scan.mjs <interval_minutes>

import { spawn } from 'child_process';

const interval = parseInt(process.argv[2]) || 60; // Default 60 minutes

console.log(`Starting auto-scan every ${interval} minutes...`);

setInterval(() => {
  console.log(`Running scan at ${new Date().toISOString()}`);
  const child = spawn('node', ['scan.mjs'], { stdio: 'inherit' });
  child.on('close', (code) => {
    console.log(`Scan finished with code ${code}`);
  });
}, interval * 60 * 1000);