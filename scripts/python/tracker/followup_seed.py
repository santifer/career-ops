#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from scripts.python import DATA_DIR, PROJECT_ROOT
from scripts.python.tracker.followup_cadence import (
    add_days,
    normalize_status,
    parse_applied_date,
    parse_date,
    parse_next_overrides,
    resolve_cadence_config,
)
from scripts.python.tracker.parse import parse_tracker_row, resolve_columns
from scripts.python.tracker.utils import acquire_tracker_lock, write_file_atomic


FOLLOWUPS_HEADER = "\n".join(
    [
        "# Follow-ups",
        "",
        "| num | appNum | date | company | role | channel | contact | notes |",
        "|---|---|---|---|---|---|---|---|",
    ]
)


class SeedError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def today_str() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).date().isoformat()


def is_valid_calendar_date(value: str) -> bool:
    return isinstance(value, str) and parse_date(value) is not None and parse_date(value).isoformat() == value


def resolve_applied_date(row: dict[str, Any], explicit_date: str | None = None) -> str:
    if explicit_date:
        return explicit_date
    notes_date = parse_applied_date(row.get("notes"))
    if notes_date:
        if not is_valid_calendar_date(notes_date):
            raise SeedError("INVALID_DATE", f'Application #{row.get("num", "?")} notes carry an impossible "Applied {notes_date}" date; fix the notes or pass --date')
        return notes_date
    return today_str()


def format_pin_line(app_num: int, next_date: str, set_date: str) -> str:
    return f"- next #{app_num} {next_date} (set {set_date})"


def read_tracker_rows(tracker_path: str | Path) -> list[dict[str, Any]]:
    lines = Path(tracker_path).read_text(encoding="utf-8").split("\n")
    colmap = resolve_columns(lines)
    rows = []
    for line in lines:
        row = parse_tracker_row(line, colmap)
        if row:
            rows.append(row.__dict__.copy())
    return rows


def has_followup_table_row(content: str, app_num: int) -> bool:
    for line in str(content or "").split("\n"):
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 8:
            continue
        try:
            row_app_num = int(parts[2])
        except ValueError:
            continue
        if row_app_num == app_num:
            return True
    return False


def is_already_seeded(content: str | None, app_num: int) -> bool:
    if not content:
        return False
    return app_num in parse_next_overrides(content) or has_followup_table_row(content, app_num)


def append_pins(existing_content: str | None, pin_lines: list[str]) -> str:
    joined = "\n".join(pin_lines)
    if existing_content is None:
        return f"{FOLLOWUPS_HEADER}\n{joined}\n"
    return existing_content + ("" if existing_content.endswith("\n") else "\n") + joined + "\n"


def default_tracker_path() -> Path:
    if os.environ.get("CAREER_OPS_TRACKER"):
        return Path(os.environ["CAREER_OPS_TRACKER"])
    return PROJECT_ROOT / "data/applications.md" if (PROJECT_ROOT / "data/applications.md").exists() else PROJECT_ROOT / "applications.md"


def default_followups_path() -> Path:
    return Path(os.environ.get("CAREER_OPS_FOLLOWUPS", DATA_DIR / "follow-ups.md"))


def followups_lock_dir(path: str | Path) -> Path:
    if os.environ.get("CAREER_OPS_FOLLOWUPS_LOCK"):
        return Path(os.environ["CAREER_OPS_FOLLOWUPS_LOCK"])
    import hashlib

    key = hashlib.sha256(str(Path(path).resolve(strict=False)).encode("utf-8")).hexdigest()[:16]
    return Path(tempfile.gettempdir()).resolve() / f"career-ops-followups-{key}.lock"


def _plan_pin(row: dict[str, Any], *, explicit_date: str | None, profile_path: str | Path | None) -> dict[str, Any]:
    applied_date = resolve_applied_date(row, explicit_date)
    cadence = resolve_cadence_config(profile_path)
    next_date = add_days(applied_date, cadence["applied_first"])
    set_date = today_str()
    return {
        "appNum": row["num"],
        "pin": format_pin_line(row["num"], next_date, set_date),
        "nextDate": next_date,
        "appliedDate": applied_date,
        "setDate": set_date,
    }


def seed_followup(
    app_num: int,
    *,
    date: str | None = None,
    force: bool = False,
    dry_run: bool = False,
    tracker_path: str | Path | None = None,
    followups_path: str | Path | None = None,
    profile_path: str | Path | None = None,
    lock_dir: str | Path | None = None,
) -> dict[str, Any]:
    if not isinstance(app_num, int) or app_num <= 0:
        raise SeedError("USAGE", f"Invalid appNum: {app_num}")
    if date is not None and not is_valid_calendar_date(date):
        raise SeedError("INVALID_DATE", f"--date must be a real calendar date in YYYY-MM-DD form: {date}")

    tracker = Path(tracker_path) if tracker_path else default_tracker_path()
    followups = Path(followups_path) if followups_path else default_followups_path()
    if not tracker.exists():
        raise SeedError("ROW_NOT_FOUND", f"Tracker not found at {tracker}")
    rows = read_tracker_rows(tracker)
    row = next((item for item in rows if item["num"] == app_num), None)
    if not row:
        raise SeedError("ROW_NOT_FOUND", f"Application #{app_num} not found in {tracker}")
    if normalize_status(row.get("status", "")) != "applied" and not force:
        raise SeedError("NOT_APPLIED", f'Application #{app_num} is not Applied (status: "{row.get("status", "").strip()}"); use --force to seed anyway')

    plan = _plan_pin(row, explicit_date=date, profile_path=profile_path)
    if dry_run:
        existing = followups.read_text(encoding="utf-8") if followups.exists() else ""
        if is_already_seeded(existing, app_num) and not force:
            return {"seeded": False, "appNum": app_num, "pin": None, "reason": "already-seeded", "dryRun": True, **{k: plan[k] for k in ("nextDate", "appliedDate", "setDate")}}
        return {"seeded": True, "dryRun": True, **plan}

    lock = acquire_tracker_lock(
        Path(lock_dir) if lock_dir else followups_lock_dir(followups),
        timeout_seconds=float(os.environ.get("CAREER_OPS_FOLLOWUPS_LOCK_TIMEOUT_MS", "60000")) / 1000,
        retry_seconds=float(os.environ.get("CAREER_OPS_FOLLOWUPS_LOCK_RETRY_MS", "75")) / 1000,
        stale_seconds=float(os.environ.get("CAREER_OPS_FOLLOWUPS_LOCK_STALE_MS", "600000")) / 1000,
        tracker=followups,
    )
    try:
        existing = followups.read_text(encoding="utf-8") if followups.exists() else None
        if existing is not None and is_already_seeded(existing, app_num) and not force:
            return {"seeded": False, "appNum": app_num, "pin": None, "reason": "already-seeded", **{k: plan[k] for k in ("nextDate", "appliedDate", "setDate")}}
        followups.parent.mkdir(parents=True, exist_ok=True)
        write_file_atomic(followups, append_pins(existing, [plan["pin"]]))
        return {"seeded": True, **plan}
    finally:
        lock.release()


def seed_backfill(
    *,
    force: bool = False,
    dry_run: bool = False,
    tracker_path: str | Path | None = None,
    followups_path: str | Path | None = None,
    profile_path: str | Path | None = None,
    lock_dir: str | Path | None = None,
) -> dict[str, Any]:
    tracker = Path(tracker_path) if tracker_path else default_tracker_path()
    followups = Path(followups_path) if followups_path else default_followups_path()
    if not tracker.exists():
        raise SeedError("ROW_NOT_FOUND", f"Tracker not found at {tracker}")
    rows = [row for row in read_tracker_rows(tracker) if normalize_status(row.get("status", "")) == "applied"]

    def plan_for(row: dict[str, Any]) -> dict[str, Any]:
        return _plan_pin(row, explicit_date=None, profile_path=profile_path)

    if dry_run:
        existing = followups.read_text(encoding="utf-8") if followups.exists() else ""
        seeded: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []
        for row in rows:
            if is_already_seeded(existing, row["num"]) and not force:
                skipped.append({"appNum": row["num"], "reason": "already-seeded"})
                continue
            try:
                seeded.append({**plan_for(row), "dryRun": True})
            except SeedError as exc:
                if exc.code == "INVALID_DATE":
                    skipped.append({"appNum": row["num"], "reason": "invalid-notes-date", "detail": exc.message})
                else:
                    raise
        return {"seeded": seeded, "skipped": skipped, "dryRun": True}

    lock = acquire_tracker_lock(
        Path(lock_dir) if lock_dir else followups_lock_dir(followups),
        timeout_seconds=float(os.environ.get("CAREER_OPS_FOLLOWUPS_LOCK_TIMEOUT_MS", "60000")) / 1000,
        retry_seconds=float(os.environ.get("CAREER_OPS_FOLLOWUPS_LOCK_RETRY_MS", "75")) / 1000,
        stale_seconds=float(os.environ.get("CAREER_OPS_FOLLOWUPS_LOCK_STALE_MS", "600000")) / 1000,
        tracker=followups,
    )
    try:
        existing = followups.read_text(encoding="utf-8") if followups.exists() else None
        check_content = existing or ""
        seeded: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []
        pins: list[str] = []
        for row in rows:
            if is_already_seeded(check_content, row["num"]) and not force:
                skipped.append({"appNum": row["num"], "reason": "already-seeded"})
                continue
            try:
                plan = plan_for(row)
            except SeedError as exc:
                if exc.code == "INVALID_DATE":
                    skipped.append({"appNum": row["num"], "reason": "invalid-notes-date", "detail": exc.message})
                    continue
                raise
            seeded.append(plan)
            pins.append(plan["pin"])
        if pins:
            followups.parent.mkdir(parents=True, exist_ok=True)
            write_file_atomic(followups, append_pins(existing, pins))
        return {"seeded": seeded, "skipped": skipped}
    finally:
        lock.release()


EXIT_CODES = {"USAGE": 1, "INVALID_DATE": 1, "NOT_APPLIED": 1, "ROW_NOT_FOUND": 2}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Seed follow-up pin directives for Applied applications.")
    parser.add_argument("app_num", nargs="?")
    parser.add_argument("--date")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument("--backfill", action="store_true")
    parser.add_argument("--tracker")
    parser.add_argument("--followups")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.backfill:
            if args.app_num:
                raise SeedError("USAGE", "--backfill does not take a positional appNum")
            if args.date:
                raise SeedError("USAGE", "--date cannot be combined with --backfill (each row resolves its own apply date from its notes)")
            result = seed_backfill(force=args.force, dry_run=args.dry_run, tracker_path=args.tracker, followups_path=args.followups)
        else:
            if not args.app_num or not args.app_num.isdigit() or int(args.app_num) <= 0:
                raise SeedError("USAGE", "Usage: followup_seed.py <appNum> [--date YYYY-MM-DD] [--force] [--dry-run] [--json]")
            result = seed_followup(int(args.app_num), date=args.date, force=args.force, dry_run=args.dry_run, tracker_path=args.tracker, followups_path=args.followups)
    except TimeoutError as exc:
        if args.json_output:
            print(json.dumps({"error": str(exc), "code": "LOCK_TIMEOUT"}))
        else:
            print(f"ERROR: {exc}")
        return 4
    except SeedError as exc:
        if args.json_output:
            print(json.dumps({"error": exc.message, "code": exc.code}))
        else:
            print(f"ERROR: {exc.message}")
        return EXIT_CODES.get(exc.code, 1)

    if args.json_output:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
