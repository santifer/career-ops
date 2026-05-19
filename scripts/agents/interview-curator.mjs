#!/usr/bin/env node
/**
 * scripts/agents/interview-curator.mjs — Phase 2 interview question generator.
 *
 * Generates ONE next interview question for the autobiography project,
 * informed by:
 *   - All prior answers in data/autobiography-project/interview-transcripts/
 *   - The 9 tentpole atom files in data/autobiography-project/tentpoles/
 *   - The 8 priority gap topics from tentpoles/index.md
 *   - The four falsification axes per tentpole (verifiability / specificity /
 *     thesis-fit / differentiation)
 *
 * Voice: Terry Gross (curious-journalist register). Single sentence. Low
 * cognitive load. NOT autobiographer-prepping-book (too solemn) and NOT
 * therapist (wrong job).
 *
 * Output: writes today's question to
 *   data/autobiography-project/interview-transcripts/queue/<DATE>.md
 * with structured frontmatter so interview-scorer.mjs + the dashboard widget
 * can pick it up.
 *
 * CLI:
 *   node scripts/agents/interview-curator.mjs              # Generate today's
 *   node scripts/agents/interview-curator.mjs --force      # Regenerate even
 *                                                            if today's exists
 *   node scripts/agents/interview-curator.mjs --tentpole 7 # Force focus on
 *                                                            a specific tentpole
 *   node scripts/agents/interview-curator.mjs --topic gap-2008-2010
 *                                                          # Force a specific
 *                                                            priority topic
 *
 * Runs via launchd at 07:00 PT daily.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* dotenv optional */ }

import { SONNET } from '../../lib/models.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PROJECT_DIR = join(ROOT, 'data', 'autobiography-project');
const TRANSCRIPTS_DIR = join(PROJECT_DIR, 'interview-transcripts');
const QUEUE_DIR = join(TRANSCRIPTS_DIR, 'queue');

// ── CLI parse ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const force = args.includes('--force');
const tentpoleArg = args.includes('--tentpole') ? args[args.indexOf('--tentpole') + 1] : null;
const topicArg = args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null;

// ── Helpers ────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function readPriorAnswers() {
  if (!existsSync(TRANSCRIPTS_DIR)) return [];
  const files = readdirSync(TRANSCRIPTS_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}.*\.md$/) && !f.startsWith('queue'))
    .sort();
  return files.map(f => ({
    file: f,
    content: readFileSync(join(TRANSCRIPTS_DIR, f), 'utf-8'),
  }));
}

function readTentpoleAtoms() {
  const dir = join(PROJECT_DIR, 'tentpoles');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.match(/^\d+-.*\.md$/))
    .sort()
    .map(f => ({
      file: f,
      id: f.replace(/\.md$/, ''),
      content: readFileSync(join(dir, f), 'utf-8'),
    }));
}

function readTentpoleIndex() {
  const path = join(PROJECT_DIR, 'tentpoles', 'index.md');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function readThesis() {
  const path = join(PROJECT_DIR, 'thesis.md');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function readVoiceProfile() {
  const path = join(ROOT, 'corpus', 'voice-profile.md');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

// ── Anthropic API call ─────────────────────────────────────────────────
async function callSonnet(systemPrompt, userPrompt, maxTokens = 800) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in env');

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: SONNET,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(120_000), // Phase A.0 hardening — LLM API timeout
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error('Anthropic API timeout after 120s — slow upstream. Not retrying.');
    }
    throw e;
  }

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${txt.slice(0, 500)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ── Prompt construction ────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are interviewing Mitchell Williams for his autobiography. Your voice is Terry Gross — curious, specific, follows the human thread, does not perform interest, does not pad with summary or restatement.

Your job: generate ONE next question for him.

HARD CONSTRAINTS:
- Single sentence. NO multi-part questions. NO "and also" expansions.
- Low cognitive load. Answerable in 5-10 minutes.
- Informed by the most recent prior answer when applicable.
- Targets one of: verifiability gap | specificity gap | thesis-fit gap | differentiation gap | one of the 8 priority gap topics.
- NO leading questions. NO questions that prescribe the answer's shape.
- NO solemn autobiographical-interrogation register. NO therapist register.
- Curious-journalist register: like Terry Gross, you ask one specific question and then listen.

OUTPUT FORMAT (exactly this structure, parseable):

QUESTION: [the single-sentence question]
CONTEXT: [1-line note: what prior answer informed this, OR "first session" if no prior answers]
TENTPOLE: [tentpole number 00-08, or "cross-tentpole" if it spans multiple]
AXIS: [verifiability | specificity | thesis-fit | differentiation | gap-topic-N]
NOTES_FOR_FUTURE_CLAUDE: [1-2 lines explaining why this question, what it surfaces, what to follow up on next session]`;
}

function buildUserPrompt({ priorAnswers, tentpoles, tentpoleIndex, thesis, voiceProfile, forcedTentpole, forcedTopic }) {
  const recent = priorAnswers.slice(-3).map(a => `### ${a.file}\n${a.content.slice(0, 2000)}`).join('\n\n');
  const tentpolesSummary = tentpoles.map(t => `## ${t.id}\n${t.content.slice(0, 1500)}`).join('\n\n');

  const forceLine = forcedTentpole
    ? `\n\nFORCE-FOCUS: tentpole ${forcedTentpole}`
    : forcedTopic
      ? `\n\nFORCE-FOCUS: priority gap topic "${forcedTopic}"`
      : '';

  return `## Mitchell's locked thesis

${thesis.slice(0, 4000)}

## Voice profile (the bible's voice constraints)

${voiceProfile.slice(0, 3000)}

## The 9 tentpole stories (abbreviated)

${tentpolesSummary.slice(0, 8000)}

## Tentpole index + priority gap topics

${tentpoleIndex.slice(0, 4000)}

## Recent prior answers (most recent first)

${recent || '[No prior answers yet — this is the first session.]'}

## Your task

Generate ONE next question per the system prompt's hard constraints. Make it count.${forceLine}`;
}

// ── Output writer ──────────────────────────────────────────────────────
function parseLLMOutput(text) {
  const lines = text.split('\n');
  const out = { question: '', context: '', tentpole: '', axis: '', notes: '' };
  let mode = null;
  for (const line of lines) {
    if (line.startsWith('QUESTION:')) { mode = 'question'; out.question = line.slice('QUESTION:'.length).trim(); }
    else if (line.startsWith('CONTEXT:')) { mode = 'context'; out.context = line.slice('CONTEXT:'.length).trim(); }
    else if (line.startsWith('TENTPOLE:')) { mode = 'tentpole'; out.tentpole = line.slice('TENTPOLE:'.length).trim(); }
    else if (line.startsWith('AXIS:')) { mode = 'axis'; out.axis = line.slice('AXIS:'.length).trim(); }
    else if (line.startsWith('NOTES_FOR_FUTURE_CLAUDE:')) { mode = 'notes'; out.notes = line.slice('NOTES_FOR_FUTURE_CLAUDE:'.length).trim(); }
    else if (mode && line.trim()) { out[mode] += ' ' + line.trim(); }
  }
  return out;
}

function writeQuestion({ question, context, tentpole, axis, notes }, date) {
  ensureDir(QUEUE_DIR);
  const path = join(QUEUE_DIR, `${date}.md`);
  const frontmatter = `---
date: ${date}
status: pending
question: ${JSON.stringify(question)}
context: ${JSON.stringify(context)}
tentpole: "${tentpole}"
axis: "${axis}"
notes_for_future_claude: ${JSON.stringify(notes)}
answered_at: null
answer_path: null
score: null
---

# Interview question — ${date}

> ${question}

**Context:** ${context}
**Tentpole:** ${tentpole}
**Axis:** ${axis}

---

## Notes for future Claude (when this session resumes)

${notes}

---

## Mitchell's answer

*[Answer goes here. Submit via dashboard widget at /dashboard/autobiography-interview.html OR by editing this file directly and running \`node scripts/agents/interview-scorer.mjs --date ${date}\`.]*
`;
  writeFileSync(path, frontmatter);
  return path;
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  ensureDir(TRANSCRIPTS_DIR);
  ensureDir(QUEUE_DIR);

  const date = todayISO();
  const existingPath = join(QUEUE_DIR, `${date}.md`);
  if (existsSync(existingPath) && !force) {
    console.log(`Today's question already exists at ${existingPath}. Use --force to regenerate.`);
    return;
  }

  console.log('Reading project context...');
  const priorAnswers = readPriorAnswers();
  const tentpoles = readTentpoleAtoms();
  const tentpoleIndex = readTentpoleIndex();
  const thesis = readThesis();
  const voiceProfile = readVoiceProfile();

  console.log(`Found ${priorAnswers.length} prior answers, ${tentpoles.length} tentpoles.`);
  console.log('Calling Sonnet...');

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    priorAnswers,
    tentpoles,
    tentpoleIndex,
    thesis,
    voiceProfile,
    forcedTentpole: tentpoleArg,
    forcedTopic: topicArg,
  });

  const llmOutput = await callSonnet(systemPrompt, userPrompt, 800);
  const parsed = parseLLMOutput(llmOutput);

  if (!parsed.question) {
    console.error('LLM did not return a parseable question. Raw output:');
    console.error(llmOutput);
    process.exit(1);
  }

  const outPath = writeQuestion(parsed, date);
  console.log(`✓ Question written to ${outPath}`);
  console.log(`\n${parsed.question}`);
}

main().catch(err => {
  console.error('interview-curator failed:', err.message);
  process.exit(1);
});
