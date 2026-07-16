#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path

from scripts.python import PROJECT_ROOT


STORY_BANK_PATH = PROJECT_ROOT / "interview-prep/story-bank.md"
STOPWORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "you",
    "me",
    "my",
    "your",
    "i",
    "we",
    "they",
    "it",
    "is",
    "was",
    "were",
    "are",
    "be",
    "been",
    "have",
    "had",
    "has",
    "do",
    "did",
    "does",
    "tell",
    "about",
    "time",
    "when",
    "how",
    "give",
    "example",
    "describe",
    "situation",
    "where",
    "what",
}


@dataclass(frozen=True)
class Story:
    title: str
    theme: str = ""
    source: str = ""
    situation: str = ""
    task: str = ""
    action: str = ""
    result: str = ""
    reflection: str = ""
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class RankedStory:
    story: Story
    score: int


def _field(block: str, label: str) -> str:
    match = re.search(rf"\*\*{label}:\*\*\s*(.+)", block)
    return match.group(1).strip() if match else ""


def parse_stories(content: str) -> list[Story]:
    stories: list[Story] = []
    for block in re.split(r"^### ", str(content or ""), flags=re.MULTILINE)[1:]:
        lines = block.strip().split("\n")
        if not lines:
            continue
        header = lines[0].strip()
        theme_match = re.match(r"^\[([^\]]+)\]\s*(.+)", header)
        theme = theme_match.group(1).strip() if theme_match else ""
        title = theme_match.group(2).strip() if theme_match else header

        tags_raw = _field(block, "Best for questions about")
        tags = tuple(tag.strip().lower() for tag in re.split(r"[,;]", tags_raw) if tag.strip()) if tags_raw else ()
        action = _field(block, r"A \(Action\)") or _field(block, "Action")
        if not title or not action:
            continue
        stories.append(
            Story(
                title=title,
                theme=theme,
                source=_field(block, "Source"),
                situation=_field(block, r"S \(Situation\)") or _field(block, "Situation"),
                task=_field(block, r"T \(Task\)") or _field(block, "Task"),
                action=action,
                result=_field(block, r"R \(Result\)") or _field(block, "Result"),
                reflection=_field(block, "Reflection"),
                tags=tags,
            )
        )
    return stories


def tokenize(text: str) -> list[str]:
    return [word for word in re.sub(r"[^a-z0-9\s]", " ", str(text or "").lower()).split() if word]


def score_story(story: Story, query_tokens: list[str], jd_tokens: list[str] | None = None) -> int:
    signal = [token for token in query_tokens if token not in STOPWORDS]
    score = 0
    tag_text = " ".join(story.tags)
    for token in signal:
        if token in tag_text:
            score += 3
    title_tokens = tokenize(f"{story.title} {story.theme}")
    for token in signal:
        if token in title_tokens:
            score += 2
    body_tokens = tokenize(f"{story.action} {story.result}")
    for token in signal:
        if token in body_tokens:
            score += 1
    if jd_tokens:
        jd_signal = {token for token in jd_tokens if token not in STOPWORDS}
        for tag in story.tags:
            if any(token in jd_signal for token in tokenize(tag)):
                score += 2
    return score


def rank_stories(stories: list[Story], question: str, jd_text: str = "", top: int = 1) -> list[RankedStory]:
    query_tokens = tokenize(question)
    jd_tokens = tokenize(jd_text) if jd_text else []
    ranked = [RankedStory(story, score_story(story, query_tokens, jd_tokens)) for story in stories]
    ranked.sort(key=lambda item: item.score, reverse=True)
    return ranked[: max(1, top)]


def format_ats(story: Story, question: str = "") -> str:
    parts = [story.situation, story.task, story.action, story.result, story.reflection]
    words = " ".join(part for part in parts if part).split()
    prose = " ".join(words[:500])
    count = min(len(words), 500)
    notice = "\n   Under 250 words — consider expanding this story in story-bank.md." if len(words) < 250 else ""
    lines = [
        f"- {story.title}{f' [{story.theme}]' if story.theme else ''}",
        f"   Source: {story.source}" if story.source else "",
        f"   Tags: {', '.join(story.tags)}" if story.tags else "",
        "",
        prose,
        "",
        f"   (~{count} words){notice}",
    ]
    return "\n".join(line for line in lines if line != "")


def build_output(stories: list[Story], question: str, *, jd_text: str = "", jd_path: str | None = None, top: int = 1) -> str:
    ranked = rank_stories(stories, question, jd_text, top)
    lines = [
        "",
        "ATS Behavioural Question Matcher",
        "----------------------------------------",
        f'Question: "{question}"',
    ]
    if jd_path:
        lines.append(f"JD:       {jd_path}")
    lines.append(f"Stories:  {len(stories)} in bank")
    lines.append("")
    for idx, item in enumerate(ranked, start=1):
        lines.extend(["----------------------------------------", f"Match {idx} of {len(ranked)} (score: {item.score})", "", format_ats(item.story, question), ""])
    if ranked and ranked[0].score == 0:
        lines.append("No strong match found. Consider adding a story to story-bank.md that covers this competency.")
    return "\n".join(lines)


def list_stories(stories: list[Story]) -> str:
    lines = ["", f"Story Bank — {len(stories)} stories", "----------------------------------------"]
    for idx, story in enumerate(stories, start=1):
        lines.append(f"{idx}. {story.title}{f' [{story.theme}]' if story.theme else ''}")
        if story.tags:
            lines.append(f"   Tags: {', '.join(story.tags)}")
        if story.source:
            lines.append(f"   {story.source}")
        lines.append("")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Match behavioral interview questions to STAR stories.")
    parser.add_argument("question", nargs="*")
    parser.add_argument("--story-bank", default=str(STORY_BANK_PATH))
    parser.add_argument("--jd")
    parser.add_argument("--top", type=int, default=1)
    parser.add_argument("--list", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    story_path = Path(args.story_bank)
    if not story_path.exists():
        print(f"Error: {story_path} not found.")
        return 1
    stories = parse_stories(story_path.read_text(encoding="utf-8"))
    if not stories:
        print("No stories found in story-bank.md yet.")
        return 1
    if args.list:
        print(list_stories(stories))
        return 0
    question = " ".join(args.question).strip()
    if not question:
        print('Usage: match_star.py "<behavioural question>" [--jd <file>] [--top <n>]')
        return 1
    jd_text = Path(args.jd).read_text(encoding="utf-8") if args.jd else ""
    print(build_output(stories, question, jd_text=jd_text, jd_path=args.jd, top=args.top))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
