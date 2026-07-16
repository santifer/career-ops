from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from scripts.python import PROJECT_ROOT, TEMPLATES_DIR


def rebuild_row(parts: list[str]) -> str:
    cells = list(parts[1:])
    if cells and cells[-1] == "":
        cells.pop()
    return "| " + " | ".join(cells) + " |"


def normalize_company(name: str) -> str:
    return "".join(ch for ch in str(name if name is not None else "").lower() if ch.isascii() and ch.isalnum())


def cell(value: Any) -> str:
    text = re.sub(r"[\r\n]+", " ", str(value if value is not None else ""))
    return re.sub(r"\s*\|\s*", " / ", text).strip()


def canonicalize_tracker_path(path: str | Path) -> Path:
    absolute = Path(path).expanduser().resolve(strict=False)
    try:
        return absolute.resolve(strict=True)
    except FileNotFoundError:
        return absolute


def resolve_tracker_path(root_dir: str | Path = PROJECT_ROOT) -> Path:
    env_path = os.environ.get("CAREER_OPS_TRACKER")
    root = Path(root_dir)
    raw = Path(env_path) if env_path else (root / "data/applications.md" if (root / "data/applications.md").exists() else root / "applications.md")
    return canonicalize_tracker_path(raw)


def _path_is_inside(child: Path, parent: Path) -> bool:
    try:
        child.resolve(strict=False).relative_to(parent.resolve(strict=True))
        return True
    except ValueError:
        return False


def tracker_lock_dir_for(apps_file: str | Path) -> Path:
    canonical = str(canonicalize_tracker_path(apps_file))
    lock_key = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    tmp_root = Path(tempfile.gettempdir()).resolve(strict=True)
    fallback = tmp_root / f"career-ops-merge-tracker-{lock_key}.lock"
    env_value = os.environ.get("CAREER_OPS_TRACKER_LOCK")
    if not env_value:
        return fallback

    candidate = Path(env_value)
    if not candidate.is_absolute():
        return fallback
    parent = candidate.parent.resolve(strict=False)
    if not _path_is_inside(parent, tmp_root):
        return fallback
    if not candidate.name.startswith("career-ops-merge-tracker-"):
        return fallback
    return candidate


def _process_is_alive(pid: int) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except ProcessLookupError:
        return False


def _read_lock_owner(lock_dir: Path) -> dict[str, Any] | None:
    try:
        return json.loads((lock_dir / "owner.json").read_text(encoding="utf-8"))
    except Exception:
        return None


def _lock_can_recover(lock_dir: Path, stale_seconds: float) -> bool:
    owner = _read_lock_owner(lock_dir)
    if owner and owner.get("pid"):
        return not _process_is_alive(int(owner["pid"]))
    try:
        return time.time() - lock_dir.stat().st_mtime > stale_seconds
    except FileNotFoundError:
        return True


@dataclass
class TrackerLock:
    lock_dir: Path
    attempts: int
    wait_seconds: float
    stale_recovered: bool
    _token: str
    _released: bool = False

    def release(self) -> None:
        if self._released:
            return
        self._released = True
        owner = _read_lock_owner(self.lock_dir)
        if owner and owner.get("token") == self._token:
            shutil.rmtree(self.lock_dir, ignore_errors=True)

    def __enter__(self) -> "TrackerLock":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.release()


def acquire_tracker_lock(
    lock_dir: str | Path,
    *,
    timeout_seconds: float = 60.0,
    retry_seconds: float = 0.075,
    stale_seconds: float = 600.0,
    tracker: str | Path | None = None,
) -> TrackerLock:
    lock_path = Path(lock_dir)
    recover_guard = Path(f"{lock_path}.recover")
    token = str(uuid.uuid4())
    started = time.time()
    attempts = 0
    stale_recovered = False

    while time.time() - started < timeout_seconds:
        attempts += 1
        try:
            lock_path.mkdir()
            try:
                (lock_path / "owner.json").write_text(
                    json.dumps(
                        {
                            "pid": os.getpid(),
                            "token": token,
                            "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            "tracker": str(tracker or ""),
                        },
                        indent=2,
                    ),
                    encoding="utf-8",
                )
            except Exception:
                shutil.rmtree(lock_path, ignore_errors=True)
                raise
            return TrackerLock(lock_path, attempts, time.time() - started, stale_recovered, token)
        except FileExistsError:
            has_guard = False
            try:
                recover_guard.mkdir()
                has_guard = True
            except FileExistsError:
                if _lock_can_recover(recover_guard, stale_seconds):
                    shutil.rmtree(recover_guard, ignore_errors=True)

            if has_guard:
                try:
                    if _lock_can_recover(lock_path, stale_seconds):
                        shutil.rmtree(lock_path, ignore_errors=True)
                        stale_recovered = True
                        continue
                finally:
                    shutil.rmtree(recover_guard, ignore_errors=True)

            time.sleep(retry_seconds)

    raise TimeoutError(f"Timed out waiting for tracker lock at {lock_path}")


def write_file_atomic(path: str | Path, content: str) -> None:
    final_path = Path(path)
    tmp_path = final_path.with_name(f".{final_path.name}.{os.getpid()}.{int(time.time() * 1000)}.{uuid.uuid4()}.tmp")
    try:
        tmp_path.write_text(content, encoding="utf-8")
        os.replace(tmp_path, final_path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


@dataclass(frozen=True)
class CanonicalState:
    id: str
    label: str
    aliases: list[str]


def load_canonical_states(states_path: str | Path = TEMPLATES_DIR / "states.yml") -> list[CanonicalState]:
    doc = yaml.safe_load(Path(states_path).read_text(encoding="utf-8"))
    if not isinstance(doc, dict) or not isinstance(doc.get("states"), list):
        raise ValueError(f'Malformed states file at {states_path}: expected a top-level "states" list')
    return [
        CanonicalState(
            id=str(state.get("id", "")),
            label=str(state.get("label", "")),
            aliases=[str(alias) for alias in state.get("aliases", [])] if isinstance(state.get("aliases", []), list) else [],
        )
        for state in doc["states"]
        if isinstance(state, dict)
    ]


def resolve_canonical_state(input_value: str, states: list[CanonicalState]) -> str | None:
    clean = str(input_value if input_value is not None else "").replace("**", "").strip().lower()
    if not clean:
        return None
    for state in states:
        if state.label.lower() == clean or state.id.lower() == clean:
            return state.label
        if any(alias.lower() == clean for alias in state.aliases):
            return state.label
    return None
