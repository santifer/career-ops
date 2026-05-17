#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { chromium } from 'playwright';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const profile = yaml.load(readFileSync(path.join(ROOT, 'config/profile.yml'), 'utf-8'));
const c = profile.candidate;

const JOBS = [
  {
    num: '058', company: 'Stripe', role: 'Forward Deployed Engineer, Professional Services',
    score: '4.0', url: 'https://stripe.com/jobs/search?gh_jid=7671038',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-stripe-fde-ps-2026-04-15.pdf'),
    applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/7671038'
  },
  {
    num: '176', company: 'Airtable', role: 'Senior Solutions Architect',
    score: '3.8', url: 'https://job-boards.greenhouse.io/airtable/jobs/8487502002',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-airtable-sr-solutions-architect-2026-04-15.pdf'),
    applyUrl: 'https://job-boards.greenhouse.io/airtable/jobs/8487502002'
  },
  {
    num: '059', company: 'Stripe', role: 'Full Stack Engineer, Billing',
    score: '3.8', url: 'https://stripe.com/jobs/search?gh_jid=7737239',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-stripe-fullstack-billing-2026-04-15.pdf'),
    applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/7737239'
  },
  {
    num: '078', company: 'Spotify', role: 'Backend Engineer - Platform Developer Experience',
    score: '3.7', url: 'https://jobs.lever.co/spotify/31bf7d45-9448-413c-8f61-b69a8f636f82',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-spotify-platform-devex-2026-04-15.pdf'),
    applyUrl: 'https://jobs.lever.co/spotify/31bf7d45-9448-413c-8f61-b69a8f636f82/apply'
  },
  {
    num: '077', company: 'Spotify', role: 'Backend Engineer - Platform',
    score: '3.6', url: 'https://jobs.lever.co/spotify/e8ef80ed-633f-45ec-a1fc-a55704241f64',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-spotify-backend-platform-2026-04-15.pdf'),
    applyUrl: 'https://jobs.lever.co/spotify/e8ef80ed-633f-45ec-a1fc-a55704241f64/apply'
  },
  {
    num: '177', company: 'Airtable', role: 'Senior Partner Solutions Architect',
    score: '3.5', url: 'https://job-boards.greenhouse.io/airtable/jobs/8461582002',
    cv: path.join(ROOT, 'output/cv-marlow-sousa-airtable-sr-partner-solutions-architect-2026-04-15.pdf'),
    applyUrl: 'https://job-boards.greenhouse.io/airtable/jobs/8461582002'
  },
];

const FIELDS = {
  'first_name|first-name|firstname': c.full_name.split(' ')[0],
  'last_name|last-name|lastname': c.full_name.split(' ').slice(1).join(' '),
  'full_name|fullname|name': c.full_name,
  'email': c.email,
  'phone': c.phone,
  'linkedin': `https://${c.linkedin}`,
  'website|portfolio|url': c.portfolio_url,
  'github': `https://${c.github}`,
  'location|city': c.location,
};

async function fillInputs(page) {
  const inputs = await page.locator('input:visible').all();
  let filled = 0;
  for (const input of inputs) {
    const id    = (await input.getAttribute('id') || '').toLowerCase();
    const name  = (await input.getAttribute('name') || '').toLowerCase();
    const ph    = (await input.getAttribute('placeholder') || '').toLowerCase();
    const label = (await input.getAttribute('aria-label') || '').toLowerCase();
    const key   = `${id} ${name} ${ph} ${label}`;
    for (const [patterns, value] of Object.entries(FIELDS)) {
      if (patterns.split('|').some(p => key.includes(p))) {
        try { await input.fill(value); filled++; } catch {}
        break;
      }
    }
  }
  return filled;
}

async function uploadCV(page, cvPath) {
  try {
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(cvPath);
      return true;
    }
  } catch {}
  return false;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function updateTracker(num) {
  const file = path.join(ROOT, 'data/applications.md');
  const content = readFileSync(file, 'utf-8');
  const today = new Date().toISOString().slice(0, 10);
  const updated = content.replace(
    new RegExp(`(\\| ${num} \\|[^\\n]+)\\| ❌ (\\|)`),
    `$1| ✅ $2`
  ).replace(
    new RegExp(`(\\| ${num} \\|[^\\n]+\\| )Evaluated( \\|)`),
    `$1Applied$2`
  );
  writeFileSync(file, updated);
  console.log(`\n✅ Tracker atualizado — #${num} → Applied`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔${'═'.repeat(70)}╗`);
  console.log(`║  🚀 APLICADOR — ${c.full_name.padEnd(52)}║`);
  console.log(`╚${'═'.repeat(70)}╝\n`);
  console.log(`6 vagas ativas com CV customizado pronto:\n`);
  JOBS.forEach((j, i) => console.log(`  ${i+1}. [${j.score}/5] ${j.company} — ${j.role}`));
  console.log();

  for (let i = 0; i < JOBS.length; i++) {
    const job = JOBS[i];
    console.log(`\n${'─'.repeat(72)}`);
    console.log(`[${i+1}/6] ${job.company} — ${job.role}  (${job.score}/5)`);
    console.log(`${'─'.repeat(72)}`);

    const proceed = await ask('Aplicar nessa vaga? [s/n/q] ');
    if (proceed.trim().toLowerCase() === 'q') { console.log('\nAté mais!'); break; }
    if (proceed.trim().toLowerCase() !== 's') { console.log('Pulando...'); continue; }

    const browser = await chromium.launch({ headless: false });
    const ctx     = await browser.newContext();
    const page    = await ctx.newPage();

    console.log(`\n⏳ Abrindo formulário...`);
    await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Greenhouse / Lever: clicar no botão Apply se ainda estiver na página de descrição
    const applyBtn = page.locator('a[href*="apply"], button:has-text("Apply"), a:has-text("Apply for this job"), a:has-text("Apply now")').first();
    if (await applyBtn.count() > 0) {
      console.log(`   Clicando em Apply...`);
      await applyBtn.click();
      await page.waitForTimeout(2000);
    }

    console.log(`📝 Preenchendo campos...`);
    const filled = await fillInputs(page);
    console.log(`   ${filled} campos preenchidos`);

    console.log(`📎 Anexando CV: ${path.basename(job.cv)}`);
    const uploaded = await uploadCV(page, job.cv);
    console.log(`   CV: ${uploaded ? '✅ anexado' : '⚠️  faça upload manualmente'}`);

    console.log(`\n${'▶'.repeat(36)}`);
    console.log(`NAVEGADOR ABERTO — revise, complete e submeta.`);
    console.log(`Feche o navegador quando terminar.`);
    console.log(`${'▶'.repeat(36)}\n`);

    await new Promise(resolve => browser.once('disconnected', resolve));

    const submitted = await ask('Você submeteu a candidatura? [s/n] ');
    if (submitted.trim().toLowerCase() === 's') {
      updateTracker(job.num);
    } else {
      console.log('Ok, status não alterado.');
    }
  }

  console.log(`\n✨ Sessão encerrada.\n`);
}

main();
