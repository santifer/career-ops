#!/usr/bin/env node
/**
 * Daily 2027 internship scanner for Neel.
 *
 * It delegates supported ATS feeds to Career-Ops scan.mjs, then uses a small
 * Playwright fallback for custom career pages marked scan_method: playwright
 * in config/internship-portals.yml. It writes a JSON + Markdown digest for
 * scripts/send-digest.mjs and leaves all dedup state in data/scan-history.tsv.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import yaml from 'js-yaml';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(ROOT);

const DEFAULT_PORTALS = 'config/internship-portals.yml';
const PORTALS_PATH = process.env.CAREER_OPS_PORTALS || DEFAULT_PORTALS;
const HISTORY_PATH = 'data/scan-history.tsv';
const DIGEST_JSON = process.env.DIGEST_JSON || 'output/internship-digest.json';
const DIGEST_MD = process.env.DIGEST_MD || 'output/internship-digest.md';
const MIN_SCORE = Number(process.env.MIN_INTERNSHIP_SCORE || 4.0);
const GENERIC_MAX_PER_COMPANY = Number(process.env.GENERIC_MAX_LINKS_PER_COMPANY || 25);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipCareerOps = args.includes('--skip-career-ops');
const skipPlaywrightFallback = args.includes('--skip-playwright-fallback');

const internshipTitlePatterns = [
  /\binterns?\b/i,
  /\binternship(s)?\b/i,
  /\bco[-\s]?op\b/i,
  /\bcoop\b/i,
  /\bpey\b/i,
];

const nonInternshipTitlePatterns = [
  /\bnew\s+grad(uate)?s?\b/i,
  /\buniversity\s+grad(uate)?s?\b/i,
  /\bgraduate\s+(software|backend|platform|infrastructure|cloud|developer|engineer)/i,
  /\bearly\s+career\b/i,
  /\bentry[-\s]?level\b/i,
  /\bfull[-\s]?time\b/i,
];

const roleWords = [
  'software',
  'swe',
  'backend',
  'back-end',
  'platform',
  'infrastructure',
  'cloud',
  'distributed',
  'systems',
  'developer',
  'development',
  'site reliability',
  'sre',
  'quantitative developer',
  'quant developer',
  'quantitative researcher',
  'quant researcher',
  'trading systems',
];

const negativeWords = [
  'product manager',
  'designer',
  'design intern',
  'marketing',
  'sales',
  'finance',
  'accounting',
  'legal',
  'recruit',
  'people',
  'human resources',
  'hardware',
  'mechanical',
  'electrical',
  'asic',
  'fpga',
];

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function run(command, runArgs, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, runArgs, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${runArgs.join(' ')} exited with ${code}`));
    });
  });
}

function lower(value) {
  return String(value || '').toLowerCase();
}

function hasAny(text, words) {
  const l = lower(text);
  return words.some(word => l.includes(word));
}

function isInternshipPosting(title) {
  const value = String(title || '');
  if (nonInternshipTitlePatterns.some(pattern => pattern.test(value))) return false;
  return internshipTitlePatterns.some(pattern => pattern.test(value));
}

function isSoftwareTarget(text) {
  return hasAny(text, roleWords) && !hasAny(text, negativeWords);
}

function isTargetPosting(title, context = title) {
  return isInternshipPosting(title) && isSoftwareTarget(context);
}

function inferTerm(title) {
  const t = String(title || '');
  const term = t.match(/\b((Summer|Fall|Winter|Spring)\s+2027|2027\s+(Summer|Fall|Winter|Spring)|2027)\b/i);
  return term ? term[0] : '';
}

function parseHistoryRows(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(line => !line.startsWith('url\tfirst_seen\t'))
    .map(line => {
      const [url, firstSeen, source, title, company, status = 'added', location = ''] = line.split('\t');
      return { url, firstSeen, source, title, company, status, location };
    })
    .filter(row => row.url && row.title && row.company);
}

function historyDelta(beforeText, afterText) {
  const beforeLines = beforeText.split(/\r?\n/).filter(Boolean).length;
  const afterLines = afterText.split(/\r?\n/).filter(Boolean);
  return parseHistoryRows(afterLines.slice(beforeLines).join('\n'));
}

function loadConfig() {
  if (!existsSync(PORTALS_PATH)) {
    throw new Error(`Portals config not found: ${PORTALS_PATH}`);
  }
  return yaml.load(readFileSync(PORTALS_PATH, 'utf-8')) || {};
}

function companyPriorityMap(config) {
  const map = new Map();
  for (const entry of config.tracked_companies || []) {
    if (!entry?.name) continue;
    map.set(lower(entry.name), entry.priority || 'target');
  }
  return map;
}

function scorePosting(row, priorities) {
  const title = row.title || '';
  const haystack = `${title} ${row.company} ${row.location} ${row.url}`;
  const reasons = [];
  let score = 3.2;

  const priority = priorities.get(lower(row.company)) || 'target';
  if (priority === 'high') {
    score += 0.55;
    reasons.push('high-priority target company');
  } else if (priority === 'quant') {
    score += 0.55;
    reasons.push('quant/trading target');
  } else if (priority === 'unicorn') {
    score += 0.45;
    reasons.push('strong unicorn or AI infrastructure target');
  } else {
    score += 0.25;
    reasons.push('strong SWE target company');
  }

  if (/software engineer|software engineering|swe|software developer/i.test(title)) {
    score += 0.55;
    reasons.push('software engineering internship title');
  }
  if (/backend|platform|infrastructure|distributed|cloud|systems|sre|site reliability/i.test(title)) {
    score += 0.35;
    reasons.push('backend/platform/infrastructure signal');
  }
  if (/quant|trading/i.test(haystack)) {
    score += 0.25;
    reasons.push('quantitative systems signal');
  }
  if (/2027|summer|fall|winter|spring/i.test(title)) {
    score += 0.2;
    reasons.push('internship term signal');
  }
  if (/canada|united states|usa|remote|toronto|vancouver|waterloo|new york|seattle|san francisco|mountain view|palo alto|redmond/i.test(row.location || '')) {
    score += 0.15;
    reasons.push('North America or remote location');
  }

  if (!isTargetPosting(title, haystack)) score = Math.min(score, 3.6);
  const rounded = Math.min(5, Math.round(score * 10) / 10);

  return {
    ...row,
    term: inferTerm(title),
    score: rounded,
    why: reasons.slice(0, 3).join('; '),
    suggestedAction: rounded >= 4.5 ? 'Apply Now' : rounded >= 4.0 ? 'Review' : 'Ignore',
  };
}

function rowKey(row) {
  return lower(`${row.company}::${row.title}::${row.url}`);
}

function uniqueRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function normalizeAnchorTitle(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(apply|learn more|view job|see details)\b/gi, '')
    .trim()
    .slice(0, 180);
}

function allowsUndatedPostings(config) {
  return config.freshness_filter?.enabled === false || config.freshness_filter?.keep_undated !== false;
}

async function runPlaywrightFallback(config, scanFns) {
  const entries = (config.tracked_companies || [])
    .filter(entry => entry?.enabled !== false && entry.scan_method === 'playwright' && entry.careers_url);

  if (entries.length === 0 || skipPlaywrightFallback) return [];
  if (!allowsUndatedPostings(config)) {
    console.log('Generic career-page scan skipped: freshness_filter.keep_undated=false and these pages do not expose reliable post dates.');
    return [];
  }

  let chromium;
  let checkUrlLiveness;
  let newLivenessPage;
  try {
    ({ chromium } = await import('playwright'));
    ({ checkUrlLiveness, newLivenessPage } = await import('../liveness-browser.mjs'));
  } catch (err) {
    console.error(`Playwright fallback skipped: ${err.message}`);
    return [];
  }

  const { loadSeenUrls, appendToPipeline, appendToScanHistory } = scanFns;
  const { seen } = loadSeenUrls();
  const date = new Date().toISOString().slice(0, 10);
  const browser = await chromium.launch({ headless: true });
  const candidates = [];
  const expired = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    page.setDefaultTimeout(30_000);

    for (const entry of entries) {
      console.log(`Generic career-page scan: ${entry.name}`);
      try {
        await page.goto(entry.careers_url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForTimeout(Number(process.env.PLAYWRIGHT_SCAN_SETTLE_MS || 2500));
        const anchors = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'))
          .map(a => ({
            href: a.href,
            text: [
              a.textContent,
              a.getAttribute('aria-label'),
              a.getAttribute('title'),
            ].filter(Boolean).join(' '),
          })));

        let keptForCompany = 0;
        for (const anchor of anchors) {
          if (keptForCompany >= GENERIC_MAX_PER_COMPANY) break;
          const text = normalizeAnchorTitle(anchor.text);
          const haystack = `${text} ${anchor.href}`;
          if (!text || !anchor.href || !isTargetPosting(text, haystack)) continue;
          if (seen.has(anchor.href)) continue;
          seen.add(anchor.href);
          candidates.push({
            url: anchor.href,
            firstSeen: date,
            source: 'playwright-careers',
            title: text,
            company: entry.name,
            status: 'added',
            location: '',
          });
          keptForCompany++;
        }
      } catch (err) {
        console.error(`  ${entry.name}: ${err.message}`);
      }
    }

    if (candidates.length > 0) {
      console.log(`Verifying ${candidates.length} career-page candidate(s) with Playwright`);
      const livePage = await newLivenessPage(browser);
      const live = [];
      for (const offer of candidates) {
        const verdict = await checkUrlLiveness(livePage, offer.url);
        if (verdict.result === 'expired') {
          expired.push(offer);
          console.log(`  expired ${offer.company} | ${offer.title}`);
        } else {
          live.push(offer);
          console.log(`  ${verdict.result} ${offer.company} | ${offer.title}`);
        }
      }

      if (!dryRun && live.length > 0) {
        appendToPipeline(live);
        appendToScanHistory(live, date, 'added');
      }
      if (!dryRun && expired.length > 0) {
        appendToScanHistory(expired, date, 'skipped_expired');
      }
      return live;
    }
  } finally {
    await browser.close();
  }

  return [];
}

function writeDigest(items, summary) {
  mkdirSync(dirname(join(ROOT, DIGEST_JSON)), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    minScore: MIN_SCORE,
    summary,
    items,
  };
  writeFileSync(DIGEST_JSON, JSON.stringify(payload, null, 2), 'utf-8');

  const lines = [
    `# 2027 Internship Digest - ${new Date().toISOString().slice(0, 10)}`,
    '',
    `New matching postings: ${items.length}`,
    '',
  ];

  if (items.length > 0) {
    lines.push('| Company | Role | Location | Term | Score | Action | Date Found | URL |');
    lines.push('|---|---|---|---|---:|---|---|---|');
    for (const item of items) {
      lines.push(`| ${item.company} | ${item.title} | ${item.location || 'N/A'} | ${item.term || 'N/A'} | ${item.score}/5 | ${item.suggestedAction} | ${item.firstSeen} | ${item.url} |`);
    }
    lines.push('');
    lines.push('## Why These Matched');
    for (const item of items) {
      lines.push(`- ${item.company} - ${item.title}: ${item.why || 'Matches target internship filters.'}`);
    }
  } else {
    lines.push('No new matching postings met the score threshold.');
  }

  mkdirSync(dirname(join(ROOT, DIGEST_MD)), { recursive: true });
  writeFileSync(DIGEST_MD, lines.join('\n') + '\n', 'utf-8');
  console.log(`Digest written to ${DIGEST_JSON} and ${DIGEST_MD}`);
}

async function main() {
  mkdirSync('data', { recursive: true });
  mkdirSync('output', { recursive: true });

  const config = loadConfig();
  const priorities = companyPriorityMap(config);
  const beforeHistory = readText(HISTORY_PATH);

  if (!skipCareerOps) {
    const scanArgs = ['scan.mjs', '--verify', '--rediscover-404'];
    if (dryRun) scanArgs.push('--dry-run');
    await run(process.execPath, scanArgs, { CAREER_OPS_PORTALS: PORTALS_PATH });
  }

  const scanFns = await import('../scan.mjs');
  await runPlaywrightFallback(config, scanFns);

  const afterHistory = readText(HISTORY_PATH);
  const newRows = historyDelta(beforeHistory, afterHistory)
    .filter(row => row.status === 'added')
    .filter(row => isTargetPosting(row.title, `${row.title} ${row.company} ${row.location} ${row.url}`));

  const scored = uniqueRows(newRows)
    .map(row => scorePosting(row, priorities))
    .filter(row => row.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));

  writeDigest(scored, {
    newRows: newRows.length,
    emailedRows: scored.length,
    dryRun,
    portalsPath: PORTALS_PATH,
  });
}

main().catch(err => {
  console.error(`Internship scan failed: ${err.message}`);
  process.exit(1);
});
