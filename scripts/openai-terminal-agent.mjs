#!/usr/bin/env node
/**
 * openai-terminal-agent.mjs — thin custom wrapper for GPT-5.5 unattended
 * terminal use, deferred item from dealbreaker-v2 (2026-05-18).
 *
 * Wires GPT-5.5's Terminal-Bench 2.0 leadership (82.7% vs Opus 4.7 69.4%, a
 * 13-point gap) into a usable shell-loop harness while OpenAI's official Codex
 * CLI is still pending. Uses Responses API with function calling — model
 * outputs structured `shell` tool calls, this script executes them in a
 * sandboxed subprocess, feeds output back, loops until done or max turns.
 *
 * Safety defaults (read-only mode):
 *   - Blocks: rm, mv, cp -f, chmod, chown, kill, killall, sudo, dd
 *   - Blocks: curl/wget with output redirection (-o, -O, > file)
 *   - Blocks: pipe to shell (| sh, | bash, | zsh)
 *   - Blocks: eval, exec (when literal)
 *   - Allows: ls, cat, grep, find, head, tail, wc, git status/log/diff/show,
 *     node --check, npm ls, etc.
 *
 * Override flags:
 *   --allow-mutate     Allow write/modify operations (rm, mv, cp, chmod, etc.)
 *   --allow-network    Allow curl/wget with output flags
 *   --allow-all        Bypass ALL safety checks (use with extreme care)
 *
 * Other flags:
 *   --max-turns N      Max model loops (default 10)
 *   --cwd PATH         Sandbox cwd (default: current dir)
 *   --command-timeout S Per-command timeout in seconds (default 60)
 *   --reasoning-effort EFFORT  gpt-5.5 reasoning_effort (low|medium|high|xhigh)
 *   --log PATH         Append structured JSON log to PATH
 *
 * Usage:
 *   node ~/Documents/career-ops/scripts/openai-terminal-agent.mjs "Find all .mjs files modified in the last 24 hours"
 *   node ~/Documents/career-ops/scripts/openai-terminal-agent.mjs --allow-mutate --max-turns 20 "Fix the failing tests in scripts/"
 */

import { execSync } from 'node:child_process';
import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────
// env loader (override:true per memory rule)
// ─────────────────────────────────────────────────────────────────────────
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv('/Users/mitchellwilliams/Documents/career-ops/.env');

// ─────────────────────────────────────────────────────────────────────────
// args
// ─────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = { 'max-turns': 10, 'command-timeout': 60, cwd: process.cwd() };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--allow-mutate') flags['allow-mutate'] = true;
  else if (a === '--allow-network') flags['allow-network'] = true;
  else if (a === '--allow-all') flags['allow-all'] = true;
  else if (a.startsWith('--')) { flags[a.slice(2)] = args[++i]; }
  else positional.push(a);
}
const userTask = positional.join(' ').trim();
if (!userTask) {
  console.error('Usage: openai-terminal-agent.mjs [flags] "<task description>"');
  console.error('  --allow-mutate  --allow-network  --allow-all');
  console.error('  --max-turns N (default 10)  --cwd PATH  --command-timeout S (default 60)');
  console.error('  --reasoning-effort low|medium|high|xhigh  --log PATH');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('FAIL: OPENAI_API_KEY missing');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────
// safety
// ─────────────────────────────────────────────────────────────────────────
const READ_ONLY_DENYLIST = [
  /\brm\s/, /\brmdir\b/, /\bunlink\b/,
  /\bmv\s/, /\bcp\s+-[fr]/, /\bdd\s/,
  /\bchmod\s/, /\bchown\s/, /\bchgrp\s/,
  /\bkill(?:all)?\s/, /\bpkill\b/,
  /\bsudo\b/, /\bsu\s/,
  /\beval\s+/, /\bexec\s+/,
  /\b(npm|yarn|pnpm)\s+(install|i|add|remove|rm|uninstall|update)\b/,
  /\bgit\s+(commit|push|pull|merge|rebase|reset|checkout|branch\s+-d|stash\b)/,
  /\bbrew\s+(install|uninstall|upgrade)\b/,
  /\bdocker\s+(rm|kill|stop|prune)\b/,
  />\s*[^\s|]/, // shell redirection to file: `cmd > file`
  /\|\s*(sh|bash|zsh|fish|csh|tcsh|ksh)\b/, // pipe to shell
];
const NETWORK_DENYLIST = [
  /\b(curl|wget)\b.*-[oO]\s/,
  /\b(curl|wget)\b\s+http/,  // any curl/wget URL by default (can be informational, but block in read-only)
  /\bnc\b\s/,
  /\bssh\b\s/,
  /\bscp\b\s/, /\brsync\b\s/,
];

function isSafeCommand(cmd) {
  if (flags['allow-all']) return { safe: true };
  for (const pattern of READ_ONLY_DENYLIST) {
    if (pattern.test(cmd) && !flags['allow-mutate']) {
      return { safe: false, reason: `blocked by read-only safety (matches ${pattern}); use --allow-mutate to override` };
    }
  }
  for (const pattern of NETWORK_DENYLIST) {
    if (pattern.test(cmd) && !flags['allow-network']) {
      return { safe: false, reason: `blocked by network safety (matches ${pattern}); use --allow-network to override` };
    }
  }
  return { safe: true };
}

// ─────────────────────────────────────────────────────────────────────────
// shell executor
// ─────────────────────────────────────────────────────────────────────────
function execShell(command, cwd = flags.cwd, timeoutSec = Number(flags['command-timeout'])) {
  const safe = isSafeCommand(command);
  if (!safe.safe) {
    return { stdout: '', stderr: `[SAFETY BLOCK] ${safe.reason}`, exit_code: 126 };
  }
  try {
    const stdout = execSync(command, {
      cwd: resolve(cwd),
      timeout: timeoutSec * 1000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout: stdout.toString().slice(0, 20000), stderr: '', exit_code: 0 };
  } catch (e) {
    return {
      stdout: (e.stdout || '').toString().slice(0, 10000),
      stderr: (e.stderr || e.message || '').toString().slice(0, 5000),
      exit_code: e.status || 1,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Responses API call
// ─────────────────────────────────────────────────────────────────────────
const SHELL_TOOL = {
  type: 'function',
  function: {
    name: 'shell',
    description: 'Execute a shell command in the sandboxed cwd. Read-only by default; write operations require --allow-mutate flag at script invocation.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute. Use full paths where appropriate.' },
        reason: { type: 'string', description: 'One-sentence rationale for why this command advances the task.' },
      },
      required: ['command', 'reason'],
    },
  },
};

const SYSTEM_PROMPT = `You are an unattended terminal agent operating in: ${flags.cwd}

The harness allows you to call ONE tool: \`shell({ command, reason })\`. It runs the command in a sandboxed subprocess and returns { stdout, stderr, exit_code }.

Safety mode: ${flags['allow-all'] ? 'ALL OPERATIONS ALLOWED' : flags['allow-mutate'] ? 'mutate allowed' : 'read-only'} | Network: ${flags['allow-network'] ? 'allowed' : 'blocked'}.

Operating principles:
1. Plan before acting. State your approach in 1-2 sentences before the first shell call.
2. Each shell call MUST include a reason. The user will read both.
3. Prefer simple, idempotent commands. Test (ls/cat/grep) before mutating (if mutate is allowed).
4. If a command fails, diagnose from stderr before retrying. Do not loop on the same failure.
5. Max ${flags['max-turns']} turns total. Be economical.
6. When the task is complete OR you've hit a blocker you can't resolve, respond with the final answer in plain text (no shell call).

Today's date: ${new Date().toISOString().slice(0, 10)}.`;

async function callOpenAI(messages) {
  const body = {
    model: 'gpt-5.5',
    messages,
    tools: [SHELL_TOOL],
    max_completion_tokens: 4000,
  };
  if (flags['reasoning-effort']) body.reasoning_effort = flags['reasoning-effort'];
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────
// main loop
// ─────────────────────────────────────────────────────────────────────────
const transcript = [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: userTask },
];
const log = { task: userTask, flags, started: new Date().toISOString(), turns: [], total_tokens: 0 };

console.log(`\n🤖 openai-terminal-agent (gpt-5.5) — cwd: ${flags.cwd}`);
console.log(`   safety: ${flags['allow-all'] ? 'ALL' : flags['allow-mutate'] ? 'mutate' : 'read-only'} | network: ${flags['allow-network'] ? 'yes' : 'no'} | max-turns: ${flags['max-turns']}`);
console.log(`\nTask: ${userTask}\n${'─'.repeat(60)}\n`);

for (let turn = 1; turn <= Number(flags['max-turns']); turn++) {
  let resp;
  try {
    resp = await callOpenAI(transcript);
  } catch (e) {
    console.error(`❌ turn ${turn}: API error — ${e.message}`);
    log.turns.push({ turn, error: e.message });
    break;
  }
  log.total_tokens += resp.usage?.total_tokens || 0;
  const msg = resp.choices?.[0]?.message;
  if (!msg) { console.error(`❌ turn ${turn}: no message`); break; }
  transcript.push(msg);

  // Print any text content from the model
  if (msg.content) console.log(`💭 ${msg.content}\n`);

  // If model called the shell tool, execute and feed back
  const toolCalls = msg.tool_calls || [];
  if (toolCalls.length === 0) {
    console.log(`${'─'.repeat(60)}\n✅ Done (turn ${turn}) — model returned final answer.\n`);
    log.turns.push({ turn, final: msg.content || '' });
    break;
  }

  for (const tc of toolCalls) {
    if (tc.function?.name !== 'shell') continue;
    let argsObj;
    try { argsObj = JSON.parse(tc.function.arguments); }
    catch (e) { argsObj = { command: '', reason: '(unparseable args)' }; }
    const cmd = argsObj.command || '';
    const reason = argsObj.reason || '';
    console.log(`🛠️  turn ${turn}: ${reason}`);
    console.log(`   $ ${cmd}`);
    const result = execShell(cmd);
    const out = result.stdout || result.stderr || '(no output)';
    console.log(`   → exit ${result.exit_code}${result.stdout ? `, ${result.stdout.length}ch stdout` : ''}${result.stderr ? `, ${result.stderr.length}ch stderr` : ''}`);
    if (out.length < 500) console.log(`   ${out.split('\n').slice(0, 8).join('\n   ')}\n`);
    log.turns.push({ turn, command: cmd, reason, exit_code: result.exit_code, stdout_chars: result.stdout?.length || 0, stderr_chars: result.stderr?.length || 0 });

    // Feed tool result back to the model
    transcript.push({
      role: 'tool',
      tool_call_id: tc.id,
      content: JSON.stringify({ stdout: result.stdout, stderr: result.stderr, exit_code: result.exit_code }),
    });
  }
}

log.ended = new Date().toISOString();
log.cost_estimate_usd = (log.total_tokens * 7 / 1_000_000).toFixed(4); // ~$5/$15 blended

console.log(`\n📊 Run summary: ${log.turns.length} turns · ${log.total_tokens} tokens · ~$${log.cost_estimate_usd}`);

if (flags.log) {
  appendFileSync(flags.log, JSON.stringify(log, null, 2) + '\n,\n');
  console.log(`📝 Log appended to ${flags.log}`);
}
