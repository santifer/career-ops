#!/usr/bin/env node
/**
 * resolve-linkedin-pipeline.mjs
 *
 * Finds pending LinkedIn job entries in data/pipeline.md that have no metadata
 * (company shows as "(from email)", title shows as "view"), then uses the xAI
 * Responses API with web_search to look up the real job title, company, and
 * archetype fit for each one.
 *
 * Entries that resolve successfully are updated in-place in pipeline.md.
 * Failures are logged to console and left unchanged.
 *
 * Usage:
 *   node scripts/resolve-linkedin-pipeline.mjs              # process all pending
 *   node scripts/resolve-linkedin-pipeline.mjs --dry-run    # show URLs, no API call
 *   node scripts/resolve-linkedin-pipeline.mjs --limit=5    # process only N items
 *
 * Environment: requires XAI_API_KEY (loaded from ~/.career-ops-secrets if not set)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchWithTimeout } from '../lib/fetch-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PIPELINE_PATH = join(ROOT, 'data/pipeline.md');
const SECRETS_PATH = join(process.env.HOME || '', '.career-ops-secrets');

const XAI_ENDPOINT = 'https://api.x.ai/v1/responses';
const XAI_MODEL = 'grok-4-fast-reasoning';
const REQUEST_TIMEOUT_MS = 90_000;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 2_000;

// --- CLI args ---
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const isDryRun = !!args['dry-run'];
const limitArg = args['limit'];
const limit = limitArg ? parseInt(limitArg, 10) : Infinity;

// --- Secrets loader ---
function loadSecretEnv() {
  if (process.env.XAI_API_KEY) return;
  if (!existsSync(SECRETS_PATH)) return;
  try {
    const lines = readFileSync(SECRETS_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // Strip leading "export " keyword if present
      const stripped = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
      const eq = stripped.indexOf('=');
      if (eq < 0) continue;
      const key = stripped.slice(0, eq).trim();
      let val = stripped.slice(eq + 1).trim();
      // Strip surrounding single or double quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // secret load is best-effort
  }
}

// --- Pipeline parser ---
// Matches pending LinkedIn (from email) lines. Handles with or without trailing date field.
// Example: - [ ] https://www.linkedin.com/jobs/view/4383168907 | (from email) | view
// Example: - [ ] https://www.linkedin.com/jobs/view/4383168907 | (from email) | view | 2026-05-10
const PENDING_LINKEDIN_RE =
  /^(- \[ \] )(https:\/\/www\.linkedin\.com\/jobs\/view\/(\d+))\s*\|\s*\(from email\)\s*\|\s*view(\s*\|\s*\S+)?(.*)$/;

function parseTargets(content) {
  const lines = content.split('\n');
  const targets = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PENDING_LINKEDIN_RE);
    if (!m) continue;
    targets.push({
      lineIndex: i,
      prefix: m[1],    // "- [ ] "
      url: m[2],       // full URL
      jobId: m[3],     // numeric ID
      dateField: m[4] ? m[4].trim() : null,  // "| 2026-05-10" or null
      raw: lines[i],
    });
  }
  return targets;
}

// --- xAI API call ---
async function resolveJob(jobId, url) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY not set');

  const prompt =
    'Search the web for the LinkedIn job posting at ' + url + '\n\n' +
    'Extract and return ONLY this JSON (no markdown, no preamble, no trailing text):\n' +
    '{\n' +
    '  "job_id": "' + jobId + '",\n' +
    '  "company": "Company name or null if not found",\n' +
    '  "title": "Job title or null if not found",\n' +
    '  "location": "City/Remote or null",\n' +
    '  "remote_ok": true,\n' +
    '  "brief": "1-sentence description of the role or null",\n' +
    '  "archetype_fit": "A1 or A2 or B or none or unknown",\n' +
    '  "fit_reason": "1-sentence reason or cannot determine",\n' +
    '  "still_active": true\n' +
    '}\n\n' +
    'Archetype guide:\n' +
    '- A1: AI residency, fellowship, resident programs\n' +
    '- A2: Solutions Architect, Forward Deployed Engineer, Applied AI, AI Enablement, AI PM/PgM, Technical Deployment Lead\n' +
    '- B: Developer Relations, Communications, Editorial, Content Strategy, DevRel\n' +
    '- none: clearly not a fit (supply chain, hardware, college grad, admin, finance, etc.)\n' +
    '- unknown: insufficient info to classify\n\n' +
    'Replace true/false/null with actual values from your research. ' +
    'If the posting is expired or removed, set still_active to false. ' +
    'Return ONLY valid JSON, nothing else.';

  const { ok, status, text: respText } = await fetchWithTimeout(XAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: XAI_MODEL,
      tools: [{ type: 'web_search' }],
      input: prompt,
    }),
  }, REQUEST_TIMEOUT_MS);

  if (!ok) {
    throw new Error('xAI API error ' + status + ': ' + respText.slice(0, 200));
  }

  const data = JSON.parse(respText);

  // Extract output_text from the response structure
  // { output: [ { type: "message", content: [{ type: "output_text", text: "..." }] } ] }
  let outputText = null;
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block.type === 'output_text' && typeof block.text === 'string') {
            outputText = block.text.trim();
            break;
          }
        }
      }
      if (outputText) break;
    }
  }

  if (!outputText) {
    throw new Error('No output_text in xAI response: ' + JSON.stringify(data).slice(0, 300));
  }

  // Extract JSON from response (Grok sometimes wraps in markdown code fences)
  let jsonStr = outputText;
  const fenceMatch = outputText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    // Find first { to last } in case there is surrounding prose
    const start = outputText.indexOf('{');
    const end = outputText.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      jsonStr = outputText.slice(start, end + 1);
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Failed to parse JSON from Grok response: ' + jsonStr.slice(0, 300));
  }

  return parsed;
}

// --- Sleep helper ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Line updater ---
function buildUpdatedLine(target, resolved) {
  const company = resolved.company || '(unknown)';
  const title = resolved.title || '(unknown)';
  const datePart = target.dateField ? ' ' + target.dateField : '';
  return (
    target.prefix + target.url +
    ' | ' + company +
    ' | ' + title +
    datePart +
    ' | resolved-by-grok'
  );
}

// --- Main ---
async function main() {
  loadSecretEnv();

  if (!existsSync(PIPELINE_PATH)) {
    console.error('ERROR: data/pipeline.md not found at', PIPELINE_PATH);
    process.exit(1);
  }

  const content = readFileSync(PIPELINE_PATH, 'utf-8');
  const allTargets = parseTargets(content);

  if (allTargets.length === 0) {
    console.log('No pending LinkedIn (from email) items found in pipeline.md.');
    return;
  }

  const targets = allTargets.slice(0, isFinite(limit) ? limit : allTargets.length);

  console.log('resolve-linkedin-pipeline.mjs');
  console.log('  Found ' + allTargets.length + ' pending LinkedIn (from email) items total');
  if (isFinite(limit)) {
    console.log('  Processing first ' + targets.length + ' (--limit=' + limit + ')');
  } else {
    console.log('  Processing all ' + targets.length + ' items');
  }

  if (isDryRun) {
    console.log('\n[dry-run] Would process:');
    for (const t of targets) {
      console.log('  ' + t.url);
    }
    console.log('\n[dry-run] No API calls made.');
    return;
  }

  if (!process.env.XAI_API_KEY) {
    console.error('ERROR: XAI_API_KEY not found. Set it in ~/.career-ops-secrets or environment.');
    process.exit(1);
  }

  // Work on a mutable lines array
  const lines = content.split('\n');
  let resolved = 0;
  let failed = 0;
  let nonFits = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    // Batch delay: after each group of BATCH_SIZE, pause
    if (i > 0 && i % BATCH_SIZE === 0) {
      console.log('  [batch pause ' + BATCH_DELAY_MS + 'ms]');
      await sleep(BATCH_DELAY_MS);
    }

    process.stdout.write('  [' + (i + 1) + '/' + targets.length + '] ' + target.url + ' ... ');

    let result;
    try {
      result = await resolveJob(target.jobId, target.url);
    } catch (err) {
      console.log('FAILED: ' + err.message);
      failed++;
      continue;
    }

    const hasData = result.company && result.company !== 'null' && result.company !== 'null if not found' &&
                    result.title && result.title !== 'null' && result.title !== 'null if not found';

    if (!hasData) {
      console.log('UNRESOLVED (no company/title in response)');
      console.log('    raw result: ' + JSON.stringify(result).slice(0, 200));
      failed++;
      continue;
    }

    const archetype = result.archetype_fit || 'unknown';
    const isNonFit = archetype === 'none';
    if (isNonFit) nonFits++;

    const updatedLine = buildUpdatedLine(target, result);
    lines[target.lineIndex] = updatedLine;
    resolved++;

    console.log('OK (' + archetype + ') -> ' + result.company + ' | ' + result.title);
    if (result.fit_reason && result.fit_reason !== 'cannot determine') {
      console.log('    ' + result.fit_reason);
    }
  }

  // Write back only if anything changed
  if (resolved > 0) {
    writeFileSync(PIPELINE_PATH, lines.join('\n'), 'utf-8');
    console.log('\npipeline.md updated.');
  } else {
    console.log('\nNo updates written (all failed or unresolved).');
  }

  console.log('\nSummary:');
  console.log('  Processed : ' + targets.length);
  console.log('  Resolved  : ' + resolved);
  console.log('  Failed    : ' + failed);
  console.log('  Non-fits  : ' + nonFits + ' (archetype=none among resolved)');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
