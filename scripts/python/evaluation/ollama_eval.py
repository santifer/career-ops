#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from scripts.python import PROJECT_ROOT
from scripts.python.evaluation.openai_eval import (
    build_report_content,
    build_system_prompt,
    call_openai_compatible,
    default_post_json,
    load_context,
    parse_score_summary,
    read_jd_from_args,
    save_report,
)


DEFAULT_MODEL = "llama3.3"
DEFAULT_BASE_URL = "http://localhost:11434"


class ProbeError(Exception):
    pass


def validate_ollama_endpoint(base_url: str, *, allow_remote: bool = False) -> dict[str, Any]:
    parsed = urlparse(base_url)
    if not parsed.scheme or not parsed.hostname:
        raise ValueError(f'Invalid OLLAMA_BASE_URL: "{base_url}"')
    is_loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if not is_loopback and not allow_remote:
        raise ValueError(
            f"Remote Ollama endpoint detected: {base_url}. "
            "Set OLLAMA_ALLOW_REMOTE=1 if this is intentional."
        )
    return {"host": parsed.hostname, "isLoopback": is_loopback, "baseUrl": base_url.rstrip("/")}


def default_get(url: str, timeout_ms: int) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout_ms / 1000) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")


def probe_ollama(base_url: str, *, get: Callable[[str, int], tuple[int, str]] = default_get, timeout_ms: int = 5_000) -> None:
    status, body = get(base_url.rstrip("/") + "/api/tags", timeout_ms)
    if status < 200 or status >= 300:
        raise ProbeError(f"Ollama not reachable at {base_url}: HTTP {status} {body[:120]}")


def build_ollama_payload_options() -> dict[str, Any]:
    return {"num_ctx": 32768}


def call_ollama(
    *,
    jd_text: str,
    system_prompt: str,
    model: str,
    base_url: str,
    timeout_ms: int = 300_000,
    post_json: Callable[[str, dict[str, Any], dict[str, str], int], dict[str, Any]],
) -> str:
    def wrapped_post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int) -> dict[str, Any]:
        payload = {**payload, "options": build_ollama_payload_options()}
        return post_json(url, payload, headers, timeout)

    return call_openai_compatible(
        jd_text=jd_text,
        system_prompt=system_prompt,
        model=model,
        base_url=base_url,
        api_key="",
        timeout_ms=timeout_ms,
        post_json=wrapped_post,
    )


def save_ollama_report(
    evaluation_text: str,
    *,
    root: str | Path = PROJECT_ROOT,
    model: str,
    today: str | None = None,
) -> dict[str, Any]:
    # Reuse save_report then rewrite the Tool line to preserve JS output shape.
    saved = save_report(evaluation_text, root=root, model=model, endpoint_host="ollama", today=today)
    path = Path(saved["path"])
    content = path.read_text(encoding="utf-8")
    content = content.replace(f"**Tool:** OpenAI-compatible ({model} @ ollama)", f"**Tool:** Ollama ({model})")
    path.write_text(content, encoding="utf-8")
    return saved


def evaluate_job(
    jd_text: str,
    *,
    root: str | Path = PROJECT_ROOT,
    model: str = DEFAULT_MODEL,
    base_url: str = DEFAULT_BASE_URL,
    save: bool = True,
    timeout_ms: int = 300_000,
    allow_remote: bool = False,
    get: Callable[[str, int], tuple[int, str]] = default_get,
    post_json: Callable[[str, dict[str, Any], dict[str, str], int], dict[str, Any]] = default_post_json,
    today: str | None = None,
) -> dict[str, Any]:
    endpoint = validate_ollama_endpoint(base_url, allow_remote=allow_remote)
    probe_ollama(endpoint["baseUrl"], get=get)
    context = load_context(root)
    system_prompt = build_system_prompt(**context)
    evaluation = call_ollama(
        jd_text=jd_text,
        system_prompt=system_prompt,
        model=model,
        base_url=endpoint["baseUrl"] + "/v1" if not endpoint["baseUrl"].endswith("/v1") else endpoint["baseUrl"],
        timeout_ms=timeout_ms,
        post_json=post_json,
    )
    result = {"evaluation": evaluation, "summary": parse_score_summary(evaluation), "endpointHost": endpoint["host"]}
    if save:
        result["report"] = save_ollama_report(evaluation, root=root, model=model, today=today)
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ollama-powered Job Offer Evaluator for career-ops.")
    parser.add_argument("jd", nargs="*")
    parser.add_argument("--file")
    parser.add_argument("--model", default=os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL))
    parser.add_argument("--url", default=os.environ.get("OLLAMA_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--no-save", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        jd_text = read_jd_from_args(args)
        if not jd_text:
            raise ValueError("No Job Description provided.")
        timeout_ms = int(os.environ.get("OLLAMA_TIMEOUT_MS", "300000"))

        result = evaluate_job(
            jd_text,
            model=args.model,
            base_url=args.url.rstrip("/"),
            save=not args.no_save,
            timeout_ms=timeout_ms,
            allow_remote=os.environ.get("OLLAMA_ALLOW_REMOTE") == "1",
        )
    except Exception as error:
        print(json.dumps({"error": str(error)}, indent=2) if args.json else f"ERROR: {error}")
        return 1
    print(json.dumps(result, indent=2) if args.json else result["evaluation"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
