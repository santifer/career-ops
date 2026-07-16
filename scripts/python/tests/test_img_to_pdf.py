from __future__ import annotations

import base64

import pytest

from scripts.python.other.img_to_pdf import detect_mime_type, image_html, parse_args, usage, validate_conversion_inputs


def test_detect_mime_type_supported_extensions() -> None:
    assert detect_mime_type("screenshot.png") == "image/png"
    assert detect_mime_type("a/b/c.JPG") == "image/jpeg"
    assert detect_mime_type("x.jpeg") == "image/jpeg"
    assert detect_mime_type("x.gif") == "image/gif"
    assert detect_mime_type("x.webp") == "image/webp"
    assert detect_mime_type("x.bmp") == "image/bmp"
    assert detect_mime_type("x.svg") == "image/svg+xml"
    assert detect_mime_type("x.pdf") is None
    assert detect_mime_type("noext") is None


def test_parse_args_matches_js_contract() -> None:
    parsed = parse_args(["in.png", "out.pdf"])
    assert parsed.inputPath == "in.png"
    assert parsed.outputPath == "out.pdf"
    assert parsed.force is False
    assert parsed.error is None

    assert parse_args(["in.png", "out.pdf", "--force"]).force is True
    before = parse_args(["--force", "in.png", "out.pdf"])
    assert before.inputPath == "in.png"
    assert before.outputPath == "out.pdf"
    assert before.force is True
    assert parse_args(["in.png"]).error is not None
    assert parse_args([]).error is not None
    assert parse_args(["--help"]).help is True
    assert parse_args(["--help"]).error is None


def test_validate_conversion_inputs(tmp_path) -> None:
    source = tmp_path / "in.png"
    source.write_bytes(b"fake-png")
    output = tmp_path / "out.pdf"

    assert validate_conversion_inputs(source, output) == (source.resolve(strict=False), output.resolve(strict=False))

    output.write_bytes(b"old")
    with pytest.raises(FileExistsError, match="Output already exists"):
        validate_conversion_inputs(source, output)
    assert validate_conversion_inputs(source, output, force=True)[1] == output.resolve(strict=False)

    with pytest.raises(FileNotFoundError):
        validate_conversion_inputs(tmp_path / "missing.png", output, force=True)

    directory = tmp_path / "dir.png"
    directory.mkdir()
    with pytest.raises(ValueError, match="Input is not a file"):
        validate_conversion_inputs(directory, output, force=True)

    unsupported = tmp_path / "in.pdf"
    unsupported.write_bytes(b"%PDF")
    with pytest.raises(ValueError, match="Unsupported image type"):
        validate_conversion_inputs(unsupported, output, force=True)


def test_image_html_embeds_data_uri_and_usage_text() -> None:
    html = image_html(b"abc", "image/png")
    assert "data:image/png;base64," in html
    assert base64.b64encode(b"abc").decode("ascii") in html
    assert "career-ops-img" in html
    assert "img_to_pdf.py <image-path>" in usage()
