#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from scripts.python import DATA_DIR, PROJECT_ROOT
from scripts.python.reply.reply_matcher import classify_reply, match_candidates
from scripts.python.tracker.parse import parse_tracker_row, resolve_columns
from scripts.python.tracker.utils import rebuild_row, write_file_atomic


DEFAULT_CANDIDATES_PATH = DATA_DIR / "reply-candidates.json"
DEFAULT_TRACKER_PATH = DATA_DIR / "applications.md"
DEFAULT_FOLLOWUPS_PATH = DATA_DIR / "follow-ups.md"


@dataclass(frozen=True)
class Recommendation:
    num: int
    company: str
    role: str
    oldStatus: str
    newStatus: str


def signal_description(text: str, signal: str | None) -> str:
    parts: list[str] = []
    if "简历通过" in text:
        parts.append("resume passed")
    if "微信小程序" in text or "WeChat mini-program" in text or "AI微信小程序" in text:
        parts.append("AI WeChat mini-program interview")
    return " + ".join(parts) if parts else signal or "none"


def ensure_candidates_file(path: str | Path) -> None:
    target = Path(path)
    if target.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(
            [
                {
                    "message_id": "msg1",
                    "from": "recruiter@wingyun.com",
                    "subject": "恭喜简历通过，杭州赢云贸易有限公司邀您面试",
                    "body_snippet": "您的首轮面试是AI微信小程序面试。面试形式：AI微信小程序面试，面试时长：约15~30分钟",
                    "signal": "interview_invite",
                },
                {
                    "message_id": "msg2",
                    "from": "hr@examplelabs.com",
                    "subject": "Update on your application for Full-stack Engineer",
                    "body_snippet": "很遗憾地通知您，您的简历与我们当前岗位的需求暂不匹配，不合适我司的要求，未能进入下一轮。",
                    "signal": "rejection",
                },
            ],
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def load_candidates(path: str | Path, *, create_default: bool = False) -> list[dict[str, Any]]:
    target = Path(path)
    if create_default:
        ensure_candidates_file(target)
    parsed = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(parsed, list):
        raise ValueError(f"Candidates file at {target} is not a JSON array")
    return [item for item in parsed if isinstance(item, dict)]


def load_tracker_apps(path: str | Path = DEFAULT_TRACKER_PATH) -> list[dict[str, Any]]:
    target = Path(path)
    if not target.exists():
        return []
    lines = target.read_text(encoding="utf-8").split("\n")
    colmap = resolve_columns(lines)
    apps: list[dict[str, Any]] = []
    for line in lines:
        row = parse_tracker_row(line, colmap)
        if row:
            apps.append(row.__dict__.copy())
    return apps


def load_followups(path: str | Path = DEFAULT_FOLLOWUPS_PATH) -> list[dict[str, Any]]:
    target = Path(path)
    if not target.exists():
        return []
    followups: list[dict[str, Any]] = []
    for line in target.read_text(encoding="utf-8").split("\n"):
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
        followups.append(
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
    return followups


def update_tracker_status(app_num: int, new_status: str, tracker_path: str | Path = DEFAULT_TRACKER_PATH) -> bool:
    target = Path(tracker_path)
    if not target.exists():
        return False
    lines = target.read_text(encoding="utf-8").split("\n")
    colmap = resolve_columns(lines)
    for idx, line in enumerate(lines):
        row = parse_tracker_row(line, colmap)
        if row and row.num == app_num:
            parts = [part.strip() for part in line.split("|")]
            parts[colmap["status"]] = new_status
            lines[idx] = rebuild_row(parts)
            write_file_atomic(target, "\n".join(lines))
            return True
    return False


def build_digest(candidates: list[dict[str, Any]], apps: list[dict[str, Any]], followups: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    followups = followups or []
    matches = match_candidates(candidates, apps, followups)
    by_id = {candidate.get("message_id"): candidate for candidate in candidates}
    apps_by_num = {app.get("num"): app for app in apps}
    items: list[dict[str, Any]] = []
    recommendations: list[Recommendation] = []

    for match in matches:
        candidate = by_id.get(match.get("message_id"), {})
        classification = classify_reply(candidate)
        app = apps_by_num.get(match.get("application_num"))
        header = f"{app.get('company')} — {app.get('role')}" if app else candidate.get("subject") or match.get("company_hint") or candidate.get("from") or "Unknown"
        signal = signal_description(f"{candidate.get('subject') or ''} {candidate.get('body_snippet') or ''}", candidate.get("signal"))
        item = {
            "message_id": match.get("message_id"),
            "header": header,
            "match": match,
            "classification": classification,
            "signal": signal if classification.get("type") == "Interview" and signal != "none" else None,
        }
        items.append(item)
        new_status = classification.get("suggestedTrackerUpdate")
        if app and new_status not in {"none", "Needs Review", None} and app.get("status") != new_status:
            recommendations.append(
                Recommendation(
                    num=int(app["num"]),
                    company=str(app.get("company") or ""),
                    role=str(app.get("role") or ""),
                    oldStatus=str(app.get("status") or ""),
                    newStatus=str(new_status),
                )
            )

    return {"count": len(candidates), "items": items, "recommendations": [rec.__dict__ for rec in recommendations]}


def run_reply_watch(
    candidates_path: str | Path = DEFAULT_CANDIDATES_PATH,
    tracker_path: str | Path = DEFAULT_TRACKER_PATH,
    followups_path: str | Path = DEFAULT_FOLLOWUPS_PATH,
    *,
    apply_updates: bool = False,
    create_default: bool = False,
) -> dict[str, Any]:
    candidates = load_candidates(candidates_path, create_default=create_default)
    apps = load_tracker_apps(tracker_path)
    followups = load_followups(followups_path)
    digest = build_digest(candidates, apps, followups)
    applied: list[int] = []
    if apply_updates:
        for rec in digest["recommendations"]:
            if update_tracker_status(int(rec["num"]), str(rec["newStatus"]), tracker_path):
                applied.append(int(rec["num"]))
    digest["applied"] = applied
    return digest


def format_digest(digest: dict[str, Any]) -> str:
    lines = [f"Today: {digest['count']} application updates need review", ""]
    for idx, item in enumerate(digest["items"], start=1):
        cls = item["classification"]
        lines.append(f"{idx}. {item['header']}")
        lines.append(f"   Type: {cls.get('type')}")
        if item.get("signal"):
            lines.append(f"   Signal: {item['signal']}")
        evidence = cls.get("evidence") or []
        if evidence:
            lines.append(f"   Evidence: {'; '.join(evidence)}")
        lines.append(f"   Suggested tracker update: {cls.get('suggestedTrackerUpdate')}")
        lines.append("")
    if digest["recommendations"]:
        lines.append("Suggested status updates to apply:")
        for rec in digest["recommendations"]:
            lines.append(f"  #{rec['num']} {rec['company']} ({rec['role']}): {rec['oldStatus']} -> {rec['newStatus']}")
    return "\n".join(lines).rstrip() + "\n"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Classify employer replies and generate a review digest.")
    parser.add_argument("candidates", nargs="?", default=str(DEFAULT_CANDIDATES_PATH))
    parser.add_argument("--tracker", default=str(DEFAULT_TRACKER_PATH))
    parser.add_argument("--followups", default=str(DEFAULT_FOLLOWUPS_PATH))
    parser.add_argument("--apply", action="store_true", help="Apply recommended tracker status updates without prompting.")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--create-default", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    digest = run_reply_watch(args.candidates, args.tracker, args.followups, apply_updates=args.apply, create_default=args.create_default)
    if args.json:
        print(json.dumps(digest, ensure_ascii=False, indent=2))
    else:
        print(format_digest(digest), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
