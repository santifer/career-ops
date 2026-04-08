#!/usr/bin/env node
/**
 * Career-Ops Job Evaluator using OpenRouter AI
 * Usage: node evaluate-job.mjs "https://job-url.com" "Job Title at Company"
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load API key from .env
function loadEnv() {
  try {
    const envContent = readFileSync(join(__dirname, '.env'), 'utf-8');
    const lines = envContent.split('\n');
    const env = {};
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
    return env;
  } catch (e) {
    console.error('Error loading .env file:', e.message);
    return {};
  }
}

// Temporarily hardcoded API key for testing
const OPENROUTER_API_KEY = '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';

// const env = loadEnv();
// const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY not found');
  process.exit(1);
}

// Load CV and evaluation mode
function loadFiles() {
  try {
    const cv = readFileSync(join(__dirname, 'cv.md'), 'utf-8');
    const mode = readFileSync(join(__dirname, 'modes', 'oferta.md'), 'utf-8');
    return { cv, mode };
  } catch (e) {
    console.error('Error loading files:', e.message);
    process.exit(1);
  }
}

// Evaluate job using OpenRouter
async function evaluateJob(jobUrl, jobTitle) {
  const { cv, mode } = loadFiles();
  
  const model = 'openrouter/auto';
  
  const prompt = `
You are a career coach evaluating a job opportunity for a Front-End Developer.

# CANDIDATE CV:
${cv}

# EVALUATION FRAMEWORK:
${mode}

# JOB TO EVALUATE:
Title: ${jobTitle || 'Not provided'}
URL: ${jobUrl}

Please fetch the job description from the URL and evaluate it using the framework above.
Provide:
1. Role summary (what the job is about)
2. CV match analysis (strengths and gaps)
3. Fit score (1-5 scale)
4. Recommendation (apply or skip)
5. Suggested next steps

Format your response in clear sections with markdown.
`;

  console.log('🤖 Evaluating job with OpenRouter...\n');
  console.log(`Model: ${model}`);
  console.log(`Job: ${jobTitle || jobUrl}\n`);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://career-ops.local',
        'X-Title': 'Career-Ops Job Evaluator'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are a career coach helping evaluate job opportunities.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const evaluation = data.choices[0].message.content;
    
    console.log('═'.repeat(80));
    console.log('📊 JOB EVALUATION REPORT');
    console.log('═'.repeat(80));
    console.log(evaluation);
    console.log('═'.repeat(80));
    
    // Save to reports folder
    const timestamp = new Date().toISOString().split('T')[0];
    const slug = (jobTitle || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const filename = `eval-${timestamp}-${slug}.md`;
    
    console.log(`\n💾 Report saved to: reports/${filename}`);
    
    return evaluation;
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Main
const jobUrl = process.argv[2];
const jobTitle = process.argv[3];

if (!jobUrl) {
  console.log(`
🎯 Career-Ops Job Evaluator (OpenRouter)

Usage:
  node evaluate-job.mjs "https://jobs.company.com/123" "Frontend Developer at Company"

Or just paste a URL:
  node evaluate-job.mjs "https://greenhouse.io/..."

Your API key is configured: ${OPENROUTER_API_KEY ? '✓' : '✗'}
`);
  process.exit(0);
}

evaluateJob(jobUrl, jobTitle);
