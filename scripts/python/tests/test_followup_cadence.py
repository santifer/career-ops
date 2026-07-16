from __future__ import annotations

from datetime import date

from scripts.python.tracker.followup_cadence import (
    DEFAULT_CADENCE,
    add_days,
    analyze_followups,
    compute_next_followup_date,
    compute_urgency,
    parse_applied_date,
    parse_date,
    parse_followups_content,
    parse_next_overrides,
    parse_tracker_content,
    resolve_cadence_config,
    resolve_next_override,
)


def test_compute_next_followup_date_regressions() -> None:
    app = "2026-06-30"
    assert compute_next_followup_date("responded", app, None, 0) == add_days(parse_date(app), DEFAULT_CADENCE["responded_initial"])
    assert compute_next_followup_date("responded", app, "2026-07-02", 1) == add_days(parse_date("2026-07-02"), DEFAULT_CADENCE["responded_subsequent"])
    assert compute_next_followup_date("responded", app, None, 0) <= add_days(parse_date(app), DEFAULT_CADENCE["responded_subsequent"])
    assert compute_next_followup_date("applied", app, None, 0) == add_days(parse_date(app), DEFAULT_CADENCE["applied_first"])


def test_cadence_config_profile_and_override(tmp_path) -> None:
    profile = tmp_path / "profile.yml"
    profile.write_text(
        """
followup_cadence:
  applied_first_days: 5
  applied_subsequent_days: 4
  applied_max_followups: 3
  responded_initial_days: 2
  bogus: 99
""",
        encoding="utf-8",
    )
    config = resolve_cadence_config(profile, applied_days=9)
    assert config["applied_first"] == 9
    assert config["applied_subsequent"] == 4
    assert config["applied_max_followups"] == 3
    assert config["responded_initial"] == 2
    assert config["responded_subsequent"] == DEFAULT_CADENCE["responded_subsequent"]


def test_parse_followups_and_overrides() -> None:
    followups = """# Follow-ups

| num | appNum | date | company | role | channel | contact | notes |
|---|---|---|---|---|---|---|---|
| 1 | 2 | 2026-07-01 | Acme | Engineer | email | jane@acme.com | sent |
- next #2 2026-07-10 (set 2026-07-02)
- next #3 2026-07-12
- next #4 2026-02-31
"""
    rows = parse_followups_content(followups)
    overrides = parse_next_overrides(followups)
    assert rows[0]["appNum"] == 2
    assert rows[0]["contact"] == "jane@acme.com"
    assert overrides[2] == {"appNum": 2, "date": "2026-07-10", "setDate": "2026-07-02"}
    assert overrides[3] == {"appNum": 3, "date": "2026-07-12", "setDate": "2026-07-12"}
    assert 4 not in overrides
    assert resolve_next_override(overrides[2], "2026-07-01") == "2026-07-10"
    assert resolve_next_override(overrides[2], "2026-07-03") is None


def test_analyze_followups_dates_contacts_and_urgency(tmp_path) -> None:
    reports = tmp_path / "reports"
    reports.mkdir()
    (reports / "001-acme.md").write_text("report", encoding="utf-8")
    apps_file = tmp_path / "data" / "applications.md"
    apps_file.parent.mkdir()
    tracker = """# Applications Tracker

| # | Date | Company | Via | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|-----|------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Acme | AgencyOne | Engineer | 4/5 | Applied | ok | [1](../reports/001-acme.md) | Applied 2026-06-20. Emailed Jane Doe at jane@agency.com |
| 2 | 2026-07-14 | Globex | — | Analyst | 4/5 | Responded | ok | — | recruiter replied |
| 3 | 2026-07-01 | Initech | — | Manager | 4/5 | Interview | ok | — | panel |
| 4 | 2026-06-01 | OldCo | — | Dev | 3/5 | Rejected | no | — | closed |
"""
    apps = parse_tracker_content(tracker)
    followups = [{"appNum": 1, "date": "2026-07-01", "num": 1, "company": "Acme", "role": "Engineer", "channel": "email", "contact": "jane@agency.com", "notes": "sent"}]
    overrides = {1: {"appNum": 1, "date": "2026-07-20", "setDate": "2026-07-02"}}
    result = analyze_followups(apps, followups, overrides, analysis_date=date(2026, 7, 15), apps_file=apps_file, repo_root=tmp_path)

    assert result["metadata"]["totalTracked"] == 4
    assert result["metadata"]["actionable"] == 3
    acme = next(entry for entry in result["entries"] if entry["company"] == "Acme")
    assert acme["appliedDate"] == "2026-06-20"
    assert acme["via"] == "AgencyOne"
    assert acme["contacts"] == [{"email": "jane@agency.com", "name": "Jane Doe"}]
    assert acme["reportPath"] == "reports/001-acme.md"
    assert acme["nextOverride"] == "2026-07-20"
    assert acme["urgency"] == "waiting"
    assert acme["daysUntilNext"] == 5
    globex = next(entry for entry in result["entries"] if entry["company"] == "Globex")
    assert globex["urgency"] == "waiting"
    initech = next(entry for entry in result["entries"] if entry["company"] == "Initech")
    assert initech["urgency"] == "overdue"


def test_overdue_only_and_cold() -> None:
    apps = [
        {"num": 1, "date": "2026-06-01", "company": "ColdCo", "role": "Dev", "status": "Applied", "score": "4/5", "notes": "", "report": "", "via": ""},
        {"num": 2, "date": "2026-06-20", "company": "DueCo", "role": "Dev", "status": "Applied", "score": "4/5", "notes": "", "report": "", "via": ""},
    ]
    followups = [
        {"appNum": 1, "date": "2026-06-05"},
        {"appNum": 1, "date": "2026-06-15"},
    ]
    result = analyze_followups(apps, followups, {}, analysis_date="2026-07-15", overdue_only=True)
    assert [entry["company"] for entry in result["entries"]] == ["DueCo"]
    assert compute_urgency("applied", 44, 30, 2) == "cold"
    assert parse_applied_date("foo Applied 2026-07-01 bar") == "2026-07-01"

