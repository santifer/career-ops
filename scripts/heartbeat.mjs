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

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import nodemailer from 'nodemailer';
import { marked } from 'marked';
import { classifyLiveness } from '../liveness-core.mjs';
import { getCachedUrl } from '../lib/resolve-ats-url.mjs';
import { poolMap } from '../lib/fetch-utils.mjs';
import { buildSummary as buildOutreachSummary, urgency as outreachUrgency, daysSinceLastTouch as outreachDaysSince, touchCount as outreachTouchCount, listContacts as listOutreachContacts } from '../lib/outreach-tracker.mjs';
// Tier 5 system-status banner (calibration brief 2026-05-16) — surfaces which
// Tier 5 features are active in the daily heartbeat. Runway alert wired
// 2026-05-17 — inline compute below (mirrors dashboard-server.mjs's
// computeRecruiterPipelineDensity so heartbeat doesn't depend on the
// dashboard server being running).
import { renderSystemBanner, renderDiscardPatternSection, renderRunwayAlert } from '../lib/heartbeat-system-banner.mjs';

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
    runway_alert = `✅ Pipeline density adequate for ${runwayWeeks}-week runway.`;
  } else if (active >= 3 || touches7d >= 5) {
    health = 'stretched';
    runway_alert = `⚠️ Pipeline stretched for ${runwayWeeks}-week runway. Add ${Math.max(0, 5 - active)} more active conversations and ${Math.max(0, 10 - touches7d)} more touches this week.`;
  } else {
    health = 'critical';
    runway_alert = `🚨 Pipeline below threshold for ${runwayWeeks}-week runway. Increase outreach velocity to 10+ touches/week immediately.`;
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

function renderHtmlEmail(markdownBody, meta = {}) {
  marked.setOptions({ gfm: true, breaks: false });
  const inner = marked.parse(markdownBody);

  // Inline-style every tag the markdown renderer emits. Gmail strips <style>
  // blocks and class attributes, so styles must live on the elements
  // themselves. The order of these replaces matters — apply the most
  // specific patterns first so they don't get clobbered by the general ones.
  // Class-tagged inline styles. Class names are dark-mode hooks the
  // <style> block in the email <head> targets via prefers-color-scheme.
  // Inline rules are the light-mode default for clients that strip <style>.
  let styled = inner
    .replace(/<table>/g, `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="card" style="border-collapse:separate;border-spacing:0;width:100%;margin:14px 0 18px;font-size:14px;border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;background:${BRAND.surface}">`)
    .replace(/<thead>/g, `<thead style="background:${BRAND.surface2}">`)
    .replace(/<th>/g, `<th class="text-muted border" style="text-align:left;padding:10px 12px;border-bottom:1px solid ${BRAND.border};font-weight:600;color:${BRAND.text3};font-size:11px;text-transform:uppercase;letter-spacing:0.06em">`)
    .replace(/<td>/g, `<td class="border" style="padding:10px 12px;border-bottom:1px solid ${BRAND.surface2};vertical-align:top;color:${BRAND.text2}">`)
    .replace(/<blockquote>/g, `<blockquote class="card" style="margin:18px 0;padding:14px 18px;border-left:3px solid ${BRAND.green};background:${BRAND.greenBg};color:${BRAND.text};border-radius:0 8px 8px 0;font-size:14px;line-height:1.55">`)
    .replace(/<h1>/g, `<h1 class="text-strong accent" style="font-size:26px;margin:0 0 6px;color:${BRAND.greenFg};font-weight:700;letter-spacing:-0.01em">`)
    .replace(/<h2>/g, `<h2 class="text-strong" style="font-size:18px;margin:32px 0 10px;color:${BRAND.text};font-weight:700;border-left:3px solid ${BRAND.green};padding-left:12px;letter-spacing:-0.01em">`)
    .replace(/<h3>/g, `<h3 class="text-strong" style="font-size:16px;margin:22px 0 8px;color:${BRAND.text2};font-weight:600;letter-spacing:-0.01em">`)
    .replace(/<a /g, `<a class="accent" style="color:${BRAND.greenFg};text-decoration:underline;text-underline-offset:2px;font-weight:500" `)
    .replace(/<code>/g, `<code style="background:${BRAND.surface2};padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono','SF Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;color:${BRAND.greenFg}">`)
    .replace(/<ul>/g, `<ul style="margin:8px 0 12px;padding-left:24px;color:${BRAND.text2}">`)
    .replace(/<ol>/g, `<ol style="margin:8px 0 12px;padding-left:24px;color:${BRAND.text2}">`)
    .replace(/<li>/g, '<li style="margin:4px 0;line-height:1.55">')
    .replace(/<hr>/g, `<hr style="border:none;height:1px;background:linear-gradient(90deg,transparent 0%,${BRAND.border} 50%,transparent 100%);margin:28px 0">`);

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

  const date = meta.date || new Date().toISOString().slice(0, 10);
  const dashboardUrl = meta.dashboardUrl || DASHBOARD_URL;
  const queueCount = meta.queueCount || 0;
  const trackedCount = meta.trackedCount || 0;
  const evaluatedToday = meta.evaluatedToday || 0;
  const newFromAlerts = meta.newFromAlerts || 0;

  // Mission-control header — same visual signature as the dashboard's
  // mc-strip + the report HTML's nav-back chrome. Light mode default
  // (matrix-green-on-white gradient); dark-mode override via the
  // <style> block below promotes it to the dashboard's deep cobalt look.
  const header = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px">
  <tr>
    <td class="header-banner" style="padding:22px 24px;background:linear-gradient(135deg,${BRAND.green} 0%,#15803d 50%,#0f5e2c 100%);border-radius:12px;color:#ffffff">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%">
        <tr>
          <td style="vertical-align:middle">
            <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.92;font-weight:600">⚡ Career-Ops · Daily Heartbeat</div>
            <div style="font-size:24px;font-weight:700;margin-top:4px;letter-spacing:-0.01em;font-family:'JetBrains Mono','SF Mono',ui-monospace,monospace">${date}</div>
          </td>
          <td align="right" style="vertical-align:middle">
            <a href="${dashboardUrl}" class="cta-button" style="display:inline-block;background:#ffffff;color:${BRAND.greenFg};padding:9px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.01em;box-shadow:0 1px 3px rgba(0,0,0,0.18)">Open Dashboard →</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

  // KPI strip — uses the same palette + tabular numerals as the
  // dashboard's stats-bento. Matrix-green for the primary metric
  // (Apply-Now Queue), supporting hues for the rest.
  const kpis = [
    { label: 'In queue ≥ 4.0',    value: queueCount,      accent: BRAND.green },
    { label: 'Evaluated today',   value: evaluatedToday,  accent: BRAND.blue },
    { label: 'From alerts today', value: newFromAlerts,   accent: BRAND.greenFg },
    { label: 'Tracked all-time',  value: trackedCount,    accent: BRAND.text3 },
  ];
  const kpiCells = kpis.map(k => `
    <td class="card border" style="padding:14px 16px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:10px;text-align:center;width:25%">
      <div class="text-muted" style="font-size:10px;color:${BRAND.text4};font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${k.label}</div>
      <div class="text-strong" style="font-size:24px;font-weight:700;color:${k.accent};margin-top:4px;font-variant-numeric:tabular-nums;font-family:'JetBrains Mono','SF Mono',ui-monospace,monospace">${k.value}</div>
    </td>`).join('<td style="width:8px"></td>');
  const kpiStrip = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 18px">
  <tr>${kpiCells}</tr>
</table>`;

  const footer = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:32px 0 8px">
  <tr>
    <td class="text-muted border" style="padding:14px 0;border-top:1px solid ${BRAND.border};color:${BRAND.text4};font-size:12px;text-align:center">
      Generated by <code style="background:${BRAND.surface2};padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono','SF Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:${BRAND.greenFg}">scripts/heartbeat.mjs</code>
      · <a href="${dashboardUrl}" class="accent" style="color:${BRAND.greenFg};text-decoration:underline">dashboard</a>
      · scheduled daily 09:00 PT via launchd
    </td>
  </tr>
</table>`;

  // prefers-color-scheme: dark CSS — Apple Mail, Gmail web, Outlook 365
  // dark all honor this. Maps the email's class hooks (.card, .text-strong,
  // .accent, .header-banner, etc.) to the dashboard's dark-mode tokens
  // so a user reading in dark mode sees the same matrix-green-on-cobalt
  // identity as the live dashboard.
  const darkModeCss = `
@media (prefers-color-scheme: dark) {
  body, .body-bg { background: #06070d !important; color: #fafafa !important; }
  .card { background: #11131c !important; border-color: #232737 !important; color: #e4e4e7 !important; }
  .text-strong { color: #fafafa !important; }
  .text-muted  { color: #b8b8c0 !important; }
  .text-subtle { color: #9a9aa6 !important; }
  .border      { border-color: #232737 !important; }
  .accent      { color: #86efac !important; }
  .accent-bg   { background: rgba(22,163,74,0.12) !important; color: #86efac !important; }
  table { border-color: #232737 !important; background: #11131c !important; }
  thead, th { background: #181b27 !important; color: #b8b8c0 !important; border-color: #232737 !important; }
  td { color: #e4e4e7 !important; border-color: #232737 !important; }
  blockquote { background: rgba(22,163,74,0.10) !important; color: #fafafa !important; border-left-color: #86efac !important; }
  code { background: #181b27 !important; color: #86efac !important; }
  hr { background: linear-gradient(90deg, transparent 0%, #232737 50%, transparent 100%) !important; }
  a { color: #86efac !important; }
  .header-banner {
    background: linear-gradient(135deg, rgba(0,255,157,0.10) 0%, rgba(22,163,74,0.04) 50%, #11131c 100%) !important;
    border: 1px solid #232737 !important;
    color: #fafafa !important;
  }
  .cta-button { background: #86efac !important; color: #06070d !important; }
  .score-pill-green { background: rgba(22,163,74,0.15) !important; color: #86efac !important; border-color: rgba(22,163,74,0.35) !important; }
  .score-pill-amber { background: rgba(168,123,72,0.14) !important; color: #d4ba84 !important; }
  .score-pill-red   { background: rgba(220,38,38,0.12) !important; color: #fca5a5 !important; }
}`;

  // Tier 5 system-status banner + runway alert (calibration brief 2026-05-16) —
  // rendered between header and KPI strip so they land above-the-fold in the
  // email. Safely degrade to empty string if the banner module / outreach
  // tracker isn't available.
  let systemBanner = '';
  let runwayAlert  = '';
  try { systemBanner = renderSystemBanner({ format: 'html' }) || ''; } catch {}
  try {
    const density = computeRunwayDensityForHeartbeat();
    runwayAlert = renderRunwayAlert({ pipelineDensity: density, format: 'html' }) || '';
  } catch {}

  // Rejected pattern of the week (Item #2 of 2026-05-16 incomplete-task review).
  // Reads data/discard-reasons.jsonl, auto-suppresses when zero discards in
  // the 7-day window — same no-noise pattern as Outreach Cadence.
  let discardSection = '';
  try { discardSection = renderDiscardPatternSection({ format: 'html', days: 7 }) || ''; } catch {}

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>${darkModeCss}</style>
</head>
<body class="body-bg" style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text2};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased">
<center class="body-bg" style="width:100%;background:${BRAND.bg}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:780px;width:100%;margin:0 auto;padding:24px 20px">
  <tr><td>
    ${header}
    ${systemBanner}
    ${runwayAlert}
    ${discardSection}
    ${kpiStrip}
    ${styled}
    ${footer}
  </td></tr>
</table>
</center>
</body></html>`;
}

async function sendEmail({ subject, body, meta = {} }) {
  const secrets = loadSecrets();
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: secrets.GMAIL_USER, pass: secrets.GMAIL_APP_PASSWORD },
  });
  const info = await transporter.sendMail({
    from: secrets.GMAIL_USER,
    to: secrets.HEARTBEAT_TO,
    subject,
    text: body,
    html: renderHtmlEmail(body, meta),
  });
  return info.messageId;
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
async function verifyApplyNowLink(url) {
  if (!url) return { result: 'no-url', reason: 'no URL' };

  // Greenhouse: JD URL is /{board}/jobs/{id}. The boards-api endpoint
  // /boards/{board}/jobs/{id} returns 404 when the job is removed.
  const greenhouseMatch = url.match(/(?:job-boards|boards)\.(?:eu\.)?greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/i);
  if (greenhouseMatch) {
    try {
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${greenhouseMatch[1]}/jobs/${greenhouseMatch[2]}`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
      if (res.status === 200) return { result: 'active', reason: 'Greenhouse API 200' };
      if (res.status === 404 || res.status === 410) return { result: 'expired', reason: `Greenhouse API ${res.status}` };
    } catch {}
  }

  // Ashby: jobs.ashbyhq.com/{board}/{uuid}. The posting-api returns 200
  // with the role's data; the role disappears when removed.
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([\w-]+)\/([\w-]+)/i);
  if (ashbyMatch) {
    try {
      const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const json = await res.json();
        const stillListed = (json.jobs || []).some(j => (j.jobUrl || '').includes(ashbyMatch[2]) || (j.id === ashbyMatch[2]));
        return stillListed
          ? { result: 'active', reason: 'Ashby API: role still listed' }
          : { result: 'expired', reason: 'Ashby API: role no longer in board' };
      }
    } catch {}
  }

  // Generic fallback: HTTP fetch + permissive expired-phrase scan.
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
    });
    const status = res.status;
    const finalUrl = res.url || url;
    if (status === 404 || status === 410 || status === 451) {
      return { result: 'expired', reason: `HTTP ${status}` };
    }
    if (status >= 500) return { result: 'uncertain', reason: `HTTP ${status} (server error)` };
    if (status >= 400) return { result: 'expired', reason: `HTTP ${status}` };
    // Redirect to listing/search page (no specific job ID in final URL)
    if (/\/(jobs|positions|careers|search|listings)\/?(\?|$)/i.test(finalUrl) && !/\/(jobs|positions)\/[\w-]+/.test(finalUrl)) {
      return { result: 'expired', reason: 'redirected to listing page' };
    }
    const html = await res.text();
    const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (/position has been filled|no longer accepting|job (?:posting )?no longer available|this job has expired|posting has expired|position is no longer|this role has been closed|role has been filled/i.test(bodyText)) {
      return { result: 'expired', reason: 'expired phrase in body' };
    }
    return { result: 'active', reason: `HTTP ${status}` };
  } catch (err) {
    return { result: 'uncertain', reason: `fetch failed: ${err.message.slice(0, 60)}` };
  }
}

// Mark a tracker row as Discarded with a closure note. Edits applications.md
// in place so subsequent pipeline runs don't re-evaluate it.
function markRowAsExpired(rowNum, urlReason) {
  const path = join(ROOT, 'data/applications.md');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf-8');
  const re = new RegExp(`^(\\| ${rowNum} \\|[^|]+\\|[^|]+\\|[^|]+\\|[^|]+\\|)\\s*Evaluated\\s*(\\|[^|]+\\|[^|]+\\|)\\s*([^|]*)\\s*\\|`, 'm');
  if (!re.test(text)) return;
  const updated = text.replace(re, (_, prefix, mid, notes) =>
    `${prefix} Discarded ${mid} ⚠️ LINK EXPIRED on ${new Date().toISOString().slice(0,10)} (${urlReason}). Original notes: ${notes.trim()} |`
  );
  writeFileSync(path, updated);
  console.log(`  ↓ Marked row #${rowNum} as Discarded (link expired: ${urlReason})`);
}

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

// Render one Apply-Now role as a self-contained markdown block. Each block
// has: header (#, score, company, role), strengths-with-emphasize-hints,
// gap-mitigations, links. Email clients render this as readable sections
// — much more usable than the prior tabular row that compressed the
// "Why" cell to one sentence.
//
// `packEligibleNums` (Set<number>) gates Pack-link rendering. Pass the set
// of row numbers that should display a 📦 Pack link (typically the top 3
// of Apply-Now plus the #1 What's New). Pass `null` to render packs for
// every row whose folder exists.
function formatRoleBlock(r, packEligibleNums = null) {
  const out = [];
  out.push('---');
  out.push('');
  out.push(`### #${r.num} — ${r.company} — ${r.role}`);
  out.push('');
  out.push(`**Score:** ${r.score.toFixed(2)} / 5${r._linkStatus && r._linkStatus.result !== 'active' ? `  ·  ⚠️ link status: ${r._linkStatus.result} (${r._linkStatus.reason})` : ''}`);
  out.push('');

  // Strongest matches with how-to-emphasize hints
  const matches = getStrongMatches(r.reportPath, 4);
  if (matches.length > 0) {
    out.push(`**✅ Why I'm a strong match:**`);
    out.push('');
    for (const m of matches) {
      const evidence = m.evidence
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 280);
      out.push(`- **${m.score}/5  ${m.requirement.slice(0, 110)}** — ${evidence}${m.evidence.length > 280 ? '…' : ''}`);
      if (m.emphasize) out.push(`  - 🎯 **How to emphasize:** ${m.emphasize.slice(0, 220)}`);
    }
    out.push('');
  }

  // Gap mitigations (especially important for skills user doesn't fully meet)
  const gaps = getGapMitigations(r.reportPath, 3);
  if (gaps.length > 0) {
    out.push(`**⚠️ How to address gaps (Python, engineering, etc.):**`);
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
      out.push(`  - 💡 ${mitigation}${g.mitigation.length > 280 ? '…' : ''}`);
    }
    out.push('');
  }

  // Verdict from notes (compact)
  const verdict = compressNote(r.notes, 240);
  if (verdict) {
    out.push(`**Verdict:** ${verdict}`);
    out.push('');
  }

  // Links — all clickable from Gmail. Apply → live JD. Report → local
  // report HTML via dashboard server. Pack → pre-built Apply Pack folder
  // (cover letter, LinkedIn DMs, hiring-manager intel, tailored CV) when
  // present. Mark Applied → one-click status flip via dashboard-server
  // /mark endpoint, so Mitchell can clear items from tomorrow's queue
  // without leaving Gmail.
  const url = getReportUrl(r.reportPath);
  const packUrl = applyPackUrl(r);
  const packAllowed = packEligibleNums == null || packEligibleNums.has(r.num);
  const linkBits = [];
  if (url) linkBits.push(`🔗 [Apply](${url})`);
  if (r.reportPath) linkBits.push(`📄 [Open report](${reportUrl(r.reportPath)})`);
  if (packUrl && packAllowed) linkBits.push(`📦 [Apply Pack](${packUrl})`);
  linkBits.push(`✅ [Mark Applied](${markStatusUrl(r.num, 'Applied')})`);
  if (linkBits.length) out.push(linkBits.join(' · '));
  out.push('');
  return out;
}

function formatApplyNowQueue(rows, packEligibleNums = null) {
  if (rows.length === 0) {
    return [
      `_No evaluations meeting the ${APPLY_NOW_FLOOR.toFixed(1)} apply floor right now._`,
      '',
      `_The system filters hard-blockers before scoring, so a thin queue means today's batch was wrong-shape — not that you're out of options. Review the highest-scored discards if you want to override._`,
    ];
  }
  const out = [];
  // Quick-scan summary table — every Apply-Now row appears here with both
  // the live Apply link and the report link clickable.
  out.push(`**At-a-glance summary** — ${rows.length} role${rows.length === 1 ? '' : 's'} above the ${APPLY_NOW_FLOOR.toFixed(1)} floor (full per-role detail for top ${Math.min(APPLY_NOW_DETAIL_LIMIT, rows.length)} below):`);
  out.push('');
  out.push('| # | Score | Company — Role | Apply | Report | Pack | Mark | Link |');
  out.push('|---|------|----------------|-------|--------|------|------|------|');
  for (const r of rows) {
    const applyUrl = getReportUrl(r.reportPath);
    const applyCell = applyUrl ? `[Apply](${applyUrl})` : '—';
    // Link badge links to the live JD so the column is clickable, not just a status text.
    const linkBadge = !r._linkStatus
      ? '—'
      : r._linkStatus.result === 'active'  ? (applyUrl ? `[✅ live](${applyUrl})`          : '✅ live')
      : r._linkStatus.result === 'expired' ? (applyUrl ? `[❌ EXPIRED](${applyUrl})`       : '❌ EXPIRED')
      : (applyUrl ? `[⚠️ ${r._linkStatus.result}](${applyUrl})` : `⚠️ ${r._linkStatus.result}`);
    const reportCell = r.reportPath ? `[Open](${reportUrl(r.reportPath)})` : '—';
    const packUrl = applyPackUrl(r);
    const packAllowed = packEligibleNums == null || packEligibleNums.has(r.num);
    const packCell = (packUrl && packAllowed) ? `📦 [Pack](${packUrl})` : '—';
    const markCell = `[✅ Applied](${markStatusUrl(r.num, 'Applied')})`;
    out.push(`| ${r.num} | ${r.score.toFixed(2)} | ${r.company} — ${r.role.slice(0, 60)} | ${applyCell} | ${reportCell} | ${packCell} | ${markCell} | ${linkBadge} |`);
  }
  out.push('');
  // Detail blocks for the top N only — keeps the email scannable.
  const detailRows = rows.slice(0, APPLY_NOW_DETAIL_LIMIT);
  if (rows.length > detailRows.length) {
    out.push(`_Showing detailed reasoning for the top ${detailRows.length} only. The remaining ${rows.length - detailRows.length} are in the table above — open the dashboard for full rationale._`);
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
    out.push(`_No new roles surfaced overnight. The batch ran but nothing scored ≥ ${APPLY_NOW_FLOOR.toFixed(1)}, OR everything scored met the floor was already in yesterday's queue. The full Apply-Now Queue below is unchanged from the previous heartbeat._`);
    out.push('');
    return out;
  }
  out.push(`_${whatsNew.length} role${whatsNew.length === 1 ? '' : 's'} crossed the ${APPLY_NOW_FLOOR.toFixed(1)} floor in the overnight batch. The #1 row below has a freshly built Apply Pack; the rest link to their reports for review._`);
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
  out.push(`### 🌟 Highest scoring new role`);
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

  out.push(`## ${headerGlyph} Outreach Cadence — ${subParts.join(', ')}`);
  out.push('');
  out.push(`_LinkedIn / X / email contacts you've messaged and are awaiting a reply from. Recommended next action follows the 10-strategy consensus playbook ([data/linkedin-followup-strategy-2026-05-15.md](${DASHBOARD_URL}data/linkedin-followup-strategy-2026-05-15.md)). Log a touch with \`node scripts/log-touch.mjs\` — silent days emit nothing._`);
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
    out.push('');
  }

  if (due.length) {
    out.push('### Due today');
    out.push('');
    for (const c of due) renderRow(c, 'next');
  }
  if (breakup.length) {
    out.push('### Breakup window (≥ 3 touches, ≥ 14 days silent)');
    out.push('');
    for (const c of breakup) renderRow(c, 'graceful exit');
  }
  if (referrals.length) {
    out.push('### Referral opportunities (2nd-degree contacts at silent companies)');
    out.push('');
    for (const c of referrals) renderRow(c, 'referral activation');
  }

  return out;
}

function formatActivitySnapshot(buckets) {
  const out = [];
  out.push('## Activity Snapshot');
  out.push('');
  out.push('_How every evaluated role is currently classified. The system updates these as you act on roles (`/career-ops apply <URL>` flips Evaluated → Applied; recruiter replies flip to Responded; etc.). If your "Applied" bucket is empty, no application has been submitted through the assistant yet — open a top-queue role and run `/career-ops apply` to begin._');
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
  out.push('## Pipeline Funnel — today\'s flow');
  out.push('');
  out.push(`_How offers move from inbound source → tracked decision. Newsletter / job-board alerts arrive at the \`career-ops/alerts\` Gmail label; \`scan-email.mjs\` extracts the URLs and merges them into the same pipeline as the company-direct ATS scanner. Anything counted under "from email" is fully accounted for downstream._`);
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
    out.push('> ⚠️ **No newsletter alerts processed today.** If you signed up for LinkedIn / Indeed / Mediabistro / etc. but nothing is arriving here, the most likely cause is a Gmail filter gap (alert sender domain not yet covered). Run `node scripts/find-unfiltered-alerts.mjs` to detect senders sitting in Inbox without the `career-ops/alerts` label, then `--apply` to patch the filter set.');
    out.push('');
  }
  return out;
}

function getInterpretationGuide() {
  return [
    '> **How to read this email:**',
    '> ',
    '> - **What\'s New Overnight** — the freshly surfaced roles. Anything that crossed the apply floor in last night\'s batch lands here at the top. The #1 row gets a fully built Apply Pack so you can act on it within minutes. Empty section = batch ran but nothing new scored ≥ floor.',
    `> - **Apply-Now Queue** — the cumulative list: every evaluation with status \`Evaluated\` or \`Responded\` and score ≥ ${APPLY_NOW_FLOOR.toFixed(1)}/5, sorted high → low. Re-ranks every morning. Apply Packs (📦) are pre-built for the **top ${APPLY_PACK_TOP_N}** of this queue plus the **#1 What\'s New** — the highest-leverage roles. Other rows still link to the JD and full report; just no pre-built outreach drafts.`,
    '> - **Activity Snapshot** — the full status funnel for every role the system has ever evaluated (Applied / Interview / Offer / Rejected / Discarded). Where you can see at a glance how many applications are actually outstanding versus how much was filtered as wrong-fit.',
    '> - **Pipeline Funnel** — today\'s inflow broken down by source. The **`scan-email.mjs`** row is your newsletter-and-alerts feed: every job alert from LinkedIn / Indeed / Mediabistro / etc. that landed under the `career-ops/alerts` Gmail label gets URLs extracted and merged into the same pipeline as the direct ATS scanner.',
    '> - **System Status** — proves the unattended pipeline ran (scan / triage / batch / Grok). `YES` everywhere = healthy.',
    '> ',
    '> **The ✅ Mark Applied button** — every row has one. Click it and you\'re done — the dashboard server flips that row\'s status from `Evaluated` to `Applied`, drops it from tomorrow\'s queue, and shows you a confirmation page with an Undo link. You don\'t need to come back to the terminal to report applications anymore.',
    '> ',
    `> **What to do:** Click **Open report** to read the full A–G reasoning, then **Apply** to go straight to the JD. After you submit on the company\'s site, hit **✅ Applied** in this email to clear the row. Or run \`/career-ops apply <URL>\` from the terminal for the assisted-fill flow that drafts answers per question.`,
    '> ',
    `> **Dashboard:** [Open the live dashboard →](${DASHBOARD_URL}) (sortable tables, filters, expand-on-click for full rationale).`,
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

async function generateHeartbeat() {
  const lines = [];
  lines.push(`# Career-Ops Heartbeat — ${TARGET_DATE}`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
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

  // What's New Overnight — sits ABOVE Apply-Now so freshly surfaced roles
  // are the first thing Mitchell sees in the email.
  for (const line of formatWhatsNewSection(whatsNew, packEligibleNums)) lines.push(line);
  lines.push('');

  lines.push('## Apply-Now Queue');
  lines.push('');
  lines.push(`_All evaluations with score ≥ ${APPLY_NOW_FLOOR.toFixed(1)} and status in {${[...ACTIONABLE_STATUSES].join(', ')}}, re-ranked every morning. Roles you've acted on (Applied / Interview / Discarded) are excluded — see **Activity Snapshot** below for those._`);
  lines.push('');
  lines.push(`_Apply Packs (📦) are pre-built for the top ${APPLY_PACK_TOP_N} of this queue plus the #1 of "What's New Overnight" — the highest-leverage roles where having the cover letter, LinkedIn DMs, and tailored CV ready saves the most prep time. Other rows still link to the JD and full report._`);
  lines.push('');
  lines.push(`_Full interactive view: [open the dashboard →](${DASHBOARD_URL}) (sortable tables, filters, expand-on-click for full rationale)._`);
  lines.push('');
  lines.push(`_Each Apply link is verified live before email send — expired postings are auto-flagged, removed from this queue, and marked Discarded in the tracker._`);
  lines.push('');
  for (const line of formatApplyNowQueue(applyNow, packEligibleNums)) lines.push(line);
  lines.push('');

  // Outreach Cadence — LinkedIn / X / email contacts awaiting reply.
  // Auto-suppresses on quiet days (no due_today, no breakup, no referrals).
  for (const line of formatOutreachCadence()) lines.push(line);

  // Rejected Pattern of the Week (Item #2 of 2026-05-16 review). Auto-
  // suppresses on quiet days (zero discards in last 7d). The markdown copy
  // mirrors the HTML block injected in renderHtmlEmail() so the persisted
  // data/heartbeat-{date}.md file matches what hits the inbox.
  try {
    const discardMd = renderDiscardPatternSection({ format: 'markdown', days: 7 });
    if (discardMd) {
      for (const line of discardMd.split('\n')) lines.push(line);
      lines.push('');
    }
  } catch (e) {
    // Soft failure — discard pattern is informational, never block the heartbeat
    console.warn(`[heartbeat] discard pattern section unavailable: ${e.message}`);
  }

  // Activity Snapshot — full status funnel so the user can see at a glance
  // how many applications are outstanding vs filtered out.
  const buckets = getStatusBreakdown(trackerRows);
  for (const line of formatActivitySnapshot(buckets)) lines.push(line);

  // Pipeline Funnel — today's inflow by source, including newsletter alerts.
  const inflow = getInflowStats(TARGET_DATE);
  const reportsToday = countReports(TARGET_DATE);
  const applicationsRows = countApplicationsRows(join(ROOT, 'data/applications.md'));
  for (const line of formatPipelineFunnel(inflow, reportsToday, applyNow.length, applicationsRows)) {
    lines.push(line);
  }

  // Compact System Status block — replaces the four separate Pipeline /
  // Scan / Batch / Grok sections from the prior layout. Same data, half
  // the visual weight.
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

  lines.push('## Errors / Warnings');
  lines.push('');

  const errorLog = join(ROOT, 'data/errors.log');
  if (existsSync(errorLog)) {
    const errors = readFileSync(errorLog, 'utf-8')
      .split('\n')
      .filter(l => l.includes(TARGET_DATE));
    if (errors.length > 0) {
      lines.push('```');
      errors.slice(-20).forEach(e => lines.push(e));
      lines.push('```');
    } else {
      lines.push('- No errors logged today.');
    }
  } else {
    lines.push('- No error log present.');
  }

  lines.push('');
  lines.push('## Action Required');
  lines.push('');
  lines.push('- [ ] None — system running unattended');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Interpretation guide — at the bottom so the actionable content
  // (What's New, Apply-Now Queue) is the first thing visible on open.
  for (const line of getInterpretationGuide()) lines.push(line);
  lines.push('');

  lines.push(`*Heartbeat generated by \`scripts/heartbeat.mjs\` · [Open dashboard →](${DASHBOARD_URL}) · scheduled daily 09:00 PT via launchd.*`);

  const meta = {
    date: TARGET_DATE,
    dashboardUrl: DASHBOARD_URL,
    queueCount: applyNow.length,
    trackedCount: applicationsRows,
    evaluatedToday: reportsToday,
    newFromAlerts: inflow.emailNew,
  };
  return { body: lines.join('\n'), meta };
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
    const html = renderHtmlEmail(body, meta);
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

  if (SEND) {
    const subject = `[career-ops] heartbeat ${TARGET_DATE}`;
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
