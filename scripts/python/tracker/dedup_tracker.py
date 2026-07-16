#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from scripts.python.tracker.parse import parse_tracker_row, resolve_columns
from scripts.python.tracker.utils import rebuild_row, resolve_tracker_path


STATUS_RANK = {
    "skip": 0,
    "discarded": 0,
    "rejected": 1,
    "evaluated": 2,
    "applied": 3,
    "responded": 4,
    "interview": 5,
    "offer": 6,
    "no_aplicar": 0,
    "no aplicar": 0,
    "descartado": 0,
    "descartada": 0,
    "rechazado": 1,
    "rechazada": 1,
    "evaluada": 2,
    "aplicado": 3,
    "respondido": 4,
    "entrevista": 5,
    "oferta": 6,
}


@dataclass(frozen=True)
class DedupSummary:
    removed: int
    promoted: int


def normalize_company(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", str(name or "").lower().replace("(", "").replace(")", "")).strip()


def normalize_status(status: str) -> str:
    return re.sub(r"\s+\d{4}-\d{2}-\d{2}.*$", "", str(status or "").replace("**", "")).strip().lower()


def status_rank(status: str) -> int:
    return STATUS_RANK.get(normalize_status(status), 0)


def is_advanced_status(status: str) -> bool:
    return status_rank(status) >= STATUS_RANK["applied"]


def extract_report_num(report: str) -> int | None:
    match = re.search(r"\[(\d+)\]", str(report or ""))
    return int(match.group(1)) if match else None


def same_report_identity(a: dict[str, object], b: dict[str, object]) -> bool:
    if a["num"] == b["num"]:
        return True
    report_a = extract_report_num(str(a.get("report", "")))
    report_b = extract_report_num(str(b.get("report", "")))
    return report_a is not None and report_a == report_b


def normalize_role(role: str) -> str:
    return re.sub(r"\s+", " ", str(role or "")).strip().lower()


def role_match(a: dict[str, object], b: dict[str, object]) -> bool:
    if same_report_identity(a, b):
        return True
    if normalize_role(str(a.get("role", ""))) != normalize_role(str(b.get("role", ""))):
        return False
    return not (is_advanced_status(str(a.get("status", ""))) or is_advanced_status(str(b.get("status", ""))))


def parse_score(value: str) -> float:
    match = re.search(r"([\d.]+)", str(value or "").replace("**", ""))
    return float(match.group(1)) if match else 0.0


def within_blind_window(a: str, b: str, days: int = 90) -> bool:
    from datetime import date

    try:
        da = date.fromisoformat(str(a))
        db = date.fromisoformat(str(b))
    except ValueError:
        return False
    return abs((da - db).days) <= days


def dedup_tracker(tracker_path: str | Path | None = None, *, dry_run: bool = False, backup: bool = True) -> DedupSummary:
    apps_file = Path(tracker_path) if tracker_path else resolve_tracker_path()
    if not apps_file.exists():
        return DedupSummary(0, 0)
    lines = apps_file.read_text(encoding="utf-8").split("\n")
    colmap = resolve_columns(lines)
    entries: list[dict[str, object]] = []
    for idx, line in enumerate(lines):
        row = parse_tracker_row(line, colmap)
        if row and row.num > 0:
            entries.append({**row.__dict__, "line_idx": idx})

    blind_prefix = "\0blind-via:"
    groups: dict[str, list[dict[str, object]]] = {}
    for entry in entries:
        key = blind_prefix + normalize_company(str(entry.get("via", ""))) if str(entry.get("company", "")).strip() == "?" else normalize_company(str(entry.get("company", "")))
        groups.setdefault(key, []).append(entry)

    removed = promoted = 0
    lines_to_remove: set[int] = set()
    for key, group in groups.items():
        if len(group) < 2:
            continue
        is_blind = key.startswith(blind_prefix)
        processed: set[int] = set()
        for i, base in enumerate(group):
            if i in processed:
                continue
            cluster = [base]
            processed.add(i)
            for j in range(i + 1, len(group)):
                candidate = group[j]
                if j in processed:
                    continue
                if role_match(base, candidate) and (not is_blind or within_blind_window(str(base["date"]), str(candidate["date"]))):
                    cluster.append(candidate)
                    processed.add(j)
            if len(cluster) < 2:
                continue
            cluster.sort(key=lambda row: parse_score(str(row.get("score", ""))), reverse=True)
            keeper = cluster[0]
            best_status = max(cluster, key=lambda row: status_rank(str(row.get("status", ""))))["status"]
            if best_status != keeper["status"]:
                parts = [part.strip() for part in lines[int(keeper["line_idx"])].split("|")]
                parts[colmap["status"]] = str(best_status)
                lines[int(keeper["line_idx"])] = rebuild_row(parts)
                promoted += 1
            for duplicate in cluster[1:]:
                lines_to_remove.add(int(duplicate["line_idx"]))
                removed += 1

    for idx in sorted(lines_to_remove, reverse=True):
        lines.pop(idx)
    if removed and not dry_run:
        if backup:
            shutil.copyfile(apps_file, Path(str(apps_file) + ".bak"))
        apps_file.write_text("\n".join(lines), encoding="utf-8")
    return DedupSummary(removed, promoted)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Remove duplicate applications.md entries.")
    parser.add_argument("--tracker")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-backup", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    summary = dedup_tracker(args.tracker, dry_run=args.dry_run, backup=not args.no_backup)
    print(f"{summary.removed} duplicates removed")
    if args.dry_run:
        print("(dry-run — no changes written)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
