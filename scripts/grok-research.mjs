#!/usr/bin/env node
/**
 * Grok Research Loop — Daily research run for the career-ops Grok-Claude loop.
 *
 * Calls xAI Responses API once per day with the master research prompt
 * (data/grok-claude-loop-setup.md). Attempts the full tool suite — web_search
 * always, plus the X-native tools that may now be available per Phase 2
 * 2026-05-07 research. Tools that error are dropped on retry; final-call tool
 * set is logged to data/research-state.json so future runs know what's live.
 *
 * Output: proposed diffs written to data/pending-diffs/YYYY-MM-DD-grok-research.md.
 * Mitchell reviews each morning; nothing applies automatically.
 *
 * Usage:
 *   node scripts/grok-research.mjs                    # default daily run
 *   node scripts/grok-research.mjs --dry-run          # skip API call, show prompt
 *   node scripts/grok-research.mjs --tools-only       # probe tool availability
 *
 * Environment: requires XAI_API_KEY (loaded from ~/.career-ops-secrets if not set)
 *
 * Cost discipline:
 *  - Estimated cost per query: $0.50 (heavier prompt + heavier model than social-intel)
 *  - Stops if today's spend ≥ $4.50 (leaves $0.50 headroom for other calls)
 *  - Logs every attempt to data/grok-spend.log with [grok-research] prefix
 *
 * Cache behavior:
 *  - Updates data/research-state.json on every run (last_grok_run timestamp,
 *    accepted_tools list, pending_diffs array)
 *
 * Failure mode:
 *  - On API failure, writes a stub diff file noting the failure for manual review.
 *  - Returns exit code 0 if a diff (success or stub) was written, non-zero otherwise.
 */

import { readFileSync, existsSync, appendFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SPEND_LOG = join(ROOT, 'data/grok-spend.log');
const SPEND_LOCK = SPEND_LOG + '.lock';
const STATE_FILE = join(ROOT, 'data/research-state.json');
const PENDING_DIFFS_DIR = join(ROOT, 'data/pending-diffs');
const SECRETS_PATH = join(process.env.HOME || '', '.career-ops-secrets');

const DAILY_CAP_USD = 5.0;
const HEADROOM_USD = 0.5;
const ESTIMATED_COST_USD = 0.5;
const REQUEST_TIMEOUT_MS = 180_000; // 3 min — heavier prompt, heavier model
const LOCK_TIMEOUT_MS = 5000;

const XAI_ENDPOINT = 'https://api.x.ai/v1/responses';
const XAI_MODEL_PRIMARY = 'grok-4-heavy';
const XAI_MODEL_FALLBACK = 'grok-4-fast-reasoning';

const FULL_TOOLSET = [
  { type: 'web_search' },
  { type: 'x_search' },
];

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const isDryRun = !!args['dry-run'];
const isToolsOnly = !!args['tools-only'];

function loadSecretEnv() {
  if (process.env.XAI_API_KEY) return;
  if (!existsSync(SECRETS_PATH)) return;
  try {
    const lines = readFileSync(SECRETS_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* secret load is best-effort */
  }
}

function acquireSpendLock() {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      writeFileSync(SPEND_LOCK, String(process.pid), { flag: 'wx' });
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const pid = parseInt(readFileSync(SPEND_LOCK, 'utf-8').trim(), 10);
        try { process.kill(pid, 0); } catch { unlinkSync(SPEND_LOCK); continue; }
      } catch { /* lock unreadable, retry */ }
      const t = Date.now() + 20; while (Date.now() < t) {}
    }
  }
  throw new Error(`Timeout acquiring grok spend lock after ${LOCK_TIMEOUT_MS}ms`);
}

function releaseSpendLock() {
  try { unlinkSync(SPEND_LOCK); } catch {}
}

function getTodaySpend() {
  if (!existsSync(SPEND_LOG)) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const lines = readFileSync(SPEND_LOG, 'utf-8').split('\n').filter(Boolean);
  return lines
    .filter(l => l.startsWith(today) || l.includes(today))
    .reduce((sum, l) => {
      const cols = l.split('\t');
      const c = parseFloat(cols[2] ?? cols[1] ?? 0);
      return sum + (Number.isFinite(c) ? c : 0);
    }, 0);
}

function appendSpend(label, cost) {
  acquireSpendLock();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const ts = new Date().toISOString();
    appendFileSync(SPEND_LOG, `${today}\t${ts}\t${cost.toFixed(4)}\t[grok-research] ${label}\n`);
  } finally {
    releaseSpendLock();
  }
}

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { last_grok_run: null, last_claude_apply: null, pending_diffs: [], loop_enabled: false, accepted_tools: ['web_search'] };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { last_grok_run: null, last_claude_apply: null, pending_diffs: [], loop_enabled: false, accepted_tools: ['web_search'] };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function buildMasterPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return `You are a research agent working on behalf of Mitchell Williams, who runs an AI-powered job search pipeline (career-ops).

Mitchell's archetype stack: AI Solutions Architect / Agent Builder / AI Enablement / AI PgM (primary) + Communications/Editorial at AI-native companies (secondary). Target companies: Anthropic, xAI, OpenAI, Sierra, Perplexity, Groq, Databricks, Cerebras, Cursor, Mistral, DeepMind.

Research the following for the past 7 days only (${sevenDaysAgo} to ${today}). Skip any source older than that window.

1. CLAUDE CODE CLI PATTERNS: New flags, prompt techniques, rate-limit handling, or batch eval reliability improvements shared on r/ClaudeCode, r/ClaudeAI, HackerNews, or X builder threads (#ClaudeCode #AgentOps #LLMOps).

2. FRONTIER AI HIRING SHIFTS: New role titles or archetype changes at the target companies specifically at the intersection of communications, AI enablement, DevRel, engineering editorial, program management, or agent builder/PM hybrid roles. Focus on postings or hiring announcements from the past 7 days, IPO buzz, and equity upside signals. If x_keyword_search is available, use it for X-native hiring threads.

3. XAI/GROK API UPDATES: New capability releases, model updates, pricing changes, tool use additions for xAI/Grok API in the last 7 days. Confirm which tools are actually callable (web_search, x_keyword_search, x_semantic_search, x_user_search, x_thread_fetch).

4. AI BUILDER COMMUNITY SIGNALS: From the top communities (r/MachineLearning, r/LocalLLaMA, r/AiBuilders, r/MLOps, r/AI_Agents, Hugging Face Discord, OpenAI Discord, LangChain Discord, n8n Discord) in the past 7 days — highest-signal discussions about agentic workflow techniques, hiring/gigs for hybrid comms/PM/agent builder roles, or pre-IPO company signals.

5. OPENCLAW / ATLAS ECOSYSTEM: Any community discussions about OpenClaw, persistent local AI agents, or Atlas-class chief-of-staff agent implementations in the past 7 days.

Output format — produce three sections:

SECTION 1: AGENTS.md / batch-prompt.md proposed edits (verbatim diff-style additions, clearly marked [PROPOSED EDIT — REVIEW BEFORE APPLY])

SECTION 2: config/profile.yml triage keyword updates — new role titles to add to triage.a2_titles or triage.b_titles based on emerging frontier AI job descriptions

SECTION 3: Community + hiring intelligence — actionable leads and signals ranked by relevance

For each finding: confidence level (HIGH/MEDIUM/LOW), source URL, date.

Ethical invariants (non-negotiable):
- No auto-apply of diffs.
- No privacy violations — no scraping individual profiles, no PII collection.
- Flag confidence level for each proposed change.
- Never propose removing existing safeguards.

Output as Markdown. Stay under 1200 words.`;
}

function extractContent(data) {
  if (data.output_text) return data.output_text;
  if (Array.isArray(data.output)) {
    const texts = [];
    for (const item of data.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === 'output_text' || c.type === 'text') {
            if (c.text) texts.push(c.text);
          }
        }
      }
    }
    if (texts.length) return texts.join('\n\n');
  }
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  return null;
}

async function callGrok(model, tools, prompt) {
  const requestBody = { model, input: [{ role: 'user', content: prompt }], tools };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(XAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const text = await response.text();
    if (!response.ok) {
      const err = new Error(`xAI API ${response.status}: ${text.slice(0, 500)}`);
      err.status = response.status;
      err.body = text;
      throw err;
    }
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Non-JSON response from xAI: ${text.slice(0, 200)}`); }
    const content = extractContent(data);
    if (!content) throw new Error(`Empty response from xAI. Top-level keys: ${Object.keys(data).join(', ')}`);
    const citations = data.citations || [];
    return { content, citations, raw: data };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Grok query timeout (${REQUEST_TIMEOUT_MS / 1000}s)`);
    throw err;
  }
}

function parseUnsupportedTool(errBody) {
  if (!errBody) return null;
  // xAI typically returns { error: { message: "tool 'x_keyword_search' is not supported" } }
  // Try a few patterns.
  const patterns = [
    /tool ['"]?([a-z_]+)['"]? is not supported/i,
    /unknown tool ['"]?([a-z_]+)['"]?/i,
    /unsupported tool[s]? ['"]?([a-z_]+)['"]?/i,
    /['"]([a-z_]+)['"] is not a valid tool/i,
  ];
  for (const re of patterns) {
    const m = errBody.match(re);
    if (m) return m[1];
  }
  return null;
}

async function callGrokWithToolDiscovery(prompt) {
  const acceptedTools = [...FULL_TOOLSET];
  let lastErr = null;
  for (let attempt = 0; attempt < FULL_TOOLSET.length + 1; attempt++) {
    try {
      let result;
      try {
        result = await callGrok(XAI_MODEL_PRIMARY, acceptedTools, prompt);
        result.modelUsed = XAI_MODEL_PRIMARY;
      } catch (primaryErr) {
        if (primaryErr.status === 404 || primaryErr.status === 400 && /model/i.test(primaryErr.body || '')) {
          result = await callGrok(XAI_MODEL_FALLBACK, acceptedTools, prompt);
          result.modelUsed = XAI_MODEL_FALLBACK;
        } else {
          throw primaryErr;
        }
      }
      result.toolsUsed = acceptedTools.map(t => t.type);
      return result;
    } catch (err) {
      lastErr = err;
      const dropped = parseUnsupportedTool(err.body);
      if (dropped) {
        const beforeCount = acceptedTools.length;
        const remaining = acceptedTools.filter(t => t.type !== dropped);
        if (remaining.length === beforeCount) break; // didn't actually drop anything
        if (remaining.length === 0) break; // nothing left to try
        process.stderr.write(`[grok-research] Tool '${dropped}' not supported — retrying with ${remaining.length} tools.\n`);
        acceptedTools.splice(0, acceptedTools.length, ...remaining);
        continue;
      }
      // Non-tool-related error: stop retrying.
      throw err;
    }
  }
  throw lastErr || new Error('Tool discovery loop exhausted');
}

function writeStubDiff(date, reason) {
  if (!existsSync(PENDING_DIFFS_DIR)) mkdirSync(PENDING_DIFFS_DIR, { recursive: true });
  const path = join(PENDING_DIFFS_DIR, `${date}-grok-research.md`);
  const body = `# Grok Research — ${date} (FAILED)

**Status:** API call did not complete — stub diff written for visibility.

**Reason:** ${reason}

**Action:** Re-run \`node scripts/grok-research.mjs\` manually, or wait for next scheduled run.

No diffs to apply this round.
`;
  writeFileSync(path, body);
  return path;
}

function writeDiff(date, content, modelUsed, toolsUsed, citations) {
  if (!existsSync(PENDING_DIFFS_DIR)) mkdirSync(PENDING_DIFFS_DIR, { recursive: true });
  const path = join(PENDING_DIFFS_DIR, `${date}-grok-research.md`);
  const citationsBlock = citations && citations.length
    ? `\n## Citations\n\n${citations.map((c, i) => `${i + 1}. ${typeof c === 'string' ? c : (c.url || c.title || JSON.stringify(c))}`).join('\n')}\n`
    : '';
  const body = `# Grok Research — ${date}

**Generated:** ${new Date().toISOString()}
**Model:** ${modelUsed}
**Tools accepted by API:** ${toolsUsed.join(', ')}
**Source:** xAI Grok Live Search via \`scripts/grok-research.mjs\`

> Ethical reminder: nothing here applies automatically. Mitchell reviews each section,
> approves or rejects, then a human run of \`scripts/apply-pending-diff.mjs\` (or manual
> edits) propagates approved changes.

---

${content}
${citationsBlock}
---

**Next steps:**
1. Read each SECTION above.
2. For SECTION 1 / 2 changes you want to apply, copy the diff text and apply manually
   (or via \`scripts/apply-pending-diff.mjs\` once that script ships).
3. For SECTION 3 leads, decide which to act on this week — see
   \`data/portfolio-networking-plan.md\` for the cadence.
4. After review, mark this file processed by appending \`<!-- REVIEWED: ${date} -->\` at the bottom.
`;
  writeFileSync(path, body);
  return path;
}

async function main() {
  loadSecretEnv();

  if (!process.env.XAI_API_KEY) {
    console.error('ERROR: XAI_API_KEY not in env or in ~/.career-ops-secrets');
    process.exit(2);
  }

  const date = new Date().toISOString().slice(0, 10);
  const prompt = buildMasterPrompt();

  if (isDryRun) {
    process.stdout.write(`# Grok Research — Dry Run (${date})\n\n## Master Prompt\n\n${prompt}\n`);
    process.exit(0);
  }

  if (isToolsOnly) {
    // Probe call with minimal prompt to check tool acceptance.
    try {
      const result = await callGrokWithToolDiscovery('Return just the word "ok".');
      const state = loadState();
      state.accepted_tools = result.toolsUsed;
      state.last_tools_probe = new Date().toISOString();
      saveState(state);
      console.log(JSON.stringify({ accepted_tools: result.toolsUsed, model: result.modelUsed }, null, 2));
      process.exit(0);
    } catch (err) {
      console.error(`Tools probe failed: ${err.message}`);
      process.exit(1);
    }
  }

  const todaySpend = getTodaySpend();
  if (todaySpend + ESTIMATED_COST_USD > DAILY_CAP_USD - HEADROOM_USD) {
    const reason = `Daily spend cap reached. Today: $${todaySpend.toFixed(2)}, this run estimated $${ESTIMATED_COST_USD.toFixed(2)}, cap (with $${HEADROOM_USD} headroom) $${(DAILY_CAP_USD - HEADROOM_USD).toFixed(2)}. Skipping.`;
    console.warn(reason);
    const path = writeStubDiff(date, reason);
    console.log(`Stub diff: ${path}`);
    const state = loadState();
    state.last_grok_run_skipped = new Date().toISOString();
    saveState(state);
    process.exit(0);
  }

  let result;
  try {
    result = await callGrokWithToolDiscovery(prompt);
  } catch (err) {
    const reason = `Grok API call failed: ${err.message}`;
    console.error(reason);
    appendSpend(`failed: ${err.message.slice(0, 60)}`, 0);
    const path = writeStubDiff(date, reason);
    console.log(`Stub diff: ${path}`);
    process.exit(1);
  }

  appendSpend(`success model=${result.modelUsed} tools=${result.toolsUsed.length}`, ESTIMATED_COST_USD);
  const path = writeDiff(date, result.content, result.modelUsed, result.toolsUsed, result.citations);

  const state = loadState();
  state.last_grok_run = new Date().toISOString();
  state.accepted_tools = result.toolsUsed;
  state.pending_diffs = [...new Set([...(state.pending_diffs || []), path])];
  saveState(state);

  console.log(`✅ Grok research written: ${path}`);
  console.log(`   Model: ${result.modelUsed}`);
  console.log(`   Tools: ${result.toolsUsed.join(', ')}`);
  console.log(`   Citations: ${result.citations.length}`);
  console.log(`   Today's spend: $${(todaySpend + ESTIMATED_COST_USD).toFixed(2)} / $${DAILY_CAP_USD.toFixed(2)}`);
}

main().catch(err => {
  console.error(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
