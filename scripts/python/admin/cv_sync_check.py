#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

from scripts.python import CONFIG_DIR, PROJECT_ROOT


METRIC_RE = re.compile(r"\b\d{2,4}\+?\s*(hours?|%|evals?|layers?|tests?|fields?|bases?)\b", re.IGNORECASE)


def check_cv_sync(project_root: str | Path = PROJECT_ROOT, *, now: float | None = None) -> dict[str, list[str]]:
    root = Path(project_root)
    now = now if now is not None else time.time()
    warnings: list[str] = []
    errors: list[str] = []

    cv_path = root / "cv.md"
    if not cv_path.exists():
        errors.append("cv.md not found in project root. Create it with your CV in markdown format.")
    elif len(cv_path.read_text(encoding="utf-8").strip()) < 100:
        warnings.append("cv.md seems too short. Make sure it contains your full CV.")

    profile_path = root / "config/profile.yml"
    if not profile_path.exists():
        errors.append("config/profile.yml not found. Copy from config/profile.example.yml and fill in your details.")
    else:
        profile = profile_path.read_text(encoding="utf-8")
        for field in ["full_name", "email", "location"]:
            if field not in profile or '"Jane Smith"' in profile:
                warnings.append(f"config/profile.yml may still have example data. Check field: {field}")
                break

    for rel_path, name in [("modes/_shared.md", "_shared.md"), ("batch/batch-prompt.md", "batch-prompt.md")]:
        path = root / rel_path
        if not path.exists():
            continue
        for idx, line in enumerate(path.read_text(encoding="utf-8").split("\n"), start=1):
            if "NEVER hardcode" in line or "NUNCA hardcode" in line or line.startswith("#") or line.startswith("<!--"):
                continue
            match = METRIC_RE.search(line)
            if match:
                warnings.append(f'{name}:{idx} — Possible hardcoded metric: "{match.group(0)}". Should this be read from cv.md/article-digest.md?')

    digest = root / "article-digest.md"
    if digest.exists():
        days = (now - digest.stat().st_mtime) / (60 * 60 * 24)
        if days > 30:
            warnings.append(f"article-digest.md is {round(days)} days old. Consider updating if your projects have new metrics.")
    return {"errors": errors, "warnings": warnings}


def format_check(result: dict[str, list[str]]) -> str:
    lines = ["", "=== career-ops sync check ===", ""]
    if not result["errors"] and not result["warnings"]:
        lines.append("All checks passed.")
    else:
        if result["errors"]:
            lines.append(f"ERRORS ({len(result['errors'])}):")
            lines.extend(f"  ERROR: {item}" for item in result["errors"])
        if result["warnings"]:
            if result["errors"]:
                lines.append("")
            lines.append(f"WARNINGS ({len(result['warnings'])}):")
            lines.extend(f"  WARN: {item}" for item in result["warnings"])
    lines.append("")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate career-ops setup consistency.")
    parser.add_argument("--root", default=str(PROJECT_ROOT))
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = check_cv_sync(args.root)
    print(json.dumps(result, indent=2) if args.json else format_check(result))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
