from __future__ import annotations

from scripts.python.tracker.followup_cadence import add_days, parse_date, parse_next_overrides, resolve_next_override
from scripts.python.tracker.followup_seed import (
    FOLLOWUPS_HEADER,
    SeedError,
    format_pin_line,
    is_valid_calendar_date,
    resolve_applied_date,
    seed_backfill,
    seed_followup,
)


def tracker(rows: list[str]) -> str:
    return "\n".join(
        [
            "# Applications Tracker",
            "",
            "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
            "|---|------|---------|------|-------|--------|-----|--------|-------|",
            *rows,
            "",
        ]
    )


def row(num: int, status: str, notes: str, company: str = "Acme") -> str:
    return f"| {num} | 2026-05-01 | {company} | Engineer | 4.0/5 | {status} | no | — | {notes} |"


def test_followup_seed_helpers() -> None:
    assert is_valid_calendar_date("2026-06-20")
    assert not is_valid_calendar_date("2026-02-31")
    assert format_pin_line(1, "2026-06-27", "2026-06-20") == "- next #1 2026-06-27 (set 2026-06-20)"
    assert resolve_applied_date({"num": 1, "notes": "Applied 2026-06-20."}, None) == "2026-06-20"
    assert resolve_applied_date({"num": 1, "notes": "Applied 2026-06-20."}, "2026-07-01") == "2026-07-01"
    try:
        resolve_applied_date({"num": 1, "notes": "Applied 2026-02-31."}, None)
    except SeedError as exc:
        assert exc.code == "INVALID_DATE"
    else:
        raise AssertionError("expected invalid notes date")


def test_seed_followup_creates_header_and_pin_from_notes_date(tmp_path) -> None:
    tracker_path = tmp_path / "applications.md"
    followups = tmp_path / "follow-ups.md"
    tracker_path.write_text(tracker([row(1, "Applied", "Applied 2026-06-20. Great team.")]), encoding="utf-8")

    result = seed_followup(1, tracker_path=tracker_path, followups_path=followups)
    content = followups.read_text(encoding="utf-8")
    overrides = parse_next_overrides(content)

    assert result["seeded"] is True
    assert result["appliedDate"] == "2026-06-20"
    assert result["nextDate"] == add_days(parse_date("2026-06-20"), 7)
    assert content.startswith(FOLLOWUPS_HEADER)
    assert overrides[1]["date"] == result["nextDate"]
    assert resolve_next_override(overrides[1], None) == result["nextDate"]


def test_seed_followup_idempotent_force_and_table_row_guard(tmp_path) -> None:
    tracker_path = tmp_path / "applications.md"
    followups = tmp_path / "follow-ups.md"
    tracker_path.write_text(tracker([row(1, "Applied", "Applied 2026-06-20.")]), encoding="utf-8")

    first = seed_followup(1, tracker_path=tracker_path, followups_path=followups)
    second = seed_followup(1, tracker_path=tracker_path, followups_path=followups)
    forced = seed_followup(1, force=True, tracker_path=tracker_path, followups_path=followups)

    assert first["seeded"] is True
    assert second["seeded"] is False
    assert second["reason"] == "already-seeded"
    assert forced["seeded"] is True
    assert followups.read_text(encoding="utf-8").count("- next #1") == 2

    tracker_path.write_text(tracker([row(2, "Applied", "Applied 2026-06-01.", company="Globex")]), encoding="utf-8")
    followups.write_text(
        FOLLOWUPS_HEADER + "\n| 1 | 2 | 2026-06-10 | Globex | Engineer | email | rec@globex.com | sent |\n",
        encoding="utf-8",
    )
    blocked = seed_followup(2, tracker_path=tracker_path, followups_path=followups)
    assert blocked["seeded"] is False
    assert blocked["reason"] == "already-seeded"


def test_seed_followup_validation_force_and_dry_run(tmp_path) -> None:
    tracker_path = tmp_path / "applications.md"
    followups = tmp_path / "follow-ups.md"
    tracker_path.write_text(tracker([row(1, "Evaluated", "no applied date")]), encoding="utf-8")

    try:
        seed_followup(1, tracker_path=tracker_path, followups_path=followups)
    except SeedError as exc:
        assert exc.code == "NOT_APPLIED"
    else:
        raise AssertionError("expected non-applied rejection")

    forced = seed_followup(1, force=True, dry_run=True, date="2026-06-25", tracker_path=tracker_path, followups_path=followups)
    assert forced["seeded"] is True
    assert forced["dryRun"] is True
    assert forced["appliedDate"] == "2026-06-25"
    assert not followups.exists()

    try:
        seed_followup(1, date="2026-02-31", tracker_path=tracker_path, followups_path=followups)
    except SeedError as exc:
        assert exc.code == "INVALID_DATE"
    else:
        raise AssertionError("expected invalid explicit date")


def test_seed_backfill_seeds_unpinned_applied_and_skips_bad_dates(tmp_path) -> None:
    tracker_path = tmp_path / "applications.md"
    followups = tmp_path / "follow-ups.md"
    tracker_path.write_text(
        tracker(
            [
                row(1, "Applied", "Applied 2026-02-31. Bad date."),
                row(2, "Applied", "Applied 2026-06-20.", company="Globex"),
                row(3, "Applied", "Applied 2026-06-21.", company="PinnedCo"),
                row(4, "Rejected", "Applied 2026-06-22.", company="ClosedCo"),
            ]
        ),
        encoding="utf-8",
    )
    seed_followup(3, tracker_path=tracker_path, followups_path=followups)

    result = seed_backfill(tracker_path=tracker_path, followups_path=followups)
    rerun = seed_backfill(tracker_path=tracker_path, followups_path=followups)

    assert [item["appNum"] for item in result["seeded"]] == [2]
    assert {"appNum": 3, "reason": "already-seeded"} in result["skipped"]
    assert result["skipped"][0]["appNum"] == 1
    assert result["skipped"][0]["reason"] == "invalid-notes-date"
    assert rerun["seeded"] == []
    assert any(item["appNum"] == 2 and item["reason"] == "already-seeded" for item in rerun["skipped"])

