#!/usr/bin/env python3
"""
Inventory docs/exec-plans and surface consolidation candidates.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


STATUS_PATTERN = re.compile(r"^\*\*Status:\*\*\s*(.+?)\s*$", re.MULTILINE)
FINAL_OUTCOME_PATTERN = re.compile(
    r"^## Final Outcome\s+(.+?)(?:\n## |\Z)", re.MULTILINE | re.DOTALL
)
DATE_PREFIX_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}-")
WORD_PATTERN = re.compile(r"[a-z0-9]+")
STOPWORDS = {
    "a",
    "add",
    "an",
    "and",
    "build",
    "change",
    "commit",
    "commits",
    "completed",
    "consolidator",
    "consolidate",
    "create",
    "current",
    "dashboard",
    "docs",
    "evaluation",
    "exec",
    "execution",
    "file",
    "files",
    "fix",
    "for",
    "group",
    "in",
    "into",
    "log",
    "new",
    "of",
    "on",
    "plan",
    "plans",
    "review",
    "skill",
    "summary",
    "the",
    "to",
    "update",
    "work",
}
ACTIVE_STATUSES = {"in_progress", "pending", "active", "open", "todo", "blocked"}
COMPLETED_STATUSES = {"completed", "done", "closed"}
IGNORE_NAMES = {"tech-debt-tracker.md", "README.md"}
IGNORE_PARTS = {"archive", "summaries"}


@dataclass
class PlanFile:
    path: str
    status: str
    slug: str
    tokens: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect docs/exec-plans and identify consolidation candidates."
    )
    parser.add_argument(
        "--plans-dir",
        default="docs/exec-plans",
        help="Path to the execution plan directory",
    )
    parser.add_argument(
        "--completed-threshold",
        type=int,
        default=3,
        help="Minimum related completed plans before recommending consolidation",
    )
    parser.add_argument(
        "--active-threshold",
        type=int,
        default=1,
        help="Maximum active plans per token before warning about sprawl",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of text",
    )
    return parser.parse_args()


def load_plan(path: Path) -> PlanFile:
    content = path.read_text(encoding="utf-8")
    status_match = STATUS_PATTERN.search(content)
    raw_status = status_match.group(1).strip() if status_match else infer_status(content)
    normalized_status = normalize_status(raw_status)
    slug = DATE_PREFIX_PATTERN.sub("", path.stem)
    tokens = tokenize_slug(slug)
    return PlanFile(
        path=str(path),
        status=normalized_status,
        slug=slug,
        tokens=tokens,
    )


def tokenize_slug(slug: str) -> list[str]:
    words = WORD_PATTERN.findall(slug.lower())
    return [
        word
        for word in words
        if len(word) >= 3 and not word.isdigit() and word not in STOPWORDS
    ]


def infer_status(content: str) -> str:
    final_outcome_match = FINAL_OUTCOME_PATTERN.search(content)
    if not final_outcome_match:
        return "unknown"
    summary = final_outcome_match.group(1).strip().lower()
    if summary.startswith("completed") or summary.startswith("complete"):
        return "completed"
    if summary.startswith("implemented"):
        return "implemented"
    if summary.startswith("pending"):
        return "pending"
    return "unknown"


def normalize_status(status: str) -> str:
    normalized = status.strip().lower().replace(" ", "_")
    aliases = {
        "complete": "completed",
        "implemented": "completed",
        "done": "completed",
        "in_progress": "in_progress",
        "pending": "in_progress",
        "blocked": "blocked",
        "unknown": "unknown",
    }
    return aliases.get(normalized, normalized)


def is_active(status: str) -> bool:
    return status in ACTIVE_STATUSES or status not in COMPLETED_STATUSES


def is_completed(status: str) -> bool:
    return status in COMPLETED_STATUSES


def discover_plans(plans_dir: Path) -> list[PlanFile]:
    results: list[PlanFile] = []
    for path in sorted(plans_dir.rglob("*.md")):
        if path.name in IGNORE_NAMES:
            continue
        if any(part in IGNORE_PARTS for part in path.parts):
            continue
        results.append(load_plan(path))
    return results


def group_by_token(plans: Iterable[PlanFile]) -> dict[str, list[PlanFile]]:
    groups: dict[str, list[PlanFile]] = defaultdict(list)
    for plan in plans:
        for token in set(plan.tokens):
            groups[token].append(plan)
    return dict(groups)


def discover_surface_files(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(path for path in directory.glob("*.md") if path.is_file())


def ordinary_summary_files(summary_files: list[Path]) -> list[str]:
    return [str(path) for path in summary_files if not path.name.startswith("summary-")]


def archive_detail_files(archive_files: list[Path]) -> list[str]:
    return [str(path) for path in archive_files if not path.name.startswith("stub-")]


def archive_stub_files(archive_files: list[Path]) -> list[str]:
    return [str(path) for path in archive_files if path.name.startswith("stub-")]


def build_report(
    plans: list[PlanFile], completed_threshold: int, active_threshold: int
) -> dict[str, object]:
    root = Path("docs/exec-plans")
    summary_files = discover_surface_files(root / "summaries")
    archive_files = discover_surface_files(root / "archive")
    active_plans = [plan for plan in plans if is_active(plan.status)]
    completed_plans = [plan for plan in plans if is_completed(plan.status)]

    active_groups = {
        token: sorted(group, key=lambda plan: plan.path)
        for token, group in group_by_token(active_plans).items()
        if len(group) > active_threshold
    }
    completed_groups = {
        token: sorted(group, key=lambda plan: plan.path)
        for token, group in group_by_token(completed_plans).items()
        if len(group) >= completed_threshold
    }

    status_counts = Counter(plan.status for plan in plans)
    return {
        "plans_dir": str(root),
        "total_plans": len(plans),
        "status_counts": dict(sorted(status_counts.items())),
        "active_plans": [asdict(plan) for plan in active_plans],
        "summary_file_count": len(summary_files),
        "ordinary_summary_files": ordinary_summary_files(summary_files),
        "archive_file_count": len(archive_files),
        "archive_detail_files": archive_detail_files(archive_files),
        "archive_stub_files": archive_stub_files(archive_files),
        "active_sprawl_groups": {
            token: [asdict(plan) for plan in group]
            for token, group in sorted(active_groups.items())
        },
        "completed_consolidation_groups": {
            token: [asdict(plan) for plan in group]
            for token, group in sorted(completed_groups.items())
        },
    }


def print_text(report: dict[str, object]) -> None:
    print(f"Plans dir: {report['plans_dir']}")
    print(f"Total plans: {report['total_plans']}")
    print("Status counts:")
    for status, count in report["status_counts"].items():
        print(f"  - {status}: {count}")

    active_plans = report["active_plans"]
    print("\nActive plans:")
    if active_plans:
      for plan in active_plans:
        print(f"  - {plan['path']} [{plan['status']}]")
    else:
        print("  - none")

    print(f"\nSummary files: {report['summary_file_count']}")
    ordinary_summaries = report["ordinary_summary_files"]
    print("Ordinary summary files:")
    if ordinary_summaries:
        for path in ordinary_summaries:
            print(f"  - {path}")
    else:
        print("  - none")

    print(f"\nArchive files: {report['archive_file_count']}")
    detail_files = report["archive_detail_files"]
    print("Archive detail files:")
    if detail_files:
        for path in detail_files:
            print(f"  - {path}")
    else:
        print("  - none")

    stub_files = report["archive_stub_files"]
    print("Archive stub files:")
    if stub_files:
        for path in stub_files:
            print(f"  - {path}")
    else:
        print("  - none")

    active_sprawl = report["active_sprawl_groups"]
    print("\nActive sprawl groups:")
    if active_sprawl:
        for token, group in active_sprawl.items():
            print(f"  - {token} ({len(group)})")
            for plan in group:
                print(f"      * {plan['path']}")
    else:
        print("  - none")

    completed_groups = report["completed_consolidation_groups"]
    print("\nCompleted consolidation candidates:")
    if completed_groups:
        for token, group in completed_groups.items():
            print(f"  - {token} ({len(group)})")
            for plan in group:
                print(f"      * {plan['path']}")
    else:
        print("  - none")


def main() -> int:
    args = parse_args()
    plans_dir = Path(args.plans_dir).resolve()
    plans = discover_plans(plans_dir)
    report = build_report(plans, args.completed_threshold, args.active_threshold)
    report["plans_dir"] = str(plans_dir)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_text(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
