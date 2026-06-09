#!/usr/bin/env node
/**
 * load-personal-info.mjs — Loads and validates config/personal-info.yml
 *
 * Usage (one-time verification):
 *   node -e "import('./scripts/load-personal-info.mjs').then(m=>m.loadPersonalInfo()).then(p=>console.log('OK', p.name.full))"
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

const CONFIG_PATH   = path.join(ROOT, 'config', 'personal-info.yml');
const TEMPLATE_PATH = path.join(ROOT, 'config', 'personal-info.yml.template');

export class PersonalInfoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PersonalInfoError';
  }
}

/**
 * Load and validate config/personal-info.yml.
 * Required fields: name.first, name.last, contact.email, resume.path (file must exist).
 * Auto-derives name.full when empty.
 * @throws {PersonalInfoError} with actionable message on missing/invalid config
 * @returns {object} Parsed personal info
 */
export async function loadPersonalInfo() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new PersonalInfoError(
      `config/personal-info.yml not found.\n` +
      `One-time setup:\n` +
      `  copy config\\personal-info.yml.template config\\personal-info.yml\n` +
      `  notepad config\\personal-info.yml\n` +
      `  Fill in all fields. Save. (The .yml is gitignored — never commit real info.)`
    );
  }

  let yaml;
  try {
    ({ default: yaml } = await import('js-yaml'));
  } catch {
    throw new PersonalInfoError('js-yaml not found. Run: npm install js-yaml');
  }

  let info;
  try {
    info = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    throw new PersonalInfoError(`config/personal-info.yml YAML parse error: ${e.message}`);
  }

  if (!info || typeof info !== 'object') {
    throw new PersonalInfoError('config/personal-info.yml is empty or not valid YAML');
  }

  // Validate required fields
  const errors = [];

  if (!info.name?.first?.trim()) errors.push('name.first is required');
  if (!info.name?.last?.trim())  errors.push('name.last is required');
  if (!info.contact?.email?.trim()) errors.push('contact.email is required');

  const resumePath = info.resume?.path?.trim();
  if (!resumePath) {
    errors.push('resume.path is required (absolute path to your resume PDF)');
  } else if (!fs.existsSync(resumePath)) {
    errors.push(`resume.path file not found: ${resumePath}`);
  }

  if (errors.length > 0) {
    throw new PersonalInfoError(
      `config/personal-info.yml has ${errors.length} validation error(s):\n` +
      errors.map((e) => `  • ${e}`).join('\n') + '\n' +
      `Edit ${CONFIG_PATH} to fix.`
    );
  }

  // Auto-derive name.full
  if (!info.name.full?.trim()) {
    info.name.full = `${info.name.first.trim()} ${info.name.last.trim()}`;
  }

  // Ensure nested objects exist with defaults so callers don't need to null-check
  info.location    = info.location    || {};
  info.links       = info.links       || {};
  info.work_auth   = info.work_auth   || {};
  info.experience  = info.experience  || {};
  info.cover_letter = info.cover_letter || {};
  info.salary      = info.salary      || {};
  info.custom      = info.custom      || {};

  return info;
}
