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
// Sonnet 5 over Haiku 4.5: ~$0.09/eval at current volume (1–3 survivors/day). Haiku
// scored 4.8 on hard-policy violations even with the rules in-prompt (2026-06/07 misses);
// the deterministic enforcePolicy() cap is the real guard, but a stronger judge means
// fewer wrong-side-of-threshold scores on the roles that DO pass the gates.
export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-5';

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
${buildLocationRule(locVerdict)}
5. START your reply with EXACTLY this machine-readable block (so it survives truncation), THEN write the full A–G report below it:
---SCORE_SUMMARY---
COMPANY: <name>
ROLE: <title>
SCORE: <decimal e.g. 4.2>
ARCHETYPE: <one of the four from _profile.md>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
LOCATION_POLICY: <REMOTE_US | DENVER_METRO | NON_DENVER_OFFICE | NON_US | TRAVEL_REQUIRED | UNCLEAR>
LOCATION_EVIDENCE: <the JD phrase you based LOCATION_POLICY on, max 15 words, or "none">
COMP_MAX_K: <max base salary in $K as integer, e.g. 250, or UNKNOWN>
---END_SUMMARY---

LOCATION_POLICY definitions — judge from the JD text ONLY, no benefit of the doubt:
- REMOTE_US: genuinely remote for US employees, NO required office cadence, NO required travel to specific offices.
- DENVER_METRO: office/hybrid within ~30min of Denver, CO.
- NON_DENVER_OFFICE: any required on-site or hybrid presence (any %, any days/week) at a non-Denver office.
- NON_US: role is located outside the US or not US-remote-eligible.
- TRAVEL_REQUIRED: "remote-friendly" but with required recurring travel to non-Denver offices (e.g. "Remote-Friendly (Travel-Required)", "25% of time in one of our offices").
- UNCLEAR: the JD genuinely does not say. Do NOT guess REMOTE_US from an isRemote flag or vibes.`;
}

function buildLocationRule(locVerdict) {
  const v = locVerdict?.verdict;
  if (v === 'pass-remote' || v === 'pass-denver') {
    return `4. LOCATION PRE-CLEARED by the orchestrator: verdict="${v}", note="${locVerdict.reason}". Trust this for Block A.`;
  }
  if (locVerdict) {
    return `4. LOCATION NOT VERIFIED (gate verdict="${v}": ${locVerdict.reason}). You MUST determine the working-location policy from the JD text yourself and enforce the HARD location rule: any required office presence or recurring travel to a non-Denver-metro office, or a non-US location, means SCORE: 1.0 and the matching LOCATION_POLICY value. If you cannot tell, use UNCLEAR — never assume remote.`;
  }
  return `4. No location pre-check was run. Determine the working-location policy from the JD text and enforce the HARD location rule (non-Denver office/hybrid/travel or non-US → SCORE: 1.0).`;
}

/**
 * Deterministic policy enforcement AFTER the LLM eval — the model advises, this decides.
 * Rationale: on 2026-06-11/13 Haiku scored 4.8 on roles whose own reports said "Zürich,
 * 25% on-site" and "Remote-Friendly (Travel-Required)". Never again: a policy-violating
 * LOCATION_POLICY caps the score to 1.0/SKIP in code, and an UNCLEAR location caps below
 * the 4.0 apply threshold, regardless of what the model scored.
 */
export function enforcePolicy(result, locVerdict = null) {
  const gatePassed = locVerdict && (locVerdict.verdict === 'pass-remote' || locVerdict.verdict === 'pass-denver');
  const lp = (result.location_policy || 'UNCLEAR').toUpperCase();
  const score = parseFloat(result.score);
  result.status = 'Evaluated';

  if (['NON_DENVER_OFFICE', 'NON_US', 'TRAVEL_REQUIRED'].includes(lp)) {
    if (!(score <= 1.0)) result.original_score = result.score;
    result.score = '1.0';
    result.status = 'SKIP';
    result.policy_reason = `HARD LOCATION SKIP (${lp}${result.location_evidence && result.location_evidence !== 'none' ? `: "${result.location_evidence}"` : ''})`;
  } else if (lp === 'UNCLEAR' && !gatePassed && score > 3.9) {
    result.original_score = result.score;
    result.score = '3.9';
    result.needs_confirm = true;
    result.policy_reason = 'Location UNCLEAR and gate did not pass — capped below apply threshold until location is confirmed';
  } else if (!gatePassed && locVerdict?.verdict === 'confirm') {
    result.needs_confirm = true;
  }

  const compK = parseInt(result.comp_max_k, 10);
  if (!isNaN(compK) && compK > 0 && compK < 160 && result.status !== 'SKIP') {
    if (!result.original_score) result.original_score = result.score;
    result.score = '1.0';
    result.status = 'SKIP';
    result.policy_reason = `Comp max $${compK}K below $160K floor`;
  }
  return result;
}

function parseSummary(text, fallbackCompany, url, locVerdict) {
  const sm = text.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);
  const get = (k) => { const m = (sm?.[1] || '').match(new RegExp(`${k}:\\s*(.+)`)); return m ? m[1].trim() : 'unknown'; };
  const c = get('COMPANY');
  return {
    company: c !== 'unknown' ? c : (fallbackCompany || 'unknown'),
    role: get('ROLE'), score: get('SCORE'), archetype: get('ARCHETYPE'),
    legitimacy: get('LEGITIMACY'), url: url || undefined, location_verdict: locVerdict?.verdict,
    location_policy: get('LOCATION_POLICY'), location_evidence: get('LOCATION_EVIDENCE'),
    comp_max_k: get('COMP_MAX_K'),
  };
}

/** Core evaluator — one OpenRouter call. Returns { result, text }. */
export async function evaluateJD({ jdText, company, url, locVerdict = null, model = DEFAULT_MODEL }) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${loadKey()}`, 'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moorelab.cloud', 'X-Title': 'career-ops' },
    body: JSON.stringify({
      // 0.2, not 0.4: at 0.4 the same JD scored 3.7 and 4.2 in back-to-back runs —
      // enough wobble to flip the ≥4.0 alert threshold. Lower temp = stabler scores.
      model, temperature: 0.2, max_tokens: 12000,
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
  const result = enforcePolicy(parseSummary(text, company, url, locVerdict), locVerdict);
  return { result, text };
}

export function buildReportMarkdown({ result, text, url, locVerdict, model = DEFAULT_MODEL, date }) {
  return `# Evaluation: ${result.company} — ${result.role}

**Date:** ${date}
**URL:** ${url || 'n/a'}
**Archetype:** ${result.archetype}
**Score:** ${result.score}/5
**Legitimacy:** ${result.legitimacy}
**PDF:** pending
**Tool:** OpenRouter (${model})${locVerdict ? `\n**Location gate:** ${locVerdict.verdict} — ${locVerdict.reason}` : ''}${result.location_policy ? `\n**Location policy (eval):** ${result.location_policy}${result.location_evidence && result.location_evidence !== 'none' ? ` — "${result.location_evidence}"` : ''}` : ''}${result.policy_reason ? `\n**⛔ POLICY CAP:** score forced to ${result.score} (model scored ${result.original_score ?? result.score}) — ${result.policy_reason}` : ''}

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
    console.log(`   ${num}\t${date}\t${result.company}\t${result.role}\t${result.status || 'Evaluated'}\t${result.score}/5\t❌\t[${num}](reports/${fn})\t<note>`);
  }
  console.log(`\n  Score: ${result.score}/5 | Archetype: ${result.archetype} | Legitimacy: ${result.legitimacy}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
