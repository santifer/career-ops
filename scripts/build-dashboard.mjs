#!/usr/bin/env node

/**
 * build-dashboard.mjs — single-file HTML dashboard generator
 *
 * Reads applications.md, reports/*.md, pipeline.md, scan-history.tsv,
 * portals.yml, and produces dashboard/index.html — a self-contained
 * browser dashboard with sortable tables, filters, and expand-on-click
 * detail rows. Open with: `open dashboard/index.html`
 *
 * Designed to be run after every batch + merge so the page stays
 * fresh. Wire into scripts/scan-unattended.mjs or run manually.
 *
 * Usage:
 *   node scripts/build-dashboard.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import yaml from 'js-yaml';
import { marked } from 'marked';
const parseYaml = yaml.load;

const ROOT = process.cwd();
const APPLICATIONS_PATH = join(ROOT, 'data/applications.md');
const PIPELINE_PATH = join(ROOT, 'data/pipeline.md');
const SCAN_HISTORY_PATH = join(ROOT, 'data/scan-history.tsv');
const BATCH_STATE_PATH = join(ROOT, 'batch/batch-state.tsv');
const PORTALS_PATH = join(ROOT, 'portals.yml');
const REPORTS_DIR = join(ROOT, 'reports');
const HEARTBEAT_GLOB = (date) => join(ROOT, `data/heartbeat-${date}.md`);
const OUT_PATH = join(ROOT, 'dashboard/index.html');

// ── Data extraction ───────────────────────────────────────────────

function parseApplications() {
  if (!existsSync(APPLICATIONS_PATH)) return [];
  const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line.split('|').map(c => c.trim());
    const num = parseInt(cells[1], 10);
    const date = cells[2];
    const company = cells[3];
    const role = cells[4];
    const scoreStr = cells[5] || '';
    const status = cells[6] || '';
    const pdf = cells[7] || '';
    const reportCell = cells[8] || '';
    const notes = cells[9] || '';
    const scoreMatch = scoreStr.match(/(\d+(?:\.\d+)?)/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    const reportPathMatch = reportCell.match(/\(([^)]+)\)/);
    const reportPath = reportPathMatch ? reportPathMatch[1] : '';
    rows.push({ num, date, company, role, score, status, pdf, reportPath, notes });
  }
  return rows;
}

function getReportUrl(reportPath) {
  if (!reportPath) return '';
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return '';
  const text = readFileSync(fullPath, 'utf-8').slice(0, 3000);
  const m = text.match(/\*\*URL:\*\*\s*(\S+)/);
  return m ? m[1] : '';
}

function getReportArchetype(reportPath) {
  if (!reportPath) return '';
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return '';
  const text = readFileSync(fullPath, 'utf-8').slice(0, 4000);
  // Format 1: **Archetype:** A1/A2/B ... (header block)
  const bold = text.match(/\*\*Archetype:\*\*\s*([^\n]+)/);
  // Format 2: | Archetype | A1/A2/B ... | (Block A table row)
  const table = text.match(/\|\s*Archetype\s*\|\s*([^|\n]+?)\s*\|/);
  const raw = (bold?.[1] || table?.[1] || '').replace(/\*\*/g, '');
  if (!raw) return '';
  const tierMatch = raw.match(/\b(A1|A2|B)\b/);
  return tierMatch ? tierMatch[1] : raw.slice(0, 30);
}

function getReportFinalRecommendation(reportPath) {
  if (!reportPath) return '';
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return '';
  const text = readFileSync(fullPath, 'utf-8');
  const finalIdx = text.indexOf('## Final Recommendation');
  const recIdx = text.indexOf('## Recommendation');
  let idx = -1, headerLen = 0;
  if (finalIdx !== -1) { idx = finalIdx; headerLen = '## Final Recommendation'.length; }
  else if (recIdx !== -1) { idx = recIdx; headerLen = '## Recommendation'.length; }
  if (idx === -1) return '';
  const after = text.slice(idx + headerLen);
  const next = after.indexOf('\n## ');
  const section = next === -1 ? after : after.slice(0, next);
  // First two paragraphs — enough for context without overflow
  const paragraphs = section.trim().split('\n\n').filter(p => p.trim());
  const combined = paragraphs.slice(0, 2).join(' ').replace(/\*\*/g, '').replace(/\n/g, ' ').trim();
  return combined.slice(0, 600);
}

// Render a single report's markdown to a self-contained HTML page that
// opens in the browser with the formatting already applied. Output lands
// in dashboard/reports/{slug}.html so the dashboard can link to it
// directly (no Cursor required, no key-shortcut needed).
function renderReportToHtml(reportPath, outputDir) {
  if (!reportPath) return null;
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return null;
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const md = readFileSync(fullPath, 'utf-8');
  marked.setOptions({ gfm: true, breaks: false });

  // Pull the title from the first H1 if present
  const title = (md.match(/^#\s+(.+)/) || [])[1] || basename(reportPath, '.md');

  // Split the markdown into: title, header-metadata block, body. The
  // header is the run of `**Key:** value` lines between the H1 and the
  // first `---` or first `## ` section heading. We extract those into a
  // structured info-card and remove them from the body before marked
  // renders it (so they don't render as a wall-of-text paragraph).
  const lines = md.split('\n');
  let bodyStart = 0;
  let h1Idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (h1Idx === -1 && lines[i].match(/^#\s+/)) { h1Idx = i; continue; }
    if (h1Idx >= 0 && (lines[i].trim() === '---' || lines[i].match(/^##\s/))) {
      bodyStart = i;
      break;
    }
  }
  if (bodyStart === 0) bodyStart = h1Idx + 1;

  const headerLines = lines.slice(h1Idx + 1, bodyStart);
  const bodyLines = lines.slice(bodyStart);

  // Parse `**Key:** value` pairs. A value may run over multiple lines,
  // so we accumulate until the next `**Key:**` line or blank line.
  const meta = [];
  let current = null;
  for (const line of headerLines) {
    const m = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    if (m) {
      if (current) meta.push(current);
      current = { key: m[1].trim(), value: m[2].trim() };
    } else if (current && line.trim()) {
      current.value += ' ' + line.trim();
    }
  }
  if (current) meta.push(current);

  // Render the body (post-header) with marked
  const body = marked.parse(bodyLines.join('\n'));

  // Build the structured header card. Score gets a colored badge.
  const metaCard = meta.length === 0 ? '' : `
<div class="meta-card">
  <table class="meta-table">
    ${meta.map(m => {
      let valHtml = escape(m.value);
      // Render URL value as a clickable link
      if (m.key.toLowerCase() === 'url' && /^https?:\/\//.test(m.value)) {
        valHtml = `<a href="${escape(m.value)}" target="_blank" rel="noopener">${escape(m.value)}</a>`;
      }
      // Score gets a green badge
      if (m.key.toLowerCase() === 'score') {
        const scoreNum = parseFloat((m.value.match(/(\d+(?:\.\d+)?)/) || [])[1] || 0);
        const cls = scoreNum >= 4.0 ? 'score-strong' : scoreNum >= 3.0 ? 'score-moderate' : 'score-weak';
        valHtml = `<span class="badge ${cls}" style="font-size:14px">${escape(m.value)}</span>`;
      }
      // Legitimacy gets color-coded
      if (m.key.toLowerCase() === 'legitimacy') {
        const v = m.value.toLowerCase();
        const cls = v.includes('high') ? 'score-strong' : v.includes('proceed') ? 'score-moderate' : 'score-weak';
        valHtml = `<span class="badge ${cls}">${escape(m.value)}</span>`;
      }
      return `<tr><th>${escape(m.key)}</th><td>${valHtml}</td></tr>`;
    }).join('\n    ')}
  </table>
</div>`;

  const inner = metaCard + body;

  const wrapped = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(title)} · Career-Ops</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    color: #1f2328; background: #f6f8fa; max-width: 920px;
    margin: 24px auto; padding: 24px 32px; line-height: 1.6; font-size: 15px;
  }
  h1 { font-size: 28px; margin: 0 0 12px; padding-bottom: 10px; border-bottom: 2px solid #d0d7de; color: #1a7f37; }
  h2 { font-size: 22px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #d0d7de; }
  h3 { font-size: 17px; margin: 18px 0 8px; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
  th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #d0d7de; background: #fff; font-weight: 600; }
  td { padding: 10px 12px; border-bottom: 1px solid #eaeef2; vertical-align: top; }
  tr:nth-child(odd) td { background: #fcfcfd; }
  blockquote { margin: 14px 0; padding: 12px 18px; border-left: 4px solid #2da44e; background: #fff; color: #24292f; border-radius: 4px; }
  code { background: #fff; padding: 2px 6px; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; border: 1px solid #d0d7de; }
  pre { background: #fff; padding: 14px; border-radius: 6px; overflow-x: auto; border: 1px solid #d0d7de; }
  pre code { background: transparent; padding: 0; border: none; }
  a { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { padding-left: 24px; }
  li { margin: 4px 0; }
  hr { border: 0; border-top: 1px solid #d0d7de; margin: 24px 0; }
  strong { color: #1f2328; }
  .nav-back { font-size: 13px; color: #57606a; }
  .nav-back a { color: #0969da; }
  .meta-card { background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 8px 14px; margin: 14px 0 24px; }
  .meta-table { width: 100%; margin: 0; font-size: 14px; }
  .meta-table th { text-align: left; padding: 8px 14px 8px 0; vertical-align: top; font-weight: 600; color: #57606a; width: 140px; border-bottom: 1px solid #eaeef2; background: transparent; white-space: nowrap; }
  .meta-table td { padding: 8px 0; vertical-align: top; border-bottom: 1px solid #eaeef2; background: transparent; }
  .meta-table tr:last-child th, .meta-table tr:last-child td { border-bottom: none; }
  .meta-table .badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; }
  .meta-table .score-strong { background: #dafbe1; color: #1a7f37; }
  .meta-table .score-moderate { background: #fff8c5; color: #9a6700; }
  .meta-table .score-weak { background: #eaeef2; color: #57606a; }
</style>
</head>
<body>
<div class="nav-back"><a href="../index.html">← Back to dashboard</a></div>
${inner}
<hr>
<div class="nav-back"><a href="../index.html">← Back to dashboard</a> · <a href="file://${ROOT}/${reportPath}">Open raw markdown in Cursor</a></div>
</body>
</html>`;

  const outName = basename(reportPath).replace(/\.md$/, '.html');
  const outPath = join(outputDir, outName);
  writeFileSync(outPath, wrapped);
  return outName;
}

// Helper — extract a section block from a report by its `## ` header.
// Accepts an array of regexes tried in order — first match wins.
// Handles both old format (## A) Role Summary) and new (## Block A — Role Summary).
function getSection(reportPath, headerRe) {
  if (!reportPath) return '';
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return '';
  const text = readFileSync(fullPath, 'utf-8');
  const patterns = Array.isArray(headerRe) ? headerRe : [headerRe];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const endIdx = rest.indexOf('\n## ');
    return endIdx === -1 ? rest : rest.slice(0, endIdx);
  }
  return '';
}

// Extract the TL;DR from Block A — typically the last row of the role
// summary table. Falls back to the full Block A if no TL;DR row found.
function getTldr(reportPath) {
  const block = getSection(reportPath, [/^## A\)[^\n]*$/m, /^## Block A\b[^\n]*$/m]);
  if (!block) return '';
  // Look for "| TL;DR | <value> |" in the table
  const tldrMatch = block.match(/\|\s*TL;DR\s*\|\s*([^\n]+?)\s*\|\s*$/m);
  if (tldrMatch) {
    return tldrMatch[1].replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 800);
  }
  return '';
}

// Extract positioning angle from Block C.
function getPositioning(reportPath) {
  const block = getSection(reportPath, [/^## C\)[^\n]*$/m, /^## Block C\b[^\n]*$/m]);
  if (!block) return '';
  // New format: "- **Positioning:** <prose>" bullet
  const bulletMatch = block.match(/\*\*Positioning:\*\*\s*([^\n]{30,})/);
  if (bulletMatch) return bulletMatch[1].replace(/\*\*/g, '').trim().slice(0, 600);
  // Old format: "Sell senior without overstatement" subsection
  const sellMatch = block.match(/\*\*Sell\s+(?:senior|the)[^\n]*\*\*[\s\S]*?(?=\n\n|\*\*If)/i);
  if (sellMatch) return sellMatch[0].replace(/\*\*/g, '').slice(0, 600).trim();
  // Fallback: first non-empty lines
  return block.trim().split('\n').filter(l => l.trim()).slice(0, 4).join(' ').slice(0, 500);
}

// Extract comp from Block A table.
function getComp(reportPath) {
  const block = getSection(reportPath, [/^## A\)[^\n]*$/m, /^## Block A\b[^\n]*$/m]);
  if (!block) return '';
  const m = block.match(/\|\s*Comp(?:ensation)?\s*\|\s*([^|\n]+?)\s*\|/im);
  return m ? m[1].replace(/\*\*/g, '').trim().slice(0, 120) : '';
}

// Extract numbered key gaps from Block B — returns { title, detail } objects.
function getKeyGaps(reportPath) {
  const block = getSection(reportPath, [/^## B\)[^\n]*$/m, /^## Block B\b[^\n]*$/m]);
  if (!block) return [];
  const gapsSection = block.match(/\*\*Key gaps[^*]*\*\*[:\s]*\n([\s\S]*?)(?:\n\*\*Why|\n## |$)/i);
  if (!gapsSection) return [];
  return gapsSection[1]
    .split('\n')
    .filter(l => /^\d+\.\s/.test(l.trim()))
    .map(l => {
      const withoutNum = l.replace(/^\d+\.\s*/, '').trim();
      const titleMatch = withoutNum.match(/\*\*([^*]+)\*\*/);
      const title = (titleMatch ? titleMatch[1] : withoutNum.split('—')[0]).replace(/\*\*/g, '').trim();
      const dashIdx = withoutNum.indexOf('—');
      const detail = dashIdx > -1
        ? withoutNum.slice(dashIdx + 1).replace(/\*\*/g, '').trim().slice(0, 500)
        : '';
      return { title, detail };
    })
    .filter(g => g.title)
    .slice(0, 4);
}

// "Why these gaps don't block" from Block B.
function getWhyGapsDontBlock(reportPath) {
  const block = getSection(reportPath, [/^## B\)[^\n]*$/m, /^## Block B\b[^\n]*$/m]);
  if (!block) return '';
  const m = block.match(/\*\*Why these gaps don[''']t block[^*]*\*\*[:\s]*([^\n]+(?:\n(?!\*\*|\n).*)*)/i);
  return m ? m[1].replace(/\*\*/g, '').trim().slice(0, 600) : '';
}

// Per-gap strategies from Block C — matches by keyword from gap title.
function getGapStrategy(reportPath, gapTitle) {
  const block = getSection(reportPath, [/^## C\)[^\n]*$/m, /^## Block C\b[^\n]*$/m]);
  if (!block) return '';
  // Look for "**<keyword> gap handling:**" or "**<keyword> gap:**" bullets
  const keyword = gapTitle.split(/\s+/)[0].replace(/[^a-z0-9]/gi, '');
  const re = new RegExp(`\\*\\*[^*]*${keyword}[^*]*(?:gap|handling)[^*]*\\*\\*[:\\s]*([^\\n]+)`, 'i');
  const m = block.match(re);
  return m ? m[1].replace(/\*\*/g, '').trim().slice(0, 600) : '';
}

// Extract top-2 STAR+R stories from Block F. Each STAR table row has
// columns: # | JD Requirement | Story | S | T | A | R | Reflection.
// We surface the JD-requirement column + the story column.
function getTopStories(reportPath, limit = 2) {
  const block = getSection(reportPath, [/^## F\)[^\n]*$/m, /^## Block F\b[^\n]*$/m]);
  if (!block) return [];
  const stories = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;
    if (/^\|\s*#\s*\|\s*JD\s*Requirement/i.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    // Column 0=#, 1=JD Requirement, 2=Story (4+ col old format has STAR columns after)
    const num = cells[0];
    const requirement = cells[1];
    const story = cells[2];
    if (!num || !requirement || !story) continue;
    if (!/^\d/.test(num)) continue;  // skip non-numeric first cells
    stories.push({ num, requirement, story });
  }
  return stories.slice(0, limit);
}

// Extract Mitchell's competitive-edge signals from Block B (CV Match) of
// a report. Handles three formats observed in the field:
//   1. English numeric — "**5/5**", "**4/5**"
//   2. Spanish categorical — "✅ UNIQUELY STRONG", "✅ STRONG", "MEDIUM", "WEAK"
//   3. Prose evaluation — "**HARD BLOCKER**", "Gap across..." (skip — negative)
// Returns top N rows by strength regardless of overall report score, so
// every role shows context (low-fit roles surface their few partial matches
// for transparency rather than rendering "—").
function getCompetitiveEdge(reportPath, limit = 5) {
  if (!reportPath) return [];
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return [];
  const text = readFileSync(fullPath, 'utf-8');
  const startMatch = text.match(/^## B\)[^\n]*$/m) || text.match(/^## Block B\b[^\n]*$/m);
  if (!startMatch) return [];
  const start = startMatch.index + startMatch[0].length;
  const rest = text.slice(start);
  const endIdx = rest.indexOf('\n## ');
  const block = endIdx === -1 ? rest : rest.slice(0, endIdx);

  const rows = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;                        // separator
    if (/^\|\s*(?:JD\s*Requirement|JD\s*requirement|Requisito|JD\s*Req)/i.test(line)) continue; // header
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    const requirement = cells[0].replace(/\*\*/g, '');
    const evidence = cells[1];
    const matchCell = cells[2];

    let score = null;
    let label = '';

    // Format 1: numeric "N/5"
    const numMatch = matchCell.match(/(\d+(?:\.\d+)?)\s*\/\s*5/);
    if (numMatch) {
      score = parseFloat(numMatch[1]);
    }
    // Format 2: English/Spanish categorical + new ✅/⚠️ emoji format
    else if (/Exceptional|UNIQUELY\s+STRONG/i.test(matchCell)) { score = 5; label = 'Exceptional'; }
    else if (/✅\s*STRONG|^\s*STRONG\b|\*\*STRONG\*\*/i.test(matchCell)) { score = 4; label = 'Strong'; }
    else if (/✅?\s*MEDIUM|MEDIUM\s*MATCH|MODERATE/i.test(matchCell)) { score = 3; label = 'Medium'; }
    else if (/Adjacent/i.test(matchCell) && /✅/.test(matchCell)) { score = 3; label = 'Adjacent'; }
    else if (/✅?\s*WEAK|WEAK\s*MATCH|PARTIAL/i.test(matchCell)) { score = 2; label = 'Weak'; }
    else if (/⚠️/.test(matchCell)) { score = 2; label = 'Partial'; }
    else if (/✅/.test(matchCell)) { score = 4; label = 'Strong'; }
    // Format 3: explicit negatives — skip (they aren't competitive edges)
    else if (/HARD\s*BLOCKER|GAP\s|MISSING|NO\s*MATCH|FAIL\b/i.test(matchCell)) {
      continue;
    } else {
      continue;
    }

    if (score === null || !requirement) continue;
    rows.push({ score, requirement, evidence, label });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, limit);
}

function countPipelinePending() {
  if (!existsSync(PIPELINE_PATH)) return 0;
  return readFileSync(PIPELINE_PATH, 'utf-8').split('\n').filter(l => l.startsWith('- [ ]')).length;
}

function countScanHistory() {
  if (!existsSync(SCAN_HISTORY_PATH)) return 0;
  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').filter(l => l.trim());
  return Math.max(0, lines.length - 1);
}

// Count distinct batch runs in batch-state.tsv using a 15-min gap heuristic on started_at.
// Mirrors the grouping logic in dashboard-server.mjs detailBatches().
function countBatchRuns() {
  if (!existsSync(BATCH_STATE_PATH)) return 0;
  const GAP_MS = 15 * 60 * 1000;
  const starts = readFileSync(BATCH_STATE_PATH, 'utf-8').split('\n')
    .filter(l => l.trim() && !l.startsWith('id'))
    .map(l => l.split('\t')[3])
    .filter(Boolean)
    .sort();
  let runs = 0, prev = 0;
  for (const s of starts) {
    const ts = new Date(s).getTime();
    if (!runs || (ts - prev) > GAP_MS) runs++;
    prev = ts;
  }
  return runs;
}

function getEnabledPortals() {
  if (!existsSync(PORTALS_PATH)) return { tracked: 0, queries: 0 };
  const cfg = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const tracked = (cfg.tracked_companies || []).filter(c => c.enabled !== false).length;
  const queries = (cfg.search_queries || []).filter(q => q.enabled !== false).length;
  return { tracked, queries };
}

function countTodaysReports(date) {
  if (!existsSync(REPORTS_DIR)) return 0;
  return readdirSync(REPORTS_DIR).filter(f => f.includes(date) && f.endsWith('.md')).length;
}

// ── Tier legend (from modes/_profile.md §1) ───────────────────────
// Single source of truth for tier badge tooltips and the legend modal.
// Sub-tier variants (A2-AB, A2-AE, A2-PgM, A2-SA) are rendered as A2
// in the table (regex strips), but listed in the legend for clarity.
const TIER_LEGEND = [
  {
    code: 'A1',
    name: 'Residency / Fellowship Programs',
    summary: 'Cohort-based programs explicitly for career pivoters; lower technical gate. +1.5x base score weight.',
    examples: 'Tarbell AI Journalism, IAPS AI Policy, Horizon, Berkman Klein, Apple AIML Residency, OpenAI Residency, Perplexity Research Residency.',
  },
  {
    code: 'A2',
    name: 'AI Solutions Architect / Agent Builder / Enablement / PgM',
    summary: 'Primary aspirational target. Scored at full weight; no portfolio gate.',
    examples: 'AI Solutions Architect (A2-SA), Forward Deployed Engineer, Applied AI Engineer, AI Enablement Lead (A2-AE), AI Program Manager (A2-PgM), AI Technical Program Manager, Agent Builder (A2-AB), Technical Deployment Lead.',
  },
  {
    code: 'B',
    name: 'Communications / Editorial at AI-native companies',
    summary: 'Pragmatic bridge. Must pass AI-nativity filter (core product is AI or AI is structural to roadmap).',
    examples: 'Developer Education Lead, Developer Advocate, Communications Lead/Manager, Engineering Editorial Lead, Technical Writer, Editorial Lead, Content Strategy Lead.',
  },
];
const TIER_BY_CODE = Object.fromEntries(TIER_LEGEND.map(t => [t.code, t]));
function tierTooltip(code) {
  const t = TIER_BY_CODE[code];
  if (!t) return '';
  return `${t.code} — ${t.name}. ${t.summary}`;
}

// ── HTML rendering ────────────────────────────────────────────────

const escape = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function scoreBadgeClass(score) {
  if (score >= 4.0) return 'score-strong';
  if (score >= 3.0) return 'score-moderate';
  return 'score-weak';
}

function evalAge(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return '0d';
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  const weeks = Math.round(days / 7);
  return `${weeks}w`;
}

function statusKey(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('applied')) return 'applied';
  if (s.includes('responded')) return 'responded';
  if (s.includes('interview')) return 'interview';
  if (s.includes('offer')) return 'offer';
  if (s.includes('reject')) return 'rejected';
  if (s.includes('discard')) return 'discarded';
  if (s.includes('skip')) return 'skip';
  return 'evaluated';
}

function statusBadgeClass(status) {
  const key = statusKey(status);
  if (key === 'skip') return 'status-discarded';
  if (key === 'responded') return 'status-evaluated';
  return `status-${key}`;
}

function renderRow(r, idx) {
  const archetype = getReportArchetype(r.reportPath);
  const url = getReportUrl(r.reportPath);
  const finalRec = getReportFinalRecommendation(r.reportPath);
  const edge = getCompetitiveEdge(r.reportPath);
  // Action cell: Report (rendered HTML in browser) + Apply (JD URL).
  // Both stop click propagation so clicking them doesn't toggle row expand.
  const reportHtmlLink = r.reportPath
    ? `<a href="reports/${basename(r.reportPath).replace(/\.md$/, '.html')}" target="_blank" onclick="event.stopPropagation()" title="Open formatted report in browser">Report</a>`
    : '';
  const applyLinkOnly = url
    ? `<a href="${escape(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Apply</a>`
    : '';
  const verifySlug = r.reportPath ? basename(r.reportPath) : '';
  const verifyBtn = verifySlug
    ? `<a href="javascript:void(0)" onclick="openVerify('${verifySlug}');event.stopPropagation()" style="color:#8250df" title="Verify claims + research queries">Verify</a>`
    : '';
  const applyLink = [reportHtmlLink, applyLinkOnly, verifyBtn].filter(Boolean).join(' · ') || '<span class="muted">—</span>';
  // Clickable report link — file:// URL opens the .md in the OS default
  // app (Cursor, after we set it via duti). Stop event propagation so
  // clicking the link doesn't toggle the row's expand state.
  const reportAbs = r.reportPath ? `file://${ROOT}/${r.reportPath}` : '';
  const reportPathDisplay = r.reportPath
    ? `<a href="${escape(reportAbs)}" onclick="event.stopPropagation()" title="Open in Cursor">${escape(r.reportPath)}</a>`
    : '<span class="muted">—</span>';

  // Pull richer signals for the expand panel.
  const tldr = getTldr(r.reportPath);
  const positioning = getPositioning(r.reportPath);
  const stories = getTopStories(r.reportPath, 3);
  const comp = getComp(r.reportPath);
  const gaps = getKeyGaps(r.reportPath);
  const whyOk = getWhyGapsDontBlock(r.reportPath);

  // Throttle row classes
  const throttleClass = r._throttle?.status === 'pickone' ? 'row-throttle-pickone'
    : r._throttle?.status === 'defer' ? 'row-throttle-defer'
    : r._throttle?.status === 'blocked' ? 'row-throttle-blocked'
    : '';

  // ── Meta chips ──────────────────────────────────────────
  const metaChips = [
    comp ? `<span class="meta-chip meta-chip-comp">💰 ${escape(comp)}</span>` : '',
    archetype ? `<span class="meta-chip meta-chip-tier">${escape(archetype)}</span>` : '',
    r.date ? `<span class="meta-chip">📅 ${escape(r.date)}</span>` : '',
  ].filter(Boolean).join('');

  // ── Intro: TL;DR + positioning (compact, full-width) ─────
  const tldrCard = tldr ? `<div class="dcard" style="margin-bottom:8px">
    <div class="dcard-label">Role at a glance</div>
    <div class="dcard-body">${escape(tldr)}</div>
  </div>` : '';

  const posCard = positioning ? `<div class="dcard" style="margin-bottom:8px">
    <div class="dcard-label">How to position</div>
    <div class="dcard-body">${escape(positioning).replace(/\n/g, '<br>')}</div>
  </div>` : '';

  // ── Card 1: Match (green / WHAT FITS) ────────────────────
  const matchCard = edge.length ? `<div class="dcard dcard--match">
    <div class="dcard-label">WHAT FITS</div>
    <ul class="match-list">
      ${edge.map(e => `<li class="${e.score >= 4 ? 'match-yes' : 'match-partial'}">
        <span class="match-icon">${e.score >= 4 ? '✓' : '~'}</span>
        <div>
          <div class="match-req">${escape(e.requirement.slice(0, 90))}</div>
          <div class="match-ev">${escape(e.evidence.slice(0, 160))}</div>
        </div>
      </li>`).join('')}
    </ul>
  </div>` : '';

  // ── Card 2: Gap (amber / WHAT'S MISSING) ─────────────────
  const gapCard = gaps.length ? `<div class="dcard dcard--gap">
    <div class="dcard-label">WHAT'S MISSING <span style="font-size:9px;font-weight:400;color:var(--text-4);margin-left:4px">click for strategy</span></div>
    <div class="dcard-gaps">${gaps.map(g => {
      const strategy = getGapStrategy(r.reportPath, g.title);
      const detailHtml = g.detail ? marked.parse(g.detail) : '';
      const strategyHtml = strategy ? marked.parse(strategy) : '';
      const whyHtml = whyOk ? marked.parse(whyOk) : '';
      return `<span class="gap-chip gap-chip-interactive"
        onclick="openGapModal(this);event.stopPropagation()"
        data-title="${escape(g.title)}"
        data-detail="${escape(detailHtml)}"
        data-strategy="${escape(strategyHtml)}"
        data-why="${escape(whyHtml)}"
        title="Click for addressing strategy">⚠ ${escape(g.title)}</span>`;
    }).join('')}</div>
    ${whyOk ? `<div class="dcard-gap-prose">${escape(whyOk).replace(/\n/g, '<br>')}</div>` : ''}
  </div>` : '';

  // ── Card 3: Story (purple / STORIES TO LEAD WITH) ────────
  const storyCard = stories.length ? `<div class="dcard dcard--story">
    <div class="dcard-label">STORIES TO LEAD WITH</div>
    ${stories.map((s, i) => `<div class="dcard-story-row">
      <span class="story-n">${i + 1}</span>
      <div>
        <div class="story-req">${escape(s.requirement.slice(0, 110))}</div>
        <div class="story-ev">${escape(s.story.slice(0, 240))}${s.story.length > 240 ? '…' : ''}</div>
      </div>
    </div>`).join('')}
  </div>` : '';

  // ── Card 4: Action (blue / Apply / Skip / Defer) ─────────
  const actionCard = (finalRec || url) ? `<div class="dcard dcard--action">
    <div>
      <div class="dcard-label" style="margin-bottom:4px">ACTION</div>
      <div class="dcard-action-text">${escape(finalRec || 'No recommendation captured.')}</div>
    </div>
    <div class="dcard-action-buttons">
      ${url ? `<a href="${escape(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="dcard-btn dcard-btn--primary">Apply →</a>` : ''}
      <button type="button" class="dcard-btn" onclick="event.stopPropagation()" data-action="skip" data-num="${escape(String(r.num || ''))}">Skip</button>
      <button type="button" class="dcard-btn" onclick="event.stopPropagation()" data-action="defer" data-num="${escape(String(r.num || ''))}">Defer</button>
    </div>
  </div>` : '';

  // ── Recommendation banner ────────────────────────────────
  const recBanner = finalRec ? `<div class="rec-banner">
    <span class="rec-label">Rec</span>
    <span class="rec-text">${escape(finalRec)}</span>
    ${url ? `<a href="${escape(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="rec-btn">Apply →</a>` : ''}
  </div>` : url ? `<div style="font-size:12px;margin-top:6px"><a href="${escape(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 View JD</a></div>` : '';

  // Inline gap chips shown on mobile cards only (top 3 by getKeyGaps order)
  const cardGapChips = gaps.length ? `<div class="card-gaps-mobile">${gaps.slice(0, 3).map(g =>
    `<span class="gap-chip gap-chip-mobile">⚠ ${escape(g.title)}</span>`
  ).join('')}</div>` : '';

  // ── Search index: tldr + recommendation + topGaps + topEdges ─
  // Lowercased + whitespace-collapsed so the client filter can do a
  // simple substring match against a normalized query.
  const searchIndex = [
    tldr,
    finalRec,
    ...gaps.flatMap(g => [g.title, g.detail]),
    ...edge.flatMap(e => [e.requirement, e.evidence, e.label]),
  ].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();

  return `
<tr class="row ${throttleClass}" data-num="${r.num}" data-row-id="${escape(idx)}" data-score="${r.score}" data-archetype="${escape(archetype)}" data-company="${escape(r.company.toLowerCase())}" data-status="${escape(r.status.toLowerCase())}" data-role="${escape(r.role.toLowerCase())}" data-search="${escape(searchIndex)}" onclick="toggleDetail('${idx}')">
  <td><span class="badge score-badge-lg ${scoreBadgeClass(r.score)}">${r.score.toFixed(1)}</span></td>
  <td><strong>${escape(r.company)}</strong>${archetype ? `<span class="tier-tag" tabindex="0" role="button" data-tooltip="${escape(tierTooltip(archetype))}" aria-label="Tier ${escape(archetype)}: ${escape(tierTooltip(archetype))}" onclick="event.stopPropagation();openTierLegend('${escape(archetype)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openTierLegend('${escape(archetype)}')}">${escape(archetype)}</span>` : ''}</td>
  <td class="role-cell">${escape(r.role)}${cardGapChips}</td>
  <td><span class="badge status-pill ${statusBadgeClass(r.status)}" data-status="${statusKey(r.status)}" data-num="${r.num}" role="button" tabindex="0" onclick="openStatusPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){openStatusPopover(this);event.preventDefault();event.stopPropagation()}" title="Click to change status">${escape(r.status)}</span></td>
  <td class="muted-text mobile-hide">${escape(r.date)}</td>
  <td class="muted-text">${evalAge(r.date)}</td>
  <td class="action-cell">${applyLink}</td>
</tr>
<tr class="detail-row" id="detail-${idx}" style="display:none">
  <td colspan="7">
    <div class="detail-block">
      ${r._throttle?.label ? `<div class="throttle-banner throttle-${r._throttle.status}">${escape(r._throttle.label)}<br><span class="muted-text">${escape(r._throttle.note || '')}</span></div>` : ''}
      ${metaChips ? `<div class="detail-meta">${metaChips}</div>` : ''}
      ${tldrCard}${posCard}
      <div class="detail-grid">
        <div class="detail-col">${matchCard}</div>
        <div class="detail-col">${gapCard}</div>
      </div>
      ${storyCard}
      ${actionCard}
    </div>
  </td>
</tr>`;
}

function build() {
  if (!existsSync(dirname(OUT_PATH))) mkdirSync(dirname(OUT_PATH), { recursive: true });
  const reportsHtmlDir = join(dirname(OUT_PATH), 'reports');

  // Pre-render every report.md to dashboard/reports/{name}.html so the
  // dashboard's Report links open formatted previews in the browser
  // (no Cursor / no key-shortcut required).
  const allReports = existsSync(REPORTS_DIR) ? readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md')) : [];
  let renderedCount = 0;
  for (const f of allReports) {
    if (renderReportToHtml(`reports/${f}`, reportsHtmlDir)) renderedCount++;
  }

  const apps = parseApplications();
  const today = new Date().toISOString().slice(0, 10);
  const generated = new Date().toISOString();
  const generatedShort = new Date(generated).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles'
  });

  // Stats
  const total = apps.length;
  // Apply-Now: candidates Mitchell can act on today. Excludes "Interview"
  // status (already in motion) per his preference.
  const applyNow = apps.filter(r => r.score >= 4.0 && /^(evaluated|responded)$/i.test(r.status));

  // Throttle policy — heuristic guidance based on aggregated candidate
  // reports (Blind, Reddit, LinkedIn, Grok-verified April 2026). NOT
  // official company policy. Real cooldown depends on rejection stage:
  // app-screen ≈ 2-3mo, phone ≈ 3-6mo, onsite ≈ 6-12mo. Recruiter
  // goodwill matters more than calendar — over-applying flags spam.
  const THROTTLE_POLICY = {
    'anthropic': { cap: 1, cooldown: '3-12 months by rejection stage', note: '#1 target. ATS tracks COMPANY-WIDE, not by role. Spamming auto-flags low-priority. Apply to the single highest-scoring Mitchell-shaped role; wait for resolution before next.' },
    'openai':    { cap: 2, cooldown: 'Variable (recruiter-dependent)', note: 'Less rigid than Anthropic. Some recruiters explicitly say "reapply anytime." If rejected, ask the recruiter for the re-application window.' },
    'stripe':    { cap: 3, cooldown: 'Variable; check rejection email', note: 'Sparse data. Distinct teams (Press vs. Atlas vs. Payments) treated separately. Some reports of 6-12mo for same role family.' },
  };

  // Load real rejection history from auto-scrape + manual corpus to compute
  // per-company cooldown end dates. Stage-aware: app_screen=3mo, phone=6mo,
  // onsite=12mo (from modes/_profile.md §0a heuristics).
  function loadRejectionHistory() {
    const rejections = [];
    // Source 1: auto-scraped JSON
    const autoPath = join(ROOT, 'data/rejection-history.json');
    if (existsSync(autoPath)) {
      try {
        const auto = JSON.parse(readFileSync(autoPath, 'utf-8'));
        for (const r of auto) {
          if (!r.is_rejection) continue;
          rejections.push({
            company: (r.company || '').toLowerCase(),
            role: r.role || '',
            date: r._date || '',
            stage: r.rejection_stage || 'unspecified',
            source: 'auto-scrape',
          });
        }
      } catch {}
    }
    // Source 2: corpus/rejections.md hand-stubbed entries
    const corpusPath = join(ROOT, 'corpus/rejections.md');
    if (existsSync(corpusPath)) {
      const text = readFileSync(corpusPath, 'utf-8');
      for (const m of text.matchAll(/^#{2,3}\s+([^—\n]+?)\s+—\s+([^—\n]+?)\s+—\s+(\d{4}[-\/]\d{2}(?:[-\/]\d{2})?)/gm)) {
        const company = m[1].trim();
        if (/pattern summary|cross-references|other rejections/i.test(company)) continue;
        const role = m[2].trim();
        const dateStr = m[3].replace(/\//g, '-');
        const date = dateStr.length === 7 ? `${dateStr}-01` : dateStr;
        // Try to find stage in the following block
        const blockStart = m.index + m[0].length;
        const blockEnd = text.indexOf('\n##', blockStart);
        const block = text.slice(blockStart, blockEnd === -1 ? blockStart + 1500 : blockEnd);
        const stageHint = /Stage:\*\*\s+([^\n]+)/.exec(block)?.[1] || '';
        let stage = 'unspecified';
        if (/onsite|final\s*round|full\s*loop/i.test(stageHint)) stage = 'onsite_loop';
        else if (/phone|recruiter\s*screen/i.test(stageHint)) stage = 'phone_screen';
        else if (/online\s*assessment|take\s*home/i.test(stageHint)) stage = 'take_home_oa';
        else if (/app(?:lication)?\s*screen/i.test(stageHint)) stage = 'app_screen';
        else if (/withdrawn|silen/i.test(stageHint)) stage = 'auto_withdrawn';
        rejections.push({ company: company.toLowerCase(), role, date, stage, source: 'corpus' });
      }
    }
    return rejections;
  }

  function cooldownMonths(stage) {
    if (stage === 'onsite_loop' || stage === 'final_round') return 12;
    if (stage === 'take_home_oa' || stage === 'phone_screen') return 6;
    if (stage === 'auto_withdrawn') return 0;
    return 3;  // app_screen / unspecified
  }

  function getCompanyCooldownStatus(company, rejections, today = new Date()) {
    const matches = rejections.filter(r => r.company === company.toLowerCase() && r.stage !== 'auto_withdrawn');
    if (matches.length === 0) return null;
    let latestEnd = new Date(0);
    let driverRej = null;
    for (const r of matches) {
      const d = new Date(r.date);
      d.setMonth(d.getMonth() + cooldownMonths(r.stage));
      if (d > latestEnd) { latestEnd = d; driverRej = r; }
    }
    const isActive = latestEnd > today;
    return { isActive, latestEnd, driverRejection: driverRej, totalCount: matches.length };
  }

  const rejectionHistory = loadRejectionHistory();
  const activeAppsByCompany = {};
  for (const r of apps) {
    if (!/^(Applied|Responded|Interview|Offer)$/i.test(r.status)) continue;
    const k = r.company.toLowerCase();
    activeAppsByCompany[k] = (activeAppsByCompany[k] || 0) + 1;
  }

  // Group Apply-Now by company so we can render "pick the highest" guidance
  // for throttled companies. Within each company group, the highest-scoring
  // role is "recommended"; the rest are "deferred" (still listed but flagged).
  const applyNowByCompany = {};
  for (const r of applyNow) {
    const k = r.company.toLowerCase();
    if (!applyNowByCompany[k]) applyNowByCompany[k] = [];
    applyNowByCompany[k].push(r);
  }
  // Tag each row with its throttle status. Layer 1 = active-application
  // cap (in-flight apps at this company). Layer 2 = stage-aware cooldown
  // from rejection history. Both can fire simultaneously.
  const todayDate = new Date();
  for (const r of applyNow) {
    const k = r.company.toLowerCase();
    const policy = THROTTLE_POLICY[k];
    const active = activeAppsByCompany[k] || 0;
    const groupRows = applyNowByCompany[k].sort((a, b) => b.score - a.score);
    const isTopOfCompany = groupRows[0].num === r.num;
    const cooldown = getCompanyCooldownStatus(r.company, rejectionHistory, todayDate);

    // Cooldown layer takes priority — if there's an active rejection
    // cooldown, surface it as the primary signal.
    if (cooldown && cooldown.isActive) {
      const endStr = cooldown.latestEnd.toISOString().slice(0, 10);
      const driver = cooldown.driverRejection;
      r._throttle = {
        status: 'cooldown',
        label: `🛑 Rejection cooldown active until ${endStr} (${cooldown.totalCount} prior rejection${cooldown.totalCount === 1 ? '' : 's'} at ${r.company})`,
        note: `Driver: ${driver.role} (${driver.date}, stage: ${driver.stage}). Re-apply window cleared on ${endStr} per stage-aware heuristic. Override if you have an internal referral or recruiter says re-apply sooner.`,
      };
    } else if (policy && active >= policy.cap) {
      r._throttle = { status: 'blocked', label: `🛑 ${policy.cap} active app${policy.cap === 1 ? '' : 's'} at ${r.company} — defer until resolved`, note: policy.note };
    } else if (groupRows.length > 1 && !isTopOfCompany) {
      r._throttle = { status: 'defer', label: `⏸ Defer — apply to higher-scored ${r.company} role first`, note: policy?.note || 'Pick highest-scored at the same company first.' };
    } else if (groupRows.length > 1 && isTopOfCompany) {
      const cooldownNote = cooldown ? ` · Past cooldown cleared ${cooldown.latestEnd.toISOString().slice(0, 10)}` : '';
      r._throttle = { status: 'pickone', label: `⭐ Apply this ONE first (${groupRows.length - 1} other ${r.company} roles deferred${cooldownNote})`, note: policy?.note || '' };
    } else if (cooldown) {
      // Cooldown cleared — show informational note
      r._throttle = { status: 'open', label: `✅ Past cooldown cleared ${cooldown.latestEnd.toISOString().slice(0, 10)} (${cooldown.totalCount} prior rejection${cooldown.totalCount === 1 ? '' : 's'})`, note: 'Window has elapsed; safe to re-apply.' };
    } else {
      r._throttle = { status: 'open', label: '', note: '' };
    }
  }
  const applied = apps.filter(r => /applied|interview|offer/i.test(r.status));
  const pipelinePending = countPipelinePending();
  const scanTotal = countScanHistory();
  const batchRuns = countBatchRuns();
  const portals = getEnabledPortals();
  const reportsToday = countTodaysReports(today);

  // Sorted views
  const sortedByScore = [...apps].sort((a, b) => b.score - a.score);
  const applyNowSorted = [...applyNow].sort((a, b) => b.score - a.score);

  // Score buckets
  const buckets = { '4.0+': 0, '3.0-3.9': 0, '2.0-2.9': 0, '1.0-1.9': 0, '0-0.9': 0 };
  for (const r of apps) {
    if (r.score >= 4.0) buckets['4.0+']++;
    else if (r.score >= 3.0) buckets['3.0-3.9']++;
    else if (r.score >= 2.0) buckets['2.0-2.9']++;
    else if (r.score >= 1.0) buckets['1.0-1.9']++;
    else buckets['0-0.9']++;
  }

  // Top companies
  const byCompany = {};
  for (const r of apps) {
    byCompany[r.company] = (byCompany[r.company] || 0) + 1;
  }
  const topCompanies = Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 15);

  // Apply-now table rows
  const applyNowRows = applyNowSorted.map((r, i) => renderRow(r, `apply-${i}`)).join('\n');
  const allRows = sortedByScore.map((r, i) => renderRow(r, `all-${i}`)).join('\n');

  // ── Cmd-K palette data ────────────────────────────────────────────
  // Compact index of every row + the 5 most recently dated reports.
  const cmdkRows = sortedByScore.map((r, i) => ({
    num: r.num,
    rowId: `all-${i}`,
    company: r.company,
    role: r.role,
    score: r.score,
    archetype: getReportArchetype(r.reportPath) || '',
    status: r.status,
  }));
  const recentReports = [...apps]
    .filter(r => r.reportPath)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5)
    .map(r => ({
      slug: basename(r.reportPath).replace(/\.md$/, '.html'),
      title: `${r.company} — ${r.role}`,
      date: r.date,
      num: r.num,
    }));
  // Escape </ to keep the JSON safe inside a <script> tag.
  const cmdkPayload = JSON.stringify({ rows: cmdkRows, reports: recentReports }).replace(/<\//g, '<\\/');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Career-Ops Dashboard — ${today}</title>
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon-180.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0c0a09">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Career-Ops">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* ── Design tokens ─────────────────────────────────────────────── */
  :root {
    --bg: #f8f9fb;
    --surface: #ffffff;
    --surface-2: #f4f4f6;
    --border: #e5e7eb;
    --border-strong: #d1d5db;
    --text: #111827;
    --text-2: #374151;
    --text-3: #6b7280;
    --text-4: #9ca3af;
    --green: #15803d;
    --green-fg: #16a34a;
    --green-fg-dark: #166534;
    --green-bg: #dcfce7;
    --green-border: #86efac;
    --blue: #1d4ed8;
    --blue-fg: #2563eb;
    --blue-fg-dark: #1e40af;
    --blue-bg: #dbeafe;
    --blue-border: #93c5fd;
    --amber: #b45309;
    --amber-fg: #d97706;
    --amber-fg-dark: #92400e;
    --amber-bg: #fef3c7;
    --amber-border: #fcd34d;
    --red: #b91c1c;
    --red-fg: #dc2626;
    --red-fg-dark: #991b1b;
    --red-bg: #fee2e2;
    --red-border: #fca5a5;
    --purple: #6d28d9;
    --purple-fg: #7c3aed;
    --purple-fg-dark: #5b21b6;
    --purple-bg: #ede9fe;
    --purple-border: #c4b5fd;
    --radius: 8px;
    --radius-sm: 6px;
    --radius-full: 9999px;
    --section-gap: 64px;
    --shadow-sm: 0 1px 2px 0 rgba(0,0,0,.05);
    --shadow: 0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1);
    --shadow-md: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1);
    --ring-green: 0 0 0 3px rgba(22,163,74,.15);
    --ring-blue: 0 0 0 3px rgba(37,99,235,.15);
  }
  body.dark {
    --bg: #0a0a0b;
    --surface: #18181b;
    --surface-2: #1f1f23;
    --border: #27272a;
    --border-strong: #3f3f46;
    --text: #fafafa;
    --text-2: #e4e4e7;
    --text-3: #a1a1aa;
    --text-4: #71717a;
    --green: #4ade80;
    --green-fg: #86efac;
    --green-fg-dark: #bbf7d0;
    --green-bg: rgba(22,163,74,.12);
    --green-border: rgba(22,163,74,.3);
    --blue: #93c5fd;
    --blue-fg: #60a5fa;
    --blue-fg-dark: #bfdbfe;
    --blue-bg: rgba(37,99,235,.12);
    --blue-border: rgba(37,99,235,.3);
    --amber: #fbbf24;
    --amber-fg: #fcd34d;
    --amber-fg-dark: #fde68a;
    --amber-bg: rgba(217,119,6,.12);
    --amber-border: rgba(217,119,6,.3);
    --red: #f87171;
    --red-fg: #fca5a5;
    --red-fg-dark: #fecaca;
    --red-bg: rgba(220,38,38,.12);
    --red-border: rgba(220,38,38,.3);
    --purple: #c4b5fd;
    --purple-fg: #a78bfa;
    --purple-fg-dark: #ddd6fe;
    --purple-bg: rgba(124,58,237,.12);
    --purple-border: rgba(124,58,237,.3);
    --ring-green: 0 0 0 3px rgba(74,222,128,.15);
    --ring-blue: 0 0 0 3px rgba(147,197,253,.15);
  }

  /* ── Reset & base ────────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    color: var(--text);
    background: var(--bg);
    margin: 0;
    padding: 24px 28px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .container { max-width: 1400px; margin: 0 auto; }
  h1 { margin: 0 0 2px; font-size: 22px; font-weight: 700; letter-spacing: -0.4px; }
  h2 { margin: 32px 0 14px; font-size: 16px; font-weight: 600; padding-bottom: 8px;
       border-bottom: 1px solid var(--border); letter-spacing: -0.2px; }
  a { color: var(--blue-fg); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px;
         background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
  .subtle { color: var(--text-3); font-size: 12.5px; margin-bottom: 20px; }
  .muted { color: var(--text-4); }
  .muted-text { color: var(--text-3); font-size: 12px; }

  /* ── Accessibility utilities ─────────────────────────────────── */
  /* Visually hidden but exposed to assistive tech (WCAG 1.3.1, 4.1.2). */
  .sr-only {
    position: absolute !important; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
    white-space: nowrap; border: 0;
  }
  /* Skip-link is the first focusable element on the page (WCAG 2.4.1). */
  .skip-link {
    position: absolute; top: -40px; left: 8px;
    background: var(--blue-fg-dark); color: #fff;
    padding: 10px 14px; border-radius: var(--radius-sm);
    font-weight: 600; font-size: 13px; z-index: 10000;
    text-decoration: none;
  }
  .skip-link:focus { top: 8px; outline: 2px solid var(--text); outline-offset: 2px; }
  /* Global focus-visible ring for keyboard navigation (WCAG 2.4.7). */
  a:focus-visible,
  button:focus-visible,
  [tabindex]:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--blue-fg);
    outline-offset: 2px;
    border-radius: inherit;
  }

  /* ── Toolbar ─────────────────────────────────────────────────── */
  .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .toolbar h1 { flex: 1; }
  .toolbar-btn {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 5px 13px;
    font-size: 12px; font-weight: 500; cursor: pointer;
    color: var(--text-3); transition: background .12s, border-color .12s;
    font-family: inherit;
  }
  .toolbar-btn:hover { background: var(--surface-2); border-color: var(--border-strong); color: var(--text-2); }
  .cmdk-trigger { display: inline-flex; align-items: center; gap: 8px; padding-right: 6px; min-width: 220px; }
  .cmdk-trigger-label { color: var(--text-3); flex: 1; text-align: left; }
  .cmdk-trigger-kbd {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 4px; padding: 1px 6px; font-size: 11px; color: var(--text-3);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  /* ── Cmd-K command palette ─────────────────────────────────── */
  #cmdk-backdrop {
    display: none; position: fixed; inset: 0; z-index: 100;
    background: rgba(15, 17, 21, 0.42); backdrop-filter: blur(2px);
    align-items: flex-start; justify-content: center; padding-top: 14vh;
  }
  #cmdk-backdrop.visible { display: flex; }
  #cmdk-modal {
    width: min(640px, calc(100vw - 32px));
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: 0 20px 60px rgba(0,0,0,.25);
    overflow: hidden; display: flex; flex-direction: column;
    max-height: 70vh;
  }
  .cmdk-input-wrap {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; border-bottom: 1px solid var(--border);
  }
  .cmdk-input-icon { color: var(--text-3); font-size: 16px; }
  #cmdk-input {
    flex: 1; border: none; outline: none; background: transparent;
    font: inherit; font-size: 15px; color: var(--text);
  }
  #cmdk-input::placeholder { color: var(--text-4); }
  .cmdk-input-hint {
    font-size: 11px; color: var(--text-4);
    background: var(--surface-2); padding: 2px 7px; border-radius: 4px;
    border: 1px solid var(--border);
  }
  #cmdk-list {
    overflow-y: auto; flex: 1; padding: 6px 0;
  }
  .cmdk-section-label {
    font-size: 10.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--text-4);
    padding: 10px 16px 4px;
  }
  .cmdk-item {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 16px; cursor: pointer; user-select: none;
    border-left: 2px solid transparent;
  }
  .cmdk-item.active {
    background: var(--surface-2); border-left-color: var(--blue-fg);
  }
  .cmdk-item-icon {
    width: 22px; height: 22px; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--surface-2); border-radius: 5px; font-size: 12px;
    color: var(--text-3);
  }
  .cmdk-item.active .cmdk-item-icon { background: var(--surface); color: var(--text-2); }
  .cmdk-item-body { flex: 1; min-width: 0; }
  .cmdk-item-title {
    font-size: 13.5px; color: var(--text); font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cmdk-item-sub {
    font-size: 11.5px; color: var(--text-3); margin-top: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cmdk-item-meta {
    font-size: 11px; color: var(--text-4); flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .cmdk-empty { padding: 28px 16px; text-align: center; color: var(--text-4); font-size: 13px; }
  .cmdk-footer {
    display: flex; gap: 14px; padding: 8px 16px;
    border-top: 1px solid var(--border); background: var(--surface-2);
    font-size: 11px; color: var(--text-4);
  }
  .cmdk-footer kbd {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 3px; padding: 0 5px; font-size: 10.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    margin: 0 2px;
  }
  @keyframes cmdk-flash {
    0%, 100% { background: transparent; }
    20%, 60% { background: rgba(9, 105, 218, 0.12); }
  }
  tr.row.cmdk-flash > td { animation: cmdk-flash 1.6s ease-in-out; }
  @media (max-width: 640px) {
    .cmdk-trigger { min-width: 0; }
    .cmdk-trigger-label { display: none; }
    #cmdk-modal { width: calc(100vw - 16px); max-height: 80vh; }
    #cmdk-backdrop { padding-top: 8vh; }
  }

  /* ── KPI stat cards: 3+3 hero (primary tier on top, secondary below) ── */
  .stats {
    margin: 16px 0 24px;
  }
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 16px 0 var(--section-gap);
  }
  .stats-row-primary { margin-bottom: 12px; }
  @media (max-width: 720px) {
    .stats-row { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  }
  .stat {
    background: var(--surface); padding: 18px 20px; border-radius: var(--radius);
    border: 1px solid var(--border); box-shadow: var(--shadow-sm);
    transition: border-color .15s, box-shadow .15s;
    position: relative; overflow: hidden;
  }
  .stat::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--border); border-radius: var(--radius) var(--radius) 0 0;
  }
  .stat-strong::before { background: var(--green-fg); }
  .stat { cursor: pointer; }
  .stat:hover { border-color: var(--border-strong); box-shadow: var(--shadow); }
  .stat.active { border-color: var(--blue-fg); box-shadow: var(--ring-blue); }
  .stat-strong:hover, .stat-strong.active { border-color: var(--green-fg); box-shadow: var(--ring-green); }
  .stat-label { font-size: 11px; color: var(--text-3); text-transform: uppercase;
                letter-spacing: 0.06em; font-weight: 600; }
  .stat-value {
    font-size: 32px; font-weight: 700; color: var(--text);
    margin-top: 6px; letter-spacing: -1px;
    font-variant-numeric: tabular-nums;
  }
  .stat-strong .stat-value { color: var(--green-fg); }
  .stat-caret {
    position: absolute; top: 10px; right: 12px;
    font-size: 13px; color: var(--text-4); line-height: 1;
    transition: color .12s, transform .12s;
  }
  .stat:hover .stat-caret { color: var(--text-3); }
  .stat.active .stat-caret { color: var(--blue-fg); transform: rotate(180deg); }
  /* Secondary tier: smaller padding + smaller numeric */
  .stat-secondary { padding: 14px 16px; }
  .stat-secondary .stat-value { font-size: 24px; letter-spacing: -0.5px; }
  .stat-secondary::before { height: 2px; }

  /* ── Panels / cards ──────────────────────────────────────────── */
  .panel {
    background: var(--surface); border-radius: var(--radius);
    border: 1px solid var(--border); box-shadow: var(--shadow-sm);
    padding: 22px 24px; margin-bottom: var(--section-gap);
  }
  .panel-strong {
    border-color: var(--green-fg);
    box-shadow: var(--shadow-sm), 0 0 0 1px var(--green-fg), 0 4px 20px rgba(22,163,74,.08);
    position: relative;
  }
  .panel-strong::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--green-fg); border-radius: var(--radius) var(--radius) 0 0;
  }
  .panel-title {
    font-size: 26px; font-weight: 700; margin: 0 0 18px;
    letter-spacing: -0.4px; color: var(--text); display: flex; align-items: center; gap: 10px;
  }
  .panel-title .pill {
    font-size: 11px; font-weight: 600;
    background: var(--green-fg-dark); color: #fff;
    padding: 1px 9px; border-radius: var(--radius-full);
    letter-spacing: 0;
  }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: var(--section-gap); }

  /* ── Tables ──────────────────────────────────────────────────── */
  .table-scroll { overflow-x: auto; overflow-y: auto; max-height: 520px; border-radius: 0 0 var(--radius-sm) var(--radius-sm); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead { position: sticky; top: 0; z-index: 2; }
  th {
    text-align: left; padding: 9px 12px;
    background: var(--surface-2); color: var(--text-3);
    font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { background: var(--border); color: var(--text-2); }
  .sort-arrow { color: var(--blue-fg); font-size: 10px; }
  td {
    padding: 10px 12px; border-bottom: 1px solid var(--border);
    vertical-align: top; color: var(--text-2); font-weight: 400;
  }
  tr.row { cursor: pointer; transition: background .1s; }
  tr.row:hover td { background: var(--surface-2); }
  td.num { color: var(--text-3); font-variant-numeric: tabular-nums; }
  .role-cell { color: var(--text); font-weight: 500; }
  /* Action-cell links rendered as 44×44 padded buttons (WCAG 2.5.5). */
  td.action-cell { white-space: nowrap; }
  td.action-cell a {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 44px; min-height: 44px;
    padding: 6px 10px; margin: -6px 0;
    color: var(--blue-fg-dark); font-weight: 500; font-size: 12px;
    border-radius: var(--radius-sm);
    box-sizing: border-box;
  }
  td.action-cell a:hover { background: var(--surface-2); text-decoration: underline; }
  td.action-cell .action-sep { color: var(--text-4); padding: 0 2px; user-select: none; }
  .tier-tag {
    font-size: 10px; color: var(--text-3); background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 0 5px; margin-left: 5px; font-weight: 500; vertical-align: middle;
    cursor: pointer; position: relative; display: inline-block;
    transition: background .12s, border-color .12s, color .12s;
  }
  .tier-tag:hover, .tier-tag:focus {
    background: var(--blue-bg); border-color: var(--blue-border);
    color: var(--blue-fg); outline: none;
  }
  .tier-tag:focus-visible { box-shadow: var(--ring-blue); }
  /* CSS-only tooltip: pulls from data-tooltip; appears on hover/focus.
     Wraps to ~280px and floats above the badge. Pointer-events:none so
     the tooltip itself never steals the click. */
  .tier-tag::after {
    content: attr(data-tooltip);
    position: absolute; bottom: calc(100% + 8px); left: 50%;
    transform: translateX(-50%) translateY(4px);
    background: var(--text); color: var(--surface);
    padding: 8px 11px; border-radius: var(--radius-sm);
    font-size: 11.5px; font-weight: 500; line-height: 1.45;
    white-space: normal; width: max-content; max-width: 280px;
    box-shadow: var(--shadow-md); pointer-events: none;
    opacity: 0; visibility: hidden;
    transition: opacity .15s ease-out, transform .15s ease-out, visibility .15s;
    z-index: 1500; text-align: left;
  }
  .tier-tag:hover::after, .tier-tag:focus::after, .tier-tag:focus-visible::after {
    opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0);
  }
  .tier-tag[data-tooltip=""]::after { display: none; }

  /* Column-header (?) info button that opens the full legend modal. */
  .tier-legend-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; margin-left: 4px; padding: 0;
    border: 1px solid var(--border); border-radius: 50%;
    background: var(--surface); color: var(--text-3);
    font-size: 10px; font-weight: 700; font-family: inherit;
    cursor: pointer; vertical-align: middle; line-height: 1;
    transition: background .12s, color .12s, border-color .12s;
  }
  .tier-legend-btn:hover, .tier-legend-btn:focus-visible {
    background: var(--blue-bg); border-color: var(--blue-border);
    color: var(--blue-fg); outline: none;
  }
  .tier-legend-btn:focus-visible { box-shadow: var(--ring-blue); }

  /* Tier-legend modal — same shape as gap modal for consistency. */
  #tier-legend-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2000; backdrop-filter: blur(2px); }
  #tier-legend-backdrop.visible { display: block; }
  #tier-legend-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: min(640px, 96vw); max-height: 82vh; overflow-y: auto; z-index: 2001;
    background: var(--surface); border-radius: 12px; border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .tier-legend-header {
    position: sticky; top: 0; background: var(--surface);
    border-bottom: 1px solid var(--border); padding: 14px 20px;
    display: flex; align-items: center; gap: 10px; z-index: 1;
    border-radius: 12px 12px 0 0;
  }
  .tier-legend-title { font-size: 15px; font-weight: 600; flex: 1; color: var(--text); }
  .tier-legend-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
  .tier-legend-row {
    display: grid; grid-template-columns: 56px 1fr; gap: 14px;
    padding: 12px 14px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface-2);
    transition: border-color .12s;
  }
  .tier-legend-row.tier-row-highlight { border-color: var(--blue-fg); box-shadow: var(--ring-blue); }
  .tier-legend-code {
    font-size: 14px; font-weight: 700; color: var(--blue-fg);
    text-align: center; padding-top: 2px; font-variant-numeric: tabular-nums;
  }
  .tier-legend-name { font-size: 13.5px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
  .tier-legend-summary { font-size: 12.5px; color: var(--text-2); line-height: 1.55; margin-bottom: 6px; }
  .tier-legend-examples { font-size: 11.5px; color: var(--text-3); line-height: 1.5; font-style: italic; }

  /* ── Throttle row visual states ──────────────────────────────── */
  tr.row-throttle-pickone > td:first-child { box-shadow: inset 3px 0 0 var(--amber-fg); }
  tr.row-throttle-defer { opacity: .6; }
  tr.row-throttle-defer > td:first-child { box-shadow: inset 3px 0 0 var(--text-4); }
  tr.row-throttle-blocked { opacity: .4; }
  tr.row-throttle-blocked > td:first-child { box-shadow: inset 3px 0 0 var(--red-fg); }
  tr.row-throttle-cooldown { opacity: .45; }
  tr.row-throttle-cooldown > td:first-child { box-shadow: inset 3px 0 0 var(--red-fg); }
  tr.row-throttle-open > td:first-child { box-shadow: inset 3px 0 0 var(--green-fg); }
  .throttle-banner { padding: 11px 14px; border-radius: var(--radius-sm); margin: 4px 0 12px; font-weight: 500; font-size: 13px; line-height: 1.5; }
  .throttle-pickone  { background: var(--amber-bg);  color: var(--amber);  border-left: 3px solid var(--amber-fg); }
  .throttle-defer    { background: var(--surface-2); color: var(--text-3); border-left: 3px solid var(--text-4); }
  .throttle-blocked, .throttle-cooldown { background: var(--red-bg); color: var(--red-fg); border-left: 3px solid var(--red-fg); }
  .throttle-open     { background: var(--green-bg);  color: var(--green);  border-left: 3px solid var(--green-fg); }

  /* ── Badges ──────────────────────────────────────────────────── */
  .badge {
    display: inline-flex; align-items: center;
    padding: 2px 9px; border-radius: var(--radius-full);
    font-size: 11.5px; font-weight: 600;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .score-badge-lg { font-size: 13px; padding: 3px 11px; }
  .score-strong  { background: var(--green-bg);  color: var(--green); }
  .score-moderate { background: var(--amber-bg); color: var(--amber); }
  .score-weak    { background: var(--surface-2); color: var(--text-3); }
  /* Status pills use the *-fg-dark tokens to clear WCAG AA 4.5:1 on tinted bg */
  .status-evaluated { background: var(--blue-bg);   color: var(--blue-fg-dark); }
  .status-applied   { background: var(--amber-bg);  color: var(--amber-fg-dark); }
  .status-interview { background: var(--purple-bg); color: var(--purple-fg-dark); }
  .status-offer     { background: var(--green-bg);  color: var(--green-fg-dark); }
  .status-rejected  { background: var(--red-bg);    color: var(--red-fg-dark); }
  .status-discarded { background: var(--surface-2); color: var(--text-3); }

  /* Leading semantic dot per status (Linear/Notion convention) */
  .badge[data-status]::before {
    content: '●';
    font-size: 8px;
    line-height: 1;
    margin-right: 6px;
    vertical-align: middle;
    color: var(--text-3);
  }
  .badge[data-status="evaluated"]::before { color: var(--text-3); }
  .badge[data-status="applied"]::before   { color: var(--blue-fg); }
  .badge[data-status="responded"]::before { color: var(--purple-fg); }
  .badge[data-status="interview"]::before { color: var(--amber-fg); }
  .badge[data-status="offer"]::before     { color: var(--green-fg); }
  .badge[data-status="rejected"]::before  { color: var(--red-fg); }
  .badge[data-status="discarded"]::before { color: var(--text-4); }
  .badge[data-status="skip"]::before      { color: #64748b; }
  body.dark .badge[data-status="skip"]::before { color: #94a3b8; }

  /* ── Age badges ──────────────────────────────────────────────── */
  .age-stale { color: var(--red-fg); font-weight: 600; font-size: 12px; }
  .age-ok    { color: var(--text-3); font-size: 12px; }

  /* ── Filters bar ─────────────────────────────────────────────── */
  .filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 14px; }
  .filters input, .filters select {
    padding: 7px 11px; font-size: 13px; font-family: inherit;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text);
    outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .filters input { flex: 1; min-width: 200px; }
  .filters input:focus, .filters select:focus {
    border-color: var(--blue-fg); box-shadow: var(--ring-blue);
  }
  .filters-sticky {
    position: sticky; top: 0; z-index: 10;
    background: var(--surface);
    padding: 12px 0; margin: 0 0 4px;
    border-bottom: 1px solid var(--border);
    box-shadow: 0 4px 6px -4px rgba(0,0,0,.08);
  }
  body.dark .filters-sticky { box-shadow: 0 4px 6px -4px rgba(0,0,0,.4); }

  /* ── Bar chart ───────────────────────────────────────────────── */
  .bar-chart { display: flex; flex-direction: column; gap: 9px; }
  .bar-row { display: grid; grid-template-columns: 110px 1fr 38px; gap: 10px; align-items: center; font-size: 13px; }
  .bar-track { background: var(--surface-2); height: 14px; border-radius: var(--radius-full); overflow: hidden; }
  .bar-fill { background: linear-gradient(90deg, var(--green-fg), var(--blue-fg)); height: 100%; border-radius: var(--radius-full); }
  .bar-row-label { font-weight: 500; color: var(--text-2); font-size: 12.5px; }
  .bar-row-count { text-align: right; color: var(--text-3); font-variant-numeric: tabular-nums; font-weight: 600; font-size: 12.5px; }

  /* ── Segmented distribution bar ──────────────────────────────── */
  .seg-bar { display: flex; flex-direction: column; gap: 6px; }
  .seg-bar-counts { display: flex; gap: 2px; align-items: flex-end; height: 22px; }
  .seg-bar-count {
    flex: 1; text-align: center; font-size: 11.5px; font-weight: 600;
    color: var(--text-2); font-variant-numeric: tabular-nums;
    transition: opacity .15s;
  }
  .seg-bar-count.zero { opacity: 0.35; font-weight: 500; }
  .seg-bar-track {
    display: flex; height: 26px; border-radius: var(--radius-sm);
    overflow: hidden; background: var(--surface-2); border: 1px solid var(--border);
  }
  .seg-bar-segment {
    height: 100%; transition: flex-grow .25s;
    border-right: 1px solid var(--surface);
  }
  .seg-bar-segment:last-child { border-right: none; }
  .seg-bar-segment.zero { flex-grow: 0.05 !important; opacity: 0.35; }
  .seg-bar-segment.s-strong   { background: var(--green-fg); }
  .seg-bar-segment.s-good     { background: var(--blue-fg); }
  .seg-bar-segment.s-moderate { background: var(--amber-fg); }
  .seg-bar-segment.s-weak     { background: var(--red-fg); opacity: 0.7; }
  .seg-bar-segment.s-none     { background: var(--text-4); opacity: 0.5; }
  .seg-bar-labels { display: flex; gap: 2px; }
  .seg-bar-label {
    flex: 1; text-align: center; font-size: 10.5px; font-weight: 600;
    color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em;
  }
  .seg-bar-label .seg-bar-range { display: block; font-size: 10px; font-weight: 500;
    color: var(--text-4); text-transform: none; letter-spacing: 0; margin-top: 1px; }

  /* ── Detail expand panel ─────────────────────────────────────── */
  .detail-block { background: var(--surface-2); padding: 14px 16px; border-radius: var(--radius-sm); margin: 2px 0; font-size: 13px; }
  .detail-section { margin: 10px 0; }
  .detail-section code { background: var(--surface); padding: 2px 6px; border-radius: 4px; }
  .tldr-box, .positioning-box {
    background: var(--surface); padding: 10px 13px;
    border-left: 3px solid var(--blue-fg); border-radius: 4px;
    line-height: 1.55; font-size: 13px;
  }
  .tldr-box { border-left-color: var(--green-fg); }
  .edge-trigger { cursor: pointer; user-select: none; }
  .edge-trigger:hover { filter: brightness(0.92); }
  /* Meta chips */
  .detail-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
  .meta-chip {
    display: inline-flex; align-items: center; padding: 2px 9px;
    border-radius: var(--radius-full); font-size: 11px; font-weight: 600;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-3); gap: 3px;
  }
  .meta-chip-comp { background: var(--green-bg); border-color: var(--green-border); color: var(--green); }
  .meta-chip-tier { background: var(--blue-bg);  border-color: var(--blue-border);  color: var(--blue-fg-dark); }
  /* Two-column detail grid */
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .detail-col  { display: flex; flex-direction: column; gap: 8px; }
  @media (max-width: 640px) { .detail-grid { grid-template-columns: 1fr; } }
  .dcard { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; }
  .dcard-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-4); margin-bottom: 6px; }
  .dcard-body { font-size: 12.5px; line-height: 1.55; color: var(--text-2); }
  .dcard-gaps { display: flex; flex-wrap: wrap; gap: 4px; }
  .gap-chip {
    font-size: 11px; padding: 2px 8px;
    background: var(--amber-bg); border: 1px solid var(--amber-border);
    border-radius: var(--radius-full); color: var(--amber);
  }
  .gap-chip-interactive { cursor: pointer; transition: background .12s, transform .1s; }
  .gap-chip-interactive:hover { background: var(--amber-border); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
  /* Section cards — colored left border + uppercase label */
  .dcard--match  { border-left: 3px solid var(--green-fg); }
  .dcard--gap    { border-left: 3px solid var(--amber-fg); }
  .dcard--story  { border-left: 3px solid var(--purple-fg); }
  .dcard--action { border-left: 3px solid var(--blue-fg);
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .dcard--action .dcard-action-text {
    flex: 1; min-width: 200px; font-size: 12.5px;
    line-height: 1.45; color: var(--text-2);
  }
  .dcard--action .dcard-action-buttons {
    display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap;
  }
  .dcard-btn {
    padding: 5px 12px; border-radius: var(--radius-sm); font-size: 12px;
    font-weight: 600; text-decoration: none; white-space: nowrap;
    border: 1px solid var(--border); background: var(--surface-2);
    color: var(--text-2); cursor: pointer; font-family: inherit;
    transition: background .12s, border-color .12s, color .12s;
  }
  .dcard-btn:hover { background: var(--surface); border-color: var(--text-4); color: var(--text); text-decoration: none; }
  .dcard-btn--primary { background: var(--blue-fg); color: #fff; border-color: var(--blue-fg); }
  .dcard-btn--primary:hover { background: var(--blue); color: #fff; border-color: var(--blue); }
  .dcard-gap-prose { font-size: 12px; line-height: 1.5; color: var(--text-3); margin-top: 7px; }
  .dcard-story-row { display: flex; gap: 9px; align-items: flex-start; padding: 6px 0; }
  .dcard-story-row + .dcard-story-row { border-top: 1px dashed var(--border); }
  /* Match list */
  .match-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .match-list li { display: flex; gap: 7px; align-items: flex-start; }
  .match-icon { width: 15px; height: 15px; border-radius: 50%; font-size: 9px; font-weight: 800;
                display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .match-yes .match-icon     { background: var(--green-bg);  color: var(--green); }
  .match-partial .match-icon { background: var(--amber-bg);  color: var(--amber); }
  .match-req { font-size: 12px; font-weight: 600; color: var(--text); line-height: 1.3; }
  .match-ev  { font-size: 11.5px; color: var(--text-3); line-height: 1.4; margin-top: 1px; }
  /* Stories */
  .detail-stories-wrap { margin-bottom: 10px; }
  .story-chips { display: flex; flex-direction: column; gap: 5px; }
  .story-chip {
    display: flex; gap: 9px; align-items: flex-start;
    background: var(--surface); border-left: 3px solid var(--purple-fg);
    border-radius: 4px; padding: 7px 10px;
  }
  .story-n {
    font-size: 10px; font-weight: 700; color: var(--purple-fg-dark);
    background: var(--purple-bg); border-radius: 50%;
    width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 2px;
  }
  .story-req { font-size: 12px; font-weight: 600; color: var(--text); }
  .story-ev  { font-size: 11.5px; color: var(--text-3); margin-top: 2px; line-height: 1.4; }
  /* Recommendation banner */
  .rec-banner {
    display: flex; align-items: center; gap: 10px;
    background: var(--green-bg); border: 1px solid var(--green-border);
    border-radius: var(--radius-sm); padding: 9px 12px; flex-wrap: wrap; margin-top: 4px;
  }
  .rec-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
    background: var(--green-fg-dark); color: #fff; padding: 2px 8px; border-radius: var(--radius-full);
    white-space: nowrap;
  }
  .rec-text  { font-size: 12.5px; color: var(--text-2); flex: 1; min-width: 0; line-height: 1.4; }
  .rec-btn {
    background: var(--green-fg-dark); color: #fff; padding: 5px 13px;
    border-radius: var(--radius-sm); font-size: 12px; font-weight: 600;
    text-decoration: none; white-space: nowrap; transition: background .12s;
  }
  .rec-btn:hover { background: var(--green); color: #fff; text-decoration: none; }
  /* Dark-mode pill overrides — *-fg-dark in dark mode is the LIGHT variant
     used for text on tinted backgrounds, but solid pill bg needs dark text. */
  body.dark .panel-title .pill,
  body.dark .rec-label,
  body.dark .rec-btn,
  body.dark .skip-link { color: #0a0a0b; }
  body.dark .rec-btn:hover { color: #0a0a0b; }

  /* ── Stat panels (expandable) ────────────────────────────────── */
  .stat-panel {
    display: none; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow-sm);
    padding: 20px 24px; margin-bottom: 16px;
  }
  .stat-panel.open { display: block; }
  .stat-panel-title { font-size: 16px; font-weight: 600; margin: 0 0 14px; display: flex; align-items: center; gap: 10px; letter-spacing: -0.2px; }
  .stat-panel-title .pill { font-size: 11px; background: var(--blue-fg); color: #fff; padding: 1px 9px; border-radius: var(--radius-full); }
  .stat-panel .loading { color: var(--text-3); font-size: 13px; padding: 12px 0; }
  /* ── Skeleton loaders ────────────────────────────────────────── */
  .skeleton-stack { display: flex; flex-direction: column; gap: 10px; padding: 6px 0 4px; }
  .skeleton-bar {
    height: 18px; border-radius: var(--radius-sm);
    background: linear-gradient(90deg, var(--surface-2) 0%, var(--border) 50%, var(--surface-2) 100%);
    background-size: 200% 100%; animation: skeleton-pulse 1.4s ease-in-out infinite;
  }
  .skeleton-bar.sk-title { height: 22px; width: 38%; }
  .skeleton-bar.sk-line  { height: 14px; width: 92%; }
  .skeleton-bar.sk-line-short { height: 14px; width: 64%; }
  @keyframes skeleton-pulse {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .skeleton-error { color: var(--red-fg); font-size: 13px; padding: 12px 0; }
  .bucket-grid { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
  .bucket-card {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 12px 16px; min-width: 100px; text-align: center;
  }
  .bucket-card .bval { font-size: 22px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .bucket-card .blbl { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }

  /* ── Batch progress overlay ──────────────────────────────────── */
  #batch-overlay {
    display: none; position: fixed; bottom: 20px; right: 20px; width: 360px; z-index: 1000;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow-lg); font-size: 13px; overflow: hidden;
  }
  #batch-overlay.visible { display: block; }
  .batch-header {
    display: flex; align-items: center; padding: 12px 16px;
    background: var(--surface-2); border-bottom: 1px solid var(--border); gap: 8px;
  }
  .batch-header-title { font-weight: 600; flex: 1; font-size: 13px; color: var(--text); }
  .batch-close { background: none; border: none; cursor: pointer; color: var(--text-3); font-size: 16px; padding: 0 4px; }
  .batch-progress-bar { height: 3px; background: var(--border); }
  .batch-progress-fill { height: 100%; background: linear-gradient(90deg, var(--green-fg), var(--blue-fg)); transition: width .5s; }
  .batch-body { padding: 12px 16px; max-height: 220px; overflow-y: auto; }
  .batch-stat-row { display: flex; justify-content: space-between; padding: 3px 0; }
  .batch-stat-label { color: var(--text-3); }
  .batch-stat-val { font-weight: 600; color: var(--text); }
  .batch-recent { margin-top: 10px; }
  .batch-recent-item { padding: 6px 0; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-3); }
  .batch-recent-item a { color: var(--blue-fg); }

  /* ── Verify modal ────────────────────────────────────────────── */
  #verify-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2000; backdrop-filter: blur(2px); }
  #verify-backdrop.visible { display: block; }
  #verify-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: min(680px,96vw); max-height: 80vh; overflow-y: auto; z-index: 2001;
    background: var(--surface); border-radius: 12px; border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .verify-header {
    position: sticky; top: 0; background: var(--surface); border-bottom: 1px solid var(--border);
    padding: 16px 20px; display: flex; align-items: center; gap: 10px;
    border-radius: 12px 12px 0 0;
  }
  .verify-title { font-size: 15px; font-weight: 600; flex: 1; color: var(--text); }
  .verify-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text-3); padding: 0 2px; }
  .verify-close:hover { color: var(--text); }
  .verify-body { padding: 20px; }
  .verify-section { margin-bottom: 18px; }
  .verify-section h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); font-weight: 700; }
  .verify-claim { padding: 8px 12px; margin: 4px 0; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 13px; line-height: 1.5; }
  .query-card { margin: 6px 0; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
  .query-card-header { padding: 10px 14px; background: var(--surface-2); font-weight: 600; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
  .query-text { padding: 10px 14px; font-size: 12.5px; line-height: 1.6; color: var(--text-3); font-family: ui-monospace, monospace; }
  .copy-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    padding: 3px 10px; font-size: 11px; cursor: pointer; color: var(--text-3); font-family: inherit;
  }
  .copy-btn:hover { background: var(--surface-2); color: var(--text-2); }
  .evidence-area {
    width: 100%; min-height: 100px; padding: 10px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); font-size: 13px; font-family: inherit;
    resize: vertical; background: var(--surface); color: var(--text);
  }
  .evidence-area:focus { outline: none; border-color: var(--blue-fg); box-shadow: var(--ring-blue); }
  .save-evidence-btn {
    margin-top: 8px; background: var(--green-fg); color: #fff; border: none;
    padding: 7px 16px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer; font-family: inherit;
  }
  .save-evidence-btn:hover { background: var(--green); }

  /* ── Gap modal ───────────────────────────────────────────────── */
  #gap-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2000; backdrop-filter: blur(2px); }
  #gap-backdrop.visible { display: block; }
  #gap-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: min(620px,96vw); max-height: 82vh; overflow-y: auto; z-index: 2001;
    background: var(--surface); border-radius: 12px; border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .gap-modal-header {
    position: sticky; top: 0; background: var(--surface); border-bottom: 1px solid var(--border);
    padding: 14px 20px; display: flex; align-items: center; gap: 10px; z-index: 1;
    border-radius: 12px 12px 0 0;
  }
  .gap-modal-badge {
    font-size: 11px; padding: 2px 9px; border-radius: var(--radius-full); font-weight: 600;
    background: var(--amber-bg); border: 1px solid var(--amber-border); color: var(--amber); flex-shrink: 0;
  }
  .gap-modal-title { font-size: 15px; font-weight: 600; flex: 1; color: var(--text); }
  .gap-modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .gap-section { border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border); }
  .gap-section-label {
    padding: 8px 14px; background: var(--surface-2); font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); border-bottom: 1px solid var(--border);
  }
  .gap-section-body { padding: 12px 14px; font-size: 13px; line-height: 1.65; color: var(--text-2); }
  .gap-section-body p { margin: 0 0 6px; }
  .gap-section-body p:last-child { margin: 0; }
  .gap-section-body ul, .gap-section-body ol { margin: 4px 0 6px; padding-left: 22px; }
  .gap-section-body li { margin: 2px 0; }
  .gap-section-body li > p { margin: 0; }
  .gap-section-body h1, .gap-section-body h2, .gap-section-body h3, .gap-section-body h4 {
    margin: 8px 0 4px; font-size: 13px; font-weight: 700; color: var(--text); letter-spacing: -0.1px;
  }
  .gap-section-body code {
    background: var(--surface-2); padding: 1px 5px; border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  }
  .gap-section-body pre {
    background: var(--surface-2); padding: 9px 12px; border-radius: var(--radius-sm);
    overflow-x: auto; font-size: 12px; margin: 6px 0;
  }
  .gap-section-body pre code { background: none; padding: 0; }
  .gap-section-body strong { color: var(--text); font-weight: 600; }
  .gap-section-body a { color: var(--blue-fg); }
  .gap-section.gap-ok { border-color: var(--green-border); }
  .gap-section.gap-ok .gap-section-label { background: var(--green-bg); color: var(--green); border-color: var(--green-border); }
  .gap-section.gap-strategy { border-color: var(--purple-border); }
  .gap-section.gap-strategy .gap-section-label { background: var(--purple-bg); color: var(--purple); border-color: var(--purple-border); }
  .gap-empty { color: var(--text-4); font-style: italic; font-size: 13px; padding: 8px 0; }

  /* ── Toast component ─────────────────────────────────────────── */
  #toast-container {
    position: fixed; right: 18px; bottom: 18px; z-index: 3000;
    display: flex; flex-direction: column; gap: 8px;
    max-width: min(360px, calc(100vw - 36px)); pointer-events: none;
  }
  .toast {
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-left: 3px solid var(--blue-fg);
    border-radius: var(--radius-sm); box-shadow: var(--shadow-md);
    padding: 11px 14px; font-size: 13px; line-height: 1.5;
    pointer-events: auto;
    animation: toast-in .22s ease-out;
    display: flex; align-items: flex-start; gap: 9px;
  }
  .toast.toast-leave { animation: toast-out .25s ease-in forwards; }
  .toast-success { border-left-color: var(--green-fg); }
  .toast-error   { border-left-color: var(--red-fg); }
  .toast-info    { border-left-color: var(--blue-fg); }
  .toast-icon { flex-shrink: 0; font-size: 14px; line-height: 1.45; }
  .toast-success .toast-icon { color: var(--green-fg); }
  .toast-error   .toast-icon { color: var(--red-fg); }
  .toast-info    .toast-icon { color: var(--blue-fg); }
  .toast-msg { flex: 1; min-width: 0; word-wrap: break-word; }
  .toast-close {
    background: none; border: none; cursor: pointer;
    color: var(--text-4); font-size: 14px; padding: 0 0 0 4px;
    flex-shrink: 0; line-height: 1;
  }
  .toast-close:hover { color: var(--text-2); }
  @keyframes toast-in {
    0%   { opacity: 0; transform: translateY(12px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes toast-out {
    0%   { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(8px); }
  }

  /* ── Inline status popover ───────────────────────────────────── */
  .status-pill { cursor: pointer; user-select: none; }
  .status-pill:hover { box-shadow: 0 0 0 2px var(--blue-bg); }
  .status-pill:focus-visible { outline: 2px solid var(--blue-fg); outline-offset: 2px; }
  .status-pill.status-pill-pending { opacity: 0.6; pointer-events: none; }
  #status-popover {
    position: absolute; z-index: 2500;
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    padding: 4px;
    min-width: 140px;
    font-size: 13px;
    display: none;
  }
  #status-popover.is-open { display: block; }
  .status-popover-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 7px 10px;
    background: transparent; border: none; cursor: pointer;
    font: inherit; color: var(--text); text-align: left;
    border-radius: 4px;
    line-height: 1.3;
  }
  .status-popover-item:hover { background: var(--surface-2); }
  .status-popover-item.is-current { font-weight: 600; background: var(--blue-bg); color: var(--blue-fg); }
  .status-popover-item:focus-visible { outline: 2px solid var(--blue-fg); outline-offset: -2px; }
  .status-popover-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  @media (hover: none) and (pointer: coarse), (max-width: 640px) {
    .status-popover-item { min-height: 44px; padding: 12px 14px; }
  }

  /* ── Touch-target audit (>=44x44 on coarse pointers / mobile) ─── */
  @media (hover: none) and (pointer: coarse), (max-width: 640px) {
    .toolbar-btn { min-height: 44px; min-width: 44px; padding: 10px 16px; font-size: 13px; }
    .stat { min-height: 88px; padding: 16px 18px; }
    th.sortable { min-height: 44px; padding-top: 12px; padding-bottom: 12px; }
    tr.row > td { padding-top: 12px; padding-bottom: 12px; }
    .gap-chip-interactive { min-height: 44px; padding: 12px 14px; display: inline-flex; align-items: center; }
    .badge { min-height: 28px; padding: 6px 12px; }
    td > .badge, .badge.score-badge-lg { min-height: 32px; padding: 7px 12px; }
    /* Pills inside tappable rows get a wider hit-area through their td padding above. */
    .batch-close, .verify-close { min-height: 44px; min-width: 44px; padding: 10px; font-size: 18px; }
    #batch-toggle-btn, #dark-toggle { min-height: 44px; min-width: 44px; }
    .rec-btn { min-height: 44px; padding: 12px 18px; display: inline-flex; align-items: center; }
    .filters input, .filters select { min-height: 44px; padding: 10px 12px; font-size: 14px; }
    .verify-submit { min-height: 44px; padding: 12px 20px; }
  }

  /* ── Mobile-only gap chips on cards (hidden on desktop) ───────── */
  .card-gaps-mobile { display: none; }
  .gap-chip-mobile {
    font-size: 11px; padding: 3px 9px;
    background: var(--amber-bg); border: 1px solid var(--amber-border);
    border-radius: var(--radius-full); color: var(--amber);
    white-space: nowrap;
  }

  /* ── Mobile bottom-sheet (drawer) for row detail ──────────────── */
  #mobile-sheet-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.55); z-index: 2500;
    -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
  }
  #mobile-sheet-backdrop.visible { display: block; }
  #mobile-sheet {
    position: fixed; left: 0; right: 0; bottom: 0;
    max-height: 90vh; overflow-y: auto;
    background: var(--surface);
    border-top: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -10px 30px rgba(0,0,0,.25);
    z-index: 2501;
    transform: translateY(100%);
    transition: transform .25s ease-out;
    -webkit-overflow-scrolling: touch;
  }
  #mobile-sheet-backdrop.visible #mobile-sheet { transform: translateY(0); }
  .mobile-sheet-handle {
    width: 40px; height: 4px; border-radius: 2px;
    background: var(--border-strong);
    margin: 8px auto 0;
  }
  .mobile-sheet-header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px 12px;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--surface); z-index: 1;
  }
  .mobile-sheet-title {
    flex: 1; font-weight: 600; font-size: 15px;
    color: var(--text); line-height: 1.35;
    overflow: hidden; text-overflow: ellipsis;
  }
  .mobile-sheet-close {
    background: none; border: none; font-size: 22px; cursor: pointer;
    color: var(--text-3); padding: 0;
    min-height: 44px; min-width: 44px; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm);
  }
  .mobile-sheet-close:hover, .mobile-sheet-close:active { color: var(--text); background: var(--surface-2); }
  .mobile-sheet-body { padding: 12px 14px 24px; }

  /* ── Mobile breakpoint: tables → cards (Apply-Now primary) ────── */
  @media (max-width: 720px) {
    body { padding: 14px 12px 80px; }
    .container { max-width: 100%; }

    /* Tighter toolbar */
    .toolbar h1 { font-size: 18px; }
    .subtle { font-size: 12px; margin-bottom: 14px; }

    /* Stats: 2-up grid */
    .stats { grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 18px; }
    .stat { padding: 14px 14px; min-height: 80px; }
    .stat-value { font-size: 24px; margin-top: 4px; }
    .stat-label { font-size: 10.5px; }
    .stat-caret { font-size: 10px; margin-top: 6px; }

    /* Panels: tighter */
    .panel { padding: 16px 14px; }
    .panel-title { font-size: 15px; }

    /* Filters become full-width stacked controls */
    .filters input, .filters select { width: 100%; min-width: 0; flex: 1 1 100%; }

    /* Charts grid → 1 column on mobile */
    .charts-grid { grid-template-columns: 1fr; gap: 12px; }

    /* Show the gap chips on cards */
    .card-gaps-mobile {
      display: flex; flex-wrap: wrap; gap: 4px;
      margin-top: 8px;
    }

    /* Apply-Now Queue → card layout. Keeps semantic <table> for sort/filter
       JS while CSS rewrites the visual layout for narrow viewports. */
    #apply-now-section .table-scroll {
      max-height: none;
      overflow: visible;
      border-radius: 0;
    }
    #apply-now-section table,
    #apply-now-section thead,
    #apply-now-section tbody,
    #apply-now-section tr.row,
    #apply-now-section tr.row > td {
      display: block;
      width: auto;
    }
    #apply-now-section table { width: 100%; }
    #apply-now-section thead { display: none; }
    #apply-now-section tr.row {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 14px 12px;
      margin: 0 0 10px;
      box-shadow: var(--shadow-sm);
      cursor: pointer;
      min-height: 44px;
      transition: background .12s, border-color .12s;
    }
    #apply-now-section tr.row:active { background: var(--surface-2); border-color: var(--border-strong); }
    #apply-now-section tr.row > td {
      border-bottom: none;
      padding: 0;
      background: transparent !important;
    }
    /* Hide eval date column on mobile (Apply-Now cards & All-Evals scroll
       table); "Age" is the primary recency cue. */
    td.mobile-hide, th.mobile-hide { display: none !important; }
    /* Score chip: top-left, inline */
    #apply-now-section tr.row > td:nth-child(1) {
      display: inline-block;
      margin: 0 10px 6px 0;
      vertical-align: top;
    }
    /* Company line: inline next to score */
    #apply-now-section tr.row > td:nth-child(2) {
      display: inline-block;
      font-size: 15px;
      line-height: 1.35;
      vertical-align: top;
    }
    /* Role: full-width below the title row */
    #apply-now-section tr.row > td.role-cell {
      display: block;
      margin-top: 4px;
      font-size: 13.5px;
      color: var(--text-2);
      font-weight: 500;
      line-height: 1.4;
    }
    /* Status pill + age: bottom meta line */
    #apply-now-section tr.row > td:nth-child(4),
    #apply-now-section tr.row > td:nth-child(6) {
      display: inline-flex;
      align-items: center;
      margin: 8px 8px 0 0;
    }
    /* Action links: separated row, right-aligned, large hit-area */
    #apply-now-section tr.row > td.action-cell {
      display: block;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      text-align: right;
      font-size: 13px;
    }
    #apply-now-section tr.row > td.action-cell a {
      display: inline-block;
      min-height: 44px; line-height: 44px;
      padding: 0 12px;
      margin-left: 4px;
    }

    /* All Evaluations panel: keep tabular layout but allow horizontal scroll */
    #all-tbody, .panel:not(#apply-now-section) tbody { display: table-row-group; }
    #all-tbody tr.row, .panel:not(#apply-now-section) tr.row { display: table-row; }
    #all-tbody tr.row > td, .panel:not(#apply-now-section) tr.row > td { display: table-cell; }
    .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

    /* Inline detail row hidden on mobile — content moves into bottom sheet */
    tr.detail-row { display: none !important; }

    /* Detail card grid → 1 col inside the sheet */
    .detail-grid { grid-template-columns: 1fr !important; }
    .detail-block { padding: 12px; }

    /* Modal sizing */
    #verify-modal, #gap-modal { width: 96vw; max-height: 86vh; }
    .gap-modal-body { padding: 14px; }

    /* Batch overlay: full-width sticky bottom */
    #batch-overlay { left: 12px; right: 12px; bottom: 12px; width: auto; }

    /* Toast positioning: leave room for batch overlay */
    #toast-container { right: 12px; left: 12px; bottom: 12px; max-width: none; }
  }
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
<div class="container">

  <header class="toolbar" role="banner">
    <h1>Career-Ops Dashboard</h1>
    <button class="toolbar-btn cmdk-trigger" onclick="openCmdK()" title="Open command palette (⌘K / Ctrl-K)" aria-label="Open command palette (Cmd+K or Ctrl+K)">
      <span class="cmdk-trigger-label">Search…</span>
      <span class="cmdk-trigger-kbd">⌘K</span>
    </button>
    <button class="toolbar-btn" onclick="toggleDark()" id="dark-toggle" aria-label="Toggle dark mode">☀︎ Light</button>
    <button class="toolbar-btn" id="batch-toggle-btn" onclick="toggleBatchOverlay()" style="display:none" aria-label="Toggle batch progress overlay">⚡ Batch</button>
  </header>
  <div class="subtle" id="dashboard-meta" title="${escape(generated)}"><span id="live-updated">Updated ${escape(generated)}</span> · ${reportsToday} reports today</div>

  <main id="main">

  <!-- Batch progress overlay -->
  <div id="batch-overlay">
    <div class="batch-header">
      <span class="batch-header-title" id="batch-title">⚡ Batch in progress</span>
      <button class="batch-close" onclick="dismissBatchOverlay()">✕</button>
    </div>
    <div class="batch-progress-bar"><div class="batch-progress-fill" id="batch-bar" style="width:0%"></div></div>
    <div class="batch-body" id="batch-body"></div>
  </div>

  <!-- Cmd-K command palette -->
  <div id="cmdk-backdrop" role="dialog" aria-modal="true" aria-label="Command palette" onclick="closeCmdK()">
    <div id="cmdk-modal" onclick="event.stopPropagation()">
      <div class="cmdk-input-wrap">
        <span class="cmdk-input-icon">⌕</span>
        <input id="cmdk-input" type="text" placeholder="Jump to row, run an action, open a recent report…" autocomplete="off" spellcheck="false" />
        <span class="cmdk-input-hint">esc to close</span>
      </div>
      <div id="cmdk-list" role="listbox" aria-label="Command palette results"></div>
      <div class="cmdk-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> select</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  </div>

  <!-- Gap addressing modal -->
  <div id="gap-backdrop" onclick="closeGapModal()">
    <div id="gap-modal" onclick="event.stopPropagation()">
      <div class="gap-modal-header">
        <span class="gap-modal-badge">⚠ Gap</span>
        <div class="gap-modal-title" id="gap-modal-title"></div>
        <button class="verify-close" onclick="closeGapModal()">✕</button>
      </div>
      <div class="gap-modal-body" id="gap-modal-body"></div>
    </div>
  </div>

  <!-- Tier-legend modal -->
  <div id="tier-legend-backdrop" onclick="closeTierLegend()" role="dialog" aria-modal="true" aria-labelledby="tier-legend-title">
    <div id="tier-legend-modal" onclick="event.stopPropagation()">
      <div class="tier-legend-header">
        <div class="tier-legend-title" id="tier-legend-title">Tier badges</div>
        <button class="verify-close" onclick="closeTierLegend()" aria-label="Close">✕</button>
      </div>
      <div class="tier-legend-body" id="tier-legend-body"></div>
    </div>
  </div>

  <!-- Toast container -->
  <div id="toast-container" aria-live="polite" aria-atomic="false"></div>

  <!-- Mobile bottom sheet (slide-up drawer) for row detail on <720px -->
  <div id="mobile-sheet-backdrop" onclick="closeMobileSheet()" role="dialog" aria-modal="true" aria-labelledby="mobile-sheet-title">
    <div id="mobile-sheet" onclick="event.stopPropagation()">
      <div class="mobile-sheet-handle" aria-hidden="true"></div>
      <div class="mobile-sheet-header">
        <div class="mobile-sheet-title" id="mobile-sheet-title"></div>
        <button class="mobile-sheet-close" onclick="closeMobileSheet()" aria-label="Close">✕</button>
      </div>
      <div class="mobile-sheet-body" id="mobile-sheet-body"></div>
    </div>
  </div>

  <!-- Inline status writeback popover -->
  <div id="status-popover" role="menu" aria-label="Set status"></div>

  <!-- Verify claims modal -->
  <div id="verify-backdrop" onclick="closeVerify()">
    <div id="verify-modal" onclick="event.stopPropagation()">
      <div class="verify-header">
        <div class="verify-title" id="verify-title">Verify claims</div>
        <button class="verify-close" onclick="closeVerify()">✕</button>
      </div>
      <div class="verify-body" id="verify-body"></div>
    </div>
  </div>

  <div class="stats">
    <div class="stats-row stats-row-primary">
      <div class="stat ${applyNow.length > 0 ? 'stat-strong' : ''}" onclick="document.getElementById('apply-now-section').scrollIntoView({behavior:'smooth'})" title="Click to scroll to Apply-Now queue">
        <div class="stat-label">Apply-Now (≥ 4.0)</div>
        <div class="stat-value" id="live-apply-now">${applyNow.length}</div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
      <div class="stat" onclick="toggleStatPanel('evaluations')" title="Click to see all evaluations">
        <div class="stat-label">Total evaluations</div>
        <div class="stat-value" id="live-total">${total}</div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
      <div class="stat" onclick="toggleStatPanel('pending')" title="Click to see pipeline">
        <div class="stat-label">Pipeline pending</div>
        <div class="stat-value" id="live-pipeline">${pipelinePending}</div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
    </div>
    <div class="stats-row stats-row-secondary">
      <div class="stat stat-secondary" onclick="toggleStatPanel('applied')" title="Click to see in-flight applications">
        <div class="stat-label">Applied / In process</div>
        <div class="stat-value" id="live-applied">${applied.length}</div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
      <div class="stat stat-secondary">
        <div class="stat-label">Companies tracked</div>
        <div class="stat-value">${portals.tracked}</div>
      </div>
      <div class="stat stat-secondary">
        <div class="stat-label">URLs scanned</div>
        <div class="stat-value" id="live-scanned">${scanTotal}</div>
    </div>
    <div class="stat" onclick="toggleStatPanel('batches')" title="Click to see batch run history">
      <div class="stat-label">Batches run</div>
      <div class="stat-value" id="live-batches">${batchRuns}</div>
      <div class="stat-caret">▾ click to expand</div>
    </div>
  </div>

  <!-- Expandable stat panels (loaded live from /api/detail/*) -->
  <div class="stat-panel" id="stat-panel-evaluations"></div>
  <div class="stat-panel" id="stat-panel-applied"></div>
  <div class="stat-panel" id="stat-panel-pending"></div>
  <div class="stat-panel" id="stat-panel-batches"></div>

  ${applyNow.length > 0 ? `
  <div class="panel panel-strong" id="apply-now-section">
    <div class="panel-title">Apply-Now Queue <span class="pill">${applyNow.length}</span></div>
    <p style="font-size:13px;color:#57606a;margin:0 0 12px">Score ≥ 4.0 with status in {Evaluated, Responded, Interview}. Click any row to expand.</p>
    <div class="table-scroll"><table>
      <thead><tr>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 0, 'num', this)">Score</th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 1, 'str', this)">Company <button type="button" class="tier-legend-btn" title="Tier badge legend" aria-label="Show tier badge legend" onclick="event.stopPropagation();openTierLegend()">?</button></th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 2, 'str', this)">Role</th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 3, 'str', this)">Status</th>
        <th class="sortable mobile-hide" onclick="sortTable('apply-now-tbody', 4, 'str', this)">Eval Date</th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 5, 'num', this)">Age</th>
        <th>Action</th>
      </tr></thead>
      <tbody id="apply-now-tbody">
        ${applyNowRows}
      </tbody>
    </table></div>
  </div>
  ` : `
  <div class="panel" id="apply-now-section">
    <div class="panel-title">Apply-Now Queue</div>
    <p style="color:#57606a;font-size:13px">No evaluations meeting the 4.0 apply floor right now. Either today's batch was wrong-shape (review highest-scored discards below) or the batch hasn't completed yet.</p>
  </div>
  `}

  <div class="panel">
    <div class="panel-title">All Evaluations <span class="pill" style="background:#0969da">${total}</span></div>
    <div class="filters filters-sticky" role="search">
      <input type="search" id="filter-text" placeholder="Search company, role, gaps, stories, recommendation…"
        aria-label="Search evaluations by company, role, gaps, stories, or recommendation" oninput="applyFilters()">
      <select id="filter-tier" aria-label="Filter by archetype tier" onchange="applyFilters()">
        <option value="">All tiers</option>
        <option value="A1">A1 — Residency</option>
        <option value="A2">A2 — AI Builder</option>
        <option value="B">B — Comms / Editorial</option>
      </select>
      <select id="filter-score" aria-label="Filter by minimum score" onchange="applyFilters()">
        <option value="">All scores</option>
        <option value="4">≥ 4.0 only</option>
        <option value="3">≥ 3.0 only</option>
        <option value="2">≥ 2.0 only</option>
      </select>
      <select id="filter-status" aria-label="Filter by application status" onchange="applyFilters()">
        <option value="">All statuses</option>
        <option value="evaluated">Evaluated (no action)</option>
        <option value="applied">Applied</option>
        <option value="interview">Interview</option>
        <option value="discarded">Discarded</option>
        <option value="rejected">Rejected</option>
      </select>
    </div>
    <div class="table-scroll"><table>
      <thead><tr>
        <th class="sortable" onclick="sortTable('all-tbody', 0, 'num', this)">Score</th>
        <th class="sortable" onclick="sortTable('all-tbody', 1, 'str', this)">Company <button type="button" class="tier-legend-btn" title="Tier badge legend" aria-label="Show tier badge legend" onclick="event.stopPropagation();openTierLegend()">?</button></th>
        <th class="sortable" onclick="sortTable('all-tbody', 2, 'str', this)">Role</th>
        <th class="sortable" onclick="sortTable('all-tbody', 3, 'str', this)">Status</th>
        <th class="sortable mobile-hide" onclick="sortTable('all-tbody', 4, 'str', this)">Eval Date</th>
        <th class="sortable" onclick="sortTable('all-tbody', 5, 'num', this)">Age</th>
        <th>Action</th>
      </tr></thead>
      <tbody id="all-tbody">
        ${allRows}
      </tbody>
    </table></div>
  </div>

  <div class="charts-grid">
  <div class="panel">
    <div class="panel-title">Score Distribution</div>
    ${(() => {
      const segDefs = [
        { range: '4.0+',     label: 'Strong',   key: '4.0+',     cls: 's-strong'   },
        { range: '3.0–3.9',  label: 'Good',     key: '3.0-3.9',  cls: 's-good'     },
        { range: '2.0–2.9',  label: 'Moderate', key: '2.0-2.9',  cls: 's-moderate' },
        { range: '1.0–1.9',  label: 'Weak',     key: '1.0-1.9',  cls: 's-weak'     },
        { range: '0–0.9',    label: 'No fit',   key: '0-0.9',    cls: 's-none'     },
      ];
      const totals = segDefs.map(s => buckets[s.key] || 0);
      const totalAll = totals.reduce((a, b) => a + b, 0) || 1;
      return `<div class="seg-bar" role="group" aria-label="Score distribution across ${totalAll} evaluation${totalAll === 1 ? '' : 's'}">
        <div class="seg-bar-counts" aria-hidden="true">
          ${segDefs.map((s, i) => `<div class="seg-bar-count${totals[i] === 0 ? ' zero' : ''}">${totals[i]}</div>`).join('')}
        </div>
        <div class="seg-bar-track">
          ${segDefs.map((s, i) => {
            const pct = ((totals[i]/totalAll)*100).toFixed(0);
            const label = `${s.label.toUpperCase()}: ${totals[i]} evaluation${totals[i] === 1 ? '' : 's'} at ${s.range} (${pct}%)`;
            return `<div class="seg-bar-segment ${s.cls}${totals[i] === 0 ? ' zero' : ''}" style="flex-grow:${totals[i]}" role="img" aria-label="${label}" title="${s.label} (${s.range}): ${totals[i]} (${pct}%)"></div>`;
          }).join('')}
        </div>
        <div class="seg-bar-labels" aria-hidden="true">
          ${segDefs.map(s => `<div class="seg-bar-label">${s.label}<span class="seg-bar-range">${s.range}</span></div>`).join('')}
        </div>
      </div>`;
    })()}
  </div>

  <div class="panel">
    <div class="panel-title">Top Companies (by evaluation count)</div>
    <div class="bar-chart" role="list" aria-label="Top companies by evaluation count">
      ${topCompanies.map(([company, count]) => {
        const max = topCompanies[0][1];
        const pct = (count / max) * 100;
        return `
        <div class="bar-row" role="listitem" aria-label="${escape(company)}: ${count} evaluation${count === 1 ? '' : 's'}">
          <div class="bar-row-label">${escape(company)}</div>
          <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <div class="bar-row-count" aria-hidden="true">${count}</div>
        </div>`;
      }).join('')}
    </div>
  </div>
  </div>

  </main>
</div>

<script>
// ── Dark mode ───────────────────────────────────────────────────
const DARK_KEY = 'career-ops-dark';
function initDark() {
  const saved = localStorage.getItem(DARK_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'dark' || (saved === null && prefersDark)) applyDark(true);
  else applyDark(false);
}
function applyDark(on) {
  document.body.classList.toggle('dark', on);
  const btn = document.getElementById('dark-toggle');
  if (btn) btn.textContent = on ? '☀︎ Light' : '⏾ Dark';
}
function toggleDark() {
  const on = !document.body.classList.contains('dark');
  localStorage.setItem(DARK_KEY, on ? 'dark' : 'light');
  applyDark(on);
}

// ── Row expand ──────────────────────────────────────────────────
const MOBILE_BREAKPOINT_MQ = window.matchMedia('(max-width: 720px)');
function isMobileViewport() { return MOBILE_BREAKPOINT_MQ.matches; }

function toggleDetail(idx) {
  const detail = document.getElementById('detail-' + idx);
  if (!detail) return;
  if (isMobileViewport()) {
    openMobileSheetForDetail(detail);
    return;
  }
  detail.style.display = detail.style.display === 'none' ? '' : 'none';
}

function openMobileSheetForDetail(detailRow) {
  const block = detailRow.querySelector('.detail-block');
  const row = detailRow.previousElementSibling;
  const company = row?.querySelector('td:nth-child(2)')?.innerText.trim() || '';
  const role = row?.querySelector('td:nth-child(3)')?.innerText.trim() || '';
  const title = company + (role ? ' — ' + role : '');
  const titleEl = document.getElementById('mobile-sheet-title');
  const bodyEl = document.getElementById('mobile-sheet-body');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = title || 'Details';
  bodyEl.innerHTML = '';
  if (block) {
    bodyEl.appendChild(block.cloneNode(true));
  } else {
    bodyEl.innerHTML = '<p class="muted">No details available.</p>';
  }
  document.getElementById('mobile-sheet-backdrop').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeMobileSheet() {
  const bd = document.getElementById('mobile-sheet-backdrop');
  if (bd) bd.classList.remove('visible');
  document.body.style.overflow = '';
}

// ESC closes mobile sheet
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileSheet();
});

// If the viewport widens past the breakpoint with the sheet open, close it
// so we don't leave a phantom modal layered over the desktop view.
MOBILE_BREAKPOINT_MQ.addEventListener?.('change', (e) => {
  if (!e.matches) closeMobileSheet();
});

// ── Table filter + sort ─────────────────────────────────────────
function applyFilters() {
  const rawText = (document.getElementById('filter-text').value || '').toLowerCase();
  const text = rawText.replace(/\\s+/g, ' ').trim();
  const tier = document.getElementById('filter-tier').value;
  const score = parseFloat(document.getElementById('filter-score').value || '0');
  const status = document.getElementById('filter-status').value;
  const rows = document.querySelectorAll('#all-tbody tr.row');
  for (const row of rows) {
    const detail = row.nextElementSibling;
    let show = true;
    if (text) {
      const haystack = (row.dataset.search || '') + ' ' + (row.dataset.company || '') + ' ' + (row.dataset.role || '') + ' ' + (row.dataset.status || '');
      if (!haystack.includes(text)) show = false;
    }
    if (tier && row.dataset.archetype !== tier) show = false;
    if (score && parseFloat(row.dataset.score) < score) show = false;
    if (status && !row.dataset.status.includes(status)) show = false;
    row.style.display = show ? '' : 'none';
    if (detail && detail.classList.contains('detail-row'))
      detail.style.display = show && detail.style.display !== 'none' ? detail.style.display : 'none';
  }
}

function sortTable(tbodyId, colIdx, type, thEl) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  // Toggle direction
  const prev = tbody.dataset.sortCol;
  const prevDir = tbody.dataset.sortDir || 'desc';
  const dir = (prev === String(colIdx) && prevDir === 'desc') ? 'asc' : 'desc';
  tbody.dataset.sortCol = colIdx;
  tbody.dataset.sortDir = dir;
  // Update header indicators
  const thead = tbody.closest('table')?.querySelector('thead');
  thead?.querySelectorAll('.sortable').forEach(th => {
    th.querySelector('.sort-arrow')?.remove();
  });
  if (thEl) {
    const arrow = document.createElement('span');
    arrow.className = 'sort-arrow';
    arrow.textContent = dir === 'desc' ? ' ▼' : ' ▲';
    thEl.appendChild(arrow);
  }
  // Collect paired rows (main + detail)
  const allTr = Array.from(tbody.children);
  const pairs = [];
  for (let i = 0; i < allTr.length; i++) {
    if (allTr[i].classList.contains('row')) {
      const next = allTr[i + 1];
      const detail = next?.classList.contains('detail-row') ? next : null;
      pairs.push({ main: allTr[i], detail });
      if (detail) i++;
    }
  }
  pairs.sort((a, b) => {
    const av = a.main.children[colIdx]?.innerText.trim() || '';
    const bv = b.main.children[colIdx]?.innerText.trim() || '';
    let cmp = type === 'num' ? (parseFloat(av) || 0) - (parseFloat(bv) || 0) : av.localeCompare(bv, undefined, {sensitivity:'base'});
    return dir === 'desc' ? -cmp : cmp;
  });
  for (const { main, detail } of pairs) {
    tbody.appendChild(main);
    if (detail) tbody.appendChild(detail);
  }
}

// ── Live API helpers ────────────────────────────────────────────
const BASE = window.location.hostname === 'localhost' || window.location.hostname.endsWith('.careers-ops.com')
  ? '' : null;   // null = file:// mode, no live APIs

async function apiFetch(path) {
  if (BASE === null) return null;
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ── Stat card expand panels ─────────────────────────────────────
const _loadedPanels = {};

async function toggleStatPanel(key) {
  const panel = document.getElementById('stat-panel-' + key);
  if (!panel) return;
  const isOpen = panel.classList.contains('open');

  // Close all other panels
  document.querySelectorAll('.stat-panel.open').forEach(p => {
    p.classList.remove('open');
    const k = p.id.replace('stat-panel-', '');
    document.querySelectorAll('.stat[onclick*="' + k + '"]').forEach(s => s.classList.remove('active'));
  });

  if (isOpen) return;  // just closing

  panel.classList.add('open');
  document.querySelectorAll('.stat[onclick*="' + key + '"]').forEach(s => s.classList.add('active'));

  if (_loadedPanels[key]) return;  // already populated
  _loadedPanels[key] = true;

  panel.innerHTML = '<div class="skeleton-stack" aria-busy="true" aria-label="Loading">'
    + '<div class="skeleton-bar sk-title"></div>'
    + '<div class="skeleton-bar sk-line"></div>'
    + '<div class="skeleton-bar sk-line-short"></div>'
    + '</div>';

  const data = await apiFetch('/api/detail/' + key);
  if (!data) {
    panel.innerHTML = '<div class="skeleton-error">Could not reach live server — view the table below for static data.</div>';
    return;
  }

  panel.innerHTML = renderStatPanel(key, data);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function evalAge(d) {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (isNaN(days) || days < 0) return '';
  if (days < 30) return days + 'd';
  return Math.round(days/7) + 'w';
}
function scoreBadge(s) {
  if (!s && s !== 0) return '<span class="muted">—</span>';
  const cls = s >= 4 ? 'score-strong' : s >= 3 ? 'score-moderate' : 'score-weak';
  return \`<span class="badge \${cls}">\${Number(s).toFixed(1)}</span>\`;
}
function statusKey(st) {
  const s = (st || '').toLowerCase();
  if (s.includes('applied')) return 'applied';
  if (s.includes('responded')) return 'responded';
  if (s.includes('interview')) return 'interview';
  if (s.includes('offer')) return 'offer';
  if (s.includes('reject')) return 'rejected';
  if (s.includes('discard')) return 'discarded';
  if (s.includes('skip')) return 'skip';
  return 'evaluated';
}
function statusBadge(st, num) {
  if (!st) return '';
  const key = statusKey(st);
  const cls = key === 'skip' ? 'status-discarded'
    : key === 'responded' ? 'status-evaluated'
    : \`status-\${key}\`;
  if (num === undefined || num === null || num === '') {
    return \`<span class="badge \${cls}" data-status="\${key}">\${esc(st)}</span>\`;
  }
  return \`<span class="badge status-pill \${cls}" data-status="\${key}" data-num="\${esc(String(num))}" role="button" tabindex="0" onclick="openStatusPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){openStatusPopover(this);event.preventDefault();event.stopPropagation()}" title="Click to change status">\${esc(st)}</span>\`;
}

function rowActions(r) {
  const slug = (r.reportPath || r.report || '').replace(/^reports\\//, '');
  const htmlLink = slug
    ? \`<a href="reports/\${slug.replace(/\\.md$/,'.html')}" target="_blank" onclick="event.stopPropagation()">Report</a>\`
    : '';
  const url = r.reportSummary?.url || '';
  const applyLink = url
    ? \`<a href="\${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Apply</a>\`
    : '';
  const verifyBtn = slug
    ? \`<a href="javascript:void(0)" onclick="openVerify('\${slug}');event.stopPropagation()" style="color:#8250df">Verify</a>\`
    : '';
  return [htmlLink, applyLink, verifyBtn].filter(Boolean).join(' · ') || '<span class="muted">—</span>';
}

function buildTable(rows, panelId) {
  if (!rows || !rows.length) return '<p style="color:#57606a;font-size:13px;margin:0">No items.</p>';
  const trows = rows.map((r, i) => {
    const slug = (r.reportPath || r.report || '').replace(/^reports\\//,'');
    const archetypeFull = r.reportSummary?.archetype || r.archetype || '';
    const tierMatch = archetypeFull.match(/\\b(A1|A2|B)\\b/);
    const archetype = tierMatch ? tierMatch[1] : (archetypeFull.slice(0, 3) || '');
    const tldrRaw = r.reportSummary?.tldr || '';
    const tldr = tldrRaw.includes('|') ? '' : tldrRaw; // skip raw table markdown
    const comp = r.reportSummary?.comp || '';
    const url = r.reportSummary?.url || '';
    const rec = r.reportSummary?.recommendation || '';
    return \`<tr class="row" onclick="toggleDetail('sp-\${panelId}-\${i}')">
      <td>\${scoreBadge(r.score)}</td>
      <td><strong>\${esc(r.company||'')}</strong>\${archetype ? \`<span class="tier-tag" tabindex="0" role="button" data-tooltip="\${esc(tierTooltipJS(archetype))}" aria-label="Tier \${esc(archetype)}: \${esc(tierTooltipJS(archetype))}" onclick="event.stopPropagation();openTierLegend('\${esc(archetype)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openTierLegend('\${esc(archetype)}')}">\${esc(archetype)}</span>\` : ''}</td>
      <td class="role-cell">\${esc(r.role||'')}</td>
      <td>\${statusBadge(r.status, r.num)}</td>
      <td class="muted-text">\${esc(r.date||'')}</td>
      <td class="muted-text">\${evalAge(r.date||'')}</td>
      <td class="action-cell">\${rowActions(r)}</td>
    </tr>
    <tr class="detail-row" id="detail-sp-\${panelId}-\${i}" style="display:none">
      <td colspan="7">
        <div class="detail-block">
          \${(comp || archetype || r.date) ? \`<div class="detail-meta">
            \${comp ? \`<span class="meta-chip meta-chip-comp">💰 \${esc(comp)}</span>\` : ''}
            \${archetype ? \`<span class="meta-chip meta-chip-tier">\${esc(archetype)}</span>\` : ''}
          </div>\` : ''}
          \${tldr ? \`<div class="dcard" style="margin-bottom:8px"><div class="dcard-label">Role at a glance</div><div class="dcard-body">\${esc(tldr)}</div></div>\` : ''}
          \${rec ? \`<div class="rec-banner"><span class="rec-label">Rec</span><span class="rec-text">\${esc(rec)}</span>\${url ? \`<a href="\${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="rec-btn">Apply →</a>\` : ''}</div>\` : url ? \`<div style="font-size:12px;margin-top:6px"><a href="\${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 View JD</a></div>\` : ''}
        </div>
      </td>
    </tr>\`;
  }).join('');

  return \`<div style="overflow-x:auto"><table>
    <thead><tr>
      <th>Score</th><th>Company</th><th>Role</th><th>Status</th><th>Eval Date</th><th>Age</th><th>Action</th>
    </tr></thead>
    <tbody>\${trows}</tbody>
  </table></div>\`;
}

function renderStatPanel(key, data) {
  const title = data.title || key;
  const rows = (data.rows || []).slice(0, 100);
  const count = data.total || rows.length;

  if (key === 'evaluations') {
    // Score bucket cards + status breakdown + recent table
    const buckets = data.buckets || {};
    const byStatus = data.byStatus || {};
    const bucketCards = Object.entries(buckets).map(([label, val]) =>
      \`<div class="bucket-card"><div class="bval">\${val}</div><div class="blbl">\${label}</div></div>\`
    ).join('');
    const statusCards = Object.entries(byStatus).map(([st, val]) =>
      \`<div class="bucket-card"><div class="bval">\${val}</div><div class="blbl">\${st}</div></div>\`
    ).join('');
    return \`<div class="stat-panel-title">\${esc(title)} <span class="pill">\${count}</span> <span style="font-size:12px;color:#57606a;font-weight:400">· live</span></div>
      <div style="margin-bottom:12px"><strong style="font-size:13px">Score distribution</strong><div class="bucket-grid" style="margin-top:8px">\${bucketCards}</div></div>
      <div style="margin-bottom:16px"><strong style="font-size:13px">By status</strong><div class="bucket-grid" style="margin-top:8px">\${statusCards}</div></div>
      <strong style="font-size:13px">Recent evaluations</strong>
      <div style="margin-top:10px">\${buildTable((data.recent || rows).slice(0,30), key)}</div>\`;
  }

  if (key === 'pending') {
    const tiers = data.tiers || [];
    const items = data.items || [];
    const tierCards = tiers.map(t =>
      \`<div class="bucket-card"><div class="bval">\${t.count}</div><div class="blbl">\${esc(t.label)}</div></div>\`
    ).join('');
    const platformColors = {
      LinkedIn: '#0a66c2', Ashby: '#6366f1', Greenhouse: '#1a7f37',
      Lever: '#e36b00', WWR: '#0ea5e9', RemoteOK: '#16a34a',
      Workable: '#7c3aed', Stripe: '#635bff', Coinbase: '#0052ff',
      Amazon: '#f90', Unknown: '#57606a',
    };
    const itemRows = items.slice(0, 100).map(item => {
      const pColor = platformColors[item.platform] || '#57606a';
      const daysLabel = item.daysInQueue != null
        ? (item.daysInQueue > 30
            ? \`<span class="age-stale">\${item.daysInQueue}d ⚠</span>\`
            : \`<span class="age-ok">\${item.daysInQueue}d</span>\`)
        : '';
      const companyCell = item.company
        ? \`<strong>\${esc(item.company)}</strong>\`
        : \`<span class="muted">—</span>\`;
      const roleCell = item.role
        ? \`<span class="role-cell">\${esc(item.role.slice(0,70))}\${item.role.length > 70 ? '…' : ''}</span>\`
        : \`<span class="muted">Unknown</span>\`;
      return \`<tr>
        <td><span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700;background:\${pColor}22;color:\${pColor};border:1px solid \${pColor}55">\${esc(item.platform)}</span></td>
        <td>\${companyCell}</td>
        <td>\${roleCell}</td>
        <td class="muted-text">\${daysLabel}</td>
        <td class="muted-text"><a href="\${esc(item.url)}" target="_blank" rel="noopener" title="\${esc(item.url)}">Open →</a></td>
      </tr>\`;
    }).join('');
    const staleCount = items.filter(i => i.daysInQueue != null && i.daysInQueue > 30).length;
    const staleWarning = staleCount > 0
      ? \`<p style="font-size:12px;color:#cf222e;margin:0 0 12px"><strong>\${staleCount}</strong> items have been pending 30+ days — postings may be closed.</p>\`
      : '';
    return \`<div class="stat-panel-title">\${esc(title)} <span class="pill">\${data.total}</span> <span style="font-size:12px;color:#57606a;font-weight:400">· live</span></div>
      <div class="bucket-grid" style="margin-bottom:12px">\${tierCards}</div>
      \${staleWarning}
      <strong style="font-size:13px">Pending URLs — click Open to preview, then paste URL into chat to evaluate</strong>
      <div style="margin-top:10px;overflow-x:auto;max-height:440px;overflow-y:auto"><table>
        <thead><tr><th>Platform</th><th>Company</th><th>Title / Role</th><th>Age</th><th>Link</th></tr></thead>
        <tbody>\${itemRows}</tbody>
      </table></div>\`;
  }

  if (key === 'batches') {
    const batches = data.batches || [];
    const fmtDuration = ms => {
      if (ms == null || isNaN(ms) || ms < 0) return '—';
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      if (min >= 60) return Math.floor(min/60) + 'h ' + (min%60) + 'm';
      if (min >= 1) return min + 'm ' + (sec ? sec + 's' : '');
      return sec + 's';
    };
    const fmtTime = s => {
      if (!s) return '—';
      try { return new Date(s).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
      catch { return s; }
    };
    if (!batches.length) {
      return \`<div class="stat-panel-title">\${esc(title)} <span class="pill">0</span></div>
        <p style="color:#57606a;font-size:13px;margin:0">No batch runs recorded yet.</p>\`;
    }
    const rowsHtml = batches.map((b, i) => {
      const avg = b.avgScore != null ? scoreBadge(b.avgScore) : '<span class="muted">—</span>';
      const failedCell = b.failed > 0
        ? \`<span style="color:var(--red-fg);font-weight:600">\${b.failed}</span>\`
        : \`<span class="muted">0</span>\`;
      return \`<tr class="row" onclick="selectBatch('\${esc(b.batch_id || '')}')" title="Drill into batch (coming soon)">
        <td class="muted-text">\${esc(fmtTime(b.started_at))}</td>
        <td><strong>\${b.completed}</strong></td>
        <td>\${failedCell}</td>
        <td class="muted-text">\${b.total}</td>
        <td class="muted-text">\${esc(fmtDuration(b.duration_ms))}</td>
        <td>\${avg}</td>
      </tr>\`;
    }).join('');
    const totalCompleted = batches.reduce((a,b) => a + b.completed, 0);
    const totalFailed    = batches.reduce((a,b) => a + b.failed, 0);
    const successRate = (totalCompleted + totalFailed) > 0
      ? Math.round((totalCompleted / (totalCompleted + totalFailed)) * 100)
      : null;
    return \`<div class="stat-panel-title">\${esc(title)} <span class="pill">\${data.total}</span> <span style="font-size:12px;color:#57606a;font-weight:400">· last \${batches.length}</span></div>
      <div class="bucket-grid" style="margin-bottom:12px">
        <div class="bucket-card"><div class="bval">\${totalCompleted}</div><div class="blbl">Completed</div></div>
        <div class="bucket-card"><div class="bval">\${totalFailed}</div><div class="blbl">Failed</div></div>
        <div class="bucket-card"><div class="bval">\${successRate != null ? successRate + '%' : '—'}</div><div class="blbl">Success rate</div></div>
      </div>
      <strong style="font-size:13px">Last \${batches.length} batch runs</strong>
      <div style="margin-top:10px;overflow-x:auto"><table>
        <thead><tr><th>Started</th><th>✓</th><th>✕</th><th>Total</th><th>Duration</th><th>Avg score</th></tr></thead>
        <tbody>\${rowsHtml}</tbody>
      </table></div>\`;
  }

  // Default: title + full table
  return \`<div class="stat-panel-title">\${esc(title)} \${count ? \`<span class="pill">\${count}</span>\` : ''} <span style="font-size:12px;color:#57606a;font-weight:400">· live</span></div>
    \${buildTable(rows, key)}\`;
}

// Drill-down into a specific batch run is a Phase 3 follow-up.
// TODO(phase3): wire selectBatch() to a per-batch detail panel listing each
// row (URL, status, report link, score, error). For now, log + toast.
function selectBatch(batchId) {
  if (!batchId) return;
  if (typeof toast === 'function') toast('Per-batch drill-down coming soon — batch ' + batchId, 'info');
  console.log('[selectBatch] batch_id=' + batchId);
}

// ── Batch progress overlay ──────────────────────────────────────
let _batchInterval = null;
let _batchOverlayDismissed = false;

async function pollBatch() {
  const data = await apiFetch('/api/batch-live');
  if (!data) return;
  const overlay = document.getElementById('batch-overlay');
  const btn = document.getElementById('batch-toggle-btn');

  if (data.total > 0) {
    btn && (btn.style.display = '');
    if (!_batchOverlayDismissed) overlay.classList.add('visible');
    document.getElementById('batch-title').textContent =
      \`⚡ Batch: \${data.completed}/\${data.total} (\${data.pct?.toFixed(0) || 0}%)\`;
    const bar = document.getElementById('batch-bar');
    if (bar) bar.style.width = (data.pct || 0) + '%';

    const recent = (data.rows || []).filter(r => r.status === 'completed').slice(0, 5);
    document.getElementById('batch-body').innerHTML =
      \`<div class="batch-stat-row"><span class="batch-stat-label">Completed</span><span class="batch-stat-val">\${data.completed}</span></div>
       <div class="batch-stat-row"><span class="batch-stat-label">Failed</span><span class="batch-stat-val">\${data.failed || 0}</span></div>
       <div class="batch-stat-row"><span class="batch-stat-label">Running</span><span class="batch-stat-val">\${data.running || 0}</span></div>
       <div class="batch-stat-row"><span class="batch-stat-label">Pending</span><span class="batch-stat-val">\${data.pending || 0}</span></div>
       \${recent.length ? '<div class="batch-recent">' + recent.map(r =>
         \`<div class="batch-recent-item">✅ \${r.company || ''} — \${r.role || r.id || ''}</div>\`
       ).join('') + '</div>' : ''}\`;

    if (data.completed >= data.total && data.total > 0 && !data.running) {
      clearInterval(_batchInterval);
      _batchInterval = null;
    }
  }
}

function dismissBatchOverlay() {
  _batchOverlayDismissed = true;
  document.getElementById('batch-overlay').classList.remove('visible');
}

function toggleBatchOverlay() {
  const el = document.getElementById('batch-overlay');
  const opening = !el.classList.contains('visible');
  if (opening) _batchOverlayDismissed = false;
  el.classList.toggle('visible');
}

// ── Verify claims modal ─────────────────────────────────────────
async function openVerify(slug) {
  const data = await apiFetch('/api/verify/' + slug);
  const title = document.getElementById('verify-title');
  const body = document.getElementById('verify-body');
  if (!data) {
    title.textContent = 'Verify claims';
    body.innerHTML = '<p style="color:#cf222e">Could not load report data. Make sure the dashboard server is running.</p>';
    document.getElementById('verify-backdrop').classList.add('visible');
    return;
  }

  title.textContent = \`\${data.company} — \${data.role}\`;

  const claims = (data.cvMatchClaims || []).map(c => \`<div class="verify-claim">\${c}</div>\`).join('');
  const stars = (data.starStories || []).map(s =>
    \`<div class="verify-claim"><strong>\${s.label}:</strong> \${s.detail}</div>\`
  ).join('');
  const queries = Object.values(data.queries || {}).map(q => \`
    <div class="query-card">
      <div class="query-card-header">
        <span>\${q.label} — \${q.platform}</span>
        <button class="copy-btn" onclick="navigator.clipboard.writeText(this.closest('.query-card').querySelector('.query-text').textContent)">Copy</button>
      </div>
      <div class="query-text">\${q.query}</div>
    </div>\`
  ).join('');

  const evidenceSection = \`
    <div class="verify-section">
      <h4>📝 Add evidence (saved to report Block H)</h4>
      <textarea class="evidence-area" id="evidence-text" placeholder="Paste research findings, recruiter notes, or Grok/Perplexity output here…"></textarea>
      <button class="save-evidence-btn" onclick="saveEvidence('\${data.reportSlug}')">Save to Report</button>
      \${data.hasEvidence ? '<span style="margin-left:10px;color:#8250df;font-size:12px">✦ Evidence block already exists (will be replaced)</span>' : ''}
    </div>\`;

  body.innerHTML = \`
    \${claims ? '<div class="verify-section"><h4>📋 CV match claims to substantiate</h4>' + claims + '</div>' : ''}
    \${stars ? '<div class="verify-section"><h4>⭐ STAR stories</h4>' + stars + '</div>' : ''}
    \${data.finalRec ? '<div class="verify-section"><h4>🎯 Final recommendation</h4><div class="verify-claim">' + data.finalRec + '</div></div>' : ''}
    <div class="verify-section"><h4>🔍 Research queries</h4>\${queries}</div>
    \${evidenceSection}
  \`;

  document.getElementById('verify-backdrop').classList.add('visible');
}

async function saveEvidence(slug) {
  const text = document.getElementById('evidence-text')?.value || '';
  if (!text.trim()) return;
  const r = await fetch('/api/save-evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportSlug: slug, evidenceText: text }),
  });
  const btn = document.querySelector('.save-evidence-btn');
  if (r.ok) {
    if (btn) { btn.textContent = '✅ Saved!'; setTimeout(() => { btn.textContent = 'Save to Report'; }, 2000); }
  } else {
    if (btn) { btn.textContent = '❌ Error'; setTimeout(() => { btn.textContent = 'Save to Report'; }, 2000); }
  }
}

function closeVerify() {
  document.getElementById('verify-backdrop').classList.remove('visible');
}

// ── Gap modal ──────────────────────────────────────────────────
function openGapModal(el) {
  const title = el.dataset.title || '';
  const detail = el.dataset.detail || '';
  const strategy = el.dataset.strategy || '';
  const why = el.dataset.why || '';

  document.getElementById('gap-modal-title').textContent = title;

  const sections = [];

  if (detail) {
    sections.push(\`<div class="gap-section">
      <div class="gap-section-label">What the gap is</div>
      <div class="gap-section-body">\${detail}</div>
    </div>\`);
  }

  if (strategy) {
    sections.push(\`<div class="gap-section gap-strategy">
      <div class="gap-section-label">How to address it</div>
      <div class="gap-section-body">\${strategy}</div>
    </div>\`);
  }

  if (why) {
    sections.push(\`<div class="gap-section gap-ok">
      <div class="gap-section-label">Why this doesn't block you</div>
      <div class="gap-section-body">\${why}</div>
    </div>\`);
  }

  if (!sections.length) {
    sections.push(\`<p class="gap-empty">No additional detail available for this gap.</p>\`);
  }

  document.getElementById('gap-modal-body').innerHTML = sections.join('');
  document.getElementById('gap-backdrop').classList.add('visible');
}

function closeGapModal() {
  document.getElementById('gap-backdrop').classList.remove('visible');
}

// ── Tier-legend modal ──────────────────────────────────────────
const TIER_LEGEND = ${JSON.stringify(TIER_LEGEND)};
const TIER_BY_CODE = Object.fromEntries(TIER_LEGEND.map(t => [t.code, t]));
function tierTooltipJS(code) {
  // Sub-tier variants (A2-AB, A2-AE, A2-PgM, A2-SA) map to A2.
  const base = (String(code).match(/^(A1|A2|B)/) || [])[1] || code;
  const t = TIER_BY_CODE[base];
  return t ? t.code + ' — ' + t.name + '. ' + t.summary : '';
}
let _tierLegendLastFocus = null;
function openTierLegend(highlightCode) {
  _tierLegendLastFocus = document.activeElement;
  const body = document.getElementById('tier-legend-body');
  const base = highlightCode ? (String(highlightCode).match(/^(A1|A2|B)/) || [])[1] : '';
  body.innerHTML = TIER_LEGEND.map(t => {
    const cls = (base && base === t.code) ? 'tier-legend-row tier-row-highlight' : 'tier-legend-row';
    return '<div class="' + cls + '">' +
      '<div class="tier-legend-code">' + esc(t.code) + '</div>' +
      '<div>' +
        '<div class="tier-legend-name">' + esc(t.name) + '</div>' +
        '<div class="tier-legend-summary">' + esc(t.summary) + '</div>' +
        '<div class="tier-legend-examples">Examples: ' + esc(t.examples) + '</div>' +
      '</div></div>';
  }).join('');
  const backdrop = document.getElementById('tier-legend-backdrop');
  backdrop.classList.add('visible');
  const close = backdrop.querySelector('.verify-close');
  if (close) close.focus();
}
function closeTierLegend() {
  document.getElementById('tier-legend-backdrop').classList.remove('visible');
  if (_tierLegendLastFocus && _tierLegendLastFocus.focus) {
    _tierLegendLastFocus.focus();
    _tierLegendLastFocus = null;
  }
}

// ── Live stats refresh ──────────────────────────────────────────
async function refreshLiveStats() {
  const data = await apiFetch('/api/stats');
  if (!data) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.textContent = v; };
  set('live-apply-now', data.applyNow);
  set('live-total', data.totalEvals);
  set('live-applied', data.applied);
  set('live-pipeline', data.pipelinePending);
  set('live-scanned', data.scanned);
  set('live-batches', data.batch?.runs);
  const upd = document.getElementById('live-updated');
  if (upd && data.lastUpdated) {
    const t = new Date(data.lastUpdated).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles'
    });
    upd.textContent = 'Updated ' + t + ' PT';
    const meta = document.getElementById('dashboard-meta');
    if (meta) meta.title = data.lastUpdated;
  }
}

// ── Cmd-K command palette ───────────────────────────────────────
const CMDK_DATA = ${cmdkPayload};
let _cmdkOpen = false;
let _cmdkActive = 0;
let _cmdkItems = [];
let _cmdkPrevFocus = null;

function _cmdkActions() {
  return [
    { id: 'act-dark', icon: '◐', title: 'Toggle dark mode', sub: 'Switch between light and dark theme', run: () => toggleDark() },
    { id: 'act-top',  icon: '↑', title: 'Scroll to top of dashboard', sub: 'Jump to the page header', run: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { id: 'act-apply', icon: '✦', title: 'Open Apply-Now panel', sub: 'Scroll to ranked apply-now queue', run: () => {
      const el = document.getElementById('apply-now-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } },
    { id: 'act-batch', icon: '⚡', title: 'Toggle batch overlay', sub: 'Show or hide the batch progress overlay', run: () => {
      if (typeof toggleBatchOverlay === 'function') toggleBatchOverlay();
      else toast('Batch overlay unavailable', 'info');
    } },
    { id: 'act-scan', icon: '⟳', title: 'Run scan (show command)', sub: 'Display the shell command to run a portal scan', run: () => {
      toast('Run in terminal: node scan.mjs', 'info');
    } },
  ];
}

function _cmdkBuildItems(query) {
  const q = (query || '').trim().toLowerCase();
  const items = [];
  const actions = _cmdkActions();
  const matchedActions = q
    ? actions.filter(a => a.title.toLowerCase().includes(q) || (a.sub || '').toLowerCase().includes(q))
    : actions;
  if (matchedActions.length) {
    items.push({ section: 'Actions' });
    for (const a of matchedActions) items.push({ kind: 'action', ...a });
  }
  const rows = CMDK_DATA.rows || [];
  let matchedRows = rows;
  if (q) {
    matchedRows = rows.filter(r =>
      (r.company || '').toLowerCase().includes(q) ||
      (r.role || '').toLowerCase().includes(q) ||
      String(r.num).startsWith(q) ||
      (r.archetype || '').toLowerCase() === q
    );
  }
  matchedRows = matchedRows.slice(0, q ? 25 : 12);
  if (matchedRows.length) {
    items.push({ section: 'Jump to row' });
    for (const r of matchedRows) {
      items.push({
        kind: 'row',
        id: 'row-' + r.num,
        icon: r.score >= 4 ? '★' : '·',
        title: r.company + ' — ' + r.role,
        sub: '#' + r.num + (r.archetype ? ' · ' + r.archetype : '') + (r.status ? ' · ' + r.status : ''),
        meta: (r.score || 0).toFixed(1),
        rowId: r.rowId,
        num: r.num,
      });
    }
  }
  const reports = CMDK_DATA.reports || [];
  const matchedReports = q
    ? reports.filter(r => r.title.toLowerCase().includes(q))
    : reports;
  if (matchedReports.length) {
    items.push({ section: 'Recent reports' });
    for (const r of matchedReports) {
      items.push({
        kind: 'report',
        id: 'rep-' + r.slug,
        icon: '📄',
        title: r.title,
        sub: r.date ? 'Generated ' + r.date : '',
        slug: r.slug,
      });
    }
  }
  return items;
}

function _cmdkRender() {
  const list = document.getElementById('cmdk-list');
  if (!list) return;
  const flat = _cmdkItems.filter(it => it.kind);
  if (!flat.length) {
    list.innerHTML = '<div class="cmdk-empty">No matches</div>';
    return;
  }
  let activeFlat = 0;
  let html = '';
  let flatIdx = 0;
  for (const it of _cmdkItems) {
    if (it.section) {
      html += '<div class="cmdk-section-label">' + it.section + '</div>';
      continue;
    }
    const isActive = flatIdx === _cmdkActive;
    if (isActive) activeFlat = flatIdx;
    html += '<div class="cmdk-item' + (isActive ? ' active' : '') + '" role="option" data-flat="' + flatIdx + '">'
         + '<span class="cmdk-item-icon">' + it.icon + '</span>'
         + '<div class="cmdk-item-body">'
         + '<div class="cmdk-item-title">' + _cmdkEsc(it.title) + '</div>'
         + (it.sub ? '<div class="cmdk-item-sub">' + _cmdkEsc(it.sub) + '</div>' : '')
         + '</div>'
         + (it.meta ? '<span class="cmdk-item-meta">' + _cmdkEsc(it.meta) + '</span>' : '')
         + '</div>';
    flatIdx++;
  }
  list.innerHTML = html;
  list.querySelectorAll('.cmdk-item').forEach(el => {
    el.addEventListener('mousemove', () => {
      const i = parseInt(el.dataset.flat, 10);
      if (i !== _cmdkActive) { _cmdkActive = i; _cmdkRender(); }
    });
    el.addEventListener('click', () => {
      _cmdkActive = parseInt(el.dataset.flat, 10);
      _cmdkExecute();
    });
  });
  const activeEl = list.querySelector('.cmdk-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function _cmdkEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function _cmdkRefresh() {
  const input = document.getElementById('cmdk-input');
  _cmdkItems = _cmdkBuildItems(input ? input.value : '');
  const flatCount = _cmdkItems.filter(it => it.kind).length;
  if (_cmdkActive >= flatCount) _cmdkActive = 0;
  _cmdkRender();
}

function openCmdK() {
  if (_cmdkOpen) return;
  _cmdkOpen = true;
  _cmdkPrevFocus = document.activeElement;
  const bd = document.getElementById('cmdk-backdrop');
  const input = document.getElementById('cmdk-input');
  if (!bd || !input) return;
  bd.classList.add('visible');
  input.value = '';
  _cmdkActive = 0;
  _cmdkRefresh();
  setTimeout(() => input.focus(), 0);
}

function closeCmdK() {
  if (!_cmdkOpen) return;
  _cmdkOpen = false;
  const bd = document.getElementById('cmdk-backdrop');
  if (bd) bd.classList.remove('visible');
  if (_cmdkPrevFocus && typeof _cmdkPrevFocus.focus === 'function') {
    try { _cmdkPrevFocus.focus(); } catch (e) {}
  }
}

function _cmdkExecute() {
  const flat = _cmdkItems.filter(it => it.kind);
  const it = flat[_cmdkActive];
  if (!it) return;
  closeCmdK();
  if (it.kind === 'action') {
    setTimeout(() => it.run(), 30);
  } else if (it.kind === 'row') {
    setTimeout(() => _cmdkJumpToRow(it.rowId, it.num), 30);
  } else if (it.kind === 'report') {
    window.open('reports/' + it.slug, '_blank', 'noopener');
  }
}

function _cmdkJumpToRow(rowId, num) {
  const tbody = document.getElementById('all-tbody');
  if (!tbody) return;
  let row = rowId ? tbody.querySelector('tr.row[data-row-id="' + rowId + '"]') : null;
  if (!row && num != null) row = tbody.querySelector('tr.row[data-num="' + num + '"]');
  if (!row) { toast('Row not found', 'info'); return; }
  // Clear filters so the row is visible
  const ft = document.getElementById('filter-text');
  const fT = document.getElementById('filter-tier');
  const fS = document.getElementById('filter-score');
  const fSt = document.getElementById('filter-status');
  if (ft) ft.value = '';
  if (fT) fT.value = '';
  if (fS) fS.value = '';
  if (fSt) fSt.value = '';
  if (typeof applyFilters === 'function') applyFilters();
  row.style.display = '';
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('cmdk-flash');
  // Force reflow so the animation re-triggers each invocation.
  void row.offsetWidth;
  row.classList.add('cmdk-flash');
  setTimeout(() => row.classList.remove('cmdk-flash'), 1700);
}

document.addEventListener('keydown', e => {
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
  const cmdK = (isMac ? e.metaKey : e.ctrlKey) && (e.key === 'k' || e.key === 'K');
  if (cmdK) {
    e.preventDefault();
    if (_cmdkOpen) closeCmdK(); else openCmdK();
    return;
  }
  if (!_cmdkOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); closeCmdK(); return; }
  if (e.key === 'Tab') { e.preventDefault(); return; } // focus trap
  const flat = _cmdkItems.filter(it => it.kind);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (flat.length) { _cmdkActive = (_cmdkActive + 1) % flat.length; _cmdkRender(); }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (flat.length) { _cmdkActive = (_cmdkActive - 1 + flat.length) % flat.length; _cmdkRender(); }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    _cmdkExecute();
  } else if (e.key === 'Home') {
    e.preventDefault();
    _cmdkActive = 0; _cmdkRender();
  } else if (e.key === 'End') {
    e.preventDefault();
    _cmdkActive = Math.max(0, flat.length - 1); _cmdkRender();
  }
});

// Script runs after DOM is parsed (placed at end of body); attach immediately.
(function _cmdkInit() {
  const input = document.getElementById('cmdk-input');
  if (input) input.addEventListener('input', () => { _cmdkActive = 0; _cmdkRefresh(); });
})();

// ── Keyboard shortcuts ──────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (typeof _cmdkOpen !== 'undefined' && _cmdkOpen) return;
  if (e.key === 'Escape') { closeVerify(); closeGapModal(); closeTierLegend(); closeStatusPopover(); }
});

// ── Inline status writeback ─────────────────────────────────────
const STATUS_CANONICAL = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP'];
const STATUS_CLASS_MAP = {
  evaluated: 'status-evaluated',
  applied:   'status-applied',
  responded: 'status-evaluated',
  interview: 'status-interview',
  offer:     'status-offer',
  rejected:  'status-rejected',
  discarded: 'status-discarded',
  skip:      'status-discarded',
};
let _statusActiveBadge = null;
let _statusOutsideHandler = null;

function statusClassFor(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('applied')) return 'status-applied';
  if (s.includes('interview')) return 'status-interview';
  if (s.includes('offer')) return 'status-offer';
  if (s.includes('reject')) return 'status-rejected';
  if (s.includes('discard') || s.includes('skip')) return 'status-discarded';
  return 'status-evaluated';
}

function clearStatusClasses(el) {
  el.classList.remove('status-evaluated','status-applied','status-interview','status-offer','status-rejected','status-discarded');
}

function openStatusPopover(badgeEl) {
  closeStatusPopover();
  const pop = document.getElementById('status-popover');
  if (!pop || !badgeEl) return;
  _statusActiveBadge = badgeEl;
  const current = (badgeEl.textContent || '').trim();
  pop.innerHTML = STATUS_CANONICAL.map(s => {
    const isCurrent = s.toLowerCase() === current.toLowerCase();
    const cls = STATUS_CLASS_MAP[s.toLowerCase()] || 'status-evaluated';
    return '<button type="button" role="menuitem" class="status-popover-item' + (isCurrent ? ' is-current' : '') + '" data-status="' + s + '">'
      + '<span class="status-popover-dot badge ' + cls + '" aria-hidden="true" style="padding:0;min-height:0;width:8px;height:8px;border-radius:50%"></span>'
      + s + (isCurrent ? ' ✓' : '')
      + '</button>';
  }).join('');
  pop.querySelectorAll('.status-popover-item').forEach(btn => {
    btn.addEventListener('click', evt => {
      evt.stopPropagation();
      applyStatus(btn.dataset.status);
    });
  });
  // Anchor below the badge, viewport-clamped
  const rect = badgeEl.getBoundingClientRect();
  pop.classList.add('is-open');
  const popW = pop.offsetWidth || 160;
  let left = rect.left + window.scrollX;
  const maxLeft = window.scrollX + window.innerWidth - popW - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);
  pop.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
  pop.style.left = left + 'px';
  // Outside-click to close (next tick so we don't catch the opening click)
  _statusOutsideHandler = (evt) => {
    if (evt.target.closest('#status-popover')) return;
    if (evt.target === badgeEl) return;
    closeStatusPopover();
  };
  setTimeout(() => document.addEventListener('click', _statusOutsideHandler), 0);
}

function closeStatusPopover() {
  const pop = document.getElementById('status-popover');
  if (pop) { pop.classList.remove('is-open'); pop.innerHTML = ''; }
  _statusActiveBadge = null;
  if (_statusOutsideHandler) {
    document.removeEventListener('click', _statusOutsideHandler);
    _statusOutsideHandler = null;
  }
}

async function applyStatus(newStatus) {
  if (!_statusActiveBadge) return;
  const badge = _statusActiveBadge;
  const num = badge.dataset.num;
  const original = (badge.textContent || '').trim();
  if (!num) { closeStatusPopover(); return; }
  if (newStatus === original) { closeStatusPopover(); return; }
  const tr = badge.closest('tr');
  const originalRowStatus = tr ? tr.dataset.status : null;

  // Optimistic UI swap
  badge.textContent = newStatus;
  clearStatusClasses(badge);
  badge.classList.add(statusClassFor(newStatus));
  badge.classList.add('status-pill-pending');
  if (tr) tr.dataset.status = newStatus.toLowerCase();
  closeStatusPopover();

  try {
    const res = await fetch('/api/status', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ num: parseInt(num, 10), status: newStatus }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data.ok) {
      throw new Error(data && data.error ? data.error : ('HTTP ' + res.status));
    }
    badge.classList.remove('status-pill-pending');
    if (window.toast) window.toast('#' + num + ' → ' + newStatus, 'success');
  } catch (err) {
    // Revert
    badge.textContent = original;
    clearStatusClasses(badge);
    badge.classList.add(statusClassFor(original));
    badge.classList.remove('status-pill-pending');
    if (tr && originalRowStatus !== null) tr.dataset.status = originalRowStatus;
    if (window.toast) window.toast('Status update failed: ' + (err && err.message || 'unknown error'), 'error');
  }
}

window.openStatusPopover = openStatusPopover;
window.closeStatusPopover = closeStatusPopover;
window.applyStatus = applyStatus;

// ── Toast ───────────────────────────────────────────────────────
window.toast = function(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = type === 'success' || type === 'error' || type === 'info' ? type : 'info';
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = 'toast toast-' + t;
  el.setAttribute('role', t === 'error' ? 'alert' : 'status');
  el.innerHTML = '<span class="toast-icon">' + icons[t] + '</span>'
    + '<span class="toast-msg"></span>'
    + '<button class="toast-close" aria-label="Dismiss">✕</button>';
  el.querySelector('.toast-msg').textContent = String(msg ?? '');
  const dismiss = () => {
    if (el.classList.contains('toast-leave')) return;
    el.classList.add('toast-leave');
    setTimeout(() => el.remove(), 260);
  };
  el.querySelector('.toast-close').addEventListener('click', dismiss);
  container.appendChild(el);
  setTimeout(dismiss, 4000);
  return el;
};

// ── Init ────────────────────────────────────────────────────────
initDark();
refreshLiveStats();
_batchInterval = setInterval(pollBatch, 2000);
pollBatch();
setInterval(refreshLiveStats, 30000);

// ── PWA service worker ─────────────────────────────────────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .catch(err => console.warn('[sw] registration failed:', err));
  });
}
</script>

<!-- ── Share-link / demo-mode (read-only recruiter view) ──────── -->
<style>
  /* Banner */
  #share-banner {
    display: none;
    position: sticky; top: 0; z-index: 3000;
    padding: 10px 16px;
    background: linear-gradient(90deg, #fef3c7, #fde68a);
    color: #78350f;
    font-size: 13px; font-weight: 600;
    border-bottom: 1px solid #f59e0b;
    text-align: center;
  }
  body.share-mode #share-banner { display: block; }
  body.share-mode { padding-top: 0; }

  /* Hide write-action surfaces in share mode */
  body.share-mode .action-cell a[href]:not([href^="#"]):not([href^="reports/"]),
  body.share-mode .action-cell a[onclick*="openVerify"],
  body.share-mode .dcard--action,
  body.share-mode .rec-btn,
  body.share-mode #batch-toggle-btn,
  body.share-mode #batch-overlay,
  body.share-mode .toolbar-btn.cmdk-trigger,
  body.share-mode #cmdk-backdrop,
  body.share-mode #verify-backdrop,
  body.share-mode [data-action="skip"],
  body.share-mode [data-action="defer"] {
    display: none !important;
  }

  /* Status pills become non-interactive */
  body.share-mode .status-pill {
    pointer-events: none !important;
    cursor: default !important;
    opacity: 0.85;
  }
  body.share-mode #status-popover { display: none !important; }

  /* Demo redaction visual hint */
  body.demo-mode .meta-chip-comp { opacity: 0.65; }
</style>
<div id="share-banner" role="status" aria-live="polite">
  <span id="share-banner-text">Read-only share — loading…</span>
</div>
<script>
// ── Share / demo bootstrap ─────────────────────────────────────
(function () {
  var params = new URLSearchParams(window.location.search);
  var shareToken = params.get('share');
  var demoMode = params.get('demo') === '1';
  if (!shareToken && !demoMode) return;

  function init() {
    if (shareToken) {
      document.body.classList.add('share-mode');
      fetch('/api/share/verify?token=' + encodeURIComponent(shareToken))
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (j) {
          var el = document.getElementById('share-banner-text');
          if (!el) return;
          if (j && j.valid && j.expires) {
            var d = new Date(j.expires);
            el.textContent = 'Read-only share — expires ' + d.toLocaleString();
          } else {
            el.textContent = 'Read-only share — link expired or invalid';
          }
        })
        .catch(function () {
          var el = document.getElementById('share-banner-text');
          if (el) el.textContent = 'Read-only share — server unavailable';
        });
    }
    if (demoMode) {
      document.body.classList.add('demo-mode');
      runDemoSwap();
    }
  }

  function companyLabel(idx) {
    if (idx < 26) return '[Company ' + String.fromCharCode(65 + idx) + ']';
    var first = Math.floor(idx / 26) - 1;
    var second = idx % 26;
    return '[Company ' + String.fromCharCode(65 + first) + String.fromCharCode(65 + second) + ']';
  }

  function buildCompanyMap() {
    var map = new Map();
    document.querySelectorAll('[data-company]').forEach(function (el) {
      var raw = (el.getAttribute('data-company') || '').trim();
      if (!raw) return;
      if (!map.has(raw)) map.set(raw, companyLabel(map.size));
    });
    return map;
  }

  function escapeRegex(s) {
    return s.replace(/[\\\\^.*+?()[\\]{}|]/g, '\\\\$&').replace(/\\$/g, '\\\\$');
  }

  function runDemoSwap() {
    var map = buildCompanyMap();
    if (map.size === 0) return;

    document.querySelectorAll('tr[data-company]').forEach(function (tr) {
      var raw = (tr.getAttribute('data-company') || '').trim();
      var label = map.get(raw);
      if (!label) return;
      var strong = tr.querySelector('td:nth-child(2) strong');
      if (strong) strong.textContent = label;
      tr.removeAttribute('data-search');
      tr.setAttribute('data-company', label.toLowerCase());
    });

    var realNames = Array.from(map.keys()).filter(function (n) { return n.length >= 3; });
    realNames.sort(function (a, b) { return b.length - a.length; });
    var globalRe = null;
    if (realNames.length) {
      var alt = realNames.map(escapeRegex).join('|');
      globalRe = new RegExp('\\\\b(' + alt + ')\\\\b', 'gi');
    }

    if (globalRe) {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          var p = n.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (p.closest('script,style,#share-banner')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var node;
      while ((node = walker.nextNode())) {
        var orig = node.nodeValue;
        var swapped = orig.replace(globalRe, function (m) {
          return map.get(m.toLowerCase()) || m;
        });
        if (swapped !== orig) node.nodeValue = swapped;
      }
    }

    document.querySelectorAll('.meta-chip-comp').forEach(function (el) {
      el.textContent = '💰 [comp redacted]';
    });

    var emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/gi;
    var w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        emailRe.lastIndex = 0;
        if (!n.nodeValue || !emailRe.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || p.closest('script,style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n2;
    while ((n2 = w2.nextNode())) {
      n2.nodeValue = n2.nodeValue.replace(emailRe, '[email redacted]');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>
</body>
</html>`;

  writeFileSync(OUT_PATH, html);
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  Total evaluations: ${total}`);
  console.log(`  Apply-Now queue:   ${applyNow.length}`);
  console.log(`  Pipeline pending:  ${pipelinePending}`);
  console.log(`  Reports rendered:  ${renderedCount} → dashboard/reports/`);
  console.log(`Open with: open dashboard/index.html`);
}

build();
