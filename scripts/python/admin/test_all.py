#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

from scripts.python import PROJECT_ROOT


def discover_pytest_targets(root: str | Path = PROJECT_ROOT, only: str | None = None) -> list[str]:
    tests_dir = Path(root) / "scripts/python/tests"
    files = sorted(tests_dir.rglob("test_*.py"))
    if only:
        files = [file for file in files if only in file.relative_to(tests_dir).as_posix()]
    return [str(file.relative_to(root)) for file in files]


def run_command(
    cmd: list[str],
    *,
    root: str | Path = PROJECT_ROOT,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    result = runner(cmd, cwd=Path(root), text=True, capture_output=True)
    return {
        "cmd": cmd,
        "code": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "ok": result.returncode == 0,
    }


def run_python_suite(
    *,
    root: str | Path = PROJECT_ROOT,
    quick: bool = False,
    only: str | None = None,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    targets = discover_pytest_targets(root, only=only)
    if only and not targets:
        return {"ok": False, "error": f'no Python tests matched --only "{only}"', "steps": []}
    steps: list[dict[str, Any]] = []
    if not quick:
        steps.append(run_command([sys.executable, "-m", "compileall", "-q", "scripts/python"], root=root, runner=runner))
    pytest_cmd = [sys.executable, "-m", "pytest", *(targets or ["scripts/python/tests"]), "-q"]
    steps.append(run_command(pytest_cmd, root=root, runner=runner))
    return {"ok": all(step["ok"] for step in steps), "quick": quick, "only": only, "targets": targets, "steps": steps}


def format_result(result: dict[str, Any]) -> str:
    if result.get("error"):
        return f"FAIL: {result['error']}"
    lines = ["career-ops Python test suite"]
    for step in result.get("steps", []):
        status = "PASS" if step["ok"] else "FAIL"
        lines.append(f"{status}: {' '.join(step['cmd'])}")
        output = (step.get("stdout") or step.get("stderr") or "").strip()
        if output:
            lines.append(output)
    lines.append("OK" if result.get("ok") else "FAILED")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the career-ops Python script suite.")
    parser.add_argument("--quick", action="store_true", help="Skip compileall and run pytest only.")
    parser.add_argument("--only", help="Run only Python tests whose relative path contains this substring.")
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = run_python_suite(quick=args.quick, only=args.only)
    print(json.dumps(result, indent=2) if args.json else format_result(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
