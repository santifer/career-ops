#!/usr/bin/env node

/**
 * evidence-pack.mjs — generate a source-backed candidate evidence pack.
 *
 * Local-only: reads cv.md, article-digest.md, data/applications.md, and reports/
 * when present. Missing files are allowed so the command is safe on a fresh repo.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const HELP = args.includes('--help') || args.includes('-h');
const JSON_OUTPUT = args.includes('--json');
const SELF_TEST = args.includes('--self-test');

function optionValue(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

const OUTPUT = optionValue('--output', '');

function usage() {
  return `career-ops evidence pack

Usage:
  node evidence-pack.mjs
  node evidence-pack.mjs --json
  node evidence-pack.mjs --output evidence-pack.md
  node evidence-pack.mjs --self-test`;
}

function readOptional(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function compactWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractHeadings(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{1,3})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ level: match[1].length, title: compactWhitespace(match[2]) }));
}

function extractBullets(markdown, source, limit = 12) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+(.+)$/))
    .filter(Boolean)
    .map((match) => compactWhitespace(match[1]))
    .filter((text) => text.length >= 20)
    .slice(0, limit)
    .map((text) => ({ text, source }));
}

function extractLinks(markdown, source) {
  const links = [];
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  for (const match of markdown.matchAll(markdownLinkPattern)) {
    links.push({ label: compactWhitespace(match[1]), url: match[2], source });
  }
  const bareUrlPattern = /(^|\s)(https?:\/\/[^\s)]+)/g;
  for (const match of markdown.matchAll(bareUrlPattern)) {
    if (!links.some((link) => link.url === match[2])) {
      links.push({ label: match[2], url: match[2], source });
    }
  }
  return links;
}

function parseApplications(markdown) {
  const statuses = {};
  const rows = markdown.split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  for (const row of rows) {
    const cells = row.split('|').map((cell) => compactWhitespace(cell)).filter(Boolean);
    if (cells.length < 3 || cells.some((cell) => /^-+$/.test(cell))) continue;
    const status = cells.find((cell) => /applied|interview|offer|rejected|pending|evaluated|skip/i.test(cell));
    if (status) statuses[status.toLowerCase()] = (statuses[status.toLowerCase()] || 0) + 1;
  }
  return statuses;
}

function readReports(dir = 'reports') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .slice(-10)
    .map((file) => {
      const body = readFileSync(join(dir, file), 'utf-8');
      const title = extractHeadings(body)[0]?.title || file;
      const score = body.match(/score[:* ]+([0-9.]+)\s*\/?\s*5?/i)?.[1] || null;
      return { file: join(dir, file).replace(/\\/g, '/'), title, score };
    });
}

function buildEvidencePack(input) {
  const cvHeadings = extractHeadings(input.cv);
  const proofPoints = [
    ...extractBullets(input.cv, 'cv.md', 10),
    ...extractBullets(input.articleDigest, 'article-digest.md', 10),
  ].slice(0, 15);
  const links = [
    ...extractLinks(input.cv, 'cv.md'),
    ...extractLinks(input.articleDigest, 'article-digest.md'),
  ];
  const uniqueLinks = Array.from(new Map(links.map((link) => [link.url, link])).values()).slice(0, 15);

  return {
    generatedAt: new Date().toISOString(),
    sources: input.sources,
    cvSections: cvHeadings.map((heading) => heading.title).slice(0, 12),
    proofPoints,
    links: uniqueLinks,
    applicationStatuses: parseApplications(input.applications),
    recentReports: input.reports,
  };
}

function renderMarkdown(pack) {
  const lines = [
    '# Candidate Evidence Pack',
    '',
    `Generated: ${pack.generatedAt}`,
    '',
    '## Sources',
    '',
    ...pack.sources.map((source) => `- ${source}`),
    '',
    '## CV Sections',
    '',
    ...(pack.cvSections.length ? pack.cvSections.map((section) => `- ${section}`) : ['- No CV sections found yet.']),
    '',
    '## Proof Points',
    '',
    ...(pack.proofPoints.length
      ? pack.proofPoints.map((point) => `- ${point.text} _(source: ${point.source})_`)
      : ['- Add quantified bullets to cv.md or article-digest.md to populate this section.']),
    '',
    '## Portfolio Links',
    '',
    ...(pack.links.length
      ? pack.links.map((link) => `- [${link.label}](${link.url}) _(source: ${link.source})_`)
      : ['- No links found yet.']),
    '',
    '## Application Signal',
    '',
    ...(Object.keys(pack.applicationStatuses).length
      ? Object.entries(pack.applicationStatuses).sort().map(([status, count]) => `- ${status}: ${count}`)
      : ['- No application tracker statuses found yet.']),
    '',
    '## Recent Evaluation Reports',
    '',
    ...(pack.recentReports.length
      ? pack.recentReports.map((report) => `- ${report.title}${report.score ? ` — score ${report.score}` : ''} _(source: ${report.file})_`)
      : ['- No reports found yet.']),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function loadInput() {
  const sources = [];
  const cv = readOptional('cv.md');
  const articleDigest = readOptional('article-digest.md');
  const applications = readOptional('data/applications.md');
  if (cv) sources.push('cv.md');
  if (articleDigest) sources.push('article-digest.md');
  if (applications) sources.push('data/applications.md');
  const reports = readReports();
  if (reports.length) sources.push('reports/*.md');
  return { cv, articleDigest, applications, reports, sources };
}

function selfTest() {
  const pack = buildEvidencePack({
    cv: [
      '# Jane Doe',
      '## Experience',
      '- Led migration of a production AI workflow, cutting review time by 40%.',
      '- Built safe automation with audit logs and deterministic rollback.',
      '[Portfolio](https://example.com)',
    ].join('\n'),
    articleDigest: '- Wrote a case study on agent evaluation and deployment.',
    applications: '| Company | Role | Status |\n|---|---|---|\n| Acme | AI Engineer | interview |',
    reports: [{ file: 'reports/acme.md', title: 'Acme AI Engineer', score: '4.4' }],
    sources: ['cv.md', 'article-digest.md', 'data/applications.md', 'reports/*.md'],
  });
  const markdown = renderMarkdown(pack);
  const checks = [
    ['keeps source list', pack.sources.includes('cv.md')],
    ['extracts proof points', pack.proofPoints.length >= 2],
    ['extracts links', pack.links.some((link) => link.url === 'https://example.com')],
    ['counts application statuses', pack.applicationStatuses.interview === 1],
    ['renders reports', markdown.includes('Acme AI Engineer')],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (failed.length > 0) process.exit(1);
}

if (HELP) {
  console.log(usage());
  process.exit(0);
}

if (SELF_TEST) {
  selfTest();
  process.exit(0);
}

const pack = buildEvidencePack(loadInput());
const output = JSON_OUTPUT ? `${JSON.stringify(pack, null, 2)}\n` : renderMarkdown(pack);

if (OUTPUT) writeFileSync(OUTPUT, output, 'utf-8');
else process.stdout.write(output);
