<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Visual Hierarchy

**F-pattern + Z-pattern reading models; Gestalt grouping (proximity, similarity, continuity, closure) for directing eye and attention.**

## Why it matters for operational-dashboard emails

Operational emails are scanned, not read. Readers spend 2-5 seconds deciding if the email is relevant to them right now. Visual hierarchy determines whether that scan succeeds or fails. The F-pattern (users scan: headline left → content left, then down, then scan-and-skip mid-body) dominates on long scrollable newsletters. The Z-pattern (headline top-left → CTA top-right, then down-left, then diagonal to CTA bottom-right) dominates on short summary blocks. Gestalt grouping — proximity, similarity, continuity, closure — subconsciously guides where the eye lands next.

## Tactical applications

1. **F-pattern on heartbeat/daily emails**: Headline + primary stat top-left (e.g., "12 new roles"); secondary context below left-edge; CTA top-right or center-right, NOT bottom.

2. **Z-pattern on summary cards**: Headline top-left, status/alert indicator top-right (red dot for urgent, green checkmark for routine); body left-center; CTA bottom-right.

3. **Gestalt proximity**: Group related data with tight spacing (8-16px). Separate unrelated sections with larger gaps (24-32px). A runway alert and a system-status message in the same card create visual confusion; separate them.

4. **Similarity**: Use consistent color coding across all sections (all warnings amber, all errors red, all routine green). Inconsistency forces the reader to re-learn the encoding for each section.

## Common failure mode

Wall-of-text emails with no visual breaks force the reader to parse content linearly, killing the F-pattern scan. If the primary action is NOT visually distinct (same color/size as status text), the reader may miss it entirely even if looking directly at it. Analyzer spots this by: checking heading hierarchy (h1→h2→h3 present), measuring spacing uniformity (sections should follow 8pt grid), verifying color-coding consistency across similar content types.

## Source

Nielsen, J., & Pernice, K. *Eyetracking Web Usability* (2010, O'Reilly). Gestalt principles: Koffka, K. *Principles of Gestalt Psychology* (1935). [Both canonical in UX research.]
