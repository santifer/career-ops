#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.python import DATA_DIR
from scripts.python.tracker.role_matcher import role_fuzzy_match


DEFAULT_WINDOW_DAYS = 90


def parse_date(date_str: str) -> datetime | None:
    value = str(date_str or "").strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return None
    try:
        parsed = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return parsed if parsed.strftime("%Y-%m-%d") == value else None


def days_between(first: datetime, second: datetime) -> int:
    return round((second - first).total_seconds() / 86400)


@dataclass(frozen=True)
class ScanHistoryRow:
    url: str
    date: datetime
    dateStr: str
    portal: str
    title: str
    company: str
    status: str
    location: str


def parse_scan_history(content: str) -> list[ScanHistoryRow]:
    lines = [line for line in str(content or "").split("\n") if line.strip()]
    if not lines:
        return []
    has_header = bool(re.match(r"^\s*url\s*\t", lines[0], re.IGNORECASE))
    rows: list[ScanHistoryRow] = []
    for line in lines[1 if has_header else 0 :]:
        cols = line.split("\t")
        if len(cols) < 5:
            continue
        url, first_seen, portal, title, company = cols[:5]
        status = cols[5] if len(cols) > 5 else "added"
        location = cols[6] if len(cols) > 6 else ""
        date = parse_date(first_seen)
        if not url.strip() or date is None:
            continue
        rows.append(
            ScanHistoryRow(
                url=url.strip(),
                date=date,
                dateStr=first_seen.strip(),
                portal=portal.strip(),
                title=title.strip(),
                company=company.strip(),
                status=(status or "added").strip(),
                location=(location or "").strip(),
            )
        )
    return rows


def _row_dict(row: ScanHistoryRow | dict[str, Any]) -> dict[str, Any]:
    if isinstance(row, ScanHistoryRow):
        return row.__dict__.copy()
    return dict(row)


def detect_reposts(rows: Any, window_days: int = DEFAULT_WINDOW_DAYS) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    valid: list[dict[str, Any]] = []
    for raw in rows:
        if not isinstance(raw, (ScanHistoryRow, dict)):
            continue
        row = _row_dict(raw)
        if (
            row.get("status") == "added"
            and isinstance(row.get("url"), str)
            and row["url"].strip()
            and isinstance(row.get("date"), datetime)
            and isinstance(row.get("company"), str)
            and row["company"].strip()
            and isinstance(row.get("title"), str)
            and row["title"].strip()
        ):
            row["url"] = row["url"].strip()
            row["company"] = row["company"].strip()
            row["title"] = row["title"].strip()
            valid.append(row)
    if len(valid) < 2:
        return []

    by_company: dict[str, list[dict[str, Any]]] = {}
    for row in valid:
        by_company.setdefault(row["company"].lower(), []).append(row)

    clusters: list[dict[str, Any]] = []
    for group in by_company.values():
        if len(group) >= 2:
            clusters.extend(_detect_reposts_in_group(group, window_days))
    return sorted(clusters, key=lambda item: item["lastSeen"], reverse=True)


def _detect_reposts_in_group(rows: list[dict[str, Any]], window_days: int) -> list[dict[str, Any]]:
    title_groups: list[list[dict[str, Any]]] = []
    used: set[int] = set()
    for idx, row in enumerate(rows):
        if idx in used:
            continue
        group = [row]
        used.add(idx)
        for other_idx, other in enumerate(rows):
            if other_idx in used:
                continue
            if row["title"].lower() == other["title"].lower() or role_fuzzy_match(row["title"], other["title"]):
                group.append(other)
                used.add(other_idx)
        title_groups.append(group)

    results: list[dict[str, Any]] = []
    for group in title_groups:
        if len(group) < 2:
            continue
        sorted_group = sorted(group, key=lambda row: row["date"])
        cluster: list[dict[str, Any]] = []
        for row in sorted_group:
            if not cluster:
                cluster = [row]
                continue
            span = days_between(cluster[0]["date"], row["date"])
            if span <= window_days:
                cluster.append(row)
            else:
                if len(cluster) >= 2 and (built := _build_repost_cluster(cluster, window_days)):
                    results.append(built)
                cluster = [item for item in cluster if days_between(item["date"], row["date"]) <= window_days]
                cluster.append(row)
        if len(cluster) >= 2 and (built := _build_repost_cluster(cluster, window_days)):
            results.append(built)
    return results


def _build_repost_cluster(cluster_rows: list[dict[str, Any]], window_days: int) -> dict[str, Any] | None:
    by_url: dict[str, dict[str, Any]] = {}
    for row in cluster_rows:
        if row["url"] not in by_url or row["date"] < by_url[row["url"]]["date"]:
            by_url[row["url"]] = row
    deduped = list(by_url.values())
    if len(deduped) < 2:
        return None
    sorted_rows = sorted(deduped, key=lambda row: row["date"])
    first = sorted_rows[0]
    last = sorted_rows[-1]
    span = days_between(first["date"], last["date"])
    if span > window_days:
        return None
    appearances = [{"url": row["url"], "date": row["dateStr"], "title": row["title"]} for row in sorted_rows]
    return {
        "company": cluster_rows[0]["company"],
        "role": last["title"],
        "repostCount": len(appearances),
        "firstSeen": first["dateStr"],
        "lastSeen": last["dateStr"],
        "daysSpan": span,
        "appearances": appearances,
    }


def load_scan_history(path: str | Path = DATA_DIR / "scan-history.tsv") -> list[ScanHistoryRow]:
    file_path = Path(path)
    return parse_scan_history(file_path.read_text(encoding="utf-8")) if file_path.exists() else []


def print_summary(clusters: list[dict[str, Any]], window_days: int) -> None:
    print("\n" + "=" * 78)
    print("  Repost Detector — career-ops")
    print(f"  window: {window_days} days | clusters: {len(clusters)}")
    print("=" * 78 + "\n")
    if not clusters:
        print("  No reposted roles detected.\n")
        return
    print("  " + "Company".ljust(22) + "Role".ljust(34) + "Reposts".ljust(9) + "Span".ljust(12) + "First -> Last")
    print("  " + "-" * 90)
    for cluster in clusters:
        print(
            "  "
            + str(cluster["company"])[:20].ljust(22)
            + str(cluster["role"])[:32].ljust(34)
            + str(cluster["repostCount"]).ljust(9)
            + f"{cluster['daysSpan']}d".ljust(12)
            + f"{cluster['firstSeen']} -> {cluster['lastSeen']}"
        )
    print("")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Detect reposted roles in scan-history.tsv.")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--window", type=int, default=DEFAULT_WINDOW_DAYS)
    parser.add_argument("--file", default=str(DATA_DIR / "scan-history.tsv"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    rows = load_scan_history(args.file)
    clusters = detect_reposts(rows, args.window)
    if args.summary:
        print_summary(clusters, args.window)
    else:
        print(
            json.dumps(
                {
                    "metadata": {"windowDays": args.window, "totalRows": len(rows), "clusters": len(clusters)},
                    "clusters": clusters,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

