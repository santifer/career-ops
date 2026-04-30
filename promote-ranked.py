#!/usr/bin/env python3
"""
promote-ranked.py -- promote selected ranked pipeline rows to the tracker.

Edit output/pipeline-ranked.csv and set Apply to one of:
  yes, y, x, true, 1, apply, evaluated  -> tracker status Evaluated
  applied, sent                         -> tracker status Applied

This script never submits applications. It uses the existing TSV merge flow,
marks selected pipeline rows as processed, merges into data/applications.md,
exports output/applications.csv, and re-ranks the remaining pipeline.
"""

from __future__ import annotations

import argparse
import csv
import re
import subprocess
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RANKED_CSV = ROOT / "output" / "pipeline-ranked.csv"
PIPELINE = ROOT / "data" / "pipeline.md"
APPLICATIONS = ROOT / "data" / "applications.md"
ADDITIONS = ROOT / "batch" / "tracker-additions"

EVALUATED_MARKERS = {"yes", "y", "x", "true", "1", "apply", "evaluated"}
APPLIED_MARKERS = {"applied", "sent"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Promote checked pipeline-ranked rows into the application tracker.")
    parser.add_argument("--csv", default=str(RANKED_CSV), help="Ranked CSV path. Default: output/pipeline-ranked.csv")
    parser.add_argument("--apply", action="store_true", help="Write changes. Without this flag, preview only.")
    parser.add_argument("--status", choices=["Evaluated", "Applied"], default=None, help="Override status for all selected rows.")
    parser.add_argument("--limit", default="30", help="Limit used when regenerating output/pipeline-ranked.*")
    return parser.parse_args()


def read_rows(csv_path: Path) -> list[dict[str, str]]:
    if not csv_path.exists():
        raise SystemExit(f"Missing {csv_path}. Run npm run rank first.")
    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if rows and "Apply" not in rows[0]:
        raise SystemExit('Missing "Apply" column. Run npm run rank to regenerate output/pipeline-ranked.csv.')
    return rows


def selected_rows(rows: list[dict[str, str]], status_override: str | None) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    for row in rows:
        marker = (row.get("Apply") or "").strip().lower()
        if not marker:
            continue
        if marker in EVALUATED_MARKERS:
            row["_status"] = status_override or "Evaluated"
        elif marker in APPLIED_MARKERS:
            row["_status"] = status_override or "Applied"
        else:
            print(f"Skipping {row.get('Company', '')} | {row.get('Role', '')}: unknown Apply value {marker!r}")
            continue
        selected.append(row)
    return selected


def next_tracker_number() -> int:
    max_num = 0
    if APPLICATIONS.exists():
        for line in APPLICATIONS.read_text(encoding="utf-8").splitlines():
            parts = [part.strip() for part in line.split("|")]
            if len(parts) > 2:
                try:
                    max_num = max(max_num, int(parts[1]))
                except ValueError:
                    pass
    return max_num + 1


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned[:60] or "role"


def markdown_escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ").strip()


def make_tsv(row: dict[str, str], num: int) -> str:
    company = row.get("Company", "").strip()
    role = row.get("Role", "").strip()
    priority = row.get("Priority Score", "").strip()
    tier = row.get("Tier", "").strip()
    url = row.get("URL", "").strip()
    status = row["_status"]
    notes = f"Promoted from ranked pipeline"
    if priority or tier:
        notes += f" ({priority} {tier})."
    else:
        notes += "."
    if url:
        notes += f" URL: {url}"

    fields = [
        str(num),
        date.today().isoformat(),
        company,
        role,
        status,
        "N/A",
        "",
        "",
        notes,
    ]
    return "\t".join(markdown_escape(field) for field in fields) + "\n"


def write_additions(rows: list[dict[str, str]]) -> list[Path]:
    ADDITIONS.mkdir(parents=True, exist_ok=True)
    num = next_tracker_number()
    written: list[Path] = []
    for row in rows:
        company = row.get("Company", "")
        role = row.get("Role", "")
        path = ADDITIONS / f"{num:03d}-{slug(company)}-{slug(role)}.tsv"
        path.write_text(make_tsv(row, num), encoding="utf-8")
        written.append(path)
        num += 1
    return written


def mark_pipeline_processed(rows: list[dict[str, str]]) -> int:
    if not PIPELINE.exists():
        return 0

    selected_urls = {row.get("URL", "").strip() for row in rows if row.get("URL", "").strip()}
    if not selected_urls:
        return 0

    changed = 0
    lines = PIPELINE.read_text(encoding="utf-8").splitlines()
    new_lines = []
    for line in lines:
        if line.startswith("- [ ] "):
            url = line.replace("- [ ] ", "", 1).split("|", 1)[0].strip()
            if url in selected_urls:
                line = line.replace("- [ ] ", "- [x] ", 1)
                changed += 1
        new_lines.append(line)

    PIPELINE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    return changed


def run_node(script: str, *args: str) -> None:
    subprocess.run(["node", script, *args], cwd=ROOT, check=True)


def main() -> None:
    args = parse_args()
    csv_path = Path(args.csv)
    if not csv_path.is_absolute():
        csv_path = ROOT / csv_path

    rows = read_rows(csv_path)
    selected = selected_rows(rows, args.status)

    if not selected:
        print("No rows selected. Set Apply=yes or Apply=applied in output/pipeline-ranked.csv.")
        return

    print(f"Selected {len(selected)} row(s):")
    for row in selected:
        print(f"  - {row['_status']}: {row.get('Company', '')} | {row.get('Role', '')}")

    if not args.apply:
        print("\nPreview only. Re-run with --apply to update tracker and pipeline files.")
        return

    written = write_additions(selected)
    changed = mark_pipeline_processed(selected)

    print(f"\nWrote {len(written)} tracker addition TSV(s).")
    print(f"Marked {changed} pipeline row(s) as processed.")

    run_node("merge-tracker.mjs", "--verify")
    run_node("export-tracker.mjs")
    run_node("pipeline-ranker.mjs", "--limit", args.limit)

    print("\nDone. Review data/applications.md and output/applications.csv before taking action.")


if __name__ == "__main__":
    main()
