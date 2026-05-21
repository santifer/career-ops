#!/usr/bin/env python3
"""
scan-indeed.py — Indeed Ireland job scanner using Scrapling.

Searches ie.indeed.com (Ireland) for configured queries, applies title
filters from portals.yml, deduplicates against scan-history.tsv +
pipeline.md + applications.md, and appends new offers to pipeline.md +
scan-history.tsv.

Uses Scrapling Fetcher to bypass Cloudflare bot protection.
Fallback: swap to StealthyFetcher or CloakBrowser if Indeed upgrades
detection (see modes/_shared.md escalation ladder).

Usage:
    python3 scan-indeed.py                # scan all queries
    python3 scan-indeed.py --dry-run      # preview without writing
    python3 scan-indeed.py --pages 3      # scan up to 3 pages per query

Dependencies:
    pip install scrapling pyyaml
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path

import yaml
from scrapling import Fetcher

# ── Config ───────────────────────────────────────────────────────────

ROOT = Path(__file__).parent
PORTALS_PATH = ROOT / "portals.yml"
SCAN_HISTORY_PATH = ROOT / "data" / "scan-history.tsv"
PIPELINE_PATH = ROOT / "data" / "pipeline.md"
APPLICATIONS_PATH = ROOT / "data" / "applications.md"
BASE_URL = "https://ie.indeed.com"


def load_portals():
    with open(PORTALS_PATH) as f:
        return yaml.safe_load(f)


def load_seen_urls():
    """Load all URLs already in scan-history, pipeline, and applications."""
    seen = set()
    if SCAN_HISTORY_PATH.exists():
        for line in SCAN_HISTORY_PATH.read_text().splitlines()[1:]:
            parts = line.split("\t")
            if parts:
                seen.add(parts[0])
    if PIPELINE_PATH.exists():
        for line in PIPELINE_PATH.read_text().splitlines():
            m = re.search(r"https?://\S+", line)
            if m:
                seen.add(m.group(0).rstrip("|").strip())
    if APPLICATIONS_PATH.exists():
        for line in APPLICATIONS_PATH.read_text().splitlines():
            m = re.search(r"https?://\S+", line)
            if m:
                seen.add(m.group(0).rstrip("|").strip())
    return seen


def build_title_filter(portals):
    """Build filter function from portals.yml title_filter."""
    tf = portals.get("title_filter", {})
    positive = [k.lower() for k in tf.get("positive", [])]
    negative = [k.lower() for k in tf.get("negative", [])]

    def matches(title):
        lower = title.lower()
        has_pos = not positive or any(k in lower for k in positive)
        has_neg = any(k in lower for k in negative)
        return has_pos and not has_neg

    return matches


def get_indeed_queries(portals):
    """Extract Indeed-specific search queries from portals.yml."""
    queries = portals.get("indeed_queries", [])
    if not queries:
        # Fallback: build from title_filter positive keywords
        tf = portals.get("title_filter", {})
        keywords = tf.get("positive", [])
        # Pick the most specific ones for Indeed search
        priority = [
            "Technical Account Manager",
            "Customer Success Engineer",
            "Solutions Architect",
            "AI Engineer",
            "Customer Engineer",
            "Support Engineer",
        ]
        queries = []
        for kw in priority:
            if any(kw.lower() in p.lower() for p in keywords):
                queries.append({"query": kw, "location": "Dublin", "enabled": True})
        if not queries and keywords:
            queries = [{"query": keywords[0], "location": "Dublin", "enabled": True}]
    return [q for q in queries if q.get("enabled", True)]


def _first(selector_list):
    """Return first element from a css selector result or None."""
    return selector_list[0] if selector_list else None


def scrape_indeed_page(fetcher, query, location, page=0):
    """Scrape a single Indeed search results page. Returns list of jobs."""
    start = page * 10
    url = f"{BASE_URL}/jobs?q={query.replace(' ', '+')}&l={location.replace(' ', '+')}&start={start}"
    try:
        resp = fetcher.get(url)
    except Exception as e:
        print(f"  ⚠️  Failed to fetch: {e}", file=sys.stderr)
        return []

    if resp.status != 200:
        print(f"  ⚠️  HTTP {resp.status} for {url}", file=sys.stderr)
        return []

    jobs = []
    cards = resp.css("div.job_seen_beacon") or resp.css("div.jobsearch-ResultsList > div")

    for card in cards:
        # Extract title
        title_el = _first(card.css("h2.jobTitle a span")) or _first(card.css("h2 a span"))
        if not title_el:
            continue
        title = title_el.text.strip()

        # Extract link
        link_el = _first(card.css("h2.jobTitle a")) or _first(card.css("h2 a"))
        if not link_el:
            continue
        href = link_el.attrib.get("href", "")
        if href.startswith("/"):
            jk_match = re.search(r"jk=([a-f0-9]+)", href)
            if jk_match:
                job_url = f"{BASE_URL}/viewjob?jk={jk_match.group(1)}"
            else:
                job_url = f"{BASE_URL}{href}"
        elif href.startswith("http"):
            job_url = href
        else:
            continue

        # Extract company
        company_el = _first(card.css("span[data-testid='company-name']")) or _first(card.css("span.companyName"))
        company = company_el.text.strip() if company_el else "Unknown"

        # Extract location
        loc_el = _first(card.css("div[data-testid='text-location']")) or _first(card.css("div.companyLocation"))
        loc = loc_el.text.strip() if loc_el else ""

        jobs.append({
            "title": title,
            "url": job_url,
            "company": company,
            "location": loc,
        })

    return jobs


def main():
    parser = argparse.ArgumentParser(description="Scan Indeed Ireland for jobs")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--pages", type=int, default=2, help="Pages per query (default: 2)")
    args = parser.parse_args()

    # Ensure data dir exists
    (ROOT / "data").mkdir(exist_ok=True)

    portals = load_portals()
    seen_urls = load_seen_urls()
    title_filter = build_title_filter(portals)
    queries = get_indeed_queries(portals)

    if not queries:
        print("❌ No Indeed queries configured. Add indeed_queries to portals.yml.")
        sys.exit(1)

    fetcher = Fetcher(auto_match=False)
    today = date.today().isoformat()

    all_found = []
    new_jobs = []
    skipped_title = 0
    skipped_dup = 0

    print(f"🔍 Indeed Ireland Scanner — {today}")
    print(f"   Queries: {len(queries)} | Pages/query: {args.pages}")
    print("━" * 50)

    for q in queries:
        query_text = q["query"]
        location = q.get("location", "Dublin")
        print(f"\n📋 \"{query_text}\" in {location}")

        for page in range(args.pages):
            jobs = scrape_indeed_page(fetcher, query_text, location, page)
            if not jobs:
                break
            all_found.extend(jobs)
            print(f"   Page {page + 1}: {len(jobs)} results")

    # Deduplicate within results
    seen_in_run = set()
    unique_jobs = []
    for job in all_found:
        if job["url"] not in seen_in_run:
            seen_in_run.add(job["url"])
            unique_jobs.append(job)

    # Apply filters
    for job in unique_jobs:
        if job["url"] in seen_urls:
            skipped_dup += 1
            continue
        if not title_filter(job["title"]):
            skipped_title += 1
            # Record in history as skipped
            if not args.dry_run:
                if not SCAN_HISTORY_PATH.exists():
                    SCAN_HISTORY_PATH.write_text("url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n")
                with open(SCAN_HISTORY_PATH, "a") as f:
                    f.write(f"{job['url']}\t{today}\tindeed-ie\t{job['title']}\t{job['company']}\tskipped_title\n")
            continue
        new_jobs.append(job)

    # Summary
    print(f"\n{'━' * 50}")
    print("📊 Results:")
    print(f"   Found: {len(unique_jobs)} unique")
    print(f"   Filtered by title: {skipped_title}")
    print(f"   Already seen: {skipped_dup}")
    print(f"   New to pipeline: {len(new_jobs)}")

    if new_jobs:
        print(f"\n✅ New offers:")
        for job in new_jobs:
            print(f"   + {job['company']} | {job['title']}")

    if args.dry_run:
        print("\n⚠️  Dry run — no files written.")
        return

    # Write to pipeline.md
    if new_jobs:
        # Ensure pipeline.md exists
        if not PIPELINE_PATH.exists():
            PIPELINE_PATH.write_text("# Pipeline - Pending URLs\n\n\n## Pendientes\n\n")

        with open(PIPELINE_PATH, "a") as f:
            for job in new_jobs:
                f.write(f"- [ ] {job['url']} | {job['company']} | {job['title']}\n")

        # Write to scan-history.tsv
        # Ensure header exists
        if not SCAN_HISTORY_PATH.exists():
            SCAN_HISTORY_PATH.write_text("url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n")

        with open(SCAN_HISTORY_PATH, "a") as f:
            for job in new_jobs:
                f.write(f"{job['url']}\t{today}\tindeed-ie\t{job['title']}\t{job['company']}\tadded\n")

    print(f"\n→ Run /career-ops pipeline to evaluate new offers.")


if __name__ == "__main__":
    main()
