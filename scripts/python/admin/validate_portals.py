#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from scripts.python import CONFIG_DIR


DEFAULT_PORTALS_PATH = CONFIG_DIR / "portals.yml"


def issue(path: str, message: str) -> dict[str, str]:
    return {"path": path, "message": message}


def is_object(value: Any) -> bool:
    return isinstance(value, dict)


def normalize_name(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def validate_url(value: Any, path: str, errors: list[dict[str, str]]) -> None:
    if value in {None, ""}:
        return
    if not isinstance(value, str):
        errors.append(issue(path, "must be a string URL"))
        return
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        errors.append(issue(path, f"invalid URL: {value}"))
    elif parsed.scheme not in {"http", "https"}:
        errors.append(issue(path, f"unsupported URL protocol: {parsed.scheme}:"))


def validate_keyword_list(value: Any, path: str, errors: list[dict[str, str]]) -> None:
    if value is None:
        return
    values = value if isinstance(value, list) else [value]
    for idx, item in enumerate(values):
        if not isinstance(item, str):
            errors.append(issue(f"{path}[{idx}]", "keyword must be a string"))
        elif item.strip() == "":
            errors.append(issue(f"{path}[{idx}]", "keyword must not be empty"))


def validate_parser(parser: Any, path: str, errors: list[dict[str, str]]) -> None:
    if parser is None:
        return
    if not is_object(parser):
        errors.append(issue(path, "parser must be an object"))
        return
    if not isinstance(parser.get("command"), str) or not parser.get("command", "").strip():
        errors.append(issue(f"{path}.command", "parser.command must be a non-empty string"))
    if "script" in parser and (not isinstance(parser["script"], str) or not parser["script"].strip()):
        errors.append(issue(f"{path}.script", "parser.script must be a non-empty string when set"))
    if "args" in parser and not isinstance(parser["args"], list):
        errors.append(issue(f"{path}.args", "parser.args must be an array when set"))
    for key in ("timeout_ms", "max_buffer_bytes"):
        if key in parser:
            try:
                numeric = float(parser[key])
            except (TypeError, ValueError):
                numeric = 0
            if numeric <= 0:
                errors.append(issue(f"{path}.{key}", f"parser.{key} must be a positive number when set"))


def validate_portals_config(config: Any, *, provider_ids: set[str] | None = None) -> dict[str, list[dict[str, str]]]:
    provider_ids = provider_ids or set()
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not is_object(config):
        errors.append(issue("<root>", "portals config must be a YAML object"))
        return {"errors": errors, "warnings": warnings}

    for section, keys in {
        "title_filter": ("positive", "negative", "seniority_boost"),
        "location_filter": ("always_allow", "allow", "block"),
    }.items():
        if section in config:
            if not is_object(config[section]):
                errors.append(issue(section, f"{section} must be an object"))
            else:
                for key in keys:
                    validate_keyword_list(config[section].get(key), f"{section}.{key}", errors)

    if "content_filter" in config:
        if not is_object(config["content_filter"]):
            errors.append(issue("content_filter", "content_filter must be an object"))
        else:
            content = config["content_filter"]
            validate_keyword_list(content.get("positive"), "content_filter.positive", errors)
            validate_keyword_list(content.get("negative"), "content_filter.negative", errors)
            if "by_title_keyword" in content:
                if not is_object(content["by_title_keyword"]):
                    errors.append(issue("content_filter.by_title_keyword", "by_title_keyword must be an object keyed by title_filter.positive keyword"))
                else:
                    title_positive = {str(item).strip().lower() for item in config.get("title_filter", {}).get("positive", []) if isinstance(item, str)}
                    for keyword, rule in content["by_title_keyword"].items():
                        base = f"content_filter.by_title_keyword.{keyword}"
                        if keyword.strip().lower() not in title_positive:
                            warnings.append(issue(base, f'"{keyword}" does not match any title_filter.positive keyword and will never apply'))
                        if not is_object(rule):
                            errors.append(issue(base, "must be an object with positive/negative keyword lists"))
                        else:
                            validate_keyword_list(rule.get("positive"), f"{base}.positive", errors)
                            validate_keyword_list(rule.get("negative"), f"{base}.negative", errors)

    if "search_queries" in config and not isinstance(config["search_queries"], list):
        errors.append(issue("search_queries", "search_queries must be an array when set"))

    companies = config.get("tracked_companies")
    if companies is not None and not isinstance(companies, list):
        errors.append(issue("tracked_companies", "tracked_companies must be an array when set"))
    seen_enabled: dict[str, str] = {}
    if isinstance(companies, list):
        for idx, company in enumerate(companies):
            base = f"tracked_companies[{idx}]"
            if not is_object(company):
                errors.append(issue(base, "company entry must be an object"))
                continue
            if company.get("enabled") is False:
                continue
            if not isinstance(company.get("name"), str) or not company.get("name", "").strip():
                errors.append(issue(f"{base}.name", "enabled company must have a non-empty string name"))
            else:
                normalized = normalize_name(company["name"])
                if normalized in seen_enabled:
                    warnings.append(issue(f"{base}.name", f"duplicate enabled company name also seen at {seen_enabled[normalized]}"))
                else:
                    seen_enabled[normalized] = f"{base}.name"
            validate_url(company.get("careers_url"), f"{base}.careers_url", errors)
            validate_url(company.get("api"), f"{base}.api", errors)
            if "provider" in company:
                provider = company["provider"]
                if not isinstance(provider, str) or not provider.strip():
                    errors.append(issue(f"{base}.provider", "provider must be a non-empty string when set"))
                elif provider not in provider_ids:
                    errors.append(issue(f"{base}.provider", f'unknown provider "{provider}"'))
            validate_parser(company.get("parser"), f"{base}.parser", errors)
    return {"errors": errors, "warnings": warnings}


def validate_file(path: str | Path, *, provider_ids: set[str] | None = None) -> dict[str, list[dict[str, str]]]:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"file not found: {file_path}")
    parsed = yaml.safe_load(file_path.read_text(encoding="utf-8"))
    return validate_portals_config(parsed, provider_ids=provider_ids)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate portals.yml schema.")
    parser.add_argument("--file", default=str(DEFAULT_PORTALS_PATH))
    parser.add_argument("--providers", default="", help="Comma-separated known provider ids.")
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    providers = {item.strip() for item in args.providers.split(",") if item.strip()}
    try:
        result = validate_file(args.file, provider_ids=providers)
    except Exception as exc:
        print(f"validate-portals failed: {exc}")
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"validate-portals: {Path(args.file).resolve(strict=False)}")
        for warning in result["warnings"]:
            print(f"warning: {warning['path']}: {warning['message']}")
        for error in result["errors"]:
            print(f"error: {error['path']}: {error['message']}")
        print(f"{len(result['errors'])} errors, {len(result['warnings'])} warnings")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
