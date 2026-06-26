import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getCareerOpsRoot } from './pipeline';

export interface FollowupRecord {
  number: number;
  appNumber: number;
  date: string;
  company: string;
  role: string;
  channel: 'Email' | 'LinkedIn' | 'Other';
  contact: string;
  notes: string;
}

const HEADER = '| # | App# | Date | Company | Role | Channel | Contact | Notes |';

function parseRow(line: string): FollowupRecord | null {
  if (!line.startsWith('|')) return null;
  const fields = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((f) => f.trim());
  if (fields.length < 8) return null;
  if (fields[0] === '#' || fields[0] === '---') return null;
  const num = Number.parseInt(fields[0], 10);
  const appNum = Number.parseInt(fields[1], 10);
  if (!Number.isFinite(num) || !Number.isFinite(appNum)) return null;
  const channel = (fields[5] as FollowupRecord['channel']) || 'Email';
  return {
    number: num,
    appNumber: appNum,
    date: fields[2],
    company: fields[3],
    role: fields[4],
    channel,
    contact: fields[6],
    notes: fields[7],
  };
}

export async function ensureFollowupsFile(): Promise<string> {
  const root = getCareerOpsRoot();
  const filePath = path.join(root, 'data', 'follow-ups.md');
  if (!fs.existsSync(filePath)) {
    const header = [
      '# Follow-up History',
      '',
      HEADER,
      '|---|------|------|---------|------|---------|---------|-------|',
      '',
    ].join('\n');
    await fsp.writeFile(filePath, header, 'utf-8');
  }
  return filePath;
}

export function getFollowupHistory(): FollowupRecord[] {
  const root = getCareerOpsRoot();
  const filePath = path.join(root, 'data', 'follow-ups.md');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const records: FollowupRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const r = parseRow(line);
    if (r) records.push(r);
  }
  return records;
}

export async function recordFollowup(input: Omit<FollowupRecord, 'number'>): Promise<FollowupRecord> {
  await ensureFollowupsFile();
  const root = getCareerOpsRoot();
  const filePath = path.join(root, 'data', 'follow-ups.md');
  const existing = getFollowupHistory();
  const nextNum = existing.length ? Math.max(...existing.map((r) => r.number)) + 1 : 1;

  const record: FollowupRecord = { ...input, number: nextNum };
  const escapedNotes = input.notes.replace(/\|/g, '\\|');
  const row = `| ${record.number} | ${record.appNumber} | ${record.date} | ${record.company} | ${record.role} | ${record.channel} | ${record.contact.replace(/\|/g, '\\|')} | ${escapedNotes} |`;
  await fsp.appendFile(filePath, row + '\n', 'utf-8');
  return record;
}
