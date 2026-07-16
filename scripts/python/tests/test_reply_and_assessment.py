from __future__ import annotations

import json

from scripts.python.other.assessment_log import build_row, parse_assessments, parse_pct, summarize
from scripts.python.reply.paste_reply import append_candidate, normalize_candidate, parse_file_input
from scripts.python.reply.reply_matcher import (
    check_company_match,
    check_role_match,
    classify_reply,
    extract_domain,
    match_candidates,
)


def test_reply_matcher_basics() -> None:
    assert extract_domain("notice@fundeliver.com") == "fundeliver.com"
    assert extract_domain("Jane Doe <jane.doe@lever.co>") == "lever.co"
    assert extract_domain("invalid-email") is None
    assert check_company_match("Interview with AcmeCorp", "Acme Corp")
    assert check_company_match("恭喜简历通过，杭州赢云贸易邀您面试", "杭州赢云贸易有限公司")
    assert not check_company_match("Interview with Random", "Acme Corp")
    assert check_role_match("邀请您参加PY01_python开发工程师的面试", "python开发工程师")
    assert check_role_match("邀请您参加python开发工程师的面试", "PY01_python开发工程师")


def test_match_candidates_confidence_and_ambiguity() -> None:
    apps = [
        {"num": 1, "company": "Acme Corp", "role": "Software Engineer", "notes": ""},
        {"num": 2, "company": "杭州赢云贸易有限公司", "role": "PY01_python开发工程师", "notes": ""},
    ]
    candidates = [
        {
            "message_id": "msg1",
            "from": "notice@acmecorp.com",
            "subject": "Interview for Software Engineer at Acme Corp",
            "body_snippet": "We would like to invite you...",
            "signal": "interview_invite",
        },
        {
            "message_id": "msg2",
            "from": "Notice@fundeliver.com",
            "subject": "恭喜简历通过，杭州赢云贸易有限公司邀您面试",
            "body_snippet": "邀请您参加PY01_python开发工程师的面试... AI微信小程序面试",
            "signal": "interview_invite",
        },
    ]
    results = match_candidates(candidates, apps)
    assert results[0]["application_num"] == 1
    assert results[0]["confidence"] == "high"
    assert "company-name" in results[0]["signals"]
    assert results[1]["application_num"] == 2
    assert results[1]["confidence"] == "high"

    domain = match_candidates(
        [{"message_id": "msg3", "from": "jane@techstartup.io", "subject": "Application Update", "body_snippet": "Thank you for applying", "signal": "update"}],
        [{"num": 3, "company": "Tech Startup", "role": "Data Scientist", "notes": "recruiter@techstartup.io"}],
    )[0]
    assert domain["confidence"] == "medium"
    assert "sender-domain" in domain["signals"]

    ambiguous = match_candidates(
        [{"message_id": "msg4", "from": "recruiting@bigbank.com", "subject": "Interview with BigBank", "body_snippet": "We want to proceed", "signal": "interview_invite"}],
        [{"num": 4, "company": "BigBank", "role": "Backend Dev", "notes": ""}, {"num": 5, "company": "BigBank", "role": "Frontend Dev", "notes": ""}],
    )[0]
    assert ambiguous["application_num"] is None
    assert "ambiguous-match" in ambiguous["signals"]


def test_classify_reply_fixtures() -> None:
    for text in ["恭喜简历通过，杭州赢云贸易有限公司邀您面试", "面试形式：AI微信小程序面试", "Interview invitation: Senior Frontend Developer"]:
        result = classify_reply({"subject": text, "body_snippet": ""})
        assert result["type"] == "Interview"
        assert result["suggestedTrackerUpdate"] == "Interview"
    for text in ["邀请投递测试工程师岗位", "近期热招职位", "Zhaopin job alert"]:
        assert classify_reply({"subject": text, "body_snippet": ""})["type"] == "Noise"
    assert classify_reply({"subject": "Unfortunately we decided not to proceed", "body_snippet": ""})["type"] == "Rejected"
    assert classify_reply({"subject": "Offer of Employment", "body_snippet": "We are pleased to offer you..."})["type"] == "Offer"
    assert classify_reply({"subject": "Please complete assessment test", "body_snippet": ""})["suggestedTrackerUpdate"] == "Responded"
    assert classify_reply({"subject": "Please pick a time to schedule our interview", "body_snippet": ""})["suggestedTrackerUpdate"] == "Interview"
    unknown = classify_reply({"subject": "邀请您在面试/入职之前更新或补充最新的应聘信息", "body_snippet": ""})
    assert unknown["type"] == "Unknown"
    assert unknown["suggestedTrackerUpdate"] == "Needs Review"


def test_paste_reply_parse_normalize_append(tmp_path) -> None:
    parsed = parse_file_input("Subject: Interview\nFrom: jane@example.com\n\nBody line 1\nBody line 2")
    assert parsed == {"subject": "Interview", "from": "jane@example.com", "body": "Body line 1\nBody line 2"}
    no_headers = parse_file_input("Just body")
    assert no_headers["body"] == "Just body"

    candidate = normalize_candidate(parsed)
    assert candidate["from"] == "jane@example.com"
    assert candidate["subject"] == "Interview"
    assert candidate["signal"] is None

    path = tmp_path / "reply-candidates.json"
    assert append_candidate(candidate, path) == 1
    assert append_candidate({**candidate, "message_id": "second"}, path) == 2
    assert len(json.loads(path.read_text(encoding="utf-8"))) == 2


def test_assessment_log_parse_summarize_and_build() -> None:
    assert parse_pct("70") == 70
    assert parse_pct("70.5 %") == 70.5
    assert parse_pct("-") is None
    assert parse_pct("high") is None

    fixture = "\n".join(
        [
            "# comment",
            "2026-07-01\tAcme\t042\teSkill\tMS Office\t70\t92\treferences Acrobat 9",
            "2026-07-02\tGlobex\t-\tHackerRank\tJavaScript\t-\t85\t",
            "2026-07-03\tInitech\t013\tCriteria\tCognitive\t65\t60\t",
            "2026-07-06\tAcme",
        ]
    )
    parsed = parse_assessments(fixture)
    assert len(parsed["rows"]) == 3
    assert len(parsed["malformed"]) == 1
    summary = summarize(parsed["rows"], parsed["malformed"])
    assert summary["quality"]["total"] == 3
    assert summary["quality"]["staleFlagged"] == 1
    assert summary["aggregates"]["byPlatform"]["eSkill"]["passed"] == 1
    assert summary["aggregates"]["byPlatform"]["Criteria"]["failed"] == 1
    assert summary["aggregates"]["byPlatform"]["HackerRank"]["unknownOutcome"] == 1

    row = build_row(
        {"company": "Acme", "report": "042", "platform": "eSkill", "subject": "MS Office", "threshold": "70", "score": "92", "stale": "Acrobat 9"},
        "2026-07-07",
    )
    assert row == "2026-07-07\tAcme\t042\teSkill\tMS Office\t70\t92\tAcrobat 9"
    minimal = build_row({"company": "Acme", "platform": "eSkill", "subject": "Excel"}, "2026-07-07")
    assert minimal == "2026-07-07\tAcme\t-\teSkill\tExcel\t-\t-\t"

    for fields, fragment in [
        ({"platform": "eSkill", "subject": "Excel"}, "--company is required"),
        ({"company": "Acme", "platform": "eSkill", "subject": "Excel", "threshold": "high"}, "--threshold must be a percentage"),
        ({"company": "A\tcme", "platform": "eSkill", "subject": "Excel"}, "tabs"),
    ]:
        try:
            build_row(fields, "2026-07-07")
        except ValueError as exc:
            assert fragment in str(exc)
        else:
            raise AssertionError("expected build_row validation error")

