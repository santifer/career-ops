from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from scripts.python import JS_SCRIPTS_DIR, PROJECT_ROOT


LEGACY_COLMAP: dict[str, int] = {
    "num": 1,
    "date": 2,
    "company": 3,
    "role": 4,
    "score": 5,
    "status": 6,
    "pdf": 7,
    "report": 8,
    "notes": 9,
}

SCORE_CELL_RE = re.compile(r"^\d+(?:\.\d+)?/5$")


def header_aliases(path: Path | None = None) -> dict[str, str]:
    candidates = [path] if path is not None else [PROJECT_ROOT / "tracker-aliases.json", JS_SCRIPTS_DIR / "tracker-aliases.json"]
    alias_path = next((candidate for candidate in candidates if candidate and candidate.exists()), candidates[0])
    try:
        return json.loads(alias_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(
            f"tracker.parse: cannot load tracker-aliases.json ({exc}). "
            "The file ships with career-ops; restore it from the repo."
        ) from exc


HEADER_ALIASES = header_aliases()


def looks_like_score_cell(value: Any) -> bool:
    text = str(value if value is not None else "").replace("**", "").strip()
    return bool(SCORE_CELL_RE.match(text)) or text in {"N/A", "DUP", "—", "-"}


def resolve_score_status(a: str, b: str) -> dict[str, str] | None:
    a_score = looks_like_score_cell(a)
    b_score = looks_like_score_cell(b)
    if a_score == b_score:
        return None
    return {"score": a, "status": b} if a_score else {"score": b, "status": a}


def detect_columns(lines: list[str]) -> dict[str, int] | None:
    for line in lines:
        if not line.startswith("|"):
            continue
        cells = [cell.strip().lower() for cell in line.split("|")]
        if "company" not in cells or "role" not in cells:
            continue
        colmap: dict[str, int] = {}
        for idx, cell in enumerate(cells):
            canonical = HEADER_ALIASES.get(cell)
            if canonical is not None:
                colmap[canonical] = idx
        if all(key in colmap for key in ("num", "company", "role", "score", "status")):
            return colmap
    return None


def resolve_columns(lines: list[str]) -> dict[str, int]:
    return detect_columns(lines) or dict(LEGACY_COLMAP)


@dataclass(frozen=True)
class TrackerRow:
    num: int
    date: str
    company: str
    role: str
    score: str
    status: str
    pdf: str
    report: str
    notes: str
    raw: str
    location: str = ""
    via: str = ""


def parse_tracker_row(line: str, colmap: dict[str, int] | None = None) -> TrackerRow | None:
    if not isinstance(line, str) or not line.startswith("|"):
        return None
    resolved = colmap or LEGACY_COLMAP
    parts = [part.strip() for part in line.split("|")]
    width = max(resolved.values()) + (2 if line.rstrip().endswith("|") else 1)
    if len(parts) < width:
        return None
    try:
        num = int(parts[resolved["num"]])
    except (KeyError, ValueError, IndexError):
        return None

    def at(key: str) -> str:
        idx = resolved.get(key)
        if idx is None or idx >= len(parts):
            return ""
        return parts[idx]

    return TrackerRow(
        num=num,
        date=at("date"),
        company=at("company"),
        role=at("role"),
        score=at("score"),
        status=at("status"),
        pdf=at("pdf"),
        report=at("report"),
        notes=at("notes"),
        location=at("location"),
        via=at("via"),
        raw=line,
    )


def parse_applications(markdown: str) -> list[TrackerRow]:
    lines = markdown.splitlines()
    colmap = resolve_columns(lines)
    return [row for line in lines if (row := parse_tracker_row(line, colmap)) is not None]


def normalize_via(name: str) -> str:
    # Python lacks JS NFKC + Unicode property regex in stdlib; use isalnum()
    # after casefold to preserve letters and digits across scripts.
    import unicodedata

    normalized = unicodedata.normalize("NFKC", str(name if name is not None else "")).casefold()
    return "".join(ch for ch in normalized if ch.isalnum())
