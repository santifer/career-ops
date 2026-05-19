<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Typography for Email

**Web-safe fallback stack, minimum font sizes, line-height, emphasis hierarchy without serif/sans variation.**

## Why it matters for operational-dashboard emails

Email clients render typography differently than browsers. Outlook uses the Word rendering engine (which doesn't support web fonts), Gmail has limited CSS support, Apple Mail handles web fonts but with variable fallback behavior. If your chosen font stack doesn't have a reliable fallback, readers on Outlook see Georgia (default serif) when you intended sans-serif, tanking readability and visual consistency. Operational emails prioritize clarity over personality — font changes should signal hierarchy (bold for emphasis, not italic; heading size increases, not font-family shifts).

## Tactical applications

1. **Safe stack**: `font-family: Arial, Helvetica, sans-serif;` or `system-ui, -apple-system, sans-serif` for Apple Mail. Never lead with custom fonts (Inter, Carlito) — they don't work in Outlook.

2. **Minimum sizes**: 14px body (16px on mobile is better for touch), 16px for any interactive element (button text), 11px minimum for captions/legal (not smaller; accessibility + readability suffer). Headers: h1 = 24px, h2 = 18px, h3 = 14px.

3. **Line-height**: 1.4 for body text (tighter is fine in headlines, but 1.4-1.6 is the safe range). Anything below 1.3 in body text creates clustering; readers with dyslexia report difficulty.

4. **Emphasis**: Use `<strong>` (bold) for emphasis, NOT `<em>` (italic). Italics are harder to read on screens and in email, especially at small sizes. Bold + size increase beats font-family change for hierarchy.

## Common failure mode

Emails that use multiple font-families (heading in serif, body in sans-serif, accent in monospace) create a "design-by-decoration" feel that undermines operational credibility. Readers interpret visual inconsistency as unreliability. Analyzer spots this by: checking font-family declarations (should be ≤2 distinct stacks), verifying all sizes meet minimums (14px body, 11px captions), counting emphasis methods (bold alone beats bold+italic+size).

## Source

Email on Acid. *Email Client CSS Support Guide*. Litmus. *Email Font-Family Support Across Clients* (research ongoing). [Both are industry-standard email testing resources.]
