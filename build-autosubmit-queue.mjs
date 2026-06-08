#!/usr/bin/env node
/**
 * build-autosubmit-queue.mjs
 * Step 1 of the Windows AutoSubmit bat: read Kanban, find eligible A/B non-referral
 * new-hot cards, write queue to data/autosubmit-queue.json.
 *
 * Extracted from run-autosubmit.bat 2026-05-13 — inline node -e multiline JS
 * fails in Windows CMD (treats JS keywords as batch commands).
 *
 * Exit codes: 0 = ok (even if queue is empty), 1 = fatal (can't read Kanban)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KANBAN_PATH = join(__dirname, 'dashboard', 'job-pulse-kanban.html');
const QUEUE_PATH  = join(__dirname, 'data', 'autosubmit-queue.json');

/**
 * TD-28 (2026-05-26): Rewrite marketing-wrapper URLs to canonical Greenhouse board URLs
 * before adding to the queue. Mirrors canonicalizeApplyUrl() in auto-submit.mjs.
 * Stripe, Databricks, and any company carrying ?gh_jid= on their own careers page.
 */
function normalizeQueueUrl(url) {
  try {
    if (/job-boards\.greenhouse\.io\/[^/]+\/jobs\/\d+/i.test(url)) return url;
    const legacy = url.match(/boards\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i);
    if (legacy) return `https://job-boards.greenhouse.io/${legacy[1]}/jobs/${legacy[2]}`;
    const stripeM = url.match(/stripe\.com\/jobs\/listing\/[^/]+\/(\d+)/i);
    if (stripeM) return `https://job-boards.greenhouse.io/stripe/jobs/${stripeM[1]}`;
    const databricksM = url.match(/databricks\.com[^?#]*[?&]gh_jid=(\d+)/i);
    if (databricksM) return `https://job-boards.greenhouse.io/databricks/jobs/${databricksM[1]}`;
    const ghJid = url.match(/[?&]gh_jid=(\d+)/i);
    if (ghJid) {
      const host = new URL(url).hostname.replace(/^www\./, '');
      const board = host.split('.')[0];
      return `https://job-boards.greenhouse.io/${board}/jobs/${ghJid[1]}`;
    }
    return url;
  } catch {
    return url;
  }
}

let html;
try {
  html = readFileSync(KANBAN_PATH, 'utf8');
} catch (e) {
  console.error('Cannot read Kanban:', e.message);
  process.exit(1);
}

// Tier-1: F500 A/B non-referral cards in new-hot (auto-submit by standing approval)
// Tier-2: any grade A/B card in autosubmit-ready (manually whitelisted by user)
const eligible = [];
const seen = new Set();
for (const match of html.matchAll(/\{[^}]*id:'(live-\d+)'[^}]*\}/gs)) {
  const b        = match[0];
  const id       = b.match(/id:'(live-\d+)'/)?.[1];
  const grade    = b.match(/grade:'([AB])'/)?.[1];
  const company  = b.match(/company:'([^']+)'/)?.[1];
  const colId    = b.match(/columnId:'([^']+)'/)?.[1];
  const isRef    = /isWarmReferral:true/.test(b);
  const url      = b.match(/url:'([^']+)'/)?.[1];
  if (!id || !grade || !url) continue;
  if (seen.has(id)) continue;

  // Tier-1: new-hot, A/B, non-referral
  if (colId === 'new-hot' && !isRef) {
    eligible.push({ id, company, grade, url: normalizeQueueUrl(url), tier: 1 });
    seen.add(id);
    continue;
  }
  // Tier-2: autosubmit-ready (manual whitelist), A/B
  if (colId === 'autosubmit-ready') {
    eligible.push({ id, company, grade, url: normalizeQueueUrl(url), tier: 2 });
    seen.add(id);
    continue;
  }
}

const tier1 = eligible.filter(e => e.tier === 1).length;
const tier2 = eligible.filter(e => e.tier === 2).length;

try {
  const tmp = QUEUE_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify({ ran_at: new Date().toISOString(), count: eligible.length, tier1, tier2, jobs: eligible }, null, 2), 'utf8');
  // renameSync the tmp into place (atomic write — KAIZEN-ATOMIC-WRITE pattern)
  const { renameSync } = await import('fs');
  renameSync(tmp, QUEUE_PATH);
  console.log(`[build-queue] Wrote ${eligible.length} eligible cards (tier1=${tier1}, tier2=${tier2}) to ${QUEUE_PATH}`);
  process.exit(0);
} catch (e) {
  console.error('[build-queue] Write failed:', e.message);
  process.exit(1);
}
