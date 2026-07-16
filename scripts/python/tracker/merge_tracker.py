#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
from dataclasses import dataclass
from pathlib import Path

from scripts.python import PROJECT_ROOT
from scripts.python.tracker.links import normalize_report_link
from scripts.python.tracker.parse import LEGACY_COLMAP, detect_columns, normalize_via, parse_tracker_row, resolve_score_status
from scripts.python.tracker.role_matcher import role_fuzzy_match
from scripts.python.tracker.utils import acquire_tracker_lock, cell, normalize_company, resolve_tracker_path, tracker_lock_dir_for, write_file_atomic


CANONICAL_STATES = ["Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP"]
REQ_NUMBER_RE = re.compile(
    r"\b(?:job\s*id|posting\s*id|requisition|req|jr|job|posting|ref(?:erence)?|r_)[\s:#_-]*([a-z][a-z0-9-]*\d[a-z0-9-]*|\d[a-z0-9-]*)\b",
    re.IGNORECASE,
)


@dataclass
class Addition:
    num: int
    date: str
    company: str
    role: str
    score: str
    status: str
    pdf: str
    report: str
    notes: str = ""
    via: str = ""
    location: str = ""


@dataclass(frozen=True)
class MergeSummary:
    added: int
    updated: int
    skipped: int
    files: int


def validate_status(status: str) -> str:
    clean = re.sub(r"\s+\d{4}-\d{2}-\d{2}.*$", "", str(status).replace("**", "")).strip()
    lower = clean.lower()
    for valid in CANONICAL_STATES:
        if valid.lower() == lower:
            return valid
    aliases = {
        "evaluada": "Evaluated",
        "condicional": "Evaluated",
        "hold": "Evaluated",
        "evaluar": "Evaluated",
        "verificar": "Evaluated",
        "aplicado": "Applied",
        "enviada": "Applied",
        "aplicada": "Applied",
        "applied": "Applied",
        "sent": "Applied",
        "respondido": "Responded",
        "entrevista": "Interview",
        "oferta": "Offer",
        "rechazado": "Rejected",
        "rechazada": "Rejected",
        "descartado": "Discarded",
        "descartada": "Discarded",
        "cerrada": "Discarded",
        "cancelada": "Discarded",
        "no aplicar": "SKIP",
        "no_aplicar": "SKIP",
        "skip": "SKIP",
        "monitor": "SKIP",
        "geo blocker": "SKIP",
    }
    if lower in aliases:
        return aliases[lower]
    if re.match(r"^(duplicado|dup|repost)", lower):
        return "Discarded"
    return "Evaluated"


def parse_score(value: str) -> float:
    match = re.search(r"([\d.]+)", str(value).replace("**", ""))
    return float(match.group(1)) if match else 0.0


def extract_report_num(report: str) -> int | None:
    match = re.search(r"\[(\d+)\]", str(report))
    return int(match.group(1)) if match else None


def extract_req_number(notes: str) -> str | None:
    match = REQ_NUMBER_RE.search(str(notes or ""))
    return match.group(1).upper() if match else None


def parse_extras(parts: list[str], filename: str) -> tuple[str, str] | None:
    extras = [part.strip() for part in parts[9:] if part.strip()]
    via_tags = [item for item in extras if re.match(r"^via=", item, re.IGNORECASE)]
    untagged = [item for item in extras if not re.match(r"^via=", item, re.IGNORECASE)]
    if len(via_tags) > 1 or len(untagged) > 1:
        print(f"Skipping {filename}: ambiguous extra fields")
        return None
    via = re.sub(r"^via=", "", via_tags[0], flags=re.IGNORECASE).strip() if via_tags else ""
    return via, (untagged[0] if untagged else "")


def parse_addition_content(content: str, filename: str) -> Addition | None:
    content = content.strip()
    if not content:
        return None
    if content.startswith("|"):
        parts = [part.strip() for part in content.split("|")]
        if parts and parts[0] == "":
            parts.pop(0)
        if parts and parts[-1] == "":
            parts.pop()
    else:
        parts = content.split("\t")
    if len(parts) < 8:
        print(f"Skipping malformed addition {filename}: {len(parts)} fields")
        return None
    resolved = resolve_score_status(parts[4].strip(), parts[5].strip())
    if not resolved:
        print(f"Skipping {filename}: cannot resolve score/status columns")
        return None
    extras = parse_extras(parts, filename)
    if extras is None:
        return None
    try:
        num = int(parts[0])
    except ValueError:
        return None
    if num == 0:
        return None
    return Addition(
        num=num,
        date=parts[1],
        company=parts[2],
        role=parts[3],
        score=resolved["score"].replace("**", "").strip(),
        status=validate_status(resolved["status"]),
        pdf=parts[6],
        report=parts[7],
        notes=parts[8] if len(parts) > 8 else "",
        via=extras[0],
        location=extras[1],
    )


def build_row(values: Addition, colmap: dict[str, int], *, num: int, status: str | None = None, pdf: str | None = None) -> str:
    cells = [str(num), values.date, cell(values.company)]
    if colmap.get("via") is not None:
        cells.append(cell(values.via) or "—")
    cells.append(cell(values.role))
    if colmap.get("location") is not None:
        cells.append(cell(values.location) or "—")
    cells.extend([values.score, status or values.status, pdf if pdf is not None else values.pdf, values.report, cell(values.notes)])
    return f"| {' | '.join(cells)} |"


def _insert_index(lines: list[str]) -> int:
    for idx, line in enumerate(lines):
        if line.startswith("|") and "---" in line:
            return idx + 1
    return len(lines)


def merge_tracker_additions(
    tracker_path: str | Path | None = None,
    additions_dir: str | Path | None = None,
    *,
    dry_run: bool = False,
) -> MergeSummary:
    apps_file = Path(tracker_path) if tracker_path else resolve_tracker_path()
    additions = Path(additions_dir or os.environ.get("CAREER_OPS_ADDITIONS", PROJECT_ROOT / "batch/tracker-additions"))
    merged_dir = additions / "merged"
    if not apps_file.exists() or not additions.exists():
        return MergeSummary(0, 0, 0, 0)

    tsv_files = sorted(
        [path for path in additions.iterdir() if path.suffix == ".tsv"],
        key=lambda p: (int(re.match(r"^(\d+)", p.name).group(1)) if re.match(r"^(\d+)", p.name) else 0, p.name),
    )
    if not tsv_files:
        return MergeSummary(0, 0, 0, 0)

    lock_dir = tracker_lock_dir_for(apps_file)
    with acquire_tracker_lock(lock_dir, tracker=apps_file):
        content = apps_file.read_text(encoding="utf-8")
        lines = content.split("\n")
        colmap = detect_columns(lines) or dict(LEGACY_COLMAP)
        tracker_dir = apps_file.parent
        reports_root = tracker_dir.parent if tracker_dir.name == "data" else tracker_dir
        rows = []
        used_numbers: set[int] = set()
        max_num = 0
        for idx, line in enumerate(lines):
            row = parse_tracker_row(line, colmap)
            if not row:
                continue
            row_dict = row.__dict__.copy()
            row_dict["line_idx"] = idx
            rows.append(row_dict)
            used_numbers.add(row.num)
            max_num = max(max_num, row.num)

        added = updated = skipped = 0
        new_lines: list[str] = []
        for path in tsv_files:
            addition = parse_addition_content(path.read_text(encoding="utf-8"), path.name)
            if not addition:
                skipped += 1
                continue
            if addition.via and colmap.get("via") is None:
                addition.via = ""
            addition.report = normalize_report_link(addition.report, tracker_dir, reports_root)
            report_num = extract_report_num(addition.report)
            norm_company = normalize_company(addition.company)
            duplicate = None
            if report_num is not None:
                duplicate = next((row for row in rows if extract_report_num(row["report"]) == report_num and normalize_company(row["company"]) == norm_company), None)
            if duplicate is None:
                duplicate = next((row for row in rows if row["num"] == addition.num and normalize_company(row["company"]) == norm_company), None)
            if duplicate is None:
                add_req = extract_req_number(addition.notes)
                for row in rows:
                    if normalize_company(row["company"]) != norm_company:
                        continue
                    if not role_fuzzy_match(addition.role, row["role"]):
                        continue
                    if (str(addition.company).strip() == "?" or str(row["company"]).strip() == "?") and normalize_via(addition.via) != normalize_via(row.get("via", "")):
                        continue
                    row_req = extract_req_number(row.get("notes", ""))
                    if add_req and row_req and add_req != row_req:
                        continue
                    duplicate = row
                    break

            if duplicate:
                if parse_score(addition.score) > parse_score(duplicate["score"]):
                    addition.notes = f"Re-eval {addition.date} ({parse_score(duplicate['score']):g}→{parse_score(addition.score):g}). {addition.notes}".strip()
                    addition.via = addition.via or duplicate.get("via", "") or "—"
                    addition.location = addition.location or duplicate.get("location", "") or "—"
                    lines[duplicate["line_idx"]] = build_row(addition, colmap, num=duplicate["num"], status=duplicate["status"], pdf=duplicate["pdf"])
                    duplicate.update({"score": addition.score, "report": addition.report, "role": addition.role, "company": addition.company})
                    updated += 1
                else:
                    skipped += 1
                continue

            entry_num = addition.num if addition.num > max_num and addition.num not in used_numbers else max_num + 1
            while entry_num in used_numbers:
                entry_num += 1
            used_numbers.add(entry_num)
            max_num = max(max_num, entry_num)
            new_line = build_row(addition, colmap, num=entry_num)
            new_lines.append(new_line)
            rows.append({**addition.__dict__, "num": entry_num, "line_idx": -1})
            added += 1

        if new_lines:
            lines[_insert_index(lines) : _insert_index(lines)] = new_lines

        if not dry_run:
            write_file_atomic(apps_file, "\n".join(lines))
            merged_dir.mkdir(parents=True, exist_ok=True)
            for path in tsv_files:
                path.replace(merged_dir / path.name)

    return MergeSummary(added, updated, skipped, len(tsv_files))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Merge batch tracker additions into applications.md.")
    parser.add_argument("--tracker")
    parser.add_argument("--additions")
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    summary = merge_tracker_additions(args.tracker, args.additions, dry_run=args.dry_run)
    print(f"Summary: +{summary.added} added, {summary.updated} updated, {summary.skipped} skipped")
    if args.dry_run:
        print("(dry-run — no changes written)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
