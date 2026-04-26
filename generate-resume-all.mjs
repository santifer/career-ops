#!/usr/bin/env node

/**
 * generate-resume-all.mjs
 * Orchestrates DOCX and PDF generation using the unified template.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { generateResume, generateHTML, SAMPLE_DATA } from './resume_template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, 'output');
mkdirSync(outputDir, { recursive: true });

async function run() {
  const args = process.argv.slice(2);
  let data = SAMPLE_DATA;

  // Load external data if provided
  const dataFlag = args.indexOf("--data");
  if (dataFlag !== -1 && args[dataFlag + 1]) {
    data = JSON.parse(readFileSync(resolve(args[dataFlag + 1]), "utf8"));
  }

  console.log("🚀 Starting unified resume generation...");

  // 1. Generate DOCX
  const docxPath = resolve(outputDir, 'resume.docx');
  await generateResume(data, docxPath);

  // 2. Generate HTML (intermediate step for PDF)
  const templatePath = resolve(__dirname, 'templates', 'cv-template.html');
  let html = readFileSync(templatePath, 'utf8');
  const placeholders = generateHTML(data);

  // Inject defaults for missing sections or config
  const defaults = {
    PAGE_WIDTH: '210mm',
    SECTION_SUMMARY: 'Professional Summary',
    SECTION_COMPETENCIES: 'Core Competencies',
    SECTION_EDUCATION: 'Education',
    SECTION_EXPERIENCE: 'Work Experience',
    SECTION_PROJECTS: 'Projects',
    SECTION_SKILLS: 'Technical Skills',
    SECTION_CERTIFICATIONS: 'Certifications',
    COMPETENCIES: ''
  };

  const finalPlaceholders = { ...defaults, ...placeholders };

  // Safe string replacement (avoids $ expansion in values)
  for (const [key, value] of Object.entries(finalPlaceholders)) {
    const target = `{{${key}}}`;
    html = html.split(target).join(value || '');
  }
  
  // Handle basic Handlebars-like blocks
  html = html.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, key, content) => {
    return finalPlaceholders[key] ? content : '';
  });

  // Strip any remaining unset placeholders
  html = html.replace(/{{[A-Z_]+}}/g, '');

  const tempHtmlPath = resolve(outputDir, 'resume_temp.html');
  writeFileSync(tempHtmlPath, html);
  console.log("✅ Intermediate HTML generated.");

  // 3. Generate PDF
  const pdfPath = resolve(outputDir, 'resume.pdf');
  console.log("⏳ Generating PDF via Playwright...");
  try {
    execSync(`node generate-pdf.mjs "${tempHtmlPath}" "${pdfPath}" --format=a4`, { stdio: 'inherit' });
    console.log(`✅ PDF generated: ${pdfPath}`);
  } catch (err) {
    console.error("❌ PDF generation failed:", err.message);
  }

  console.log("\n✨ All formats generated in output/ folder.");
}

run().catch(console.error);
