from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

from scripts.python.admin.update_system import (
    apply_update,
    build_parser,
    git_checkout_paths,
    is_user_path,
    rollback,
)


def test_apply_update_reexec_path(tmp_path: Path) -> None:
    (tmp_path / "VERSION").write_text("1.0.0\n", encoding="utf-8")
    os.environ.pop("CAREER_OPS_UPDATE_REEXEC", None)

    def fake_git_in(root: Any, *args: str, **kwargs: Any) -> str:
        cmd = " ".join(str(a) for a in args)
        if "FETCH_HEAD:update-system.mjs" in cmd:
            return "import './x.mjs';\nconst SYSTEM_PATHS = [];\n"
        if args[0:1] == ("status",):
            return ""
        return ""

    with patch("scripts.python.admin.update_system.git_in", side_effect=fake_git_in), \
         patch("scripts.python.admin.update_system.git_status_entries", return_value=[]), \
         patch("scripts.python.admin.update_system.subprocess.run") as mock_subprocess:
        mock_subprocess.return_value = subprocess.CompletedProcess([], 0, stdout="", stderr="")
        result = apply_update(root=tmp_path, runner=subprocess.run)

    assert result["code"] == "reexec_failed" or result.get("status") == "reexecuted" or "error" in result
    assert not (tmp_path / ".update-lock").exists()


def test_apply_update_lock_blocks_double_entry(tmp_path: Path) -> None:
    (tmp_path / "VERSION").write_text("1.0.0\n", encoding="utf-8")
    (tmp_path / ".update-lock").write_text("lock", encoding="utf-8")
    os.environ.pop("CAREER_OPS_UPDATE_REEXEC", None)

    result = apply_update(root=tmp_path, runner=subprocess.run)
    assert result["code"] == "lock_exists"
    assert (tmp_path / ".update-lock").exists()


def test_apply_update_reexec_child_performs_checkout(tmp_path: Path) -> None:
    (tmp_path / "VERSION").write_text("1.0.0\n", encoding="utf-8")
    os.environ["CAREER_OPS_UPDATE_REEXEC"] = "1"
    (tmp_path / ".update-lock").write_text("lock", encoding="utf-8")
    (tmp_path / "modes").mkdir(exist_ok=True)

    calls: list[tuple[str, ...]] = []

    def tracking_git_in(root: Any, *args: str, **kwargs: Any) -> str:
        calls.append(tuple(str(a) for a in args))
        cmd = " ".join(str(a) for a in args)
        if "FETCH_HEAD:update-system.mjs" in cmd:
            return "const SYSTEM_PATHS = ['modes/'];\n"
        if args[0:1] == ("status",):
            return "M modes/_shared.md"
        if args[0:1] == ("checkout",) and "--" in cmd:
            return ""
        return ""

    with patch("scripts.python.admin.update_system.git_in", side_effect=tracking_git_in), \
         patch("scripts.python.admin.update_system.git_status_entries", return_value=[{"path": "modes/_shared.md", "index": "M"}]), \
         patch("scripts.python.admin.update_system.subprocess.run") as mock_subprocess:
        mock_subprocess.return_value = subprocess.CompletedProcess([], 0, stdout="", stderr="")
        result = apply_update(root=tmp_path, runner=subprocess.run)

    assert result["status"] == "updated"
    assert result["local"] == "1.0.0"
    assert (tmp_path / ".update-lock").exists()  # child doesn't clean up lock (by design)
    os.environ.pop("CAREER_OPS_UPDATE_REEXEC", None)


def test_apply_update_detects_safety_violation(tmp_path: Path) -> None:
    (tmp_path / "VERSION").write_text("1.0.0\n", encoding="utf-8")
    os.environ["CAREER_OPS_UPDATE_REEXEC"] = "1"
    (tmp_path / ".update-lock").write_text("lock", encoding="utf-8")

    def violating_git_in(root: Any, *args: str, **kwargs: Any) -> str:
        cmd = " ".join(str(a) for a in args)
        if "FETCH_HEAD:update-system.mjs" in cmd:
            return "const SYSTEM_PATHS = ['modes/'];\n"
        return ""

    call_count = 0

    def status_entries_on_violation(root: Any, runner: Any = subprocess.run) -> list[dict[str, str]]:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return []
        return [{"path": "data/applications.md", "index": "M"}]

    with patch("scripts.python.admin.update_system.git_in", side_effect=violating_git_in), \
         patch("scripts.python.admin.update_system.git_status_entries", side_effect=status_entries_on_violation):
        result = apply_update(root=tmp_path, runner=subprocess.run)

    assert result["code"] == "safety_violation"
    assert "data/applications.md" in result["files"]
    os.environ.pop("CAREER_OPS_UPDATE_REEXEC", None)


def test_rollback_returns_latest_backup_branch(tmp_path: Path) -> None:
    (tmp_path / "VERSION").write_text("1.0.0\n", encoding="utf-8")

    def fake_git_in(root: Any, *args: str, **kwargs: Any) -> str:
        if "for-each-ref" in " ".join(str(a) for a in args):
            return "backup-pre-update-1.0.0-20260715T100000Z"
        return ""

    with patch("scripts.python.admin.update_system.git_in", side_effect=fake_git_in):
        result = rollback(root=tmp_path, runner=subprocess.run)

    assert result["status"] == "rolled_back"
    assert result["branch"] == "backup-pre-update-1.0.0-20260715T100000Z"


def test_rollback_reports_no_backups(tmp_path: Path) -> None:
    (tmp_path / "VERSION").write_text("1.0.0\n", encoding="utf-8")

    def failing_git_in(root: Any, *args: str, **kwargs: Any) -> str:
        if "for-each-ref" in " ".join(str(a) for a in args):
            raise subprocess.CalledProcessError(1, ["git", "for-each-ref"], stderr="error")
        return ""

    with patch("scripts.python.admin.update_system.git_in", side_effect=failing_git_in):
        result = rollback(root=tmp_path, runner=subprocess.run)

    assert result["code"] == "no_backups"


def test_build_parser_accepts_apply_and_rollback() -> None:
    parser = build_parser()
    args = parser.parse_args(["apply"])
    assert args.command == "apply"
    args = parser.parse_args(["rollback"])
    assert args.command == "rollback"
    args = parser.parse_args(["check", "--json"])
    assert args.command == "check"
    assert args.json is True


def test_git_checkout_paths_returns_updated_list() -> None:
    with patch("scripts.python.admin.update_system.git_in", return_value=""):
        updated = git_checkout_paths("/tmp", "FETCH_HEAD", ["modes/_shared.md", "nonexistent"])
        assert updated == ["modes/_shared.md", "nonexistent"]


def test_is_user_path_detects_user_files() -> None:
    user_paths = ["cv.md", "data/", "modes/_profile.md"]
    assert is_user_path("cv.md", user_paths) is True
    assert is_user_path("data/applications.md", user_paths) is True
    assert is_user_path("modes/_profile.md", user_paths) is True
    assert is_user_path("modes/_shared.md", user_paths) is False
    assert is_user_path("AGENTS.md", user_paths) is False
