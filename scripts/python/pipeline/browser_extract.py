#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import yaml

from scripts.python import CONFIG_DIR
from scripts.python.pipeline.liveness_browser import LIVENESS_CONTEXT_OPTIONS, reject_private_or_invalid


DEFAULT_TIMEOUT_MS = 15_000
HYDRATION_WAIT_MS = 2_000
JD_TEXT_CAP = 12_000
DEFAULT_LISTING_MAX = 200
NAV_LABEL_STOPWORDS = {
    "home",
    "about",
    "about us",
    "contact",
    "contact us",
    "login",
    "log in",
    "sign in",
    "sign up",
    "register",
    "privacy",
    "privacy policy",
    "terms",
    "cookies",
    "cookie policy",
    "careers",
    "jobs",
    "search",
    "menu",
    "back",
    "next",
    "previous",
    "apply",
    "apply now",
    "learn more",
    "read more",
    "faq",
    "blog",
    "news",
    "help",
    "support",
    "english",
}

READ_DOM_JS = """() => {
    const title = (document.querySelector('h1')?.innerText || document.title || '').trim();
    const root = document.querySelector('main, [role="main"], article') || document.body;
    let text = '';
    if (root) {
        const clone = root.cloneNode(true);
        clone.querySelectorAll('script, style, nav, header, footer, noscript').forEach((el) => el.remove());
        text = clone.innerText || '';
    }
    const anchors = Array.from(document.querySelectorAll('a[href]'))
        .filter((el) => {
            if (el.closest('nav, header, footer')) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return el.getClientRects().length > 0;
        })
        .map((el) => ({ href: el.getAttribute('href') || '', label: (el.innerText || '').trim() }));
    return { title, text, anchors };
}"""


def resolve_extractor_mode(profile_path: str | Path = CONFIG_DIR / "profile.yml") -> str:
    try:
        path = Path(profile_path)
        if not path.exists():
            return "mcp"
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        return "cli" if isinstance(raw, dict) and raw.get("scan", {}).get("extractor") == "cli" else "mcp"
    except Exception:
        return "mcp"


def compact_text(value: Any, cap: int = JD_TEXT_CAP) -> str:
    text = re.sub(r"[ \t\u00a0]+", " ", str(value if value is not None else ""))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return f"{text[:cap]}…" if len(text) > cap else text


def normalize_jd(raw: dict[str, Any], final_url: str, text_cap: int = JD_TEXT_CAP) -> dict[str, str]:
    return {"url": final_url, "title": compact_text(raw.get("title") or "", 300), "text": compact_text(raw.get("text") or "", text_cap)}


def normalize_listing(anchors: list[dict[str, Any]] | None, final_url: str, max_items: int = DEFAULT_LISTING_MAX) -> dict[str, Any]:
    jobs: list[dict[str, str]] = []
    seen: set[str] = set()
    for anchor in anchors if isinstance(anchors, list) else []:
        label = re.sub(r"\s+", " ", str(anchor.get("label") or "")).strip()
        if len(label) < 3 or label.lower() in NAV_LABEL_STOPWORDS:
            continue
        try:
            url = urljoin(final_url, str(anchor.get("href") or ""))
            if urlparse(url).scheme not in {"http", "https"}:
                continue
        except Exception:
            continue
        if url in seen:
            continue
        seen.add(url)
        jobs.append({"title": label, "url": url})
        if len(jobs) >= max_items:
            break
    return {"url": final_url, "jobs": jobs}


async def extract_url(url: str, *, mode: str = "jd", max_items: int = DEFAULT_LISTING_MAX, max_chars: int = JD_TEXT_CAP, timeout_ms: int = DEFAULT_TIMEOUT_MS) -> dict[str, Any]:
    try:
        from playwright.async_api import async_playwright
    except Exception:
        return {"error": "playwright not installed", "code": "no_playwright"}

    guard = reject_private_or_invalid(url)
    if guard:
        return {"error": guard["reason"], "code": guard["code"]}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            context = await browser.new_context(**LIVENESS_CONTEXT_OPTIONS)

            async def route_handler(route: Any) -> None:
                req_url = route.request.url
                if reject_private_or_invalid(req_url):
                    await route.abort()
                else:
                    await route.continue_()

            await context.route("**/*", route_handler)
            page = await context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            await page.wait_for_timeout(HYDRATION_WAIT_MS)

            final_url = page.url
            final_guard = reject_private_or_invalid(final_url)
            if final_guard:
                return {"error": f"blocked final URL: {final_guard['reason']}", "code": final_guard["code"]}

            raw = await page.evaluate(READ_DOM_JS)
            if mode == "listing":
                return normalize_listing(raw.get("anchors"), final_url, max_items)
            return normalize_jd(raw, final_url, max_chars)
        except Exception as exc:
            return {"error": f"navigation error: {str(exc).splitlines()[0]}", "code": "navigation_error"}
        finally:
            await browser.close()


def parse_args(argv: list[str]) -> dict[str, Any]:
    flags = {"--mode", "--max", "--max-chars", "--timeout"}
    url = None
    mode = "jd"
    max_items = DEFAULT_LISTING_MAX
    max_chars = JD_TEXT_CAP
    timeout = DEFAULT_TIMEOUT_MS
    idx = 0
    while idx < len(argv):
        token = argv[idx]
        if token in flags:
            idx += 1
            value = argv[idx] if idx < len(argv) else None
            try:
                number = int(value) if value is not None else None
            except ValueError:
                number = None
            if token == "--mode" and value is not None:
                mode = value
            elif token == "--max" and number is not None and number >= 0:
                max_items = number
            elif token == "--max-chars" and number is not None and number > 0:
                max_chars = number
            elif token == "--timeout" and number is not None and number > 0:
                timeout = number
        elif not token.startswith("--") and url is None:
            url = token
        idx += 1
    return {"url": url, "mode": mode, "max": max_items, "maxChars": max_chars, "timeout": timeout}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Headless browser extractor for JD/listing pages.")
    parser.add_argument("url")
    parser.add_argument("--mode", choices=["jd", "listing"], default="jd")
    parser.add_argument("--max", type=int, default=DEFAULT_LISTING_MAX)
    parser.add_argument("--max-chars", type=int, default=JD_TEXT_CAP)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_MS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    guard = reject_private_or_invalid(args.url)
    if guard:
        print(json.dumps({"error": guard["reason"], "code": guard["code"]}))
        return 1
    result = asyncio.run(extract_url(args.url, mode=args.mode, max_items=args.max, max_chars=args.max_chars, timeout_ms=args.timeout))
    if "error" in result:
        print(json.dumps(result))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
