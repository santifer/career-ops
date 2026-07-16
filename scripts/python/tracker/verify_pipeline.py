#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass, field
from pathlib import Path

from scripts.python import PROJECT_ROOT, REPORTS_DIR, TEMPLATES_DIR
from scripts.python.tracker.parse import parse_tracker_row, resolve_columns
from scripts.python.tracker.utils import resolve_tracker_path


CANONICAL_STATUSES = {"evaluated", "applied", "responded", "interview", "offer", "rejected", "discarded", "skip", "hired"}
ALIASES = {
    "evaluada": "evaluated",
    "condicional": "evaluated",
    "hold": "evaluated",
    "evaluar": "evaluated",
    "verificar": "evaluated",
    "aplicado": "applied",
    "enviada": "applied",
    "aplicada": "applied",
    "applied": "applied",
    "sent": "applied",
    "respondido": "responded",
    "entrevista": "interview",
    "oferta": "offer",
    "rechazado": "rejected",
    "rechazada": "rejected",
    "descartado": "discarded",
    "descartada": "discarded",
    "cerrada": "discarded",
    "cancelada": "discarded",
    "no aplicar": "skip",
    "no_aplicar": "skip",
    "monitor": "skip",
    "geo blocker": "skip",
    "contratado": "hired",
    "contratada": "hired",
    "hired": "hired",
    "accepted": "hired",
    "accept": "hired",
}
REPORT_FILE_RE = re.compile(r"^(\d+)-(.+)-\d{4}-\d{2}-\d{2}\.md$")


@dataclass
class VerifyResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _extract_report_role(content: str) -> str | None:
    fence = re.search(r"##\s*Machine Summary\s*\n+```(?:yaml|yml|json)?\s*\n([\s\S]*?)\n```", content, re.IGNORECASE)
    if fence:
        match = re.search(r"^role:\s*[\"']?(.+?)[\"']?\s*$", fence.group(1), re.MULTILINE)
        if match and match.group(1).strip():
            return match.group(1).strip()
    title = next((line for line in content.splitlines() if line.startswith("# ")), "")
    parts = re.split(r"[—–]", title)
    return parts[-1].strip() if len(parts) >= 2 and parts[-1].strip() else None


def verify_pipeline(
    tracker_path: str | Path | None = None,
    *,
    reports_dir: str | Path | None = None,
    additions_dir: str | Path | None = None,
) -> VerifyResult:
    apps_file = Path(tracker_path) if tracker_path else resolve_tracker_path()
    reports_path = Path(reports_dir or REPORTS_DIR)
    additions_path = Path(additions_dir or PROJECT_ROOT / "batch/tracker-additions")
    result = VerifyResult()
    if not apps_file.exists():
        return result

    content = apps_file.read_text(encoding="utf-8")
    lines = content.split("\n")
    colmap = resolve_columns(lines)
    max_idx = max(colmap.values())
    rows = [row for line in lines if (row := parse_tracker_row(line, colmap))]

    for row in rows:
        status = re.sub(r"\s+\d{4}-\d{2}-\d{2}.*$", "", row.status.replace("**", "").strip().lower())
        if status not in CANONICAL_STATUSES and status not in ALIASES:
            result.errors.append(f"#{row.num}: Non-canonical status \"{row.status}\"")
        if "**" in row.status:
            result.errors.append(f"#{row.num}: Status contains markdown bold")
        if re.search(r"\d{4}-\d{2}-\d{2}", row.status):
            result.errors.append(f"#{row.num}: Status contains date")

        score = row.score.replace("**", "").strip()
        if not re.match(r"^\d+\.?\d*/5$", score) and score not in {"N/A", "DUP"}:
            result.errors.append(f"#{row.num}: Invalid score format \"{row.score}\"")
        if "**" in row.score:
            result.warnings.append(f"#{row.num}: Score has markdown bold")

        link_match = re.search(r"\]\(([^)]+)\)", row.report)
        if link_match:
            link = link_match.group(1)
            if not (apps_file.parent / link).exists() and not (PROJECT_ROOT / link).exists():
                result.errors.append(f"#{row.num}: Report not found: {link}")

    seen: dict[str, list[object]] = {}
    for row in rows:
        key = f"{_normalize_key(row.company)}::{re.sub(r'[^a-z0-9 ]', '', row.role.lower())}"
        seen.setdefault(key, []).append(row)
    for group in seen.values():
        if len(group) > 1:
            result.warnings.append(f"Possible duplicates: {', '.join(f'#{row.num}' for row in group)}")

    for line in lines:
        if not line.startswith("|") or "---" in line or "Empresa" in line:
            continue
        if len(line.split("|")) <= max_idx:
            result.errors.append(f"Row with too few columns: {line[:80]}")

    if additions_path.exists():
        pending = [path for path in additions_path.iterdir() if path.suffix == ".tsv"]
        if pending:
            result.warnings.append(f"{len(pending)} pending TSVs in tracker-additions/")

    report_files = [path for path in reports_path.iterdir() if REPORT_FILE_RE.match(path.name)] if reports_path.exists() else []
    reports_by_role: dict[str, list[str]] = {}
    for path in report_files:
        match = REPORT_FILE_RE.match(path.name)
        role = _extract_report_role(path.read_text(encoding="utf-8")) if path.exists() else None
        if not match or not role:
            continue
        reports_by_role.setdefault(f"{_normalize_key(match.group(2))}::{_normalize_key(role)}", []).append(path.name)
    for group in reports_by_role.values():
        if len(group) > 1:
            result.warnings.append(f"Duplicate reports for same company+role: {', '.join(group)}")

    referenced_nums: set[int] = set()
    for row in rows:
        referenced_nums.add(row.num)
        link_text = re.search(r"\[(\d+)\]", row.report)
        if link_text:
            referenced_nums.add(int(link_text.group(1)))
        link_target = re.search(r"\]\(([^)]+)\)", row.report)
        if link_target:
            target_name = link_target.group(1).split("/")[-1]
            prefix = re.match(r"^(\d+)-", target_name)
            if prefix:
                referenced_nums.add(int(prefix.group(1)))
    for path in report_files:
        num = int(REPORT_FILE_RE.match(path.name).group(1))  # type: ignore[union-attr]
        if num not in referenced_nums:
            result.warnings.append(f"Orphan report: reports/{path.name}")

    nums: dict[int, list[object]] = {}
    for row in rows:
        nums.setdefault(row.num, []).append(row)
    for num, group in nums.items():
        if len(group) > 1:
            result.errors.append(f"Duplicate tracker number #{num}")

    if TEMPLATES_DIR.joinpath("states.yml").exists():
        text = TEMPLATES_DIR.joinpath("states.yml").read_text(encoding="utf-8")
        for state in CANONICAL_STATUSES - {"hired"}:
            if f"id: {state}" not in text:
                result.warnings.append(f"states.yml missing canonical id: {state}")
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check career-ops pipeline integrity.")
    parser.add_argument("--tracker")
    parser.add_argument("--reports")
    parser.add_argument("--additions")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = verify_pipeline(args.tracker, reports_dir=args.reports, additions_dir=args.additions)
    for message in result.errors:
        print(f"ERROR: {message}")
    for message in result.warnings:
        print(f"WARN: {message}")
    print(f"Pipeline Health: {len(result.errors)} errors, {len(result.warnings)} warnings")
    return 1 if result.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
