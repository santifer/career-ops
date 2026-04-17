# Fix Dashboard Table Layout

**Date:** 2026-04-16
**Status:** implemented
**Owner:** Codex

## Background

The static dashboard at [`web/index.html`](/Users/hongxichen/Desktop/career-ops/web/index.html) renders tracker and scan-history rows collapsed into the first visible column. The screenshots provided by the user show header columns still aligned while body content for each row stacks vertically in a narrow strip, which makes both tabs effectively unusable.

## Goal

Restore normal multi-column table rendering for the tracker and scan-history tabs in the static dashboard.

## Scope

- Dashboard table rendering in [`web/index.html`](/Users/hongxichen/Desktop/career-ops/web/index.html)
- Matching source template or generator files only if needed for durability
- Targeted execution-plan documentation for this repair

Out of scope:

- Redesigning the dashboard visual style
- Changing report, pipeline, or data-generation behavior unless directly required for the layout fix
- Refactoring unrelated dashboard code

## Assumptions

- The screenshots reflect the current local `web/index.html` behavior.
- The failure is in the client-side rendering path, not in the underlying tracker or scan-history data.
- The smallest viable fix is to correct how HTML is injected into context-sensitive elements such as `tbody` and `select`.

## Uncertainties

- Whether the breakage comes from generic sanitization, browser parsing under `file://`, or another context-sensitive DOM insertion issue.
- Whether the durable fix belongs only in `web/index.html` or also in [`web/template.html`](/Users/hongxichen/Desktop/career-ops/web/template.html) / [`web/build-dashboard.mjs`](/Users/hongxichen/Desktop/career-ops/web/build-dashboard.mjs).

## Implementation Steps

1. Confirm the layout failure path in the dashboard rendering code.
   Verify: inspect table CSS, row render functions, and HTML injection helpers for context-sensitive behavior.
2. Implement the smallest fix that preserves existing dashboard behavior.
   Verify: tracker and scan rows render into distinct table columns again.
3. Update the dashboard source of truth if the generated file alone is insufficient.
   Verify: regeneration preserves the fix.
4. Run targeted verification for the repaired page.
   Verify: local checks or browser automation confirm correct table structure/rendering.

## Verification Approach

- Code inspection of the render path for tracker and scan tables
- Targeted browser or DOM-level verification of rendered table structure
- `npm run dashboard` if source template changes

## Progress Log

- 2026-04-16: Read repository instructions, dashboard implementation, and user screenshots.
- 2026-04-16: Confirmed the broken tabs use fixed-width HTML tables with separate render functions for tracker and scan rows.
- 2026-04-16: Identified the main hypothesis: a generic sanitization helper is being used for context-sensitive inserts into `tbody` and `select`, which can corrupt table/select fragments after parsing.
- 2026-04-16: Updated [`web/template.html`](/Users/hongxichen/Desktop/career-ops/web/template.html) so escaped dashboard-generated HTML is inserted directly, while Markdown report rendering remains sanitized through DOMPurify.
- 2026-04-16: Regenerated [`web/index.html`](/Users/hongxichen/Desktop/career-ops/web/index.html) with `npm run dashboard`.
- 2026-04-16: Verified in a real headless browser that the tracker table renders 150 rows with 9 cells in the first row and the scan table renders 488 rows with 6 cells in the first row, matching the expected column counts.

## Key Decisions

- Start with the narrowest possible diagnosis around DOM insertion instead of restyling the tables.
- Keep sanitization only where it is actually needed: Markdown rendered through `marked`. The dashboard's other HTML fragments already escape data at interpolation time, so a second generic sanitize pass was both redundant and harmful for table fragments.

## Risks And Blockers

- Fixing only the generated `web/index.html` would be fragile if `web/template.html` is the real source of truth.
- Browser-only failures under `file://` can be harder to validate without automation.

## Final Outcome

The collapsed tracker and scan-history layouts were caused by running all generated HTML through a generic DOMPurify sanitization helper before assigning it to context-sensitive containers like `tbody`. The repair removes that generic sanitize pass for escaped dashboard-generated HTML, preserves sanitization for Markdown report rendering, and regenerates the static dashboard from the template source of truth.

Verification completed:

- `npm run dashboard`
- Headless Playwright DOM verification against `file:///Users/hongxichen/Desktop/career-ops/web/index.html`
