#!/usr/bin/env node
/**
 * Career-Ops CLI - Contact Command
 * LinkedIn outreach message generator
 * 
 * Usage: career-ops contact <company> [options]
 */

import { Command } from 'commander';
import { loadConfig, loadCV, loadMode } from '../core/config.js';
import { LLMClient } from '../core/llm.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('contact')
  .description('Generate LinkedIn outreach message')
  .argument('<company>', 'Target company name')
  .option('-r, --role <role>', 'Target role at company (e.g., "Hiring Manager")')
  .option('-p, --person <name>', 'Specific person name (if known)')
  .option('-l, --linkedin <url>', 'LinkedIn profile URL')
  .option('-m, --model <model>', 'LLM model to use', 'openrouter/auto')
  .option('-t, --tone <tone>', 'Message tone (professional, casual, enthusiastic)', 'professional')
  .action(async (company, options) => {
    try {
      logger.section('📧 LinkedIn Outreach Generator');
      
      const config = loadConfig();
      const llm = new LLMClient(config.apiKey, options.model || config.model, config.provider);
      
      const cv = loadCV();
      const mode = loadMode('contacto');
      
      logger.info(`Generating outreach message for ${company}...`);
      
      const prompt = buildContactPrompt(mode, cv, company, options);
      
      const result = await llm.chat(prompt, {
        maxTokens: 1500,
        temperature: 0.8
      });
      
      logger.divider();
      console.log(result);
      logger.divider();
      
      logger.section('💡 Usage Tips');
      console.log('1. Personalize the message with specific details');
      console.log('2. Research the person/company before sending');
      console.log('3. Keep it concise (under 300 words)');
      console.log('4. Include a clear call-to-action');
      console.log('5. Follow up after 1 week if no response');
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

function buildContactPrompt(mode, cv, company, options) {
  return `
You are helping craft a LinkedIn outreach message.

# CANDIDATE CV
${cv}

# TARGET
Company: ${company}
${options.role ? `Role: ${options.role}` : ''}
${options.person ? `Person: ${options.person}` : ''}
${options.linkedin ? `LinkedIn: ${options.linkedin}` : ''}

# MESSAGE REQUIREMENTS
Tone: ${options.tone}
Purpose: Request informational interview or express interest in opportunities

# OUTPUT
Provide:

1. **Connection Request Message** (300 characters max for LinkedIn connection)

2. **Follow-up Message** (if they accept) - Include:
   - Brief intro (1-2 sentences)
   - Why you're interested in their company/role
   - Specific question or request (informational interview, advice, etc.)
   - Thank you and sign-off

3. **Alternative: Cold Email Version** (if no LinkedIn connection possible)

4. **Subject Line Options** (3 variations)

5. **Customizations to Make** (specific blanks to fill in based on your research)

Make the message warm, specific, and respectful of their time.
`;
}

function loadMode(modeName) {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  
  try {
    return readFileSync(join(process.cwd(), 'modes', `${modeName}.md`), 'utf-8');
  } catch (e) {
    return '';
  }
}

program.parse();
