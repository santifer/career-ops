from __future__ import annotations

import json

from scripts.python.tracker.set_status import (
    EXIT_AMBIGUOUS,
    EXIT_NOT_FOUND,
    EXIT_OK,
    EXIT_USAGE,
    main,
    set_status,
)


TRACKER_9 = """# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Acme | Backend Engineer | 4.2/5 | Evaluated | ok | [1](../reports/001-acme.md) | strong infra fit |
| 2 | 2026-06-02 | Globex | Platform Engineer | 4.0/5 | Evaluated | ok | [2](../reports/002-globex.md) | — |
| 3 | 2026-06-03 | Acme | Data Engineer | 3.9/5 | Evaluated | no | [3](../reports/003-acme.md) | pipeline heavy |
"""


TRACKER_10 = """# Applications Tracker

| # | Date | Company | Role | Location | Score | Status | PDF | Report | Notes |
|---|------|---------|------|----------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Initech | AI Engineer | Remote | 4.5/5 | Evaluated | ok | [1](../reports/001-initech.md) | — |
"""


TRACKER_DUP_NUM = """# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 5 | 2026-05-29 | University of Alberta | Curriculum Coordinator | 3.8/5 | Evaluated | no | — | — |
| 5 | 2026-06-03 | Esri Canada | Manager Talent and Organizational Development | 4.1/5 | Evaluated | no | — | — |
"""


def write_tracker(tmp_path, content: str):
    tracker = tmp_path / "applications.md"
    tracker.write_text(content, encoding="utf-8")
    return tracker


def test_set_status_updates_by_number(tmp_path) -> None:
    tracker = write_tracker(tmp_path, TRACKER_9)
    result = set_status("2", "Applied", tracker_path=tracker)

    assert result.changed is True
    assert result.followupSeedCandidate is True
    assert "| 2 | 2026-06-02 | Globex | Platform Engineer | 4.0/5 | Applied |" in tracker.read_text(encoding="utf-8")
    assert "| 1 | 2026-06-01 | Acme | Backend Engineer | 4.2/5 | Evaluated |" in tracker.read_text(encoding="utf-8")


def test_set_status_accepts_alias_and_location_layout(tmp_path) -> None:
    tracker = write_tracker(tmp_path, TRACKER_10)
    result = set_status("initech", "aplicado", note="sent | via portal", tracker_path=tracker)
    content = tracker.read_text(encoding="utf-8")

    assert result.newStatus == "Applied"
    assert "| Initech | AI Engineer | Remote | 4.5/5 | Applied |" in content
    assert "sent / via portal" in content


def test_set_status_note_append_is_idempotent(tmp_path) -> None:
    tracker = write_tracker(tmp_path, TRACKER_9)
    first = set_status("2", "Responded", note="recruiter replied", tracker_path=tracker)
    second = set_status("2", "Responded", note="recruiter replied", tracker_path=tracker)

    assert first.changed is True
    assert second.changed is False
    assert tracker.read_text(encoding="utf-8").count("recruiter replied") == 1


def test_set_status_company_ambiguity_and_role_disambiguation(tmp_path) -> None:
    tracker = write_tracker(tmp_path, TRACKER_9)
    try:
        set_status("acme", "Applied", tracker_path=tracker)
    except Exception as exc:
        assert getattr(exc, "exit_code") == EXIT_AMBIGUOUS
        assert "Backend Engineer" in str(exc)
        assert "Data Engineer" in str(exc)
    else:
        raise AssertionError("expected ambiguous company error")

    result = set_status("acme", "Applied", role="Data Engineer", tracker_path=tracker)
    assert result.num == 3
    assert "| 3 | 2026-06-03 | Acme | Data Engineer | 3.9/5 | Applied |" in tracker.read_text(encoding="utf-8")


def test_set_status_duplicate_number_requires_role(tmp_path) -> None:
    tracker = write_tracker(tmp_path, TRACKER_DUP_NUM)
    before = tracker.read_text(encoding="utf-8")

    try:
        set_status("5", "Rejected", tracker_path=tracker)
    except Exception as exc:
        assert getattr(exc, "exit_code") == EXIT_AMBIGUOUS
        assert "University of Alberta" in str(exc)
        assert "Esri Canada" in str(exc)
    else:
        raise AssertionError("expected ambiguous duplicate number error")
    assert tracker.read_text(encoding="utf-8") == before

    result = set_status("5", "Rejected", role="Manager Talent and Organizational Development", tracker_path=tracker)
    assert result.company == "Esri Canada"
    assert "| 5 | 2026-05-29 | University of Alberta | Curriculum Coordinator | 3.8/5 | Evaluated |" in tracker.read_text(encoding="utf-8")


def test_set_status_dry_run_does_not_write(tmp_path) -> None:
    tracker = write_tracker(tmp_path, TRACKER_9)
    before = tracker.read_text(encoding="utf-8")
    result = set_status("2", "Applied", dry_run=True, tracker_path=tracker)

    assert result.changed is True
    assert result.dryRun is True
    assert tracker.read_text(encoding="utf-8") == before


def test_set_status_errors(tmp_path) -> None:
    tracker = write_tracker(tmp_path, TRACKER_9)
    for selector, state, expected in [
        ("99", "Applied", EXIT_NOT_FOUND),
        ("hooli", "Applied", EXIT_NOT_FOUND),
        ("2", "Ghosted", EXIT_USAGE),
    ]:
        try:
            set_status(selector, state, tracker_path=tracker)
        except Exception as exc:
            assert getattr(exc, "exit_code") == expected
        else:
            raise AssertionError(f"expected error for {selector} {state}")


def test_set_status_cli_json_uses_env_tracker(tmp_path, monkeypatch, capsys) -> None:
    tracker = write_tracker(tmp_path, TRACKER_9)
    monkeypatch.setenv("CAREER_OPS_TRACKER", str(tracker))
    monkeypatch.setenv("CAREER_OPS_TRACKER_LOCK", str(tmp_path / "career-ops-merge-tracker-test.lock"))

    code = main(["2", "Applied", "--json"])
    captured = capsys.readouterr()

    assert code == EXIT_OK
    payload = json.loads(captured.out)
    assert payload["num"] == 2
    assert payload["newStatus"] == "Applied"

