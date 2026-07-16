from __future__ import annotations

from scripts.python.tracker.dedup_tracker import dedup_tracker
from scripts.python.tracker.merge_tracker import merge_tracker_additions
from scripts.python.tracker.verify_pipeline import verify_pipeline


TRACKER = """# Applications Tracker

| # | Date | Company | Via | Role | Location | Score | Status | PDF | Report | Notes |
|---|------|---------|-----|------|----------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Acme | — | Platform Engineer | Remote | 4.0/5 | Evaluated | ok | [001](../reports/001-acme-platform-2026-06-01.md) | Req R_100 |
"""


def test_merge_tracker_adds_updates_and_moves_tsvs(tmp_path) -> None:
    tracker = tmp_path / "data" / "applications.md"
    tracker.parent.mkdir()
    tracker.write_text(TRACKER, encoding="utf-8")
    reports = tmp_path / "reports"
    reports.mkdir()
    additions = tmp_path / "batch" / "tracker-additions"
    additions.mkdir(parents=True)

    (additions / "001-update.tsv").write_text(
        "1\t2026-06-02\tAcme\tPlatform Engineer\tEvaluated\t4.7/5\tok\t[002](reports/002-acme-platform-2026-06-02.md)\tReq R_100\tvia=Hays\tParis",
        encoding="utf-8",
    )
    (additions / "002-new.tsv").write_text(
        "1\t2026-06-03\tGlobex\tData Engineer\t4.2/5\tApplied\tok\t[003](reports/003-globex-data-2026-06-03.md)\tApplied 2026-06-03",
        encoding="utf-8",
    )

    summary = merge_tracker_additions(tracker, additions)
    content = tracker.read_text(encoding="utf-8")

    assert summary.added == 1
    assert summary.updated == 1
    assert "| 1 | 2026-06-02 | Acme | Hays | Platform Engineer | Paris | 4.7/5 | Evaluated | ok | [002](../reports/002-acme-platform-2026-06-02.md) | Re-eval 2026-06-02 (4→4.7). Req R_100 |" in content
    assert "| 2 | 2026-06-03 | Globex | — | Data Engineer | — | 4.2/5 | Applied | ok | [003](../reports/003-globex-data-2026-06-03.md) | Applied 2026-06-03 |" in content
    assert not (additions / "001-update.tsv").exists()
    assert (additions / "merged" / "001-update.tsv").exists()


def test_dedup_tracker_promotes_status_but_keeps_advanced_exact_title(tmp_path) -> None:
    tracker = tmp_path / "applications.md"
    tracker.write_text(
        """# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Acme | Data Engineer | 4.1/5 | Evaluated | ok | [001](reports/001-acme.md) | first |
| 2 | 2026-06-02 | Acme | Data Engineer | 4.5/5 | Applied | ok | [002](reports/002-acme.md) | active |
| 3 | 2026-06-03 | Globex | Backend Engineer | 3.5/5 | Evaluated | ok | [003](reports/003-globex.md) | older |
| 4 | 2026-06-04 | Globex | Backend Engineer | 4.2/5 | Rejected | ok | [003](reports/003-globex.md) | newer |
""",
        encoding="utf-8",
    )

    summary = dedup_tracker(tracker, backup=False)
    content = tracker.read_text(encoding="utf-8")

    assert summary.removed == 1
    assert "| 1 | 2026-06-01 | Acme | Data Engineer |" in content
    assert "| 2 | 2026-06-02 | Acme | Data Engineer |" in content
    assert "| 4 | 2026-06-04 | Globex | Backend Engineer | 4.2/5 | Evaluated |" in content
    assert "| 3 | 2026-06-03 | Globex | Backend Engineer |" not in content


def test_verify_pipeline_reports_errors_and_warnings(tmp_path) -> None:
    tracker = tmp_path / "data" / "applications.md"
    tracker.parent.mkdir()
    reports = tmp_path / "reports"
    reports.mkdir()
    additions = tmp_path / "batch" / "tracker-additions"
    additions.mkdir(parents=True)
    (additions / "pending.tsv").write_text("x", encoding="utf-8")
    (reports / "001-acme-data-2026-06-01.md").write_text("# Evaluación: Acme — Data Engineer\n", encoding="utf-8")
    tracker.write_text(
        """# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Acme | Data Engineer | **4.1/5** | **Ghosted** | ok | [001](../reports/001-acme-data-2026-06-01.md) | first |
| 1 | 2026-06-02 | Acme | Data Engineer | bad | Applied 2026-06-02 | ok | [002](../reports/missing.md) | second |
""",
        encoding="utf-8",
    )

    result = verify_pipeline(tracker, reports_dir=reports, additions_dir=additions)

    assert result.ok is False
    assert any("Non-canonical status" in error for error in result.errors)
    assert any("Duplicate tracker number #1" in error for error in result.errors)
    assert any("Report not found" in error for error in result.errors)
    assert any("pending TSVs" in warning for warning in result.warnings)
    assert any("Score has markdown bold" in warning for warning in result.warnings)
