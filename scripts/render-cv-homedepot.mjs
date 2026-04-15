#!/usr/bin/env node
// Render CV for Home Depot - Manager, Benefits Innovation. Tier 1. No em/en dashes.
import { readFileSync, writeFileSync } from 'fs';
const template = readFileSync('templates/cv-template.html', 'utf8');
const vars = {
  LANG: 'en', PAGE_WIDTH: '8.5in',
  NAME: 'Aaliya Bashir, MPA', EMAIL: 'bashiraaliya@gmail.com',
  LINKEDIN_URL: 'https://linkedin.com/in/aaliya-bashir/', LINKEDIN_DISPLAY: 'linkedin.com/in/aaliya-bashir',
  PORTFOLIO_URL: '#', PORTFOLIO_DISPLAY: 'Atlanta, GA', LOCATION: 'PMP, CSM',
  SECTION_SUMMARY: 'Professional Summary',
  SUMMARY_TEXT: `Total Rewards and Benefits program leader with 13+ years translating benefits and workforce data into executive decisions. Currently owns Total Rewards analytics at Wellstar Health System: multi-pillar Tableau dashboards (Compensation, Work-Life Services, Benefits, TOC navigation) used by HR leadership and the C-suite for labor-optimization decisions. Known for connecting benefits spend to ROI and employee experience, for designing programs that scale, and for bringing analytical rigor to benefits innovation conversations. PMP, CSM.`,
  SECTION_COMPETENCIES: 'Core Competencies',
  COMPETENCIES: ['Benefits Strategy & Innovation','Total Rewards Program Leadership','Benefits Analytics & ROI Modeling','Vendor Management','Executive Stakeholder Partnership','HRIS Partnership','Change Management','Executive Dashboards'].map(t => `<span class="competency-tag">${t}</span>`).join('\n      '),
  SECTION_EXPERIENCE: 'Work Experience',
  EXPERIENCE: `<div class="job"><div class="job-header"><span class="job-company">Wellstar Health System</span><span class="job-period">Jan 2025 to Present</span></div><div class="job-role">Technical Program Manager, Total Rewards &amp; Benefits Analytics</div><div class="job-location">Atlanta, GA</div><ul><li>Own the <strong>Benefits and Work-Life Services analytics pillars</strong> within a multi-pillar Tableau and BigQuery platform used by HR leadership and the C-suite for labor-optimization decisions.</li><li>Connect <strong>benefits investments to ROI, utilization, and employee experience</strong>, turning HRIS and payroll data into decision-ready signal for a large healthcare system.</li><li>Partner across HRIS, Operations, and vendor relationships to retire data silos and stand up repeatable, audit-ready reporting.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Harvard Medical School</span><span class="job-period">Jan 2023 to Jan 2025</span></div><div class="job-role">Program Manager, Multi-Stakeholder Initiative</div><div class="job-location">Remote</div><ul><li>Led a <strong>$4.5M, 10+ institution</strong> academic medicine program with audit-grade governance.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Ideagen DevonWay</span><span class="job-period">Nov 2022 to Jan 2024</span></div><div class="job-role">Technical Project Manager</div><div class="job-location">Remote</div><ul><li>Delivered <strong>$245K to $2.2M software implementations</strong> for regulated-industry clients; <strong>+25% CSAT</strong>.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Warrior Body Spa</span><span class="job-period">2014 to 2022</span></div><div class="job-role">Director of Operations</div><div class="job-location">Tucker, GA</div><ul><li>Managed and trained a 17-member team; improved CSAT by 34% in six months.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">KSW Real Estate</span><span class="job-period">Earlier Experience</span></div><div class="job-role">Project Manager, Real Estate Operations</div><div class="job-location">Atlanta, GA</div><ul><li>Five-year roadmap contributing to <strong>$14M+ in savings and cost avoidance</strong>.</li></ul></div>`,
  SECTION_PROJECTS: 'Selected Benefits Highlights',
  PROJECTS: `<div class="project"><div class="project-title">Wellstar: Benefits &amp; Total Rewards Analytics<span class="project-badge">Tableau, BigQuery</span></div><div class="project-desc">Multi-pillar executive analytics product connecting benefits spend to ROI, utilization, and employee experience.</div></div>
<div class="project"><div class="project-title">Harvard Medical School: $4.5M Multi-Institution Program<span class="project-badge">Governance</span></div><div class="project-desc">Governance cadence, decision frameworks, and reporting across 10+ institutions.</div></div>`,
  SECTION_EDUCATION: 'Education',
  EDUCATION: `<div class="edu-item"><div class="edu-header"><span class="edu-title">Graduate Certificate, Corporate Sustainability and Innovation, <span class="edu-org">Harvard University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Master of Public Administration, <span class="edu-org">Augusta University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Bachelor of Arts, Philosophy, <span class="edu-org">Paine College</span></span></div></div>`,
  SECTION_CERTIFICATIONS: 'Certifications',
  CERTIFICATIONS: `<div class="cert-item"><span class="cert-title">Project Management Professional (PMP), <span class="cert-org">PMI</span></span></div>
<div class="cert-item"><span class="cert-title">Certified ScrumMaster (CSM), <span class="cert-org">Scrum Alliance</span></span></div>`,
  SECTION_SKILLS: 'Skills',
  SKILLS: `<div class="skills-grid">
<div class="skill-item"><span class="skill-category">Benefits / TR:</span> Benefits strategy, Vendor management, ROI modeling, Total Rewards analytics, Compensation</div>
<div class="skill-item"><span class="skill-category">Analytics:</span> Tableau, Power BI, SQL, BigQuery, PowerQuery, Excel</div>
<div class="skill-item"><span class="skill-category">AI / ML platform:</span> Google Vertex AI, Gemini 2.5, OpenAI / Azure OpenAI, prompt engineering</div>
<div class="skill-item"><span class="skill-category">Delivery:</span> Jira, Confluence, Asana, Agile, Waterfall, PMP, CSM</div></div>`,
};
let html = template;
for (const [k, v] of Object.entries(vars)) html = html.split(`{{${k}}}`).join(v);
html = html.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
writeFileSync('output/cv-aaliya-homedepot-2026-04-14.html', html);
console.log('Wrote output/cv-aaliya-homedepot-2026-04-14.html (' + html.length + ' bytes)');
