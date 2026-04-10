#!/usr/bin/env node
/**
 * migrate-applications-to-json.mjs — Convert applications.md to applications.json
 *
 * Parses the markdown table format and converts to structured JSON.
 * Creates a backup of the original file.
 *
 * Run: node migrate-applications-to-json.mjs [--dry-run] [--reverse]
 *   --dry-run  Preview changes without writing files
 *   --reverse  Convert JSON back to Markdown (for migration rollback)
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = __dirname;

const DATA_DIR = join(CAREER_OPS, 'data');
const MD_FILE = existsSync(join(DATA_DIR, 'applications.md'))
  ? join(DATA_DIR, 'applications.md')
  : existsSync(join(CAREER_OPS, 'applications.md'))
    ? join(CAREER_OPS, 'applications.md')
    : null;

const JSON_FILE = join(DATA_DIR, 'applications.json');
const DRY_RUN = process.argv.includes('--dry-run');
const REVERSE = process.argv.includes('--reverse');

const SCORE_REGEX = /(\d+\.?\d*)\/5/;

function parseMarkdownTable(content) {
  const lines = content.split('\n');
  const apps = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('|')) continue;

    let fields;
    if (trimmed.includes('\t')) {
      const parts = trimmed.replace(/^\|+|\+$/g, '').split('\t');
      fields = parts.map(p => p.trim());
    } else {
      const parts = trimmed.split('|').map(s => s.trim());
      fields = parts.filter((_, i) => i > 0 && i < parts.length - 1);
    }

    if (fields.length < 8) continue;

    const num = parseInt(fields[0]);
    if (isNaN(num) || fields[0] === '#') continue;

    let score = 0;
    let scoreRaw = fields[4] || '';
    const scoreMatch = SCORE_REGEX.exec(scoreRaw);
    if (scoreMatch) {
      score = parseFloat(scoreMatch[1]);
    }

    let reportNumber = '';
    let reportPath = '';
    const reportMatch = /\[(\d+)\]\(([^)]+)\)/.exec(fields[7] || '');
    if (reportMatch) {
      reportNumber = reportMatch[1];
      reportPath = reportMatch[2];
    }

    apps.push({
      number: num,
      date: fields[1] || '',
      company: fields[2] || '',
      role: fields[3] || '',
      status: fields[5] || '',
      score: score,
      scoreRaw: scoreRaw,
      hasPdf: (fields[6] || '').includes('\u2705'),
      reportPath: reportPath,
      reportNumber: reportNumber,
      notes: fields[8] || '',
      jobUrl: ''
    });
  }

  return apps;
}

function appsToMarkdown(apps) {
  const header = '| # | Fecha | Empresa | Rol | Score | Status | PDF | Report | Notas |\n|---|-------|--------|-----|-------|--------|-----|--------|-------|\n';
  const rows = apps.map(app => {
    const pdf = app.hasPdf ? '\u2705' : '\u274c';
    const report = app.reportNumber ? `[${app.reportNumber}](${app.reportPath})` : '';
    return `| ${app.number} | ${app.date} | ${app.company} | ${app.role} | ${app.scoreRaw} | ${app.status} | ${pdf} | ${report} | ${app.notes} |`;
  });
  return header + rows.join('\n') + '\n';
}

async function migrateToJson() {
  if (!MD_FILE) {
    console.log('No applications.md found.');
    process.exit(1);
  }

  console.log(`Reading: ${MD_FILE}`);
  const content = readFileSync(MD_FILE, 'utf-8');
  const apps = parseMarkdownTable(content);

  if (apps.length === 0) {
    console.log('No applications found in markdown file.');
    process.exit(1);
  }

  const jsonData = {
    version: '1.0',
    applications: apps
  };

  console.log(`Found ${apps.length} applications`);
  console.log('\nPreview (first 3):');
  apps.slice(0, 3).forEach(app => {
    console.log(`  #${app.number}: ${app.company} - ${app.role} (${app.status})`);
  });

  if (DRY_RUN) {
    console.log('\n(dry-run — no files written)');
    return;
  }

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  copyFileSync(MD_FILE, MD_FILE + '.bak');
  console.log(`\nBackup created: ${MD_FILE}.bak`);

  const jsonContent = JSON.stringify(jsonData, null, 2);
  writeFileSync(JSON_FILE, jsonContent, 'utf-8');
  console.log(`Written: ${JSON_FILE}`);

  console.log('\nMigration complete!');
  console.log('The dashboard now supports applications.json. You can safely delete applications.md after verifying.');
}

async function migrateToMarkdown() {
  if (!existsSync(JSON_FILE)) {
    console.log('No applications.json found.');
    process.exit(1);
  }

  console.log(`Reading: ${JSON_FILE}`);
  const content = readFileSync(JSON_FILE, 'utf-8');
  const jsonData = JSON.parse(content);

  const apps = jsonData.applications || [];
  if (apps.length === 0) {
    console.log('No applications found in JSON file.');
    process.exit(1);
  }

  console.log(`Found ${apps.length} applications`);

  if (DRY_RUN) {
    const md = appsToMarkdown(apps);
    console.log('\n--- Generated Markdown (dry-run) ---');
    console.log(md);
    return;
  }

  const mdContent = appsToMarkdown(apps);

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  copyFileSync(JSON_FILE, JSON_FILE + '.bak');
  console.log(`\nBackup created: ${JSON_FILE}.bak`);

  writeFileSync(MD_FILE, mdContent, 'utf-8');
  console.log(`Written: ${MD_FILE}`);

  console.log('\nReverse migration complete!');
}

async function main() {
  if (REVERSE) {
    await migrateToMarkdown();
  } else {
    await migrateToJson();
  }
}

main().catch(console.error);
