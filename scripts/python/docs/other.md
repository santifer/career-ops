# Other Utilities

Miscellaneous utilities that don't fit into the main packages.

## Modules

### `openrouter_runner.py`
OpenRouter free-model runner. One-stop CLI for scan, pipeline processing, evaluation, and application form filling using OpenRouter's free-tier models.

```
python -m scripts.python.other.openrouter_runner scan          # Scan APIs for new listings
python -m scripts.python.other.openrouter_runner evaluate <url> # Evaluate a job
python -m scripts.python.other.openrouter_runner pipeline      # Process pending URLs
python -m scripts.python.other.openrouter_runner apply <id>    # Generate form answers
npm run or          # default: help
npm run or:scan
npm run or:pipeline
npm run or:eval
npm run or:apply
```

### `prepare_application.py`
Prepares ATS application form values without submitting. Fills out common ATS fields from profile.

```
python -m scripts.python.other.prepare_application
npm run prepare:application
```

### `application_answers.py`
Upserts application form answers into a report.

```
python -m scripts.python.other.application_answers
```

### `archive_posting.py`
Archives job posting metadata. Dry-run to preview filenames.

```
python -m scripts.python.other.archive_posting
npm run archive
```

### `assessment_log.py`
Skills-assessment event logger. Append platform/subject/threshold/score events to `data/assessments.tsv`.

```
python -m scripts.python.other.assessment_log add --company Acme --report 042 --platform eSkill --subject "Python" --threshold 70 --score 92
python -m scripts.python.other.assessment_log --summary
```

### `img_to_pdf.py`
Converts a single image to a one-page PDF.

```
python -m scripts.python.other.img_to_pdf <input_image> <output_pdf>
npm run img-to-pdf
```

### `funnel_velocity.py`
Funnel calibration and stage velocity analyzer.

```
python -m scripts.python.other.funnel_velocity --summary
```

### `fingerprint_core.py`
Internal library for job posting fingerprinting (dedup across rescrapes).
