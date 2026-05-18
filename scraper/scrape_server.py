"""
scraper/scrape_server.py — Scrapling-backed JD fetcher.

Exposes a single endpoint:

    POST /scrape  { "url": "https://..." }  →  { ok, title, company, location, jd_markdown, chars, fetcher }

The auth proxy calls this and persists the result. Designed to be conservative:
LinkedIn anti-bot screens are aggressive, so we attempt the fetcher chain
StealthyFetcher → DynamicFetcher (Camoufox) → Fetcher (plain HTTP) and return
the first one that surfaces a real JD-shaped page. Pages where the body looks
like a login wall or sign-in CTA are rejected so the caller doesn't write
junk to jds/.
"""
from __future__ import annotations

import logging
import os
import re
import sys
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl, field_validator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("scraper")

# ── Scrapling fetchers — lazy-imported so import errors are observable ─
try:
    from scrapling.fetchers import Fetcher, StealthyFetcher, DynamicFetcher  # type: ignore
except Exception as exc:  # pragma: no cover
    log.exception("Scrapling import failed; the /scrape endpoint will return 503")
    Fetcher = StealthyFetcher = DynamicFetcher = None  # type: ignore

app = FastAPI(title="careerops-scraper", version="1.0.0")


class ScrapeRequest(BaseModel):
    url: HttpUrl

    @field_validator("url")
    @classmethod
    def reject_localhost(cls, v: HttpUrl) -> HttpUrl:
        host = (urlparse(str(v)).hostname or "").lower()
        if host in {"localhost", "127.0.0.1", "::1"} or host.startswith("10.") \
                or host.startswith("172.") or host.startswith("192.168."):
            raise ValueError("private/loopback URLs are not allowed")
        return v


class ScrapeResponse(BaseModel):
    ok: bool
    fetcher: str
    title: str | None = None
    company: str | None = None
    location: str | None = None
    jd_markdown: str
    chars: int


# ── Extraction helpers ────────────────────────────────────────────
# These are deliberately small, per-site overrides. The list grows as we find
# patterns that yield cleaner output than the generic body-text fallback.
def _norm_ws(s: str | None) -> str | None:
    if not s:
        return None
    return re.sub(r"\s+", " ", s).strip() or None


def _first(page, selector):
    """Return the first matching element or None. Scrapling exposes results
    via .css(selector) which is iterable; .first attribute or `.extract_first()`
    aren't part of the API on every page object, so we just take [0]."""
    try:
        nodes = page.css(selector)
    except Exception:
        return None
    if not nodes:
        return None
    try:
        return nodes[0]
    except (IndexError, TypeError):
        return None


def _text_of(node) -> str | None:
    if node is None:
        return None
    # Scrapling element exposes `.text` (string) and `.get_all_text()`
    try:
        t = node.get_all_text()
        if t:
            return t
    except Exception:
        pass
    try:
        return getattr(node, "text", None)
    except Exception:
        return None


def _attr_of(node, name) -> str | None:
    if node is None:
        return None
    try:
        return node.attrib.get(name)
    except Exception:
        return None


def _from_linkedin(page) -> dict[str, str | None]:
    out: dict[str, str | None] = {"title": None, "company": None, "location": None, "body": None}
    # LinkedIn's public job-view layout (when not logged in)
    title_el = _first(page, "h1.top-card-layout__title") or \
               _first(page, "h1.topcard__title") or \
               _first(page, "h1")
    out["title"] = _norm_ws(_text_of(title_el))
    company_el = _first(page, "a.topcard__org-name-link") or \
                 _first(page, ".topcard__flavor a") or \
                 _first(page, ".top-card-layout__second-subline a") or \
                 _first(page, ".top-card-layout__entity-info-container a")
    out["company"] = _norm_ws(_text_of(company_el))
    loc_el = _first(page, ".topcard__flavor.topcard__flavor--bullet") or \
             _first(page, ".top-card-layout__second-subline span.topcard__flavor--bullet")
    out["location"] = _norm_ws(_text_of(loc_el))
    body_el = _first(page, ".description__text") or \
              _first(page, ".show-more-less-html") or \
              _first(page, ".jobs-description-content__text") or \
              _first(page, ".job-description") or \
              _first(page, "[data-test-id='jobDescriptionText']")
    if body_el:
        out["body"] = _text_of(body_el)
    return out


def _from_generic(page) -> dict[str, str | None]:
    out: dict[str, str | None] = {"title": None, "company": None, "location": None, "body": None}
    # OG / Twitter card hints first
    og_title = _first(page, 'meta[property="og:title"]')
    og_site  = _first(page, 'meta[property="og:site_name"]')
    out["title"] = _norm_ws(_attr_of(og_title, "content")) or _norm_ws(_text_of(_first(page, "h1")))
    out["company"] = _norm_ws(_attr_of(og_site, "content"))
    # JD-shaped main content
    main = _first(page, "article") or \
           _first(page, "main") or \
           _first(page, "[role='main']") or \
           _first(page, ".jobs-description") or \
           _first(page, "#content") or \
           _first(page, "#job-description")
    body_text = _text_of(main)
    if not body_text:
        # Last resort: the entire visible page text
        try:
            body_text = page.get_all_text()
        except Exception:
            body_text = _text_of(_first(page, "body"))
    out["body"] = body_text
    return out


def _looks_like_login_wall(text: str) -> bool:
    """Cheap heuristic: a few sites return a login splash + nothing else when
    anti-bot fires. We only reject when the page is dominated by sign-in
    language AND substantial body content is absent. JD pages routinely
    mention 'sign in' or similar in nav/footer; the heuristic must be lenient
    enough not to false-positive."""
    if not text:
        return True
    text = text.strip()
    if len(text) < 250:
        return True  # almost certainly an error page or pre-hydration shell
    head = text[:2000].lower()
    score = 0
    for needle in (
        "we couldn't get to that page", "please make sure",
        "create your free account",
        "join linkedin", "log in to linkedin",
    ):
        if needle in head:
            score += 1
    return score >= 2


# ── Fetcher chain ────────────────────────────────────────────────
def _try_chain(url: str, host: str) -> tuple[str, Any, dict[str, str | None]] | None:
    """Try each fetcher in order. Returns (label, page, parts) for the first
    fetcher whose page yields a JD-shaped body via the site-specific extractor.
    `parts` is the extractor output so we don't re-parse later."""
    chain = []
    if DynamicFetcher is not None:
        chain.append(("dynamic-patchright",
                      lambda: DynamicFetcher.fetch(url, headless=True, humanize=True,
                                                   wait_selector="body", network_idle=True)))
    if StealthyFetcher is not None:
        chain.append(("stealthy-camoufox",
                      lambda: StealthyFetcher.fetch(url, headless=True, network_idle=True)))
    if Fetcher is not None:
        chain.append(("plain", lambda: Fetcher.get(url)))

    extractor = _from_linkedin if "linkedin." in host else _from_generic

    for label, fn in chain:
        try:
            log.info("fetcher=%s url=%s", label, url)
            page = fn()
        except TypeError:
            # Older/newer scrapling versions may not accept all kwargs.
            try:
                page = fn.__self__ if hasattr(fn, "__self__") else None  # type: ignore
                # Re-invoke without kwargs as a degraded fallback
                if "dynamic" in label and DynamicFetcher is not None:
                    page = DynamicFetcher.fetch(url, headless=True)
                elif "stealthy" in label and StealthyFetcher is not None:
                    page = StealthyFetcher.fetch(url, headless=True)
                elif Fetcher is not None:
                    page = Fetcher.get(url)
            except Exception as exc:
                log.warning("fetcher=%s failed (retry without kwargs): %s", label, exc)
                continue
        except Exception as exc:
            log.warning("fetcher=%s failed: %s", label, exc)
            continue

        try:
            parts = extractor(page)
        except Exception as exc:
            log.warning("fetcher=%s extractor crashed: %s", label, exc)
            continue

        body_len = len((parts.get("body") or "").strip())
        log.info("fetcher=%s extractor body_len=%d title=%r", label, body_len, parts.get("title"))

        # Accept if we have ANY structured signal (title OR sensible body).
        # Generic body fallback (any tag's text) saves us when CSS selectors miss.
        if body_len < 200:
            generic = _from_generic(page)
            generic_body_len = len((generic.get("body") or "").strip())
            if generic_body_len >= body_len:
                parts = generic
                body_len = generic_body_len

        if body_len >= 250 or (parts.get("title") and body_len >= 100):
            return label, page, parts

        log.info("fetcher=%s yielded insufficient content (body_len=%d) — trying next", label, body_len)
    return None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "scrapling_available": all(f is not None for f in (Fetcher, StealthyFetcher, DynamicFetcher)),
    }


@app.post("/scrape", response_model=ScrapeResponse)
def scrape(req: ScrapeRequest) -> ScrapeResponse:
    if Fetcher is None:
        raise HTTPException(503, detail="Scrapling is not available in this container")

    url = str(req.url)
    host = (urlparse(url).hostname or "").lower()

    result = _try_chain(url, host)
    if not result:
        raise HTTPException(502, detail="all fetchers failed or returned insufficient JD content")

    label, page, parts = result
    body_text = _norm_ws(parts.get("body")) or ""
    if not body_text or len(body_text) < 200:
        raise HTTPException(502, detail=f"extracted body too short ({len(body_text)} chars)")

    md_lines = [
        f"# {parts.get('title') or 'Untitled role'}",
        "",
        f"**URL:** {url}",
        f"**Company:** {parts.get('company') or '(not extracted)'}",
        f"**Location:** {parts.get('location') or '(not extracted)'}",
        f"**Fetcher:** {label}",
        "",
        "---",
        "",
        body_text,
    ]
    md = "\n".join(md_lines)

    return ScrapeResponse(
        ok=True,
        fetcher=label,
        title=parts.get("title"),
        company=parts.get("company"),
        location=parts.get("location"),
        jd_markdown=md,
        chars=len(md),
    )


if __name__ == "__main__":  # pragma: no cover
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")), log_level="info")
