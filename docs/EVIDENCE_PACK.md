# Evidence Pack

`evidence-pack.mjs` creates a source-backed candidate evidence pack from local
career-ops files. It does not call the network or any AI provider.

```bash
npm run evidence
node evidence-pack.mjs --json
node evidence-pack.mjs --output evidence-pack.md
```

The generated pack summarizes:

- CV sections
- quantified proof points from `cv.md` and `article-digest.md`
- portfolio links
- application tracker status signals
- recent evaluation reports

Use it before interviews or applications to collect the strongest evidence in
one reviewable document.
