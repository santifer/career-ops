import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { config, requireConfig } from './config.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AZURE_OPENAI_SCOPE = 'https://cognitiveservices.azure.com/.default';

async function readModeFile(name) {
  return readFile(join(ROOT, 'modes', name), 'utf-8');
}

export function getAzureOpenAiClient() {
  const endpoint = requireConfig(config.azure.openAiEndpoint, 'AZURE_OPENAI_ENDPOINT');
  const deployment = requireConfig(config.azure.openAiDeployment, 'AZURE_OPENAI_DEPLOYMENT');
  const apiVersion = config.azure.openAiApiVersion;

  // Prefer an API key when one is provided, otherwise fall back to keyless
  // Microsoft Entra auth (az login locally, managed identity in Azure).
  if (config.azure.openAiApiKey) {
    return new AzureOpenAI({ endpoint, apiKey: config.azure.openAiApiKey, apiVersion, deployment });
  }

  const azureADTokenProvider = getBearerTokenProvider(new DefaultAzureCredential(), AZURE_OPENAI_SCOPE);
  return new AzureOpenAI({ endpoint, azureADTokenProvider, apiVersion, deployment });
}

export async function evaluateJob({ profile, resumeMarkdown, job }) {
  const [sharedMode, offerMode] = await Promise.all([
    readModeFile('_shared.md'),
    readModeFile('oferta.md'),
  ]);

  const systemPrompt = [
    'You are career-ops running inside a hosted Azure web app.',
    'Evaluate the job against the candidate resume and profile.',
    'Return a concise but complete markdown report that follows the career-ops report format.',
    'Do not invent candidate experience. If evidence is missing, call it a gap.',
    'Never suggest auto-submitting an application.',
    '',
    '=== modes/_shared.md ===',
    sharedMode,
    '',
    '=== modes/oferta.md ===',
    offerMode,
  ].join('\n');

  const userPrompt = [
    '=== Candidate profile JSON ===',
    JSON.stringify(profile || {}, null, 2),
    '',
    '=== Candidate resume markdown ===',
    resumeMarkdown,
    '',
    '=== Job ===',
    `Company: ${job.company || 'Unknown'}`,
    `Title: ${job.title}`,
    `URL: ${job.url || ''}`,
    '',
    job.description,
  ].join('\n');

  const client = getAzureOpenAiClient();
  const completion = await client.chat.completions.create({
    model: config.azure.openAiDeployment,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  });

  const report = completion.choices?.[0]?.message?.content?.trim();
  if (!report) {
    throw new Error('Azure OpenAI returned an empty evaluation report');
  }

  return {
    reportMarkdown: report,
    score: extractScore(report),
  };
}

function extractScore(reportMarkdown) {
  const match = reportMarkdown.match(/\*\*Score:\*\*\s*([0-5](?:\.\d)?)/i)
    || reportMarkdown.match(/score[^\d]{0,20}([0-5](?:\.\d)?)(?:\s*\/\s*5)?/i);
  return match ? Number(match[1]) : null;
}
