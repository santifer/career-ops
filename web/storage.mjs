import { mkdir, readFile, readdir, writeFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

// All user data lives in the existing career-ops local file layout. For a
// one-person app this is the source of truth — no database, no blob storage.
// Uploading a new resume overwrites cv.md.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const paths = {
  root: ROOT,
  cv: join(ROOT, 'cv.md'),
  profile: join(ROOT, 'config', 'profile.yml'),
  applications: join(ROOT, 'data', 'applications.md'),
  portals: join(ROOT, 'portals.yml'),
  reportsDir: join(ROOT, 'reports'),
  outputDir: join(ROOT, 'output'),
};

const APPLICATIONS_HEADER = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
`;

export async function ensureDirs() {
  await mkdir(join(ROOT, 'config'), { recursive: true });
  await mkdir(join(ROOT, 'data'), { recursive: true });
  await mkdir(paths.reportsDir, { recursive: true });
  await mkdir(paths.outputDir, { recursive: true });
}

// ── Resume (cv.md) ──────────────────────────────────────────────────

export async function readCv() {
  if (!existsSync(paths.cv)) return null;
  return readFile(paths.cv, 'utf-8');
}

export async function writeCv(markdown) {
  await writeFile(paths.cv, markdown, 'utf-8');
  return markdown;
}

// ── Profile (config/profile.yml) ────────────────────────────────────

export async function readProfile() {
  if (!existsSync(paths.profile)) return null;
  try {
    return yaml.load(await readFile(paths.profile, 'utf-8')) || null;
  } catch {
    return null;
  }
}

export async function writeProfile({ fullName, email, location, timezone, targetRoles = [] }) {
  const profile = {
    candidate: {
      full_name: fullName || '',
      email: email || '',
      location: location || '',
      timezone: timezone || '',
    },
    target_roles: {
      primary: targetRoles,
    },
  };
  await writeFile(paths.profile, yaml.dump(profile), 'utf-8');
  return profile;
}

// ── Reports + tracker ───────────────────────────────────────────────

export async function nextReportNumber() {
  if (!existsSync(paths.reportsDir)) return 1;
  const files = await readdir(paths.reportsDir);
  const nums = files
    .map(f => f.match(/^(\d{3})-/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

export function slugify(value) {
  return String(value || 'company')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'company';
}

export async function writeReport({ num, slug, date, content }) {
  const filename = `${String(num).padStart(3, '0')}-${slug}-${date}.md`;
  await writeFile(join(paths.reportsDir, filename), content, 'utf-8');
  return filename;
}

export async function appendApplication({ num, date, company, role, score, pdfName, reportName, note }) {
  if (!existsSync(paths.applications)) {
    await writeFile(paths.applications, APPLICATIONS_HEADER, 'utf-8');
  }
  const scoreCell = score == null ? 'N/A' : `${score}/5`;
  const pdfCell = pdfName ? '✅' : '❌';
  const reportCell = `[${num}](reports/${reportName})`;
  const row = `| ${num} | ${date} | ${escapeCell(company)} | ${escapeCell(role)} | ${scoreCell} | Evaluated | ${pdfCell} | ${reportCell} | ${escapeCell(note || '')} |\n`;
  await appendFile(paths.applications, row, 'utf-8');
}

export async function listApplications() {
  if (!existsSync(paths.applications)) return [];
  const text = await readFile(paths.applications, 'utf-8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 10) continue;
    const num = parseInt(parts[1], 10);
    if (Number.isNaN(num)) continue;
    const reportMatch = parts[8].match(/\(reports\/([^)]+)\)/);
    rows.push({
      num,
      date: parts[2],
      company: parts[3],
      role: parts[4],
      score: parts[5],
      status: parts[6],
      pdf: parts[7],
      reportName: reportMatch ? reportMatch[1] : null,
      notes: parts[9] || '',
    });
  }
  return rows.sort((a, b) => b.num - a.num);
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}
