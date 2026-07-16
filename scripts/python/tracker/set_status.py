#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from scripts.python import PROJECT_ROOT, TEMPLATES_DIR
from scripts.python.tracker.parse import parse_tracker_row, resolve_columns
from scripts.python.tracker.role_matcher import role_fuzzy_match
from scripts.python.tracker.utils import (
    acquire_tracker_lock,
    cell,
    load_canonical_states,
    normalize_company,
    rebuild_row,
    resolve_canonical_state,
    resolve_tracker_path,
    tracker_lock_dir_for,
    write_file_atomic,
)


EXIT_OK = 0
EXIT_USAGE = 1
EXIT_NOT_FOUND = 2
EXIT_AMBIGUOUS = 3
EXIT_LOCK_TIMEOUT = 4


@dataclass(frozen=True)
class SetStatusResult:
    changed: bool
    num: int
    company: str
    role: str
    oldStatus: str
    newStatus: str
    tracker: str
    note: str | None = None
    dryRun: bool = False
    followupSeedCandidate: bool = False

    def to_json_dict(self) -> dict[str, Any]:
        data = asdict(self)
        return {key: value for key, value in data.items() if value not in (None, False)}


class SetStatusError(Exception):
    def __init__(self, exit_code: int, code: str, message: str, **extra: Any) -> None:
        super().__init__(message)
        self.exit_code = exit_code
        self.code = code
        self.message = message
        self.extra = extra

    def to_json_dict(self) -> dict[str, Any]:
        return {"error": self.message, "code": self.code, **self.extra}


def _candidate_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {"num": row["num"], "company": row["company"], "role": row["role"]}


def _resolve_row(
    rows: list[dict[str, Any]],
    *,
    selector: str,
    role: str | None = None,
) -> dict[str, Any]:
    if selector.isdigit():
        num = int(selector)
        matches = [row for row in rows if row["num"] == num]
        if not matches:
            raise SetStatusError(EXIT_NOT_FOUND, "not-found", f"No tracker row with #{num}")
        if len(matches) > 1 and role:
            narrowed = [row for row in matches if role_fuzzy_match(row["role"], role)]
            if len(narrowed) == 1:
                return narrowed[0]
        if len(matches) > 1:
            candidates = [_candidate_dict(row) for row in matches]
            listing = "\n".join(f"#{c['num']}\t{c['company']}\t{c['role']}" for c in candidates)
            raise SetStatusError(
                EXIT_AMBIGUOUS,
                "ambiguous",
                f"#{num} is a duplicate tracker number shared by {len(matches)} rows — pass --role to disambiguate, or use the company name instead:\n{listing}",
                candidates=candidates,
            )
        return matches[0]

    key = normalize_company(selector)
    if not key:
        raise SetStatusError(EXIT_USAGE, "usage", f'Selector "{selector}" is empty after normalization')

    matches = [row for row in rows if normalize_company(row["company"]) == key]
    if not matches:
        raise SetStatusError(EXIT_NOT_FOUND, "not-found", f'No tracker row with company matching "{selector}"')
    if len(matches) > 1 and role:
        narrowed = [row for row in matches if role_fuzzy_match(row["role"], role)]
        if len(narrowed) == 1:
            return narrowed[0]
    if len(matches) > 1:
        candidates = [_candidate_dict(row) for row in matches]
        listing = "\n".join(f"#{c['num']}\t{c['company']}\t{c['role']}" for c in candidates)
        raise SetStatusError(
            EXIT_AMBIGUOUS,
            "ambiguous",
            f'Company "{selector}" matches {len(matches)} rows — pass the # or narrow with --role:\n{listing}',
            candidates=candidates,
        )
    return matches[0]


def _has_note(existing: str, note: str) -> bool:
    return (
        existing == note
        or existing.startswith(f"{note}; ")
        or existing.endswith(f"; {note}")
        or f"; {note}; " in existing
    )


def set_status(
    selector: str,
    state_input: str,
    *,
    note: str | None = None,
    role: str | None = None,
    dry_run: bool = False,
    root_dir: str | Path = PROJECT_ROOT,
    tracker_path: str | Path | None = None,
    states_path: str | Path = TEMPLATES_DIR / "states.yml",
) -> SetStatusResult:
    try:
        states = load_canonical_states(states_path)
    except Exception as exc:
        raise SetStatusError(EXIT_USAGE, "states-error", f"Cannot load canonical states from {states_path}: {exc}") from exc

    new_status = resolve_canonical_state(state_input, states)
    if not new_status:
        valid = " · ".join(state.label for state in states)
        raise SetStatusError(
            EXIT_USAGE,
            "invalid-state",
            f'"{state_input}" is not a canonical state. Valid states: {valid}',
        )

    apps_file = Path(tracker_path) if tracker_path is not None else resolve_tracker_path(root_dir)
    if not apps_file.exists():
        raise SetStatusError(EXIT_NOT_FOUND, "no-tracker", f"No tracker found at {apps_file}")

    lock = None
    if not dry_run:
        try:
            lock = acquire_tracker_lock(
                tracker_lock_dir_for(apps_file),
                timeout_seconds=float(os.environ.get("CAREER_OPS_TRACKER_LOCK_TIMEOUT_MS", "60000")) / 1000,
                retry_seconds=float(os.environ.get("CAREER_OPS_TRACKER_LOCK_RETRY_MS", "75")) / 1000,
                stale_seconds=float(os.environ.get("CAREER_OPS_TRACKER_LOCK_STALE_MS", "600000")) / 1000,
                tracker=apps_file,
            )
        except TimeoutError as exc:
            raise SetStatusError(EXIT_LOCK_TIMEOUT, "lock-timeout", str(exc)) from exc
        except Exception as exc:
            raise SetStatusError(EXIT_USAGE, "lock-error", f"Cannot acquire tracker lock: {exc}") from exc

    try:
        try:
            content = apps_file.read_text(encoding="utf-8")
        except Exception as exc:
            raise SetStatusError(EXIT_NOT_FOUND, "read-failure", f"Cannot read tracker at {apps_file}: {exc}") from exc

        lines = content.split("\n")
        colmap = resolve_columns(lines)
        rows: list[dict[str, Any]] = []
        for idx, line in enumerate(lines):
            row = parse_tracker_row(line, colmap)
            if row:
                rows.append({**asdict(row), "lineIdx": idx})
        if not rows:
            raise SetStatusError(EXIT_NOT_FOUND, "empty-tracker", f"Tracker at {apps_file} has no data rows")

        target = _resolve_row(rows, selector=selector, role=role)
        old_status = target["status"]
        clean_note = cell(note) if note is not None else None

        parts = [part.strip() for part in lines[target["lineIdx"]].split("|")]
        required_width = max(colmap["status"], colmap.get("notes", 0))
        while len(parts) <= required_width:
            parts.append("")

        status_changed = parts[colmap["status"]] != new_status
        parts[colmap["status"]] = new_status

        note_changed = False
        if clean_note:
            if colmap.get("notes") is None:
                raise SetStatusError(EXIT_USAGE, "no-notes-column", "Tracker has no Notes column — cannot apply --note")
            existing = parts[colmap["notes"]] if colmap["notes"] < len(parts) else ""
            if not _has_note(existing, clean_note):
                parts[colmap["notes"]] = f"{existing}; {clean_note}" if existing and existing not in {"—", "-"} else clean_note
                note_changed = True

        changed = status_changed or note_changed
        if changed and not dry_run:
            lines[target["lineIdx"]] = rebuild_row(parts)
            try:
                write_file_atomic(apps_file, "\n".join(lines))
            except Exception as exc:
                raise SetStatusError(EXIT_USAGE, "write-failure", f"Cannot write tracker at {apps_file}: {exc}") from exc

        return SetStatusResult(
            changed=changed,
            num=target["num"],
            company=target["company"],
            role=target["role"],
            oldStatus=old_status,
            newStatus=new_status,
            note=clean_note,
            dryRun=dry_run,
            followupSeedCandidate=status_changed and new_status == "Applied",
            tracker=str(apps_file),
        )
    finally:
        if lock is not None:
            lock.release()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Update one career-ops tracker row status.",
        usage="%(prog)s <report#|company> <state> [--note NOTE] [--role ROLE] [--dry-run] [--json]",
    )
    parser.add_argument("selector")
    parser.add_argument("state")
    parser.add_argument("--note")
    parser.add_argument("--role")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true", dest="json_output")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = set_status(
            args.selector,
            args.state,
            note=args.note,
            role=args.role,
            dry_run=args.dry_run,
        )
    except SetStatusError as exc:
        if args.json_output:
            print(json.dumps(exc.to_json_dict(), ensure_ascii=False))
        print(f"ERROR: {exc.message}", file=sys.stderr)
        return exc.exit_code

    if args.json_output:
        print(json.dumps(result.to_json_dict(), ensure_ascii=False, indent=2))
    else:
        verb = "would set" if args.dry_run else "set" if result.changed else "already"
        note_suffix = f" (note: {result.note})" if result.note else ""
        print(f"#{result.num} {result.company} — {result.role}: {verb} {result.oldStatus} -> {result.newStatus}{note_suffix}")
        if result.followupSeedCandidate and not args.dry_run:
            print("Status is Applied — consider seeding follow-ups in data/follow-ups.md", file=sys.stderr)
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())

