#!/usr/bin/env node

/**
 * temp_cv_generator.mjs — Generates HTML CV from cv.md and profile.yml
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function generateHtmlCV() {
  try {
    // Read the template
    const template = await readFile(resolve(__dirname, 'templates/cv-template.html'), 'utf-8');

    // Read the CV markdown
    const cvMarkdown = await readFile(resolve(__dirname, 'cv.md'), 'utf-8');

    // Read the profile
    const profileYaml = await readFile(resolve(__dirname, 'config/profile.yml'), 'utf-8');

    // Basic YAML parsing to extract profile data
    const profileData = parseYAML(profileYaml);

    // Extract sections from CV markdown
    const sections = extractSections(cvMarkdown);

    // Get photo data if it exists
    let photoBlock = '';
    if (profileData.candidate && profileData.candidate.photo) {
      const photoPath = profileData.candidate.photo;
      if (photoPath && photoPath.trim() !== '') { // If a photo path is set
        try {
          const fs = await import('fs/promises');
          const pathModule = await import('path');
          const photoFullPath = pathModule.resolve(photoPath);
          const photoBuffer = await fs.readFile(photoFullPath);
          const base64Photo = photoBuffer.toString('base64');

          // Determine MIME type from file extension
          const ext = pathModule.extname(photoPath).toLowerCase();
          const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

          photoBlock = `<img class="cv-photo" src="data:${mimeType};base64,${base64Photo}" alt="">`;
        } catch (e) {
          console.log(`Could not load photo: ${e.message}`);
          photoBlock = '';
        }
      }
    }

    // Determine if we should use German or English
    const isGerman = profileData.language?.primary === 'de' || profileData.language?.primary === 'ua';
    const lang = isGerman ? 'de' : 'en';
    const pageWidth = '210mm'; // A4

    // Prepare section titles based on language
    const sectionTitles = isGerman ? {
      summary: 'Zusammenfassung',
      competencies: 'Kernkompetenzen',
      experience: 'Berufserfahrung',
      projects: 'Projekte',
      education: 'Bildung',
      certifications: 'Zertifizierungen',
      skills: 'Fähigkeiten'
    } : {
      summary: 'Professional Summary',
      competencies: 'Core Competencies',
      experience: 'Work Experience',
      projects: 'Projects',
      education: 'Education',
      certifications: 'Certifications',
      skills: 'Skills'
    };

    // Generate competencies from skills section in CV
    const competencies = generateCompetencies(sections.technologien_und_tools || sections.fahigkeiten || '');

    // Generate experience HTML
    const experienceHtml = generateExperienceHtml(sections.berufserfahrung || '');

    // Generate education HTML
    const educationHtml = generateEducationHtml(sections.bildung || '');

    // Generate skills HTML
    const skillsHtml = generateSkillsHtml(sections.technologien_und_tools || sections.fahigkeiten || '');

    // Generate projects HTML
    const projectsHtml = generateProjectsHtml(sections.projekte || '');

    // Generate certifications HTML
    const certificationsHtml = generateCertificationsHtml(sections.zertifizierungen || '');

    // Create contact row with proper formatting
    const contactRow = `
      <span>${profileData.candidate.email}</span>
      <span class="separator">|</span>
      <a href="${profileData.candidate.linkedin || '#'}">${profileData.candidate.linkedin || 'LinkedIn'}</a>
      <span class="separator">|</span>
      <a href="${profileData.candidate.portfolio_url || '#'}">${profileData.candidate.portfolio_url || 'Portfolio'}</a>
      <span class="separator">|</span>
      <span>${profileData.candidate.location}</span>
    `;

    // Fill in the template
    let html = template
      .replace('{{LANG}}', lang)
      .replace('{{PAGE_WIDTH}}', pageWidth)
      .replace('{{NAME}}', profileData.candidate.full_name)
      .replace('{{EMAIL}}', profileData.candidate.email)
      .replace('{{LINKEDIN_URL}}', profileData.candidate.linkedin_url || profileData.candidate.linkedin || '#')
      .replace('{{LINKEDIN_DISPLAY}}', profileData.candidate.linkedin || 'LinkedIn')
      .replace('{{PORTFOLIO_URL}}', profileData.candidate.portfolio_url || '#')
      .replace('{{PORTFOLIO_DISPLAY}}', profileData.candidate.portfolio_url ? (profileData.candidate.portfolio_url) : 'Portfolio')
      .replace('{{LOCATION}}', profileData.candidate.location)
      .replace('{{SECTION_SUMMARY}}', sectionTitles.summary)
      .replace('{{SUMMARY_TEXT}}', sections.zusammenfassung || sections.summary || '')
      .replace('{{SECTION_COMPETENCIES}}', sectionTitles.competencies)
      .replace('{{COMPETENCIES}}', competencies)
      .replace('{{SECTION_EXPERIENCE}}', sectionTitles.experience)
      .replace('{{EXPERIENCE}}', experienceHtml)
      .replace('{{SECTION_PROJECTS}}', sectionTitles.projects)
      .replace('{{PROJECTS}}', projectsHtml)
      .replace('{{SECTION_EDUCATION}}', sectionTitles.education)
      .replace('{{EDUCATION}}', educationHtml)
      .replace('{{SECTION_CERTIFICATIONS}}', sectionTitles.certifications)
      .replace('{{CERTIFICATIONS}}', certificationsHtml)
      .replace('{{SECTION_SKILLS}}', sectionTitles.skills)
      .replace('{{SKILLS}}', skillsHtml);

    // Handle photo block replacement
    if (photoBlock) {
      html = html.replace('{{PHOTO_BLOCK}}', photoBlock);
    } else {
      html = html.replace('{{PHOTO_BLOCK}}', '');
    }

    // Write the temporary HTML file
    const tempHtmlPath = resolve(`/tmp/cv-${profileData.candidate.full_name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}-${Date.now()}.html`);
    await writeFile(tempHtmlPath, html);

    console.log(`Generated HTML CV: ${tempHtmlPath}`);
    return tempHtmlPath;

  } catch (error) {
    console.error('Error generating HTML CV:', error);
    throw error;
  }
}

// Helper function to parse simple YAML
function parseYAML(yamlStr) {
  const lines = yamlStr.split('\n');
  const result = {};
  let currentObj = result;
  let stack = [result];

  for (const line of lines) {
    if (line.trim() === '' || line.startsWith('#')) continue;

    const match = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (match) {
      const indent = match[1].length;
      const key = match[2];
      const value = match[3];

      // Adjust stack based on indentation
      while (stack.length - 1 > indent / 2) {
        stack.pop();
      }

      currentObj = stack[stack.length - 1];

      if (value && value.trim() !== '') {
        // Remove quotes if present
        let parsedValue = value.trim();
        if ((parsedValue.startsWith('"') && parsedValue.endsWith('"')) ||
            (parsedValue.startsWith("'") && parsedValue.endsWith("'"))) {
          parsedValue = parsedValue.substring(1, parsedValue.length - 1);
        }
        currentObj[key] = parsedValue;
      } else {
        // This is an object
        currentObj[key] = {};
        stack.push(currentObj[key]);
        currentObj = currentObj[key];
      }
    }
  }

  return result;
}

// Helper function to extract sections from markdown CV
function extractSections(cvMarkdown) {
  const sections = {};

  // Split the markdown into sections based on headers
  const sectionRegex = /##\s+(.+?)\n([\s\S]*?)(?=\n##\s+|$)/g;
  let match;

  while ((match = sectionRegex.exec(cvMarkdown)) !== null) {
    const sectionName = match[1].trim();
    // Extract content but remove leading/trailing separators and whitespace
    const sectionContent = match[2].replace(/^\s*---\s*\n?/, '').replace(/\s*---\s*$/, '').trim();

    // Normalize section names (handle both German and English)
    const normalized = sectionName.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_');

    sections[normalized] = sectionContent;
  }

  return sections;
}

// Helper function to generate competencies from skills
function generateCompetencies(skillsSection) {
  const keywords = [];

  if (skillsSection) {
    // Split by lines and extract key technologies
    const lines = skillsSection.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Look for lines that start with dash or asterisk (list items)
      if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
        let tech = trimmedLine.replace(/^[*-]\s*/, '').trim();

        // Extract main technology from lines like "Cloud & IaC: AWS, Azure, Hetzner, Terraform, Ansible, Kustomize"
        if (tech.includes(':') && tech.includes(',')) {
          const parts = tech.split(':');
          if (parts.length > 1) {
            const techList = parts[1].split(',');
            for (let item of techList) {
              item = item.trim();
              // Add individual technologies to keywords
              if (item.length > 2 && !keywords.includes(item)) {
                keywords.push(item);
              }
            }
          }
        } else if (tech.includes(',')) {
          // Handle comma-separated list like "Linux (Ubuntu, Debian, CentOS)"
          const techList = tech.split(',');
          for (let item of techList) {
            item = item.trim();
            // Remove parentheses content and extract main tech
            item = item.replace(/\(.*?\)/g, '').trim();
            if (item.length > 2 && !keywords.includes(item)) {
              keywords.push(item);
            }
          }
        } else {
          // Direct tech name
          if (tech.length > 2 && !keywords.includes(tech)) {
            keywords.push(tech);
          }
        }
      }
    }
  }

  // Limit to 6-8 competencies
  const limitedKeywords = keywords.slice(0, 8);

  return limitedKeywords.map(kw => `<span class="competency-tag">${kw}</span>`).join('\n');
}

// Helper function to generate experience HTML
function generateExperienceHtml(experienceSection) {
  if (!experienceSection) return '<!-- No experience data -->';

  let html = '';

  // Look for job entries (pattern: ### Company | Position \n **Dates** )
  const jobRegex = /###\s*([^\n]+?)\s*\|\s*([^\n]+?)\n\*\*([^\n]+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = jobRegex.exec(experienceSection)) !== null) {
    // Add any content before this match as a separator or additional info
    const beforeMatch = experienceSection.substring(lastIndex, match.index).trim();
    if (beforeMatch && !beforeMatch.includes('---')) {
      html += `<div class="section-divider">${beforeMatch}</div>`;
    }

    const companyRole = match[1];  // e.g. "DevOps Engineer | Viseven Digital Content Factory"
    const position = match[2];    // e.g. "Viseven Digital Content Factory"
    const dates = match[3];       // e.g. "August 2018 – Februar 2025 | Estland (Remote)"

    // Extract company and position from the first part
    const [jobPosition, jobCompany] = companyRole.split(' | ').reverse(); // Reverse to handle the format correctly

    // Find the description for this job (everything until the next job or end)
    const jobStart = match.index + match[0].length;
    const nextJobStart = experienceSection.indexOf('###', match.index + 1);
    const jobDescription = nextJobStart === -1
      ? experienceSection.substring(jobStart).trim()
      : experienceSection.substring(jobStart, nextJobStart).trim();

    // Clean up the description and extract bullet points
    const bulletPoints = extractBulletPoints(jobDescription);

    html += `
      <div class="job">
        <div class="job-header">
          <div class="job-company">${jobCompany || companyRole}</div>
          <div class="job-period">${dates}</div>
        </div>
        <div class="job-role">${jobPosition || position}</div>
        <ul>
          ${bulletPoints}
        </ul>
      </div>
    `;

    lastIndex = nextJobStart;
  }

  // If no job matches were found, return the raw content
  if (lastIndex === 0) {
    return `<div class="job">${experienceSection}</div>`;
  }

  return html;
}

// Helper function to extract bullet points from job description
function extractBulletPoints(description) {
  let bullets = '';

  // Look for bullet points (lines starting with - or **)
  const bulletRegex = /(-|\*\*)\s*([^\n]+)/g;
  let bulletMatch;

  while ((bulletMatch = bulletRegex.exec(description)) !== null) {
    let bulletText = bulletMatch[2].trim();

    // Remove trailing ** if it was part of a bold marker
    if (bulletMatch[1] === '**') {
      bulletText = bulletText.replace(/\*\*.*$/, '').trim();
    }

    bullets += `<li>${bulletText}</li>\n`;
  }

  return bullets || '<li>Details extracted from CV...</li>';
}

// Helper function to generate education HTML
function generateEducationHtml(educationSection) {
  if (!educationSection) return '<!-- No education data -->';

  let html = '';

  // Look for education entries (pattern: ### Degree \n Institution \n Dates )
  const eduRegex = /###\s*([^\n]+?)\n\*\*([^\n]+?)\*\*\s*\n([^\n]+)/g;
  let match;

  while ((match = eduRegex.exec(educationSection)) !== null) {
    const degree = match[1];
    const institution = match[2];
    const details = match[3];

    html += `
      <div class="edu-item">
        <div class="edu-header">
          <div class="edu-title">${degree}</div>
          <div class="edu-year">${details}</div>
        </div>
        <div class="edu-org">${institution}</div>
      </div>
    `;
  }

  // If no matches, return as a single item
  if (!html) {
    html = `<div class="edu-item">${educationSection.replace(/\*\*/g, '')}</div>`;
  }

  return html;
}

// Helper function to generate skills HTML
function generateSkillsHtml(skillsSection) {
  if (!skillsSection) return '<!-- No skills data -->';

  let html = '<div class="skills-grid">';

  // Split by lines and extract skills
  const lines = skillsSection.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
      let skill = trimmedLine.replace(/^[*-]\s*/, '').trim();

      // Handle categories like "Cloud & IaC: AWS, Azure, Hetzner, Terraform, Ansible, Kustomize"
      if (skill.includes(':') && skill.includes(',')) {
        const parts = skill.split(':');
        const category = parts[0].trim();
        const techList = parts[1].split(',');

        html += `<div class="skill-category">${category}:</div>`;
        for (let tech of techList) {
          tech = tech.trim();
          html += `<div class="skill-item">${tech}</div>`;
        }
      } else {
        // Direct skill or category
        html += `<div class="skill-item">${skill}</div>`;
      }
    }
  }

  html += '</div>';
  return html;
}

// Helper function to generate projects HTML
function generateProjectsHtml(projectsSection) {
  if (!projectsSection) return '<!-- No projects data -->';

  let html = '';

  // Look for project entries (similar to job entries)
  const projectRegex = /###\s*([^\n]+?)\n([^\n]+?)\n\n([^\n]+)/g;
  let match;

  while ((match = projectRegex.exec(projectsSection)) !== null) {
    const title = match[1];
    const badge = match[2];
    const description = match[3];

    html += `
      <div class="project">
        <div class="project-title">
          ${title}
          <span class="project-badge">${badge.replace(/\*\*/g, '')}</span>
        </div>
        <div class="project-desc">${description}</div>
      </div>
    `;
  }

  // If no matches, return as a single project
  if (!html) {
    html = `<div class="project">${projectsSection}</div>`;
  }

  return html;
}

// Helper function to generate certifications HTML
function generateCertificationsHtml(certificationsSection) {
  if (!certificationsSection) return '<!-- No certifications data -->';
  return `<div class="cert-item">${certificationsSection.replace(/\*\*/g, '')}</div>`;
}

// Run the function
generateHtmlCV()
  .then(async (htmlPath) => {
    console.log('HTML CV generated successfully!');

    // Now run the PDF generation
    const { spawn } = await import('child_process');

    const pdfPath = `output/cv-${Date.now()}.pdf`;

    // Ensure output directory exists
    try {
      await import('fs').then(fs => fs.promises.mkdir('output', { recursive: true }));
    } catch (e) {}

    const child = spawn('node', ['generate-pdf.mjs', htmlPath, pdfPath, '--format=a4'], {
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ PDF generated: ${pdfPath}`);
      } else {
        console.error(`❌ PDF generation failed with code ${code}`);
      }
    });
  })
  .catch(err => {
    console.error('Failed to generate CV:', err);
  });