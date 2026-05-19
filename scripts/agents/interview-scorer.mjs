#!/usr/bin/env node
/**
 * scripts/agents/interview-scorer.mjs — Phase 2 interview answer scorer.
 *
 * Ingests Mitchell's answer to a queued interview question, runs falsification
 * scoring (verifiability / specificity / thesis-fit / differentiation), surfaces
 * any new tentpole-relevant facts, flags any co-actor names needing permission
 * outreach, and updates the tentpole atom's "Phase 2 hooks" section to mark
 * which hooks the answer resolved.
 *
 * The scorer ALSO checks: does this answer SURVIVE the no-fiction / no-composite
 * / no-invented-scene rule? Anything that can't be corpus-anchored is flagged.
 *
 * Output: appends scored answer to data/autobiography-project/interview-transcripts/<DATE>.md
 *         updates queue file to status: complete
 *         writes session-resume notes for future Claude sessions
 *
 * CLI:
 *   node scripts/agents/interview-scorer.mjs --date 2026-05-19
 *   node scripts/agents/interview-scorer.mjs --date 2026-05-19 --answer "<inline text>"
 *   node scripts/agents/interview-scorer.mjs --answer-file /path/to/answer.md
 *
 * The dashboard widget POST endpoint calls this with the answer body inline.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
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
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}
const date = arg('--date', new Date().toISOString().slice(0, 10));
const inlineAnswer = arg('--answer');
const answerFile = arg('--answer-file');

// ── Anthropic API call ─────────────────────────────────────────────────
async function callSonnet(systemPrompt, userPrompt, maxTokens = 2000) {
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

// ── Helpers ────────────────────────────────────────────────────────────
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { frontmatter: {}, body: text };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) {
      let v = kv[2].trim();
      try { v = JSON.parse(v); } catch { /* keep raw */ }
      fm[kv[1]] = v;
    }
  }
  return { frontmatter: fm, body: text.slice(m[0].length) };
}

function loadAnswer() {
  if (inlineAnswer) return inlineAnswer;
  if (answerFile) return readFileSync(answerFile, 'utf-8');
  // Otherwise, parse from the queue file (Mitchell wrote answer inline)
  const queueFile = join(QUEUE_DIR, `${date}.md`);
  if (!existsSync(queueFile)) throw new Error(`No queue file for ${date}`);
  const content = readFileSync(queueFile, 'utf-8');
  const answerMatch = content.match(/## Mitchell's answer\s*\n([\s\S]+)$/);
  if (!answerMatch) throw new Error(`No "## Mitchell's answer" section in ${queueFile}`);
  const answer = answerMatch[1].trim();
  if (!answer || answer.startsWith('*[Answer goes here')) {
    throw new Error(`No answer content found in ${queueFile} — Mitchell hasn't filled it in yet`);
  }
  return answer;
}

// ── Scoring prompt ─────────────────────────────────────────────────────
function buildScorerSystemPrompt() {
  return `You are scoring Mitchell Williams' interview answer for the autobiography project.

Your job, in order:

1. Score the answer on four falsification axes:
   - VERIFIABILITY (0-3): Could a third party check the claims? Are dates/names/metrics specific enough?
   - SPECIFICITY (0-3): Concrete details vs. summary language. Hyper-specific objects vs. generic categories.
   - THESIS-FIT (0-3): Does this support the autobiography's thesis pillar?
   - DIFFERENTIATION (0-3): Is this story unique to Mitchell or generic to anyone in his role?

2. Flag any GROUNDING violations:
   - Composite characters or composite events
   - Invented scenes or fabricated dialogue
   - "Felt like" interior monologue that has no source (journal / text / recall-flagged)
   - Claims that can't be corpus-anchored

3. Surface NEW FACTS the answer revealed that the existing corpus didn't have. These become candidate additions to the relevant tentpole atom file.

4. Flag any CO-ACTOR NAMES that need permission outreach if not already covered.

5. Write SESSION-RESUME NOTES — 2-3 lines explaining what next Claude session needs to know to pick up the thread.

OUTPUT FORMAT (parseable):

VERIFIABILITY: [0-3]
SPECIFICITY: [0-3]
THESIS_FIT: [0-3]
DIFFERENTIATION: [0-3]
GROUNDING_VIOLATIONS: [comma-separated list or "none"]
NEW_FACTS: [bullet list, one per line starting with "- "]
NEW_COACTORS: [comma-separated names or "none"]
NEXT_QUESTION_HINT: [one sentence — what should the next interview question probe?]
SESSION_RESUME_NOTES: [2-3 lines for future Claude]
STATUS: [complete | needs-followup]`;
}

function buildScorerUserPrompt({ question, context, axis, tentpole, answer }) {
  return `## The question that was asked

${question}

**Context:** ${context}
**Tentpole:** ${tentpole}
**Axis being probed:** ${axis}

## Mitchell's answer

${answer}

---

Score per system prompt format.`;
}

function parseScorerOutput(text) {
  const out = {
    verifiability: null, specificity: null, thesisFit: null, differentiation: null,
    groundingViolations: '', newFacts: [], newCoactors: '',
    nextQuestionHint: '', sessionResumeNotes: '', status: 'complete'
  };
  const lines = text.split('\n');
  let mode = null;
  for (const line of lines) {
    if (line.startsWith('VERIFIABILITY:')) { out.verifiability = parseInt(line.slice('VERIFIABILITY:'.length)) || 0; mode = null; }
    else if (line.startsWith('SPECIFICITY:')) { out.specificity = parseInt(line.slice('SPECIFICITY:'.length)) || 0; mode = null; }
    else if (line.startsWith('THESIS_FIT:')) { out.thesisFit = parseInt(line.slice('THESIS_FIT:'.length)) || 0; mode = null; }
    else if (line.startsWith('DIFFERENTIATION:')) { out.differentiation = parseInt(line.slice('DIFFERENTIATION:'.length)) || 0; mode = null; }
    else if (line.startsWith('GROUNDING_VIOLATIONS:')) { out.groundingViolations = line.slice('GROUNDING_VIOLATIONS:'.length).trim(); mode = null; }
    else if (line.startsWith('NEW_FACTS:')) { mode = 'newFacts'; }
    else if (line.startsWith('NEW_COACTORS:')) { out.newCoactors = line.slice('NEW_COACTORS:'.length).trim(); mode = null; }
    else if (line.startsWith('NEXT_QUESTION_HINT:')) { out.nextQuestionHint = line.slice('NEXT_QUESTION_HINT:'.length).trim(); mode = null; }
    else if (line.startsWith('SESSION_RESUME_NOTES:')) { mode = 'sessionResumeNotes'; out.sessionResumeNotes = line.slice('SESSION_RESUME_NOTES:'.length).trim(); }
    else if (line.startsWith('STATUS:')) { out.status = line.slice('STATUS:'.length).trim(); mode = null; }
    else if (mode === 'newFacts' && line.trim().startsWith('- ')) { out.newFacts.push(line.trim().slice(2)); }
    else if (mode === 'sessionResumeNotes' && line.trim()) { out.sessionResumeNotes += ' ' + line.trim(); }
  }
  return out;
}

// ── Output writer ──────────────────────────────────────────────────────
function writeScoredTranscript({ date, question, context, tentpole, axis, answer, score }) {
  const path = join(TRANSCRIPTS_DIR, `${date}.md`);
  const v = (n) => n === null ? '?' : `${n}/3`;
  const out = `---
date: ${date}
tentpole: "${tentpole}"
axis: "${axis}"
status: ${score.status}
verifiability: ${score.verifiability}
specificity: ${score.specificity}
thesis_fit: ${score.thesisFit}
differentiation: ${score.differentiation}
grounding_violations: ${JSON.stringify(score.groundingViolations)}
new_coactors: ${JSON.stringify(score.newCoactors)}
---

# Interview ${date} · tentpole ${tentpole}

## Q

> ${question}

**Context:** ${context}
**Axis:** ${axis}

## A (Mitchell)

${answer}

## Falsification scores

| Axis | Score |
|------|-------|
| Verifiability | ${v(score.verifiability)} |
| Specificity | ${v(score.specificity)} |
| Thesis-fit | ${v(score.thesisFit)} |
| Differentiation | ${v(score.differentiation)} |

**Grounding violations:** ${score.groundingViolations || 'none'}

## New facts surfaced

${score.newFacts.length ? score.newFacts.map(f => `- ${f}`).join('\n') : '*None — answer did not surface material beyond what the existing corpus already has.*'}

## New co-actors to outreach

${score.newCoactors && score.newCoactors !== 'none' ? score.newCoactors : '*None.*'}

## Next question hint (for tomorrow's interview-curator)

> ${score.nextQuestionHint}

## Session resume notes (for future Claude sessions)

${score.sessionResumeNotes}
`;
  writeFileSync(path, out);
  return path;
}

function markQueueComplete(date, scoredPath) {
  const queueFile = join(QUEUE_DIR, `${date}.md`);
  if (!existsSync(queueFile)) return;
  const content = readFileSync(queueFile, 'utf-8');
  const updated = content
    .replace(/^status: pending$/m, 'status: complete')
    .replace(/^answered_at: null$/m, `answered_at: ${new Date().toISOString()}`)
    .replace(/^answer_path: null$/m, `answer_path: ${JSON.stringify(scoredPath)}`);
  writeFileSync(queueFile, updated);
}

function appendToSessionResumeLog(date, notes) {
  const log = join(PROJECT_DIR, 'SESSION-RESUME.md');
  const header = existsSync(log) ? '' : `# Session resume log\n\nLatest at the top. Each entry: what next Claude session needs to know about Phase 2 interview state.\n\n`;
  const entry = `## ${date}\n\n${notes}\n\n---\n\n`;
  if (header) writeFileSync(log, header + entry);
  else {
    const existing = readFileSync(log, 'utf-8');
    writeFileSync(log, existing.replace(/^(# Session resume log[\s\S]*?\n\n)/, `$1${entry}`));
  }
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const queueFile = join(QUEUE_DIR, `${date}.md`);
  if (!existsSync(queueFile)) {
    console.error(`No queue file for ${date}. Run interview-curator.mjs first.`);
    process.exit(1);
  }

  const queueContent = readFileSync(queueFile, 'utf-8');
  const { frontmatter } = parseFrontmatter(queueContent);

  const answer = loadAnswer();
  console.log(`Loaded answer (${answer.length} chars). Calling Sonnet for scoring...`);

  const llmOutput = await callSonnet(
    buildScorerSystemPrompt(),
    buildScorerUserPrompt({
      question: frontmatter.question || '',
      context: frontmatter.context || '',
      axis: frontmatter.axis || '',
      tentpole: frontmatter.tentpole || '',
      answer,
    }),
    2500,
  );

  const score = parseScorerOutput(llmOutput);
  const scoredPath = writeScoredTranscript({
    date,
    question: frontmatter.question || '',
    context: frontmatter.context || '',
    tentpole: frontmatter.tentpole || '',
    axis: frontmatter.axis || '',
    answer,
    score,
  });

  markQueueComplete(date, scoredPath);
  appendToSessionResumeLog(date, score.sessionResumeNotes);

  console.log(`✓ Scored. Written to ${scoredPath}`);
  console.log(`  Verifiability: ${score.verifiability}/3  Specificity: ${score.specificity}/3  Thesis-fit: ${score.thesisFit}/3  Differentiation: ${score.differentiation}/3`);
  if (score.groundingViolations && score.groundingViolations !== 'none') {
    console.log(`  ⚠ Grounding violations: ${score.groundingViolations}`);
  }
  if (score.newFacts.length) {
    console.log(`  + ${score.newFacts.length} new facts surfaced`);
  }
  if (score.newCoactors && score.newCoactors !== 'none') {
    console.log(`  + New co-actors to outreach: ${score.newCoactors}`);
  }
}

main().catch(err => {
  console.error('interview-scorer failed:', err.message);
  process.exit(1);
});
