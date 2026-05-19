<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Gmail-Specific Rendering

**`<style>` blocks stripped in many contexts; 102KB clip limit; Gmail image proxy rewrites URLs; button rendering via tables.**

## Why it matters for operational-dashboard emails

Gmail has the largest email market share (~1.5B users). But Gmail strips `<style>` blocks and many CSS properties, forcing designers to use inline styles for every element. Gmail also clips emails longer than 102KB, truncating the footer and any below-the-fold content. Images are proxied through ggpht (Google's image server), which can cause MIME-type mismatches or authentication failures if your images are behind login walls. Button-like affordances must be rendered as `<table>` elements, not HTML `<button>` tags (which Gmail doesn't style).

## Tactical applications

1. **Inline styles everywhere**: Never use `<style>` blocks for core styling. Use `<table style="...">`, `<td style="...">`, `<a style="...">`. Critical styles (background-color, color, padding, width, height) must be inline.

2. **102KB budget**: Test your email's full size (including all images, styles, content). Heartbeat emails with large datasets, many product cards, or high-resolution images can easily exceed 102KB. Compress images (JPG > PNG for most cases), minify HTML, defer non-critical info to a link.

3. **Image proxy implications**: Your images must be accessible to Google's ggpht crawler. If you use signed URLs (AWS S3 with auth), Gmail's proxy can't load them. Public URLs only. Consider a CDN with fast global serving.

4. **Button tables**: Render CTAs as nested tables with a cell containing the button. Example:
   ```html
   <table><tr><td style="background-color: #4CAF50; padding: 12px 24px;">
     <a href="..." style="color: #FFFFFF; text-decoration: none; font-weight: bold;">Open Apply Pack</a>
   </td></tr></table>
   ```
   This ensures consistent rendering across clients.

## Common failure mode

Emails relying on `<style>` blocks for layout (mobile media queries, hover effects) render with no styling in Gmail. Emails exceeding 102KB have their footer and most CTAs clipped below the fold. Images behind auth walls fail to load silently, leaving broken-image placeholders. CTA buttons rendered as HTML `<button>` tags appear unstyled or with browser defaults in Gmail, breaking the visual hierarchy. Analyzer spots this by: extracting all inline styles and counting how many properties are moved to `<style>` (should be zero), measuring total email size including all images, verifying all image URLs are public and directly accessible.

## Source

Gmail Help. *Gmail CSS Support*. Google Developers. *Gmail API: Message Format*. [Authoritative Gmail rendering docs.]
