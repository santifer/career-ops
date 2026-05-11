/**
 * GitHub Actions Scraper Runner
 * 
 * One-shot script that scans for all active tenants and runs the
 * full Playwright-powered scraper pipeline for each one.
 * 
 * This replaces worker-daemon.mjs (infinite loop) with a run-and-exit
 * model suitable for cron-triggered GitHub Actions.
 */

import postgres from 'postgres';

// Strip channel_binding which the postgres.js library doesn't support
const cleanDbUrl = (process.env.DATABASE_URL || '')
  .replace('&channel_binding=require', '')
  .replace('?channel_binding=require&', '?')
  .replace('?channel_binding=require', '');

const sql = postgres(cleanDbUrl, {
  ssl: 'require',
  max: 5,
  idle_timeout: 20,
  connect_timeout: 30,
});

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function buildGithubRunUrl() {
  const base = (process.env.GITHUB_SERVER_URL || '').replace(/\/$/, '');
  const repo = process.env.GITHUB_REPOSITORY || '';
  const runId = process.env.GITHUB_RUN_ID || '';
  if (!base || !repo || !runId) return (process.env.RUN_URL || '').trim();
  return `${base}/${repo}/actions/runs/${runId}`;
}

/**
 * GitHub Actions "Notify dashboard" cannot fill `user_id` / `action_script` on scheduled
 * cron runs (workflow_dispatch inputs are empty), so `/api/background/complete` returns 400.
 * Notify once per finished tenant from the worker with real fields.
 */
async function notifyDashboardCompletion({ userId, exitCode }) {
  const url = (process.env.DASHBOARD_WEBHOOK_URL || '').trim();
  const secret = (process.env.WORKER_WEBHOOK_SECRET || '').trim();
  if (!url || !secret) return;

  const uid = String(userId ?? '').trim();
  if (!uid) return;

  const actionScript = (process.env.ACTION_SCRIPT || 'scratch-scan.mjs').trim();
  const actionArgs = (process.env.ACTION_ARGS || '').trim();
  const status = exitCode === 0 ? 'success' : 'failure';
  const runUrl = buildGithubRunUrl();
  const runId = [process.env.GITHUB_RUN_ID || process.env.RUN_ID || 'local', uid].filter(Boolean).join('-');

  const payload = {
    user_id: uid,
    run_id: runId,
    action_script: actionScript,
    action_args: actionArgs,
    status,
    run_url: runUrl || undefined,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': secret,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      console.error(`[dashboard-webhook] HTTP ${res.status} for user ${uid}: ${text.slice(0, 300)}`);
    } else {
      console.log(`[dashboard-webhook] Recorded ${status} for user ${uid} (${actionScript})`);
    }
  } catch (e) {
    console.error(`[dashboard-webhook] Request failed for user ${uid}:`, e?.message || e);
  }
}

function runScraper(userId) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️  Starting scan for user [${userId}]`);
    const start = Date.now();

    const script = process.env.ACTION_SCRIPT || 'scratch-scan.mjs';
    const rawArgs = (process.env.ACTION_ARGS || '').trim();
    // Job URLs (LinkedIn, etc.) contain `&` and must stay a single argv — never split on spaces.
    const scriptArgs =
      script === 'add-job.mjs' && rawArgs ? [rawArgs] : rawArgs ? rawArgs.split(/\s+/) : [];

    const child = spawn('node', [script, ...scriptArgs], {
      cwd: ROOT,
      env: { ...process.env, SCAN_USER_ID: userId.toString(), RUN_ID: process.env.RUN_ID || '' },
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`✅ User [${userId}] scan completed in ${elapsed}s`);
      } else {
        console.error(`⚠️  User [${userId}] scan exited with code ${code} (${elapsed}s)`);
      }
      resolve(code);
    });

    child.on('error', (err) => {
      console.error(`❌ User [${userId}] scan failed:`, err.message);
      reject(err);
    });
  });
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  career-ops — GitHub Actions Scraper');
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════');

  const specificUserId = process.env.SCAN_USER_ID;
  let failed = 0;

  if (specificUserId) {
    // Manual trigger for a specific user — propagate exit code to Actions
    console.log(`\n🎯 Targeting specific user: ${specificUserId}`);
    let lastCode = 1;
    try {
      lastCode = await runScraper(specificUserId);
      if (lastCode !== 0) failed++;
    } catch {
      failed++;
      lastCode = 1;
    }
    await notifyDashboardCompletion({ userId: specificUserId, exitCode: lastCode });
  } else {
    // Cron mode: scan all active tenants
    const activeUsers = await sql`
      SELECT user_id FROM user_profiles ORDER BY updated_at DESC NULLS LAST
    `;

    if (activeUsers.length === 0) {
      console.log('\n💤 No active profiles found. Nothing to scan.');
    } else {
      console.log(`\n📡 Found ${activeUsers.length} active tenant(s). Running scrapers sequentially...\n`);
      
      let success = 0;

      for (const tenant of activeUsers) {
        let code = 1;
        try {
          code = await runScraper(tenant.user_id);
          if (code === 0) success++;
          else failed++;
        } catch {
          failed++;
          code = 1;
        }
        await notifyDashboardCompletion({ userId: tenant.user_id, exitCode: code });
      }

      console.log('\n═══════════════════════════════════════════');
      console.log(`  SCRAPER RUN COMPLETE`);
      console.log(`  Tenants scanned: ${success} success, ${failed} failed`);
      console.log('═══════════════════════════════════════════');
    }
  }

  await sql.end();
  // Exit non-zero if any tenant failed so GitHub Actions marks the job as failed
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('🔥 Fatal error:', e);
  process.exit(1);
});
