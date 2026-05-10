/**
 * lib/dashboard-tokens.mjs — Single source of truth for visual identity
 * across the Career-Ops product line. The dashboard, the report HTML
 * pages, and the heartbeat email all import their palette + chip styles
 * from here so they read as one product, not three.
 *
 * Naming convention follows the dashboard's existing CSS variables —
 * --bg / --surface / --green-fg / etc. — so port lookups are 1:1.
 *
 * Two modes:
 *   - DARK   : the dashboard + report HTML pages. Full mission-control
 *              palette (cobalt-slate base, matrix-green accent, OLED-deep
 *              backgrounds, glow shadows on hovered focal points).
 *   - EMAIL  : light-mode-friendly version of the same palette for email
 *              clients that don't respect prefers-color-scheme. Same
 *              hues, lifted lightness so they read on white. Pairs with
 *              a prefers-color-scheme: dark CSS block (see emailDarkCss)
 *              for clients that DO respect it (Apple Mail, Gmail web,
 *              Outlook 365 dark).
 */

export const TOKENS = {
  dark: {
    // Surfaces
    bg:           '#06070d',
    surface:      '#11131c',
    surface2:     '#181b27',
    border:       '#232737',
    borderStrong: '#353a52',
    // Text
    text:         '#fafafa',
    text2:        '#e4e4e7',
    text3:        '#b8b8c0',
    text4:        '#9a9aa6',
    // Brand accent — matrix-green, used for hero balance, primary CTAs,
    // success indicators. The single saturated focal color in the palette.
    green:        '#4ade80',
    greenFg:      '#86efac',
    greenFgDark:  '#bbf7d0',
    greenBg:      'rgba(22,163,74,0.12)',
    greenBorder:  'rgba(22,163,74,0.30)',
    greenGlow:    'rgba(74,222,128,0.35)',
    // Secondary (info / status)
    blue:         '#a4b0c2',
    blueFg:       '#94a3b8',
    blueFgDark:   '#cbd5e1',
    blueBg:       'rgba(100,116,139,0.14)',
    // Warning
    amber:        '#c2a571',
    amberFg:      '#d4ba84',
    amberBg:      'rgba(168,123,72,0.14)',
    // Negative
    red:          '#f87171',
    redFg:        '#fca5a5',
    redBg:        'rgba(220,38,38,0.12)',
    // Body backdrop — subtle radial gradient that gives the "space" feel
    // without busy patterns. Layered behind every panel via background-image.
    backdrop: [
      'radial-gradient(ellipse 1200px 600px at 12% -10%, rgba(64, 224, 208, 0.06), transparent 60%)',
      'radial-gradient(ellipse 900px 500px at 88% 110%, rgba(139, 92, 246, 0.05), transparent 65%)',
      'radial-gradient(ellipse 700px 400px at 50% 50%, rgba(0, 255, 157, 0.025), transparent 70%)',
    ].join(', '),
  },
  email: {
    // Light-mode-safe versions. Same hues, lifted lightness so they read
    // on white. Email clients that don't respect prefers-color-scheme see
    // these. Clients that do see the dark palette via emailDarkCss.
    bg:           '#f8fafc',
    surface:      '#ffffff',
    surface2:     '#f1f5f9',
    border:       '#e2e8f0',
    borderStrong: '#cbd5e1',
    text:         '#0f172a',
    text2:        '#1e293b',
    text3:        '#475569',
    text4:        '#64748b',
    // Same brand accent — but slightly darker green for legibility on white
    green:        '#16a34a',
    greenFg:      '#15803d',
    greenBg:      '#dcfce7',
    greenBorder:  '#86efac',
    blue:         '#2563eb',
    blueFg:       '#1e40af',
    blueBg:       '#dbeafe',
    amberBg:      '#fef3c7',
    amberFg:      '#92400e',
    redBg:        '#fee2e2',
    redFg:        '#991b1b',
  },
};

// Typography stack — same fonts used everywhere.
export const FONTS = {
  ui:   "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

// Score badge color picker — used by all three surfaces. Returns
// {bg, fg} for an inline-styled <span>.
export function scoreBadgeColors(score, mode = 'dark') {
  const t = TOKENS[mode] || TOKENS.dark;
  const n = parseFloat(score);
  if (isNaN(n)) return { bg: t.surface2, fg: t.text3 };
  if (n >= 4.0) return { bg: t.greenBg, fg: t.greenFg || t.green };
  if (n >= 3.0) return { bg: t.amberBg, fg: t.amberFg || t.amber };
  return { bg: t.surface2, fg: t.text3 };
}

// Status pill colors — used by all three surfaces.
export function statusBadgeColors(status, mode = 'dark') {
  const t = TOKENS[mode] || TOKENS.dark;
  const map = {
    Offer:     { bg: t.amberBg,  fg: t.amberFg || t.amber },
    Interview: { bg: t.greenBg,  fg: t.greenFg || t.green },
    Responded: { bg: t.blueBg,   fg: t.blueFg  || t.blue },
    Applied:   { bg: t.blueBg,   fg: t.blueFg  || t.blue },
    Evaluated: { bg: t.surface2, fg: t.text3 },
    Rejected:  { bg: t.redBg,    fg: t.redFg   || t.red },
    Discarded: { bg: t.surface2, fg: t.text4 },
    SKIP:      { bg: t.surface2, fg: t.text4 },
  };
  return map[status] || { bg: t.surface2, fg: t.text3 };
}

// Mission-control header HTML — the gradient banner that opens the
// dashboard, the report HTML pages, and the heartbeat email. Variants
// per surface so the same visual signature renders correctly each time.
//
//   surface: 'dashboard' | 'report' | 'email'
//   title:   the headline text (e.g., "Career-Ops · Daily Heartbeat")
//   subtitle: secondary line (e.g., "2026-05-10")
//   cta:     optional { text, url } pair for an inline button
//
// All inline-styled (the dashboard's CSS-variable-driven equivalent
// already exists in scripts/build-dashboard.mjs's mc-strip).
export function missionControlHeader({ surface = 'email', title, subtitle, cta } = {}) {
  const mode = surface === 'email' ? 'email' : 'dark';
  const t = TOKENS[mode];
  const accent = mode === 'dark' ? t.greenFg : t.green;
  const accentDeep = mode === 'dark' ? t.green : t.greenFg;
  const headerBg = mode === 'dark'
    ? `linear-gradient(135deg, rgba(0,255,157,0.10) 0%, rgba(22,163,74,0.04) 50%, ${t.surface} 100%)`
    : `linear-gradient(135deg, ${t.green} 0%, #15803d 50%, #0f5e2c 100%)`;
  const headerText = mode === 'dark' ? t.text : '#ffffff';
  const eyebrow = mode === 'dark' ? t.text3 : 'rgba(255,255,255,0.85)';
  const ctaHtml = cta && cta.text
    ? `<td align="right" style="vertical-align:middle">
         <a href="${cta.url}" style="display:inline-block;background:${mode === 'dark' ? t.greenFg : '#ffffff'};color:${mode === 'dark' ? t.bg : t.greenFg};padding:9px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.01em">${cta.text}</a>
       </td>`
    : '';
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px">
  <tr>
    <td style="padding:22px 24px;background:${headerBg};border-radius:12px;color:${headerText};border:1px solid ${t.border}">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%">
        <tr>
          <td style="vertical-align:middle">
            <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${eyebrow};font-weight:600">${escapeForHtml(title)}</div>
            <div style="font-size:24px;font-weight:700;margin-top:4px;letter-spacing:-0.01em;font-family:${FONTS.mono};color:${headerText}">${escapeForHtml(subtitle || '')}</div>
          </td>
          ${ctaHtml}
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

// CSS that triggers in clients respecting prefers-color-scheme: dark.
// Inlined via <style> in the email <head>. Apple Mail, Gmail web,
// Outlook 365 dark mode all honor this. Outlook desktop and many older
// clients ignore it gracefully.
export function emailDarkCss() {
  const t = TOKENS.dark;
  return `
@media (prefers-color-scheme: dark) {
  body, .body-bg { background: ${t.bg} !important; color: ${t.text} !important; }
  .card { background: ${t.surface} !important; border-color: ${t.border} !important; color: ${t.text} !important; }
  .text-strong { color: ${t.text} !important; }
  .text-muted  { color: ${t.text3} !important; }
  .text-subtle { color: ${t.text4} !important; }
  .border      { border-color: ${t.border} !important; }
  .accent      { color: ${t.greenFg} !important; }
  .accent-bg   { background: ${t.greenBg} !important; color: ${t.greenFg} !important; }
  table { border-color: ${t.border} !important; }
  th { background: ${t.surface2} !important; color: ${t.text3} !important; border-color: ${t.border} !important; }
  td { color: ${t.text2} !important; border-color: ${t.border} !important; }
  blockquote { background: ${t.surface2} !important; color: ${t.text2} !important; border-left-color: ${t.greenFg} !important; }
  code { background: ${t.surface2} !important; color: ${t.greenFg} !important; }
  hr { background: linear-gradient(90deg, transparent 0%, ${t.border} 50%, transparent 100%) !important; }
  a { color: ${t.greenFg} !important; }
  .header-banner { background: linear-gradient(135deg, ${t.surface} 0%, ${t.surface2} 100%) !important; border: 1px solid ${t.border} !important; }
  .cta-button { background: ${t.greenFg} !important; color: ${t.bg} !important; }
}`;
}

function escapeForHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
