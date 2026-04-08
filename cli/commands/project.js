#!/usr/bin/env node
/**
 * Career-Ops CLI - Project Command
 * Evaluate a portfolio project for job search
 * 
 * Usage: career-ops project <project-description-or-url> [options]
 */

import { Command } from 'commander';
import { loadConfig, loadCV, loadMode } from '../core/config.js';
import { LLMClient } from '../core/llm.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('project')
  .description('Evaluate portfolio project for job search')
  .argument('<project>', 'Project description, URL, or repo link')
  .option('-t, --title <title>', 'Project title')
  .option('-s, --stack <tech>', 'Tech stack used (comma-separated)')
  .option('-l, --link <url>', 'Live demo URL')
  .option('-r, --repo <url>', 'Repository URL')
  .option('-m, --model <model>', 'LLM model to use', 'openrouter/auto')
  .action(async (project, options) => {
    try {
      logger.section('🚀 Portfolio Project Evaluation');
      
      // Load project mode from modes/ directory (like Claude Code)
      const mode = loadMode('project');
      
      const config = loadConfig();
      const llm = new LLMClient(config.apiKey, options.model || config.model, config.provider);
      
      const cv = loadCV();
      const targetRoles = config.profile?.target_roles?.primary?.join(', ') || 'Not specified';
      
      const projectTitle = options.title || project.split('/').pop() || 'Unnamed Project';
      logger.info(`Evaluating: ${projectTitle}`);
      
      const prompt = buildProjectPrompt(mode, cv, project, targetRoles, options);
      
      const result = await llm.chat(prompt, {
        maxTokens: 2500,
        temperature: 0.7
      });
      
      logger.divider();
      console.log(result);
      logger.divider();
      
      logger.section('💡 Portfolio Tips');
      console.log('• Feature this project prominently if score >= 4.0');
      console.log('• Add to CV under "Key Projects" section');
      console.log('• Write a LinkedIn post explaining your learnings');
      console.log('• Prepare to discuss technical decisions in interviews');
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

function buildProjectPrompt(cv, project, targetRoles, options) {
  return `
You are evaluating a portfolio project for its job search value.

# CANDIDATE PROFILE
CV Summary:
${cv.slice(0, 2000)}...

Target Roles: ${targetRoles}

# PROJECT DETAILS
Title: ${options.title || 'Not specified'}
Description/URL: ${project}
Tech Stack: ${options.stack || 'Not specified'}
Live Demo: ${options.link || 'Not provided'}
Repository: ${options.repo || 'Not provided'}

# EVALUATION FRAMEWORK

## 1. Project Quality Assessment
- Does this demonstrate real technical skills?
- Is the scope appropriate (not too simple, not too complex)?
- Does it show problem-solving ability?
- Is the code quality professional?

## 2. Job Market Relevance
- How well does this align with the candidate's target roles?
- Does it use technologies in demand?
- Would hiring managers find this impressive?
- Does it fill a gap in the candidate's profile?

## 3. Presentation & Documentation
- Is it clearly explained what the project does?
- Is the README informative?
- Are there screenshots or demos?
- Can someone quickly understand the value?

## 4. Impact Score
Rate 1-5 on:
- Technical complexity
- Relevance to target roles
- Uniqueness/originality
- Polish/presentation
- Real-world applicability

**Overall Score: X.X/5**

## 5. Strengths to Highlight
List 3-5 specific talking points for:
- CV bullet point
- Interview discussion
- LinkedIn post

## 6. Improvements to Make
List 2-3 quick wins that would increase impact:
- Missing features
- Documentation gaps
- Deployment issues
- Code organization

## 7. Recommendation
**Showcase Priority:** HIGH / MEDIUM / LOW

**Suggested Actions:**
- Where to feature this (CV, LinkedIn, GitHub pinned)
- What to emphasize when discussing
- Which roles this project best supports

Provide actionable, specific feedback.
`;
}

program.parse();
