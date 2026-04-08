#!/usr/bin/env node
/**
 * Career-Ops CLI - Training Command
 * Evaluate a course or certification against career goals
 */

import { Command } from 'commander';
import { loadConfig, loadCV, loadMode } from '../core/config.js';
import { LLMClient } from '../core/llm.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('training')
  .description('Evaluate a course/certification against career goals')
  .argument('<course>', 'Course URL, name, or description')
  .option('-c, --cost <amount>', 'Course cost', '0')
  .option('-d, --duration <hours>', 'Course duration in hours')
  .option('-p, --provider <name>', 'Course provider (e.g., Coursera, Udemy)')
  .option('-m, --model <model>', 'LLM model to use', 'openrouter/auto')
  .action(async (course, options) => {
    try {
      logger.section('📚 Training Evaluation');
      
      // Load training mode from modes/ directory (like Claude Code)
      const mode = loadMode('training');
      
      const config = loadConfig();
      const llm = new LLMClient(config.apiKey, options.model || config.model, config.provider);
      
      const cv = loadCV();
      const targetRoles = config.profile?.target_roles?.primary?.join(', ') || 'Not specified';
      
      logger.info(`Evaluating: ${course}`);
      
      const prompt = buildTrainingPrompt(mode, cv, course, targetRoles, options);
      
      const result = await llm.chat(prompt, {
        maxTokens: 2500,
        temperature: 0.7
      });
      
      logger.divider();
      console.log(result);
      logger.divider();
      
      logger.section('💡 Decision Framework');
      console.log('Consider this course if:');
      console.log('• It fills a critical skill gap for your target roles');
      console.log('• The ROI (career impact / cost) is positive');
      console.log('• You have time to complete it properly');
      console.log('• It provides recognized credentials');
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

function buildTrainingPrompt(cv, course, targetRoles, options) {
  return `
You are a career advisor evaluating a training opportunity.

# CANDIDATE PROFILE
CV Summary:
${cv.slice(0, 2000)}...

Target Roles: ${targetRoles}

# COURSE TO EVALUATE
Name/URL: ${course}
Provider: ${options.provider || 'Not specified'}
Cost: ${options.cost}
Duration: ${options.duration || 'Not specified'} hours

# EVALUATION FRAMEWORK

## 1. Course Analysis
- What skills does this course teach?
- How relevant are these skills to current industry demands?
- Is the content up-to-date and practical?

## 2. Career Alignment
- Does this course directly support the candidate's target roles?
- Which specific skills from the job descriptions does it cover?
- Are there better alternatives for the same skills?

## 3. ROI Assessment
**Cost Analysis:**
- Course cost: $${options.cost}
- Time investment: ${options.duration || 'Unknown'} hours
- Estimated value to career: High / Medium / Low

## 4. Alternative Comparison
Suggest 2-3 alternative ways to learn the same skills (free or cheaper)

## 5. Recommendation
**Verdict:** TAKE / SKIP / CONSIDER

**Reasoning:** One paragraph explaining why

## 6. If Taking the Course
- Prerequisites to complete first
- How to apply learnings immediately
- How to showcase this on CV/LinkedIn

Provide a clear, actionable recommendation.
`;
}

program.parse();
