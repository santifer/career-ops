#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from scripts.python import PROJECT_ROOT, REPORTS_DIR
from scripts.python.tracker.links import normalize_report_link


PENDING_RE = re.compile(r"^##\s+(Pendientes|Pending)\s*$", re.IGNORECASE)
PROCESSED_RE = re.compile(r"^##\s+(Procesadas|Processed)\s*$", re.IGNORECASE)
SECTION_RE = re.compile(r"^##\s+")
PENDING_ITEM_RE = re.compile(r"^- \[ \]\s+")


@dataclass(frozen=True)
class ReconcileResult:
    changed: bool
    moved: list[dict[str, Any]]
    skippedNoReport: list[dict[str, str]]
    pendingCount: int
    newContent: str | None = None


def parse_batch_state(text: str) -> dict[str, dict[str, str]]:
    done: dict[str, dict[str, str]] = {}
    for line in text.splitlines():
        if not line.strip() or line.startswith("id\t"):
            continue
        cols = line.split("\t")
        if len(cols) < 7:
            continue
        _id, url, status, _started, _completed, report_num, score = cols[:7]
        if status not in {"completed", "skipped"} or not url.strip():
            continue
        done[url.strip()] = {"reportNum": report_num.strip(), "score": score.strip()}
    return done


def find_report_file(report_num: str, report_files: list[str]) -> str | None:
    if not report_num or report_num == "-":
        return None
    try:
        wanted = int(report_num)
    except ValueError:
        return None
    for file in report_files:
        match = re.match(r"^(\d+)-", file)
        if match and int(match.group(1)) == wanted:
            return file
    return None


def read_report_field(report_file: str | None, field: str, reports_dir: str | Path = REPORTS_DIR) -> str | None:
    if not report_file:
        return None
    try:
        text = (Path(reports_dir) / report_file).read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(rf"^\*\*{re.escape(field)}:\*\*\s*(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else None


def resolve_score(state_score: str, report_file: str | None, reports_dir: str | Path = REPORTS_DIR) -> str:
    if re.match(r"^\d+(?:\.\d+)?$", state_score or ""):
        return f"{state_score}/5"
    report_score = read_report_field(report_file, "Score", reports_dir)
    if report_score:
        num = re.search(r"(\d+(?:\.\d+)?)", report_score)
        if num:
            return f"{num.group(1)}/5"
        if re.search(r"n/?a", report_score, re.IGNORECASE):
            return "N/A"
    return "N/A"


def resolve_pdf(report_file: str | None, reports_dir: str | Path = REPORTS_DIR) -> str:
    report_pdf = read_report_field(report_file, "PDF", reports_dir)
    if not report_pdf:
        return "no"
    return "no" if re.search(r"not generated", report_pdf, re.IGNORECASE) else "yes"


def line_url(body: str) -> str:
    idx = body.find(" |")
    return (body[:idx] if idx >= 0 else body).strip()


def section_end(lines: list[str], start: int) -> int:
    for idx in range(start + 1, len(lines)):
        if SECTION_RE.match(lines[idx]):
            return idx
    return len(lines)


def reconcile_pipeline_content(
    pipeline_text: str,
    done: dict[str, dict[str, str]],
    *,
    report_files: list[str],
    reports_dir: str | Path = REPORTS_DIR,
    pipeline_file: str | Path = PROJECT_ROOT / "data/pipeline.md",
    repo_root: str | Path = PROJECT_ROOT,
) -> ReconcileResult:
    lines = pipeline_text.splitlines()
    pend_start = next((idx for idx, line in enumerate(lines) if PENDING_RE.match(line)), -1)
    proc_start = next((idx for idx, line in enumerate(lines) if PROCESSED_RE.match(line)), -1)
    if pend_start < 0:
        return ReconcileResult(False, [], [], 0, pipeline_text)
    pend_end = section_end(lines, pend_start)
    proc_end = section_end(lines, proc_start) if proc_start >= 0 else -1

    proc_urls: set[str] = set()
    if proc_start >= 0:
        for line in lines[proc_start + 1 : proc_end]:
            match = re.match(r"^- \[x\]\s+(.+)$", line, flags=re.IGNORECASE)
            if not match:
                continue
            parts = [part.strip() for part in match.group(1).split("|")]
            if len(parts) > 1 and parts[1]:
                proc_urls.add(parts[1])

    remove_idx: set[int] = set()
    moved_proc_lines: list[str] = []
    moved: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []

    for idx in range(pend_start + 1, pend_end):
        if not PENDING_ITEM_RE.match(lines[idx]):
            continue
        body = PENDING_ITEM_RE.sub("", lines[idx])
        url = line_url(body)
        done_row = done.get(url)
        if not done_row:
            continue
        if url in proc_urls:
            remove_idx.add(idx)
            moved.append({"url": url, "role": "(already in Procesadas)", "dup": True})
            continue
        report_file = find_report_file(done_row["reportNum"], report_files)
        if not report_file:
            skipped.append({"url": url, "reportNum": done_row["reportNum"] or "?"})
            continue
        parts = [part.strip() for part in body.split("|")]
        company = parts[1] if len(parts) > 1 else ""
        role = parts[2] if len(parts) > 2 else ""
        score = resolve_score(done_row["score"], report_file, reports_dir)
        pdf = resolve_pdf(report_file, reports_dir)
        num = int(done_row["reportNum"])
        report_link = normalize_report_link(
            f"[{num}](reports/{report_file})",
            Path(pipeline_file).parent,
            repo_root,
        )
        moved_proc_lines.append(f"- [x] {report_link} | {url} | {company} | {role} | {score} | PDF {pdf}")
        moved.append({"url": url, "company": company, "role": role, "num": num, "score": score})
        proc_urls.add(url)
        remove_idx.add(idx)

    if not remove_idx:
        pending_count = sum(1 for line in lines[pend_start + 1 : pend_end] if PENDING_ITEM_RE.match(line))
        return ReconcileResult(False, moved, skipped, pending_count, pipeline_text)

    out: list[str] = []
    skip_blank_after_proc = False
    for idx, line in enumerate(lines):
        if idx in remove_idx:
            continue
        if skip_blank_after_proc:
            skip_blank_after_proc = False
            if line.strip() == "":
                continue
        out.append(line)
        if idx == proc_start and moved_proc_lines:
            out.extend(["", *moved_proc_lines])
            skip_blank_after_proc = True
    if proc_start < 0 and moved_proc_lines:
        processed_header = "## Processed" if re.search(r"Pending", lines[pend_start], re.IGNORECASE) else "## Procesadas"
        if out and out[-1].strip():
            out.append("")
        out.extend([processed_header, "", *moved_proc_lines])

    pending_count = 0
    in_pending = False
    for line in out:
        if PENDING_RE.match(line):
            in_pending = True
            continue
        if SECTION_RE.match(line):
            in_pending = False
            continue
        if in_pending and PENDING_ITEM_RE.match(line):
            pending_count += 1

    return ReconcileResult(True, moved, skipped, pending_count, "\n".join(out))


def reconcile_pipeline(
    pipeline_path: str | Path,
    state_path: str | Path,
    *,
    reports_dir: str | Path = REPORTS_DIR,
    dry_run: bool = False,
    backup: bool = True,
    repo_root: str | Path = PROJECT_ROOT,
) -> ReconcileResult:
    pipeline_file = Path(pipeline_path)
    state_file = Path(state_path)
    if not state_file.exists() or not pipeline_file.exists():
        return ReconcileResult(False, [], [], 0, None)
    report_files = [path.name for path in Path(reports_dir).iterdir() if path.suffix == ".md"] if Path(reports_dir).exists() else []
    result = reconcile_pipeline_content(
        pipeline_file.read_text(encoding="utf-8"),
        parse_batch_state(state_file.read_text(encoding="utf-8")),
        report_files=report_files,
        reports_dir=reports_dir,
        pipeline_file=pipeline_file,
        repo_root=repo_root,
    )
    if result.changed and not dry_run and result.newContent is not None:
        if backup:
            shutil.copyfile(pipeline_file, Path(str(pipeline_file) + ".pre-reconcile.bak"))
        pipeline_file.write_text(result.newContent, encoding="utf-8")
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Move completed batch entries from pipeline "Pending" to "Processed".')
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--state", default=str(PROJECT_ROOT / "batch/batch-state.tsv"))
    parser.add_argument(
        "--pipeline",
        default=str(PROJECT_ROOT / "data/pipeline.md" if (PROJECT_ROOT / "data/pipeline.md").exists() else PROJECT_ROOT / "pipeline.md"),
    )
    parser.add_argument("--reports-dir", default=str(REPORTS_DIR))
    parser.add_argument("--no-backup", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = reconcile_pipeline(
        args.pipeline,
        args.state,
        reports_dir=args.reports_dir,
        dry_run=args.dry_run,
        backup=not args.no_backup,
    )
    print("=== Reconcile pipeline.md ===")
    for skipped in result.skippedNoReport:
        print(f"{skipped['url']} — batch reports report #{skipped['reportNum']} but no report file found; left in Pending.")
    if not result.changed:
        print("pipeline.md already in sync — nothing to reconcile.")
        return 0
    real_moves = [move for move in result.moved if not move.get("dup")]
    print(f"{len(real_moves)} processed entries moved Pending -> Processed")
    for move in real_moves:
        print(f"   + #{move['num']} {move['company']} — {move['role']} ({move['score']})")
    dupes = [move for move in result.moved if move.get("dup")]
    if dupes:
        print(f"{len(dupes)} stale Pending entries dropped (already in Processed).")
    print(f"Pending now: {result.pendingCount} entries")
    if args.dry_run:
        print("(dry-run — no changes written)")
    else:
        print("pipeline.md updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

