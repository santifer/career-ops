from __future__ import annotations

import re


SENIORITY_TOKENS = {
    "junior",
    "mid",
    "middle",
    "senior",
    "staff",
    "principal",
    "lead",
    "head",
    "chief",
    "associate",
    "intern",
    "entry",
}

ROLE_STOPWORDS = {
    "junior",
    "mid",
    "middle",
    "senior",
    "staff",
    "principal",
    "lead",
    "head",
    "chief",
    "associate",
    "intern",
    "entry",
    "level",
    "remote",
    "hybrid",
    "onsite",
    "contract",
    "contractor",
    "freelance",
    "fulltime",
    "parttime",
    "permanent",
    "temporary",
    "internship",
    "role",
    "position",
    "opportunity",
    "team",
    "based",
    "bangalore",
    "bengaluru",
    "mumbai",
    "delhi",
    "hyderabad",
    "pune",
    "chennai",
    "london",
    "berlin",
    "paris",
    "madrid",
    "barcelona",
    "amsterdam",
    "dublin",
    "york",
    "francisco",
    "seattle",
    "boston",
    "austin",
    "chicago",
    "toronto",
    "tokyo",
    "singapore",
    "sydney",
    "melbourne",
    "lisbon",
    "warsaw",
    "europe",
    "emea",
    "apac",
    "latam",
    "americas",
    "india",
    "spain",
    "germany",
    "france",
    "italy",
    "canada",
    "brazil",
    "mexico",
    "japan",
    "with",
    "from",
    "into",
    "over",
    "this",
    "that",
}

SHORT_SPECIALTY = {
    "api",
    "sre",
    "sdk",
    "cli",
    "gpu",
    "cpu",
    "ios",
    "qa",
    "ux",
    "ui",
    "ar",
    "vr",
    "ocr",
    "crm",
    "erp",
}

BASELINE_TOKENS = {
    "software",
    "engineer",
    "developer",
    "manager",
    "architect",
    "analyst",
    "designer",
    "consultant",
    "specialist",
    "platform",
    "systems",
    "services",
    "backend",
    "frontend",
    "full",
    "stack",
    "fullstack",
}


def _words(title: str) -> list[str]:
    return re.sub(r"[^a-z0-9\s]", " ", str(title if title is not None else "").lower()).split()


def role_tokens(role: str) -> list[str]:
    return [word for word in _words(role) if (len(word) > 3 or word in SHORT_SPECIALTY) and word not in ROLE_STOPWORDS]


def _extract_seniorities(title: str) -> set[str]:
    return {word for word in _words(title) if word in SENIORITY_TOKENS}


def role_fuzzy_match(a: str, b: str) -> bool:
    seniorities_a = _extract_seniorities(a)
    seniorities_b = _extract_seniorities(b)
    if seniorities_a and seniorities_b and not seniorities_a.intersection(seniorities_b):
        return False

    words_a = set(role_tokens(a))
    words_b = set(role_tokens(b))
    if not words_a or not words_b:
        return False

    overlap = words_a.intersection(words_b)
    if len(overlap) < 2:
        return False
    if not any(word not in BASELINE_TOKENS for word in overlap):
        return False

    union_size = len(words_a.union(words_b))
    return len(overlap) / union_size >= 0.6

