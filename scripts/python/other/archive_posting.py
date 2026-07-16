#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from scripts.python import PROJECT_ROOT


@dataclass(frozen=True)
class ArchiveOptions:
    target_url: str | None = None
    company: str | None = None
    role: str | None = None
    pipeline: bool = False
    dry_run: bool = False


def slugify(text: Any) -> str:
    value = str(text or "").lower()
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[\s_]+", "-", value)
    return re.sub(r"^-+|-+$", "", value)[:60]


def parse_page_title(title: Any) -> dict[str, str | None]:
    if not title:
        return {"company": None, "role": None}
    cleaned = re.sub(r"\s*[|–-]\s*(greenhouse|lever|ashby|workday|linkedin|indeed|wellfound|angellist)\s*$", "", str(title), flags=re.I).strip()
    at_match = re.match(r"^(.+?)\s+at\s+(.+)$", cleaned, flags=re.I)
    if at_match:
        return {"role": at_match.group(1).strip(), "company": at_match.group(2).strip()}
    pipe_match = re.match(r"^([^|–]+?)\s*[|–]\s*(.+)$", cleaned)
    if pipe_match:
        left, right = pipe_match.group(1).strip(), pipe_match.group(2).strip()
        role_keywords = re.compile(r"engineer|manager|director|analyst|scientist|designer|developer|lead|head|vp|president|officer|specialist|architect", re.I)
        if role_keywords.search(right):
            return {"company": left, "role": right}
        if role_keywords.search(left):
            return {"role": left, "company": right}
        return {"company": left, "role": right}
    dash_match = re.match(r"^(.+?)\s+-\s+(.+)$", cleaned)
    if dash_match:
        return {"role": dash_match.group(1).strip(), "company": dash_match.group(2).strip()}
    return {"company": None, "role": cleaned}


def extract_company_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    if not parsed.hostname:
        return None
    parts = [part for part in parsed.path.split("/") if part]
    host = parsed.hostname
    if host == "boards.greenhouse.io":
        return parts[0] if parts else None
    if re.match(r"^jobs\.(eu\.)?lever\.co$", host):
        return parts[0] if parts else None
    if host == "jobs.ashbyhq.com":
        return parts[0] if parts else None
    if host == "app.dover.io":
        return parts[0] if parts else None
    return None


def extract_pipeline_entries(content: str) -> list[dict[str, str | None]]:
    entries = []
    for line in str(content or "").splitlines():
        if not line.startswith("- [ ]"):
            continue
        match = re.search(r"https?://[^\s|)]+", line)
        if not match:
            continue
        parts = [part.strip() for part in line.split("|")]
        entries.append({"url": match.group(0), "company": parts[1] if len(parts) > 1 and parts[1] else None, "role": parts[2] if len(parts) > 2 and parts[2] else None})
    return entries


def output_names(company: str, role: str, *, today: str | None = None) -> dict[str, str]:
    stamp = today or date.today().isoformat()
    filename = f"{stamp}_{slugify(company)}_{slugify(role)}.pdf"
    return {"filename": filename, "reference": f"local:jds/{filename}", "path": f"jds/{filename}"}


def dry_run_archive(targets: list[dict[str, str | None]], *, override_company: str | None = None, override_role: str | None = None, today: str | None = None) -> list[dict[str, Any]]:
    results = []
    for target in targets:
        url = str(target.get("url") or "")
        company = override_company or target.get("company") or extract_company_from_url(url) or "unknown"
        role = override_role or target.get("role") or "job"
        names = output_names(company, role, today=today)
        results.append({"url": url, "company": company, "role": role, **names, "skipped": True})
    return results


def parse_args(argv: list[str]) -> ArchiveOptions:
    target_url = None
    company = None
    role = None
    pipeline = False
    dry_run = False
    idx = 0
    while idx < len(argv):
        arg = argv[idx]
        if arg == "--pipeline":
            pipeline = True
        elif arg == "--dry-run":
            dry_run = True
        elif arg.startswith("--company="):
            company = arg.split("=", 1)[1].strip()
        elif arg == "--company" and idx + 1 < len(argv):
            idx += 1
            company = argv[idx].strip()
        elif arg.startswith("--role="):
            role = arg.split("=", 1)[1].strip()
        elif arg == "--role" and idx + 1 < len(argv):
            idx += 1
            role = argv[idx].strip()
        elif not arg.startswith("--") and not target_url:
            target_url = arg
        idx += 1
    if not pipeline and not target_url:
        raise ValueError("No URL provided.")
    return ArchiveOptions(target_url=target_url, company=company, role=role, pipeline=pipeline, dry_run=dry_run)


def archive_targets(
    targets: list[dict[str, str | None]],
    *,
    root: str | Path = PROJECT_ROOT,
    override_company: str | None = None,
    override_role: str | None = None,
    dry_run: bool = False,
    today: str | None = None,
    renderer: Callable[[dict[str, str | None], Path], int] | None = None,
) -> list[dict[str, Any]]:
    if dry_run:
        return dry_run_archive(targets, override_company=override_company, override_role=override_role, today=today)
    if renderer is None:
        raise RuntimeError("PDF renderer is not configured. Use dry_run=True or pass a renderer.")
    results = []
    out_dir = Path(root) / "jds"
    out_dir.mkdir(parents=True, exist_ok=True)
    for target in targets:
        url = str(target.get("url") or "")
        company = override_company or target.get("company") or extract_company_from_url(url) or "unknown"
        role = override_role or target.get("role") or "job"
        names = output_names(company, role, today=today)
        output_path = Path(root) / names["path"]
        size = renderer(target, output_path)
        results.append({"url": url, "company": company, "role": role, **names, "size": size})
    return results


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Archive job posting metadata or dry-run filenames.")
    parser.add_argument("url", nargs="?")
    parser.add_argument("--company")
    parser.add_argument("--role")
    parser.add_argument("--pipeline", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.pipeline:
            pipeline = PROJECT_ROOT / "data/pipeline.md"
            targets = extract_pipeline_entries(pipeline.read_text(encoding="utf-8"))
        elif args.url:
            targets = [{"url": args.url, "company": None, "role": None}]
        else:
            raise ValueError("No URL provided.")
        results = archive_targets(targets, override_company=args.company, override_role=args.role, dry_run=args.dry_run)
    except Exception as error:
        print(json.dumps({"error": str(error)}, indent=2) if args.json else f"ERROR: {error}")
        return 1
    print(json.dumps(results, indent=2) if args.json else "\n".join(item["reference"] for item in results if item.get("reference")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
