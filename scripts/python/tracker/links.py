from __future__ import annotations

import os
import re
from pathlib import Path


REPORT_LINK_RE = re.compile(r"\]\(([^)]+)\)")


def normalize_report_link(report_field: str, tracker_dir: str | Path, repo_root: str | Path) -> str:
    tracker_path = Path(tracker_dir)
    root_path = Path(repo_root)

    def replace(match: re.Match[str]) -> str:
        link_path = match.group(1)
        link_match = re.match(r"^(?:\.\./)*(reports/.+)$", link_path)
        if not link_match:
            return match.group(0)
        report_abs = root_path / Path(*link_match.group(1).split("/"))
        rel = Path(os.path.relpath(report_abs, tracker_path)).as_posix()
        return f"]({rel})"

    return REPORT_LINK_RE.sub(replace, str(report_field))
