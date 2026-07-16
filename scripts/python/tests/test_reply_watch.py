from __future__ import annotations

import json

from scripts.python.reply.reply_watch import build_digest, format_digest, load_followups, run_reply_watch, signal_description


TRACKER = """# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Acme | Platform Engineer | 4.2/5 | Applied | ok | [001](reports/001-acme.md) | recruiter@acme.com |
| 2 | 2026-06-02 | Globex | Data Engineer | 4.0/5 | Applied | ok | [002](reports/002-globex.md) | — |
"""


def test_signal_description_customizes_chinese_interview_signal() -> None:
    text = "恭喜简历通过，面试形式：AI微信小程序面试"
    assert signal_description(text, "interview_invite") == "resume passed + AI WeChat mini-program interview"
    assert signal_description("plain text", None) == "none"


def test_load_followups_parses_markdown_table(tmp_path) -> None:
    followups = tmp_path / "follow-ups.md"
    followups.write_text(
        """# Follow-ups

| num | appNum | date | company | role | channel | contact | notes |
|---|---|---|---|---|---|---|---|
| 1 | 2 | 2026-06-10 | Globex | Data Engineer | email | recruiter@globex.com | intro |
""",
        encoding="utf-8",
    )

    rows = load_followups(followups)
    assert rows == [
        {
            "num": 1,
            "appNum": 2,
            "date": "2026-06-10",
            "company": "Globex",
            "role": "Data Engineer",
            "channel": "email",
            "contact": "recruiter@globex.com",
            "notes": "intro",
        }
    ]


def test_build_digest_recommends_status_updates() -> None:
    candidates = [
        {
            "message_id": "m1",
            "from": "recruiter@acme.com",
            "subject": "Interview invitation for Platform Engineer",
            "body_snippet": "We would like to schedule an interview.",
            "signal": "interview_invite",
        },
        {
            "message_id": "m2",
            "from": "alerts@jobs.example",
            "subject": "Job alert",
            "body_snippet": "Recommended jobs and newsletter",
            "signal": None,
        },
    ]
    apps = [
        {"num": 1, "company": "Acme", "role": "Platform Engineer", "status": "Applied", "notes": "recruiter@acme.com"},
    ]

    digest = build_digest(candidates, apps)
    formatted = format_digest(digest)

    assert digest["count"] == 2
    assert digest["items"][0]["header"] == "Acme — Platform Engineer"
    assert digest["items"][0]["classification"]["type"] == "Interview"
    assert digest["recommendations"] == [
        {"num": 1, "company": "Acme", "role": "Platform Engineer", "oldStatus": "Applied", "newStatus": "Interview"}
    ]
    assert "Suggested status updates to apply" in formatted
    assert "Job alert" in formatted


def test_run_reply_watch_apply_updates_tracker(tmp_path) -> None:
    tracker = tmp_path / "applications.md"
    tracker.write_text(TRACKER, encoding="utf-8")
    candidates = tmp_path / "reply-candidates.json"
    candidates.write_text(
        json.dumps(
            [
                {
                    "message_id": "m1",
                    "from": "recruiter@acme.com",
                    "subject": "Interview invitation for Platform Engineer",
                    "body_snippet": "Please pick a time for the interview.",
                    "signal": "interview_invite",
                }
            ]
        ),
        encoding="utf-8",
    )
    followups = tmp_path / "follow-ups.md"
    followups.write_text("", encoding="utf-8")

    dry = run_reply_watch(candidates, tracker, followups, apply_updates=False)
    assert dry["applied"] == []
    assert "| 1 | 2026-06-01 | Acme | Platform Engineer | 4.2/5 | Applied |" in tracker.read_text(encoding="utf-8")

    applied = run_reply_watch(candidates, tracker, followups, apply_updates=True)
    assert applied["applied"] == [1]
    assert "| 1 | 2026-06-01 | Acme | Platform Engineer | 4.2/5 | Interview |" in tracker.read_text(encoding="utf-8")
