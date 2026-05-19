<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Information Hierarchy

**Progressive disclosure; section depth (H1 > H2 > H3 > body); typographic weight and scale as hierarchy signals.**

## Why it matters for operational-dashboard emails

Operational emails present a hierarchy: urgent items at the top, summary sections in the middle, metadata at the bottom. But if every section looks equally important (same heading size, same color weight, same padding), readers can't navigate. Progressive disclosure — showing only the headline first, letting readers expand for details — keeps emails scannable. A clear typographic hierarchy (H1 much larger than H2, both much larger than body text) guides the reader's eye naturally.

## Tactical applications

1. **Heading hierarchy discipline**: Use inline styles with explicit sizing:
   - H1 (email title/section header): 24-28px bold, line-height 1.2, margin-bottom 16px
   - H2 (subsection, e.g., "Active Roles"): 18-20px semi-bold, margin-bottom 12px
   - H3 (data category, e.g., "Remote Roles"): 16px medium, margin-bottom 8px
   - Body text: 14-16px regular, line-height 1.4-1.6

2. **Color hierarchy**: Use 3 weights:
   - Primary (H1/H2): brand color (e.g., #1f2937 for dark text, #FFFFFF on dark background)
   - Secondary (body, dates): muted gray (#6b7280)
   - Tertiary (captions, metadata): lighter gray (#9ca3af)

3. **Visual weight via bold + color**: Don't rely on size alone. A bold 14px heading with accent color can feel heavier than a light 20px heading. Combine size + weight + color.

4. **Section boundaries**: Use a thin border-top (1px, light gray) between major sections if you have dense data blocks. Or use 24px margin without borders — consistency matters more than the specific choice.

5. **Progressive disclosure pattern**: For long lists (e.g., 20 roles), show the top 5 with a "View all 20 roles >" link at the bottom. Don't overwhelm with all 20 inline.

## Common failure mode

Emails where every heading is the same size and weight look flat and un-navigable. Readers see a wall of text and don't know where to start. Emails that go too deep (H1 > H2 > H3 > H4 > H5) confuse the hierarchy. Inconsistent heading sizes (16px for one section header, 22px for the next) create visual noise. Analyzer spots this by: checking heading-to-body size ratio (should be 1.5x minimum), counting nesting depth (H1 > H2 > H3 is the limit), verifying color weight is distinct between layers.

## Source

Bringhurst. *The Elements of Typographic Style*. [Typography hierarchy and readability.] Williams & Tollett. *The Non-Designer's Web Book*. [Visual hierarchy in communication design.]
