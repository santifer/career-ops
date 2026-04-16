#!/usr/bin/env node
// Render CV for Salesforce - Director/Sr. Director, TPM, Cross-functional Program Delivery. Atlanta, $171-320K. Tier 1.
import { readFileSync, writeFileSync } from 'fs';
const template = readFileSync('templates/cv-template.html', 'utf8');
const vars = {
  LANG: 'en', PAGE_WIDTH: '8.5in',
  NAME: 'Aaliya Bashir, MPA', EMAIL: 'bashiraaliya@gmail.com',
  LINKEDIN_URL: 'https://linkedin.com/in/aaliya-bashir/', LINKEDIN_DISPLAY: 'linkedin.com/in/aaliya-bashir',
  PORTFOLIO_URL: '#', PORTFOLIO_DISPLAY: 'Atlanta, GA', LOCATION: 'PMP, CSM',
  SECTION_SUMMARY: 'Professional Summary',
  SUMMARY_TEXT: `Senior Technical Program Manager with 13+ years of cross-functional program delivery where governance, stakeholder alignment, and executive communication were non-negotiable. Currently owns the Total Rewards analytics platform at Wellstar Health System: multi-pillar Tableau and BigQuery product delivered across HRIS, Operations, and Engineering, used by HR leadership and the C-suite for labor-optimization decisions. Led a $4.5M, 10-plus institution cross-functional initiative at Harvard Medical School. Delivered $245K to $2.2M regulated-software implementations for Department of Energy and defense clients at Ideagen DevonWay with +25% CSAT. Operates an AI-integrated workflow on Google Vertex AI, Gemini 2.5, OpenAI/Azure OpenAI, GCP, and Cloud Run. PMP, CSM.`,
  SECTION_COMPETENCIES: 'Core Competencies',
  COMPETENCIES: ['Technical Program Management','Cross-Functional Program Delivery','Executive Stakeholder Partnership','Governance & Audit-Ready Reporting','Regulated Software Delivery','Change Management at Scale','AI-Integrated Workflow (GCP, Vertex AI)','Data-Driven Decision Support'].map(t => `<span class="competency-tag">${t}</span>`).join('\n      '),
  SECTION_EXPERIENCE: 'Work Experience',
  EXPERIENCE: `<div class="job"><div class="job-header"><span class="job-company">Wellstar Health System</span><span class="job-period">Jan 2025 to Present</span></div><div class="job-role">Technical Program Manager, Total Rewards &amp; Cross-Functional Analytics</div><div class="job-location">Atlanta, GA</div><ul><li>Own the Total Rewards analytics platform delivered <strong>across HRIS, Operations, and Engineering</strong>: multi-pillar Tableau and BigQuery product used by HR leadership and the C-suite.</li><li>Drive cross-functional program delivery to retire data silos and stand up <strong>repeatable, audit-ready reporting</strong> at enterprise scale.</li><li>Apply AI-integrated workflow (Vertex AI, Gemini, OpenAI/Azure OpenAI, GCP, Cloud Run) to compress analysis cycles.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Harvard Medical School</span><span class="job-period">Jan 2023 to Jan 2025</span></div><div class="job-role">Program Manager, Cross-Functional Multi-Institution Initiative</div><div class="job-location">Remote</div><ul><li>Led a <strong>$4.5M, 10+ institution</strong> program with end-to-end cross-functional delivery across clinical, operational, and administrative stakeholders.</li><li>Designed governance cadence, decision frameworks, and audit-ready reporting.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Ideagen DevonWay</span><span class="job-period">Nov 2022 to Jan 2024</span></div><div class="job-role">Technical Project Manager, Regulated Software Delivery</div><div class="job-location">Remote</div><ul><li>Shipped <strong>$245K to $2.2M implementations</strong> for Department of Energy, defense, and regulated-industry clients. <strong>+25% CSAT</strong> as primary executive contact.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Warrior Body Spa</span><span class="job-period">2014 to 2022</span></div><div class="job-role">Director of Operations</div><div class="job-location">Tucker, GA</div><ul><li>17-member team; +34% CSAT in six months through cross-functional process redesign.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">KSW Real Estate</span><span class="job-period">Earlier Experience</span></div><div class="job-role">Project Manager</div><div class="job-location">Atlanta, GA</div><ul><li>Five-year roadmap contributing to <strong>$14M+ in savings and cost avoidance</strong>.</li></ul></div>`,
  SECTION_PROJECTS: 'Selected Delivery Highlights',
  PROJECTS: `<div class="project"><div class="project-title">Harvard: $4.5M Cross-Functional Multi-Institution Delivery<span class="project-badge">Governance</span></div><div class="project-desc">End-to-end definition, deployment, and execution across 10+ institutions with audit-grade governance.</div></div>
<div class="project"><div class="project-title">DevonWay: Regulated Software Delivery<span class="project-badge">+25% CSAT</span></div><div class="project-desc">$245K to $2.2M implementations for DoE and defense; audit trails and precision non-negotiable.</div></div>
<div class="project"><div class="project-title">Wellstar: Cross-Functional Analytics Platform<span class="project-badge">Tableau, BigQuery, GCP</span></div><div class="project-desc">Multi-pillar product delivered across HRIS, Operations, and Engineering for C-suite decision-making.</div></div>`,
  SECTION_EDUCATION: 'Education',
  EDUCATION: `<div class="edu-item"><div class="edu-header"><span class="edu-title">Graduate Certificate, Corporate Sustainability and Innovation, <span class="edu-org">Harvard University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Master of Public Administration, <span class="edu-org">Augusta University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Bachelor of Arts, Philosophy, <span class="edu-org">Paine College</span></span></div></div>`,
  SECTION_CERTIFICATIONS: 'Certifications',
  CERTIFICATIONS: `<div class="cert-item"><span class="cert-title">Project Management Professional (PMP), <span class="cert-org">PMI</span></span></div>
<div class="cert-item"><span class="cert-title">Certified ScrumMaster (CSM), <span class="cert-org">Scrum Alliance</span></span></div>`,
  SECTION_SKILLS: 'Skills',
  SKILLS: `<div class="skills-grid">
<div class="skill-item"><span class="skill-category">Program / Delivery:</span> Technical Program Management, cross-functional delivery, PMP, CSM, Agile, Waterfall</div>
<div class="skill-item"><span class="skill-category">Analytics:</span> Tableau, Power BI, SQL, BigQuery, PowerQuery, ROI modeling</div>
<div class="skill-item"><span class="skill-category">AI / ML:</span> Google Vertex AI, Gemini 2.5, OpenAI / Azure OpenAI, prompt engineering</div>
<div class="skill-item"><span class="skill-category">Cloud:</span> GCP, Cloud Run, BigQuery</div>
<div class="skill-item"><span class="skill-category">Collaboration:</span> Jira, Confluence, Asana, Salesforce</div></div>`,
};
let html = template;
for (const [k, v] of Object.entries(vars)) html = html.split(`{{${k}}}`).join(v);
html = html.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
writeFileSync('output/cv-aaliya-salesforce-tpm-2026-04-14.html', html);
console.log('Wrote output/cv-aaliya-salesforce-tpm-2026-04-14.html (' + html.length + ' bytes)');
