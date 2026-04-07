import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const REQUIRED_RUNTIME_FILES = [
  'runtime/modes.yml',
  'runtime/context-loading.yml',
  'runtime/operating-rules.md',
];

const REQUIRED_RUNTIME_REFERENCES = [...REQUIRED_RUNTIME_FILES];

const ADAPTER_MANIFESTS = [
  {
    id: 'claude',
    manifest: 'runtime/adapters/claude.yml',
    entrypoints: ['.claude/skills/career-ops/SKILL.md'],
    documentedOnly: false,
  },
  {
    id: 'opencode',
    manifest: 'runtime/adapters/opencode.yml',
    entrypoints: ['AGENTS.md', '.opencode/commands/career-ops.md', '.opencode/agents/career-ops.md'],
    documentedOnly: false,
  },
  {
    id: 'codex',
    manifest: 'runtime/adapters/codex.yml',
    entrypoints: ['docs/runtime-adapters/codex.md'],
    documentedOnly: true,
  },
  {
    id: 'gemini-cli',
    manifest: 'runtime/adapters/gemini-cli.yml',
    entrypoints: ['docs/runtime-adapters/gemini-cli.md'],
    documentedOnly: true,
  },
  {
    id: 'copilot-cli',
    manifest: 'runtime/adapters/copilot-cli.yml',
    entrypoints: ['docs/runtime-adapters/copilot-cli.md'],
    documentedOnly: true,
  },
];

const DOCUMENTED_ONLY_DOC_REQUIREMENTS = [
  'documented-only',
  'not part of this PR',
  'must not imply full parity',
  'batch/background worker abstraction is deferred',
];

export const DEFERRED_SCOPE_REQUIREMENTS = [
  {
    file: 'README.md',
    text: 'batch/background worker abstraction is deferred and not part of this PR',
  },
  {
    file: 'docs/ARCHITECTURE.md',
    text: 'batch/background worker abstraction is deferred and not part of this PR',
  },
  {
    file: 'docs/SETUP.md',
    text: 'workers later: batch/background worker abstraction is deferred and not part of this PR.',
  },
];

function readIfExists(root, relativePath) {
  const absolutePath = join(root, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : null;
}

function parseSupportsBoolean(manifestContent, key) {
  const match = manifestContent.match(new RegExp(`\\b${key}:\\s*(true|false)\\b`));
  return match ? match[1] === 'true' : null;
}

function validateManifestShape(root, adapter, failures) {
  const content = readIfExists(root, adapter.manifest);
  if (!content) {
    failures.push(`Missing adapter manifest: ${adapter.manifest}`);
    return;
  }

  const requiredManifestFields = [
    `id: ${adapter.id}`,
    'supports:',
    'interactive:',
    'manual_flows:',
    'batch_workers:',
    'documented_only:',
    'extensions:',
    'additive_only: true',
    'must_preserve:',
  ];

  for (const field of requiredManifestFields) {
    if (!content.includes(field)) {
      failures.push(`${adapter.manifest} must declare ${field}`);
    }
  }

  const documentedOnly = parseSupportsBoolean(content, 'documented_only');
  const interactive = parseSupportsBoolean(content, 'interactive');
  const manualFlows = parseSupportsBoolean(content, 'manual_flows');
  const batchWorkers = parseSupportsBoolean(content, 'batch_workers');

  if (documentedOnly === null || interactive === null || manualFlows === null || batchWorkers === null) {
    failures.push(`${adapter.manifest} must use explicit boolean support flags`);
    return;
  }

  if (documentedOnly !== adapter.documentedOnly) {
    failures.push(`${adapter.manifest} documented_only must be ${adapter.documentedOnly}`);
  }

  if (adapter.documentedOnly) {
    if (interactive || manualFlows || batchWorkers) {
      failures.push(`${adapter.manifest} documented-only adapters must not imply full parity`);
    }
  }
}

function validateEntrypointReferences(root, adapter, failures) {
  for (const entrypoint of adapter.entrypoints) {
    const content = readIfExists(root, entrypoint);
    if (!content) {
      failures.push(`Missing adapter entrypoint: ${entrypoint}`);
      continue;
    }

    for (const runtimeFile of REQUIRED_RUNTIME_REFERENCES) {
      if (!content.includes(runtimeFile)) {
        failures.push(`${entrypoint} must reference ${runtimeFile}`);
      }
    }

    if (adapter.documentedOnly) {
      for (const requirement of DOCUMENTED_ONLY_DOC_REQUIREMENTS) {
        if (!content.includes(requirement)) {
          failures.push(`${entrypoint} must state ${requirement}`);
        }
      }
    }
  }
}

export function validateDeferredScopeDocs(root) {
  const failures = [];

  for (const requirement of DEFERRED_SCOPE_REQUIREMENTS) {
    const content = readIfExists(root, requirement.file);
    if (!content) {
      failures.push(`Missing deferred-scope doc: ${requirement.file}`);
      continue;
    }

    if (!content.includes(requirement.text)) {
      failures.push(`${requirement.file} must state that ${requirement.text}`);
    }
  }

  return failures;
}

export function validateAdapterReferences(root) {
  const failures = [];

  for (const relativePath of REQUIRED_RUNTIME_FILES) {
    if (!existsSync(join(root, relativePath))) {
      failures.push(`Missing canonical runtime file: ${relativePath}`);
    }
  }

  for (const adapter of ADAPTER_MANIFESTS) {
    validateManifestShape(root, adapter, failures);
    validateEntrypointReferences(root, adapter, failures);
  }

  return failures;
}
