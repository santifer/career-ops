#!/usr/bin/env node

/**
 * rank-pipeline.mjs — Opt-in LLM relevance re-ranker for scan results.
 * Reads data/pipeline.md, extracts unranked pending offers,
 * and uses the local CLI (claude -p / gemini -p / opencode run) to score them.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync, execFileSync } from 'child_process';
import yaml from 'js-yaml';

const PIPELINE_PATH = 'data/pipeline.md';
const CV_PATH = 'cv.md';
const PORTALS_PATH = 'portals.yml';

// 1. Check CV and pipeline existence
if (!existsSync(CV_PATH)) {
  console.error(`❌ Error: ${CV_PATH} not found. Please create your CV first.`);
  process.exit(1);
}

if (!existsSync(PIPELINE_PATH)) {
  console.log(`ℹ️ No pipeline file found at ${PIPELINE_PATH}. Nothing to rank.`);
  process.exit(0);
}

// 2. Parse pipeline unranked entries
const pipelineText = readFileSync(PIPELINE_PATH, 'utf-8');
const lines = pipelineText.split('\n');
let inPending = false;
const unranked = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('## Pending') || line.startsWith('## Pendientes')) {
    inPending = true;
    continue;
  }
  if (line.startsWith('## ')) {
    inPending = false;
  }

  if (inPending && line.startsWith('- [ ]')) {
    if (!line.includes('[Score:')) {
      const match = line.match(/- \[ \] (\S+)(?:\s*\|\s*([^|]+)\s*\|\s*([^|]+))?/);
      if (match) {
        unranked.push({
          index: i,
          url: match[1],
          company: match[2]?.trim() || 'Unknown',
          title: match[3]?.trim() || 'Unknown',
          originalLine: line
        });
      }
    }
  }
}

if (unranked.length === 0) {
  console.log('✅ All pending pipeline entries are already ranked. Nothing to do!');
  process.exit(0);
}

console.log(`🔍 Found ${unranked.length} unranked pending offer(s).`);

// 3. Detect local CLI
function detectCli() {
  const argCli = process.argv.find(a => a.startsWith('--cli='));
  if (argCli) return argCli.split('=')[1];
  const argCliIndex = process.argv.indexOf('--cli');
  if (argCliIndex !== -1 && process.argv[argCliIndex + 1]) {
    return process.argv[argCliIndex + 1];
  }

  if (process.env.CAREER_OPS_CLI) return process.env.CAREER_OPS_CLI;

  if (existsSync('config/profile.yml')) {
    try {
      const profile = yaml.load(readFileSync('config/profile.yml', 'utf-8'));
      if (profile && profile.cli) return profile.cli;
    } catch {}
  }

  const candidates = ['claude', 'opencode', 'gemini', 'agy', 'codex', 'qwen', 'copilot'];
  for (const cmd of candidates) {
    try {
      const isWin = process.platform === 'win32';
      const checkCmd = isWin ? `where ${cmd}` : `which ${cmd}`;
      execSync(checkCmd, { stdio: 'ignore' });
      return cmd;
    } catch {}
  }
  return null;
}

const cli = detectCli();
if (!cli) {
  console.error('❌ Error: No AI coding CLI detected (claude, opencode, gemini, agy, etc.).');
  console.error('Please specify one using the --cli flag, e.g. node rank-pipeline.mjs --cli claude');
  process.exit(1);
}

console.log(`🤖 Using CLI: ${cli}`);

// 4. Load CV and title filters
const cvContent = readFileSync(CV_PATH, 'utf-8');
let titleFilters = 'No title filters configured.';
if (existsSync(PORTALS_PATH)) {
  try {
    const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
    if (config && config.title_filter) {
      titleFilters = JSON.stringify(config.title_filter, null, 2);
    }
  } catch (e) {
    console.warn(`⚠️ Warning: Failed to parse title filters from ${PORTALS_PATH}: ${e.message}`);
  }
}

// 5. Batch and process
const BATCH_SIZE = 10;
const results = [];

function getCliArgs(cliName, promptText) {
  switch (cliName) {
    case 'opencode':
      return ['run', promptText];
    case 'codex':
      return ['exec', promptText];
    default:
      return ['-p', promptText];
  }
}

for (let i = 0; i < unranked.length; i += BATCH_SIZE) {
  const batch = unranked.slice(i, i + BATCH_SIZE);
  console.log(`\nEvaluating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(unranked.length / BATCH_SIZE)} (${batch.length} jobs)...`);

  const jobList = batch.map((job, idx) => ({
    id: idx,
    company: job.company,
    title: job.title,
    url: job.url
  }));

  const prompt = `You are a job relevance re-ranker. Your task is to evaluate a list of job offers and assign a relevance score (0 to 5) and a short one-sentence reason for each, based on my CV and target title filters.

Here is my CV:
---
${cvContent}
---

Here are my target title filters (positive means it must match at least one of these, negative means it must NOT match any of these):
---
${titleFilters}
---

Analyze the following job offers and assign a score:
- 5: Perfect match (target title, matches CV skills/experience exactly).
- 4: Strong match.
- 3: Good match.
- 2: Mediocre match.
- 1: Poor match.
- 0: Completely irrelevant (wrong role type, Junior/Intern, wrong stack).

Job Offers:
${JSON.stringify(jobList, null, 2)}

For each job offer, output the result in a JSON array.
Example:
\`\`\`json
[
  { "id": 0, "score": 4, "reason": "Strong match with Python and LLM experience" }
]
\`\`\`
Provide ONLY the raw JSON array wrapped in a markdown \`\`\`json ... \`\`\` code block. Do not add any conversational text.`;

  try {
    const args = getCliArgs(cli, prompt);
    const output = execFileSync(cli, args, { encoding: 'utf-8', timeout: 90000 });
    
    const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : output;
    const parsedBatch = JSON.parse(jsonText.trim());

    if (Array.isArray(parsedBatch)) {
      for (const res of parsedBatch) {
        const job = batch[res.id];
        if (job) {
          const score = Number(res.score);
          if (!Number.isFinite(score)) continue;
          results.push({
            index: job.index,
            originalLine: job.originalLine,
            score: Math.max(0, Math.min(5, Math.round(score))),
            reason: String(res.reason || '').replace(/\s+/g, ' ').replace(/[\[\]]/g, '').slice(0, 180).trim()
          });
        }
      }
    } else {
      throw new Error('Response is not a JSON array');
    }
  } catch (err) {
    console.error(`❌ Failed to evaluate batch: ${err.message}`);
  }
}

// 6. Write back to pipeline.md
if (results.length > 0) {
  for (const res of results) {
    const cleanReason = String(res.reason || '').replace(/[\[\]]/g, '').trim();
    const applyNote = res.score < 4 ? ' Recommend against applying unless you have a specific reason to override.' : '';
    lines[res.index] = `${res.originalLine} [Score: ${res.score}/5 — ${cleanReason}${applyNote}]`;
  }
  writeFileSync(PIPELINE_PATH, lines.join('\n'), 'utf-8');
  console.log(`\n🎉 Successfully annotated ${results.length} offer(s) with scores in ${PIPELINE_PATH}.`);
} else {
  console.log('\n⚠️ No offers were successfully ranked. Please check the CLI outputs.');
}
