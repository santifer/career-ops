#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

from scripts.python import PROJECT_ROOT


EXCLUDES = {
    ".coderabbit.yaml",
    ".editorconfig",
    ".envrc",
    ".gitignore",
    ".npmignore",
    ".release-please-manifest.json",
    "release-please-config.json",
    "renovate.json",
    "flake.lock",
    "flake.nix",
    "batch/logs/.gitkeep",
    "batch/tracker-additions/.gitkeep",
    "interview-prep/.gitkeep",
}
EXCLUDE_PREFIXES = ["web/"]


def extract_array_from_source(source: str, name: str) -> list[str]:
    match = re.search(rf"const\s+{re.escape(name)}\s*=\s*\[([\s\S]*?)\];", source)
    if not match:
        return []
    return [item.group(1) for item in re.finditer(r"['\"]([^'\"]+)['\"]", match.group(1))]


def covered(file: str, all_paths: list[str]) -> bool:
    if file in EXCLUDES:
        return True
    if any(file.startswith(prefix) for prefix in EXCLUDE_PREFIXES):
        return True
    return any(file.startswith(path) if path.endswith("/") else file == path for path in all_paths)


def git_ls_files(root: str | Path = PROJECT_ROOT) -> list[str]:
    output = subprocess.check_output(["git", "ls-files"], cwd=Path(root), text=True)
    return [line for line in output.splitlines() if line]


def validate_paths_coverage(source: str, tracked_files: list[str]) -> dict[str, object]:
    system_paths = extract_array_from_source(source, "SYSTEM_PATHS")
    user_paths = extract_array_from_source(source, "USER_PATHS")
    if not system_paths or not user_paths:
        return {"ok": False, "error": "SYSTEM_PATHS or USER_PATHS not found in update-system.mjs", "orphans": []}
    all_paths = [*system_paths, *user_paths]
    orphans = [file for file in tracked_files if not covered(file, all_paths)]
    return {"ok": not orphans, "error": None, "orphans": orphans, "tracked": len(tracked_files)}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check updater SYSTEM_PATHS/USER_PATHS coverage.")
    parser.add_argument("--updater", default=str(PROJECT_ROOT / "scripts/js/update-system.mjs"))
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    updater = Path(args.updater)
    if not updater.exists():
        print("FAIL: update-system.mjs not found")
        return 1
    result = validate_paths_coverage(updater.read_text(encoding="utf-8"), git_ls_files(PROJECT_ROOT))
    if args.json:
        print(json.dumps(result, indent=2))
    elif result.get("error"):
        print(f"FAIL: {result['error']}")
    elif result["orphans"]:
        print("Coverage gap — tracked files not in SYSTEM_PATHS or USER_PATHS:")
        for orphan in result["orphans"]:
            print(f"  {orphan}")
    else:
        print(f"OK: {result['tracked']} tracked files covered by SYSTEM_PATHS or USER_PATHS")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
