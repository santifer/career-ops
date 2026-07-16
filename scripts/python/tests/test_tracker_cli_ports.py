from __future__ import annotations

import os
import time

from scripts.python.tracker.find import find_matches, parse_pdf_index, parse_tracker_rows
from scripts.python.tracker.normalize_statuses import normalize_status, normalize_tracker_statuses
from scripts.python.tracker.reserve_report_num import (
    gc_sentinels,
    release_slot,
    reserve_range,
)


TRACKER = """# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Acme | Backend Engineer | 4.2/5 | **Evaluada** | ok | [001](../reports/001-acme.md) | strong infra fit |
| 2 | 2026-06-02 | Globex | Platform Engineer | 4.0/5 | Applied | ok | [012](reports/012-globex.md) | — |
| 3 | 2026-06-03 | Acme | Data Engineer | **3.9/5** | DUPLICADO #001 | no | — | pipeline heavy |
"""


TRACKER_CUSTOM = """# Applications Tracker

| # | Date | Company | Location | Role | Status | Score | PDF | Report | Notes |
|---|------|---------|----------|------|--------|-------|-----|--------|-------|
| 4 | 2026-06-04 | Initech | Remote | AI Engineer | Monitor | **4.5/5** | ok | [004](../reports/004-initech.md) | — |
"""


def test_reserve_report_range_release_and_gc(tmp_path) -> None:
    reports = tmp_path / "reports"
    reports.mkdir()
    (reports / "001-existing.md").write_text("x", encoding="utf-8")

    reserved = reserve_range(2, reports)
    assert reserved == [2, 3]
    assert (reports / "002-RESERVED.md").exists()
    assert (reports / "003-RESERVED.md").exists()

    release_slot(2, reports)
    assert not (reports / "002-RESERVED.md").exists()

    old = reports / "003-RESERVED.md"
    stale_time = time.time() - 10_000
    os.utime(old, (stale_time, stale_time))
    assert gc_sentinels(reports, max_age_seconds=1) == 1
    assert not old.exists()


def test_find_parse_and_match_pdf_index() -> None:
    rows = parse_tracker_rows(TRACKER)
    pdfs = parse_pdf_index("# comment\n001\toutput/acme.pdf\thtml\tpdf\t2026-06-01\n12\toutput/globex.pdf\t-\t-\t-\n")

    by_report = find_matches(rows, "12", pdfs)
    assert len(by_report) == 1
    assert by_report[0].company == "Globex"
    assert by_report[0].pdfPath == "output/globex.pdf"
    assert by_report[0].reportPath == "reports/012-globex.md"

    by_text = find_matches(rows, "backend", pdfs)
    assert len(by_text) == 1
    assert by_text[0].company == "Acme"
    assert by_text[0].status == "Evaluada"


def test_normalize_status_function() -> None:
    duplicate = normalize_status("DUPLICADO #001")
    assert duplicate.status == "Discarded"
    assert duplicate.move_to_notes == "DUPLICADO #001"
    assert normalize_status("Monitor").status == "SKIP"
    assert normalize_status("rechazado 2026-07-01").status == "Rejected"
    assert normalize_status("Ghosted").unknown is True


def test_normalize_tracker_statuses_header_aware(tmp_path) -> None:
    tracker = tmp_path / "applications.md"
    tracker.write_text(TRACKER_CUSTOM, encoding="utf-8")

    summary = normalize_tracker_statuses(tracker, backup=True)
    content = tracker.read_text(encoding="utf-8")

    assert summary.changes == 1
    assert summary.unknowns == []
    assert (tmp_path / "applications.md.bak").exists()
    assert "| 4 | 2026-06-04 | Initech | Remote | AI Engineer | SKIP | 4.5/5 |" in content


def test_normalize_tracker_statuses_dry_run_and_notes(tmp_path) -> None:
    tracker = tmp_path / "applications.md"
    tracker.write_text(TRACKER, encoding="utf-8")
    before = tracker.read_text(encoding="utf-8")

    dry = normalize_tracker_statuses(tracker, dry_run=True)
    assert dry.changes == 2
    assert tracker.read_text(encoding="utf-8") == before

    summary = normalize_tracker_statuses(tracker, backup=False)
    content = tracker.read_text(encoding="utf-8")
    assert summary.changes == 2
    assert "| 1 | 2026-06-01 | Acme | Backend Engineer | 4.2/5 | Evaluated |" in content
    assert "| 3 | 2026-06-03 | Acme | Data Engineer | 3.9/5 | Discarded |" in content
    assert "DUPLICADO #001. pipeline heavy" in content

