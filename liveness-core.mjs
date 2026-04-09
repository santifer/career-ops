const HARD_EXPIRED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i,
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
];

const LISTING_PAGE_PATTERNS = [
  /\d+\s+jobs?\s+found/i,
  /search for jobs page is loaded/i,
];

const EXPIRED_URL_PATTERNS = [
  /[?&]error=true/i,
];

const APPLY_CONTROL_PATTERNS = [
  /^apply$/i,
  /^apply now$/i,
  /^apply here$/i,
  /^apply externally$/i,
  /^apply (?:for|to) (?:this )?(?:job|role|position)$/i,
  /^apply (?:on|via|with) .+$/i,
  /^click here to apply$/i,
  /^easy apply$/i,
  /^start (?:your )?application$/i,
  /^submit (?:your )?application$/i,
  /^solicitar(?: ahora)?$/i,
  /^postuler$/i,
  /^bewerben$/i,
  /^ich bewerbe mich$/i,
];

const APPLY_CONTROL_BLACKLIST = [
  /\bfilter\b/i,
  /\bfilters\b/i,
  /\bsearch\b/i,
  /\bsort\b/i,
  /\balert\b/i,
  /\bsettings?\b/i,
];

const MIN_CONTENT_CHARS = 300;

function firstMatch(patterns, text = '') {
  return patterns.find((pattern) => pattern.test(text));
}

function normalizeControlText(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

function hasApplyControl(controls = []) {
  return controls.some((control) => {
    const text = normalizeControlText(control);
    if (!text) return false;
    if (APPLY_CONTROL_BLACKLIST.some((pattern) => pattern.test(text))) return false;
    return APPLY_CONTROL_PATTERNS.some((pattern) => pattern.test(text));
  });
}

export function classifyLiveness({ status = 0, finalUrl = '', bodyText = '', applyControls = [] } = {}) {
  if (status === 404 || status === 410) {
    return { result: 'expired', reason: `HTTP ${status}` };
  }

  const expiredUrl = firstMatch(EXPIRED_URL_PATTERNS, finalUrl);
  if (expiredUrl) {
    return { result: 'expired', reason: `redirect to ${finalUrl}` };
  }

  const expiredBody = firstMatch(HARD_EXPIRED_PATTERNS, bodyText);
  if (expiredBody) {
    return { result: 'expired', reason: `pattern matched: ${expiredBody.source}` };
  }

  if (hasApplyControl(applyControls)) {
    return { result: 'active', reason: 'visible apply control detected' };
  }

  const listingPage = firstMatch(LISTING_PAGE_PATTERNS, bodyText);
  if (listingPage) {
    return { result: 'expired', reason: `pattern matched: ${listingPage.source}` };
  }

  if (bodyText.trim().length < MIN_CONTENT_CHARS) {
    return { result: 'expired', reason: 'insufficient content — likely nav/footer only' };
  }

  return { result: 'uncertain', reason: 'content present but no visible apply control found' };
}
