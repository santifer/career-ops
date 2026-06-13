#!/usr/bin/env node

/**
 * run-batch-eval.mjs — Batch Job Evaluator for career-ops / Hire_Help
 * 
 * Scans the jds/ directory for any .txt job descriptions, runs evaluations
 * sequentially using Gemini, and logs them to reports/ and data/applications.md.
 * Includes rate-limit protection to stay within Gemini free-tier quotas.
 */

import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const JDS_DIR = join(ROOT, 'jds');
const DELAY_MS = 45000; // 45 seconds delay between requests to stay safe under free-tier limits

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (!existsSync(JDS_DIR)) {
    console.error(`❌ Job descriptions directory not found at: ${JDS_DIR}`);
    process.exit(1);
  }

  // Find all .txt files in jds/ directory
  const files = readdirSync(JDS_DIR)
    .filter(f => f.endsWith('.txt'))
    .sort();

  if (files.length === 0) {
    console.log('ℹ️ No job description files (.txt) found in the jds/ directory.');
    console.log('👉 Drop your job descriptions as text files in jds/ and re-run.');
    process.exit(0);
  }

  console.log(`🚀 Found ${files.length} job description(s) to evaluate.`);
  console.log(`⏱️ Running with a rate-limiting delay of ${DELAY_MS / 1000}s between calls.`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = join(JDS_DIR, file);

    console.log(`\n==================================================`);
    console.log(`[${i + 1}/${files.length}] Evaluating: ${file}`);
    console.log(`==================================================`);

    let success = false;
    let attempts = 3;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const cmd = `node gemini-eval.mjs --file "${filePath}"`;
        execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'inherit' });
        success = true;
        break;
      } catch (err) {
        console.error(`⚠️ Attempt ${attempt} failed for ${file}:`, err.message);
        if (attempt < attempts) {
          console.log(`Waiting 65 seconds before retry to clear rate limits...`);
          await delay(65000);
        }
      }
    }

    if (success) {
      console.log(`✅ Successfully evaluated: ${file}`);
      if (i < files.length - 1) {
        console.log(`Sleeping for ${DELAY_MS / 1000}s before the next evaluation...`);
        await delay(DELAY_MS);
      }
    } else {
      console.error(`❌ Failed to evaluate ${file} after ${attempts} attempts`);
      if (i < files.length - 1) {
        console.log(`Sleeping for ${DELAY_MS / 1000}s before proceeding...`);
        await delay(DELAY_MS);
      }
    }
  }

  console.log('\n🎉 Batch evaluation run completed!');
}

main().catch(err => {
  console.error('Fatal error in batch runner:', err);
  process.exit(1);
});
