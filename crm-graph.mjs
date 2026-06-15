#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const DEFAULT_TRACKER = 'data/applications.md';
const DEFAULT_FOLLOWUPS = 'data/follow-ups.md';

function slug(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

export function parseApplications(markdown = '') {
  return markdown.split('\n')
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .map(([id, date, company, role, score, status, pdf, report, notes]) => ({
      id,
      date,
      company,
      role,
      score,
      status,
      pdf,
      report,
      notes,
    }));
}

export function buildCrmGraph({ applications = [], followups = '' } = {}) {
  const companies = new Map();
  const roles = [];
  const apps = [];
  const interactions = [];

  for (const app of applications) {
    const companyId = slug(app.company);
    if (!companies.has(companyId)) {
      companies.set(companyId, { id: companyId, name: app.company, applications: 0, interactions: 0 });
    }
    companies.get(companyId).applications += 1;
    const roleId = `${companyId}-${slug(app.role)}`;
    roles.push({ id: roleId, company_id: companyId, title: app.role });
    apps.push({ id: app.id, company_id: companyId, role_id: roleId, status: app.status, score: app.score, report: app.report, pdf: app.pdf });
  }

  for (const line of followups.split('\n')) {
    const match = line.match(/^\s*[-*]\s*(\d{4}-\d{2}-\d{2})?\s*([^:]+):\s*(.*)$/);
    if (!match) continue;
    const summary = match[3].trim();
    const companyName = match[2].trim();
    const companyId = slug(companyName);
    if (!companies.has(companyId)) {
      companies.set(companyId, { id: companyId, name: companyName, applications: 0, interactions: 0 });
    }
    companies.get(companyId).interactions += 1;
    interactions.push({ id: `${companyId}-${interactions.length + 1}`, company_id: companyId, type: 'follow-up', date: match[1] || '', summary });
  }

  return {
    schema_version: 'career-ops.crm-graph/v1',
    companies: Array.from(companies.values()),
    roles,
    applications: apps,
    interactions,
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const tracker = process.argv[2] || DEFAULT_TRACKER;
  const followups = process.argv[3] || DEFAULT_FOLLOWUPS;
  const applications = existsSync(tracker) ? parseApplications(readFileSync(tracker, 'utf8')) : [];
  const followupText = existsSync(followups) ? readFileSync(followups, 'utf8') : '';
  console.log(JSON.stringify(buildCrmGraph({ applications, followups: followupText }), null, 2));
}
