from __future__ import annotations

from scripts.python.admin.analyze_patterns import (
    analyze,
    analyze_entries,
    build_via_channel_analysis,
    classify_company_size,
    classify_outcome,
    classify_remote,
    detect_vendor,
    extract_blocker_type,
    normalize_status,
    parse_machine_summary,
    parse_report_content,
    parse_tracker_content,
)
from scripts.python.admin.stats import (
    compute_all_stats,
    compute_followup_stats,
    compute_funnel,
    compute_portal_stats,
    compute_run_stats,
    compute_scan_stats,
    compute_tracker_stats,
    format_summary,
    iso_week,
    scan_company_names,
    tracker_status_by_num,
)


TRACKER = """# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Acme | Backend Engineer | 4.2/5 | Applied | ✅ | [001](reports/001-acme.md) | recruiter@acme.com |
| 2 | 2026-06-02 | Globex | Data Engineer | 3.8/5 | Responded | ❌ | [002](reports/002-globex.md) | Applied 2026-06-02 |
| 3 | 2026-06-03 | Hooli | AI Lead | 4.7/5 | Interview | ✅ | — | |
| 4 | 2026-06-04 | Initrode | PM | 2.0/5 | SKIP | ❌ | — | |
| 5 | 2026-06-05 | Umbrella | ML Eng | 4.5/5 | Rejected | ✅ | [005](reports/005-umbrella.md) | |
| 6 | 2026-06-06 | Wonka | Researcher | bad | Ghosted | ❌ | — | |
"""


def test_analyze_patterns_helpers_machine_summary_vendor_and_via() -> None:
    summary = parse_machine_summary(
        """
## Machine Summary

```yaml
company: Acme
role: Staff AI Engineer
score: 4.4
archetype: AI Platform
hard_stops: []
soft_gaps:
  - No healthcare domain
top_strengths: [Evaluation pipelines]
next_action: "Follow up on ticket #42"
via: Hays
company_confidential: true
unknown_field: ignored
```
"""
    )
    assert summary["score"] == 4.4
    assert summary["soft_gaps"] == ["No healthcare domain"]
    assert summary["next_action"] == "Follow up on ticket #42"
    assert "unknown_field" not in summary

    assert normalize_status("Rechazado 2026-07-15") == "rejected"
    assert classify_outcome("applied") == "positive"
    assert classify_outcome("descartado") == "negative"
    assert classify_outcome("no aplicar") == "self_filtered"
    assert detect_vendor("https://boards.greenhouse.io/acme/jobs/1") == "greenhouse"
    assert detect_vendor("https://jobs.eu.lever.co/acme/x") == "lever"
    assert detect_vendor("https://jobs.ashbyhq.com/acme/x") == "ashby"
    assert detect_vendor("https://acme.wd1.myworkdayjobs.com/jobs/x") == "workday"
    assert detect_vendor("https://careers.icims.com/jobs/1") is None

    assert classify_remote("US-only remote") == "geo-restricted"
    assert classify_remote("Hybrid in Paris") == "hybrid/onsite"
    assert classify_remote("Worldwide") == "global remote"
    assert classify_remote("Fully remote LATAM") == "regional remote"
    assert classify_company_size("1-50") == "startup"
    assert classify_company_size("200 people") == "scaleup"
    assert classify_company_size("1,000 employees") == "enterprise"
    assert extract_blocker_type({"description": "US-only residency", "severity": "hard"}) == "geo-restriction"
    assert extract_blocker_type({"description": "Missing React", "severity": "hard"}) == "stack-mismatch"
    assert extract_blocker_type({"description": "Nice to have AWS", "severity": "soft"}) is None

    rows = [
        {"via": "Hays", "normalizedStatus": "interview"},
        {"via": "HAYS ", "normalizedStatus": "rejected"},
        {"via": "ＨＡＹＳ", "normalizedStatus": "rejected"},
        {"via": "—", "normalizedStatus": "responded"},
        {"via": "", "normalizedStatus": "applied"},
    ]
    result = build_via_channel_analysis(rows, lambda row: row["normalizedStatus"] in {"responded", "interview", "offer"}, min_sample=2)
    assert result["agencySubmitted"] == 3
    assert result["directSubmitted"] == 1
    assert result["unknownVia"] == 1
    assert result["breakdown"][0]["agency"] == "Hays"
    assert result["breakdown"][0]["advanceRate"] == 33
    assert result["breakdown"][0]["sufficientSample"] is True


def test_analyze_patterns_report_parser_and_end_to_end(tmp_path) -> None:
    report = """
**URL:** https://boards.greenhouse.io/acme/jobs/1

## Machine Summary

```yaml
company: Acme
role: Senior Engineer
score: 4.2
archetype: AI Platform
remote: Worldwide
team_size: "200"
hard_stops:
  - Missing React
soft_gaps:
  - No healthcare domain
```

| Gap | Severity | Mitigation |
| --- | --- | --- |
| US-only residency | hard | none |
"""
    parsed = parse_report_content(report)
    assert parsed["url"] == "https://boards.greenhouse.io/acme/jobs/1"
    assert parsed["archetype"] == "AI Platform"
    assert parsed["scores"]["global"] == 4.2
    assert len(parsed["gaps"]) == 3

    tracker = """
| # | Date | Company | Role | Score | Status | PDF | Report | Notes | Via |
|---|------|---------|------|-------|--------|-----|--------|-------|-----|
| 1 | 2026-07-01 | Acme | Senior Engineer | 4.2/5 | Interview | | [001](reports/001-acme.md) | remote | Hays |
| 2 | 2026-07-02 | Beta | Backend Engineer | 3.8/5 | Rejected | | [002](reports/002-beta.md) | US-only | — |
"""
    rows = parse_tracker_content(tracker)
    result = analyze_entries(rows, {rows[0].report: report, rows[1].report: report}, min_threshold=1, min_vendor_n=1, today="2026-07-15")
    assert result["metadata"]["total"] == 2
    assert result["funnel"] == {"interview": 1, "rejected": 1}
    assert result["scoreComparison"]["positive"]["avg"] == 4.2
    assert result["vendorAnalysis"]["breakdown"][0]["vendor"] == "greenhouse"
    assert result["viaChannelAnalysis"]["agencySubmitted"] == 1
    assert any(item["blocker"] == "stack-mismatch" for item in result["blockerAnalysis"])

    (tmp_path / "data").mkdir()
    (tmp_path / "reports").mkdir()
    (tmp_path / "data/applications.md").write_text(tracker, encoding="utf-8")
    (tmp_path / "reports/001-acme.md").write_text(report, encoding="utf-8")
    (tmp_path / "reports/002-beta.md").write_text(report, encoding="utf-8")
    disk_result = analyze(tmp_path, min_threshold=1, min_vendor_n=1)
    assert disk_result["metadata"]["total"] == 2


def test_tracker_stats_and_funnel_are_header_aware() -> None:
    stats = compute_tracker_stats(TRACKER)
    assert stats["total"] == 6
    assert stats["byStatus"]["Applied"] == 1
    assert stats["byStatus"]["Responded"] == 1
    assert stats["byStatus"]["Interview"] == 1
    assert stats["byStatus"]["Rejected"] == 1
    assert stats["byStatus"]["SKIP"] == 1
    assert stats["byStatus"]["Unknown"] == 1
    assert stats["activeApps"] == 3
    assert stats["avgScore"] == 3.8
    assert stats["avgScoreApplied"] == 4.3
    assert stats["topScore"] == 4.7
    assert stats["pdfPct"] == 50
    assert stats["reportPct"] == 50

    funnel = compute_funnel(stats["byStatus"])
    assert funnel == {
        "everApplied": 4,
        "everResponded": 2,
        "everInterview": 1,
        "everOffer": 0,
        "responseRate": 50,
        "interviewRate": 25,
        "offerRate": 0,
        "smallSample": True,
    }
    assert tracker_status_by_num(TRACKER)[1] == "Applied"


def test_scan_stats_iso_week_and_company_names() -> None:
    scan_history = "\n".join(
        [
            "url\tdate\tportal\trole\tcompany\tstatus",
            "https://jobs.example/1\t2026-01-01\tgreenhouse\tEng\tAcme\tadded\tfingerprint",
            "https://jobs.example/2\t2026-01-02\tlever\tData\tGlobex\tseen",
            "torn row",
            "https://jobs.example/3\t2026-01-08\tgreenhouse\tPM\tAcme\tadded",
        ]
    )
    stats = compute_scan_stats(scan_history, weeks=2)
    assert iso_week("2026-01-01") == "2026-W01"
    assert stats["totalRecorded"] == 3
    assert stats["added"] == 2
    assert stats["byPortal"] == {"greenhouse": 2, "lever": 1}
    assert stats["byStatus"] == {"added": 2, "seen": 1}
    assert stats["distinctCompanies"] == 2
    assert stats["firstSeen"] == "2026-01-01"
    assert stats["lastSeen"] == "2026-01-08"
    assert scan_company_names(scan_history) == ["acme", "globex"]


def test_portal_followup_and_run_stats() -> None:
    portals = """
tracked_companies:
  - name: Acme
  - name: MissingCo
job_boards:
  - name: RemoteOK
"""
    portal_stats = compute_portal_stats(portals, {"byPortal": {"greenhouse": 2}}, ["acme"])
    assert portal_stats == {
        "configuredCompanies": 2,
        "configuredBoards": 1,
        "activePortals": 1,
        "producingCompanies": 1,
        "producingPct": 50,
    }

    followups = """| num | appNum | date | company | role | channel | contact | notes |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 2026-06-10 | Acme | Backend | email | recruiter@acme.com | ping |
| 2 | 1 | 2026-06-17 | Acme | Backend | email | recruiter@acme.com | ping |
"""
    assert compute_followup_stats(followups, tracker_status_by_num(TRACKER)) == {
        "totalFollowups": 2,
        "appsWithFollowups": 1,
        "appliedWithoutFollowup": 0,
        "avgPerApp": 2.0,
    }

    runs = """timestamp\tstatus\tfound\tfiltered_title\tfiltered_location\tnew_added
2026-06-01T10:00:00Z\tcompleted\t10\t2\t1\t4
2026-06-02T10:00:00Z\tfailed\t99\t0\t0\t0
2026-06-03T10:00:00Z\tcompleted\t20\t4\t2\t6
torn
"""
    assert compute_run_stats(runs) == {
        "totalRuns": 3,
        "failedRuns": 1,
        "lastRunDate": "2026-06-03",
        "avgFoundPerRun": 15.0,
        "avgNewPerRun": 5.0,
        "filterRemovalPct": 30.0,
    }


def test_compute_all_stats_degrades_missing_sections_and_formats_summary(tmp_path) -> None:
    apps = tmp_path / "applications.md"
    apps.write_text(TRACKER, encoding="utf-8")
    followups = tmp_path / "follow-ups.md"
    followups.write_text("", encoding="utf-8")

    stats = compute_all_stats(
        apps_file=apps,
        scan_history_file=tmp_path / "missing-scan.tsv",
        followups_file=followups,
        scan_runs_file=tmp_path / "missing-runs.tsv",
        portals_file=tmp_path / "missing-portals.yml",
    )
    summary = format_summary(stats)

    assert stats["metadata"]["sources"] == {
        "tracker": True,
        "scanHistory": False,
        "followups": True,
        "portals": False,
        "scanRuns": False,
    }
    assert stats["tracker"]["total"] == 6
    assert stats["scan"] is None
    assert stats["portals"] is None
    assert stats["runs"] is None
    assert "Tracker:    6 total" in summary
    assert "Scanner:    — no data" in summary
