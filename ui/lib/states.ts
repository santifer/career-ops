import fs from 'node:fs';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import type { Status } from './types';

let cached: Status[] | null = null;

export function getCanonicalStatuses(rootDir: string): Status[] {
  if (cached) return cached;
  const p = path.join(rootDir, 'templates', 'states.yml');
  if (!fs.existsSync(p)) {
    cached = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];
    return cached;
  }
  const raw = fs.readFileSync(p, 'utf-8');
  const parsed = yamlLoad(raw) as { states?: { name: string }[] } | null;
  const names = (parsed?.states ?? []).map((s) => s.name).filter(Boolean) as Status[];
  cached = names.length ? names : (['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'] as Status[]);
  return cached;
}

export function isCanonicalStatus(value: string, rootDir: string): boolean {
  return getCanonicalStatuses(rootDir).includes(value as Status);
}
