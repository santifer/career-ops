#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from scripts.python import DATA_DIR
from scripts.python.tracker.parse import parse_tracker_row, resolve_columns
from scripts.python.tracker.role_matcher import role_fuzzy_match
from scripts.python.tracker.utils import resolve_tracker_path


def norm_num(value: Any) -> str:
    return re.sub(r"^0+(?=\d)", "", str(value if value is not None else "").strip())


def clean_status(value: str) -> str:
    return re.sub(r"\(?\d{4}-\d{2}-\d{2}\)?", "", str(value if value is not None else "").replace("**", "")).strip()


@dataclass(frozen=True)
class LookupRow:
    trackerNum: int
    date: str
    company: str
    role: str
    score: str
    status: str
    reportNum: str | None
    reportPath: str | None
    pdfPath: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return asdict(self)


def parse_tracker_rows(text: str) -> list[LookupRow]:
    lines = str(text if text is not None else "").split("\n")
    colmap = resolve_columns(lines)
    rows: list[LookupRow] = []
    for line in lines:
        row = parse_tracker_row(line, colmap)
        if not row:
            continue
        match = re.search(r"\[(\d+)\]\(([^)]+)\)", row.report)
        rows.append(
            LookupRow(
                trackerNum=row.num,
                date=row.date,
                company=row.company,
                role=row.role,
                score=row.score,
                status=clean_status(row.status),
                reportNum=norm_num(match.group(1)) if match else None,
                reportPath=re.sub(r"^(?:\.\./)+", "", match.group(2)) if match else None,
            )
        )
    return rows


def parse_pdf_index(text: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for line in str(text if text is not None else "").split("\n"):
        if not line.strip() or line.startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) >= 2 and fields[0].strip() and fields[1]:
            mapping[norm_num(fields[0])] = fields[1]
    return mapping


def find_matches(rows: list[LookupRow], query: str, pdf_index: dict[str, str] | None = None) -> list[LookupRow]:
    q = str(query if query is not None else "").strip()
    if not q:
        return []
    pdfs = pdf_index or {}
    if q.isdigit():
        nq = norm_num(q)
        hits = [row for row in rows if str(row.trackerNum) == nq or row.reportNum == nq]
    else:
        lowered = q.lower()
        hits = [
            row
            for row in rows
            if lowered in row.company.lower()
            or lowered in row.role.lower()
            or role_fuzzy_match(row.company, q)
            or role_fuzzy_match(row.role, q)
        ]
    return [
        LookupRow(**{**asdict(row), "pdfPath": pdfs.get(row.reportNum or "")})
        for row in hits
    ]


def _print_table(matches: list[LookupRow]) -> None:
    headers = ["Tracker#", "Report#", "Company", "Role", "Status", "PDF", "Report"]
    table = [
        [
            str(row.trackerNum),
            row.reportNum or "—",
            row.company,
            row.role,
            row.status or "—",
            row.pdfPath or "—",
            row.reportPath or "—",
        ]
        for row in matches
    ]
    widths = [max(len(header), *(len(row[idx]) for row in table)) for idx, header in enumerate(headers)]

    def fmt(cells: list[str]) -> str:
        return "  ".join(cell.ljust(widths[idx]) for idx, cell in enumerate(cells)).rstrip()

    print(fmt(headers))
    print(fmt(["-" * width for width in widths]))
    for row in table:
        print(fmt(row))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Resolve a tracker query to its full career-ops identity.")
    parser.add_argument("query", nargs="+")
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument("--tracker")
    parser.add_argument("--pdf-index", default=str(DATA_DIR / "pdf-index.tsv"))
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    query = " ".join(args.query).strip()
    tracker_path = Path(args.tracker) if args.tracker else resolve_tracker_path()
    if not tracker_path.exists():
        print(f"Error: {tracker_path} not found — nothing to search.", file=sys.stderr)
        return 1

    rows = parse_tracker_rows(tracker_path.read_text(encoding="utf-8"))
    pdf_path = Path(args.pdf_index)
    pdf_index = parse_pdf_index(pdf_path.read_text(encoding="utf-8")) if pdf_path.exists() else {}
    matches = find_matches(rows, query, pdf_index)

    if args.json_output:
        print(json.dumps([row.to_json_dict() for row in matches], ensure_ascii=False, indent=2))
        return 0 if matches else 1
    if not matches:
        print(f'No application matches "{query}" — try a report #, tracker #, or company fragment.')
        return 1
    _print_table(matches)
    print(f"\n{len(matches)} match(es)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
