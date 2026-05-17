#!/usr/bin/env node
/**
 * apply-priority.mjs — Aplicador prioritário com 27 vagas ordenadas por score
 *
 * Usage: node apply-priority.mjs
 *
 * O script abre Chromium (headed), preenche os campos automáticos,
 * faz upload do CV e pausa para você revisar + submeter manualmente.
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ── Candidato ─────────────────────────────────────────────────────────────────
const ME = {
  firstName:  'Marlow',
  lastName:   'Sousa',
  email:      'sousa.marlow@gmail.com',
  phone:      '+55 11 95141-7671',
  phoneDigits:'11951417671',
  linkedin:   'https://linkedin.com/in/marlowsousa',
  github:     'https://github.com/wolram',
  portfolio:  'https://marlow.dev.br',
  website:    'https://marlow.dev.br',
  location:   'Sao Paulo, Brazil',
  pronouns:   'He/Him',
};

// ── Vagas — 27 prioritárias ordenadas por score ────────────────────────────────
const JOBS = [
  // ── 4.6 ──────────────────────────────────────────────────────────────────
  {
    num: '019', score: '4.6', company: 'Anthropic', role: 'SA, Applied AI (Industries) — London',
    url: 'https://www.linkedin.com/jobs/view/4327626825/',
    applyUrl: 'https://job-boards.greenhouse.io/anthropic/jobs/4866569008',
    cv: path.join(ROOT, 'output/cv-marlow-anthropic-sa-industries-london-2026-04-12.pdf'),
  },
  // ── 4.5 ──────────────────────────────────────────────────────────────────
  {
    num: '023', score: '4.5', company: 'CVS Health', role: 'Distinguished Architect — Applied AI',
    url: 'https://www.linkedin.com/jobs/view/4333820554/',
    applyUrl: 'https://www.linkedin.com/jobs/view/4333820554/',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-cvs-distinguished-architect-ai-2026-04-18.pdf'),
  },
  {
    num: '012', score: '4.5', company: 'Anthropic', role: 'SA, Applied AI (Digital Native Business)',
    url: 'https://www.linkedin.com/jobs/view/4354413356/',
    applyUrl: 'https://job-boards.greenhouse.io/anthropic/jobs/5121563008',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-anthropic-dnb-2026-04-18.pdf'),
    note: 'Verificar: pode ser a mesma vaga do #425 já aplicado',
  },
  {
    num: '010', score: '4.5', company: 'Anthropic', role: 'SA, Applied AI (Sydney)',
    url: 'https://www.linkedin.com/jobs/view/4371703219/',
    applyUrl: 'https://job-boards.greenhouse.io/anthropic/jobs/5014500008',
    cv: path.join(ROOT, 'output/cv-marlow-anthropic-sa-sydney-2026-04-12.pdf'),
  },
  // ── 4.4 ──────────────────────────────────────────────────────────────────
  {
    num: '024', score: '4.4', company: 'CVS Health', role: 'Staff SDE (Agentic AI/ML)',
    url: 'https://www.linkedin.com/jobs/view/4379927764/',
    applyUrl: 'https://www.linkedin.com/jobs/view/4379927764/',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-cvs-2026-04-12.pdf'),
  },
  // ── 4.3 ──────────────────────────────────────────────────────────────────
  {
    num: '032', score: '4.3', company: 'Databricks', role: 'AI Engineer — FDE',
    url: 'https://www.databricks.com/company/careers/professional-services-operations/ai-engineer---fde-forward-deployed-engineer-8189900002',
    applyUrl: 'https://job-boards.greenhouse.io/databricks/jobs/8189900002',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-databricks-2026-04-12.pdf'),
    note: 'Verificar: pode ser a mesma vaga do #183 já aplicado',
  },
  // ── 4.2 ──────────────────────────────────────────────────────────────────
  {
    num: '048', score: '4.2', company: 'Monzo', role: 'Senior Staff SWE, AI Customer Operations',
    url: 'https://job-boards.greenhouse.io/monzo/jobs/7613712',
    applyUrl: 'https://job-boards.greenhouse.io/monzo/jobs/7613712',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-monzo-2026-04-12.pdf'),
  },
  {
    num: '193', score: '4.2', company: 'Anthropic', role: 'Claude Evangelist, Applied AI (Startups)',
    url: 'https://job-boards.greenhouse.io/anthropic/jobs/5116927008',
    applyUrl: 'https://job-boards.greenhouse.io/anthropic/jobs/5116927008',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-anthropic-claude-evangelist-2026-04-18.pdf'),
  },
  {
    num: '018', score: '4.2', company: 'Anthropic', role: 'Forward Deployed Engineer, Applied AI (London)',
    url: 'https://www.linkedin.com/jobs/view/4327094380/',
    applyUrl: 'https://job-boards.greenhouse.io/anthropic/jobs/5121561008',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-anthropic-fde-london-2026-04-12.pdf'),
  },
  {
    num: '174', score: '4.2', company: 'Airtable', role: 'AI Agent Architect, Customer Experience',
    url: 'https://job-boards.greenhouse.io/airtable/jobs/8409168002',
    applyUrl: 'https://job-boards.greenhouse.io/airtable/jobs/8409168002',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-airtable-ai-agent-architect-2026-04-18.pdf'),
  },
  // ── 4.1 ──────────────────────────────────────────────────────────────────
  {
    num: '092', score: '4.1', company: 'Disney Streaming', role: 'Lead ML Engineer, GenAI',
    url: 'https://jobs.disneycareers.com/job/santa-monica/lead-machine-learning-engineer-genai/391/79321257632',
    applyUrl: 'https://jobs.disneycareers.com/job/santa-monica/lead-machine-learning-engineer-genai/391/79321257632',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-disney-lead-ml-engineer-genai-2026-04-18.pdf'),
  },
  {
    num: '090', score: '4.1', company: 'Disney Streaming', role: 'Lead SWE — Applied AI & ML',
    url: 'https://jobs.disneycareers.com/job/santa-monica/lead-software-engineer-applied-ai-and-machine-learning/391/78729974000',
    applyUrl: 'https://jobs.disneycareers.com/job/santa-monica/lead-software-engineer-applied-ai-and-machine-learning/391/78729974000',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-disney-lead-swe-applied-ai-2026-04-18.pdf'),
  },
  {
    num: '042', score: '4.1', company: 'Cohere', role: 'FDE Agentic Platform (North America)',
    url: 'https://jobs.ashbyhq.com/cohere/b0bcef37-1d20-414f-aade-c54942d63df9',
    applyUrl: 'https://jobs.ashbyhq.com/cohere/b0bcef37-1d20-414f-aade-c54942d63df9',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-cohere-2026-04-12.pdf'),
  },
  {
    num: '035', score: '4.1', company: 'Salesforce', role: 'AI Engineer — Forward Deployed (Multiple Levels)',
    url: 'https://careers.salesforce.com/en/jobs/jr305674/ai-engineer-forward-deployed-engineer-multiple-levels/',
    applyUrl: 'https://careers.salesforce.com/en/jobs/jr305674/ai-engineer-forward-deployed-engineer-multiple-levels/',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-salesforce-2026-04-12.pdf'),
  },
  // ── 4.0 ──────────────────────────────────────────────────────────────────
  {
    num: '098', score: '4.0', company: 'NBCUniversal', role: 'Software Engineer (Generative AI)',
    url: 'https://jobs.smartrecruiters.com/NBCUniversal3/744000040532399-software-engineer-generative-ai-',
    applyUrl: 'https://jobs.smartrecruiters.com/NBCUniversal3/744000040532399-software-engineer-generative-ai-',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-nbcuniversal-swe-genai-2026-04-18.pdf'),
  },
  {
    num: '058', score: '4.0', company: 'Stripe', role: 'Forward Deployed Engineer, Professional Services',
    url: 'https://stripe.com/jobs/listing/forward-deployed-engineer-professional-services/7671038',
    applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/7671038',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-stripe-fde-ps-2026-04-15.pdf'),
  },
  {
    num: '046', score: '4.0', company: 'Contentful', role: 'Senior Backend Engineer, AI Platform',
    url: 'https://job-boards.greenhouse.io/contentful/jobs/7776562',
    applyUrl: 'https://job-boards.greenhouse.io/contentful/jobs/7776562',
    cv: path.join(ROOT, 'output/cv-046-contentful-ai-platform-2026-04-11.pdf'),
  },
  {
    num: '045', score: '4.0', company: 'Mistral AI', role: 'Applied AI, Forward Deployed ML Engineer (EMEA)',
    url: 'https://job-boards.greenhouse.io/contentful/jobs/7487850',
    applyUrl: 'https://jobs.lever.co/mistral/b7ae8fc4-5779-4ad2-8f5b-632b4d9498cf',
    cv: path.join(ROOT, 'output/cv-039-mistral-fde-ml-engineer-emea-2026-04-11.pdf'),
  },
  {
    num: '015', score: '4.0', company: 'Anthropic', role: 'SA, Applied AI (Creatives) NYC',
    url: 'https://www.linkedin.com/jobs/view/4374070866/',
    applyUrl: 'https://job-boards.greenhouse.io/anthropic/jobs/4866569008',
    cv: path.join(ROOT, 'output/cv-marlow-anthropic-sa-creatives-nyc-2026-04-06.pdf'),
  },
  // ── 3.9 ──────────────────────────────────────────────────────────────────
  {
    num: '083', score: '3.9', company: 'Warner Bros. Discovery', role: 'Staff SWE, Applied AI',
    url: 'https://careers.wbd.com/global/en/job/R000094458/Staff-Software-Engineer-Applied-AI',
    applyUrl: 'https://careers.wbd.com/global/en/job/R000094458/Staff-Software-Engineer-Applied-AI',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-wbd-staff-swe-applied-ai-2026-04-18.pdf'),
  },
  {
    num: '057', score: '3.9', company: 'Stripe', role: 'Forward Deployed AI Accelerator, Marketing',
    url: 'https://stripe.com/jobs/search?gh_jid=7747640',
    applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/7747640',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-stripe-fde-ai-accelerator-2026-04-18.pdf'),
  },
  // ── 3.8 ──────────────────────────────────────────────────────────────────
  {
    num: '006', score: '3.8', company: 'Anthropic', role: 'SWE, Business Technology',
    url: 'https://www.linkedin.com/jobs/view/4322430062/',
    applyUrl: 'https://job-boards.greenhouse.io/anthropic/jobs/4866569008',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-anthropic-swe-biztech-2026-04-18.pdf'),
  },
  {
    num: '059', score: '3.8', company: 'Stripe', role: 'Full Stack Engineer, Billing',
    url: 'https://stripe.com/jobs/listing/full-stack-engineer-billing/7737239',
    applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/7737239',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-stripe-fullstack-billing-2026-04-15.pdf'),
  },
  {
    num: '034', score: '3.8', company: 'Vercel', role: 'AI Engineer',
    url: 'https://vercel.com/careers/ai-engineer-5517523004',
    applyUrl: 'https://vercel.com/careers/ai-engineer-5517523004',
    cv: path.join(ROOT, 'output/cv-marlow-vercel-ai-engineer-2026-04-11.pdf'),
  },
  {
    num: '176', score: '3.8', company: 'Airtable', role: 'Senior Solutions Architect',
    url: 'https://job-boards.greenhouse.io/airtable/jobs/8487502002',
    applyUrl: 'https://job-boards.greenhouse.io/airtable/jobs/8487502002',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-airtable-sr-solutions-architect-2026-04-15.pdf'),
  },
  {
    num: '108', score: '3.8', company: 'GitHub', role: 'Staff SWE (Code and Review)',
    url: 'https://www.github.careers/careers-home/jobs/5146?lang=en-us',
    applyUrl: 'https://www.github.careers/careers-home/jobs/5146?lang=en-us',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-github-staff-swe-code-review-2026-04-18.pdf'),
  },
  {
    num: '100', score: '3.8', company: 'NBCUniversal', role: 'Sr. Data Engineer, Engineering & Ops',
    url: 'https://jobs.smartrecruiters.com/NBCUniversal3/744000112787367-sr-data-engineer-engineering-ops',
    applyUrl: 'https://jobs.smartrecruiters.com/NBCUniversal3/744000112787367-sr-data-engineer-engineering-ops',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-nbcuniversal-sr-data-engineer-2026-04-18.pdf'),
  },
];

// ── Campos automáticos ─────────────────────────────────────────────────────────
const FIELD_MAP = {
  'first_name|first-name|firstname|fname': ME.firstName,
  'last_name|last-name|lastname|lname': ME.lastName,
  'full_name|fullname|name': `${ME.firstName} ${ME.lastName}`,
  'email': ME.email,
  'phone': ME.phone,
  'linkedin': ME.linkedin,
  'website|portfolio|url': ME.portfolio,
  'github': ME.github,
  'location|city': ME.location,
  'pronouns': ME.pronouns,
};

async function fillInputs(page) {
  const inputs = await page.locator('input:visible').all();
  let filled = 0;
  for (const input of inputs) {
    const id    = (await input.getAttribute('id')    || '').toLowerCase();
    const name  = (await input.getAttribute('name')  || '').toLowerCase();
    const ph    = (await input.getAttribute('placeholder') || '').toLowerCase();
    const label = (await input.getAttribute('aria-label')  || '').toLowerCase();
    const key   = `${id} ${name} ${ph} ${label}`;
    for (const [patterns, value] of Object.entries(FIELD_MAP)) {
      if (patterns.split('|').some(p => key.includes(p))) {
        try { await input.fill(value); filled++; } catch {}
        break;
      }
    }
  }
  return filled;
}

async function uploadCV(page, cvPath) {
  if (!fs.existsSync(cvPath)) { console.log(`  ⚠️  PDF não encontrado: ${cvPath}`); return false; }
  try {
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) { await fileInput.setInputFiles(cvPath); return true; }
  } catch {}
  return false;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function updateTracker(num) {
  const file = path.join(ROOT, 'data/applications.md');
  let content = fs.readFileSync(file, 'utf-8');
  content = content
    .replace(new RegExp(`(\\| ${num} \\|[^\\n]+)\\| Evaluated (\\|)`), `$1| Applied $2`)
    .replace(new RegExp(`(\\| ${num} \\|[^\\n]+Applied[^\\n]+\\| )(❌)( \\|[^\\n]+\\|)`), `$1✅$3`);
  fs.writeFileSync(file, content);
  console.log(`  ✅ Tracker → #${num} Applied`);
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  const total = JOBS.length;
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  APLICADOR PRIORITÁRIO — ${total} vagas ordenadas por score`);
  console.log(`${'═'.repeat(72)}\n`);

  JOBS.forEach((j, i) => {
    const note = j.note ? `  ⚠️  ${j.note}` : '';
    console.log(`  ${String(i+1).padStart(2)}. [${j.score}/5] #${j.num} ${j.company} — ${j.role}${note}`);
  });
  console.log();

  // Permite pular para uma vaga específica
  const startFrom = await ask('Começar da vaga nº [1]: ');
  const startIdx = Math.max(0, (parseInt(startFrom) || 1) - 1);

  for (let i = startIdx; i < JOBS.length; i++) {
    const job = JOBS[i];
    console.log(`\n${'─'.repeat(72)}`);
    console.log(`[${i+1}/${total}] ${job.company} — ${job.role}  (${job.score}/5)`);
    if (job.note) console.log(`  ⚠️  ${job.note}`);
    console.log(`  URL: ${job.applyUrl}`);
    console.log(`  CV:  ${path.basename(job.cv)}`);
    console.log(`${'─'.repeat(72)}`);

    const answer = await ask('Aplicar? [s=sim / n=pular / q=sair] ');
    const a = answer.trim().toLowerCase();
    if (a === 'q') { console.log('\nEncerrando. Até mais!'); break; }
    if (a !== 's') { console.log('  Pulando...'); continue; }

    const browser = await chromium.launch({ headless: false, slowMo: 150 });
    const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page    = await ctx.newPage();

    console.log('\n  ⏳ Abrindo formulário...');
    await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('  ✏️  Preenchendo campos...');
    const filled = await fillInputs(page);
    console.log(`  → ${filled} campos preenchidos`);

    console.log('  📄 Fazendo upload do CV...');
    const uploaded = await uploadCV(page, job.cv);
    console.log(uploaded ? '  → CV enviado' : '  → Upload manual necessário');

    console.log('\n  ⏸️  PAUSE — Revise o formulário no browser.');
    console.log('     Preencha dropdowns, checkboxes e campos restantes.');
    console.log('     NÃO clique em Submit ainda.\n');

    const done = await ask('  Enviou a aplicação? [s=sim, aplicado / n=cancelar] ');
    await browser.close();

    if (done.trim().toLowerCase() === 's') {
      updateTracker(job.num);
      console.log(`  🎯 #${job.num} ${job.company} — aplicado!\n`);
    } else {
      console.log('  Cancelado. Pulando para a próxima.\n');
    }
  }

  console.log(`\n${'═'.repeat(72)}`);
  console.log('  Sessão encerrada. Bom trabalho!');
  console.log(`${'═'.repeat(72)}\n`);
}

main().catch(console.error);
