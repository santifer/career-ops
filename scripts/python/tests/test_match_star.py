from __future__ import annotations

from scripts.python.interview.match_star import build_output, format_ats, list_stories, parse_stories, rank_stories, score_story, tokenize


STORY_BANK = """# Story Bank

### [Leadership] Incident response under pressure
**Source:** Acme platform migration
**S (Situation):** A critical migration started failing close to launch.
**T (Task):** I had to keep the team aligned while protecting customer delivery.
**A (Action):** I led a focused incident room, split debugging from stakeholder updates, and clarified ownership.
**R (Result):** We recovered the launch, reduced customer impact, and documented the rollback path.
**Reflection:** I learned to make pressure visible without spreading panic.
**Best for questions about:** leadership, pressure, incident response, ambiguity

### [Conflict] Resolving roadmap disagreement
**Source:** Product planning
**Situation:** Product and engineering disagreed about scope.
**Task:** I needed to unblock the roadmap.
**Action:** I facilitated trade-off mapping and helped both sides agree on a smaller release.
**Result:** The team shipped earlier and kept trust with stakeholders.
**Best for questions about:** conflict, stakeholder management, roadmap

### Template
**Action:** 
"""


def test_parse_stories_supports_theme_fields_and_skips_templates() -> None:
    stories = parse_stories(STORY_BANK)
    assert len(stories) == 2
    assert stories[0].title == "Incident response under pressure"
    assert stories[0].theme == "Leadership"
    assert stories[0].source == "Acme platform migration"
    assert "pressure" in stories[0].tags
    assert stories[1].situation == "Product and engineering disagreed about scope."


def test_tokenize_and_score_rank_stories_with_jd_boost() -> None:
    stories = parse_stories(STORY_BANK)
    assert tokenize("Tell me about pressure, leadership!") == ["tell", "me", "about", "pressure", "leadership"]

    leadership_score = score_story(stories[0], tokenize("Tell me about leadership under pressure"))
    conflict_score = score_story(stories[1], tokenize("Tell me about leadership under pressure"))
    assert leadership_score > conflict_score

    ranked = rank_stories(stories, "Describe conflict with stakeholders", jd_text="roadmap stakeholder alignment", top=2)
    assert ranked[0].story.title == "Resolving roadmap disagreement"
    assert ranked[0].score > ranked[1].score


def test_format_ats_caps_words_and_warns_short_stories() -> None:
    story = parse_stories(STORY_BANK)[0]
    formatted = format_ats(story)
    assert "- Incident response under pressure [Leadership]" in formatted
    assert "Tags: leadership, pressure, incident response, ambiguity" in formatted
    assert "(~" in formatted
    assert "Under 250 words" in formatted


def test_build_output_and_list_stories() -> None:
    stories = parse_stories(STORY_BANK)
    output = build_output(stories, "Give an example of handling ambiguity", top=1)
    assert "ATS Behavioural Question Matcher" in output
    assert 'Question: "Give an example of handling ambiguity"' in output
    assert "Match 1 of 1" in output

    listed = list_stories(stories)
    assert "Story Bank — 2 stories" in listed
    assert "Incident response under pressure [Leadership]" in listed
