#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from scripts.python import REPORTS_DIR


MAX_SENTINEL_AGE_SECONDS = 4 * 60 * 60
MAX_RETRIES = 50
MAX_COUNT = 50


def pad(number: int) -> str:
    return str(number).zfill(3)


def _entries(reports_dir: Path) -> list[str]:
    if not reports_dir.exists():
        return []
    return [entry.name for entry in reports_dir.iterdir()]


def max_slot(reports_dir: str | Path = REPORTS_DIR) -> int:
    max_seen = 0
    for name in _entries(Path(reports_dir)):
        prefix = name.split("-", 1)[0]
        if prefix.isdigit():
            max_seen = max(max_seen, int(prefix))
    return max_seen


def taken_prefixes(reports_dir: str | Path = REPORTS_DIR) -> set[str]:
    taken: set[str] = set()
    for name in _entries(Path(reports_dir)):
        prefix = name.split("-", 1)[0]
        if prefix.isdigit():
            taken.add(prefix)
    return taken


def claim_slot(number: int, reports_dir: str | Path = REPORTS_DIR, taken: set[str] | None = None) -> bool:
    reports_path = Path(reports_dir)
    prefix = pad(number)
    occupied = prefix in taken if taken is not None else any(name.startswith(f"{prefix}-") for name in _entries(reports_path))
    if occupied:
        return False

    sentinel = reports_path / f"{prefix}-RESERVED.md"
    try:
        fd = os.open(sentinel, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
        return True
    except FileExistsError:
        return False


def release_slot(number: int, reports_dir: str | Path = REPORTS_DIR) -> None:
    (Path(reports_dir) / f"{pad(number)}-RESERVED.md").unlink(missing_ok=True)


def reserve_range(count: int, reports_dir: str | Path = REPORTS_DIR) -> list[int] | None:
    reports_path = Path(reports_dir)
    reports_path.mkdir(parents=True, exist_ok=True)
    base = max_slot(reports_path) + 1
    tries = 0
    taken = taken_prefixes(reports_path)

    while tries < MAX_RETRIES:
        claimed: list[int] = []
        failed_at = -1
        for number in range(base, base + count):
            if claim_slot(number, reports_path, taken):
                claimed.append(number)
            else:
                failed_at = number
                break
        if failed_at == -1:
            return claimed
        for number in claimed:
            release_slot(number, reports_path)
        base = failed_at + 1
        tries += 1
        taken = taken_prefixes(reports_path)
    return None


def gc_sentinels(
    reports_dir: str | Path = REPORTS_DIR,
    *,
    max_age_seconds: int = MAX_SENTINEL_AGE_SECONDS,
    stderr: object = sys.stderr,
) -> int:
    reports_path = Path(reports_dir)
    if not reports_path.exists():
        return 0
    now = time.time()
    removed = 0
    for sentinel in reports_path.iterdir():
        if not sentinel.name.endswith("-RESERVED.md"):
            continue
        try:
            if now - sentinel.stat().st_mtime > max_age_seconds:
                sentinel.unlink()
                removed += 1
                print(f"reserve-report-num: GC stale sentinel {sentinel.name}", file=stderr)
        except FileNotFoundError:
            pass
    if removed:
        print(f"reserve-report-num: removed {removed} stale sentinel(s)", file=stderr)
    return removed


def _parse_release_range(value: str) -> tuple[int, int]:
    parts = value.split("-", 1)
    if not all(part.isdigit() for part in parts):
        raise ValueError("invalid range")
    start = int(parts[0])
    end = int(parts[1]) if len(parts) == 2 else start
    if end < start:
        raise ValueError("range end must be >= start")
    return start, end


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Atomically reserve career-ops report numbers.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--count", type=int, default=1)
    group.add_argument("--release")
    group.add_argument("--gc", action="store_true")
    parser.add_argument("--reports-dir", default=os.environ.get("CAREER_OPS_REPORTS_DIR", str(REPORTS_DIR)))
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    reports_dir = Path(args.reports_dir)

    if args.release:
        try:
            start, end = _parse_release_range(args.release)
        except ValueError as exc:
            print(f"reserve-report-num: --release {exc}", file=sys.stderr)
            return 1
        for number in range(start, end + 1):
            release_slot(number, reports_dir)
        return 0

    if args.gc:
        gc_sentinels(reports_dir)
        return 0

    count = args.count
    if count < 1 or count > MAX_COUNT:
        print(f"Usage: reserve_report_num.py --count <1-{MAX_COUNT}>", file=sys.stderr)
        return 1
    reserved = reserve_range(count, reports_dir)
    if not reserved:
        print(f"reserve-report-num: could not claim {count} slot(s) after {MAX_RETRIES} retries", file=sys.stderr)
        return 1
    print(pad(reserved[0]) if count == 1 else f"{pad(reserved[0])}-{pad(reserved[-1])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

