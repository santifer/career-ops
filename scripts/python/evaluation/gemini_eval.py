#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from datetime import date
from pathlib import Path
from typing import Any, Callable

from scripts.python import PROJECT_ROOT
from scripts.python.evaluation.openai_eval import (
    build_system_prompt,
    load_context,
    parse_score_summary,
    read_jd_from_args,
    slugify_company,
    strip_score_summary,
)


DEFAULT_MODEL = "gemini-2.5-flash"


def validate_evaluation_shape(text: str) -> list[str]:
    issues: list[str] = []
    for label in ["A", "B", "C", "D", "E", "F", "G"]:
        pattern = re.compile(rf"(?:^|\n)#{{1,3}}\s*(?:{label}(?:[).:-]|\b)|Block {label}\b)", re.I)
        if not pattern.search(text):
            issues.append(f"missing Block {label}")
    summary = re.search(r"---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---", text)
    if not summary:
        issues.append("missing SCORE_SUMMARY block")
        return issues
    block = summary.group(1)
    for key in ["COMPANY", "ROLE", "ARCHETYPE", "LEGITIMACY"]:
        field = re.search(rf"^\s*{key}:\s*(.+)$", block, flags=re.I | re.M)
        value = field.group(1).strip() if field else ""
        if not value or (key != "COMPANY" and value.lower() == "unknown"):
            issues.append(f"SCORE_SUMMARY {key} is required")
    score = re.search(r"^\s*SCORE:\s*([0-9]+(?:\.[0-9]+)?)", block, flags=re.I | re.M)
    try:
        score_value = float(score.group(1)) if score else float("nan")
    except ValueError:
        score_value = float("nan")
    if not (0 <= score_value <= 5):
        issues.append("SCORE_SUMMARY score must be a number between 0 and 5")
    return issues


def require_valid_evaluation(text: str) -> None:
    issues = validate_evaluation_shape(text)
    if issues:
        raise ValueError("Gemini returned an invalid career-ops report: " + "; ".join(issues))


def tsv_safe(value: Any) -> str:
    return re.sub(r"[\t\r\n]+", " ", str(value if value is not None else "")).strip()


def normalized_tracker_score(value: Any) -> str:
    clean = tsv_safe(value)
    if not clean or clean == "?":
        return "N/A"
    return clean if re.search(r"/5$", clean, flags=re.I) else f"{clean}/5"


def next_report_number(reports_dir: str | Path) -> str:
    directory = Path(reports_dir)
    if not directory.exists():
        return "001"
    numbers = []
    for path in directory.iterdir():
        match = re.match(r"^(\d{3})-", path.name)
        if match:
            numbers.append(int(match.group(1)))
    return "001" if not numbers else str(max(numbers) + 1).zfill(3)


def build_gemini_prompt(root: str | Path = PROJECT_ROOT) -> str:
    context = load_context(root)
    project = Path(root)
    profile_yml = (project / "config/profile.yml").read_text(encoding="utf-8").strip() if (project / "config/profile.yml").exists() else "[config/profile.yml not found — skipping]"
    profile_md = (project / "modes/_profile.md").read_text(encoding="utf-8").strip() if (project / "modes/_profile.md").exists() else "[modes/_profile.md not found — skipping]"
    base = build_system_prompt(**context)
    return (
        base
        + "\n\n═══════════════════════════════════════════════════════\n"
        + "CANDIDATE PROFILE & TARGETS (config/profile.yml)\n"
        + "═══════════════════════════════════════════════════════\n"
        + profile_yml
        + "\n\n═══════════════════════════════════════════════════════\n"
        + "USER ARCHETYPES & NARRATIVE (_profile.md)\n"
        + "═══════════════════════════════════════════════════════\n"
        + profile_md
    )


def default_generate_content(api_key: str, model: str, parts: list[str]) -> str:
    try:
        from google import genai
    except Exception as error:
        raise RuntimeError("google-genai is not installed") from error
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model=model, contents=parts)
    return response.text or ""


def call_gemini(
    *,
    jd_text: str,
    system_prompt: str,
    api_key: str,
    model: str = DEFAULT_MODEL,
    generate_content: Callable[[str, str, list[str]], str] = default_generate_content,
) -> str:
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found")
    text = generate_content(api_key, model, [system_prompt, f"\n\nJOB DESCRIPTION TO EVALUATE:\n\n{jd_text}"])
    if not text.strip():
        raise ValueError("Gemini returned an empty response")
    require_valid_evaluation(text)
    return text


def save_gemini_outputs(
    evaluation_text: str,
    *,
    root: str | Path = PROJECT_ROOT,
    model: str = DEFAULT_MODEL,
    today: str | None = None,
) -> dict[str, Any]:
    project = Path(root)
    reports = project / "reports"
    tracker_additions = project / "batch" / "tracker-additions"
    reports.mkdir(parents=True, exist_ok=True)
    tracker_additions.mkdir(parents=True, exist_ok=True)
    summary = parse_score_summary(evaluation_text)
    num = next_report_number(reports)
    stamp = today or date.today().isoformat()
    company_slug = slugify_company(summary["company"])
    filename = f"{num}-{company_slug}-{stamp}.md"
    report_path = reports / filename
    report_content = f"""# Evaluation: {summary['company']} — {summary['role']}

**Date:** {stamp}
**Archetype:** {summary['archetype']}
**Score:** {summary['score']}/5
**Legitimacy:** {summary['legitimacy']}
**PDF:** pending
**Tool:** Gemini ({model})

---

{strip_score_summary(evaluation_text)}
"""
    report_path.write_text(report_content, encoding="utf-8")
    tracker_path = tracker_additions / f"{num}-{company_slug}.tsv"
    fields = [
        str(int(num)),
        stamp,
        tsv_safe(summary["company"]),
        tsv_safe(summary["role"]),
        "Evaluated",
        normalized_tracker_score(summary["score"]),
        "❌",
        f"[{num}](reports/{filename})",
        "Gemini evaluation",
    ]
    tracker_path.write_text("\t".join(fields) + "\n", encoding="utf-8")
    return {
        "num": num,
        "report": str(report_path),
        "reportFilename": filename,
        "trackerAddition": str(tracker_path),
        "summary": summary,
    }


def merge_tracker(root: str | Path = PROJECT_ROOT, runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run) -> dict[str, Any]:
    result = runner(
        ["python", "-m", "scripts.python.tracker.merge_tracker"],
        cwd=Path(root),
        capture_output=True,
        text=True,
        timeout=120,
    )
    return {"ok": result.returncode == 0, "stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}


def evaluate_job(
    jd_text: str,
    *,
    root: str | Path = PROJECT_ROOT,
    api_key: str = "",
    model: str = DEFAULT_MODEL,
    save: bool = True,
    merge: bool = False,
    generate_content: Callable[[str, str, list[str]], str] = default_generate_content,
    today: str | None = None,
) -> dict[str, Any]:
    prompt = build_gemini_prompt(root)
    evaluation = call_gemini(jd_text=jd_text, system_prompt=prompt, api_key=api_key, model=model, generate_content=generate_content)
    result: dict[str, Any] = {"evaluation": evaluation, "summary": parse_score_summary(evaluation)}
    if save:
        result["saved"] = save_gemini_outputs(evaluation, root=root, model=model, today=today)
        if merge:
            result["merge"] = merge_tracker(root)
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Gemini-powered Job Offer Evaluator for career-ops.")
    parser.add_argument("jd", nargs="*")
    parser.add_argument("--file")
    parser.add_argument("--model", default=os.environ.get("GEMINI_MODEL", DEFAULT_MODEL))
    parser.add_argument("--key", default=os.environ.get("GEMINI_API_KEY", ""))
    parser.add_argument("--no-save", action="store_true")
    parser.add_argument("--merge", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser


def read_jd(args: argparse.Namespace) -> str:
    if args.file:
        path = Path(args.file)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return path.read_text(encoding="utf-8").strip()
    return "\n".join(args.jd or []).strip()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        jd_text = read_jd(args)
        if not jd_text:
            raise ValueError("No Job Description provided.")
        result = evaluate_job(
            jd_text,
            api_key=args.key,
            model=args.model,
            save=not args.no_save,
            merge=args.merge,
        )
    except Exception as error:
        print(json.dumps({"error": str(error)}, indent=2) if args.json else f"ERROR: {error}")
        return 1
    print(json.dumps(result, indent=2) if args.json else result["evaluation"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
