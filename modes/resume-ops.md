# Mode: resume-ops — High-Quality Tailoring via External API

Use this mode when the user wants a better-tailored resume. This mode leverages the specialized `resume-ops` service.

**The AI agent is responsible for the entire technical lifecycle**: starting the service, ensuring data compatibility, and executing the tailoring. The user should only need to provide the JD.

## Pipeline

1. **Prepare Job Description (JD)**:
   - Identify the JD text or URL.
   - If it's a URL, use `scan.mjs` or relevant tools to extract the text.

2. **Technical Setup (Invisible to User)**:
   - **Cloning & Service**: Run `node start-resume-ops.mjs`. This script will:
     - Automatically clone `resume-ops` from GitLab if missing.
     - Automatically configure the `.env` for local execution.
     - Start the service using `uv` on port 8000.
   - **Docker/Podman**: This integration runs `resume-ops` directly via Python/uv for simplicity. **Docker or Podman are NOT required** for this setup, making it easy for most users.
   - **JSON Resume**: Check for `../resume-ops/.local/master-resume.json`. If missing, generate it immediately from `cv.md` and `config/profile.yml`.

3. **Execute Tailoring**:
   - Determine the output PDF path: `output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf`.
   - Use `config/profile.yml` to get `{candidate}` (normalized to kebab-case) and `{company}`.
   - Run the helper script:
     ```bash
     node resume-ops.mjs --resume ../resume-ops/.local/master-resume.json --jd "{JD_TEXT}" --output output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf
     ```
   - If `config/profile.yml` has a `cv.theme` value, pass it via `--theme`.

4. **Update Tracker**:
   - If this is a new application, create a TSV entry in `batch/tracker-additions/` and run `node merge-tracker.mjs`.
   - If it's an existing application in `data/applications.md`, update the `PDF` column from ❌ to ✅.

## JSON Resume Mapping Guide (if generating)

| JSON Field  | Source in Career-Ops                                            |
| ----------- | --------------------------------------------------------------- |
| `basics`    | `config/profile.yml` (name, email, phone, website, location)    |
| `work`      | `cv.md` -> Experience section. Map each role to a `work` entry. |
| `education` | `cv.md` -> Education section.                                   |
| `skills`    | `cv.md` -> Technical Skills section.                            |
| `projects`  | `cv.md` -> Projects section.                                    |

## Why use this mode?

- **Better Quality**: Uses a specialized multi-step LLM pipeline for tailoring.
- **ATS-Optimized**: Generates clean PDFs via the `resumed` engine.
- **Standardized**: Produces a `resume.json` that can be used with other JSON Resume tools.

## Safety & Ethics

- NEVER invent experience or skills.
- Only reformulate existing content using JD keywords.
