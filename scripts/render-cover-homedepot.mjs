#!/usr/bin/env node
// Cover letter for Home Depot - Manager, Benefits Innovation. Tier 1.
import { readFileSync, writeFileSync } from 'fs';
const cvTemplate = readFileSync('templates/cv-template.html', 'utf8');
const styleMatch = cvTemplate.match(/<style>[\s\S]*?<\/style>/);
const sharedStyles = styleMatch ? styleMatch[0] : '';
const c = { name: 'Aaliya Bashir, MPA', email: 'bashiraaliya@gmail.com', linkedinUrl: 'https://linkedin.com/in/aaliya-bashir/', linkedinDisplay: 'linkedin.com/in/aaliya-bashir', location: 'Atlanta, GA', credentials: 'PMP, CSM', date: 'April 14, 2026' };
const a = { company: 'The Home Depot', role: 'Manager, Benefits Innovation', team: 'The Home Depot Hiring Team' };
const paragraphs = [
  `I am applying for the ${a.role} role at ${a.company}. Benefits innovation lives at the intersection of workforce data, employee experience, and cost discipline. That is the triangle I run every day. At Wellstar Health System I own the Benefits and Work-Life Services pillars of our Total Rewards analytics suite, a multi-pillar Tableau and BigQuery product that HR leadership and the C-suite use to connect benefits investment to ROI, utilization, and employee experience. I know what questions benefits teams struggle to answer with data and what analytics shifts lead to actual program redesign.`,
  `Three things I would bring. First, benefits domain fluency: I speak Compensation, Benefits, Work-Life Services, and HRIS vocabulary natively, and I have translated vendor management and utilization data into executive decisions. Second, program leadership at scale: I led a $4.5M, 10-plus institution initiative at Harvard Medical School with audit-grade governance. Third, modern analytics: Power BI, Tableau, SQL, BigQuery, plus an AI-integrated workflow on Vertex AI and Gemini.`,
  `Atlanta is home, and The Home Depot is one of the few Fortune-scale employers whose benefits philosophy has actual market influence. I would welcome a short conversation about where the team is focused this year and how a Benefits Innovation Manager can move the needle. Thank you for the consideration.`,
];
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${c.name} - Cover Letter - ${a.company}</title>${sharedStyles}<style>.cover-body p{margin-bottom:12px;font-size:11.5px;line-height:1.65;color:#222}.cover-meta{font-size:11px;color:#555;margin-bottom:20px;line-height:1.7}.cover-sign{margin-top:18px;font-size:11.5px;color:#222}</style></head><body><div class="page"><div class="header"><h1>${c.name}</h1><div class="header-gradient"></div><div class="contact-row"><span>${c.email}</span><span class="separator">|</span><a href="${c.linkedinUrl}">${c.linkedinDisplay}</a><span class="separator">|</span><span>${c.location}</span><span class="separator">|</span><span>${c.credentials}</span></div></div><div class="section cover-meta"><div>${c.date}</div><div>${a.team}</div><div>Re: ${a.role}</div></div><div class="section cover-body"><p>Dear ${a.team},</p>${paragraphs.map(p => `<p>${p}</p>`).join('')}<p class="cover-sign">Sincerely,<br>${c.name}</p></div></div></body></html>`;
const clean = html.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
writeFileSync('output/cover-aaliya-homedepot-2026-04-14.html', clean);
console.log('Wrote output/cover-aaliya-homedepot-2026-04-14.html (' + clean.length + ' bytes)');
