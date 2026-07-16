#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from scripts.python import PROJECT_ROOT


REQUIREMENT_HEADER_RE = re.compile(r"^#{0,4}\s*(required|requirements|qualifications|must[- ]have|preferred|nice[- ]to[- ]have)s?\b.*$", re.IGNORECASE)
BULLET_LINE_RE = re.compile(r"^\s*[-*•]\s*(.+)$")
SKILL_TOKEN_RE = re.compile(r"\b([A-Z][A-Za-z0-9+.#]{0,29}[A-Za-z0-9+#](?:\.[a-z]{2,4})?)(?!\w)")
STOPWORDS = {
    "the", "and", "for", "with", "you", "your", "our", "this", "that", "these", "those",
    "must", "able", "ability", "strong", "excellent", "proven", "a", "an", "or", "in", "of", "to", "as", "is", "are",
    "bachelor", "bachelors", "master", "masters", "degree", "diploma", "certification", "certificate",
    "experience", "years", "year", "senior", "junior", "entry", "level", "minimum", "preferred", "required",
    "candidates", "candidate", "applicants", "applicant", "ideal", "successful",
    "knowledge", "understanding", "familiarity", "exposure", "background",
    "skills", "skill", "communication", "team", "teams", "work", "working",
}
SKILLS_HEADING_RE = re.compile(r"^#{1,4}\s*Skills\s*$", re.IGNORECASE)
ANY_HEADING_RE = re.compile(r"^#{1,4}\s")


def extract_jd_skills(jd_text: str) -> list[str]:
    skills: dict[str, None] = {}
    in_requirements = False
    for line in str(jd_text or "").split("\n"):
        if REQUIREMENT_HEADER_RE.match(line):
            in_requirements = True
            continue
        if in_requirements and line.strip() == "":
            continue
        if in_requirements and re.match(r"^#{1,4}\s", line) and not REQUIREMENT_HEADER_RE.match(line):
            in_requirements = False
        bullet = BULLET_LINE_RE.match(line)
        if in_requirements and bullet:
            for match in SKILL_TOKEN_RE.finditer(bullet.group(1)):
                token = match.group(1).strip()
                if token.lower() not in STOPWORDS and len(token) > 1:
                    skills[token] = None
    return list(skills)


def skill_mentioned_in_text(skill: str, text: str) -> bool:
    escaped = re.escape(skill)
    return bool(re.search(rf"(?<![\w]){escaped}(?![\w])", text or "", re.IGNORECASE))


def split_skills_section(cv_text: str) -> dict[str, str]:
    lines = str(cv_text or "").split("\n")
    start = -1
    for idx, line in enumerate(lines):
        if SKILLS_HEADING_RE.match(line):
            start = idx + 1
            break
    if start == -1:
        return {"namedSkillsText": "", "proseText": cv_text}
    end = len(lines)
    for idx in range(start, len(lines)):
        if ANY_HEADING_RE.match(lines[idx]):
            end = idx
            break
    return {
        "namedSkillsText": "\n".join(lines[start:end]),
        "proseText": "\n".join(lines[: start - 1] + lines[end:]),
    }


def classify_skill_gaps(jd_skills: list[str], cv_text: str) -> dict[str, list[str]]:
    sections = split_skills_section(cv_text)
    existing: list[str] = []
    supported: list[str] = []
    gap: list[str] = []
    for skill in jd_skills:
        if skill_mentioned_in_text(skill, sections["namedSkillsText"]):
            existing.append(skill)
        elif skill_mentioned_in_text(skill, sections["proseText"]):
            supported.append(skill)
        else:
            gap.append(skill)
    return {"existing": existing, "supportedByResume": supported, "gap": gap}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Zero-LLM JD skill-gap checker.")
    parser.add_argument("jd_file")
    parser.add_argument("--cv", default=str(PROJECT_ROOT / "cv.md"))
    parser.add_argument("--summary", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    jd_path = Path(args.jd_file)
    cv_path = Path(args.cv)
    if not jd_path.exists() or not cv_path.exists():
        print("Usage: jd_skill_gap.py <jd-file> [--cv cv.md] [--summary]")
        return 1
    skills = extract_jd_skills(jd_path.read_text(encoding="utf-8"))
    result = classify_skill_gaps(skills, cv_path.read_text(encoding="utf-8"))
    if args.summary:
        print("JD Skill-Gap Check")
        print(f"JD skills found: {len(skills)}")
        print(f"Already in Skills section: {', '.join(result['existing']) or '(none)'}")
        print(f"Mentioned in resume prose: {', '.join(result['supportedByResume']) or '(none)'}")
        print(f"Real gaps: {', '.join(result['gap']) or '(none)'}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

