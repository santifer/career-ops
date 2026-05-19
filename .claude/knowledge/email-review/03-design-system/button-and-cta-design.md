<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Button and CTA Design

**44×44px touch targets; 4.5:1 contrast on button text; affordance via shape, color, microcopy; hierarchy of primary, secondary, tertiary CTAs.**

## Why it matters for operational-dashboard emails

Operational emails live or die by their primary CTA. If readers can't easily identify and click the button, the email fails regardless of content quality. A 44×44px minimum touch target ensures mobile users can tap without frustration. A 4.5:1 contrast ratio ensures button text is readable even on older phones with poor screens. Microcopy (the label text) is the most important affordance signal — "Click Here" is ambiguous; "Open Apply Pack" tells the reader exactly what happens. CTA hierarchy (primary = filled, secondary = outlined, tertiary = text link) ensures the email's goal is unambiguous.

## Tactical applications

1. **Primary CTA**: Filled button (solid background color), high-contrast text, 44px minimum height, 60px+ width. Example: `<table style="background-color: #4CAF50; padding: 12px 24px;"><tr><td><a href="..." style="color: #FFFFFF; text-decoration: none; font-weight: bold; display: block;">Open Apply Pack</a></td></tr></table>`. Should appear in the upper third of the email, ideally top-right or centered below the headline.

2. **Secondary CTA**: Outlined button (border + transparent/light background), same text color as primary, typically appears mid-email for supplementary actions (e.g., "View All Roles"). Can be smaller (40px height, 50px width).

3. **Tertiary CTA**: Text link, underlined, same color as primary CTA. Used sparingly for non-essential links (e.g., "See previous digests" in footer).

4. **Microcopy precision**: Never use "Click Here," "Learn More," or "View." Always lead with an action verb + object. "Open Apply Pack," "Review Next Steps," "View Pipeline Status," "Confirm Outreach." The reader should know exactly what happens on click.

## Common failure mode

Emails with CTAs labeled "Click Here" force readers to re-read context to understand the action. Buttons with low contrast (light green text on white background) are hard to read and feel less important. Buttons smaller than 44px are impossible to tap on mobile without zooming. Buttons placed below 3+ paragraphs of content suffer from low click-through because readers have already exited the email by the time they scroll that far. Multiple equal-weight CTAs confuse the reader about the email's primary goal. Analyzer spots this by: measuring button dimensions and contrast ratios, counting CTAs and checking if one is visually dominant, auditing CTA label text for clarity (flagging "Click Here," "More," "View" patterns).

## Source

Nielsen Norman Group. *Mobile Usability*. Apple Human Interface Guidelines. *Touch Targets*. [Industry-standard sources on affordance and touch design.]
