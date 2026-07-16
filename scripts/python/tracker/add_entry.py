#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from scripts.python import PROJECT_ROOT


DEFAULT_ARTICLE_DIGEST = (
    "# Article Digest -- Proof Points\n\n"
    "Compact proof points from portfolio projects. Read by career-ops at evaluation time.\n"
)


def normalize_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower()) if isinstance(value, str) else ""


def locate_section(markdown: str, section: str) -> dict[str, str] | None:
    target = normalize_key(section)
    lines = markdown.split("\n")
    for idx, line in enumerate(lines):
        match = re.match(r"^##\s+(.*\S)\s*$", line)
        if match and normalize_key(match.group(1)) == target:
            end = idx + 1
            while end < len(lines) and not re.match(r"^##\s+", lines[end]):
                end += 1
            return {
                "before": "\n".join(lines[:idx]),
                "heading": lines[idx],
                "body": "\n".join(lines[idx + 1 : end]),
                "after": "\n".join(lines[end:]),
            }
    return None


def extract_identifiers(body: str) -> list[str]:
    identifiers = [match.group(1) for match in re.finditer(r"\*\*([^*]+)\*\*", body or "")]
    identifiers.extend(match.group(1) for match in re.finditer(r"^#{3,}\s+(.*\S)\s*$", body or "", re.MULTILINE))
    return identifiers


def cv_has_entry(markdown: str, section: str, dedup_key: str) -> bool:
    key = normalize_key(dedup_key)
    if not key:
        return False
    loc = locate_section(markdown, section)
    if not loc:
        return False
    return any(normalize_key(identifier) == key for identifier in extract_identifiers(loc["body"]))


def insert_into_cv_section(markdown: str, section: str, entry: str) -> str:
    block = re.sub(r"\s+$", "", entry)
    loc = locate_section(markdown, section)
    if not loc:
        base = re.sub(r"\s+$", "", markdown)
        return f"{base}\n\n## {section}\n\n{block}\n"
    body = re.sub(r"\s+$", "", loc["body"])
    new_body = f"{body}\n{block}" if body else block
    after = re.sub(r"^\n+", "", loc["after"])
    rebuilt = "\n".join([loc["before"], loc["heading"], "", new_body, ""]) + (f"\n{after}" if after else "")
    return re.sub(r"\n{3,}", "\n\n", rebuilt)


def article_digest_has_entry(markdown: str, dedup_key: str) -> bool:
    key = normalize_key(dedup_key)
    if not key:
        return False
    for match in re.finditer(r"^##\s+(.*\S)\s*$", markdown or "", re.MULTILINE):
        name = re.split(r"\s+[—–-]{1,2}\s+", match.group(1), maxsplit=1)[0]
        normalized = normalize_key(name)
        if normalized == key or normalized.startswith(key):
            return True
    return False


def append_article_digest(markdown: str, entry: str) -> str:
    block = re.sub(r"\s+$", "", entry)
    base = re.sub(r"\s+$", "", markdown)
    return f"{base}\n\n---\n\n{block}\n"


def apply_add(payload: dict[str, Any], *, cv_text: str | None = None, article_text: str | None = None) -> dict[str, Any]:
    if not isinstance(payload, dict) or (not payload.get("cv") and not payload.get("articleDigest")):
        raise ValueError("payload must include at least one of: cv, articleDigest")

    result: dict[str, Any] = {}
    cv = cv_text
    article_digest = article_text

    if payload.get("cv"):
        cv_payload = payload["cv"]
        section = cv_payload.get("section")
        dedup_key = cv_payload.get("dedupKey")
        entry = cv_payload.get("entry")
        if not section or not entry:
            raise ValueError("payload.cv requires { section, entry }")
        if not normalize_key(dedup_key):
            raise ValueError("payload.cv requires a non-empty dedupKey (used for dedup/idempotency)")
        if cv_text is None:
            raise ValueError("cv.md not found — cannot add to a CV that does not exist")
        if cv_has_entry(cv_text, section, dedup_key):
            result["cv"] = {"status": "duplicate", "section": section}
        else:
            cv = insert_into_cv_section(cv_text, section, entry)
            result["cv"] = {"status": "added", "section": section}

    if payload.get("articleDigest"):
        digest_payload = payload["articleDigest"]
        dedup_key = digest_payload.get("dedupKey")
        entry = digest_payload.get("entry")
        if not entry:
            raise ValueError("payload.articleDigest requires { entry }")
        if not normalize_key(dedup_key):
            raise ValueError("payload.articleDigest requires a non-empty dedupKey (used for dedup/idempotency)")
        current = DEFAULT_ARTICLE_DIGEST if article_text is None else article_text
        if article_digest_has_entry(current, dedup_key):
            result["articleDigest"] = {"status": "duplicate"}
            article_digest = article_text
        else:
            article_digest = append_article_digest(current, entry)
            result["articleDigest"] = {"status": "created" if article_text is None else "added"}

    return {"cv": cv, "articleDigest": article_digest, "result": result}


def _read_payload(args: argparse.Namespace) -> dict[str, Any]:
    raw = sys.stdin.read() if args.stdin else Path(args.payload).read_text(encoding="utf-8")
    return json.loads(raw)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Insert structured add-mode payload into cv.md/article-digest.md.")
    parser.add_argument("payload", nargs="?")
    parser.add_argument("--stdin", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--cv-file", default=os.environ.get("CAREER_OPS_CV", str(PROJECT_ROOT / "cv.md")))
    parser.add_argument(
        "--article-digest-file",
        default=os.environ.get("CAREER_OPS_ARTICLE_DIGEST", str(PROJECT_ROOT / "article-digest.md")),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.stdin and not args.payload:
        parser.print_usage(sys.stderr)
        return 1

    try:
        payload = _read_payload(args)
    except Exception as exc:
        print(f"add-entry: could not read/parse payload: {exc}", file=sys.stderr)
        return 1

    cv_file = Path(args.cv_file)
    article_file = Path(args.article_digest_file)
    cv_text = cv_file.read_text(encoding="utf-8") if cv_file.exists() else None
    article_text = article_file.read_text(encoding="utf-8") if article_file.exists() else None

    try:
        output = apply_add(payload, cv_text=cv_text, article_text=article_text)
    except Exception as exc:
        print(f"add-entry: {exc}", file=sys.stderr)
        return 1

    if not args.dry_run:
        written: list[str] = []
        try:
            if payload.get("cv") and output["result"].get("cv", {}).get("status") == "added":
                cv_file.write_text(output["cv"], encoding="utf-8")
                written.append("cv.md")
            if payload.get("articleDigest") and output["result"].get("articleDigest", {}).get("status") in {"added", "created"}:
                article_file.write_text(output["articleDigest"], encoding="utf-8")
                written.append("article-digest.md")
        except Exception as exc:
            print(f"add-entry: write failed after writing [{', '.join(written) or 'nothing'}]: {exc}", file=sys.stderr)
            return 1

    print(json.dumps({"dryRun": args.dry_run, **output["result"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

