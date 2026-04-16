#!/usr/bin/env node

/**
 * apply-pipeline.mjs — Full pipeline: scan → apply → report
 * 
 * Workflow:
 * 1. Scan for new job offers (all platforms)
 * 2. Add new findings to pipeline.md
 * 3. Apply to all pending jobs
 * 4. Generate daily summary report
 * 
 * Usage:
 *   node apply-pipeline.mjs              # Run once
 *   node apply-pipeline.mjs --interval 5 # Run every 5 minutes
 *   node apply-pipeline.mjs --bogota     # Run only Bogotá scan
 */

import { spawnSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'fs';
import yaml from 'js-yaml';

let cycle = 0;

function log(msg) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${msg}`);
}

function section(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(70)}\n`);
}

function runCommand(cmd, args = [], description = '') {
  log(`🔄 ${description || cmd}`);
  
  const result = spawnSync('node', [cmd, ...args], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  if (result.status !== 0) {
    log(`⚠️  ${cmd} exited with code ${result.status}`);
  }
  return result.status === 0;
}

function countPendingJobs() {
  if (!existsSync('data/pipeline.md')) return 0;
  
  const content = readFileSync('data/pipeline.md', 'utf8');
  const matches = content.match(/- \[ \]/g);
  return matches ? matches.length : 0;
}

function countApplications() {
  if (!existsSync('data/applications.md')) return 0;
  
  const content = readFileSync('data/applications.md', 'utf8');
  const matches = content.match(/\|/g);
  return (matches ? Math.floor(matches.length / 9) : 0) - 1; // Subtract header
}

async function main() {
  cycle++;
  
  section(`Pipeline Cycle ${cycle} — ${new Date().toLocaleString()}`);

  // Phase 1: Scan for new jobs
  log('📡 PHASE 1: Scanning for new jobs');
  
  const isBogota = process.argv.includes('--bogota');
  const isGlobal = process.argv.includes('--global');
  
  if (isBogota) {
    log('🇨🇴 Scanning Bogotá jobs only');
    runCommand('scan-bogota.mjs', [], 'Scanning Bogotá job portals');
  } else if (isGlobal) {
    log('🌍 Scanning global jobs');
    runCommand('scan-international.mjs', [], 'Scanning international job portals');
  } else {
    log('🔍 Normal scan (mixed local + international)');
    runCommand('scan.mjs', [], 'Running default scan');
  }

  const pendingCount = countPendingJobs();
  log(`📋 Pending jobs in pipeline: ${pendingCount}`);

  // Phase 2: Apply to pending jobs
  if (pendingCount > 0) {
    section('PHASE 2: Applying to pending jobs');
    
    log(`🤖 Applying to ${pendingCount} jobs...`);
    runCommand('apply-auto.mjs', [], `Auto-applying to pending jobs`);
  } else {
    section('PHASE 2: Skipped (no pending jobs)');
    log('Queue is empty, nothing to apply to');
  }

  // Phase 3: Generate summary
  section('PHASE 3: Summary');
  
  const totalApps = countApplications();
  log(`✅ Total applications tracked: ${totalApps}`);
  log(`📝 Report: data/applications-log.md`);
  
  if (existsSync('data/applications-log.md')) {
    const logContent = readFileSync('data/applications-log.md', 'utf8');
    const successCount = (logContent.match(/Status: \*\*success\*\*/g) || []).length;
    const errorCount = (logContent.match(/Status: \*\*error\*\*/g) || []).length;
    const alreadyAppliedCount = (logContent.match(/Status: \*\*already-applied\*\*/g) || []).length;
    
    log(`   ✅ Successful: ${successCount}`);
    log(`   ❌ Errors: ${errorCount}`);
    log(`   ⏭️  Already applied: ${alreadyAppliedCount}`);
  }

  // Log cycle to history
  const cycleLog = {
    cycle,
    timestamp: new Date().toISOString(),
    pending: pendingCount,
    total_applications: totalApps,
    scan_type: isBogota ? 'bogota' : isGlobal ? 'global' : 'default'
  };

  appendFileSync(
    'data/pipeline-history.jsonl',
    JSON.stringify(cycleLog) + '\n',
    'utf8'
  );

  log(`\n⏭️  Next cycle in ${process.argv.includes('--interval') ? process.argv[process.argv.indexOf('--interval') + 1] || 5 : 'N/A'} minutes`);
}

// Run main
main().catch(console.error);

// If --interval specified, repeat
if (process.argv.includes('--interval')) {
  const minutes = parseInt(process.argv[process.argv.indexOf('--interval') + 1]) || 5;
  setInterval(main, minutes * 60 * 1000);
  log(`\n🔄 Auto-pipeline loop enabled: every ${minutes} minutes`);
}
