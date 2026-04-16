#!/usr/bin/env node

/**
 * apply-auto.mjs — Pipeline autónomo de aplicaciones a empleo
 *
 * Plataformas soportadas: Computrabajo, LinkedIn
 * - Login una sola vez por plataforma (sesión compartida)
 * - Aplica a TODAS las ofertas pendientes en pipeline.md
 * - Llena formularios con reglas + IA (si ANTHROPIC_API_KEY está disponible)
 * - Genera reporte en data/applications-log.md
 *
 * Uso:
 *   node apply-auto.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const PROFILE_PATH    = 'config/profile.yml';
const CREDENTIALS_PATH = 'config/credentials.yml';
const PIPELINE_PATH   = 'data/pipeline.md';
const CV_PATH         = 'cv.md';
const RESULTS_PATH    = 'data/applications-log.md';

// ─── IA para formularios ───────────────────────────────────────────────────
async function askAI(question, cvContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Eres un asistente que ayuda a completar formularios de trabajo. Responde SOLO con el valor del campo, sin explicaciones ni comillas extra.\n\nCV del candidato:\n${cvContext}\n\nPregunta del formulario: ${question}`
        }]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

// ─── Inferencia básica de campos ───────────────────────────────────────────
function guessValue(name = '', placeholder = '', label = '', candidate = {}) {
  const k = `${name} ${placeholder} ${label}`.toLowerCase();
  if (/full.?name|nombre completo/.test(k)) return candidate.full_name || '';
  if (/first.?name|primer nombre/.test(k)) return (candidate.full_name || '').split(' ')[0] || '';
  if (/last.?name|apellido/.test(k))       return (candidate.full_name || '').split(' ').slice(1).join(' ') || '';
  if (/\bname\b|\bnombre\b/.test(k))       return candidate.full_name || '';
  if (/email|correo/.test(k))              return candidate.email || '';
  if (/phone|tel[eé]fono|celular|mobile/.test(k)) return candidate.phone || '';
  if (/location|ciudad|city|direcci[oó]n/.test(k)) return candidate.location || '';
  if (/linkedin/.test(k))                  return candidate.linkedin || '';
  if (/portfolio|website|\bweb\b|\burl\b/.test(k)) return candidate.portfolio_url || '';
  if (/github/.test(k))                    return candidate.github || '';
  if (/message|cover|motivaci[oó]n|por qu[eé]|carta/.test(k)) {
    const skills = candidate.skills?.join(', ') || 'desarrollo web y automatización';
    return `Estoy muy interesado en esta oportunidad. Mi experiencia en ${skills} me permite aportar valor desde el primer día.`;
  }
  return '';
}

// ─── Login Computrabajo ─────────────────────────────────────────────────────
async function loginComputrabajo(page, credentials, jobUrl) {
  console.log('\n[LOGIN CT] Iniciando...');

  // Navegar a la primera oferta para obtener el dropdown con el rfr correcto
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Verificar si ya está logueado
  const loggedIn = await page.$('[data-user-menu], .user_nav, span[data-user-name], .avatar_user');
  if (loggedIn) {
    console.log('[LOGIN CT] Ya estaba logueado ✓');
    return true;
  }

  // Clic en botón "Login" del header
  console.log('[LOGIN CT] Buscando botón Login...');
  const loginTrigger = await page.waitForSelector('span[data-login-button-desktop]', { timeout: 8000 }).catch(() => null);
  if (!loginTrigger) {
    console.log('[LOGIN CT] No se encontró span[data-login-button-desktop]');
    return false;
  }
  console.log('[LOGIN CT] Clic en Login...');
  await loginTrigger.click();
  await page.waitForTimeout(1200);

  // Clic en "Ingresar" del dropdown (tiene href con rfr=<encoded return url>)
  const ingresarBtn = await page.waitForSelector('span.js_login[data-access-menu], a.js_login[data-access-menu]', { timeout: 5000 }).catch(() => null);
  if (!ingresarBtn) {
    console.log('[LOGIN CT] No apareció el dropdown con Ingresar');
    return false;
  }
  const loginHref = await ingresarBtn.getAttribute('href');
  console.log(`[LOGIN CT] Navegando al login con rfr: ${loginHref?.slice(0, 80)}...`);
  await page.goto(loginHref, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Llenar email
  const emailField = await page.waitForSelector('input[name=Email], input[id=Email], input[type=email]', { timeout: 8000 }).catch(() => null);
  if (!emailField) {
    console.log('[LOGIN CT] No se encontró campo Email');
    return false;
  }
  console.log('[LOGIN CT] Llenando email...');
  await emailField.fill(credentials.computrabajo?.email || '');
  await page.waitForTimeout(500);

  // Algunos flujos muestran contraseña solo después de Continuar
  const continueBtn = await page.$('button:has-text("Continuar"), button:has-text("Siguiente")');
  if (continueBtn) {
    console.log('[LOGIN CT] Clic en Continuar...');
    await continueBtn.click();
    await page.waitForTimeout(1000);
  }

  // Llenar contraseña
  const passField = await page.waitForSelector('input[name=Password], input[id=password], input[type=password]', { timeout: 8000 }).catch(() => null);
  if (!passField) {
    console.log('[LOGIN CT] No se encontró campo Password');
    return false;
  }
  console.log('[LOGIN CT] Llenando contraseña...');
  await passField.fill(credentials.computrabajo?.password || '');
  await page.waitForTimeout(300);

  // Submit
  const submitBtn = await page.$('button[type=submit]');
  if (submitBtn) {
    console.log('[LOGIN CT] Clic en Iniciar sesión...');
    await submitBtn.click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  }

  const urlNow = page.url();
  console.log(`[LOGIN CT] URL tras login: ${urlNow}`);

  if (!urlNow.includes('/acceso/')) {
    console.log('[LOGIN CT] Login exitoso ✓');
    return true;
  }

  const errEl = await page.$('.error, .alert, [class*="error"], [class*="alert"]');
  if (errEl) {
    const txt = await errEl.textContent().catch(() => '');
    console.log(`[LOGIN CT] Error de login: ${txt.trim().slice(0, 100)}`);
  }
  return false;
}

// ─── Login LinkedIn ─────────────────────────────────────────────────────────
async function loginLinkedIn(page, credentials) {
  console.log('\n[LOGIN LI] Iniciando...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  const emailField = await page.$('input[name=session_key]');
  if (!emailField) {
    console.log('[LOGIN LI] Ya logueado ✓');
    return true;
  }
  await page.fill('input[name=session_key]', credentials.linkedin?.email || '');
  await page.fill('input[name=session_password]', credentials.linkedin?.password || '');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  console.log('[LOGIN LI] Login completado ✓');
  return true;
}

// ─── Botón de aplicar ───────────────────────────────────────────────────────
async function clickApplyButton(page, platform) {
  if (platform === 'computrabajo') {
    await page.waitForTimeout(2000);

    const elements = await page.$$eval(
      'a, button, span[data-href-offer-apply], span[data-href-access]',
      els => els.map(e => ({
        tag: e.tagName,
        text: (e.textContent || '').trim().slice(0, 60),
        href: e.getAttribute('href') || e.getAttribute('data-href-offer-apply') || e.getAttribute('data-href-access') || ''
      })).filter(e => e.text || e.href)
    ).catch(() => []);

    console.log('[APPLY CT] Elementos en la página:');
    elements.slice(0, 25).forEach(e => console.log(`  <${e.tag}> "${e.text}"  →  ${e.href.slice(0, 80)}`));

    const selectors = [
      'a[data-href-offer-apply]',
      'span[data-href-offer-apply]',
      'a:has-text("Postúlate")',
      'button:has-text("Postúlate")',
      'a:has-text("Postulate")',
      'span[data-href-access]',
      'a[href*="candidato.co.computrabajo.com"]',
    ];

    for (const sel of selectors) {
      const el = await page.$(sel).catch(() => null);
      if (!el) continue;

      const href = await el.getAttribute('href').catch(() => null)
        || await el.getAttribute('data-href-offer-apply').catch(() => null)
        || await el.getAttribute('data-href-access').catch(() => null);

      console.log(`[APPLY CT] Encontrado: ${sel}  href=${href?.slice(0, 80)}`);

      if (href && href.startsWith('http')) {
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        return true;
      }
      await el.click().catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      return true;
    }
    return false;
  }

  if (platform === 'linkedin') {
    const btn = await page.$('button:has-text("Easy Apply"), button.jobs-apply-button');
    if (btn) {
      await btn.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      return true;
    }
    return false;
  }

  return false;
}

// ─── Llenar formularios ─────────────────────────────────────────────────────
async function fillForm(page, candidate, cvContent) {
  const fields = await page.$$(
    'input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=submit]), textarea, select'
  ).catch(() => []);

  console.log(`[FORM] ${fields.length} campos encontrados`);
  const filled = [];

  for (const field of fields) {
    const name        = await field.getAttribute('name').catch(() => '') || '';
    const placeholder = await field.getAttribute('placeholder').catch(() => '') || '';
    const id          = await field.getAttribute('id').catch(() => '') || '';
    const tagName     = await field.evaluate(el => el.tagName.toLowerCase()).catch(() => 'input');

    let label = '';
    if (id) label = await page.$eval(`label[for="${id}"]`, el => el.textContent?.trim() || '').catch(() => '');
    if (!label) label = await field.evaluate(el =>
      el.closest('.field_input, .form-group, .input-row')?.querySelector('label')?.textContent?.trim()
      || el.previousElementSibling?.textContent?.trim() || ''
    ).catch(() => '');

    let value = guessValue(name, placeholder, label, candidate);

    if (!value && cvContent) {
      const question = label || placeholder || name;
      if (question && question.length > 3) {
        console.log(`[FORM/IA] Preguntando por campo: "${question}"`);
        value = await askAI(question, cvContent) || '';
        if (value) console.log(`[FORM/IA] Respuesta: "${value.slice(0, 80)}"`);
      }
    }

    if (!value) continue;

    if (tagName === 'select') {
      await field.selectOption({ label: value }).catch(() => {});
    } else {
      await field.fill(value).catch(() => {});
    }

    const fieldId = label || name || placeholder || id;
    filled.push(fieldId);
    console.log(`[FORM] "${fieldId}" = "${value.slice(0, 60)}"`);
  }

  return filled;
}

// ─── Submit y verificar ─────────────────────────────────────────────────────
async function submitAndVerify(page) {
  const submitSelectors = [
    'button:has-text("Enviar postulación")',
    'button:has-text("Postularme")',
    'button:has-text("Enviar")',
    'button:has-text("Submit application")',
    'button:has-text("Submit")',
    'button[type=submit]',
    'input[type=submit]',
  ];

  for (const sel of submitSelectors) {
    const btn = await page.$(sel).catch(() => null);
    if (!btn) continue;

    const text = await btn.textContent().catch(() => '');
    if (/iniciar|login|search|buscar/i.test(text)) continue;

    console.log(`[SUBMIT] Clic en: "${text.trim()}" (${sel})`);
    await btn.click();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const bodyText = await page.textContent('body').catch(() => '');
    const success = /postulado|aplicaste correctamente|application sent|successfully applied|gracias por postularte|ya diste el primer paso/i.test(bodyText);
    console.log(`[SUBMIT] URL: ${page.url()}`);
    console.log(`[SUBMIT] Éxito: ${success}`);
    return { submitted: true, success };
  }

  console.log('[SUBMIT] No se encontró botón de submit');
  return { submitted: false, success: false };
}

// ─── Ya aplicado ────────────────────────────────────────────────────────────
async function hasAlreadyApplied(page) {
  const text = await page.textContent('body').catch(() => '');
  return /ya te postulaste|ya aplicaste|already applied|postulado/i.test(text);
}

// ─── Parser pipeline ────────────────────────────────────────────────────────
function parsePipeline() {
  if (!existsSync(PIPELINE_PATH)) return [];
  const lines = readFileSync(PIPELINE_PATH, 'utf8').split(/\r?\n/);
  const jobs = [];

  for (const line of lines) {
    const match = line.match(/- \[ \] (https?:\/\/\S+)(?:\s*\|\s*([^|]+))?(?:\s*\|\s*([^|]+))?/);
    if (!match) continue;

    const url = match[1];
    const platform = url.includes('computrabajo.com') ? 'computrabajo'
      : url.includes('linkedin.com') ? 'linkedin'
      : null;

    if (!platform) {
      console.log(`[PIPELINE] Saltando (no soportada): ${url}`);
      continue;
    }

    jobs.push({ url, company: match[2]?.trim() || '', title: match[3]?.trim() || '', platform });
  }

  return jobs;
}

// ─── Reporte ────────────────────────────────────────────────────────────────
function saveReport(results) {
  const lines = ['# Application Submission Report', '', `Generated: ${new Date().toISOString()}`, ''];
  for (const r of results) {
    lines.push(`## ${r.company} — ${r.title}`);
    lines.push(`- URL: ${r.url}`);
    lines.push(`- Status: **${r.status}**`);
    lines.push(`- Timestamp: ${r.timestamp}`);
    lines.push('- Details:');
    for (const d of r.details) lines.push(`  - ${d}`);
    lines.push('');
  }
  const summary = {};
  for (const r of results) summary[r.status] = (summary[r.status] || 0) + 1;
  lines.push('## Summary');
  for (const [k, v] of Object.entries(summary)) lines.push(`- ${k}: ${v}`);
  writeFileSync(RESULTS_PATH, lines.join('\n'));
  console.log(`\nReporte guardado en ${RESULTS_PATH}`);
}

// ─── Browser factory ────────────────────────────────────────────────────────
async function createBrowser(locale = 'es-CO') {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--start-maximized'],
  });
  const context = await browser.newContext({
    viewport: null,
    locale,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-CO', 'es', 'en-US'] });
    window.navigator.chrome = { runtime: {} };
  });
  return { browser, page };
}

// ─── Procesar oferta ────────────────────────────────────────────────────────
async function processJob(page, job, candidate, cvContent) {
  const result = {
    url: job.url, company: job.company, title: job.title,
    status: 'pending', timestamp: new Date().toISOString(), details: [],
  };

  try {
    console.log(`\n[JOB] ${job.url}`);
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    console.log(`[JOB] URL actual: ${page.url()}`);

    if (await hasAlreadyApplied(page)) {
      result.status = 'already-applied';
      result.details.push('Ya aplicado previamente');
      console.log('[JOB] Ya aplicado, saltando');
      return result;
    }

    const clicked = await clickApplyButton(page, job.platform);
    if (!clicked) {
      result.status = 'no-apply-button';
      result.details.push('No se encontró botón de aplicar');
      return result;
    }

    result.details.push('Botón de aplicar clicado');
    console.log(`[JOB] URL tras click aplicar: ${page.url()}`);

    const filled = await fillForm(page, candidate, cvContent);
    if (filled.length > 0) result.details.push(`Formulario: ${filled.join(', ')}`);

    const { submitted, success } = await submitAndVerify(page);
    result.status = submitted ? (success ? 'success' : 'submitted-unverified') : 'form-not-submitted';
    result.details.push(submitted ? (success ? 'Aplicación confirmada ✓' : 'Enviado sin confirmación') : 'No se encontró submit');
  } catch (err) {
    result.status = 'error';
    result.details.push(`Error: ${err.message}`);
    console.log(`[ERROR] ${err.message}`);
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(PROFILE_PATH) || !existsSync(CREDENTIALS_PATH)) {
    console.error('Error: Falta config/profile.yml o config/credentials.yml');
    process.exit(1);
  }

  const profile     = yaml.load(readFileSync(PROFILE_PATH, 'utf8')) || {};
  const credentials = yaml.load(readFileSync(CREDENTIALS_PATH, 'utf8')) || {};
  const candidate   = profile.candidate || {};
  const cvContent   = existsSync(CV_PATH) ? readFileSync(CV_PATH, 'utf8') : '';
  const hasAI       = !!process.env.ANTHROPIC_API_KEY;

  console.log(`IA para formularios: ${hasAI ? 'ACTIVADA (ANTHROPIC_API_KEY)' : 'desactivada (agrega ANTHROPIC_API_KEY para activarla)'}`);

  const jobs = parsePipeline();
  if (!jobs.length) {
    console.log('No hay ofertas pendientes de Computrabajo o LinkedIn en pipeline.md');
    return;
  }

  const ctJobs = jobs.filter(j => j.platform === 'computrabajo');
  const liJobs = jobs.filter(j => j.platform === 'linkedin');

  console.log(`\nOfertas: ${ctJobs.length} Computrabajo | ${liJobs.length} LinkedIn`);
  ctJobs.forEach((j, i) => console.log(`  [CT${i+1}] ${j.title} — ${j.company}`));
  liJobs.forEach((j, i) => console.log(`  [LI${i+1}] ${j.title} — ${j.company}`));

  const results = [];

  // ── Computrabajo ──────────────────────────────────────────────────────────
  if (ctJobs.length > 0) {
    console.log('\n══════════════════════════════════════');
    console.log('  COMPUTRABAJO');
    console.log('══════════════════════════════════════');

    const { browser, page } = await createBrowser('es-CO');

    try {
      const loggedIn = await loginComputrabajo(page, credentials, ctJobs[0].url);

      if (!loggedIn) {
        console.log('[ERROR] Login fallido — abortando Computrabajo');
        for (const job of ctJobs) {
          results.push({ ...job, status: 'login-failed', timestamp: new Date().toISOString(), details: ['Login fallido'] });
        }
      } else {
        for (let i = 0; i < ctJobs.length; i++) {
          console.log(`\n── CT ${i+1}/${ctJobs.length}: ${ctJobs[i].title} ──`);
          const result = await processJob(page, ctJobs[i], candidate, cvContent);
          results.push(result);
          console.log(`   → ${result.status}`);
        }
      }
    } finally {
      await browser.close();
    }
  }

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  if (liJobs.length > 0) {
    console.log('\n══════════════════════════════════════');
    console.log('  LINKEDIN');
    console.log('══════════════════════════════════════');

    const { browser, page } = await createBrowser('es-CO');

    try {
      const loggedIn = await loginLinkedIn(page, credentials);

      if (!loggedIn) {
        console.log('[ERROR] Login fallido — abortando LinkedIn');
        for (const job of liJobs) {
          results.push({ ...job, status: 'login-failed', timestamp: new Date().toISOString(), details: ['Login fallido'] });
        }
      } else {
        for (let i = 0; i < liJobs.length; i++) {
          console.log(`\n── LI ${i+1}/${liJobs.length}: ${liJobs[i].title} ──`);
          const result = await processJob(page, liJobs[i], candidate, cvContent);
          results.push(result);
          console.log(`   → ${result.status}`);
        }
      }
    } finally {
      await browser.close();
    }
  }

  saveReport(results);

  const ok      = results.filter(r => r.status === 'success').length;
  const skipped = results.filter(r => r.status === 'already-applied').length;
  const fail    = results.filter(r => !['success', 'already-applied'].includes(r.status)).length;
  console.log(`\n✓ ${ok} exitosas | ${skipped} ya aplicado | ${fail} fallidas`);
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
