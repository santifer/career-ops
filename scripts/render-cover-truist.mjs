#!/usr/bin/env node
// Cover letter for Truist - Incentive Compensation Data Consulting & Testing Manager. Tier 1.
import { readFileSync, writeFileSync } from 'fs';
const cvTemplate = readFileSync('templates/cv-template.html', 'utf8');
const styleMatch = cvTemplate.match(/<style>[\s\S]*?<\/style>/);
const sharedStyles = styleMatch ? styleMatch[0] : '';
const c = { name: 'Aaliya Bashir, MPA', email: 'bashiraaliya@gmail.com', linkedinUrl: 'https://linkedin.com/in/aaliya-bashir/', linkedinDisplay: 'linkedin.com/in/aaliya-bashir', location: 'Atlanta, GA', credentials: 'PMP, CSM', date: 'April 14, 2026' };
const a = { company: 'Truist', role: 'Incentive Compensation Data Consulting and Testing Manager', team: 'Truist Hiring Team' };
const paragraphs = [
  `I am applying for the ${a.role} role at ${a.company}. Incentive compensation data is only as trustworthy as the testing, governance, and executive translation behind it. That is the work I run at Wellstar Health System, where I own the Compensation pillar of our Total Rewards analytics suite in Tableau, Power BI, SQL, BigQuery, and PowerQuery, partnering with HRIS and Payroll to test, validate, and govern the data feeds that executives use for labor-optimization decisions.`,
  `Three things I bring to the role. First, compensation data fluency: I speak Total Rewards, Compensation, and HRIS vocabulary natively, and I understand the testing and validation discipline that keeps incentive programs auditable. Second, regulated-industry delivery: at Ideagen DevonWay I shipped $245K to $2.2M implementations for Department of Energy and defense clients where audit trails and compliance were non-negotiable. Third, cross-functional program leadership: I led a $4.5M, 10-plus institution initiative at Harvard Medical School with audit-grade governance across clinical, operational, and administrative stakeholders.`,
  `Atlanta is home, and Truist operates at the scale where data testing on incentive programs directly determines whether compensation decisions hold up to regulatory review. I would welcome a short conversation about the team's current priorities and the first-90-day roadmap. Thank you for the consideration.`,
];
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${c.name} - Cover Letter - ${a.company}</title>${sharedStyles}<style>.cover-body p{margin-bottom:12px;font-size:11.5px;line-height:1.65;color:#222}.cover-meta{font-size:11px;color:#555;margin-bottom:20px;line-height:1.7}.cover-sign{margin-top:18px;font-size:11.5px;color:#222}</style></head><body><div class="page"><div class="header"><h1>${c.name}</h1><div class="header-gradient"></div><div class="contact-row"><span>${c.email}</span><span class="separator">|</span><a href="${c.linkedinUrl}">${c.linkedinDisplay}</a><span class="separator">|</span><span>${c.location}</span><span class="separator">|</span><span>${c.credentials}</span></div></div><div class="section cover-meta"><div>${c.date}</div><div>${a.team}</div><div>Re: ${a.role}</div></div><div class="section cover-body"><p>Dear ${a.team},</p>${paragraphs.map(p => `<p>${p}</p>`).join('')}<p class="cover-sign">Sincerely,<br>${c.name}</p></div></div></body></html>`;
const clean = html.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
writeFileSync('output/cover-aaliya-truist-2026-04-14.html', clean);
console.log('Wrote output/cover-aaliya-truist-2026-04-14.html (' + clean.length + ' bytes)');
