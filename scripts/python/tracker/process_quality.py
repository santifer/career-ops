#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from scripts.python import DATA_DIR, PROJECT_ROOT


FRICTION_TAG_RE = re.compile(r"\[process-friction(?::\s*([^\]]+))?\]", re.IGNORECASE)


def _find_column(row: dict[str, Any], name: str) -> str:
    target = name.strip().lower()
    for key, value in (row or {}).items():
        if str(key).strip().lower() == target:
            return str(value if value is not None else "")
    return ""


def parse_active_interviews(content: Any) -> list[dict[str, str]]:
    if not isinstance(content, str) or not content.strip():
        return []

    lines = content.split("\n")

    def is_table_line(line: str) -> bool:
        return bool(re.match(r"^\s*\|.*\|\s*$", line))

    start_idx = next((idx for idx, line in enumerate(lines) if is_table_line(line)), -1)
    if start_idx == -1:
        return []

    table_lines: list[str] = []
    for line in lines[start_idx:]:
        if not is_table_line(line):
            break
        table_lines.append(line)
    if len(table_lines) < 2:
        return []

    def split_row(line: str) -> list[str]:
        return line.strip().removeprefix("|").removesuffix("|").split("|")

    def clean_cells(line: str) -> list[str]:
        return [cell.strip() for cell in split_row(line)]

    def is_separator(cells: list[str]) -> bool:
        return all(re.match(r"^:?-+:?$", cell) for cell in cells)

    header = clean_cells(table_lines[0])
    if not header:
        return []
    col_count = len(header)
    rows: list[dict[str, str]] = []
    for line in table_lines[1:]:
        cells = clean_cells(line)
        if is_separator(cells):
            continue
        if len(cells) != col_count:
            continue
        rows.append({column: cells[idx] for idx, column in enumerate(header)})
    return rows


def extract_friction(row: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(row, dict):
        return {"hasFriction": False, "reason": ""}
    notes = _find_column(row, "notes")
    match = FRICTION_TAG_RE.search(notes)
    if not match:
        return {"hasFriction": False, "reason": ""}
    return {"hasFriction": True, "reason": (match.group(1) or "").strip()}


def aggregate_process_quality(rows: Any, min_threshold: int | float = 1) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    threshold = min_threshold if isinstance(min_threshold, (int, float)) and min_threshold >= 0 else 1
    by_company: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        company = _find_column(row, "company").strip()
        if not company:
            continue
        key = company.lower()
        entry = by_company.setdefault(key, {"company": company, "total": 0, "frictionCount": 0, "reasons": []})
        entry["total"] += 1
        friction = extract_friction(row)
        if friction["hasFriction"]:
            entry["frictionCount"] += 1
            if friction["reason"]:
                entry["reasons"].append(friction["reason"])

    results = [
        {
            "company": entry["company"],
            "totalInterviews": entry["total"],
            "frictionCount": entry["frictionCount"],
            "frictionRate": round(entry["frictionCount"] / entry["total"], 2) if entry["total"] else 0,
            "reasons": entry["reasons"],
        }
        for entry in by_company.values()
        if entry["total"] >= threshold
    ]
    return sorted(results, key=lambda item: (-item["frictionCount"], -item["frictionRate"], item["company"]))


def load_active_interviews(path: str | Path | None = None) -> list[dict[str, str]]:
    active_path = Path(path) if path else (DATA_DIR / "active-interviews.md" if (DATA_DIR / "active-interviews.md").exists() else PROJECT_ROOT / "active-interviews.md")
    if not active_path.exists():
        return []
    return parse_active_interviews(active_path.read_text(encoding="utf-8"))


def print_summary(signals: list[dict[str, Any]], min_threshold: int) -> None:
    print("\n" + "=" * 78)
    print("  Process Quality Signal — career-ops")
    print(f"  min threshold: {min_threshold} interview(s) | companies: {len(signals)}")
    print("=" * 78 + "\n")
    if not signals:
        print("  No process-friction signal found (or no companies met the threshold).\n")
        return
    print("  " + "Company".ljust(26) + "Interviews".ljust(12) + "Friction".ljust(10) + "Rate")
    print("  " + "-" * 70)
    for signal in signals:
        print(
            "  "
            + str(signal["company"])[:24].ljust(26)
            + str(signal["totalInterviews"]).ljust(12)
            + str(signal["frictionCount"]).ljust(10)
            + f"{round(signal['frictionRate'] * 100)}%"
        )
        for reason in signal["reasons"]:
            print(f"      -> {reason}")
    print("")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Aggregate recruiting-process friction tags.")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--min-threshold", type=int, default=1)
    parser.add_argument("--file")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    min_threshold = args.min_threshold if args.min_threshold >= 0 else 1
    rows = load_active_interviews(args.file)
    signals = aggregate_process_quality(rows, min_threshold)
    if args.summary:
        print_summary(signals, min_threshold)
    else:
        print(
            json.dumps(
                {
                    "metadata": {
                        "minThreshold": min_threshold,
                        "totalRows": len(rows),
                        "companies": len(signals),
                    },
                    "signals": signals,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

