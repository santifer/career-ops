<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Antipatterns

**Design failures in operational-dashboard emails; what to avoid; why specific choices undermine effectiveness.**

## Why it matters for operational-dashboard emails

Antipatterns are instructive failures. By naming what doesn't work, the analyzer can spot problems faster and explain why. An antipattern is not just "bad design" — it's a specific, recurring choice that undermines the email's goal. "Avoid red text" is vague; "red text on dark backgrounds creates unreadable 2:1 contrast" is actionable.

## Key antipatterns

1. **The Avalanche**: More than 10 items in a single section without pagination or grouping.
   - Why it fails: Readers experience decision paralysis; they don't know where to start.
   - Fix: Paginate into top-5 + "View all" link, or group by status/priority.

2. **The Jargon Overload**: Email uses internal terminology ("LDAP sync event," "GCP provider rotation," "hotsheet delta") without definition.
   - Why it fails: Readers unfamiliar with the jargon skip the content; clarity is lost.
   - Fix: Define acronyms on first use or link to a glossary.

3. **The Anxiety Trigger**: Empty-state sections are given the same visual weight as populated sections (same heading size, same color, same padding).
   - Why it fails: Readers misinterpret empty as broken; they experience false urgency.
   - Fix: Collapse empty sections (smaller heading, lighter color, reduced padding). Reframe the language.

4. **The Phantom Buttons**: CTA buttons that don't look clickable (light text on light background, no border, no obvious affordance).
   - Why it fails: Readers can't find the action; click-through collapses.
   - Fix: 44px touch target, high contrast, thick border if background is subtle.

5. **The Wall of Text**: No hierarchy between sections; everything is body-text gray and 14px.
   - Why it fails: Email is unnavigable; readers bounce before scanning the key data.
   - Fix: H1/H2 hierarchy, 24-28px for headers, bold + color for emphasis.

6. **The Desktop-First Collapse**: Email designed at 600px width renders at 375px as stacked, unreadable columns.
   - Why it fails: Mobile users see overlapping text, tiny buttons, distorted images.
   - Fix: Mobile-first design; test at 375px before 600px.

7. **The Dark-Mode Disaster**: Email with hardcoded white background and dark text renders as harsh inverted white-on-black in Gmail iOS.
   - Why it fails: Readers experience eye strain; the email feels broken.
   - Fix: Explicit color declarations for all elements. `@media (prefers-color-scheme: dark)` media queries.

8. **The Footer Hijack**: Footer content (unsubscribe, settings) is visually heavier than the email body (same size, same color, same font-weight).
   - Why it fails: Readers accidentally click unsubscribe; they skip the actual email content.
   - Fix: Footer is 11-12px, light gray, minimal visual weight.

## Common failure mode

Emails that commit one antipattern often commit three. An email with avalanche-list design will also lack hierarchy and may trigger anxiety on empty states. Analyzer spots this by: checking for each antipattern explicitly, counting items in sections, measuring visual weight of footer vs. body, verifying dark-mode behavior.

## Source

[citation needed — researcher refresh on common operational-email antipatterns from real-world audits of SaaS dashboard emails, Slack digest patterns, and enterprise alerts.]
