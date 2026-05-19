<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Dark Mode Handling

**Gmail's dark-mode behavior on iOS/Android/web; `prefers-color-scheme: dark` media query partial support; color-inversion gotchas.**

## Why it matters for operational-dashboard emails

Gmail's mobile app and web client have different dark-mode implementations. iOS Gmail can invert your white-background email to near-black, creating unintended contrast shifts and making carefully-chosen colors pop differently. Android Gmail uses a blue-tone dark mode. Desktop Gmail web client respects `prefers-color-scheme: dark` media queries, but with caveats: Apple Mail respects it perfectly, but Outlook does not. If you design for light mode only and a reader uses dark mode, your brand colors may become unreadable or take on an unintended mood.

## Tactical applications

1. **Explicit color declarations**: Never rely on inherited defaults (white background, black text). Always declare `background-color`, `color`, `border-color` explicitly in inline styles (email CSS support is limited). Example: `<table style="background-color: #FFFFFF; color: #111111;">`.

2. **Media query for dark mode**: Include `@media (prefers-color-scheme: dark) { ... }` for Apple Mail and Gmail web (Gmail mobile is less predictable). Swap background to #1E1E1E (not #000000), text to #F5F5F5. Test both modes.

3. **Color inversion resistance**: Gmail iOS inversion can turn your chosen colors unpredictable. Use semi-neutral colors (avoid pure red, pure blue) and test in Gmail iOS preview. Accent colors (green for success, amber for warning) should have enough saturation to survive inversion without becoming unreadable.

4. **Button affordance in dark mode**: If your CTA button uses a light background (e.g., #E8F5E9 for subtle green), ensure it has a dark border or outline in dark mode, so it doesn't disappear. Use `border: 1px solid #4CAF50;` to guarantee affordance.

## Common failure mode

Emails with hardcoded light backgrounds and dark text look inverted and harsh in Gmail iOS (white text on near-black background, high contrast but fatiguing). Emails with branded accent colors (light purple, light teal) become dark purple and dark teal in dark mode, losing the "soft / friendly" vibe they were designed for. CTA buttons with light backgrounds vanish in dark mode without explicit dark-mode styling. Analyzer spots this by: testing in prefers-color-scheme: dark media query, simulating Gmail iOS inversion, verifying color readability in both modes.

## Source

Gmail Help. *Color Support in Gmail*. Apple Mail. *Supported CSS Properties for Mail*. [Email client documentation; dark-mode behavior evolving quarterly.]
