<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Color Theory

**60-30-10 rule; semantic color coding; dark-mode inversion behavior in Gmail and Apple Mail.**

## Why it matters for operational-dashboard emails

Operational emails use color to signal status (red=critical, amber=warning, green=success). But if the email doesn't follow a consistent semantic color model, readers must re-learn the encoding for each email. The 60-30-10 rule (60% dominant color, 30% secondary, 10% accent) ensures the email isn't visually chaotic. Dark-mode complications: Gmail on iOS/Android can invert your white background to near-black, flipping the contrast of your carefully-chosen text colors. Pure black text on a user's inverted white background becomes pure white text on near-black, which may still pass contrast but feels harsh.

## Tactical applications

1. **Semantic coding**: Red = action required / urgent. Amber = warning / attention needed. Green = success / routine / complete. Blue = neutral info. Gray = secondary / dismissible. Use this consistently across all emails.

2. **60-30-10 application**: Heartbeat email example: 60% white/light-gray background, 30% navy or charcoal headers/sections, 10% green (routine CTA) or red (urgent action).

3. **Dark-mode safety**: Avoid pure black (#000000) and pure white (#FFFFFF). Use #111111 for "black" text, #F5F5F5 for "white" backgrounds. Test in Gmail iOS preview (or simulate with prefers-color-scheme: dark media query).

4. **Avoid color-only signaling**: Never rely on color alone to communicate status. Always pair color with text (e.g., "✓ 12 roles reviewed" in green, not just a green bar with "12" in it).

## Common failure mode

Emails that use branded colors (company purples, teals) as primary body colors create poor readability and dilute status-signal clarity. A heartbeat email with a teal background and gray text reads as "casual / brand expression" rather than "operational / urgent". Dark-mode inversion produces unintended contrast shifts: a carefully-chosen light-purple background becomes dark-teal in Gmail's dark mode, degrading readability. Analyzer spots this by: measuring contrast ratios in both light and dark modes, verifying semantic color consistency, checking for color-only status signals (missing text fallbacks).

## Source

[citation needed — researcher refresh] Color theory in UI: established principles, but email-specific dark-mode behavior requires testing-based sourcing (Gmail API docs, Apple Mail CSS support docs). Recommend quarterly researcher refresh on dark-mode client behavior.
