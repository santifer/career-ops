#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any


APPLICATION_ANSWERS_HEADING = "## Application Answers"
VALID_STATES = {"filled", "submitted"}


def inline(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value if value is not None else "")).strip()


def value_text(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(filter(None, (inline(item) for item in value)))
    return str(value if value is not None else "").strip()


def pick(obj: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        value = obj.get(key) if isinstance(obj, dict) else None
        if isinstance(value, list):
            if value:
                return value
            continue
        if value is not None and str(value).strip():
            return value
    return ""


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def normalize_state(state: Any) -> str:
    normalized = inline(state or "filled").lower()
    if normalized not in VALID_STATES:
        raise ValueError(f"Application answer state must be one of: {', '.join(sorted(VALID_STATES))}")
    return normalized


def normalize_date(value: Any) -> str:
    return inline(value or date.today().isoformat())


def quote_block(value: Any) -> str:
    text = str(value if value is not None else "").replace("\r\n", "\n").strip()
    if not text:
        return "> Not recorded."
    return "\n".join(f"> {line}" for line in text.split("\n"))


def qa_lines(entries: list[dict[str, Any]], *, label_keys: list[str], value_keys: list[str], fallback: str) -> list[str]:
    if not entries:
        return ["- None captured."]
    lines: list[str] = []
    for idx, entry in enumerate(entries, 1):
        label = inline(pick(entry, label_keys)) or f"{fallback} {idx}"
        lines.extend([f"{idx}. **{label}**", "", quote_block(pick(entry, value_keys)), ""])
    return lines[:-1]


def compact_lines(entries: list[dict[str, Any]], *, label_keys: list[str], value_keys: list[str], fallback: str) -> list[str]:
    if not entries:
        return ["- None captured."]
    lines = []
    for idx, entry in enumerate(entries, 1):
        label = inline(pick(entry, label_keys)) or f"{fallback} {idx}"
        value = value_text(pick(entry, value_keys)) or "Not recorded"
        lines.append(f"{idx}. **{label}:** {value}")
    return lines


def file_lines(entries: list[dict[str, Any]]) -> list[str]:
    if not entries:
        return ["- None captured."]
    lines = []
    for idx, entry in enumerate(entries, 1):
        label = inline(pick(entry, ["field", "name", "label", "type"])) or f"File {idx}"
        file = inline(pick(entry, ["path", "file", "filename", "url"])) or "Not recorded"
        version = inline(pick(entry, ["version", "variant"]))
        lines.append(f"{idx}. **{label}:** {file + ' (' + version + ')' if version else file}")
    return lines


def normalize_application_answers_snapshot(snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    snapshot = snapshot or {}
    return {
        "date": normalize_date(snapshot.get("date")),
        "state": normalize_state(snapshot.get("state")),
        "freeText": as_list(snapshot.get("freeText") or snapshot.get("freeTextAnswers") or snapshot.get("answers")),
        "selections": as_list(snapshot.get("selections") or snapshot.get("selectedOptions")),
        "fieldValues": as_list(snapshot.get("fieldValues") or snapshot.get("otherFields") or snapshot.get("fields")),
        "files": as_list(snapshot.get("files") or snapshot.get("uploads") or snapshot.get("filesUsed")),
    }


def format_application_answers_section(snapshot: dict[str, Any] | None = None) -> str:
    normalized = normalize_application_answers_snapshot(snapshot)
    lines = [
        APPLICATION_ANSWERS_HEADING,
        "",
        f"**Date:** {normalized['date']}",
        f"**State:** {normalized['state']}",
        "",
        "### Free-text answers",
        "",
        *qa_lines(normalized["freeText"], label_keys=["question", "field", "label", "prompt"], value_keys=["answer", "response", "value", "text"], fallback="Answer"),
        "",
        "### Selections made",
        "",
        *compact_lines(normalized["selections"], label_keys=["question", "field", "label", "prompt"], value_keys=["selection", "selected", "answer", "value", "options"], fallback="Selection"),
        "",
        "### Other field values",
        "",
        *compact_lines(normalized["fieldValues"], label_keys=["question", "field", "label", "prompt"], value_keys=["answer", "response", "value", "text"], fallback="Field"),
        "",
        "### Files used",
        "",
        *file_lines(normalized["files"]),
    ]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines).strip()) + "\n"


def upsert_application_answers_section(report_text: str, snapshot: dict[str, Any] | None = None) -> str:
    report = str(report_text if report_text is not None else "").replace("\r\n", "\n")
    section = format_application_answers_section(snapshot).rstrip()
    match = re.search(r"^## Application Answers\s*$", report, re.MULTILINE)
    if not match:
        return report.rstrip() + "\n\n" + section + "\n"
    start = match.start()
    after_heading = match.end()
    next_match = re.search(r"^## .+$", report[after_heading:], re.MULTILINE)
    end = after_heading + next_match.start() if next_match else len(report)
    before = report[:start].rstrip()
    after = report[end:].lstrip()
    return "\n\n".join(part for part in [before, section, after] if part) + "\n"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Upsert application form answers into a report.")
    parser.add_argument("--report", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--state")
    parser.add_argument("--date")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    raw = sys.stdin.read() if args.input == "-" else Path(args.input).read_text(encoding="utf-8")
    data = json.loads(raw)
    snapshot = {**data, "date": args.date or data.get("date"), "state": args.state or data.get("state")}
    report = Path(args.report)
    updated = upsert_application_answers_section(report.read_text(encoding="utf-8"), snapshot)
    report.write_text(updated, encoding="utf-8")
    normalized = normalize_application_answers_snapshot(snapshot)
    print(json.dumps({"report": str(report.resolve()), "date": normalized["date"], "state": normalized["state"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

