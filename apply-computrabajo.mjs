#!/usr/bin/env node

/**
 * apply-computrabajo.mjs — Specialized Computrabajo application handler
 * 
 * Optimized for Computrabajo.com job applications:
 * - Handles candidato.co.computrabajo.com redirect
 * - Detects "Postulado" status
 * - Fills Computrabajo-specific form fields
 * - Parses checkmark SVG success states
 * 
 * Usage:
 *   node apply-computrabajo.mjs <url>
 */

import yaml from 'js-yaml';
import { chromium } from 'playwright';
import { readFileSync, existsSync, appendFileSync } from 'fs';

const PROFILE = yaml.load(readFileSync('config/profile.yml', 'utf8'));
const CREDENTIALS = yaml.load(readFileSync('config/credentials.yml', 'utf8'));

const url = process.argv[2];
if (!url) {
  console.error('Usage: node apply-computrabajo.mjs <url>');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: false }); // Set to true for headless
  const context = await browser.newContext();
  const page = await context.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  let result = {
    url,
    company: 'Computrabajo',
    status: 'pending',
    steps: [],
    startTime: new Date().toISOString()
  };

  try {
    // Step 1: Navigate
    console.log('📍 Navigating to job URL...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    result.steps.push('Navigated to URL');

    // Step 2: Check if already applied
    console.log('🔍 Checking if already applied...');
    const alreadyApplied = await page.$eval(
      'div.bg_header.status_prev p, div.status_prev .status_prev, [class*="postulado"]',
      el => el?.innerText?.includes('Postulado') || el?.innerText?.includes('postulado') || false
    ).catch(() => false);

    if (alreadyApplied) {
      console.log('✅ Already applied to this job');
      result.status = 'already-applied';
      result.steps.push('Already applied status detected');
    } else {
      // Step 3: Find and click apply button
      console.log('🖱️  Finding apply button...');
      const applyHref = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span'));
        const applySpan = spans.find(s => s.getAttribute('data-href-offer-apply'));
        return applySpan?.getAttribute('data-href-offer-apply');
      });

      if (!applyHref) {
        console.log('❌ No apply button found');
        result.status = 'no-apply-button';
        result.steps.push('Apply button not found');
      } else {
        console.log('✅ Found apply button, navigating...');
        result.steps.push(`Found apply URL: ${applyHref.substring(0, 80)}...`);

        // Navigate to apply page
        await page.goto(applyHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000); // Extra wait for JS to render
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

        // Step 4: Check for login requirement
        console.log('🔐 Checking for login requirement...');
        const requiresLogin = await page.url().includes('login') || 
                             await page.$('input[name=email]') != null ||
                             await page.$('form:has(input[type=password])') != null;

        if (requiresLogin) {
          console.log('🔑 Logging in...');
          result.steps.push('Login required, attempting authentication');

          const emailInput = await page.$('input[name=email]');
          const passwordInput = await page.$('input[name=password]');

          if (emailInput && passwordInput) {
            await emailInput.fill(CREDENTIALS.computrabajo.email);
            await passwordInput.fill(CREDENTIALS.computrabajo.password);
            
            const submitBtn = await page.$('button[type=submit]');
            if (submitBtn) {
              await submitBtn.click();
              await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
              result.steps.push('Login submitted');
            }
          }
        }

        // Step 5: Fill form
        console.log('📝 Filling application form...');
        const formFields = await page.$$('input[name], textarea[name], select[name]');
        const filled = [];

        for (const field of formFields) {
          const name = await field.getAttribute('name');
          const type = await field.getAttribute('type');
          const label = await field.evaluate(el => el.labels?.[0]?.innerText?.toLowerCase() || '');
          
          let value = '';
          
          // Map field name to profile data
          if (/email/.test(name) || /email/.test(label)) {
            value = PROFILE.candidate.email;
          } else if (/nombre|full.?name|name/.test(name) || /nombre|full.?name/.test(label)) {
            value = PROFILE.candidate.full_name;
          } else if (/tel[eé]fono|celular|phone|mobile/.test(name) || /tel[eé]fono|celular|phone/.test(label)) {
            value = PROFILE.candidate.phone;
          } else if (/ciudad|location|city/.test(name) || /ciudad|ubicaci[oó]n|location/.test(label)) {
            value = PROFILE.candidate.location;
          } else if (/linkedin|perfil/.test(name) || /linkedin|perfil/.test(label)) {
            value = PROFILE.candidate.linkedin || '';
          } else if (/portfolio|website|portafolio|sitio/.test(name) || /portfolio|website|portafolio/.test(label)) {
            value = PROFILE.candidate.portfolio_url || '';
          } else if (/motivation|message|por.?qu[eé]|reason|coment/.test(name) || /motivation|message|por.?qu[eé]|reason|coment/.test(label)) {
            value = `Estoy muy interesado en esta posición de Desarrollador porque alinea perfectamente con mis habilidades en tecnologías web modernas.`;
          }

          if (value) {
            await field.fill(value).catch(() => {});
            filled.push(name);
            console.log(`  ✓ ${name} = ${value.substring(0, 30)}...`);
          }
        }

        result.steps.push(`Filled ${filled.length} form fields: ${filled.join(', ')}`);

        // Step 6: Submit form
        console.log('✍️  Submitting application...');
        const submitBtn = await page.$('button:has-text("Enviar"), button[type=submit]:has-text("Aplicar"), button:has-text("Postúlate")');
        
        if (submitBtn) {
          await submitBtn.click();
          result.steps.push('Submit button clicked');
          
          // Wait for success page
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(2000);

          // Step 7: Detect success
          console.log('🎉 Detecting success...');
          const success = await page.evaluate(() => {
            // Check for checkmark SVG
            const checkmark = document.querySelector('svg.checkmark, .checkmark_circle, [class*="success"]');
            if (checkmark) {
              console.log('Found checkmark SVG');
              return true;
            }

            // Check for success text
            const text = document.body.innerText;
            if (/¡Aplicaste correctamente!|Aplicación enviada|Successfully applied/.test(text)) {
              console.log('Found success text');
              return true;
            }

            // Check for "Postulado" status after submission
            const postulado = document.querySelector('[class*="postulado"], [class*="status"]');
            if (postulado && postulado.innerText?.includes('Postulado')) {
              console.log('Found Postulado status');
              return true;
            }

            return false;
          }).catch(() => false);

          if (success) {
            console.log('✅ SUCCESS: Application submitted and confirmed!');
            result.status = 'success';
            result.steps.push('Success confirmed (checkmark or status detected)');
          } else {
            console.log('⚠️  Form submitted but success not visually confirmed');
            result.status = 'submitted-unverified';
            result.steps.push('Form submitted but visual confirmation not found');
          }
        } else {
          console.log('❌ Submit button not found');
          result.status = 'form-not-submitted';
          result.steps.push('Submit button not found');
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    result.status = 'error';
    result.steps.push(`Error: ${error.message}`);
  } finally {
    result.endTime = new Date().toISOString();
    
    // Log result
    console.log('\n📋 Result:');
    console.log(`   Status: ${result.status}`);
    console.log(`   Steps:`);
    result.steps.forEach(step => console.log(`     - ${step}`));

    // Append to log
    const logLine = `| ${new Date().toLocaleString()} | ${url} | ${result.status} | ${result.steps.length} steps |\n`;
    appendFileSync('data/applications-log.md', logLine, 'utf8');

    await browser.close();
  }
}

main().catch(console.error);
