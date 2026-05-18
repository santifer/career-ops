#!/usr/bin/env node
/**
 * scripts/scan-llm-usage.mjs — Local LLM usage evidence scanner.
 *
 * Walks local sources and builds a knowledge base of how Mitchell has
 * leveraged each LLM/AI provider. Pure local read — no API calls, no npm deps.
 *
 * Output: data/llm-usage-knowledge.json (gitignored)
 *
 * Usage:
 *   node scripts/scan-llm-usage.mjs                  # full scan
 *   node scripts/scan-llm-usage.mjs --since 2026-01-01
 *   node scripts/scan-llm-usage.mjs --dry-run         # print summary, no write
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = join(REPO_ROOT, 'data', 'llm-usage-knowledge.json');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SINCE_IDX = args.indexOf('--since');
const SINCE_DATE = SINCE_IDX >= 0 ? new Date(args[SINCE_IDX + 1]) : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeRead(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function safeStat(path) {
  try { return statSync(path); } catch { return null; }
}

function safeReaddir(path) {
  try { return readdirSync(path); } catch { return []; }
}

function isoDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

function afterSince(isoStr) {
  if (!SINCE_DATE || !isoStr) return true;
  return new Date(isoStr) >= SINCE_DATE;
}

// Count non-empty matches of a regex in text
function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

// ── Provider descriptors ──────────────────────────────────────────────────────

const PROVIDERS = {
  claude_code: {
    keywords: [
      /claude[\s_-]?code/gi,
      /anthropic[\s_-]?cli/gi,
      /mcp__/gi,
      /\.claude\//gi,
      /claude\s+max/gi,
      /sub[\s-]?agent/gi,
      /worktree.*agent/gi,
      /agent[\s-]?commit/gi,
      /council[\s-]?of[\s-]?models/gi,
      /dealbreaker/gi,
    ],
    advanced_patterns: [
      'multi-agent fan-out',
      'sub-agent parallelization',
      'worktree isolation',
      'MCP tool integration',
      'council-of-models framework',
      'agent-attributed commits',
      'autonomous build sessions',
      'skill invocations',
    ],
  },
  anthropic_api: {
    keywords: [
      /anthropic/gi,
      /claude-3/gi,
      /claude-sonnet/gi,
      /claude-haiku/gi,
      /claude-opus/gi,
      /batch[\s_-]?api/gi,
      /messages\.create/gi,
      /cache_control/gi,
      /prompt[\s_-]?cach/gi,
    ],
    advanced_patterns: [
      'Batch API usage',
      'prompt caching (cache_control)',
      'provider circuit breaker',
      'multi-provider routing',
      'temperature tuning',
    ],
  },
  gemini: {
    keywords: [
      /gemini/gi,
      /google[\s_-]ai/gi,
      /generativelanguage/gi,
      /gemini[\s_-]flash/gi,
      /gemini[\s_-]pro/gi,
      /thinkingBudget/gi,
    ],
    advanced_patterns: [
      'Gemini Flash fallback routing',
      'thinkingBudget=0 for cost control',
    ],
  },
  grok: {
    keywords: [
      /\bgrok\b/gi,
      /grok[\s_-]research/gi,
      /xai/gi,
      /grok[\s_-]4/gi,
    ],
    advanced_patterns: [
      'Grok research automation',
      'social intelligence research',
    ],
  },
  openai: {
    keywords: [
      /openai/gi,
      /gpt[\s_-]?4/gi,
      /chatgpt/gi,
      /\bgpt\b/gi,
    ],
    advanced_patterns: [],
  },
  perplexity: {
    keywords: [
      /perplexity/gi,
    ],
    advanced_patterns: [],
  },
  ollama: {
    keywords: [
      /\bollama\b/gi,
      /qwen/gi,
      /llama[\s_-]?3/gi,
      /local[\s_-]?llm/gi,
      /local[\s_-]?model/gi,
      /triage[\s_-]?local/gi,
    ],
    advanced_patterns: [
      'Local Ollama M2 inference',
      'qwen3 chain (14B→8B→3B)',
      'zero-cost local triage fallback',
    ],
  },
};

// ── Evidence accumulators ─────────────────────────────────────────────────────

const evidence = {};
for (const k of Object.keys(PROVIDERS)) {
  evidence[k] = {
    evidence_count: 0,
    first_use_date: null,
    latest_use_date: null,
    advanced_patterns: [...PROVIDERS[k].advanced_patterns],
    use_cases: [],
    compounding_signals: [],
    _hit_counts: {},
  };
}

function registerHit(provider, useCase, evidenceStr, ref, dateStr) {
  const e = evidence[provider];
  if (!e) return;

  const dateIso = isoDate(dateStr);
  if (!afterSince(dateIso)) return;

  e.evidence_count++;
  if (dateIso) {
    if (!e.first_use_date || dateIso < e.first_use_date) e.first_use_date = dateIso;
    if (!e.latest_use_date || dateIso > e.latest_use_date) e.latest_use_date = dateIso;
  }

  // Dedup use_cases by name
  if (!e.use_cases.find(u => u.name === useCase)) {
    e.use_cases.push({ name: useCase, evidence: evidenceStr.slice(0, 120), ref });
  }
}

function addCompoundingSignal(provider, date, pattern) {
  const e = evidence[provider];
  if (!e) return;
  const dateIso = isoDate(date);
  if (!afterSince(dateIso)) return;
  // Dedup by pattern
  if (!e.compounding_signals.find(s => s.pattern === pattern)) {
    e.compounding_signals.push({ date: dateIso || isoDate(new Date()), pattern });
  }
}

// ── Scan: git log ─────────────────────────────────────────────────────────────

function scanGitLog() {
  let logOutput = '';
  try {
    logOutput = execSync(
      'git log --all --pretty="%H|%aI|%s|%an" 2>/dev/null | head -500',
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 15000 }
    );
  } catch { return; }

  let agentCommitCount = 0;
  const agentNames = new Set();
  const mcpIntegrations = new Set();

  for (const line of logOutput.split('\n')) {
    if (!line.trim()) continue;
    const [sha, date, subject, author] = line.split('|');

    // Agent-attributed commits
    if (/agent[\s-]commit|Agent:/i.test(subject)) {
      agentCommitCount++;
      const m = subject.match(/\((\w[\w-]+)\)/) || subject.match(/agent:\s*(\w[\w-]+)/i);
      if (m) agentNames.add(m[1]);
      registerHit('claude_code', 'agent-commit workflow', subject, `git:${sha?.slice(0,8)}`, date);
    }

    // MCP references in commit messages
    if (/\bmcp\b/i.test(subject)) {
      mcpIntegrations.add(subject.slice(0, 60));
      registerHit('claude_code', 'MCP integration', subject, `git:${sha?.slice(0,8)}`, date);
    }

    // Council of models
    if (/council|dealbreaker|researcher/i.test(subject)) {
      registerHit('claude_code', 'council-of-models', subject, `git:${sha?.slice(0,8)}`, date);
      addCompoundingSignal('claude_code', date, 'multi-model council research');
    }

    // Subagent / worktree patterns
    if (/worktree|sub[\s-]?agent|fan[\s-]?out/i.test(subject)) {
      registerHit('claude_code', 'sub-agent fan-out', subject, `git:${sha?.slice(0,8)}`, date);
      addCompoundingSignal('claude_code', date, 'worktree-isolated sub-agent execution');
    }

    // Batch API
    if (/batch[\s-]?api|batch[\s-]?runner/i.test(subject)) {
      registerHit('anthropic_api', 'Anthropic Batch API', subject, `git:${sha?.slice(0,8)}`, date);
    }

    // Gemini
    if (/gemini/i.test(subject)) {
      registerHit('gemini', 'Gemini eval fallback', subject, `git:${sha?.slice(0,8)}`, date);
    }

    // Grok
    if (/\bgrok\b/i.test(subject)) {
      registerHit('grok', 'Grok research', subject, `git:${sha?.slice(0,8)}`, date);
    }

    // Ollama / local
    if (/ollama|qwen|local[\s-]?model|triage[\s-]?local/i.test(subject)) {
      registerHit('ollama', 'Local Ollama triage', subject, `git:${sha?.slice(0,8)}`, date);
    }

    // Cache control / prompt caching
    if (/cache[\s_-]?control|prompt[\s_-]?cach/i.test(subject)) {
      registerHit('anthropic_api', 'Prompt caching (cache_control)', subject, `git:${sha?.slice(0,8)}`, date);
      addCompoundingSignal('anthropic_api', date, 'prompt caching to reduce cost');
    }
  }

  if (agentCommitCount > 0) {
    addCompoundingSignal('claude_code', new Date().toISOString(), `${agentCommitCount} agent-attributed commits tracked`);
  }
}

// ── Scan: Claude project transcripts ─────────────────────────────────────────

function scanClaudeProjects() {
  const projectsDir = join(process.env.HOME, '.claude', 'projects');
  const projects = safeReaddir(projectsDir);

  let totalTranscripts = 0;
  let careerOpsTranscripts = 0;
  let latestActivity = null;
  let firstActivity = null;
  const agentNamesFound = new Set();
  const skillsFound = new Set();
  const mcpsFound = new Set();

  for (const projDir of projects) {
    const fullPath = join(projectsDir, projDir);
    const files = safeReaddir(fullPath).filter(f => f.endsWith('.jsonl'));
    totalTranscripts += files.length;

    const isCareerOps = projDir.includes('career-ops');

    for (const f of files) {
      const filePath = join(fullPath, f);
      const st = safeStat(filePath);
      const modDate = st ? st.mtime.toISOString() : null;

      if (modDate) {
        if (!afterSince(modDate)) continue;
        if (!latestActivity || modDate > latestActivity) latestActivity = modDate;
        if (!firstActivity || modDate < firstActivity) firstActivity = modDate;
      }

      if (isCareerOps) {
        careerOpsTranscripts++;
        // Sample small portion for pattern detection (avoid reading 3500 huge files)
        const sample = safeRead(filePath).slice(0, 4000);
        if (!sample) continue;

        // Detect skills invoked
        const skillMatches = sample.match(/"skill":\s*"([^"]+)"/g) || [];
        for (const m of skillMatches) {
          const sk = m.match(/"skill":\s*"([^"]+)"/);
          if (sk) skillsFound.add(sk[1]);
        }

        // Detect MCP tools used
        const mcpMatches = sample.match(/mcp__([a-zA-Z0-9_-]+)/g) || [];
        for (const m of mcpMatches) mcpsFound.add(m.replace(/mcp__/, '').slice(0, 30));

        // Detect agents
        const agentMatches = sample.match(/--agent\s+([a-z-]+)/g) || [];
        for (const m of agentMatches) {
          const ag = m.replace(/--agent\s+/, '');
          agentNamesFound.add(ag);
        }
      }
    }
  }

  registerHit(
    'claude_code',
    'Claude Code project transcripts',
    `${totalTranscripts} total transcripts across ${projects.length} projects`,
    '~/.claude/projects/',
    latestActivity
  );

  if (careerOpsTranscripts > 0) {
    registerHit(
      'claude_code',
      'Career-ops project usage',
      `${careerOpsTranscripts} transcripts in career-ops project`,
      '~/.claude/projects/career-ops/',
      latestActivity
    );
    addCompoundingSignal('claude_code', latestActivity, `${careerOpsTranscripts} career-ops sessions in Claude Code`);
  }

  if (skillsFound.size > 0) {
    const skillList = [...skillsFound].slice(0, 10).join(', ');
    registerHit('claude_code', 'Skill invocations', `Skills used: ${skillList}`, '~/.claude/projects/', latestActivity);
    addCompoundingSignal('claude_code', latestActivity, `Custom skills deployed: ${skillList}`);
  }

  if (mcpsFound.size > 0) {
    const mcpList = [...mcpsFound].slice(0, 10).join(', ');
    registerHit('claude_code', 'MCP tool usage', `MCPs invoked: ${mcpList}`, '~/.claude/projects/', latestActivity);
  }
}

// ── Scan: agent run files ─────────────────────────────────────────────────────

function scanAgentRuns() {
  const runsDir = join(process.env.HOME, '.claude', 'agents', 'runs');
  const files = safeReaddir(runsDir);

  for (const f of files) {
    const filePath = join(runsDir, f);
    const st = safeStat(filePath);
    const modDate = st ? st.mtime.toISOString() : null;
    if (!afterSince(modDate)) continue;

    const dateMatch = f.match(/(\d{8})/);
    const fileDate = dateMatch ? isoDate(dateMatch[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) : modDate;

    if (f.includes('council')) {
      registerHit('claude_code', 'Council-of-models run', f, `~/.claude/agents/runs/${f}`, fileDate);
      addCompoundingSignal('claude_code', fileDate, 'multi-LLM council invocation');
    }
    if (f.includes('dealbreaker')) {
      registerHit('claude_code', 'Dealbreaker agent run', f, `~/.claude/agents/runs/${f}`, fileDate);
    }
    if (f.includes('researcher')) {
      registerHit('claude_code', 'Researcher agent run', f, `~/.claude/agents/runs/${f}`, fileDate);
    }
    if (f.includes('github-readiness')) {
      registerHit('claude_code', 'GitHub readiness agent run', f, `~/.claude/agents/runs/${f}`, fileDate);
    }
    if (f.includes('linkedin-readiness')) {
      registerHit('claude_code', 'LinkedIn readiness agent run', f, `~/.claude/agents/runs/${f}`, fileDate);
    }
  }
}

// ── Scan: skills and agents configs ──────────────────────────────────────────

function scanAgentConfigs() {
  const agentsDir = join(process.env.HOME, '.claude', 'agents');
  const skillsDir = join(process.env.HOME, '.claude', 'skills');

  for (const [dir, label] of [[agentsDir, 'agent'], [skillsDir, 'skill']]) {
    const files = safeReaddir(dir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
    for (const f of files) {
      if (f === 'runs') continue;
      const content = safeRead(join(dir, f)).slice(0, 2000);
      const st = safeStat(join(dir, f));
      const modDate = st ? st.mtime.toISOString() : null;
      if (!afterSince(modDate)) continue;

      registerHit('claude_code', `Custom ${label}: ${f.replace(/\.(md|json)$/, '')}`, content.slice(0, 80), `~/.claude/${label}s/${f}`, modDate);
    }
  }
}

// ── Scan: repo source files ───────────────────────────────────────────────────

function scanRepoSources() {
  const sourceFiles = [
    // Core LLM integration files
    ['lib/council.mjs', 'claude_code', 'Council-of-models library'],
    ['lib/eval-council.mjs', 'claude_code', 'Eval council library'],
    ['lib/provider-client.mjs', 'anthropic_api', 'Provider client with circuit breaker'],
    ['triage.mjs', 'anthropic_api', 'Triage with multi-provider routing'],
    ['gemini-eval.mjs', 'gemini', 'Gemini eval integration'],
    ['triage-local.mjs', 'ollama', 'Local Ollama triage'],
    ['batch-runner-batches.mjs', 'anthropic_api', 'Anthropic Batch API runner'],
    ['scripts/grok-research.mjs', 'grok', 'Grok research automation'],
    ['scripts/grok-social-intel.mjs', 'grok', 'Grok social intelligence'],
    ['scripts/grok-enrich-applynow.mjs', 'grok', 'Grok apply-now enrichment'],
    ['scripts/warm-cache.mjs', 'anthropic_api', 'Prompt cache warmer'],
    ['scripts/token-counter.mjs', 'anthropic_api', 'Static block token counter'],
  ];

  for (const [relPath, provider, useCase] of sourceFiles) {
    const absPath = join(REPO_ROOT, relPath);
    if (!existsSync(absPath)) continue;
    const st = safeStat(absPath);
    const modDate = st ? st.mtime.toISOString() : null;
    if (!afterSince(modDate)) continue;
    const content = safeRead(absPath).slice(0, 300);
    registerHit(provider, useCase, content.slice(0, 100), relPath, modDate);
  }

  // Scan triage.mjs for provider routing details
  const triageContent = safeRead(join(REPO_ROOT, 'triage.mjs'));
  if (triageContent) {
    if (/TRIAGE_PROVIDER_PRIORITY/i.test(triageContent)) {
      addCompoundingSignal('anthropic_api', new Date().toISOString(), 'multi-provider routing: Ollama→Haiku→Gemini');
    }
    if (/gemini/i.test(triageContent)) {
      registerHit('gemini', 'Triage fallback routing', 'Gemini Flash as triage fallback', 'triage.mjs', null);
    }
    if (/cache_control/i.test(triageContent)) {
      addCompoundingSignal('anthropic_api', new Date().toISOString(), 'cache_control in triage prompt');
    }
  }

  // Scan batch runner for caching + cost patterns
  const batchContent = safeRead(join(REPO_ROOT, 'batch-runner-batches.mjs'));
  if (batchContent) {
    if (/cache_control/i.test(batchContent)) {
      addCompoundingSignal('anthropic_api', new Date().toISOString(), 'cache_control in batch evaluation');
    }
    if (/MONTHLY_BUDGET_USD/i.test(batchContent)) {
      addCompoundingSignal('anthropic_api', new Date().toISOString(), 'budget guard + cost-log integration');
    }
    if (/temperature.*0/i.test(batchContent)) {
      addCompoundingSignal('anthropic_api', new Date().toISOString(), 'temperature=0 for deterministic batch evals');
    }
  }
}

// ── Scan: memory files ────────────────────────────────────────────────────────

function scanMemory() {
  const memDir = join(
    process.env.HOME, '.claude', 'projects',
    '-Users-mitchellwilliams-Documents-career-ops', 'memory'
  );
  const files = safeReaddir(memDir);

  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const content = safeRead(join(memDir, f));
    const st = safeStat(join(memDir, f));
    const modDate = st ? st.mtime.toISOString() : null;
    if (!afterSince(modDate)) continue;

    // Memory mentions of specific providers
    if (/claude[\s_-]?code|mcp|sub[\s-]?agent|worktree/i.test(content)) {
      registerHit('claude_code', `Memory: ${f}`, content.slice(0, 100), `memory/${f}`, modDate);
    }
    if (/gemini/i.test(content)) {
      registerHit('gemini', `Memory: ${f}`, content.slice(0, 100), `memory/${f}`, modDate);
    }
    if (/grok/i.test(content)) {
      registerHit('grok', `Memory: ${f}`, content.slice(0, 100), `memory/${f}`, modDate);
    }
    if (/anthropic[\s_-]?api|batch[\s_-]?api|cache_control/i.test(content)) {
      registerHit('anthropic_api', `Memory: ${f}`, content.slice(0, 100), `memory/${f}`, modDate);
    }
    if (/ollama|qwen|local[\s_-]?llm/i.test(content)) {
      registerHit('ollama', `Memory: ${f}`, content.slice(0, 100), `memory/${f}`, modDate);
    }
  }
}

// ── Scan: cost log ────────────────────────────────────────────────────────────

function scanCostLog() {
  const costLog = join(REPO_ROOT, 'data', 'cost-log.tsv');
  if (!existsSync(costLog)) return;
  const content = safeRead(costLog);
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));

  let totalRuns = 0;
  let latestDate = null;
  let firstDate = null;
  let totalCost = 0;

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [dateStr, , costStr] = parts;
    const cost = parseFloat(costStr);
    if (!isNaN(cost)) totalCost += cost;
    totalRuns++;
    const dIso = isoDate(dateStr);
    if (dIso) {
      if (!afterSince(dIso)) continue;
      if (!latestDate || dIso > latestDate) latestDate = dIso;
      if (!firstDate || dIso < firstDate) firstDate = dIso;
    }
  }

  if (totalRuns > 0) {
    registerHit(
      'anthropic_api',
      'Cost-logged API runs',
      `${totalRuns} runs tracked, ~$${totalCost.toFixed(2)} total logged`,
      'data/cost-log.tsv',
      latestDate
    );
    addCompoundingSignal('anthropic_api', latestDate, `${totalRuns} cost-logged API runs`);
  }
}

// ── Scan: grok research outputs ───────────────────────────────────────────────

function scanGrokOutputs() {
  const dataDir = join(REPO_ROOT, 'data');
  const files = safeReaddir(dataDir).filter(f => f.startsWith('grok-') && f.endsWith('.md'));

  for (const f of files) {
    const st = safeStat(join(dataDir, f));
    const modDate = st ? st.mtime.toISOString() : null;
    if (!afterSince(modDate)) continue;
    registerHit('grok', 'Grok research output', f, `data/${f}`, modDate);
    addCompoundingSignal('grok', modDate, `Grok research output: ${f}`);
  }

  // Also check for grok files in untracked listing
  const untracked = safeReaddir(REPO_ROOT).filter(f => f.includes('grok'));
  for (const f of untracked) {
    const st = safeStat(join(REPO_ROOT, f));
    const modDate = st ? st.mtime.toISOString() : null;
    if (!afterSince(modDate)) continue;
    registerHit('grok', 'Grok file', f, f, modDate);
  }
}

// ── Skill compounding analysis ────────────────────────────────────────────────

function computeSkillCompounding() {
  const allSignals = [];
  for (const e of Object.values(evidence)) {
    allSignals.push(...e.compounding_signals);
  }
  allSignals.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const allPatterns = allSignals.map(s => s.pattern);
  const recentPatterns = allSignals
    .filter(s => s.date && s.date >= thirtyDaysAgo)
    .map(s => s.pattern);

  return {
    first_observed: allSignals[0]?.date || null,
    patterns_in_use_now: [...new Set(allPatterns)],
    patterns_acquired_last_30d: [...new Set(recentPatterns)],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.error('[scan-llm-usage] Starting full scan...');

scanGitLog();
console.error('[scan-llm-usage] Git log done');

scanClaudeProjects();
console.error('[scan-llm-usage] Claude projects done');

scanAgentRuns();
console.error('[scan-llm-usage] Agent runs done');

scanAgentConfigs();
console.error('[scan-llm-usage] Agent/skill configs done');

scanRepoSources();
console.error('[scan-llm-usage] Repo sources done');

scanMemory();
console.error('[scan-llm-usage] Memory files done');

scanCostLog();
console.error('[scan-llm-usage] Cost log done');

scanGrokOutputs();
console.error('[scan-llm-usage] Grok outputs done');

// Build final output
const providers = {};
for (const [k, e] of Object.entries(evidence)) {
  const { _hit_counts, ...rest } = e;
  providers[k] = rest;
}

const output = {
  schema_version: '1.0.0',
  generated_at: new Date().toISOString(),
  providers,
  skill_compounding: computeSkillCompounding(),
};

const providerCount = Object.values(providers).filter(p => p.evidence_count > 0).length;
const totalEvidence = Object.values(providers).reduce((s, p) => s + p.evidence_count, 0);

if (DRY_RUN) {
  console.log(JSON.stringify(output, null, 2));
  console.error(`[scan-llm-usage] DRY RUN — ${providerCount} providers with evidence, ${totalEvidence} total evidence items`);
} else {
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    ok: true,
    output_path: OUTPUT_PATH,
    providers_with_evidence: providerCount,
    total_evidence_items: totalEvidence,
    compounding_patterns: output.skill_compounding.patterns_in_use_now.length,
  }));
  console.error(`[scan-llm-usage] Written to ${OUTPUT_PATH}`);
}
