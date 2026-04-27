/**
 * LinkedIn Job Application Script
 * Applies to jobs sequentially using Chrome with user profile
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const JOBS = [
  {
    num: '037',
    company: 'Confidencial Telecom LATAM',
    role: 'Gerente Corp. Contabilidade e Consolidação',
    score: '4.5/5',
    url: 'https://www.linkedin.com/jobs/view/4398015438',
    pdf: resolve(ROOT, 'output/cv-fernando-xavier-confidencial-telecom-2026-04-26.pdf'),
  },
  {
    num: '034',
    company: 'Getnet (Santander/PagoNxt)',
    role: 'Controller Manager',
    score: '4.3/5',
    url: 'https://www.linkedin.com/jobs/view/4406606884',
    pdf: resolve(ROOT, 'output/cv-fernando-xavier-getnet-2026-04-26.pdf'),
  },
  {
    num: '036',
    company: 'Scatec ASA',
    role: 'Senior Accounting, Tax & Reporting Manager',
    score: '4.1/5',
    url: 'https://www.linkedin.com/jobs/view/4387437240',
    pdf: resolve(ROOT, 'output/cv-fernando-xavier-scatec-2026-04-26.pdf'),
  },
  {
    num: '035',
    company: '4flow',
    role: 'Controlling Manager',
    score: '3.6/5',
    url: 'https://www.linkedin.com/jobs/view/4388168219',
    pdf: resolve(ROOT, 'output/cv-fernando-xavier-4flow-2026-04-26.pdf'),
  },
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function applyToJob(page, job) {
  const result = { ...job, status: 'pending', method: '', notes: '' };

  try {
    console.log(`\n=== Applying to #${job.num} — ${job.company} — ${job.role} ===`);

    // Navigate to job page
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('authwall')) {
      result.status = 'failed';
      result.notes = 'Not logged into LinkedIn';
      console.log('  NOT LOGGED IN');
      return result;
    }

    // Check if job still exists
    const pageContent = await page.content();
    if (pageContent.includes('No longer accepting applications') ||
        pageContent.includes('This job is no longer available') ||
        pageContent.includes('page-not-found') ||
        currentUrl.includes('login')) {
      result.status = 'closed';
      result.notes = 'Job posting closed/expired';
      console.log('  JOB CLOSED');
      return result;
    }

    // Look for Easy Apply button
    const easyApplyBtn = await page.$('button.jobs-apply-button');
    const applyBtn = await page.$('button[data-tracking-control-name*="apply"]') ||
                     await page.$('.jobs-apply-button--topcard') ||
                     await page.$('a[href*="apply"]');

    // Also check for external apply button
    const externalApplyBtn = await page.$('button:has-text("Apply")') ||
                              await page.$('a:has-text("Apply")');

    if (easyApplyBtn) {
      console.log('  Found Easy Apply button');
      result.method = 'Easy Apply';
      await easyApplyBtn.click();
      await sleep(2000);

      // Handle Easy Apply modal
      const modal = await page.$('.jobs-easy-apply-modal') ||
                    await page.$('[role="dialog"]');

      if (modal) {
        console.log('  Easy Apply modal opened');

        // Step through the application
        let step = 0;
        const maxSteps = 15;

        while (step < maxSteps) {
          step++;
          console.log(`  Step ${step}...`);

          await sleep(1500);

          // Check for file upload
          const fileInput = await page.$('input[type="file"]');
          if (fileInput) {
            console.log('  Found file upload, uploading CV...');
            await fileInput.setInputFiles(job.pdf);
            await sleep(2000);
          }

          // Check for text inputs that might need filling
          const textInputs = await page.$$('.jobs-easy-apply-modal input[type="text"]:not([disabled])');
          for (const input of textInputs) {
            const placeholder = await input.getAttribute('placeholder') || '';
            const label = await input.evaluate(el => {
              const labelEl = el.closest('.artdeco-text-input') || el.closest('[class*="form"]');
              if (labelEl) {
                const lbl = labelEl.querySelector('label');
                return lbl ? lbl.textContent.trim() : '';
              }
              return '';
            });

            const fieldLabel = (placeholder + ' ' + label).toLowerCase();

            if (fieldLabel.includes('phone') || fieldLabel.includes('telefone') || fieldLabel.includes('mobile')) {
              const currentVal = await input.inputValue();
              if (!currentVal) {
                await input.fill('+55 11 96480-1913');
                console.log('  Filled phone');
              }
            }
          }

          // Check for dropdown selects
          const selects = await page.$$('.jobs-easy-apply-modal select:not([disabled])');
          for (const select of selects) {
            // Try to select relevant option
            const options = await select.$$('option');
            for (const opt of options) {
              const text = await opt.textContent();
              const val = await opt.getAttribute('value');
              if (val && val !== '' && (
                text.toLowerCase().includes('brazil') ||
                text.toLowerCase().includes('brasil') ||
                text.toLowerCase().includes('sao paulo') ||
                text.toLowerCase().includes('são paulo') ||
                text.toLowerCase().includes('yes') ||
                text.toLowerCase().includes('sim') ||
                text.toLowerCase().includes('required') === false
              )) {
                await select.selectOption(val);
                break;
              }
            }
          }

          // Look for Next or Submit button
          const nextBtn = await page.$('.jobs-easy-apply-modal button:has-text("Next")') ||
                          await page.$('.jobs-easy-apply-modal button:has-text("Próximo")') ||
                          await page.$('.jobs-easy-apply-modal button:has-text("Review")') ||
                          await page.$('.jobs-easy-apply-modal button:has-text("Revisar")');

          const submitBtn = await page.$('.jobs-easy-apply-modal button:has-text("Submit")') ||
                            await page.$('.jobs-easy-apply-modal button:has-text("Enviar")') ||
                            await page.$('.jobs-easy-apply-modal button:has-text("Apply")');

          if (submitBtn) {
            console.log('  Found Submit button - submitting application');
            await submitBtn.click();
            await sleep(3000);

            // Check for confirmation
            const confirmDialog = await page.$('.artdeco-inline-feedback--success') ||
                                  await page.$('[class*="success"]') ||
                                  await page.$('text=Application submitted') ||
                                  await page.$('text=candidatura foi enviada');

            if (confirmDialog || (await page.$('.jobs-easy-apply-modal')) === null) {
              result.status = 'applied';
              result.notes = 'Submitted via Easy Apply';
              console.log('  APPLICATION SUBMITTED');
            } else {
              result.status = 'applied';
              result.notes = 'Submit clicked, confirmation unclear';
              console.log('  Submit clicked, checking...');
            }
            break;
          } else if (nextBtn) {
            await nextBtn.click();
            await sleep(2000);
          } else {
            // No next or submit - maybe already done or stuck
            console.log('  No Next/Submit button found at step', step);
            await sleep(1000);

            // Check if dialog is gone (success)
            const modalGone = !(await page.$('.jobs-easy-apply-modal'));
            if (modalGone) {
              result.status = 'applied';
              result.notes = 'Modal closed (likely submitted)';
              console.log('  Modal closed');
              break;
            }

            // Take screenshot for debugging
            await page.screenshot({ path: resolve(ROOT, `output/apply-step-${job.num}-stuck.png`) });
            result.status = 'partial';
            result.notes = `Stuck at step ${step}, screenshot saved`;
            console.log('  Stuck, screenshot saved');
            break;
          }
        }
      } else {
        result.status = 'failed';
        result.notes = 'Easy Apply modal did not open';
        console.log('  Easy Apply modal NOT found');
      }
    } else if (externalApplyBtn) {
      console.log('  Found external Apply button');
      result.method = 'External';
      result.status = 'redirect';
      result.notes = 'External application - needs manual follow-up';

      // Click to see where it redirects
      const [newPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
        externalApplyBtn.click().catch(() => null)
      ]);

      if (newPage) {
        await sleep(2000);
        const externalUrl = newPage.url();
        result.notes = `External: ${externalUrl}`;
        console.log('  Redirects to:', externalUrl);
        await newPage.close().catch(() => {});
      }
    } else {
      result.status = 'failed';
      result.notes = 'No Apply button found';
      console.log('  No Apply button found');
    }

  } catch (error) {
    result.status = 'error';
    result.notes = error.message.substring(0, 100);
    console.log('  ERROR:', error.message.substring(0, 100));
  }

  return result;
}

async function main() {
  const userDataDir = 'C:\\Users\\win\\AppData\\Local\\Google\\Chrome\\User Data';

  console.log('Launching Chrome with user profile...');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    args: [
      '--start-maximized',
      '--profile-directory=Default',
      '--no-first-run',
      '--no-default-browser-check'
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    timeout: 30000
  });

  const page = context.pages()[0] || await context.newPage();

  // Check login status
  console.log('Checking LinkedIn login...');
  await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(3000);

  const feedUrl = page.url();
  if (feedUrl.includes('login') || feedUrl.includes('authwall')) {
    console.log('\n❌ NOT LOGGED INTO LINKEDIN');
    console.log('Please log in to LinkedIn in the browser window, then press Enter here to continue...');

    // Wait for user input (read from stdin)
    await new Promise((resolve) => {
      process.stdin.once('data', () => {
        resolve();
      });
    });

    // Re-check
    await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);

    if (page.url().includes('login') || page.url().includes('authwall')) {
      console.log('Still not logged in. Exiting.');
      await context.close();
      process.exit(1);
    }
  }

  console.log('✅ Logged into LinkedIn');

  // Apply to each job
  const results = [];
  for (const job of JOBS) {
    const result = await applyToJob(page, job);
    results.push(result);

    // Save screenshot after each application
    await page.screenshot({ path: resolve(ROOT, `output/apply-result-${job.num}.png`) });

    // Brief pause between applications
    await sleep(2000);
  }

  // Print summary
  console.log('\n\n========== APPLICATION SUMMARY ==========');
  console.log('| # | Empresa | Status | Method | Notes |');
  console.log('|---|---------|--------|--------|-------|');
  for (const r of results) {
    console.log(`| ${r.num} | ${r.company} | ${r.status} | ${r.method || 'N/A'} | ${r.notes} |`);
  }

  // Write results to file
  const resultsPath = resolve(ROOT, 'output/apply-results.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);

  // Keep browser open for user to review
  console.log('\nBrowser will stay open. Press Ctrl+C to close when done.');

  // Don't close - let user review
  // await context.close();
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
