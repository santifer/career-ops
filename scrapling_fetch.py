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

    # Live fetch path (filled in Task 3)
    print(json.dumps({"status": "fail", "error": "live fetch not yet implemented"}))
    sys.exit(1)


if __name__ == "__main__":
    main()
