#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Callable

from scripts.python import PROJECT_ROOT


def dashboard_output_name(platform: str = sys.platform) -> str:
    return "career-dashboard.exe" if platform.startswith("win") else "career-dashboard"


def build_dashboard(
    root: str | Path = PROJECT_ROOT,
    *,
    platform: str = sys.platform,
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> dict[str, object]:
    out = dashboard_output_name(platform)
    dashboard_dir = Path(root) / "dashboard"
    try:
        result = runner(["go", "build", "-o", out, "."], cwd=dashboard_dir)
    except FileNotFoundError:
        return {"ok": False, "output": out, "code": 1, "message": "Go toolchain not found. Install Go 1.24+ from https://go.dev/dl/ and retry."}
    code = int(getattr(result, "returncode", 1))
    if code != 0:
        return {"ok": False, "output": out, "code": code, "message": f"dashboard build failed with exit code {code}"}
    return {"ok": True, "output": out, "code": 0, "message": f"Built dashboard/{out} — run it with: npm run serve:dashboard (or dashboard/{out} --path .)"}


def build_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(description="Build the Go TUI dashboard.")


def main(argv: list[str] | None = None) -> int:
    build_parser().parse_args(argv)
    result = build_dashboard(runner=lambda *a, **kw: subprocess.run(*a, **kw, check=False))
    print(result["message"])
    return int(result["code"])


if __name__ == "__main__":
    raise SystemExit(main())
