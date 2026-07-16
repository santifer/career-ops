from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


HARD_EXPIRED_PATTERNS = [
    r"job (is )?no longer available",
    r"job.*no longer open",
    r"position has been filled",
    r"this job has expired",
    r"job posting has expired",
    r"no longer accepting applications",
    r"this (position|role|job) (is )?no longer",
    r"this job (listing )?is closed",
    r"job (listing )?not found",
    r"the page you are looking for doesn.t exist",
    r"applications?\s+(?:(?:have|are|is)\s+)?closed",
    r"closed on \d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)",
    r"closed on (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}",
    r"diese stelle (ist )?(nicht mehr|bereits) besetzt",
    r"offre (expirée|n'est plus disponible)",
]

LISTING_PAGE_PATTERNS = [
    r"\d+\s+jobs?\s+found",
    r"search for jobs page is loaded",
]

BOT_CHALLENGE_PATTERNS = [
    r"just a moment",
    r"performing security verification",
    r"checking your browser before",
    r"verify you are (a |not a )?human",
    r"enable javascript and cookies to continue",
    r"attention required.*cloudflare",
    r"\bray id\b",
    r"\bcf-ray\b",
    r"please complete the security check",
]

EXPIRED_URL_PATTERNS = [r"[?&]error=true"]

APPLY_PATTERNS = [
    r"\bapply\b",
    r"\bsolicitar\b",
    r"\bbewerben\b",
    r"\bpostuler\b",
    r"submit application",
    r"easy apply",
    r"start application",
    r"ich bewerbe mich",
    r"\baplikuj\b",
    r"panelu aplikowania",
    r"wyślij (cv|aplikacj)",
]

MIN_CONTENT_CHARS = 300
JOB_ID_TOKEN_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{5,}", re.IGNORECASE)


@dataclass(frozen=True)
class LivenessResult:
    result: str
    code: str
    reason: str


def job_id_token(url: str = "") -> str | None:
    matches = JOB_ID_TOKEN_RE.findall(url or "")
    return matches[-1].lower() if matches else None


def first_match(patterns: list[str], text: str = "") -> str | None:
    for pattern in patterns:
        if re.search(pattern, text or "", re.IGNORECASE):
            return pattern
    return None


def has_apply_control(controls: list[str] | None = None) -> bool:
    return any(first_match(APPLY_PATTERNS, control) for control in (controls or []))


def classify_liveness(payload: dict[str, Any] | None = None, **kwargs: Any) -> LivenessResult:
    data = {**(payload or {}), **kwargs}
    status = int(data.get("status") or 0)
    requested_url = str(data.get("requestedUrl") or data.get("requested_url") or "")
    final_url = str(data.get("finalUrl") or data.get("final_url") or "")
    body_text = str(data.get("bodyText") or data.get("body_text") or "")
    apply_controls = data.get("applyControls") or data.get("apply_controls") or []

    if status in {404, 410}:
        return LivenessResult("expired", "http_gone", f"HTTP {status}")
    if bot := first_match(BOT_CHALLENGE_PATTERNS, body_text):
        return LivenessResult("uncertain", "bot_challenge", f"anti-bot challenge: {bot}")
    if status in {403, 503}:
        return LivenessResult("uncertain", "access_blocked", f"HTTP {status} (access blocked, likely anti-bot)")
    if first_match(EXPIRED_URL_PATTERNS, final_url):
        return LivenessResult("expired", "expired_url", f"redirect to {final_url}")
    if expired := first_match(HARD_EXPIRED_PATTERNS, body_text):
        return LivenessResult("expired", "expired_body", f"pattern matched: {expired}")
    job_id = job_id_token(requested_url)
    if job_id and final_url and job_id not in final_url.lower():
        return LivenessResult("uncertain", "redirected_off_posting", f'redirected to {final_url} — job id "{job_id}" missing from final URL')
    if has_apply_control(apply_controls):
        return LivenessResult("active", "apply_control_visible", "visible apply control detected")
    if listing := first_match(LISTING_PAGE_PATTERNS, body_text):
        return LivenessResult("expired", "listing_page", f"pattern matched: {listing}")
    if len(body_text.strip()) < MIN_CONTENT_CHARS:
        return LivenessResult("expired", "insufficient_content", "insufficient content — likely nav/footer only")
    return LivenessResult("uncertain", "no_apply_control", "content present but no visible apply control found")

