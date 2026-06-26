import path from 'node:path';

export interface ScriptDef {
  id: string;
  label: string;
  description: string;
  script: string;
  paramFields: ParamField[];
}

export type ParamField =
  | { kind: 'number'; name: string; label: string; default?: number; min?: number; max?: number; placeholder?: string; required?: boolean }
  | { kind: 'string'; name: string; label: string; default?: string; placeholder?: string; required?: boolean }
  | { kind: 'enum'; name: string; label: string; options: string[]; default?: string };

const SCRIPT_DIR = 'scripts';

export const SCRIPTS: ScriptDef[] = [
  {
    id: 'scan',
    label: 'Scan portals for new jobs',
    description: 'Runs scan.mjs to pull fresh job postings from portals.yml.',
    script: 'scan.mjs',
    paramFields: [],
  },
  {
    id: 'scan-full',
    label: 'Scan all ATS providers (full sweep)',
    description: 'Same as scan, but no company-name filter — pulls everything every portal has right now.',
    script: 'scan-ats-full.mjs',
    paramFields: [],
  },
  {
    id: 'liveness',
    label: 'Check job posting liveness',
    description: 'Hits the URL of each tracked application to confirm the posting is still live.',
    script: 'check-liveness.mjs',
    paramFields: [],
  },
  {
    id: 'merge-tracker',
    label: 'Merge tracker additions',
    description: 'Pulls TSV additions from batch/tracker-additions/ into data/applications.md.',
    script: 'merge-tracker.mjs',
    paramFields: [],
  },
  {
    id: 'analyze-patterns',
    label: 'Analyze application patterns',
    description: 'Reports funnel conversion, archetype effectiveness, and common blockers.',
    script: 'analyze-patterns.mjs',
    paramFields: [],
  },
  {
    id: 'followup-cadence',
    label: 'Run follow-up cadence',
    description: 'Prints the followup dashboard (JSON to stdout, summary with --summary).',
    script: 'followup-cadence.mjs',
    paramFields: [
      { kind: 'enum', name: 'mode', label: 'Output mode', options: ['json', 'summary'], default: 'summary' },
    ],
  },
  {
    id: 'verify-portals',
    label: 'Validate portals.yml',
    description: 'Lints portals.yml against the schema.',
    script: 'verify-portals.mjs',
    paramFields: [],
  },
  {
    id: 'generate-pdf',
    label: 'Generate PDF for application',
    description: 'Runs generate-pdf.mjs for a specific application number.',
    script: 'generate-pdf.mjs',
    paramFields: [
      { kind: 'number', name: 'number', label: 'Application #', placeholder: '2', min: 1 },
    ],
  },
  {
    id: 'cv-sync-check',
    label: 'CV sync check',
    description: 'Verifies cv.md is in sync with profile.yml and modes/_profile.md.',
    script: 'cv-sync-check.mjs',
    paramFields: [],
  },
];

export interface AIScriptDef {
  id: string;
  label: string;
  description: string;
  mode: string;
  contextFields: ContextField[];
  argHint?: string;
}

export type ContextField =
  | { kind: 'string'; name: string; label: string; placeholder?: string; required?: boolean }
  | { kind: 'number'; name: string; label: string; placeholder?: string; required?: boolean }
  | { kind: 'text'; name: string; label: string; placeholder?: string; rows?: number };

export const AI_SCRIPTS: AIScriptDef[] = [
  {
    id: 'interview-prep',
    label: 'Prepare for interview at a company',
    description: 'Runs modes/interview-prep.md against a specific application.',
    mode: 'interview-prep',
    contextFields: [
      { kind: 'number', name: 'appNumber', label: 'Application #', placeholder: '2', required: true },
      { kind: 'string', name: 'company', label: 'Company', placeholder: 'Glean', required: true },
      { kind: 'string', name: 'role', label: 'Role', placeholder: 'AI Outcomes Manager' },
    ],
    argHint: 'Focus on the gaps from the report. Surface STAR+R stories.',
  },
  {
    id: 'apply',
    label: 'Draft application form answers',
    description: 'Runs modes/apply.md to fill out form fields for a specific application.',
    mode: 'apply',
    contextFields: [
      { kind: 'number', name: 'appNumber', label: 'Application #', placeholder: '2', required: true },
      { kind: 'string', name: 'company', label: 'Company', placeholder: 'Glean', required: true },
      { kind: 'string', name: 'role', label: 'Role', placeholder: 'AI Outcomes Manager' },
    ],
    argHint: 'Generate answers for the standard application questions.',
  },
  {
    id: 'contacto',
    label: 'Draft LinkedIn outreach',
    description: 'Runs modes/contacto.md to draft an outreach message.',
    mode: 'contacto',
    contextFields: [
      { kind: 'string', name: 'contactName', label: 'Contact name', placeholder: 'Jane Doe' },
      { kind: 'string', name: 'company', label: 'Company', placeholder: 'Glean', required: true },
      { kind: 'string', name: 'role', label: 'Role (if known)', placeholder: 'AI Outcomes Manager' },
      { kind: 'string', name: 'channel', label: 'Channel', placeholder: 'linkedin | email | other' },
    ],
    argHint: 'Draft a concise first-touch message referencing my KBR work.',
  },
  {
    id: 'cover',
    label: 'Draft cover letter',
    description: 'Runs modes/cover.md to draft a tailored cover letter.',
    mode: 'cover',
    contextFields: [
      { kind: 'number', name: 'appNumber', label: 'Application #', placeholder: '2', required: true },
      { kind: 'string', name: 'company', label: 'Company', placeholder: 'Glean', required: true },
      { kind: 'string', name: 'role', label: 'Role', placeholder: 'AI Outcomes Manager' },
      { kind: 'text', name: 'highlights', label: 'Highlights to weave in', placeholder: 'Agentpoint, 50+ agent rollout, executive AI initiative', rows: 3 },
    ],
    argHint: 'Generate a tailored cover letter referencing specific report gaps.',
  },
  {
    id: 'pipeline',
    label: 'Process next pending URL',
    description: 'Runs modes/pipeline.md to fetch, evaluate, and add the next pending URL.',
    mode: 'pipeline',
    contextFields: [
      { kind: 'number', name: 'limit', label: 'Limit (URLs to process)', placeholder: '1' },
    ],
    argHint: 'Pick the highest-fit URL and evaluate it.',
  },
];

export function getScript(id: string): ScriptDef | undefined {
  return SCRIPTS.find((s) => s.id === id);
}

export function getAiScript(id: string): AIScriptDef | undefined {
  return AI_SCRIPTS.find((s) => s.id === id);
}

export function resolveScriptPath(root: string, script: string): string {
  return path.join(root, script);
}
