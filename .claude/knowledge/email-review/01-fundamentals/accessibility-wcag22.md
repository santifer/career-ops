<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Accessibility — WCAG 2.2

**WCAG 2.2 AA contrast ratios, semantic HTML, motion safety, minimum touch targets.**

## Why it matters for operational-dashboard emails

Operational emails are read by users on deadline, in distraction, sometimes in low-light, sometimes by readers with color-blindness or low vision. WCAG 2.2 AA standards (4.5:1 contrast for normal text, 3:1 for large text 18px+ or 14pt+ bold) ensure readability across conditions. Semantic HTML (proper heading hierarchy, landmark regions) helps screen-reader users navigate email structure without audio clutter. Motion (animated GIFs, CSS animations) can trigger vestibular reactions in users with motion-sensitivity disorders (prefers-reduced-motion: reduce). Touch targets (button height/width) must be 44×44px minimum for readers using mobile devices.

## Tactical applications

1. **Contrast verification**: Measure text color vs. background color using WebAIM Contrast Checker. Red #FF0000 on white #FFFFFF = 3.99:1 (fails AA). Red #CC0000 on white = 4.54:1 (passes AA). Status badges and small text especially need auditing.

2. **Semantic HTML**: Use `<h1>`, `<h2>`, `<h3>` for headings (not just large bold `<p>`). Use `<strong>` for importance (not `<b>`). Use lists (`<ul>`, `<ol>`) for multi-item content. Email clients strip `<nav>` landmarks, but semantic structure helps some screen readers.

3. **Motion safety**: Avoid animated GIFs in critical status signals. If used, design a static fallback (first frame is informative). Include `prefers-reduced-motion: reduce` media query to disable animations for users who request it.

4. **Touch targets**: Buttons must be ≥44px tall and ≥44px wide. CTA link text must be visually distinct (underline, color, bold) from body text, even for keyboard-only users who can't rely on visual affordance.

## Common failure mode

Emails with light gray text on light backgrounds (e.g., #999999 on #F5F5F5 = 2.1:1 contrast, fails AA) create barriers for readers with low vision. Animated runway-alert badges (pulsing red dot) can trigger motion-sickness in users with vestibular disorders. CTA buttons labeled "Click here" with no visual distinction force screen-reader users to hear "link: Click here. Link: Click here. Link: Click here" without context. Analyzer spots this by: running accessibility audit (Axe, WAVE), measuring all contrast ratios, checking for animation overuse, verifying button text is action-specific.

## Source

W3C. *Web Content Accessibility Guidelines (WCAG) 2.2*. WebAIM. *Contrast and Color Accessibility* (tools + testing). [WCAG 2.2 is the current standard, published June 2023.]
