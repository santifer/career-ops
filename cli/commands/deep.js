#!/usr/bin/env node
/**
 * Career-Ops CLI - Deep Command
 * Deep company research for interview prep
 * 
 * Usage: career-ops deep <company> [options]
 */

import { Command } from 'commander';
import { loadConfig, loadMode } from '../core/config.js';
import { LLMClient } from '../core/llm.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('deep')
  .description('Deep company research for interview prep')
  .argument('<company>', 'Company name to research')
  .option('-r, --role <role>', 'Role you are interviewing for')
  .option('-m, --model <model>', 'LLM model to use', 'openrouter/auto')
  .option('-o, --output <file>', 'Output file for research report')
  .action(async (company, options) => {
    try {
      logger.section(`🔍 Deep Research: ${company}`);
      
      // Load deep mode from modes/ directory (like Claude Code)
      const mode = loadMode('deep');
      
      const config = loadConfig();
      const llm = new LLMClient(config.apiKey, options.model || config.model, config.provider);
      
      logger.info('Generating comprehensive company research...');
      
      const prompt = buildDeepResearchPrompt(mode, company, options);
      
      const result = await llm.chat(prompt, {
        maxTokens: 4000,
        temperature: 0.7
      });
      
      logger.divider();
      console.log(result);
      logger.divider();
      
      // Save report if output specified
      if (options.output) {
        const { writeFileSync } = await import('fs');
        writeFileSync(options.output, result, 'utf-8');
        logger.success(`Research saved: ${options.output}`);
      }
      
      logger.section('💡 Interview Tips');
      console.log('• Research the company website, blog, and recent news');
      console.log('• Check Glassdoor for interview experiences');
      console.log('• Review the company\'s GitHub (if applicable)');
      console.log('• Prepare 3-5 thoughtful questions about the company');
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

function buildDeepResearchPrompt(company, options) {
  return `
You are conducting deep research on a company for interview preparation.

# COMPANY
Name: ${company}
${options.role ? `Role to research for: ${options.role}` : ''}

# RESEARCH FRAMEWORK
Provide a comprehensive research report covering:

## 1. Company Overview
- What does the company do? (products/services)
- Industry and market position
- Company size, stage (startup/scaleup/enterprise)
- Recent funding status (if known)
- Key competitors

## 2. Culture & Values
- Stated company values
- Culture indicators (remote policy, work-life balance, diversity)
- Leadership team background
- Engineering culture (if applicable)

## 3. Recent News & Developments
- Product launches (last 12 months)
- Major announcements
- Funding rounds or acquisitions
- Awards or recognition

## 4. Tech Stack (if applicable)
- Technologies they use
- Open source contributions
- Engineering blog topics

## 5. Interview Insights
- Common interview questions for this company
- Interview process (rounds, format)
- What they look for in candidates
- Red flags or concerns to watch for

## 6. Questions to Ask
Prepare 5-7 insightful questions to ask the interviewer:
- About the role/team
- About company direction
- About culture/work environment
- About growth opportunities

## 7. Talking Points
3-5 specific points that show you\'ve done your research:
- Mention recent news or product
- Connect your experience to their tech stack
- Reference their values

Format as a structured report with clear sections.
`;
}

program.parse();
