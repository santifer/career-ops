#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from scripts.python.tracker.parse import parse_tracker_row, resolve_columns
from scripts.python.tracker.utils import resolve_tracker_path


STATUS_PRIORITY = {
    "interview": 0,
    "responded": 1,
    "applied": 2,
    "evaluated": 3,
    "offer": 4,
    "rejected": 5,
    "discarded": 6,
    "skip": 7,
}
LEGAL_SUFFIXES = ["incorporated", "inc", "corporation", "corp", "company", "co", "limited", "ltd", "llc", "llp", "lp", "plc"]
GENERIC_DESCRIPTORS = ["group", "holdings", "technologies", "technology", "solutions", "canada", "international"]


def normalize_status_key(status: str) -> str:
    return re.sub(r"\s+\d{4}-\d{2}-\d{2}.*$", "", str(status or "").replace("**", "")).strip().lower()


def normalize_company_name(name: str) -> str:
    key = str(name or "").lower()
    key = re.sub(r"\([^)]*\)", " ", key)
    key = key.replace("&", " and ")
    key = re.sub(r"[^a-z0-9 ]", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    changed = True
    while changed:
        changed = False
        for suffix in LEGAL_SUFFIXES:
            new = re.sub(rf"\s{suffix}$", "", key).strip()
            if new != key:
                key = new
                changed = True
    for word in GENERIC_DESCRIPTORS:
        new = re.sub(rf"\s{word}$", "", key).strip()
        if new != key:
            key = new
            break
    return key


def company_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0
    if a == b:
        return 1
    tokens_a = [token for token in a.split(" ") if token]
    tokens_b = [token for token in b.split(" ") if token]
    if not tokens_a or not tokens_b:
        return 0
    shorter, longer = (tokens_a, tokens_b) if len(tokens_a) <= len(tokens_b) else (tokens_b, tokens_a)
    longer_set = set(longer)
    overlap = sum(1 for token in shorter if token in longer_set)
    return 0 if overlap == 0 else (2 * overlap) / (len(tokens_a) + len(tokens_b))


COMPANY_LINE_PATTERNS = [
    re.compile(r"(?:^|\n)\s*company\s*[:\-]\s*(.+)", re.IGNORECASE),
    re.compile(r"interview(?:ing)?\s+(?:with|at)\s+([A-Z][\w.,&' -]{1,60}?)(?:[.,\n]|\s+for\s|\s+regarding\s|$)", re.IGNORECASE),
    re.compile(r"(?:phone screen|screening|interview)\s*[-–—:]\s*([A-Z][\w.,&' -]{1,60}?)(?:\s+opportunity)?(?:[.,\n]|$)", re.IGNORECASE),
    re.compile(r"schedule your (?:phone screen|interview)\s*(?:[-–—:]\s*)?([A-Z][\w.,&' -]{1,60}?)\s*opportunity", re.IGNORECASE),
]


def extract_company(text: str) -> str | None:
    if not text:
        return None
    for pattern in COMPANY_LINE_PATTERNS:
        match = pattern.search(text)
        if match and match.group(1):
            candidate = re.sub(r"[.,;:]+$", "", match.group(1).strip())
            if 2 <= len(candidate) <= 60:
                return candidate
    return None


def extract_date(text: str) -> str | None:
    if not text:
        return None
    iso = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", text)
    if iso:
        return iso.group(0)
    named = re.search(
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b",
        text,
        re.IGNORECASE,
    )
    if named:
        month = datetime.strptime(named.group(1).title(), "%B").month
        return f"{named.group(3)}-{month:02d}-{int(named.group(2)):02d}"
    return None


def extract_req_id(text: str) -> str | None:
    if not text:
        return None
    match = re.search(r"\b(?:req(?:uisition)?\.?\s*(?:id)?[:\s#]*|job\s*id[:\s#]*)([A-Z]{0,3}\d{3,10})\b", text, re.IGNORECASE)
    if not match:
        match = re.search(r"\b([A-Z]{1,3}\d{5,10})\b", text)
    return match.group(1) if match else None


def load_tracker(apps_file: str | Path | None = None) -> list[dict[str, Any]]:
    path = Path(apps_file) if apps_file else resolve_tracker_path()
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").split("\n")
    colmap = resolve_columns(lines)
    rows: list[dict[str, Any]] = []
    for line in lines:
        row = parse_tracker_row(line, colmap)
        if row:
            rows.append(asdict(row))
    return rows


def match_invite(signals: dict[str, Any], tracker_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not signals or not signals.get("company") or not isinstance(tracker_rows, list):
        return []
    target_key = normalize_company_name(signals["company"])
    if not target_key:
        return []
    scored: list[dict[str, Any]] = []
    for row in tracker_rows:
        row_key = normalize_company_name(row.get("company", ""))
        name_score = company_similarity(target_key, row_key)
        if name_score <= 0:
            continue
        confidence = name_score
        req_id = signals.get("reqId")
        notes = row.get("notes") or ""
        if req_id and req_id.lower() in notes.lower():
            confidence += 0.5
        status_rank = STATUS_PRIORITY.get(normalize_status_key(row.get("status", "")), 8)
        confidence += (7 - min(status_rank, 7)) * 0.01
        scored.append(
            {
                "appNumber": row.get("num"),
                "company": row.get("company"),
                "role": row.get("role"),
                "status": row.get("status"),
                "date": row.get("date"),
                "matchConfidence": round(confidence, 3),
            }
        )
    return sorted(scored, key=lambda item: item["matchConfidence"], reverse=True)


def analyze_invite(text: str, tracker_rows: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    signals = {"company": extract_company(text), "date": extract_date(text), "reqId": extract_req_id(text)}
    return {"signals": signals, "candidates": match_invite(signals, tracker_rows if tracker_rows is not None else load_tracker())}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Match an interview invite email to tracker candidates.")
    parser.add_argument("--file")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--tracker")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.file:
        text = Path(args.file).read_text(encoding="utf-8")
    else:
        text = sys.stdin.read()
    rows = load_tracker(args.tracker) if args.tracker else None
    result = analyze_invite(text, rows)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

