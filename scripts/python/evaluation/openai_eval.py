#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from scripts.python import PROJECT_ROOT


DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_BASE_URL = "https://api.openai.com/v1"


def read_file(path: str | Path, label: str) -> str:
    file = Path(path)
    if not file.exists():
        return f"[{label} not found — skipping]"
    return file.read_text(encoding="utf-8").strip()


def next_report_number(reports_dir: str | Path) -> str:
    directory = Path(reports_dir)
    if not directory.exists():
        return "001"
    numbers = []
    for path in directory.iterdir():
        match = re.match(r"^(\d+)-", path.name)
        if match:
            numbers.append(int(match.group(1)))
    return "001" if not numbers else str(max(numbers) + 1).zfill(3)


def slugify_company(value: Any) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", str(value or "").lower())) or "unknown"


def parse_score_summary(text: str) -> dict[str, str]:
    block = re.search(r"---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---", text)

    def extract(key: str) -> str:
        if not block:
            return "unknown"
        match = re.search(rf"{re.escape(key)}:\s*(.+)", block.group(1))
        return match.group(1).strip() if match else "unknown"

    return {
        "company": extract("COMPANY"),
        "role": extract("ROLE"),
        "score": extract("SCORE"),
        "archetype": extract("ARCHETYPE"),
        "legitimacy": extract("LEGITIMACY"),
    }


def strip_score_summary(text: str) -> str:
    return re.sub(r"---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---", "", text).strip()


def validate_openai_endpoint(base_url: str, api_key: str = "") -> dict[str, Any]:
    try:
        parsed = urlparse(base_url)
    except Exception as error:
        raise ValueError(f'Invalid OPENAI_BASE_URL: "{base_url}"') from error
    if not parsed.scheme or not parsed.hostname:
        raise ValueError(f'Invalid OPENAI_BASE_URL: "{base_url}"')
    is_loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if not is_loopback and parsed.scheme != "https":
        raise ValueError(f"Refusing to use a non-HTTPS remote endpoint: {base_url}")
    if not is_loopback and not api_key:
        raise ValueError(f"No API key for {parsed.hostname}")
    return {"host": parsed.hostname, "isLoopback": is_loopback, "baseUrl": base_url.rstrip("/")}


def build_system_prompt(
    *,
    shared_context: str,
    oferta_logic: str,
    cv_content: str,
) -> str:
    return f"""You are career-ops, an AI-powered job search assistant.
You evaluate job offers against the user's CV using a structured A-G scoring system.

Your evaluation methodology is defined below. Follow it exactly.

═══════════════════════════════════════════════════════
SYSTEM CONTEXT (_shared.md)
═══════════════════════════════════════════════════════
{shared_context}

═══════════════════════════════════════════════════════
EVALUATION MODE (oferta.md)
═══════════════════════════════════════════════════════
{oferta_logic}

═══════════════════════════════════════════════════════
CANDIDATE RESUME (cv.md)
═══════════════════════════════════════════════════════
{cv_content}

═══════════════════════════════════════════════════════
IMPORTANT OPERATING RULES FOR THIS SESSION
═══════════════════════════════════════════════════════
1. You do NOT have access to WebSearch, Playwright, or file writing tools.
   - Block D (Comp research): use training-data salary estimates; note them as estimates.
   - Block G (Legitimacy): analyze JD text only; skip URL/page freshness checks.
   - Post-evaluation file saving is handled by the script, not by you.
2. Generate Blocks A through G in full.
3. At the very end, output this exact machine-readable block:

---SCORE_SUMMARY---
COMPANY: <company name or "Unknown">
ROLE: <role title>
SCORE: <global score as decimal, e.g. 3.8>
ARCHETYPE: <detected archetype>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
---END_SUMMARY---
"""


def load_context(root: str | Path = PROJECT_ROOT) -> dict[str, str]:
    project = Path(root)
    return {
        "shared_context": read_file(project / "modes/_shared.md", "modes/_shared.md"),
        "oferta_logic": read_file(project / "modes/oferta.md", "modes/oferta.md"),
        "cv_content": read_file(project / "cv.md", "cv.md"),
    }


class HttpError(Exception):
    def __init__(self, status: int, body: str = "") -> None:
        super().__init__(f"HTTP {status}")
        self.status = status
        self.body = body


def default_post_json(url: str, payload: dict[str, Any], headers: dict[str, str], timeout_ms: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_ms / 1000) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise HttpError(error.code, body) from error


def call_openai_compatible(
    *,
    jd_text: str,
    system_prompt: str,
    model: str,
    base_url: str,
    api_key: str = "",
    timeout_ms: int = 300_000,
    post_json: Callable[[str, dict[str, Any], dict[str, str], int], dict[str, Any]] = default_post_json,
) -> str:
    if timeout_ms <= 0:
        raise ValueError("timeout_ms must be positive")
    endpoint = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"JOB DESCRIPTION TO EVALUATE:\n\n{jd_text}"},
        ],
        "stream": False,
        "temperature": 0.4,
    }
    data = post_json(endpoint, payload, headers, timeout_ms)
    content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not content:
        raise ValueError("The endpoint returned an empty response.")
    return content


def build_report_content(summary: dict[str, str], evaluation_text: str, *, model: str, endpoint_host: str, today: str) -> str:
    return f"""# Evaluation: {summary['company']} — {summary['role']}

**Date:** {today}
**Archetype:** {summary['archetype']}
**Score:** {summary['score']}/5
**Legitimacy:** {summary['legitimacy']}
**PDF:** pending
**Tool:** OpenAI-compatible ({model} @ {endpoint_host})

---

{strip_score_summary(evaluation_text)}
"""


def save_report(
    evaluation_text: str,
    *,
    root: str | Path = PROJECT_ROOT,
    model: str,
    endpoint_host: str,
    today: str | None = None,
) -> dict[str, Any]:
    project = Path(root)
    reports = project / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    summary = parse_score_summary(evaluation_text)
    report_num = next_report_number(reports)
    stamp = today or date.today().isoformat()
    filename = f"{report_num}-{slugify_company(summary['company'])}-{stamp}.md"
    path = reports / filename
    path.write_text(build_report_content(summary, evaluation_text, model=model, endpoint_host=endpoint_host, today=stamp), encoding="utf-8")
    tracker_row = f"| {report_num} | {stamp} | {summary['company']} | {summary['role']} | {summary['score']}/5 | Evaluated | ❌ | [{report_num}](reports/{filename}) |"
    return {"num": report_num, "filename": filename, "path": str(path), "summary": summary, "trackerRow": tracker_row}


def evaluate_job(
    jd_text: str,
    *,
    root: str | Path = PROJECT_ROOT,
    model: str = DEFAULT_MODEL,
    base_url: str = DEFAULT_BASE_URL,
    api_key: str = "",
    save: bool = True,
    timeout_ms: int = 300_000,
    post_json: Callable[[str, dict[str, Any], dict[str, str], int], dict[str, Any]] = default_post_json,
    today: str | None = None,
) -> dict[str, Any]:
    endpoint = validate_openai_endpoint(base_url, api_key)
    context = load_context(root)
    system_prompt = build_system_prompt(**context)
    evaluation = call_openai_compatible(
        jd_text=jd_text,
        system_prompt=system_prompt,
        model=model,
        base_url=endpoint["baseUrl"],
        api_key=api_key,
        timeout_ms=timeout_ms,
        post_json=post_json,
    )
    result = {"evaluation": evaluation, "summary": parse_score_summary(evaluation), "endpointHost": endpoint["host"]}
    if save:
        result["report"] = save_report(evaluation, root=root, model=model, endpoint_host=endpoint["host"], today=today)
    return result


def read_jd_from_args(args: argparse.Namespace) -> str:
    if args.file:
        path = Path(args.file)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return path.read_text(encoding="utf-8").strip()
    return "\n".join(args.jd or []).strip()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OpenAI-compatible Job Offer Evaluator for career-ops.")
    parser.add_argument("jd", nargs="*")
    parser.add_argument("--file")
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", DEFAULT_MODEL))
    parser.add_argument("--url", default=os.environ.get("OPENAI_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--key", default=os.environ.get("OPENAI_API_KEY", ""))
    parser.add_argument("--no-save", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        jd_text = read_jd_from_args(args)
        if not jd_text:
            raise ValueError("No Job Description provided.")
        timeout_ms = int(os.environ.get("OPENAI_TIMEOUT_MS", "300000"))
        result = evaluate_job(
            jd_text,
            model=args.model,
            base_url=args.url.rstrip("/"),
            api_key=args.key,
            save=not args.no_save,
            timeout_ms=timeout_ms,
        )
    except Exception as error:
        print(json.dumps({"error": str(error)}, indent=2) if args.json else f"ERROR: {error}")
        return 1
    print(json.dumps(result, indent=2) if args.json else result["evaluation"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
