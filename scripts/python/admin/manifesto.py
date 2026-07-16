#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from scripts.python import PROJECT_ROOT


PAGE = "https://career-ops.org/manifesto"


def manifesto_message(root: str | Path = PROJECT_ROOT) -> str:
    lines = [""]
    path = Path(root) / "MANIFESTO.md"
    if path.exists():
        content = path.read_text(encoding="utf-8").split("\n")
        if len(content) >= 6:
            lines.extend([f"  {content[4]}", f"  {content[5]}", ""])
    lines.append(f"Read it:  MANIFESTO.md  ·  {PAGE}")
    lines.append("Sign it:  takes 10 seconds, becomes a public signature with your name on the wall.")
    lines.append("")
    return "\n".join(lines)


def opener_for_platform(platform: str = sys.platform) -> tuple[str, list[str], bool]:
    if platform == "darwin":
        return "open", [PAGE], False
    if platform.startswith("win"):
        return "start", [PAGE], True
    return "xdg-open", [PAGE], False


def open_manifesto(platform: str = sys.platform) -> bool:
    cmd, args, shell = opener_for_platform(platform)
    try:
        subprocess.Popen([cmd, *args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, start_new_session=True, shell=shell)
        return True
    except Exception:
        return False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read The CareerOps Manifesto and optionally open the signing page.")
    parser.add_argument("--no-open", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(manifesto_message())
    if not args.no_open:
        open_manifesto()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
