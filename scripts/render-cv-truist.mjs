#!/usr/bin/env node
// Render CV for Truist - Incentive Compensation Data Consulting & Testing Manager. Tier 1. No dashes.
import { readFileSync, writeFileSync } from 'fs';
const template = readFileSync('templates/cv-template.html', 'utf8');
const vars = {
  LANG: 'en', PAGE_WIDTH: '8.5in',
  NAME: 'Aaliya Bashir, MPA', EMAIL: 'bashiraaliya@gmail.com',
  LINKEDIN_URL: 'https://linkedin.com/in/aaliya-bashir/', LINKEDIN_DISPLAY: 'linkedin.com/in/aaliya-bashir',
  PORTFOLIO_URL: '#', PORTFOLIO_DISPLAY: 'Atlanta, GA', LOCATION: 'PMP, CSM',
  SECTION_SUMMARY: 'Professional Summary',
  SUMMARY_TEXT: `Compensation and analytics program leader with 13+ years turning complex pay, incentive, and workforce data into auditable decisions. Currently owns Total Rewards analytics at Wellstar Health System: multi-pillar Tableau, Power BI, SQL, and BigQuery platform used by HR leadership and the C-suite for labor-optimization decisions. Led a $4.5M, 10-plus institution program at Harvard Medical School with audit-grade governance. Regulated-industry delivery background at Ideagen DevonWay (DoE, defense). Known for bringing rigor to compensation data, testing, and governance conversations.`,
  SECTION_COMPETENCIES: 'Core Competencies',
  COMPETENCIES: ['Incentive Compensation Analytics','Data Governance & Testing','Compensation Data Modeling','HRIS & Payroll Partnership','Executive Stakeholder Partnership','Audit-Ready Reporting','Cross-Functional Program Leadership','Regulated-Industry Delivery'].map(t => `<span class="competency-tag">${t}</span>`).join('\n      '),
  SECTION_EXPERIENCE: 'Work Experience',
  EXPERIENCE: `<div class="job"><div class="job-header"><span class="job-company">Wellstar Health System</span><span class="job-period">Jan 2025 to Present</span></div><div class="job-role">Technical Program Manager, Total Rewards &amp; Compensation Analytics</div><div class="job-location">Atlanta, GA</div><ul><li>Own the <strong>Compensation pillar</strong> of the Total Rewards analytics suite, built in Tableau, Power BI, SQL, BigQuery, and PowerQuery.</li><li>Partner with HRIS, Payroll, and Operations to <strong>test, validate, and govern</strong> compensation and incentive data feeds used for executive decisions.</li><li>Turn complex compensation signals into <strong>audit-ready reporting</strong> and decision frameworks.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Harvard Medical School</span><span class="job-period">Jan 2023 to Jan 2025</span></div><div class="job-role">Program Manager, Multi-Stakeholder Initiative</div><div class="job-location">Remote</div><ul><li>Led a <strong>$4.5M, 10+ institution</strong> program with audit-grade governance.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Ideagen DevonWay</span><span class="job-period">Nov 2022 to Jan 2024</span></div><div class="job-role">Technical Project Manager, Regulated Software</div><div class="job-location">Remote</div><ul><li>Delivered <strong>$245K to $2.2M implementations</strong> for DoE, defense, and regulated-industry clients with audit trails and compliance discipline. <strong>+25% CSAT</strong>.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Warrior Body Spa</span><span class="job-period">2014 to 2022</span></div><div class="job-role">Director of Operations</div><div class="job-location">Tucker, GA</div><ul><li>Managed and trained a 17-member team; improved CSAT by 34% in six months.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">KSW Real Estate</span><span class="job-period">Earlier Experience</span></div><div class="job-role">Project Manager, Real Estate Operations</div><div class="job-location">Atlanta, GA</div><ul><li>Five-year roadmap contributing to <strong>$14M+ in savings and cost avoidance</strong>.</li></ul></div>`,
  SECTION_PROJECTS: 'Selected Compensation &amp; Data Highlights',
  PROJECTS: `<div class="project"><div class="project-title">Wellstar: Compensation &amp; Total Rewards Analytics<span class="project-badge">Tableau, SQL, BigQuery</span></div><div class="project-desc">Compensation pillar of a multi-pillar analytics suite used by HR leadership and the C-suite for labor-optimization decisions.</div></div>
<div class="project"><div class="project-title">DevonWay: Regulated Data &amp; Audit Delivery<span class="project-badge">DoE, Defense</span></div><div class="project-desc">$245K to $2.2M implementations where audit trails, data testing, and compliance were non-negotiable.</div></div>
<div class="project"><div class="project-title">Harvard: $4.5M Multi-Institution Governance<span class="project-badge">Governance</span></div><div class="project-desc">Operating model, decision frameworks, and audit-ready reporting for 10+ institutions.</div></div>`,
  SECTION_EDUCATION: 'Education',
  EDUCATION: `<div class="edu-item"><div class="edu-header"><span class="edu-title">Graduate Certificate, Corporate Sustainability and Innovation, <span class="edu-org">Harvard University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Master of Public Administration, <span class="edu-org">Augusta University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Bachelor of Arts, Philosophy, <span class="edu-org">Paine College</span></span></div></div>`,
  SECTION_CERTIFICATIONS: 'Certifications',
  CERTIFICATIONS: `<div class="cert-item"><span class="cert-title">Project Management Professional (PMP), <span class="cert-org">PMI</span></span></div>
<div class="cert-item"><span class="cert-title">Certified ScrumMaster (CSM), <span class="cert-org">Scrum Alliance</span></span></div>`,
  SECTION_SKILLS: 'Skills',
  SKILLS: `<div class="skills-grid">
<div class="skill-item"><span class="skill-category">Compensation / TR:</span> Incentive Compensation, Total Rewards, HRIS partnership, Compensation Data Testing</div>
<div class="skill-item"><span class="skill-category">Analytics:</span> Tableau, Power BI, SQL, BigQuery, PowerQuery, Excel, ROI modeling</div>
<div class="skill-item"><span class="skill-category">AI / ML platform:</span> Google Vertex AI, Gemini 2.5, OpenAI / Azure OpenAI, prompt engineering</div>
<div class="skill-item"><span class="skill-category">Delivery:</span> Jira, Confluence, Asana, Agile, Waterfall, PMP, CSM</div></div>`,
};
let html = template;
for (const [k, v] of Object.entries(vars)) html = html.split(`{{${k}}}`).join(v);
html = html.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
writeFileSync('output/cv-aaliya-truist-2026-04-14.html', html);
console.log('Wrote output/cv-aaliya-truist-2026-04-14.html (' + html.length + ' bytes)');
