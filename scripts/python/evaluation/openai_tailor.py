#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any, Callable

import yaml

from scripts.python import PROJECT_ROOT
from scripts.python.evaluation.openai_eval import (
    call_openai_compatible,
    default_post_json,
    read_file,
    validate_openai_endpoint,
)


DEFAULT_MODEL = "gpt-4o"
DEFAULT_BASE_URL = "https://api.openai.com/v1"


def company_slug_from_report_path(report_path: str | Path) -> str:
    match = re.match(r"^\d+-([a-z0-9-]+)-\d{4}-\d{2}-\d{2}\.md$", Path(report_path).name)
    return match.group(1) if match else "unknown-company"


def report_num_from_path(report_path: str | Path) -> str:
    match = re.match(r"^(\d+)-", Path(report_path).name)
    return match.group(1) if match else "001"


def clean_tailored_html(text: str) -> str:
    return re.sub(r"\s*```\s*$", "", re.sub(r"^\s*```(?:html)?\s*", "", text.strip(), flags=re.I)).strip()


def candidate_name_from_profile(profile_content: str) -> str:
    try:
        profile = yaml.safe_load(profile_content) or {}
    except Exception:
        profile = {}
    name = profile.get("name") or profile.get("full_name") if isinstance(profile, dict) else None
    slug = re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", str(name or "candidate").lower()))
    return slug or "candidate"


def load_tailor_context(root: str | Path = PROJECT_ROOT) -> dict[str, str]:
    project = Path(root)
    return {
        "shared_context": read_file(project / "modes/_shared.md", "modes/_shared.md"),
        "pdf_mode_logic": read_file(project / "modes/pdf.md", "modes/pdf.md"),
        "cv_content": read_file(project / "cv.md", "cv.md"),
        "profile_content": read_file(project / "config/profile.yml", "config/profile.yml"),
        "template_html": read_file(project / "templates/cv-template.html", "templates/cv-template.html"),
    }


def build_tailor_prompt(
    *,
    shared_context: str,
    pdf_mode_logic: str,
    cv_content: str,
    profile_content: str,
    template_html: str,
) -> str:
    return f"""You are career-ops, an AI-powered CV tailoring engine.
You read a candidate's base CV, profile, an evaluation report, and a Job Description.
Your job is to apply strict anti-fabrication tailoring rules to fill in an HTML template.

═══════════════════════════════════════════════════════
SYSTEM CONTEXT (_shared.md)
═══════════════════════════════════════════════════════
{shared_context}

═══════════════════════════════════════════════════════
PDF TAILORING MODE (pdf.md)
═══════════════════════════════════════════════════════
{pdf_mode_logic}

═══════════════════════════════════════════════════════
HTML TEMPLATE (cv-template.html)
═══════════════════════════════════════════════════════
{template_html}

═══════════════════════════════════════════════════════
CANDIDATE BASE CV & PROFILE
═══════════════════════════════════════════════════════
[cv.md]
{cv_content}

[config/profile.yml]
{profile_content}

═══════════════════════════════════════════════════════
IMPORTANT OPERATING RULES FOR THIS SESSION
═══════════════════════════════════════════════════════
1. NEVER invent skills, metrics, or experience the candidate does not have.
2. Inject keywords naturally by reformulating the real experience using JD vocabulary.
3. Apply the 6-second clarity gate: strongest matching evidence first.
4. Replace all {{{{PLACEHOLDERS}}}} in the HTML Template exactly as instructed.
5. Your final output MUST be the complete, raw, tailored HTML document.
6. Do NOT include markdown formatting like ```html or conversational filler. Output the raw HTML starting with <!DOCTYPE html> and ending with </html>."""


def call_tailor_endpoint(
    *,
    jd_text: str,
    report_text: str,
    system_prompt: str,
    model: str,
    base_url: str,
    api_key: str = "",
    timeout_ms: int = 300_000,
    post_json: Callable[[str, dict[str, Any], dict[str, str], int], dict[str, Any]] = default_post_json,
) -> str:
    user_text = (
        f"EVALUATION REPORT:\n\n{report_text}\n\n"
        f"JOB DESCRIPTION:\n\n{jd_text}\n\n"
        "Now, generate and output the fully filled HTML CV matching the rules above. Output ONLY raw HTML."
    )
    endpoint = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
        "stream": False,
        "temperature": 0.2,
    }
    if timeout_ms <= 0:
        raise ValueError("timeout_ms must be positive")
    data = post_json(endpoint, payload, headers, timeout_ms)
    content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not content:
        raise ValueError("The endpoint returned an empty response.")
    return clean_tailored_html(content)


def output_filename(candidate_slug: str, company_slug: str) -> str:
    return f"cv-{candidate_slug}-{company_slug}.html"


def pdf_filename(candidate_slug: str, company_slug: str, today: str) -> str:
    return f"cv-{candidate_slug}-{company_slug}-{today}.pdf"


def tailor_cv(
    *,
    jd_path: str | Path,
    report_path: str | Path,
    root: str | Path = PROJECT_ROOT,
    model: str = DEFAULT_MODEL,
    base_url: str = DEFAULT_BASE_URL,
    api_key: str = "",
    timeout_ms: int = 300_000,
    post_json: Callable[[str, dict[str, Any], dict[str, str], int], dict[str, Any]] = default_post_json,
    today: str = "",
) -> dict[str, Any]:
    jd_file = Path(jd_path)
    report_file = Path(report_path)
    if not jd_file.exists():
        raise FileNotFoundError(f"JD file not found: {jd_file}")
    if not report_file.exists():
        raise FileNotFoundError(f"Report file not found: {report_file}")
    endpoint = validate_openai_endpoint(base_url, api_key)
    jd_text = jd_file.read_text(encoding="utf-8").strip()
    report_text = report_file.read_text(encoding="utf-8").strip()
    context = load_tailor_context(root)
    prompt = build_tailor_prompt(**context)
    tailored_html = call_tailor_endpoint(
        jd_text=jd_text,
        report_text=report_text,
        system_prompt=prompt,
        model=model,
        base_url=endpoint["baseUrl"],
        api_key=api_key,
        timeout_ms=timeout_ms,
        post_json=post_json,
    )
    company_slug = company_slug_from_report_path(report_file)
    candidate_slug = candidate_name_from_profile(context["profile_content"])
    project = Path(root)
    output_dir = project / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = output_filename(candidate_slug, company_slug)
    html_path = output_dir / filename
    html_path.write_text(tailored_html, encoding="utf-8")
    report_num = report_num_from_path(report_file)
    stamp = today or __import__("datetime").date.today().isoformat()
    return {
        "html": tailored_html,
        "path": str(html_path),
        "filename": filename,
        "companySlug": company_slug,
        "candidateSlug": candidate_slug,
        "nextPdf": f"output/{pdf_filename(candidate_slug, company_slug, stamp)}",
        "reportNum": report_num,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OpenAI-compatible CV tailoring for career-ops.")
    parser.add_argument("--jd", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", DEFAULT_MODEL))
    parser.add_argument("--url", default=os.environ.get("OPENAI_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--key", default=os.environ.get("OPENAI_API_KEY", ""))
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        timeout_ms = int(os.environ.get("OPENAI_TIMEOUT_MS", "300000"))
        result = tailor_cv(
            jd_path=args.jd,
            report_path=args.report,
            model=args.model,
            base_url=args.url.rstrip("/"),
            api_key=args.key,
            timeout_ms=timeout_ms,
        )
    except Exception as error:
        print(json.dumps({"error": str(error)}, indent=2) if args.json else f"ERROR: {error}")
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Tailored HTML saved: {result['path']}")
        print(f"Next PDF: python -m scripts.python.cv.generate_pdf output/{result['filename']} {result['nextPdf']} --format=letter --report={result['reportNum']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
