#!/usr/bin/env node
/**
 * apply-linkedin.mjs — LinkedIn Easy Apply Pipeline
 *
 * Flujo:
 *  1. Login en LinkedIn con credenciales de config/credentials.yml
 *  2. Búsqueda por keywords (Easy Apply + Última semana) con scroll
 *  3. Recopilar y deduplicar ofertas relevantes entre todos los keywords
 *  4. Por cada oferta nueva (hasta MAX_NEW_APPS):
 *     a. Navegar a la oferta
 *     b. Clic en "Solicitud sencilla"
 *     c. Rellenar modal: contacto → CV → preguntas → revisar → enviar
 *  5. Registro en data/li-applied.json
 *  6. Informe final
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const CREDENTIALS_PATH = 'config/credentials.yml';
const PROFILE_PATH     = 'config/profile.yml';
const CV_PATH          = 'cv.md';
const LI_APPLIED_PATH  = 'data/li-applied.json';

// Límite de nuevas aplicaciones por ejecución
const MAX_NEW_APPS = 10;

// ── Keywords (mismas búsquedas que Computrabajo, adaptadas a texto) ──────────
const SEARCH_KEYWORDS = [
  'desarrollador junior',
  'desarrollador web',
  'desarrollador fullstack',
  'desarrollador backend',
  'desarrollador frontend',
  'desarrollador javascript',
  'desarrollador nodejs',
  'desarrollador angular',
  'desarrollador react',
  'desarrollador de software',
  'programador junior',
  'analista programador',
  'desarrollador python',
  'automatizacion rpa',
];

const LOCATION         = 'Bogotá, Colombia';
const LOCATION_ENCODED = 'Bogot%C3%A1%2C+Colombia';

// f_LF=f_AL  → Solicitud sencilla (Easy Apply)
// f_TPR=r86400   → Últimas 24 horas
// f_TPR=r604800  → Última semana (604800 seg = 7 días)
// f_TPR=r2592000 → Último mes
// Se usan ambos filtros (24h + semana) para maximizar cobertura sin repetir ofertas
const TIME_FILTERS = ['r86400', 'r604800'];

// ──────────────────────────────────────────────────────────────────────────────
// Browser (anti-detección idéntico a apply-auto.mjs)
// ──────────────────────────────────────────────────────────────────────────────
async function createBrowser() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--start-maximized'],
  });
  const context = await browser.newContext({
    viewport: null,
    locale: 'es-CO',
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

async function snap(page, name) {
  try {
    await page.screenshot({ path: `debug-li-${name}.png`, fullPage: false });
    console.log(`    [DEBUG] Screenshot: debug-li-${name}.png`);
  } catch {}
}

// ──────────────────────────────────────────────────────────────────────────────
// IA (cadena: Anthropic → OpenAI → Gemini → Ollama)
// ──────────────────────────────────────────────────────────────────────────────
async function askAI(prompt, cvContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const r = await askAIOpenAI(prompt, cvContext) ?? await askAIGemini(prompt, cvContext) ?? await askAILocal(prompt, cvContext);
    return r;
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [{ role: 'user', content:
          `Eres un asistente que completa formularios de empleo en Colombia. Responde SOLO con el valor del campo, sin comillas ni explicaciones.\n\nCV:\n${cvContext.slice(0, 2500)}\n\nCampo: ${prompt}`
        }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim() || null;
    if (text) console.log(`    [IA-ANT] "${prompt.slice(0, 45)}" → "${text.slice(0, 60)}"`);
    return text;
  } catch { /* fall through */ }
  return await askAIOpenAI(prompt, cvContext) ?? await askAIGemini(prompt, cvContext) ?? await askAILocal(prompt, cvContext);
}

// Pide a la IA solo un índice numérico (para selects múltiples)
async function askAIRaw(prompt) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 10, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text?.trim() || null;
      if (text) console.log(`    [IA-RAW-ANT] → "${text}"`);
      return text;
    } catch { /* continúa */ }
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 10, temperature: 0.1, messages: [{ role: 'user', content: prompt }] }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim() || null;
        if (text) { console.log(`    [IA-RAW-OAI] → "${text}"`); return text; }
      }
    } catch { /* continúa */ }
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 10, temperature: 0.1 } }) }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
        if (text) { console.log(`    [IA-RAW-GEM] → "${text}"`); return text; }
      }
    } catch { /* continúa */ }
  }
  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mistral', prompt, stream: false, options: { num_predict: 10, temperature: 0.1 } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.response?.trim() || null;
  } catch { return null; }
}

async function askAIOpenAI(prompt, cvContext) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 300, temperature: 0.2,
        messages: [
          { role: 'system', content: 'Eres un asistente que completa formularios de empleo en Colombia. Responde SOLO con el valor del campo, sin comillas ni explicaciones. Máximo 300 caracteres.' },
          { role: 'user', content: `CV:\n${cvContext.slice(0, 2500)}\n\nCampo: ${prompt}\n\nRespuesta:` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    if (text) console.log(`    [IA-OAI] "${prompt.slice(0, 45)}" → "${text.slice(0, 60)}"`);
    return text;
  } catch { return null; }
}

async function askAIGemini(prompt, cvContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text:
          `Eres un asistente que completa formularios de empleo en Colombia. Responde SOLO con el valor del campo, sin comillas ni explicaciones.\n\nCV:\n${cvContext.slice(0, 2500)}\n\nCampo: ${prompt}\n\nRespuesta:`
        }] }], generationConfig: { maxOutputTokens: 300, temperature: 0.2 } }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    if (text) console.log(`    [IA-GEM] "${prompt.slice(0, 45)}" → "${text.slice(0, 60)}"`);
    return text;
  } catch { return null; }
}

async function askAILocal(prompt, cvContext) {
  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral',
        prompt: `Eres un asistente que completa formularios de empleo en Colombia. Responde SOLO con el valor del campo, sin comillas ni explicaciones.\n\nCV:\n${cvContext.slice(0, 2000)}\n\nCampo: ${prompt}\n\nRespuesta:`,
        stream: false, options: { num_predict: 200, temperature: 0.3 },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.response?.trim() || null;
  } catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Login LinkedIn
// ──────────────────────────────────────────────────────────────────────────────
async function loginLinkedIn(page, credentials) {
  console.log('\n╔══ LOGIN LINKEDIN ═══════════════════════════════════');

  // ── PASO 1: Navegar a login ───────────────────────────────────────────────
  console.log('[PASO 1] Navegando a https://www.linkedin.com/login');
  await page.goto('https://www.linkedin.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2000);
  await snap(page, '01-llegada');

  const urlInicial = page.url();
  if (!urlInicial.includes('/login') && !urlInicial.includes('/checkpoint')) {
    console.log('[PASO 1] ✓ Sesión ya activa — saltando login');
    return true;
  }

  // ── PASO 2: Llenar email ──────────────────────────────────────────────────
  console.log('[PASO 2] Llenando email...');

  // Esperar a que cualquier input de texto aparezca (LinkedIn usa React IDs dinámicos)
  const emailSelectors = [
    'input[name="session_key"]',
    'input[id="username"]',
    'input[autocomplete="username"]',
    'input[autocomplete="email"]',
    'input[type="email"]',
  ];

  let emailField = null;
  for (const sel of emailSelectors) {
    emailField = await page.waitForSelector(sel, { state: 'visible', timeout: 3000 }).catch(() => null);
    if (emailField) {
      console.log(`  [PASO 2] Campo email encontrado: ${sel}`);
      break;
    }
  }

  // Fallback: primer input tipo text visible (React IDs dinámicos)
  if (!emailField) {
    emailField = await page.waitForSelector('input[type="text"]', { state: 'visible', timeout: 5000 }).catch(() => null);
    if (emailField) console.log('  [PASO 2] Campo email encontrado: input[type="text"] (fallback)');
  }

  // Fallback final: primer textbox del form de login
  if (!emailField) {
    emailField = await page.locator('form input[type="text"], form input:not([type="password"]):not([type="checkbox"])').first().elementHandle().catch(() => null);
    if (emailField) console.log('  [PASO 2] Campo email encontrado: form textbox (fallback final)');
  }

  if (!emailField) {
    console.log('  [ERROR] No se encontró campo email');
    const inputs = await page
      .$$eval('input', els =>
        els.map(e => ({ type: e.type, name: e.name, id: e.id, placeholder: e.placeholder }))
      )
      .catch(() => []);
    console.log('  [DIAGNÓSTICO] Inputs en página:', JSON.stringify(inputs));
    await snap(page, '02-sin-email');
    return false;
  }

  await emailField.fill(credentials.linkedin?.email || '');
  console.log(`  [PASO 2] Email: ${(credentials.linkedin?.email || '').slice(0, 20)}...`);

  // ── PASO 3: Llenar contraseña ─────────────────────────────────────────────
  console.log('[PASO 3] Llenando contraseña...');

  let passField = await page.waitForSelector('input[name="session_password"]', { state: 'visible', timeout: 3000 }).catch(() => null)
    || await page.waitForSelector('input[id="password"]', { state: 'visible', timeout: 3000 }).catch(() => null)
    || await page.waitForSelector('input[type="password"]', { state: 'visible', timeout: 5000 }).catch(() => null);

  if (!passField) {
    console.log('  [ERROR] No se encontró campo password');
    await snap(page, '03-sin-password');
    return false;
  }

  await passField.fill(credentials.linkedin?.password || '');
  console.log(`  [PASO 3] Password: ${(credentials.linkedin?.password || '').length} caracteres ✓`);

  await snap(page, '04-formulario-llenado');

  // ── PASO 4: Clic en submit ────────────────────────────────────────────────
  console.log('[PASO 4] Clic en "Iniciar sesión"...');
  const navPromise = page
    .waitForNavigation({ timeout: 20000, waitUntil: 'networkidle' })
    .catch(() => null);
  await page.click('button[type="submit"]');
  await navPromise;
  await page.waitForTimeout(3000);

  await snap(page, '05-tras-submit');
  const urlFinal = page.url();
  console.log(`  [PASO 4] URL tras submit: ${urlFinal.slice(0, 80)}`);

  // ── PASO 5: Verificar resultado ───────────────────────────────────────────
  if (urlFinal.includes('/login') || urlFinal.includes('/checkpoint')) {
    const bodyText = await page.textContent('body').catch(() => '');
    console.log(`  [ERROR] Sigue en login/checkpoint — URL: ${urlFinal}`);

    if (/verify|verificar|captcha|security|phone|email.*code/i.test(bodyText)) {
      console.log('');
      console.log('  ╔══════════════════════════════════════════════════╗');
      console.log('  ║  ATENCIÓN: LinkedIn pidió verificación            ║');
      console.log('  ║  Completa la verificación en el navegador.        ║');
      console.log('  ║  Esperando 60 segundos...                         ║');
      console.log('  ╚══════════════════════════════════════════════════╝');
      await page.waitForTimeout(60000);

      if (!page.url().includes('/login') && !page.url().includes('/checkpoint')) {
        console.log('  ✓ Verificación completada manualmente');
        console.log('╚══ LOGIN LI EXITOSO ✓ (verificación manual) ════════\n');
        return true;
      }
    }
    return false;
  }

  console.log('╚══ LOGIN LI EXITOSO ✓ ═══════════════════════════════\n');
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Filtro de relevancia por título (equivalente a isDevJobUrl de CT)
// ──────────────────────────────────────────────────────────────────────────────
function isDevJobTitle(title) {
  const t = title.toLowerCase();

  // Rechazar roles que NO son desarrollo de software
  const reject = [
    'vendedor', 'ventas', 'ejecutivo comercial', 'asesor comercial',
    'asesor/', 'asesor ',                       // asesor/a, asesor de...
    'comercio digital', 'ventas digitales',
    'abogado', 'jurídico', 'juridico',
    'enfermero', 'médico', 'medico', 'psicólogo', 'psicologo',
    'cocinero', 'chef', 'mesero', 'cajero',
    'contador', 'contable', 'auxiliar contable', 'auxiliar financiero',
    'promotor', 'agente comercial', 'agente de ventas',
    'community manager', 'diseñador gráfico', 'diseñador grafico',
    'conductor', 'mensajero', 'domiciliario',
    'recruiter', 'reclutador',                 // staffing recruiters
    'program manager', 'project manager',
    'tutor',                                   // "abogado tutor"
    // Nivel senior (candidato es junior)
    'senior ', ' senior', '-senior', 'semi-senior', 'semi senior', 'semisenior',
    'tech lead', 'technical lead', 'líder técnico', 'lider tecnico',
    'arquitecto', 'architect',
    // Stacks incompatibles
    'java ', ' java,', 'spring boot', 'php ', 'laravel',
    'ruby', 'kotlin', 'swift ', 'flutter',
    'sap ', 'salesforce', 'power bi',
  ];
  if (reject.some(kw => t.includes(kw))) return false;
  // Rechazar stacks incompatibles con regex (captura variantes con coma, paréntesis, /)
  if (/\.net\b|c#/i.test(t)) return false;

  // Aceptar roles de desarrollo / TI
  // NOTA: sin QA testing, sin iOS/Android — el candidato es desarrollador web Full Stack JS
  const accept = [
    'desarrollador', 'developer',
    'programador', 'programmer',
    'fullstack', 'full stack', 'full-stack',
    'frontend', 'front end', 'front-end',
    'backend', 'back end', 'back-end',
    'software engineer', 'ingeniero de software', 'ingeniero software',
    'analista de sistemas', 'analista programador', 'analista desarrollador',
    'devops',
    'automatizacion', 'automatización', 'rpa',
    'machine learning', 'inteligencia artificial',
  ];
  return accept.some(kw => t.includes(kw));
}

// ──────────────────────────────────────────────────────────────────────────────
// Buscar en LinkedIn Jobs con filtros
// ──────────────────────────────────────────────────────────────────────────────
async function searchLinkedInJobs(page, keyword, timeFilter = 'r604800') {
  const kwEncoded = encodeURIComponent(keyword);

  // URL con todos los filtros preconfigurados:
  //   f_LF=f_AL   → Solicitud sencilla (Easy Apply)
  //   f_TPR=rN    → Filtro de tiempo
  //   sortBy=DD   → Ordenar por fecha (más reciente primero)
  const searchUrl = [
    'https://www.linkedin.com/jobs/search/',
    `?keywords=${kwEncoded}`,
    `&location=${LOCATION_ENCODED}`,
    '&f_LF=f_AL',
    `&f_TPR=${timeFilter}`,
    '&sortBy=DD',
  ].join('');

  console.log(`\n─── Buscando: "${keyword}" ─────────────────────────────`);
  console.log(`  URL: ${searchUrl}`);

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const currentUrl = page.url();

  // Verificar sesión activa
  if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
    console.log('  [ERROR] Redirigido a login — sesión expirada');
    return { keyword, count: 0, jobs: [], status: 'session-expired', url: currentUrl };
  }

  // Esperar resultados
  await page
    .waitForSelector(
      '[data-occludable-job-id], .job-card-container, .jobs-search__results-list li',
      { timeout: 8000 }
    )
    .catch(() => {});
  // Scroll para cargar más tarjetas (~150 ofertas)
  for (let s = 0; s < 6; s++) {
    if (page.isClosed()) return { keyword, count: 0, jobs: [], status: 'page-closed', url: '' };
    await page.evaluate(() => {
      const list = document.querySelector(
        '.jobs-search-results-list, .scaffold-layout__list-container, ul.jobs-search-results__list'
      );
      if (list) list.scrollTo(0, list.scrollHeight);
      else window.scrollTo(0, document.body.scrollHeight);
    }).catch(() => {});
    await page.waitForTimeout(2000).catch(() => {});
  }
  // ── Contar ofertas ─────────────────────────────────────────────────────────
  const jobCount = await page
    .evaluate(() => {
      // 1. Buscar texto tipo "123 resultados"
      const subtitleSels = [
        '.jobs-search-results-list__subtitle',
        'h1[class*="results-context"]',
        '[data-test-search-results-count]',
        '.jobs-search-results__total-results',
        '.results-context-header__context',
      ];
      for (const sel of subtitleSels) {
        const el = document.querySelector(sel);
        if (el) {
          const m = el.textContent?.match(/([\d,.]+)/);
          if (m) return parseInt(m[1].replace(/[,.]/g, ''), 10);
        }
      }
      // 2. Contar tarjetas individuales
      const cards = document.querySelectorAll(
        '[data-occludable-job-id], .job-card-container, .jobs-search__results-list li'
      );
      return cards.length;
    })
    .catch(() => 0);

  // ── Verificar filtros activos ──────────────────────────────────────────────
  const activeFilters = await page
    .evaluate(() => {
      const sels = [
        '.search-reusables__filter-pill-button',
        'button[aria-label*="Quitar filtro"]',
        'button[aria-label*="Remove filter"]',
        '.artdeco-pill--selected',
        '[class*="filter-pill"][aria-pressed="true"]',
      ];
      const texts = new Set();
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach(el => {
          const t = el.textContent?.trim();
          if (t && t.length > 1 && t.length < 50) texts.add(t);
        });
      }
      return [...texts];
    })
    .catch(() => []);

  // ── Extraer y deduplicar ofertas por data-occludable-job-id ─────────────
  const rawJobs = await page
    .evaluate(() => {
      const seen = new Set();
      // LinkedIn renderiza cada card dos veces (virtual scroll) → deduplicar por ID
      const cards = [...document.querySelectorAll('[data-occludable-job-id]')].filter(card => {
        const id = card.getAttribute('data-occludable-job-id');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      return cards.slice(0, 75).map(card => {
        const jobId  = card.getAttribute('data-occludable-job-id');
        const linkEl = card.querySelector('a[href*="/jobs/view/"]');
        const titleEl = card.querySelector(
          '.job-card-list__title, .job-card-container__link'
        );

        // aria-label del link contiene el título limpio sin duplicación de texto
        let title = linkEl?.getAttribute('aria-label')?.trim() || '';
        if (!title) {
          // Fallback: <strong> interno o primer nodo de texto
          const strong = titleEl?.querySelector('strong');
          title = strong?.textContent?.trim()
            || (titleEl?.childNodes?.[0]?.nodeType === 3
                ? titleEl.childNodes[0].textContent?.trim()
                : '')
            || titleEl?.textContent?.trim()
            || '?';
        }

        const companyEl = card.querySelector(
          '.job-card-container__company-name, .artdeco-entity-lockup__subtitle'
        );
        const easyApplyEl = card.querySelector(
          '.job-card-container__easy-apply-label, [aria-label*="sencilla"], [aria-label*="Easy Apply"]'
        );

        return {
          title: title.replace(/\s+/g, ' ').trim(),
          company: companyEl?.textContent?.trim().replace(/\s+/g, ' ') || '?',
          jobId,
          easyApply: !!easyApplyEl,
          url: linkEl?.href || '',
        };
      });
    })
    .catch(() => []);

  // ── Filtrar por relevancia de título ──────────────────────────────────────
  const jobs = rawJobs.filter(j => isDevJobTitle(j.title));
  const filteredOut = rawJobs.length - jobs.length;

  // ── Log de resultados ─────────────────────────────────────────────────────
  console.log(`  Ofertas totales    : ${jobCount}`);
  console.log(`  Cards visibles     : ${rawJobs.length} únicos → ${jobs.length} relevantes (${filteredOut} filtradas)`);
  if (activeFilters.length > 0) {
    console.log(`  Filtros activos    : ${activeFilters.slice(0, 6).join(' | ')}`);
  } else {
    console.log('  Filtros activos    : (verificar en navegador — IDs dinámicos)');
  }

  if (jobs.length > 0) {
    console.log(`  Primeras ${Math.min(jobs.length, 10)} relevantes:`);
    jobs.slice(0, 10).forEach((j, i) =>
      console.log(
        `    [${i + 1}] ${j.title} — ${j.company}${j.easyApply ? ' ✓ ES' : ''}`
      )
    );
  } else if (rawJobs.length > 0) {
    console.log('  (todas las cards visibles fueron filtradas — verificar isDevJobTitle)');
    rawJobs.slice(0, 10).forEach((j, i) =>
      console.log(`    [F${i + 1}] ${j.title} — ${j.company}`)
    );
  } else {
    console.log('  (sin ofertas visibles en pantalla)');
  }

  await snap(page, `busq-${keyword.replace(/\s+/g, '-').slice(0, 25)}`);

  return { keyword, count: jobCount, jobs, status: 'ok', url: currentUrl };
}

// ──────────────────────────────────────────────────────────────────────────────
// Registro de aplicaciones LinkedIn (data/li-applied.json)
// ──────────────────────────────────────────────────────────────────────────────
function loadApplied() {
  if (!existsSync(LI_APPLIED_PATH)) return {};
  try { return JSON.parse(readFileSync(LI_APPLIED_PATH, 'utf8')); } catch { return {}; }
}

function saveApplied(data) {
  writeFileSync(LI_APPLIED_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ──────────────────────────────────────────────────────────────────────────────
// Paso 1 del modal: Información de contacto
// ──────────────────────────────────────────────────────────────────────────────
async function fillContactInfo(page, credentials, profile) {
  const selects = await page
    .$$('.jobs-easy-apply-modal [data-test-text-entity-list-form-component] select')
    .catch(() => []);

  for (const sel of selects) {
    const currentVal = await sel.inputValue().catch(() => '');
    if (currentVal && currentVal !== 'Selecciona una opción') continue;

    const options = await sel
      .$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.textContent?.trim() || '' })))
      .catch(() => []);

    // Email dropdown
    if (options.some(o => o.value?.includes('@'))) {
      const email = credentials.linkedin?.email || profile?.email || '';
      const target = options.find(o => o.value === email) || options.find(o => o.value?.includes('@'));
      if (target) {
        await sel.selectOption(target.value);
        console.log(`    Email: ${target.value.slice(0, 30)}`);
      }
      continue;
    }

    // Country code
    if (options.some(o => o.text?.includes('Colombia'))) {
      const col = options.find(o => o.text?.includes('Colombia'));
      if (col) {
        await sel.selectOption(col.value);
        console.log(`    País: ${col.text}`);
      }
      continue;
    }
  }

  // Teléfono — solo si está vacío
  const phoneInputs = await page
    .$$('.jobs-easy-apply-modal input[id*="phoneNumber-nationalNumber"]')
    .catch(() => []);
  for (const inp of phoneInputs) {
    const val = await inp.inputValue().catch(() => '');
    if (!val) {
      const raw = (profile?.phone || '3143663821').replace(/^\+57\s*/, '').replace(/\s/g, '');
      await inp.fill(raw);
      console.log(`    Teléfono: ${raw}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Diccionario de respuestas — idéntico al de Computrabajo (apply-auto.mjs)
// Recibe el label de la pregunta y el perfil; devuelve la respuesta o ''
// ──────────────────────────────────────────────────────────────────────────────
function guessAnswerByLabel(label, profile, cvText) {
  const q = label.toLowerCase();
  const cvName = profile?.full_name || 'Cristian Camilo Montes Teheran';
  const cvLocation = profile?.location || 'Bogotá DC, Colombia';
  const skills = 'JavaScript, TypeScript, Node.js, Angular, React, NestJS, MySQL, n8n';
  const salary = profile?.salary_aspiration_cop || '2500000';

  // Detectar si la pregunta está en inglés (heurística simple)
  const isEn = /\b(how|what|do you|have you|years|please|describe|tell|experience with|are you|can you|your)\b/i.test(q);

  // ── Datos de contacto ────────────────────────────────────────────────────
  if (/full.?name|nombre completo|nombres y apellidos/.test(q))  return cvName;
  if (/first.?name|primer.?nombre/.test(q)) return cvName.split(' ')[0] || '';
  if (/last.?name|apellido/.test(q))        return cvName.split(' ').slice(1).join(' ');
  if (/\bname\b|\bnombre\b/.test(q))        return cvName;
  if (/email|correo/.test(q))               return profile?.email || '';
  if (/phone|tel[eé]fono|celular|mobile|whatsapp|n[uú]mero de contacto/.test(q)) return profile?.phone || '';
  if (/location|ciudad|city|municipio|reside|d[oó]nde vive|localidad|barrio|ubicaci[oó]n/.test(q)) return cvLocation;
  if (/linkedin/.test(q))                   return profile?.linkedin || '';
  if (/portfolio|website|sitio.?web|p[aá]gina.?web|url.?web/.test(q)) return profile?.portfolio_url || '';
  if (/github/.test(q))                     return 'https://github.com/camilomont';

  // ── Salario ──────────────────────────────────────────────────────────────
  if (/aspiraci[oó]n salarial|salario esperado|pretens|expectativa salarial|salary expectation|expected salary|desired salary/i.test(q))
    return isEn ? '2500000' : `Entre $2.000.000 y $3.000.000 COP mensuales.`;
  if (/de acuerdo.*asignaci[oó]n|acuerdo.*salario|salario.*conforme|conforme.*salario|salary.*agree|agree.*salary/i.test(q))
    return isEn ? 'Yes, I agree with the offered salary.' : 'Sí, estoy de acuerdo con la asignación salarial ofrecida.';
  if (/[uú]ltimo salario|salario mensual|salario actual|current salary/i.test(q))
    return salary;  // número puro — campo suele ser numérico
  // Campo numérico puro de salario (LinkedIn a veces es solo un número)
  if (/salario|sueldo|salary|compensation|remuner/i.test(q)) return salary;

  // ── Disponibilidad / acuerdo ─────────────────────────────────────────────
  if (/disponibilidad|horario|turno|availability|start date/i.test(q))
    return isEn ? 'Immediate availability, full-time.' : 'Disponibilidad inmediata para jornada completa.';
  if (/de acuerdo|acuerdo con (la |el |esta |este )|aceptas (la |el )|acepta (la |el )/i.test(q))
    return 'Sí, estoy de acuerdo con las condiciones de la oferta.';
  if (/condiciones solicitadas|condiciones del cargo|requisitos solicitados|cuentas con las condiciones/i.test(q))
    return 'Sí, cuento con las condiciones solicitadas y tengo disponibilidad inmediata.';
  if (/tipo de contrato|modalidad de contrato|contract type/i.test(q))
    return 'Contrato a término fijo.';

  // ── Educación ────────────────────────────────────────────────────────────
  if (/nivel acad[eé]mico|estudios|formaci[oó]n|t[ií]tulo|qu[eé] estudiaste|education level|highest.*education/i.test(q))
    return 'Tecnólogo en Análisis y Desarrollo de Software — SENA 2024. Formación complementaria (Uniagustiniana) y cursos en Platzi/Udemy.';
  if (/tecnol[oó]go|t[eé]cnico|estudiante|semestre|ingenier/i.test(q))
    return 'Sí, soy Tecnólogo en Análisis y Desarrollo de Software del SENA (2024) con formación adicional en Ingeniería de Sistemas.';
  if (/carrera profesional|carrera.*termin|carrera.*titulad/i.test(q))
    return 'Tecnólogo en Análisis y Desarrollo de Software — SENA 2024 (titulado).';

  // ── Idiomas ──────────────────────────────────────────────────────────────
  if (/nivel de ingl[eé]s|english.*level|level.*english|english.*proficiency|idioma/i.test(q))
    return 'B1. Lectura técnica fluida en inglés, conversación básica.';
  if (/years.*english|english.*years|a[ñn]os.*ingl[eé]s/i.test(q)) return '2';

  // ── Stacks incompatibles — DEBEN ir ANTES del catch-all de años ──────────
  // Para preguntas de "cuántos años / how many years" con stack incompatible → 0
  // Para preguntas de texto libre sobre stack incompatible → respuesta honesta (más abajo)
  const isYearsQ = /a[ñn]os.*con\b|a[ñn]os.*de\b|years.*with\b|years.*of\b|how many years/i.test(q);
  if (isYearsQ) {
    if (/\.net\b|blazor|c#|csharp/i.test(q)) return '0';
    if (/\bjava\b/i.test(q) && !/javascript/i.test(q)) return '0';
    if (/\bphp\b|laravel|symfony/i.test(q)) return '0';
    if (/\bswift\b|\bxcode\b|\bios\b/i.test(q)) return '0';
    if (/\bkotlin\b|android.studio/i.test(q)) return '0';
    if (/\bflutter\b|\bdart\b/i.test(q)) return '0';
    if (/power.?bi\b|tableau|looker|qlik/i.test(q)) return '0';
    if (/\bgo\b|golang|go lang|site.?reliability|\bsre\b|rust\b|scala\b|elixir\b/i.test(q)) return '0';
  }

  // ── Experiencia general ──────────────────────────────────────────────────
  if (/a[ñn]os.*experiencia|years.*experience|experience.*years|tiempo.*experiencia|how many years/i.test(q))
    return '1';
  if (/experiencia|funciones|cargo|trayectoria/i.test(q))
    return isEn
      ? `Over 1 year of software development experience. At SERVIMAX I built an institutional platform (Angular, Node.js, MySQL). At INTELIBPO I implemented RPA automation flows using n8n and NestJS.`
      : `Más de 1 año de experiencia en desarrollo de software. En SERVIMAX desarrollé una página institucional con autenticación, APIs y pasarela de pago (Angular, Node.js, MySQL). En INTELIBPO implementé flujos RPA con n8n y Node.js/NestJS para automatización de cobranza.`;

  // ── Motivación / carta ────────────────────────────────────────────────────
  if (/message|cover letter|carta de presentaci[oó]n|motivaci[oó]n|por qu[eé].*aplic|why.*apply|why.*interest|tell us.*yourself/i.test(q))
    return isEn
      ? `I am very interested in this opportunity. My experience with ${skills} allows me to add value from day one. I have immediate availability and strong motivation to keep growing professionally.`
      : `Estoy muy interesado en esta oportunidad. Mi experiencia en ${skills} me permite aportar valor desde el primer día y contribuir al crecimiento del equipo. Tengo disponibilidad inmediata.`;

  // ── Stack JS / TypeScript ────────────────────────────────────────────────
  if (/javascript|js\b/i.test(q) && !/java\b/i.test(q))
    return isEn
      ? 'Yes, JavaScript/TypeScript is my primary language. Over 1 year in real projects with Node.js, Angular and React.'
      : 'Sí, uso JavaScript/TypeScript como lenguaje principal. Tengo +1 año en proyectos reales con Node.js, Angular y React.';
  if (/typescript/i.test(q))
    return isEn
      ? 'Yes, I use TypeScript in all my backend (NestJS) and frontend (Angular) projects. Over 1 year of experience.'
      : 'Sí, uso TypeScript en todos mis proyectos backend (NestJS) y frontend (Angular). +1 año de experiencia.';
  if (/a[ñn]os.*javascript|javascript.*a[ñn]os|years.*javascript|javascript.*years/i.test(q)) return '2';
  if (/a[ñn]os.*typescript|typescript.*a[ñn]os/i.test(q)) return '1';

  // ── Frontend ─────────────────────────────────────────────────────────────
  if (/html|css/.test(q))
    return 'Sí, tengo experiencia sólida en HTML5 y CSS3. He desarrollado interfaces responsivas con Bootstrap y Tailwind.';
  if (/angular/i.test(q))
    return isEn
      ? 'Yes, I have Angular (v14+) experience. I used it at SERVIMAX to build a full institutional platform with authentication, API integration and payment gateway.'
      : 'Sí, tengo experiencia en Angular (v14+). Lo usé en SERVIMAX para desarrollar una plataforma institucional completa con autenticación, consumo de APIs y pasarela de pago.';
  if (/a[ñn]os.*angular|angular.*a[ñn]os|years.*angular|angular.*years/i.test(q)) return '1';
  if (/react/i.test(q))
    return isEn
      ? 'Yes, I have React experience. I built components, hooks and REST API integrations in SERVIMAX and personal projects.'
      : 'Sí, tengo experiencia en React. He desarrollado componentes, hooks y consumo de APIs REST en proyectos de SERVIMAX y personales.';
  if (/a[ñn]os.*react|react.*a[ñn]os|years.*react|react.*years/i.test(q)) return '1';
  if (/vue\.?js|vuejs/i.test(q))
    return isEn
      ? 'I know Vue.js at a basic level. My main frontend stack is Angular and React.'
      : 'Conozco Vue.js a nivel básico. Mi stack principal de frontend es Angular y React.';

  // ── Backend ──────────────────────────────────────────────────────────────
  if (/node\.?js|nodejs/i.test(q))
    return isEn
      ? 'Yes, Node.js is my main backend runtime. I built REST APIs with Express and NestJS at SERVIMAX and INTELIBPO.'
      : 'Sí, uso Node.js como runtime principal en el backend. He desarrollado APIs REST con Express y NestJS en SERVIMAX e INTELIBPO.';
  if (/a[ñn]os.*node|node.*a[ñn]os|years.*node|node.*years/i.test(q)) return '1';
  if (/nest\.?js/i.test(q))
    return isEn
      ? 'Yes, I use NestJS. I built auth modules and APIs at SERVIMAX, and RPA automation services at INTELIBPO using NestJS + TypeScript + MySQL.'
      : 'Sí, uso NestJS. Construí módulos de autenticación y APIs en SERVIMAX, y servicios de automatización RPA en INTELIBPO con NestJS + TypeScript + MySQL.';
  if (/express\.?js|expressjs/i.test(q))
    return isEn
      ? 'Yes, I have Express.js experience building REST APIs in production projects.'
      : 'Sí, tengo experiencia con Express.js desarrollando APIs REST en proyectos de producción.';
  if (/crud/i.test(q))
    return 'Con NestJS y TypeORM: defino entity, creo el DTO, genero módulo/servicio/controller con CLI, implemento los 5 endpoints REST y agrego validaciones con class-validator. Tiempo: ~30-45 min.';

  // ── Bases de datos ────────────────────────────────────────────────────────
  if (/mysql/i.test(q))
    return 'Sí, tengo experiencia con MySQL. Lo he usado en SERVIMAX e INTELIBPO para diseñar esquemas, relaciones y consultas SQL complejas.';
  if (/mongodb|mongo/i.test(q))
    return 'Tengo conocimientos de MongoDB. Lo he usado en proyectos personales y como alternativa NoSQL para almacenamiento de documentos.';
  if (/postgresql|postgres/i.test(q))
    return 'Conozco PostgreSQL. Mi experiencia principal en bases de datos relacionales es con MySQL, pero manejo SQL de forma genérica.';
  if (/sql\b|base[s]? de datos|database/i.test(q))
    return 'Sí, tengo experiencia con SQL (MySQL). He diseñado esquemas, relaciones y consultas en proyectos de producción.';
  if (/a[ñn]os.*sql|sql.*a[ñn]os|years.*sql|sql.*years/i.test(q)) return '1';

  // ── Automatización / RPA ──────────────────────────────────────────────────
  if (/n8n|automatizaci[oó]n|automatizad[oa]|rpa|bot\b/i.test(q))
    return 'Sí, tengo experiencia en n8n y automatización RPA. En INTELIBPO implementé flujos para recepción de archivos SFTP/correo/nube, extracción y transformación de datos.';
  if (/a[ñn]os.*rpa|rpa.*a[ñn]os|years.*rpa|rpa.*years/i.test(q)) return '1';

  // ── DevOps / herramientas ─────────────────────────────────────────────────
  if (/docker|kubernetes|contenedor|container/i.test(q))
    return 'Tengo conocimientos básicos de Docker para entornos de desarrollo local (contenedores de bases de datos y servicios). Estoy profundizando.';
  if (/git|github|control de versiones|repositorio|versionamiento/i.test(q))
    return 'Sí, uso Git y GitHub en todos mis proyectos. Manejo branches, commits semánticos, pull requests, merge y resolución de conflictos. Repositorio: github.com/camilomont';
  if (/postman|api.*test|test.*api/i.test(q))
    return 'Sí, uso Postman regularmente para probar y documentar APIs REST.';

  // ── IA / herramientas modernas ────────────────────────────────────────────
  if (/herramientas.*ia|inteligencia artificial|copilot|chatgpt|llm|ia.*desarrollad/i.test(q))
    return 'Uso GitHub Copilot para autocompletado y revisión de código, y ChatGPT para depurar errores, generar boilerplate y documentar funciones.';

  // ── Stacks que NO manejo (respuestas honestas con disposición) ────────────
  if (/\.net\b|blazor|c#|csharp/i.test(q))
    return isEn
      ? 'No direct experience with .NET/C#. My stack is JavaScript/TypeScript. Willing to learn.'
      : 'No tengo experiencia directa con .NET/C#. Mi stack es JavaScript/TypeScript. Tengo disposición para aprender.';
  if (/java\b/i.test(q) && !/javascript/i.test(q))
    return isEn
      ? 'No experience with Java. I work with TypeScript OOP and am willing to learn.'
      : 'No tengo experiencia en Java. Manejo POO con TypeScript y estoy dispuesto a aprender.';
  if (/php|laravel|symfony/i.test(q))
    return isEn
      ? 'No experience with PHP/Laravel. My main stack is JavaScript/TypeScript. Willing to learn.'
      : 'No tengo experiencia en PHP/Laravel. Mi stack principal es JavaScript/TypeScript. Puedo aprender.';
  if (/swift|xcode|ios\b/i.test(q))
    return isEn
      ? 'No experience with iOS/Swift. My focus is web development (Angular/React/Node.js).'
      : 'No tengo experiencia en iOS/Swift. Mi enfoque es desarrollo web (Angular/React/Node.js).';
  if (/kotlin|android.studio/i.test(q))
    return isEn
      ? 'No experience with native Android/Kotlin. My stack is web.'
      : 'No tengo experiencia en Android nativo con Kotlin. Mi stack es web.';
  if (/flutter|dart/i.test(q))
    return isEn
      ? 'No experience with Flutter/Dart, but strong foundations in JavaScript/TypeScript.'
      : 'No tengo experiencia en Flutter/Dart, pero tengo bases sólidas en JavaScript/TypeScript.';
  if (/power.?bi|tableau|looker|qlik|inteligencia.*negocios/i.test(q))
    return isEn
      ? 'No experience with BI tools. My stack is web development and SQL queries. Willing to learn.'
      : 'No tengo experiencia con herramientas de BI/visualización. Mi stack es desarrollo web y SQL para consultas. Disposición para aprender.';

  // ── Escalas numéricas ─────────────────────────────────────────────────────
  if (/escala.*[1-5]|califica.*nivel|puntúa|[0-9].*siendo.*[0-9]|de [0-9]+ a [0-9]+|[0-9]+ al [0-9]+|cuanto manejas|cuánto manejas/i.test(q))
    return '3';

  // ── Sin match — devuelve vacío, fallback a IA ─────────────────────────────
  return '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Responder preguntas adicionales con IA
// ──────────────────────────────────────────────────────────────────────────────
async function fillAdditionalQuestions(page, jobInfo, cvText, profile) {
  // ── Inputs de texto / numéricos ───────────────────────────────────────────
  const textDivs = await page
    .$$('.jobs-easy-apply-modal [data-live-test-single-line-text-form-component]')
    .catch(() => []);

  for (const div of textDivs) {
    const input = await div.$('input').catch(() => null);
    if (!input) continue;

    const val = await input.inputValue().catch(() => '');
    if (val) continue; // ya tiene valor

    const inputId = await input.getAttribute('id').catch(() => '');
    const labelEl = inputId ? await page.$(`label[for="${inputId}"]`).catch(() => null) : null;
    const label = labelEl ? (await labelEl.textContent().catch(() => '')).trim() : '';
    if (!label) continue;

    const isNumeric = (inputId || '').includes('-numeric');
    console.log(`    [Q-TEXT] "${label.slice(0, 70)}"`);

    // ── 1. Diccionario CT (respuestas deterministas, igual que Computrabajo) ─
    let finalAnswer = guessAnswerByLabel(label, profile, cvText);

    // ── 2. Fallback IA con contexto enriquecido ───────────────────────────
    if (!finalAnswer) {
      const jobCtx = jobInfo?.title
        ? `Job offer: ${jobInfo.title} at ${jobInfo.company || ''}\nDescription: ${(jobInfo.description || '').slice(0, 400)}\n`
        : '';
      const candidateCtx = [
        `CANDIDATE PROFILE:`,
        `- Name: ${profile?.full_name || 'Cristian Camilo Montes Teheran'}`,
        `- Email: ${profile?.email || 'camilo59940@gmail.com'}`,
        `- Phone: ${profile?.phone || '+57 3143663821'}`,
        `- Location: ${profile?.location || 'Bogotá DC, Colombia'}`,
        `- Salary expectation: ${profile?.salary_aspiration_cop || '2500000'} COP / month`,
        `- Stack: JavaScript, TypeScript, Node.js, Angular, React, NestJS, Express, MySQL, MongoDB, n8n, RPA automation`,
        `- Experience: ~1 year in real projects (SERVIMAX: Angular + Node.js + MySQL; INTELIBPO: NestJS + n8n RPA)`,
        `- Education: Technologist in Software Analysis and Development – SENA 2024`,
        `- English level: B1 (fluent technical reading, basic conversation)`,
        `- No experience in: .NET, C#, Java, PHP, iOS/Swift, Android/Kotlin, Flutter, Power BI`,
        `- Immediate availability`,
      ].join('\n');
      const enrichedPrompt = [
        `You are an assistant filling out job application forms.`,
        `CRITICAL RULES:`,
        `1. Respond in THE SAME LANGUAGE as the question (English question → English answer, Spanish question → Spanish answer).`,
        `2. Respond ONLY the field value — no quotes, no explanations, no preamble.`,
        `3. If the candidate has no experience with something, say so honestly but with willingness to learn.`,
        `4. Maximum 300 characters.`,
        `5. For numeric fields, respond only a number.`,
        ``,
        candidateCtx,
        ``,
        jobCtx,
        `Question: "${label}"`,
      ].join('\n');
      finalAnswer = await askAI(enrichedPrompt, cvText) || '0';
    }

    finalAnswer = finalAnswer.trim();
    if (isNumeric) {
      const m = finalAnswer.match(/\d+/);
      finalAnswer = m ? m[0] : '0';
    }
    await input.fill(finalAnswer);
    console.log(`           → "${finalAnswer.slice(0, 80)}"`);
    await page.waitForTimeout(300);
  }

  // ── Selects (multiple choice) ─────────────────────────────────────────────
  const selectDivs = await page
    .$$('.jobs-easy-apply-modal [data-test-text-entity-list-form-component]')
    .catch(() => []);

  for (const div of selectDivs) {
    const sel = await div.$('select').catch(() => null);
    if (!sel) continue;

    const val = await sel.inputValue().catch(() => '');
    if (val && val !== 'Selecciona una opción') continue;

    const options = await sel
      .$$eval('option', opts =>
        opts
          .filter(o => o.value !== 'Selecciona una opción')
          .map(o => ({ value: o.value, text: o.textContent?.trim() || '' }))
      )
      .catch(() => []);
    if (!options.length) continue;

    // Saltar selects de contacto (ya los maneja fillContactInfo)
    if (options.some(o => o.value?.includes('@')) || options.some(o => o.text?.includes('Colombia (+57)'))) continue;

    const selId = await sel.getAttribute('id').catch(() => '');
    const labelEl = selId ? await page.$(`label[for="${selId}"]`).catch(() => null) : null;
    const label = labelEl ? (await labelEl.textContent().catch(() => '')).trim() : '';

    console.log(`    [Q-OPT] "${label.slice(0, 70)}" → ${options.map(o => o.text).join(' / ')}`);

    if (options.length === 1) {
      await sel.selectOption(options[0].value);
      console.log(`           → "${options[0].text}" (única)`);
      continue;
    }

    // ── 1. Intentar match determinista por label en las opciones ──────────
    const dictAnswer = guessAnswerByLabel(label, profile, cvText);
    if (dictAnswer) {
      // Buscar la opción cuyo texto contenga la respuesta determinista
      const match = options.find(o => o.text.toLowerCase().includes(dictAnswer.toLowerCase().slice(0, 20)));
      if (match) {
        await sel.selectOption(match.value);
        console.log(`           → "${match.text}" (diccionario)`);
        await page.waitForTimeout(300);
        continue;
      }
    }

    // ── 2. Fallback IA para selects ───────────────────────────────────────
    const jobCtxOpt = jobInfo?.title ? `Job: ${jobInfo.title} at ${jobInfo.company || ''}\n` : '';
    const optList = options.map((o, i) => `${i}: ${o.text}`).join('\n');
    const prompt = [
      `You are an assistant filling job application forms. Answer ONLY with the index number of the best option.`,
      `Respond in the same language as the question. Answer ONLY with the index number (0, 1, 2...).`,
      jobCtxOpt,
      `Candidate: ${profile?.full_name || 'Cristian Camilo Montes Teheran'}`,
      `Stack: JavaScript, TypeScript, Node.js, Angular, React, NestJS, MySQL, n8n, RPA automation. ~1 year experience.`,
      `Education: Technologist SENA 2024. English B1. Location: Bogotá, Colombia. Immediate availability.`,
      `No experience in: .NET, C#, Java, PHP, iOS, Android, Flutter, Power BI.`,
      `Question: "${label}"`,
      `Options:\n${optList}`,
      `Answer ONLY with the index number.`,
    ].join('\n');
    const idxStr = await askAIRaw(prompt);
    const idx = parseInt(idxStr?.match(/\d+/)?.[0] ?? '0', 10);
    const choice = (!isNaN(idx) && options[idx]) ? options[idx] : options[0];
    await sel.selectOption(choice.value);
    console.log(`           → "${choice.text}"`);
    await page.waitForTimeout(300);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Manejar el modal completo de Easy Apply paso a paso
// ──────────────────────────────────────────────────────────────────────────────
async function fillEasyApplyModal(page, jobInfo, cvText, profile, credentials) {
  const MAX_STEPS = 25;

  for (let stepNum = 0; stepNum < MAX_STEPS; stepNum++) {
    await page.waitForTimeout(1500);

    const modal = await page.$('.jobs-easy-apply-modal').catch(() => null);
    if (!modal) return 'modal-closed-unexpectedly';

    // ¿Pantalla de éxito?
    const successEl = await page.$('[data-test-icon="signal-success"]').catch(() => null);
    if (successEl) {
      console.log('  [MODAL] ✓ Solicitud enviada con éxito');
      await page.click('[data-test-modal-close-btn]').catch(() => {});
      await page.waitForTimeout(1500);
      return 'applied';
    }

    const progress = await page
      .$eval('progress[aria-valuenow]', el => parseInt(el.getAttribute('aria-valuenow') || '0'))
      .catch(() => 0);

    const sectionTitle = await page
      .$eval('.jobs-easy-apply-modal h3.t-16, .jobs-easy-apply-modal h3', el => el.textContent?.trim() || '')
      .catch(() => '');

    console.log(`  [MODAL] Paso ${stepNum + 1} | ${progress}% | "${sectionTitle}"`);

    // Detectar botones disponibles
    const nextBtn   = await page.$('[data-easy-apply-next-button], [data-live-test-easy-apply-next-button]').catch(() => null);
    const reviewBtn = await page.$('[data-live-test-easy-apply-review-button]').catch(() => null);
    const submitBtn = await page.$('[data-live-test-easy-apply-submit-button]').catch(() => null);

    // ── Enviar solicitud ────────────────────────────────────────────────────
    if (submitBtn) {
      console.log('  [MODAL] Enviando solicitud...');
      await submitBtn.click();
      await page.waitForTimeout(3000);

      const successAfter = await page.$('[data-test-icon="signal-success"]').catch(() => null);
      if (successAfter) {
        console.log('  [MODAL] ✓ Solicitud enviada');
        await page.click('[data-test-modal-close-btn]').catch(() => {});
        await page.waitForTimeout(1500);
        return 'applied';
      }

      // ¿Errores de validación?
      const errors = await page.$$('[data-test-inline-feedback-error], .fb-dash-form-element__error-text').catch(() => []);
      if (errors.length) {
        console.log(`  [MODAL] ${errors.length} error(es) de validación — reintentando rellenar`);
        await fillAdditionalQuestions(page, jobInfo, cvText, profile);
        await page.waitForTimeout(1000);
        continue;
      }
      return 'submit-uncertain';
    }

    // ── Revisar ─────────────────────────────────────────────────────────────
    if (reviewBtn) {
      console.log('  [MODAL] Respondiendo preguntas antes de revisar...');
      await fillAdditionalQuestions(page, jobInfo, cvText, profile);
      await page.waitForTimeout(500);
      await reviewBtn.click();
      await page.waitForTimeout(2000);
      continue;
    }

    // ── Siguiente ───────────────────────────────────────────────────────────
    if (nextBtn) {
      if (/contacto/i.test(sectionTitle)) {
        console.log('  [MODAL] Llenando información de contacto...');
        await fillContactInfo(page, credentials, profile);
        await page.waitForTimeout(500);
      } else if (/adicionales|preguntas|additional questions/i.test(sectionTitle)) {
        // A veces el modal usa "Siguiente" en lugar de "Revisar"
        console.log('  [MODAL] Respondiendo preguntas (paso Siguiente)...');
        await fillAdditionalQuestions(page, jobInfo, cvText, profile);
        await page.waitForTimeout(500);
      } else {
        console.log(`  [MODAL] Paso "${sectionTitle}" → Siguiente`);
      }
      await nextBtn.click();
      await page.waitForTimeout(2000);
      continue;
    }

    // Sin botón conocido
    await snap(page, `modal-unknown-${jobInfo.jobId}-s${stepNum}`);
    console.log('  [MODAL] Estado inesperado — abortando');
    break;
  }

  return 'incomplete';
}

// ──────────────────────────────────────────────────────────────────────────────
// Verificar si la descripción del trabajo coincide con el CV del candidato
// ──────────────────────────────────────────────────────────────────────────────
async function checkJobCVMatch(jobDescription, cvText, jobTitle, company) {
  if (!jobDescription || jobDescription.length < 80) return true; // sin descripción → dejar pasar

  const prompt = [
    `Evalúa si este candidato es adecuado para el trabajo. Responde SOLO con "SI" o "NO".`,
    ``,
    `OFERTA: ${jobTitle} en ${company}`,
    `DESCRIPCIÓN (extracto): ${jobDescription.slice(0, 1500)}`,
    ``,
    `PERFIL DEL CANDIDATO: Desarrollador Full Stack Junior, ~1 año de experiencia.`,
    `Stack real: JavaScript, TypeScript, Node.js, Angular, React, NestJS, Express, MySQL, MongoDB, n8n, automatización RPA.`,
    `Sin experiencia en: iOS, Swift, Android, Kotlin, Java, PHP, .NET, Ruby, performance testing, JMeter, SAP, Salesforce.`,
    ``,
    `¿El candidato cumple al menos el 60% de los requisitos técnicos? Responde SOLO: SI o NO`,
  ].join('\n');

  const result = await askAI(prompt, cvText);
  const answer = (result || '').trim().toUpperCase();
  const match = /^SI|^SÍ|^YES/.test(answer);
  console.log(`  [MATCH] ${match ? '✓ Aplica' : '✗ No aplica'} — IA: "${(result || 'sin respuesta').slice(0, 40)}"`);
  return match;
}

// ──────────────────────────────────────────────────────────────────────────────
// Aplicar a una oferta específica por jobId
// ──────────────────────────────────────────────────────────────────────────────
async function applyToJob(page, job, cvText, profile, credentials) {
  const jobUrl = `https://www.linkedin.com/jobs/view/${job.jobId}/`;
  console.log(`\n  [JOB] ${job.title}`);
  console.log(`        ${job.company}  |  ${jobUrl}`);

  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
    return { status: 'session-expired' };
  }

  // ── Leer descripción del trabajo ─────────────────────────────────────────
  const jobDescription = await page.evaluate(() => {
    const sels = [
      '#job-details',
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '.jobs-description',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 4000) || '';
    }
    return '';
  }).catch(() => '');

  // ── Verificar que el trabajo coincide con el perfil del candidato ────────
  if (jobDescription.length > 80) {
    const isMatch = await checkJobCVMatch(jobDescription, cvText, job.title, job.company);
    if (!isMatch) {
      console.log(`  [SKIP] Descripción no coincide con el perfil — omitiendo`);
      return { status: 'cv-mismatch' };
    }
  }

  // Enriquecer el objeto job con la descripción para usarla en el formulario
  job.description = jobDescription.slice(0, 1200);

  // ¿Ya aplicado? (LinkedIn muestra "Ver solicitud" en lugar del botón)
  const viewAppBtn = await page
    .$('button[aria-label*="Ver solicitud"], .jobs-s-apply__applied-text, [aria-label*="ver tu solicitud"]')
    .catch(() => null);
  if (viewAppBtn) {
    console.log('  → Ya aplicado (LinkedIn muestra "Ver solicitud")');
    return { status: 'already-applied' };
  }

  // Buscar botón Easy Apply
  const easyApplyBtn = await page
    .waitForSelector(
      '[aria-label="Solicitud sencilla"], button:has-text("Solicitud sencilla")',
      { timeout: 8000 }
    )
    .catch(() => null);

  if (!easyApplyBtn) {
    await snap(page, `no-easyapply-${job.jobId}`);
    const externalBtn = await page.$('button:has-text("Solicitar"), a:has-text("Solicitar en el sitio")').catch(() => null);
    console.log(`  → Sin botón Easy Apply${externalBtn ? ' (solicitud externa)' : ''}`);
    return { status: 'no-easy-apply' };
  }

  // Clic en Easy Apply
  await easyApplyBtn.click();
  await page.waitForTimeout(2000);

  // Esperar modal
  const modal = await page.waitForSelector('.jobs-easy-apply-modal', { timeout: 8000 }).catch(() => null);
  if (!modal) {
    await snap(page, `no-modal-${job.jobId}`);
    console.log('  → Modal no apareció');
    return { status: 'modal-not-opened' };
  }

  // Procesar modal paso a paso
  const result = await fillEasyApplyModal(page, job, cvText, profile, credentials);
  console.log(`  → Resultado modal: ${result}`);
  return { status: result };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  // ── Credenciales ──────────────────────────────────────────────────────────
  if (!existsSync(CREDENTIALS_PATH)) {
    console.error(`\nError: Falta ${CREDENTIALS_PATH}`);
    process.exit(1);
  }
  const credentials = yaml.load(readFileSync(CREDENTIALS_PATH, 'utf8')) || {};
  if (!credentials.linkedin?.email || !credentials.linkedin?.password) {
    console.error('Error: Falta credentials.linkedin.email o credentials.linkedin.password');
    process.exit(1);
  }

  // ── Perfil del candidato ───────────────────────────────────────────────────
  const profileYml = existsSync(PROFILE_PATH)
    ? (yaml.load(readFileSync(PROFILE_PATH, 'utf8')) || {})
    : {};
  const profile = profileYml.candidate || {
    full_name: 'Cristian Camilo Montes Teheran',
    phone: '3143663821',
    email: credentials.linkedin.email,
  };

  // ── CV ─────────────────────────────────────────────────────────────────────
  let cvText = '';
  if (existsSync(CV_PATH)) {
    cvText = readFileSync(CV_PATH, 'utf8');
  } else if (existsSync('examples/cv-example.md')) {
    cvText = readFileSync('examples/cv-example.md', 'utf8');
    console.log('[INFO] Usando CV de ejemplo (crea cv.md para mejores respuestas)');
  } else {
    cvText = `Desarrollador de software junior con experiencia en JavaScript, Node.js, Angular y React. Bogotá, Colombia. ${profile.full_name}`;
  }

  // ── Registro de ya-aplicados ───────────────────────────────────────────────
  const applied = loadApplied();
  const alreadyAppliedIds = new Set(Object.keys(applied));

  console.log('═'.repeat(54));
  console.log('  LINKEDIN EASY APPLY');
  console.log('═'.repeat(54));
  console.log(`  Candidato    : ${profile.full_name || '?'}`);
  console.log(`  Keywords     : ${SEARCH_KEYWORDS.length}`);
  console.log(`  Max apps     : ${MAX_NEW_APPS}`);
  console.log(`  Ya aplicados : ${alreadyAppliedIds.size} en registro`);
  console.log('');

  const { browser, page } = await createBrowser();

  try {
    // ── Login ─────────────────────────────────────────────────────────────
    const loggedIn = await loginLinkedIn(page, credentials);
    if (!loggedIn) {
      console.error('[FATAL] Login fallido');
      process.exit(1);
    }

    // ── Buscar y aplicar simultáneamente ─────────────────────────────────
    // En cuanto una búsqueda retorna ofertas nuevas, aplicamos de inmediato.
    // Así el usuario ve aplicaciones en los primeros ~30 segundos.
    const seenJobIds = new Set(alreadyAppliedIds); // evitar duplicados entre búsquedas

    let appliedCount  = 0;
    let skippedCount  = 0;
    let failedCount   = 0;

    const totalSearches = SEARCH_KEYWORDS.length * TIME_FILTERS.length;
    let searchNum = 0;

    outer: for (let ki = 0; ki < SEARCH_KEYWORDS.length; ki++) {
      const keyword = SEARCH_KEYWORDS[ki];

      for (const timeFilter of TIME_FILTERS) {
      if (appliedCount >= MAX_NEW_APPS) {
        console.log(`\n  Límite de ${MAX_NEW_APPS} aplicaciones alcanzado — omitiendo búsquedas restantes.`);
        break outer;
      }
      if (page.isClosed()) { console.log('[ERROR] Página cerrada — deteniendo'); break outer; }

      searchNum++;
      const filterLabel = timeFilter === 'r86400' ? '24h' : '7d';
      console.log(`\n══ BÚSQUEDA [${searchNum}/${totalSearches}] [${filterLabel}] ════════════════════════════`);
      const result = await searchLinkedInJobs(page, keyword, timeFilter).catch(err => {
        console.log(`  [WARN] Error buscando "${keyword}": ${err.message?.split('\n')[0]}`);
        return { keyword, count: 0, jobs: [], status: 'error' };
      });

      if (result.status === 'session-expired' || result.status === 'page-closed') {
        console.log(`[ERROR] ${result.status} — deteniendo`);
        break outer;
      }

      // Filtrar nuevas (no vistas en esta corrida ni en el registro)
      const newJobs = result.jobs.filter(j => !seenJobIds.has(j.jobId));
      newJobs.forEach(j => seenJobIds.add(j.jobId));

      if (newJobs.length === 0) {
        console.log('  Sin ofertas nuevas en esta búsqueda — continuando...');
        if (!page.isClosed()) await page.waitForTimeout(1500).catch(() => {});
        continue;
      }

      console.log(`\n══ APLICANDO (${newJobs.length} nuevas de "${keyword}") ═══════`);
      for (const job of newJobs) {
        if (appliedCount >= MAX_NEW_APPS) break;
        if (page.isClosed()) { console.log('[ERROR] Página cerrada'); break; }

        const res = await applyToJob(page, job, cvText, profile, credentials);

        if (res.status === 'session-expired') {
          console.log('[ERROR] Sesión expirada — deteniendo');
          break;
        }

        if (res.status === 'applied') {
          applied[job.jobId] = {
            title: job.title,
            company: job.company,
            appliedAt: new Date().toISOString(),
            status: 'applied',
          };
          saveApplied(applied);
          appliedCount++;
          console.log(`  ✓ Aplicado  : ${job.title} — ${job.company}`);
        } else if (res.status === 'already-applied') {
          applied[job.jobId] = { title: job.title, company: job.company, status: 'already-applied', detectedAt: new Date().toISOString() };
          saveApplied(applied);
          skippedCount++;
          console.log(`  ○ Saltado   : ${job.title} (ya aplicado en LinkedIn)`);
        } else if (['no-easy-apply', 'modal-not-opened', 'cv-mismatch'].includes(res.status)) {
          skippedCount++;
          console.log(`  ○ Saltado   : ${job.title} (${res.status})`);
        } else {
          failedCount++;
          console.log(`  ✗ Fallido   : ${job.title} (${res.status})`);
        }

        // Pausa anti-spam entre aplicaciones
        if (!page.isClosed()) await page.waitForTimeout(3000 + Math.random() * 2000).catch(() => {});
      }

      if (!page.isClosed()) await page.waitForTimeout(1500).catch(() => {});
      } // end for timeFilter
    } // end outer for keyword

    // ── Informe final ──────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(54));
    console.log('  INFORME FINAL');
    console.log('═'.repeat(54));
    console.log(`  Aplicaciones exitosas : ${appliedCount}`);
    console.log(`  Saltadas              : ${skippedCount}`);
    console.log(`  Fallidas              : ${failedCount}`);
    console.log(`  Total en registro     : ${Object.keys(applied).length}`);
    console.log('');
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
