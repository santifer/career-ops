const fs = require('fs');
const yaml = require('yaml');

const profile = yaml.parse(fs.readFileSync('config/profile.yml', 'utf8'));
const cvText = fs.readFileSync('cv.md', 'utf8');
let template = fs.readFileSync('templates/cv-template.html', 'utf8');

template = template.replace('{{LANG}}', 'en')
  .replace('{{PAGE_WIDTH}}', '210mm')
  .replace(/{{NAME}}/g, profile.candidate.full_name)
  .replace(/{{EMAIL}}/g, profile.candidate.email)
  .replace('{{LOCATION}}', profile.candidate.location)
  .replace('{{SECTION_SUMMARY}}', 'Professional Summary')
  .replace('{{SECTION_COMPETENCIES}}', 'Core Competencies')
  .replace('{{SECTION_EXPERIENCE}}', 'Work Experience')
  .replace('{{SECTION_PROJECTS}}', 'Projects')
  .replace('{{SECTION_EDUCATION}}', 'Education')
  .replace('{{SECTION_CERTIFICATIONS}}', 'Certifications')
  .replace('{{SECTION_SKILLS}}', 'Skills')
  .replace('{{LINKEDIN_URL}}', 'https://' + profile.candidate.linkedin)
  .replace('{{LINKEDIN_DISPLAY}}', profile.candidate.linkedin.replace('https://www.linkedin.com/in/', 'linkedin.com/in/'))
  .replace('{{PORTFOLIO_URL}}', profile.candidate.portfolio_url || '#')
  .replace('{{PORTFOLIO_DISPLAY}}', profile.candidate.portfolio_url ? profile.candidate.portfolio_url.replace('https://', '') : '');

let expText = '';
const expMatch = cvText.match(/## Work Experience\n([\s\S]*?)## Projects/);
if (expMatch) {
  const experiences = expMatch[1].split('### ').filter(Boolean);
  experiences.forEach(exp => {
    const lines = exp.trim().split('\n');
    const header = lines[0];
    const parts = header.split(' | ');
    const title = parts[1] || '';
    const company = parts[0] || '';
    const dates = parts[3] ? parts[3] : (parts[2] || '');
    
    let bulletsHtml = lines.slice(1).filter(l => l.startsWith('-')).map(l => '<li>' + l.substring(2) + '</li>').join('');
    
    expText += `
    <div class="experience-item">
      <div class="experience-header">
        <div><span class="role">${title}</span> | <span class="company">${company}</span></div>
        <div class="date">${dates}</div>
      </div>
      <ul class="experience-bullets">${bulletsHtml}</ul>
    </div>`;
  });
}

let projText = '';
const projMatch = cvText.match(/## Projects\n([\s\S]*?)## Education/);
if (projMatch) {
  const projects = projMatch[1].split('### ').filter(Boolean);
  projects.forEach(proj => {
    const lines = proj.trim().split('\n');
    const header = lines[0];
    const parts = header.split(' | ');
    const title = parts[0] || '';
    const stack = parts[1] || '';
    
    let desc = lines[1] ? lines[1].trim() : '';
    if(desc.startsWith('- ')) desc = desc.substring(2);
    
    projText += `
    <div class="experience-item" style="margin-bottom:8px;">
      <div class="experience-header">
        <div><span class="role">${title}</span></div>
        <div class="date">${stack}</div>
      </div>
      <div style="font-size:11px; margin-top:2px;">${desc}</div>
    </div>`;
  });
}

const summaryMatch = cvText.match(/## Professional Summary\n([\s\S]*?)## Core/);
const summary = summaryMatch ? summaryMatch[1].trim() : 'Senior Software Engineer with 6+ years...';

let skillsText = '';
const skillsMatch = cvText.match(/## Skills\n([\s\S]*)/);
if(skillsMatch) {
  const lines = skillsMatch[1].trim().split('\n').filter(Boolean);
  skillsText = lines.map(line => {
    if(line.startsWith('- **')) {
      const parts = line.substring(4).split('**: ');
      return `<div><strong>${parts[0]}</strong>: ${parts[1] || ''}</div>`;
    }
    return `<div>${line}</div>`;
  }).join('');
}

let eduText = '';
const eduMatch = cvText.match(/## Education\n([\s\S]*?)## Skills/);
if(eduMatch) {
  const schools = eduMatch[1].split('### ').filter(Boolean);
  schools.forEach(sch => {
    const lines = sch.trim().split('\n');
    const header = lines[0].split(' | ');
    eduText += `
    <div class="experience-item" style="margin-bottom:8px;">
      <div class="experience-header">
        <div><span class="role">${header[1] || ''}</span>, <span class="company">${header[0] || ''}</span></div>
        <div class="date">${header[2] || ''}</div>
      </div>
    </div>`;
  });
}

template = template.replace('{{SUMMARY_TEXT}}', summary)
  .replace('{{EXPERIENCE}}', expText)
  .replace('{{SKILLS}}', skillsText)
  .replace('{{EDUCATION}}', eduText)
  .replace('{{PROJECTS}}', projText)
  .replace('{{CERTIFICATIONS}}', '')
  .replace('{{COMPETENCIES}}', '<span class="competency-tag">Systems Design</span><span class="competency-tag">Cloud Architecture (AWS)</span><span class="competency-tag">Backend Development</span><span class="competency-tag">Technical Leadership</span>');

fs.writeFileSync('/tmp/cv.html', template);
console.log('HTML generated at /tmp/cv.html');
