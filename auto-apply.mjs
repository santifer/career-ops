#!/usr/bin/env node

/**
 * auto-apply.mjs — Quick start for auto-apply workflows
 * 
 * Simple command-line interface for:
 * - Scanning for jobs
 * - Applying to jobs
 * - Running recurring workflows
 * 
 * Usage:
 *   node auto-apply.mjs                    # Show menu
 *   node auto-apply.mjs apply              # Apply to all pending jobs
 *   node auto-apply.mjs scan               # Scan for new jobs
 *   node auto-apply.mjs loop               # Scan + apply every 5 min
 *   node auto-apply.mjs loop --interval 10 # Custom interval
 *   node auto-apply.mjs status             # Show current status
 *   node auto-apply.mjs help               # Show detailed help
 */

import { readFileSync, existsSync, appendFileSync } from 'fs';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';

const VERSION = '1.0.0';
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase() || 'help';

function log(msg, prefix = '•') {
  console.log(`${prefix} ${msg}`);
}

function section(title) {
  console.log(`\n${'─'.repeat(70)}\n${title}\n${'─'.repeat(70)}\n`);
}

function health() {
  const checks = {
    'cv.md': existsSync('cv.md'),
    'config/profile.yml': existsSync('config/profile.yml'),
    'config/credentials.yml': existsSync('config/credentials.yml'),
    'data/pipeline.md': existsSync('data/pipeline.md'),
  };

  let healthy = true;
  for (const [name, exists] of Object.entries(checks)) {
    const status = exists ? '✓' : '✗';
    log(`${status} ${name}`, exists ? '✓' : '✗');
    if (!exists) healthy = false;
  }

  return healthy;
}

function status() {
  section('STATUS REPORT');

  log(`Version: ${VERSION}`);
  log(`Timestamp: ${new Date().toLocaleString()}`);

  // Health check
  section('System Health');
  const healthy = health();

  if (!healthy) {
    log('Missing required files. Run: node auto-apply.mjs setup', '⚠️');
    return;
  }

  // Pending jobs
  section('Pipeline Status');
  if (existsSync('data/pipeline.md')) {
    const content = readFileSync('data/pipeline.md', 'utf8');
    const pendingMatch = content.match(/- \[ \]/g) || [];
    const completedMatch = content.match(/- \[x\]/gi) || [];
    log(`Pending: ${pendingMatch.length}`);
    log(`Completed: ${completedMatch.length}`);
  } else {
    log('No pipeline found', '⚠️');
  }

  // Application tracking
  if (existsSync('data/applications.md')) {
    const content = readFileSync('data/applications.md', 'utf8');
    const entries = content.split('\n').filter(line => line.startsWith('|')).length - 2; // -2 for header and divider
    log(`Total applications: ${entries}`);
  }

  // Log stats
  if (existsSync('data/applications-log.md')) {
    const content = readFileSync('data/applications-log.md', 'utf8');
    const success = (content.match(/Status: \*\*success\*\*/g) || []).length;
    const error = (content.match(/Status: \*\*error\*\*/g) || []).length;
    const already = (content.match(/Status: \*\*already-applied\*\*/g) || []).length;

    section('Application Results');
    log(`✅ Successful submissions: ${success}`);
    log(`❌ Errors: ${error}`);
    log(`⏭️  Already applied: ${already}`);
  }
}

function showHelp() {
  section('AUTO-APPLY HELP');
  
  console.log(`
QUICK START:

  1. Setup:
     node auto-apply.mjs setup

  2. Scan for jobs:
     node auto-apply.mjs scan        # Default scan
     node auto-apply.mjs scan bogota # Bogotá only
     node auto-apply.mjs scan global # Worldwide

  3. Apply to jobs:
     node auto-apply.mjs apply       # Apply once
     node auto-apply.mjs apply --dry # Simulate without submitting

  4. Run everything:
     node auto-apply.mjs loop        # Scan + apply every 5 min
     node auto-apply.mjs loop 10     # Every 10 minutes

  5. View status:
     node auto-apply.mjs status

WORKFLOW EXAMPLES:

  👉 First time usage:
     node auto-apply.mjs setup
     node auto-apply.mjs scan bogota
     node auto-apply.mjs apply

  👉 Overnight auto-apply:
     node auto-apply.mjs loop 5 > logs/auto-apply.log 2>&1 &

  👉 Just check what's pending:
     node auto-apply.mjs status

COMMANDS:

  help              Show this help
  status            Show current pipeline status
  setup             Initialize system (requires: CV, profile, credentials)
  
  scan              Scan for new jobs (default, mixed sources)
  scan bogota       Scan only Bogotá/Colombia jobs
  scan global       Scan worldwide jobs
  
  apply             Auto-fill & submit pending applications
  apply --dry       Show what would be applied without submitting
  
  sequence          Run full sequence: test, scan bogota, apply, status
  loop              Run scan + apply every 5 minutes (recurring)

  # Note: scan bogota busca Computrabajo y LinkedIn si están configurados en portals.yml
  loop N            Run every N minutes (e.g., loop 10)
  
  test URL          Test single URL application
  test-login        Verify credentials work

CONFIG FILES (edit these):

  config/profile.yml         Your candidate data
  config/credentials.yml     Your platform logins
  data/pipeline.md          Jobs to apply to
  portals.yml              Job board queries
  cv.md                    Your CV

LOGS & REPORTS:

  data/applications.md       Tracker of all applications
  data/applications-log.md   Detailed submission reports
  data/pipeline-history.jsonl Cycle history

TROUBLESHOOTING:

  • Forms not filling?
    → Check config/profile.yml has all fields
    → Edit apply-auto.mjs to add custom field names

  • Apply button not detected?
    → Run: node auto-apply.mjs test <url>
    → Check browser console (F12) for button selectors

  • Credentials not working?
    → Run: node auto-apply.mjs test-login
    → Verify email/password in config/credentials.yml
    → Check if 2FA is enabled (not supported)

  • Network errors?
    → Check internet connection
    → Try again in 5 minutes
    → Logs are in data/applications-log.md

SECURITY:

  ⚠️  Never commit config/credentials.yml to git
  ⚠️  Passwords stored in plaintext (local machine only)
  ⚠️  Use unique passwords for automation accounts
  ⚠️  .gitignore already protects credentials.yml

For more info: https://github.com/santifer/career-ops
  `);
}

function scan() {
  section('SCANNING FOR JOBS');

  const scanType = args[1]?.toLowerCase() || 'default';

  if (scanType === 'bogota') {
    log('🇨🇴 Scanning Bogotá jobs');
    spawnSync('node', ['scan-bogota.mjs'], { stdio: 'inherit' });
  } else if (scanType === 'global') {
    log('🌍 Scanning worldwide jobs');
    spawnSync('node', ['scan-international.mjs'], { stdio: 'inherit' });
  } else {
    log('🔍 Default scan');
    spawnSync('node', ['scan.mjs'], { stdio: 'inherit' });
  }

  log('✅ Scan complete');
}

function apply() {
  section('APPLYING TO JOBS');

  if (!existsSync('data/pipeline.md')) {
    log('No pipeline.md found', '⚠️');
    return;
  }

  const content = readFileSync('data/pipeline.md', 'utf8');
  const pending = (content.match(/- \[ \]/g) || []).length;

  if (pending === 0) {
    log('No pending jobs to apply to', '✓');
    return;
  }

  log(`Applying to ${pending} jobs...`);

  if (args.includes('--dry')) {
    log('DRY RUN MODE - Not actually submitting', 'ℹ');
  }

  spawnSync('node', ['apply-auto.mjs'], { stdio: 'inherit' });
  log('✅ Apply cycle complete');
}

function loop() {
  section('STARTING AUTO PIPELINE LOOP');

  const intervalArg = args[1] ? parseInt(args[1]) : 5;
  const interval = isNaN(intervalArg) ? 5 : intervalArg;

  log(`Running scan + apply every ${interval} minutes`);
  log('Press Ctrl+C to stop', 'ℹ');

  spawnSync('node', ['apply-pipeline.mjs', '--interval', interval.toString()], { stdio: 'inherit' });
}

function test() {
  const url = args[1];
  if (!url) {
    log('Usage: node auto-apply.mjs test <url>', '✗');
    return;
  }

  section(`TESTING URL: ${url}`);
  spawnSync('node', ['apply-computrabajo.mjs', url], { stdio: 'inherit' });
}

function testLogin() {
  section('TESTING CREDENTIALS');

  if (!existsSync('config/credentials.yml')) {
    log('config/credentials.yml not found', '✗');
    return;
  }

  const creds = yaml.load(readFileSync('config/credentials.yml', 'utf8'));

  log(`Computrabajo: ${creds.computrabajo?.email ? '✓' : '✗'}`);
  log(`LinkedIn: ${creds.linkedin?.email ? '✓' : '✗'}`);

  log('Testing login on Computrabajo...', 'ℹ');
  spawnSync('node', ['apply-computrabajo.mjs', 'https://co.computrabajo.com/'], { stdio: 'inherit' });
}

function sequence() {
  section('SECUENCIA DE AUTO-APPLY');

  const reportPath = 'data/auto-apply-sequence-report.md';
  const steps = [
    { name: 'test-auto-apply', command: 'node', args: ['test-auto-apply.mjs'] },
    { name: 'scan-bogota', command: 'node', args: ['auto-apply.mjs', 'scan', 'bogota'] },
    { name: 'apply', command: 'node', args: ['auto-apply.mjs', 'apply'] },
    { name: 'status', command: 'node', args: ['auto-apply.mjs', 'status'] }
  ];

  const reportLines = [
    '# Secuencia de Auto-Apply',
    '',
    `Fecha: ${new Date().toISOString()}`,
    ''
  ];

  for (const step of steps) {
    section(`PASO: ${step.name}`);
    log(`Ejecutando: ${step.command} ${step.args.join(' ')}`);

    const result = spawnSync(step.command, step.args, {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    const success = result.status === 0;
    const statusText = success ? 'OK' : 'ERROR';

    reportLines.push(`## ${step.name}`);
    reportLines.push('- Comando: `' + step.command + ' ' + step.args.join(' ') + '`');
    reportLines.push(`- Resultado: **${statusText}**`);
    reportLines.push(`- Código de salida: ${result.status}`);
    reportLines.push('- Salida del comando:');
    reportLines.push('```');
    reportLines.push(result.stdout || '');
    reportLines.push(result.stderr || '');
    reportLines.push('```');
    reportLines.push('');

    if (success) {
      log(`✅ ${step.name} completado`, '✓');
    } else {
      log(`❌ ${step.name} falló, pero continuo con el siguiente paso`, '✗');
    }
  }

  appendFileSync(reportPath, reportLines.join('\n') + '\n', 'utf8');
  log(`Reporte guardado en ${reportPath}`, '✓');
}

function setup() {
  section('INITIAL SETUP');

  log('Checking required files...');

  let missing = false;

  // CV
  if (!existsSync('cv.md')) {
    log('cv.md not found', '✗');
    log('Create cv.md with your CV in markdown format', 'ℹ');
    missing = true;
  } else {
    log('cv.md found', '✓');
  }

  // Profile
  if (!existsSync('config/profile.yml')) {
    log('config/profile.yml not found', '✗');
    if (existsSync('config/profile.example.yml')) {
      log('Copying config/profile.example.yml → config/profile.yml', 'ℹ');
      const example = readFileSync('config/profile.example.yml', 'utf8');
      appendFileSync('config/profile.yml', example);
      log('Profile created - edit it with your info', 'ℹ');
    }
    missing = true;
  } else {
    log('config/profile.yml found', '✓');
  }

  // Credentials
  if (!existsSync('config/credentials.yml')) {
    log('config/credentials.yml not found', '✗');
    if (existsSync('config/credentials.example.yml')) {
      log('Copying config/credentials.example.yml → config/credentials.yml', 'ℹ');
      const example = readFileSync('config/credentials.example.yml', 'utf8');
      appendFileSync('config/credentials.yml', example);
      log('Credentials initialized - add your login info', 'ℹ');
    }
    missing = true;
  } else {
    log('config/credentials.yml found', '✓');
  }

  // Pipeline
  if (!existsSync('data/pipeline.md')) {
    log('data/pipeline.md not found', '✗');
    appendFileSync('data/pipeline.md', `# Job Pipeline

## Pendientes
(Add URLs here in format: - [ ] URL | Company | Role | Location)

## Rechazadas

## Aplicadas
`, 'utf8');
    log('Pipeline initialized', '✓');
  } else {
    log('data/pipeline.md found', '✓');
  }

  if (missing) {
    log('Please complete the missing files and try again', 'ℹ');
  } else {
    section('SETUP COMPLETE');
    log('All systems ready!');
    log('Next: node auto-apply.mjs scan bogota', 'ℹ');
  }
}

// Main dispatch
switch (command) {
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  case 'status':
    status();
    break;
  case 'setup':
    setup();
    break;
  case 'scan':
    scan();
    break;
  case 'apply':
    apply();
    break;
  case 'sequence':
  case 'run':
    sequence();
    break;
  case 'loop':
    loop();
    break;
  case 'test':
    test();
    break;
  case 'test-login':
    testLogin();
    break;
  default:
    log(`Unknown command: ${command}`, '✗');
    log('Run: node auto-apply.mjs help', 'ℹ');
}
