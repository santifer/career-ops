#!/usr/bin/env node

/**
 * check-liveness.mjs — Job link liveness checker via agent-browser
 *
 * Tests whether job posting URLs are still active or have expired.
 * Uses the same detection logic as scan.md step 7.5.
 * Zero Claude API tokens — pure agent-browser CLI.
 *
 * Usage:
 *   node check-liveness.mjs <url1> [url2] ...
 *   node check-liveness.mjs --file urls.txt
 *   node check-liveness.mjs --portal <name> <url1> ...
 *
 * Options:
 *   --portal <name>   Load portal session (--session-name <name>) for auth-gated sites
 *   --file <path>     Read URLs from file
 *
 * Exit code: 0 if all active, 1 if any expired or uncertain
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { classifyLiveness } from './liveness-core.mjs';

function ab(args, portal, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const portalArgs = portal ? ['--session-name', portal] : [];
    const proc = spawn('agent-browser', [...portalArgs, ...args], {
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(stderr || `agent-browser exited ${code}`));
      }
    });
    proc.on('error', reject);
  });
}

async function checkUrl(url, portal) {
  try {
    const nav = await ab(['open', url, '--timeout', '20000', '--json'], portal, 25000);
    if (!nav.success) {
      return { result: 'expired', reason: `navigation failed: ${nav.error}` };
    }

    // Give SPAs time to hydrate
    await new Promise(r => setTimeout(r, 2000));

    const textResult = await ab(['eval', "document.body ? document.body.innerText : ''", '--json'], portal);
    const snapResult = await ab(['snapshot', '-i', '--json'], portal);

    const bodyText = textResult.success ? (textResult.data?.result || '') : '';
    const refs = snapResult.success ? (snapResult.data?.refs || {}) : {};

    const applyControls = Object.values(refs)
      .map(el => el.name || '')
      .filter(Boolean);

    return classifyLiveness({ status: 200, finalUrl: url, bodyText, applyControls });

  } catch (err) {
    return { result: 'expired', reason: `navigation error: ${err.message.split('\n')[0]}` };
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node check-liveness.mjs <url1> [url2] ...');
    console.error('       node check-liveness.mjs --file urls.txt');
    console.error('       node check-liveness.mjs --portal <name> <url1> ...');
    process.exit(1);
  }

  // Parse --portal flag
  let portal = null;
  const cleaned = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--portal' && i + 1 < args.length) {
      portal = args[++i];
    } else if (args[i] === '--file' && i + 1 < args.length) {
      const text = await readFile(args[++i], 'utf-8');
      cleaned.push(...text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
    } else {
      cleaned.push(args[i]);
    }
  }

  const urls = cleaned.filter(a => !a.startsWith('--'));

  if (urls.length === 0) {
    console.error('Usage: node check-liveness.mjs <url1> [url2] ...');
    process.exit(1);
  }

  console.log(`Checking ${urls.length} URL(s) via agent-browser${portal ? ` (session: ${portal})` : ''}...\n`);

  let active = 0, expired = 0, uncertain = 0;

  for (const url of urls) {
    const { result, reason } = await checkUrl(url, portal);
    const icon = { active: '✅', expired: '❌', uncertain: '⚠️' }[result];
    console.log(`${icon} ${result.padEnd(10)} ${url}`);
    if (result !== 'active') console.log(`           ${reason}`);
    if (result === 'active') active++;
    else if (result === 'expired') expired++;
    else uncertain++;
  }

  console.log(`\nResults: ${active} active  ${expired} expired  ${uncertain} uncertain`);
  if (expired > 0 || uncertain > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
