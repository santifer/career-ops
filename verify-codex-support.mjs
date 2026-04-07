#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const REQUIRED_PLUGIN_SKILLS = [
  'career-ops-core',
  'career-ops-evaluate',
  'career-ops-scan',
  'career-ops-pdf',
  'career-ops-batch',
  'career-ops-tracker',
  'career-ops-apply',
  'career-ops-pipeline',
  'career-ops-contact',
  'career-ops-deep',
  'career-ops-training',
  'career-ops-project',
];

const REQUIRED_MODE_NAMES = [
  'auto-pipeline',
  'oferta',
  'ofertas',
  'contacto',
  'deep',
  'pdf',
  'training',
  'project',
  'tracker',
  'pipeline',
  'apply',
  'scan',
  'batch',
];

const REQUIRED_RULE_SNIPPETS = [
  'node update-system.mjs check',
  'modes/_profile.md',
  'config/profile.yml',
  'Never put user-specific customization into `modes/_shared.md`.',
  'Never submit an application',
  'Playwright',
  'node merge-tracker.mjs',
  'Never add new tracker rows directly to `data/applications.md`.',
];

const failures = [];

function read(relativePath) {
  const absolutePath = join(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing file: ${relativePath}`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const agents = read('AGENTS.md');
const claude = read('CLAUDE.md');
const dataContract = read('DATA_CONTRACT.md');
const readme = read('README.md');
const setup = read('docs/SETUP.md');
const codexDoc = read('docs/CODEX.md');
const routerSkill = read('.claude/skills/career-ops/SKILL.md');
const pluginManifestRaw = read('plugins/career-ops/.codex-plugin/plugin.json');
const marketplaceRaw = read('.agents/plugins/marketplace.json');
const packageJsonRaw = read('package.json');

expect(agents.includes('## Data Contract'), 'AGENTS.md is missing section: ## Data Contract');
expect(agents.includes('## Update Check'), 'AGENTS.md is missing section: ## Update Check');
expect(agents.includes('## First Run Onboarding'), 'AGENTS.md is missing section: ## First Run Onboarding');
expect(agents.includes('## Ethical Use'), 'AGENTS.md is missing section: ## Ethical Use');
expect(agents.includes('## Offer Verification'), 'AGENTS.md is missing section: ## Offer Verification');
expect(agents.includes('## Pipeline Integrity'), 'AGENTS.md is missing section: ## Pipeline Integrity');

expect(claude.includes('## Data Contract'), 'CLAUDE.md is missing section: ## Data Contract');
expect(claude.includes('## Update Check'), 'CLAUDE.md is missing section: ## Update Check');
expect(claude.includes('First Run'), 'CLAUDE.md is missing onboarding guidance.');
expect(claude.includes('## Ethical Use'), 'CLAUDE.md is missing section: ## Ethical Use');
expect(claude.includes('## Offer Verification'), 'CLAUDE.md is missing section: ## Offer Verification');
expect(claude.includes('### Pipeline Integrity'), 'CLAUDE.md is missing section: Pipeline Integrity');

for (const snippet of REQUIRED_RULE_SNIPPETS) {
  expect(agents.includes(snippet), `AGENTS.md is missing rule snippet: ${snippet}`);
}

expect(dataContract.includes('AGENTS.md'), 'DATA_CONTRACT.md must list AGENTS.md in the system layer.');
expect(dataContract.includes('plugins/career-ops/*'), 'DATA_CONTRACT.md must list the repo-local plugin in the system layer.');
expect(dataContract.includes('.agents/plugins/marketplace.json'), 'DATA_CONTRACT.md must list the Codex marketplace in the system layer.');
expect(readme.includes('Codex'), 'README.md must mention Codex.');
expect(setup.includes('Codex'), 'docs/SETUP.md must mention Codex.');
expect(codexDoc.includes('repo-local plugin'), 'docs/CODEX.md must explain the repo-local plugin.');

for (const mode of REQUIRED_MODE_NAMES) {
  expect(routerSkill.includes(`\`${mode}\``), `Claude router skill is missing mode: ${mode}`);
}

let pluginManifest;
let marketplace;
let packageJson;

try {
  pluginManifest = JSON.parse(pluginManifestRaw);
} catch {
  failures.push('plugins/career-ops/.codex-plugin/plugin.json is not valid JSON.');
}

try {
  marketplace = JSON.parse(marketplaceRaw);
} catch {
  failures.push('.agents/plugins/marketplace.json is not valid JSON.');
}

try {
  packageJson = JSON.parse(packageJsonRaw);
} catch {
  failures.push('package.json is not valid JSON.');
}

if (pluginManifest) {
  expect(pluginManifest.name === 'career-ops', 'Plugin manifest name must be "career-ops".');
  expect(pluginManifest.skills === './skills/', 'Plugin manifest must point skills to ./skills/.');
  expect(Array.isArray(pluginManifest.interface?.defaultPrompt), 'Plugin manifest must include interface.defaultPrompt.');
}

if (marketplace) {
  const plugin = marketplace.plugins?.find((entry) => entry.name === 'career-ops');
  expect(Boolean(plugin), 'Marketplace must include the career-ops plugin.');
  expect(plugin?.source?.path === './plugins/career-ops', 'Marketplace plugin path must be ./plugins/career-ops.');
}

if (packageJson) {
  expect(Boolean(packageJson.scripts?.['verify:codex']), 'package.json must define npm run verify:codex.');
}

for (const skill of REQUIRED_PLUGIN_SKILLS) {
  expect(existsSync(join(ROOT, 'plugins', 'career-ops', 'skills', skill, 'SKILL.md')), `Missing skill file for ${skill}.`);
  expect(existsSync(join(ROOT, 'plugins', 'career-ops', 'skills', skill, 'agents', 'openai.yaml')), `Missing agents/openai.yaml for ${skill}.`);
}

if (failures.length > 0) {
  console.error('Codex support verification failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Codex support verification passed.');
