/**
 * Career-Ops CLI - Helper Utilities
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export function ensureDirectories() {
  const dirs = ['reports', 'output', 'data', 'batch/tracker-additions'];
  for (const dir of dirs) {
    const path = join(process.cwd(), dir);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }
}

export function generateReportNumber() {
  // Generate sequential 3-digit number
  // In real implementation, would scan existing reports
  const date = new Date();
  const timestamp = date.getTime();
  return String(timestamp % 1000).padStart(3, '0');
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

export function saveReport(content, company, role) {
  const date = new Date().toISOString().split('T')[0];
  const num = generateReportNumber();
  const slug = slugify(`${company}-${role}`);
  
  const filename = `${num}-${slug}-${date}.md`;
  const filepath = join(process.cwd(), 'reports', filename);
  
  ensureDirectories();
  writeFileSync(filepath, content, 'utf-8');
  
  return { filename, filepath };
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function truncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function extractScore(text) {
  // Try to extract score from evaluation text
  const patterns = [
    /Score:\s*(\d+\.?\d*)\s*\/\s*5/i,
    /(\d+\.?\d*)\s*\/\s*5/,
    /score\s+of\s+(\d+\.?\d*)/i,
    /(\d+\.?\d*)\s*out\s+of\s*5/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  
  return null;
}
