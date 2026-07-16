#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from scripts.python import DATA_DIR


HEADER_COMMENT = "\n".join(
    [
        "# assessments.tsv — append-only skills-assessment log (user layer). Never rewrite rows.",
        "# {YYYY-MM-DD}\\t{company}\\t{report#|-}\\t{platform}\\t{subject}\\t{threshold%|-}\\t{score%|-}\\t{stale_note}",
    ]
)


def parse_pct(raw: Any) -> float | None:
    value = str(raw if raw is not None else "").strip()
    if value.endswith("%"):
        value = value[:-1].strip()
    if not value or value in {"-", "?"} or value.lower() in {"n/a", "na", "null"}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_assessments(content: str) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    malformed: list[dict[str, str]] = []
    for line in str(content or "").split("\n"):
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        cells = [cell.strip() for cell in text.split("\t")]
        date, company, report_num, platform, subject, threshold, score, stale_note = (cells + [""] * 8)[:8]
        if len(cells) < 5 or not date or not company or not platform or not subject:
            malformed.append({"line": text[:80]})
            continue
        norm = lambda value: None if value in {"", "-"} else value
        rows.append(
            {
                "date": date,
                "company": company,
                "reportNum": norm(report_num),
                "platform": platform,
                "subject": subject,
                "threshold": parse_pct(threshold),
                "score": parse_pct(score),
                "staleNote": norm(stale_note),
            }
        )
    return {"rows": rows, "malformed": malformed}


def summarize(rows: list[dict[str, Any]], malformed: list[dict[str, str]] | None = None) -> dict[str, Any]:
    malformed = malformed or []
    by_platform: dict[str, dict[str, int]] = {}
    stale_flagged = 0
    for row in rows:
        agg = by_platform.setdefault(row["platform"], {"count": 0, "staleFlagged": 0, "passed": 0, "failed": 0, "unknownOutcome": 0})
        agg["count"] += 1
        if row.get("staleNote"):
            agg["staleFlagged"] += 1
            stale_flagged += 1
        if row.get("threshold") is not None and row.get("score") is not None:
            if row["score"] >= row["threshold"]:
                agg["passed"] += 1
            else:
                agg["failed"] += 1
        else:
            agg["unknownOutcome"] += 1
    return {
        "assessments": rows,
        "aggregates": {"byPlatform": by_platform},
        "quality": {
            "total": len(rows),
            "staleFlagged": stale_flagged,
            "withoutScore": sum(1 for row in rows if row.get("score") is None),
            "withoutThreshold": sum(1 for row in rows if row.get("threshold") is None),
            "malformedLines": malformed,
        },
    }


def build_row(fields: dict[str, Any], today: str) -> str:
    def req(name: str) -> str:
        value = str(fields.get(name) or "").strip()
        if not value:
            raise ValueError(f"--{name} is required")
        if "\t" in value or "\n" in value:
            raise ValueError(f"--{name} must not contain tabs or newlines")
        return value

    def opt(name: str) -> str:
        value = str(fields.get(name) or "").strip()
        if "\t" in value or "\n" in value:
            raise ValueError(f"--{name} must not contain tabs or newlines")
        return value or "-"

    def opt_pct(name: str) -> str:
        value = str(fields.get(name) or "").strip()
        if not value:
            return "-"
        if parse_pct(value) is None:
            raise ValueError(f'--{name} must be a percentage (e.g. 70 or 70%), got "{value}"')
        return value

    stale = opt("stale")
    return "\t".join([today, req("company"), opt("report"), req("platform"), req("subject"), opt_pct("threshold"), opt_pct("score"), "" if stale == "-" else stale])


def append_assessment(row: str, path: str | Path = DATA_DIR / "assessments.tsv") -> None:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if file_path.exists():
        existing = file_path.read_text(encoding="utf-8")
        prefix = "" if existing.endswith("\n") or existing == "" else "\n"
    else:
        prefix = HEADER_COMMENT + "\n"
    with file_path.open("a", encoding="utf-8") as handle:
        handle.write(prefix + row + "\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read or append career-ops assessment events.")
    sub = parser.add_subparsers(dest="cmd")
    add = sub.add_parser("add")
    add.add_argument("--company", required=True)
    add.add_argument("--report", default="")
    add.add_argument("--platform", required=True)
    add.add_argument("--subject", required=True)
    add.add_argument("--threshold", default="")
    add.add_argument("--score", default="")
    add.add_argument("--stale", default="")
    add.add_argument("--date", required=True)
    parser.add_argument("--file", default=str(DATA_DIR / "assessments.tsv"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd == "add":
        row = build_row(vars(args), args.date)
        append_assessment(row, args.file)
        print(json.dumps({"added": True, "row": row.split("\t")}, ensure_ascii=False, indent=2))
        return 0
    path = Path(args.file)
    parsed = parse_assessments(path.read_text(encoding="utf-8") if path.exists() else "")
    print(json.dumps(summarize(parsed["rows"], parsed["malformed"]), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

