#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import yaml

from scripts.python import CONFIG_DIR, DATA_DIR
from scripts.python.tracker.followup_cadence import normalize_status
from scripts.python.tracker.parse import parse_tracker_row, resolve_columns


CANONICAL_STATUSES = ["Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP"]
ACTIVE_STATUSES = {"Applied", "Responded", "Interview", "Offer"}
PURSUED_STATUSES = {"Applied", "Responded", "Interview", "Offer", "Rejected"}


def round1(value: float) -> float:
    return round(value * 10) / 10


def pct(part: int | float, total: int | float) -> float:
    return round1((part / total) * 100) if total > 0 else 0


def canonical_status(raw: Any) -> str:
    norm = normalize_status(str(raw if raw is not None else ""))
    if norm == "skip":
        return "SKIP"
    cased = norm[:1].upper() + norm[1:]
    return cased if cased in CANONICAL_STATUSES else "Unknown"


def compute_tracker_stats(content: str) -> dict[str, Any]:
    lines = str(content or "").replace("\r", "").split("\n")
    colmap = resolve_columns(lines)
    by_status = {status: 0 for status in CANONICAL_STATUSES}
    total = score_sum = score_count = top_score = with_pdf = with_report = active_apps = 0
    pursued_sum = pursued_count = 0
    for line in lines:
        row = parse_tracker_row(line, colmap)
        if not row:
            continue
        total += 1
        status = canonical_status(row.status)
        by_status[status] = by_status.get(status, 0) + 1
        if status in ACTIVE_STATUSES:
            active_apps += 1
        try:
            score = float(str(row.score or "").replace("*", "").split("/")[0])
        except ValueError:
            score = 0
        if score > 0:
            score_sum += score
            score_count += 1
            top_score = max(top_score, score)
            if status in PURSUED_STATUSES:
                pursued_sum += score
                pursued_count += 1
        if "✅" in (row.pdf or ""):
            with_pdf += 1
        if re.search(r"\[.*\]\(.*\)", row.report or ""):
            with_report += 1
    return {
        "total": total,
        "byStatus": by_status,
        "avgScore": round1(score_sum / score_count) if score_count else None,
        "avgScoreApplied": round1(pursued_sum / pursued_count) if pursued_count else None,
        "topScore": top_score if top_score > 0 else None,
        "pdfPct": pct(with_pdf, total),
        "reportPct": pct(with_report, total),
        "activeApps": active_apps,
    }


def tracker_status_by_num(content: str) -> dict[int, str]:
    lines = str(content or "").replace("\r", "").split("\n")
    colmap = resolve_columns(lines)
    result: dict[int, str] = {}
    for line in lines:
        row = parse_tracker_row(line, colmap)
        if row:
            result[row.num] = canonical_status(row.status)
    return result


def compute_funnel(by_status: dict[str, int]) -> dict[str, Any]:
    n = lambda key: by_status.get(key, 0)
    ever_applied = n("Applied") + n("Responded") + n("Interview") + n("Offer") + n("Rejected")
    ever_responded = n("Responded") + n("Interview") + n("Offer")
    ever_interview = n("Interview") + n("Offer")
    ever_offer = n("Offer")
    return {
        "everApplied": ever_applied,
        "everResponded": ever_responded,
        "everInterview": ever_interview,
        "everOffer": ever_offer,
        "responseRate": pct(ever_responded, ever_applied),
        "interviewRate": pct(ever_interview, ever_applied),
        "offerRate": pct(ever_offer, ever_applied),
        "smallSample": ever_applied < 10,
    }


def iso_week(date_str: str) -> str | None:
    try:
        current = date.fromisoformat(date_str)
    except ValueError:
        return None
    iso = current.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def compute_scan_stats(content: str, *, weeks: int = 8) -> dict[str, Any]:
    by_portal: dict[str, int] = {}
    by_status: dict[str, int] = {}
    companies: set[str] = set()
    week_counts: dict[str, int] = {}
    total_recorded = added = 0
    first_seen = last_seen = None
    for line in [line for line in str(content or "").replace("\r", "").split("\n") if line.strip()]:
        cols = line.split("\t")
        if cols[0] == "url" or not re.match(r"^https?://", cols[0]):
            continue
        total_recorded += 1
        row_date = cols[1] if len(cols) > 1 else ""
        portal = cols[2] if len(cols) > 2 else ""
        company = cols[4] if len(cols) > 4 else ""
        status = (cols[5] if len(cols) > 5 else "added").strip() or "added"
        by_status[status] = by_status.get(status, 0) + 1
        if portal:
            by_portal[portal] = by_portal.get(portal, 0) + 1
        if company:
            companies.add(company.lower())
        if status == "added":
            added += 1
            if week := iso_week(row_date):
                week_counts[week] = week_counts.get(week, 0) + 1
        if re.match(r"^\d{4}-\d{2}-\d{2}$", row_date):
            first_seen = row_date if first_seen is None or row_date < first_seen else first_seen
            last_seen = row_date if last_seen is None or row_date > last_seen else last_seen
    added_per_week = [{"week": week, "count": count} for week, count in sorted(week_counts.items())[-weeks:]]
    return {"totalRecorded": total_recorded, "added": added, "byStatus": by_status, "byPortal": by_portal, "distinctCompanies": len(companies), "firstSeen": first_seen, "lastSeen": last_seen, "addedPerWeek": added_per_week}


def scan_company_names(content: str) -> list[str]:
    names: set[str] = set()
    for line in str(content or "").replace("\r", "").split("\n"):
        cols = line.split("\t")
        if re.match(r"^https?://", cols[0] if cols else "") and len(cols) > 4 and cols[4].strip():
            names.add(cols[4].strip().lower())
    return sorted(names)


def compute_portal_stats(portals_yml_content: str, scan_stats: dict[str, Any] | None, producing_company_names: list[str] | None = None) -> dict[str, Any] | None:
    try:
        cfg = yaml.safe_load(str(portals_yml_content or "")) or {}
    except Exception:
        return None
    companies = cfg.get("tracked_companies") if isinstance(cfg.get("tracked_companies"), list) else []
    boards = cfg.get("job_boards") if isinstance(cfg.get("job_boards"), list) else []
    configured_names = {str(company.get("name") or "").lower() for company in companies if isinstance(company, dict) and str(company.get("name") or "").strip()}
    producing = {str(name).lower() for name in (producing_company_names or [])}
    producing_companies = len(configured_names.intersection(producing))
    return {
        "configuredCompanies": len(companies),
        "configuredBoards": len(boards),
        "activePortals": len((scan_stats or {}).get("byPortal", {})),
        "producingCompanies": producing_companies,
        "producingPct": pct(producing_companies, len(configured_names)),
    }


def compute_followup_stats(followups_content: str, tracker_by_num: dict[int, str]) -> dict[str, Any]:
    by_app: dict[int, int] = {}
    total_followups = 0
    for line in str(followups_content or "").replace("\r", "").split("\n"):
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 8:
            continue
        try:
            num = int(parts[1])
            app_num = int(parts[2])
        except ValueError:
            continue
        total_followups += 1
        by_app[app_num] = by_app.get(app_num, 0) + 1
    applied_without = sum(1 for num, status in tracker_by_num.items() if status == "Applied" and num not in by_app)
    return {"totalFollowups": total_followups, "appsWithFollowups": len(by_app), "appliedWithoutFollowup": applied_without, "avgPerApp": round1(total_followups / len(by_app)) if by_app else 0}


def compute_run_stats(content: str) -> dict[str, Any] | None:
    lines = [line for line in str(content or "").replace("\r", "").split("\n") if line.strip()]
    if len(lines) < 2:
        return None
    header = lines[0].split("\t")
    idx = {name: pos for pos, name in enumerate(header)}
    if "timestamp" not in idx or "found" not in idx:
        return None
    filter_cols = [name for name in header if name.startswith("filtered_")]
    rows: list[dict[str, Any]] = []
    for line in lines[1:]:
        cols = line.split("\t")
        if len(cols) < len(header) or not re.match(r"^\d{4}-\d{2}-\d{2}", cols[idx["timestamp"]] or ""):
            continue

        def num(name: str) -> int:
            try:
                return int(float(cols[idx[name]]))
            except Exception:
                return 0

        rows.append(
            {
                "date": cols[idx["timestamp"]][:10],
                "status": cols[idx["status"]] if "status" in idx else "completed",
                "found": num("found"),
                "filtered": sum(num(name) for name in filter_cols),
                "newAdded": num("new_added") if "new_added" in idx else 0,
            }
        )
    if not rows:
        return None
    completed = [row for row in rows if row["status"] != "failed"]
    total = lambda arr, key: sum(row[key] for row in arr)
    return {
        "totalRuns": len(rows),
        "failedRuns": len(rows) - len(completed),
        "lastRunDate": sorted(row["date"] for row in rows)[-1],
        "avgFoundPerRun": round1(total(completed, "found") / len(completed)) if completed else 0,
        "avgNewPerRun": round1(total(completed, "newAdded") / len(completed)) if completed else 0,
        "filterRemovalPct": pct(total(completed, "filtered"), total(completed, "found")),
    }


def compute_all_stats(
    *,
    apps_file: str | Path = DATA_DIR / "applications.md",
    scan_history_file: str | Path = DATA_DIR / "scan-history.tsv",
    followups_file: str | Path = DATA_DIR / "follow-ups.md",
    scan_runs_file: str | Path = DATA_DIR / "scan-runs.tsv",
    portals_file: str | Path = CONFIG_DIR / "portals.yml",
) -> dict[str, Any]:
    def read(path: str | Path) -> str | None:
        file_path = Path(path)
        return file_path.read_text(encoding="utf-8") if file_path.exists() else None

    apps = read(apps_file)
    scan_hist = read(scan_history_file)
    followups = read(followups_file)
    portals = read(portals_file)
    runs = read(scan_runs_file)
    tracker = compute_tracker_stats(apps) if apps is not None else None
    scan = compute_scan_stats(scan_hist) if scan_hist is not None else None
    return {
        "metadata": {
            "generatedAt": datetime.now(UTC).date().isoformat(),
            "sources": {
                "tracker": apps is not None,
                "scanHistory": scan_hist is not None,
                "followups": followups is not None,
                "portals": portals is not None,
                "scanRuns": runs is not None,
            },
        },
        "tracker": tracker,
        "funnel": compute_funnel(tracker["byStatus"]) if tracker else None,
        "scan": scan,
        "portals": compute_portal_stats(portals, scan, scan_company_names(scan_hist) if scan_hist else []) if portals is not None else None,
        "followups": compute_followup_stats(followups, tracker_status_by_num(apps)) if followups is not None and apps is not None else None,
        "runs": compute_run_stats(runs) if runs is not None else None,
    }


def format_summary(stats: dict[str, Any]) -> str:
    lines = ["", "━" * 45, f"Pipeline Stats — {stats['metadata']['generatedAt']}", "━" * 45]
    tracker = stats.get("tracker")
    if tracker:
        fit = f" | avg fit {tracker['avgScore']}/5" if tracker["avgScore"] is not None else ""
        if tracker.get("avgScoreApplied") is not None:
            fit += f" (pursued roles {tracker['avgScoreApplied']}/5)"
        if tracker.get("topScore") is not None:
            fit += f" | top {tracker['topScore']}"
        lines.append(f"Tracker:    {tracker['total']} total | {tracker['activeApps']} active{fit}")
    else:
        lines.append("Tracker:    — no data (data/applications.md missing)")
    funnel = stats.get("funnel")
    if funnel:
        small = " (small sample — rates indicative only)" if funnel["smallSample"] else ""
        lines.append(f"Funnel:     ever applied {funnel['everApplied']} → responded {funnel['everResponded']} ({funnel['responseRate']}%) → interview {funnel['everInterview']} ({funnel['interviewRate']}%) → offer {funnel['everOffer']} ({funnel['offerRate']}%){small}")
    scan = stats.get("scan")
    lines.append(f"Scanner:    {scan['totalRecorded']} jobs recorded since {scan['firstSeen']} | {scan['added']} added | {scan['distinctCompanies']} companies" if scan else "Scanner:    — no data (data/scan-history.tsv missing)")
    portals = stats.get("portals")
    lines.append(f"Portals:    {portals['configuredCompanies']} companies + {portals['configuredBoards']} boards configured | {portals['producingCompanies']} have produced a match ({portals['producingPct']}%) — low ≠ broken, may just be no openings" if portals else "Portals:    — no data (portals.yml missing)")
    followups = stats.get("followups")
    lines.append(f"Follow-ups: {followups['totalFollowups']} sent across {followups['appsWithFollowups']} apps | {followups['appliedWithoutFollowup']} Applied apps with none | avg {followups['avgPerApp']}/app" if followups else "Follow-ups: — no data (data/follow-ups.md missing)")
    runs = stats.get("runs")
    lines.append(f"Runs:       {runs['totalRuns']} recorded (last {runs['lastRunDate']}) | avg {runs['avgFoundPerRun']} found / {runs['avgNewPerRun']} new per run | filters remove {runs['filterRemovalPct']}%" if runs else "Runs:       — no data (data/scan-runs.tsv missing; created by the next scan)")
    lines.append("")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Compute career-ops lifetime pipeline stats.")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--tracker", default=str(DATA_DIR / "applications.md"))
    parser.add_argument("--scan-history", default=str(DATA_DIR / "scan-history.tsv"))
    parser.add_argument("--followups", default=str(DATA_DIR / "follow-ups.md"))
    parser.add_argument("--scan-runs", default=str(DATA_DIR / "scan-runs.tsv"))
    parser.add_argument("--portals", default=str(CONFIG_DIR / "portals.yml"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    stats = compute_all_stats(apps_file=args.tracker, scan_history_file=args.scan_history, followups_file=args.followups, scan_runs_file=args.scan_runs, portals_file=args.portals)
    print(format_summary(stats) if args.summary else json.dumps(stats, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
