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

    const script = process.env.ACTION_SCRIPT || 'scratch-scan.mjs';
    const scriptArgs = process.env.ACTION_ARGS ? process.env.ACTION_ARGS.split(' ') : [];

    const child = spawn('node', [script, ...scriptArgs], {
      cwd: ROOT,
      env: { ...process.env, SCAN_USER_ID: userId.toString() },
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

  if (specificUserId) {
    // Manual trigger for a specific user
    console.log(`\n🎯 Targeting specific user: ${specificUserId}`);
    await runScraper(specificUserId);
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
      let failed = 0;

      for (const tenant of activeUsers) {
        try {
          const code = await runScraper(tenant.user_id);
          if (code === 0) success++;
          else failed++;
        } catch {
          failed++;
        }
      }

      console.log('\n═══════════════════════════════════════════');
      console.log(`  SCRAPER RUN COMPLETE`);
      console.log(`  Tenants scanned: ${success} success, ${failed} failed`);
      console.log('═══════════════════════════════════════════');
    }
  }

  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error('🔥 Fatal error:', e);
  process.exit(1);
});
