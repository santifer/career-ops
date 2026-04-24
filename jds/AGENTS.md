# Job Descriptions Context

`jds/` is user layer. It stores saved job descriptions used as local inputs for evaluation and pipeline processing.

Use `local:jds/{file}` references in `data/pipeline.md` when a job description is saved locally.

Keep filenames descriptive and stable:

```text
{company-slug}-{role-slug}.md
```

Do not replace a saved JD with a different posting unless the user explicitly says it is the same opportunity.
