#!/usr/bin/env node
// Auto-fills Databricks FDE US application form via Playwright (headed mode).
// Fills text fields; user handles file upload + dropdowns + submit manually.
//
// Usage: node auto-apply-databricks.mjs

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CV_PATH = path.join(__dirname, 'output/cv-marlow-sousa-databricks-fde-us-2026-04-12.pdf');
const COVER_LETTER_PATH = path.join(__dirname, 'output/cover-letter-marlow-databricks-2026-04-17.pdf');
const APPLICATION_URL = 'https://www.databricks.com/company/careers/professional-services-operations/ai-engineer---fde-forward-deployed-engineer-8335860002?gh_jid=8335860002';

const A = {
  firstName: 'Marlow',
  lastName: 'Sousa',
  preferredFirstName: 'Marlow',
  email: 'sousa.marlow@gmail.com',
  phone: '11951417671',
  linkedin: 'https://linkedin.com/in/marlowsousa',
  github: 'https://github.com/wolram',
  howDidYouHear: 'Databricks careers page / LinkedIn',
  whatExcitesYou: `The AI FDE charter — productionizing first-of-its-kind GenAI applications alongside customers — is the exact work I've been doing for 8 years. At Omni (top-20 Brazilian bank) I led a unified automation+GenAI platform that delivered R$10M+ in savings; at Unimed (healthcare, 12,000+ medical claims/month) I founded the RPA Center of Excellence from zero.

My current stack is Claude-native: Juridiques (FastAPI + Claude API + ChromaDB RAG pipeline), Automation Advisor (Claude tool use for structured scoring), and CLT x PJ (live on the App Store, multi-step Claude reasoning over Brazilian labor law and tax rules). Last week I shipped a multi-agent system orchestrated via Claude Code with Linear as the issue/state board — my own mini-FDE engagement ready to demo on a call.

Databricks is where enterprise-delivery muscle meets a best-in-class AI platform for customer work. I want to build production GenAI at customer scale, and Databricks is the canonical place to do it.`,
};

const BOX = '═'.repeat(64);

async function main() {
  console.log('Launching Chromium (headed)…');
  const browser = await chromium.launch({ headless: false, slowMo: 180 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  console.log(`Navigating to: ${APPLICATION_URL}`);
  await page.goto(APPLICATION_URL, { waitUntil: 'domcontentloaded' });

  // Kill cookie overlay
  await page.evaluate(() => {
    const el = document.getElementById('onetrust-consent-sdk');
    if (el) el.remove();
  });

  console.log('Clicking "Apply now"…');
  await page.getByRole('button', { name: 'Apply now' }).click();

  console.log('Waiting for Greenhouse iframe to render…');
  const frame = page.frameLocator('iframe').first();
  await frame.getByLabel('First Name', { exact: false }).first().waitFor({ timeout: 20000 });

  console.log('Filling text fields…');

  await frame.getByLabel('First Name', { exact: false }).first().fill(A.firstName);
  await frame.getByLabel('Last Name', { exact: false }).first().fill(A.lastName);
  await frame.getByLabel('Preferred First Name', { exact: false }).first().fill(A.preferredFirstName);
  await frame.getByLabel('Email', { exact: false }).first().fill(A.email);

  // Phone field (after Country combobox)
  await frame.getByLabel('Phone', { exact: true }).fill(A.phone);

  await frame.getByLabel('LinkedIn Profile', { exact: false }).fill(A.linkedin);
  await frame.getByLabel('GitHub', { exact: false }).fill(A.github);
  await frame.getByLabel('How did you hear about this job?', { exact: false }).fill(A.howDidYouHear);
  await frame.getByLabel('What excites you about this role?', { exact: false }).fill(A.whatExcitesYou);

  console.log('Uploading Resume/CV…');
  try {
    const resumeInput = frame.locator('input[type="file"]').first();
    await resumeInput.setInputFiles(CV_PATH);
    console.log('  ✓ CV attached');
  } catch (e) {
    console.log('  ⚠ CV auto-upload failed — will need manual upload. Error:', e.message);
  }

  console.log('Uploading Cover Letter…');
  try {
    const coverInput = frame.locator('input[type="file"]').nth(1);
    await coverInput.setInputFiles(COVER_LETTER_PATH);
    console.log('  ✓ Cover Letter attached');
  } catch (e) {
    console.log('  ⚠ Cover Letter auto-upload failed — will need manual upload. Error:', e.message);
  }

  console.log('\n' + BOX);
  console.log('✅ Text fields + uploads done. Only manual steps left:');
  console.log(BOX);
  console.log(`
1. Country (phone): Brazil
2. Dropdowns:
   - Authorized to work in the US? → No
   - Need visa sponsorship? → Yes
   - Worked for Databricks before? → No

3. Export-control checkboxes:
   - First group → "None of the above"
   - Second group → "Not applicable"

4. Voluntary self-id (optional): fill or skip as you prefer

5. Review everything carefully

6. Click "Submit application" when ready

If auto-upload failed, manually attach:
   CV:           ${CV_PATH}
   Cover Letter: ${COVER_LETTER_PATH}

Browser stays open. Close it manually when done.
`);
  console.log(BOX + '\n');

  // Keep browser alive until user closes it
  await new Promise((resolve) => browser.on('disconnected', resolve));
  console.log('Browser closed. Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
