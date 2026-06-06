#!/usr/bin/env node
/**
 * openrouter-eval.mjs — OpenRouter-powered job evaluator for career-ops. Library + CLI.
 *
 * The keyless-of-Anthropic eval path: runs the full A–G evaluation on CT 203 (no Anthropic
 * API key — Claude Max ≠ API access) via Patrick's OpenRouter key. This is the missing
 * "evaluate" step the deployed scanner never ran (memory: project_scanner_no_eval).
 * A cousin of gemini-eval.mjs with two fixes: (1) ALSO reads modes/_profile.md (Patrick's
 * HARD rules — location, $160K floor, archetypes, security-first identity), and (2) pre-gates
 * location via lib/location-gate.mjs (JD-body aware) so disqualified roles cost zero tokens.
 *
 * As a LIBRARY (imported by triage.mjs):
 *   evaluateJD({ jdText, company, url, locVerdict, model }) -> { result, text }
 *   buildReportMarkdown({ result, text, url, locVerdict, model, date }) -> string
 *   jobToJdText(job), nextReportNumber(), slugify(), REPORTS_DIR
 *
 * As a CLI:
 *   node openrouter-eval.mjs "<JD text>"
 *   node openrouter-eval.mjs --file <path>
 *   node openrouter-eval.mjs --url <ats-url> [--json] [--no-save] [--company NAME] [--model NAME]
 *
 * Key: OPENROUTER_API_KEY env, or ~/.secrets/openrouter.txt. Default model: anthropic/claude-haiku-4.5.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { fetchJob } from './lib/ats-fetch.mjs';
import { assessLocation } from './lib/location-gate.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const REPORTS_DIR = join(ROOT, 'reports');
const P = {
  shared:  join(ROOT, 'modes', '_shared.md'),
  oferta:  join(ROOT, 'modes', 'oferta.md'),
  profile: join(ROOT, 'modes', '_profile.md'),
  cv:      join(ROOT, 'cv.md'),
  digest:  join(ROOT, 'article-digest.md'),
};
export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';

export function loadKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  const f = join(homedir(), '.secrets', 'openrouter.txt');
  if (existsSync(f)) return readFileSync(f, 'utf-8').trim();
  throw new Error('No OpenRouter key (set OPENROUTER_API_KEY or ~/.secrets/openrouter.txt)');
}

const readFile = (p, label) => existsSync(p) ? readFileSync(p, 'utf-8').trim() : `[${label} not found]`;

export function nextReportNumber() {
  if (!existsSync(REPORTS_DIR)) return '001';
  const n = readdirSync(REPORTS_DIR).filter(f => /^\d{3}-/.test(f)).map(f => parseInt(f.slice(0, 3))).filter(x => !isNaN(x));
  return n.length ? String(Math.max(...n) + 1).padStart(3, '0') : '001';
}
export const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
export const jobToJdText = (job) =>
  `Company: ${job.company}\nTitle: ${job.title}\nLocation: ${job.location}${job.comp ? `\nComp: ${job.comp}` : ''}\n\n${job.text}`;

function buildSystemPrompt(locVerdict) {
  return `You are career-ops, evaluating a job offer against Patrick's CV using the A–G scoring system. Follow the methodology exactly.

═══ SYSTEM (_shared.md) ═══
${readFile(P.shared, '_shared.md')}

═══ USER HARD RULES & ARCHETYPES (_profile.md) — THESE OVERRIDE EVERYTHING ═══
${readFile(P.profile, '_profile.md')}

═══ EVALUATION MODE (oferta.md) ═══
${readFile(P.oferta, 'oferta.md')}

═══ CANDIDATE CV (cv.md) ═══
${readFile(P.cv, 'cv.md')}

═══ PROOF POINTS (article-digest.md) ═══
${readFile(P.digest, 'article-digest.md')}

═══ OPERATING RULES ═══
1. Reports in ENGLISH. Apply the security-engineer-first lens from _profile.md.
2. Enforce HARD rules: location policy (Denver-only/remote; non-Denver onsite or non-US = SKIP 1.0) and the $160K comp floor (if comp_max < $160K → 1-line SKIP, no full eval).
3. No WebSearch/Playwright here: estimate comp from training data (note as estimate); judge legitimacy from JD text only.
${locVerdict ? `4. LOCATION PRE-CLEARED by the orchestrator: verdict="${locVerdict.verdict}", note="${locVerdict.reason}". Trust this; if "confirm", flag "confirm remote" in Block A but do not auto-skip.` : ''}
5. START your reply with EXACTLY this machine-readable block (so it survives truncation), THEN write the full A–G report below it:
---SCORE_SUMMARY---
COMPANY: <name>
ROLE: <title>
SCORE: <decimal e.g. 4.2>
ARCHETYPE: <one of the four from _profile.md>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
---END_SUMMARY---`;
}

function parseSummary(text, fallbackCompany, url, locVerdict) {
  const sm = text.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);
  const get = (k) => { const m = (sm?.[1] || '').match(new RegExp(`${k}:\\s*(.+)`)); return m ? m[1].trim() : 'unknown'; };
  const c = get('COMPANY');
  return {
    company: c !== 'unknown' ? c : (fallbackCompany || 'unknown'),
    role: get('ROLE'), score: get('SCORE'), archetype: get('ARCHETYPE'),
    legitimacy: get('LEGITIMACY'), url: url || undefined, location_verdict: locVerdict?.verdict,
  };
}

/** Core evaluator — one OpenRouter call. Returns { result, text }. */
export async function evaluateJD({ jdText, company, url, locVerdict = null, model = DEFAULT_MODEL }) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${loadKey()}`, 'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moorelab.cloud', 'X-Title': 'career-ops' },
    body: JSON.stringify({
      model, temperature: 0.4, max_tokens: 12000,
      messages: [
        { role: 'system', content: buildSystemPrompt(locVerdict) },
        { role: 'user', content: `JOB DESCRIPTION TO EVALUATE:\n\n${jdText}` },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Empty response from OpenRouter');
  return { result: parseSummary(text, company, url, locVerdict), text };
}

export function buildReportMarkdown({ result, text, url, locVerdict, model = DEFAULT_MODEL, date }) {
  return `# Evaluation: ${result.company} — ${result.role}

**Date:** ${date}
**URL:** ${url || 'n/a'}
**Archetype:** ${result.archetype}
**Score:** ${result.score}/5
**Legitimacy:** ${result.legitimacy}
**PDF:** pending
**Tool:** OpenRouter (${model})${locVerdict ? `\n**Location gate:** ${locVerdict.verdict} — ${locVerdict.reason}` : ''}

---

${text.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}
`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    console.log(`career-ops OpenRouter evaluator
  node openrouter-eval.mjs "<JD text>"
  node openrouter-eval.mjs --file <path>
  node openrouter-eval.mjs --url <ats-url> [--json] [--no-save] [--company NAME] [--model NAME]
  Key: OPENROUTER_API_KEY or ~/.secrets/openrouter.txt`);
    return;
  }
  let jdText = '', url = '', company = '', model = DEFAULT_MODEL, save = true, jsonOnly = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file') jdText = readFileSync(args[++i], 'utf-8').trim();
    else if (a === '--url') url = args[++i];
    else if (a === '--company') company = args[++i];
    else if (a === '--model') model = args[++i];
    else if (a === '--no-save') save = false;
    else if (a === '--json') jsonOnly = true;
    else if (!a.startsWith('--')) jdText += (jdText ? '\n' : '') + a;
  }
  const log = (...m) => { if (!jsonOnly) console.log(...m); };

  let locVerdict = null;
  if (url) {
    log(`🌐 Fetching ${url} …`);
    const job = await fetchJob(url, company ? { company } : {});
    if (!job.ok) { console.error(`❌ fetch failed: ${job.error}`); process.exit(1); }
    company = company || job.company;
    jdText = jobToJdText(job);
    locVerdict = assessLocation(job);
    log(`📍 Location gate: ${locVerdict.verdict} (${locVerdict.reason})`);
    if (locVerdict.verdict === 'skip') {
      const out = { company: job.company, role: job.title, score: 1.0, archetype: 'n/a',
        legitimacy: 'n/a', verdict: 'SKIP-location', reason: locVerdict.reason };
      if (jsonOnly) console.log(JSON.stringify(out));
      else log(`\n⛔ HARD location SKIP (1.0) — ${locVerdict.reason}\n   No LLM tokens spent.`);
      return;
    }
  }
  if (!jdText) { console.error('❌ No JD provided.'); process.exit(1); }

  log(`🤖 Evaluating via OpenRouter (${model}) …`);
  let result, text;
  try { ({ result, text } = await evaluateJD({ jdText, company, url, locVerdict, model })); }
  catch (e) { console.error('❌', e.message); process.exit(1); }

  if (jsonOnly) { console.log(JSON.stringify(result)); return; }

  console.log('\n' + '═'.repeat(60) + `\n  CAREER-OPS EVALUATION — OpenRouter (${model})\n` + '═'.repeat(60) + '\n');
  console.log(text);

  if (save) {
    if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
    const num = nextReportNumber();
    const date = process.env.EVAL_DATE || new Date().toISOString().split('T')[0];
    const fn = `${num}-${slugify(result.company + '-' + result.role)}-${date}.md`;
    writeFileSync(join(REPORTS_DIR, fn), buildReportMarkdown({ result, text, url, locVerdict, model, date }), 'utf-8');
    console.log(`\n✅ Report saved: reports/${fn}`);
    console.log(`📊 TSV → batch/tracker-additions/${num}-${slugify(result.company + '-' + result.role)}.tsv:`);
    console.log(`   ${num}\t${date}\t${result.company}\t${result.role}\tEvaluated\t${result.score}/5\t❌\t[${num}](reports/${fn})\t<note>`);
  }
  console.log(`\n  Score: ${result.score}/5 | Archetype: ${result.archetype} | Legitimacy: ${result.legitimacy}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
