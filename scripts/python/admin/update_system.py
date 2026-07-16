#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from scripts.python import PROJECT_ROOT
from scripts.python.admin.validate_paths import extract_array_from_source


CANONICAL_REPO = "https://github.com/santifer/career-ops.git"
RAW_VERSION_URL = "https://raw.githubusercontent.com/santifer/career-ops/main/VERSION"
RELEASES_API = "https://api.github.com/repos/santifer/career-ops/releases/latest"
SEMVER_RE = re.compile(r"(?:^|-)v?(\d+\.\d+\.\d+)$", re.I)

DEFAULT_GIT_TIMEOUT_MS = 120_000
DEFAULT_GIT_FETCH_TIMEOUT_MS = 300_000
NPM_INSTALL_TIMEOUT_MS = 60_000
PLAYWRIGHT_INSTALL_TIMEOUT_MS = 120_000
DASHBOARD_REBUILD_TIMEOUT_MS = 60_000
UPDATE_PATH_CHECKOUT_BUDGET_MS = 5_000
REEXEC_BUFFER_TIMEOUT_MS = 60_000

FALLBACK_SYSTEM_PATHS = ["modes/", "scripts/js/", "scripts/python/", "templates/", "docs/", "VERSION", "README.md"]
FALLBACK_BOOTSTRAP_PATHS = ["providers/", "tracker-parse.mjs", "tracker-utils.mjs", "update-system.mjs"]
FALLBACK_USER_PATHS = [
    "cv.md",
    "config/profile.yml",
    "modes/_profile.md",
    "modes/_custom.md",
    "voice-dna.md",
    "portals.yml",
    "article-digest.md",
    "interview-prep/",
    "data/",
    "reports/",
    "output/",
    "jds/",
    "writing-samples/",
    "config/plugins.yml",
    "plugins.local/",
    "plugins.lock",
    ".claude/settings.json",
    ".claude/hooks/",
]


def parse_positive_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(str(value or ""), 10)
    except Exception:
        return fallback
    return parsed if parsed > 0 else fallback


def env_int(name: str, fallback: int, env: dict[str, str] | None = None) -> int:
    source = env if env is not None else os.environ
    return parse_positive_int(source.get(name), fallback)


def parse_version_file(raw: str) -> str:
    return str(raw or "").strip().split()[0] if str(raw or "").strip() else ""


def local_version(root: str | Path = PROJECT_ROOT) -> str:
    version = Path(root) / "VERSION"
    return parse_version_file(version.read_text(encoding="utf-8")) if version.exists() else "0.0.0"


def compare_versions(a: str, b: str) -> int:
    left = [int(part) if part.isdigit() else 0 for part in str(a or "0.0.0").split(".")[:3]]
    right = [int(part) if part.isdigit() else 0 for part in str(b or "0.0.0").split(".")[:3]]
    left += [0] * (3 - len(left))
    right += [0] * (3 - len(right))
    return -1 if left < right else 1 if left > right else 0


def update_backup_branch_name(version: str, when: datetime | None = None) -> str:
    stamp = (when or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"backup-pre-update-{version}-{stamp}"


def backup_timestamp(branch_name: str) -> int:
    match = re.search(r"-(\d{8}T\d{6}Z)$", branch_name or "")
    if not match:
        return 0
    try:
        return int(datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).timestamp() * 1000)
    except ValueError:
        return 0


def newest_backup_branch(branches: str) -> str | None:
    branch_list = [line.strip() for line in str(branches or "").splitlines() if line.strip()]
    if not branch_list:
        return None
    timestamped = sorted(
        [(branch, backup_timestamp(branch)) for branch in branch_list if backup_timestamp(branch) > 0],
        key=lambda item: item[1],
        reverse=True,
    )
    return timestamped[0][0] if timestamped else branch_list[0]


def git_timeout_ms(args: list[str], env: dict[str, str] | None = None) -> int:
    if args and args[0] == "fetch":
        return env_int("CAREER_OPS_GIT_FETCH_TIMEOUT_MS", max(env_int("CAREER_OPS_GIT_TIMEOUT_MS", DEFAULT_GIT_TIMEOUT_MS, env), DEFAULT_GIT_FETCH_TIMEOUT_MS), env)
    return env_int("CAREER_OPS_GIT_TIMEOUT_MS", DEFAULT_GIT_TIMEOUT_MS, env)


def reexec_timeout_ms(update_path_count: int, env: dict[str, str] | None = None) -> int:
    git_default = env_int("CAREER_OPS_GIT_TIMEOUT_MS", DEFAULT_GIT_TIMEOUT_MS, env)
    fetch_default = env_int("CAREER_OPS_GIT_FETCH_TIMEOUT_MS", max(git_default, DEFAULT_GIT_FETCH_TIMEOUT_MS), env)
    return max(
        120_000,
        fetch_default
        + git_default * 3
        + env_int("CAREER_OPS_UPDATE_PATH_CHECKOUT_BUDGET_MS", UPDATE_PATH_CHECKOUT_BUDGET_MS, env) * max(0, update_path_count)
        + env_int("CAREER_OPS_NPM_INSTALL_TIMEOUT_MS", NPM_INSTALL_TIMEOUT_MS, env)
        + env_int("CAREER_OPS_PLAYWRIGHT_INSTALL_TIMEOUT_MS", PLAYWRIGHT_INSTALL_TIMEOUT_MS, env)
        + env_int("CAREER_OPS_DASHBOARD_REBUILD_TIMEOUT_MS", DASHBOARD_REBUILD_TIMEOUT_MS, env)
        + env_int("CAREER_OPS_REEXEC_BUFFER_TIMEOUT_MS", REEXEC_BUFFER_TIMEOUT_MS, env),
    )


def merge_path_lists(*lists: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for items in lists:
        for item in items:
            if item in seen:
                continue
            seen.add(item)
            merged.append(item)
    return merged


def relative_import_specifiers(source: str) -> list[str]:
    specs = set()
    for pattern in [r"\b(?:import|export)\b[^;]*?\bfrom\s*['\"]([^'\"]+)['\"]", r"\bimport\s*['\"]([^'\"]+)['\"]"]:
        for match in re.finditer(pattern, source):
            specs.add(match.group(1))
    return sorted(spec for spec in specs if spec.startswith("."))


def resolve_relative_path(base_file: str, specifier: str) -> str:
    return str(PurePosixPath(base_file).parent.joinpath(specifier))


def resolve_reexec_checkout(
    entry: str,
    *,
    show_file: Callable[[str], str],
    fallback_files: list[str] | None = None,
) -> list[str]:
    fallback_files = fallback_files or ["update-system.mjs", "scaffolder/bin/skill-entrypoints.mjs"]
    visited: set[str] = set()
    present: set[str] = set()
    order: list[str] = []
    stack = [entry]
    while stack:
        file = stack.pop()
        if file in visited:
            continue
        visited.add(file)
        try:
            source = show_file(file)
        except Exception:
            continue
        present.add(file)
        order.append(file)
        for spec in relative_import_specifiers(source):
            stack.append(resolve_relative_path(file, spec))
    for file in fallback_files:
        if file in present:
            continue
        try:
            show_file(file)
        except Exception:
            continue
        present.add(file)
        order.append(file)
    return order


def parse_semver(value: str) -> str:
    match = SEMVER_RE.search(str(value or "").strip())
    return match.group(1) if match else ""


def default_fetch_text(url: str, *, headers: dict[str, str] | None = None, timeout: int = 12) -> str | None:
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace").strip()
    except (OSError, urllib.error.URLError, urllib.error.HTTPError):
        return None


def check_update(
    *,
    root: str | Path = PROJECT_ROOT,
    fetch_text: Callable[..., str | None] = default_fetch_text,
) -> dict[str, Any]:
    project = Path(root)
    if (project / ".update-dismissed").exists():
        return {"status": "dismissed"}
    local = local_version(project)
    raw_version = fetch_text(RAW_VERSION_URL)
    release_raw = fetch_text(
        RELEASES_API,
        headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "career-ops-update-checker"},
    )

    remote = parse_semver(parse_version_file(raw_version or "")) if raw_version is not None else ""
    release_version = ""
    changelog = ""
    if release_raw is not None:
        try:
            release = json.loads(release_raw)
            changelog = str(release.get("body") or "")
            release_version = parse_semver(str(release.get("tag_name") or ""))
        except Exception:
            pass

    if not remote and not release_version:
        return {"status": "offline" if raw_version is None and release_raw is None else "no-remote-version", "local": local}
    if not remote or (release_version and compare_versions(release_version, remote) > 0):
        remote = release_version
    if compare_versions(local, remote) >= 0:
        return {"status": "up-to-date", "local": local, "remote": remote}
    return {"status": "update-available", "local": local, "remote": remote, "changelog": changelog[:500]}


def dismiss_update(root: str | Path = PROJECT_ROOT, when: datetime | None = None) -> Path:
    file = Path(root) / ".update-dismissed"
    file.write_text((when or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat(), encoding="utf-8")
    return file


def load_updater_path_lists(source: str) -> dict[str, list[str]]:
    return {
        "system": extract_array_from_source(source, "SYSTEM_PATHS") or FALLBACK_SYSTEM_PATHS,
        "bootstrap": extract_array_from_source(source, "BOOTSTRAP_PATHS") or FALLBACK_BOOTSTRAP_PATHS,
        "user": extract_array_from_source(source, "USER_PATHS") or FALLBACK_USER_PATHS,
    }


def path_matches(path: str, pattern: str) -> bool:
    return path.startswith(pattern) if pattern.endswith("/") else path == pattern


def is_system_path(path: str, system_paths: list[str]) -> bool:
    return any(path_matches(path, pattern) for pattern in system_paths)


def is_user_path(path: str, user_paths: list[str]) -> bool:
    return any(path_matches(path, pattern) for pattern in user_paths)


def safety_violations(
    status_paths: list[str],
    *,
    initial_status_paths: set[str] | None = None,
    system_paths: list[str],
    user_paths: list[str],
) -> list[str]:
    initial = initial_status_paths or set()
    violations = []
    for path in status_paths:
        if path in initial:
            continue
        if is_system_path(path, system_paths):
            continue
        if is_user_path(path, user_paths):
            violations.append(path)
    return violations


def git_status_entries(root: str | Path = PROJECT_ROOT, runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run) -> list[dict[str, str]]:
    result = runner(["git", "status", "--porcelain"], cwd=Path(root), text=True, capture_output=True, check=True)
    return [{"code": line[:2], "path": line[3:]} for line in result.stdout.splitlines() if line]


def git_in(root: str | Path, *args: str, runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run) -> str:
    timeout = git_timeout_ms(list(args))
    try:
        result = runner(["git", *args], cwd=Path(root), text=True, capture_output=True, check=True, timeout=timeout / 1000)
        return result.stdout.strip()
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"git {' '.join(args)} timed out after {timeout // 1000}s") from exc


def git_root(root: str | Path = PROJECT_ROOT) -> str:
    return str(Path(root))


def git_fetch(root: str | Path, remote: str) -> None:
    git_in(root, "fetch", remote, "main")


def git_checkout_paths(root: str | Path, ref: str, paths: list[str]) -> list[str]:
    updated: list[str] = []
    for path in paths:
        try:
            git_in(root, "checkout", ref, "--", path)
            updated.append(path)
        except Exception:
            pass
    return updated


def revert_paths(root: str | Path, paths: list[str]) -> None:
    for p in paths:
        try:
            git_in(root, "checkout", "HEAD", "--", p)
        except Exception:
            pathspec = p.rstrip("/")
            exists_in_head = True
            try:
                git_in(root, "cat-file", "-e", f"HEAD:{pathspec}")
            except Exception:
                exists_in_head = False
            if exists_in_head:
                raise
            try:
                git_in(root, "rm", "-r", "-f", "--ignore-unmatch", "--", pathspec)
            except Exception:
                pass
            try:
                import shutil
                target = Path(root) / pathspec
                if target.is_dir():
                    shutil.rmtree(target, ignore_errors=True)
                elif target.exists():
                    target.unlink(missing_ok=True)
            except Exception:
                pass


def add_paths(root: str | Path, paths: list[str]) -> None:
    if paths:
        git_in(root, "add", "--", *paths)


def apply_update(
    *,
    root: str | Path = PROJECT_ROOT,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    project = Path(root)
    is_reexec = os.environ.get("CAREER_OPS_UPDATE_REEXEC") == "1"
    lock_file = project / ".update-lock"

    if lock_file.exists() and not is_reexec:
        return {"error": "Update already in progress (.update-lock exists). If stuck, delete it manually.", "code": "lock_exists"}

    if not is_reexec:
        lock_file.write_text(datetime.now(timezone.utc).isoformat(), encoding="utf-8")

    try:
        local = local_version(project)
        initial_status_paths = {entry["path"] for entry in git_status_entries(project, runner)}

        if not is_reexec:
            try:
                wip = git_in(project, "stash", "create")
                if wip:
                    git_in(project, "update-ref", f"refs/backup-pre-update-wip/{local}", wip)
            except Exception:
                pass
            backup_branch = os.environ.get("CAREER_OPS_UPDATE_BACKUP_BRANCH") or update_backup_branch_name(local)
            try:
                git_in(project, "branch", backup_branch)
            except Exception:
                pass

        git_fetch(project, CANONICAL_REPO)

        if not is_reexec:
            try:
                reexec_files = resolve_reexec_checkout(
                    "FETCH_HEAD",
                    "update-system.mjs",
                    show_file=lambda path: git_in(project, "show", f"FETCH_HEAD:{path}"),
                )
                git_in(project, "checkout", "FETCH_HEAD", "--", *reexec_files)
                env = {**os.environ, "CAREER_OPS_UPDATE_REEXEC": "1", "CAREER_OPS_UPDATE_BACKUP_BRANCH": backup_branch}
                timeout_s = reexec_timeout_ms(len(reexec_files)) / 1000
                subprocess.run(
                    [sys.executable, str(project / "scripts" / "python" / "admin" / "update_system.py"), "apply"],
                    cwd=str(project),
                    timeout=timeout_s,
                    env=env,
                    check=True,
                )
                return {"status": "reexecuted", "local": local}
            except Exception as exc:
                return {"error": f"Updater self-reexec failed: {exc}", "code": "reexec_failed"}

        remote_system_paths: list[str] = []
        try:
            remote_updater_source = git_in(project, "show", "FETCH_HEAD:update-system.mjs")
            remote_system_paths = extract_array_from_source(remote_updater_source, "SYSTEM_PATHS") or []
        except Exception:
            pass

        update_paths = merge_path_lists(FALLBACK_SYSTEM_PATHS, remote_system_paths, FALLBACK_BOOTSTRAP_PATHS)
        updated = git_checkout_paths(project, "FETCH_HEAD", update_paths)

        violated_user_paths = set()
        try:
            for entry in git_status_entries(project, runner):
                file_path = entry["path"]
                if file_path in initial_status_paths:
                    continue
                if file_path in updated:
                    continue
                if is_user_path(file_path, FALLBACK_USER_PATHS):
                    violated_user_paths.add(file_path)
        except Exception as exc:
            revert_paths(project, updated)
            return {"error": f"Could not validate user-layer safety ({exc})", "code": "validation_failed"}

        if violated_user_paths:
            try:
                revert_paths(project, updated)
            except Exception:
                pass
            return {"error": "Update aborted: user files were touched.", "code": "safety_violation", "files": sorted(violated_user_paths)}

        try:
            subprocess.run(["npm", "install", "--silent"], cwd=str(project), timeout=NPM_INSTALL_TIMEOUT_MS / 1000, check=False)
        except Exception:
            pass

        try:
            subprocess.run(["npx", "playwright", "install", "chromium"], cwd=str(project), timeout=PLAYWRIGHT_INSTALL_TIMEOUT_MS / 1000, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

        remote = local_version(project)
        try:
            dismiss_file = project / ".update-dismissed"
            paths_to_stage = list(updated)
            if dismiss_file.exists():
                dismiss_file.unlink()
                paths_to_stage.append(".update-dismissed")
            add_paths(project, paths_to_stage)
            git_in(project, "commit", "-m", f"chore: auto-update system files to v{remote}", "--", *paths_to_stage)
        except Exception:
            pass

        return {"status": "updated", "local": local, "remote": remote, "updatedCount": len(updated)}
    finally:
        if not is_reexec and lock_file.exists():
            lock_file.unlink(missing_ok=True)


def rollback(root: str | Path = PROJECT_ROOT, runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run) -> dict[str, Any]:
    project = Path(root)
    try:
        branches_output = git_in(project, "for-each-ref", "--sort=-committerdate", "--format=%(refname:short)", "refs/heads/backup-pre-update-*")
        latest = newest_backup_branch(branches_output)
    except Exception:
        return {"error": "No backup branches found. Nothing to rollback.", "code": "no_backups"}

    if not latest:
        return {"error": "No backup branches found. Nothing to rollback.", "code": "no_backups"}

    try:
        git_in(project, "checkout", latest)
        return {"status": "rolled_back", "branch": latest}
    except Exception as exc:
        return {"error": f"Rollback failed: {exc}", "code": "rollback_failed"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Safe career-ops system updater helpers.")
    parser.add_argument("command", nargs="?", default="check", choices=["check", "dismiss", "apply", "rollback"])
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "dismiss":
        dismiss_update(PROJECT_ROOT)
        message: Any = {"status": "dismissed"}
    elif args.command == "apply":
        message = apply_update(root=PROJECT_ROOT)
    elif args.command == "rollback":
        message = rollback(root=PROJECT_ROOT)
    else:
        message = check_update(root=PROJECT_ROOT)
    print(json.dumps(message, indent=2) if args.json or isinstance(message, dict) else str(message))
    return 1 if isinstance(message, dict) and message.get("error") else 0


if __name__ == "__main__":
    raise SystemExit(main())
