# Temporary Files Context

`tmp/` contains temporary generated files.

Do not treat files here as source of truth. If a temporary file becomes important, move or regenerate it into the proper user-layer location:

- generated CVs and HTML go to `output/`
- reports go to `reports/`
- saved job descriptions go to `jds/`
- tracker additions go to `batch/tracker-additions/`

Do not delete temporary files unless the user asks for cleanup or the workflow clearly owns the file.
