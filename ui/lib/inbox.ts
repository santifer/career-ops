import fs from 'node:fs';
import path from 'node:path';
import { getCareerOpsRoot } from './pipeline';

export interface InboxItem {
  url: string;
  company: string;
  role: string;
  section: 'pending' | 'processed';
  processedAt?: string;
  outcome?: string;
  score?: string;
  lineNumber: number;
}

const PENDING = /^\s*-\s*\[\s\]\s+(\S+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*$/;
const PROCESSED = /^\s*-\s*\[x\]\s+(\S+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)(?:\s*\|\s*([^|]+?))?\s*$/i;

export function parsePipelineInbox(): InboxItem[] {
  const root = getCareerOpsRoot();
  const filePath = path.join(root, 'data', 'pipeline.md');
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const items: InboxItem[] = [];
  let section: 'pending' | 'processed' = 'pending';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^##\s+procesadas?/i.test(trimmed)) {
      section = 'processed';
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      section = 'pending';
      continue;
    }

    const procMatch = PROCESSED.exec(line);
    if (procMatch) {
      items.push({
        url: procMatch[1].trim(),
        company: procMatch[2].trim(),
        role: procMatch[3].trim(),
        outcome: procMatch[4].trim(),
        processedAt: extractDate(procMatch[4]),
        score: procMatch[5]?.trim(),
        section: 'processed',
        lineNumber: i + 1,
      });
      continue;
    }
    const pendMatch = PENDING.exec(line);
    if (pendMatch) {
      items.push({
        url: pendMatch[1].trim(),
        company: pendMatch[2].trim(),
        role: pendMatch[3].trim(),
        section: 'pending',
        lineNumber: i + 1,
      });
    }
  }
  return items;
}

function extractDate(text: string): string | undefined {
  const m = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  return m?.[1];
}

export function getInboxSummary(): { pending: number; processed: number; companies: number } {
  const items = parsePipelineInbox();
  const pending = items.filter((i) => i.section === 'pending').length;
  const processed = items.filter((i) => i.section === 'processed').length;
  const companies = new Set(items.map((i) => i.company)).size;
  return { pending, processed, companies };
}
