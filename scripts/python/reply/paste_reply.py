#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
import time
from pathlib import Path
from typing import Any

from scripts.python import DATA_DIR


def parse_file_input(raw: str) -> dict[str, str]:
    lines = raw.replace("\r\n", "\n").split("\n")
    subject = ""
    sender = ""
    idx = 0
    while idx < len(lines):
        if match := __import__("re").match(r"^Subject:\s*(.*)$", lines[idx], __import__("re").IGNORECASE):
            subject = match.group(1).strip()
            idx += 1
            continue
        if match := __import__("re").match(r"^From:\s*(.*)$", lines[idx], __import__("re").IGNORECASE):
            sender = match.group(1).strip()
            idx += 1
            continue
        break
    if idx < len(lines) and lines[idx] == "":
        idx += 1
    return {"subject": subject, "from": sender, "body": "\n".join(lines[idx:]).strip()}


def next_message_id() -> str:
    suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))
    return f"pasted-{int(time.time() * 1000)}-{suffix}"


def normalize_candidate(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "message_id": next_message_id(),
        "from": data.get("from") or "",
        "subject": data.get("subject") or "",
        "body_snippet": data.get("body") or "",
        "signal": None,
    }


def append_candidate(candidate: dict[str, Any], candidates_path: str | Path | None = None) -> int:
    path = Path(candidates_path or os.environ.get("CAREER_OPS_REPLY_CANDIDATES", DATA_DIR / "reply-candidates.json"))
    if path.exists():
        parsed = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(parsed, list):
            raise ValueError(f"Existing candidates file at {path} is not a JSON array")
        candidates = parsed
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        candidates = []
    candidates.append(candidate)
    tmp = Path(f"{path}.tmp")
    tmp.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    return len(candidates)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Append pasted email text to reply-candidates.json.")
    parser.add_argument("--file")
    parser.add_argument("--candidates-path")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    raw = Path(args.file).read_text(encoding="utf-8") if args.file else sys.stdin.read()
    input_data = parse_file_input(raw) if args.file else {"subject": "", "from": "", "body": raw.strip()}
    if not input_data["subject"] and not input_data["body"]:
        print("Error: no subject or body text found — nothing to add.", file=sys.stderr)
        return 1
    candidate = normalize_candidate(input_data)
    total = append_candidate(candidate, args.candidates_path)
    print(json.dumps({"added": True, "total": total, "candidate": candidate}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

