#!/usr/bin/env node
// Render CV for Intuit - Principal Program Manager, Performance Management & Development.
// Tier 1. No em/en dashes.
import { readFileSync, writeFileSync } from 'fs';
const template = readFileSync('templates/cv-template.html', 'utf8');
const vars = {
  LANG: 'en', PAGE_WIDTH: '8.5in',
  NAME: 'Aaliya Bashir, MPA', EMAIL: 'bashiraaliya@gmail.com',
  LINKEDIN_URL: 'https://linkedin.com/in/aaliya-bashir/', LINKEDIN_DISPLAY: 'linkedin.com/in/aaliya-bashir',
  PORTFOLIO_URL: '#', PORTFOLIO_DISPLAY: 'Atlanta, GA', LOCATION: 'PMP, CSM',
  SECTION_SUMMARY: 'Professional Summary',
  SUMMARY_TEXT: `Senior program leader with 13+ years running multi-stakeholder performance, development, and people programs at scale. Currently owns Total Rewards and Labor Optimization analytics at Wellstar Health System: a multi-pillar Tableau and BigQuery platform used by HR leadership and the C-suite for workforce decisions. Led a $4.5M, 10-plus institution initiative at Harvard Medical School with audit-grade governance. Operates across Power BI, Tableau, SQL, BigQuery, and PowerQuery with an AI-integrated workflow on Google Vertex AI, Gemini 2.5, OpenAI/Azure OpenAI, GCP, and Cloud Run. Looking to bring that program-leadership muscle to Performance Management and Development at Intuit.`,
  SECTION_COMPETENCIES: 'Core Competencies',
  COMPETENCIES: ['Performance Management Programs','Talent Development & Learning Ops','People Analytics & Workforce Insights','Executive Stakeholder Partnership','Cross-Functional Program Leadership','Governance & Audit-Ready Reporting','Change Management at Scale','AI-Integrated Workflow'].map(t => `<span class="competency-tag">${t}</span>`).join('\n      '),
  SECTION_EXPERIENCE: 'Work Experience',
  EXPERIENCE: `<div class="job"><div class="job-header"><span class="job-company">Wellstar Health System</span><span class="job-period">Jan 2025 to Present</span></div><div class="job-role">Technical Program Manager, Total Rewards &amp; People Analytics</div><div class="job-location">Atlanta, GA</div><ul><li>Own the Total Rewards and Labor Optimization analytics suite used by HR leadership and the C-suite to align workforce spend to ROI, utilization, and employee experience.</li><li>Partner with HRIS, Operations, and Engineering to retire data silos and stand up <strong>repeatable, audit-ready reporting</strong> for enterprise-scale people programs.</li><li>Apply AI-integrated workflow (Vertex AI, Gemini, OpenAI/Azure OpenAI) to compress analysis cycles.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Harvard Medical School</span><span class="job-period">Jan 2023 to Jan 2025</span></div><div class="job-role">Program Manager, Multi-Stakeholder Initiative</div><div class="job-location">Remote</div><ul><li>Led a <strong>$4.5M, 10+ institution academic medicine program</strong>. Designed governance, decision frameworks, and communications that aligned clinical faculty and hospital partners.</li><li>Built the operating rhythms that kept politically sensitive work moving with audit-ready documentation.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Ideagen DevonWay</span><span class="job-period">Nov 2022 to Jan 2024</span></div><div class="job-role">Technical Project Manager</div><div class="job-location">Remote</div><ul><li>Delivered <strong>$245K to $2.2M software implementations</strong> for Department of Energy, defense, and regulated-industry clients. <strong>+25% CSAT</strong>.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Warrior Body Spa</span><span class="job-period">2014 to 2022</span></div><div class="job-role">Director of Operations</div><div class="job-location">Tucker, GA</div><ul><li>Managed and trained a 17-member team; improved CSAT by 34% in six months through process and people-program redesign.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">KSW Real Estate</span><span class="job-period">Earlier Experience</span></div><div class="job-role">Project Manager, Real Estate Operations</div><div class="job-location">Atlanta, GA</div><ul><li>Five-year roadmap contributing to <strong>$14M+ in savings and cost avoidance</strong>.</li></ul></div>`,
  SECTION_PROJECTS: 'Selected Program Highlights',
  PROJECTS: `<div class="project"><div class="project-title">Harvard Medical School: $4.5M Multi-Institution Program<span class="project-badge">Governance</span></div><div class="project-desc">Designed the governance cadence, decision frameworks, and communications operating model for 10+ aligned institutions.</div></div>
<div class="project"><div class="project-title">Wellstar: Total Rewards &amp; Labor Optimization Analytics<span class="project-badge">Tableau, BigQuery</span></div><div class="project-desc">Multi-pillar executive analytics product that moves workforce decisions off intuition and onto evidence.</div></div>
<div class="project"><div class="project-title">DevonWay: Regulated Software Delivery<span class="project-badge">+25% CSAT</span></div><div class="project-desc">$245K to $2.2M implementations for DoE and defense clients; audit trails and precision were non-negotiable.</div></div>`,
  SECTION_EDUCATION: 'Education',
  EDUCATION: `<div class="edu-item"><div class="edu-header"><span class="edu-title">Graduate Certificate, Corporate Sustainability and Innovation, <span class="edu-org">Harvard University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Master of Public Administration, <span class="edu-org">Augusta University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Bachelor of Arts, Philosophy, <span class="edu-org">Paine College</span></span></div></div>`,
  SECTION_CERTIFICATIONS: 'Certifications',
  CERTIFICATIONS: `<div class="cert-item"><span class="cert-title">Project Management Professional (PMP), <span class="cert-org">PMI</span></span></div>
<div class="cert-item"><span class="cert-title">Certified ScrumMaster (CSM), <span class="cert-org">Scrum Alliance</span></span></div>`,
  SECTION_SKILLS: 'Skills',
  SKILLS: `<div class="skills-grid">
<div class="skill-item"><span class="skill-category">HR / People:</span> Performance Management, Talent Development, People Analytics, Total Rewards, HRIS partnership</div>
<div class="skill-item"><span class="skill-category">Analytics:</span> Tableau, Power BI, SQL, BigQuery, PowerQuery, ROI modeling, executive dashboards</div>
<div class="skill-item"><span class="skill-category">AI / ML platform:</span> Google Vertex AI, Gemini 2.5, OpenAI / Azure OpenAI, prompt engineering</div>
<div class="skill-item"><span class="skill-category">Cloud / infra:</span> GCP, Cloud Run, BigQuery</div>
<div class="skill-item"><span class="skill-category">Delivery:</span> Jira, Confluence, Asana, Agile, Waterfall, PMP, CSM</div></div>`,
};
let html = template;
for (const [k, v] of Object.entries(vars)) html = html.split(`{{${k}}}`).join(v);
html = html.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
writeFileSync('output/cv-aaliya-intuit-2026-04-14.html', html);
console.log('Wrote output/cv-aaliya-intuit-2026-04-14.html (' + html.length + ' bytes) -- dash-scrubbed');
