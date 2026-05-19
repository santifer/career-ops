<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Mobile-First Rendering

**Designing for 375px viewport width (iPhone SE); table-based layouts for cross-client fallback; image sizing for mobile.**

## Why it matters for operational-dashboard emails

50%+ of email opens happen on mobile, but most email clients don't support modern CSS Media Queries (Outlook does not). Table-based layouts are the only reliable way to ensure a heartbeat email looks readable on both iPhone (375px) and desktop (1440px+). Mobile-first means designing the narrowest, most-constrained layout first, then adding complexity for wider viewports. If your design assumes 600px width and someone opens it on a 375px iPhone, your multi-column layout collapses into a single unreadable stack.

## Tactical applications

1. **Responsive table nesting**: Single-column table (100% width) for mobile. Use `<tr><td width="100%" colspan="2">` for full-width sections on narrow screens, then nested tables or media query rewrites for desktop multi-column. Every table cell needs explicit width and padding in pixels (not percentages, which behave unpredictably across clients).

2. **Image sizing**: Set explicit `width` and `height` attributes on all `<img>` tags (e.g., `<img width="300" height="150" src="...">`). On mobile, images should never exceed 330px width (375px viewport minus 20px padding each side). Use `max-width: 100%` in CSS fallback.

3. **Font size guardrails**: 16px minimum for body text on mobile (avoids iOS auto-zoom on input fields, also more readable). 14px minimum for anything clickable. Captions can go to 11px, but not smaller.

4. **Padding discipline**: Use consistent 20px horizontal padding on mobile, 30-40px on desktop. Avoid hard-left/hard-right content; the whitespace is crucial for readability on small screens.

## Common failure mode

Emails designed desktop-first with 3-column layouts and 600px-wide tables render as unreadable compressed stacks on mobile. Readers on iPhone see text flowing into each other, images spilling out of the viewport, and CTAs that are too small to tap. Images without explicit dimensions cause layout shift — when the image finally loads, the content below jumps, creating a jarring experience. Analyzer spots this by: testing at 375px viewport, checking all image tags for width/height attributes, verifying padding/margin consistency.

## Source

Email on Acid. *Responsive Email Design Best Practices*. Mailchimp. *Email Design Principles — Mobile Optimization*. [Industry-standard sources for responsive email templates.]
