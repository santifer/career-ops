#!/usr/bin/env node
/**
 * check-requirements.mjs
 *
 * Fetches JD content for pending pipeline URLs via Greenhouse/Ashby/Lever APIs
 * and extracts experience requirements. Flags roles against Brian's actual level
 * (3-4 years, no prior Senior PM title) so he can quickly triage without full evals.
 *
 * Usage:
 *   node check-requirements.mjs              # check all pending
 *   node check-requirements.mjs --evaluated  # also re-check evaluated roles
 */

import { readFileSync } from 'fs';

const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';
const CANDIDATE_YEARS = 4; // Brian's realistic years of PM experience

// ── Parsers ─────────────────────────────────────────────────────────────────

function parsePipelinePending(content) {
  return content
    .split('\n')
    .filter(l => l.match(/^- \[ \]/))
    .map(l => {
      const match = l.match(/^- \[ \] (https?:\/\/\S+)\s*\|?\s*(.*)/);
      if (!match) return null;
      return { url: match[1].trim(), label: match[2].trim() };
    })
    .filter(Boolean);
}

function parseApplicationsEvaluated(content) {
  return content
    .split('\n')
    .filter(l => l.match(/^\|/))
    .slice(2) // skip header + separator
    .map(l => {
      const cols = l.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length < 8) return null;
      return {
        num: cols[0],
        date: cols[1],
        company: cols[2],
        role: cols[3],
        score: cols[4],
        status: cols[5],
        label: `${cols[2]} — ${cols[3]}`,
      };
    })
    .filter(Boolean);
}

// ── URL → API endpoint ───────────────────────────────────────────────────────

function resolveApi(url) {
  // Greenhouse: job-boards.greenhouse.io/{board}/jobs/{id}
  let m = url.match(/(?:job-boards(?:\.eu)?\.greenhouse\.io|greenhouse\.io\/[^/]+\/jobs?)\/([^/?#]+)\/jobs?\/(\d+)/);
  if (m) return { type: 'greenhouse', board: m[1], jobId: m[2] };

  // Greenhouse shorthand: join.jfrog.com, careers.company.com with gh_jid param
  m = url.match(/[?&]gh_jid=(\d+)/);
  if (m) {
    const boardMatch = url.match(/(?:join\.jfrog\.com|careers\.[^/]+\.com|tipalti\.com|riskified\.com)/);
    if (boardMatch) {
      const boardMap = {
        'join.jfrog.com': 'jfrog',
        'tipalti.com': 'tipalti',
        'riskified.com': 'riskified',
      };
      const host = new URL(url).hostname;
      const board = Object.entries(boardMap).find(([k]) => host.includes(k))?.[1];
      if (board) return { type: 'greenhouse', board, jobId: m[1] };
    }
    // Generic gh_jid fallback — try to infer board from URL path
    const slugMatch = url.match(/https?:\/\/[^/]+\/(?:about\/)?careers?(?:-post)?\/([^/?#]+)/);
    const slug = slugMatch?.[1]?.replace(/-\d+$/, '') || null;
    if (slug) return { type: 'greenhouse', board: slug, jobId: m[1] };
  }

  // Ashby: jobs.ashbyhq.com/{company}/{uuid}
  m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([a-f0-9-]{36})/);
  if (m) return { type: 'ashby', company: m[1], jobId: m[2] };

  // Lever: jobs.lever.co/{company}/{uuid}
  m = url.match(/jobs\.lever\.co\/([^/?#]+)\/([a-f0-9-]{36})/);
  if (m) return { type: 'lever', company: m[1], jobId: m[2] };

  return null;
}

async function fetchJD(api) {
  try {
    if (api.type === 'greenhouse') {
      const endpoint = `https://boards-api.greenhouse.io/v1/boards/${api.board}/jobs/${api.jobId}`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const json = await res.json();
      const html = json.content || '';
      return { title: json.title || '', text: stripHtml(html), source: 'greenhouse' };
    }

    if (api.type === 'ashby') {
      const endpoint = `https://api.ashbyhq.com/posting-api/job-board/${api.company}/posting/${api.jobId}`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const json = await res.json();
      const html = (json.descriptionHtml || json.description || '');
      return { title: json.title || '', text: stripHtml(html), source: 'ashby' };
    }

    if (api.type === 'lever') {
      const endpoint = `https://api.lever.co/v0/postings/${api.company}/${api.jobId}`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const json = await res.json();
      const text = (json.descriptionPlain || json.description || '');
      return { title: json.text || '', text: stripHtml(text), source: 'lever' };
    }
  } catch {
    return null;
  }
  return null;
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Requirements extraction ──────────────────────────────────────────────────

function extractRequirements(text) {
  const lower = text.toLowerCase();

  // Years of experience
  const yearMatches = [...text.matchAll(/(\d+)\+?\s*(?:–|-|to)\s*(\d+)\s*years?|(\d+)\+\s*years?/gi)];
  const years = [];
  for (const m of yearMatches) {
    if (m[1] && m[2]) years.push(parseInt(m[1]));
    else if (m[3]) years.push(parseInt(m[3]));
  }
  // Only care about PM-adjacent year mentions
  const pmYearMatches = [...text.matchAll(/(\d+)\+?\s*(?:–|-|to)?\s*(\d+)?\s*years?\s+(?:of\s+)?(?:experience\s+)?(?:in\s+)?(?:product\s+management|as\s+a\s+(?:product\s+manager|pm)|pm\s+experience|product\s+manager)/gi)];
  const pmYears = pmYearMatches.map(m => parseInt(m[1])).filter(n => !isNaN(n));

  const minYears = pmYears.length > 0
    ? Math.min(...pmYears)
    : years.length > 0 ? Math.min(...years) : null;

  // Title signals
  const requiresSrTitle = /(?:must have|required|experience as a)\s+senior\s+(?:product\s+)?manager/i.test(text)
    || /prior.*senior.*pm|senior.*pm.*experience.*required/i.test(text);

  const isSrRole = /senior\s+product\s+manager|sr\.?\s+pm|senior\s+pm/i.test(text.slice(0, 300));

  // Closed signals
  const isClosed = lower.includes('this job is no longer') || lower.includes('position has been filled')
    || lower.includes('no longer accepting') || text.length < 100;

  return { minYears, requiresSrTitle, isSrRole, isClosed };
}

// ── Fit assessment ───────────────────────────────────────────────────────────

function assessFit(req, label) {
  if (req.isClosed) return { verdict: 'CLOSED', color: '⚫', note: 'Posting appears closed' };

  const { minYears, requiresSrTitle } = req;

  if (requiresSrTitle) {
    return { verdict: 'STRETCH', color: '🔴', note: `Explicitly requires prior Senior PM title` };
  }

  if (minYears !== null) {
    const gap = minYears - CANDIDATE_YEARS;
    if (gap > 2) return { verdict: 'SKIP', color: '🔴', note: `${minYears}+ years required (${gap} year gap)` };
    if (gap > 0) return { verdict: 'STRETCH', color: '🟡', note: `${minYears}+ years required (${gap} year gap — addressable)` };
    return { verdict: 'APPLY', color: '🟢', note: `${minYears}+ years required — within range` };
  }

  // No explicit year requirement found
  if (req.isSrRole) return { verdict: 'CHECK', color: '🟡', note: 'Senior title — no explicit year req found, review JD' };
  return { verdict: 'APPLY', color: '🟢', note: 'No hard year requirement detected' };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const showEvaluated = process.argv.includes('--evaluated');

  const pipelineContent = readFileSync(PIPELINE_PATH, 'utf-8');
  const pending = parsePipelinePending(pipelineContent);

  console.log(`\n🔍 Checking ${pending.length} pending pipeline items against 4-year PM level...\n`);

  const results = [];
  const concurrency = 6;

  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async item => {
        const api = resolveApi(item.url);
        if (!api) return { ...item, verdict: 'CHECK', color: '⚪', note: 'URL format not recognised — manual check needed', title: item.label };

        const jd = await fetchJD(api);
        if (!jd) return { ...item, verdict: 'CHECK', color: '⚪', note: 'API fetch failed — check manually', title: item.label };

        const req = extractRequirements(jd.text);
        const fit = assessFit(req, item.label);
        return { ...item, title: jd.title || item.label, ...fit };
      })
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
    process.stdout.write(`  checked ${Math.min(i + concurrency, pending.length)}/${pending.length}...\r`);
  }

  console.log('\n');

  // Sort: APPLY first, then CHECK, then STRETCH, then SKIP/CLOSED
  const order = { APPLY: 0, CHECK: 1, STRETCH: 2, SKIP: 3, CLOSED: 4 };
  results.sort((a, b) => (order[a.verdict] ?? 5) - (order[b.verdict] ?? 5));

  const col = (s, w) => String(s).padEnd(w).slice(0, w);

  console.log(`${'Verdict'.padEnd(8)} ${'Label'.padEnd(50)} Note`);
  console.log('─'.repeat(100));
  for (const r of results) {
    const label = r.label || r.title;
    console.log(`${r.color} ${r.verdict.padEnd(7)} ${col(label, 50)} ${r.note}`);
  }

  // Summary
  const counts = results.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc; }, {});
  console.log('─'.repeat(100));
  console.log(`\nSummary: 🟢 APPLY=${counts.APPLY || 0}  🟡 CHECK/STRETCH=${(counts.CHECK || 0) + (counts.STRETCH || 0)}  🔴 SKIP=${counts.SKIP || 0}  ⚫ CLOSED=${counts.CLOSED || 0}\n`);

  if (showEvaluated) {
    console.log('\n── Already evaluated (score-based re-rank with title gap lens) ──\n');
    const appContent = readFileSync(APPLICATIONS_PATH, 'utf-8');
    const apps = parseApplicationsEvaluated(appContent);
    console.log(`${'Score'.padEnd(7)} ${'Company'.padEnd(20)} ${'Role'.padEnd(45)} Guidance`);
    console.log('─'.repeat(100));
    for (const a of apps.filter(a => a.status === 'Evaluated').sort((a, b) => parseFloat(b.score) - parseFloat(a.score))) {
      const score = parseFloat(a.score);
      let guidance = '';
      if (score >= 4.0) guidance = '✅ strong match — apply';
      else if (score >= 3.7) guidance = '🟡 decent — only if req is 4 years max';
      else if (score >= 3.5) guidance = '🟡 borderline — title gap likely a real blocker';
      else guidance = '🔴 skip — score + gap both against you';
      console.log(`${a.score.padEnd(7)} ${col(a.company, 20)} ${col(a.role, 45)} ${guidance}`);
    }
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
