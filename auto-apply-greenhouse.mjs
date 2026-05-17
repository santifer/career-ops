#!/usr/bin/env node
/**
 * auto-apply-greenhouse.mjs — Semi-automated Greenhouse job applications
 *
 * Usage:
 *   node auto-apply-greenhouse.mjs <job-key>
 *   node auto-apply-greenhouse.mjs anthropic-fde-us
 *   node auto-apply-greenhouse.mjs anthropic-fde-london
 *   node auto-apply-greenhouse.mjs --url=https://... --cv=path --cover=path
 *
 * What it does:
 *   1. Opens Chromium (headed — you see everything)
 *   2. Navigates to the Greenhouse application page
 *   3. Fills text fields (name, email, phone, LinkedIn, GitHub, pitch)
 *   4. Uploads CV and cover letter PDFs
 *   5. Pauses for you to fill dropdowns + checkboxes + submit manually
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// -------- Candidate constants --------
const ME = {
  firstName: 'Marlow',
  lastName: 'Sousa',
  preferredFirstName: 'Marlow',
  email: 'sousa.marlow@gmail.com',
  phone: '+55 11 95141-7671',
  phoneDigits: '11951417671',
  linkedin: 'https://linkedin.com/in/marlowsousa',
  github: 'https://github.com/wolram',
  portfolio: 'https://marlow.dev.br',
  website: 'https://marlow.dev.br',
  twitter: '',
  city: 'São Paulo',
  country: 'Brazil',
  pronouns: 'He/Him',
};

// -------- Pitch blocks --------
const PITCH_FDE = `The FDE charter — partnering with enterprise customers to design, build, and productionize Claude-based systems — is the exact work I've been doing for eight years, just without Anthropic's platform. At Omni Conectado (top-20 Brazilian bank) I led a unified automation + GenAI platform that delivered R$10M+ in savings, including five production AI agents. At Unimed Porto Alegre I founded the RPA Center of Excellence from zero and automated 12,000+ medical claim approvals per month — regulated-domain delivery at production scale.

My current stack is Claude-native: Juridiques (FastAPI + Claude API + ChromaDB RAG), CLT x PJ (live App Store product, multi-step Claude reasoning over Brazilian labor law), Automation Advisor (Claude tool use for structured scoring), and a multi-agent system I shipped last week (Claude Code + Linear as issue board — ready to demo). I'm two Anthropic certifications in (AI Fluency Framework & Foundations, Claude 101) and publish Claude content on LinkedIn (800+ reactions).

I'd be an FDE who brings both enterprise-delivery muscle and Claude-native builder credibility — a combination most candidates have one side of, not both.`;

const PITCH_SA = `Anthropic's Applied AI SA role is the cleanest fit for my background: eight years of enterprise delivery in regulated industries (banking, healthcare, consulting) plus two years building production Claude-native systems (Juridiques — FastAPI + Claude + ChromaDB RAG; CLT x PJ — live App Store product doing multi-step reasoning over Brazilian labor law; Automation Advisor — Claude tool use). Last week I shipped a multi-agent system orchestrated via Claude Code with Linear as the issue/state board — my own mini SA engagement, ready to demo.

At Omni Conectado (top-20 Brazilian bank) I led the architecture of a unified automation + GenAI platform that delivered R$10M+ in operational savings. At Unimed Porto Alegre I founded the RPA Center of Excellence and automated 12,000+ medical claim approvals per month across clinical, psychiatric, geriatric, and COVID-19 workflows. Two Anthropic certifications (AI Fluency Framework & Foundations, Claude 101). I've also published Claude educational content on LinkedIn (800+ reactions, 50+ comments, 40+ shares) — I care about democratizing this practice.

I'd bring the enterprise SA mix Anthropic needs: domain-credibility (healthcare, banking), Claude-native fluency, and the communication skills to bridge technical and business stakeholders (ROI dashboards, governance frameworks, multilingual PT/EN/ES).`;

const PITCH_SA_COMMERCIAL = `I've spent the last year building production Claude-native systems — Juridiques (RAG pipeline with FastAPI + ChromaDB + eval loop), Automation Advisor (structured tool use for feasibility scoring), and most recently a multi-agent system orchestrated with Claude Code and Sonnet 4.6 that went from Linear issue board to working product in under an hour. I hold Anthropic's AI Fluency Framework and Claude 101 certifications and publish Claude educational content that reaches 800+ professionals. I'm not pitching familiarity with your platform — I build with it.

The enterprise delivery half: at Omni Conectado (top-20 Brazilian bank) I architected a unified RPA + GenAI platform that delivered BRL 5M+ in savings and included five production AI agents. I designed their evaluation criteria, built the reusable blueprints, and built the Citizen Developer Program that scaled AI adoption to non-technical users across multiple business units — the exact SA + enablement motion this role requires. Before that I founded the RPA Center of Excellence at Unimed Porto Alegre (healthcare), automating 12,000+ clinical approvals per month from scratch.

Commercial SA specifically: I've been the technical bridge between executive stakeholders and engineering teams across banking, healthcare, and consulting. I know how to turn a customer's ambiguous requirement into a scoped proof-of-concept, ship it fast, and document the blueprint so it replicates. I'd be credible in a room with a CTO on day one — and I'd come back with working code.`;

const PITCH_QUINTOANDAR_TLM = `I'm Brazilian — Portuguese is my native language, and I've spent eight years solving the kinds of problems your customers face. That's not a coincidence; it's why I applied.

The technical fit is direct: I built Juridiques, a production RAG pipeline with Claude API, FastAPI, and ChromaDB — ingestion, retrieval, eval loop, deployed across web, desktop, and API surfaces. That's the same stack the Virtual Assistant team builds for FAQ retrieval and intelligent escalation. I also shipped a multi-agent orchestration system (Lexend Scholar) using Claude Code with Linear as the state board — Legal, Sales, and Marketing subagents running in parallel with HITL checkpoints — concept to working product in under an hour. I hold Anthropic's AI Fluency and Claude 101 certifications and have been building with LLMs in production for two years.

The leadership side: at Omni Conectado (top-20 Brazilian bank) I built the Citizen Developer Program from scratch — governance frameworks, technical curation, and enablement curricula that scaled AI adoption to non-technical teams across multiple business units without IT dependency. At Unimed Porto Alegre I founded the RPA Center of Excellence and built code review routines and career development processes for the technical team, improving delivery stability by 40%. I've managed the work, the standards, and the people development — just not with the "manager" title yet.

My academic background covers the domain: MBA in Data Science & Analytics (USP, 2020–2022) and MBA in AI Applied to Business (FGV, in progress). I understand ML deployment challenges, regression/classification concepts, and the gap between data science theory and production engineering reality — which is exactly what a TLM needs to bridge for their team.

QuintoAndar is the kind of company I want to grow with: Brazilian-founded, technically serious, building real products that matter to people. I'd bring both the LLM engineering depth and the team-scaling experience to help the Virtual Assistant team move faster.`;

// -------- Job configs --------
const JOBS = {
  'anthropic-fde-us': {
    url: 'https://job-boards.greenhouse.io/anthropic/jobs/4985877008',
    cv: 'output/cv-037-anthropic-fde-applied-ai-us-2026-04-11.pdf',
    coverLetter: 'output/cover-letter-marlow-anthropic-2026-04-17.pdf',
    pitch: PITCH_FDE,
    company: 'Anthropic',
    role: 'Forward Deployed Engineer, Applied AI (US)',
    workAuthUS: false,
    notes: 'Visa sponsorship available. Flag BR location + openness to relocate or contractor.',
  },
  'anthropic-fde-london': {
    url: 'https://job-boards.greenhouse.io/anthropic/jobs/5012991008',
    cv: 'output/cv-038-anthropic-fde-applied-ai-london-2026-04-11.pdf',
    coverLetter: 'output/cover-letter-marlow-anthropic-2026-04-17.pdf',
    pitch: PITCH_FDE,
    company: 'Anthropic',
    role: 'Forward Deployed Engineer, Applied AI (London)',
    workAuthUS: false,
    notes: 'UK visa sponsorship — confirm Tier 2 availability.',
  },
  'anthropic-sa-sydney': {
    // Fill --url when you click Apply on LinkedIn and it redirects to Greenhouse
    url: '',
    cv: 'output/cv-marlow-anthropic-sa-industries-london-2026-04-06.pdf', // closest match until Sydney-specific is generated
    coverLetter: 'output/cover-letter-marlow-anthropic-2026-04-17.pdf',
    pitch: PITCH_SA,
    company: 'Anthropic',
    role: 'Solutions Architect, Applied AI (Sydney)',
    workAuthUS: false,
    notes: 'Sydney visa sponsored. Pass --url with Greenhouse URL after clicking Apply on LinkedIn.',
  },
  'anthropic-sa-dnb-nyc': {
    url: '',
    cv: 'output/cv-marlow-anthropic-sa-dnb-nyc-2026-04-06.pdf',
    coverLetter: 'output/cover-letter-marlow-anthropic-2026-04-17.pdf',
    pitch: PITCH_SA,
    company: 'Anthropic',
    role: 'Solutions Architect, Applied AI (Digital Native Business, NYC)',
    workAuthUS: false,
    notes: 'NYC 3d/wk hybrid. Flag BR location + relocation openness.',
  },
  'anthropic-sa-creatives-nyc': {
    url: '',
    cv: 'output/cv-marlow-anthropic-sa-creatives-nyc-2026-04-06.pdf',
    coverLetter: 'output/cover-letter-marlow-anthropic-2026-04-17.pdf',
    pitch: PITCH_SA,
    company: 'Anthropic',
    role: 'Solutions Architect, Applied AI (Creatives, NYC)',
    workAuthUS: false,
    notes: 'Creative industry background is a gap but not a blocker. 200+ applicants.',
  },
  'anthropic-sa-industries-london': {
    url: '',
    cv: 'output/cv-marlow-sousa-anthropic-london-industries-2026-04-12.pdf',
    coverLetter: 'output/cover-letter-marlow-anthropic-2026-04-17.pdf',
    pitch: PITCH_SA,
    company: 'Anthropic',
    role: 'Solutions Architect, Applied AI (Industries, London)',
    workAuthUS: false,
    notes: 'UK visa sponsored. Enterprise SA, banking/healthcare verticals.',
  },
  'anthropic-sa-commercial-nyc': {
    // LinkedIn job ID: 4402785364
    url: 'https://job-boards.greenhouse.io/anthropic/jobs/5189848008',
    cv: 'output/cv-marlow-sousa-anthropic-commercial-2026-04-18.pdf',
    coverLetter: 'output/cover-letter-marlow-anthropic-2026-04-17.pdf',
    pitch: PITCH_SA_COMMERCIAL,
    company: 'Anthropic',
    role: 'Solutions Architect, Applied AI (Commercial, NYC)',
    workAuthUS: false,
    notes: 'NYC hybrid 25%. $240K-$315K. 3rd Anthropic application — Commercial segment, different team from Industries/FDE. Flag BR location + relocation/sponsorship.',
  },
  'quintoandar-tlm': {
    // Greenhouse job ID: 4031756009
    url: 'https://job-boards.greenhouse.io/quintoandar/jobs/4031756009?gh_src=v269lmgt9us',
    cv: 'output/cv-marlow-sousa-quintoandar-tlm-2026-04-18.pdf',
    coverLetter: null,
    pitch: PITCH_QUINTOANDAR_TLM,
    company: 'QuintoAndar',
    role: 'Tech Lead Manager (Virtual Assistant team)',
    workAuthUS: false,
    notes: 'Lisboa remote. Brazilian company — remote from BR likely. Form asks salary expectations + language proficiency. Salary: R$30.000/mes. LinkedIn "top applicant".',
  },
  'anthropic-applied-ai-dnb': {
    // Greenhouse job ID: 5057647008
    url: 'https://job-boards.greenhouse.io/anthropic/jobs/5057647008',
    cv: 'output/cv-marlow-sousa-anthropic-dnb-2026-04-18.pdf',
    coverLetter: 'output/cover-letter-marlow-anthropic-2026-04-17.pdf',
    pitch: PITCH_SA_COMMERCIAL,
    company: 'Anthropic',
    role: 'Applied AI Engineer (Digital Natives Business)',
    workAuthUS: false,
    notes: 'SF/NYC/Seattle 3d/wk in-office. $200K-$320K. DNB = startup/scale-up segment. 6a candidatura Anthropic. "I build the kind of products your customers are building."',
  },
};

// -------- CLI parsing --------
function parseArgs() {
  const args = process.argv.slice(2);
  const named = {};
  const positional = [];
  for (const a of args) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      named[k] = v ?? true;
    } else {
      positional.push(a);
    }
  }
  return { positional, named };
}

function resolveJobConfig() {
  const { positional, named } = parseArgs();
  const key = named.job || positional[0];
  let cfg = key && JOBS[key] ? { ...JOBS[key] } : {};
  if (named.url) cfg.url = named.url;
  if (named.cv) cfg.cv = named.cv;
  if (named.cover) cfg.coverLetter = named.cover;
  if (!cfg.url) {
    console.error('ERROR: no URL provided. Either pass a known job key or --url=https://...');
    console.error('Known keys:', Object.keys(JOBS).join(', '));
    process.exit(1);
  }
  if (!cfg.cv || !fs.existsSync(path.resolve(__dirname, cfg.cv))) {
    console.error(`ERROR: CV not found at ${cfg.cv}`);
    process.exit(1);
  }
  if (!cfg.coverLetter || !fs.existsSync(path.resolve(__dirname, cfg.coverLetter))) {
    console.warn(`WARN: cover letter not found at ${cfg.coverLetter} — will skip upload`);
    cfg.coverLetter = null;
  }
  return cfg;
}

// -------- Multi-strategy field filler --------
async function tryFill(scope, label, value, extraSelectors = []) {
  const strategies = [
    () => scope.getByLabel(label, { exact: false }).first().fill(value, { timeout: 2000 }),
    () => scope.getByRole('textbox', { name: new RegExp(label, 'i') }).first().fill(value, { timeout: 2000 }),
    ...extraSelectors.map((sel) => () => scope.locator(sel).first().fill(value, { timeout: 2000 })),
  ];
  for (const s of strategies) {
    try {
      await s();
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

const BOX = '═'.repeat(64);

async function main() {
  const cfg = resolveJobConfig();
  const cvAbs = path.resolve(__dirname, cfg.cv);
  const coverAbs = cfg.coverLetter ? path.resolve(__dirname, cfg.coverLetter) : null;

  console.log(`\n${BOX}`);
  console.log(`Applying to: ${cfg.company} — ${cfg.role}`);
  console.log(`URL: ${cfg.url}`);
  console.log(`CV:  ${cvAbs}`);
  console.log(`Cover: ${coverAbs || '(none)'}`);
  console.log(BOX + '\n');

  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();

  console.log('→ Navigating…');
  await page.goto(cfg.url, { waitUntil: 'domcontentloaded' });

  // Kill common cookie overlays
  await page.evaluate(() => {
    const ids = ['onetrust-consent-sdk', 'cookiebot-banner', 'cookie-banner'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }
  });

  // Check if we're on the job page (not the form) — click Apply if needed
  const applyBtn = page.getByRole('button', { name: /apply now|apply for this job|apply/i }).first();
  try {
    await applyBtn.waitFor({ state: 'visible', timeout: 3000 });
    console.log('→ Clicking Apply…');
    await applyBtn.click();
    await page.waitForTimeout(1200);
  } catch {
    // Already on form page
  }

  // Use frame if form is iframed, else use page
  const scopes = [page];
  const frames = page.frames();
  for (const f of frames) {
    if (f.url().includes('greenhouse') || f !== page.mainFrame()) scopes.unshift(f);
  }

  let scope = null;
  for (const s of scopes) {
    try {
      await s.getByRole('textbox').first().waitFor({ timeout: 5000 });
      scope = s;
      break;
    } catch { /* try next */ }
  }
  if (!scope) scope = page;

  console.log('→ Scope resolved:', scope === page ? 'page' : 'iframe');

  const fillResults = {};
  console.log('→ Filling fields…');
  fillResults.firstName = await tryFill(scope, 'First Name', ME.firstName, [
    'input[autocomplete="given-name"]',
    'input[name="first_name"]',
    'input[name*="first_name"]',
    'input[id*="first_name"]',
  ]);
  fillResults.lastName = await tryFill(scope, 'Last Name', ME.lastName, [
    'input[autocomplete="family-name"]',
    'input[name="last_name"]',
    'input[name*="last_name"]',
    'input[id*="last_name"]',
  ]);
  fillResults.preferredFirstName = await tryFill(scope, 'Preferred First Name', ME.preferredFirstName, [
    'input[name*="preferred"]',
    'input[id*="preferred"]',
  ]);
  fillResults.email = await tryFill(scope, 'Email', ME.email, [
    'input[type="email"]',
    'input[autocomplete="email"]',
    'input[name="email"]',
  ]);
  fillResults.phone = await tryFill(scope, 'Phone', ME.phone, [
    'input[type="tel"]',
    'input[autocomplete="tel"]',
    'input[name="phone"]',
  ]);
  fillResults.linkedin = await tryFill(scope, 'LinkedIn', ME.linkedin, [
    'input[name*="linkedin"]',
    'input[id*="linkedin"]',
  ]);
  fillResults.github = await tryFill(scope, 'GitHub', ME.github, [
    'input[name*="github"]',
    'input[id*="github"]',
  ]);
  fillResults.website = await tryFill(scope, 'Website', ME.website, [
    'input[name*="website"]',
    'input[id*="website"]',
    'input[name*="portfolio"]',
  ]);
  fillResults.howDidYouHear = await tryFill(scope, 'How did you hear', 'LinkedIn / Anthropic careers page', [
    'input[name*="hear"]',
    'textarea[name*="hear"]',
  ]);
  fillResults.startDate = await tryFill(scope, 'earliest you would want to start', 'I\'m available immediately — no notice period. Ready to start as soon as we align on the details.', [
    'textarea[name*="start"]',
    'input[name*="start"]',
    'textarea[name*="earliest"]',
    'input[name*="earliest"]',
  ]);
  fillResults.deadlines = await tryFill(scope, 'deadlines or timeline', 'No specific deadlines. I\'m available immediately and ready to move at whatever pace works for your team.', [
    'textarea[name*="deadline"]',
    'input[name*="deadline"]',
    'textarea[name*="timeline"]',
    'input[name*="timeline"]',
  ]);
  fillResults.salary = await tryFill(scope, 'salary', 'R$ 30.000/mês', [
    'input[name*="salary"]',
    'input[id*="salary"]',
    'textarea[name*="salary"]',
    'input[name*="compensation"]',
    'input[name*="expectation"]',
  ]);
  fillResults.pitch = await tryFill(scope, 'What excites you', cfg.pitch, [
    'textarea[name*="excites"]',
    'textarea[name*="why"]',
    'textarea[name*="interested"]',
    'textarea',
  ]);

  console.log('→ Field fill results:');
  for (const [k, v] of Object.entries(fillResults)) {
    console.log(`   ${v ? '✓' : '✗'} ${k}`);
  }

  console.log('→ Uploading Resume/CV…');
  const fileInputs = scope.locator('input[type="file"]');
  const fileCount = await fileInputs.count();
  let cvUploaded = false, coverUploaded = false;
  if (fileCount >= 1) {
    try {
      await fileInputs.nth(0).setInputFiles(cvAbs);
      cvUploaded = true;
      console.log('   ✓ CV uploaded');
    } catch (e) {
      console.log('   ✗ CV upload failed:', e.message);
    }
  }
  if (fileCount >= 2 && coverAbs) {
    try {
      await fileInputs.nth(1).setInputFiles(coverAbs);
      coverUploaded = true;
      console.log('   ✓ Cover letter uploaded');
    } catch (e) {
      console.log('   ✗ Cover letter upload failed:', e.message);
    }
  }

  console.log('\n' + BOX);
  console.log('Ready. Finish these manual steps in the browser:');
  console.log(BOX);
  console.log(`
• Location / Country: ${ME.country}
• Work authorization (US/UK/AU depending on role): No
• Need visa sponsorship: Yes
• Any previous Anthropic experience: No
• Export-control / diversity / veteran / disability: answer or decline as you prefer
${cfg.company === 'QuintoAndar' ? `
QuintoAndar-specific fields (fill manually if not auto-filled):
• Salary expectations: R$ 30.000/mês (or equivalent)
• English proficiency: Advanced / C1
• Spanish proficiency: Full professional
• Work authorization Portugal: No (remote from Brazil)
• Pronouns: He/Him
• Disability/neurodiversity: decline or answer as preferred` : ''}
• Any missed fields (marked ✗ above): fill manually

If auto-upload failed, attach manually:
   CV:    ${cvAbs}
   Cover: ${coverAbs || '(not provided)'}

Review everything, then click "Submit application".

When you close the browser, the script exits.
`);
  console.log(BOX + '\n');

  await new Promise((resolve) => browser.on('disconnected', resolve));
  console.log('Browser closed. Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
