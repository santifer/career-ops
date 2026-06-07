#!/usr/bin/env python3
"""
cover-letter.py — Generic ReportLab cover letter PDF generator for career-ops.

Usage:
    python3 cover-letter.py payload.json
    python3 cover-letter.py < payload.json

Input: JSON payload (file path as first arg, or stdin).
Output: A4 PDF written to the path specified in payload["output_path"].

JSON schema:
{
  "candidate": {
    "name": "...",
    "email": "...",
    "phone": "...",          // optional
    "location": "...",
    "linkedin": "...",       // optional
    "github": "...",         // optional
    "credentials": ["..."]   // optional list of credential lines
  },
  "letter": {
    "role_title": "...",
    "company": "...",
    "city": "...",           // optional
    "date": "YYYY-MM-DD",
    "opening": "...",
    "profile_intro": "...",
    "achievements": [
      {"lead": "...", "impact": "..."}
    ],
    "problems_section": "...",
    "closing": "...",
    "language_closing": "..." // optional, null to omit
  },
  "output_path": "output/slug-cover.pdf"
}
"""

import json
import sys
from pathlib import Path

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
except ImportError:
    print("ERROR: reportlab is not installed. Run: pip install reportlab", file=sys.stderr)
    sys.exit(1)


def load_payload():
    if len(sys.argv) > 1:
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            return json.load(f)
    return json.load(sys.stdin)


def escape(text):
    """Escape characters that break ReportLab XML parsing."""
    if not text:
        return ""
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
    )


def build_styles():
    grey = colors.HexColor("#666666")
    divider_grey = colors.HexColor("#CCCCCC")
    link_blue = "#1a56a0"

    styles = {
        "name": ParagraphStyle(
            "name", fontName="Helvetica-Bold", fontSize=14, spaceAfter=3
        ),
        "contact": ParagraphStyle(
            "contact", fontName="Helvetica", fontSize=9,
            textColor=grey, spaceAfter=2, leading=13
        ),
        "role_title": ParagraphStyle(
            "role_title", fontName="Helvetica-Bold", fontSize=11, spaceAfter=2, spaceBefore=10
        ),
        "dateline": ParagraphStyle(
            "dateline", fontName="Helvetica", fontSize=9,
            textColor=grey, spaceAfter=12
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=10,
            leading=14, spaceAfter=8, alignment=TA_LEFT
        ),
        "bullet": ParagraphStyle(
            "bullet", fontName="Helvetica", fontSize=10,
            leading=14, leftIndent=14, spaceAfter=5
        ),
        "language_closing": ParagraphStyle(
            "language_closing", fontName="Helvetica-Oblique", fontSize=10,
            spaceAfter=8, spaceBefore=4
        ),
    }
    return styles, grey, divider_grey, link_blue


def contact_line(candidate, link_blue):
    """Build the first contact line: location | email | phone | linkedin | github"""
    parts = []
    if candidate.get("location"):
        parts.append(escape(candidate["location"]))
    if candidate.get("email"):
        parts.append(f"<a href='mailto:{escape(candidate['email'])}' color='{link_blue}'>{escape(candidate['email'])}</a>")
    if candidate.get("phone"):
        parts.append(escape(candidate["phone"]))
    if candidate.get("linkedin"):
        url = candidate["linkedin"]
        if not url.startswith("http"):
            url = "https://" + url
        parts.append(f"<a href='{escape(url)}' color='{link_blue}'>LinkedIn</a>")
    if candidate.get("github"):
        url = candidate["github"]
        if not url.startswith("http"):
            url = "https://" + url
        display = candidate["github"].replace("https://", "").replace("http://", "")
        parts.append(f"<a href='{escape(url)}' color='{link_blue}'>{escape(display)}</a>")
    return " &nbsp;|&nbsp; ".join(parts)


def build_story(payload, styles, divider_grey, link_blue):
    candidate = payload["candidate"]
    letter = payload["letter"]
    story = []

    # ── Header ────────────────────────────────────────────────────────────────
    story.append(Paragraph(escape(candidate["name"]), styles["name"]))
    story.append(Paragraph(contact_line(candidate, link_blue), styles["contact"]))

    credentials = candidate.get("credentials", [])
    if credentials:
        cred_text = " &nbsp;|&nbsp; ".join(escape(c) for c in credentials)
        story.append(Paragraph(cred_text, styles["contact"]))

    story.append(Spacer(1, 6))
    story.append(HRFlowable(
        width="100%", thickness=0.5,
        color=divider_grey, spaceAfter=8
    ))

    # ── Letter title + date ───────────────────────────────────────────────────
    title = escape(letter["role_title"])
    company = escape(letter.get("company", ""))
    city = escape(letter.get("city", ""))
    date = escape(letter.get("date", ""))

    story.append(Paragraph(f"Cover Letter: {title}", styles["role_title"]))

    dateline_parts = [p for p in [company, city, date] if p]
    story.append(Paragraph(" &nbsp;&nbsp; ".join(dateline_parts), styles["dateline"]))

    # ── Opening ───────────────────────────────────────────────────────────────
    story.append(Paragraph(escape(letter["opening"]), styles["body"]))

    # ── Profile introduction ──────────────────────────────────────────────────
    story.append(Paragraph(escape(letter["profile_intro"]), styles["body"]))

    # ── Achievements ─────────────────────────────────────────────────────────
    for ach in letter.get("achievements", []):
        lead = escape(ach.get("lead", ""))
        impact = escape(ach.get("impact", ""))
        story.append(Paragraph(
            f"&bull; <b>{lead},</b> {impact}",
            styles["bullet"]
        ))

    story.append(Spacer(1, 4))

    # ── Problems I will solve ─────────────────────────────────────────────────
    if letter.get("problems_section"):
        story.append(Paragraph(escape(letter["problems_section"]), styles["body"]))

    # ── Closing ───────────────────────────────────────────────────────────────
    if letter.get("closing"):
        story.append(Paragraph(escape(letter["closing"]), styles["body"]))

    # ── Language-specific closing (optional) ──────────────────────────────────
    if letter.get("language_closing"):
        story.append(Paragraph(escape(letter["language_closing"]), styles["language_closing"]))

    return story


def main():
    payload = load_payload()
    output_path = payload.get("output_path", "output/cover-letter.pdf")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    styles, grey, divider_grey, link_blue = build_styles()

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=50, rightMargin=50,
        topMargin=50, bottomMargin=40
    )

    story = build_story(payload, styles, divider_grey, link_blue)
    doc.build(story)
    print(f"PDF written to {output_path}")


if __name__ == "__main__":
    main()
