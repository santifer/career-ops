#!/usr/bin/env node
/**
 * humanize-check.mjs — AI detection risk scorer for cover letters and career materials
 *
 * ⚠️  LOCAL HEURISTIC ONLY — does NOT match industry detectors.
 *    Per calibration 2026-05-18: GPTZero + Originality both score
 *    these outputs 100% AI even when this local check passes.
 *    Run `node scripts/calibrate-ai-detectors.mjs` for ground truth.
 *    The orchestrator now uses `lib/ai-detection-gate.mjs` (API-backed)
 *    as the authoritative gate — this script is for fast local pre-checks only.
 *
 * Usage:
 *   node scripts/humanize-check.mjs --file apply-pack/048-anthropic/cover-letter.md
 *   node scripts/humanize-check.mjs --text "Paste your text here"
 *   echo "text" | node scripts/humanize-check.mjs
 *   node scripts/humanize-check.mjs --file cover-letter.md --json
 *
 * Score interpretation:
 *   0–20%   LOW      — submit as-is (but still fails external detectors: see note above)
 *   21–45%  MEDIUM   — light edit, fix flagged phrases
 *   46–70%  HIGH     — substantial rewrite needed
 *   71–100% CRITICAL — major humanization required
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HAIKU } from '../lib/models.mjs';

// Load .env from project root if keys aren't already in environment
try {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dir, '../.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
} catch {}

// ─── CLI args ─────────────────────────────────────────────────────────────
const args = (() => {
  const result = { json: false, file: null, text: null, consensus: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json')      result.json = true;
    else if (argv[i] === '--consensus') result.consensus = true;
    else if (argv[i] === '--file' && argv[i + 1]) result.file = argv[++i];
    else if (argv[i] === '--text' && argv[i + 1]) result.text = argv[++i];
  }
  return result;
})();

// ─── AI phrase dictionary ─────────────────────────────────────────────────
// weight 3 = high-risk tell, 2 = medium-risk, 1 = low-risk / context-dependent
const AI_PHRASES = [
  // High-risk — rare in authentic human writing
  { re: /\bdelve\b/gi, weight: 3, label: 'delve' },
  { re: /it(?:'s| is) worth noting/gi, weight: 3, label: "it's worth noting" },
  { re: /it(?:'s| is) important to note/gi, weight: 3, label: "it's important to note" },
  { re: /it should be noted/gi, weight: 3, label: 'it should be noted' },
  { re: /\btapestry\b/gi, weight: 3, label: 'tapestry' },
  { re: /\bmultifaceted\b/gi, weight: 3, label: 'multifaceted' },
  { re: /i am writing to (?:express|apply|inquire|seek)/gi, weight: 3, label: 'I am writing to [express/apply]' },
  { re: /i would be remiss/gi, weight: 3, label: 'I would be remiss' },
  { re: /in today'?s (?:rapidly evolving|fast.?paced|ever.?changing|digital landscape)/gi, weight: 3, label: "in today's rapidly evolving..." },
  { re: /i(?:'m| am) (?:excited|thrilled|passionate|eager) (?:about|to)\b/gi, weight: 3, label: 'I am [excited/thrilled/passionate/eager]' },
  { re: /\bnuanced? (?:approach|understanding|perspective)/gi, weight: 3, label: 'nuanced approach/understanding' },
  { re: /\bfostering\b/gi, weight: 3, label: 'fostering' },
  { re: /\bcatalyz(?:e|ing|ed)\b/gi, weight: 3, label: 'catalyze' },
  { re: /\bunpack(?:ing|ed)?\b/gi, weight: 2, label: 'unpack' },

  // Medium-risk — appear in polished prose, rare in conversational writing
  { re: /\bfurthermore\b/gi, weight: 2, label: 'furthermore' },
  { re: /\bmoreover\b/gi, weight: 2, label: 'moreover' },
  { re: /\bnevertheless\b/gi, weight: 2, label: 'nevertheless' },
  { re: /\bconsequently\b/gi, weight: 2, label: 'consequently' },
  { re: /in conclusion\b/gi, weight: 2, label: 'in conclusion' },
  { re: /to summarize\b/gi, weight: 2, label: 'to summarize' },
  { re: /\bundeniably\b/gi, weight: 2, label: 'undeniably' },
  { re: /it is (?:crucial|essential|imperative|vital)/gi, weight: 2, label: 'it is crucial/essential/imperative' },
  { re: /\bseamlessly\b/gi, weight: 2, label: 'seamlessly' },
  { re: /\bstreamline[sd]?\b/gi, weight: 2, label: 'streamline' },
  { re: /\bsynerg(?:y|ize|istic|ies)\b/gi, weight: 2, label: 'synergy/synergize' },
  { re: /\btransformative\b/gi, weight: 2, label: 'transformative' },
  { re: /\brobust\b/gi, weight: 2, label: 'robust' },
  { re: /\bholistic(?:ally)?\b/gi, weight: 2, label: 'holistic' },
  { re: /\bproactive(?:ly)?\b/gi, weight: 2, label: 'proactive' },
  { re: /\bempower(?:ing|ment|s|ed)?\b/gi, weight: 2, label: 'empower/empowering' },
  { re: /please don'?t hesitate/gi, weight: 2, label: "please don't hesitate" },
  { re: /feel free to (?:reach|contact|ask|connect)/gi, weight: 2, label: 'feel free to reach out' },
  { re: /i hope this (?:email|message|note|letter) finds you/gi, weight: 2, label: 'I hope this finds you well' },
  { re: /\brest assured\b/gi, weight: 2, label: 'rest assured' },
  { re: /as (?:previously|earlier) mentioned/gi, weight: 2, label: 'as previously mentioned' },
  { re: /needless to say/gi, weight: 2, label: 'needless to say' },
  { re: /\bcomprehensive(?:ly)?\b/gi, weight: 2, label: 'comprehensive' },
  { re: /\bcutting.?edge\b/gi, weight: 2, label: 'cutting-edge' },
  { re: /\binnovative(?:ly)?\b/gi, weight: 2, label: 'innovative' },
  { re: /\blandscape\b/gi, weight: 2, label: 'landscape (AI overuse)' },
  { re: /\bpivot(?:ing|ed|s)?\b/gi, weight: 2, label: 'pivot' },
  { re: /\bgame.?changing\b/gi, weight: 2, label: 'game-changing' },
  { re: /\bvalue.?add(?:ed)?\b/gi, weight: 2, label: 'value-add' },
  { re: /\bthought leadership\b/gi, weight: 2, label: 'thought leadership' },

  // Low-risk — context-dependent, penalize only when present
  { re: /\bleverag(?:e[sd]?|ing)\b/gi, weight: 1, label: 'leverage' },
  { re: /\bimpactful\b/gi, weight: 1, label: 'impactful' },
  { re: /in order to\b/gi, weight: 1, label: 'in order to' },
  { re: /\badditionally\b/gi, weight: 1, label: 'additionally' },
  { re: /\bnotably\b/gi, weight: 1, label: 'notably' },
  { re: /\bsignificantly\b/gi, weight: 1, label: 'significantly' },
  { re: /\bstate.of.the.art\b/gi, weight: 1, label: 'state-of-the-art' },
  { re: /in terms of\b/gi, weight: 1, label: 'in terms of' },
  { re: /\bcertainly\b/gi, weight: 1, label: 'certainly' },
  { re: /\boverall\b/gi, weight: 1, label: 'overall' },
  { re: /\bdriving (?:force|factor|value|results|impact)\b/gi, weight: 1, label: 'driving [value/results]' },
  { re: /\bkey (?:takeaway|insight|point|factor)\b/gi, weight: 1, label: 'key takeaway/insight' },
  { re: /\bstrategic(?:ally)?\b/gi, weight: 1, label: 'strategic (overused)' },
  { re: /\bworld.?class\b/gi, weight: 1, label: 'world-class' },
];

// ─── Text extraction ─────────────────────────────────────────────────────
// Extracts body text from markdown, stripping notes/headers/blockquotes/code
function extractBodyText(raw) {
  // For cover-letter.md format: extract between first and second ---
  const sepMatches = [...raw.matchAll(/^---$/gm)];
  let body = raw;
  if (sepMatches.length >= 2) {
    body = raw.slice(sepMatches[0].index + 3, sepMatches[1].index).trim();
  } else if (sepMatches.length === 1) {
    body = raw.slice(sepMatches[0].index + 3).trim();
  }

  // Strip blockquotes (usage notes at top of cover-letter.md)
  body = body.replace(/^>.*$/gm, '');
  // Strip markdown headers
  body = body.replace(/^#{1,6}\s+.+$/gm, '');
  // Strip fenced code blocks
  body = body.replace(/```[\s\S]*?```/gm, '');
  // Strip inline code
  body = body.replace(/`[^`]+`/g, '');
  // Strip bold/italic markers, keep text
  body = body.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1');
  body = body.replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1');
  // Strip link syntax [text](url) → text
  body = body.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Collapse multiple blanks
  body = body.replace(/\n{3,}/g, '\n\n');

  return body.trim();
}

// ─── Sentence splitting ───────────────────────────────────────────────────
function splitSentences(text) {
  // Split on sentence-ending punctuation followed by whitespace + capital
  const parts = text
    .replace(/\n{2,}/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'])|(?<=[.!?])\s*\n/);
  return parts.map(s => s.trim()).filter(s => s.split(/\s+/).length > 3);
}

// ─── Individual checks ────────────────────────────────────────────────────

// Burstiness: human writing has high sentence-length variance; AI is uniform
function checkBurstiness(sentences) {
  if (sentences.length < 4) {
    return { score: 50, stdDev: null, mean: null, note: 'Too few sentences to score reliably' };
  }
  const lengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Human prose typically σ > 8–10; AI typically σ < 6
  let score;
  if (stdDev >= 12) score = 5;
  else if (stdDev >= 9)  score = 15;
  else if (stdDev >= 7)  score = 30;
  else if (stdDev >= 5)  score = 55;
  else                   score = 80;

  const note = stdDev >= 9
    ? 'Healthy sentence variation'
    : stdDev >= 7
    ? 'Mild uniformity — add a very short or very long sentence'
    : 'Too uniform — vary sentence length significantly';

  return { score, stdDev: +stdDev.toFixed(1), mean: +mean.toFixed(1), note };
}

// AI phrase hits
function checkAIPhrases(text) {
  const hits = [];
  let totalWeight = 0;

  for (const { re, weight, label } of AI_PHRASES) {
    re.lastIndex = 0;
    const matches = [...text.matchAll(re)];
    if (matches.length > 0) {
      const idx = matches[0].index;
      const raw = text.slice(Math.max(0, idx - 35), idx + 60).replace(/\n/g, ' ').trim();
      hits.push({ label, weight, count: matches.length, snippet: `"…${raw}…"` });
      totalWeight += weight * matches.length;
    }
  }

  // Score caps at 100 around totalWeight ≈ 18
  const score = Math.min(100, Math.round((totalWeight / 18) * 100));
  return { score, hits, totalWeight };
}

// Passive voice ratio
function checkPassiveVoice(sentences) {
  const passiveRe = /\b(am|is|are|was|were|be|been|being)\s+\w+(?:ed|en)\b/i;
  const passiveSentences = sentences.filter(s => passiveRe.test(s));
  const ratio = sentences.length ? passiveSentences.length / sentences.length : 0;

  let score;
  if (ratio < 0.08)      score = 0;
  else if (ratio < 0.15) score = 15;
  else if (ratio < 0.25) score = 35;
  else                   score = 55;

  return {
    score,
    ratio: Math.round(ratio * 100),
    count: passiveSentences.length,
    total: sentences.length,
    note: ratio < 0.15 ? 'Passive voice under threshold' : 'High passive voice — rewrite to active',
  };
}

// Opening-transition density
function checkTransitions(sentences) {
  const transRe = /^(Furthermore|Moreover|Additionally|Nevertheless|Consequently|However|Therefore|Thus|Hence|In conclusion|To summarize|In summary|As a result|That said|With that said|Importantly|Notably)\b/i;
  const withTrans = sentences.filter(s => transRe.test(s.trim()));
  const ratio = sentences.length ? withTrans.length / sentences.length : 0;

  let score;
  if (ratio < 0.05)      score = 0;
  else if (ratio < 0.10) score = 20;
  else if (ratio < 0.20) score = 45;
  else                   score = 70;

  return {
    score,
    ratio: Math.round(ratio * 100),
    count: withTrans.length,
    total: sentences.length,
    note: ratio < 0.05 ? 'Transition density healthy' : 'High transition-opener frequency',
  };
}

// ─── Composite score ─────────────────────────────────────────────────────
function compositeScore({ burstiness, phrases, passive, transitions }) {
  return Math.round(
    burstiness.score  * 0.30 +
    phrases.score     * 0.45 +
    passive.score     * 0.15 +
    transitions.score * 0.10
  );
}

function riskBand(score) {
  if (score <= 20) return { label: 'LOW',      emoji: '🟢', action: 'Submit as-is.' };
  if (score <= 45) return { label: 'MEDIUM',   emoji: '🟡', action: 'Light edit — replace flagged phrases and you\'re done.' };
  if (score <= 70) return { label: 'HIGH',     emoji: '🟠', action: 'Substantial rewrite needed before submitting.' };
  return            { label: 'CRITICAL', emoji: '🔴', action: 'Major humanization required — will likely be flagged.' };
}

// ─── Consensus: LLM judges + external APIs ───────────────────────────────
//
// Each provider receives the body text and returns { score: 0-100, signals: [] }
// or null if unavailable (missing key, network error, parse failure).
// Providers run in parallel via Promise.allSettled — no provider can block others.
//
// Weights reflect signal independence and detection reliability:
//   local    0.15  — heuristic baseline, fast, no model
//   claude   0.28  — large model, strong idiomaticity judgment
//   gemini   0.25  — independent model family, good cross-validation
//   gptzero  0.22  — trained specifically for AI detection (perplexity-based)
//   sapling  0.10  — lightweight detector, additive signal
//
// If a provider is absent its weight is redistributed proportionally.

const PROVIDER_WEIGHTS = { local: 0.15, claude: 0.28, gemini: 0.25, gptzero: 0.22, sapling: 0.10 };

const DETECTION_PROMPT = (text) => `You are an AI text detection specialist. Analyze the following text and estimate the probability (0–100) that it was written by an AI language model rather than a human.

Evaluate specifically:
1. Sentence length uniformity — AI writing is metronomically regular; human writing varies widely
2. Presence of known AI phrase tells: "delve", "multifaceted", "it's worth noting", "leverage", "seamlessly", "tapestry", "in today's rapidly evolving", "I am excited to", "comprehensive", "furthermore", "moreover"
3. Absence of personal specifics — real dates, named individuals, specific tensions, named failures, precise numbers a human would only know
4. Passive voice frequency
5. Paragraph-opening transition words (Furthermore, Moreover, Additionally, etc.)
6. Idiomatic authenticity — human writing has quirks, contradictions, incomplete thoughts; AI writing is smooth and complete

Respond with ONLY a JSON object — no preamble, no explanation, no other text:
{"score": <integer 0-100>, "signals": ["<3-word signal>", "<3-word signal>", "<3-word signal>"]}

TEXT TO ANALYZE:
${text.slice(0, 2500)}`;

async function judgeWithClaude(body) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU,
        max_tokens: 120,
        temperature: 0,
        messages: [{ role: 'user', content: DETECTION_PROMPT(body) }],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = data.content?.[0]?.text || '';
    const m = raw.match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return { score: Math.max(0, Math.min(100, +parsed.score || 0)), signals: parsed.signals || [] };
  } catch { return null; }
}

async function judgeWithGemini(body) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    // 2026-05-17 — upgraded from gemini-2.5-flash to gemini-3-flash-preview
    // per Mitchell's preference. 2.5-flash still works; 3-flash-preview is
    // the current Flash 3.x default.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${key}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: DETECTION_PROMPT(body) }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0 },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    // Gemini may return score as 0-1 float or 0-100 int; normalize to 0-100
    const rawScore = +parsed.score || 0;
    const score = rawScore <= 1 ? Math.round(rawScore * 100) : rawScore;
    return { score: Math.max(0, Math.min(100, score)), signals: parsed.signals || [] };
  } catch { return null; }
}

async function judgeWithGPTZero(body) {
  const key = process.env.GPTZERO_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch('https://api.gptzero.me/v2/predict/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ document: body.slice(0, 5000), multilingual: false }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const prob = data.documents?.[0]?.average_generated_prob;
    if (prob == null) return null;
    return { score: Math.round(prob * 100), signals: ['perplexity-based'] };
  } catch { return null; }
}

async function judgeWithSapling(body) {
  const key = process.env.SAPLING_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch('https://api.sapling.ai/api/v1/aidetect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, text: body.slice(0, 5000) }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.score == null) return null;
    return { score: Math.round(data.score * 100), signals: [] };
  } catch { return null; }
}

function computeConsensus(scores) {
  // scores: { local: 9, claude: 12, gemini: 8, gptzero: null, sapling: null }
  const available = Object.entries(scores).filter(([, v]) => v !== null);
  if (available.length === 0) return { score: null, spread: 0, providerCount: 0 };
  const totalWeight = available.reduce((s, [k]) => s + (PROVIDER_WEIGHTS[k] ?? 0.15), 0);
  const weighted    = available.reduce((s, [k, v]) => s + (v * (PROVIDER_WEIGHTS[k] ?? 0.15)), 0);
  const consensus   = Math.round(weighted / totalWeight);
  const values      = available.map(([, v]) => v);
  const spread      = Math.max(...values) - Math.min(...values);
  return { score: consensus, spread, providerCount: available.length };
}

// ─── Output helpers ───────────────────────────────────────────────────────
function bar(score, width = 20) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function scoreIcon(score) {
  if (score <= 20) return '✅';
  if (score <= 45) return '⚠️ ';
  return '❌';
}

// ─── Exported API ────────────────────────────────────────────────────────
// Call runCheck(rawText) from other scripts without spawning a subprocess.
// Returns { score, risk, wordCount, sentenceCount, checks }.
export function runCheck(rawText) {
  const body = extractBodyText(rawText);
  const sentences = splitSentences(body);
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const checks = {
    burstiness:  checkBurstiness(sentences),
    phrases:     checkAIPhrases(body),
    passive:     checkPassiveVoice(sentences),
    transitions: checkTransitions(sentences),
  };
  const score = compositeScore(checks);
  const risk  = riskBand(score);
  return { score, risk, wordCount, sentenceCount: sentences.length, checks };
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  let raw;

  if (args.file) {
    raw = readFileSync(resolve(args.file), 'utf8');
  } else if (args.text) {
    raw = args.text;
  } else if (!process.stdin.isTTY) {
    raw = readFileSync('/dev/stdin', 'utf8');
  } else {
    console.error('Usage: node scripts/humanize-check.mjs --file <path> | --text "<text>" [--consensus] [--json]');
    process.exit(1);
  }

  const body      = extractBodyText(raw);
  const sentences = splitSentences(body);
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  const checks = {
    burstiness:  checkBurstiness(sentences),
    phrases:     checkAIPhrases(body),
    passive:     checkPassiveVoice(sentences),
    transitions: checkTransitions(sentences),
  };
  const localScore = compositeScore(checks);
  const localRisk  = riskBand(localScore);

  // ── Consensus mode: run all providers in parallel ─────────────────────
  if (args.consensus) {
    process.stderr.write('  Running consensus check (Claude · Gemini · GPTZero · Sapling)...\n');
    const [claudeRes, geminiRes, gptzeroRes, saplingRes] = await Promise.allSettled([
      judgeWithClaude(body),
      judgeWithGemini(body),
      judgeWithGPTZero(body),
      judgeWithSapling(body),
    ]);

    const pv = {
      local:   localScore,
      claude:  claudeRes.status  === 'fulfilled' ? claudeRes.value?.score  ?? null : null,
      gemini:  geminiRes.status  === 'fulfilled' ? geminiRes.value?.score  ?? null : null,
      gptzero: gptzeroRes.status === 'fulfilled' ? gptzeroRes.value?.score ?? null : null,
      sapling: saplingRes.status === 'fulfilled' ? saplingRes.value?.score ?? null : null,
    };
    const signals = {
      claude: claudeRes.status  === 'fulfilled' ? (claudeRes.value?.signals  || []) : [],
      gemini: geminiRes.status  === 'fulfilled' ? (geminiRes.value?.signals  || []) : [],
    };
    const { score: consScore, spread, providerCount } = computeConsensus(pv);
    const consRisk = riskBand(consScore ?? localScore);

    if (args.json) {
      console.log(JSON.stringify({ consensusScore: consScore, spread, providerCount, providers: pv, signals, localChecks: checks }, null, 2));
      return;
    }

    const providerLine = (key, label, val, sigs) => {
      if (val === null) return `  ⬛  ${label.padEnd(18)} n/a   (no API key — set ${key.toUpperCase()}_API_KEY)`;
      const icon = val <= 20 ? '🟢' : val <= 45 ? '🟡' : val <= 70 ? '🟠' : '🔴';
      const sigStr = sigs?.length ? `  · ${sigs.slice(0, 2).join(' · ')}` : '';
      return `  ${icon}  ${label.padEnd(18)} ${String(val).padStart(3)}%${sigStr}`;
    };

    const spreadNote = spread <= 10
      ? `Low disagreement (${spread}pt spread) — consensus is reliable.`
      : spread <= 25
      ? `Moderate disagreement (${spread}pt spread) — review flagged phrases.`
      : `High disagreement (${spread}pt spread) — providers diverge; manual review recommended.`;

    console.log(`
╔════════════════════════════════════════════════════╗
║      AI DETECTION RISK — CONSENSUS REPORT         ║
╚════════════════════════════════════════════════════╝

  CONSENSUS:  ${consScore ?? '?'}%  ${consRisk.emoji} ${consRisk.label}  (${providerCount} provider${providerCount === 1 ? '' : 's'})
  ${bar(consScore ?? localScore)}

  Action: ${consRisk.action}
  Words: ${wordCount}   Sentences: ${sentences.length}

─── Provider scores ────────────────────────────────────

${providerLine('anthropic', 'Claude Haiku', pv.claude, signals.claude)}
${providerLine('gemini',    'Gemini Flash', pv.gemini, signals.gemini)}
${providerLine('gptzero',   'GPTZero',      pv.gptzero, [])}
${providerLine('sapling',   'Sapling AI',   pv.sapling, [])}
  ──
  🔬  Local heuristics  ${String(pv.local).padStart(3)}%   [phrase density · burstiness · passive · transitions]

  ${spreadNote}

─── Local heuristic breakdown ──────────────────────────

  ${scoreIcon(checks.burstiness.score)}  Burstiness          ${checks.burstiness.score}%   σ=${checks.burstiness.stdDev ?? 'n/a'} words  ${checks.burstiness.note}
  ${scoreIcon(checks.phrases.score)}  AI phrase density   ${checks.phrases.score}%   ${checks.phrases.hits.length === 0 ? 'No flagged phrases' : `${checks.phrases.hits.length} type(s), weight ${checks.phrases.totalWeight}`}
  ${scoreIcon(checks.passive.score)}  Passive voice       ${checks.passive.score}%   ${checks.passive.ratio}% of sentences
  ${scoreIcon(checks.transitions.score)}  Transition openers  ${checks.transitions.score}%   ${checks.transitions.ratio}% of sentences

─── Flagged phrases ────────────────────────────────────
`);

    if (checks.phrases.hits.length === 0) {
      console.log('  None — clean.\n');
    } else {
      for (const { label, weight, count, snippet } of checks.phrases.hits) {
        const tag = weight === 3 ? '🔴 HIGH' : weight === 2 ? '🟡 MED ' : '⚪ LOW ';
        console.log(`  ${tag}  "${label}"  ×${count}`);
        console.log(`           ${snippet}\n`);
      }
    }
    console.log('─────────────────────────────────────────────────────\n');
    return;
  }

  // ── Standard (local-only) mode ─────────────────────────────────────────
  if (args.json) {
    console.log(JSON.stringify({ score: localScore, risk: localRisk.label, wordCount, sentenceCount: sentences.length, checks }, null, 2));
    return;
  }

  console.log(`
⚠️  LOCAL HEURISTIC ONLY — does NOT match industry detectors.
   Per calibration 2026-05-18: GPTZero + Originality both score
   these outputs 100% AI even when this local check passes.
   Run \`node scripts/calibrate-ai-detectors.mjs\` for ground truth.
`);

  console.log(`
╔═══════════════════════════════════════════════════╗
║         AI DETECTION RISK REPORT                 ║
╚═══════════════════════════════════════════════════╝

  Likelihood of AI flag:  ${localScore}%   ${localRisk.emoji} ${localRisk.label}
  ${bar(localScore)}

  Action: ${localRisk.action}
  Words: ${wordCount}   Sentences: ${sentences.length}

─── Breakdown ─────────────────────────────────────────

  ${scoreIcon(checks.burstiness.score)}  Burstiness (sentence length variance)  ${checks.burstiness.score}%
     σ = ${checks.burstiness.stdDev ?? 'n/a'} words  (avg ${checks.burstiness.mean ?? 'n/a'} words/sentence)
     ${checks.burstiness.note}

  ${scoreIcon(checks.phrases.score)}  AI phrase density                       ${checks.phrases.score}%
     ${checks.phrases.hits.length === 0
       ? 'No flagged phrases detected'
       : `${checks.phrases.hits.length} phrase type(s) hit (cumulative weight: ${checks.phrases.totalWeight})`}

  ${scoreIcon(checks.passive.score)}  Passive voice                           ${checks.passive.score}%
     ${checks.passive.count}/${checks.passive.total} sentences passive (${checks.passive.ratio}%)
     ${checks.passive.note}

  ${scoreIcon(checks.transitions.score)}  Transition opener density               ${checks.transitions.score}%
     ${checks.transitions.count}/${checks.transitions.total} sentences open with transition word (${checks.transitions.ratio}%)
     ${checks.transitions.note}

─── Flagged Phrases ───────────────────────────────────
`);

  if (checks.phrases.hits.length === 0) {
    console.log('  None — clean.\n');
  } else {
    for (const { label, weight, count, snippet } of checks.phrases.hits) {
      const tag = weight === 3 ? '🔴 HIGH' : weight === 2 ? '🟡 MED ' : '⚪ LOW ';
      console.log(`  ${tag}  "${label}"  ×${count}`);
      console.log(`           ${snippet}\n`);
    }
  }

  console.log('─────────────────────────────────────────────────────\n');
}

// Only run as CLI when this file is the entry point, not when imported as a module
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
