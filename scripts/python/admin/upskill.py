#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import yaml

from scripts.python import CONFIG_DIR, PROJECT_ROOT
from scripts.python.tracker.parse import parse_tracker_row, resolve_columns


SCHEMA_VERSION = 1
LOW_FIT_SCORE = 4.0
SKILL_TOKENS = [
    "JavaScript",
    "TypeScript",
    "Python",
    "Ruby",
    "Java",
    "Golang",
    "Rust",
    "PHP",
    "Kotlin",
    "Swift",
    "Scala",
    "Elixir",
    r"C\+\+",
    "C#",
    r"\.NET",
    "SQL",
    "React Native",
    "React",
    "Angular",
    r"Vue\.?js",
    "Svelte",
    r"Next\.?js",
    "Django",
    "Flask",
    "FastAPI",
    "Rails",
    "Laravel",
    "Symfony",
    "Spring",
    r"Node\.?js",
    "NodeJS",
    "MongoDB",
    "MySQL",
    "PostgreSQL",
    "Postgres",
    "Redis",
    "Elasticsearch",
    "Snowflake",
    "BigQuery",
    "Databricks",
    "DynamoDB",
    "Cassandra",
    "GraphQL",
    "gRPC",
    "Kafka",
    "RabbitMQ",
    "AWS",
    "GCP",
    "Azure",
    "Docker",
    "Kubernetes",
    "k8s",
    "Terraform",
    "Ansible",
    "Helm",
    "Jenkins",
    "GitHub Actions",
    "GitLab CI",
    "CI/CD",
    "Prometheus",
    "Grafana",
    "Datadog",
    "Supabase",
    "Inngest",
    "PyTorch",
    "TensorFlow",
    "scikit-learn",
    "Pandas",
    "NumPy",
    "Spark",
    "Airflow",
    "dbt",
    "MLOps",
    "MLflow",
    "LangChain",
    "LlamaIndex",
    "Hugging Face",
    "RAG",
    r"LLMs?",
    "Prompt Engineering",
    r"Fine-?tuning",
    "Computer Vision",
    "NLP",
    "Tableau",
    "Power BI",
    "Looker",
    "Salesforce",
    "SAP",
]
SKILL_PATTERN = re.compile(r"(?<!\w)(?:" + "|".join(SKILL_TOKENS) + r")(?!\w)", re.IGNORECASE)
GO_SKILL_PATTERN = re.compile(r"(?<!\w)Go(?![\w-])")
DISPLAY = {token.replace("\\", "").replace("?", "").lower(): token.replace("\\", "").replace("?", "") for token in SKILL_TOKENS}
CANONICAL = {
    "k8s": "Kubernetes",
    "golang": "Go",
    "postgres": "PostgreSQL",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "nodejs.": "Node.js",
    "vuejs": "Vue.js",
    "vue.js": "Vue.js",
    "nextjs": "Next.js",
    "next.js": "Next.js",
    "llm": "LLMs",
    "llms": "LLMs",
    "finetuning": "Fine-tuning",
    "fine-tuning": "Fine-tuning",
    "power bi": "Power BI",
    "github actions": "GitHub Actions",
    "gitlab ci": "GitLab CI",
    "ci/cd": "CI/CD",
    "hugging face": "Hugging Face",
    "react native": "React Native",
    "prompt engineering": "Prompt Engineering",
    "computer vision": "Computer Vision",
    "scikit-learn": "scikit-learn",
    "c++": "C++",
    "c#": "C#",
    ".net": ".NET",
    "nlp": "NLP",
    "rag": "RAG",
    "sql": "SQL",
    "aws": "AWS",
    "gcp": "GCP",
    "grpc": "gRPC",
    "dbt": "dbt",
    "mlops": "MLOps",
    "mlflow": "MLflow",
}


def canonicalize(token: str) -> str:
    key = token.lower()
    return CANONICAL.get(key) or DISPLAY.get(key) or token


def extract_skills(text: str | None) -> set[str]:
    if not text:
        return set()
    found = {canonicalize(match.group(0)) for match in SKILL_PATTERN.finditer(text)}
    if GO_SKILL_PATTERN.search(text):
        found.add("Go")
    return found


def _parse_machine_summary(content: str) -> dict[str, Any] | None:
    match = re.search(r"##\s*Machine Summary\s*\n+```(?:yaml|yml|json)?\s*\n([\s\S]*?)\n```", content, re.IGNORECASE)
    if not match:
        return None
    try:
        parsed = yaml.safe_load(match.group(1).strip())
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _normalize_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value is None or value == "" or isinstance(value, dict):
        return []
    return [str(value).strip()]


def parse_report_gaps(content: str) -> dict[str, Any]:
    gaps: list[str] = []
    score = None
    has_machine_summary = False
    summary = _parse_machine_summary(content)
    if summary:
        has_machine_summary = True
        if isinstance(summary.get("score"), (int, float)):
            score = float(summary["score"])
        gaps.extend(_normalize_list(summary.get("hard_stops")))
        gaps.extend(_normalize_list(summary.get("soft_gaps")))
    plain = str(content or "").replace("**", "")
    if score is None:
        match = re.search(r"\|\s*(?:Global)\s*\|\s*([\d.]+)\/5\s*\|", plain, re.IGNORECASE)
        if match:
            score = float(match.group(1))
    table = re.search(r"\|\s*Gap\s*\|\s*Severity\s*\|.*?\n\|[-|\s]+\n([\s\S]*?)(?:\n\n|\n##|\n\*\*|$)", content, re.IGNORECASE)
    if table:
        for row in [line for line in table.group(1).split("\n") if line.startswith("|")]:
            cols = [col.strip() for col in row.split("|") if col.strip()]
            if len(cols) >= 2:
                gaps.append(cols[0])
    return {"score": score, "gapText": "\n".join(gaps), "hasMachineSummary": has_machine_summary}


def aggregate_gaps(reports: list[dict[str, Any]], known_skills: set[str]) -> dict[str, Any]:
    scored = [report for report in reports if isinstance(report.get("score"), (int, float))]
    low_fit = [report for report in scored if report["score"] < LOW_FIT_SCORE]
    total_low_fit = len(low_fit)
    by_skill: dict[str, dict[str, Any]] = {}
    excluded_counts: dict[str, int] = {}
    for report in reports:
        for skill in extract_skills(report.get("gapText", "")):
            if skill in known_skills:
                excluded_counts[skill] = excluded_counts.get(skill, 0) + 1
                continue
            entry = by_skill.setdefault(skill, {"skill": skill, "reports": 0, "lowFitReports": 0, "weightedScore": 0.0, "sources": []})
            entry["reports"] += 1
            entry["sources"].append(report.get("num"))
            score = report.get("score")
            weight = max(0, 5.0 - score) if isinstance(score, (int, float)) else 1.0
            entry["weightedScore"] += weight
            if isinstance(score, (int, float)) and score < LOW_FIT_SCORE:
                entry["lowFitReports"] += 1
    gaps = []
    for gap in by_skill.values():
        share = gap["lowFitReports"] / total_low_fit if total_low_fit else 0
        tier = "Low"
        if share >= 0.5 and gap["lowFitReports"] >= 3:
            tier = "Critical"
        elif share >= 0.3 and gap["lowFitReports"] >= 2:
            tier = "High"
        elif gap["lowFitReports"] >= 2:
            tier = "Medium"
        gaps.append({**gap, "lowFitShare": round(share, 2), "weightedScore": round(gap["weightedScore"], 2), "tier": tier})
    gaps.sort(key=lambda item: (-item["weightedScore"], -item["reports"], item["skill"]))
    excluded = [{"skill": skill, "reports": count} for skill, count in excluded_counts.items()]
    excluded.sort(key=lambda item: (-item["reports"], item["skill"]))
    return {"gaps": gaps, "excludedAsKnown": excluded, "totalLowFit": total_low_fit}


def compute_targeted_gaps(jd_text: str, known_text: str) -> dict[str, Any]:
    known = extract_skills(known_text)
    gaps: list[str] = []
    excluded: list[str] = []
    for skill in sorted(extract_skills(jd_text)):
        (excluded if skill in known else gaps).append(skill)
    return {"gaps": gaps, "excludedAsKnown": excluded, "knownSkills": sorted(known)}


def _resolve_report_path(report_field: str, tracker_path: Path, root: Path) -> Path | None:
    match = re.search(r"\]\(([^)]+)\)", report_field or "")
    if not match:
        return None
    candidates = [(tracker_path.parent / match.group(1)).resolve(strict=False), (root / match.group(1)).resolve(strict=False)]
    return next((candidate for candidate in candidates if candidate.exists()), None)


def analyze_upskill(
    tracker_path: str | Path,
    *,
    cv_path: str | Path = PROJECT_ROOT / "cv.md",
    profile_path: str | Path = CONFIG_DIR / "profile.yml",
    root: str | Path = PROJECT_ROOT,
    min_reports: int = 5,
) -> dict[str, Any]:
    tracker = Path(tracker_path)
    if not tracker.exists():
        return {"error": "No applications tracker found. Run some evaluations first."}
    lines = tracker.read_text(encoding="utf-8").split("\n")
    colmap = resolve_columns(lines)
    rows = [row for line in lines if (row := parse_tracker_row(line, colmap))]
    reports_linked = reports_read = reports_with_machine_summary = 0
    parsed_reports: list[dict[str, Any]] = []
    for row in rows:
        path = _resolve_report_path(row.report, tracker, Path(root))
        if not path:
            if re.search(r"\]\(([^)]+)\)", row.report or ""):
                reports_linked += 1
            continue
        reports_linked += 1
        reports_read += 1
        parsed = parse_report_gaps(path.read_text(encoding="utf-8"))
        if parsed["hasMachineSummary"]:
            reports_with_machine_summary += 1
        try:
            tracker_score = float(str(row.score).replace("*", "").split("/")[0])
        except ValueError:
            tracker_score = None
        parsed_reports.append({"num": row.num, "score": tracker_score if tracker_score is not None else parsed["score"], "gapText": parsed["gapText"]})
    scored_count = sum(1 for report in parsed_reports if isinstance(report.get("score"), (int, float)))
    if scored_count < min_reports:
        return {"error": f"Not enough data: {scored_count}/{min_reports} scored reports. Evaluate more offers and come back.", "current": scored_count, "threshold": min_reports}
    known_text = "\n".join(Path(path).read_text(encoding="utf-8") for path in [Path(cv_path), Path(profile_path)] if path.exists())
    known_skills = extract_skills(known_text)
    aggregation = aggregate_gaps(parsed_reports, known_skills)
    return {
        "schema_version": SCHEMA_VERSION,
        "metadata": {
            "reportsLinked": reports_linked,
            "reportsRead": reports_read,
            "reportsWithMachineSummary": reports_with_machine_summary,
            "reportsScored": scored_count,
            "lowFitReports": aggregation["totalLowFit"],
            "lowFitScoreThreshold": LOW_FIT_SCORE,
            "knownSkillCount": len(known_skills),
        },
        "gaps": aggregation["gaps"],
        "excludedAsKnown": aggregation["excludedAsKnown"],
        "knownSkills": sorted(known_skills),
    }


def format_summary(result: dict[str, Any]) -> str:
    if result.get("error"):
        return f"upskill: {result['error']}\n"
    meta = result["metadata"]
    lines = [
        f"UPSKILL GAP MAP (schema v{result['schema_version']})",
        f"Reports: {meta['reportsRead']}/{meta['reportsLinked']} read, {meta['reportsScored']} scored, {meta['lowFitReports']} low-fit (<{meta['lowFitScoreThreshold']}), {meta['reportsWithMachineSummary']} with Machine Summary",
        "",
    ]
    if not result["gaps"]:
        lines.append("No skill gaps detected across your evaluated reports.")
    else:
        lines.append(f"{'TIER'.ljust(10)}{'SKILL'.ljust(22)}{'REPORTS'.ljust(9)}{'LOW-FIT'.ljust(9)}WEIGHTED")
        for gap in result["gaps"]:
            lines.append(f"{gap['tier'].ljust(10)}{gap['skill'].ljust(22)}{str(gap['reports']).ljust(9)}{f'{gap['lowFitReports']}/{meta['lowFitReports']}'.ljust(9)}{gap['weightedScore']}")
    if result["excludedAsKnown"]:
        lines.extend(["", f"Excluded (already in cv.md/profile): {', '.join(item['skill'] for item in result['excludedAsKnown'])}"])
    return "\n".join(lines) + "\n"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Aggregate skill gaps from evaluation reports.")
    parser.add_argument("--tracker", default=str(PROJECT_ROOT / "data/applications.md"))
    parser.add_argument("--cv", default=str(PROJECT_ROOT / "cv.md"))
    parser.add_argument("--profile", default=str(CONFIG_DIR / "profile.yml"))
    parser.add_argument("--min-reports", type=int, default=5)
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--url-text", help="Local JD text file for targeted mode")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.url_text:
        jd_path = Path(args.url_text)
        if not jd_path.exists():
            print(f"Fatal: Target file not found at path: {args.url_text}")
            return 1
        known_text = "\n".join(Path(path).read_text(encoding="utf-8") for path in [Path(args.cv), Path(args.profile)] if path.exists())
        result = compute_targeted_gaps(jd_path.read_text(encoding="utf-8"), known_text)
        print(json.dumps({"mode": "targeted", "source": args.url_text, "gaps": [{"skill": skill} for skill in result["gaps"]], "excludedAsKnown": [{"skill": skill} for skill in result["excludedAsKnown"]], "knownSkills": result["knownSkills"]}, indent=2))
        return 0
    result = analyze_upskill(args.tracker, cv_path=args.cv, profile_path=args.profile, min_reports=max(1, args.min_reports))
    print(format_summary(result) if args.summary else json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
