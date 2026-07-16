from __future__ import annotations

from scripts.python.admin.upskill import (
    aggregate_gaps,
    analyze_upskill,
    compute_targeted_gaps,
    extract_skills,
    format_summary,
    parse_report_gaps,
)


REPORT = """# 001 - Acme

| Gap | Severity | Mitigation |
|-----|----------|------------|
| No Kafka experience | soft gap | Learn it |

## Machine Summary

```yaml
score: 3.2
hard_stops: []
soft_gaps:
  - "Limited Airflow exposure"
```
"""


def test_extract_skills_canonicalizes_and_avoids_go_false_positives() -> None:
    skills = extract_skills("Needs k8s, golang, Postgres, NodeJS, graphql, C++, C# and .NET.")
    assert {"Kubernetes", "Go", "PostgreSQL", "Node.js", "GraphQL", "C++", "C#", ".NET"}.issubset(skills)

    assert "Go" in extract_skills("Backend in Go/Rust (Go preferred).")
    assert "Go" not in extract_skills("willing to go the extra mile; ready to GO live")
    assert "Go" not in extract_skills("Own Go-to-market and Go-live support")


def test_aggregate_gaps_weights_presence_and_excludes_known_skills() -> None:
    known = extract_skills("Expert in Java and AWS.")
    result = aggregate_gaps(
        [
            {"num": 1, "score": 2.0, "gapText": "Missing JavaScript and GCP experience"},
            {"num": 2, "score": 3.0, "gapText": "Needs Java and Kubernetes Kubernetes"},
            {"num": 3, "score": 4.5, "gapText": "Kubernetes"},
        ],
        known,
    )
    gaps = {gap["skill"]: gap for gap in result["gaps"]}

    assert "JavaScript" in gaps
    assert "GCP" in gaps
    assert "Java" not in gaps
    assert any(item["skill"] == "Java" for item in result["excludedAsKnown"])
    assert gaps["Kubernetes"]["reports"] == 2
    assert gaps["Kubernetes"]["weightedScore"] == 2.5
    assert result["totalLowFit"] == 2


def test_aggregate_tiering_thresholds() -> None:
    reports = [
        {"num": 10, "score": 2.0, "gapText": "Terraform"},
        {"num": 11, "score": 2.5, "gapText": "Terraform"},
        {"num": 12, "score": 3.0, "gapText": "Terraform and Spark"},
        {"num": 13, "score": 3.5, "gapText": "nothing here"},
        {"num": 14, "score": 3.9, "gapText": "nothing here"},
    ]
    gaps = {gap["skill"]: gap for gap in aggregate_gaps(reports, set())["gaps"]}
    assert gaps["Terraform"]["tier"] == "Critical"
    assert gaps["Spark"]["tier"] == "Low"


def test_parse_report_gaps_machine_summary_and_gap_table() -> None:
    parsed = parse_report_gaps(REPORT)
    assert parsed["score"] == 3.2
    assert parsed["hasMachineSummary"] is True
    assert "Kafka" in parsed["gapText"]
    assert "Airflow" in parsed["gapText"]


def test_targeted_gaps_use_canonical_known_skill_suppression() -> None:
    result = compute_targeted_gaps(
        "Kubernetes, C++, .NET, Java, SQL, Go, LLMs",
        "k8s, C++, .NET, JavaScript, PostgreSQL, MongoDB, LLMs",
    )
    assert {"Java", "SQL", "Go"}.issubset(set(result["gaps"]))
    assert {"Kubernetes", "C++", ".NET", "LLMs"}.issubset(set(result["excludedAsKnown"]))


def test_analyze_upskill_reads_linked_reports_and_formats_summary(tmp_path) -> None:
    data = tmp_path / "data"
    reports = tmp_path / "reports"
    data.mkdir()
    reports.mkdir()
    tracker = data / "applications.md"
    report = reports / "001-acme-2026-06-01.md"
    report.write_text(REPORT, encoding="utf-8")
    tracker.write_text(
        """# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-06-01 | Acme | Data Engineer | 3.2/5 | Evaluated | ok | [001](../reports/001-acme-2026-06-01.md) | |
""",
        encoding="utf-8",
    )
    cv = tmp_path / "cv.md"
    cv.write_text("Experienced with Kafka.", encoding="utf-8")
    profile = tmp_path / "profile.yml"
    profile.write_text("skills:\n  - Python\n", encoding="utf-8")

    result = analyze_upskill(tracker, cv_path=cv, profile_path=profile, root=tmp_path, min_reports=1)
    summary = format_summary(result)

    assert result["schema_version"] == 1
    assert result["metadata"]["reportsLinked"] == 1
    assert result["metadata"]["reportsRead"] == 1
    assert result["metadata"]["reportsWithMachineSummary"] == 1
    assert any(gap["skill"] == "Airflow" for gap in result["gaps"])
    assert not any(gap["skill"] == "Kafka" for gap in result["gaps"])
    assert any(item["skill"] == "Kafka" for item in result["excludedAsKnown"])
    assert "UPSKILL GAP MAP" in summary
