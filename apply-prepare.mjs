#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const PROFILE_PATH = 'config/profile.yml';
const CREDENTIALS_PATH = 'config/credentials.yml';
const PIPELINE_PATH = 'data/pipeline.md';
const REPORT_PATH = 'data/apply-preparation-report.md';

if (!existsSync(PROFILE_PATH)) {
  console.error('Error: config/profile.yml no encontrado.');
  process.exit(1);
}

if (!existsSync(PIPELINE_PATH)) {
  console.error('Error: data/pipeline.md no encontrado.');
  process.exit(1);
}

const profile = yaml.load(readFileSync(PROFILE_PATH, 'utf8')) || {};
const credentials = existsSync(CREDENTIALS_PATH)
  ? yaml.load(readFileSync(CREDENTIALS_PATH, 'utf8')) || {}
  : {};

const candidate = profile.candidate || {};
const narrative = profile.narrative || {};

function parsePipeline() {
  const content = readFileSync(PIPELINE_PATH, 'utf8');
  const lines = content.split(/\r?\n/);
  const jobs = [];

  for (const line of lines) {
    const match = line.match(/- \[ \] (https?:\/\/\S+)(?: \| ([^|]+) \| ([^|]+))?/);
    if (match) {
      jobs.push({ url: match[1], company: match[2]?.trim() || '', title: match[3]?.trim() || '' });
    }
  }

  return jobs;
}

function guessValue(name = '', placeholder = '', label = '') {
  const key = `${name} ${placeholder} ${label}`.toLowerCase();
  if (/name|nombre/.test(key)) return candidate.full_name || '';
  if (/email/.test(key)) return candidate.email || '';
  if (/phone|tel[eé]fono|celular|mobile/.test(key)) return candidate.phone || '';
  if (/location|ciudad|city|address|direcci[oó]n/.test(key)) return candidate.location || '';
  if (/linkedin/.test(key)) return candidate.linkedin || '';
  if (/portfolio|website|web|url/.test(key)) return candidate.portfolio_url || '';
  if (/github/.test(key)) return candidate.github || '';
  if (/twitter|x.com/.test(key)) return candidate.twitter || '';
  if (/message|cover|motivation|motivaci[oó]n|por qu[eé]/.test(key)) {
    return narrative.exit_story || `Estoy interesado en esta oportunidad porque se alinea con mi experiencia en desarrollo full stack y automatización.`;
  }
  if (/question|comment|commentary|comentario/.test(key)) {
    return narrative.exit_story || '';
  }
  return '';
}

async function loginIfNeeded(page, url) {
  const host = new URL(url).hostname;
  if (host.includes('linkedin.com')) {
    const creds = credentials.linkedin || {};
    if (!creds.email || !creds.password) return { loggedIn: false, note: 'No hay credenciales de LinkedIn configuradas.' };
    const title = await page.title();
    if (/Sign in|Iniciar sesi[oó]n|Entrar/.test(title) || /login/.test(page.url())) {
      await page.fill('input[name=session_key]', creds.email).catch(() => {});
      await page.fill('input[name=session_password]', creds.password).catch(() => {});
      await page.click('button[type=submit]').catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      return { loggedIn: true, note: 'Intento de login en LinkedIn ejecutado (sin garantía).' };
    }
  }

  if (host.includes('computrabajo.com')) {
    const creds = credentials.computrabajo || {};
    if (!creds.email || !creds.password) return { loggedIn: false, note: 'No hay credenciales de Computrabajo configuradas.' };
    if (await page.$('input[name=email]') && await page.$('input[name=password]')) {
      await page.fill('input[name=email]', creds.email).catch(() => {});
      await page.fill('input[name=password]', creds.password).catch(() => {});
      await page.click('button[type=submit]').catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      return { loggedIn: true, note: 'Intento de login en Computrabajo ejecutado (sin garantía).' };
    }
  }

  return { loggedIn: false, note: 'No se intentó login para esta página.' };
}

async function processJob(job) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const result = {
    url: job.url,
    company: job.company,
    title: job.title,
    status: 'pendiente',
    notes: [],
    fields: [],
  };

  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const pageUrl = page.url();
    if (pageUrl.includes('login') || pageUrl.includes('signin') || /iniciar sesi[oó]n/i.test(await page.title())) {
      const loginInfo = await loginIfNeeded(page, job.url);
      result.notes.push(loginInfo.note);
    }

    let formFields = await page.$$('input[name], textarea[name], select[name]');
    if (!formFields.length) {
      const applySelectors = [
        'button:has-text("Postúlate")',
        'button:has-text("Postúlate gratis")',
        'button:has-text("Aplicar")',
        'button:has-text("Apply")',
        'a:has-text("Postúlate")',
        'a:has-text("Aplicar")',
        'a:has-text("Apply")',
        'span[data-href-offer-apply]',
        'span[data-apply-link]',
        'span[offer-detail-button]'
      ];

      for (const selector of applySelectors) {
        const button = await page.$(selector);
        if (button) {
          result.notes.push(`Se encontró botón de aplicación: ${selector}. Intentando abrir formulario...`);
          const applyHref = await button.getAttribute('data-href-offer-apply') || await button.getAttribute('data-apply-link') || await button.getAttribute('data-href-access');
          if (applyHref && applyHref.startsWith('http')) {
            await page.goto(applyHref, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
          } else {
            await button.click().catch(() => {});
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          }
          formFields = await page.$$('input[name], textarea[name], select[name]');
          break;
        }
      }
    }

    if (!formFields.length) {
      result.status = 'no-form';
      result.notes.push('No se encontró un formulario de aplicación visible.');
    } else {
      result.status = 'form-detected';
      for (const field of formFields) {
        const name = (await field.getAttribute('name')) || '';
        const placeholder = (await field.getAttribute('placeholder')) || '';
        const type = (await field.getAttribute('type')) || 'text';
        const value = guessValue(name, placeholder, job.title);
        result.fields.push({ name, placeholder, type, value: value ? 'auto-filled' : 'skipped' });
        if (value && type !== 'file' && type !== 'checkbox' && type !== 'radio') {
          await field.fill(value).catch(() => {});
        }
      }
    }

    const applyButton = await page.$('button:has-text("Aplicar"), button:has-text("Apply"), input[type=submit]');
    result.notes.push(applyButton ? 'Botón de aplicación detectado, no se hizo submit.' : 'No se detectó botón de envío claro.');
  } catch (error) {
    result.status = 'error';
    result.notes.push(`Error al procesar: ${error.message}`);
  } finally {
    await browser.close();
  }

  return result;
}

function buildReport(results) {
  const lines = ['# Reporte de preparación de aplicaciones', '', `Fecha: ${new Date().toISOString()}`, ''];
  for (const job of results) {
    lines.push(`## ${job.company} — ${job.title}`);
    lines.push(`- URL: ${job.url}`);
    lines.push(`- Estado: ${job.status}`);
    if (job.notes.length) {
      lines.push('- Notas:');
      for (const note of job.notes) lines.push(`  - ${note}`);
    }
    if (job.fields.length) {
      lines.push('- Campos detectados:');
      for (const field of job.fields) {
        lines.push(`  - \`${field.name}\` (${field.type}): ${field.value}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const jobs = parsePipeline();
  if (!jobs.length) {
    console.error('No hay ofertas pendientes en data/pipeline.md.');
    process.exit(0);
  }

  const supportedJobs = jobs.filter(job => job.url.includes('computrabajo.com') || job.url.includes('linkedin.com'));
  if (!supportedJobs.length) {
    console.log('No se encontraron ofertas de Computrabajo o LinkedIn en pipeline.');
    process.exit(0);
  }

  const results = [];
  for (const job of supportedJobs) {
    console.log(`Procesando: ${job.url}`);
    const result = await processJob(job);
    results.push(result);
  }

  writeFileSync(REPORT_PATH, buildReport(results), 'utf8');
  console.log(`Reporte generado en ${REPORT_PATH}`);
}

main();