#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import yaml

from scripts.python import CONFIG_DIR
from scripts.python.scanner.scan import builtin_providers, provider_fetch, provider_id, resolve_provider


DEFAULT_PORTALS_PATH = CONFIG_DIR / "portals.yml"
SLUG_SUFFIXES = ["ai", "tech", "io", "hq", "labs"]
ERROR_KIND_LABEL = {
    "slug_gone": "slug not found",
    "auth": "auth blocked",
    "network": "network error",
    "server": "server error",
    "unknown": "unresolved",
}


def greenhouse_probe_url(slug: str, *, eu: bool = False) -> str:
    return f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"


def ashby_probe_url(slug: str, *, eu: bool = False) -> str:
    return f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true"


def lever_probe_url(slug: str, *, eu: bool = False) -> str:
    return f"https://api.{'eu.' if eu else ''}lever.co/v0/postings/{slug}"


ATS = {
    "greenhouse": {
        "probe_url": greenhouse_probe_url,
        "job_count": lambda payload: len(payload["jobs"]) if isinstance(payload, dict) and isinstance(payload.get("jobs"), list) else None,
    },
    "ashby": {
        "probe_url": ashby_probe_url,
        "job_count": lambda payload: len(payload["jobs"]) if isinstance(payload, dict) and isinstance(payload.get("jobs"), list) else None,
    },
    "lever": {
        "probe_url": lever_probe_url,
        "job_count": lambda payload: len(payload) if isinstance(payload, list) else None,
    },
}


def parse_ats_slug(url: Any) -> dict[str, Any] | None:
    text = str(url or "")
    parsed = None
    try:
        parsed = urlparse(text)
    except Exception:
        parsed = None
    host = parsed.hostname if parsed else None
    path = parsed.path if parsed else ""
    host_patterns = [
        ("lever", "api.eu.lever.co", re.compile(r"^/v0/postings/([^/?#]+)"), True),
        ("lever", "jobs.eu.lever.co", re.compile(r"^/([^/?#]+)"), True),
        ("lever", "api.lever.co", re.compile(r"^/v0/postings/([^/?#]+)"), False),
        ("lever", "jobs.lever.co", re.compile(r"^/([^/?#]+)"), False),
    ]
    for ats, expected_host, regex, eu in host_patterns:
        if host != expected_host:
            continue
        match = regex.search(path)
        if match:
            result = {"ats": ats, "slug": match.group(1)}
            if eu:
                result["eu"] = True
            return result

    text_patterns = [
        ("greenhouse", re.compile(r"boards-api\.greenhouse\.io/v1/boards/([^/?#]+)"), False),
        ("greenhouse", re.compile(r"job-boards(?:\.eu)?\.greenhouse\.io/([^/?#]+)"), False),
        ("greenhouse", re.compile(r"boards\.greenhouse\.io/([^/?#]+)"), False),
        ("ashby", re.compile(r"api\.ashbyhq\.com/posting-api/job-board/([^/?#]+)"), False),
        ("ashby", re.compile(r"jobs\.ashbyhq\.com/([^/?#]+)"), False),
    ]
    for ats, regex, eu in text_patterns:
        match = regex.search(text)
        if match:
            result = {"ats": ats, "slug": match.group(1)}
            if eu:
                result["eu"] = True
            return result
    return None


def derive_slug_candidates(name: str) -> list[str]:
    lower = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", str(name or "").lower())).strip()
    if not lower:
        return []
    words = [word for word in lower.split(" ") if word]
    if not words:
        return []
    candidates = ["" .join(words), "-".join(words), "_".join(words), words[0]]
    for base in ["" .join(words), words[0]]:
        if not base:
            continue
        candidates.extend([f"{base}{suffix}" for suffix in SLUG_SUFFIXES])
        candidates.extend([f"{base}.tech", f"{base}.io"])
    seen: set[str] = set()
    output: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in seen:
            seen.add(candidate)
            output.append(candidate)
    return output


def classify_fetch_error(error: Any) -> str:
    if error is None:
        return "unknown"
    status = getattr(error, "status", None)
    if status is None:
        status = getattr(error, "code", None)
    message = str(getattr(error, "message", "") or error)
    if "AbortError" in str(getattr(error, "name", "")):
        return "network"
    if re.search(r"ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network", message, re.I):
        return "network"
    if status in {404, 410} or re.search(r"HTTP (404|410)", message):
        return "slug_gone"
    if status in {401, 403} or re.search(r"HTTP (401|403)", message):
        return "auth"
    if isinstance(status, int) and status >= 500 or re.search(r"HTTP 5\d\d", message):
        return "server"
    return "unknown"


class FetchError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def default_fetch_json(url: str) -> Any:
    request = urllib.request.Request(url, headers={"user-agent": "career-ops-verify-portals/1.0", "accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as error:
        raise FetchError(f"HTTP {error.code}", error.code) from error


def default_fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"user-agent": "career-ops-verify-portals/1.0", "accept": "text/plain,text/markdown,application/xml,*/*"})
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        raise FetchError(f"HTTP {error.code}", error.code) from error


def probe_slug(
    ats: str,
    slug: str,
    *,
    fetch_json: Callable[[str], Any] = default_fetch_json,
    eu: bool = False,
) -> dict[str, Any]:
    spec = ATS.get(ats)
    if not spec:
        return {"ats": ats, "slug": slug, "url": "", "status": "missing", "errorKind": "unknown", "reason": f"unknown ATS: {ats}"}
    url = spec["probe_url"](slug, eu=eu)
    try:
        payload = fetch_json(url)
        count = spec["job_count"](payload)
        if count is None:
            return {
                "ats": ats,
                "slug": slug,
                "url": url,
                "status": "missing",
                "errorKind": "unknown",
                "reason": "unexpected response shape",
            }
        return {"ats": ats, "slug": slug, "url": url, "status": "live" if count > 0 else "empty", "jobCount": count}
    except Exception as error:
        return {
            "ats": ats,
            "slug": slug,
            "url": url,
            "status": "missing",
            "errorKind": classify_fetch_error(error),
            "httpStatus": getattr(error, "status", None),
            "reason": str(error),
        }


def discover_alternates(name: str, *, fetch_json: Callable[[str], Any]) -> dict[str, Any] | None:
    best_empty = None
    for slug in derive_slug_candidates(name):
        for ats in ATS:
            variants = [False, True] if ats == "lever" else [False]
            for eu in variants:
                result = probe_slug(ats, slug, fetch_json=fetch_json, eu=eu)
                if result["status"] == "live":
                    return result
                if result["status"] == "empty" and best_empty is None:
                    best_empty = result
    return best_empty


def verify_companies(
    companies: list[dict[str, Any]] | Any,
    *,
    fetch_json: Callable[[str], Any] = default_fetch_json,
    fetch_text: Callable[[str], str] = default_fetch_text,
    providers: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    provider_map = providers if providers is not None else builtin_providers(fetch_json=fetch_json, fetch_text=fetch_text)
    results: list[dict[str, Any]] = []
    for company in companies if isinstance(companies, list) else []:
        if not isinstance(company, dict) or company.get("enabled") is False:
            continue
        name = company.get("name") if isinstance(company.get("name"), str) else "(unnamed)"
        match = parse_ats_slug(company.get("api")) or parse_ats_slug(company.get("careers_url"))
        if match:
            probe = probe_slug(match["ats"], match["slug"], fetch_json=fetch_json, eu=match.get("eu") is True)
            if probe["status"] in {"live", "empty"}:
                results.append({"name": name, **probe})
                continue
            if probe.get("errorKind") in {"slug_gone", "unknown"}:
                suggested = discover_alternates(name, fetch_json=fetch_json)
                if suggested:
                    results.append({"name": name, **probe, "suggested": suggested})
                    continue
            results.append({"name": name, **probe})
            continue

        resolved = resolve_provider(company, provider_map)
        if not resolved:
            results.append({"name": name, "status": "skipped", "reason": "no provider matched careers_url or api"})
            continue
        if resolved.get("error"):
            results.append({"name": name, "status": "skipped", "reason": resolved["error"]})
            continue
        provider = resolved["provider"]
        try:
            jobs = provider_fetch(provider, company, {})
            results.append({"name": name, "provider": provider_id(provider), "status": "live" if jobs else "empty", "jobCount": len(jobs)})
        except Exception as error:
            results.append(
                {
                    "name": name,
                    "provider": provider_id(provider),
                    "status": "missing",
                    "errorKind": classify_fetch_error(error),
                    "httpStatus": getattr(error, "status", None),
                    "reason": str(error),
                }
            )
    return results


def verify_portals_file(
    file_path: str | Path,
    *,
    fetch_json: Callable[[str], Any] = default_fetch_json,
    fetch_text: Callable[[str], str] = default_fetch_text,
    providers: dict[str, Any] | None = None,
) -> dict[str, Any]:
    path = Path(file_path)
    if not path.exists():
        return {"found": False, "results": []}
    config = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    companies = config.get("tracked_companies") if isinstance(config, dict) else []
    return {"found": True, "results": verify_companies(companies, fetch_json=fetch_json, fetch_text=fetch_text, providers=providers)}


def summarize_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    live = sum(1 for item in results if item.get("status") == "live")
    empty = sum(1 for item in results if item.get("status") == "empty")
    missing = [item for item in results if item.get("status") == "missing"]
    skipped = sum(1 for item in results if item.get("status") == "skipped")
    kind_counts = {kind: 0 for kind in ERROR_KIND_LABEL}
    for item in missing:
        kind = item.get("errorKind") if item.get("errorKind") in ERROR_KIND_LABEL else "unknown"
        kind_counts[kind] += 1
    return {"live": live, "empty": empty, "missing": len(missing), "skipped": skipped, "errorKinds": kind_counts}


def format_results(results: list[dict[str, Any]]) -> str:
    icon = {"live": "OK", "empty": "EMPTY", "missing": "MISS", "skipped": "SKIP"}
    lines: list[str] = []
    for item in results:
        status = item.get("status")
        source = f"{item.get('ats')}/{item.get('slug')}" if item.get("ats") else item.get("provider", "?")
        if status == "live":
            detail = f"{source} ({item.get('jobCount')} live)"
        elif status == "empty":
            detail = f"{source} (live but empty)"
        elif status == "missing":
            detail = f"{source} ({ERROR_KIND_LABEL.get(item.get('errorKind'), 'unresolved')}) — {item.get('reason', 'unresolved')}"
            if item.get("suggested"):
                detail += f" -> try {item['suggested']['ats']}/{item['suggested']['slug']}"
        else:
            detail = item.get("reason", "")
        lines.append(f"  {icon.get(status, '?')} {item.get('name')} — {detail}")
    summary = summarize_results(results)
    breakdown = ", ".join(
        f"{count} {ERROR_KIND_LABEL[kind]}" for kind, count in summary["errorKinds"].items() if count
    )
    lines.append(
        f"\n{summary['live']} live, {summary['empty']} live-but-empty, "
        f"{summary['missing']} unresolved{f' ({breakdown})' if breakdown else ''}, "
        f"{summary['skipped']} no-provider (skipped)"
    )
    return "\n".join(lines)


def run_add(name: str, *, fetch_json: Callable[[str], Any] = default_fetch_json) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for slug in derive_slug_candidates(name):
        for ats in ATS:
            result = probe_slug(ats, slug, fetch_json=fetch_json)
            if result["status"] != "missing":
                hits.append(result)
    return hits


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate ATS slugs in portals.yml.")
    parser.add_argument("--file", default=str(DEFAULT_PORTALS_PATH))
    parser.add_argument("--add")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.add:
        hits = run_add(args.add)
        print(json.dumps({"hits": hits}, indent=2) if args.json else format_results([{"name": args.add, **hit} for hit in hits]))
        return 0 if hits else 1
    result = verify_portals_file(args.file)
    if args.json:
        print(json.dumps(result, indent=2))
    elif not result["found"]:
        print(f"verify-portals: no portals file at {Path(args.file).resolve(strict=False)} — nothing to verify.")
    else:
        print(f"verify-portals: {Path(args.file).resolve(strict=False)}\n")
        print(format_results(result["results"]))
    missing = [item for item in result["results"] if item.get("status") == "missing"]
    return 1 if args.strict and missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
