<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Gradient, Shape, and Line Treatment

**Subtle gradients for depth (avoid harsh gradients); rounded corners for approachability; rules and dividers for structure.**

## Why it matters for operational-dashboard emails

Visual interest comes not from chrome, but from thoughtful treatment of shape and line. A flat, borderless email feels bland. But an email with heavy gradients, sharp angles, and thick borders feels cluttered and corporate. Operational dashboards use subtle gradients (a 2-3% lightness shift for depth), rounded corners (6-8px for approachability), and thin dividers (1px light gray) to create structure without noise.

## Tactical applications

1. **Gradient restraint**: Avoid linear gradients across buttons or backgrounds. If using gradient, keep it subtle:
   - Example: background `linear-gradient(180deg, #FFFFFF 0%, #F9FAFB 100%)` (a 2% lightness shift from white to near-white)
   - Use for: section backgrounds, card containers (to separate them from email body)
   - Avoid: gradients on button text, gradients larger than 10px, multi-color gradients

2. **Rounded corners for warmth**: Use 6-8px border-radius on buttons, cards, and section containers. Avoid sharp 0px corners (feels harsh) and excessive 16px+ corners (looks like pills/chips, not cards).

3. **Rules and dividers**: Use 1px solid gray (#E5E7EB or #D1D5DB) for section dividers. Avoid thick borders (3px+) which feel heavy. Rules should separate sections, not divide each row in a table.

4. **Shape consistency**: If buttons are 8px rounded, cards should also be 8px rounded. Mixed corner styles (8px buttons, 0px cards, 16px footer) feel unpolished.

5. **Line weight hierarchy**: Section dividers are 1px. Don't use 2px or thicker unless the visual design specifically calls for emphasis (rare in operational emails).

## Common failure mode

Emails with heavy gradients on buttons feel dated (2010s-era email marketing). Sharp 0px corners feel cold and corporate. Thick 2-3px borders feel heavy. Mixing rounded and sharp shapes (6px buttons, 0px cards) looks unintentional. Gradients that change color (e.g., teal-to-purple) look garish and distract from content. Analyzer spots this by: checking border-radius consistency, measuring gradient intensity (should be <5% lightness shift), verifying divider thickness (should be 1px), auditing for multi-color gradients (should be zero).

## Source

[citation needed — researcher refresh on email-specific gradient/shape trends; Stripe and linear.app are canonical modern references, but email client support is limited.]
