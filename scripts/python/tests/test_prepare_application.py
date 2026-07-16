from __future__ import annotations

import pytest

from scripts.python.other.prepare_application import (
    build_ashby_fields,
    build_greenhouse_fields,
    build_lever_fields,
    detect_ats,
    format_summary,
    prepare_application_summary,
    read_cover,
    read_profile,
    validate_apply_url,
    validate_pdf_path,
)


def test_detect_ats_supported_hosts_and_safe_segments() -> None:
    assert detect_ats("https://boards.greenhouse.io/acme/jobs/12345").ats == "greenhouse"
    assert detect_ats("https://jobs.ashbyhq.com/acme/job_123/application").ats == "ashby"
    assert detect_ats("https://jobs.eu.lever.co/acme/abc-123").ats == "lever"
    assert detect_ats("http://boards.greenhouse.io/acme/jobs/12345") is None
    assert detect_ats("https://example.com/acme/jobs/12345") is None
    assert detect_ats("https://jobs.ashbyhq.com/acme/bad%2Fid") is None


def test_validate_apply_url_reports_bad_inputs() -> None:
    with pytest.raises(ValueError, match="URL must use https"):
        validate_apply_url("http://jobs.lever.co/acme/abc")
    with pytest.raises(ValueError, match="not a supported ATS host"):
        validate_apply_url("https://example.com/jobs/1")
    with pytest.raises(ValueError, match="not recognized"):
        validate_apply_url("https://boards.greenhouse.io/acme/not-jobs/123")


def test_validate_pdf_path_requires_output_file(tmp_path) -> None:
    root = tmp_path
    output = root / "output"
    output.mkdir()
    pdf = output / "cv.pdf"
    pdf.write_bytes(b"%PDF")

    assert validate_pdf_path("output/cv.pdf", root, output) == pdf.resolve(strict=False)
    with pytest.raises(ValueError, match="inside output"):
        validate_pdf_path("cv.pdf", root, output)
    with pytest.raises(FileNotFoundError):
        validate_pdf_path("output/missing.pdf", root, output)
    directory = output / "dir.pdf"
    directory.mkdir()
    with pytest.raises(ValueError, match="not a file"):
        validate_pdf_path("output/dir.pdf", root, output)


def test_read_profile_cover_and_fields(tmp_path) -> None:
    profile = tmp_path / "profile.yml"
    profile.write_text(
        """full_name: Ada Lovelace
email: ada@example.com
phone: "+33123456789"
location: Paris
linkedin: https://linkedin.example/ada
portfolio_url: https://ada.example
""",
        encoding="utf-8",
    )
    cover = tmp_path / "cover.txt"
    cover.write_text("Dear team,\nI am interested.", encoding="utf-8")
    data = read_profile(profile)
    cover_data = read_cover("cover.txt", tmp_path)

    assert data["firstName"] == "Ada"
    assert data["lastName"] == "Lovelace"
    assert cover_data.wordCount == 5
    assert ("linkedin_profile", "https://linkedin.example/ada") in build_greenhouse_fields(data, cover_data, "cv.pdf")
    assert ("linkedInUrl", "https://linkedin.example/ada") in build_ashby_fields(data, cover_data, "cv.pdf")
    assert ("urls[Portfolio]", "https://ada.example") in build_lever_fields(data, cover_data, "cv.pdf")


def test_prepare_application_summary_and_format(tmp_path) -> None:
    root = tmp_path
    output = root / "output"
    output.mkdir()
    pdf = output / "cv.pdf"
    pdf.write_bytes(b"x" * 2048)
    profile = root / "profile.yml"
    profile.write_text("full_name: Grace Hopper\nemail: grace@example.com\n", encoding="utf-8")

    summary = prepare_application_summary(
        "https://jobs.lever.co/acme/abc-123",
        "output/cv.pdf",
        profile_path=profile,
        root=root,
        output_dir=output,
    )
    rendered = format_summary(summary)

    assert summary["ats"] == "lever"
    assert summary["companySlug"] == "acme"
    assert summary["pdf"] == {"file": "cv.pdf", "sizeKb": 2.0}
    assert {"key": "name", "value": "Grace Hopper"} in summary["fields"]
    assert "Fill the form using the values above" in rendered
    assert "submit" in rendered
