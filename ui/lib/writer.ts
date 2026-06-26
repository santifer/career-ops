import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Application } from './types';
import { parseApplications } from './parser';
import { isCanonicalStatus, getCanonicalStatuses } from './states';

const LOCK_RETRIES = 25;
const LOCK_RETRY_MS = 80;

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function lockPath(careerOpsRoot: string): string {
  return path.join(careerOpsRoot, '.ui-update.lock');
}

async function acquireLock(careerOpsRoot: string): Promise<string> {
  const lockFile = lockPath(careerOpsRoot);
  const id = randomUUID();
  for (let i = 0; i < LOCK_RETRIES; i++) {
    try {
      const handle = await fsp.open(lockFile, 'wx');
      await handle.writeFile(id, 'utf-8');
      await handle.close();
      return id;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'EEXIST') throw err;
      await sleep(LOCK_RETRY_MS);
    }
  }
  throw new Error('Timed out waiting for applications.md lock');
}

async function releaseLock(careerOpsRoot: string, id: string): Promise<void> {
  const lockFile = lockPath(careerOpsRoot);
  try {
    const current = await fsp.readFile(lockFile, 'utf-8').catch(() => '');
    if (current === id) {
      await fsp.unlink(lockFile);
    }
  } catch {
    /* already released */
  }
}

const FIELD_DELIM = '\t';
const PREFIX = '| ';

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function serializeRow(app: Application): string {
  const scoreText = app.score != null ? `${app.score}/5` : app.scoreRaw;
  const pdf = app.hasPdf ? '✅' : '❌';
  const reportCell = app.reportLink ?? (app.reportPath ? `[${app.numberRaw}](${app.reportPath})` : '');
  const fields = [
    app.numberRaw,
    app.date,
    app.company,
    app.role,
    scoreText,
    app.status,
    pdf,
    reportCell,
    app.notes,
  ];
  return `${PREFIX}${fields.join(FIELD_DELIM)}`;
}

function detectSeparator(line: string): 'tab' | 'pipe' {
  return line.includes('\t') ? 'tab' : 'pipe';
}

function buildLine(fields: string[], sep: 'tab' | 'pipe'): string {
  if (sep === 'tab') return `${PREFIX}${fields.join(FIELD_DELIM)}`;
  return `| ${fields.join(' | ')} |`;
}

export async function writeApplications(careerOpsRoot: string, apps: Application[]): Promise<void> {
  const filePath = path.join(careerOpsRoot, 'data', 'applications.md');
  const raw = await fsp.readFile(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const sep = lines.some((l) => l.includes('\t')) ? 'tab' : 'pipe';

  const updated = lines.map((line) => {
    const t = line.trim();
    if (!t.startsWith('|')) return line;
    if (t.startsWith('|---') || t.startsWith('| #') || t.startsWith('|#')) return line;
    if (t.startsWith('# ')) return line;
    const fields = sep === 'tab'
      ? line.replace(/^\|/, '').split('\t').map((p) => p.replace(/\|/g, '').trim())
      : line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((p) => p.trim());
    if (fields.length < 8) return line;
    const number = Number.parseInt(fields[0], 10);
    if (!Number.isFinite(number)) return line;
    const match = apps.find((a) => a.number === number);
    if (!match) return line;
    return buildLine(
      [
        match.numberRaw,
        match.date,
        match.company,
        match.role,
        match.scoreRaw || (match.score != null ? `${match.score}/5` : ''),
        match.status,
        match.hasPdf ? '✅' : '❌',
        match.reportLink ?? (match.reportPath ? `[${match.numberRaw}](${match.reportPath})` : ''),
        match.notes,
      ],
      sep,
    );
  });

  const tmp = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, updated.join('\n'), 'utf-8');
  await fsp.rename(tmp, filePath);
}

export async function updateStatus(
  careerOpsRoot: string,
  number: number,
  newStatus: string,
): Promise<Application | null> {
  if (!isCanonicalStatus(newStatus, careerOpsRoot)) {
    throw new Error(`Status "${newStatus}" is not canonical. Allowed: ${getCanonicalStatuses(careerOpsRoot).join(', ')}`);
  }
  const lockId = await acquireLock(careerOpsRoot);
  try {
    const apps = parseApplications(careerOpsRoot);
    const target = apps.find((a) => a.number === number);
    if (!target) return null;
    target.status = newStatus;
    await writeApplications(careerOpsRoot, apps);
    return target;
  } finally {
    await releaseLock(careerOpsRoot, lockId);
  }
}

export async function updateNotes(
  careerOpsRoot: string,
  number: number,
  newNotes: string,
): Promise<Application | null> {
  const lockId = await acquireLock(careerOpsRoot);
  try {
    const apps = parseApplications(careerOpsRoot);
    const target = apps.find((a) => a.number === number);
    if (!target) return null;
    target.notes = newNotes;
    await writeApplications(careerOpsRoot, apps);
    return target;
  } finally {
    await releaseLock(careerOpsRoot, lockId);
  }
}
