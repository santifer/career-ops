#!/usr/bin/env python3
from __future__ import annotations

import random
import re
from urllib.parse import urlparse

from scripts.python.pipeline.liveness_core import classify_liveness


LIVENESS_CONTEXT_OPTIONS = {
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "locale": "en-US",
}
PRIVATE_HOST_PATTERNS = [
    re.compile(r"^localhost$"),
    re.compile(r"^localhost\.localdomain$"),
    re.compile(r"^0\.0\.0\.0$"),
    re.compile(r"^127\."),
    re.compile(r"^10\."),
    re.compile(r"^192\.168\."),
    re.compile(r"^172\.(1[6-9]|2\d|3[01])\."),
    re.compile(r"^169\.254\."),
    re.compile(r"^::1$"),
    re.compile(r"^::$"),
    re.compile(r"^fc[0-9a-f]{2}:"),
    re.compile(r"^fe80:"),
]
CHALLENGE_CODES = {"bot_challenge", "access_blocked"}


def jittered_delay_ms(base_ms: int | float) -> int:
    base = int(base_ms or 0)
    return 0 if base <= 0 else base + random.randrange(base)


def normalize_host(raw_hostname: str | None) -> str:
    host = str(raw_hostname or "").lower()
    if host.endswith("."):
        host = host[:-1]
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    return host


def extract_mapped_ipv4(host: str) -> str | None:
    dotted = re.match(r"^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$", host)
    if dotted:
        return dotted.group(1)
    hexed = re.match(r"^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$", host)
    if hexed:
        a = int(hexed.group(1), 16)
        b = int(hexed.group(2), 16)
        return f"{(a >> 8) & 255}.{a & 255}.{(b >> 8) & 255}.{b & 255}"
    return None


def reject_private_or_invalid(url: str) -> dict[str, str] | None:
    try:
        parsed = urlparse(url)
    except Exception:
        return {"code": "invalid_url", "reason": "invalid URL"}
    if parsed.scheme not in {"http", "https"}:
        return {"code": "unsupported_protocol", "reason": f"unsupported protocol {parsed.scheme}:"}
    host = normalize_host(parsed.hostname)
    mapped = extract_mapped_ipv4(host)
    candidates = [host, mapped] if mapped else [host]
    if any(pattern.search(candidate or "") for candidate in candidates for pattern in PRIVATE_HOST_PATTERNS):
        return {"code": "blocked_host", "reason": f"blocked host {parsed.hostname}"}
    return None


def is_challenge_result(result: object) -> bool:
    if isinstance(result, dict):
        return result.get("result") == "uncertain" and result.get("code") in CHALLENGE_CODES
    return getattr(result, "result", None) == "uncertain" and getattr(result, "code", None) in CHALLENGE_CODES


async def check_url_liveness(page: object, url: str, *, extra_settle_ms: int = 0) -> object:
    guard = reject_private_or_invalid(url)
    if guard:
        return {"result": "uncertain", "code": guard["code"], "reason": guard["reason"]}
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=15000)
        status = response.status if hasattr(response, "status") else response.status()
        await page.wait_for_timeout(2000 + extra_settle_ms)
        final_url = page.url if isinstance(page.url, str) else page.url()
        body_text = await page.evaluate("() => document.body?.innerText ?? ''")
        apply_controls = await page.evaluate("() => []")
        result = classify_liveness(status=status, requestedUrl=url, finalUrl=final_url, bodyText=body_text, applyControls=apply_controls)
        return result.__dict__
    except Exception as exc:
        return {"result": "uncertain", "code": "navigation_error", "reason": f"navigation error: {str(exc).splitlines()[0]}"}


async def check_url_liveness_with_playwright(url: str, *, extra_settle_ms: int = 0) -> dict[str, str]:
    try:
        from playwright.async_api import async_playwright
    except Exception:
        return {"result": "uncertain", "code": "playwright_unavailable", "reason": "Playwright is not installed for Python"}

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            context = await browser.new_context(**LIVENESS_CONTEXT_OPTIONS)
            page = await context.new_page()
            result = await check_url_liveness(page, url, extra_settle_ms=extra_settle_ms)
            return result if isinstance(result, dict) else result.__dict__
        finally:
            await browser.close()
