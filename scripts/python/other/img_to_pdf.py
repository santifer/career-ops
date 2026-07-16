#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import base64
from dataclasses import dataclass
from pathlib import Path


MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
}


@dataclass(frozen=True)
class ParsedArgs:
    inputPath: str = ""
    outputPath: str = ""
    force: bool = False
    help: bool = False
    error: str | None = None


def detect_mime_type(image_path: str | Path) -> str | None:
    return MIME_TYPES.get(Path(image_path).suffix.lower())


def parse_args(args: list[str]) -> ParsedArgs:
    input_path = ""
    output_path = ""
    force = False
    help_flag = False
    for arg in args:
        if arg == "--force":
            force = True
        elif arg in {"--help", "-h"}:
            help_flag = True
        elif not input_path:
            input_path = arg
        elif not output_path:
            output_path = arg
    if help_flag:
        return ParsedArgs(input_path, output_path, force, True, None)
    if not input_path or not output_path:
        return ParsedArgs(input_path, output_path, force, False, "Missing <image-path> and/or <output-path>.")
    return ParsedArgs(input_path, output_path, force, False, None)


def validate_conversion_inputs(input_path: str | Path, output_path: str | Path, *, force: bool = False) -> tuple[Path, Path]:
    source = Path(input_path).resolve(strict=False)
    target = Path(output_path).resolve(strict=False)
    if not source.exists():
        raise FileNotFoundError(f"Image not found: {source}")
    if not source.is_file():
        raise ValueError(f"Input is not a file: {source}")
    if not detect_mime_type(source):
        raise ValueError(f"Unsupported image type: {source.suffix or '(no extension)'}. Supported: {', '.join(MIME_TYPES)}")
    if target.exists() and not force:
        raise FileExistsError(f"Output already exists: {target}. Pass --force to overwrite it.")
    return source, target


def image_html(image_bytes: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; }}
  html, body {{ margin: 0; padding: 0; }}
  img {{ display: block; }}
</style>
</head>
<body>
<img id="career-ops-img" src="data:{mime_type};base64,{encoded}">
</body>
</html>"""


async def convert_image_to_pdf(input_path: str | Path, output_path: str | Path) -> dict[str, object]:
    source = Path(input_path)
    target = Path(output_path)
    mime_type = detect_mime_type(source)
    if not mime_type:
        raise ValueError(f"Unsupported image type: {source.suffix or '(no extension)'}. Supported: {', '.join(MIME_TYPES)}")

    try:
        from playwright.async_api import async_playwright
    except Exception as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("playwright not installed") from exc

    target.parent.mkdir(parents=True, exist_ok=True)
    html = image_html(source.read_bytes(), mime_type)
    async with async_playwright() as p:  # pragma: no cover - browser runtime
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            await page.set_content(html, wait_until="load")
            await page.wait_for_function(
                """() => {
                  const img = document.getElementById('career-ops-img');
                  return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
                }""",
                timeout=10000,
            )
            size = await page.evaluate(
                """() => {
                  const img = document.getElementById('career-ops-img');
                  return { width: img.naturalWidth, height: img.naturalHeight };
                }"""
            )
            pdf = await page.pdf(
                width=f"{size['width'] / 96}in",
                height=f"{size['height'] / 96}in",
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                print_background=True,
            )
            target.write_bytes(pdf)
            return {"outputPath": str(target), "size": len(pdf), "width": size["width"], "height": size["height"]}
        finally:
            await browser.close()


def usage() -> str:
    return "\n".join(
        [
            "Usage: img_to_pdf.py <image-path> <output-path> [--force]",
            "",
            "Converts a single screenshot/image into a single-page PDF.",
            "",
            "  --force   overwrite <output-path> if it already exists",
        ]
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert one image to a single-page PDF.")
    parser.add_argument("input_path")
    parser.add_argument("output_path")
    parser.add_argument("--force", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parsed = parse_args(argv or [])
    if parsed.help:
        print(usage())
        return 0
    if parsed.error:
        print(parsed.error)
        print(usage())
        return 1
    try:
        input_path, output_path = validate_conversion_inputs(parsed.inputPath, parsed.outputPath, force=parsed.force)
        result = asyncio.run(convert_image_to_pdf(input_path, output_path))
    except Exception as exc:
        print(f"Conversion failed: {exc}")
        return 1
    print(f"PDF generated: {result['outputPath']}")
    print(f"Page size: {result['width']}x{result['height']}px")
    print(f"Size: {result['size'] / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main(sys.argv[1:]))
