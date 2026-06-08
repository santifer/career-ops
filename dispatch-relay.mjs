#!/usr/bin/env node
/**
 * dispatch-relay.mjs — Validation Relay to Dispatch
 *
 * The "Dispatch" gate for production deploys. Nothing reaches production
 * unless it has been TESTED here first. This is the validated-journey relay
 * the Pulse Referral Engine vision calls for.
 *
 * What it does:
 *   1. GATE: runs the test suite (check-syntax + verify-pipeline).
 *   2. If green: stamps a dated entry into data/dispatch-manifest.json listing
 *      the validated items + evidence, and appends to data/deploy-log.json.
 *   3. If red: refuses to relay, prints what failed, exits non-zero.
 *
 * Usage:
 *   node dispatch-relay.mjs --item "fix: blocked/submitted states" [--files "a,b,c"]
 *   node dispatch-relay.mjs --status        # show last dispatch + deploy log tail
 *
 * Exit codes: 0 = relayed (ready to deploy), 1 = gate failed (blocked), 2 = usage error
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(ROOT, 'data', 'dispatch-manifest.json');
const DEPLOY_LOG = join(ROOT, 'data', 'deploy-log.json');

function saveJson(path, obj) { // atomic write (KAIZEN-ATOMIC-WRITE pattern)
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, path);
}
function loadJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}

if (process.argv.includes('--status')) {
  const m = loadJson(MANIFEST, { dispatches: [] });
  const d = loadJson(DEPLOY_LOG, { deploys: [] });
  console.log('\n📦 Last dispatch:', JSON.stringify(m.dispatches.at(-1) ?? '(none)', null, 2));
  console.log('\n🚀 Deploy log (last 3):', JSON.stringify(d.deploys.slice(-3), null, 2));
  process.exit(0);
}

const item = arg('--item');
if (!item) { console.error('Usage: node dispatch-relay.mjs --item "<description>" [--files "a,b,c"]'); process.exit(2); }
const files = (arg('--files', '') || '').split(',').map(s => s.trim()).filter(Boolean);

console.log('\n🚦 DISPATCH RELAY — running validation gate before relaying to production\n');
const gate = [
  { name: 'syntax (check-syntax.mjs)', cmd: 'node check-syntax.mjs' },
  { name: 'pipeline health (verify-pipeline.mjs)', cmd: 'node verify-pipeline.mjs' },
];
const evidence = [];
let failed = false;
for (const g of gate) {
  try {
    execSync(g.cmd, { cwd: ROOT, stdio: 'pipe' });
    console.log(`  ✅ ${g.name}`);
    evidence.push({ check: g.name, result: 'pass' });
  } catch (e) {
    console.log(`  ❌ ${g.name} — FAILED`);
    evidence.push({ check: g.name, result: 'fail' });
    failed = true;
  }
}

if (failed) {
  console.log('\n🔴 GATE FAILED — item NOT relayed to Dispatch. Fix the failing check above, then re-run.\n');
  process.exit(1);
}

const now = new Date().toISOString();
const manifest = loadJson(MANIFEST, { dispatches: [] });
const entry = { dispatched_at: now, item, files, evidence, status: 'validated-ready-to-deploy' };
manifest.dispatches.push(entry);
saveJson(MANIFEST, manifest);

const deployLog = loadJson(DEPLOY_LOG, { deploys: [] });
deployLog.deploys.push({ at: now, item, files, gate: 'passed' });
saveJson(DEPLOY_LOG, deployLog);

console.log('\n🟢 GATE PASSED — item relayed to Dispatch (data/dispatch-manifest.json).');
console.log('   Status: validated-ready-to-deploy. Run deploy-to-production.bat to ship.\n');
process.exit(0);
