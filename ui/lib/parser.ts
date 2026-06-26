import fs from 'node:fs';
import path from 'node:path';
import type { Application, ReportSummary } from './types';

const reScoreValue = /(\d+(?:\.\d+)?)\s*\/\s*5/;
const reReportLink = /\[(\d+)\]\(([^)]+)\)/;

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.includes('\t')) {
    return trimmed.replace(/^\|/, '').split('\t').map((p) => p.replace(/\|/g, '').trim());
  }
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((p) => p.trim());
}

export function parseApplications(careerOpsRoot: string): Application[] {
  const candidates = [
    path.join(careerOpsRoot, 'data', 'applications.md'),
    path.join(careerOpsRoot, 'applications.md'),
  ];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) return [];

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const apps: Application[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    if (t.startsWith('|---') || t.startsWith('| #') || t.startsWith('|#')) continue;
    if (t.startsWith('# ')) continue;
    const fields = splitRow(line);
    if (fields.length < 8) continue;

    const number = Number.parseInt(fields[0], 10);
    if (!Number.isFinite(number)) continue;

    const app: Application = {
      number,
      numberRaw: fields[0] ?? `${number}`,
      date: fields[1] ?? '',
      company: fields[2] ?? '',
      role: fields[3] ?? '',
      scoreRaw: fields[4] ?? '',
      score: null,
      status: fields[5] ?? '',
      hasPdf: (fields[6] ?? '').includes('✅'),
      reportPath: null,
      reportLink: null,
      notes: fields[8] ?? '',
    };

    const m = reScoreValue.exec(app.scoreRaw);
    if (m) app.score = Number.parseFloat(m[1]);

    const linkMatch = reReportLink.exec(fields[7] ?? '');
    if (linkMatch) {
      const rawPath = linkMatch[2];
      const candidates: string[] = [];
      if (rawPath.startsWith('../')) {
        candidates.push(path.resolve(path.dirname(filePath), rawPath));
      } else {
        candidates.push(path.resolve(careerOpsRoot, rawPath));
      }
      const resolved = candidates.find((p) => fs.existsSync(p));
      if (resolved) {
        app.reportPath = path.relative(careerOpsRoot, resolved).split(path.sep).join('/');
      } else {
        app.reportPath = rawPath;
      }
      app.reportLink = linkMatch[0];
    }

    apps.push(app);
  }

  return apps;
}

const reArchetype = /\*\*(?:Arquetipo|Archetype)(?:\s+(?:detectado|detected))?\*\*\s*\|\s*([^\n|]+)/i;
const reArchetypeColon = /\*\*(?:Arquetipo|Archetype):\*\*\s*([^\n]+)/i;
const reArchetypeYaml = /^archetype:\s*"?([^"\n]+)"?\s*$/m;
const reTlDr = /\*\*TL;DR(?::)?\*\*\s*[|:]\s*([^\n]+)/i;
const reRemote = /\*\*Remote(?:\s+(?:policy|pol[íi]tica))?\*\*\s*[|:]\s*([^\n|]+)/i;
const reComp = /\*\*Comp(?:\s+(?:range|target|rango))?\*\*\s*[|:]\s*([^\n|]+)/i;
const reLegitimacy = /\*\*Legitimacy(?::)?\*\*\s*([^\n|]+)/i;
const reUrl = /^\*\*URL:\*\*\s*(https?:\/\/\S+)/m;

export function parseReport(careerOpsRoot: string, relPath: string): ReportSummary | null {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(careerOpsRoot, relPath);
  if (!fs.existsSync(abs)) return null;
  const body = fs.readFileSync(abs, 'utf-8');

  const summary: ReportSummary = {
    number: 0,
    company: '',
    role: '',
    date: '',
    score: null,
    archetype: null,
    tldr: null,
    remote: null,
    comp: null,
    legitimacy: null,
    url: null,
    body,
  };

  const numMatch = /(\d{3})[-_]/.exec(path.basename(relPath));
  if (numMatch) summary.number = Number.parseInt(numMatch[1], 10);

  const scoreMatch = body.match(/\b(\d+(?:\.\d+)?)\s*\/\s*5\b/);
  if (scoreMatch) summary.score = Number.parseFloat(scoreMatch[1]);

  const titleMatch = body.match(/^#\s+(.+?)\s+—\s+(.+?)\s+\((.+?)\)/m);
  if (titleMatch) {
    summary.company = titleMatch[1].trim();
    summary.role = titleMatch[2].trim();
    summary.date = titleMatch[3].trim();
  }

  for (const re of [reArchetype, reArchetypeColon, reArchetypeYaml]) {
    const m = re.exec(body);
    if (m) { summary.archetype = m[1].trim().replace(/^"|"$/g, ''); break; }
  }

  const tldrM = reTlDr.exec(body); if (tldrM) summary.tldr = tldrM[1].trim();
  const remoteM = reRemote.exec(body); if (remoteM) summary.remote = remoteM[1].trim();
  const compM = reComp.exec(body); if (compM) summary.comp = compM[1].trim();
  const legM = reLegitimacy.exec(body); if (legM) summary.legitimacy = legM[1].trim();
  const urlM = reUrl.exec(body); if (urlM) summary.url = urlM[1].trim();

  return summary;
}
