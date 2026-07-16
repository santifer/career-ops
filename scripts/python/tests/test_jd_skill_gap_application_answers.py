from __future__ import annotations

from scripts.python.evaluation.jd_skill_gap import (
    classify_skill_gaps,
    extract_jd_skills,
    skill_mentioned_in_text,
    split_skills_section,
)
from scripts.python.other.application_answers import (
    format_application_answers_section,
    normalize_application_answers_snapshot,
    upsert_application_answers_section,
)


def test_jd_skill_gap_extraction_and_classification() -> None:
    jd = """
# Senior Engineer

## Requirements
- Python, FastAPI, PostgreSQL
- Experience with Kubernetes
- Strong communication skills
"""
    cv = """
# Skills
Python, PostgreSQL, Docker

# Experience
Deployed services onto Kubernetes clusters and wrote FastAPI endpoints.
"""
    skills = extract_jd_skills(jd)
    assert "Python" in skills
    assert "Kubernetes" in skills
    assert "Strong" not in skills
    result = classify_skill_gaps(["Python", "PostgreSQL", "Kubernetes", "FastAPI", "Rust"], cv)
    assert result["existing"] == ["Python", "PostgreSQL"]
    assert result["supportedByResume"] == ["Kubernetes", "FastAPI"]
    assert result["gap"] == ["Rust"]


def test_jd_skill_gap_regressions() -> None:
    trailing_cv = """
# Experience
Worked with Rust.

# Skills
Python, Docker, Zookeeper
"""
    sections = split_skills_section(trailing_cv)
    assert "Zookeeper" in sections["namedSkillsText"]
    assert classify_skill_gaps(["Python", "Zookeeper"], trailing_cv)["existing"] == ["Python", "Zookeeper"]

    boilerplate = """
## Requirements
- Bachelor's degree required
- Experience with cross-functional teams
- Communication skills and Ability to self-organize
"""
    extracted = extract_jd_skills(boilerplate)
    assert "Bachelor" not in extracted
    assert "Experience" not in extracted
    assert "Communication" not in extracted
    assert "Ability" not in extracted

    symbol_edge = """
## Requirements
- C#, C++ or F# for backend services
- Familiarity with Docker.
"""
    symbol_skills = extract_jd_skills(symbol_edge)
    assert "C#" in symbol_skills
    assert "C++" in symbol_skills
    assert "F#" in symbol_skills
    assert "Docker" in symbol_skills
    assert "Docker." not in symbol_skills
    assert skill_mentioned_in_text("Java", "JavaScript") is False
    assert skill_mentioned_in_text("C++", "C++ services") is True


def test_application_answers_normalize_and_format() -> None:
    snapshot = normalize_application_answers_snapshot(
        {
            "date": "2026-07-15",
            "state": "submitted",
            "answers": [{"question": "Why us?", "answer": "Because\nmission fit"}],
            "selectedOptions": [{"label": "Work auth", "selected": ["EU", "US"]}],
            "fields": [{"field": "Salary", "value": "100k"}],
            "uploads": [{"type": "CV", "path": "output/cv.pdf", "version": "tailored"}],
        }
    )
    assert snapshot["state"] == "submitted"
    section = format_application_answers_section(snapshot)
    assert "## Application Answers" in section
    assert "> Because" in section
    assert "> mission fit" in section
    assert "1. **Work auth:** EU, US" in section
    assert "1. **CV:** output/cv.pdf (tailored)" in section


def test_application_answers_upsert() -> None:
    report = "# Report\n\n## Summary\n\nText.\n"
    snapshot = {"date": "2026-07-15", "state": "filled", "freeText": [{"question": "Q", "answer": "A"}]}
    added = upsert_application_answers_section(report, snapshot)
    assert added.count("## Application Answers") == 1
    assert added.endswith("\n")

    replaced = upsert_application_answers_section(
        added + "\n## Next\n\nKeep me.\n",
        {"date": "2026-07-16", "state": "submitted", "freeText": [{"question": "Q2", "answer": "A2"}]},
    )
    assert replaced.count("## Application Answers") == 1
    assert "**Date:** 2026-07-16" in replaced
    assert "Keep me." in replaced
    assert "Q2" in replaced
    assert "Q\n" not in replaced


def test_application_answers_invalid_state() -> None:
    try:
        normalize_application_answers_snapshot({"state": "draft"})
    except ValueError as exc:
        assert "filled" in str(exc)
    else:
        raise AssertionError("expected invalid state error")

