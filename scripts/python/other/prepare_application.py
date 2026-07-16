#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from scripts.python import CONFIG_DIR, OUTPUT_DIR, PROJECT_ROOT


ALLOWED_HOSTS = {
    "boards.greenhouse.io",
    "greenhouse.io",
    "jobs.ashbyhq.com",
    "ashbyhq.com",
    "jobs.lever.co",
    "jobs.eu.lever.co",
    "lever.co",
}
SAFE_SLUG_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


@dataclass(frozen=True)
class AtsDetection:
    ats: str
    companySlug: str
    jobId: str


@dataclass(frozen=True)
class CoverLetter:
    text: str
    wordCount: int
    path: str


def detect_ats(apply_url: str) -> AtsDetection | None:
    parsed = urlparse(apply_url)
    host = parsed.hostname or ""
    path = parsed.path
    if parsed.scheme != "https" or host not in ALLOWED_HOSTS:
        return None

    if host in {"boards.greenhouse.io", "greenhouse.io"}:
        match = re.match(r"^/([^/]+)/jobs/(\d+)", path)
        if match and SAFE_SLUG_RE.match(match.group(1)):
            return AtsDetection("greenhouse", match.group(1), match.group(2))

    segment = re.match(r"^/([^/]+)/([^/?#]+)", path)
    if segment and host in {"jobs.ashbyhq.com", "ashbyhq.com"}:
        company, job_id = segment.group(1), segment.group(2)
        if SAFE_SLUG_RE.match(company) and SAFE_SLUG_RE.match(job_id):
            return AtsDetection("ashby", company, job_id)

    if segment and host in {"jobs.lever.co", "jobs.eu.lever.co", "lever.co"}:
        company, job_id = segment.group(1), segment.group(2)
        if SAFE_SLUG_RE.match(company) and SAFE_SLUG_RE.match(job_id):
            return AtsDetection("lever", company, job_id)
    return None


def validate_apply_url(apply_url: str) -> None:
    parsed = urlparse(apply_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"invalid URL: {apply_url}")
    if parsed.scheme != "https":
        raise ValueError(f"URL must use https (got {parsed.scheme}:)")
    if (parsed.hostname or "") not in ALLOWED_HOSTS:
        raise ValueError(f'"{parsed.hostname}" is not a supported ATS host')
    if not detect_ats(apply_url):
        raise ValueError(f"URL not recognized as Greenhouse, Ashby, or Lever: {apply_url}")


def validate_pdf_path(pdf_path: str | Path, root: str | Path = PROJECT_ROOT, output_dir: str | Path = OUTPUT_DIR) -> Path:
    root_path = Path(root)
    output_path = Path(output_dir).resolve(strict=False)
    candidate = (root_path / pdf_path).resolve(strict=False) if not Path(pdf_path).is_absolute() else Path(pdf_path).resolve(strict=False)
    try:
        candidate.relative_to(output_path)
    except ValueError as exc:
        raise ValueError(f"--pdf must point to a file inside output/ (got {pdf_path})") from exc
    if not candidate.exists():
        raise FileNotFoundError(f"PDF not found at {pdf_path}")
    if not candidate.is_file():
        raise ValueError(f"{pdf_path} is not a file")
    return candidate


def read_profile(profile_path: str | Path = CONFIG_DIR / "profile.yml") -> dict[str, str]:
    path = Path(profile_path)
    if not path.exists():
        return {"firstName": "", "lastName": "", "email": "", "phone": "", "location": "", "linkedin": "", "portfolioUrl": ""}
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raw = {}
    full_name = str(raw.get("full_name") or raw.get("name") or "").strip()
    first, *rest = full_name.split()
    return {
        "firstName": first or "",
        "lastName": " ".join(rest),
        "email": str(raw.get("email") or "").strip(),
        "phone": str(raw.get("phone") or "").strip(),
        "location": str(raw.get("location") or "").strip(),
        "linkedin": str(raw.get("linkedin") or "").strip(),
        "portfolioUrl": str(raw.get("portfolio_url") or raw.get("portfolioUrl") or "").strip(),
    }


def read_cover(cover_path: str | Path | None, root: str | Path = PROJECT_ROOT) -> CoverLetter | None:
    if not cover_path:
        return None
    path = (Path(root) / cover_path).resolve(strict=False) if not Path(cover_path).is_absolute() else Path(cover_path).resolve(strict=False)
    if not path.exists() or not path.is_file():
        return None
    text = path.read_text(encoding="utf-8").strip()
    return CoverLetter(text=text, wordCount=len([word for word in text.split() if word]), path=str(cover_path))


def build_greenhouse_fields(profile: dict[str, str], cover: CoverLetter | None, pdf_file: str) -> list[tuple[str, str]]:
    fields: list[tuple[str, str] | None] = [
        ("first_name", profile["firstName"]),
        ("last_name", profile["lastName"]),
        ("email", profile["email"]),
        ("phone", profile["phone"]),
        ("resume", f"{pdf_file}  <- attach this file"),
        ("cover_letter", f"{cover.wordCount} words — {cover.text[:80].replace(chr(10), ' ')}…") if cover else None,
        ("linkedin_profile", profile["linkedin"]) if profile.get("linkedin") else None,
        ("website", profile["portfolioUrl"]) if profile.get("portfolioUrl") else None,
    ]
    return [field for field in fields if field is not None]


def build_ashby_fields(profile: dict[str, str], cover: CoverLetter | None, pdf_file: str) -> list[tuple[str, str]]:
    fields: list[tuple[str, str] | None] = [
        ("firstName", profile["firstName"]),
        ("lastName", profile["lastName"]),
        ("email", profile["email"]),
        ("phone", profile["phone"]),
        ("resume", f"{pdf_file}  <- attach this file"),
        ("coverLetter", f"({cover.wordCount} words — paste from cover file)") if cover else None,
        ("linkedInUrl", profile["linkedin"]) if profile.get("linkedin") else None,
    ]
    return [field for field in fields if field is not None]


def build_lever_fields(profile: dict[str, str], cover: CoverLetter | None, pdf_file: str) -> list[tuple[str, str]]:
    fields: list[tuple[str, str] | None] = [
        ("name", f"{profile['firstName']} {profile['lastName']}".strip()),
        ("email", profile["email"]),
        ("phone", profile["phone"]),
        ("resume", f"{pdf_file}  <- attach this file"),
        ("comments", f"({cover.wordCount} words — paste from cover file)") if cover else None,
        ("urls[LinkedIn]", profile["linkedin"]) if profile.get("linkedin") else None,
        ("urls[Portfolio]", profile["portfolioUrl"]) if profile.get("portfolioUrl") else None,
    ]
    return [field for field in fields if field is not None]


def build_fields(ats: str, profile: dict[str, str], cover: CoverLetter | None, pdf_file: str) -> list[tuple[str, str]]:
    if ats == "greenhouse":
        return build_greenhouse_fields(profile, cover, pdf_file)
    if ats == "ashby":
        return build_ashby_fields(profile, cover, pdf_file)
    if ats == "lever":
        return build_lever_fields(profile, cover, pdf_file)
    raise ValueError(f"Unsupported ATS: {ats}")


def prepare_application_summary(
    apply_url: str,
    pdf_path: str | Path,
    *,
    cover_path: str | Path | None = None,
    profile_path: str | Path = CONFIG_DIR / "profile.yml",
    root: str | Path = PROJECT_ROOT,
    output_dir: str | Path = OUTPUT_DIR,
) -> dict[str, Any]:
    validate_apply_url(apply_url)
    detected = detect_ats(apply_url)
    if detected is None:
        raise ValueError(f"URL not recognized as Greenhouse, Ashby, or Lever: {apply_url}")
    pdf = validate_pdf_path(pdf_path, root, output_dir)
    profile = read_profile(profile_path)
    cover = read_cover(cover_path, root)
    fields = build_fields(detected.ats, profile, cover, pdf.name)
    return {
        "ats": detected.ats,
        "companySlug": detected.companySlug,
        "jobId": detected.jobId,
        "url": apply_url,
        "pdf": {"file": pdf.name, "sizeKb": round(pdf.stat().st_size / 1024, 1)},
        "cover": None if cover is None else {"path": cover.path, "wordCount": cover.wordCount},
        "fields": [{"key": key, "value": value or "(not set — check config/profile.yml)"} for key, value in fields],
    }


def format_summary(summary: dict[str, Any]) -> str:
    label = summary["ats"].capitalize()
    fields = [(field["key"], field["value"]) for field in summary["fields"]]
    width = max([len(key) for key, _ in fields] or [0]) + 2
    lines = [f"\n-- {label} · {summary['companySlug']} · job {summary['jobId']} --------------------", ""]
    for key, value in fields:
        lines.append(f"  {key.ljust(width)}{value}")
    lines.append(f"\n  PDF     {summary['pdf']['file']} ({summary['pdf']['sizeKb']} KB)")
    if summary.get("cover"):
        lines.append(f"  Cover   {summary['cover']['path']} ({summary['cover']['wordCount']} words)")
    lines.extend(["", "-- Next step --------------------------------------", f"  Open:   {summary['url']}", "  Fill the form using the values above, attach the PDF, then submit.", ""])
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prepare ATS application form values without submitting anything.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--cover")
    parser.add_argument("--profile", default=str(CONFIG_DIR / "profile.yml"))
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        summary = prepare_application_summary(args.url, args.pdf, cover_path=args.cover, profile_path=args.profile)
    except Exception as exc:
        print(f"Error: {exc}")
        return 1
    print(json.dumps(summary, ensure_ascii=False, indent=2) if args.json else format_summary(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
