#!/usr/bin/env node
/**
 * apply-auto.mjs — Pipeline autónomo Computrabajo / LinkedIn
 *
 * Flujo:
 *  1. Login una sola vez por plataforma
 *  2. Si la URL es una página de listado → extrae links de ofertas individuales
 *  3. Filtra por relevancia con el CV (keywords + IA si hay ANTHROPIC_API_KEY)
 *  4. Aplica a cada oferta relevante: click → formulario → submit
 *  5. Informe final: exitosas / ya-aplicado / fallidas
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const PROFILE_PATH     = 'config/profile.yml';
const CREDENTIALS_PATH = 'config/credentials.yml';
const PIPELINE_PATH    = 'data/pipeline.md';
const CV_PATH          = 'cv.md';
const RESULTS_PATH     = 'data/applications-log.md';

// Límite de nuevas aplicaciones por ejecución (ya-aplicado no cuenta)
const MAX_NEW_APPS = 10;

// ──────────────────────────────────────────────────────────────────────────────
// IA
// ──────────────────────────────────────────────────────────────────────────────
async function askAI(prompt, cvContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Cadena de IA gratuita: Gemini → Ollama local
    const gemini = await askAIGemini(prompt, cvContext);
    if (gemini) return gemini;
    return askAILocal(prompt, cvContext);
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Eres un asistente que completa formularios de empleo. Responde SOLO con el valor del campo pedido, sin comillas ni explicaciones.\n\nCV:\n${cvContext.slice(0, 3000)}\n\nCampo: ${prompt}`
        }]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || null;
  } catch { return null; }
}

// Versión "raw" de askAI — envía el prompt exactamente como viene, sin envoltura adicional.
// Usada para KQ radio selection donde el prompt ya incluye todo el contexto y pide un índice numérico.
async function askAIRaw(prompt) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;

  // 1. Anthropic Claude
  if (anthropicKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text?.trim() || null;
      if (text) console.log(`[IA-KQ-ANTHROPIC] → "${text}"`);
      return text;
    } catch { /* continúa */ }
  }

  // 2. Gemini
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 10, temperature: 0.1 }
          })
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      if (text) console.log(`[IA-KQ-GEMINI] → "${text}"`);
      return text;
    } catch { /* continúa */ }
  }

  // 3. Ollama local
  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral',
        prompt,
        stream: false,
        options: { num_predict: 10, temperature: 0.1 }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.response?.trim() || null;
    if (text) console.log(`[IA-KQ-LOCAL] → "${text}"`);
    return text;
  } catch { return null; }
}

// IA gratuita vía Google Gemini (requiere GEMINI_API_KEY — plan gratuito disponible)
async function askAIGemini(prompt, cvContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text:
            `Eres un asistente que completa formularios de empleo en Colombia.\n` +
            `Responde SOLO con el valor exacto del campo (máximo 300 caracteres), sin comillas ni explicaciones.\n\n` +
            `CV del candidato:\n${cvContext.slice(0, 2500)}\n\nPregunta o campo: ${prompt}\n\nRespuesta:`
          }] }],
          generationConfig: { maxOutputTokens: 250, temperature: 0.2 }
        })
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    if (text) console.log(`[IA-GEMINI] "${prompt.slice(0,50)}" → "${text.slice(0,80)}"`);
    return text;
  } catch { return null; }
}

// IA local vía Ollama (sin API key) — requiere `ollama serve` corriendo localmente
async function askAILocal(prompt, cvContext) {
  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral',
        prompt: `Eres un asistente que completa formularios de empleo en Colombia. Responde SOLO con el valor del campo pedido, sin comillas ni explicaciones adicionales.\n\nCV del candidato:\n${cvContext.slice(0, 2000)}\n\nPregunta o campo: ${prompt}\n\nRespuesta:`,
        stream: false,
        options: { num_predict: 200, temperature: 0.3 }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.response?.trim() || null;
    if (text) console.log(`[IA-LOCAL] "${prompt.slice(0,40)}" → "${text.slice(0,60)}"`);
    return text;
  } catch { return null; }
}

// Pre-carga el conjunto de ofertas ya aplicadas desde /candidate/match/ (evita navegaciones innecesarias)
async function fetchAppliedOffers(page) {
  const appliedHashes = new Set();
  let pageNum = 1;
  console.log('[MATCH] Cargando ofertas ya aplicadas...');
  while (true) {
    const url = pageNum === 1
      ? 'https://candidato.co.computrabajo.com/candidate/match/'
      : `https://candidato.co.computrabajo.com/candidate/match/?p=${pageNum}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

      // Extraer hashes de oferta de los links en la página
      const hashes = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('a[href*="oi="]').forEach(a => {
          const m = (a.href || '').match(/[?&]oi=([A-Fa-f0-9]{32,})/i);
          if (m) out.push(m[1].toUpperCase());
        });
        // También hashes en urls de forma directa en la página
        const bodyText = document.body.innerHTML;
        const re = /[?&]oi=([A-Fa-f0-9]{32,})/gi;
        let match;
        while ((match = re.exec(bodyText)) !== null) out.push(match[1].toUpperCase());
        return [...new Set(out)];
      }).catch(() => []);

      if (hashes.length === 0) break; // Sin más resultados
      hashes.forEach(h => appliedHashes.add(h));

      // Verificar si hay página siguiente
      const hasNext = await page.$('a[href*="/match/?p="], .paginacion a:last-child').catch(() => null);
      const nextHref = hasNext ? await hasNext.getAttribute('href').catch(() => '') : '';
      if (!nextHref || !nextHref.includes(`p=${pageNum + 1}`)) break;
      pageNum++;
      if (pageNum > 20) break; // Seguridad
    } catch { break; }
  }
  console.log(`[MATCH] ${appliedHashes.size} ofertas ya aplicadas cargadas (${pageNum} página/s)`);
  return appliedHashes;
}

// Extrae el hash de oferta de una URL de Computrabajo
function extractOfferHash(url) {
  // Formato: /oferta-de-trabajo-...-HASH#...
  const m = url.match(/([A-Fa-f0-9]{32,})(?:[#?]|$)/i);
  if (m) return m[1].toUpperCase();
  // Formato: ?oi=HASH
  const m2 = url.match(/[?&]oi=([A-Fa-f0-9]{32,})/i);
  return m2 ? m2[1].toUpperCase() : null;
}

// Interpreta el texto de antigüedad de la oferta y retorna true si supera 5 días
function isOfferTooOld(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  // Siempre recientes
  if (/\bhoy\b|hace \d+ hora|hace 1 d[ií]a|hace 2 d[ií]as|hace 3 d[ií]as|hace 4 d[ií]as|hace 5 d[ií]as/.test(t)) return false;
  if (/\bayer\b/.test(t)) return false;
  // Siempre antigua
  if (/m[aá]s de|hace \d+ semana|hace \d+ mes|month|week/.test(t)) return true;
  // "Hace N días" donde N > 5
  const m = t.match(/hace (\d+) d[ií]a/);
  if (m) return parseInt(m[1], 10) > 5;
  return false;
}

// IA para decidir si una oferta es relevante
async function isRelevantWithAI(jobTitle, jobSnippet, cvContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // null = sin opinión, usar keywords
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `Responde SOLO "SI" o "NO".\n¿El candidato con este CV es un buen candidato para esta oferta?\n\nCV (resumen):\n${cvContext.slice(0, 1500)}\n\nOferta: ${jobTitle}\n${jobSnippet.slice(0, 400)}`
        }]
      })
    });
    const data = await res.json();
    const ans = data.content?.[0]?.text?.trim().toUpperCase() || '';
    return ans.startsWith('SI') || ans.startsWith('SÍ');
  } catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Inferencia de campos
// ──────────────────────────────────────────────────────────────────────────────
function guessValue(name = '', placeholder = '', label = '', candidate = {}) {
  const k = `${name} ${placeholder} ${label}`.toLowerCase();
  if (/full.?name|nombre completo/.test(k)) return candidate.full_name || '';
  if (/first.?name|primer.?nombre/.test(k)) return (candidate.full_name || '').split(' ')[0] || '';
  if (/last.?name|apellido/.test(k))        return (candidate.full_name || '').split(' ').slice(1).join(' ') || '';
  if (/\bname\b|\bnombre\b/.test(k))        return candidate.full_name || '';
  if (/email|correo/.test(k))               return candidate.email || '';
  if (/phone|tel[eé]fono|celular|mobile/.test(k)) return candidate.phone || '';
  if (/location|ciudad|city|direcci[oó]n/.test(k)) return candidate.location || '';
  if (/linkedin/.test(k))                   return candidate.linkedin || '';
  if (/portfolio|website|\bweb\b/.test(k))  return candidate.portfolio_url || '';
  if (/github/.test(k))                     return candidate.github || '';
  if (/message|cover|motivaci[oó]n|carta|por qu[eé]/.test(k)) {
    const skills = Array.isArray(candidate.skills) ? candidate.skills.join(', ') : 'desarrollo de software y automatización';
    return `Estoy muy interesado en esta oportunidad. Mi experiencia en ${skills} me permite aportar valor desde el primer día y contribuir al crecimiento del equipo.`;
  }
  return '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Browser
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

// ──────────────────────────────────────────────────────────────────────────────
// Helpers de diagnóstico
// ──────────────────────────────────────────────────────────────────────────────
async function snap(page, name) {
  try {
    await page.screenshot({ path: `debug-${name}.png`, fullPage: false });
    console.log(`  [DEBUG] Screenshot guardado: debug-${name}.png`);
  } catch {}
}

async function logPageState(page, step) {
  const url   = page.url();
  const title = await page.title().catch(() => '?');
  console.log(`  [ESTADO ${step}] URL  : ${url}`);
  console.log(`  [ESTADO ${step}] Título: ${title}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Login Computrabajo — con verificación paso a paso y screenshots
// ──────────────────────────────────────────────────────────────────────────────
async function loginComputrabajo(page, credentials) {
  console.log('\n╔══ LOGIN COMPUTRABAJO ══════════════════════════════');

  // ── PASO 1: Navegar a login ───────────────────────────────────────────────
  console.log('[PASO 1] Navegando a https://candidato.co.computrabajo.com/acceso/');
  await page.goto('https://candidato.co.computrabajo.com/acceso/', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await page.waitForTimeout(2000); // dar tiempo al JS de la página
  await snap(page, 'login-01-llegada');
  await logPageState(page, '1');

  // ¿Ya hay sesión activa?
  // Computrabajo redirige a secure.computrabajo.com/Account/Login cuando NO hay sesión
  const isOnLoginPage = (url) =>
    url.includes('/acceso/') ||
    url.includes('secure.computrabajo.com/Account/Login') ||
    url.includes('/Account/Login');

  if (!isOnLoginPage(page.url())) {
    console.log('[PASO 1] ✓ Sesión ya activa — URL no es página de login');
    return true;
  }

  console.log(`[PASO 1] Página de login detectada: ${page.url().slice(0, 60)}...`);

  // ── PASO 2: Verificar que existe el campo email ───────────────────────────
  console.log('[PASO 2] Buscando campo de email...');
  const emailSelectors = [
    'input[name="Email"]',
    'input[id="Email"]',
    'input[name="email"]',
    'input[id="email"]',
    'input[type="email"]',
    'input[placeholder*="correo" i]',
    'input[placeholder*="email" i]',
  ];

  let emailField = null;
  for (const sel of emailSelectors) {
    emailField = await page.$(sel).catch(() => null);
    if (emailField) { console.log(`  [PASO 2] Campo email encontrado: ${sel}`); break; }
  }

  if (!emailField) {
    console.log('  [PASO 2] ERROR: No se encontró el campo de email');
    // Mostrar todos los inputs visibles como diagnóstico
    const inputs = await page.$$eval('input', els =>
      els.map(e => ({ type: e.type, name: e.name, id: e.id, placeholder: e.placeholder, visible: e.offsetParent !== null }))
    ).catch(() => []);
    console.log('  [DIAGNÓSTICO] Inputs en página:', JSON.stringify(inputs));
    await snap(page, 'login-02-sin-email');
    return false;
  }

  // ── PASO 3: Llenar email ──────────────────────────────────────────────────
  console.log('[PASO 3] Llenando email...');
  await emailField.click();
  await page.waitForTimeout(300);
  await emailField.fill('');
  await page.waitForTimeout(200);
  await emailField.type(credentials.computrabajo?.email || '', { delay: 60 });

  // Verificar que el valor quedó
  const emailVal = await emailField.inputValue().catch(() => '');
  console.log(`  [PASO 3] Valor en campo: "${emailVal.slice(0, 20)}..."`);
  if (!emailVal) {
    console.log('  [PASO 3] ADVERTENCIA: El campo quedó vacío');
  }

  await page.waitForTimeout(500);
  await snap(page, 'login-03-email-llenado');

  // ── PASO 4: Botón "Continuar" si existe (email-first flow) ────────────────
  const continueBtnSelectors = [
    'button:has-text("Continuar")',
    'button:has-text("Siguiente")',
    'input[value="Continuar"]',
    'a:has-text("Continuar")',
  ];
  for (const sel of continueBtnSelectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn && await btn.isVisible().catch(() => false)) {
      console.log(`[PASO 4] Clic en botón "${await btn.textContent().catch(() => sel)}"...`);
      await btn.click();
      await page.waitForTimeout(1500);
      await snap(page, 'login-04-tras-continuar');
      await logPageState(page, '4');
      break;
    }
  }

  // ── PASO 5: Buscar campo de contraseña ────────────────────────────────────
  console.log('[PASO 5] Buscando campo de contraseña...');
  const passSelectors = [
    'input[name="Password"]',
    'input[id="Password"]',
    'input[name="password"]',
    'input[id="password"]',
    'input[type="password"]',
  ];

  let passField = null;
  for (const sel of passSelectors) {
    passField = await page.waitForSelector(sel, { timeout: 6000 }).catch(() => null);
    if (passField) { console.log(`  [PASO 5] Campo password encontrado: ${sel}`); break; }
  }

  if (!passField) {
    console.log('  [PASO 5] ERROR: No se encontró el campo de contraseña');
    const inputs = await page.$$eval('input', els =>
      els.map(e => ({ type: e.type, name: e.name, id: e.id, visible: e.offsetParent !== null }))
    ).catch(() => []);
    console.log('  [DIAGNÓSTICO] Inputs en página:', JSON.stringify(inputs));
    await snap(page, 'login-05-sin-password');
    return false;
  }

  // ── PASO 6: Llenar contraseña ─────────────────────────────────────────────
  console.log('[PASO 6] Llenando contraseña...');
  await passField.click();
  await page.waitForTimeout(300);
  await passField.fill('');
  await page.waitForTimeout(200);
  await passField.type(credentials.computrabajo?.password || '', { delay: 60 });

  const passVal = await passField.inputValue().catch(() => '');
  console.log(`  [PASO 6] Contraseña llenada: ${passVal.length > 0 ? `${passVal.length} caracteres ✓` : 'VACÍO ✗'}`);

  await page.waitForTimeout(500);
  await snap(page, 'login-06-password-llenado');

  // ── PASO 7: Clic en submit ────────────────────────────────────────────────
  // El botón real es: <a id="btnSubmitPass" class="b_primary mt15" btn-submit="">Iniciar sesión</a>
  // Es un <a>, no <button>, y el body puede interceptar clicks nativos → usar JS click
  console.log('[PASO 7] Buscando botón de submit (password)...');

  const submitSelectors = [
    '#btnSubmitPass',            // id exacto del botón de contraseña
    'a[btn-submit]',             // atributo btn-submit (específico de CT)
    'button[type="submit"]',
    'input[type="submit"]',
    'a.b_primary',               // clase del botón CT
    'button:has-text("Iniciar")',
    'button:has-text("Ingresar")',
    'button:has-text("Entrar")',
    'button:has-text("Acceder")',
  ];

  let submitSel = null;
  for (const sel of submitSelectors) {
    const el = await page.$(sel).catch(() => null);
    if (!el) continue;
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;
    const text = (await el.textContent().catch(() => '')).trim();
    // Asegurarse de que no sea el botón "Continuar" del paso email
    if (/^continuar$/i.test(text)) continue;
    console.log(`  [PASO 7] Selector encontrado: ${sel} — texto: "${text}"`);
    submitSel = sel;
    break;
  }

  if (!submitSel) {
    // Diagnóstico detallado
    const allEls = await page.$$eval('a, button, input[type=submit]', els =>
      els.map(e => ({
        tag: e.tagName,
        id: e.id,
        cls: e.className,
        type: e.getAttribute('type'),
        attrs: [...e.attributes].map(a => `${a.name}="${a.value}"`).join(' '),
        text: e.textContent?.trim().slice(0, 40),
        visible: e.offsetParent !== null,
      }))
    ).catch(() => []);
    console.log('  [DIAGNÓSTICO] Elementos interactivos:', JSON.stringify(allEls, null, 2));
    await snap(page, 'login-07-sin-submit');
    return false;
  }

  // Usar JS click para saltarse cualquier overlay que intercepte eventos
  console.log('[PASO 7] Ejecutando JS click para evitar intercepción del body...');
  const navPromise = page.waitForNavigation({ timeout: 20000, waitUntil: 'networkidle' }).catch(() => null);
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.click();
  }, submitSel);
  console.log('[PASO 7] JS click ejecutado, esperando navegación...');
  await navPromise;
  await page.waitForTimeout(2000);

  await snap(page, 'login-08-tras-submit');
  await logPageState(page, '8');

  // ── PASO 8: Verificar sesión activa ──────────────────────────────────────
  console.log('[PASO 8] Verificando sesión activa...');
  const urlFinal = page.url();

  const stillOnLogin = urlFinal.includes('/acceso/') ||
                       urlFinal.includes('secure.computrabajo.com/Account/Login') ||
                       urlFinal.includes('/Account/Login');

  if (stillOnLogin) {
    // Todavía en login — buscar error
    const errText = await page.$eval(
      '.val-summary, .error, [class*="error"], .alert, .message',
      el => el.textContent?.trim()
    ).catch(() => '');
    console.log(`  [PASO 8] ERROR: Sigue en página de login — URL: ${urlFinal.slice(0, 80)}`);
    console.log(`  [PASO 8] Mensaje de error: "${errText.slice(0, 120)}"`);
    await snap(page, 'login-09-error');
    return false;
  }

  // Verificar que hay indicadores de sesión (nombre, avatar, menú de usuario)
  const sessionIndicators = [
    '.user-name', '.username', '.candidato-name', '.header-user',
    'a[href*="logout"]', 'a[href*="salir"]', 'a[href*="cerrar"]',
    '[data-test="user-menu"]', '.my-account',
  ];
  let sessionConfirmed = false;
  for (const sel of sessionIndicators) {
    const el = await page.$(sel).catch(() => null);
    if (el && await el.isVisible().catch(() => false)) {
      const txt = await el.textContent().catch(() => '');
      console.log(`  [PASO 8] ✓ Sesión confirmada — elemento "${sel}": "${txt.trim().slice(0, 40)}"`);
      sessionConfirmed = true;
      break;
    }
  }

  if (!sessionConfirmed) {
    // Aunque no haya un indicador visible, si salió de /acceso/ consideramos OK
    console.log(`  [PASO 8] ✓ Salió de /acceso/ → sesión iniciada (URL: ${urlFinal.slice(0, 80)})`);
  }

  console.log('╚══ LOGIN CT EXITOSO ✓ ══════════════════════════════\n');
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Login LinkedIn — con verificación paso a paso
// ──────────────────────────────────────────────────────────────────────────────
async function loginLinkedIn(page, credentials) {
  console.log('\n╔══ LOGIN LINKEDIN ═══════════════════════════════════');

  console.log('[PASO 1] Navegando a https://www.linkedin.com/login');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await snap(page, 'li-01-llegada');
  await logPageState(page, 'LI-1');

  if (!page.url().includes('/login')) {
    console.log('[PASO 1] ✓ Ya logueado en LinkedIn');
    return true;
  }

  console.log('[PASO 2] Llenando email...');
  const emailField = await page.waitForSelector('input[name="session_key"], input[id="username"]', { timeout: 8000 }).catch(() => null);
  if (!emailField) {
    console.log('  [PASO 2] ERROR: No se encontró campo email en LinkedIn');
    await snap(page, 'li-02-sin-email');
    return false;
  }
  await emailField.fill(credentials.linkedin?.email || '');
  console.log(`  [PASO 2] Email llenado: ${(credentials.linkedin?.email||'').slice(0,15)}...`);

  console.log('[PASO 3] Llenando contraseña...');
  const passField = await page.waitForSelector('input[name="session_password"], input[id="password"]', { timeout: 5000 }).catch(() => null);
  if (!passField) {
    console.log('  [PASO 3] ERROR: No se encontró campo password en LinkedIn');
    await snap(page, 'li-03-sin-password');
    return false;
  }
  await passField.fill(credentials.linkedin?.password || '');
  console.log(`  [PASO 3] Contraseña llenada: ${(credentials.linkedin?.password||'').length} caracteres`);

  await snap(page, 'li-04-formulario-llenado');

  console.log('[PASO 4] Clic en submit...');
  const navPromise = page.waitForNavigation({ timeout: 20000, waitUntil: 'networkidle' }).catch(() => null);
  await page.click('button[type="submit"]');
  await navPromise;
  await page.waitForTimeout(2000);

  await snap(page, 'li-05-tras-submit');
  await logPageState(page, 'LI-5');

  const urlFinal = page.url();
  if (urlFinal.includes('/login') || urlFinal.includes('/checkpoint')) {
    console.log(`  [PASO 4] ERROR: Sigue en login/checkpoint — URL: ${urlFinal}`);
    // Puede ser verificación de seguridad
    const body = await page.textContent('body').catch(() => '');
    if (/verify|verificar|captcha|security/i.test(body)) {
      console.log('  [PASO 4] ATENCIÓN: Posible CAPTCHA o verificación de seguridad detectada');
    }
    return false;
  }

  console.log('╚══ LOGIN LI EXITOSO ✓ ═══════════════════════════════\n');
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Extraer links individuales de una página de listado (Computrabajo)
// ──────────────────────────────────────────────────────────────────────────────
async function extractJobLinksFromListing(page, listingUrl) {
  console.log(`\n[LISTADO] Navegando: ${listingUrl}`);
  await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Esperar a que aparezca al menos un elemento de oferta antes de extraer
  await page.waitForSelector(
    'article[data-code], [data-code], .box_offer, .js_o, h2 a[href]',
    { timeout: 8000 }
  ).catch(() => {});
  await page.waitForTimeout(2000); // dar tiempo extra al JS

  const baseUrl = listingUrl.split('#')[0]; // URL sin hash
  await snap(page, 'listado-' + listingUrl.split('/').pop().replace('#','').slice(0, 20));

  // ── Estrategia 1: a.js-o-link dentro de article[data-id] — URL canónica + estado postulado ──
  // HTML: <article data-id="HASH"><div class="tags"><span class="tag postulated">Postulado</span>
  let jobObjects = await page.$$eval(
    'article[data-id]',
    (articles) => articles.map(article => {
      const a = article.querySelector('a.js-o-link, h2 a[href*="oferta-de-trabajo"]');
      const url = a?.href || '';
      // Detectar si ya está postulado (tag visible, sin clase .hide)
      const postTag = article.querySelector('.tag.postulated:not(.hide), span[applied-offer-tag]:not(.hide)');
      const alreadyApplied = !!postTag;
      return url && url.includes('computrabajo') ? { url, alreadyApplied } : null;
    }).filter(Boolean)
  ).catch(() => []);
  // Deduplicar por URL
  const seen = new Set();
  jobObjects = jobObjects.filter(j => { if (seen.has(j.url)) return false; seen.add(j.url); return true; });
  console.log(`  [Estrategia 1 - js-o-link] ${jobObjects.length} ofertas (${jobObjects.filter(j=>j.alreadyApplied).length} ya postuladas)`);
  let links = jobObjects.map(j => j.url);

  // ── Estrategia 2: data-href-offer-apply en span[shortcut-apply-ac] → extraer oi= ──────────
  if (links.length === 0) {
    jobObjects = await page.$$eval(
      'span[shortcut-apply-ac][data-href-offer-apply], a[data-href-offer-apply]',
      (els) => [...new Set(
        els.map(e => {
          const applyUrl = e.getAttribute('data-href-offer-apply') || '';
          const oi = applyUrl.match(/[?&]oi=([A-Fa-f0-9]+)/)?.[1];
          const url = oi ? `https://co.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-empleo-${oi}` : null;
          if (!url) return null;
          const article = e.closest('article');
          const postTag = article?.querySelector('.tag.postulated:not(.hide), span[applied-offer-tag]:not(.hide)');
          return { url, alreadyApplied: !!postTag };
        }).filter(Boolean)
      )]
    ).catch(() => []);
    links = jobObjects.map(j => j.url);
    console.log(`  [Estrategia 2 - shortcut-apply-ac] ${links.length} ofertas`);
  }

  // ── Estrategia 3: article[data-id] → construir URL desde el id ──────────────
  if (links.length === 0) {
    const ids = await page.$$eval('article[data-id]', els =>
      els.map(e => e.getAttribute('data-id')).filter(Boolean)
    ).catch(() => []);
    links = [...new Set(ids)].map(id => `${baseUrl}#${id}`);
    console.log(`  [Estrategia 3 - article data-id] ${links.length} ofertas`);
  }

  // ── Diagnóstico si nada funcionó ────────────────────────────────────────────
  if (links.length === 0) {
    console.log('[LISTADO] Sin ofertas — dump diagnóstico:');

    // Todos los data-* atributos de los primeros 10 artículos/divs
    const articles = await page.$$eval('article, .box_offer, .js_o, li', els =>
      els.slice(0, 10).map(e => ({
        tag: e.tagName,
        cls: e.className.slice(0, 50),
        data: Object.fromEntries([...e.attributes].filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value.slice(0, 40)]))
      }))
    ).catch(() => []);
    console.log('  Artículos/contenedores:', JSON.stringify(articles, null, 2));

    // Todos los <a> con su href real y texto
    const anchors = await page.$$eval('a', els =>
      els.map(e => ({ text: e.textContent?.trim().slice(0, 40), href: e.getAttribute('href')?.slice(0, 80), full: e.href?.slice(0, 80) }))
         .filter(e => e.text || e.href)
         .slice(0, 30)
    ).catch(() => []);
    console.log('  Primeros 30 <a>:', JSON.stringify(anchors, null, 2));
  }

  console.log(`[LISTADO] Total: ${links.length} ofertas encontradas`);
  jobObjects.forEach((j, i) => console.log(`  [${i+1}] ${j.alreadyApplied ? '⏭ (postulado) ' : ''}${j.url.slice(0, 100)}`));
  return jobObjects;
}

// ──────────────────────────────────────────────────────────────────────────────
// Relevancia del candidato para la oferta
// ──────────────────────────────────────────────────────────────────────────────
function keywordMatch(text, candidate) {
  const cvText = [
    candidate.full_name || '',
    ...(candidate.skills || []),
    candidate.summary || '',
    candidate.title || '',
  ].join(' ').toLowerCase();

  const jobText = text.toLowerCase();

  // Siempre relevante si el título de la oferta contiene palabras clave del perfil
  const profileKeywords = (candidate.skills || []).map(s => s.toLowerCase());
  if (!profileKeywords.length) return true; // sin keywords → aplicar a todo

  const score = profileKeywords.filter(kw => jobText.includes(kw)).length;
  return score > 0;
}

// Filtra por perfil usando el slug de la URL (sin navegar — rápido)
function isDevJobUrl(url) {
  const slug = url.toLowerCase();
  // Rechazar explícitamente roles que NO son desarrollo de software
  const hardReject = [
    'con-moto', 'moto-propia', 'canal-con-moto', '-vendedor', '-ventas-',
    'ventas-b2b', 'ejecutivo-comercial', 'asesor-comercial', 'representante-comercial',
    'business-developer', 'business-development', 'coordinador-operaciones',
    'sector-energetico', 'sector-electrico', 'mercado-electrico',
    'torno-cnc', 'operador-maquina', '-mercaderista', '-tat-', 'corte-confeccion',
    'contador-publico', '-abogado', '-juridico', '-enfermero', '-medico-',
    '-psicologo', '-cocinero', '-chef-', '-mesero', '-cajero',
    'promotor-de-ventas', 'agente-comercial', '-agente-de-ventas',
    'desarrollador-de-canal', // "desarrollador" pero es ventas
    'de-negocios',            // "desarrollador de negocios" = ventas
    '-negocios',              // de-nuevos-negocios, de-negocios, etc.
    'cuenta-canal',           // desarrollador de cuenta canal = ventas
    'canal-distribuidores',   // canal de distribución = ventas
    'de-marketing',           // "desarrollador de marketing" = comercial
    'desarrollador-comercial',
    'programador-torno',      // "programador torno CNC" = manufactura
    'programador-de-turnos',  // turnos de trabajo, no software
  ];
  if (hardReject.some(kw => slug.includes(kw))) return false;
  // Aceptar roles de desarrollo
  const devAccept = [
    'desarrollador', 'programador', 'developer', 'fullstack', 'full-stack',
    'frontend', 'front-end', 'backend', 'back-end', 'software', 'qa-engineer',
    'quality-assurance', 'analista-desarrollador', 'analista-programador',
    'arquitecto-software', 'devops', 'data-engineer', 'ingeniero-desarrollo',
    'tecnico-sistemas', 'analista-sistemas', 'ingeniero-sistemas',
    'automatizacion-rpa', 'machine-learning', 'inteligencia-artificial',
    'soporte-ti', 'infraestructura-ti', 'application-developer',
  ];
  return devAccept.some(kw => slug.includes(kw));
}

// ──────────────────────────────────────────────────────────────────────────────
// Navegación a oferta y detección del botón de aplicar
// ──────────────────────────────────────────────────────────────────────────────
async function navigateToJobAndGetApplyButton(page, url) {
  // Navegar a través de candidato portal si es una URL directa de oferta
  // El portal candidato maneja la aplicación directamente
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);

  console.log(`[JOB] URL actual: ${page.url().slice(0, 100)}`);

  // ── Filtro de antigüedad: saltar ofertas publicadas hace más de 5 días ──
  // HTML real: <p class="fs13 fc_aux mt15">Hace 3 días</p>
  // Buscar el texto de fecha dentro del bloque de la oferta, evitando badges genéricos
  const ageText = await page.evaluate(() => {
    // Intentar selector específico primero
    const candidates = [
      '.date_offer', '.time_posting', '.posted_at', '.offer_date',
      'p.fs13.fc_aux.mt15', 'p.mt15.fs13', '.fs13.fc_aux'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const t = el.textContent?.trim() || '';
      // Solo aceptar si parece una fecha relativa, no un slogan
      if (/hace|d[ií]a|semana|mes|hoy|ayer|today|ago|posted|publicad/i.test(t)) return t;
    }
    // Fallback: buscar cualquier p con texto de fecha relativa
    for (const p of document.querySelectorAll('p, span')) {
      const t = p.textContent?.trim() || '';
      if (t.length < 60 && /hace|m[aá]s de|publicad/i.test(t)) return t;
    }
    return '';
  }).catch(() => '');
  if (ageText) {
    if (isOfferTooOld(ageText)) {
      console.log(`[JOB] ⏱  Oferta antigua ("${ageText}") — omitiendo`);
      return { status: 'too-old' };
    } else {
      console.log(`[JOB] ✅ Reciente: "${ageText}"`);
    }
  }

  // Verificar si ya aplicó a esta oferta.
  // IMPORTANTE: Solo checar en páginas de oferta individual, no en listados.
  // En la página de oferta individual aparece el botón "Postulado" o el tag .postulated visible
  const isOfferPage = page.url().includes('/oferta-de-trabajo') || page.url().includes('/candidate/apply');
  if (isOfferPage) {
    // Chequear tag .postulated visible (no oculto con clase .hide)
    const alreadyApplied = await page.$eval(
      '.tag.postulated:not(.hide), .postulated:not(.hide)',
      el => el.textContent?.includes('Postulado')
    ).catch(() => false);
    if (alreadyApplied) return { status: 'already-applied' };

    // Chequear página de confirmación
    const bodyText = await page.textContent('body').catch(() => '');
    if (/ya te postulaste|ya aplicaste|ya est[aá]s postulado/i.test(bodyText)) {
      return { status: 'already-applied' };
    }
  }

  // ── Botón de aplicar: prioridad al shortcut-apply-ac que tiene data-href-offer-apply ──
  // HTML real: <span shortcut-apply-ac data-href-offer-apply="https://candidato.co.computrabajo.com/candidate/apply/?oi=HASH&p=280&idb=1&d=32">
  const applySelectors = [
    'span[shortcut-apply-ac][data-href-offer-apply]', // shortcut en listado
    'a[data-href-offer-apply]',
    'span[data-href-offer-apply]',
    'a[href*="candidato.co.computrabajo.com/candidate/apply"]',
    'a[data-href-access*="candidato"]',
    'span[data-href-access*="candidato"]',
    'a:has-text("Postúlate")',
    'button:has-text("Postúlate")',
    'a:has-text("Aplicar ahora")',
  ];

  for (const sel of applySelectors) {
    const el = await page.$(sel).catch(() => null);
    if (!el) continue;
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;

    const href =
      await el.getAttribute('data-href-offer-apply').catch(() => null) ||
      await el.getAttribute('href').catch(() => null) ||
      await el.getAttribute('data-href-access').catch(() => null);

    console.log(`[JOB] Botón de aplicar: ${sel}  url=${href?.slice(0, 80)}`);
    return { status: 'found', element: el, href };
  }

  // Debug: mostrar qué hay en la página
  const visible = await page.$$eval('a, button', els =>
    els.map(e => ({ tag: e.tagName, text: (e.textContent||'').trim().slice(0, 50), href: e.getAttribute('href')||'' }))
       .filter(e => e.text || e.href)
       .slice(0, 20)
  ).catch(() => []);
  console.log('[JOB] Elementos interactivos:');
  visible.forEach(e => console.log(`  <${e.tag}> "${e.text}" → ${e.href.slice(0,70)}`));

  return { status: 'not-found' };
}

// ──────────────────────────────────────────────────────────────────────────────
// Llenar formulario (reglas + IA)
// ──────────────────────────────────────────────────────────────────────────────
async function fillForm(page, candidate, cvContent) {
  // Esperar a que cargue el formulario
  await page.waitForTimeout(1500);

  // ── Pre-scan: en páginas /candidate/kq extraer el texto de cada pregunta por índice ──
  // Estructura real: cada pregunta está en un <li> o <div> con la pregunta en <p>/<label>/<b>
  // y el input con name="KillerQuestions[N].OpenQuestion"
  const kqLabels = {}; // { 'KillerQuestions[0].OpenQuestion': 'texto de pregunta' }
  if (page.url().includes('/candidate/kq') || page.url().includes('/candidate/k')) {
    const kqData = await page.evaluate(() => {
      const result = {};
      // Intentar varios selectores de contenedores de pregunta
      const ITEM_SEL = [
        'li.question', 'li.kq-item', '.question-item', '.kq', 'li',
        '.field_input', '.form-group', 'div.question'
      ];
      // Solo inputs de tipo OpenQuestion (los que se responden con texto libre)
      // Los hidden fields Id/Type/etc. comparten el mismo contenedor → ignorarlos
      const inputs = document.querySelectorAll(
        'input[name$=".OpenQuestion"], textarea[name$=".OpenQuestion"], ' +
        'input[name$=".ClosedQuestion"], textarea[name$=".ClosedQuestion"]'
      );
      inputs.forEach(input => {
        const fieldName = input.name;
        // Subir el árbol buscando un contenedor con texto
        let el = input.parentElement;
        for (let depth = 0; depth < 8 && el; depth++) {
          // Clonar y quitar inputs para extraer solo texto
          const clone = el.cloneNode(true);
          clone.querySelectorAll('input,textarea,select,button,script,style').forEach(e => e.remove());
          const txt = clone.textContent?.trim().replace(/\s+/g, ' ');
          if (txt && txt.length > 8) {
            result[fieldName] = txt;
            break;
          }
          el = el.parentElement;
        }
      });
      return result;
    }).catch(() => ({}));

    Object.assign(kqLabels, kqData);
    if (Object.keys(kqLabels).length > 0) {
      const openOnly = Object.entries(kqLabels).filter(([k]) => k.includes('OpenQuestion') || k.includes('ClosedQuestion'));
      console.log(`[KQ] ${openOnly.length} preguntas abiertas detectadas:`);
      openOnly.forEach(([k, v]) => console.log(`  ${k}: "${v.slice(0, 100)}"`));
    } else {
      // Dump HTML para diagnóstico cuando no se encuentra nada
      const html = await page.content().catch(() => '');
      const bodySnip = html.slice(html.indexOf('<body'), html.indexOf('<body') + 4000);
      console.log('[KQ] No se detectaron preguntas. HTML (primeros 4000 chars body):');
      console.log(bodySnip.slice(0, 2000));
    }
  }

  const fields = await page.$$(
    'input:not([type=hidden]):not([type=file]):not([type=submit]), textarea, select'
  ).catch(() => []);

  console.log(`[FORM] ${fields.length} campos`);
  const filled = [];

  for (const field of fields) {
    const name        = await field.getAttribute('name').catch(() => '') || '';
    const placeholder = await field.getAttribute('placeholder').catch(() => '') || '';
    const id          = await field.getAttribute('id').catch(() => '') || '';
    const type        = await field.getAttribute('type').catch(() => 'text') || 'text';
    const tagName     = await field.evaluate(el => el.tagName.toLowerCase()).catch(() => 'input');
    const isVisible   = await field.isVisible().catch(() => false);

    if (!isVisible) continue;
    if (['checkbox', 'radio'].includes(type)) continue;

    // Buscar label — kqLabels primero (pre-scan), luego estrategia DOM
    let label = '';
    if (kqLabels[name]) {
      label = kqLabels[name]; // texto real de la pregunta del pre-scan
    } else if (id) {
      label = await page.$eval(`label[for="${id}"]`, el => el.textContent?.trim() || '').catch(() => '');
    }
    // KillerQuestions: la pregunta está en el li/div padre como texto directo o en un p/span
    if (!label && /KillerQuestion/i.test(name)) {
      label = await field.evaluate(el => {
        const containers = ['.kq-item', '.killer-question', 'li', '.question', '.field_input', '.form-group'];
        for (const c of containers) {
          const container = el.closest(c);
          if (container) {
            // Buscar el texto de la pregunta dentro del contenedor
            const q = container.querySelector('p, span.pregunta, .question-text, label, h3, h4, b, strong');
            const t = q?.textContent?.trim();
            if (t && t.length > 4) return t;
            // Fallback: texto directo del contenedor sin el input
            const clone = container.cloneNode(true);
            clone.querySelectorAll('input,textarea,select,button').forEach(e => e.remove());
            const txt = clone.textContent?.trim().replace(/\s+/g, ' ');
            if (txt && txt.length > 4) return txt;
          }
        }
        return '';
      }).catch(() => '');
    }
    if (!label) label = await field.evaluate(el => {
      const CONTAINERS = ['.question', '.question-container', '.kq-item', '.kq', '.field_input', '.form-group', '.row', '.input-wrap'];
      let container = null;
      for (const c of CONTAINERS) { container = el.closest(c); if (container) break; }
      if (!container) container = el.parentElement;
      const textEl = container?.querySelector('label, .label, .pregunta, h3, h4, p, .question-text, [class*=question]');
      return textEl?.textContent?.trim() || '';
    }).catch(() => '');
    // Fallback: texto en elemento previo o abuelo
    if (!label) label = await field.evaluate(el => {
      let prev = el.previousElementSibling;
      while (prev) { const t = prev.textContent?.trim(); if (t && t.length > 3) return t; prev = prev.previousElementSibling; }
      const parentPrev = el.parentElement?.previousElementSibling?.textContent?.trim();
      return parentPrev || '';
    }).catch(() => '');

    // ── Inferencia de reglas: primero intento con nombre/placeholder/label ──
    let value = guessValue(name, placeholder, label, candidate);

    // ── Reglas adicionales para cuestionarios de CT (preguntas en español) ──
    if (!value) {
      const q = (label || placeholder || name).toLowerCase();
      const skills = (candidate.skills||[]).join(', ') || 'JavaScript, TypeScript, Node.js, Angular, React, MySQL';
      const cvName = candidate.full_name || 'Cristian Camilo Montes Teheran';
      const cvLocation = candidate.location || 'Bogotá DC, Colombia';
      if (/d[oó]nde vive|localidad|barrio|ubicaci[oó]n/.test(q))
        value = cvLocation;
      else if (/n[uú]mero de contacto|whatsapp|tel[eé]fono|celular/.test(q))
        value = candidate.phone || '';
      else if (/aspiraci[oó]n salarial|salario esperado|pretens/.test(q))
        value = 'Entre $2.000.000 y $3.000.000 COP mensuales.';
      else if (/expectativa salarial|aspiraci[oó]n salarial|salario esperado|cuánto.*salario|salario.*espera|salario.*aspira/.test(q))
        value = 'Mi expectativa salarial es entre $2.000.000 y $3.000.000 COP mensuales.';
      else if (/de acuerdo.*asignaci[oó]n|acuerdo.*salario|asignaci[oó]n.*de acuerdo|conforme.*salario|salario.*conforme/.test(q))
        value = 'Sí, estoy de acuerdo con la asignación salarial ofrecida.';
      else if (/[uú]ltimo salario|salario mensual|salario actual/.test(q))
        value = 'Entre $2.000.000 y $3.000.000 COP.';
      else if (/tipo de contrato|modalidad de contrato|contrato m[aá]s reciente/.test(q))
        value = 'Contrato a término fijo.';
      else if (/api[s]?|base[s]? de datos|bd|database/.test(q))
        value = 'Sí, tengo experiencia con APIs REST y bases de datos SQL (MySQL). He desarrollado endpoints con Node.js/NestJS/Express y consumido APIs de terceros en proyectos Angular y React.';
      else if (/html|css|javascript|frontend|front.end/.test(q))
        value = 'Tengo conocimientos sólidos en HTML5, CSS3 y JavaScript ES6+/TypeScript. He trabajado con Angular y React en proyectos reales incluyendo una página institucional con autenticación y pasarela de pago.';
      else if (/nivel de ingl[eé]s|english|idioma/.test(q))
        value = 'B1. Lectura técnica fluida en inglés, conversación básica.';
      else if (/experiencia|funciones|cargo|tiempo/.test(q))
        value = `Tengo más de 1 año de experiencia en desarrollo de software. En SERVIMAX desarrollé una página institucional con autenticación, APIs de productos y pasarela de pago (Angular, Node.js, MySQL). En INTELIBPO implementé flujos RPA con n8n y Node.js/NestJS para automatización de cobranza.`;
      else if (/tecnol[oó]go|t[eé]cnico|estudiante|semestre|ingenier/.test(q))
        value = 'Sí, soy Tecnólogo en Análisis y Desarrollo de Software del SENA (2024) y cuento con formación adicional en Ingeniería de Sistemas.';
      else if (/conocimiento|access|power.?bi|query|sql|python/.test(q))
        value = `Sí, tengo conocimientos en SQL (MySQL), y las siguientes tecnologías: ${skills}. He trabajado con bases de datos relacionales en proyectos de producción.`;
      else if (/condiciones solicitadas|condiciones del cargo|requisitos solicitados|cuentas con las condiciones/.test(q))
        value = 'Sí, cuento con las condiciones solicitadas para el cargo y tengo disponibilidad inmediata.';
      else if (/disponibilidad|horario|turno/.test(q))
        value = 'Sí, tengo disponibilidad inmediata para jornada completa.';
      else if (/ciudad|municipio|reside/.test(q))
        value = cvLocation;
      else if (/nombre completo|nombres y apellidos/.test(q))
        value = cvName;
      else if (/nivel acad[eé]mico|estudios|formaci[oó]n|t[ií]tulo|qu[eé] estudiaste/.test(q))
        value = 'Tecnólogo en Análisis y Desarrollo de Software — SENA 2024. Formación complementaria en Ingeniería de Sistemas (Uniagustiniana) y cursos en Platzi/Udemy.';
      else if (/c#|csharp|\.net|net core|net framework/i.test(q))
        value = 'No tengo experiencia directa en C# y .NET, pero cuento con bases sólidas en programación orientada a objetos con TypeScript/Node.js y capacidad de aprendizaje rápido.';
      else if (/docker|kubernetes|contenedor|container/i.test(q))
        value = 'Tengo conocimientos básicos de Docker para entornos de desarrollo local. Lo he usado para contenedores de bases de datos y servicios. Estoy en proceso de profundizar.';
      else if (/git|github|control de versiones|repositorio|versionamiento/i.test(q))
        value = 'Sí, uso Git y GitHub en todos mis proyectos. Manejo branches, commits semánticos, pull requests, merge y resolución de conflictos. Repositorio: github.com/camilomont';
      else if (/escala.*[1-5]|califica.*nivel|puntúa|[0-9].*siendo.*[0-9]/.test(q))
        value = '3';
      else if (/angular/i.test(q))
        value = 'Sí, tengo experiencia en Angular (v14+). Usé Angular en SERVIMAX para desarrollar la interfaz de la página institucional con autenticación, consumo de APIs y gestión de estado.';
      else if (/react/i.test(q))
        value = 'Sí, tengo experiencia en React. He desarrollado componentes, hooks personalizados y consumo de APIs REST en proyectos personales y en SERVIMAX.';
      else if (/node\.?js|nodejs/i.test(q))
        value = 'Sí, uso Node.js como runtime principal en el backend. He desarrollado APIs REST con Express y NestJS, incluyendo proyectos en SERVIMAX e INTELIBPO.';
      else if (/python/i.test(q))
        value = 'Tengo conocimientos básicos de Python. Lo he usado para scripts de automatización y procesamiento de datos, aunque mi stack principal es JavaScript/TypeScript.';
      else if (/n8n|automatizaci[oó]n|rpa|bot/i.test(q))
        value = 'Sí, tengo experiencia en n8n y automatización RPA. En INTELIBPO implementé flujos para recepción de archivos SFTP/correo/nube y transformación de datos para clientes.';
      else if (/php|laravel|symfony/i.test(q))
        value = 'No tengo experiencia en PHP/Laravel, pero tengo bases sólidas en programación web y puedo aprenderlo. Mi stack principal es JavaScript/TypeScript.';
      else if (/java\b/i.test(q) && !/javascript/i.test(q))
        value = 'No tengo experiencia en Java, pero manejo programación orientada a objetos con TypeScript y estoy dispuesto a aprender.';
    }

    // ── Fallback: IA si está disponible y aún no hay valor ──
    if (!value && cvContent) {
      const question = label || placeholder || name;
      if (question && question.length > 2) {
        const aiPrompt = `Eres un asistente honesto que completa formularios de empleo en Colombia.\nResponde de forma honesta basándote en este CV. Si el candidato no tiene experiencia en algo, dilo con disposición de aprender (máx 200 caracteres).\n\nCV:\nNombre: Cristian Camilo Montes Teheran\nTecnólogo en Análisis y Desarrollo de Software — SENA 2024\nExperiencia: SERVIMAX (dev full stack 6m, Angular/Node.js/MySQL) + INTELIBPO (RPA n8n/NestJS 2m)\nSkills: JavaScript, TypeScript, Angular, React, Node.js, NestJS, Express, MySQL, MongoDB, Git, Docker básico, n8n\nInglés B1\n\nCampo del formulario: ${question}`;
        value = await askAI(aiPrompt, cvContent) || '';
        if (value) console.log(`[FORM/IA] "${question.slice(0,50)}" → "${value.slice(0,60)}"`);
      }
    }

    if (!value) {
      console.log(`[FORM] Sin valor para: ${label || name || placeholder} (${type})`);
      continue;
    }

    // Llenar el campo
    if (tagName === 'select') {
      // Leer las opciones reales del select y elegir la más adecuada
      const selectOptions = await field.evaluate(el => {
        return Array.from(el.options)
          .filter(o => o.value && o.value !== '0' && o.value !== '')
          .map(o => ({ value: o.value, text: o.text?.trim() }));
      }).catch(() => []);

      if (selectOptions.length > 0) {
        // Intentar match directo primero
        let matchedVal = selectOptions.find(o => o.text.toLowerCase().includes(value.toLowerCase().slice(0,15)))?.value;
        // Si no hay match y hay IA, pedir que elija de las opciones reales
        if (!matchedVal && cvContent) {
          const opts = selectOptions.map(o => o.text).join(' | ');
          const aiQ = `Campo: "${label || name}"\nOpciones: ${opts}\nElige la opción más adecuada para el candidato. Responde SOLO el texto exacto de una opción.`;
          const aiPick = await askAI(aiQ, cvContent);
          if (aiPick) {
            matchedVal = selectOptions.find(o => o.text.toLowerCase().includes(aiPick.toLowerCase().slice(0,15)))?.value;
          }
        }
        if (!matchedVal) matchedVal = selectOptions[0].value; // primera opción
        await field.selectOption(matchedVal).catch(async () => {
          await field.selectOption({ label: value }).catch(() => {});
        });
      } else {
        await field.selectOption({ label: value }).catch(async () => {
          await field.selectOption(value).catch(() => {});
        });
      }
    } else {
      await field.fill(String(value)).catch(() => {});
    }

    const fieldLabel = label || name || placeholder || id;
    filled.push(fieldLabel);
    console.log(`[FORM] "${fieldLabel}" = "${String(value).slice(0,60)}"`);
  }

  // ── Manejar KillerQuestions ClosedQuestion: radio buttons y selects con opciones ──
  // CT usa radios para preguntas de opción múltiple (ej. rango salarial, sí/no)
  const kqRadioGroups = await page.evaluate(() => {
    const radios = document.querySelectorAll('input[type=radio][name*="KillerQuestion"]');
    const groups = {};
    radios.forEach(r => {
      const name = r.name; // e.g. "KillerQuestions[1].ClosedQuestion"
      if (!groups[name]) {
        // Extraer índice N del nombre del campo
        const nMatch = name.match(/\[(\d+)\]/);
        const n = nMatch ? nMatch[1] : null;
        // 1. Leer título exacto desde hidden input KillerQuestions[N].Title (más confiable)
        let questionText = '';
        if (n !== null) {
          const titleInput = document.querySelector(`input[name="KillerQuestions[${n}].Title"]`);
          questionText = titleInput?.value || '';
        }
        // 2. Fallback: <label class="fs16"> más cercano
        if (!questionText) {
          let container = r.parentElement;
          for (let d = 0; d < 8 && container; d++) {
            const lbl = container.querySelector('label.fs16');
            if (lbl && !lbl.querySelector('input')) { questionText = lbl.textContent?.trim() || ''; break; }
            container = container.parentElement;
          }
        }
        groups[name] = { n, questionText, options: [] };
      }
      // Leer texto de la opción desde DataOptions[I].Answer (el value del radio es el índice)
      const { n } = groups[name];
      const idx = r.value; // índice: 0, 1, 2...
      let labelText = '';
      // 1. Hidden input DataOptions[idx].Answer (fuente más confiable)
      if (n !== null) {
        const answerInput = document.querySelector(`input[name="KillerQuestions[${n}].DataOptions[${idx}].Answer"]`);
        labelText = answerInput?.value || '';
      }
      // 2. Fallback: span.label_box dentro del label envolvente
      if (!labelText) {
        const span = r.closest('label')?.querySelector('.label_box');
        labelText = span?.textContent?.trim() || '';
      }
      // 3. Fallback: clonar label y quitar inputs
      if (!labelText) {
        const wrappingLabel = r.closest('label');
        if (wrappingLabel) {
          const clone = wrappingLabel.cloneNode(true);
          clone.querySelectorAll('input').forEach(e => e.remove());
          labelText = clone.textContent?.trim().replace(/\s+/g, ' ') || '';
        }
      }
      groups[name].options.push({ value: r.value, label: labelText || r.value });
    });
    return groups;
  }).catch(() => ({}));

  // ─────────────────────────────────────────────────────────────────────────
  // Perfil honesto del candidato — usado por la IA y la heurística
  // Actualizar aquí si cambia la formación o experiencia real
  // ─────────────────────────────────────────────────────────────────────────
  const CANDIDATE_KQ = {
    formacion: 'Tecnólogo en Análisis y Desarrollo de Software, SENA 2024 (titulado)',
    nivel: 'tecnólogo titulado — NO ingeniero universitario, NO tiene maestría ni especialización',
    experiencia: '8 meses en desarrollo de software',
    detalle: [
      'SERVIMAX: Desarrollador Full Stack, 6 meses — JavaScript, TypeScript, Angular, Node.js, MySQL, REST APIs',
      'INTELIBPO: Desarrollador RPA Junior, 2 meses — automatización de procesos, Python básico',
    ],
    // Skills que SÍ tiene el candidato (nivel básico a intermedio)
    si: [
      'javascript', 'typescript', 'html', 'css', 'angular', 'react', 'vue', 'node', 'nodejs',
      'nestjs', 'express', 'mysql', 'sql', 'mongodb', 'git', 'github', 'docker', 'bootstrap',
      'tailwind', 'n8n', 'postman', 'rest', 'api', 'python', 'rpa', 'automatización',
      'automatizacion', 'tres capas', 'mvc', 'scrum', 'agile', 'bases de datos',
      'phyton',  // typo frecuente de "python" en formularios CT
    ],
    // Tecnologías que NO domina (responder honestamente "no" o nivel mínimo)
    no: [
      'sap', 'erp', 'salesforce', 'power bi', 'powerbi', 'tableau', 'qlik', 'looker',
      'java', 'spring', 'c#', '.net', 'php', 'laravel', 'ruby', 'kotlin', 'swift',
      'aws', 'azure', 'gcp', 'cloud', 'kubernetes', 'terraform', 'oracle', 'pl/sql',
      'hadoop', 'spark', 'elasticsearch', 'redis', 'kafka', 'coldfusion',
    ],
    ingles: 'B1 conversacional — lee y escribe con fluidez, habla con acento',
    ubicacion: 'Bogotá D.C., disponible trabajo presencial o remoto',
    salario: 'entre 2.000.000 y 3.000.000 COP mensual',
    disponibilidad: 'inmediata',
  };

  // ─────────────────────────────────────────────────────────────────────────
  // pickOptionWithAI: usa la IA con el perfil completo para elegir opción
  // Devuelve { idx, value, label } o null si la IA no está disponible
  // ─────────────────────────────────────────────────────────────────────────
  async function pickOptionWithAI(questionText, options) {
    const optList = options.map((o, i) => `${i}: "${o.label}"`).join('\n');
    const prompt =
`FORMULARIO DE EMPLEO EN COLOMBIA — RESPONDE CON TOTAL HONESTIDAD.

PERFIL DEL CANDIDATO:
- Formación: ${CANDIDATE_KQ.formacion}
- Nivel académico: ${CANDIDATE_KQ.nivel}
- Experiencia total: ${CANDIDATE_KQ.experiencia}
  * ${CANDIDATE_KQ.detalle.join('\n  * ')}
- Habilidades que SÍ tiene (básico a intermedio): ${CANDIDATE_KQ.si.join(', ')}
- Tecnologías que NO domina: ${CANDIDATE_KQ.no.join(', ')}
- Inglés: ${CANDIDATE_KQ.ingles}
- Ubicación: ${CANDIDATE_KQ.ubicacion}
- Aspiración salarial: ${CANDIDATE_KQ.salario}
- Disponibilidad: ${CANDIDATE_KQ.disponibilidad}

REGLAS OBLIGATORIAS:
1. Si la pregunta es sobre una tecnología que NO domina → elige la opción más honesta de "no" o nivel mínimo.
2. Si tiene la habilidad pero a nivel básico/académico → elige "básico" o "proyectos académicos", NUNCA "avanzado".
3. Si pregunta sobre autorización de datos / privacidad / política → responde Sí / Acepto.
4. Si pregunta sobre disponibilidad presencial / vivir en Bogotá / lugar de trabajo → Sí.
5. Para salario: elige la opción que más se acerque a ${CANDIDATE_KQ.salario}.
6. NUNCA inventes experiencia. NUNCA exageres el nivel. La honestidad protege al candidato.

PREGUNTA DEL FORMULARIO:
"${questionText}"

OPCIONES DISPONIBLES:
${optList}

Responde ÚNICAMENTE con el número de índice de la opción correcta (0, 1, 2, ...). Sin texto adicional.`;

    const answer = await askAIRaw(prompt);
    if (!answer) return null;
    const m = answer.trim().match(/^(\d+)/);
    if (!m) return null;
    const idx = parseInt(m[1], 10);
    if (isNaN(idx) || idx < 0 || idx >= options.length) return null;
    return { idx, value: options[idx].value, label: options[idx].label };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // pickOptionHeuristic: cuando la IA no está disponible
  // Lee semánticamente la pregunta + opciones + perfil → elige honestamente
  // ─────────────────────────────────────────────────────────────────────────
  function pickOptionHeuristic(questionText, options) {
    // Normalizar typos frecuentes en Computrabajo antes de evaluar
    const q = questionText.toLowerCase()
      .replace(/phyton/g, 'python')          // typo muy frecuente
      .replace(/javascrip\b/g, 'javascript') // truncado
      .replace(/postgress?/g, 'sql')          // PostgreSQL mal escrito
      .replace(/mongo\s*db/g, 'mongodb');     // separado

    // ── Helper: opción de menor experiencia/más conservadora ─────────────────
    // Siempre devuelve ALGO (options[0] como último recurso absoluto).
    function minOption() {
      return (
        options.find(o => /^no\b|sin experiencia|no tengo|no cuento|no manejo|ninguna?$/i.test(o.label.trim()))
        || options.find(o => /pero aprendo|puedo aprender/i.test(o.label))
        // Rangos tipo "Menos de 1 año", "0-1 años", "0 a 1 año", "1 año o menos"
        || options.find(o => /menos de 1|menor a 1|0\s*[-–a]\s*1|0[-–]1|\b0\s*años|\b1\s*año\b.*o menos/i.test(o.label))
        || options.find(o => /nivel b[aá]sico/i.test(o.label))
        // Último recurso absoluto: siempre selecciona algo para no dejar el form vacío
        || options[0]
      );
    }

    // ── Helper: opción de "sí" / bajo/intermedio ──────────────────────────────
    function siOption() {
      return (
        options.find(o => /^s[ií]$/i.test(o.label.trim()))
        || options.find(o => /^s[ií][,\s]/i.test(o.label.trim()))
        || options.find(o => /b[aá]sico|intermedio/i.test(o.label))
        || options.find(o => /proyectos?|académico|personal|laboral/i.test(o.label))
        || options.find(o => /pero aprendo|puedo aprender/i.test(o.label))
        || options[0]
      );
    }

    // 1. Pregunta de título/grado académico (¿eres ingeniero? ¿título universitario?)
    //    Candidato es Tecnólogo — NO es Ingeniero titulado, NO tiene grado universitario
    if (/t[ií]tulo.*ingeni|grado.*ingeni|ingeni.*titulad|eres.*ingeni|ser.*ingeni|profesional.*ingeni|ingeni.*de sistemas|ingeni.*software/i.test(q)
        || (options.some(o => /soy ingeniero/i.test(o.label)) && options.some(o => /proceso|en curso|no\b|aun no/i.test(o.label)))) {
      return (
        options.find(o => /proceso|en curso|aun no|todavía no|estudiando/i.test(o.label))
        || options.find(o => /^no\b/i.test(o.label.trim()))
        || minOption()
      );
    }

    // 2. Tecnología que NO tiene → opción de "no" / sin experiencia / mínimo
    const skillNo = CANDIDATE_KQ.no.find(s => q.includes(s));
    if (skillNo) {
      return (
        options.find(o => /^no\b|^no,|sin experiencia|no tengo|no cuento|no manejo|ninguna?$/i.test(o.label.trim()))
        || options.find(o => /pero aprendo|puedo aprender/i.test(o.label))
        || options.find(o => /nivel b[aá]sico/i.test(o.label))
        || options.find(o => /menos de 1|menor a 1|0\s*[-–a]\s*1|0[-–]1/i.test(o.label))
        || options[options.length - 1]  // listas "Mayor→Menor": la última es la de menor exp
        || options[0]
      );
    }

    // 3. Skill que SÍ tiene → "sí" o nivel básico/intermedio (NUNCA avanzado)
    const skillSi = CANDIDATE_KQ.si.find(s => q.includes(s));
    if (skillSi) {
      return siOption();
    }

    // 4a. Autorización de datos / privacidad / consentimiento → Sí / Autorizo
    if (/autoriza|privacidad|consentimiento|tratamiento.*datos/i.test(q)) {
      return (
        options.find(o => /^s[ií]$/i.test(o.label.trim()))
        || options.find(o => /\bautorizo\b|\bacepto\b|de acuerdo/i.test(o.label))
        || options.find(o => /^s[ií][,\s]/i.test(o.label.trim()))
        || options[0]
      );
    }

    // 4b. Discapacidad / certificado médico → No tengo / Ninguna
    if (/discapacidad|certificado.*salud|condici[oó]n.*m[eé]dica|padece/i.test(q)) {
      return (
        options.find(o => /ninguna|no tengo|no lo tengo|no aplica|no poseo/i.test(o.label))
        || minOption()
      );
    }

    // 5. Disponibilidad / presencial / Bogotá → Sí / Inmediata
    if (/presencial|disponibil|bogot[aá]|vivir|resid/i.test(q)) {
      return (
        options.find(o => /^s[ií]$/i.test(o.label.trim()))
        || options.find(o => /inmediata|de inmediato|disponible|en este momento/i.test(o.label))
        || options[0]
      );
    }

    // 6. Pregunta de años/tiempo de experiencia (skill no en listas) → mínimo honesto
    if (/a[ñn]os?|tiempo.*experiencia|experiencia.*a[ñn]|llev.*desarrollando|llev.*trabaj|cuánto.*trabaj/i.test(q)) {
      return minOption();
    }

    // 7. Pregunta "¿cuál herramienta?" — opciones son listas de skills
    //    → elegir la opción con más coincidencias del perfil del candidato
    const scored = options.map((o, i) => {
      const lbl = o.label.toLowerCase();
      const score = CANDIDATE_KQ.si.filter(s => lbl.includes(s)).length;
      return { i, score, option: o };
    });
    const best = scored.reduce((a, b) => b.score > a.score ? b : a, scored[0]);
    if (best.score > 0) return best.option;

    // 8. Sin match claro → conservador (honestidad por defecto) — SIEMPRE devuelve algo
    return minOption();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Loop principal de radios KQ
  // Fast-path: salario numérico / inglés B1 / tipo contrato / nivel académico
  // Todo lo demás: IA con perfil completo → heurística semántica si IA falla
  // ─────────────────────────────────────────────────────────────────────────
  for (const [groupName, { questionText, options }] of Object.entries(kqRadioGroups)) {
    const q = questionText.toLowerCase();
    console.log(`[KQ-DBG] ── Radio group: "${groupName}"`);
    console.log(`[KQ-DBG]    Pregunta: "${questionText.slice(0,120)}"`);
    console.log(`[KQ-DBG]    Opciones (${options.length}): ${options.map(o=>`[${o.value}]"${o.label}"`).join(' | ')}`);
    let selectedValue = null;
    let matchedRule = 'ninguna';

    // ── Fast-path 1: Salario con rango numérico en las opciones ─────────────
    if (/salario|sueldo|remuneraci[oó]n|[uú]ltimo salario|aspiraci[oó]n/.test(q)) {
      const rangeOpt = options.find(o => /2[\.,]?000[\.,]?000.*3[\.,]?000|entre.*2.*3/i.test(o.label))
        || options.find(o => /2[\.,]?000/i.test(o.label));
      if (rangeOpt) {
        selectedValue = rangeOpt.value;
        matchedRule = 'salario-rango';
      } else {
        // ¿Está de acuerdo / alineada / conforme con el salario? → Sí
        const siOpt =
          options.find(o => /^s[ií]$/i.test(o.label.trim())) ||
          options.find(o => /^s[ií][,\.\s]/i.test(o.label.trim())) ||
          options.find(o => /\bacept|\bde acuerd|\bconforme|\balineado|\byes\b/i.test(o.label)) ||
          // Último recurso: cualquier opción que NO sea un "No" explícito
          options.find(o => !/^no\b/i.test(o.label.trim()));
        if (siOpt) { selectedValue = siOpt.value; matchedRule = 'salario-acuerdo→Sí'; }
      }
    }

    // ── Fast-path 2: Nivel de inglés → B1/intermedio ────────────────────────
    else if (/ingl[eé]s|english|idioma/.test(q)) {
      const b1 = options.find(o => /b1|b2|intermedio/i.test(o.label));
      selectedValue = (b1 || options[Math.floor(options.length / 2)])?.value;
      matchedRule = 'inglés→B1/intermedio';
    }

    // ── Fast-path 3: Tipo de contrato ───────────────────────────────────────
    else if (/tipo.*contrato|modalidad.*contrato/.test(q)) {
      const fijo = options.find(o => /t[eé]rmino fijo|indefinido/i.test(o.label));
      selectedValue = (fijo || options[0])?.value;
      matchedRule = 'contrato→fijo/indefinido';
    }

    // ── Fast-path 4: Nivel académico explícito en opciones ──────────────────
    else if (options.some(o => /tecnol[oó]go|t[eé]cnico|profesional|universitario/i.test(o.label))) {
      selectedValue = options.find(o => /tecnol[oó]go/i.test(o.label))?.value
        || options.find(o => /t[eé]cnico/i.test(o.label))?.value;
      matchedRule = 'nivel-académico→tecnólogo';
    }

    // ── Para todo lo demás: IA primero, heurística semántica si falla ────────
    if (!selectedValue) {
      const aiResult = await pickOptionWithAI(questionText, options);
      if (aiResult) {
        selectedValue = aiResult.value;
        matchedRule = `ia(${aiResult.idx}:"${aiResult.label.slice(0,35)}")`;
      } else {
        // IA no disponible → heurística semántica (nunca options[0] ciego)
        const heurResult = pickOptionHeuristic(questionText, options);
        if (heurResult) {
          selectedValue = heurResult.value;
          matchedRule = `heurística("${heurResult.label.slice(0,35)}")`;
        }
      }
    }

    console.log(`[KQ-DBG]    Regla: ${matchedRule}`);
    if (selectedValue !== null && selectedValue !== undefined) {
      const chosenLabel = options.find(o => o.value === selectedValue)?.label || selectedValue;

      // Intento 1: page.check con force=true (bypassa visibilidad/overlays de jQuery)
      let isChecked = await page
        .check(`input[type=radio][name="${groupName}"][value="${selectedValue}"]`, { force: true })
        .then(() => true).catch(() => false);

      // Intento 2: JS directo — itera todos los radios (evita problemas de CSS selector con brackets)
      if (!isChecked) {
        isChecked = await page.evaluate((gName, val) => {
          const radios = document.querySelectorAll('input[type="radio"]');
          for (const r of radios) {
            if (r.name === gName && r.value === val) {
              r.checked = true;
              const lbl = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
              if (lbl) lbl.click(); else r.click();
              r.dispatchEvent(new Event('change', { bubbles: true }));
              r.dispatchEvent(new Event('input',  { bubbles: true }));
              return true;
            }
          }
          return false;
        }, groupName, selectedValue).catch(() => false);
      }

      // Verificar que quedó marcado en el DOM
      const confirmed = await page.evaluate((gName, val) => {
        const radios = document.querySelectorAll('input[type="radio"]');
        for (const r of radios) { if (r.name === gName && r.value === val) return r.checked; }
        return false;
      }, groupName, selectedValue).catch(() => isChecked);

      if (confirmed) {
        console.log(`[FORM] Radio "${groupName}" → "${chosenLabel}" ✓`);
      } else {
        console.log(`[FORM] Radio "${groupName}" → "${chosenLabel}" ⚠️ (no confirmado en DOM)`);
      }
    } else {
      console.log(`[KQ-DBG]    ⚠️  Sin valor seleccionado — opciones: ${options.map(o=>`"${o.label}"`).join(', ')}`);
      console.log(`[FORM] Sin opción para radio: "${groupName}"`);
    }
  }

  // ── Selects con opciones: usar las opciones reales en vez del valor literal ──
  // (Ya procesados en el loop principal, pero mejorar matching para KQ selects)

  // Manejar checkboxes visibles (términos y condiciones, etc.)
  const checkboxes = await page.$$('input[type=checkbox]:visible, input[type=checkbox]').catch(() => []);
  for (const cb of checkboxes) {
    const isVisible = await cb.isVisible().catch(() => false);
    if (!isVisible) continue;
    const checked = await cb.isChecked().catch(() => false);
    if (!checked) {
      // Buscar label para entender qué es
      const cbLabel = await cb.evaluate(el => {
        const lbl = document.querySelector(`label[for="${el.id}"]`) || el.closest('label') || el.nextElementSibling;
        return lbl?.textContent?.trim().slice(0, 80) || '';
      }).catch(() => '');
      // Solo marcar si parece términos/condiciones, no preguntas de opción
      if (/t[eé]rmino|condici[oó]n|acepto|acuerdo|privacidad|autorizo|datos/i.test(cbLabel) || cbLabel === '') {
        await cb.check().catch(() => {});
        console.log(`[FORM] Checkbox marcado: "${cbLabel.slice(0,50)}"`);
      }
    }
  }

  return filled;
}

// ──────────────────────────────────────────────────────────────────────────────
// Submit
// ──────────────────────────────────────────────────────────────────────────────
async function submitForm(page) {
  // Esperar a que jQuery Unobtrusive Validation esté lista antes de intentar submit
  // (evita: Cannot read properties of undefined (reading 'unobtrusive'))
  await page.evaluate(() => {
    return new Promise(resolve => {
      const check = () => {
        if (window.jQuery && window.jQuery.validator) {
          try {
            const form = document.querySelector('form');
            if (form && window.jQuery.validator.unobtrusive) {
              window.jQuery.validator.unobtrusive.parse(form);
            }
          } catch(e) {}
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      setTimeout(check, 100);
      // Máximo 4s de espera
      setTimeout(resolve, 4000);
    });
  }).catch(() => {});

  // CT: el botón de envío es un <a> o elemento con texto específico
  const submitCandidates = [
    '#btnKiller',                            // CT KQ form (id específico)
    'input[type="submit"][value="Enviar mi HdV"]',
    'a:has-text("Enviar mi HdV")',          // cuestionario CT
    'button:has-text("Enviar mi HdV")',
    'a:has-text("Enviar postulación")',
    'button:has-text("Enviar postulación")',
    'a:has-text("Postularme")',
    'button:has-text("Postularme")',
    'a:has-text("Enviar solicitud")',
    'button:has-text("Enviar solicitud")',
    'button:has-text("Enviar")',            // botón genérico "Enviar"
    'a:has-text("Enviar")',
    'button:has-text("Continuar")',         // CT formularios de varios pasos
    'a:has-text("Continuar")',
    'button:has-text("Siguiente")',
    'a:has-text("Siguiente")',
    'button:has-text("Aplicar")',
    'a:has-text("Aplicar")',
    'button[type=submit]',
    'input[type=submit]',
    'a:has-text("Submit application")',
    'button:has-text("Submit")',
  ];

  for (const sel of submitCandidates) {
    const btn = await page.$(sel).catch(() => null);
    if (!btn) continue;
    // input[type=submit] usa 'value' no textContent
    const text = (await btn.getAttribute('value').catch(() => null) ?? await btn.textContent().catch(() => '')).trim();
    if (/iniciar sesi[oó]n|login|buscar|search|volver/i.test(text)) continue;
    const isVisible = await btn.isVisible().catch(() => false);
    const isInput = await btn.evaluate(el => el.tagName === 'INPUT').catch(() => false);
    if (!isVisible && !isInput) continue;

    console.log(`[SUBMIT] Clic en: "${text}"`);
    const urlBefore = page.url();
    // Intentar JS click primero (evita overlays)
    await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, sel).catch(() => btn.click());
    await page.waitForTimeout(3000);
    // Si la URL no cambió, usar form.submit() nativo (bypassa jQuery validation)
    if (page.url() === urlBefore) {
      console.log('[SUBMIT] URL sin cambio tras click → usando form.requestSubmit() nativo');
      await page.evaluate(() => {
        const f = document.querySelector('form');
        if (!f) return;
        try { f.requestSubmit(); } catch (e1) { try { f.submit(); } catch (e2) {} }
      }).catch(() => {});
    }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const urlAfter = page.url();
    const bodyAfter = await page.textContent('body').catch(() => '');
    const success = /postulado|aplicaste correctamente|application sent|successfully applied|gracias por postularte|ya diste el primer paso|postulaci[oó]n enviada|env[ií]aste|tu hoja de vida fue enviada/i.test(bodyAfter);

    console.log(`[SUBMIT] URL: ${urlAfter.slice(0,80)}`);
    console.log(`[SUBMIT] Confirmación: ${success}`);
    await snap(page, 'submit-resultado');
    return { submitted: true, success };
  }

  // Fallback JS directo: buscar cualquier input[type=submit] o #btnKiller en el DOM
  const jsFallback = await page.evaluate(() => {
    const btn = document.querySelector('#btnKiller') ||
                document.querySelector('input[type="submit"]') ||
                document.querySelector('button[type="submit"]');
    if (btn) { const t = btn.value || btn.textContent || ''; btn.click(); return t.trim() || 'clicked'; }
    return null;
  }).catch(() => null);
  if (jsFallback) {
    console.log(`[SUBMIT] Fallback JS click: "${jsFallback}"`);
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const urlAfter = page.url();
    const bodyAfter = await page.textContent('body').catch(() => '');
    const success = /postulado|aplicaste correctamente|gracias por postularte|ya diste el primer paso|postulaci[oó]n enviada|env[ií]aste|tu hoja de vida fue enviada/i.test(bodyAfter);
    console.log(`[SUBMIT] URL: ${urlAfter.slice(0,80)}`);
    console.log(`[SUBMIT] Confirmación: ${success}`);
    await snap(page, 'submit-resultado');
    return { submitted: true, success };
  }
  // Último recurso: form.submit() nativo sin necesidad de encontrar botón
  console.log('[SUBMIT] No encontré botón de submit — intentando form.submit() nativo');
  const formSubmitted = await page.evaluate(() => {
    const f = document.querySelector('form');
    if (!f) return false;
    try { f.requestSubmit(); } catch (e1) {
      try { f.submit(); } catch (e2) { return false; }
    }
    return true;
  }).catch(() => false);
  if (formSubmitted) {
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const urlAfter = page.url();
    const bodyAfter = await page.textContent('body').catch(() => '');
    const success = /postulado|aplicaste correctamente|gracias por postularte|ya diste el primer paso|postulaci[oó]n enviada|env[ií]aste|tu hoja de vida fue enviada/i.test(bodyAfter);
    console.log(`[SUBMIT] form.submit() nativo — URL: ${urlAfter.slice(0,80)}`);
    console.log(`[SUBMIT] Confirmación: ${success}`);
    await snap(page, 'submit-resultado');
    return { submitted: true, success };
  }
  const links = await page.$$eval('a', els =>
    els.map(e => e.textContent?.trim()).filter(t => t && t.length < 50 && t.length > 2).slice(0, 20)
  ).catch(() => []);
  console.log('[SUBMIT] Links visibles en página:', links);
  return { submitted: false, success: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// Procesar una oferta individual
// ──────────────────────────────────────────────────────────────────────────────
async function applyToJob(page, jobUrl, candidate, cvContent) {
  const result = {
    url: jobUrl, status: 'pending',
    timestamp: new Date().toISOString(), details: []
  };

  try {
    const found = await navigateToJobAndGetApplyButton(page, jobUrl);

    if (found.status === 'too-old') {
      result.status = 'skipped';
      result.details.push('Oferta antigua (±5 días) — omitida');
      console.log('[JOB] ⏭  Oferta antigua');
      return result;
    }

    if (found.status === 'already-applied') {
      result.status = 'already-applied';
      result.details.push('Ya aplicado anteriormente');
      console.log('[JOB] → Ya aplicado');
      return result;
    }

    if (found.status === 'not-found') {
      result.status = 'no-apply-button';
      result.details.push('No se encontró botón de aplicar');
      console.log('[JOB] → Sin botón de aplicar');
      return result;
    }

    // Navegar a la URL de aplicación
    const applyUrl = found.href;
    if (applyUrl && applyUrl.startsWith('http')) {
      console.log(`[JOB] Navegando a aplicación: ${applyUrl.slice(0,80)}`);
      await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    } else {
      // Clic directo
      await found.element.click().catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    }

    result.details.push('Botón de aplicar clicado');
    console.log(`[JOB] URL aplicación: ${page.url().slice(0,100)}`);

    // ── Detectar "Ya aplicaste a esta oferta" (aparece en /candidate/apply/ si ya postuló) ──
    // HTML: <p class="fs24">Ya aplicaste a esta oferta</p>
    const applyPageBody = await page.textContent('body').catch(() => '');
    if (/ya aplicaste a esta oferta|ya te postulaste|ya est[aá]s postulado/i.test(applyPageBody)) {
      result.status = 'already-applied';
      result.details.push('Ya aplicado — detectado en página de apply');
      console.log('[JOB] ⏭  Ya aplicado (página apply)');
      return result;
    }

    // ── Si aterrizamos en /match/ (filtro de perfil), redirigir al apply directo ──
    if (page.url().includes('/match/')) {
      const oi = page.url().match(/[?&]oi=([A-Fa-f0-9]+)/)?.[1];
      if (oi) {
        // Intentar primero /candidate/kq (cuestionario) y luego /candidate/apply
        const kqUrl = `https://candidato.co.computrabajo.com/candidate/kq?oi=${oi}&p=57&d=32&idb=1`;
        console.log(`[JOB] /match/ detectado → redirigiendo a kq: ${kqUrl.slice(0,80)}`);
        await page.goto(kqUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        const urlAfterKq = page.url();
        console.log(`[JOB] URL tras redirect /match/: ${urlAfterKq.slice(0,100)}`);
        // Si sigue en /match/, no podemos aplicar (requiere completar perfil)
        if (urlAfterKq.includes('/match/')) {
          result.status = 'skipped';
          result.details.push('Página /match/ requiere completar perfil — omitida');
          console.log('[JOB] ⏭  /match/ persistente, se requiere completar perfil manual');
          return result;
        }
      } else {
        result.status = 'skipped';
        result.details.push('/match/ sin oi param — omitida');
        return result;
      }
    }

    // Verificar si ya hay confirmación (aplicación directa sin formulario)
    const immediateBody = await page.textContent('body').catch(() => '');
    if (/postulado|aplicaste correctamente|ya diste el primer paso/i.test(immediateBody)) {
      result.status = 'success';
      result.details.push('Aplicación enviada exitosamente ✓');
      console.log('[JOB] → ✓ Éxito inmediato (sin formulario)');
      return result;
    }

    // Llenar formulario si hay campos
    const urlBeforeFill = page.url();
    const filled = await fillForm(page, candidate, cvContent);
    if (filled.length > 0) result.details.push(`Formulario: ${filled.join(', ')}`);

    // Si fillForm auto-navegó (onChange/auto-submit del formulario), detectarlo aquí
    const urlAfterFill = page.url();
    if (urlAfterFill !== urlBeforeFill) {
      const bodyAfterFill = await page.textContent('body').catch(() => '');
      const autoSuccess = /postulado|aplicaste correctamente|gracias por postularte|ya diste el primer paso|postulaci[oó]n enviada|env[ií]aste|tu hoja de vida fue enviada/i.test(bodyAfterFill);
      console.log(`[SUBMIT] Auto-navegó tras fill: ${urlAfterFill.slice(0,80)} — Confirmación: ${autoSuccess}`);
      result.status = autoSuccess ? 'success' : 'submitted-unverified';
      result.details.push(autoSuccess ? 'Aplicación confirmada (auto-submit) ✓' : 'Auto-submit detectado (sin confirmación)');
      console.log(`[JOB] → ${result.status}`);
      return result;
    }

    // Submit
    const { submitted, success } = await submitForm(page);
    result.status = submitted ? (success ? 'success' : 'submitted-unverified') : 'form-not-submitted';
    result.details.push(
      submitted
        ? (success ? 'Aplicación confirmada ✓' : 'Enviado (sin confirmación explícita)')
        : 'No se encontró botón de submit'
    );
    console.log(`[JOB] → ${result.status}`);
  } catch (err) {
    result.status = 'error';
    result.details.push(`Error: ${err.message}`);
    console.log(`[ERROR] ${err.message}`);
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Parser de pipeline.md
// ──────────────────────────────────────────────────────────────────────────────
function parsePipeline() {
  if (!existsSync(PIPELINE_PATH)) return [];
  const lines = readFileSync(PIPELINE_PATH, 'utf8').split(/\r?\n/);
  const entries = [];

  for (const line of lines) {
    const match = line.match(/- \[ \] (https?:\/\/\S+)(?:\s*\|\s*([^|]+))?(?:\s*\|\s*([^|]+))?/);
    if (!match) continue;

    const url = match[1].trim();
    const platform =
      url.includes('computrabajo.com') ? 'computrabajo' :
      url.includes('linkedin.com')     ? 'linkedin' : null;

    if (!platform) {
      console.log(`[PIPELINE] Saltando (no soportada): ${url}`);
      continue;
    }

    entries.push({
      url,
      company: match[2]?.trim() || '',
      title:   match[3]?.trim() || '',
      platform,
      // Determinar si es listado o oferta directa
      isListing: platform === 'computrabajo'
        ? /trabajo-de-/.test(url)  // URLs de búsqueda en CT
        : url.includes('/jobs/search'),
    });
  }

  return entries;
}

// ──────────────────────────────────────────────────────────────────────────────
// Reporte
// ──────────────────────────────────────────────────────────────────────────────
function saveReport(results, startTime) {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const lines = [
    '# Reporte de Aplicaciones Automáticas',
    '',
    `Generado: ${new Date().toISOString()}`,
    `Duración: ${elapsed}s`,
    '',
  ];

  for (const r of results) {
    const icon = { success: '✅', 'already-applied': '⏭️', 'submitted-unverified': '⚠️', error: '❌', 'no-apply-button': '🔍', 'form-not-submitted': '📋', 'login-failed': '🔐', skipped: '⏭️', 'too-old': '🗓️' }[r.status] || '❓';
    lines.push(`## ${icon} ${r.company || ''} — ${r.title || r.url.split('/').pop()}`);
    lines.push(`- **URL:** ${r.url}`);
    lines.push(`- **Estado:** ${r.status}`);
    lines.push(`- **Timestamp:** ${r.timestamp}`);
    if (r.details?.length) {
      lines.push('- **Detalles:**');
      r.details.forEach(d => lines.push(`  - ${d}`));
    }
    lines.push('');
  }

  // Resumen final
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const total    = results.length;
  const ok       = (counts.success || 0);
  const unverif  = (counts['submitted-unverified'] || 0);
  const skipped  = (counts['already-applied'] || 0) + (counts.skipped || 0) + (counts['too-old'] || 0);
  const failed   = total - ok - unverif - skipped;

  lines.push('## 📊 Resumen');
  lines.push(`- **Total procesadas:** ${total}`);
  lines.push(`- **Exitosas:** ${ok}`);
  lines.push(`- **Enviadas (sin confirmación):** ${unverif}`);
  lines.push(`- **Omitidas (ya aplicado):** ${skipped}`);
  lines.push(`- **Fallidas:** ${failed}`);
  lines.push('');
  for (const [k, v] of Object.entries(counts)) lines.push(`- ${k}: ${v}`);

  writeFileSync(RESULTS_PATH, lines.join('\n'));
  console.log(`\nReporte guardado en ${RESULTS_PATH}`);

  // Imprimir resumen en consola
  console.log('\n' + '═'.repeat(50));
  console.log('  RESUMEN FINAL');
  console.log('═'.repeat(50));
  console.log(`  Total ofertas procesadas : ${total}`);
  console.log(`  ✅ Aplicaciones exitosas  : ${ok}`);
  console.log(`  ⚠️  Enviadas s/confirmar  : ${unverif}`);
  console.log(`  ⏭️  Ya aplicado (omitidas): ${skipped}`);
  console.log(`  ❌ Fallidas               : ${failed}`);
  console.log('═'.repeat(50));
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  if (!existsSync(PROFILE_PATH) || !existsSync(CREDENTIALS_PATH)) {
    console.error('Error: Falta config/profile.yml o config/credentials.yml');
    process.exit(1);
  }

  const profile     = yaml.load(readFileSync(PROFILE_PATH, 'utf8')) || {};
  const credentials = yaml.load(readFileSync(CREDENTIALS_PATH, 'utf8')) || {};
  const candidate   = profile.candidate || {};
  const cvContent   = existsSync(CV_PATH) ? readFileSync(CV_PATH, 'utf8') : '';
  const hasAI       = !!process.env.ANTHROPIC_API_KEY;

  console.log('═'.repeat(50));
  console.log('  PIPELINE DE APLICACIONES AUTÓNOMAS');
  console.log('═'.repeat(50));
  console.log(`  IA para formularios: ${hasAI ? '✅ ACTIVADA' : '❌ desactivada (necesita ANTHROPIC_API_KEY)'}`);

  const entries = parsePipeline();
  if (!entries.length) {
    console.log('\nNo hay URLs de Computrabajo o LinkedIn en pipeline.md');
    return;
  }

  const ctEntries = entries.filter(e => e.platform === 'computrabajo');
  const liEntries = entries.filter(e => e.platform === 'linkedin');
  const ctListings = ctEntries.filter(e => e.isListing);
  const ctDirect   = ctEntries.filter(e => !e.isListing);

  console.log(`\n  URLs en pipeline: ${entries.length}`);
  console.log(`    Computrabajo listados : ${ctListings.length}`);
  console.log(`    Computrabajo directos : ${ctDirect.length}`);
  console.log(`    LinkedIn              : ${liEntries.length}`);

  const allResults = [];

  // ── COMPUTRABAJO ──────────────────────────────────────────────────────────
  if (ctEntries.length > 0) {
    console.log('\n' + '─'.repeat(50));
    console.log('  COMPUTRABAJO');
    console.log('─'.repeat(50));

    const { browser, page } = await createBrowser();

    try {
      const loggedIn = await loginComputrabajo(page, credentials);

      if (!loggedIn) {
        console.log('[ERROR] Login en Computrabajo falló');
        for (const e of ctEntries) {
          allResults.push({ url: e.url, company: e.company, title: e.title, status: 'login-failed', timestamp: new Date().toISOString(), details: ['Login fallido'] });
        }
      } else {
        // ── Pre-cargar ofertas ya aplicadas desde /candidate/match/ ──
        const appliedHashes = await fetchAppliedOffers(page);

        // Recolectar todos los links de ofertas individuales
        const individualJobs = [];

        // Primero los listados → extraer links con estado de postulación
        for (const entry of ctListings) {
          console.log(`\n[LISTADO] ${entry.url}`);
          const jobObjects = await extractJobLinksFromListing(page, entry.url);

          for (const job of jobObjects) {
            individualJobs.push({ url: job.url.trim(), alreadyApplied: job.alreadyApplied, company: entry.company, title: '(del listado)', platform: 'computrabajo' });
          }
        }

        // Luego los directos
        for (const entry of ctDirect) {
          individualJobs.push(entry);
        }

        // Deduplicar
        const seen = new Set();
        const uniqueJobs = individualJobs.filter(j => {
          if (seen.has(j.url)) return false;
          seen.add(j.url);
          return true;
        });

        console.log(`\n[CT] Total ofertas a procesar: ${uniqueJobs.length} (límite: ${MAX_NEW_APPS} nuevas)`);
        let newAppsCount = 0;

        for (let i = 0; i < uniqueJobs.length; i++) {
          const job = uniqueJobs[i];

          // Verificar si ya se aplicó usando el hash de la URL (evita navegar)
          const hash = extractOfferHash(job.url);
          if (hash && appliedHashes.has(hash)) {
            console.log(`\n── CT ${i+1}/${uniqueJobs.length} ─ [SKIP pre-check hash] ${job.url.slice(0,70)}`);
            allResults.push({ url: job.url, company: job.company, title: job.title, status: 'already-applied', timestamp: new Date().toISOString(), details: ['Ya aplicado — detectado en pre-check hash'] });
            continue;
          }

          // Verificar si el listado ya marcó la oferta como postulada (evita navegar)
          if (job.alreadyApplied) {
            console.log(`\n── CT ${i+1}/${uniqueJobs.length} ─ [SKIP tag postulado] ${job.url.slice(0,70)}`);
            allResults.push({ url: job.url, company: job.company, title: job.title, status: 'already-applied', timestamp: new Date().toISOString(), details: ['Ya aplicado — tag .postulated en listado'] });
            continue;
          }

          // Verificar límite de nuevas aplicaciones
          if (newAppsCount >= MAX_NEW_APPS) {
            console.log(`\n[CT] Límite de ${MAX_NEW_APPS} nuevas aplicaciones alcanzado. Deteniendo.`);
            break;
          }

          // Filtro de perfil: solo roles de desarrollo de software
          if (!isDevJobUrl(job.url)) {
            console.log(`\n── CT ${i+1}/${uniqueJobs.length} ─ [SKIP perfil] ${job.url.slice(0,80)}`);
            allResults.push({ url: job.url, company: job.company, title: job.title, status: 'skipped', timestamp: new Date().toISOString(), details: ['No coincide con perfil dev'] });
            continue;
          }

          console.log(`\n── CT ${i+1}/${uniqueJobs.length} ───────────────────`);
          console.log(`   ${job.url.slice(0, 80)}`);

          // ── Recuperación de browser si CT cerró la página (CAPTCHA/seguridad) ──
          const isAlive = await page.evaluate(() => true).catch(() => false);
          if (!isAlive) {
            console.log('[CT] ⚠️  Página cerrada por CT (CAPTCHA/seguridad). Guardando reporte parcial y abortando.');
            break;
          }

          const result = await applyToJob(page, job.url, candidate, cvContent);
          result.company = job.company;
          result.title   = job.title;
          allResults.push(result);

          // Contar nuevas aplicaciones (no ya-aplicadas, no skipped por antigüedad)
          if (!['already-applied', 'too-old', 'skipped'].includes(result.status)) {
            newAppsCount++;
            console.log(`[CT] Nuevas aplicaciones: ${newAppsCount}/${MAX_NEW_APPS}`);
          }

          // Pausa entre aplicaciones para no ser detectado como bot
          if (i < uniqueJobs.length - 1) {
            const pause = 2000 + Math.random() * 2000;
            console.log(`[PAUSA] ${Math.round(pause/1000)}s antes de la siguiente...`);
            await page.waitForTimeout(pause).catch(() => {});
          }
        }
      }
    } finally {
      await browser.close();
    }
  }

  // ── LINKEDIN ──────────────────────────────────────────────────────────────
  if (liEntries.length > 0) {
    console.log('\n' + '─'.repeat(50));
    console.log('  LINKEDIN');
    console.log('─'.repeat(50));

    const { browser, page } = await createBrowser();

    try {
      const loggedIn = await loginLinkedIn(page, credentials);

      if (!loggedIn) {
        console.log('[ERROR] Login en LinkedIn falló');
        for (const e of liEntries) {
          allResults.push({ url: e.url, company: e.company, title: e.title, status: 'login-failed', timestamp: new Date().toISOString(), details: ['Login fallido'] });
        }
      } else {
        for (let i = 0; i < liEntries.length; i++) {
          const entry = liEntries[i];
          console.log(`\n── LI ${i+1}/${liEntries.length}: ${entry.title} ──`);
          const result = await applyToJob(page, entry.url, candidate, cvContent);
          result.company = entry.company;
          result.title   = entry.title;
          allResults.push(result);
        }
      }
    } finally {
      await browser.close();
    }
  }

  saveReport(allResults, startTime);
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
