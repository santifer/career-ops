#!/usr/bin/env node
// Cover letter for Salesforce - Director/Sr. Director, TPM, Cross-functional Program Delivery. Tier 1.
import { readFileSync, writeFileSync } from 'fs';
const cvTemplate = readFileSync('templates/cv-template.html', 'utf8');
const styleMatch = cvTemplate.match(/<style>[\s\S]*?<\/style>/);
const sharedStyles = styleMatch ? styleMatch[0] : '';
const c = { name: 'Aaliya Bashir, MPA', email: 'bashiraaliya@gmail.com', linkedinUrl: 'https://linkedin.com/in/aaliya-bashir/', linkedinDisplay: 'linkedin.com/in/aaliya-bashir', location: 'Atlanta, GA', credentials: 'PMP, CSM', date: 'April 16, 2026' };
const a = { company: 'Salesforce', role: 'Director/Sr. Director, Technical Program Management, Cross-functional Program Delivery', team: 'Salesforce Hiring Team' };
const paragraphs = [
  `I am applying for the ${a.role} role at ${a.company}. Cross-functional program delivery is the work I run every day. At Wellstar Health System I own a multi-pillar analytics platform delivered across HRIS, Operations, and Engineering, used by HR leadership and the C-suite for enterprise-scale decisions. Before that I led a $4.5M, 10-plus institution cross-functional initiative at Harvard Medical School and shipped $245K to $2.2M regulated-software implementations for Department of Energy and defense clients at Ideagen DevonWay.`,
  `Three things I bring to this seat. First, cross-functional delivery discipline at scale: the governance cadence, decision frameworks, and communication plans that keep high-visibility programs moving across engineering, operations, and executive stakeholders. Second, technical credibility: I operate in Tableau, Power BI, SQL, BigQuery, with an AI-integrated workflow on Google Vertex AI, Gemini 2.5, OpenAI/Azure OpenAI, GCP, and Cloud Run. Third, regulated delivery precision: my DoE and defense background means I understand what auditable, compliance-first program delivery looks like in practice.`,
  `Atlanta is home, Technical Program Management is my title, and cross-functional program delivery is my career. I would welcome a short conversation about the team's current delivery portfolio and where a Director-tier TPM could add velocity. Thank you for the consideration.`,
];
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${c.name} - Cover Letter - ${a.company}</title>${sharedStyles}<style>.cover-body p{margin-bottom:12px;font-size:11.5px;line-height:1.65;color:#222}.cover-meta{font-size:11px;color:#555;margin-bottom:20px;line-height:1.7}.cover-sign{margin-top:18px;font-size:11.5px;color:#222}</style></head><body><div class="page"><div class="header"><h1>${c.name}</h1><div class="header-gradient"></div><div class="contact-row"><span>${c.email}</span><span class="separator">|</span><a href="${c.linkedinUrl}">${c.linkedinDisplay}</a><span class="separator">|</span><span>${c.location}</span><span class="separator">|</span><span>${c.credentials}</span></div></div><div class="section cover-meta"><div>${c.date}</div><div>${a.team}</div><div>Re: ${a.role}</div></div><div class="section cover-body"><p>Dear ${a.team},</p>${paragraphs.map(p => `<p>${p}</p>`).join('')}<p class="cover-sign">Sincerely,<br>${c.name}</p></div></div></body></html>`;
const clean = html.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
writeFileSync('output/cover-aaliya-salesforce-tpm-2026-04-14.html', clean);
console.log('Wrote output/cover-aaliya-salesforce-tpm-2026-04-14.html (' + clean.length + ' bytes)');
