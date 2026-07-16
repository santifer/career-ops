#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from scripts.python.tracker.parse import parse_tracker_row, resolve_columns
from scripts.python.tracker.utils import rebuild_row, resolve_tracker_path


CANONICAL = [
    "Evaluated",
    "Applied",
    "Responded",
    "Interview",
    "Offer",
    "Hired",
    "Rejected",
    "Discarded",
    "SKIP",
]


@dataclass(frozen=True)
class NormalizeResult:
    status: str | None
    move_to_notes: str | None = None
    unknown: bool = False


def normalize_status(raw: str) -> NormalizeResult:
    original = str(raw if raw is not None else "")
    status = original.replace("**", "").strip()
    lower = status.lower()

    if re.match(r"^duplicado", status, flags=re.IGNORECASE) or re.match(r"^dup\b", status, flags=re.IGNORECASE):
        return NormalizeResult("Discarded", original.strip())
    if re.match(r"^repost", status, flags=re.IGNORECASE):
        return NormalizeResult("Discarded", original.strip())
    if re.match(r"^cerrada$", status, flags=re.IGNORECASE):
        return NormalizeResult("Discarded")
    if re.match(r"^cancelada", status, flags=re.IGNORECASE):
        return NormalizeResult("Discarded")
    if re.match(r"^descartad[ao]$", status, flags=re.IGNORECASE):
        return NormalizeResult("Discarded")
    if re.match(r"^rechazad[ao]$", status, flags=re.IGNORECASE):
        return NormalizeResult("Rejected")
    if re.match(r"^rechazado\s+\d{4}", status, flags=re.IGNORECASE):
        return NormalizeResult("Rejected")
    if re.match(r"^aplicado\s+\d{4}", status, flags=re.IGNORECASE):
        return NormalizeResult("Applied")
    if re.match(r"^(condicional|hold|evaluar|verificar)$", status, flags=re.IGNORECASE):
        return NormalizeResult("Evaluated")
    if re.match(r"^monitor$", status, flags=re.IGNORECASE):
        return NormalizeResult("SKIP")
    if re.search(r"geo.?blocker", status, flags=re.IGNORECASE):
        return NormalizeResult("SKIP")
    if status in {"—", "-", ""}:
        return NormalizeResult("Discarded")

    for canonical in CANONICAL:
        if lower == canonical.lower():
            return NormalizeResult(canonical)

    aliases = {
        "evaluada": "Evaluated",
        "aplicado": "Applied",
        "enviada": "Applied",
        "aplicada": "Applied",
        "applied": "Applied",
        "sent": "Applied",
        "respondido": "Responded",
        "entrevista": "Interview",
        "oferta": "Offer",
        "contratado": "Hired",
        "contratada": "Hired",
        "hired": "Hired",
        "accepted": "Hired",
        "accept": "Hired",
        "cerrada": "Discarded",
        "descartada": "Discarded",
        "no aplicar": "SKIP",
        "no_aplicar": "SKIP",
        "skip": "SKIP",
    }
    if lower in aliases:
        return NormalizeResult(aliases[lower])
    return NormalizeResult(None, unknown=True)


@dataclass(frozen=True)
class NormalizeSummary:
    changes: int
    unknowns: list[dict[str, object]]


def normalize_tracker_statuses(
    tracker_path: str | Path | None = None,
    *,
    dry_run: bool = False,
    backup: bool = True,
) -> NormalizeSummary:
    apps_file = Path(tracker_path) if tracker_path else resolve_tracker_path()
    if not apps_file.exists():
        return NormalizeSummary(changes=0, unknowns=[])

    lines = apps_file.read_text(encoding="utf-8").split("\n")
    colmap = resolve_columns(lines)
    changes = 0
    unknowns: list[dict[str, object]] = []

    for idx, line in enumerate(lines):
        row = parse_tracker_row(line, colmap)
        if not row:
            continue
        result = normalize_status(row.status)
        if result.unknown:
            unknowns.append({"num": row.num, "rawStatus": row.status, "line": idx + 1})
            continue
        if result.status == row.status:
            continue

        parts = [part.strip() for part in line.split("|")]
        required_width = max(colmap["status"], colmap.get("notes", 0), colmap.get("score", 0))
        while len(parts) <= required_width:
            parts.append("")
        parts[colmap["status"]] = result.status or ""

        notes_idx = colmap.get("notes")
        if result.move_to_notes and notes_idx is not None:
            existing = parts[notes_idx] if notes_idx < len(parts) else ""
            if result.move_to_notes not in existing:
                parts[notes_idx] = result.move_to_notes + (f". {existing}" if existing else "")

        score_idx = colmap.get("score")
        if score_idx is not None and score_idx < len(parts):
            parts[score_idx] = parts[score_idx].replace("**", "")

        lines[idx] = rebuild_row(parts)
        changes += 1

    if changes and not dry_run:
        if backup:
            shutil.copyfile(apps_file, Path(str(apps_file) + ".bak"))
        apps_file.write_text("\n".join(lines), encoding="utf-8")
    return NormalizeSummary(changes=changes, unknowns=unknowns)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Normalize career-ops tracker statuses.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--tracker")
    parser.add_argument("--no-backup", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    tracker = Path(args.tracker) if args.tracker else None
    summary = normalize_tracker_statuses(tracker, dry_run=args.dry_run, backup=not args.no_backup)
    if summary.unknowns:
        print(f"\n{len(summary.unknowns)} unknown statuses:")
        for unknown in summary.unknowns:
            print(f"  #{unknown['num']} (line {unknown['line']}): \"{unknown['rawStatus']}\"")
    print(f"\n{summary.changes} statuses normalized")
    if args.dry_run:
        print("(dry-run — no changes written)")
    elif summary.changes:
        print("Written to applications.md")
    else:
        print("No changes needed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

