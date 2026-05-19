#!/usr/bin/env node
/**
 * Daily heartbeat for Mitchell's unattended career-ops pipeline. Produces
 * markdown summary of last 24 hours of scan + batch + Grok activity.
 * Output: data/heartbeat-{YYYY-MM-DD}.md, optionally sent via Gmail SMTP.
 *
 * Usage:
 *   node scripts/heartbeat.mjs [--date=YYYY-MM-DD]   # generate only
 *   node scripts/heartbeat.mjs --send                # generate + email
 *   node scripts/heartbeat.mjs --test                # send minimal test
 *
 * Reads SMTP creds from ~/.career-ops-secrets:
 *   GMAIL_USER, GMAIL_APP_PASSWORD, HEARTBEAT_TO
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { installRunRecord } from '../lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('heartbeat');

import nodemailer from 'nodemailer';
import { marked } from 'marked';
import mjml2html from 'mjml';
import { classifyLiveness } from '../liveness-core.mjs';
import { verifyApplyNowLink as _libVerifyApplyNowLink, markRowAsExpired as _libMarkRowAsExpired } from '../lib/liveness.mjs';
import { getCachedUrl } from '../lib/resolve-ats-url.mjs';
import { renderTpgmHeartbeatSection } from '../lib/tpgm-heartbeat-section.mjs';
import { poolMap } from '../lib/fetch-utils.mjs';
import { buildSummary as buildOutreachSummary, urgency as outreachUrgency, daysSinceLastTouch as outreachDaysSince, touchCount as outreachTouchCount, listContacts as listOutreachContacts } from '../lib/outreach-tracker.mjs';
import { buildOutreachMailto } from '../lib/mailto-helpers.mjs';
// Tier 5 system-status banner (calibration brief 2026-05-16) — surfaces which
// Tier 5 features are active in the daily heartbeat. Runway alert wired
// 2026-05-17 — inline compute below (mirrors dashboard-server.mjs's
// computeRecruiterPipelineDensity so heartbeat doesn't depend on the
// dashboard server being running).
import { renderSystemBanner, renderDiscardPatternSection, renderRunwayAlert, renderCdpAuthHealthSection, renderPolishSummarySection, renderCronHealthBanner } from '../lib/heartbeat-system-banner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Inline pipeline-density compute for heartbeat (decoupled from the live
// dashboard server). Matches the shape renderRunwayAlert expects from
// dashboard-server.mjs's computeRecruiterPipelineDensity.
function computeRunwayDensityForHeartbeat() {
  let contacts = [];
  try { contacts = listOutreachContacts(); } catch { return { ok: false, error: 'outreach tracker unavailable' }; }
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400000;
  const thirtyDaysAgo = now - 30 * 86400000;
  let active = 0, responded = 0, dead = 0, total = contacts.length;
  let touches7d = 0, touches30d = 0, lastTouchTs = 0;
  for (const c of contacts) {
    if (c.status === 'dead') { dead++; continue; }
    if (c.status === 'awaiting_reply' || c.status === 'warm' || c.status === 'responded') active++;
    if (c.status === 'responded') responded++;
    for (const t of (c.touches || [])) {
      const ts = Date.parse(t.ts);
      if (!isFinite(ts)) continue;
      if (ts >= sevenDaysAgo) touches7d++;
      if (ts >= thirtyDaysAgo) touches30d++;
      if (ts > lastTouchTs) lastTouchTs = ts;
    }
  }
  const responseRate = total > 0 ? Math.round((responded / total) * 100) / 100 : 0;
  const runwayWeeks = parseInt(process.env.RUNWAY_WEEKS || '12');
  let health, runway_alert;
  if (active >= 5 && touches7d >= 10) {
    health = 'healthy';
    runway_alert = `✅ Cushion holding — pipeline on track for ${runwayWeeks}-week runway.`;
  } else if (active >= 3 || touches7d >= 5) {
    health = 'stretched';
    runway_alert = `⚠️ Cushion shrinking — add ${Math.max(0, 5 - active)} more active conversations and ${Math.max(0, 10 - touches7d)} more touches this week to stay on track for ${runwayWeeks} weeks.`;
  } else {
    health = 'critical';
    runway_alert = `🚨 Past your runway floor — push outreach to 10+ touches/week right now. The ${runwayWeeks}-week window is at risk.`;
  }
  return {
    ok: true, runway_weeks: runwayWeeks, health, runway_alert,
    contacts: { total, active, responded, dead, response_rate: responseRate },
    velocity: { touches_last_7d: touches7d, touches_last_30d: touches30d,
                days_since_last_touch: lastTouchTs ? Math.round((now - lastTouchTs) / 86400000) : null },
  };
}

const ROOT = process.cwd();
const args = process.argv.slice(2);
const dateArg = args.find(a => a.startsWith('--date='));
const SEND = args.includes('--send');
const TEST = args.includes('--test');
// --preview renders the HTML email to /tmp/heartbeat-preview.html and
// opens it in the default browser so you can verify the visual identity
// without firing an actual SMTP send.
const PREVIEW = args.includes('--preview');
const TARGET_DATE = dateArg
  ? dateArg.split('=')[1]
  : new Date().toISOString().slice(0, 10);

function loadSecrets() {
  const path = join(homedir(), '.career-ops-secrets');
  if (!existsSync(path)) {
    throw new Error(`Secrets file missing: ${path}`);
  }
  const out = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  for (const k of ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'HEARTBEAT_TO']) {
    if (!out[k]) throw new Error(`Missing key in secrets: ${k}`);
  }
  return out;
}

// Wrap a numeric score in a color-coded pill. The thresholds match the
// system's own classification (4.5+ = priority, 4.0–4.49 = qualifying,
// below = filtered). Used in tables and inline.
// Brand palette — same tokens as the dashboard's mission-control dark mode
// + light-mode-safe equivalents for email clients that don't honor
// prefers-color-scheme. Single source of truth at lib/dashboard-tokens.mjs;
// duplicated inline here so heartbeat.mjs stays a one-file zero-dep launchd
// job (the tokens module would force an ESM import + path resolution that
// breaks the heartbeat's standalone-script invariant).
const BRAND = {
  // Light-mode (default — broad client support)
  bg:           '#f8fafc',
  surface:      '#ffffff',
  surface2:     '#f1f5f9',
  border:       '#e2e8f0',
  text:         '#0f172a',
  text2:        '#1e293b',
  text3:        '#475569',
  text4:        '#64748b',
  green:        '#16a34a',     // matrix-green, brand accent
  greenFg:      '#15803d',
  greenBg:      '#dcfce7',
  greenBorder:  '#86efac',
  blue:         '#2563eb',
  blueBg:       '#dbeafe',
  amber:        '#8a6840',
  amberBg:      '#f4ede1',
  red:          '#991b1b',
  redBg:        '#fee2e2',
};

function scorePill(score) {
  const n = parseFloat(score);
  if (isNaN(n)) return String(score);
  let bg, fg, cls, extraStyle = '';
  if (n >= 4.5)      { bg = BRAND.greenBg; fg = BRAND.greenFg; cls = 'score-pill score-pill-green'; extraStyle = `border:1px solid ${BRAND.greenBorder};`; }
  else if (n >= 4.0) { bg = BRAND.greenBg; fg = BRAND.greenFg; cls = 'score-pill score-pill-green'; }
  else if (n >= 3.0) { bg = BRAND.amberBg; fg = BRAND.amber;   cls = 'score-pill score-pill-amber'; }
  else               { bg = BRAND.redBg;   fg = BRAND.red;     cls = 'score-pill score-pill-red'; }
  return `<span class="${cls}" style="display:inline-block;background:${bg};color:${fg};${extraStyle}padding:2px 8px;border-radius:999px;font-weight:600;font-size:12px;font-variant-numeric:tabular-nums">${n.toFixed(2)}</span>`;
}

// ── MJML template renderer (Commit 1: MJML rebuild, 2026-05-17) ──────────────
// Reads templates/heartbeat.mjml, interpolates the data context object,
// compiles via mjml2html(), and returns the inlined-CSS email HTML.
//
// The template handles all structural chrome (hero, KPI tiles, mj-button for
// bulletproof VML+CSS buttons, footer). The main markdown-derived content is
// rendered by renderContentHtml() and injected as {{contentHtml}}.
//
// Template variable convention: {{varName}} — simple string interpolation,
// not a full template engine. Safe because all values are escaped via
// escapeForMjml() before injection.
function escapeForMjml(s) {
  // Escape only the curly-brace delimiters used as template markers so
  // arbitrary HTML content (which IS safe here — we generate it ourselves)
  // can pass through into the compiled MJML → HTML output without confusion.
  return String(s == null ? '' : s)
    .replace(/{{/g, '&#123;&#123;')
    .replace(/}}/g, '&#125;&#125;');
}

// Read and cache the MJML template file.
let _mjmlTemplate = null;
function getMjmlTemplate() {
  if (_mjmlTemplate) return _mjmlTemplate;
  const templatePath = join(__dirname, '../templates/heartbeat.mjml');
  _mjmlTemplate = readFileSync(templatePath, 'utf-8');
  return _mjmlTemplate;
}

// Render the markdown body into styled HTML for injection into the
// {{contentHtml}} slot of the MJML template. Reuses the existing
// marked() + inline-style pipeline so all section generators are
// preserved unmodified.
function renderContentHtml(markdownBody) {
  marked.setOptions({ gfm: true, breaks: false });
  const inner = marked.parse(markdownBody);

  // Inline-style every tag the markdown renderer emits. Gmail strips <style>
  // blocks and class attributes, so styles must live on the elements
  // themselves. The order of these replaces matters — apply the most
  // specific patterns first so they don't get clobbered by the general ones.
  // Class-tagged inline styles. Class names are dark-mode hooks the
  // <style> block in the email <head> targets via prefers-color-scheme.
  // Inline rules are the light-mode default for clients that strip <style>.
  // Visual hierarchy: section headings match dashboard style but are tightened
  // so they don't compete with the TONIGHT'S APPLY dominant card above:
  //   h2 → 13px uppercase bold with accent-left-border (matches dashboard section labels)
  //   h3 → 14px semibold, subdued color (per-role headers, role names)
  //   Tables → compact (8px padding) so multiple roles fit above-the-fold
  //   Table cells → tighter vertical padding for density
  let styled = inner
    .replace(/<table>/g, `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="card" style="border-collapse:separate;border-spacing:0;width:100%;margin:10px 0 14px;font-size:13px;border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;background:${BRAND.surface}">`)
    .replace(/<thead>/g, `<thead style="background:${BRAND.surface2}">`)
    .replace(/<th>/g, `<th class="text-muted border" style="text-align:left;padding:8px 10px;border-bottom:1px solid ${BRAND.border};font-weight:700;color:${BRAND.text3};font-size:10px;text-transform:uppercase;letter-spacing:0.07em">`)
    .replace(/<td>/g, `<td class="border" style="padding:8px 10px;border-bottom:1px solid ${BRAND.surface2};vertical-align:top;color:${BRAND.text2};font-size:13px">`)
    .replace(/<blockquote>/g, `<blockquote class="card" style="margin:12px 0;padding:10px 14px;border-left:3px solid ${BRAND.green};background:${BRAND.greenBg};color:${BRAND.text};border-radius:0 8px 8px 0;font-size:13px;line-height:1.5">`)
    .replace(/<h1>/g, `<h1 class="text-strong accent" style="font-size:22px;margin:0 0 6px;color:${BRAND.greenFg};font-weight:700;letter-spacing:-0.01em">`)
    // h2 → compact section label style (matches dashboard --fs-meta + section heading pattern)
    // Left border in accent green stays; reduced font and margin so it doesn't compete with §1
    .replace(/<h2>/g, `<h2 class="text-strong" style="font-size:13px;margin:20px 0 6px;color:${BRAND.text3};font-weight:700;border-left:3px solid ${BRAND.green};padding-left:10px;letter-spacing:0.04em;text-transform:uppercase">`)
    // h3 → per-role name / sub-section, subtle, no decoration
    .replace(/<h3>/g, `<h3 class="text-strong" style="font-size:14px;margin:14px 0 5px;color:${BRAND.text2};font-weight:600;letter-spacing:-0.01em">`)
    .replace(/<a /g, `<a class="accent" style="color:${BRAND.greenFg};text-decoration:underline;text-underline-offset:2px;font-weight:500" `)
    .replace(/<code>/g, `<code style="background:${BRAND.surface2};padding:1px 5px;border-radius:4px;font-family:'JetBrains Mono','SF Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:${BRAND.greenFg}">`)
    .replace(/<ul>/g, `<ul style="margin:6px 0 10px;padding-left:20px;color:${BRAND.text2}">`)
    .replace(/<ol>/g, `<ol style="margin:6px 0 10px;padding-left:20px;color:${BRAND.text2}">`)
    .replace(/<li>/g, '<li style="margin:3px 0;line-height:1.5">')
    .replace(/<hr>/g, `<hr style="border:none;height:1px;background:linear-gradient(90deg,transparent 0%,${BRAND.border} 50%,transparent 100%);margin:18px 0">`);

  // Color-code score callouts inside text content. Patterns we hit:
  //   "4.65 / 5"  →  pill-rendered score
  //   "Score:** 4.50 / 5"  →  pill
  styled = styled.replace(/(\d\.\d{1,2})\s*\/\s*5(?![a-zA-Z])/g, (m, num) => scorePill(num) + ' / 5');

  // Status word badges in table rows (Applied, Interview, etc.). marked.parse
  // has already converted markdown bold to <strong>, so match the HTML form.
  styled = styled.replace(/<strong>(Offer|Interview|Responded|Applied|Evaluated|Rejected|Discarded|SKIP)<\/strong>/g, (m, status) => {
    const palette = {
      Offer:     [BRAND.amberBg,   BRAND.amber],
      Interview: [BRAND.greenBg,   BRAND.greenFg],
      Responded: [BRAND.blueBg,    BRAND.blue],
      Applied:   [BRAND.blueBg,    BRAND.blue],
      Evaluated: [BRAND.surface2,  BRAND.text3],
      Rejected:  [BRAND.redBg,     BRAND.red],
      Discarded: [BRAND.surface2,  BRAND.text4],
      SKIP:      [BRAND.surface2,  BRAND.text4],
    };
    const [bg, fg] = palette[status] || ['#f1f5f9', '#475569'];
    return `<span style="display:inline-block;background:${bg};color:${fg};padding:2px 8px;border-radius:999px;font-weight:600;font-size:12px">${status}</span>`;
  });

  // renderContentHtml() returns just the styled content HTML for injection
  // into the {{contentHtml}} slot of the MJML template.
  return styled;
}

// ── Wave D: Severity-tiered runway alert (H4) ────────────────────────────────
// Replaces the binary pink banner with 3 tiers: approaching / at / past
// threshold. Reads the same `density` object as renderRunwayAlert but
// renders a tiered visual. color tokens are inline hex (no CSS vars — Gmail).
function renderRunwayAlertTiered(density) {
  if (!density || !density.ok) {
    return '<div style="margin:12px 0;padding:10px;background:#fef9c3;border-radius:6px;color:#854d0e;font-size:12px">Runway alert: pipeline-density data unavailable.</div>';
  }
  const { health, runway_alert, contacts, velocity, runway_weeks } = density;
  // Tier definitions matching Datadog/Sentry/PagerDuty tier patterns
  const tiers = {
    healthy:   { bg: '#dcfce7', border: '#86efac', fg: '#166534', icon: '🟢', label: 'On track',        aria: 'Green circle: on track' },
    stretched: { bg: '#fef3c7', border: '#f59e0b', fg: '#92400e', icon: '🟡', label: 'Cushion shrinking', aria: 'Yellow circle: cushion shrinking' },
    critical:  { bg: '#fee2e2', border: '#f87171', fg: '#991b1b', icon: '🔴', label: 'Past runway floor', aria: 'Red circle: past runway floor' },
  };
  const t = tiers[health] || tiers.stretched;
  const actionLink = health === 'critical'
    ? ` <a href="${DASHBOARD_PUBLIC_URL}/?focus=outreach" style="color:${t.fg};font-size:11px;text-decoration:underline">→ action</a>`
    : '';
  return `
<div style="margin:14px 0;padding:12px 14px;background:${t.bg};border:2px solid ${t.border};border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${t.fg};margin-bottom:6px">
    <span role="img" aria-label="${t.aria}">${t.icon}</span> Runway — ${runway_weeks}-week window · <strong>${t.label}</strong>${actionLink}
  </div>
  <div style="font-size:13px;color:${t.fg};font-weight:${health === 'critical' ? 700 : 600};margin-bottom:8px;line-height:1.4">${runway_alert}</div>
  <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:11.5px;color:#374151">
    <span><strong>${contacts.active}</strong> active</span>
    <span><strong>${contacts.responded}</strong> replied (${Math.round(contacts.response_rate*100)}%)</span>
    <span><strong>${velocity.touches_last_7d}</strong>/7d</span>
    <span><strong>${velocity.touches_last_30d}</strong>/30d</span>
    <span>last: <strong>${velocity.days_since_last_touch != null ? velocity.days_since_last_touch + 'd' : 'n/a'}</strong></span>
  </div>
</div>`.trim();
}

// ── Wave D: Signal Pulse section (new section) ───────────────────────────────
// Reads data/company-pulse/*.json and surfaces the top 5 deltas in last 24h.
// Auto-hides when no pulse data exists (today is expected "no" since pulse
// pipeline just shipped — section simply renders empty string).
function renderSignalPulseSection() {
  const pulseDir = join(ROOT, 'data/company-pulse');
  if (!existsSync(pulseDir)) return '';

  let pulseFiles;
  try { pulseFiles = readdirSync(pulseDir).filter(f => f.endsWith('.json')); } catch { return ''; }
  if (!pulseFiles.length) return '';

  const cutoff = Date.now() - 24 * 3600 * 1000;
  const deltas = [];

  for (const file of pulseFiles) {
    try {
      const data = JSON.parse(readFileSync(join(pulseDir, file), 'utf-8'));
      if (!data || !data.ts) continue;
      const ts = Date.parse(data.ts);
      if (!isFinite(ts) || ts < cutoff) continue;
      // Shape: { company, ts, summary, source_url, delta_type }
      deltas.push({
        company:    data.company    || file.replace('.json', ''),
        summary:    data.summary    || '(no summary)',
        source_url: data.source_url || null,
        delta_type: data.delta_type || 'update',
        ts,
      });
    } catch { /* skip malformed */ }
  }

  if (!deltas.length) return '';

  // Sort newest first, take top 5
  deltas.sort((a, b) => b.ts - a.ts);
  const top5 = deltas.slice(0, 5);

  const rows = top5.map(d => {
    const srcLink = d.source_url
      ? ` <a href="${d.source_url}" style="color:#15803d;text-decoration:underline;font-size:11px">see source →</a>`
      : '';
    const companyLink = `<a href="${deeplink('company', d.company)}" style="display:inline-block;padding:2px 8px;background:#dbeafe;color:#1e40af;border-radius:12px;font-weight:600;font-size:11px;text-decoration:none">${d.company}</a>`;
    return `<tr>
      <td style="padding:5px 10px 5px 0;vertical-align:top;width:120px">${companyLink}</td>
      <td style="padding:5px 0;font-size:12px;color:#374151;vertical-align:top;line-height:1.45">${d.summary.slice(0, 160)}${srcLink}</td>
    </tr>`;
  }).join('');

  return `
<div style="margin:14px 0;padding:12px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#075985;margin-bottom:8px">
    <span role="img" aria-label="Satellite dish: signal pulse">📡</span> Signal Pulse — ${top5.length} delta${top5.length === 1 ? '' : 's'} · last 24h
  </div>
  <table style="border-collapse:collapse;width:100%">${rows}</table>
</div>`.trim();
}

// ── TONIGHT'S APPLY section ─────────────────────────────────────────────────
// The loudest element in the email. Priority pick per INTJ-T action-first
// mental model: one role, one primary CTA, one link. Logic (no LLM needed):
//   1. Top-scored row with ACTIONABLE_STATUSES, evaluated >7 days ago (oldest
//      unacted candidate — most overdue for action).
//   2. Fallback: top-scored row in ACTIONABLE_STATUSES regardless of age.
//   3. Fallback: "Queue empty" message with dashboard link.
// Design: dominant card with #16a34a accent border, large CTA button.
// ── NEXT MOVES section ───────────────────────────────────────────────────
// Reads data/next-moves.json (baked by build-dashboard.mjs OR refreshed by
// scripts/compute-next-moves.mjs). Renders the top 3 ranked actions with
// cost/impact/composite + a "see all" link to the full drill-in.
//
// Sits ABOVE Tonight's Apply because it's the synthesis layer — answers
// "what should I do next?" first, then "if you only do one thing tonight"
// is the bigger green Tonight's Apply card below.
function renderNextMovesSection() {
  let nm = null;
  try {
    const fp = join(ROOT, 'data/next-moves.json');
    if (existsSync(fp)) nm = JSON.parse(readFileSync(fp, 'utf-8'));
  } catch (_) { return ''; }
  if (!nm || !Array.isArray(nm.top_moves) || nm.top_moves.length === 0) return '';

  const d = nm.deadline_stats || {};
  const urgencyColor = d.days_left <= 30 ? '#dc2626' : d.days_left <= 60 ? '#d97706' : '#16a34a';
  const urgencyBg    = d.days_left <= 30 ? '#fef2f2' : d.days_left <= 60 ? '#fffbeb' : '#f0fdf4';
  const urgencyBorder = d.days_left <= 30 ? '#fca5a5' : d.days_left <= 60 ? '#fcd34d' : '#86efac';

  const top3 = nm.top_moves.slice(0, 3);
  const restCount = Math.max(0, nm.top_moves.length - 3);

  const moveCards = top3.map((m) => {
    const kindLabel = String(m.kind || '').replace(/_/g, ' ');
    const cta = m.cta || {};
    let ctaHref = `${DASHBOARD_PUBLIC_URL}/`;
    if (cta.kind === 'open-row-drawer' && cta.row_num != null) ctaHref = deeplink('row', cta.row_num);
    else if (cta.kind === 'open-company-profile' && cta.slug) ctaHref = `${DASHBOARD_PUBLIC_URL}/?focus=company-${cta.slug}`;
    return `<div style="margin:6px 0;padding:10px 12px;background:#ffffff;border:1px solid #e5e7eb;border-left:3px solid ${urgencyColor};border-radius:6px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
        <span style="font-size:10px;font-weight:700;color:${urgencyColor};text-transform:uppercase;letter-spacing:0.05em">${m.rank}. ${escapeHtml(kindLabel)}</span>
        <span style="font-size:10px;color:#6b7280;font-family:monospace">~${m.cost_hours}h · ${m.composite_score}</span>
      </div>
      <div style="font-size:13px;font-weight:600;color:#111827;line-height:1.4;margin-bottom:3px">${escapeHtml(m.label || '')}</div>
      <div style="font-size:11px;color:#6b7280;line-height:1.5">${escapeHtml(m.evidence || '')}</div>
      <a href="${ctaHref}" style="display:inline-block;margin-top:6px;color:${urgencyColor};font-size:11px;text-decoration:underline">Open →</a>
    </div>`;
  }).join('');

  const seeAllHref = `${DASHBOARD_PUBLIC_URL}/?focus=next-moves`;
  return `<div class="next-moves-card" style="margin:6px 0 8px;padding:14px 16px;background:${urgencyBg};border:2px solid ${urgencyBorder};border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${urgencyColor};margin-bottom:4px">Next moves · ${d.days_left != null ? d.days_left + ' days left' : ''}</div>
  <div style="font-size:12px;color:#374151;margin-bottom:8px">${d.apps_applied || 0} applied of ~${(d.apps_applied||0)+(d.apps_needed_estimate||0)} needed · <strong>${d.apps_per_week_required || '—'}/week required</strong></div>
  ${moveCards}
  ${restCount > 0 ? `<div style="margin-top:8px"><a href="${seeAllHref}" style="color:${urgencyColor};font-size:11px;text-decoration:none">+${restCount} more ranked action${restCount === 1 ? '' : 's'} · skip-this-week list →</a></div>` : ''}
</div>`.trim();
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTonightsApplySection(applyNow) {
  if (!applyNow || applyNow.length === 0) {
    return `<div class="tonight-card" style="margin:6px 0 8px;padding:14px 16px;background:#f0fdf4;border:2px solid #86efac;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#166534;margin-bottom:8px">Queue empty</div>
  <div style="font-size:14px;color:#14532d;margin-bottom:12px;line-height:1.4">No actionable roles — batch may not have run or all scored roles are already acted on.</div>
  <a href="${DASHBOARD_PUBLIC_URL}/?focus=apply-now" style="display:inline-block;background:#16a34a;color:#ffffff;padding:10px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none">Open dashboard →</a>
</div>`.trim();
  }

  // Prefer a row evaluated >7 days ago (overdue for action)
  const sevenDaysAgoDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const overdueRow = applyNow.find(r => r.date && r.date <= sevenDaysAgoDate);
  const pick = overdueRow || applyNow[0];

  const url = getReportUrl(pick.reportPath);
  const packUrl = applyPackUrl(pick);
  const draftLink = `${DASHBOARD_PUBLIC_URL}/draft/${pick.num}`;
  const rowDeeplink = deeplink('row', pick.num);

  // Primary CTA: "Open apply pack →" deeplinks to /draft/{rowId} (dashboard draft route)
  // Falls back to the report URL if no draft route
  const primaryCtaHref = url || draftLink;
  const daysOld = pick.date ? Math.round((Date.now() - new Date(pick.date + 'T12:00:00').getTime()) / 86400000) : null;
  const ageLabel = daysOld !== null ? `${daysOld}d ago` : '';
  const scoreDisplay = pick.score ? pick.score.toFixed(2) : '—';

  return `<div class="tonight-card" style="margin:6px 0 8px;padding:16px 18px;background:#f0fdf4;border:2px solid #86efac;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:12px;color:#166534;margin-bottom:10px;line-height:1.3">
    <span style="display:inline-block;background:#dcfce7;color:#166534;border:1px solid #86efac;padding:2px 9px;border-radius:999px;font-weight:700;font-size:11px;margin-right:6px">${scoreDisplay}</span>
    <strong style="font-size:15px;color:#14532d">${pick.company}</strong>
    <span style="color:#374151;font-size:14px"> — ${(pick.role || '').slice(0, 70)}</span>
    ${ageLabel ? `<span style="font-size:11px;color:#6b7280;margin-left:6px">${ageLabel}</span>` : ''}
  </div>
  <div style="margin-bottom:12px">
    <a href="${primaryCtaHref}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:10px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;margin-right:6px" aria-label="Open apply pack for ${pick.company}">Open apply pack →</a>
    ${packUrl ? `<a href="${packUrl}" style="display:inline-block;background:transparent;color:#15803d;padding:9px 16px;border-radius:8px;border:1px solid #86efac;font-weight:600;font-size:12px;text-decoration:none;margin-right:6px" aria-label="Apply pack for ${pick.company}">Apply Pack</a>` : ''}
    <a href="${rowDeeplink}" style="display:inline-block;background:transparent;color:#374151;padding:9px 14px;border-radius:8px;border:1px solid #e5e7eb;font-weight:500;font-size:12px;text-decoration:none" aria-label="Open report for ${pick.company}">Report</a>
  </div>
  <div style="font-size:12px;color:#6b7280;line-height:1.4">
    ${applyNow.length > 1 ? `<a href="${DASHBOARD_PUBLIC_URL}/?focus=apply-now" style="color:#16a34a;text-decoration:none;font-size:11px">+${applyNow.length - 1} more in queue →</a>` : ''}
  </div>
</div>`.trim();
}

// ── DUE TODAY section ────────────────────────────────────────────────────────
// Consolidates Outreach Cadence (due_today + breakup) into compact one-line-
// per-contact cards with mailto: deeplinks. Auto-suppresses when nothing due.
// Returns { html: string, label: string, count: number }.
function renderDueTodaySection() {
  let summary;
  try { summary = buildOutreachSummary(); } catch { return { html: '', label: 'Due Today', count: 0 }; }
  const due = summary.due_today || [];
  const breakup = summary.breakup || [];
  const referrals = summary.referrals || [];
  const allDue = [...due, ...breakup, ...referrals];
  if (!allDue.length) return { html: '', label: 'Due Today', count: 0 };

  const label = `Due Today — ${allDue.length} outreach${allDue.length === 1 ? '' : 'es'}`;

  const rows = allDue.map(c => {
    const company = c.company || '(unknown)';
    const title = c.title_at_send || c.contact_type || '';
    const days = outreachDaysSince(c);
    const urgencyLevel = outreachUrgency(c);
    const urgencyColor = urgencyLevel === 'overdue' ? '#dc2626' : '#a87b48';
    const urgencyBg    = urgencyLevel === 'overdue' ? '#fee2e2' : '#f4ede1';

      // Mailto link
    let actionLink = '';
    try {
      const emailGuessRaw = c.intel?.email_guess;
      const emailStr = emailGuessRaw
        ? (typeof emailGuessRaw === 'string' ? emailGuessRaw : (emailGuessRaw.address || ''))
        : '';
      const contactForMailto = emailStr
        ? { ...c, intel: { ...(c.intel || {}), email_guess: emailStr } }
        : c;
      const { url: mailtoUrl } = buildOutreachMailto(contactForMailto, 'Mitchell');
      if (emailStr) {
        actionLink = `<a href="${mailtoUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:4px 10px;border-radius:6px;font-weight:600;font-size:11px;text-decoration:none;margin-left:8px">Send email</a>`;
      } else if (c.contact_id && c.contact_id.startsWith('https://')) {
        actionLink = `<a href="${c.contact_id}" style="display:inline-block;background:transparent;color:#5a76a6;padding:3px 9px;border-radius:6px;border:1px solid #c0cad9;font-weight:500;font-size:11px;text-decoration:none;margin-left:8px">LinkedIn</a>`;
      }
    } catch { /* non-fatal */ }

    const nx = c.next_action;
    const stratBadge = nx ? `<span style="display:inline-block;background:#e8edf4;color:#3d4f6b;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;margin-right:4px">S${nx.strategy_id}</span>` : '';
    const daysBadge = days !== null
      ? `<span style="display:inline-block;background:${urgencyBg};color:${urgencyColor};padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;margin-right:4px">day ${days}</span>`
      : '';

    return `<div style="padding:8px 0;border-bottom:1px solid #f4f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
    ${daysBadge}${stratBadge}
    <strong style="font-size:13px;color:#111827">${c.name || c.contact_id}</strong>
    <span style="font-size:12px;color:#6b7280"> · ${company}${title ? ', ' + title : ''}</span>
    ${actionLink}
  </div>
  ${nx && nx.rationale ? `<div style="font-size:11px;color:#6b7280;margin-top:3px;padding-left:2px;line-height:1.3">${nx.rationale.slice(0, 100)}${nx.rationale.length > 100 ? '…' : ''}</div>` : ''}
</div>`;
  }).join('');

  const html = `<div class="due-today-card" style="margin:4px 0 8px;padding:10px 14px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
${rows}
<div style="margin-top:8px;font-size:11px;color:#9ca3af"><a href="${DASHBOARD_PUBLIC_URL}/?focus=outreach" style="color:#16a34a;text-decoration:none;font-size:11px">log-touch.mjs →</a></div>
</div>`;

  return { html, label, count: allDue.length };
}

// Build the full HTML email using the MJML template + content rendering.
// The template (templates/heartbeat.mjml) handles structural chrome (hero,
// section labels, KPI tiles, mj-button bulletproof buttons, footer).
// Content comes from renderContentHtml(). MJML's mjml2html() call is async.
//
// Priority-order redesign (2026-05-17 heartbeat-priority-order):
//   §1 TONIGHT'S APPLY — one dominant role + primary CTA (action first)
//   §2 DUE TODAY — outreach + follow-ups consolidated (action second)
//   §3 DELTAS — signal pulse + day-over-day changes (context)
//   §4 TODAY'S FOCUS — LLM coaching directive (context, moved down from hero)
//   §5 WEEKLY GROWTH — TPgM Monday section (de-emphasized)
//   §6 PIPELINE PULSE — 3 KPI tiles + runway alert (minimal, delta-only)
//   §7 MAIN CONTENT — What's New + Apply-Now Queue + Activity + Pipeline Funnel
//   §8 FOOTER — small, quiet
//
// Wave D additions (2026-05-17) — preserved:
//   H1 — LLM "Today's Focus" callout (moved to §4)
//   H2 — Day-over-day diff badges on KPI tiles (preserved)
//   H3 — Conditional no-news early-exit (preserved)
//   H4 — Severity-tiered runway alert (in §6)
//   H5 — aria-label on every status emoji (preserved)
//   H6 — Button hierarchy: primary green solid / secondary gray ghost (preserved)
//   H7 — Limit per-role detail to top 5 + "+N more" (preserved)
//   H8 — "Ops:" subject prefix (updated to lead with TONIGHT'S APPLY company)
//   T2 #7 — Dashboard deeplinks (?focus=row:N) on every role-row link (preserved)
//   Signal Pulse — new section from data/company-pulse/*.json (now in §3)
//
// Preserves: dynamic-state subject/preheader (058cf18), BCC gate (8e99fd9),
// killed-dup-H1 + table-dedup (058cf18), MJML wiring (a11a88a),
// mailto: deeplinks (bd0a541), TPgM Monday section (e3ccd2f).
async function renderHtmlEmail(markdownBody, meta = {}) {
  const date           = meta.date || new Date().toISOString().slice(0, 10);
  const dashboardUrl   = meta.dashboardUrl || DASHBOARD_URL;
  const queueCount     = meta.queueCount || 0;
  const trackedCount   = meta.trackedCount || 0;
  const evaluatedToday = meta.evaluatedToday || 0;
  const newFromAlerts  = meta.newFromAlerts || 0;
  const newRoles       = meta.newRoles || 0;
  const runwayAlert    = meta.runwayAlert || false;
  const runwayState    = meta.runwayState || 'healthy';
  const outreachDue    = meta.outreachDue || 0;
  const applyNow       = meta.applyNow    || [];

  // H3 — no-news early-exit check
  const deltaScore    = meta.deltaScore   || 0;
  const noNewsToday   = (newRoles === 0 && !runwayAlert && deltaScore === 0 && outreachDue === 0);

  // Preheader preview text (state-driven, leads with TONIGHT'S APPLY company)
  const preheaderText = buildHeartbeatPreheader(meta);

  // §1 TONIGHT'S APPLY — dominant action card
  const tonightsApplyHtml = renderTonightsApplySection(applyNow);

  // §2 DUE TODAY — outreach consolidation
  const dueTodayResult = renderDueTodaySection();
  const dueTodayHtml  = dueTodayResult.html;
  const dueTodayCount = dueTodayResult.count;

  // §3 DELTAS — signal pulse (from data/company-pulse/*.json)
  const signalPulseHtml = renderSignalPulseSection();

  // §4 TODAY'S FOCUS — LLM coaching directive (moved down from hero per INTJ-T priority)
  // H1 from Wave D — cached per day, claude-haiku-4-5.
  let todaysFocus = '';
  if (!noNewsToday) {
    try { todaysFocus = await getTodaysFocus(meta); } catch {}
  }
  const todaysFocusHtml = todaysFocus
    ? `<div class="focus-callout" style="margin:4px 0 8px;padding:11px 14px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;font-size:13px;color:#14532d;line-height:1.5;font-style:italic">${todaysFocus}</div>`
    : '';

  // Combine §1–§4 into one actionSectionsHtml blob (single mj-text → single
  // MJML table, not 4 separate mj-sections). Section labels are inline spans
  // matching dashboard section-label style (uppercase, small, muted).
  function sectionLabel(text, accent = false) {
    const color = accent ? '#16a34a' : '#6b7280';
    return `<div style="font-size:10px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:${color};margin:10px 0 3px;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif">${text}</div>`;
  }

  let actionSectionsHtml = '';
  // §1 TONIGHT'S APPLY — accent label (leads the email)
  // Reordered 2026-05-19 (Phase A · A1 · CRITICAL-1) — single primary action
  // card now sits ABOVE NEXT MOVES so it's the first thing visible at 09:01 PT.
  actionSectionsHtml += sectionLabel("Tonight's Apply", true);
  actionSectionsHtml += tonightsApplyHtml;
  // §1b NEXT MOVES — ranked queue underneath the primary card
  const nextMovesHtml = renderNextMovesSection();
  if (nextMovesHtml) {
    actionSectionsHtml += sectionLabel('Next 3 actions queued', false);
    actionSectionsHtml += nextMovesHtml;
  }
  // §2 DUE TODAY — show label even when empty (shows "Outreach — clear")
  if (dueTodayHtml) {
    const dueTodayLabelText = dueTodayCount > 0
      ? `Due Today — ${dueTodayCount}`
      : 'Outreach';
    actionSectionsHtml += sectionLabel(dueTodayLabelText);
    actionSectionsHtml += dueTodayHtml;
  }
  // §3 DELTAS — only show when there are actual deltas
  if (signalPulseHtml) {
    actionSectionsHtml += sectionLabel('Deltas — Last 24h');
    actionSectionsHtml += signalPulseHtml;
  }
  // §4 TODAY'S FOCUS — show only when content present
  if (todaysFocusHtml) {
    actionSectionsHtml += sectionLabel("Today's Focus");
    actionSectionsHtml += todaysFocusHtml;
  }

  // H2 — day-over-day diff badges on KPI tiles
  const yday = loadYesterdayKpis();
  const kpiQueueBadge    = deltaBadge(queueCount,    yday?.queueCount,    { invert: false });
  const kpiEvalBadge     = deltaBadge(evaluatedToday, yday?.evaluatedToday, { invert: false });
  const kpiTrackedBadge  = deltaBadge(trackedCount,   yday?.trackedCount,   { invert: false });

  // H4 — Severity-tiered runway alert (in §6 Pipeline Pulse)
  let runwayAlertHtml = '';
  try {
    const density = computeRunwayDensityForHeartbeat();
    runwayAlertHtml = renderRunwayAlertTiered(density);
  } catch {}

  // Tier 5 system-status banner (calibration brief 2026-05-16)
  // Phase A · A3 · HIGH-1 (2026-05-19) — banner now renders as a one-liner with
  // a "details →" link pointing at the dashboard, not the 7-row table.
  let systemBannerHtml = '';
  try { systemBannerHtml = renderSystemBanner({ format: 'html', dashboardUrl: DASHBOARD_PUBLIC_URL }) || ''; } catch {}

  // Cron-health watchdog (added 2026-05-19). Auto-suppresses when all
  // tracked jobs (scan / scan-rss / scan-email) are healthy; lights up
  // a red/amber banner when one is failing or stale. Goal: surface
  // silent failures within 24h instead of 4 days.
  let cronHealthHtml = '';
  try { cronHealthHtml = renderCronHealthBanner({ format: 'html' }) || ''; } catch {}

  // CDP-attached Chrome auth-health banner — only renders if CDP is down OR
  // LinkedIn auth has broken. Self-suppresses when healthy. Reads
  // data/cdp-auth-state.json written by the 30-min cdp-auth-probe plist.
  let cdpAuthBannerHtml = '';
  try { cdpAuthBannerHtml = renderCdpAuthHealthSection({ format: 'html' }) || ''; } catch {}

  // Polish summary — last 24h of apply-pack-polish runs (added 2026-05-19).
  // Self-suppresses on zero runs; counts by verdict bucket (approved /
  // needs-review / rejected / abandoned) with deep-link row IDs.
  let polishSummaryHtml = '';
  try { polishSummaryHtml = (await renderPolishSummarySection({ format: 'html', sinceHours: 24 })) || ''; } catch {}

  // Master CV freshness banner (audit Item L 2026-05-18) — surfaces today's
  // master PDF path or a re-render reminder. Renders inline so it stacks with
  // the other system-status signals already in contextSectionsHtml.
  let cvFreshnessHtml = '';
  try {
    const cvBasename = `cv-mitchell-williams-master-${date}.pdf`;
    const cvPath = join(ROOT, 'output', cvBasename);
    if (existsSync(cvPath)) {
      cvFreshnessHtml =
        `<p style="margin:6px 0;font-size:13px;color:#0f172a;">` +
        `📄 <strong>Master CV ready:</strong> ` +
        `<a href="file://${cvPath}" style="color:#15803d;text-decoration:none;">${cvBasename}</a>` +
        `</p>`;
    } else {
      cvFreshnessHtml =
        `<p style="margin:6px 0;font-size:13px;color:#475569;">` +
        `📄 <strong>Master CV:</strong> re-render via ` +
        `<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;">node scripts/render-cv-typst.mjs --input cv.md --output output/${cvBasename}</code>` +
        `</p>`;
    }
  } catch { /* non-fatal */ }

  // Rejected pattern (auto-suppresses on zero discards in 7d)
  let discardSectionHtml = '';
  try { discardSectionHtml = renderDiscardPatternSection({ format: 'html', days: 7 }) || ''; } catch {}

  // §5 WEEKLY GROWTH — TPgM section (Monday only, de-emphasized)
  let tpgmHeartbeatSectionHtml = '';
  const _targetDateLocal = new Date(TARGET_DATE + 'T12:00:00');
  const _isMonday = _targetDateLocal.getDay() === 1;
  if (_isMonday) {
    try {
      const trackerOut = execSync(
        `node ${JSON.stringify(join(__dirname, 'tpgm-tracker.mjs'))} --json`,
        { cwd: ROOT, timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).toString('utf-8');
      const tpgmData = JSON.parse(trackerOut);
      const latestEv = (tpgmData.latest_evidence || [])[0] || null;
      const prevEv   = (tpgmData.latest_evidence || [])[1] || null;
      const latestScore  = tpgmData.tpgm_credibility_score ?? 0;
      const prevScore    = prevEv
        ? Math.max(0, latestScore - (latestEv ? latestEv.tpgm_evidence * 2 : 0))
        : latestScore;
      const weeklyDelta  = prevEv ? Math.round(latestScore - prevScore) : 0;
      const gapPoints    = (tpgmData.skill_gaps || []).reduce((s, g) => s + (g.pm_bridge_weight || 0), 0);
      const nextAction   = gapPoints > 0
        ? `Close ${tpgmData.skill_gaps[0]?.name || 'top gap'} — +${gapPoints} PM-Bridge points available`
        : 'Continue active courses to build TPgM credibility';
      tpgmHeartbeatSectionHtml = renderTpgmHeartbeatSection({
        score:          latestScore,
        evidence_count: latestEv ? (latestEv.tpgm_evidence || 0) : 0,
        weekly_delta:   weeklyDelta,
        week:           latestEv ? latestEv.week : null,
        next_action:    nextAction,
      });
    } catch { tpgmHeartbeatSectionHtml = ''; }
  }

  // Combine §6b context signals into one contextSectionsHtml blob
  // (cdp-auth banner FIRST — if it renders, it's an alarm that demands action
  // ahead of normal context; runway alert + polish summary + system banner +
  // discard pattern follow)
  let contextSectionsHtml = '';
  if (cdpAuthBannerHtml) contextSectionsHtml += cdpAuthBannerHtml;
  if (runwayAlertHtml) contextSectionsHtml += runwayAlertHtml;
  if (polishSummaryHtml) contextSectionsHtml += polishSummaryHtml;
  if (systemBannerHtml) contextSectionsHtml += systemBannerHtml;
  if (cronHealthHtml) contextSectionsHtml += cronHealthHtml;
  if (cvFreshnessHtml) contextSectionsHtml += cvFreshnessHtml;
  if (discardSectionHtml) contextSectionsHtml += discardSectionHtml;

  // H3 — no-news early-exit: minimal email on zero-delta days.
  if (noNewsToday) {
    const minimalMd = `_Nothing new today — pipeline running, no new roles above the threshold. See you tomorrow._\n\n[Open dashboard →](${DASHBOARD_PUBLIC_URL})`;
    const minimalContentHtml = renderContentHtml(minimalMd);
    let minimalTmpl = getMjmlTemplate();
    minimalTmpl = minimalTmpl
      .replace(/{{date}}/g,                    escapeForMjml(date))
      .replace(/{{dashboardUrl}}/g,             escapeForMjml(dashboardUrl))
      .replace(/{{preheaderText}}/g,            escapeForMjml(`${trackedCount} tracked. Nothing new today — pipeline running smoothly.`))
      .replace(/{{actionSectionsHtml}}/g,       actionSectionsHtml)
      .replace(/{{tpgmHeartbeatSectionHtml}}/g, tpgmHeartbeatSectionHtml)
      .replace(/{{kpiQueueCount}}/g,            String(queueCount) + kpiQueueBadge)
      .replace(/{{kpiEvaluatedToday}}/g,        String(evaluatedToday) + kpiEvalBadge)
      .replace(/{{kpiTrackedCount}}/g,          String(trackedCount) + kpiTrackedBadge)
      .replace(/{{contextSectionsHtml}}/g,      contextSectionsHtml)
      .replace(/{{contentHtml}}/g,              minimalContentHtml);

    const minResult = await mjml2html(minimalTmpl, { validationLevel: 'soft', minify: false });
    return minResult.html || '';
  }

  // Render markdown body to styled HTML (§7 content area)
  const contentHtml = renderContentHtml(markdownBody);

  // Interpolate data into the MJML template. Pre-rendered HTML blobs pass
  // through verbatim (no escapeForMjml). Scalar strings are escaped.
  let tmpl = getMjmlTemplate();
  tmpl = tmpl
    .replace(/{{date}}/g,                    escapeForMjml(date))
    .replace(/{{dashboardUrl}}/g,             escapeForMjml(dashboardUrl))
    .replace(/{{preheaderText}}/g,            escapeForMjml(preheaderText))
    .replace(/{{actionSectionsHtml}}/g,       actionSectionsHtml)
    .replace(/{{tpgmHeartbeatSectionHtml}}/g, tpgmHeartbeatSectionHtml)
    .replace(/{{kpiQueueCount}}/g,            String(queueCount) + kpiQueueBadge)
    .replace(/{{kpiEvaluatedToday}}/g,        String(evaluatedToday) + kpiEvalBadge)
    .replace(/{{kpiTrackedCount}}/g,          String(trackedCount) + kpiTrackedBadge)
    .replace(/{{contextSectionsHtml}}/g,      contextSectionsHtml)
    .replace(/{{contentHtml}}/g,              contentHtml);

  const result = await mjml2html(tmpl, {
    validationLevel: 'soft',
    minify: false,
  });

  if (result.errors && result.errors.length > 0) {
    for (const e of result.errors) {
      console.warn(`[mjml] ${e.formattedMessage || e.message || JSON.stringify(e)}`);
    }
  }

  return result.html || '';
}

async function sendEmail({ subject, body, meta = {} }) {
  const secrets = loadSecrets();
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: secrets.GMAIL_USER, pass: secrets.GMAIL_APP_PASSWORD },
  });

  // Gmail alias routing test (Phase 2 Day-1 — data/heartbeat-email-optimization-2026-05-17.md).
  // The Phase 2 council split on whether self-send (mitwilli@gmail.com → mitwilli@gmail.com)
  // routes to Primary, Promotions/Updates, or bypasses-to-All-Mail. The 5-minute
  // empirical resolution is: send to BOTH the canonical address AND a +alias for
  // a bounded observation window, then compare placement.
  //
  // To activate: set in .env (both required, both expire automatically):
  //   HEARTBEAT_ALIAS_BCC=mitwilli+heartbeat@gmail.com
  //   HEARTBEAT_ALIAS_BCC_UNTIL=2026-05-24      # ISO date, inclusive
  //
  // After the until-date passes, BCC auto-disables without code change. Set
  // HEARTBEAT_ALIAS_BCC_UNTIL to a later date to extend the test, or unset
  // HEARTBEAT_ALIAS_BCC to disable immediately.
  const aliasBcc = process.env.HEARTBEAT_ALIAS_BCC;
  const aliasUntil = process.env.HEARTBEAT_ALIAS_BCC_UNTIL;
  let bcc = undefined;
  if (aliasBcc && aliasUntil) {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (todayIso <= aliasUntil) {
      bcc = aliasBcc;
    }
  }

  const html = await renderHtmlEmail(body, meta);

  // Archive rendered HTML for /email-review skill (added 2026-05-19).
  // The email-review-strategist orchestrator at 09:30 PT reads
  // data/heartbeat-archive/heartbeat-<date>.html as its primary input.
  const archiveDir = join(ROOT, 'data/heartbeat-archive');
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
  const archivePath = join(archiveDir, `heartbeat-${TARGET_DATE}.html`);
  writeFileSync(archivePath, html, 'utf8');

  const info = await transporter.sendMail({
    from: secrets.GMAIL_USER,
    to: secrets.HEARTBEAT_TO,
    bcc,
    subject,
    text: body,
    html,
  });
  return { messageId: info.messageId, bccTo: bcc || null };
}

function fileLineCount(path) {
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf-8').split('\n').length;
}

// Returns true if the file was modified within the last `hoursAgo` hours.
// 8h catches today's 02:00 PT scheduled fire (heartbeat at 09:00 PT) but not
// yesterday's fire or prior-evening manual tests that share today's UTC date —
// avoiding the silent-failure mode where mtime UTC date matches TARGET_DATE
// even when today's scheduled fire never ran.
function fileModifiedRecently(path, hoursAgo = 8) {
  if (!existsSync(path)) return false;
  const cutoff = Date.now() - hoursAgo * 3600 * 1000;
  return statSync(path).mtime.getTime() >= cutoff;
}

function countPipelinePending(path) {
  if (!existsSync(path)) return 0;
  const content = readFileSync(path, 'utf-8');
  return content.split('\n').filter(l => l.startsWith('- [ ]')).length;
}

function countTriageRows(path) {
  if (!existsSync(path)) return 0;
  // TSV: header line + N data lines. Count data lines only.
  const lines = readFileSync(path, 'utf-8').split('\n').filter(l => l.trim());
  return Math.max(0, lines.length - 1);
}

function countApplicationsRows(path) {
  if (!existsSync(path)) return 0;
  const content = readFileSync(path, 'utf-8');
  // Markdown table: data rows start with "| " and a digit
  return content.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l)).length;
}

function countScanHistoryRows(path) {
  if (!existsSync(path)) return 0;
  const lines = readFileSync(path, 'utf-8').split('\n').filter(l => l.trim());
  return Math.max(0, lines.length - 1);
}

function countReports(date) {
  const reportsDir = join(ROOT, 'reports');
  if (!existsSync(reportsDir)) return 0;
  const files = readdirSync(reportsDir);
  return files.filter(f => f.includes(date) && f.endsWith('.md')).length;
}

// Parse applications.md into structured rows for ranking.
function parseApplicationsTracker(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line.split('|').map(c => c.trim());
    // cells[0] is empty before leading |, cells[1..9] are the columns
    const num = cells[1];
    const date = cells[2];
    const company = cells[3];
    const role = cells[4];
    const scoreStr = cells[5];
    const status = cells[6];
    const reportCell = cells[8];
    const notes = cells[9] || '';
    const scoreMatch = scoreStr.match(/(\d+(?:\.\d+)?)/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    const reportPathMatch = reportCell.match(/\(([^)]+)\)/);
    rows.push({
      num: parseInt(num, 10),
      date,
      company,
      role,
      score,
      status,
      reportPath: reportPathMatch ? reportPathMatch[1] : '',
      notes,
    });
  }
  return rows;
}

// Read the URL from a report file's header (look for `**URL:**`).
// If the stored URL is a LinkedIn jobs/view URL, substitute the cached
// canonical ATS URL (resolved by lib/resolve-ats-url.mjs) so email links
// point directly to the company's ATS rather than LinkedIn.
function getReportUrl(reportPath) {
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return '';
  const text = readFileSync(fullPath, 'utf-8').slice(0, 2000);
  const m = text.match(/\*\*URL:\*\*\s*(\S+)/);
  if (!m) return '';
  return getCachedUrl(m[1], ROOT);
}

// Compress a notes cell to a single concise line for the email table.
// Strategy: take the first sentence, strip markdown links, cap length.
function compressNote(notes, maxLen = 180) {
  if (!notes) return '';
  let s = notes.replace(/\[(\d+)\]\([^)]+\)/g, '#$1'); // [002](reports/...) → #002
  s = s.replace(/\s+/g, ' ').trim();
  // Take up to first ". " split or full
  const firstSentence = s.split(/(?<=\.)\s/)[0];
  if (firstSentence.length <= maxLen) return firstSentence;
  return s.slice(0, maxLen - 1).trimEnd() + '…';
}

const APPLY_NOW_FLOOR = 4.0;
// Show every role that meets the floor — not just the top 10. The user wants
// the full Apply-Now queue visible in email so nothing gets hidden below the
// fold. Cap is kept generous (50) only to protect against runaway batches that
// somehow score 100+ roles ≥ 4.0 in a single day.
const APPLY_NOW_LIMIT = 50;
// Detail blocks (per-role strengths/gaps/verdict) are heavy. Render them for
// the top N only; everything else still appears in the at-a-glance summary
// table at the top with a clickable "Report" link.
//
// Why 10: Gmail clips messages over 102KB body size. Each detail block is
// ~5KB rendered HTML (4 strengths + 3 gaps + verdict + links). 10 detail
// blocks × 5KB plus chrome (~25KB) + summary table for ALL roles puts us
// safely under the threshold so nothing gets "Message clipped".
const APPLY_NOW_DETAIL_LIMIT = 10;
// Apply Packs are expensive to build (~5 files per role). Limit nightly
// pack rendering to the top 3 of the Apply-Now Queue + the highest-scoring
// "What's New Overnight" row. Rows outside this set still get Apply +
// Report links, just no 📦 Pack link.
const APPLY_PACK_TOP_N = 3;
// Only roles Mitchell hasn't acted on yet should appear in Apply-Now.
// "Interview" / "Applied" / "Offer" / "Rejected" / "Discarded" all mean a
// decision has been made or is in progress. "Responded" stays because it
// means the company replied but Mitchell hasn't yet acted (e.g., scheduling).
const ACTIONABLE_STATUSES = new Set(['Evaluated', 'Responded']);

// Local static-file server (started by dashboard-server.mjs via
// launchd) — lets email links open the dashboard and individual reports
// directly in Chrome. http://localhost is one of the few non-https schemes
// Gmail keeps clickable.
const DASHBOARD_PORT = process.env.CAREER_OPS_DASHBOARD_PORT
  ? parseInt(process.env.CAREER_OPS_DASHBOARD_PORT, 10)
  : 7777;
const DASHBOARD_BASE = `http://localhost:${DASHBOARD_PORT}`;

// Public URL (Cloudflare tunnel) — used in emailed links so they work on
// mobile, corp laptop, or any non-localhost surface. Falls back to localhost
// for local dev / testing without secrets.
const _secretsForPublicUrl = (() => { try { return loadSecrets(); } catch { return {}; } })();
const PUBLIC_BASE = _secretsForPublicUrl.CAREER_OPS_PUBLIC_URL
  ? _secretsForPublicUrl.CAREER_OPS_PUBLIC_URL.replace(/\/$/, '')
  : DASHBOARD_BASE;

const DASHBOARD_URL = `${PUBLIC_BASE}/`;
const reportUrl = (relPath) => `${PUBLIC_BASE}/${relPath.replace(/^\.?\//, '')}`;

// ── Wave D: Dashboard deeplinks (T2 #7) ─────────────────────────────────────
// Configurable public URL for deeplinks. Env var DASHBOARD_PUBLIC_URL wins;
// falls back to PUBLIC_BASE (which itself falls back to localhost:7777).
// Every role-row link in the heartbeat appends ?focus=row:{N} (or
// ?focus=company:{slug}) so the Wave C-A drill-in registry opens the right
// row on load.
const DASHBOARD_PUBLIC_URL = (() => {
  const s = (() => { try { return loadSecrets(); } catch { return {}; } })();
  return (process.env.DASHBOARD_PUBLIC_URL || s.DASHBOARD_PUBLIC_URL || PUBLIC_BASE).replace(/\/$/, '');
})();
function deeplink(type, value) {
  return `${DASHBOARD_PUBLIC_URL}/?focus=${encodeURIComponent(type + ':' + value)}`;
}

// ── Wave D: LLM "Today's Focus" (H1) — one Haiku call per heartbeat date ────
// Cache file: data/heartbeat-cache/today-focus-{date}.json
// Schema: { date, focus, model, tokens, cost_usd }
// Budget cap: $1.00. Falls back to static text if API key missing / over cap.
const HEARTBEAT_CACHE_DIR = join(ROOT, 'data/heartbeat-cache');
async function getTodaysFocus(metaState) {
  const cacheFile = join(HEARTBEAT_CACHE_DIR, `today-focus-${TARGET_DATE}.json`);
  // Return cached value if available (avoids re-running on --preview calls)
  if (existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf-8'));
      if (cached && cached.focus) return cached.focus;
    } catch { /* fall through */ }
  }

  // Budget cap: skip LLM if no API key
  const apiKey = process.env.ANTHROPIC_API_KEY || (() => {
    try {
      const s = loadSecrets();
      return s.ANTHROPIC_API_KEY;
    } catch { return ''; }
  })();
  if (!apiKey) {
    return buildFocusFallback(metaState);
  }

  const { newRoles = 0, runwayAlert = false, runwayState = 'healthy',
          outreachDue = 0, queueCount = 0 } = metaState;
  // Compute rough runway days from weeks env (same as computeRunwayDensityForHeartbeat)
  const runwayWeeks = parseInt(process.env.RUNWAY_WEEKS || '12');
  const runwayDays = runwayWeeks * 7;

  const stateStr = `{newRoles=${newRoles}, applyNowReady=${queueCount}, outreachDue=${outreachDue}, runwayDays=${runwayDays}, runwayAlert=${runwayAlert}, runwayState=${runwayState}}`;
  const prompt = `You are Mitchell Williams's executive coach. Given today's pipeline state, in EXACTLY 1-2 sentences, what should Mitchell prioritize right now? Tone: terse, action-paired, no hedging. State: ${stateStr}. Output: plain text, no markdown, max 240 chars.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 100,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      console.warn(`[heartbeat/h1] Haiku API ${resp.status} — using fallback`);
      return buildFocusFallback(metaState);
    }

    const data = await resp.json();
    const focus = (data.content?.[0]?.text || '').trim().slice(0, 240);
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    // Haiku pricing: $0.80/MTok input, $4.00/MTok output (as of 2025)
    const costUsd = (inputTokens * 0.00000080) + (outputTokens * 0.00000400);

    // Persist cache
    try {
      if (!existsSync(HEARTBEAT_CACHE_DIR)) mkdirSync(HEARTBEAT_CACHE_DIR, { recursive: true });
      writeFileSync(cacheFile, JSON.stringify({
        date: TARGET_DATE, focus, model: 'claude-haiku-4-5',
        tokens: { input: inputTokens, output: outputTokens }, cost_usd: costUsd,
      }));
    } catch { /* cache write failure is non-fatal */ }

    console.log(`[heartbeat/h1] Today's Focus: ${focus.slice(0, 80)}… (${inputTokens}in/${outputTokens}out, $${costUsd.toFixed(4)})`);
    return focus;
  } catch (err) {
    console.warn(`[heartbeat/h1] LLM call failed (${err.message}) — using fallback`);
    return buildFocusFallback(metaState);
  }
}

function buildFocusFallback(metaState) {
  const { newRoles = 0, runwayAlert = false, outreachDue = 0, queueCount = 0 } = metaState;
  if (runwayAlert) return `Outreach is below your runway floor — push to 10+ touches this week to stay on track. ${queueCount} role${queueCount === 1 ? '' : 's'} are ready to apply.`;
  if (newRoles > 0) return `${newRoles} new role${newRoles === 1 ? '' : 's'} scored 4.0 or above — open the top one, build your apply pack, and submit tonight.`;
  if (outreachDue > 0) return `${outreachDue} follow-up${outreachDue === 1 ? '' : 's'} due today — send them before noon so nothing stalls.`;
  return `${queueCount} role${queueCount === 1 ? '' : 's'} ready to apply — pick the highest-scoring one and get an application out today.`;
}

// ── Wave D: Day-over-day KPI diff (H2) ──────────────────────────────────────
// Read yesterday's heartbeat markdown file and parse the same KPI values.
// Returns { queueCount, trackedCount, evaluatedToday, newFromAlerts } or null.
function loadYesterdayKpis() {
  try {
    const yDate = new Date(TARGET_DATE + 'T12:00:00');
    yDate.setDate(yDate.getDate() - 1);
    const yDateStr = yDate.toISOString().slice(0, 10);
    const yPath = join(ROOT, `data/heartbeat-${yDateStr}.md`);
    if (!existsSync(yPath)) return null;
    const text = readFileSync(yPath, 'utf-8');

    // Extract KPI values from the markdown heartbeat text.
    // The heartbeat renders these in the "Pipeline Funnel" section and System Status.
    // Fallback: parse the MJML-injected values aren't in md — we stored them in meta comments.
    // Reliable signal: parse "### Totals" or direct numbers from known line patterns.
    // We look for the specific patterns the generator writes.
    const queueMatch = text.match(/\*\*At-a-glance summary\*\* — (\d+) role/);
    const trackedMatch = text.match(/Total tracked overall\s*\|\s*(\d+)/);
    const evalMatch = text.match(/Evaluated today\s*\|\s*(\d+)/);
    const alertMatch = text.match(/From newsletter alerts[^|]*\|\s*\*\*(\d+) new\*\*/);

    return {
      queueCount:    queueMatch    ? parseInt(queueMatch[1], 10)   : null,
      trackedCount:  trackedMatch  ? parseInt(trackedMatch[1], 10) : null,
      evaluatedToday: evalMatch    ? parseInt(evalMatch[1], 10)    : null,
      newFromAlerts:  alertMatch   ? parseInt(alertMatch[1], 10)   : null,
    };
  } catch { return null; }
}

// Format a day-over-day delta badge as an inline HTML span.
// delta > 0 → green ↑ (for growth metrics like evaluatedToday, newFromAlerts)
// delta < 0 → red ↓ (same metrics — fewer evals/alerts is negative)
// delta === 0 → gray → (neutral)
// `invert` = true for metrics where increase is bad (e.g., if any were inverted)
function deltaBadge(current, yesterday, { invert = false } = {}) {
  if (yesterday === null || yesterday === undefined || isNaN(current) || isNaN(yesterday)) {
    return '<span style="font-size:10px;color:#94a3b8;margin-left:4px">—</span>';
  }
  const delta = current - yesterday;
  if (delta === 0) {
    return '<span style="font-size:10px;color:#94a3b8;margin-left:4px">±0</span>';
  }
  const positive = invert ? delta < 0 : delta > 0;
  const color = positive ? '#16a34a' : '#dc2626';
  const arrow = delta > 0 ? '↑' : '↓';
  return `<span style="font-size:10px;font-weight:600;color:${color};margin-left:4px">${arrow}${Math.abs(delta)} vs yday</span>`;
}

// Resolve an Apply Pack folder for a tracker row, or return null if not built
// yet. Slug = "{NUM}-{company-slug}-{role-slug}" matched against the dirs in
// apply-pack/. Currently per-row pack — generalize later when the bundler
// runs nightly.
function applyPackUrl(row) {
  const packsDir = join(ROOT, 'apply-pack');
  if (!existsSync(packsDir)) return null;
  const pad = String(row.num).padStart(3, '0');
  // Find any directory starting with NUM- (handles slug variations across
  // company / role naming). Returns the first match.
  try {
    const entries = readdirSync(packsDir);
    const match = entries.find(e => e.startsWith(`${pad}-`));
    if (match) return `${PUBLIC_BASE}/apply-pack/${match}/README.md`;
  } catch {}
  return null;
}

// One-click status flip URL — points at /mark on dashboard-server.mjs.
// Hitting it edits applications.md (Evaluated → Applied) and shows a
// confirmation page. Used in the heartbeat email so Mitchell can clear
// items from tomorrow's Apply-Now Queue without leaving Gmail.
function markStatusUrl(rowNum, status = 'Applied') {
  return `${PUBLIC_BASE}/mark?num=${rowNum}&status=${encodeURIComponent(status)}`;
}

function getApplyNowQueue(rows) {
  return rows
    .filter(r => ACTIONABLE_STATUSES.has(r.status) && r.score >= APPLY_NOW_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, APPLY_NOW_LIMIT);
}

// Lightweight liveness check. SPA-heavy ATSes (Greenhouse/Ashby/Lever/
// Workday) hydrate Apply buttons via JS, so a server-side body scan can't
// see the Apply control. We use a permissive classifier: only mark as
// expired on hard signals (4xx, redirect to listing, explicit "filled"
// phrases). 2xx without expired signals = active.
//
// Many ATS hosts also expose a JSON API counterpart that returns 200 only
// when the role is open and 404/410 when removed (e.g., Greenhouse boards-
// api). For Greenhouse/Ashby URLs we ALSO check the API endpoint as a
// stronger expiry signal.
// Liveness primitives extracted to lib/liveness.mjs (2026-05-18) so
// scripts/liveness-sweep.mjs can reuse them without importing heartbeat.mjs
// and triggering its main(). Local aliases preserve call-site simplicity.
const verifyApplyNowLink = _libVerifyApplyNowLink;
const markRowAsExpired = _libMarkRowAsExpired;

// Extract the strongest 3-5 matches from Block B with their emphasize hints.
function getStrongMatches(reportPath, limit = 5) {
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return [];
  const text = readFileSync(fullPath, 'utf-8');
  const startMatch = text.match(/^## B\)[^\n]*$/m);
  if (!startMatch) return [];
  const start = startMatch.index + startMatch[0].length;
  const rest = text.slice(start);
  const endIdx = rest.indexOf('\n## ');
  const block = endIdx === -1 ? rest : rest.slice(0, endIdx);

  const rows = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;
    if (/^\|\s*JD\s*Requirement|^\|\s*Requisito/i.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    const requirement = cells[0].replace(/\*\*/g, '');
    const evidence = cells[1];
    const matchCell = cells[2];
    const numMatch = matchCell.match(/(\d+(?:\.\d+)?)\s*\/\s*5/);
    let score = numMatch ? parseFloat(numMatch[1]) : null;
    if (!score) {
      if (/UNIQUELY\s+STRONG|✅\s*STRONG/i.test(matchCell)) score = 5;
      else if (/MEDIUM/i.test(matchCell)) score = 3;
      else continue;
    }
    if (score < 4.0 || !requirement) continue;
    // Pull "How to emphasize" hint if present in evidence
    const emphasizeMatch = evidence.match(/→\s*\*?\*?How to emphasize:?\*?\*?\s*([^\n]+?)(?:\.<br>|\.$|<br>|$)/i);
    const emphasize = emphasizeMatch ? emphasizeMatch[1].trim().replace(/\.$/, '') : '';
    // Strip the emphasize line from main evidence so it's not duplicated
    const cleanEvidence = evidence.replace(/→\s*\*?\*?How to emphasize:?\*?\*?[^\n]+/i, '').trim();
    rows.push({ score, requirement, evidence: cleanEvidence, emphasize });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, limit);
}

// Extract gap-mitigation rows from the "### Gaps and mitigation" subsection
// of Block B. Handles BOTH formats produced by the evaluator:
//
//   Format A: Markdown table
//     | Gap | Hard blocker? | Mitigation |
//     | --- | --- | --- |
//     | Python "(learning)" | Soft | Ship 1 Python artifact... |
//
//   Format B: Bulleted list per gap (more verbose, common in batch worker)
//     **Gap 1: Marketing-org tenure**
//     - Hard blocker? **No** — JD says...
//     - **Mitigation:** Don't apologize for the comms framing...
//
function getGapMitigations(reportPath, limit = 5) {
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return [];
  const text = readFileSync(fullPath, 'utf-8');
  const startMatch = text.match(/^### (?:Gaps and Mitigation|Gaps and mitigation|Gaps & mitigation|Gap mitigation|Brechas)[^\n]*$/im);
  if (!startMatch) return [];
  const start = startMatch.index + startMatch[0].length;
  const rest = text.slice(start);
  const endIdx = rest.search(/\n##\s|\n---\s*\n/);
  const block = endIdx === -1 ? rest : rest.slice(0, endIdx);

  const rows = [];

  // Format A: markdown table rows
  for (const line of block.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;
    if (/^\|\s*Gap\s*\|/i.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    const gap = cells[0].replace(/\*\*/g, '');
    const blocker = cells[1];
    const mitigation = cells[2];
    if (!gap || !mitigation) continue;
    rows.push({ gap, blocker, mitigation });
  }

  // Format B: bullet-list per gap, bold-prefixed (`**Gap N: Title**`)
  if (rows.length === 0) {
    // Split block into per-gap chunks at each `**Gap N:` marker
    const chunks = block.split(/\n(?=\*\*Gap\s+\d+:)/i);
    for (const chunk of chunks) {
      const titleMatch = chunk.match(/^\*\*Gap\s+\d+:\s+([^*\n]+)\*\*/i);
      if (!titleMatch) continue;
      const gap = titleMatch[1].trim();
      // Find blocker line
      const blockerMatch = chunk.match(/[-*]\s+Hard blocker\??\s*[:?\-—]?\s*([^\n]+)/i);
      const blocker = blockerMatch ? blockerMatch[1].replace(/\*\*/g, '').slice(0, 100) : '';
      // Find mitigation line — handle bold and non-bold variants
      const mitMatch = chunk.match(/(?:\*\*Mitigation:\*\*|\*\*Mitigation\*\*:|^[-*]\s+\*\*Mitigation:?\*\*)\s*([\s\S]*?)(?=\n\*\*Gap\s+\d+:|\n###|\n##|$)/im);
      const mitigation = mitMatch
        ? mitMatch[1].trim().replace(/\n[-*]\s+/g, ' · ').replace(/\s+/g, ' ').slice(0, 500)
        : '';
      if (!mitigation) continue;
      rows.push({ gap, blocker: blocker || 'see report', mitigation });
    }
  }

  return rows.slice(0, limit);
}

// Render one Apply-Now role as a self-contained HTML block.
//
// Wave D changes:
//   H5 — aria-label on every status emoji (✅, ⚠️, 🎯, 💡)
//   H6 — Button hierarchy: primary green solid (Apply, Apply Pack, Mark Applied)
//        vs secondary gray-outline ghost (Open report, Snooze)
//   T2 #7 — Dashboard deeplink: row header links to ?focus=row:{N}
//
// `packEligibleNums` (Set<number>) gates Pack-link rendering.
function formatRoleBlock(r, packEligibleNums = null) {
  const out = [];
  out.push('---');
  out.push('');

  // T2 #7 — row header deeplinks to dashboard focus
  const rowDeeplink = deeplink('row', r.num);
  out.push(`### [#${r.num} — ${r.company} — ${r.role}](${rowDeeplink})`);
  out.push('');

  // H5 — aria-label on link-status emoji
  const linkStatusSuffix = r._linkStatus && r._linkStatus.result !== 'active'
    ? `  ·  <span role="img" aria-label="Warning: link status ${r._linkStatus.result}">⚠️</span> link: ${r._linkStatus.result} (${r._linkStatus.reason})`
    : '';
  out.push(`**Score:** ${r.score.toFixed(2)} / 5${linkStatusSuffix}`);
  out.push('');

  // Strongest matches with how-to-emphasize hints
  const matches = getStrongMatches(r.reportPath, 4);
  if (matches.length > 0) {
    // H5 — aria-label on ✅ emoji
    out.push(`**<span role="img" aria-label="Checkmark: strong match">✅</span> Why I'm a strong match:**`);
    out.push('');
    for (const m of matches) {
      const evidence = m.evidence
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 280);
      out.push(`- **${m.score}/5  ${m.requirement.slice(0, 110)}** — ${evidence}${m.evidence.length > 280 ? '…' : ''}`);
      if (m.emphasize) out.push(`  - <span role="img" aria-label="Target: how to emphasize">🎯</span> **How to emphasize:** ${m.emphasize.slice(0, 220)}`);
    }
    out.push('');
  }

  // Gap mitigations (especially important for skills user doesn't fully meet)
  const gaps = getGapMitigations(r.reportPath, 3);
  if (gaps.length > 0) {
    // H5 — aria-label on ⚠️ emoji
    out.push(`**<span role="img" aria-label="Warning: gaps to address">⚠️</span> How to address gaps:**`);
    out.push('');
    for (const g of gaps) {
      const blocker = g.blocker.replace(/\*\*/g, '').slice(0, 50);
      const mitigation = g.mitigation
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 280);
      out.push(`- **${g.gap.slice(0, 100)}** _(${blocker})_`);
      // H5 — aria-label on 💡 emoji
      out.push(`  - <span role="img" aria-label="Lightbulb: mitigation tip">💡</span> ${mitigation}${g.mitigation.length > 280 ? '…' : ''}`);
    }
    out.push('');
  }

  // Verdict from notes (compact)
  const verdict = compressNote(r.notes, 240);
  if (verdict) {
    out.push(`**Verdict:** ${verdict}`);
    out.push('');
  }

  // H6 — Button hierarchy: primary green solid vs secondary gray-outline ghost
  // Primary (green solid, background:#16a34a): Apply Pack, Mark Applied, Apply
  // Secondary (gray outline, transparent + border): Open report, Snooze
  //
  // In markdown context (rendered via marked() → renderContentHtml()), we
  // render as styled inline-HTML anchors since markdown link syntax can't
  // express button styles. marked() passes unknown HTML through intact.
  const url = getReportUrl(r.reportPath);
  const packUrl = applyPackUrl(r);
  const packAllowed = packEligibleNums == null || packEligibleNums.has(r.num);

  // Primary button style (H6)
  const primaryBtn = (text, href, ariaSuffix = '') =>
    `<a href="${href}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:6px 14px;border-radius:6px;font-weight:600;font-size:13px;text-decoration:none;margin:2px 4px 2px 0"${ariaSuffix}>${text}</a>`;
  // Secondary button style (H6)
  const secondaryBtn = (text, href, ariaSuffix = '') =>
    `<a href="${href}" style="display:inline-block;background:transparent;color:#374151;padding:5px 13px;border-radius:6px;border:1px solid #d1d5db;font-weight:500;font-size:13px;text-decoration:none;margin:2px 4px 2px 0"${ariaSuffix}>${text}</a>`;

  const btnBits = [];
  if (url) btnBits.push(primaryBtn('Apply', url, ` aria-label="Apply to ${r.company}"`));
  if (packUrl && packAllowed) btnBits.push(primaryBtn('Apply Pack', packUrl, ` aria-label="Open apply pack for ${r.company}"`));
  btnBits.push(primaryBtn('Mark Applied', markStatusUrl(r.num, 'Applied'), ` aria-label="Mark ${r.company} as applied"`));
  if (r.reportPath) btnBits.push(secondaryBtn('Open report', `${deeplink('row', r.num)}`, ` aria-label="Open report for ${r.company}"`));

  if (btnBits.length) out.push(btnBits.join(''));
  out.push('');
  return out;
}

function formatApplyNowQueue(rows, packEligibleNums = null) {
  if (rows.length === 0) {
    return [
      `_Queue empty — nothing above the ${APPLY_NOW_FLOOR.toFixed(1)} floor. Review top discards to override._`,
    ];
  }
  const out = [];
  // H7 — Limit per-role detail to top 5 + "+N more →" deeplink to dashboard
  // (Wave D 2026-05-17). Reduces clipping risk; trims to one mobile viewport.
  // Detail limit is now 5 (was APPLY_NOW_DETAIL_LIMIT=10) per optimization report
  // finding #8. The dashboard shows the full queue with sortable table + filters.
  const WAVE_D_DETAIL_LIMIT = 5;
  out.push(`**${rows.length} role${rows.length === 1 ? '' : 's'} above ${APPLY_NOW_FLOOR.toFixed(1)}** — detail for top ${Math.min(WAVE_D_DETAIL_LIMIT, rows.length)} below.`);
  out.push('');
  // Detail blocks for the top 5 only — keeps the email under one mobile viewport.
  const detailRows = rows.slice(0, WAVE_D_DETAIL_LIMIT);
  if (rows.length > detailRows.length) {
    const remaining = rows.length - detailRows.length;
    // T2 #7 — deeplink to dashboard apply-now view for the "+N more" overflow link
    const moreUrl = `${DASHBOARD_PUBLIC_URL}/?focus=apply-now`;
    out.push(`_Showing top ${detailRows.length}. [+${remaining} more role${remaining === 1 ? '' : 's'} in your queue →](${moreUrl})_`);
    out.push('');
  }
  for (const r of detailRows) {
    for (const line of formatRoleBlock(r, packEligibleNums)) out.push(line);
  }
  return out;
}

// Render the "What's New Overnight" section — roles that landed in
// Apply-Now today (date == TARGET_DATE). Sits ABOVE the main Apply-Now
// Queue so Mitchell sees what's freshly surfaced before the cumulative
// list. The #1 row gets full detail + Apply Pack; the rest are a
// compact per-row line.
function formatWhatsNewSection(whatsNew, packEligibleNums) {
  const out = [];
  out.push('## What\'s New Overnight');
  out.push('');
  if (whatsNew.length === 0) {
    out.push(`_No new roles overnight. Batch ran — nothing new scored ≥ ${APPLY_NOW_FLOOR.toFixed(1)}. Queue unchanged._`);
    out.push('');
    return out;
  }
  out.push(`_${whatsNew.length} new role${whatsNew.length === 1 ? '' : 's'} above ${APPLY_NOW_FLOOR.toFixed(1)} — top row has a built Apply Pack._`);
  out.push('');

  // Compact summary table for ALL of today's new roles
  out.push('| # | Score | Company — Role | Apply | Report | Pack | Mark |');
  out.push('|---|------|----------------|-------|--------|------|------|');
  for (const r of whatsNew) {
    const applyUrl = getReportUrl(r.reportPath);
    const applyCell = applyUrl ? `[Apply](${applyUrl})` : '—';
    const reportCell = r.reportPath ? `[Open](${reportUrl(r.reportPath)})` : '—';
    const packUrl = applyPackUrl(r);
    const packAllowed = packEligibleNums == null || packEligibleNums.has(r.num);
    const packCell = (packUrl && packAllowed) ? `📦 [Pack](${packUrl})` : '—';
    const markCell = `[✅ Applied](${markStatusUrl(r.num, 'Applied')})`;
    out.push(`| ${r.num} | ${r.score.toFixed(2)} | ${r.company} — ${r.role.slice(0, 60)} | ${applyCell} | ${reportCell} | ${packCell} | ${markCell} |`);
  }
  out.push('');

  // Full detail block for the #1 only — keeps the section focused on
  // "what's the single most exciting thing that landed overnight".
  out.push(`### Top new role`);
  out.push('');
  for (const line of formatRoleBlock(whatsNew[0], packEligibleNums)) out.push(line);
  return out;
}

// Group every applications.md row by its canonical status so the email can
// surface the full funnel (not just Apply-Now). Counts are the headline
// number; sample rows let the user see the most recent activity per bucket.
function getStatusBreakdown(rows) {
  const buckets = {};
  for (const r of rows) {
    const key = (r.status || 'Unknown').trim();
    if (!buckets[key]) buckets[key] = { count: 0, rows: [] };
    buckets[key].count++;
    buckets[key].rows.push(r);
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  return buckets;
}

const STATUS_DISPLAY_ORDER = ['Offer', 'Interview', 'Responded', 'Applied', 'Evaluated', 'Rejected', 'Discarded', 'SKIP'];
const STATUS_GLYPH = {
  Offer: '🏆', Interview: '💬', Responded: '📨', Applied: '📤',
  Evaluated: '🔎', Rejected: '🚫', Discarded: '🗑', SKIP: '⏭',
};

// ── Outreach Cadence ───────────────────────────────────────────────────────
// Surfaces LinkedIn / X / email contacts who got a DM and went silent.
// Sourced from data/outreach-state.json via lib/outreach-tracker.mjs.
// The section auto-suppresses when there's nothing to do (no due_today,
// no breakup-window contacts) to avoid "inbox-zero noise" in the email.
function formatOutreachCadence() {
  const summary = buildOutreachSummary();
  const due = summary.due_today;
  const breakup = summary.breakup;
  const referrals = summary.referrals;
  // Quiet days: emit nothing. Heartbeat stays clean.
  if (!due.length && !breakup.length && !referrals.length) return [];

  const out = [];
  const dueCount = due.length;
  const overdueCount = due.filter(c => outreachUrgency(c) === 'overdue').length;
  const headerGlyph = breakup.length ? '🔴' : (overdueCount ? '🔴' : '🟠');
  const subParts = [];
  if (dueCount)         subParts.push(`${dueCount} due today`);
  if (breakup.length)   subParts.push(`${breakup.length} breakup window`);
  if (referrals.length) subParts.push(`${referrals.length} referral angle`);

  out.push(`## ${headerGlyph} Outreach — ${subParts.join(' · ')}`);
  out.push('');
  out.push('');

  function renderRow(c, label) {
    const days   = outreachDaysSince(c);
    const tcount = outreachTouchCount(c);
    const nx     = c.next_action;
    const company = c.company || '(unknown)';
    const title   = c.title_at_send || c.contact_type;
    const sline   = `• **${c.name || c.contact_id}** (${company}, ${title})`;
    out.push(sline);
    const dayStr = days === null ? 'no touches' : `day ${days}`;
    const tStr   = `${tcount} touch${tcount === 1 ? '' : 'es'}`;
    if (nx) {
      out.push(`  ${dayStr} · ${tStr} · **${label}: Strategy ${nx.strategy_id} (${nx.strategy_name})**`);
      if (nx.rationale) out.push(`  _${nx.rationale}_`);
    } else {
      out.push(`  ${dayStr} · ${tStr} · _no recommendation yet — run \`npm run outreach:recommend\`_`);
    }

    // ── RFC 6068 mailto: deeplink (Commit 2: mailto deeplinks, 2026-05-17) ──
    // Highest single-move ROI in the entire heartbeat audit (9.2/10 per grok-fast).
    // Pre-fills subject + body using the contact's next_action rationale verbatim
    // so no net-new prose is generated. Newlines encoded as %0D%0A per RFC 6068 §5.
    // URL capped at 1,800 chars to stay under the 2,000-char practical limit.
    //
    // intel.email_guess may be a string (legacy) or an object with .address
    // (current schema from lib/outreach-tracker.mjs). Normalize to string here
    // before calling buildOutreachMailto so the mailto: URL is always clean.
    //
    // If the contact has a guessed email address, produces a direct mailto: link.
    // If no email, falls back to the LinkedIn profile URL (if present) so the
    // user can copy-open it — still a one-click action from Gmail.
    try {
      const emailGuessRaw = c.intel?.email_guess;
      const emailStr = emailGuessRaw
        ? (typeof emailGuessRaw === 'string' ? emailGuessRaw : (emailGuessRaw.address || ''))
        : '';
      // Inject the normalized email string so buildOutreachMailto uses it correctly
      const contactForMailto = emailStr
        ? { ...c, intel: { ...(c.intel || {}), email_guess: emailStr } }
        : c;
      const { url: mailtoUrl, subject: mailtoSubject, bodyPreview } = buildOutreachMailto(contactForMailto, 'Mitchell');
      const hasEmail = !!emailStr;
      if (hasEmail) {
        // mailto: with pre-filled subject + body — one click opens in default email client
        out.push(`  📧 [Send email — ${mailtoSubject.slice(0, 60)}](${mailtoUrl})`);
      } else if (c.contact_id && c.contact_id.startsWith('https://www.linkedin.com')) {
        // Fallback: link to LinkedIn profile for DM
        out.push(`  💬 [Open LinkedIn profile](${c.contact_id}) · _no email — DM directly_`);
      } else if (c.intel?.x_handle) {
        // Fallback: X/Twitter
        out.push(`  🐦 [Open X profile](https://x.com/${c.intel.x_handle.replace('@', '')}) · _DM via X_`);
      }
      // Body preview in italics for inline context without leaving Gmail
      if (hasEmail && bodyPreview) {
        out.push(`  _Preview: ${bodyPreview.slice(0, 100)}…_`);
      }
    } catch (err) {
      // Never block the heartbeat on mailto build failures
      console.warn(`[heartbeat] mailto build failed for ${c.contact_id}: ${err.message}`);
    }

    out.push('');
  }

  if (due.length) {
    out.push('### Due today');
    out.push('');
    for (const c of due) renderRow(c, 'next');
  }
  if (breakup.length) {
    out.push('### Breakup window');
    out.push('');
    for (const c of breakup) renderRow(c, 'graceful exit');
  }
  if (referrals.length) {
    out.push('### Referral angles');
    out.push('');
    for (const c of referrals) renderRow(c, 'referral activation');
  }

  return out;
}

function formatActivitySnapshot(buckets) {
  const out = [];
  out.push('## Activity Snapshot');
  out.push('');
  out.push('| Status | Count | Most recent (top 3) |');
  out.push('|--------|------:|---------------------|');
  for (const status of STATUS_DISPLAY_ORDER) {
    const bucket = buckets[status];
    if (!bucket) continue;
    const samples = bucket.rows.slice(0, 3).map(r => {
      const linked = r.reportPath
        ? `[#${r.num} ${r.company} — ${r.role.slice(0, 50)}](${reportUrl(r.reportPath)})`
        : `#${r.num} ${r.company} — ${r.role.slice(0, 50)}`;
      return linked;
    });
    out.push(`| ${STATUS_GLYPH[status] || '•'} **${status}** | ${bucket.count} | ${samples.join('<br>') || '—'} |`);
  }
  // Surface any non-canonical statuses (defensive; should normally be empty)
  for (const k of Object.keys(buckets)) {
    if (!STATUS_DISPLAY_ORDER.includes(k)) {
      out.push(`| ❓ **${k}** | ${buckets[k].count} | _non-canonical — run \`node normalize-statuses.mjs\`_ |`);
    }
  }
  out.push('');
  return out;
}

// Per-day inflow stats from each scanner — gives the user proof that
// newsletter alerts (LinkedIn, Indeed, Glassdoor, niche boards) are being
// ingested and not silently lost. Values come from the daily scan log,
// which scan-unattended.mjs writes to data/logs/scan-{date}.log.
function getInflowStats(date) {
  const logPath = join(ROOT, `data/logs/scan-${date}.log`);
  const stats = {
    portalNew: 0, portalScanned: 0,
    rssNew: 0, rssScanned: 0,
    emailNew: 0, emailMessages: 0, emailUrls: 0,
    triageCandidates: 0, triageWritten: false,
  };
  if (!existsSync(logPath)) return stats;
  const log = readFileSync(logPath, 'utf-8');

  // scan.mjs section
  const portalNewMatch = log.match(/--- scan\.mjs ---[\s\S]*?New offers added:\s+(\d+)/);
  if (portalNewMatch) stats.portalNew = parseInt(portalNewMatch[1], 10);
  const portalScannedMatch = log.match(/Companies scanned:\s+(\d+)/);
  if (portalScannedMatch) stats.portalScanned = parseInt(portalScannedMatch[1], 10);

  // scan-rss.mjs section
  const rssNewMatch = log.match(/--- scan-rss\.mjs ---[\s\S]*?New offers added:\s+(\d+)/);
  if (rssNewMatch) stats.rssNew = parseInt(rssNewMatch[1], 10);
  const rssScannedMatch = log.match(/Feeds scanned:\s+(\d+)/);
  if (rssScannedMatch) stats.rssScanned = parseInt(rssScannedMatch[1], 10);

  // scan-email.mjs section — proof that newsletter alerts are flowing in
  const emailMessagesMatch = log.match(/Found (\d+) unread messages under label/);
  if (emailMessagesMatch) stats.emailMessages = parseInt(emailMessagesMatch[1], 10);
  const emailUrlsMatch = log.match(/--- scan-email\.mjs ---[\s\S]*?URLs extracted:\s+(\d+)/);
  if (emailUrlsMatch) stats.emailUrls = parseInt(emailUrlsMatch[1], 10);
  const emailNewMatch = log.match(/--- scan-email\.mjs ---[\s\S]*?New offers added:\s+(\d+)/);
  if (emailNewMatch) stats.emailNew = parseInt(emailNewMatch[1], 10);

  // triage-pipeline.mjs section
  const triageMatch = log.match(/--- triage-pipeline\.mjs ---[\s\S]*?Wrote\s+(\d+)\s+candidates/);
  if (triageMatch) {
    stats.triageCandidates = parseInt(triageMatch[1], 10);
    stats.triageWritten = true;
  }
  return stats;
}

function formatPipelineFunnel(inflow, reportsToday, applyNowCount, totalTracked) {
  const totalNewToday = inflow.portalNew + inflow.rssNew + inflow.emailNew;
  const out = [];
  out.push('## Pipeline Funnel — today');
  out.push('');
  out.push('');
  out.push('| Stage | Today | Notes |');
  out.push('|-------|------:|-------|');
  out.push(`| 🌐 From company portals (\`scan.mjs\`) | ${inflow.portalNew} new | ${inflow.portalScanned} portals polled |`);
  out.push(`| 📡 From RSS / JSON feeds (\`scan-rss.mjs\`) | ${inflow.rssNew} new | ${inflow.rssScanned} feeds polled |`);
  out.push(`| 📧 **From newsletter alerts (\`scan-email.mjs\`)** | **${inflow.emailNew} new** | ${inflow.emailMessages} unread alert emails → ${inflow.emailUrls} URLs extracted |`);
  out.push(`| ➕ Total ingested today | **${totalNewToday}** | merged into \`data/pipeline.md\` |`);
  out.push(`| 🎯 Triaged for evaluation | ${inflow.triageCandidates || '—'} | top candidates picked for next batch |`);
  out.push(`| ⚙️ Evaluated today | ${reportsToday} | A–G reports written to \`reports/\` |`);
  out.push(`| ✅ In Apply-Now Queue | ${applyNowCount} | scored ≥ ${APPLY_NOW_FLOOR.toFixed(1)}, status Evaluated/Responded |`);
  out.push(`| 📚 Total tracked overall | ${totalTracked} | every role the system has ever evaluated |`);
  out.push('');
  if (inflow.emailMessages === 0 && inflow.emailNew === 0) {
    out.push('> ⚠️ **No email job alerts received today.** Run `node scripts/find-unfiltered-alerts.mjs --apply` to fix missing Gmail filters.');
    out.push('');
  }
  return out;
}

function getInterpretationGuide() {
  return [
    `> **Open report** → read A–G reasoning · **Apply** → go straight to JD · **✅ Mark Applied** → clears the row from tomorrow's queue. [Dashboard →](${DASHBOARD_URL})`,
  ];
}

function grokStatus(date) {
  const spendLog = join(ROOT, 'data/grok-spend.log');
  if (!existsSync(spendLog)) return { spent: 0, queries: 0 };

  const lines = readFileSync(spendLog, 'utf-8')
    .split('\n')
    .filter(l => l.startsWith(date));

  const queries = lines.length;
  const spent = lines.reduce((sum, l) => {
    const cost = parseFloat(l.split('\t')[2] || 0);
    return sum + (isNaN(cost) ? 0 : cost);
  }, 0);

  return { spent, queries };
}

// ── Inventory B6: Weekly Gemini Calibration Prompt section ──────────────────
// Surfaces a "This Week's Calibration Prompt" block in the heartbeat email
// IF a fresh prompt (mtime within last 8 days) exists at
// data/weekly-calibration-prompt-{YYYY-MM-DD}.md AND hasn't been answered yet
// (calibration-state.json tracks last_prompt_answered).
//
// Returns markdown lines (heartbeat body is markdown; renderContentHtml()
// adds the styled HTML treatment via marked()). Returns empty array when
// no fresh prompt exists so the section auto-hides.
function renderCalibrationPromptSection() {
  const dataDir = join(ROOT, 'data');
  if (!existsSync(dataDir)) return [];
  let files;
  try {
    files = readdirSync(dataDir)
      .filter(f => /^weekly-calibration-prompt-\d{4}-\d{2}-\d{2}\.md$/.test(f));
  } catch { return []; }
  if (!files.length) return [];

  // Pick the most recent by filename (date in name) AND verify mtime is ≤ 8d.
  files.sort((a, b) => b.localeCompare(a)); // YYYY-MM-DD sorts lexicographically
  const latest = files[0];
  const latestPath = join(dataDir, latest);
  let stat;
  try { stat = statSync(latestPath); } catch { return []; }
  const ageDays = Math.round((Date.now() - stat.mtimeMs) / 86400000);
  if (ageDays > 8) return [];

  // Check if already answered — if so, auto-hide
  const statePath = join(dataDir, 'calibration-state.json');
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      const answered = state.last_prompt_answered;
      const generated = state.last_prompt_generated;
      // If answered date >= generated date, suppress
      if (answered && generated && answered >= generated) return [];
    } catch { /* keep showing if state file is malformed */ }
  }

  // Extract the prompt date from the filename
  const dateMatch = latest.match(/(\d{4}-\d{2}-\d{2})/);
  const promptDate = dateMatch ? dateMatch[1] : '?';

  // Pull out the GEMINI PROMPT block for the copy-friendly markdown.
  // Use regex matching at start-of-line so we skip the docs reference at
  // the top of the file (which has the markers inside backticks).
  let promptBlock = '';
  try {
    const content = readFileSync(latestPath, 'utf-8');
    const startMatch = content.match(/^=== GEMINI PROMPT START ===$/m);
    const endMatch = content.match(/^=== GEMINI PROMPT END ===$/m);
    if (startMatch && endMatch && endMatch.index > startMatch.index) {
      promptBlock = content.slice(startMatch.index, endMatch.index + endMatch[0].length);
    }
  } catch { /* skip — show the heading only */ }

  // Render a compact preview block — the QUESTION HEADERS only — instead
  // of embedding the full Gemini prompt (which contains its own ```markdown
  // fences that break the outer code block). Full prompt is in the linked
  // data/ file + the dashboard's copy-prompt button.
  const questionPreview = [];
  const lines2 = promptBlock.split('\n');
  for (const ln of lines2) {
    const m = ln.match(/^###\s+Q(\d+)\.\s+(.+)$/);
    if (m) questionPreview.push(`${m[1]}. ${m[2]}`);
  }

  const out = [];
  out.push('## This Week\'s Calibration Prompt');
  out.push('');
  out.push(`> Generated ${promptDate} (${ageDays}d ago) — copy the prompt from the dashboard sidebar, paste into Gemini, then drop the response into the **Update Drawer**.`);
  out.push('');
  out.push(`[Open calibration card on dashboard →](${DASHBOARD_URL}/?focus=calibration) · [Read full prompt file →](${DASHBOARD_URL}/data/${latest})`);
  out.push('');
  if (questionPreview.length > 0) {
    out.push(`**${questionPreview.length} questions waiting for you:**`);
    out.push('');
    for (const q of questionPreview) out.push(`- ${q}`);
    out.push('');
  }
  return out;
}

async function generateHeartbeat() {
  const lines = [];
  // Phase 2 Day-1 (2026-05-17) — duplicate H1 killed (audit § 4 item 4).
  // The hero band rendered in renderHtmlEmail() already shows "CAREER-OPS ·
  // DAILY HEARTBEAT YYYY-MM-DD" + the date in display type, so the markdown
  // body's own `# Career-Ops Heartbeat — YYYY-MM-DD` was a redundant H1
  // immediately below the KPI tiles. We keep the Generated: timestamp as
  // a small italic line so the audit trail (when the heartbeat ran) is
  // preserved in both the rendered email and the persisted .md file.
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');

  // Apply-Now Queue — every scored evaluation awaiting action, top → bottom.
  const trackerRows = parseApplicationsTracker(join(ROOT, 'data/applications.md'));
  const applyNowRaw = getApplyNowQueue(trackerRows);
  // Pre-flight: verify every Apply-Now URL is live in parallel (5-way pool).
  // Serial used to take ~8s × N rows; with 20+ rows that's >2.5 min of network
  // latency. The pool runs verifyApplyNowLink concurrently while preserving
  // input order so the subsequent expired-filter loop produces a stable result.
  const verifyResults = await poolMap(
    applyNowRaw,
    async (r) => ({ r, status: await verifyApplyNowLink(getReportUrl(r.reportPath)) }),
    5,
  );
  const applyNow = [];
  for (const { r, status } of verifyResults) {
    r._linkStatus = status;
    if (status.result === 'expired') {
      console.log(`  ✗ Removed expired: #${r.num} ${r.company} — ${r.role.slice(0, 50)} (${status.reason})`);
      markRowAsExpired(r.num, status.reason);
    } else {
      applyNow.push(r);
    }
  }

  // Determine which rows get a 📦 Apply Pack link rendered: top-3 of
  // Apply-Now plus the #1 What's New (today's highest-scoring new
  // evaluation). The nightly pack-builder targets the same set, so links
  // and pack folders stay aligned.
  const whatsNew = applyNow
    .filter(r => r.date === TARGET_DATE)
    .sort((a, b) => b.score - a.score);
  const packEligibleNums = new Set(applyNow.slice(0, APPLY_PACK_TOP_N).map(r => r.num));
  if (whatsNew[0]) packEligibleNums.add(whatsNew[0].num);

  // ── Markdown body section order: priority-first ──────────────────────────
  // §1 TONIGHT'S APPLY is rendered in the HTML template via {{tonightsApplyHtml}},
  // not in the markdown body. The markdown body feeds {{contentHtml}} (§7).
  // New order: What's New → Apply-Now Queue → Activity Snapshot → Pipeline Funnel
  // → System Status → Errors. Outreach Cadence moves to the HTML template
  // {{dueTodayHtml}} slot — we still emit a compact reference here so the
  // persisted .md file reflects the full session, but the HTML email shows the
  // compact §2 card, not this verbose block.

  // Inventory B6: Weekly Calibration Prompt — auto-hides when no fresh
  // (≤ 8d) prompt exists OR when the most recent prompt has already been
  // answered. Surfaces at the top of the body (above What's New) so Mitchell
  // sees the calibration ask the day the prompt is generated.
  const calibrationLines = renderCalibrationPromptSection();
  for (const line of calibrationLines) lines.push(line);

  // What's New Overnight (freshly surfaced roles)
  for (const line of formatWhatsNewSection(whatsNew, packEligibleNums)) lines.push(line);
  lines.push('');

  lines.push('## Apply-Now Queue');
  lines.push('');
  lines.push(`_Score ≥ ${APPLY_NOW_FLOOR.toFixed(1)}, status Evaluated/Responded, re-ranked daily. Apply Packs built for top ${APPLY_PACK_TOP_N} + #1 What's New. [Full view →](${DASHBOARD_URL})_`);
  lines.push('');
  for (const line of formatApplyNowQueue(applyNow, packEligibleNums)) lines.push(line);
  lines.push('');

  // Outreach Cadence — compact reference in markdown body (HTML email uses
  // the §2 DUE TODAY card from {{dueTodayHtml}} instead of this block).
  for (const line of formatOutreachCadence()) lines.push(line);

  // Rejected Pattern of the Week
  try {
    const discardMd = renderDiscardPatternSection({ format: 'markdown', days: 7 });
    if (discardMd) {
      for (const line of discardMd.split('\n')) lines.push(line);
      lines.push('');
    }
  } catch (e) {
    console.warn(`[heartbeat] discard pattern section unavailable: ${e.message}`);
  }

  // Activity Snapshot — full status funnel
  const buckets = getStatusBreakdown(trackerRows);
  for (const line of formatActivitySnapshot(buckets)) lines.push(line);

  // Pipeline Funnel — today's inflow by source
  const inflow = getInflowStats(TARGET_DATE);
  const reportsToday = countReports(TARGET_DATE);
  const applicationsRows = countApplicationsRows(join(ROOT, 'data/applications.md'));
  for (const line of formatPipelineFunnel(inflow, reportsToday, applyNow.length, applicationsRows)) {
    lines.push(line);
  }

  // System Status — compact table, visually de-emphasized in HTML (last visible
  // section before footer; no accent color on heading).
  lines.push('## System Status');
  lines.push('');

  const pipelinePending = countPipelinePending(join(ROOT, 'data/pipeline.md'));
  const triageRows = countTriageRows(join(ROOT, 'data/triage-batch.tsv'));
  const triageModified = fileModifiedRecently(join(ROOT, 'data/triage-batch.tsv'));
  const scanRows = countScanHistoryRows(join(ROOT, 'data/scan-history.tsv'));
  // Detect via the scan log, not scan-history.tsv: the history file only updates
  // when new URLs are added, so a successful scan that finds zero new offers
  // (everything is a duplicate) leaves history mtime stale. Window is 12h so the
  // signal survives manual reruns through late morning PT after the 02:00 PT
  // scheduled fire, while still excluding prior-evening tests (~13h gap).
  const scanRanToday = fileModifiedRecently(join(ROOT, `data/logs/scan-${TARGET_DATE}.log`), 12);
  const grok = grokStatus(TARGET_DATE);

  lines.push('| Component | Status | Detail |');
  lines.push('|-----------|--------|--------|');
  lines.push(`| Portal scan (\`scan.mjs\`) | ${scanRanToday ? '✅ ran today' : '❌ did not run'} | ${scanRows} URLs tracked all-time |`);
  lines.push(`| Triage refresh | ${triageModified ? '✅ refreshed today' : '❌ stale'} | ${triageRows} candidates queued |`);
  lines.push(`| Pipeline depth | ${pipelinePending > 0 ? '✅' : '⚠️'} ${pipelinePending} pending | feeds tomorrow's batch |`);
  lines.push(`| Batch eval | ${reportsToday > 0 ? `✅ ${reportsToday} reports` : '❌ 0 reports'} | A–G evaluations written today |`);
  lines.push(`| Tracker | ✅ ${applicationsRows} rows | every role ever evaluated |`);
  lines.push(`| Grok #1 (social-intel) | ${grok.queries > 0 ? '✅ active' : '⏸ idle'} | $${grok.spent.toFixed(2)} / $5.00 daily cap · ${grok.queries} queries |`);
  // 6L: Additional status rows — voice calibration, error health, quota schedule
  lines.push(`| Voice calibration | ${existsSync(join(ROOT, 'writing-samples/voice-reference.md')) ? '✅ active' : '⚠️ not configured'} | writing-samples/voice-reference.md |`);
  lines.push(`| Errors today | ${existsSync(join(ROOT, 'data/errors.log')) && readFileSync(join(ROOT, 'data/errors.log'),'utf-8').includes(TARGET_DATE) ? '⚠️ see errors.log' : '✅ clean'} | data/errors.log |`);
  lines.push(`| Quota schedule | ✅ 08:05 PT | batch fires after Claude Max reset |`);
  lines.push('');

  // Phase A · A2 · CRITICAL-3 (2026-05-19) — collapse the two empty-state H2
  // sections (Errors / Warnings + Action Required) into one quiet footer line
  // on no-error days. Both sections still render as H2s when something needs
  // attention so the signal isn't buried.
  const errorLog = join(ROOT, 'data/errors.log');
  let todaysErrors = [];
  if (existsSync(errorLog)) {
    todaysErrors = readFileSync(errorLog, 'utf-8')
      .split('\n')
      .filter(l => l.includes(TARGET_DATE));
  }
  if (todaysErrors.length === 0) {
    lines.push('<small style="color:#9ca3af">No errors · no action required · system running unattended.</small>');
    lines.push('');
  } else {
    lines.push('## Errors / Warnings');
    lines.push('');
    lines.push('```');
    todaysErrors.slice(-20).forEach(e => lines.push(e));
    lines.push('```');
    lines.push('');
    lines.push('## Action Required');
    lines.push('');
    lines.push('- [ ] Review the errors above before acting on the queue.');
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // Interpretation guide — at the bottom so the actionable content
  // (What's New, Apply-Now Queue) is the first thing visible on open.
  for (const line of getInterpretationGuide()) lines.push(line);
  lines.push('');

  lines.push(`*[Dashboard →](${DASHBOARD_URL}) · heartbeat.mjs · 09:00 PT*`);

  // Pull state for the dynamic subject + hidden preheader (Phase 2 Day-1 quick
  // wins, 2026-05-17). The four signals all-7-models converged on:
  //   - newRoles: today's freshly surfaced ≥ 4.0 roles (whatsNew[])
  //   - runwayAlert + runwayState: stretched / critical / healthy (from
  //     computeRunwayDensityForHeartbeat — same source the renderRunwayAlert
  //     block uses, so subject + body stay aligned)
  //   - outreachDue: count of due_today contacts in the Outreach Cadence block
  //   - topRole: { name, score } for the highest-scoring Apply-Now row,
  //     used in the preheader preview text on alerting days
  let runwayState = 'healthy';
  let runwayAlertFiring = false;
  try {
    const density = computeRunwayDensityForHeartbeat();
    if (density && density.ok) {
      runwayState = density.health; // 'healthy' | 'stretched' | 'critical'
      runwayAlertFiring = density.health !== 'healthy';
    }
  } catch { /* soft-fail — keep healthy/false defaults */ }

  let outreachDue = 0;
  try {
    const summary = buildOutreachSummary();
    outreachDue = (summary && summary.due_today) ? summary.due_today.length : 0;
  } catch { /* soft-fail — keep 0 */ }

  const topRole = applyNow[0]
    ? { name: `${applyNow[0].company} — ${(applyNow[0].role || '').slice(0, 50)}`, score: applyNow[0].score }
    : null;

  const meta = {
    date: TARGET_DATE,
    dashboardUrl: DASHBOARD_URL,
    queueCount: applyNow.length,
    trackedCount: applicationsRows,
    evaluatedToday: reportsToday,
    newFromAlerts: inflow.emailNew,
    newRoles: whatsNew.length,
    runwayState,
    runwayAlert: runwayAlertFiring,
    outreachDue,
    topRole,
    // Pass applyNow so renderHtmlEmail can derive TONIGHT'S APPLY independently
    // of the markdown body. This avoids coupling the HTML email to the markdown
    // content structure for the §1 action card.
    applyNow,
  };
  return { body: lines.join('\n'), meta };
}

// Build the state-driven subject from meta.
// Priority-first format (heartbeat redesign 2026-05-17):
//   §1 lead = TONIGHT'S APPLY company+score (the most actionable signal)
//   §2 = outreach due count if >0
//   §3 = runway alert if not healthy
// No-news: "Ops: all clear — {date}"
// Normal:  "Ops: apply ElevenLabs Comms (4.6) · 2 outreach due — {date}"
function buildHeartbeatSubject(meta) {
  const { date, newRoles = 0, runwayAlert = false, runwayState = 'healthy',
          outreachDue = 0, trackedCount = 0, deltaScore = 0, applyNow = [] } = meta || {};

  // H3 — no-news early-exit subject
  const noNewsToday = (newRoles === 0 && !runwayAlert && (deltaScore || 0) === 0 && outreachDue === 0);
  if (noNewsToday) {
    return `Ops: all clear — ${date}`;
  }

  const alerting = (applyNow && applyNow.length > 0) || newRoles >= 1 || runwayAlert === true || outreachDue >= 1;
  if (!alerting) {
    return `Ops: steady · ${trackedCount} tracked — ${date}`;
  }

  const parts = [];

  // Lead with TONIGHT'S APPLY — company + role fragment + score
  if (applyNow && applyNow.length > 0) {
    const pick = applyNow[0];
    const co = (pick.company || '').slice(0, 22);
    const roleFragment = (pick.role || '').slice(0, 20);
    const scoreStr = pick.score ? pick.score.toFixed(1) : '';
    parts.push(`apply ${co}${roleFragment ? ' ' + roleFragment : ''}${scoreStr ? ' (' + scoreStr + ')' : ''}`);
  } else if (newRoles >= 1) {
    parts.push(`${newRoles} new`);
  }

  if (outreachDue >= 1) {
    parts.push(`${outreachDue} outreach due`);
  }
  if (runwayAlert) {
    const glyph = runwayState === 'critical' ? '🚨' : '⚠️';
    parts.push(`${glyph} runway ${runwayState}`);
  }

  const subject = `Ops: ${parts.join(' · ')} — ${date}`;
  // Cap at 80 chars to avoid mobile truncation
  return subject.length > 80 ? subject.slice(0, 77).trimEnd() + '…' : subject;
}

// Build the hidden-preheader preview text (state-driven, leads with TONIGHT'S
// APPLY company so inbox preview reinforces the subject's priority signal).
// Capped at ~110 chars to fit Gmail's preview width without truncation.
function buildHeartbeatPreheader(meta) {
  const { newRoles = 0, runwayAlert = false, runwayState = 'healthy',
          outreachDue = 0, trackedCount = 0, topRole = null, applyNow = [] } = meta || {};

  const alerting = (applyNow && applyNow.length > 0) || newRoles >= 1 || runwayAlert === true || outreachDue >= 1;
  let text;
  if (alerting) {
    // Lead with TONIGHT'S APPLY company + score, then outreach count
    const pick = applyNow && applyNow.length > 0 ? applyNow[0] : null;
    const topPart = pick
      ? `Tonight: ${pick.company} (${Number(pick.score).toFixed(2)}).`
      : topRole
        ? `Top: ${topRole.name} (${Number(topRole.score).toFixed(2)}).`
        : `Queue active.`;
    const outreachPart = outreachDue > 0 ? ` ${outreachDue} outreach due.` : '';
    const runwayPart = runwayAlert ? ` Runway: ${runwayState}.` : '';
    text = `${topPart}${outreachPart}${runwayPart}`;
  } else {
    text = `${trackedCount} tracked. ${newRoles} new today. Steady.`;
  }
  if (text.length > 110) text = text.slice(0, 107).trimEnd() + '...';
  return text;
}

async function main() {
  if (TEST) {
    const subject = `[career-ops] SMTP test ${new Date().toISOString()}`;
    const body = `This is a test email from scripts/heartbeat.mjs.\n\nIf you received this, SMTP delivery is working.\n\nDate: ${TARGET_DATE}\nHost: ${process.env.USER || 'unknown'}@${process.env.HOSTNAME || 'localhost'}\n`;
    const id = await sendEmail({ subject, body });
    console.log(`Test email sent. Message-ID: ${id}`);
    return;
  }

  const { body, meta } = await generateHeartbeat();
  const outPath = join(ROOT, `data/heartbeat-${TARGET_DATE}.md`);
  writeFileSync(outPath, body);
  console.log(`Wrote ${outPath}`);

  if (PREVIEW) {
    const html = await renderHtmlEmail(body, meta);
    const previewPath = '/tmp/heartbeat-preview.html';
    writeFileSync(previewPath, html);
    console.log(`Wrote ${previewPath} (${html.length} chars)`);
    // Open in default browser via macOS `open` (silent fail on non-mac)
    try {
      const { execSync } = await import('child_process');
      execSync(`open "${previewPath}"`, { stdio: 'ignore' });
      console.log('Opened in default browser');
    } catch { /* not on mac, skip */ }
    return;
  }

  // State-driven subject (Phase 2 Day-1, 2026-05-17) — replaces the static
  // `[career-ops] heartbeat YYYY-MM-DD`. Logged on every run so dry-runs
  // surface what the subject WOULD be without sending.
  const subject = buildHeartbeatSubject(meta);
  console.log(`Subject: ${subject}`);

  if (SEND) {
    const id = await sendEmail({ subject, body, meta });
    console.log(`Heartbeat email sent. Message-ID: ${id}`);
  } else {
    console.log('---');
    console.log(body);
  }
}

main().catch(err => {
  console.error('heartbeat error:', err.message);
  process.exit(1);
});
