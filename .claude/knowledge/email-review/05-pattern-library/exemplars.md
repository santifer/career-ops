<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Exemplars

**High-quality operational-dashboard email examples; pattern reuse across different dashboard types.**

## Why it matters for operational-dashboard emails

Exemplars anchor the analyzer agent's scoring. Without concrete examples, "good design" becomes subjective. By naming specific operational emails that nail the criteria (clear hierarchy, mobile rendering, dark mode, CTA affordance, empty-state framing), the analyzer has calibration points. Exemplars also reveal reusable patterns: a well-designed role-posting email can inform the structure of a pipeline-status email.

## Exemplars (researcher-verified)

**[needs researcher input — identify 3-5 production operational-dashboard emails with permission to cite]**

- Example 1: [company]-[email-type]-[date] — [one-sentence summary of why it's exemplary: e.g., "Perfect mobile rendering at 375px, 44px touch targets, dark mode affordance via explicit color declarations, empty-state reframing ('All tasks complete' not '0 tasks'), H2 hierarchy with 24px font, 20px horizontal padding, 1px gray dividers"]
- Example 2: [company]-[email-type]-[date] — [summary]
- Example 3: [company]-[email-type]-[date] — [summary]

## Pattern reuse

Once exemplars are identified, extract reusable components:

1. **Header pattern**: Logo + greeting + date + status summary. Exemplar X implements this cleanly; reuse across all dashboard types.
2. **Data-card pattern**: Title (H2) + count + CTA. Exemplar Y nails dark-mode handling here; reference when evaluating new emails.
3. **Empty-state pattern**: Muted heading + reframe text + optional breathing-room affordance. Exemplar Z shows all three; use as gold standard.
4. **Footer pattern**: Unsubscribe link + settings link + company legal. Keep minimal; don't compete with email body.

## Common failure mode

Emails without exemplar calibration drift in quality — one evaluator thinks "good design" is clean whitespace, another thinks it's saturated color. Exemplars create shared vocabulary. Without them, the analyzer's scoring is inconsistent. Analyzer spots this by: requesting exemplar citations when evaluating new emails, comparing against the identified patterns, flagging deviations with specificity ("missing the breathing-room affordance from Exemplar Z").

## Source

Researcher refresh required: identify 3-5 production operational-dashboard emails (internal or public examples) that exemplify the criteria in this KB. Once identified, catalog them here with permission and link to the pattern-reuse section.
