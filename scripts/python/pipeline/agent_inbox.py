#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from datetime import datetime
from pathlib import Path


DEFAULT_PATH = Path("data/agent-inbox.md")

HEADER = "\n".join(
    [
        "# Agent Inbox",
        "",
        "> **Agent protocol:** at the start of a career-ops session, read this file.",
        "> Run each unchecked item top-to-bottom. After each, mark it `[x]` and append",
        "> `-> result: <one line>`. Items that need live user input (a mock, a paste, a",
        "> decision) -> ask the user to start them instead of running them.",
        ">",
        "> Nothing here auto-submits — queued items are *intents* for you to action and",
        "> the user to review. Appended by hand, by a dashboard, or by agent-inbox.py.",
        "",
    ]
)


def inbox_path(value: str | Path | None = None) -> Path:
    if value is not None:
        return Path(value)
    env = os.environ.get("CAREER_OPS_INBOX")
    if env:
        return Path(env)
    return DEFAULT_PATH


def stamp(now: datetime | None = None) -> str:
    return (now or datetime.now()).strftime("%Y-%m-%d %H:%M")


def one_line(value: object) -> str:
    return " ".join(str(value if value is not None else "").split())


def ensure_gitignored(path: Path) -> None:
    if os.environ.get("CAREER_OPS_INBOX") or path != DEFAULT_PATH:
        return
    gitignore = Path(".gitignore")
    try:
        if not gitignore.exists():
            return
        text = gitignore.read_text(encoding="utf-8")
        if any(line.strip() == str(DEFAULT_PATH) for line in text.splitlines()):
            return
        gitignore.write_text(text.rstrip() + f"\n{DEFAULT_PATH}\n", encoding="utf-8")
    except Exception:
        return


def ensure_file(path: Path) -> None:
    if path.exists():
        return
    ensure_gitignored(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(HEADER, encoding="utf-8")


def parse_items(path: str | Path | None = None) -> list[dict[str, object]]:
    file_path = inbox_path(path)
    if not file_path.exists():
        return []
    items: list[dict[str, object]] = []
    for idx, line in enumerate(file_path.read_text(encoding="utf-8").split("\n")):
        stripped = line.strip()
        if not stripped.startswith("- [") or len(stripped) < 5:
            continue
        marker = stripped[3:4].lower()
        if marker not in {" ", "x"} or not stripped.startswith(f"- [{marker}]"):
            continue
        items.append({"line": idx, "done": marker == "x", "text": stripped[5:].strip()})
    return items


def add_request(text: str, path: str | Path | None = None, *, now: datetime | None = None) -> str:
    request = one_line(text)
    if not request:
        raise ValueError('add needs a request, e.g. agent_inbox.py add "evaluate https://..."')
    file_path = inbox_path(path)
    ensure_file(file_path)
    body = file_path.read_text(encoding="utf-8").rstrip()
    file_path.write_text(f"{body}\n- [ ] {stamp(now)} — {request}\n", encoding="utf-8")
    return request


def list_items(path: str | Path | None = None, *, all_items: bool = False) -> list[dict[str, object]]:
    items = parse_items(path)
    return items if all_items else [item for item in items if not item["done"]]


def resolve_item(number: int, path: str | Path | None = None, *, result: str = "") -> dict[str, object]:
    if number < 1:
        raise ValueError("resolve needs a 1-based item number")
    file_path = inbox_path(path)
    pending = [item for item in parse_items(file_path) if not item["done"]]
    try:
        target = pending[number - 1]
    except IndexError as exc:
        raise ValueError(f"no pending item #{number} ({len(pending)} pending)") from exc
    lines = file_path.read_text(encoding="utf-8").split("\n")
    line_idx = int(target["line"])
    updated = lines[line_idx].replace("[ ]", "[x]", 1)
    clean_result = one_line(result)
    if clean_result and "-> result:" not in updated and "→ result:" not in updated:
        updated += f" -> result: {clean_result}"
    lines[line_idx] = updated
    file_path.write_text("\n".join(lines), encoding="utf-8")
    return target


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Append/list/resolve career-ops agent inbox items.")
    sub = parser.add_subparsers(dest="cmd")
    add = sub.add_parser("add")
    add.add_argument("text", nargs="+")
    list_parser = sub.add_parser("list")
    list_parser.add_argument("--all", action="store_true", dest="all_items")
    resolve = sub.add_parser("resolve")
    resolve.add_argument("number", type=int)
    resolve.add_argument("--result", default="")
    parser.add_argument("--file")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    path = args.file
    try:
        if args.cmd == "add":
            text = add_request(" ".join(args.text), path)
            print(f"Queued: {text}")
            return 0
        if args.cmd == "list":
            items = list_items(path, all_items=args.all_items)
            if not items:
                print("Inbox is empty." if args.all_items else "No pending items.")
                return 0
            for idx, item in enumerate(items, 1):
                print(f"{idx:02d}. [{'x' if item['done'] else ' '}] {item['text']}")
            return 0
        if args.cmd == "resolve":
            item = resolve_item(args.number, path, result=args.result)
            print(f"Resolved #{args.number}: {item['text']}")
            return 0
    except ValueError as exc:
        print(f"agent-inbox.py: {exc}")
        return 1
    parser.print_usage()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

