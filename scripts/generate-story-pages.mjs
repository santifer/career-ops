#!/usr/bin/env node
// scripts/generate-story-pages.mjs — expand "stories to lead with" from Apply-Now
// reports into 500-1000 word voice-calibrated child pages.
//
// Process per story:
//   1. Extract story from report Block F (top-stories table)
//   2. Deduplicate by signature (first 80 chars normalized)
//   3. Build a Claude/Sonnet prompt that includes:
//        - The original story (from the report)
//        - voice-reference.md (Mitchell's voice corpus)
//        - cv.md (canonical source of truth)
//        - article-digest.md (proof-point ledger)
//   4. Hard rule: NEVER invent metrics or experience beyond what's documented
//   5. Run humanize-check.mjs on the output; regenerate once if MEDIUM/HIGH risk
//   6. Write to dashboard/stories/{slug}.html
//   7. Build/refresh index page dashboard/stories/index.html
//
// Usage:
//   node scripts/generate-story-pages.mjs              # all Apply-Now stories
//   node scripts/generate-story-pages.mjs --max=5      # cost cap
//   node scripts/generate-story-pages.mjs --dry-run    # list, no API
//   node scripts/generate-story-pages.mjs --slug=foo   # regenerate one

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env'), override: true });

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getOpt = (prefix) => {
  const a = args.find(x => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : null;
};
const DRY_RUN = hasFlag('--dry-run');
const MAX     = parseInt(getOpt('--max=') || '999', 10);
const SLUG    = getOpt('--slug=');

const STORIES_DIR = join(ROOT, 'dashboard', 'stories');
const APPLY_NOW_PATH = join(ROOT, 'data', 'apply-now-queue.json');
const REPORTS_DIR = join(ROOT, 'reports');

if (!existsSync(STORIES_DIR)) mkdirSync(STORIES_DIR, { recursive: true });

console.log('═══ story-page generator ═══');
console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} · max=${MAX}${SLUG ? ` · slug=${SLUG}` : ''}`);

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function _extractSection(text, regex) {
  const m = text.match(regex);
  if (!m) return '';
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const next = rest.match(/\n## /);
  return next ? rest.slice(0, next.index) : rest;
}

function _parseTopStories(text) {
  const block = _extractSection(text, /^## (?:F\)|Block F)[^\n]*$/m);
  if (!block) return [];
  const stories = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;
    if (/^\|\s*#\s*\|\s*JD\s*Requirement/i.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    const num = cells[0];
    const requirement = cells[1];
    const story = cells[2];
    if (!num || !requirement || !story) continue;
    if (!/^\d/.test(num)) continue;
    stories.push({ num, requirement, story });
  }
  return stories;
}

// Step 1: Collect candidate stories from Apply-Now queue.
const applyNow = existsSync(APPLY_NOW_PATH) ? JSON.parse(readFileSync(APPLY_NOW_PATH, 'utf-8')) : { rows: [] };
const candidateStories = [];
for (const row of (applyNow.ranked || applyNow.rows || [])) {
  // report field comes in markdown-link format: "[581](reports/581-foo.md)" — extract path.
  let reportPath = row.report_path || row.reportPath || '';
  if (!reportPath && row.report) {
    const m = row.report.match(/\(([^)]+\.md)\)/);
    if (m) reportPath = m[1];
  }
  if (!reportPath) continue;
  const fp = reportPath.startsWith('/') ? reportPath : join(ROOT, reportPath);
  if (!existsSync(fp)) continue;
  const text = readFileSync(fp, 'utf-8');
  const stories = _parseTopStories(text);
  for (const s of stories.slice(0, 3)) {
    candidateStories.push({
      ...s,
      sourceReport: reportPath,
      sourceCompany: row.company,
      sourceRole: row.role,
    });
  }
}

// Step 2: Deduplicate by normalized signature.
function signature(s) {
  return String(s.story || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').slice(0, 80).trim();
}
const seen = new Map();
for (const s of candidateStories) {
  const sig = signature(s);
  if (!sig) continue;
  if (!seen.has(sig)) seen.set(sig, s);
}
const uniqueStories = Array.from(seen.values());
console.log(`  Stories: ${candidateStories.length} candidates → ${uniqueStories.length} unique`);

// Filter by --slug if requested
let toGenerate = uniqueStories;
if (SLUG) toGenerate = uniqueStories.filter(s => slugify(s.story.slice(0, 60)) === SLUG);

// Cap by --max
toGenerate = toGenerate.slice(0, MAX);
console.log(`  Working set: ${toGenerate.length}`);

if (DRY_RUN) {
  for (const s of toGenerate) {
    console.log(`  - ${slugify(s.story.slice(0, 60))} (${s.sourceCompany})`);
  }
  process.exit(0);
}

// Step 3: Load voice corpus + ground truth files.
const voiceRef    = readFileSync(join(ROOT, 'writing-samples/voice-reference.md'), 'utf-8');
const cvMd        = readFileSync(join(ROOT, 'cv.md'), 'utf-8');
const articleDigest = existsSync(join(ROOT, 'article-digest.md')) ? readFileSync(join(ROOT, 'article-digest.md'), 'utf-8') : '';

// Step 4: Generate each story page.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('FATAL: ANTHROPIC_API_KEY not set');
  process.exit(1);
}

async function generateStoryPage(story) {
  const prompt = `You are Mitchell Williams writing a 600-900 word expansion of one of his "stories to lead with" for AI-native job interviews. The output will be a child-page in his career-ops dashboard.

HARD RULES:
- NEVER invent metrics, dates, or experience beyond what's documented in the corpus below
- Voice must match Mitchell's voice-reference.md style (precision, directness, editorial pace, em-dash usage, AP-style numbers)
- First person ("I", not "Mitchell")
- Structure: 1 short lead paragraph (situation), 2-3 paragraphs on the action + craft details, 1 paragraph on the measurable result, 1 short reflection paragraph
- Use ONLY metrics/specifics that appear in CV or article-digest
- No AI-isms: avoid "leverage", "synergy", "ensure", "leverage", "delve", "tapestry", "robust"
- No bullet lists — flowing prose only
- 600-900 words target

JD requirement this story addresses: "${story.requirement}"
Source report context: ${story.sourceCompany} — ${story.sourceRole}

The original short version of this story (from report Block F):
${story.story}

═══ Mitchell's voice reference (style anchor) ═══
${voiceRef.slice(0, 6000)}

═══ Mitchell's CV (source of truth — only use facts/metrics from here) ═══
${cvMd}

═══ Article digest (additional proof points; only use what's here) ═══
${articleDigest.slice(0, 6000)}

Write the expanded story now. Output the prose body ONLY — no header, no metadata, no preamble.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  return j.content?.[0]?.text || '';
}

async function checkHumanize(text) {
  // Write to a temp file, run humanize-check, parse JSON.
  const tmp = join('/tmp', `story-humanize-${Date.now()}.txt`);
  writeFileSync(tmp, text);
  try {
    const out = execFileSync('node', [join(ROOT, 'scripts/humanize-check.mjs'), '--file', tmp, '--json'], { encoding: 'utf-8' });
    return JSON.parse(out);
  } catch (e) {
    return { risk: 'unknown', score: 0, band: 'unknown' };
  }
}

const PAGE_TEMPLATE = (story, body, riskBand, scoreNum) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${story.requirement.slice(0, 70)} — Mitchell Williams</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.65; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 6px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
  .body { font-size: 15px; }
  .body p { margin: 0 0 16px; }
  .footer { font-size: 11px; color: #888; margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; }
  .humanize-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .humanize-low { background: #d4f4dd; color: #1a6b2b; }
  .humanize-medium { background: #fff4d4; color: #6b5b1a; }
  .humanize-high { background: #f4d4d4; color: #6b1a1a; }
  a { color: #0a66c2; text-decoration: none; }
  a:hover { text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1a1a; color: #e8e8e8; }
    .meta, .footer { color: #999; }
    .footer { border-top-color: #333; }
  }
</style>
</head><body>
<h1>${story.requirement.slice(0, 110)}</h1>
<div class="meta">
  Source: ${story.sourceCompany} — ${story.sourceRole} ·
  <span class="humanize-badge humanize-${riskBand}">Humanize: ${scoreNum}% ${riskBand}</span>
</div>
<div class="body">
${body.split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, ' ').trim() + '</p>').join('\n')}
</div>
<div class="footer">
  Generated ${new Date().toISOString().slice(0, 10)} · voice-calibrated against writing-samples/voice-reference.md, cv.md, article-digest.md ·
  <a href="../index.html">← back to dashboard</a>
</div>
</body></html>`;

const generated = [];
const skipped = [];
let cost = 0;

for (let i = 0; i < toGenerate.length; i++) {
  const story = toGenerate[i];
  const slug = slugify(story.story.slice(0, 60));
  const outFp = join(STORIES_DIR, `${slug}.html`);

  // Skip if exists and not forced regen
  if (!SLUG && existsSync(outFp)) {
    skipped.push({ slug, reason: 'already-exists' });
    continue;
  }

  console.log(`[${i + 1}/${toGenerate.length}] ${slug.slice(0, 50)}`);
  try {
    let body = await generateStoryPage(story);
    let humanize = await checkHumanize(body);
    let regenerated = false;

    // If humanize risk is MEDIUM or HIGH, regenerate once
    const riskLevel = String(humanize.risk || '').toLowerCase();
    if (riskLevel === 'medium' || riskLevel === 'high' || riskLevel === 'critical') {
      console.log(`   humanize: ${humanize.score}% ${humanize.risk} — regenerating`);
      body = await generateStoryPage(story);
      humanize = await checkHumanize(body);
      regenerated = true;
    }

    const wordCount = body.split(/\s+/).length;
    const finalRisk = String(humanize.risk || 'unknown').toLowerCase();
    writeFileSync(outFp, PAGE_TEMPLATE(story, body, finalRisk, humanize.score ?? 0));
    cost += regenerated ? 0.50 : 0.30;
    console.log(`   ✓ ${wordCount} words · humanize ${humanize.score}% ${humanize.risk}`);
    generated.push({ slug, words: wordCount, humanize: humanize.risk });
  } catch (e) {
    console.log(`   ✗ ${e.message}`);
    skipped.push({ slug, reason: 'error', error: e.message });
  }
}

// Step 5: Build/refresh index page listing all generated stories.
const allStoryFiles = readdirSync(STORIES_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
const INDEX_TEMPLATE = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Story Library — Mitchell Williams</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; line-height: 1.55; }
  h1 { font-size: 22px; }
  ul { list-style: none; padding: 0; }
  li { margin: 8px 0; padding: 10px 14px; background: #f5f5f5; border-radius: 6px; }
  a { color: #0a66c2; text-decoration: none; font-weight: 500; }
  @media (prefers-color-scheme: dark) { body { background: #1a1a1a; color: #e8e8e8; } li { background: #2a2a2a; } }
</style>
</head><body>
<h1>Story Library</h1>
<p>${allStoryFiles.length} voice-calibrated story expansions, generated from Apply-Now report Block F.</p>
<ul>
${allStoryFiles.map(f => `  <li><a href="${f}">${f.replace(/\.html$/, '').replace(/-/g, ' ')}</a></li>`).join('\n')}
</ul>
<p style="margin-top:24px"><a href="../index.html">← back to dashboard</a></p>
</body></html>`;
writeFileSync(join(STORIES_DIR, 'index.html'), INDEX_TEMPLATE);

console.log('\n═══ summary ═══');
console.log(`  Generated: ${generated.length}`);
console.log(`  Skipped:   ${skipped.length}`);
console.log(`  Cost est:  ~$${cost.toFixed(2)}`);
console.log(`  Pages:     dashboard/stories/*.html (index at dashboard/stories/index.html)`);
