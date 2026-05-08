#!/usr/bin/env python3
"""Stealthy JD fetcher for /yash-resume-pipeline. CLI:

  python3 scrapling_fetch.py <url>                     # live fetch (uses Scrapling)
  python3 scrapling_fetch.py --detect-source <url>     # host→portal mapping only (stdlib)
"""
import sys
import json
import urllib.parse


def detect_source(url: str) -> str:
    host = urllib.parse.urlparse(url).hostname or ""
    # First-match-wins; order is a precedence hint for ambiguous hostnames.
    for h in ("lever", "ashby", "greenhouse", "workday"):
        if h in host:
            return h
    return "other"


def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1] == "--detect-source":
        print(json.dumps({"source_hint": detect_source(sys.argv[2])}))
        sys.exit(0)

    if len(sys.argv) != 2:
        print(json.dumps({"status": "fail", "error": "usage: scrapling_fetch.py [--detect-source] <url>"}))
        sys.exit(1)

    # Live fetch path
    url = sys.argv[1]
    try:
        from scrapling.fetchers import StealthyFetcher  # lazy import (keeps --detect-source stdlib-only)
        page = StealthyFetcher.fetch(
            url,
            headless=True,
            network_idle=True,
            solve_cloudflare=True,
            timeout=90000,
        )
    except ImportError as e:
        print(json.dumps({"status": "fail", "error": f"scrapling not installed: {e}", "url": url}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"status": "fail", "error": f"fetch error: {str(e)[:300]}", "url": url}))
        sys.exit(1)

    if getattr(page, "status", 200) >= 400:
        print(json.dumps({"status": "fail", "error": f"http {page.status}", "url": url}))
        sys.exit(1)

    title = (page.css("title::text").get() or "").strip()
    body = page.get_all_text(strip=True)

    if len(body) < 200:
        print(json.dumps({"status": "fail", "error": "body too short (<200 chars)", "url": url}))
        sys.exit(1)

    print(json.dumps({
        "status": "ok",
        "url": url,
        "title": title,
        "body": body,
        "source_hint": detect_source(url),
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
