#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import yaml

from scripts.python import CONFIG_DIR, DATA_DIR, PROJECT_ROOT
from scripts.python.tracker.parse import parse_tracker_row, resolve_columns


DEFAULT_CADENCE = {
    "applied_first": 7,
    "applied_subsequent": 7,
    "applied_max_followups": 2,
    "responded_initial": 1,
    "responded_subsequent": 3,
    "interview_thankyou": 1,
}

PROFILE_CADENCE_KEYS = {
    "applied_first_days": "applied_first",
    "applied_subsequent_days": "applied_subsequent",
    "applied_max_followups": "applied_max_followups",
    "responded_initial_days": "responded_initial",
    "responded_subsequent_days": "responded_subsequent",
    "interview_thankyou_days": "interview_thankyou",
}

ALIASES = {
    "evaluada": "evaluated",
    "condicional": "evaluated",
    "hold": "evaluated",
    "evaluar": "evaluated",
    "verificar": "evaluated",
    "aplicado": "applied",
    "enviada": "applied",
    "aplicada": "applied",
    "applied": "applied",
    "sent": "applied",
    "respondido": "responded",
    "entrevista": "interview",
    "oferta": "offer",
    "rechazado": "rejected",
    "rechazada": "rejected",
    "descartado": "discarded",
    "descartada": "discarded",
    "cerrada": "discarded",
    "cancelada": "discarded",
    "no aplicar": "skip",
    "no_aplicar": "skip",
    "monitor": "skip",
    "geo blocker": "skip",
}

ACTIONABLE_STATUSES = {"applied", "responded", "interview"}
OVERRIDE_RE = re.compile(r"^-\s+next\s+#(\d+)\s+(\d{4}-\d{2}-\d{2})(?:\s+\(set\s+(\d{4}-\d{2}-\d{2})\))?\s*$", re.IGNORECASE)


def positive_integer(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def load_profile_cadence(profile_path: str | Path | None = None) -> dict[str, int]:
    path = Path(profile_path) if profile_path else Path(os.environ.get("CAREER_OPS_PROFILE", CONFIG_DIR / "profile.yml"))
    if not path.exists():
        return {}
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}
    source = raw.get("followup_cadence") or {}
    cadence: dict[str, int] = {}
    for profile_key, cadence_key in PROFILE_CADENCE_KEYS.items():
        parsed = positive_integer(source.get(profile_key))
        if parsed is not None:
            cadence[cadence_key] = parsed
    return cadence


def resolve_cadence_config(profile_path: str | Path | None = None, applied_days: Any = None) -> dict[str, int]:
    cadence = {**DEFAULT_CADENCE, **load_profile_cadence(profile_path)}
    cli_applied = positive_integer(applied_days)
    if cli_applied is not None:
        cadence["applied_first"] = cli_applied
    return cadence


def normalize_status(raw: str) -> str:
    clean = re.sub(r"\s+\d{4}-\d{2}-\d{2}.*$", "", str(raw or "").replace("**", "").strip().lower()).strip()
    return ALIASES.get(clean, clean)


def today() -> date:
    return datetime.utcnow().date()


def parse_date(date_str: str | None) -> date | None:
    value = str(date_str or "").strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return None
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None
    return parsed


def parse_applied_date(notes: str | None) -> str | None:
    match = re.search(r"\bapplied\s+(\d{4}-\d{2}-\d{2})", str(notes or ""), re.IGNORECASE)
    return match.group(1) if match else None


def days_between(first: date, second: date) -> int:
    return (second - first).days


def add_days(base: date | str | None, days: int) -> str | None:
    parsed = parse_date(base) if isinstance(base, str) else base
    if parsed is None:
        return None
    return (parsed + timedelta(days=days)).isoformat()


def parse_tracker_content(content: str) -> list[dict[str, Any]]:
    lines = content.split("\n")
    colmap = resolve_columns(lines)
    rows = []
    for line in lines:
        row = parse_tracker_row(line, colmap)
        if row:
            rows.append(asdict(row))
    return rows


def parse_followups_content(content: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for line in str(content or "").split("\n"):
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
        entries.append(
            {
                "num": num,
                "appNum": app_num,
                "date": parts[3],
                "company": parts[4],
                "role": parts[5],
                "channel": parts[6],
                "contact": parts[7],
                "notes": parts[8] if len(parts) > 8 else "",
            }
        )
    return entries


def parse_next_overrides(content: str) -> dict[int, dict[str, Any]]:
    by_app: dict[int, dict[str, Any]] = {}
    for line in str(content or "").split("\n"):
        match = OVERRIDE_RE.match(line)
        if not match:
            continue
        pinned = match.group(2)
        if not parse_date(pinned):
            continue
        app_num = int(match.group(1))
        by_app[app_num] = {"appNum": app_num, "date": pinned, "setDate": match.group(3) or pinned}
    return by_app


def resolve_next_override(override: dict[str, Any] | None, last_followup_date: str | None) -> str | None:
    if not override:
        return None
    if last_followup_date and last_followup_date > override["setDate"]:
        return None
    return override["date"]


def extract_contacts(notes: str | None) -> list[dict[str, str | None]]:
    text = str(notes or "")
    contacts = []
    for email in re.findall(r"[\w.-]+@[\w.-]+\.\w+", text):
        before = text[: text.find(email)]
        match = re.search(
            r"(?:Emailed\s+|emailed\s+|contact[:\s]+|to\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:at|@|$)",
            before,
        )
        contacts.append({"email": email, "name": match.group(1).strip() if match else None})
    return contacts


def resolve_report_path(report_field: str, apps_file: str | Path, repo_root: str | Path = PROJECT_ROOT) -> str | None:
    match = re.search(r"\]\(([^)]+)\)", report_field or "")
    if not match:
        return None
    full_path = (Path(apps_file).parent / match.group(1)).resolve(strict=False)
    try:
        repo_relative = full_path.relative_to(Path(repo_root).resolve(strict=False)).as_posix()
    except ValueError:
        return None
    if not repo_relative.startswith("reports/"):
        return None
    return repo_relative if full_path.exists() else None


def compute_urgency(
    status: str,
    days_since_app: int,
    days_since_last_followup: int | None,
    followup_count: int,
    cadence: dict[str, int] | None = None,
) -> str:
    cfg = cadence or DEFAULT_CADENCE
    if status == "applied":
        if followup_count >= cfg["applied_max_followups"]:
            return "cold"
        if followup_count == 0 and days_since_app >= cfg["applied_first"]:
            return "overdue"
        if followup_count > 0 and days_since_last_followup is not None and days_since_last_followup >= cfg["applied_subsequent"]:
            return "overdue"
        return "waiting"
    if status == "responded":
        if days_since_app < cfg["responded_initial"]:
            return "urgent"
        if days_since_app >= cfg["responded_subsequent"]:
            return "overdue"
        return "waiting"
    if status == "interview":
        if days_since_app >= cfg["interview_thankyou"]:
            return "overdue"
        return "waiting"
    return "waiting"


def compute_next_followup_date(
    status: str,
    app_date: str,
    last_followup_date: str | None,
    followup_count: int,
    cadence: dict[str, int] | None = None,
) -> str | None:
    cfg = cadence or DEFAULT_CADENCE
    if status == "applied":
        if followup_count >= cfg["applied_max_followups"]:
            return None
        if followup_count == 0:
            return add_days(app_date, cfg["applied_first"])
        if last_followup_date:
            return add_days(last_followup_date, cfg["applied_subsequent"])
        return add_days(app_date, cfg["applied_first"])
    if status == "responded":
        if last_followup_date:
            return add_days(last_followup_date, cfg["responded_subsequent"])
        return add_days(app_date, cfg["responded_initial"])
    if status == "interview":
        return add_days(app_date, cfg["interview_thankyou"])
    return None


def analyze_followups(
    apps: list[dict[str, Any]],
    followups: list[dict[str, Any]] | None = None,
    overrides: dict[int, dict[str, Any]] | None = None,
    *,
    analysis_date: date | str | None = None,
    cadence: dict[str, int] | None = None,
    overdue_only: bool = False,
    apps_file: str | Path = PROJECT_ROOT / "data/applications.md",
    repo_root: str | Path = PROJECT_ROOT,
) -> dict[str, Any]:
    if not apps:
        return {"error": "No applications found in tracker."}
    cfg = cadence or DEFAULT_CADENCE
    now = parse_date(analysis_date) if isinstance(analysis_date, str) else (analysis_date or today())
    followups = followups or []
    overrides = overrides or {}
    by_app: dict[int, list[dict[str, Any]]] = {}
    for followup in followups:
        by_app.setdefault(int(followup["appNum"]), []).append(followup)

    entries: list[dict[str, Any]] = []
    for app in apps:
        normalized = normalize_status(app.get("status", ""))
        if normalized not in ACTIONABLE_STATUSES:
            continue
        applied_date = parse_applied_date(app.get("notes")) or app.get("date", "")
        app_date = parse_date(applied_date)
        if app_date is None:
            continue
        days_since_app = days_between(app_date, now)
        app_followups = by_app.get(int(app["num"]), [])
        followup_count = len(app_followups)
        last_followup_date = None
        days_since_last = None
        if app_followups:
            sorted_followups = sorted(app_followups, key=lambda item: item["date"], reverse=True)
            last_followup_date = sorted_followups[0]["date"]
            if parsed_last := parse_date(last_followup_date):
                days_since_last = days_between(parsed_last, now)
        urgency = compute_urgency(normalized, days_since_app, days_since_last, followup_count, cfg)
        next_date = compute_next_followup_date(normalized, applied_date, last_followup_date, followup_count, cfg)
        next_override = resolve_next_override(overrides.get(int(app["num"])), last_followup_date)
        if next_override:
            next_date = next_override
            parsed_next_override = parse_date(next_override)
            urgency = "overdue" if parsed_next_override and days_between(parsed_next_override, now) >= 0 else "waiting"
        parsed_next = parse_date(next_date)
        days_until_next = days_between(now, parsed_next) if parsed_next else None
        entries.append(
            {
                "num": app["num"],
                "date": app.get("date", ""),
                "appliedDate": applied_date,
                "company": app.get("company", ""),
                "via": app.get("via") if app.get("via") and app.get("via") != "—" else None,
                "role": app.get("role", ""),
                "status": normalized,
                "score": app.get("score", ""),
                "notes": app.get("notes", ""),
                "reportPath": resolve_report_path(app.get("report", ""), apps_file, repo_root),
                "contacts": extract_contacts(app.get("notes", "")),
                "daysSinceApplication": days_since_app,
                "daysSinceLastFollowup": days_since_last,
                "followupCount": followup_count,
                "urgency": urgency,
                "nextFollowupDate": next_date,
                "nextOverride": next_override,
                "daysUntilNext": days_until_next,
            }
        )
    urgency_order = {"urgent": 0, "overdue": 1, "waiting": 2, "cold": 3}
    entries.sort(key=lambda item: urgency_order.get(item["urgency"], 9))
    filtered = [entry for entry in entries if entry["urgency"] in {"overdue", "urgent"}] if overdue_only else entries
    return {
        "metadata": {
            "analysisDate": now.isoformat(),
            "totalTracked": len(apps),
            "actionable": len(entries),
            "overdue": sum(1 for entry in entries if entry["urgency"] == "overdue"),
            "urgent": sum(1 for entry in entries if entry["urgency"] == "urgent"),
            "cold": sum(1 for entry in entries if entry["urgency"] == "cold"),
            "waiting": sum(1 for entry in entries if entry["urgency"] == "waiting"),
        },
        "entries": filtered,
        "cadenceConfig": cfg,
    }


def load_tracker(path: str | Path) -> list[dict[str, Any]]:
    file_path = Path(path)
    return parse_tracker_content(file_path.read_text(encoding="utf-8")) if file_path.exists() else []


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analyze career-ops follow-up cadence.")
    parser.add_argument("--tracker", default=str(PROJECT_ROOT / "data/applications.md" if (PROJECT_ROOT / "data/applications.md").exists() else PROJECT_ROOT / "applications.md"))
    parser.add_argument("--followups", default=str(DATA_DIR / "follow-ups.md"))
    parser.add_argument("--profile", default=os.environ.get("CAREER_OPS_PROFILE", str(CONFIG_DIR / "profile.yml")))
    parser.add_argument("--overdue-only", action="store_true")
    parser.add_argument("--applied-days", type=int)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    followups_text = Path(args.followups).read_text(encoding="utf-8") if Path(args.followups).exists() else ""
    result = analyze_followups(
        load_tracker(args.tracker),
        parse_followups_content(followups_text),
        parse_next_overrides(followups_text),
        cadence=resolve_cadence_config(args.profile, args.applied_days),
        overdue_only=args.overdue_only,
        apps_file=args.tracker,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if "error" in result else 0


if __name__ == "__main__":
    raise SystemExit(main())
