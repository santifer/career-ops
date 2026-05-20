#!/usr/bin/env node
/**
 * scripts/agents/dupe-audit.mjs
 *
 * Read-only dedup audit across:
 *   - data/applications.md       (188-row tracker)
 *   - data/apply-now-queue.json  (dashboard's ranked queue)
 *   - data/pipeline.md           (inbox of URLs)
 *
 * Output: data/dupe-audit-YYYY-MM-DD.md
 *
 * Clustering:
 *   A) exact (company_norm, role_norm) — strict
 *   B) (company_norm, role_norm_loose) — strips Sr/Senior/Lead/Staff/Remote/parens
 *
 * Canonical (winner) selection per cluster:
 *   1) URL host priority: company-careers > ashby > greenhouse > lever > workday > linkedin > glassdoor
 *   2) Status rank: offer > interview > responded > applied > evaluated > rejected > discarded > skip
 *   3) Highest score
 *   4) Most recent eval_date
 *
 * Pipeline.md dedup: canonicalize URLs (strip utm_*, gh_jid, lever_source, ref, etc.)
 * and report duplicates after canonicalization.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TODAY = new Date().toISOString().slice(0, 10);
const OUT_PATH = join(ROOT, `data/dupe-audit-${TODAY}.md`);

const STATUS_RANK = {
  'skip': 0, 'discarded': 0, 'rejected': 1,
  'evaluated': 2, 'applied': 3, 'responded': 4,
  'interview': 5, 'offer': 6,
};

const HOST_PRIORITY = [
  // company-canonical careers pages (heuristic: contains "careers." or matches known patterns)
  // we score by prefix-match rank below
  'careers',     // careers.<company>.com etc.
  'ashbyhq.com',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.lever.co',
  'wd5.myworkdayjobs.com',
  'wd1.myworkdayjobs.com',
  'wd3.myworkdayjobs.com',
  'amazon.jobs',
  'linkedin.com',  // last
  'glassdoor.com', // very last
];

function hostRank(url) {
  if (!url) return 999;
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return 999; }
  // company-canonical careers heuristic: host starts with "careers." or path /careers/
  if (host.startsWith('careers.') || /\/careers\b/.test(url)) return -1;
  for (let i = 0; i < HOST_PRIORITY.length; i++) {
    if (host.endsWith(HOST_PRIORITY[i])) return i;
  }
  return 500; // unknown host, between known and total junk
}

function normCompany(s) {
  return String(s || '').toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normRoleStrict(s) {
  return String(s || '').toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9 /]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROLE_STRIPS = [
  /\b(sr|senior|jr|junior|lead|staff|principal|head|chief|associate)\b/g,
  /\b(remote|hybrid|onsite|on site)\b/g,
  /\b(us|usa|uk|emea|apac|latam|global)\b/g,
];

function normRoleLoose(s) {
  let r = normRoleStrict(s);
  for (const re of ROLE_STRIPS) r = r.replace(re, ' ');
  return r.replace(/\s+/g, ' ').trim();
}

function statusKey(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function statusRank(s) {
  return STATUS_RANK[statusKey(s)] ?? -1;
}

// ── Parse applications.md ───────────────────────────────────────────────
function parseTracker() {
  const txt = readFileSync(join(ROOT, 'data/applications.md'), 'utf8');
  const lines = txt.split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
  // First |-line is header; skip
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 8) continue;
    const num = cells[0];
    if (!num || !/^\d+$/.test(num)) continue;
    const reportLink = cells[7] || '';
    const reportMatch = reportLink.match(/\(([^)]+\.md)\)/);
    const reportFile = reportMatch ? reportMatch[1] : null;
    rows.push({
      num, date: cells[1], company: cells[2], role: cells[3],
      score: cells[4], status: cells[5], pdf: cells[6],
      reportLink, reportFile,
      notes: cells.slice(8).join(' | '),
      _raw: lines[i],
      _company_norm: normCompany(cells[2]),
      _role_norm: normRoleStrict(cells[3]),
      _role_loose: normRoleLoose(cells[3]),
    });
  }
  return rows;
}

// ── Pull URL from report file ──────────────────────────────────────────
function readReportUrl(reportFile) {
  if (!reportFile) return null;
  const p = join(ROOT, reportFile);
  if (!existsSync(p)) return null;
  try {
    const txt = readFileSync(p, 'utf8');
    const m = txt.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/i);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

// ── Cluster ─────────────────────────────────────────────────────────────
function cluster(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k || !k.includes('|')) continue;
    const parts = k.split('|');
    if (!parts[0] || !parts[1]) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()].filter(([, arr]) => arr.length > 1);
}

function pickWinner(rows) {
  return rows.slice().sort((a, b) => {
    // 1) host rank (lower is better)
    const hr = hostRank(a._url) - hostRank(b._url);
    if (hr !== 0) return hr;
    // 2) status rank (higher is better)
    const sr = statusRank(b.status) - statusRank(a.status);
    if (sr !== 0) return sr;
    // 3) score (higher is better)
    const as = parseFloat((a.score || '0').replace(/[^\d.]/g, '')) || 0;
    const bs = parseFloat((b.score || '0').replace(/[^\d.]/g, '')) || 0;
    if (bs !== as) return bs - as;
    // 4) date (more recent is better)
    return String(b.date).localeCompare(String(a.date));
  })[0];
}

// ── Pipeline URL canonicalization ───────────────────────────────────────
function canonUrl(u) {
  try {
    const url = new URL(u);
    const sp = url.searchParams;
    for (const k of [...sp.keys()]) {
      if (/^utm_/.test(k) || /^gh_/.test(k) || /^lever_/.test(k)
          || k === 'ref' || k === 'source' || k === 'src'
          || k === 'mkt_tok' || k === '_hsenc' || k === '_hsmi'
          || k === 'trk' || k === 'trkCampaign' || k === 'refId') {
        sp.delete(k);
      }
    }
    url.hash = '';
    // trailing slash normalization
    let s = url.toString();
    s = s.replace(/\?$/, '');
    return s.replace(/\/$/, '');
  } catch { return u; }
}

function pipelineDupes() {
  const txt = readFileSync(join(ROOT, 'data/pipeline.md'), 'utf8');
  const urls = [...txt.matchAll(/https?:\/\/[^\s)\]"']+/g)].map(m => m[0]);
  const byCanon = new Map();
  for (const u of urls) {
    const c = canonUrl(u);
    if (!byCanon.has(c)) byCanon.set(c, []);
    byCanon.get(c).push(u);
  }
  const dupes = [...byCanon.entries()].filter(([, arr]) => arr.length > 1);
  return { total: urls.length, uniqueCanon: byCanon.size, dupes };
}

// ── Build audit ─────────────────────────────────────────────────────────
function main() {
  console.log('[dupe-audit] Reading tracker…');
  const rows = parseTracker();
  console.log(`[dupe-audit] ${rows.length} tracker rows`);

  console.log('[dupe-audit] Loading URLs from reports…');
  for (const r of rows) {
    r._url = readReportUrl(r.reportFile);
  }

  // Clusters
  const strictClusters = cluster(rows, r => `${r._company_norm}|${r._role_norm}`);
  const looseClusters  = cluster(rows, r => `${r._company_norm}|${r._role_loose}`);

  // Loose clusters that are NOT already covered by a strict cluster
  const strictKeys = new Set(strictClusters.map(([k]) => k));
  const looseOnly = looseClusters.filter(([k, arr]) => {
    // a loose cluster is "new" if any pair within it has a different strict key
    const strictsInCluster = new Set(arr.map(r => `${r._company_norm}|${r._role_norm}`));
    return strictsInCluster.size > 1;
  });

  // LinkedIn-only URLs in active rows
  const activeStatuses = new Set(['evaluated', 'applied', 'responded', 'interview']);
  const linkedinActive = rows.filter(r => {
    const u = r._url || '';
    if (!u.includes('linkedin.com')) return false;
    return activeStatuses.has(statusKey(r.status));
  });

  // apply-now-queue.json
  const queue = JSON.parse(readFileSync(join(ROOT, 'data/apply-now-queue.json'), 'utf8'));
  const queueRows = queue.ranked || [];
  const queueByCompanyRole = new Map();
  for (const q of queueRows) {
    if (q._dropped) continue;
    const k = `${normCompany(q.company)}|${normRoleStrict(q.role)}`;
    if (!queueByCompanyRole.has(k)) queueByCompanyRole.set(k, []);
    queueByCompanyRole.get(k).push(q);
  }
  const queueDupes = [...queueByCompanyRole.entries()].filter(([, arr]) => arr.length > 1);

  // Pipeline
  const pl = pipelineDupes();

  // ── Render report ────────────────────────────────────────────────────
  const out = [];
  out.push(`# Dupe Audit — ${TODAY}`);
  out.push('');
  out.push(`Generated by \`scripts/agents/dupe-audit.mjs\`. Read-only.`);
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push(`- **Tracker rows:** ${rows.length}`);
  out.push(`- **Strict (exact company+role) clusters:** ${strictClusters.length} (${strictClusters.reduce((s, [, a]) => s + a.length, 0)} rows involved, ${strictClusters.reduce((s, [, a]) => s + a.length - 1, 0)} losers to retire)`);
  out.push(`- **Loose (stop-word-stripped) clusters beyond strict:** ${looseOnly.length}`);
  out.push(`- **Apply-now-queue.json dupe clusters (active rows):** ${queueDupes.length}`);
  out.push(`- **LinkedIn-hosted URLs in active tracker rows:** ${linkedinActive.length} (candidates for liveness re-check)`);
  out.push(`- **Pipeline.md URLs:** ${pl.total} total / ${pl.uniqueCanon} unique-after-canonicalization → ${pl.total - pl.uniqueCanon} dupes`);
  out.push('');

  // STRICT clusters
  out.push('## Strict clusters (auto-merge candidates)');
  out.push('');
  for (const [key, arr] of strictClusters.sort((a, b) => b[1].length - a[1].length)) {
    const winner = pickWinner(arr);
    const losers = arr.filter(r => r.num !== winner.num);
    out.push(`### ${arr[0].company} — ${arr[0].role} (${arr.length}×)`);
    out.push('');
    out.push('| # | Date | Score | Status | URL | Decision |');
    out.push('|---|------|-------|--------|-----|----------|');
    for (const r of arr.slice().sort((a, b) => parseInt(a.num) - parseInt(b.num))) {
      const isWinner = r.num === winner.num;
      const decision = isWinner ? '**KEEP**' : `→ merge into #${winner.num}`;
      const url = r._url ? `\`${r._url.slice(0, 60)}${r._url.length > 60 ? '…' : ''}\`` : '(no URL in report)';
      out.push(`| ${r.num} | ${r.date} | ${r.score} | ${r.status} | ${url} | ${decision} |`);
    }
    out.push('');
  }

  // LOOSE-ONLY (judgment calls)
  out.push('## Loose clusters beyond strict (needs judgment — likely SAME role)');
  out.push('');
  if (looseOnly.length === 0) {
    out.push('_None._');
  } else {
    for (const [key, arr] of looseOnly) {
      out.push(`### ${arr[0].company} — variants: ${[...new Set(arr.map(r => r.role))].join(' / ')}`);
      out.push('');
      out.push('| # | Date | Role | Score | Status | URL |');
      out.push('|---|------|------|-------|--------|-----|');
      for (const r of arr) {
        const url = r._url ? `\`${r._url.slice(0, 50)}${r._url.length > 50 ? '…' : ''}\`` : '—';
        out.push(`| ${r.num} | ${r.date} | ${r.role} | ${r.score} | ${r.status} | ${url} |`);
      }
      out.push('');
    }
  }
  out.push('');

  // Queue dupes
  out.push('## apply-now-queue.json dupes (dashboard surface)');
  out.push('');
  if (queueDupes.length === 0) {
    out.push('_None in active (non-dropped) ranked rows._');
  } else {
    for (const [k, arr] of queueDupes) {
      out.push(`- ${arr[0].company} — ${arr[0].role}: rows ${arr.map(r => r.num).join(', ')}`);
    }
  }
  out.push('');

  // LinkedIn active candidates
  out.push('## LinkedIn-hosted URLs in active tracker rows (liveness re-check candidates)');
  out.push('');
  if (linkedinActive.length === 0) {
    out.push('_None._');
  } else {
    out.push('| # | Company | Role | Status | URL |');
    out.push('|---|---------|------|--------|-----|');
    for (const r of linkedinActive) {
      out.push(`| ${r.num} | ${r.company} | ${r.role} | ${r.status} | \`${r._url}\` |`);
    }
  }
  out.push('');

  // Pipeline dupes
  out.push('## Pipeline.md duplicate URLs after canonicalization');
  out.push('');
  out.push(`${pl.total - pl.uniqueCanon} duplicate URL occurrences across ${pl.dupes.length} canonical URLs.`);
  out.push('');
  out.push('Top 25 most-duplicated:');
  out.push('');
  for (const [canon, dupes] of pl.dupes.sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
    out.push(`- ${dupes.length}× \`${canon.slice(0, 120)}\``);
  }
  out.push('');

  out.push('---');
  out.push('');
  out.push(`Generated at ${new Date().toISOString()}.`);

  writeFileSync(OUT_PATH, out.join('\n'));
  console.log(`[dupe-audit] Wrote ${OUT_PATH}`);
  console.log(`[dupe-audit]   strict clusters: ${strictClusters.length} (${strictClusters.reduce((s, [, a]) => s + a.length - 1, 0)} losers)`);
  console.log(`[dupe-audit]   loose-only:      ${looseOnly.length}`);
  console.log(`[dupe-audit]   queue dupes:     ${queueDupes.length}`);
  console.log(`[dupe-audit]   linkedin active: ${linkedinActive.length}`);
  console.log(`[dupe-audit]   pipeline canon-dupes: ${pl.total - pl.uniqueCanon}`);

  // Machine-readable side-output for the mutation step
  const plan = {
    generated_at: new Date().toISOString(),
    strict_clusters: strictClusters.map(([key, arr]) => {
      const winner = pickWinner(arr);
      return {
        key,
        company: arr[0].company,
        role: arr[0].role,
        winner_num: winner.num,
        loser_nums: arr.filter(r => r.num !== winner.num).map(r => r.num),
        rows: arr.map(r => ({
          num: r.num, date: r.date, score: r.score, status: r.status,
          url: r._url, reportFile: r.reportFile,
        })),
      };
    }),
    loose_only_clusters: looseOnly.map(([key, arr]) => {
      const winner = pickWinner(arr);
      return {
        key,
        company: arr[0].company,
        winner_num: winner.num,
        loser_nums: arr.filter(r => r.num !== winner.num).map(r => r.num),
        rows: arr.map(r => ({ num: r.num, role: r.role, date: r.date, score: r.score, status: r.status, url: r._url })),
      };
    }),
    queue_dupes: queueDupes.map(([k, arr]) => ({ key: k, rows: arr.map(q => q.num) })),
    linkedin_active: linkedinActive.map(r => ({ num: r.num, url: r._url, company: r.company, role: r.role, status: r.status })),
    pipeline_canon_dupes: pl.dupes.map(([canon, raws]) => ({ canon, count: raws.length, raws })),
  };
  writeFileSync(join(ROOT, `data/dupe-audit-${TODAY}-plan.json`), JSON.stringify(plan, null, 2));
  console.log(`[dupe-audit] Wrote data/dupe-audit-${TODAY}-plan.json`);
}

main();
