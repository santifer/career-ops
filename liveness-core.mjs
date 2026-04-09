const EXPIRED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,           // Greenhouse: "The job you are looking for is no longer open."
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i, // Workday /job/ 404
  /\d+\s+jobs?\s+found/i,           // Workday: landed on listing page ("663 JOBS FOUND") instead of a specific job
  /search for jobs page is loaded/i, // Workday SPA indicator for listing page
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
];

const LISTING_PAGE_PATTERNS = [
  /\d+\s+jobs?\s+found/i,
  /search for jobs page is loaded/i,
];

const EXPIRED_URL_PATTERNS = [
  /[?&]error=true/i,   // Greenhouse redirect on closed jobs
];

const APPLY_PATTERNS = [
  /\bapply\b/i,          // catches "Apply", "Apply Now", "Apply for this Job"
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,  // Ashby
  /ich bewerbe mich/i,   // German Greenhouse
];

const MIN_CONTENT_CHARS = 300;

function matchesAnyPattern(value, patterns) {
  return patterns.find((pattern) => pattern.test(value));
}

function countApplyControls(applyControls = []) {
  return applyControls.filter((label) => matchesAnyPattern(label, APPLY_PATTERNS)).length;
}

export function classifyLiveness({
  status = 0,
  finalUrl = '',
  bodyText = '',
  applyControls = [],
}) {
  if (status === 404 || status === 410) {
    return { result: 'expired', reason: `HTTP ${status}` };
  }

  const expiredUrlPattern = matchesAnyPattern(finalUrl, EXPIRED_URL_PATTERNS);
  if (expiredUrlPattern) {
    return { result: 'expired', reason: `redirect to ${finalUrl}` };
  }

  const visibleApplyControls = countApplyControls(applyControls);
  const listingPattern = matchesAnyPattern(bodyText, LISTING_PAGE_PATTERNS);
  if (listingPattern && visibleApplyControls > 1) {
    return { result: 'expired', reason: `listing page matched: ${listingPattern.source}` };
  }

  if (visibleApplyControls > 0) {
    return { result: 'active', reason: 'visible apply control detected' };
  }

  const expiredBodyPattern = matchesAnyPattern(bodyText, EXPIRED_PATTERNS);
  if (expiredBodyPattern) {
    return { result: 'expired', reason: `pattern matched: ${expiredBodyPattern.source}` };
  }

  if (bodyText.trim().length < MIN_CONTENT_CHARS) {
    return { result: 'expired', reason: 'insufficient content — likely nav/footer only' };
  }

  return { result: 'uncertain', reason: 'content present but no visible apply control found' };
}
