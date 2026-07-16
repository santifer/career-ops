#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import yaml

from scripts.python import PROJECT_ROOT


OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
MAX_TOKENS = 8192
RATE_LIMIT_DELAY_MS = 2500
MODEL_TIMEOUT_MS = 15_000
PROVIDER_PRIORITY = [
    "google",
    "qwen",
    "openai",
    "meta-llama",
    "nvidia",
    "mistralai",
    "nousresearch",
    "minimax",
    "arcee-ai",
]


class OpenRouterError(RuntimeError):
    pass


@dataclass
class HttpResponse:
    status: int
    body: str

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

    def json(self) -> Any:
        return json.loads(self.body)


def load_dotenv(root: str | Path = PROJECT_ROOT, environ: dict[str, str] | None = None) -> dict[str, str]:
    env = environ if environ is not None else os.environ
    path = Path(root) / ".env"
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", line.strip())
        if not match or match.group(1) in env:
            continue
        value = re.sub(r"^(['\"])(.*?)\1$", r"\2", match.group(2).strip())
        env[match.group(1)] = value
    return env


def provider_of(model_id: str) -> str:
    return str(model_id).split("/", 1)[0]


def priority_of(model_id: str) -> tuple[int, str]:
    provider = provider_of(model_id)
    try:
        priority = PROVIDER_PRIORITY.index(provider)
    except ValueError:
        priority = len(PROVIDER_PRIORITY)
    return priority, str(model_id)


def extract_free_model_ids(payload: dict[str, Any]) -> list[str]:
    result = []
    for model in payload.get("data") or []:
        pricing = model.get("pricing") or {}
        if str(pricing.get("prompt")) == "0" and str(pricing.get("completion")) == "0":
            model_id = str(model.get("id") or "").strip()
            if model_id:
                result.append(model_id)
    return sorted(result, key=priority_of)


def load_persisted_blacklist(path: str | Path) -> set[str]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return set()
    return {str(item) for item in data} if isinstance(data, list) else set()


def save_blacklist(path: str | Path, values: set[str]) -> None:
    file = Path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(sorted(values), indent=2), encoding="utf-8")


def build_cached_system_message(system_prompt: str) -> dict[str, Any]:
    return {
        "role": "system",
        "content": [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
    }


def default_http_json(url: str, *, headers: dict[str, str] | None = None, timeout_ms: int = MODEL_TIMEOUT_MS) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout_ms / 1000) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise OpenRouterError(f"HTTP {error.code}: {body[:120]}") from error


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
        raise OpenRouterError(f"HTTP {error.code}: {body[:120]}") from error


def load_free_models(
    *,
    api_key: str,
    get_json: Callable[..., dict[str, Any]] = default_http_json,
    models_url: str = OPENROUTER_MODELS_URL,
) -> list[str]:
    if not api_key:
        raise OpenRouterError("OPENROUTER_API_KEY is not set.")
    data = get_json(models_url, headers={"Authorization": f"Bearer {api_key}"}, timeout_ms=30_000)
    models = extract_free_model_ids(data)
    if not models:
        raise OpenRouterError("No free models found in API response")
    return models


def should_blacklist_error(message: str) -> tuple[bool, bool]:
    lowered = message.lower()
    permanent = "http 403" in lowered or lowered.startswith("timeout")
    rate_limit = "http 429" in lowered or "rate-li" in lowered or "rate limit" in lowered or "temporarily rate" in lowered
    return permanent, rate_limit


def call_openrouter(
    system_prompt: str,
    user_message: str,
    *,
    api_key: str,
    models: list[str],
    pinned_model: str = "",
    blacklist: set[str] | None = None,
    rate_limit_counts: dict[str, int] | None = None,
    post_json: Callable[[str, dict[str, Any], dict[str, str], int], dict[str, Any]] = default_post_json,
    timeout_ms: int = MODEL_TIMEOUT_MS,
    api_url: str = OPENROUTER_API_URL,
) -> tuple[str, str]:
    if not api_key:
        raise OpenRouterError("OPENROUTER_API_KEY not found.")
    blacklist = blacklist if blacklist is not None else set()
    rate_limit_counts = rate_limit_counts if rate_limit_counts is not None else {}
    candidates = [pinned_model] if pinned_model else [m for m in models if m not in blacklist]
    if not candidates:
        raise OpenRouterError("All loaded models have been blacklisted this session.")
    last_error = ""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/santifer/career-ops",
        "X-Title": "career-ops",
    }
    for model in candidates:
        payload = {
            "model": model,
            "messages": [build_cached_system_message(system_prompt), {"role": "user", "content": user_message}],
            "max_tokens": MAX_TOKENS,
        }
        try:
            data = post_json(api_url, payload, headers, timeout_ms)
            if data.get("error"):
                raise OpenRouterError(str((data.get("error") or {}).get("message") or data["error"]))
            content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
            if not content:
                raise OpenRouterError("Empty response")
            return content, model
        except Exception as error:
            last_error = str(error).splitlines()[0]
            permanent, rate_limited = should_blacklist_error(last_error)
            if permanent and not pinned_model:
                blacklist.add(model)
            elif rate_limited and not pinned_model:
                rate_limit_counts[model] = rate_limit_counts.get(model, 0) + 1
                if rate_limit_counts[model] >= 3:
                    blacklist.add(model)
    raise OpenRouterError(f"All {len(candidates)} active models failed. Last error: {last_error}")


def read_file(root: str | Path, rel_path: str) -> str | None:
    file = Path(root) / rel_path
    try:
        return file.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None


def write_file(root: str | Path, rel_path: str, content: str) -> None:
    file = Path(root) / rel_path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content, encoding="utf-8")


def load_context(root: str | Path = PROJECT_ROOT) -> dict[str, str]:
    return {
        "cv": read_file(root, "cv.md") or "CV not found.",
        "profile": read_file(root, "config/profile.yml") or "",
        "shared": read_file(root, "modes/_shared.md") or "",
        "profileMode": read_file(root, "modes/_profile.md") or "",
    }


def build_system_prompt(mode_content: str, ctx: dict[str, str]) -> str:
    parts = [
        ctx.get("shared", ""),
        ctx.get("profileMode", ""),
        mode_content,
        "---",
        "CANDIDATE PROFILE (YAML):",
        ctx.get("profile", ""),
        "---",
        "CV (Markdown):",
        ctx.get("cv", ""),
    ]
    return "\n\n".join(part for part in parts if part)


def assert_safe_remote_url(url: str) -> Any:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"Refusing non-HTTP(S) URL: {url}")
    host = parsed.hostname.lower()
    blocked = (
        host == "localhost"
        or host == "::1"
        or host.endswith(".local")
        or re.match(r"^127\.", host)
        or re.match(r"^10\.", host)
        or re.match(r"^192\.168\.", host)
        or re.match(r"^169\.254\.", host)
        or re.match(r"^172\.(1[6-9]|2\d|3[01])\.", host)
    )
    if blocked:
        raise ValueError(f"Refusing private/loopback host: {host}")
    return parsed


def html_to_text(html: str, limit: int = 16_000) -> str:
    text = re.sub(r"<(script|style|nav|footer|header)\b[\s\S]*?</\1>", " ", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:limit]


def fetch_job_page(
    url: str,
    *,
    get_text: Callable[[str], HttpResponse] | None = None,
) -> str:
    assert_safe_remote_url(url)
    if get_text is None:
        def get_text(target: str) -> HttpResponse:
            request = urllib.request.Request(target, headers={"User-Agent": "Mozilla/5.0 (compatible; career-ops/1.0)"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return HttpResponse(response.status, response.read().decode("utf-8", errors="replace"))
    response = get_text(url)
    if not response.ok:
        raise OpenRouterError(f"Could not fetch job page: HTTP {response.status}")
    return html_to_text(response.body)


def norm_keywords(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).lower().strip() for item in value if str(item or "").strip()]


def parse_portals(raw: str) -> dict[str, Any]:
    config = yaml.safe_load(raw) or {}
    title_filter = config.get("title_filter") or {}
    positive = norm_keywords(title_filter.get("positive"))
    negative = norm_keywords(title_filter.get("negative"))

    def title_matches(title: Any) -> bool:
        lower = str(title or "").lower()
        return (not positive or any(keyword in lower for keyword in positive)) and not any(keyword in lower for keyword in negative)

    companies = []
    for company in config.get("tracked_companies") or []:
        if not isinstance(company, dict) or company.get("enabled") is False or not company.get("api"):
            continue
        companies.append({"name": str(company.get("name") or company.get("company") or "Unknown"), "api": str(company.get("api")).strip()})
    return {"companies": companies, "titleMatches": title_matches}


def read_pipeline(root: str | Path = PROJECT_ROOT) -> list[dict[str, str]]:
    content = read_file(root, "data/pipeline.md") or ""
    pending = []
    for line in content.splitlines():
        match = re.match(r"^- \[ \] (.+)", line)
        if not match:
            continue
        parts = [part.strip() for part in match.group(1).split(" | ")]
        pending.append({"url": parts[0] if parts else "", "company": parts[1] if len(parts) > 1 else "Unknown", "role": parts[2] if len(parts) > 2 else "Unknown"})
    return pending


def mark_pipeline_done(url: str, root: str | Path = PROJECT_ROOT) -> None:
    content = read_file(root, "data/pipeline.md") or ""
    escaped = re.escape(url)
    updated = re.sub(rf"^(- \[ \] {escaped}.*)$", lambda m: m.group(1).replace("- [ ]", "- [x]", 1), content, flags=re.M)
    write_file(root, "data/pipeline.md", updated)


def add_to_pipeline(entries: list[dict[str, Any]], root: str | Path = PROJECT_ROOT, today: str | None = None) -> int:
    stamp = today or date.today().isoformat()
    history = read_file(root, "data/scan-history.tsv") or "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n"
    seen_urls = {line.split("\t")[0] for line in history.splitlines()[1:] if line.split("\t")[0:1]}
    existing_pipeline = read_file(root, "data/pipeline.md") or "# Pipeline\n\n## Pending\n"
    existing_apps = read_file(root, "data/applications.md") or ""
    applied_urls = {match.group(0) for match in re.finditer(r"https?://[^\s|)]+", existing_apps)}
    new_entries = []
    for entry in entries:
        url = str(entry.get("url") or "")
        if not url or url in seen_urls or url in applied_urls or url in existing_pipeline:
            continue
        new_entries.append(entry)
        seen_urls.add(url)
    if not new_entries:
        return 0
    pipeline = existing_pipeline
    hist = history
    if pipeline and not pipeline.endswith("\n"):
        pipeline += "\n"
    if hist and not hist.endswith("\n"):
        hist += "\n"
    for entry in new_entries:
        pipeline += f"- [ ] {entry['url']} | {entry.get('company') or 'Unknown'} | {entry.get('role') or 'Unknown'}\n"
        hist += f"{entry['url']}\t{stamp}\tscan\t{entry.get('role') or ''}\t{entry.get('company') or ''}\tadded\t{entry.get('location') or ''}\n"
    write_file(root, "data/pipeline.md", pipeline)
    write_file(root, "data/scan-history.tsv", hist)
    return len(new_entries)


def next_report_num(root: str | Path = PROJECT_ROOT) -> int:
    reports = Path(root) / "reports"
    try:
        nums = [int(match.group(1)) for item in reports.iterdir() if (match := re.match(r"^(\d+)", item.name))]
    except FileNotFoundError:
        return 1
    return max(nums) + 1 if nums else 1


def extract_company_slug(text: str, url: str | None = None) -> str:
    match = re.search(r"(?:at|@|company[:\s]+)\s*([A-Z][A-Za-z0-9]{2,25})", text or "", flags=re.I)
    if match:
        return re.sub(r"[^a-z0-9]+", "-", match.group(1).lower()).strip("-") or "company"
    if url:
        try:
            parts = [part for part in urlparse(url).path.split("/") if part]
            return re.sub(r"[^a-z0-9]+", "-", (parts[0] if parts else "company").lower()).strip("-") or "company"
        except Exception:
            pass
    return "company"


def extract_legitimacy_line(result: str) -> str:
    match = re.search(r"\*\*Legitimacy:\*\*\s*([^\n]+)", result)
    return f"**Legitimacy:** {match.group(1).strip()}" if match else "**Legitimacy:** unconfirmed"


def extract_score(result: str) -> str:
    match = re.search(r"(?:score|puntuaci[oó]n)[^\d]*(\d+\.?\d*)", result, flags=re.I)
    if not match:
        return ""
    return f"{float(match.group(1)):.1f}/5"


def save_evaluation_outputs(
    *,
    result: str,
    input_label: str,
    jd_text: str,
    root: str | Path = PROJECT_ROOT,
    today: str | None = None,
) -> dict[str, str]:
    stamp = today or date.today().isoformat()
    num = next_report_num(root)
    num_str = str(num).zfill(3)
    slug = extract_company_slug(jd_text, input_label if input_label.startswith("http") else None)
    rel_report = f"reports/{num_str}-{slug}-{stamp}.md"
    write_file(root, rel_report, f"**URL:** {input_label or '(pasted)'}\n{extract_legitimacy_line(result)}\n\n{result}")
    company_name = re.sub(r"\b\w", lambda m: m.group(0).upper(), slug.replace("-", " "))
    report_link = f"[{num_str}](reports/{num_str}-{slug}-{stamp}.md)"
    tsv_line = f"{num}\t{stamp}\t{company_name}\t(see report)\tEvaluated\t{extract_score(result)}\t❌\t{report_link}\t\n"
    rel_tsv = f"batch/tracker-additions/or-{num_str}-{slug}.tsv"
    write_file(root, rel_tsv, f"num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\n{tsv_line}")
    return {"report": rel_report, "trackerAddition": rel_tsv, "num": num_str, "slug": slug}


def cmd_scan(root: str | Path = PROJECT_ROOT, *, fetch_json: Callable[[str], dict[str, Any]] | None = None, today: str | None = None) -> dict[str, Any]:
    raw = read_file(root, "config/portals.yml")
    if not raw:
        raise FileNotFoundError("portals.yml not found")
    parsed = parse_portals(raw)
    fetch_json = fetch_json or (lambda url: default_http_json(url))
    found = []
    for company in parsed["companies"]:
        assert_safe_remote_url(company["api"])
        data = fetch_json(company["api"])
        for job in data.get("jobs") or []:
            if not parsed["titleMatches"](job.get("title")) or not job.get("absolute_url"):
                continue
            found.append({
                "url": job["absolute_url"],
                "company": company["name"],
                "role": job.get("title") or "",
                "location": ((job.get("location") or {}).get("name") if isinstance(job.get("location"), dict) else ""),
            })
    added = add_to_pipeline(found, root=root, today=today)
    return {"matches": len(found), "added": added, "found": found}


def cmd_evaluate(
    input_text: str,
    *,
    root: str | Path = PROJECT_ROOT,
    api_key: str,
    models: list[str],
    pinned_model: str = "",
    call_model: Callable[..., tuple[str, str]] = call_openrouter,
    fetch_page: Callable[[str], str] | None = None,
    today: str | None = None,
) -> dict[str, str]:
    mode_content = read_file(root, "modes/oferta.md") or read_file(root, "modes/auto-pipeline.md") or ""
    jd_text = input_text
    if input_text.startswith("http"):
        page_fetcher = fetch_page or (lambda url: fetch_job_page(url))
        jd_text = f"URL: {input_text}\n\n{page_fetcher(input_text)}"
    result, model = call_model(
        build_system_prompt(mode_content, load_context(root)),
        f"Evaluate this job listing:\n\n{jd_text}",
        api_key=api_key,
        models=models,
        pinned_model=pinned_model,
    )
    saved = save_evaluation_outputs(result=result, input_label=input_text, jd_text=jd_text, root=root, today=today)
    return {**saved, "model": model}


def cmd_apply(
    ref: str,
    *,
    root: str | Path = PROJECT_ROOT,
    api_key: str,
    models: list[str],
    pinned_model: str = "",
    call_model: Callable[..., tuple[str, str]] = call_openrouter,
) -> dict[str, str]:
    report_path = Path(root) / ref
    if not report_path.exists():
        num_str = str(ref).zfill(3)
        matches = sorted((Path(root) / "reports").glob(f"{num_str}*"))
        if not matches:
            raise FileNotFoundError(f"Report not found: {ref}")
        report_path = matches[0]
    report_content = report_path.read_text(encoding="utf-8")
    mode_content = read_file(root, "modes/apply.md") or ""
    result, model = call_model(
        build_system_prompt(mode_content, load_context(root)),
        f"Generate application form answers based on this evaluation report:\n\n{report_content}",
        api_key=api_key,
        models=models,
        pinned_model=pinned_model,
    )
    return {"answers": result, "model": model, "report": str(report_path)}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OpenRouter free-model runner for career-ops.")
    parser.add_argument("command", nargs="?", default="help", choices=["scan", "evaluate", "eval", "pipeline", "apply", "models", "help"])
    parser.add_argument("args", nargs="*")
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    load_dotenv(PROJECT_ROOT)
    args = build_parser().parse_args(argv)
    try:
        pinned = os.environ.get("CAREER_OPS_MODEL", "")
        models = [pinned] if pinned else load_free_models(api_key=os.environ.get("OPENROUTER_API_KEY", ""))
        if args.command == "models":
            output: Any = {"models": models}
        elif args.command == "scan":
            output = cmd_scan()
        elif args.command in {"evaluate", "eval"}:
            text = " ".join(args.args).strip() or sys.stdin.read().strip()
            if not text:
                raise ValueError("No input provided.")
            output = cmd_evaluate(text, api_key=os.environ.get("OPENROUTER_API_KEY", ""), models=models, pinned_model=pinned)
        elif args.command == "pipeline":
            output = []
            for item in read_pipeline():
                output.append(cmd_evaluate(item["url"], api_key=os.environ.get("OPENROUTER_API_KEY", ""), models=models, pinned_model=pinned))
                mark_pipeline_done(item["url"])
                time.sleep(RATE_LIMIT_DELAY_MS / 1000)
        elif args.command == "apply":
            if not args.args:
                raise ValueError("Usage: openrouter_runner apply <report_num|report_path>")
            output = cmd_apply(args.args[0], api_key=os.environ.get("OPENROUTER_API_KEY", ""), models=models, pinned_model=pinned)
        else:
            print("career-ops OpenRouter Runner: commands are scan, evaluate, pipeline, apply, models")
            return 0
    except Exception as error:
        print(json.dumps({"error": str(error)}, indent=2) if args.json else f"ERROR: {error}")
        return 1
    print(json.dumps(output, indent=2) if args.json else output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
