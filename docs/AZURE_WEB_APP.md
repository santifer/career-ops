# Azure Web App Deployment

This repo includes a single-user web/API for career-ops, designed to deploy to
Azure Container Apps. It is optimized for speed of development: **all data is
stored in the existing local career-ops files** — no database, no blob storage.

## Data storage

| Data | File |
|------|------|
| Resume | `cv.md` (a new upload overwrites it) |
| Profile | `config/profile.yml` |
| Reports | `reports/{###}-{slug}-{date}.md` |
| Tracker | `data/applications.md` |
| Generated PDFs | `output/cv-{slug}-{date}.pdf` |

Because data lives on the container filesystem, mount an **Azure Files volume**
at `/app` (or at `data/`, `reports/`, `output/`, plus `cv.md` and
`config/profile.yml`) so uploads and results survive container restarts. Without
a mounted volume, data is lost on restart.

## Target Azure services

- Azure Container Apps for the Node.js web app
- Azure Container Registry for the Docker image
- Azure OpenAI or Azure AI Foundry model deployment for evaluation
- (Optional) Azure Files for persistent storage of the local data files
- (Optional) Application Insights and Log Analytics for telemetry

## Required environment variables

```bash
PORT=3000
WEB_APP_PASSWORD=...

AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=...
AZURE_OPENAI_API_VERSION=2024-10-21
```

## Local run

```bash
npm install
npm run web
# open http://localhost:3000
```

## Local container smoke test

```bash
docker build -t career-ops-web .
docker run --rm -p 3000:3000 --env-file .env career-ops-web
curl http://localhost:3000/healthz
```

If `WEB_APP_PASSWORD` is set, browser users sign in at `/login`. API requests
other than `/healthz` can also pass the header:

```bash
x-career-ops-password: <password>
```

## API surface

- `GET /healthz` - container health check
- `GET /api/config/status` - configured dependency summary
- `GET /api/profile` / `PUT /api/profile` - read/write `config/profile.yml`
- `POST /api/resumes` - overwrite `cv.md` with markdown (text/markdown only)
- `GET /api/resumes/current` - read `cv.md`
- `POST /api/evaluations` - evaluate a pasted JD, write a report, append the
  tracker, and generate a PDF into `output/`
- `GET /api/evaluations` - list tracker rows from `data/applications.md`
- `GET /api/files/report/:name` - download a report markdown file
- `GET /api/files/pdf/:name` - download a generated PDF

PDF/DOCX resume parsing is intentionally not implemented yet. The upload
endpoint requires canonical markdown or a text/markdown file.
