from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


FINGERPRINT_MIN_TEXT = 200
CROSSLIST_THRESHOLD = 0.92
CROSSLIST_WINDOW_DAYS = 90


def normalize_jd_text(text: str) -> str:
    value = str(text if text is not None else "").lower()
    value = re.sub(r"<[^>]*>", " ", value)
    value = re.sub(r"&[a-z#0-9]+;", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"https?://\S+", " ", value)
    value = "".join(ch if ch.isalnum() else " " for ch in value)
    return re.sub(r" {2,}", " ", value).strip()


def fingerprint_text(text: str) -> str:
    normalized = normalize_jd_text(text)
    if len(normalized) < FINGERPRINT_MIN_TEXT:
        return ""
    tokens = normalized.split(" ")
    if len(tokens) < 3:
        return ""

    weights = [0] * 64
    for idx in range(len(tokens) - 2):
        shingle = f"{tokens[idx]} {tokens[idx + 1]} {tokens[idx + 2]}"
        digest = hashlib.sha1(shingle.encode("utf-8")).digest()
        for bit in range(64):
            byte = digest[bit >> 3]
            weights[bit] += 1 if ((byte >> (7 - (bit & 7))) & 1) else -1

    fingerprint = 0
    for bit, weight in enumerate(weights):
        if weight > 0:
            fingerprint |= 1 << (63 - bit)
    return f"{fingerprint:016x}"


def similarity(a: str, b: str) -> float:
    if not re.match(r"^[0-9a-f]{16}$", str(a or "")) or not re.match(r"^[0-9a-f]{16}$", str(b or "")):
        return 0
    distance = (int(a, 16) ^ int(b, 16)).bit_count()
    return 1 - distance / 64


def _company_key(name: str) -> str:
    return "".join(ch for ch in str(name if name is not None else "").lower() if ch.isascii() and ch.isalnum())


@dataclass(frozen=True)
class CrossListingMatch:
    offer: dict[str, Any]
    row: dict[str, Any]
    score: float


def find_cross_listings(
    offers: list[dict[str, Any]],
    history_rows: list[dict[str, Any]],
    *,
    today: datetime | str | None = None,
    threshold: float = CROSSLIST_THRESHOLD,
    window_days: int = CROSSLIST_WINDOW_DAYS,
) -> list[CrossListingMatch]:
    if today is None:
        now = datetime.now(timezone.utc)
    elif isinstance(today, str):
        now = datetime.fromisoformat(today.replace("Z", "+00:00"))
    else:
        now = today
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    cutoff = now - timedelta(days=window_days)

    recent: list[dict[str, Any]] = []
    for row in history_rows:
        if not row.get("fingerprint"):
            continue
        try:
            row_date = datetime.fromisoformat(str(row.get("dateStr", "")).replace("Z", "+00:00"))
        except ValueError:
            continue
        if row_date.tzinfo is None:
            row_date = row_date.replace(tzinfo=timezone.utc)
        if row_date >= cutoff:
            recent.append(row)

    matches: list[CrossListingMatch] = []
    for offer in offers:
        if not offer.get("fingerprint"):
            continue
        offer_company = _company_key(str(offer.get("company", "")))
        for row in recent:
            if _company_key(str(row.get("company", ""))) == offer_company:
                continue
            if row.get("url") == offer.get("url"):
                continue
            score = similarity(str(offer["fingerprint"]), str(row.get("fingerprint", "")))
            if score >= threshold:
                matches.append(CrossListingMatch(offer=offer, row=row, score=score))
    return sorted(matches, key=lambda match: match.score, reverse=True)

