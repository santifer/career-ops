// ─── Section 1: Constants ───────────────────────────────────────────────────

const SAFE_TAGS = new Set([
  'blockquote', 'nav', 'a', 'input', 'textarea', 'select',
  'pre', 'code', 'span', 'th', 'td', 'tr', 'li', 'label',
  'button', 'hr', 'html', 'head', 'body', 'script', 'style',
  'link', 'meta', 'title', 'br', 'img', 'svg', 'path', 'circle',
  'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'use',
]);

// Per-check safe-tags override for the border (side-tab / border-accent)
// rule. We intentionally re-allow <label> here because card-shaped clickable
// labels (e.g. .checklist-item wrapping a checkbox + content) are one of the
// canonical side-tab anti-pattern shapes and must be detected. The rule's
// other preconditions (non-neutral color, width >= 2px on a single side,
// radius > 0 or width >= 3, element size >= 20x20 in the browser path)
// already filter out plain inline form labels so this does not introduce
// false positives. See modern-color-borders.html for the test matrix.
const BORDER_SAFE_TAGS = new Set(
  [...SAFE_TAGS].filter(t => t !== 'label')
);

const OVERUSED_FONTS = new Set([
  // Older monoculture (still ubiquitous):
  'inter', 'roboto', 'open sans', 'lato', 'montserrat', 'arial', 'helvetica',
  // Newer monoculture (the Anthropic-skill / Vercel / GitHub default wave):
  'fraunces', 'instrument sans', 'instrument serif',
  'geist', 'geist sans', 'geist mono',
  'mona sans',
  'plus jakarta sans', 'space grotesk', 'recoleta',
]);

// Brand-associated fonts: don't flag these as "overused" on the brand's own domains.
// Keys are font names, values are arrays of hostname suffixes where the font is allowed.
const GOOGLE_DOMAINS = [
  'google.com', 'youtube.com', 'android.com', 'chromium.org',
  'chrome.com', 'web.dev', 'gstatic.com', 'firebase.google.com',
];
const VERCEL_DOMAINS = ['vercel.com', 'nextjs.org', 'v0.app'];
const GITHUB_DOMAINS = ['github.com', 'githubnext.com'];
const BRAND_FONT_DOMAINS = {
  'roboto': GOOGLE_DOMAINS,
  'google sans': GOOGLE_DOMAINS,
  'product sans': GOOGLE_DOMAINS,
  'geist': VERCEL_DOMAINS,
  'geist sans': VERCEL_DOMAINS,
  'geist mono': VERCEL_DOMAINS,
  'mona sans': GITHUB_DOMAINS,
};

function isBrandFontOnOwnDomain(font) {
  if (typeof location === 'undefined') return false;
  const allowed = BRAND_FONT_DOMAINS[font];
  if (!allowed) return false;
  const host = location.hostname.toLowerCase();
  return allowed.some(suffix => host === suffix || host.endsWith('.' + suffix));
}

const GENERIC_FONTS = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui',
  'inherit', 'initial', 'unset', 'revert',
]);

// WCAG large text thresholds are defined in points: 18pt normal text and
// 14pt bold text. Browsers expose font-size in CSS pixels at 96px per inch.
const WCAG_LARGE_TEXT_PX = 18 * (96 / 72);
const WCAG_LARGE_BOLD_TEXT_PX = 14 * (96 / 72);

// Serif faces that show up in italic-display heroes. The rule also fires when
// the primary face is unknown but the stack ends in the generic `serif` token,
// which catches custom/private faces with a serif fallback.
const KNOWN_SERIF_FONTS = new Set([
  'fraunces', 'recoleta', 'newsreader', 'playfair display', 'playfair',
  'cormorant', 'cormorant garamond', 'garamond', 'eb garamond',
  'tiempos', 'tiempos headline', 'tiempos text',
  'lora', 'vollkorn', 'spectral',
  'source serif pro', 'source serif 4', 'source serif',
  'ibm plex serif', 'merriweather',
  'libre caslon', 'libre baskerville', 'baskerville',
  'georgia', 'times new roman', 'times',
  'dm serif display', 'dm serif text',
  'instrument serif', 'gt sectra', 'ogg', 'canela',
  'freight display', 'freight text',
]);

export {
  SAFE_TAGS,
  BORDER_SAFE_TAGS,
  OVERUSED_FONTS,
  GOOGLE_DOMAINS,
  VERCEL_DOMAINS,
  GITHUB_DOMAINS,
  BRAND_FONT_DOMAINS,
  isBrandFontOnOwnDomain,
  GENERIC_FONTS,
  WCAG_LARGE_TEXT_PX,
  WCAG_LARGE_BOLD_TEXT_PX,
  KNOWN_SERIF_FONTS,
};
