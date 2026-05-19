#!/usr/bin/env node
/**
 * scripts/delta-field-audit.mjs — DELTA Task Δ.1 — preliminary detector field audit.
 *
 * Calls GPTZero v2 + Originality.ai v1 ONCE with a sample text. Logs the FULL
 * raw response payload to data/delta-detector-field-audit-2026-05-19.md so any
 * subsequent code I write references field shapes I've actually verified.
 *
 * Run once: `node scripts/delta-field-audit.mjs`
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env'), override: true });
} catch { /* ignore */ }

const SAMPLE_HUMAN = `I started writing this at 11 pm because my brain finally let go of the
spreadsheet I'd been chewing on all day. Three rows in pivot, one merged cell
that wasn't supposed to be merged, and the AVERAGEIFS was quietly skipping
blanks because somebody had typed "n/a" into a column expecting numbers. I
killed the merge, swapped the n/a's for empty cells, and the pivot finally
agreed with the source-of-truth dashboard. Tiny win. Still annoyed about the
two hours.`;

const SAMPLE_AI = `In today's rapidly evolving landscape, it is important to leverage data-driven
insights to navigate complex challenges. Furthermore, organizations must
streamline operations and foster a culture of continuous improvement. By
harnessing the power of artificial intelligence, stakeholders can unlock new
opportunities and drive transformative growth across the enterprise.`;

const out = {
  audited_at: new Date().toISOString(),
  samples: {
    human: { word_count: SAMPLE_HUMAN.split(/\s+/).filter(Boolean).length, preview: SAMPLE_HUMAN.slice(0, 120) },
    ai:    { word_count: SAMPLE_AI.split(/\s+/).filter(Boolean).length,    preview: SAMPLE_AI.slice(0, 120) },
  },
  gptzero: { human: null, ai: null, key_present: !!process.env.GPTZERO_API_KEY },
  originality: { human: null, ai: null, key_present: !!process.env.ORIGINALITY_API_KEY },
};

async function callGPTZero(text) {
  const key = process.env.GPTZERO_API_KEY;
  if (!key) return { skipped: true, reason: 'no key' };
  try {
    const resp = await fetch('https://api.gptzero.me/v2/predict/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ document: text, multilingual: false }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { /* leave raw */ }
    return {
      http_status: resp.status,
      raw_body: body.slice(0, 8000),
      parsed,
    };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

async function callOriginality(text) {
  const key = process.env.ORIGINALITY_API_KEY;
  if (!key) return { skipped: true, reason: 'no key' };
  try {
    const resp = await fetch('https://api.originality.ai/api/v1/scan/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OAI-API-KEY': key },
      body: JSON.stringify({ content: text, aiModelVersion: '1', storeScan: 'false' }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { /* leave raw */ }
    return {
      http_status: resp.status,
      raw_body: body.slice(0, 8000),
      parsed,
    };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

console.error('[delta-field-audit] calling GPTZero + Originality with HUMAN sample...');
out.gptzero.human    = await callGPTZero(SAMPLE_HUMAN);
out.originality.human = await callOriginality(SAMPLE_HUMAN);
console.error('[delta-field-audit] calling GPTZero + Originality with AI sample...');
out.gptzero.ai    = await callGPTZero(SAMPLE_AI);
out.originality.ai = await callOriginality(SAMPLE_AI);

const dataDir = join(ROOT, 'data');
mkdirSync(dataDir, { recursive: true });
const jsonPath = join(dataDir, 'delta-detector-field-audit-2026-05-19.json');
writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf-8');

// Build a markdown summary that names actual fields seen (no fabrication)
const lines = [];
lines.push('# DELTA — Detector API Field Audit (Task Δ.1)');
lines.push('');
lines.push(`**Audited at:** ${out.audited_at}`);
lines.push('');
lines.push('Purpose: log the ACTUAL response shape from each detector before writing any code that assumes field names. Hallucination penalty applies if I write code referencing a field that does not appear in this audit.');
lines.push('');
lines.push('## Samples');
lines.push('');
lines.push(`- Human sample (${out.samples.human.word_count} words): \`${out.samples.human.preview}\`...`);
lines.push(`- AI sample (${out.samples.ai.word_count} words): \`${out.samples.ai.preview}\`...`);
lines.push('');
lines.push('## GPTZero v2 — `POST https://api.gptzero.me/v2/predict/text`');
lines.push('');
lines.push(`- Key present: ${out.gptzero.key_present}`);

function summariseGPTZero(r, label) {
  lines.push('');
  lines.push(`### ${label}`);
  if (r?.error) { lines.push(`- error: ${r.error}`); return; }
  if (r?.skipped) { lines.push(`- skipped (${r.reason})`); return; }
  lines.push(`- HTTP status: ${r.http_status}`);
  const doc = r.parsed?.documents?.[0];
  if (doc) {
    const keys = Object.keys(doc);
    lines.push(`- top-level keys in \`parsed.documents[0]\`: \`${keys.join(', ')}\``);
    for (const k of ['average_generated_prob', 'completely_generated_prob', 'overall_burstiness', 'burstiness_score', 'class_probabilities', 'sentences', 'paragraphs', 'predicted_class', 'confidence_category', 'confidence_score']) {
      if (k in doc) {
        const v = doc[k];
        const summary = typeof v === 'object' ? `${Array.isArray(v) ? `array len=${v.length}` : `object keys=${Object.keys(v||{}).join(',')}`}` : JSON.stringify(v);
        lines.push(`  - \`${k}\`: ${summary}`);
      }
    }
    if (Array.isArray(doc.sentences) && doc.sentences[0]) {
      lines.push(`- first sentence keys: \`${Object.keys(doc.sentences[0]).join(', ')}\``);
    }
  } else {
    lines.push(`- no \`documents[0]\` in response. Raw body: ${(r.raw_body || '').slice(0, 200)}`);
  }
}

summariseGPTZero(out.gptzero.human, 'HUMAN sample response');
summariseGPTZero(out.gptzero.ai, 'AI sample response');

lines.push('');
lines.push('## Originality.ai — `POST https://api.originality.ai/api/v1/scan/ai`');
lines.push('');
lines.push(`- Key present: ${out.originality.key_present}`);

function summariseOriginality(r, label) {
  lines.push('');
  lines.push(`### ${label}`);
  if (r?.error) { lines.push(`- error: ${r.error}`); return; }
  if (r?.skipped) { lines.push(`- skipped (${r.reason})`); return; }
  lines.push(`- HTTP status: ${r.http_status}`);
  if (r.parsed) {
    lines.push(`- top-level keys: \`${Object.keys(r.parsed).join(', ')}\``);
    if (r.parsed.score && typeof r.parsed.score === 'object') {
      lines.push(`  - \`score\` keys: \`${Object.keys(r.parsed.score).join(', ')}\` — values: ${JSON.stringify(r.parsed.score)}`);
    }
    for (const k of ['credits', 'credits_used', 'content', 'status', 'ai_score', 'original_score', 'language']) {
      if (k in r.parsed) {
        const v = r.parsed[k];
        const summary = typeof v === 'object' ? `${Array.isArray(v) ? `array len=${v.length}` : `object`}` : JSON.stringify(v);
        lines.push(`  - \`${k}\`: ${summary}`);
      }
    }
  } else {
    lines.push(`- raw body (unparseable as JSON): ${(r.raw_body || '').slice(0, 400)}`);
  }
}

summariseOriginality(out.originality.human, 'HUMAN sample response');
summariseOriginality(out.originality.ai, 'AI sample response');

lines.push('');
lines.push('## Fields DELTA code is allowed to reference downstream');
lines.push('');
lines.push('Only fields confirmed present in the responses above are quotable by name in `lib/ai-detection-gate.mjs` or any subsequent DELTA artifact. Anything not in this log: investigate before asserting.');
lines.push('');

const mdPath = join(dataDir, 'delta-detector-field-audit-2026-05-19.md');
writeFileSync(mdPath, lines.join('\n'), 'utf-8');

console.error(`[delta-field-audit] wrote ${jsonPath}`);
console.error(`[delta-field-audit] wrote ${mdPath}`);
