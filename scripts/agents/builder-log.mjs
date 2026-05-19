#!/usr/bin/env node
/**
 * scripts/agents/builder-log.mjs
 *
 * Generates a structured log of Mitchell's career-ops builder evolution from
 * git history. Surfaces skills, APIs touched, bug classes, PM signals, and
 * build streak. Output feeds the dashboard's "Builder Evolution" widget and
 * the resume-bullet exporter.
 *
 * Why this exists: Mitchell is building toward a PM role. His career-ops repo
 * is the proof. Without instrumentation, the depth of work (architectural
 * decisions, postmortem culture, instrumentation-first builds, cost discipline)
 * stays buried in git log. This script extracts and structures that evidence.
 *
 * Usage:
 *   node scripts/agents/builder-log.mjs                    # rolling 30-day digest
 *   node scripts/agents/builder-log.mjs --since=24h        # nightly incremental
 *   node scripts/agents/builder-log.mjs --since=90d        # rolling 90-day digest
 *   node scripts/agents/builder-log.mjs --no-llm-tag       # skip Sonnet pass (free)
 *   node scripts/agents/builder-log.mjs --export-resume-bullets [path]
 *   node scripts/agents/builder-log.mjs --dry-run          # print, don't write
 *
 * Outputs:
 *   data/builder-log.json              cumulative state (skills, APIs, bug-classes seen ever)
 *   data/builder-log-rolling-30d.md    human-readable digest of last 30 days
 *   data/builder-log-{date}.md         daily snapshot (when --since=24h)
 *   data/builder-resume-bullets.md     resume-ready bullets (when --export-resume-bullets)
 *
 * Cost: 0 without --llm-tag; ~$0.10-0.30/run with --llm-tag (one Sonnet call per
 * commit cluster). Tagging is cached by commit SHA so re-runs are free.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch {}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ── Args ─────────────────────────────────────────────────────────────
const ARGS = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const idx = a.indexOf('=');
    return idx >= 0 ? [a.slice(2, idx), a.slice(idx + 1)] : [a.slice(2), true];
  })
);

const SINCE = ARGS.since || '30 days ago';
const DO_LLM_TAG = ARGS['no-llm-tag'] !== true;
const DRY_RUN = !!ARGS['dry-run'];
const EXPORT_RESUME = !!ARGS['export-resume-bullets'];
const RESUME_PATH = (typeof ARGS['export-resume-bullets'] === 'string')
  ? ARGS['export-resume-bullets']
  : join(ROOT, 'data', 'builder-resume-bullets.md');

// ── Paths ────────────────────────────────────────────────────────────
const CUMULATIVE_JSON = join(ROOT, 'data', 'builder-log.json');
const ROLLING_MD      = join(ROOT, 'data', 'builder-log-rolling-30d.md');
const TODAY = new Date().toISOString().slice(0, 10);
const DAILY_MD        = join(ROOT, 'data', `builder-log-${TODAY}.md`);
const TAGGING_CACHE   = join(ROOT, 'data', 'builder-log-tagging-cache.json');

function sinceArg(raw) {
  // Convert --since=24h / 7d / 30d / 90d to git --since formats.
  if (!raw) return '30 days ago';
  const m = /^(\d+)\s*(h|hours?|d|days?|w|weeks?|m|months?)$/i.exec(raw);
  if (!m) return raw;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('h')) return `${n} hours ago`;
  if (unit.startsWith('d')) return `${n} days ago`;
  if (unit.startsWith('w')) return `${n * 7} days ago`;
  if (unit.startsWith('m')) return `${n} months ago`;
  return raw;
}

// ── Phase A: walk git log ────────────────────────────────────────────
function walkGitLog(since) {
  const sinceFmt = sinceArg(since);
  // Use a unique field separator so we can parse robustly.
  const SEP = '\x1e';  // RS
  const FMT = ['%H', '%ai', '%an', '%s'].join(SEP);
  let raw;
  try {
    raw = execSync(
      `git -C "${ROOT}" log --since="${sinceFmt}" --pretty=format:"${FMT}" --shortstat`,
      { maxBuffer: 64 * 1024 * 1024, encoding: 'utf-8' }
    );
  } catch (err) {
    console.error('[builder-log] git log failed:', err.message);
    return [];
  }
  // Each commit block: SHA<SEP>date<SEP>author<SEP>subject\n[shortstat line]\n\n
  const blocks = raw.split('\n\n').filter(Boolean);
  const commits = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const header = lines[0] || '';
    const parts = header.split(SEP);
    if (parts.length < 4) continue;
    const [sha, iso, author, subject] = parts;
    const statLine = lines.find(l => /files? changed/.test(l)) || '';
    const filesChanged = /(\d+)\s+files?\s+changed/.exec(statLine)?.[1] || 0;
    const insertions = /(\d+)\s+insertions?/.exec(statLine)?.[1] || 0;
    const deletions  = /(\d+)\s+deletions?/.exec(statLine)?.[1] || 0;
    commits.push({
      sha: sha.trim(),
      iso: iso.trim(),
      date: iso.slice(0, 10),
      author: author.trim(),
      subject: subject.trim(),
      files_changed: parseInt(filesChanged, 10) || 0,
      insertions: parseInt(insertions, 10) || 0,
      deletions: parseInt(deletions, 10) || 0,
    });
  }
  return commits;
}

// ── Phase B: cluster commits + per-commit file list ──────────────────
function getCommitFiles(sha) {
  try {
    const raw = execSync(
      `git -C "${ROOT}" show --name-only --pretty=format: "${sha}"`,
      { encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 }
    );
    return raw.split('\n').filter(Boolean);
  } catch { return []; }
}

const AREA_RULES = [
  { match: /^scripts\/build-dashboard\.mjs$|^dashboard-server\.mjs$|^dashboard\//, area: 'dashboard-ux' },
  { match: /^scripts\/agents\//,                                                    area: 'agents' },
  { match: /^lib\//,                                                                area: 'libraries' },
  { match: /^scripts\/launchd\//,                                                   area: 'infrastructure' },
  { match: /-postmortem-|-self-review-|-resolution-/,                               area: 'postmortems' },
  { match: /^AGENTS\.md$|^CLAUDE\.md$|^README|^docs\//,                             area: 'documentation' },
  { match: /\.test\.mjs$/,                                                          area: 'tests' },
  { match: /^triage\.mjs$|^scan\.mjs$|^batch-runner|^providers\//,                  area: 'pipeline' },
  { match: /^scripts\/(?!agents|launchd)/,                                          area: 'scripts' },
  { match: /^data\//,                                                               area: 'data-corpus' },
];

function classifyArea(file) {
  for (const r of AREA_RULES) if (r.match.test(file)) return r.area;
  return 'other';
}

function clusterByArea(commits) {
  const areas = {};
  for (const c of commits) {
    const files = getCommitFiles(c.sha);
    c.files = files;
    const areaCounts = {};
    for (const f of files) {
      const a = classifyArea(f);
      areaCounts[a] = (areaCounts[a] || 0) + 1;
    }
    // primary area = most-touched
    const primary = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
    c.primary_area = primary;
    c.area_counts = areaCounts;
    if (!areas[primary]) areas[primary] = [];
    areas[primary].push(c);
  }
  return areas;
}

// ── Phase C: extract skills, APIs, bug-classes (lexical pass, no LLM) ─
const API_HINTS = {
  'anthropic':       /\bclaude\b|\banthropic\b|\bsonnet\b|\bopus\b|\bhaiku\b|\bbatches\s*api\b/i,
  'gptzero':         /\bgptzero\b/i,
  'originality':     /\boriginality(?:\.ai)?\b/i,
  'pangram':         /\bpangram\b/i,
  'openai':          /\bopenai\b|\bgpt-5\b/i,
  'gemini':          /\bgemini\b/i,
  'grok':            /\bgrok\b/i,
  'perplexity':      /\bperplexity\b|\bsonar\b/i,
  'hunter':          /\bhunter(?:\.io)?\b/i,
  'apollo':          /\bapollo(?:\.io)?\b/i,
  'greenhouse':      /\bgreenhouse\b/i,
  'ashby':           /\bashby\b/i,
  'lever':           /\blever\.co\b|\blever\s+api\b/i,
  'workable':        /\bworkable\b/i,
  'cloudflare':      /\bcloudflare\b|\bcf\s+access\b|\bcloudflare\s+tunnel\b/i,
  'launchd':         /\blaunchd\b|\blaunchctl\b|\bplist\b/i,
  'typst':           /\btypst\b/i,
  'playwright':      /\bplaywright\b/i,
  'mcp':             /\bMCP\b|model\s+context\s+protocol/i,
  'github-actions':  /\bGitHub\s+Actions\b|\.github\/workflows/i,
  'assemblyai':      /\bassemblyai\b/i,
  'descript':        /\bdescript\b/i,
  'notion':          /\bnotion(?:\.so)?\b|notion[- ]?api/i,
  'telegram':        /\btelegram\b|telegram[- ]?bot/i,
  'gmail':           /\bgmail\b|gmail[- ]?app[- ]?password|smtp\.gmail/i,
};

const SKILL_HINTS = {
  'drain-loop':                 /drain[- ]?loop|drain\s+all|while\s+queue\s+.*>\s*0/i,
  'dedup-on-append':            /dedup[- ]?on[- ]?append|append.*dedup|dedup.*queue/i,
  'bug-class-lint':             /lint[- ]?built|lint.*html|outer[- ]?template[- ]?unescape/i,
  'postmortem-driven-fix':      /postmortem|self[- ]?review|gap\s+\d|root\s*cause/i,
  'cohesion-fix':               /cohesion|honest\s+count|reconcile/i,
  'cost-tracking':              /cost[- ]?tracking|cost[- ]?trace|onCostRecord/i,
  'cap-enforcement':            /cap[- ]?enforcement|per[- ]?run\s+cap|monthly\s+budget/i,
  'fail-secure':                /fail[- ]?secure|fail[- ]?open|saltzer/i,
  'persistent-progress-bar':    /persistent\s+progress|restoreActiveJob|active[- ]?job\s+endpoint/i,
  'tier-routing':               /tier[- ]?5|tier[- ]?route|--tier=/i,
  'detector-calibration':       /calibrat|detector[- ]?health|signal[- ]?quality|FPR/i,
  'voice-corpus':               /voice[- ]?corpus|voice[- ]?fidelity|human[- ]?examples/i,
  'apply-pack-polish':          /apply[- ]?pack[- ]?polish|polish[- ]?loop|polish[- ]?signals|polish[- ]?coherence/i,
  'council-orchestration':      /council[- ]?of[- ]?models|dealbreaker|multi[- ]?llm/i,
  'network-database':           /network[- ]?database|warm[- ]?intro|2nd[- ]?degree/i,
  'workflow-restructure':       /workflow.*restructure|row[- ]?action|primary.*secondary.*tertiary/i,
  'instrumentation-first':      /pre[- ]?build\s+(?:gate|check|hook)|build[- ]?time\s+gate|post[- ]?build\s+(?:sanity|gate)/i,
};

const BUG_CLASS_HINTS = {
  'outer-template-unescape':    /outer[- ]?template[- ]?unescape|String\.fromCharCode\(1[03]\)|backslash[- ]?n[- ]?in[- ]?template/i,
  'duplicate-bloat':            /duplicate[- ]?bloat|dedup.*triage|5x|append.*duplicate/i,
  'cr-accumulation':            /\\\\r[- ]?accumulation|carriage[- ]?return\s+accumulation/i,
  'silent-no-op':               /silent\s+no[- ]?op|0\s+true[- ]?positive|fail[- ]?open\s+inversion/i,
  'limit-cap-leakage':          /LIMIT\s*=\s*100|limit[- ]?cap|drain\s+limit/i,
  'phantom-cta':                /phantom\s+CTA|fictional\s+(?:assurance|button)/i,
  'pipeline-not-drained':       /not\s+drained|never\s+drained|drain[- ]?to[- ]?0\s+fictional/i,
  'frontmatter-cloak':          /frontmatter[- ]?cloak|extractProseText/i,
  'cache-poisoning':            /cache[- ]?poisoning|degraded\s+cache|_degraded:\s*true/i,
  'hardcoded-date':             /hardcoded[- ]?date|Today\s+is\s+202\d/i,
};

const PM_SIGNAL_HINTS = {
  'postmortem-then-fix':        /postmortem.*fix|fix.*postmortem|gap[- ]?\d.*fix/i,
  'instrumentation-first':      /lint|guard|sanity[- ]?check|pre[- ]?push\s+hook|post[- ]?build\s+gate/i,
  'cohesion-driven-ux':         /cohesion|honest\s+count|reconcile.*surface/i,
  'cost-discipline':            /cost[- ]?cap|budget|spend[- ]?ceiling|\$\d+\s*\/\s*run/i,
  'reversible-changes':         /archive[- ]?pre|reversible|--dry-run/i,
  'audit-trail-design':         /audit[- ]?trail|reversible|archive.*pre[- ]?dedup/i,
  'failure-mode-doc':           /failure[- ]?mode|known[- ]?gap|NEEDS_HUMAN/i,
  'observability':              /\/api\/.*active[- ]?job|persistent\s+progress|surface.*across\s+session/i,
};

function lexicalTagCommit(commit) {
  const text = commit.subject + ' ' + (commit.files || []).join(' ');
  const tags = { apis: [], skills: [], bug_classes: [], pm_signals: [] };
  for (const [api, re] of Object.entries(API_HINTS))             if (re.test(text)) tags.apis.push(api);
  for (const [skill, re] of Object.entries(SKILL_HINTS))         if (re.test(text)) tags.skills.push(skill);
  for (const [bc, re] of Object.entries(BUG_CLASS_HINTS))        if (re.test(text)) tags.bug_classes.push(bc);
  for (const [sig, re] of Object.entries(PM_SIGNAL_HINTS))       if (re.test(text)) tags.pm_signals.push(sig);
  return tags;
}

// ── Phase D: optional LLM tagging pass (Sonnet) ──────────────────────
async function llmTagCluster(clusterCommits) {
  if (!DO_LLM_TAG) return null;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[builder-log] ANTHROPIC_API_KEY not set — skipping LLM tagging');
    return null;
  }
  // Cache key: hash of all SHAs in the cluster
  const key = clusterCommits.map(c => c.sha).sort().join(',');
  let cache = {};
  if (existsSync(TAGGING_CACHE)) {
    try { cache = JSON.parse(readFileSync(TAGGING_CACHE, 'utf-8')); } catch {}
  }
  if (cache[key]) return cache[key];
  const summary = clusterCommits.slice(0, 30).map(c => `${c.sha.slice(0, 7)} ${c.subject}`).join('\n');
  const prompt = `You are analyzing commits from Mitchell's career-ops repo. He is building toward a PM role.

Extract from these commits:
- skills: programming patterns or architectural concepts demonstrated (e.g. "drain-loop architecture", "fail-secure default", "instrumentation-first")
- apis: external APIs/SDKs/services touched (e.g. "Anthropic Batches API", "Pangram")
- bug_classes: bug categories identified/fixed (e.g. "outer-template-unescape", "dedup-on-append")
- pm_signals: PM-relevant behaviors (e.g. "postmortem-then-fix", "cohesion-driven-UX", "cost-discipline", "audit-trail-design")

Use SHORT kebab-case labels. Aim for 3-8 items per category. Avoid duplicates.

Output STRICT JSON (no markdown, no commentary):
{
  "skills": [],
  "apis": [],
  "bug_classes": [],
  "pm_signals": []
}

Commits:
${summary}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) { console.error('[builder-log] llm-tag HTTP', res.status); return null; }
    const data = await res.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) { console.error('[builder-log] llm-tag no JSON in response'); return null; }
    const tags = JSON.parse(m[0]);
    cache[key] = tags;
    try {
      if (!existsSync(dirname(TAGGING_CACHE))) mkdirSync(dirname(TAGGING_CACHE), { recursive: true });
      writeFileSync(TAGGING_CACHE, JSON.stringify(cache, null, 2));
    } catch {}
    return tags;
  } catch (err) {
    console.error('[builder-log] llm-tag error:', err.message);
    return null;
  }
}

// ── Phase E: compute build streak + cumulative stats ─────────────────
function computeStreak(commits) {
  if (!commits.length) return 0;
  const dates = [...new Set(commits.map(c => c.date))].sort().reverse();
  let streak = 1;
  for (let i = 0; i < dates.length - 1; i++) {
    const d1 = new Date(dates[i]);
    const d2 = new Date(dates[i + 1]);
    const diff = (d1 - d2) / (24 * 60 * 60 * 1000);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function loadCumulative() {
  if (!existsSync(CUMULATIVE_JSON)) return { skills: {}, apis: {}, bug_classes: {}, pm_signals: {}, history: [] };
  try { return JSON.parse(readFileSync(CUMULATIVE_JSON, 'utf-8')); }
  catch { return { skills: {}, apis: {}, bug_classes: {}, pm_signals: {}, history: [] }; }
}

function mergeCumulative(cum, newTags, firstDate) {
  for (const cat of ['skills', 'apis', 'bug_classes', 'pm_signals']) {
    for (const tag of (newTags[cat] || [])) {
      if (!cum[cat][tag]) cum[cat][tag] = { first_seen: firstDate, count: 0 };
      cum[cat][tag].count += 1;
      // Don't overwrite first_seen if already present.
    }
  }
}

// ── Phase F: render markdown digest ──────────────────────────────────
function renderMd(commits, areas, agg, cum, streak) {
  const lines = [];
  lines.push(`# Builder Evolution — ${commits.length} commits in last ${SINCE}`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Repo:** career-ops · **Branch:** main`);
  lines.push(`**Build streak:** ${streak} consecutive day${streak === 1 ? '' : 's'} with at least one commit`);
  lines.push('');

  // Top stats
  lines.push('## Headline');
  lines.push('');
  const totalInsert = commits.reduce((s, c) => s + c.insertions, 0);
  const totalDelete = commits.reduce((s, c) => s + c.deletions, 0);
  const uniqueDays = new Set(commits.map(c => c.date)).size;
  lines.push(`- **${commits.length}** commits across **${uniqueDays}** active day${uniqueDays === 1 ? '' : 's'}`);
  lines.push(`- **+${totalInsert.toLocaleString()} / −${totalDelete.toLocaleString()}** lines`);
  lines.push(`- **${Object.keys(areas).length}** distinct areas touched`);
  lines.push('');

  // APIs / tools
  const apiList = Object.entries(agg.apis).sort((a, b) => b[1] - a[1]);
  if (apiList.length) {
    lines.push('## APIs / tools / services touched');
    lines.push('');
    for (const [api, n] of apiList) {
      const cumEntry = cum.apis[api];
      const firstSeen = cumEntry?.first_seen || 'this window';
      lines.push(`- **${api}** — ${n} commit${n === 1 ? '' : 's'} this window (first seen: ${firstSeen})`);
    }
    lines.push('');
  }

  // Skills
  const skillList = Object.entries(agg.skills).sort((a, b) => b[1] - a[1]);
  if (skillList.length) {
    lines.push('## Skills demonstrated');
    lines.push('');
    for (const [skill, n] of skillList) {
      const cumEntry = cum.skills[skill];
      const firstSeen = cumEntry?.first_seen || 'this window';
      lines.push(`- **${skill}** — ${n} commit${n === 1 ? '' : 's'} this window (first demonstrated: ${firstSeen})`);
    }
    lines.push('');
  }

  // Bug classes
  const bcList = Object.entries(agg.bug_classes).sort((a, b) => b[1] - a[1]);
  if (bcList.length) {
    lines.push('## Bug classes identified / fixed');
    lines.push('');
    for (const [bc, n] of bcList) {
      const cumEntry = cum.bug_classes[bc];
      const firstSeen = cumEntry?.first_seen || 'this window';
      lines.push(`- **${bc}** — ${n} commit${n === 1 ? '' : 's'} (first surfaced: ${firstSeen})`);
    }
    lines.push('');
  }

  // PM signals
  const pmList = Object.entries(agg.pm_signals).sort((a, b) => b[1] - a[1]);
  if (pmList.length) {
    lines.push('## PM-relevant signals');
    lines.push('');
    for (const [sig, n] of pmList) {
      lines.push(`- **${sig}** — ${n} commit${n === 1 ? '' : 's'} this window`);
    }
    lines.push('');
  }

  // By area
  lines.push('## Commits by area');
  lines.push('');
  const areaList = Object.entries(areas).sort((a, b) => b[1].length - a[1].length);
  for (const [area, areaCommits] of areaList) {
    lines.push(`### ${area} (${areaCommits.length})`);
    lines.push('');
    for (const c of areaCommits.slice(0, 8)) {
      lines.push(`- \`${c.sha.slice(0, 7)}\` ${c.subject.slice(0, 140)}`);
    }
    if (areaCommits.length > 8) {
      lines.push(`- _(+${areaCommits.length - 8} more)_`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Phase G: resume-bullet export ────────────────────────────────────
function renderResumeBullets(agg, cum, commits) {
  const lines = [];
  lines.push('# Resume Bullets — career-ops builder evolution');
  lines.push('');
  lines.push(`_Auto-generated by scripts/agents/builder-log.mjs on ${new Date().toISOString().slice(0, 10)}_`);
  lines.push('');

  lines.push('## Top achievements (last 30 days)');
  lines.push('');
  const skillList = Object.entries(agg.skills).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const bcList = Object.entries(agg.bug_classes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const apiList = Object.entries(agg.apis).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (apiList.length) {
    lines.push('### Integrated / wired up');
    lines.push('');
    for (const [api, n] of apiList) {
      lines.push(`- Wired ${api} into the career-ops pipeline (${n} commits)`);
    }
    lines.push('');
  }

  if (skillList.length) {
    lines.push('### Patterns demonstrated');
    lines.push('');
    for (const [skill, n] of skillList) {
      lines.push(`- ${skill} pattern shipped (${n} commits)`);
    }
    lines.push('');
  }

  if (bcList.length) {
    lines.push('### Bug classes identified + sealed with lints');
    lines.push('');
    for (const [bc, n] of bcList) {
      lines.push(`- Identified the ${bc} bug class; shipped fix + regression guard (${n} commits)`);
    }
    lines.push('');
  }

  lines.push('## Cumulative inventory (all-time)');
  lines.push('');
  lines.push(`- **APIs/services touched:** ${Object.keys(cum.apis).length}`);
  lines.push(`- **Distinct skills demonstrated:** ${Object.keys(cum.skills).length}`);
  lines.push(`- **Bug classes identified:** ${Object.keys(cum.bug_classes).length}`);
  lines.push(`- **PM-signal categories triggered:** ${Object.keys(cum.pm_signals).length}`);
  lines.push('');

  lines.push('_Note: these are lexically extracted from commit messages + file paths. Best used as a draft you tighten with the actual impact metrics from your eval reports._');
  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.error(`[builder-log] walking git log since "${sinceArg(SINCE)}"...`);
  const commits = walkGitLog(SINCE);
  console.error(`[builder-log] found ${commits.length} commits`);
  if (!commits.length) {
    console.error('[builder-log] nothing to log — exit clean');
    return;
  }
  console.error(`[builder-log] clustering by area + extracting per-commit files...`);
  const areas = clusterByArea(commits);
  console.error(`[builder-log] ${Object.keys(areas).length} areas`);

  // Per-commit tags + aggregates
  const agg = { apis: {}, skills: {}, bug_classes: {}, pm_signals: {} };
  for (const c of commits) {
    c.tags = lexicalTagCommit(c);
    for (const cat of ['apis', 'skills', 'bug_classes', 'pm_signals']) {
      for (const tag of c.tags[cat]) agg[cat][tag] = (agg[cat][tag] || 0) + 1;
    }
  }

  // Optional LLM tagging pass — supplement the lexical extraction
  if (DO_LLM_TAG) {
    console.error('[builder-log] running LLM tagging pass...');
    // Pass entire commit list as one cluster — Sonnet handles ~30 commits well
    const llmTags = await llmTagCluster(commits);
    if (llmTags) {
      for (const cat of ['apis', 'skills', 'bug_classes', 'pm_signals']) {
        for (const tag of (llmTags[cat] || [])) {
          // LLM tags get weight 1 (lexical wins on volume)
          agg[cat][tag] = (agg[cat][tag] || 0) + 1;
        }
      }
      console.error('[builder-log] llm-tag merged');
    }
  } else {
    console.error('[builder-log] llm-tag SKIPPED (--no-llm-tag)');
  }

  // Build streak + cumulative
  const streak = computeStreak(commits);
  const cum = loadCumulative();
  const firstDate = commits[commits.length - 1]?.date || TODAY;
  mergeCumulative(cum, {
    apis: Object.keys(agg.apis),
    skills: Object.keys(agg.skills),
    bug_classes: Object.keys(agg.bug_classes),
    pm_signals: Object.keys(agg.pm_signals),
  }, firstDate);
  cum.history = cum.history || [];
  cum.history.push({
    generated_at: new Date().toISOString(),
    since: sinceArg(SINCE),
    commits: commits.length,
    streak,
    top_skills: Object.entries(agg.skills).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ skill: k, n })),
    top_apis: Object.entries(agg.apis).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ api: k, n })),
    top_bug_classes: Object.entries(agg.bug_classes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ bug_class: k, n })),
  });
  cum.history = cum.history.slice(-90);  // bound to last 90 entries

  // Render outputs
  const md = renderMd(commits, areas, agg, cum, streak);

  if (DRY_RUN) {
    console.log(md);
    console.error('');
    console.error('[builder-log] DRY-RUN — no files written');
    return;
  }

  if (!existsSync(dirname(CUMULATIVE_JSON))) mkdirSync(dirname(CUMULATIVE_JSON), { recursive: true });
  writeFileSync(CUMULATIVE_JSON, JSON.stringify(cum, null, 2));
  writeFileSync(ROLLING_MD, md);
  writeFileSync(DAILY_MD, md);
  console.error(`[builder-log] wrote ${ROLLING_MD}`);
  console.error(`[builder-log] wrote ${DAILY_MD}`);
  console.error(`[builder-log] updated ${CUMULATIVE_JSON}`);

  if (EXPORT_RESUME) {
    const resumeMd = renderResumeBullets(agg, cum, commits);
    writeFileSync(RESUME_PATH, resumeMd);
    console.error(`[builder-log] wrote ${RESUME_PATH}`);
  }

  console.error('');
  console.error(`[builder-log] SUMMARY`);
  console.error(`  commits:      ${commits.length}`);
  console.error(`  streak:       ${streak}d`);
  console.error(`  apis:         ${Object.keys(agg.apis).length} this window · ${Object.keys(cum.apis).length} cumulative`);
  console.error(`  skills:       ${Object.keys(agg.skills).length} this window · ${Object.keys(cum.skills).length} cumulative`);
  console.error(`  bug_classes:  ${Object.keys(agg.bug_classes).length} this window · ${Object.keys(cum.bug_classes).length} cumulative`);
  console.error(`  pm_signals:   ${Object.keys(agg.pm_signals).length} this window · ${Object.keys(cum.pm_signals).length} cumulative`);
}

main().catch(err => { console.error('[builder-log] FATAL:', err); process.exit(1); });
