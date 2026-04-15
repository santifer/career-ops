#!/usr/bin/env node
// Render CV for Salesforce - Sr. Director, Strategic Readiness Programs. Atlanta, $224K-$234K. Tier 1.
import { readFileSync, writeFileSync } from 'fs';
const template = readFileSync('templates/cv-template.html', 'utf8');
const vars = {
  LANG: 'en', PAGE_WIDTH: '8.5in',
  NAME: 'Aaliya Bashir, MPA', EMAIL: 'bashiraaliya@gmail.com',
  LINKEDIN_URL: 'https://linkedin.com/in/aaliya-bashir/', LINKEDIN_DISPLAY: 'linkedin.com/in/aaliya-bashir',
  PORTFOLIO_URL: '#', PORTFOLIO_DISPLAY: 'Atlanta, GA', LOCATION: 'PMP, CSM',
  SECTION_SUMMARY: 'Professional Summary',
  SUMMARY_TEXT: `Senior program leader with 13+ years driving end-to-end definition, deployment, and execution of high-visibility, cross-functional programs. Currently owns the Total Rewards analytics platform at Wellstar Health System: a multi-pillar Tableau and BigQuery product used by HR leadership and the C-suite for labor-optimization decisions. Led a $4.5M, 10-plus institution program at Harvard Medical School with audit-grade governance. Delivered $245K to $2.2M regulated-software implementations for Department of Energy and defense clients at Ideagen DevonWay with +25% CSAT. Operates in Power BI, Tableau, SQL, BigQuery, and an AI-integrated workflow on Google Vertex AI, Gemini 2.5, OpenAI/Azure OpenAI, GCP, and Cloud Run.`,
  SECTION_COMPETENCIES: 'Core Competencies',
  COMPETENCIES: ['Strategic Readiness & Launch Programs','Cross-Functional Program Delivery','Executive Stakeholder Partnership','Governance & Audit-Ready Reporting','Change Management at Scale','New Product Introduction Operations','Data-Driven Decision Support','AI-Integrated Workflow'].map(t => `<span class="competency-tag">${t}</span>`).join('\n      '),
  SECTION_EXPERIENCE: 'Work Experience',
  EXPERIENCE: `<div class="job"><div class="job-header"><span class="job-company">Wellstar Health System</span><span class="job-period">Jan 2025 to Present</span></div><div class="job-role">Technical Program Manager, Total Rewards &amp; Strategic Analytics</div><div class="job-location">Atlanta, GA</div><ul><li>Drive cross-functional program delivery across HRIS, Operations, and Engineering to stand up <strong>repeatable, audit-ready reporting</strong> for enterprise-scale people programs.</li><li>Own the Total Rewards analytics platform used by HR leadership and the C-suite for labor-optimization decisions.</li><li>Apply an AI-integrated workflow (Vertex AI, Gemini, OpenAI/Azure OpenAI) to compress analysis cycles.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Harvard Medical School</span><span class="job-period">Jan 2023 to Jan 2025</span></div><div class="job-role">Program Manager, Multi-Stakeholder Initiative</div><div class="job-location">Remote</div><ul><li>Led a <strong>$4.5M, 10+ institution</strong> academic medicine program with end-to-end definition, deployment, and execution across clinical and operational stakeholders.</li><li>Designed governance, decision frameworks, and communications that kept politically sensitive work moving with audit-ready documentation.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Ideagen DevonWay</span><span class="job-period">Nov 2022 to Jan 2024</span></div><div class="job-role">Technical Project Manager, High-Visibility Software Launches</div><div class="job-location">Remote</div><ul><li>Shipped <strong>$245K to $2.2M implementations</strong> for Department of Energy, defense, and regulated-industry clients. Owned scope, schedule, risk, and executive communication end to end.</li><li><strong>Increased customer satisfaction by 25%</strong> as primary executive contact for issue resolution and status reporting.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">Warrior Body Spa</span><span class="job-period">2014 to 2022</span></div><div class="job-role">Director of Operations</div><div class="job-location">Tucker, GA</div><ul><li>Directed operations, systems, and team performance; 17-member team; +34% CSAT in six months.</li></ul></div>
<div class="job"><div class="job-header"><span class="job-company">KSW Real Estate</span><span class="job-period">Earlier Experience</span></div><div class="job-role">Project Manager, Real Estate Operations</div><div class="job-location">Atlanta, GA</div><ul><li>Five-year roadmap contributing to <strong>$14M+ in savings and cost avoidance</strong>.</li></ul></div>`,
  SECTION_PROJECTS: 'Selected Program Highlights',
  PROJECTS: `<div class="project"><div class="project-title">Harvard Medical School: $4.5M Multi-Institution Launch<span class="project-badge">Strategic readiness</span></div><div class="project-desc">End-to-end definition, deployment, and execution of a politically sensitive program across 10+ institutions with audit-grade governance.</div></div>
<div class="project"><div class="project-title">DevonWay: Regulated Software Launches<span class="project-badge">+25% CSAT</span></div><div class="project-desc">$245K to $2.2M implementations for DoE and defense clients under regulatory deadlines with immaculate audit trails.</div></div>
<div class="project"><div class="project-title">Wellstar: Total Rewards Platform<span class="project-badge">Tableau, BigQuery</span></div><div class="project-desc">Multi-pillar analytics product delivered across HRIS, Operations, and Engineering.</div></div>`,
  SECTION_EDUCATION: 'Education',
  EDUCATION: `<div class="edu-item"><div class="edu-header"><span class="edu-title">Graduate Certificate, Corporate Sustainability and Innovation, <span class="edu-org">Harvard University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Master of Public Administration, <span class="edu-org">Augusta University</span></span></div></div>
<div class="edu-item"><div class="edu-header"><span class="edu-title">Bachelor of Arts, Philosophy, <span class="edu-org">Paine College</span></span></div></div>`,
  SECTION_CERTIFICATIONS: 'Certifications',
  CERTIFICATIONS: `<div class="cert-item"><span class="cert-title">Project Management Professional (PMP), <span class="cert-org">PMI</span></span></div>
<div class="cert-item"><span class="cert-title">Certified ScrumMaster (CSM), <span class="cert-org">Scrum Alliance</span></span></div>`,
  SECTION_SKILLS: 'Skills',
  SKILLS: `<div class="skills-grid">
<div class="skill-item"><span class="skill-category">Program / Delivery:</span> Strategic readiness, cross-functional program delivery, NPI, PMP, CSM, Agile, Waterfall</div>
<div class="skill-item"><span class="skill-category">Analytics:</span> Tableau, Power BI, SQL, BigQuery, PowerQuery, ROI modeling, executive dashboards</div>
<div class="skill-item"><span class="skill-category">AI / ML platform:</span> Google Vertex AI, Gemini 2.5, OpenAI / Azure OpenAI, prompt engineering</div>
<div class="skill-item"><span class="skill-category">Cloud / infra:</span> GCP, Cloud Run, BigQuery</div>
<div class="skill-item"><span class="skill-category">Collaboration:</span> Jira, Confluence, Asana, Salesforce</div></div>`,
};
let html = template;
for (const [k, v] of Object.entries(vars)) html = html.split(`{{${k}}}`).join(v);
html = html.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
writeFileSync('output/cv-aaliya-salesforce-2026-04-14.html', html);
console.log('Wrote output/cv-aaliya-salesforce-2026-04-14.html (' + html.length + ' bytes)');
