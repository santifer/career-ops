---
description: Re-render a hand-edited tailored CV MD to PDF (no tailoring)
---

Take a tailored CV markdown (from `output/markdown/`) — possibly hand-edited — and regenerate the PDF without any tailoring. Runs mode `render` (see `modes/render.md`).

Accepts either a 3-digit number (e.g. `3` → looks up `output/markdown/003-*.md`) or a full path to a markdown file.

Load the career-ops skill:
```
skill({ name: "career-ops" })
```
