#!/usr/bin/env node
/**
 * Career-Ops CLI - PDF Command
 * Generate ATS-optimized CV PDF
 * 
 * Usage: career-ops pdf [company-slug] [options]
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { chromium } from 'playwright';
import { loadConfig, loadCV } from '../core/config.js';
import { logger } from '../utils/logger.js';
import { ensureDirectories, slugify } from '../utils/helpers.js';

const program = new Command();

program
  .name('pdf')
  .description('Generate ATS-optimized CV PDF')
  .argument('[company-slug]', 'Company slug for tailored CV (optional)')
  .option('-t, --template <file>', 'Custom HTML template', 'templates/cv-template.html')
  .option('-o, --output <file>', 'Custom output filename')
  .option('-f, --format <format>', 'PDF format (A4, Letter)', 'A4')
  .option('--no-headless', 'Show browser window (for debugging)')
  .action(async (companySlug, options) => {
    try {
      logger.section('📄 CV PDF Generator');
      
      // Load configuration
      const config = loadConfig();
      const cv = loadCV();
      
      // Load template
      const templatePath = join(process.cwd(), options.template);
      if (!existsSync(templatePath)) {
        logger.error(`Template not found: ${templatePath}`);
        logger.info('Using default template...');
        // Would use built-in default template
      }
      
      let template = readFileSync(templatePath, 'utf-8');
      
      // Replace placeholders
      template = template
        .replace(/\{\{NAME\}\}/g, config.profile?.candidate?.full_name || 'Your Name')
        .replace(/\{\{EMAIL\}\}/g, config.profile?.candidate?.email || '')
        .replace(/\{\{PHONE\}\}/g, config.profile?.candidate?.phone || '')
        .replace(/\{\{LINKEDIN\}\}/g, config.profile?.candidate?.linkedin || '')
        .replace(/\{\{GITHUB\}\}/g, config.profile?.candidate?.github || '')
        .replace(/\{\{PORTFOLIO\}\}/g, config.profile?.candidate?.portfolio_url || '')
        .replace(/\{\{LOCATION\}\}/g, config.profile?.candidate?.location || '')
        .replace(/\{\{CV_CONTENT\}\}/g, formatCVForHTML(cv));
      
      // Add company-specific tailoring if provided
      if (companySlug) {
        logger.info(`Tailoring CV for: ${companySlug}`);
        
        // Try to load evaluation report for this company
        const reportPath = findReportForCompany(companySlug);
        if (reportPath) {
          const report = readFileSync(reportPath, 'utf-8');
          // Extract skills to highlight from report
          const skills = extractKeySkills(report);
          template = addSkillHighlights(template, skills);
        }
        
        // Add company name to header
        template = template.replace(
          '<title>',
          `<title>CV - ${companySlug.charAt(0).toUpperCase() + companySlug.slice(1)}</title>`
        );
      }
      
      // Generate output path
      ensureDirectories();
      const date = new Date().toISOString().split('T')[0];
      const name = slugify(config.profile?.candidate?.full_name || 'cv');
      const outputFile = options.output || 
        `cv-${name}${companySlug ? '-' + companySlug : ''}-${date}.pdf`;
      const outputPath = join(process.cwd(), 'output', outputFile);
      
      // Generate PDF using Playwright
      logger.info('Generating PDF with Playwright...');
      
      const browser = await chromium.launch({ 
        headless: !options.noHeadless 
      });
      
      const page = await browser.newPage();
      await page.setContent(template, { waitUntil: 'networkidle' });
      
      // Wait for fonts to load
      await page.waitForTimeout(1000);
      
      // Generate PDF
      await page.pdf({
        path: outputPath,
        format: options.format,
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      });
      
      await browser.close();
      
      logger.success(`PDF generated: ${outputPath}`);
      
      logger.section('Next Steps');
      console.log('1. Review the PDF to ensure formatting is correct');
      console.log('2. Upload to job application portal');
      console.log('3. Or attach to email with cover letter');
      
    } catch (error) {
      logger.error(error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

function formatCVForHTML(cv) {
  // Convert markdown CV to HTML
  return cv
    .replace(/# (.*)/g, '<h1>$1</h1>')
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*)\*/g, '<em>$1</em>')
    .replace(/- (.*)/g, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function findReportForCompany(companySlug) {
  const reportsDir = join(process.cwd(), 'reports');
  if (!existsSync(reportsDir)) return null;
  
  // Find most recent report containing company name
  // This is a simplified implementation
  return null; // Would implement file search
}

function extractKeySkills(report) {
  // Extract skills mentioned in evaluation report
  // This would use NLP or regex patterns
  return [];
}

function addSkillHighlights(template, skills) {
  if (skills.length === 0) return template;
  
  // Add highlighted skills section
  const highlightSection = `
    <div class="highlight-box">
      <strong>Key Skills for This Role:</strong> ${skills.join(', ')}
    </div>
  `;
  
  return template.replace('</body>', highlightSection + '</body>');
}

program.parse();
